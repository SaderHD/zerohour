import { describe, expect, it } from 'vitest';
import { SNAPSHOT_BUDGET_BYTES, TICK_BUDGET_MS } from '@zh/shared';
import { runCampaign } from './campaign';

// Session 14: whole games played by bots on a fake clock (`npm run campaign` goes to round 25 and beyond).

describe('campaign: bots play the real game', () => {
  it('four mortal bots clear eight rounds, shopping as they go', () => {
    const r = runCampaign({ seed: 1, players: 4, rounds: 8 });
    console.log(`[campaign] 8 rounds in ${Math.round(r.seconds)} s of game time; tick ${r.tickMs.toFixed(2)} ms avg; snapshot ${r.snapBytes} bytes; bought ${JSON.stringify(r.purchases)}`);
    expect(r.cleared).toBe(8);
    expect(r.over).toBe(false);
    expect(r.refused).toBe(0);
    // They bought guns, opened the way to the generator hall, threw the switch and drank something.
    expect(r.purchases.weapon).toBeGreaterThanOrEqual(4);
    expect(r.purchases.door).toBeGreaterThanOrEqual(2);
    expect(r.purchases.power).toBe(1);
    expect(r.purchases.perk).toBeGreaterThanOrEqual(1);
    expect(r.rounds.some((o) => o.special)).toBe(true);
    expect(r.worstIdle, r.worstIdleWhat).toBeLessThan(10);
    expect(r.tickMs).toBeLessThan(TICK_BUDGET_MS);
    expect(r.corrections).toBeLessThan(20);
  }, 120_000);

  it('snapshots stay in budget and the game goes on past round 12 in god mode', () => {
    const r = runCampaign({ seed: 3, players: 4, rounds: 13, god: true });
    expect(r.cleared).toBe(13);
    expect(r.peakAlive).toBeGreaterThanOrEqual(24);
    expect(r.snapBytes).toBeLessThan(SNAPSHOT_BUDGET_BYTES);
    expect(r.purchases.forge).toBeGreaterThanOrEqual(1);
    expect(r.worstIdle, r.worstIdleWhat).toBeLessThan(10);
  }, 120_000);

  it('a lone bot gets through the first rounds on Second Wind and a wall gun', () => {
    const r = runCampaign({ seed: 5, players: 1, rounds: 4 });
    expect(r.cleared).toBe(4);
    expect(r.purchases.weapon).toBeGreaterThanOrEqual(1);
  }, 60_000);
});
