// Round tables (PLAN 4.3): how many zombies, how tough, how fast, how quickly they arrive.
import {
  HOWLER_HP_FRAC, PLANK_POINTS_BASE, PLANK_POINTS_PER_ROUND, SPAWN_INTERVAL_DECAY, SPAWN_INTERVAL_MIN, ZOMBIE_BASE_HP, ZOMBIE_SPAWN_INTERVAL,
  ZOMBIE_SPEED_RUN, ZOMBIE_SPEED_SHAMBLE, ZOMBIE_SPEED_WALK,
} from '../constants';

/** Solo zombie counts the curve passes through: [round, zombies]. Straight lines in between. */
const COUNT_ANCHORS: readonly (readonly [number, number])[] = [[1, 6], [2, 8], [3, 13], [5, 24], [10, 46], [20, 110]];
/** Each player after the first adds this share of the solo count. */
const EXTRA_PLAYER_SHARE = 0.5;
/** Rounds whose health grows by a flat step; after that it compounds. */
const HP_LINEAR_ROUNDS = 9;
const HP_STEP = 100;
const HP_GROWTH = 1.1;
/** Walkers appear from this round, runners from this one. */
const WALKERS_FROM = 3;
const RUNNERS_FROM = 6;
const WALKER_STEP = 0.25;
const RUNNER_STEP = 0.15;
const RUNNER_MAX = 0.9;

export function zombiesForRound(round: number, players = 1): number {
  const r = Math.max(1, round);
  let lo = COUNT_ANCHORS[0]!;
  let hi = COUNT_ANCHORS[1]!;
  for (let i = 1; i < COUNT_ANCHORS.length; i++) {
    lo = COUNT_ANCHORS[i - 1]!;
    hi = COUNT_ANCHORS[i]!;
    if (r <= hi[0]) break;
  }
  // Past the last anchor the final slope simply continues.
  const solo = lo[1] + ((r - lo[0]) * (hi[1] - lo[1])) / (hi[0] - lo[0]);
  return Math.round(solo * (1 + EXTRA_PLAYER_SHARE * (Math.max(1, players) - 1)));
}

export function zombieHpForRound(round: number): number {
  const r = Math.max(1, round);
  const linear = ZOMBIE_BASE_HP + HP_STEP * (Math.min(r, HP_LINEAR_ROUNDS) - 1);
  return Math.round(linear * HP_GROWTH ** Math.max(0, r - HP_LINEAR_ROUNDS));
}

/** Shares of the round's zombies that walk and run; the rest shamble. */
export function speedShares(round: number): { walk: number; run: number } {
  const run = round < RUNNERS_FROM ? 0 : Math.min(RUNNER_MAX, RUNNER_STEP * (round - RUNNERS_FROM + 1));
  const walk = round < WALKERS_FROM ? 0 : (1 - run) * Math.min(1, WALKER_STEP * (round - WALKERS_FROM + 1));
  return { walk, run };
}

/** Speed of one zombie of this round; `roll` is a uniform random number in [0, 1). */
export function zombieSpeedForRound(round: number, roll: number): number {
  const { walk, run } = speedShares(round);
  return roll < run ? ZOMBIE_SPEED_RUN : roll < run + walk ? ZOMBIE_SPEED_WALK : ZOMBIE_SPEED_SHAMBLE;
}

/** Seconds between spawns. */
export const spawnIntervalForRound = (round: number): number =>
  Math.max(SPAWN_INTERVAL_MIN, ZOMBIE_SPAWN_INTERVAL * SPAWN_INTERVAL_DECAY ** (Math.max(1, round) - 1));

/** Most points one player can earn from rebuilding planks in a round. */
export const plankPointsCap = (round: number): number => PLANK_POINTS_BASE + PLANK_POINTS_PER_ROUND * Math.max(1, round);

/** Howlers in a howler round (PLAN 4.3). */
export const howlersForRound = (round: number, players = 1): number => 8 * Math.max(1, players) + 2 * Math.max(1, round);

export const howlerHpForRound = (round: number): number => Math.round(zombieHpForRound(round) * HOWLER_HP_FRAC);
