// Test/debug surface exposed as window.__zh. Agents, the smoke test and the screenshot tour
// drive the game through this. Extend it as features land (give, setRound, spawnZombies, god...).
// Commands that change authoritative state are sent to the server, which only honours them
// when started with ZH_DEBUG=1.

export interface DebugState {
  phase: string;
  connected: boolean;
  playerId: number | null;
  room: string | null;
  isHost: boolean;
  pingMs: number | null;
  frames: number;
  fps: number;
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  zone: string | null;
  stamina: number;
  sprinting: boolean;
  freeCam: boolean;
  drawCalls: number;
  triangles: number;
  worldTriangles: number;
  resolution: [number, number];
  openDoors: string[];
  power: boolean;
  mapErrors: string[];
  /** Other players as currently drawn (interpolated). */
  remotes: { id: number; name: string; x: number; z: number; visible: boolean; connected: boolean; weapon: string | null; shots: number; state: number }[];
  corrections: number;
  /** Held weapon and predicted ammo. */
  weapon: string | null;
  weapons: string[];
  slot: number;
  mag: number;
  reserve: number;
  grenades: number;
  reloading: boolean;
  aim: number;
  /** Shots we have fired. */
  shots: number;
  /** Enemies as drawn; hp is a 0..1 fraction, state a ZombieState. */
  entities: { id: number; kind: string; x: number; z: number; hp: number; state: number }[];
  /** Our health, and how many times we have been hit. */
  hp: number;
  hurts: number;
  /** Round loop as the server reports it. */
  round: number;
  roundPhase: string;
  zombiesLeft: number;
  /** Our points, whether we are up, and the whole scoreboard. */
  points: number;
  life: 'alive' | 'downed' | 'dead';
  roster: { id: number; name: string; points: number; kills: number; headshots: number; downs: number; revives: number; state: string }[];
  /** Everyone went down: the results screen is up. */
  over: boolean;
  barricades: { id: string; planks: number }[];
  prompt: string;
  /** Server-confirmed hits by anyone, newest last (capped). */
  hits: { id: number; by: number; zone: string; dmg: number }[];
  kills: number;
  explosions: number;
  fx: { particles: number; tracers: number; projectiles: number };
}

export interface ZhDebug {
  state(): DebugState;
  teleport(x: number, z: number, yaw?: number): void;
  /** Teleport to the middle of a zone's largest room. */
  gotoZone(zoneId: string, yaw?: number): void;
  look(yaw: number, pitch?: number): void;
  /** Aim the view at a world point. */
  lookAt(x: number, y: number, z: number): void;
  /** `give('pike')` hands over a weapon, `give(500)` points (debug servers only). */
  give(what: string | number): void;
  /** Queue zombies at the windows; `opts.x/z` drops them at a spot instead (debug servers only). */
  spawnZombies(count: number, opts?: { hp?: number; speed?: number; interval?: number; x?: number; z?: number }): void;
  killZombies(): void;
  /** Jump to a round (it starts a second later). */
  setRound(round: number): void;
  /** Stop the round loop and clear the map (`false`), or resume it. */
  rounds(on: boolean): void;
  god(on: boolean): void;
  /** Stand a target dummy at (x, z), or 3 m in front of the player. */
  dummy(x?: number, z?: number): void;
  /** Tap a key for one frame, e.g. press('Mouse0') to fire once. */
  press(code: string): void;
  freeCam(on?: boolean): void;
  openAllDoors(): void;
  openDoor(id: string): void;
  /** Throw the master switch (debug servers only). */
  powerOn(): void;
  /** Hold or release a key by KeyboardEvent.code, e.g. key('KeyW', true). */
  key(code: string, down: boolean): void;
  renderScale(scale: 1 | 2): void;
  dither(on: boolean): void;
  /** Close the socket as if the network dropped; the client reconnects on its own. */
  dropConnection(): void;
}

declare global {
  interface Window {
    __zh: ZhDebug;
  }
}

export const debugState: DebugState = {
  phase: 'connecting', connected: false, playerId: null, room: null, isHost: false, pingMs: null, frames: 0, fps: 0,
  x: 0, z: 0, yaw: 0, pitch: 0, zone: null, stamina: 0, sprinting: false, freeCam: false,
  drawCalls: 0, triangles: 0, worldTriangles: 0, resolution: [0, 0], openDoors: [], power: false, mapErrors: [],
  remotes: [], corrections: 0,
  weapon: null, weapons: [], slot: 0, mag: 0, reserve: 0, grenades: 0, reloading: false, aim: 0, shots: 0,
  entities: [], hp: 100, hurts: 0, round: 0, roundPhase: 'intermission', zombiesLeft: 0, points: 0, life: 'alive', roster: [], over: false, barricades: [], prompt: '', hits: [], kills: 0, explosions: 0, fx: { particles: 0, tracers: 0, projectiles: 0 },
};

export function installDebug(api: Omit<ZhDebug, 'state'>): void {
  window.__zh = { state: () => ({ ...debugState }), ...api };
}
