import { describe, expect, it } from 'vitest';
import {
  CACHE_CLEARANCE_COST, CACHE_COST, CACHE_JINX_MAX_USES, CACHE_JINX_MIN_USES, CACHE_JINX_SECONDS, CACHE_MOVE_SECONDS, CACHE_OFFER_SECONDS,
  CACHE_ROLL_SECONDS, MAX_TACTICALS, POWERUP_DURATION, SIREN, rollCache,
} from '@zh/shared';
import { wondersOut } from './cache';
import { applyPowerup } from './powerups';
import { makeGame } from './testkit';

// Session 11: the Cache (PLAN 4.7).

const YARD = 'cache_yard';
/** Where to stand for each site. */
const AT: Record<string, [number, number]> = { cache_yard: [22, 37], cache_bunk: [12.5, 29] };
const press = (t: ReturnType<typeof makeGame>, id = YARD, who = 1) => t.send(who, { t: 'interact', id, hold: true });

function setup(points = 20_000) {
  const t = makeGame();
  const p = t.game.addPlayer(1, 'Ada');
  p.pub.points = points;
  p.god = true;
  t.teleport(1, ...AT[YARD]!);
  const box = (site = YARD) => t.game.cache.boxes.get(site)?.state ?? { site, phase: 'idle' as const };
  const force = (weapon?: string, jinx = false) => t.send(1, { t: 'debug', cmd: 'cache', weapon, jinx });
  return { t, p, box, force };
}

