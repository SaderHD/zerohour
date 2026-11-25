// What a bot would like to buy, most wanted first (see mind.ts, which decides whether to go).
import { CACHE_COST, FORGE_COST, MAX_PERKS } from '../constants';
import { perkCost, perkDef, perkNeedsPower, weaponSlotsWith } from '../data/perks';
import { ammoCost, weaponDef, weaponStats } from '../data/weapons';
import type { Interactable } from '../map/types';
import type { CacheState, ForgeState, WeaponState } from '../protocol';

export interface BotTarget {
  id: number;
  x: number;
  /** Height of the floor it stands on. */
  y: number;
  z: number;
}

/** The world as one player knows it. */
export interface BotView {
  time: number;
  id: number;
  x: number;
  /** Height of the floor we stand on. */
  y: number;
  z: number;
  hp: number;
  maxHp: number;
  life: 'alive' | 'downed' | 'dead';
  points: number;
  weapons: readonly WeaponState[];
  slot: number;
  perks: readonly string[];
  reloading: boolean;
  zombies: Iterable<BotTarget>;
  /** The other players still in the game (not dead). */
  mates: Iterable<{ id: number; x: number; y: number; z: number; downed: boolean }>;
  drops: Iterable<{ x: number; y: number; z: number }>;
  open: ReadonlySet<string>;
  power: boolean;
  solo: boolean;
  forge: ForgeState;
  /** Where the Cache stands, and what is going on at its sites. */
  cache: { home: string; boxes: Iterable<CacheState> };
}

export interface BotIntent {
  /** Unit direction to walk in (0, 0 to stand). */
  moveX: number;
  moveZ: number;
  sprint: boolean;
  /** The zombie to shoot. */
  aim: (BotTarget & { dist: number }) | null;
  /** A point to face when not aiming at a zombie (the thing being bought), else null: face the way we walk. */
  look: { x: number; z: number } | null;
  fire: boolean;
  /** Knife this zombie (0 = no). */
  melee: number;
  reload: boolean;
  /** Slot to change to, or -1. */
  swap: number;
  /** Door or interactable to press F at. */
  use: string | null;
  /** Downed teammate to hold F on (0 = none). */
  revive: number;
  /** Backing away from something close (rather than walking somewhere). */
  fleeing: boolean;
  /** For logs. */
  goal: string;
}

export interface Want {
  key: string;
  it: Interactable;
  cost: number;
  hold?: number;
}

/** How much a bot likes each gun. The Thumper is at the bottom: it would blow itself up. (Two shells and a reload suit a bot badly: the Coachman is under the SMGs.) */
export const RANK: Readonly<Record<string, number>> = {
  thumper: -0.5, warden: 0, pike: 1, farrow: 2, coachman: 2.5, stitch: 3, dockhand: 3, brakeman: 4, longwatch: 4, kestrel: 5, ferrier: 6, halberd: 7, gravewell: 9, arclight: 10,
};
const CACHE_GUN = 6;
/** Points to have in hand before gambling on the Cache: the roll, and something left for ammunition. */
const CACHE_SPARE = 3000;
export const base = (id: string): number => RANK[id] ?? 0;
/** An empty gun is worth nothing, whatever it is. */
export const rank = (w: WeaponState): number => (w.mag + w.reserve <= 0 ? -1 : base(w.id) + (w.upgraded ? 10 : 0));
/** In the order they are wanted: a thicker skin, then what kills faster, then the rest. */
const TONICS = ['ironhide', 'hair_trigger', 'quickhands', 'second_wind'];
/** The Forge is down a dead end: this few zombies about, or it waits. Once on the way there, more are put up with. */
const QUIET = 12;
const QUIET_COMMITTED = 24;

/**
 * Buy ammunition when the reserve is under this share of full. A refill costs the same however
 * much it puts back, so with the wall a step away we run nearly dry first; a long walk off we
 * leave while there is still enough to fight our way there.
 */
const AMMO_LOW = 0.35;
const AMMO_HANDY = 0.1;
/** A gun off the nearest wall has to be at least this good to be worth taking in a hurry. */
const RESUPPLY_RANK = 3;

