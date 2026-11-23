import {
  MAX_PERKS, SOLO_SELF_REVIVES, WEAPON_SLOTS, maxHpWith, perkCost, perkDef, perkNeedsPower, type Interactable, type PerkId,
} from '@zh/shared';
import { award } from './economy';
import type { Game, PlayerState } from './Game';

// Tonics (PLAN 4.6). What each one does is read where it applies (`maxHpWith`, `reloadMultWith`...
// in shared/src/data/perks.ts); this file is buying them, holding them and losing them.

export type Deny = (reason: 'points' | 'power' | 'limit' | 'busy' | 'range' | 'invalid' | 'owned' | 'full' | 'upgraded') => void;

/** One player in the room: Second Wind is cheap, needs no power and gets them up by itself. */
export function isSolo(g: Game): boolean {
  let n = 0;
  for (const p of g.players.values()) if (p.pub.connected) n++;
  return n <= 1;
}

export const hasPerk = (p: PlayerState, id: PerkId): boolean => p.pub.perks.includes(id);

/** Hand a tonic over (the dispenser after payment, or the debug hook). */
export function givePerk(g: Game, p: PlayerState, id: PerkId): boolean {
  if (!perkDef(id) || hasPerk(p, id)) return false;
  p.pub.perks = [...p.pub.perks, id];
  if (id === 'ironhide') p.hp = maxHpWith(p.pub.perks);
  g.emit({ e: 'player', player: p.pub });
  return true;
}

/** F at a dispenser. */
export function buyTonic(g: Game, p: PlayerState, it: Interactable, deny: Deny): void {
  const def = it.ref ? perkDef(it.ref) : undefined;
  if (!def) return deny('invalid');
  const solo = isSolo(g);
  if (hasPerk(p, def.id)) return deny('owned');
  if (perkNeedsPower(def, solo) && !g.power) return deny('power');
  if (p.pub.perks.length >= MAX_PERKS) return deny('limit');
  if (def.id === 'second_wind' && solo && p.secondWinds >= SOLO_SELF_REVIVES) return deny('limit');
  const cost = perkCost(def, solo);
  if (p.pub.points < cost) return deny('points');
  award(g, p, -cost, 'perk');
  if (def.id === 'second_wind' && solo) p.secondWinds++;
  givePerk(g, p, def.id);
  g.emit({ e: 'purchase', id: p.pub.id, what: 'perk', ref: def.id });
}

/**
 * Going down costs every tonic, and Packmule's extra weapon with it. Returns the tonics that were
 * held, so the caller can tell whether Second Wind was among them.
 */
export function losePerks(p: PlayerState): PerkId[] {
  const had = p.pub.perks;
  p.pub.perks = [];
  if (p.stash && p.stash.weapons.length > WEAPON_SLOTS) {
    p.stash.weapons.length = WEAPON_SLOTS;
    if (p.stash.slot >= WEAPON_SLOTS) p.stash.slot = 0;
  }
  return had;
}
