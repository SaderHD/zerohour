import {
  MOVE_BUDGET_CAP, MOVE_SPEED_SLACK, MoveState, PLAYER_MAX_HP, PLAYER_RADIUS, SNAPSHOT_EVERY_TICKS,
  Rng, SPRINT_SPEED, START_GRENADES, START_POINTS, START_WEAPON, TICK_BUDGET_MS, TICK_DT, ZOMBIE_BASE_HP, ZOMBIE_SPAWN_INTERVAL,
  ZOMBIE_SPEED_RUN, ZOMBIE_SPEED_SHAMBLE, ZOMBIE_SPEED_WALK, circleFits, compileMap, harrowRidge, isFiniteNum,
  type ClientMsg, type CompiledMap, type GameEvent, type PlayerId, type PlayerPublic, type PlayerSnap,
  type ServerMsg, type Snapshot,
} from '@zh/shared';
import { giveWeapon, newWeapon, onFire, onMelee, onReload, onSwap, onThrow, settleReload } from './combat';
import { barricadeStates, createBarricades, onInteract, updateBarricades } from './barricades';
import { killZombie, spawnDummy, updateEntities, zombieSnap, type Zombie } from './entities';
import { Nav } from './nav';
import { updatePlayers } from './players';
import { projectileSnap, updateProjectiles, type Projectile } from './projectiles';
import { updateSpawner, zombieCount, type SpawnOrder } from './spawner';
import { spawnZombie, updateZombies } from './zombies';

let sharedMap: CompiledMap | null = null;
export const gameMap = (): CompiledMap => (sharedMap ??= compileMap(harrowRidge));

export interface PlayerState {
  pub: PlayerPublic;
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  state: MoveState;
  hp: number;
  /** Last `move.seq` accepted or corrected. */
  ack: number;
  /** Metres of movement currently allowed; refills every tick. */
  budget: number;
  /** Velocity estimated from the last two accepted moves, and when the last one arrived. */
  vx: number;
  vz: number;
  movedAt: number;
  /** Combat timers, on the `Game.now()` clock. `reloadUntil` is 0 when not reloading. */
  fireAck: number;
  nextFireAt: number;
  nextMeleeAt: number;
  nextThrowAt: number;
  reloadUntil: number;
  /** Game time of the last damage taken (health regenerates after a quiet spell). */
  hurtAt: number;
  /** Debug: takes no damage. */
  god: boolean;
  /** The barricade being rebuilt while F is held, and progress towards the next plank. */
  rebuild: { id: string; t: number } | null;
}

/** Longest we extrapolate a player's last reported position when building a snapshot. */
const MAX_EXTRAPOLATE = 0.1;

export interface GameOut {
  send(id: PlayerId, msg: ServerMsg): void;
  broadcast(msg: ServerMsg): void;
}

/**
 * One running match. Authoritative for everything except each player's own movement, which is
 * reported by the client and sanity-checked here. Pure logic: `step(dt)` advances the sim, so
 * tests can drive it with a fake clock. See docs/PLAN.md sections 5 and 6.4.
 */
export class Game {
  readonly map = gameMap();
  readonly players = new Map<PlayerId, PlayerState>();
  readonly openDoors = new Set<string>();
  time = 0;
  tick = 0;
  private events: GameEvent[] = [];
  private timer: NodeJS.Timeout | null = null;
  private spawnCursor = 0;
  readonly zombies = new Map<number, Zombie>();
  readonly projectiles: Projectile[] = [];
  readonly dummyResets: { at: number; x: number; z: number; yaw: number }[] = [];
  readonly rng: Rng;
  nextEntityId = 1;
  readonly barricades = createBarricades(this);
  readonly nav = new Nav();
  readonly spawnQueue: SpawnOrder[] = [];
  spawnInterval = ZOMBIE_SPAWN_INTERVAL;
  nextSpawnAt = 0;
  /** How long `step` takes, in ms: a moving average, the worst seen, and how many went over TICK_BUDGET_MS. */
  readonly stats = { ticks: 0, tickMs: 0, tickMsMax: 0, overBudget: 0 };
  /**
   * Wall clock in seconds, for timing client messages (which arrive between ticks): movement
   * velocity, fire rate, reloads. Tests inject a fake one.
   */
  readonly now: () => number;

