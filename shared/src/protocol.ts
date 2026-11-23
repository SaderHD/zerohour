// The complete client<->server wire protocol. JSON messages tagged by `t`.
// Both ends import these types; bump PROTOCOL_VERSION (constants.ts) on any breaking change.
// Static/slow state travels in `sync` (on join) and discrete `ev` messages (on change);
// fast state travels in `snap` at 15 Hz as compact tuples.

import { MAX_MSG_BYTES } from './constants';

export type PlayerId = number;
export type EntityId = number;
/** Ids below refer to entries in shared/src/data or the map definition. */
export type WeaponId = string;
export type PerkId = string;
export type PowerupId = string;
export type InteractableId = string;

export type HitZone = 'head' | 'torso' | 'limb';

export const enum MoveState {
  Idle = 0,
  Walk = 1,
  Sprint = 2,
  Downed = 3,
  Dead = 4,
}

export const enum ZombieState {
  Approach = 0, // outside, walking to its window
  Tear = 1, // pulling planks
  Vault = 2,
  Chase = 3,
  Attack = 4,
  Crawl = 5,
  Dying = 6,
}

export type ZombieKind = 'zombie' | 'howler';

// ---------------------------------------------------------------- client -> server

export interface FireHit {
  id: EntityId;
  zone: HitZone;
  dist: number;
}

export type DebugCmd =
  | { cmd: 'give'; weapon?: WeaponId; perk?: PerkId; points?: number }
  | { cmd: 'setRound'; round: number }
  | { cmd: 'spawnZombies'; count: number }
  | { cmd: 'god'; on: boolean }
  | { cmd: 'openAllDoors' }
  | { cmd: 'openDoor'; id: InteractableId }
  | { cmd: 'powerOn' }
  | { cmd: 'teleport'; x: number; z: number };

export type ClientMsg =
  | { t: 'hello'; v: number; name: string; token?: string }
  | { t: 'create'; name?: string; code?: string } // a requested code is honoured only by debug servers
  | { t: 'join'; code: string; name?: string }
  | { t: 'leave' }
  | { t: 'ready'; ready: boolean }
  | { t: 'start' }
  | { t: 'move'; seq: number; x: number; z: number; yaw: number; pitch: number; state: MoveState }
  | { t: 'fire'; seq: number; slot: number; yaw: number; pitch: number; aim: boolean; hits: FireHit[] }
  | { t: 'reload' }
  | { t: 'swap'; slot: number }
  | { t: 'melee'; hit?: EntityId }
  | { t: 'throw'; kind: 'frag' | 'tactical'; yaw: number; pitch: number }
  | { t: 'interact'; id: InteractableId; hold: boolean } // hold=false cancels a held interaction
  | { t: 'revive'; target: PlayerId; hold: boolean }
  | { t: 'chat'; text: string }
  | { t: 'mark'; x: number; z: number }
  | { t: 'ping'; c: number }
  | ({ t: 'debug' } & DebugCmd);

export type ClientMsgType = ClientMsg['t'];

// ---------------------------------------------------------------- server -> client

export type ErrorCode =
  | 'version'
  | 'bad_message'
  | 'room_not_found'
  | 'room_full'
  | 'not_host'
  | 'not_in_room'
  | 'not_ready'
  | 'rate_limited'
  | 'kicked';

export interface LobbyPlayer {
  id: PlayerId;
  name: string;
  ready: boolean;
  host: boolean;
  connected: boolean;
}

export type RoomPhase = 'lobby' | 'playing' | 'gameover';

export interface WeaponState {
  id: WeaponId;
  upgraded: boolean;
  mag: number;
  reserve: number;
}

/** Slow-changing per-player state. Sent in `sync` and re-sent via `ev: player` when it changes. */
export interface PlayerPublic {
  id: PlayerId;
  name: string;
  points: number;
  kills: number;
  headshots: number;
  downs: number;
  revives: number;
  perks: PerkId[];
  weapons: WeaponState[];
  slot: number;
  grenades: number;
  tactical: number;
  connected: boolean;
}

export interface BarricadeState {
  id: InteractableId;
  planks: number;
}

export interface PowerupDrop {
  id: EntityId;
  kind: PowerupId;
  x: number;
  z: number;
  expiresAt: number; // server time, seconds
}

export interface CacheState {
  site: InteractableId;
  /** idle -> rolling -> offering (weapon floats for `by`) -> idle; or jinx -> moving. */
  phase: 'idle' | 'rolling' | 'offering' | 'jinx' | 'moving';
  by?: PlayerId;
  weapon?: WeaponId;
  until?: number;
}

export interface ForgeState {
  phase: 'idle' | 'working' | 'offering';
  by?: PlayerId;
  weapon?: WeaponId;
  until?: number;
}

/** Full world state for a joining or reconnecting client. */
export interface SyncState {
  map: string;
  seed: number;
  time: number;
  round: number;
  roundPhase: 'intermission' | 'active' | 'special';
  zombiesLeft: number;
  power: boolean;
  openDoors: InteractableId[];
  barricades: BarricadeState[];
  players: PlayerPublic[];
  powerups: PowerupDrop[];
  activeEffects: { kind: PowerupId; until: number }[];
  cache: CacheState;
  forge: ForgeState;
  /** Where the receiving player is standing (spawn point, or last position on reconnect). */
  self: { x: number; z: number; yaw: number };
}

