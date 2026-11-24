import {
  CELL_SIZE, MARK_RANGE, MOVE_BUDGET_CAP, MOVE_SPEED_SLACK, MoveState, PLAYER_MAX_HP, PLAYER_RADIUS, SNAPSHOT_EVERY_TICKS,
  Rng, SPRINT_SPEED, START_GRENADES, START_POINTS, START_WEAPON, STEP_HEIGHT, TICK_BUDGET_MS, TICK_DT, ZOMBIE_SPAWN_INTERVAL,
  circleFits, compileMap, isFiniteNum, mapById,
  type ClientMsg, type CompiledMap, type GameEvent, type PlayerId, type PlayerPublic, type PlayerSnap,
  type ForgeState, type Interactable, type PowerupId, type ServerMsg, type Snapshot, type WeaponState,
} from '@zh/shared';
import { newWeapon, onFire, onMelee, onReload, onSwap, onThrow, settleReload } from './combat';
import { barricadeStates, createBarricades, updateBarricades } from './barricades';
import { cacheStates, createCache, updateCache } from './cache';
import { onDebug } from './debug';
import { createForge, updateForge } from './forge';
import { onInteract } from './interact';
import { updateEntities, zombieSnap, type Zombie } from './entities';
import { Nav } from './nav';
import { everyoneDown, onRevive, sitOut, standing, updatePlayers } from './players';
import { activeEffects, createPowerups, updatePowerups } from './powerups';
import { projectileSnap, updateProjectiles, type Projectile } from './projectiles';
import { createRounds, updateRounds } from './rounds';
import { updateSpawner, type Arrival, type SpawnOrder } from './spawner';
import { updateZombies } from './zombies';

let sharedMap: CompiledMap | null = null;
/** The map games are played on: the station, unless `ZH_MAP` names another (`ZH_MAP=stacks` for the height proving ground). */
export const gameMap = (): CompiledMap => (sharedMap ??= compileMap(mapById(process.env.ZH_MAP)));

export interface PlayerState {
  pub: PlayerPublic;
  x: number;
  /** Height of the floor underfoot. */
  y: number;
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
  /** While downed: when they bleed out (game time), who is reviving them (0 = nobody) and how far along. */
  down: { until: number; by: PlayerId; progress: number; self?: boolean } | null;
  /** The loadout set aside while downed (a downed player has only a pistol). */
  stash: { weapons: WeaponState[]; slot: number } | null;
  /** The downed teammate this player is holding F on (0 = none). */
  reviving: PlayerId;
  /** Points earned from planks this round (capped). */
  plankPoints: number;
  /** Game time until which nothing hurts them (just back on their feet). */
  safeUntil: number;
  /** Second Winds bought while alone (there is a limit per game). */
  secondWinds: number;
}

export interface GameOpts {
  debug: boolean;
  seed: number;
  now?: () => number;
  /** False starts the game with the round loop stopped (sim tests feed the spawner themselves). */
  rounds?: boolean;
  /** Called once when everyone is down. */
  onOver?: () => void;
  /** Called if a tick throws (the game has been stopped). */
  onCrash?: () => void;
  /** Play on this map instead of the station (tests of the map machinery). */
  map?: CompiledMap;
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
  readonly map: CompiledMap;
  readonly players = new Map<PlayerId, PlayerState>();
  readonly openDoors = new Set<string>();
  readonly interactables: ReadonlyMap<string, Interactable>;
  forge: ForgeState = createForge();
  /** The master switch has been thrown (permanent). */
  power = false;
  time = 0;
  tick = 0;
  private events: GameEvent[] = [];
  private timer: NodeJS.Timeout | null = null;
  private spawnCursor = 0;
  readonly zombies = new Map<number, Zombie>();
  readonly projectiles: Projectile[] = [];
  readonly dummyResets: { at: number; x: number; y: number; z: number; yaw: number }[] = [];
  readonly rng: Rng;
  /** A second stream for the things of chance added later (the Cache, drops, howler rounds), so they do not shift the first. */
  readonly luck: Rng;
  nextEntityId = 1;
  readonly barricades: ReturnType<typeof createBarricades>;
  readonly nav = new Nav();
  readonly spawnQueue: SpawnOrder[] = [];
  /** Howlers whose lightning has struck and who are about to appear. */
  readonly arrivals: Arrival[] = [];
  /** Timed power-ups: when each one ends (game time). */
  readonly effects = new Map<PowerupId, number>();
  readonly powerups = createPowerups();
  spawnInterval = ZOMBIE_SPAWN_INTERVAL;
  nextSpawnAt = 0;
  /** How long `step` takes, in ms: a moving average, the worst seen, and how many went over TICK_BUDGET_MS. */
  readonly stats = { ticks: 0, tickMs: 0, tickMsMax: 0, overBudget: 0 };
  /**
   * Wall clock in seconds, for timing client messages (which arrive between ticks): movement
   * velocity, fire rate, reloads. Tests inject a fake one.
   */
  readonly now: () => number;

