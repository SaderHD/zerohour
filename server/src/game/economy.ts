import {
  DOWN_POINTS_PENALTY, POINTS_HEADSHOT, POINTS_HIT, POINTS_KILL, POINTS_MELEE, POINTS_PLANK, POINTS_ROUNDING, POINTS_SPECIAL_KILL,
  plankPointsCap, type HitZone,
} from '@zh/shared';
import type { Zombie } from './entities';
import type { Game, PlayerState } from './Game';

// Points (PLAN 4.2). Every change goes through `award`, which tells the clients why.

/** What Double Up doubles: points earned by fighting and building, not refunds or bonuses. */
const DOUBLED: ReadonlySet<string> = new Set(['hit', 'kill', 'headshot', 'melee', 'plank']);

export function award(g: Game, p: PlayerState, amount: number, reason: string): void {
  if (amount > 0 && DOUBLED.has(reason) && g.effectOn('double')) amount *= 2;
  const total = Math.max(0, p.pub.points + Math.round(amount));
  const delta = total - p.pub.points;
  if (delta === 0) return;
  p.pub.points = total;
  g.emit({ e: 'points', id: p.pub.id, delta, total, reason });
}

/** What a kill is worth: knife, then headshot or body for bullets, a flat rate for blasts and wonder weapons. */
export const killPoints = (zone: HitZone, cause: string): number =>
  cause === 'melee' ? POINTS_MELEE : cause !== 'bullet' ? POINTS_SPECIAL_KILL : zone === 'head' ? POINTS_HEADSHOT : POINTS_KILL;

/** A player's hit landed on a zombie. Target dummies pay nothing. */
export function scoreHit(g: Game, z: Zombie, by: number, zone: HitZone, cause: string, killed: boolean): void {
  const p = g.players.get(by);
  if (!p || z.kind === 'dummy') return;
  if (!killed) return award(g, p, POINTS_HIT, 'hit');
  award(g, p, killPoints(zone, cause), cause === 'melee' ? 'melee' : cause === 'bullet' && zone === 'head' ? 'headshot' : 'kill');
  p.pub.kills++;
  if (cause === 'bullet' && zone === 'head') p.pub.headshots++;
  g.emit({ e: 'player', player: p.pub });
}

/** A plank went back up: paid until the round's cap is reached. */
export function scorePlank(g: Game, p: PlayerState): void {
  if (p.plankPoints + POINTS_PLANK > plankPointsCap(g.rounds.round)) return;
  p.plankPoints += POINTS_PLANK;
  award(g, p, POINTS_PLANK, 'plank');
}

/** Going down costs a share of your points. */
export const downPenalty = (points: number): number => Math.round((points * DOWN_POINTS_PENALTY) / POINTS_ROUNDING) * POINTS_ROUNDING;
