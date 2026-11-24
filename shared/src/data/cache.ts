// The Cache (PLAN 4.7): what can come out of it and how likely each thing is.
import type { Rng } from '../math/rng';
import { WEAPON_LIST, weaponDef } from './weapons';

/** The Siren decoy is not a weapon; the Cache hands out a set of them for the tactical slot. */
export const SIREN = 'siren';
export const SIREN_NAME = '"Siren" decoys';

const WEIGHT_BOX = 10;
const WEIGHT_WALL = 4;
const WEIGHT_SIREN = 8;
/** About 4% each against the full table. */
const WEIGHT_WONDER = 3.5;

export interface CacheEntry {
  id: string;
  weight: number;
}

export const CACHE_TABLE: readonly CacheEntry[] = [
  ...WEAPON_LIST.filter((w) => w.source !== 'start').map((w) => ({ id: w.id, weight: w.wonder ? WEIGHT_WONDER : w.source === 'box' ? WEIGHT_BOX : WEIGHT_WALL })),
  { id: SIREN, weight: WEIGHT_SIREN },
];

export const isWonder = (id: string): boolean => weaponDef(id)?.wonder !== undefined;

/** What a roll may land on: not something the buyer holds, not a wonder weapon already out in the game. */
export function cacheChoices(held: readonly string[], wondersOut: readonly string[]): CacheEntry[] {
  return CACHE_TABLE.filter((e) => !held.includes(e.id) && !(isWonder(e.id) && wondersOut.includes(e.id)));
}

export function rollCache(rng: Rng, held: readonly string[], wondersOut: readonly string[]): string {
  return rng.weighted(cacheChoices(held, wondersOut), (e) => e.weight).id;
}

/** The name on the prompt for something the Cache offers. */
export const cacheItemName = (id: string): string => (id === SIREN ? SIREN_NAME : weaponDef(id)?.name ?? id);
