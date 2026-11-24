import { describe, expect, it } from 'vitest';
import {
  HOWLER_DAMAGE, HOWLER_MIN_DIST, HOWLER_ROUND_MAX_GAP, HOWLER_ROUND_MIN_GAP, HOWLER_SPEED, HOWLER_TELL_SECONDS, INTERMISSION_SECONDS,
  howlerHpForRound, howlersForRound, zombieHpForRound,
} from '@zh/shared';
import { damageZombie, killZombie } from './entities';
import { makeGame } from './testkit';
import { spawnZombie } from './zombies';

// Session 11: Howlers and their round (PLAN 4.3).

describe('howler rounds', () => {
  it('come every five to seven rounds', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const t = makeGame(seed, { rounds: true });
      t.game.addPlayer(1, 'Ada').god = true;
      const special: number[] = [];
      while (t.game.rounds.round < 22) {
        t.wait(0.5);
        if (t.game.rounds.phase !== 'active') continue;
        t.game.spawnQueue.length = 0;
        t.game.arrivals.length = 0;
        for (const z of [...t.game.zombies.values()]) killZombie(t.game, z, undefined, undefined, 'debug');
      }
      for (const e of t.of('roundStart')) if (e.special) special.push(e.round);
      expect(special.length).toBeGreaterThanOrEqual(3);
      let last = 0;
      for (const r of special) {
        expect(r - last).toBeGreaterThanOrEqual(HOWLER_ROUND_MIN_GAP);
        expect(r - last).toBeLessThanOrEqual(HOWLER_ROUND_MAX_GAP);
        last = r;
      }
    }
  });

  it('send 8 x players + 2 x round howlers, inside, each after a lightning strike', () => {
    const t = makeGame(7, { rounds: true });
    const p = t.game.addPlayer(1, 'Ada');
    p.god = true;
    t.send(1, { t: 'debug', cmd: 'setRound', round: 6, special: true });
    t.wait(1.2);
    const start = t.of('roundStart').at(-1)!;
    expect(start).toEqual({ e: 'roundStart', round: 6, special: true, total: howlersForRound(6, 1) });
    expect(start.total).toBe(20);
    expect(t.game.syncFor(1)).toMatchObject({ roundPhase: 'special', zombiesLeft: 20 });
    // The first strike lands at once; the howler follows it.
    expect(t.of('strike')).toHaveLength(1);
    expect(t.game.zombies.size).toBe(0);
    t.wait(HOWLER_TELL_SECONDS);
    const first = [...t.game.zombies.values()][0]!;
    expect(first).toMatchObject({ kind: 'howler', speed: HOWLER_SPEED, maxHp: howlerHpForRound(6) });
    expect(first.maxHp).toBeLessThan(zombieHpForRound(6) / 2);
    const strike = t.of('strike')[0]!;
    expect(t.game.map.zoneAt(strike.x, 0, strike.z)).not.toBeNull();
    expect(Math.hypot(strike.x - p.x, strike.z - p.z)).toBeGreaterThan(HOWLER_MIN_DIST * 0.6);
    expect(t.of('zombieSpawn').at(-1)).toMatchObject({ kind: 'howler', x: strike.x, z: strike.z });

    // Kill them as they come: the last one leaves a Resupply, and the next round is an ordinary one.
    let killed = 0;
    for (let i = 0; i < 2000 && t.game.rounds.phase === 'active'; i++) {
      t.wait(0.1);
      for (const z of [...t.game.zombies.values()]) {
        expect(t.game.powerups.drops.filter((d) => d.kind === 'resupply' && d.x === z.x)).toHaveLength(0);
        damageZombie(t.game, z, z.hp, 1, 'torso', 'bullet');
        killed++;
      }
    }
    expect(killed).toBe(20);
    expect(t.of('strike')).toHaveLength(20);
    expect(t.game.powerups.drops.filter((d) => d.kind === 'resupply')).toHaveLength(1);
    expect(t.of('roundEnd').at(-1)).toEqual({ e: 'roundEnd', round: 6 });
    t.wait(INTERMISSION_SECONDS + 0.5);
    expect(t.of('roundStart').at(-1)).toMatchObject({ round: 7, special: false });
    expect(t.game.rounds.nextSpecial).toBeGreaterThanOrEqual(6 + HOWLER_ROUND_MIN_GAP);
  });

  it('scale with the players', () => {
    expect(howlersForRound(5, 1)).toBe(18);
    expect(howlersForRound(5, 4)).toBe(42);
    expect(howlersForRound(12, 2)).toBe(40);
  });
});

describe('a howler', () => {
  it('runs its target down and bites for 30', () => {
    const t = makeGame();
    const p = t.game.addPlayer(1, 'Ada'); // (28, 26)
    const h = spawnZombie(t.game, null, 28, 0, 30, 50, HOWLER_SPEED, 'howler');
    t.wait(0.6);
    expect(Math.hypot(h.x - p.x, h.z - p.z)).toBeLessThan(2); // 4 m in well under a second
    t.wait(0.9);
    expect(t.of('playerHurt')[0]).toMatchObject({ id: 1, hp: 100 - HOWLER_DAMAGE });
  });

  it('keeps its legs in a blast', () => {
    const t = makeGame();
    t.game.addPlayer(1, 'Ada').god = true;
    const h = spawnZombie(t.game, null, 28, 0, 30, 100_000, HOWLER_SPEED, 'howler');
    t.send(1, { t: 'throw', kind: 'frag', yaw: Math.PI, pitch: 0 });
    t.wait(4);
    expect(h.hp).toBeLessThan(h.maxHp);
    expect(h.ai!.crawler).toBe(false);
    expect(h.speed).toBe(HOWLER_SPEED);
  });
});