  constructor(private readonly out: GameOut, readonly opts: { debug: boolean; seed: number; now?: () => number }) {
    this.now = opts.now ?? (() => performance.now() / 1000);
    this.rng = new Rng(opts.seed);
  }

  // ------------------------------------------------------------ lifecycle

  start(): void {
    let last = performance.now();
    let acc = 0;
    this.timer = setInterval(() => {
      const now = performance.now();
      acc = Math.min(acc + (now - last) / 1000, 0.25);
      last = now;
      while (acc >= TICK_DT) {
        this.step(TICK_DT);
        acc -= TICK_DT;
      }
    }, 1000 / 60);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // ------------------------------------------------------------ players

  addPlayer(id: PlayerId, name: string): PlayerState {
    const s = this.nextSpawn();
    const p: PlayerState = {
      pub: {
        id, name, points: START_POINTS, kills: 0, headshots: 0, downs: 0, revives: 0,
        perks: [], weapons: [newWeapon(START_WEAPON)], slot: 0, grenades: START_GRENADES, tactical: 0, connected: true,
      },
      x: s.x, z: s.z, yaw: s.yaw, pitch: 0, state: MoveState.Idle, hp: PLAYER_MAX_HP, ack: 0, budget: MOVE_BUDGET_CAP,
      vx: 0, vz: 0, movedAt: this.now(),
      fireAck: 0, nextFireAt: 0, nextMeleeAt: 0, nextThrowAt: 0, reloadUntil: 0,
      hurtAt: -100, god: false, rebuild: null,
    };
    this.players.set(id, p);
    this.emit({ e: 'player', player: p.pub });
    this.emit({ e: 'playerSpawned', id, x: p.x, z: p.z });
    return p;
  }

  nextSpawn(): { x: number; z: number; yaw: number } {
    const spawns = this.map.def.playerSpawns;
    return spawns[this.spawnCursor++ % spawns.length]!;
  }

  /** Can zombies chase and hurt this player right now? */
  targetable(p: PlayerState): boolean {
    return p.pub.connected;
  }

  /** Snap a client back to where the server has it. */
  correct(p: PlayerState): void {
    this.out.send(p.pub.id, { t: 'correct', x: p.x, z: p.z, seq: p.ack });
  }

  removePlayer(id: PlayerId): void {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    this.emit({ e: 'playerLeft', id });
  }

  setConnected(id: PlayerId, connected: boolean): void {
    const p = this.players.get(id);
    if (!p || p.pub.connected === connected) return;
    p.pub.connected = connected;
    if (!connected) p.state = MoveState.Idle;
    this.emit({ e: 'player', player: p.pub });
  }

  /** Full state for a joining or reconnecting player. */
  syncFor(id: PlayerId): ServerMsg {
    const p = this.players.get(id)!;
    return {
      t: 'sync',
      map: this.map.def.id,
      seed: this.opts.seed,
      time: this.time,
      round: 0,
      roundPhase: 'intermission',
      zombiesLeft: 0,
      power: false,
      openDoors: [...this.openDoors],
      barricades: barricadeStates(this),
      players: [...this.players.values()].map((q) => q.pub),
      zombies: [...this.zombies.values()].map((z) => ({ id: z.id, kind: z.kind, seed: z.seed, x: z.x, z: z.z })),
      powerups: [],
      activeEffects: [],
      cache: { site: '', phase: 'idle' },
      forge: { phase: 'idle' },
      self: { x: p.x, z: p.z, yaw: p.yaw },
    };
  }

  // ------------------------------------------------------------ input

  onMessage(id: PlayerId, msg: ClientMsg): void {
    const p = this.players.get(id);
    if (!p) return;
    switch (msg.t) {
      case 'move':
        return this.onMove(p, msg);
      case 'fire':
        return onFire(this, p, msg);
      case 'reload':
        return onReload(this, p);
      case 'swap':
        return onSwap(this, p, msg);
      case 'melee':
        return onMelee(this, p, msg);
      case 'throw':
        return onThrow(this, p, msg);
      case 'interact':
        return onInteract(this, p, msg);
      case 'debug':
        if (this.opts.debug) this.onDebug(p, msg);
        return;
      default:
        return; // revive, chat etc. arrive in later sessions
    }
  }

  private onMove(p: PlayerState, m: Extract<ClientMsg, { t: 'move' }>): void {
    if (![m.x, m.z, m.yaw, m.pitch, m.seq].every(isFiniteNum)) return;
    if (m.seq <= p.ack) return; // stale or replayed
    p.ack = m.seq;
    p.yaw = m.yaw;
    p.pitch = Math.max(-1.6, Math.min(1.6, m.pitch));
    const d = Math.hypot(m.x - p.x, m.z - p.z);
    const legal = d <= p.budget + 0.05 && circleFits(this.map, this.openDoors, m.x, m.z, PLAYER_RADIUS - 0.05);
    if (!legal) {
      this.out.send(p.pub.id, { t: 'correct', x: p.x, z: p.z, seq: m.seq });
      return;
    }
    // Moves arrive at 20 Hz but snapshots leave at 15 Hz; remember the velocity so snapshots can
    // place the player where they are *now* instead of beating between the two rates.
    const now = this.now();
    const dt = now - p.movedAt;
    const maxV = SPRINT_SPEED * MOVE_SPEED_SLACK;
    if (dt > 0.005 && dt < 0.25 && d / dt <= maxV) {
      p.vx = (m.x - p.x) / dt;
      p.vz = (m.z - p.z) / dt;
    } else {
      p.vx = p.vz = 0;
    }
    p.movedAt = now;
    p.budget -= d;
    p.x = m.x;
    p.z = m.z;
    p.state = m.state === MoveState.Sprint ? MoveState.Sprint : m.state === MoveState.Walk ? MoveState.Walk : MoveState.Idle;
  }

  private onDebug(p: PlayerState, m: Extract<ClientMsg, { t: 'debug' }>): void {
    switch (m.cmd) {
      case 'teleport':
        if (!isFiniteNum(m.x) || !isFiniteNum(m.z)) return;
        p.x = m.x;
        p.z = m.z;
        p.budget = MOVE_BUDGET_CAP;
        p.vx = p.vz = 0;
        this.correct(p);
        return;
      case 'god':
        p.god = m.on === true;
        return;
      case 'spawnZombies':
        return this.debugSpawn(m);
      case 'killZombies':
        for (const z of [...this.zombies.values()]) if (z.kind !== 'dummy') killZombie(this, z, undefined, undefined, 'debug');
        this.spawnQueue.length = 0;
        return;
      case 'give':
        if (typeof m.weapon === 'string') giveWeapon(this, p, m.weapon);
        if (isFiniteNum(m.points)) {
          p.pub.points += Math.round(m.points);
          this.emit({ e: 'player', player: p.pub });
        }
        return;
      case 'dummy':
        if ([m.x, m.z, m.yaw].every(isFiniteNum) && this.zombies.size < 32 && circleFits(this.map, this.openDoors, m.x, m.z, PLAYER_RADIUS)) {
          spawnDummy(this, m.x, m.z, m.yaw);
        }
        return;
      case 'openAllDoors':
        for (const o of this.map.def.openings) if (o.kind === 'door') this.openDoor(o.id, p.pub.id);
        return;
      case 'openDoor':
        if (this.map.openingById(m.id)?.kind === 'door') this.openDoor(m.id, p.pub.id);
        return;
      default:
        return;
    }
  }

  private debugSpawn(m: Extract<ClientMsg, { t: 'debug'; cmd: 'spawnZombies' }>): void {
    const count = Number.isInteger(m.count) ? Math.max(0, Math.min(64, m.count)) : 0;
    const hp = isFiniteNum(m.hp) && m.hp > 0 ? m.hp : ZOMBIE_BASE_HP;
    const speedOf = (): number =>
      isFiniteNum(m.speed) && m.speed > 0 ? Math.min(m.speed, 8) : this.rng.pick([ZOMBIE_SPEED_SHAMBLE, ZOMBIE_SPEED_WALK, ZOMBIE_SPEED_RUN]);
    if (isFiniteNum(m.interval)) this.spawnInterval = Math.max(0.05, m.interval);
    for (let i = 0; i < count; i++) {
      if (!isFiniteNum(m.x) || !isFiniteNum(m.z)) this.spawnQueue.push({ hp, speed: speedOf() });
      else if (zombieCount(this) < 64 && circleFits(this.map, this.openDoors, m.x, m.z, PLAYER_RADIUS)) spawnZombie(this, null, m.x, m.z, hp, speedOf());
    }
  }

  openDoor(id: string, by: PlayerId): void {
    if (this.openDoors.has(id)) return;
    this.openDoors.add(id);
    this.nav.invalidate();
    this.emit({ e: 'doorOpened', id, by });
  }

  // ------------------------------------------------------------ sim

  emit(ev: GameEvent): void {
    this.events.push(ev);
  }

  step(dt: number): void {
    const began = performance.now();
    this.time += dt;
    this.tick++;
    for (const p of this.players.values()) {
      p.budget = Math.min(MOVE_BUDGET_CAP, p.budget + SPRINT_SPEED * MOVE_SPEED_SLACK * dt);
      settleReload(this, p);
    }
    updatePlayers(this, dt);
    this.nav.update(this);
    updateSpawner(this);
    updateZombies(this, dt);
    updateProjectiles(this, dt);
    updateEntities(this);
    updateBarricades(this, dt);
    if (this.events.length) {
      this.out.broadcast({ t: 'ev', tick: this.tick, events: this.events });
      this.events = [];
    }
    if (this.tick % SNAPSHOT_EVERY_TICKS === 0) this.sendSnapshots();
    const ms = performance.now() - began;
    this.stats.tickMs += (ms - this.stats.tickMs) * 0.02;
    this.stats.tickMsMax = Math.max(this.stats.tickMsMax, ms);
    this.stats.ticks++;
    if (ms > TICK_BUDGET_MS) this.stats.overBudget++;
  }

  private sendSnapshots(): void {
    const players: PlayerSnap[] = [];
    const now = this.now();
    for (const p of this.players.values()) {
      let { x, z } = p;
      const ahead = Math.min(now - p.movedAt, MAX_EXTRAPOLATE);
      if (p.state !== MoveState.Idle && ahead > 0 && (p.vx !== 0 || p.vz !== 0)) {
        const ex = x + p.vx * ahead;
        const ez = z + p.vz * ahead;
        if (circleFits(this.map, this.openDoors, ex, ez, PLAYER_RADIUS - 0.05)) {
          x = ex;
          z = ez;
        }
      }
      players.push([p.pub.id, round2(x), round2(z), round2(p.yaw), round2(p.pitch), p.state, Math.round(p.hp), p.pub.slot]);
    }
    const base: Omit<Snapshot, 'ack' | 'ammo'> = { t: 'snap', tick: this.tick, time: Math.round(this.time * 1000) / 1000, players,
      zombies: [...this.zombies.values()].map(zombieSnap),
      projectiles: this.projectiles.map(projectileSnap),
    };
    for (const p of this.players.values()) {
      if (!p.pub.connected) continue;
      const w = p.pub.weapons[p.pub.slot];
      this.out.send(p.pub.id, { ...base, ack: p.ack, ammo: [p.fireAck, p.pub.slot, w?.mag ?? 0, w?.reserve ?? 0] });
    }
  }
}

const round2 = (n: number): number => Math.round(n * 1000) / 1000;