  readonly rounds: ReturnType<typeof createRounds>;
  readonly cache: ReturnType<typeof createCache>;
  /** Set when everyone is down: the sim stops and the results stay up until the room moves on. */
  over = false;

  constructor(private readonly out: GameOut, readonly opts: GameOpts) {
    this.map = opts.map ?? gameMap();
    this.interactables = new Map(this.map.def.interactables.map((i) => [i.id, i]));
    this.barricades = createBarricades(this);
    this.now = opts.now ?? (() => performance.now() / 1000);
    this.rng = new Rng(opts.seed);
    this.luck = new Rng((opts.seed ^ 0x5eed1e55) >>> 0);
    this.rounds = createRounds(opts.rounds === false);
    this.cache = createCache(this);
  }

  /** Is this timed power-up running? */
  effectOn(kind: PowerupId): boolean {
    return (this.effects.get(kind) ?? 0) > this.time;
  }

  // ------------------------------------------------------------ lifecycle

  start(): void {
    let last = performance.now();
    let acc = 0;
    this.timer = setInterval(() => {
      const now = performance.now();
      acc = Math.min(acc + (now - last) / 1000, 0.25);
      last = now;
      try {
        while (acc >= TICK_DT) {
          this.step(TICK_DT);
          acc -= TICK_DT;
        }
      } catch (err) {
        // A bug in the sim: shut this game rather than throw sixty times a second.
        console.error('[zerohour] game tick failed', err);
        this.stop();
        this.opts.onCrash?.();
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
      x: s.x, y: s.y, z: s.z, yaw: s.yaw, pitch: 0, state: MoveState.Idle, hp: PLAYER_MAX_HP, ack: 0, budget: MOVE_BUDGET_CAP,
      vx: 0, vz: 0, movedAt: this.now(),
      fireAck: 0, nextFireAt: 0, nextMeleeAt: 0, nextThrowAt: 0, reloadUntil: 0,
      hurtAt: -100, god: false, rebuild: null, down: null, stash: null, reviving: 0, plankPoints: 0, safeUntil: 0, secondWinds: 0,
    };
    this.players.set(id, p);
    this.emit({ e: 'player', player: p.pub });
    // Joining mid-round: watch until the next one starts.
    if (this.rounds.phase === 'active') sitOut(p);
    else this.emit({ e: 'playerSpawned', id, x: p.x, y: p.y, z: p.z });
    return p;
  }

  nextSpawn(): { x: number; y: number; z: number; yaw: number } {
    const spawns = this.map.playerSpawns;
    return spawns[this.spawnCursor++ % spawns.length]!;
  }

  /** Can zombies chase and hurt this player right now? */
  targetable(p: PlayerState): boolean {
    return p.pub.connected && standing(p);
  }

  /** Snap a client back to where the server has it. */
  correct(p: PlayerState): void {
    this.out.send(p.pub.id, { t: 'correct', x: p.x, y: p.y, z: p.z, seq: p.ack });
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
    if (!connected && standing(p)) p.state = MoveState.Idle;
    if (!connected) p.reviving = 0;
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
      round: this.rounds.round,
      roundPhase: this.rounds.phase === 'active' && this.rounds.special ? 'special' : this.rounds.phase,
      zombiesLeft: this.rounds.left,
      over: this.over,
      power: this.power,
      openDoors: [...this.openDoors],
      barricades: barricadeStates(this),
      players: [...this.players.values()].map((q) => q.pub),
      zombies: [...this.zombies.values()].map((z) => ({ id: z.id, kind: z.kind, seed: z.seed, x: z.x, y: z.y, z: z.z })),
      powerups: this.powerups.drops,
      activeEffects: activeEffects(this),
      cache: { home: this.cache.home, boxes: cacheStates(this) },
      forge: this.forge,
      self: { x: p.x, y: p.y, z: p.z, yaw: p.yaw },
    };
  }

  // ------------------------------------------------------------ input

  onMessage(id: PlayerId, msg: ClientMsg): void {
    const p = this.players.get(id);
    if (!p || this.over) return;
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
      case 'revive':
        return onRevive(this, p, msg);
      case 'debug':
        if (this.opts.debug) onDebug(this, p, msg);
        return;
      case 'mark':
        return this.onMark(p, msg);
      default:
        return; // chat is the room's business (lobby.ts)
    }
  }

