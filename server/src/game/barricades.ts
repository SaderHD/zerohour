import { BARRICADE_PLANKS, INTERACT_RANGE, PLANK_REBUILD_SECONDS, mapWindows, type BarricadeState, type ClientMsg, type WindowInfo } from '@zh/shared';
import { scorePlank } from './economy';
import type { Game, PlayerState } from './Game';
import { standing } from './players';

export interface Barricade {
  win: WindowInfo;
  planks: number;
  /** Game time a zombie last worked on it; rebuilding waits until it has been left alone. */
  attackedAt: number;
}

export function createBarricades(g: Game): Map<string, Barricade> {
  return new Map(mapWindows(g.map).map((win) => [win.id, { win, planks: BARRICADE_PLANKS, attackedAt: -1 }]));
}

export const barricadeStates = (g: Game): BarricadeState[] => [...g.barricades.values()].map((b) => ({ id: b.win.id, planks: b.planks }));

export function setPlanks(g: Game, b: Barricade, planks: number, by?: number): void {
  b.planks = Math.max(0, Math.min(BARRICADE_PLANKS, planks));
  g.emit({ e: 'barricade', id: b.win.id, planks: b.planks, by });
}

const inReach = (p: PlayerState, b: Barricade): boolean => Math.hypot(p.x - b.win.inX, p.z - b.win.inZ) <= INTERACT_RANGE;

/** F held or released at a window: start or stop rebuilding it. */
export function onInteract(g: Game, p: PlayerState, m: Extract<ClientMsg, { t: 'interact' }>): void {
  const b = typeof m.id === 'string' ? g.barricades.get(m.id) : undefined;
  if (!b || m.hold !== true || !standing(p) || !inReach(p, b)) {
    p.rebuild = null;
    return;
  }
  if (p.rebuild?.id !== b.win.id) p.rebuild = { id: b.win.id, t: 0 };
}

export function updateBarricades(g: Game, dt: number): void {
  for (const p of g.players.values()) {
    if (!p.rebuild) continue;
    const b = g.barricades.get(p.rebuild.id);
    if (!b || !p.pub.connected || !inReach(p, b) || b.planks >= BARRICADE_PLANKS) {
      p.rebuild = null;
      continue;
    }
    // Not while a zombie is tearing at it or climbing through.
    if (g.time - b.attackedAt < 0.25) {
      p.rebuild.t = 0;
      continue;
    }
    if ((p.rebuild.t += dt) < PLANK_REBUILD_SECONDS) continue;
    p.rebuild.t = 0;
    setPlanks(g, b, b.planks + 1, p.pub.id);
    scorePlank(g, p);
  }
}
