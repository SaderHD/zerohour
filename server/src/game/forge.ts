import { FORGE_COLLECT_SECONDS, FORGE_COST, FORGE_SECONDS, weaponDef, type ForgeState } from '@zh/shared';
import { giveWeapon } from './combat';
import { award } from './economy';
import type { Game, PlayerState } from './Game';
import type { Deny } from './perks';

// The Forge (PLAN 4.8): hand over the weapon you are holding and 5,000 points; three seconds later
// its upgraded form waits in the cradle for you, and only you, for a quarter of a minute.

export const createForge = (): ForgeState => ({ phase: 'idle' });

function set(g: Game, next: ForgeState): void {
  g.forge = next;
  g.emit({ e: 'forge', state: next });
}

/** F at the Forge: start an upgrade, or take the finished weapon. */
export function useForge(g: Game, p: PlayerState, deny: Deny): void {
  const f = g.forge;
  if (!g.power) return deny('power');
  if (f.phase === 'offering') {
    if (f.by !== p.pub.id || !f.weapon) return deny('busy');
    giveWeapon(g, p, f.weapon, true);
    return set(g, { phase: 'idle' });
  }
  if (f.phase !== 'idle') return deny('busy');
  const w = p.pub.weapons[p.pub.slot];
  if (!w || !weaponDef(w.id)) return deny('invalid');
  if (w.upgraded) return deny('upgraded');
  if (p.pub.points < FORGE_COST) return deny('points');
  award(g, p, -FORGE_COST, 'forge');
  p.reloadUntil = 0;
  p.pub.weapons.splice(p.pub.slot, 1);
  p.pub.slot = Math.max(0, Math.min(p.pub.slot, p.pub.weapons.length - 1));
  g.emit({ e: 'player', player: p.pub });
  g.emit({ e: 'purchase', id: p.pub.id, what: 'forge', ref: w.id });
  set(g, { phase: 'working', by: p.pub.id, weapon: w.id, until: g.time + FORGE_SECONDS });
}

export function updateForge(g: Game): void {
  const f = g.forge;
  if (f.phase === 'idle' || g.time < (f.until ?? 0)) return;
  // Done working: the weapon waits. Left waiting too long: it is gone.
  if (f.phase === 'working') set(g, { ...f, phase: 'offering', until: g.time + FORGE_COLLECT_SECONDS });
  else set(g, { phase: 'idle' });
}
