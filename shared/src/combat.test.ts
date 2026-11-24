import { describe, expect, it } from 'vitest';
import { explosionDamage, falloffAt, fireInterval, hitDamage, maxHitsPerShot, aimDir } from './combat';
import { LIMB_MULT } from './constants';
import { START_WEAPON, WEAPON_LIST, weaponDef } from './data/weapons';
import { compileMap } from './map/compile';
import { harrowRidge } from './map/harrowRidge';
import { rayWorld } from './nav/ray';

const warden = weaponDef('warden')!;
const pike = weaponDef('pike')!;

describe('weapon data', () => {
  it('has sane stats for every weapon', () => {
    expect(weaponDef(START_WEAPON)).toBeDefined();
    expect(new Set(WEAPON_LIST.map((w) => w.id)).size).toBe(WEAPON_LIST.length);
    for (const w of WEAPON_LIST) {
      expect(w.damage, w.id).toBeGreaterThan(0);
      expect(w.rpm, w.id).toBeGreaterThan(0);
      expect(w.magSize, w.id).toBeGreaterThan(0);
      expect(w.spreadAim, w.id).toBeLessThanOrEqual(w.spreadHip);
      expect(w.falloffStart, w.id).toBeLessThanOrEqual(w.range);
      expect(w.falloff, w.id).toBeGreaterThan(0);
      expect(w.falloff, w.id).toBeLessThanOrEqual(1);
      if (w.source === 'wall') expect(w.cost, w.id).toBeGreaterThan(0);
    }
  });
});

describe('damage', () => {
  it('applies zone multipliers', () => {
    expect(hitDamage(warden, 'torso', 2)).toBe(warden.damage);
    expect(hitDamage(warden, 'head', 2)).toBe(Math.round(warden.damage * warden.headMult));
    expect(hitDamage(warden, 'limb', 2)).toBe(Math.round(warden.damage * LIMB_MULT));
  });

  it('falls off linearly between falloffStart and range, and is zero beyond range', () => {
    expect(falloffAt(warden, warden.falloffStart)).toBe(1);
    expect(falloffAt(warden, warden.range)).toBeCloseTo(warden.falloff);
    const mid = (warden.falloffStart + warden.range) / 2;
    expect(falloffAt(warden, mid)).toBeCloseTo((1 + warden.falloff) / 2);
    expect(hitDamage(warden, 'torso', warden.range + 0.1)).toBe(0);
    expect(hitDamage(pike, 'torso', pike.range)).toBe(Math.round(pike.damage * pike.falloff));
  });

  it('derives fire interval and hit caps from the stats', () => {
    expect(fireInterval(warden)).toBeCloseTo(0.15);
    expect(fireInterval(warden, 4 / 3)).toBeCloseTo(0.1125);
    expect(maxHitsPerShot(pike)).toBe(8);
    expect(maxHitsPerShot(weaponDef('longwatch')!)).toBe(4);
  });

  it('scales explosions with distance', () => {
    expect(explosionDamage(600, 5, 0)).toBe(600);
    expect(explosionDamage(600, 5, 5)).toBe(0);
    expect(explosionDamage(600, 5, 2.5)).toBe(375);
  });
});

describe('aim and world rays', () => {
  const map = compileMap(harrowRidge);
  it('yaw 0 looks north and positive pitch looks up', () => {
    const [x, y, z] = aimDir(0, 0);
    expect(Math.abs(x) + Math.abs(y)).toBeCloseTo(0);
    expect(z).toBeCloseTo(-1);
    expect(aimDir(0, 0.5)[1]).toBeGreaterThan(0);
    expect(aimDir(Math.PI / 2, 0)[0]).toBeCloseTo(-1); // positive yaw turns left (west)
  });

  it('hits the mess hall north wall, floor and ceiling', () => {
    // Spawn is (28, 26); the north wall is at z = 22.
    expect(rayWorld(map, undefined, 28, 1.6, 26, 0, 0, -1, 100)).toBeCloseTo(4);
    const d = Math.SQRT1_2;
    expect(rayWorld(map, undefined, 28, 1.6, 26, 0, -d, -d, 100)).toBeCloseTo(1.6 / d);
    const up = rayWorld(map, undefined, 28, 1.6, 26, 0, 1, 0, 100);
    expect(up).toBeGreaterThan(0.5);
    expect(up).toBeLessThan(6);
    expect(rayWorld(map, undefined, 28, 1.6, 26, 0, 0, -1, 2)).toBe(2);
  });

  it('is stopped by a closed door and passes an open one', () => {
    const closed = rayWorld(map, undefined, 29, 1.2, 30, 0, 0, 1, 100);
    const open = rayWorld(map, 'all', 29, 1.2, 30, 0, 0, 1, 100);
    expect(open).toBeGreaterThan(closed + 1);
  });
});
