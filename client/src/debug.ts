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
  mapErrors: string[];
  /** Other players as currently drawn (interpolated). */
  remotes: { id: number; name: string; x: number; z: number; visible: boolean; connected: boolean }[];
  corrections: number;
}

export interface ZhDebug {
  state(): DebugState;
  teleport(x: number, z: number, yaw?: number): void;
  /** Teleport to the middle of a zone's largest room. */
  gotoZone(zoneId: string, yaw?: number): void;
  look(yaw: number, pitch?: number): void;
  freeCam(on?: boolean): void;
  openAllDoors(): void;
  openDoor(id: string): void;
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
  drawCalls: 0, triangles: 0, worldTriangles: 0, resolution: [0, 0], openDoors: [], mapErrors: [],
  remotes: [], corrections: 0,
};

export function installDebug(api: Omit<ZhDebug, 'state'>): void {
  window.__zh = { state: () => ({ ...debugState }), ...api };
}
