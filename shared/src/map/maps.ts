import { harrowRidge } from './harrowRidge';
import { stacks } from './stacks';
import type { MapDef } from './types';

/** Every map there is, by id. The game is played on Harrow Ridge; the Stacks is the proving ground for height. */
export const MAPS: Readonly<Record<string, MapDef>> = { [harrowRidge.id]: harrowRidge, [stacks.id]: stacks };

/** The map with this id, or the station when there is none (or none was asked for). */
export const mapById = (id: string | null | undefined): MapDef => (id && Object.hasOwn(MAPS, id) ? MAPS[id]! : harrowRidge);