  private onMove(p: PlayerState, m: Extract<ClientMsg, { t: 'move' }>): void {
    if (![m.x, m.y, m.z, m.yaw, m.pitch, m.seq].every(isFiniteNum)) return;
    if (m.seq <= p.ack) return; // stale or replayed
    p.ack = m.seq;
    p.yaw = m.yaw;
    p.pitch = Math.max(-1.6, Math.min(1.6, m.pitch));
    const d = Math.hypot(m.x - p.x, m.z - p.z);
    if (!standing(p)) {
      // Downed and dead players stay where they fell; they may still look around.
      if (d > 0.05) this.out.send(p.pub.id, { t: 'correct', x: p.x, y: p.y, z: p.z, seq: m.seq });
      return;
    }
    // The floor they say they are on must be one that is there, and no further up or down than
    // the steepest stairs would take them over that distance.
    const floor = this.map.cellAt(m.x, m.y, m.z);
    const y = floor < 0 ? p.y : this.map.lo[floor]!;
    const legal = d <= p.budget + 0.05 && floor >= 0 && Math.abs(y - p.y) <= (d / CELL_SIZE + 1) * STEP_HEIGHT + 0.05
      && circleFits(this.map, this.openDoors, m.x, y, m.z, PLAYER_RADIUS - 0.05);
    if (!legal) {
      this.out.send(p.pub.id, { t: 'correct', x: p.x, y: p.y, z: p.z, seq: m.seq });
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
    p.y = y;
    p.z = m.z;
    p.state = m.state === MoveState.Sprint ? MoveState.Sprint : m.state === MoveState.Walk ? MoveState.Walk : MoveState.Idle;
  }

  /** A ping marker: "look here". Anyone still in the game may place one, somewhere on the map and not too far off. */
  private onMark(p: PlayerState, m: Extract<ClientMsg, { t: 'mark' }>): void {
    if (!isFiniteNum(m.x) || !isFiniteNum(m.y) || !isFiniteNum(m.z) || p.state === MoveState.Dead) return;
    const { cols, rows } = this.map;
    if (m.x < 0 || m.z < 0 || m.x > cols * CELL_SIZE || m.z > rows * CELL_SIZE || Math.hypot(m.x - p.x, m.z - p.z) > MARK_RANGE) return;
    if (Math.abs(m.y - p.y) > MARK_RANGE) return;
    this.emit({ e: 'mark', id: p.pub.id, x: round2(m.x), y: round2(m.y), z: round2(m.z) });
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

  /** An event only one player needs to hear (a refused purchase). */
  emitTo(id: PlayerId, ev: GameEvent): void {
    this.out.send(id, { t: 'ev', tick: this.tick, events: [ev] });
  }

  step(dt: number): void {
    if (this.over) return;
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
    updatePowerups(this);
    updateForge(this);
    updateCache(this);
    updateRounds(this);
    if (everyoneDown(this)) {
      this.over = true;
      this.emit({ e: 'gameOver', round: this.rounds.round, players: [...this.players.values()].map((p) => p.pub) });
    }
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
    if (this.over) this.opts.onOver?.();
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
        if (circleFits(this.map, this.openDoors, ex, p.y, ez, PLAYER_RADIUS - 0.05)) {
          x = ex;
          z = ez;
        }
      }
      players.push([p.pub.id, round2(x), round2(z), round2(p.yaw), round2(p.pitch), p.state, Math.round(p.hp), p.pub.slot, round2(p.y)]);
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