describe('the Cache', () => {
  it('starts in the yard and sells a roll for 950', () => {
    const { t, p, box } = setup(CACHE_COST - 10);
    expect(t.game.cache.home).toBe(YARD);
    press(t);
    expect(t.denied).toEqual([{ id: 1, reason: 'points' }]);
    p.pub.points = CACHE_COST;
    press(t);
    expect(p.pub.points).toBe(0);
    expect(box()).toMatchObject({ phase: 'rolling', by: 1 });
    expect(box().weapon).toBeUndefined(); // nobody is told what is coming
    press(t);
    expect(t.denied.at(-1)).toEqual({ id: 1, reason: 'busy' });
    t.wait(0.1);
    expect(t.of('purchase')).toEqual([{ e: 'purchase', id: 1, what: 'cache', ref: YARD }]);
  });

  it('offers what it rolled to the buyer alone, for ten seconds', () => {
    const { t, p, box, force } = setup();
    const q = t.game.addPlayer(2, 'Bo');
    t.teleport(2, ...AT[YARD]!);
    force('halberd');
    press(t);
    t.wait(CACHE_ROLL_SECONDS - 0.2);
    expect(box().phase).toBe('rolling');
    t.wait(0.3);
    expect(box()).toMatchObject({ phase: 'offering', by: 1, weapon: 'halberd' });
    press(t, YARD, 2);
    expect(t.denied.at(-1)).toEqual({ id: 2, reason: 'busy' });
    expect(q.pub.weapons).toHaveLength(1);
    press(t);
    expect(p.pub.weapons.map((w) => w.id)).toEqual(['warden', 'halberd']);
    expect(box().phase).toBe('idle');
    // Left alone, the offer lapses.
    force('longwatch');
    press(t);
    t.wait(CACHE_ROLL_SECONDS + CACHE_OFFER_SECONDS - 0.2);
    expect(box().phase).toBe('offering');
    t.wait(0.4);
    expect(box().phase).toBe('idle');
    expect(p.pub.weapons.map((w) => w.id)).toEqual(['warden', 'halberd']);
    expect(t.of('cache').map((e) => e.state.phase)).toEqual(['rolling', 'offering', 'idle', 'rolling', 'offering', 'idle']);
  });

  it('gives a new weapon each time and a set of Sirens for the tactical slot', () => {
    const { t, p, force } = setup();
    force(SIREN);
    press(t);
    t.wait(CACHE_ROLL_SECONDS + 0.1);
    press(t);
    expect(p.pub.tactical).toBe(MAX_TACTICALS);
    expect(p.pub.weapons).toHaveLength(1);
    for (let i = 0; i < 3; i++) {
      t.game.cache.uses = 0; // no Jinx in this test
      const before = p.pub.weapons.map((w) => w.id);
      press(t);
      t.wait(CACHE_ROLL_SECONDS + 0.1);
      const got = t.game.cache.boxes.get(YARD)!.state.weapon!;
      expect(before).not.toContain(got);
      expect(got).not.toBe(SIREN);
      press(t);
      expect(p.pub.weapons.map((w) => w.id)).toContain(got);
    }
  });

  it('is only where it stands', () => {
    const { t, p } = setup();
    t.teleport(1, ...AT.cache_bunk!);
    press(t, 'cache_bunk');
    expect(t.denied).toEqual([{ id: 1, reason: 'invalid' }]);
    press(t, YARD);
    expect(t.denied.at(-1)).toEqual({ id: 1, reason: 'range' });
    expect(p.pub.points).toBe(20_000);
  });

  it('turns up the Jinx after 4 to 8 uses, refunds the roll and moves to another site', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const t = makeGame(seed);
      const p = t.game.addPlayer(1, 'Ada');
      p.pub.points = 20_000;
      t.teleport(1, ...AT[YARD]!);
      let uses = 0;
      for (;;) {
        const before = p.pub.points;
        press(t);
        uses++;
        t.wait(CACHE_ROLL_SECONDS + 0.1);
        const s = t.game.cache.boxes.get(YARD)!.state;
        if (s.phase === 'jinx') {
          expect(p.pub.points).toBe(before); // paid, then refunded
          break;
        }
        expect(s.phase).toBe('offering');
        expect(p.pub.points).toBe(before - CACHE_COST);
        press(t);
        expect(uses).toBeLessThan(CACHE_JINX_MAX_USES);
      }
      expect(uses).toBeGreaterThanOrEqual(CACHE_JINX_MIN_USES);
      expect(t.of('points').at(-1)).toMatchObject({ delta: CACHE_COST, reason: 'refund' });
      t.wait(CACHE_JINX_SECONDS);
      expect(t.game.cache.boxes.get(YARD)!.state.phase).toBe('moving');
      press(t);
      expect(t.denied.at(-1)).toEqual({ id: 1, reason: 'busy' });
      t.wait(CACHE_MOVE_SECONDS + 0.1);
      const home = t.game.cache.home;
      expect(home).not.toBe(YARD);
      expect(t.game.cache.sites).toContain(home);
      expect(t.of('cacheHome')).toEqual([{ e: 'cacheHome', site: home }]);
      expect(t.game.cache.moves).toBe(1);
      press(t);
      expect(t.denied.at(-1)).toEqual({ id: 1, reason: 'invalid' });
    }
  });

  it('keeps to one of each wonder weapon in the game', () => {
    const { t, p, force } = setup();
    expect(wondersOut(t.game)).toEqual([]);
    force('arclight');
    press(t);
    expect(wondersOut(t.game)).toEqual(['arclight']); // spoken for from the moment it is rolled
    t.wait(CACHE_ROLL_SECONDS + 0.1);
    expect(wondersOut(t.game)).toEqual(['arclight']);
    press(t);
    expect(p.pub.weapons.map((w) => w.id)).toContain('arclight');
    const q = t.game.addPlayer(2, 'Bo');
    for (let i = 0; i < 2000; i++) expect(rollCache(t.game.luck, q.pub.weapons.map((w) => w.id), wondersOut(t.game))).not.toBe('arclight');
    // In the Forge, or set aside while its owner is down, it still counts.
    t.game.forge = { phase: 'working', by: 2, weapon: 'gravewell', until: 1e9 };
    expect(wondersOut(t.game).sort()).toEqual(['arclight', 'gravewell']);
    t.game.forge = { phase: 'idle' };
    p.stash = { weapons: p.pub.weapons, slot: 0 };
    p.pub.weapons = [];
    expect(wondersOut(t.game)).toEqual(['arclight']);
    // Gone with the player who had it.
    t.game.removePlayer(1);
    expect(wondersOut(t.game)).toEqual([]);
  });

  it('stands at every site for 10 points during Clearance, and the Jinx stays away', () => {
    const { t, p, box, force } = setup(1000);
    applyPowerup(t.game, 'clearance', 1);
    t.teleport(1, ...AT.cache_bunk!);
    t.game.cache.uses = 100;
    force('ferrier');
    press(t, 'cache_bunk');
    expect(p.pub.points).toBe(1000 - CACHE_CLEARANCE_COST);
    t.wait(CACHE_ROLL_SECONDS + 0.1);
    expect(box('cache_bunk')).toMatchObject({ phase: 'offering', weapon: 'ferrier' });
    // The effect runs out; a roll already made can still be collected, a new one cannot be bought.
    t.wait(POWERUP_DURATION - CACHE_ROLL_SECONDS - CACHE_OFFER_SECONDS + 5);
    force('thumper');
    press(t, 'cache_bunk');
    t.wait(CACHE_ROLL_SECONDS + 5);
    expect(t.game.effectOn('clearance')).toBe(false);
    press(t, 'cache_bunk');
    expect(p.pub.weapons.map((w) => w.id)).toContain('thumper');
    press(t, 'cache_bunk');
    expect(t.denied.at(-1)).toEqual({ id: 1, reason: 'invalid' });
  });
});