/** `guns`: the wall guns this bot is after, worst first. `about`: zombies it knows of. `handy`: is this a short walk away? `after`: what it is on its way to now. */
export function listWants(v: BotView, things: ReadonlyMap<string, Interactable>, guns: readonly string[], about: number, handy: (it: Interactable) => boolean = () => false, after = '', forgeCost = FORGE_COST): Want[] {
    const list: Want[] = [];
    const thing = (id: string): Interactable | undefined => things.get(id);
    const slots = weaponSlotsWith(v.perks);
    let worst = 0;
    v.weapons.forEach((w, i) => (worst = rank(w) < rank(v.weapons[worst]!) ? i : worst));
    // Ammunition for what we carry.
    for (const w of v.weapons) {
      const def = weaponDef(w.id);
      const it = thing(`wb_${w.id}`);
      const stats = weaponStats(w.id, w.upgraded);
      if (def && stats && it && def.cost !== undefined && w.reserve < stats.reserve * (handy(it) ? AMMO_HANDY : AMMO_LOW)) list.push({ key: `ammo:${w.id}`, it, cost: ammoCost(def, w.upgraded) });
    }
    // The next gun worth having.
    let later: Want | null = null;
    for (const id of guns) {
      const it = thing(`wb_${id}`);
      const def = weaponDef(id);
      if (!it || !def || v.weapons.some((w) => w.id === id) || v.forge.weapon === id) continue;
      const full = v.weapons.length >= slots;
      if (full && (RANK[id] ?? 0) <= rank(v.weapons[worst]!)) continue;
      later = { key: `gun:${id}`, it, cost: def.cost ?? 0, hold: full ? worst : undefined };
      break;
    }
    // With something automatic in hand, the lights and a thicker skin come before a better gun.
    const armed = v.weapons.some((w) => base(w.id) >= 3);
    if (later && !armed) {
      list.push(later);
      later = null;
    }
    const power = thing('power');
    if (!v.power && power) list.push({ key: 'power', it: power, cost: 0 });
    if (v.perks.length < MAX_PERKS) {
      for (const id of TONICS) {
        const def = perkDef(id);
        const it = thing(`tonic_${id}`);
        if (!def || !it || v.perks.includes(id) || (perkNeedsPower(def, v.solo) && !v.power)) continue;
        if (id === 'second_wind' && v.solo && v.perks.length === 0) list.unshift({ key: `tonic:${id}`, it, cost: perkCost(def, true) });
        else list.push({ key: `tonic:${id}`, it, cost: perkCost(def, v.solo) });
      }
    }
    if (later) {
      const after = Math.max(list.findIndex((w) => w.key === 'tonic:ironhide'), list.findIndex((w) => w.key === 'power'));
      list.splice(after < 0 ? list.length : after + 1, 0, later);
    }
    // A roll of the Cache, once the wall guns are behind us (or one of ours has run dry for good).
    const site = thing(v.cache.home);
    let busy = false;
    for (const b of v.cache.boxes) busy ||= b.site === v.cache.home;
    const low = v.weapons[worst]!;
    if (site && !busy && v.weapons.length >= slots && v.points >= CACHE_COST + CACHE_SPARE && (rank(low) < 0 || base(low.id) < CACHE_GUN)) {
      list.push({ key: 'cache', it: site, cost: CACHE_COST });
    }
    const forge = thing('forge');
    // The Forge is down a dead end: a trip for a quiet moment, not for the middle of a horde.
    if (v.power && forge && v.forge.phase === 'idle' && about <= (after === 'forge' ? QUIET_COMMITTED : QUIET)) {
      let pick = -1;
      v.weapons.forEach((w, i) => {
        if (!w.upgraded && w.id !== 'warden' && (pick < 0 || rank(w) > rank(v.weapons[pick]!))) pick = i;
      });
      // After the first tonic, so a team does not queue at the Forge with nothing else.
      if (pick >= 0) list.splice(Math.min(list.length, v.perks.length ? 0 : list.length), 0, { key: 'forge', it: forge, cost: forgeCost, hold: pick });
    }
    return list;
}

/**
 * The gun we rely on is spent: ammunition for what we carry and every gun on a wall worth carrying
 * (the mind takes the nearest it can pay for; a walk across the station with an empty gun is how teams end).
 */
export function listResupply(v: BotView, things: ReadonlyMap<string, Interactable>): Want[] {
  const list: Want[] = [];
  const full = v.weapons.length >= weaponSlotsWith(v.perks);
  let worst = 0;
  v.weapons.forEach((w, i) => (worst = rank(w) < rank(v.weapons[worst]!) ? i : worst));
  for (const it of things.values()) {
    if (it.kind !== 'wallbuy' || !it.ref) continue;
    const def = weaponDef(it.ref);
    if (!def || def.cost === undefined) continue;
    const held = v.weapons.find((w) => w.id === it.ref);
    if (held) list.push({ key: `ammo:${it.ref}`, it, cost: ammoCost(def, held.upgraded) });
    else if (v.forge.weapon !== it.ref && base(it.ref) >= RESUPPLY_RANK) list.push({ key: `gun:${it.ref}`, it, cost: def.cost, hold: full ? worst : undefined });
  }
  return list;
}
