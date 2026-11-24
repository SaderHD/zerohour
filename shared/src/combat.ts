// Pure combat maths shared by the client (prediction, HUD) and the server (authority).
import { EXPLOSION_MIN_FRAC, LIMB_MULT } from './constants';
import type { WeaponDef } from './data/weapons';
import type { HitZone } from './protocol';

/** Damage multiplier from distance alone. 0 beyond the weapon's range. */
export function falloffAt(def: WeaponDef, dist: number): number {
  if (dist > def.range) return 0;
  if (dist <= def.falloffStart || def.range <= def.falloffStart) return 1;
  const k = (dist - def.falloffStart) / (def.range - def.falloffStart);
  return 1 + (def.falloff - 1) * k;
}

export const zoneMult = (def: WeaponDef, zone: HitZone): number =>
  zone === 'head' ? def.headMult : zone === 'limb' ? LIMB_MULT : 1;

/** Damage of one pellet/bullet. */
export function hitDamage(def: WeaponDef, zone: HitZone, dist: number): number {
  return Math.round(def.damage * falloffAt(def, Math.max(0, dist)) * zoneMult(def, zone));
}

/** Seconds between shots. */
export const fireInterval = (def: WeaponDef, rateMult = 1): number => 60 / (def.rpm * rateMult);

/** Most hit entries one trigger pull can legitimately report. */
export const maxHitsPerShot = (def: WeaponDef): number => def.pellets * (1 + def.pierce);

/** Explosion damage: full at the centre, falling linearly to a fraction at the edge. */
export function explosionDamage(damage: number, radius: number, dist: number): number {
  if (dist >= radius) return 0;
  return Math.round(damage * (1 - (1 - EXPLOSION_MIN_FRAC) * (dist / radius)));
}

/** Unit vector for a yaw/pitch (yaw 0 looks -z, positive pitch looks up). */
export function aimDir(yaw: number, pitch: number): [number, number, number] {
  const c = Math.cos(pitch);
  return [-Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c];
}

/**
 * Who a chaining bolt strikes: `first`, then from each body struck the nearest one not yet struck
 * within `radius` (and `canReach`, if given), up to `max` in all.
 */
export function chainTargets<T extends { x: number; y: number; z: number }>(
  first: T, all: Iterable<T>, max: number, radius: number, canReach?: (from: T, to: T) => boolean,
): T[] {
  const chain = [first];
  const rest = new Set(all);
  rest.delete(first);
  while (chain.length < max) {
    const from = chain[chain.length - 1]!;
    let next: T | undefined;
    let best = radius;
    for (const t of rest) {
      const d = Math.hypot(t.x - from.x, t.y - from.y, t.z - from.z);
      if (d > best || (canReach && !canReach(from, t))) continue;
      best = d;
      next = t;
    }
    if (!next) break;
    rest.delete(next);
    chain.push(next);
  }
  return chain;
}