/** [id, x, z, yaw, pitch, moveState, hp, slot] */
export type PlayerSnap = [PlayerId, number, number, number, number, MoveState, number, number];
/** [id, x, z, yaw, state, hpFrac(0..1), speed] */
export type ZombieSnap = [EntityId, number, number, number, ZombieState, number, number];
/** [id, kind, x, y, z] server-simulated projectiles (grenades, orbs, decoys) */
export type ProjectileSnap = [EntityId, string, number, number, number];

export interface Snapshot {
  t: 'snap';
  tick: number;
  time: number;
  /** Last `move.seq` processed for the receiving player. */
  ack: number;
  players: PlayerSnap[];
  zombies: ZombieSnap[];
  projectiles: ProjectileSnap[];
}

/** Discrete things that happened. Batched per tick inside one `ev` message. */
export type GameEvent =
  | { e: 'player'; player: PlayerPublic }
  | { e: 'points'; id: PlayerId; delta: number; total: number; reason: string }
  | { e: 'zombieSpawn'; id: EntityId; kind: ZombieKind; seed: number; x: number; z: number }
  | { e: 'zombieHit'; id: EntityId; by: PlayerId; zone: HitZone; dmg: number }
  | { e: 'zombieDied'; id: EntityId; by?: PlayerId; zone?: HitZone; cause: string }
  | { e: 'fired'; id: PlayerId; weapon: WeaponId; yaw: number; pitch: number }
  | { e: 'melee'; id: PlayerId }
  | { e: 'playerHurt'; id: PlayerId; hp: number; fromX: number; fromZ: number }
  | { e: 'playerDowned'; id: PlayerId }
  | { e: 'playerRevived'; id: PlayerId; by?: PlayerId }
  | { e: 'playerDied'; id: PlayerId }
  | { e: 'playerSpawned'; id: PlayerId; x: number; z: number }
  | { e: 'playerLeft'; id: PlayerId }
  | { e: 'roundStart'; round: number; special: boolean; total: number }
  | { e: 'roundEnd'; round: number }
  | { e: 'zombiesLeft'; n: number }
  | { e: 'doorOpened'; id: InteractableId; by: PlayerId }
  | { e: 'barricade'; id: InteractableId; planks: number; by?: PlayerId }
  | { e: 'powerOn'; by: PlayerId }
  | { e: 'purchase'; id: PlayerId; what: 'weapon' | 'ammo' | 'perk' | 'door' | 'cache' | 'forge'; ref: string }
  | { e: 'denied'; reason: 'points' | 'power' | 'limit' | 'busy' | 'range' | 'invalid' }
  | { e: 'cache'; state: CacheState }
  | { e: 'forge'; state: ForgeState }
  | { e: 'powerupDrop'; drop: PowerupDrop }
  | { e: 'powerupTaken'; id: EntityId; kind: PowerupId; by: PlayerId; until?: number }
  | { e: 'powerupExpired'; id: EntityId }
  | { e: 'explosion'; x: number; y: number; z: number; radius: number; kind: string }
  | { e: 'chain'; from: [number, number, number]; targets: EntityId[] }
  | { e: 'mark'; id: PlayerId; x: number; z: number }
  | { e: 'gameOver'; round: number; players: PlayerPublic[] };

export type ServerMsg =
  | { t: 'welcome'; v: number; id: PlayerId; token: string; time: number; resumed: boolean }
  | { t: 'error'; code: ErrorCode; msg?: string }
  | { t: 'room'; code: string; phase: RoomPhase; players: LobbyPlayer[]; you: PlayerId }
  | { t: 'left' }
  | ({ t: 'sync' } & SyncState)
  | Snapshot
  | { t: 'correct'; x: number; z: number; seq: number }
  | { t: 'ev'; tick: number; events: GameEvent[] }
  | { t: 'chat'; from: PlayerId; name: string; text: string }
  | { t: 'pong'; c: number; time: number };

export type ServerMsgType = ServerMsg['t'];

// ---------------------------------------------------------------- encode / decode

const CLIENT_TYPES: ReadonlySet<string> = new Set<ClientMsgType>([
  'hello', 'create', 'join', 'leave', 'ready', 'start', 'move', 'fire', 'reload', 'swap',
  'melee', 'throw', 'interact', 'revive', 'chat', 'mark', 'ping', 'debug',
]);

export const encode = (msg: ClientMsg | ServerMsg): string => JSON.stringify(msg);

/**
 * Parse an untrusted frame from a client. Returns null for anything that is not a JSON object
 * with a known `t`. Field-level validation is the job of each handler (see session 13).
 */
export function decodeClient(raw: string): ClientMsg | null {
  if (raw.length > MAX_MSG_BYTES) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const t = (v as { t?: unknown }).t;
  if (typeof t !== 'string' || !CLIENT_TYPES.has(t)) return null;
  return v as ClientMsg;
}

/** Parse a frame from the server (trusted, but never throw on a bad frame). */
export function decodeServer(raw: string): ServerMsg | null {
  try {
    const v = JSON.parse(raw) as ServerMsg;
    return typeof v === 'object' && v !== null && typeof v.t === 'string' ? v : null;
  } catch {
    return null;
  }
}

export const isFiniteNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Trim, collapse whitespace, strip control characters, and cap length. */
export function sanitizeText(s: unknown, max: number): string {
  if (typeof s !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
