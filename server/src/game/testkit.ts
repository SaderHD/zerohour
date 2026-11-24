import { TICK_DT, type ClientMsg, type CompiledMap, type GameEvent, type ServerMsg, type Snapshot } from '@zh/shared';
import { Game } from './Game';

/** A game on a fake clock, with everything it sends collected. For sim tests. The round loop is off unless asked for. */
export function makeGame(seed = 7, opts: { rounds?: boolean; map?: CompiledMap } = {}) {
  let now = 100;
  const events: GameEvent[] = [];
  const snaps: Snapshot[] = [];
  const corrections: { id: number; x: number; z: number }[] = [];
  const denied: { id: number; reason: string }[] = [];
  const game = new Game(
    {
      send: (id: number, m: ServerMsg) => {
        if (m.t === 'snap') snaps.push(m);
        else if (m.t === 'correct') corrections.push({ id, x: m.x, z: m.z });
        else if (m.t === 'ev') for (const ev of m.events) if (ev.e === 'denied') denied.push({ id, reason: ev.reason });
      },
      broadcast: (m: ServerMsg) => void (m.t === 'ev' && events.push(...m.events)),
    },
    { debug: true, seed, now: () => now, rounds: opts.rounds === true, map: opts.map },
  );
  let moveSeq = 0;
  return {
    game, events, snaps, corrections, denied,
    /** Advance the wall clock and the sim together. */
    wait(sec: number, each?: () => void): void {
      for (let t = 0; t < sec - 1e-9; t += TICK_DT) {
        now += TICK_DT;
        each?.();
        game.step(TICK_DT);
      }
    },
    send: (id: number, m: ClientMsg) => game.onMessage(id, m),
    /** Put a player somewhere, as the debug teleport does (`y` picks the floor where there are several). */
    teleport: (id: number, x: number, z: number, y?: number) => game.onMessage(id, { t: 'debug', cmd: 'teleport', x, z, y }),
    /** A move message; without `y` the player stays at the height they are at. */
    move: (id: number, x: number, z: number, yaw = 0, y = game.players.get(id)?.y ?? 0) => game.onMessage(id, { t: 'move', seq: ++moveSeq, x, y, z, yaw, pitch: 0, state: 1 }),
    of: <E extends GameEvent['e']>(e: E) => events.filter((ev) => ev.e === e) as Extract<GameEvent, { e: E }>[],
  };
}
