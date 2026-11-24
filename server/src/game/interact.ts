import { DIR_VEC, FLOOR_GAP, INTERACT_RANGE, INTERACT_SLACK, ammoCost, weaponDef, weaponStats, type ClientMsg, type Interactable } from '@zh/shared';
import { onInteract as onBarricade } from './barricades';
import { useCache } from './cache';
import { giveWeapon } from './combat';
import { buyDoor, powerOn } from './doors';
import { award } from './economy';
import { useForge } from './forge';
import type { Game, PlayerState } from './Game';
import { buyTonic, type Deny } from './perks';
import { standing } from './players';

// The one path every F press takes (PLAN 6.5): a door, something on the map's list of
// interactables (wall buy, tonic, master switch, Forge, Cache), or else the barricade being rebuilt.
// Each is checked here for reach and by its own code for cost, power and state.

/** A weapon on the wall: the gun itself, or ammunition for it if you already carry one. */
function wallBuy(g: Game, p: PlayerState, it: Interactable, deny: Deny): void {
  const def = it.ref ? weaponDef(it.ref) : undefined;
  if (!def || def.cost === undefined) return deny('invalid');
  const held = p.pub.weapons.find((w) => w.id === def.id);
  if (!held) {
    if (p.pub.points < def.cost) return deny('points');
    award(g, p, -def.cost, 'weapon');
    giveWeapon(g, p, def.id);
    g.emit({ e: 'purchase', id: p.pub.id, what: 'weapon', ref: def.id });
    return;
  }
  const stats = weaponStats(held.id, held.upgraded)!;
  if (held.reserve >= stats.reserve) return deny('full');
  const cost = ammoCost(def, held.upgraded);
  if (p.pub.points < cost) return deny('points');
  award(g, p, -cost, 'ammo');
  held.reserve = stats.reserve;
  g.emit({ e: 'player', player: p.pub });
  g.emit({ e: 'purchase', id: p.pub.id, what: 'ammo', ref: def.id });
}

export function onInteract(g: Game, p: PlayerState, m: Extract<ClientMsg, { t: 'interact' }>): void {
  if (m.hold === true && typeof m.id === 'string') {
    if (buyDoor(g, p, m.id)) return;
    const it = g.interactables.get(m.id);
    if (it) {
      if (!standing(p)) return;
      const deny: Deny = (reason) => g.emitTo(p.pub.id, { e: 'denied', reason });
      // In reach, and on the side it faces (not through the wall it hangs on).
      const front = (p.x - it.x) * DIR_VEC[it.facing].x + (p.z - it.z) * DIR_VEC[it.facing].z;
      if (Math.hypot(p.x - it.x, p.z - it.z) > INTERACT_RANGE + INTERACT_SLACK || front < -0.1 || Math.abs(p.y - g.map.mountHeight(it)) >= FLOOR_GAP) return deny('range');
      if (it.kind === 'wallbuy') return wallBuy(g, p, it, deny);
      if (it.kind === 'tonic') return buyTonic(g, p, it, deny);
      if (it.kind === 'forge') return useForge(g, p, deny);
      if (it.kind === 'powerSwitch') return g.power ? undefined : powerOn(g, p.pub.id);
      if (it.kind === 'cacheSite') return useCache(g, p, it, deny);
      return;
    }
  }
  onBarricade(g, p, m);
}
