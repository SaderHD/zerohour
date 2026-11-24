import { FLOOR_GAP, INTERACT_RANGE, INTERACT_SLACK, openingDistance } from '@zh/shared';
import { award } from './economy';
import type { Game, PlayerState } from './Game';
import { standing } from './players';

// Purchasable doors and debris (PLAN 4.11, 6.5). Opening one is permanent: it joins the two zones
// for players, zombie paths (Game.openDoor refreshes the flow fields) and the spawner.

/** F pressed at a door. Returns false if `id` is not a door (so the caller can try something else). */
export function buyDoor(g: Game, p: PlayerState, id: string): boolean {
  const o = g.map.openingById(id);
  if (!o || o.kind !== 'door') return false;
  if (g.openDoors.has(id) || !standing(p)) return true;
  const deny = (reason: 'points' | 'power' | 'range') => void g.emitTo(p.pub.id, { e: 'denied', reason });
  if (openingDistance(o, p.x, p.z) > INTERACT_RANGE + INTERACT_SLACK || Math.abs(p.y - g.map.openingHeight(o)) >= FLOOR_GAP) return deny('range'), true;
  if (o.needsPower) return deny('power'), true; // these open by themselves when the power comes on
  const cost = o.cost ?? 0;
  if (p.pub.points < cost) return deny('points'), true;
  award(g, p, -cost, 'door');
  g.emit({ e: 'purchase', id: p.pub.id, what: 'door', ref: id });
  g.openDoor(id, p.pub.id);
  return true;
}

/** Throw the master switch: permanent, and the power-locked doors open by themselves. */
export function powerOn(g: Game, by: number): void {
  if (g.power) return;
  g.power = true;
  g.emit({ e: 'powerOn', by });
  for (const o of g.map.def.openings) if (o.kind === 'door' && o.needsPower) g.openDoor(o.id, by);
}
