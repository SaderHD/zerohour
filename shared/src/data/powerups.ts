// Power-ups (PLAN 4.10): what drops, and the order it drops in.
import type { Rng } from '../math/rng';
import type { PowerupId } from '../protocol';

export interface PowerupDef {
  id: PowerupId;
  name: string;
  /** Lasts POWERUP_DURATION seconds rather than happening at once. */
  timed: boolean;
  colour: number;
  /** One line for the banner. */
  blurb: string;
}

const list: PowerupDef[] = [
  { id: 'resupply', name: 'Resupply', timed: false, colour: 0x6adf6a, blurb: 'ammunition and grenades for everyone' },
  { id: 'reaper', name: 'Reaper', timed: true, colour: 0xf0f0e0, blurb: 'every hit kills' },
  { id: 'double', name: 'Double Up', timed: true, colour: 0xffd040, blurb: 'double points' },
  { id: 'firestorm', name: 'Firestorm', timed: false, colour: 0xff7028, blurb: 'everything out there burns' },
  { id: 'rebuild', name: 'Rebuild', timed: false, colour: 0x70b0ff, blurb: 'every barricade is whole again' },
  { id: 'clearance', name: 'Clearance', timed: true, colour: 0xd080ff, blurb: 'the Cache, everywhere, for next to nothing' },
];

export const POWERUPS: ReadonlyMap<PowerupId, PowerupDef> = new Map(list.map((p) => [p.id, p]));
export const POWERUP_LIST: readonly PowerupDef[] = list;
export const powerupDef = (id: PowerupId): PowerupDef | undefined => POWERUPS.get(id);

/**
 * The order drops come in: every type that may drop comes up once, shuffled, before any repeats.
 * A type that is not allowed when a cycle starts (Clearance before the Cache has moved) waits for the next.
 */
export class DropCycle {
  private bag: PowerupId[] = [];

  next(rng: Rng, allowed: (id: PowerupId) => boolean = () => true): PowerupId {
    if (this.bag.length === 0) this.bag = rng.shuffle(list.map((p) => p.id).filter(allowed));
    return this.bag.pop() ?? 'resupply';
  }
}
