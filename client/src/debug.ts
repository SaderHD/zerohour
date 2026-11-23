// Test/debug surface exposed as window.__zh. Agents and the smoke test drive the game through
// this. Later sessions add teleport, give, setRound, spawnZombies, god, freeCam, etc.

export interface DebugState {
  connected: boolean;
  playerId: number | null;
  pingMs: number | null;
  frames: number;
}

export interface ZhDebug {
  state(): DebugState;
}

declare global {
  interface Window {
    __zh: ZhDebug;
  }
}

export const debugState: DebugState = { connected: false, playerId: null, pingMs: null, frames: 0 };

export function installDebug(): void {
  window.__zh = { state: () => ({ ...debugState }) };
}
