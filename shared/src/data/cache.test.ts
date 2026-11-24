import { describe, expect, it } from 'vitest';
import { Rng } from '../math/rng';
import { chainTargets } from '../combat';
import { CACHE_TABLE, SIREN, cacheChoices, isWonder, rollCache } from './cache';
import { DropCycle, POWERUP_LIST } from './powerups';
import { WEAPON_LIST } from './weapons';

describe('the Cache table (PLAN 4.7)', () => {
  const total = CACHE_TABLE.reduce((n, e) => n + e.weight, 0);

  it('holds every weapon but the starting pistol, and the Siren', () => {
    expect(CACHE_TABLE.map((e) => e.id).sort()).toEqual([...WEAPON_LIST.filter((w) => w.source !== 'start').map((w) => w.id), SIREN].sort());
    expect(CACHE_TABLE.filter((e) => isWonder(e.id)).map((e) => e.id).sort()).toEqual(['arclight', 'gravewell']);
  });

  it('gives each wonder weapon about a 4% chance', () => {
    for (const e of CACHE_TABLE.filter((x) => isWonder(x.id))) {
      expect(e.weight / total).toBeGreaterThan(0.03);
      expect(e.weight / total).toBeLessThan(0.05);
    }
  });

  it('rolls in proportion to the weights', () => {
    const rng = new Rng(11);
    const n = 40_000;
    const seen = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const id = rollCache(rng, [], []);
      seen.set(id, (seen.get(id) ?? 0) + 1);
    }
    for (const e of CACHE_TABLE) expect((seen.get(e.id) ?? 0) / n).toBeCloseTo(e.weight / total, 2);
  });

  it('never gives what the buyer holds, nor a wonder weapon that is already out', () => {
    const rng = new Rng(5);
    const held = ['warden', 'halberd', SIREN];
    for (let i = 0; i < 5000; i++) {
      const id = rollCache(rng, held, ['arclight']);
      expect(held).not.toContain(id);
      expect(id).not.toBe('arclight');
    }
    // With both out there is no wonder weapon left to roll.
    expect(cacheChoices([], ['arclight', 'gravewell']).some((e) => isWonder(e.id))).toBe(false);
    // The other one can still come up.
    expect(cacheChoices([], ['arclight']).map((e) => e.id)).toContain('gravewell');
  });
});

describe('the power-up drop cycle (PLAN 4.10)', () => {
  it('goes through every type once before any repeats', () => {
    const rng = new Rng(3);
    const cycle = new DropCycle();
    for (let round = 0; round < 20; round++) {
      const drawn = POWERUP_LIST.map(() => cycle.next(rng));
      expect([...drawn].sort()).toEqual(POWERUP_LIST.map((p) => p.id).sort());
    }
  });

  it('leaves out a type that is not allowed when the cycle starts', () => {
    const rng = new Rng(9);
    const cycle = new DropCycle();
    const noClearance = (id: string) => id !== 'clearance';
    const first = Array.from({ length: 5 }, () => cycle.next(rng, noClearance));
    expect(new Set(first).size).toBe(5);
    expect(first).not.toContain('clearance');
    const second = Array.from({ length: 6 }, () => cycle.next(rng));
    expect(second).toContain('clearance');
    expect(new Set(second).size).toBe(6);
  });
});

describe('chain targeting (PLAN 4.5, the Arclight)', () => {
  const at = (id: number, x: number, z = 0, y = 0) => ({ id, x, y, z });

  it('hops to the nearest body not yet struck, up to the limit', () => {
    const row = Array.from({ length: 12 }, (_, i) => at(i, i * 3));
    expect(chainTargets(row[0]!, row, 8, 5).map((t) => t.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    // From the middle it takes the nearer side first and never doubles back over a struck body.
    const mid = chainTargets(row[5]!, [...row, at(99, 16, 1)], 4, 5).map((t) => t.id);
    expect(mid).toEqual([5, 99, 6, 7]);
  });

  it('stops at a gap wider than its reach', () => {
    const list = [at(1, 0), at(2, 4), at(3, 8), at(4, 13.5), at(5, 15)];
    expect(chainTargets(list[0]!, list, 8, 5).map((t) => t.id)).toEqual([1, 2, 3]);
    expect(chainTargets(list[0]!, list, 8, 6).map((t) => t.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('strikes each body once and only jumps where it can reach', () => {
    const list = [at(1, 0), at(2, 1), at(3, 2), at(4, 3)];
    const walled = chainTargets(list[0]!, list, 8, 5, (_from, to) => to.id !== 2);
    expect(walled.map((t) => t.id)).toEqual([1, 3, 4]);
    expect(chainTargets(list[0]!, list, 8, 5)).toHaveLength(4);
    expect(chainTargets(list[0]!, [list[0]!], 8, 5)).toEqual([list[0]]);
  });
});
