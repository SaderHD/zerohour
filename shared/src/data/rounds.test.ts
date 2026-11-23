import { describe, expect, it } from 'vitest';
import { ZOMBIE_SPEED_RUN, ZOMBIE_SPEED_SHAMBLE, ZOMBIE_SPEED_WALK } from '../constants';
import { plankPointsCap, spawnIntervalForRound, speedShares, zombieHpForRound, zombieSpeedForRound, zombiesForRound } from './rounds';

// PLAN 4.3.
describe('round tables', () => {
  it('fits the solo reference counts', () => {
    expect([1, 2, 3, 5, 10, 20].map((r) => zombiesForRound(r))).toEqual([6, 8, 13, 24, 46, 110]);
    for (let r = 1; r < 40; r++) expect(zombiesForRound(r + 1)).toBeGreaterThan(zombiesForRound(r));
  });

  it('scales by half the solo count per extra player', () => {
    expect([1, 2, 3, 4].map((n) => zombiesForRound(1, n))).toEqual([6, 9, 12, 15]);
    expect(zombiesForRound(10, 4)).toBe(115);
  });

  it('health: 150, +100 a round through 9, then x1.1', () => {
    expect([1, 2, 9].map(zombieHpForRound)).toEqual([150, 250, 950]);
    expect(zombieHpForRound(10)).toBe(1045);
    expect(zombieHpForRound(11)).toBe(Math.round(950 * 1.21));
  });

  it('speed mix: shamblers, then walkers from 3, runners from 6, mostly runners by 10', () => {
    expect(speedShares(1)).toEqual({ walk: 0, run: 0 });
    expect(speedShares(2)).toEqual({ walk: 0, run: 0 });
    expect(speedShares(3).walk).toBeGreaterThan(0);
    expect(speedShares(4).walk).toBeGreaterThan(speedShares(3).walk);
    expect(speedShares(5).run).toBe(0);
    expect(speedShares(6).run).toBeGreaterThan(0);
    expect(speedShares(10).run).toBeGreaterThan(0.5);
    for (let r = 1; r <= 30; r++) {
      const { walk, run } = speedShares(r);
      expect(walk).toBeGreaterThanOrEqual(0);
      expect(walk + run).toBeLessThanOrEqual(1 + 1e-9);
    }
    expect(zombieSpeedForRound(1, 0)).toBe(ZOMBIE_SPEED_SHAMBLE);
    expect(zombieSpeedForRound(3, 0.1)).toBe(ZOMBIE_SPEED_WALK);
    expect(zombieSpeedForRound(3, 0.9)).toBe(ZOMBIE_SPEED_SHAMBLE);
    expect(zombieSpeedForRound(10, 0.1)).toBe(ZOMBIE_SPEED_RUN);
    expect(zombieSpeedForRound(10, 0.99)).toBe(ZOMBIE_SPEED_WALK);
  });

  it('spawn interval shrinks from 2 s to 0.25 s', () => {
    expect(spawnIntervalForRound(1)).toBe(2);
    expect(spawnIntervalForRound(5)).toBeLessThan(spawnIntervalForRound(4));
    expect(spawnIntervalForRound(40)).toBe(0.25);
  });

  it('plank points cap is 50 + 50 x round', () => {
    expect([1, 2, 5].map(plankPointsCap)).toEqual([100, 150, 300]);
  });
});
