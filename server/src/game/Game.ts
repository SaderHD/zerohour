import {
  MOVE_BUDGET_CAP, MOVE_SPEED_SLACK, MoveState, PLAYER_MAX_HP, PLAYER_RADIUS, SNAPSHOT_EVERY_TICKS,
  SPRINT_SPEED, START_GRENADES, START_POINTS, TICK_DT, circleFits, compileMap, harrowRidge, isFiniteNum,
  type ClientMsg, type CompiledMap, type GameEvent, type PlayerId, type PlayerPublic, type PlayerSnap,
  type ServerMsg, type Snapshot,
} from '@zh/shared';

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
  /** Wall clock in seconds; only used to time client messages between ticks. */
  private readonly clock = (): number => performance.now() / 1000;

  constructor(private readonly out: GameOut, readonly opts: { debug: boolean; seed: number }) {}

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
    const spawns = this.map.def.playerSpawns;
    const s = spawns[this.spawnCursor++ % spawns.length]!;
    const p: PlayerState = {
      pub: {
        id, name, points: START_POINTS, kills: 0, headshots: 0, downs: 0, revives: 0,
        perks: [], weapons: [], slot: 0, grenades: START_GRENADES, tactical: 0, connected: true,
      },
      x: s.x, z: s.z, yaw: s.yaw, pitch: 0, state: MoveState.Idle, hp: PLAYER_MAX_HP, ack: 0, budget: MOVE_BUDGET_CAP,
      vx: 0, vz: 0, movedAt: this.clock(),
    };
    this.players.set(id, p);
    this.emit({ e: 'player', player: p.pub });
    this.emit({ e: 'playerSpawned', id, x: p.x, z: p.z });
    return p;
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
      barricades: [],
      players: [...this.players.values()].map((q) => q.pub),
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
      case 'debug':
        if (this.opts.debug) this.onDebug(p, msg);
        return;
      default:
        return; // combat, interaction etc. arrive in later sessions
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
    const now = this.clock();
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
        this.out.send(p.pub.id, { t: 'correct', x: p.x, z: p.z, seq: p.ack });
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

  openDoor(id: string, by: PlayerId): void {
    if (this.openDoors.has(id)) return;
    this.openDoors.add(id);
    this.emit({ e: 'doorOpened', id, by });
  }

  // ------------------------------------------------------------ sim

  emit(ev: GameEvent): void {
    this.events.push(ev);
  }

  step(dt: number): void {
    this.time += dt;
    this.tick++;
    for (const p of this.players.values()) {
      p.budget = Math.min(MOVE_BUDGET_CAP, p.budget + SPRINT_SPEED * MOVE_SPEED_SLACK * dt);
    }
    if (this.events.length) {
      this.out.broadcast({ t: 'ev', tick: this.tick, events: this.events });
      this.events = [];
    }
    if (this.tick % SNAPSHOT_EVERY_TICKS === 0) this.sendSnapshots();
  }

  private sendSnapshots(): void {
    const players: PlayerSnap[] = [];
    const now = this.clock();
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
      players.push([p.pub.id, round2(x), round2(z), round2(p.yaw), round2(p.pitch), p.state, p.hp, p.pub.slot]);
    }
    const base: Omit<Snapshot, 'ack'> = { t: 'snap', tick: this.tick, time: Math.round(this.time * 1000) / 1000, players, zombies: [], projectiles: [] };
    for (const p of this.players.values()) {
      if (p.pub.connected) this.out.send(p.pub.id, { ...base, ack: p.ack });
    }
  }
}

const round2 = (n: number): number => Math.round(n * 1000) / 1000;
