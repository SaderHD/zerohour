import {
  rulesOf,
  HOWLER_ROUND_MAX_GAP, HOWLER_ROUND_MIN_GAP, HOWLER_SPAWN_INTERVAL, HOWLER_SPEED, howlerHpForRound, howlersForRound,
  FIRST_ROUND_DELAY, MAX_GRENADES, MoveState, ROUND_GRENADE_REFILL, STRAGGLER_COUNT, STRAGGLER_SECONDS,
  ZOMBIE_SPEED_RUN, spawnIntervalForRound, zombieHpForRound, zombieSpeedForRound, zombiesForRound,
} from '@zh/shared';
import { killZombie } from './entities';
import type { Game } from './Game';
import { respawn, standing } from './players';
import { zombieCount, zombiesToCome } from './spawner';

// The round loop (PLAN 4.3): intermission -> fill the spawn queue -> wait for the last zombie to
// fall -> intermission. The spawner lets the queue in; this file only decides what goes on it.

export interface RoundState {
  /** 0 until the first round starts. */
  round: number;
  phase: 'intermission' | 'active';
  /** Game time the next round starts (while in intermission). */
  nextAt: number;
  /** Zombies this round started with, and how many are still to be killed. */
  total: number;
  left: number;
  /** Game time the last few turn into runners; 0 while there are more than a few. */
  hurryAt: number;
  /** A howler round (PLAN 4.3), and the round the next one falls on (0 until the first round picks it). */
  special: boolean;
  nextSpecial: number;
  /** Debug and tests: the loop stands still. `replay`: it was stopped mid-round, which starts over on resume. */
  paused: boolean;
  replay: boolean;
}

export const createRounds = (paused: boolean): RoundState =>
  ({ round: 0, phase: 'intermission', nextAt: FIRST_ROUND_DELAY, total: 0, left: 0, hurryAt: 0, special: false, nextSpecial: 0, paused, replay: false });

function startRound(g: Game): void {
  const r = g.rounds;
  let connected = 0;
  for (const p of g.players.values()) if (p.pub.connected) connected++;
  if (connected === 0) return; // nobody here: hold the round until someone is
  r.round++;
  r.phase = 'active';
  r.hurryAt = 0;
  for (const p of g.players.values()) {
    p.plankPoints = 0;
    if (p.state === MoveState.Dead) respawn(g, p);
    else if (standing(p) && r.round > 1 && p.pub.grenades < MAX_GRENADES) {
      p.pub.grenades = Math.min(MAX_GRENADES, p.pub.grenades + ROUND_GRENADE_REFILL);
      g.emit({ e: 'player', player: p.pub });
    }
  }
  g.powerups.dropped = 0;
  const gap = (): number => g.luck.int(HOWLER_ROUND_MIN_GAP, HOWLER_ROUND_MAX_GAP);
  while (r.nextSpecial < r.round) r.nextSpecial += gap();
  r.special = r.round === r.nextSpecial;
  if (r.special) {
    // Howlers instead of zombies: they arrive inside, by lightning.
    r.total = r.left = howlersForRound(r.round, connected);
    const hp = howlerHpForRound(r.round);
    for (let i = 0; i < r.total; i++) g.spawnQueue.push({ hp, speed: HOWLER_SPEED, kind: 'howler' });
    g.spawnInterval = HOWLER_SPAWN_INTERVAL;
  } else {
    r.total = r.left = zombiesForRound(r.round, connected);
    const hp = zombieHpForRound(r.round);
    for (let i = 0; i < r.total; i++) g.spawnQueue.push({ hp, speed: zombieSpeedForRound(r.round, g.rng.next()) });
    g.spawnInterval = spawnIntervalForRound(r.round);
  }
  g.nextSpawnAt = g.time;
  g.emit({ e: 'roundStart', round: r.round, special: r.special, total: r.total });
}

/** Remove every zombie and anything still queued (debug). */
function clear(g: Game): void {
  g.spawnQueue.length = 0;
  g.arrivals.length = 0;
  for (const z of [...g.zombies.values()]) if (z.kind !== 'dummy') killZombie(g, z, undefined, undefined, 'debug');
}

/** Debug: stop the loop and empty the map, or pick it up again at the round it was stopped in. */
export function setPaused(g: Game, paused: boolean): void {
  const r = g.rounds;
  if (paused === r.paused) return;
  r.paused = paused;
  if (paused) {
    clear(g);
    r.replay = r.phase === 'active';
    r.phase = 'intermission';
  } else if (r.replay) {
    r.round--; // the interrupted round starts over
    r.replay = false;
  }
  r.nextAt = g.time + 1;
  r.left = 0;
  g.emit({ e: 'zombiesLeft', n: 0 });
}

/** Debug: jump straight to a round (`special`: make it a howler round). */
export function setRound(g: Game, round: number, special = false): void {
  const r = g.rounds;
  clear(g);
  r.round = Math.max(1, Math.min(999, Math.floor(round))) - 1;
  r.phase = 'intermission';
  r.paused = r.replay = false;
  r.nextAt = g.time + 1;
  if (special) r.nextSpecial = r.round + 1;
  else if (r.nextSpecial === r.round + 1) r.nextSpecial++;
}

export function updateRounds(g: Game): void {
  const r = g.rounds;
  if (r.paused) return;
  if (r.phase === 'intermission') {
    if (g.time >= r.nextAt) startRound(g);
    return;
  }
  const alive = zombieCount(g);
  const left = zombiesToCome(g);
  if (left !== r.left) {
    r.left = left;
    g.emit({ e: 'zombiesLeft', n: left });
  }
  if (left === 0) {
    r.phase = 'intermission';
    r.nextAt = g.time + rulesOf(g.map.def).intermission;
    g.emit({ e: 'roundEnd', round: r.round });
    return;
  }
  // The last few do not get to dawdle: after a while they break into a run.
  if (left > alive || alive > STRAGGLER_COUNT) r.hurryAt = 0;
  else if (r.hurryAt === 0) r.hurryAt = g.time + STRAGGLER_SECONDS;
  else if (g.time >= r.hurryAt) {
    for (const z of g.zombies.values()) if (z.ai && !z.ai.crawler && z.speed < ZOMBIE_SPEED_RUN) z.speed = ZOMBIE_SPEED_RUN;
  }
}
