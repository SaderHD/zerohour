import {
  CACHE_CLEARANCE_COST, CACHE_COST, CACHE_JINX_MAX_USES, CACHE_JINX_MIN_USES, CACHE_JINX_SECONDS, CACHE_MOVE_SECONDS, CACHE_OFFER_SECONDS,
  CACHE_ROLL_SECONDS, MAX_TACTICALS, SIREN, isWonder, rollCache, weaponDef,
  type CacheState, type Interactable, type PlayerId,
} from '@zh/shared';
import { giveWeapon } from './combat';
import { award } from './economy';
import type { Game, PlayerState } from './Game';
import type { Deny } from './perks';

// The Cache (PLAN 4.7): 950 points for a roll of the table. It stands at one of its sites (`home`)
// until a roll turns up the Jinx, which sends it to another; during Clearance every site has one.

interface Box {
  state: CacheState;
  /** What the roll in progress will show: an item id, or null for the Jinx. Kept from the clients until it lands. */
  result: string | null;
  cost: number;
}

export interface Cache {
  readonly sites: string[];
  home: string;
  /** Sites where something is going on (an idle box has no entry). */
  readonly boxes: Map<string, Box>;
  /** Rolls at this site since it arrived, and the roll that will be the Jinx. */
  uses: number;
  jinxAt: number;
  /** How many times it has moved (Clearance only drops once it has). */
  moves: number;
  /** Debug: what the next roll gives. */
  force: { weapon?: string; jinx?: boolean } | null;
}

const jinxAfter = (g: Game): number => g.luck.int(CACHE_JINX_MIN_USES, CACHE_JINX_MAX_USES);

export function createCache(g: Game): Cache {
  const sites = g.map.def.interactables.filter((i) => i.kind === 'cacheSite').map((i) => i.id);
  return { sites, home: sites[0] ?? '', boxes: new Map(), uses: 0, jinxAt: jinxAfter(g), moves: 0, force: null };
}

export const cacheStates = (g: Game): CacheState[] => [...g.cache.boxes.values()].map((b) => b.state);

/** Is there a Cache to use at this site right now? */
export const cacheAt = (g: Game, site: string): boolean => site === g.cache.home || g.effectOn('clearance');

export const cacheCost = (g: Game): number => (g.effectOn('clearance') ? CACHE_CLEARANCE_COST : CACHE_COST);

function set(g: Game, site: string, box: Box | null): void {
  if (box) g.cache.boxes.set(site, box);
  else g.cache.boxes.delete(site);
  g.emit({ e: 'cache', state: box?.state ?? { site, phase: 'idle' } });
}

/** Wonder weapons somebody already has, or is about to: carried, set aside while downed, in the Forge, in a Cache. */
export function wondersOut(g: Game): string[] {
  const out: string[] = [];
  const note = (id: string | null | undefined): void => void (id && isWonder(id) && out.push(id));
  for (const p of g.players.values()) for (const w of [...p.pub.weapons, ...(p.stash?.weapons ?? [])]) note(w.id);
  note(g.forge.weapon);
  for (const b of g.cache.boxes.values()) note(b.result);
  return out;
}

/** What the roller holds (so the roll gives them something new). */
const heldBy = (p: PlayerState): string[] => [...p.pub.weapons.map((w) => w.id), ...(p.pub.tactical > 0 ? [SIREN] : [])];

/** Hand over what a roll landed on. */
export function giveCacheItem(g: Game, p: PlayerState, id: string): void {
  if (id !== SIREN) return void giveWeapon(g, p, id);
  p.pub.tactical = MAX_TACTICALS;
  g.emit({ e: 'player', player: p.pub });
}

/** F at a Cache site: pay for a roll, or take what your roll landed on. */
export function useCache(g: Game, p: PlayerState, it: Interactable, deny: Deny): void {
  const c = g.cache;
  const box = c.boxes.get(it.id);
  if (box?.state.phase === 'offering') {
    if (box.state.by !== p.pub.id || !box.result) return deny('busy');
    giveCacheItem(g, p, box.result);
    return set(g, it.id, null);
  }
  if (box) return deny('busy');
  if (!cacheAt(g, it.id)) return deny('invalid');
  const cost = cacheCost(g);
  if (p.pub.points < cost) return deny('points');
  award(g, p, -cost, 'cache');
  g.emit({ e: 'purchase', id: p.pub.id, what: 'cache', ref: it.id });
  // The Jinx only ever turns up where the Cache really stands, and only if it has somewhere to go.
  const counted = it.id === c.home && !g.effectOn('clearance') && c.sites.length > 1;
  const jinx = counted && (c.force?.jinx === true || ++c.uses >= c.jinxAt);
  const forced = c.force?.weapon;
  const result = jinx ? null : forced && (forced === SIREN || weaponDef(forced)) ? forced : rollCache(g.rng, heldBy(p), wondersOut(g));
  c.force = null;
  set(g, it.id, { result, cost, state: { site: it.id, phase: 'rolling', by: p.pub.id, until: g.time + CACHE_ROLL_SECONDS } });
}

function refund(g: Game, id: PlayerId | undefined, amount: number): void {
  const p = id === undefined ? undefined : g.players.get(id);
  if (p) award(g, p, amount, 'refund');
}

export function updateCache(g: Game): void {
  const c = g.cache;
  for (const [site, box] of [...c.boxes]) {
    const s = box.state;
    if (g.time < (s.until ?? 0)) continue;
    if (s.phase === 'rolling') {
      if (box.result) set(g, site, { ...box, state: { ...s, phase: 'offering', weapon: box.result, until: g.time + CACHE_OFFER_SECONDS } });
      else {
        refund(g, s.by, box.cost);
        set(g, site, { ...box, state: { site, phase: 'jinx', by: s.by, until: g.time + CACHE_JINX_SECONDS } });
      }
    } else if (s.phase === 'jinx') set(g, site, { ...box, state: { site, phase: 'moving', until: g.time + CACHE_MOVE_SECONDS } });
    else if (s.phase === 'moving') {
      set(g, site, null);
      c.home = g.luck.pick(c.sites.filter((id) => id !== site));
      c.uses = 0;
      c.jinxAt = jinxAfter(g);
      c.moves++;
      g.emit({ e: 'cacheHome', site: c.home });
    } else set(g, site, null); // left waiting too long: the lid shuts on it
  }
}
