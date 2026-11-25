import { FORGE_COST, INTERMISSION_SECONDS } from '../constants';
import { CompiledMap, compileMap } from './compile';
import { corner } from './corner';
import { harrowRidge } from './harrowRidge';
import { longestNight } from './longestNight';
import { stacks } from './stacks';
import type { MapDef, MapRules } from './types';

/**
 * Every map there is, by id, in the order a lobby lists them. The Longest Night is hidden while it is being built (PLAN section 9, M3-M10);
 * the Stacks is the proving ground for height, the Corner for a city's outside.
 */
export const MAPS: Readonly<Record<string, MapDef>> = { [harrowRidge.id]: harrowRidge, [longestNight.id]: longestNight, [stacks.id]: stacks, [corner.id]: corner };

/** The map a room is on until its host says otherwise. */
export const DEFAULT_MAP = harrowRidge.id;

export const isMapId = (id: unknown): id is string => typeof id === 'string' && Object.hasOwn(MAPS, id);

/** The map with this id, or the station when there is none (or none was asked for). */
export const mapById = (id: string | null | undefined): MapDef => (isMapId(id) ? MAPS[id]! : harrowRidge);

/** The maps a host may choose from: the ones people play, and on a debug server the proving grounds too. */
export const mapChoices = (debug: boolean): string[] => Object.keys(MAPS).filter((id) => debug || !MAPS[id]!.hidden);

const compiled = new Map<string, CompiledMap>();
/** A map compiled once and shared (a compiled map is never written to): the station for an id that is not a map. */
export function compiledMap(id: string | null | undefined): CompiledMap {
  const def = mapById(id);
  let map = compiled.get(def.id);
  if (!map) compiled.set(def.id, (map = compileMap(def)));
  return map;
}

/** A map's numbers: its own where it has them, the game's where it does not. */
export const rulesOf = (def: MapDef): Required<MapRules> => ({
  intermission: def.rules?.intermission ?? INTERMISSION_SECONDS,
  forgeCost: def.rules?.forgeCost ?? FORGE_COST,
});
