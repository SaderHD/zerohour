import { describe, expect, it } from 'vitest';
import {
  BARRICADE_PLANKS, FIRESTORM_POINTS, MAX_GRENADES, POINTS_HIT, POWERUP_DROP_CHANCE, POWERUP_DURATION, POWERUP_LIFETIME, POWERUP_LIST,
  POWERUP_MAX_PER_ROUND, REBUILD_POINTS, START_POINTS, mapWindows, weaponDef,
} from '@zh/shared';
import { setPlanks } from './barricades';
import { damageZombie } from './entities';
import { dropPowerup } from './powerups';
import { makeGame } from './testkit';
import { spawnZombie } from './zombies';

// Session 11: power-ups (PLAN 4.10).

function setup() {
  const t = makeGame();
  const p = t.game.addPlayer(1, 'Ada'); // (28, 26) in the mess hall
  p.god = true;
  /** Drop one at the player's feet and let them walk into it. */
  const take = (kind: string) => {
    dropPowerup(t.game, kind, p.x, p.z);
    t.wait(0.1);
  };
  /** A zombie standing three metres in front of the player. */
  const zombie = (hp = 150) => spawnZombie(t.game, null, p.x, p.z - 3, hp, 0.001);
  const hit = (id: number, seq: number) => t.send(1, { t: 'fire', seq, slot: 0, yaw: 0, pitch: 0, aim: false, hits: [{ id, zone: 'torso', dist: 3 }] });
  return { t, p, take, zombie, hit };
}

describe('drops', () => {
  it('come from about 2% of kills inside, never from kills outside, and four a round at most', () => {
    const { t } = setup();
    const win = mapWindows(t.game.map)[0]!;
    let drops = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      t.game.powerups.dropped = 0;
      const before = t.game.powerups.drops.length;
      damageZombie(t.game, spawnZombie(t.game, null, 30, 45, 10, 1), 10, 1, 'torso', 'bullet');
      drops += t.game.powerups.drops.length - before;
      damageZombie(t.game, spawnZombie(t.game, win, win.spawnX, win.spawnZ, 10, 1), 10, 1, 'torso', 'bullet');
      expect(t.game.powerups.drops.length - before).toBeLessThanOrEqual(1);
    }
    expect(drops / n).toBeGreaterThan(POWERUP_DROP_CHANCE * 0.6);
    expect(drops / n).toBeLessThan(POWERUP_DROP_CHANCE * 1.5);
    // Every drop was where its zombie fell, and each type came once per cycle (Clearance not yet: the Cache has not moved).
    const kinds = t.game.powerups.drops.map((d) => d.kind);
    expect(t.game.powerups.drops.every((d) => d.x === 30 && d.z === 45)).toBe(true);
    expect(kinds).not.toContain('clearance');
    for (let i = 0; i + 5 <= kinds.length; i += 5) expect(new Set(kinds.slice(i, i + 5)).size).toBe(5);

    // Within one round: no more than four.
    t.game.powerups.drops.length = 0;
    t.game.powerups.dropped = 0;
    for (let i = 0; i < n; i++) damageZombie(t.game, spawnZombie(t.game, null, 30, 45, 10, 1), 10, 1, 'torso', 'bullet');
    expect(t.game.powerups.drops).toHaveLength(POWERUP_MAX_PER_ROUND);
  });

  it('include Clearance once the Cache has moved', () => {
    const { t } = setup();
    t.game.cache.moves = 1;
    const kinds = new Set<string>();
    for (let i = 0; i < 6; i++) kinds.add(t.game.powerups.cycle.next(t.game.luck, (id) => id !== 'clearance' || t.game.cache.moves > 0));
    expect([...kinds].sort()).toEqual(POWERUP_LIST.map((x) => x.id).sort());
  });

  it('float for 30 seconds, then go', () => {
    const { t } = setup();
    const d = dropPowerup(t.game, 'reaper', 30, 45)!;
    expect(t.of('powerupDrop')).toHaveLength(0);
    t.wait(POWERUP_LIFETIME - 0.2);
    expect(t.of('powerupDrop')).toEqual([{ e: 'powerupDrop', drop: d }]);
    expect(t.game.powerups.drops).toHaveLength(1);
    t.wait(0.4);
    expect(t.game.powerups.drops).toHaveLength(0);
    expect(t.of('powerupExpired')).toEqual([{ e: 'powerupExpired', id: d.id }]);
    expect(t.of('powerupTaken')).toHaveLength(0);
  });

  it('are taken by walking into them, by a player on their feet', () => {
    const { t, p } = setup();
    const d = dropPowerup(t.game, 'double', p.x + 3, p.z)!;
    t.wait(0.5);
    expect(t.game.powerups.drops).toHaveLength(1);
    t.move(1, p.x + 2.5, p.z);
    t.wait(0.1);
    expect(t.game.powerups.drops).toHaveLength(0);
    expect(t.of('powerupTaken')).toEqual([{ e: 'powerupTaken', id: d.id, kind: 'double', by: 1, until: expect.closeTo(t.game.time + POWERUP_DURATION, 0) }]);
  });
});

describe('effects', () => {
  it('Resupply fills every reserve and the grenades, for everyone', () => {
    const { t, p, take } = setup();
    const q = t.game.addPlayer(2, 'Bo');
    t.send(2, { t: 'debug', cmd: 'give', weapon: 'stitch' });
    for (const w of [...p.pub.weapons, ...q.pub.weapons]) w.reserve = 1;
    q.pub.weapons[1]!.mag = 3;
    p.pub.grenades = 0;
    take('resupply');
    expect(p.pub.weapons[0]!.reserve).toBe(weaponDef('warden')!.reserve);
    expect(q.pub.weapons.map((w) => w.reserve)).toEqual([weaponDef('warden')!.reserve, weaponDef('stitch')!.reserve]);
    expect(q.pub.weapons[1]!.mag).toBe(3); // reserves only
    expect([p.pub.grenades, q.pub.grenades]).toEqual([MAX_GRENADES, MAX_GRENADES]);
  });

  it('Reaper makes any hit a kill for 30 seconds', () => {
    const { t, take, zombie, hit } = setup();
    const a = zombie(100_000);
    hit(a.id, 1);
    expect(a.hp).toBeGreaterThan(99_000);
    take('reaper');
    expect(t.game.effectOn('reaper')).toBe(true);
    t.wait(1);
    hit(a.id, 2);
    expect(t.game.zombies.has(a.id)).toBe(false);
    t.wait(POWERUP_DURATION);
    expect(t.game.effectOn('reaper')).toBe(false);
    const b = zombie(100_000);
    hit(b.id, 3);
    expect(t.game.zombies.has(b.id)).toBe(true);
  });

  it('Double Up doubles what fighting pays, and nothing else', () => {
    const { t, p, take, zombie, hit } = setup();
    const a = zombie(100_000);
    take('double');
    t.wait(1);
    hit(a.id, 1);
    expect(p.pub.points).toBe(START_POINTS + POINTS_HIT * 2);
    take('rebuild');
    expect(p.pub.points).toBe(START_POINTS + POINTS_HIT * 2 + REBUILD_POINTS);
    t.wait(POWERUP_DURATION);
    hit(a.id, 2);
    expect(p.pub.points).toBe(START_POINTS + POINTS_HIT * 3 + REBUILD_POINTS);
  });

  it('Firestorm kills everything out there and pays each player 400', () => {
    const { t, p, take, zombie } = setup();
    const q = t.game.addPlayer(2, 'Bo');
    for (let i = 0; i < 5; i++) zombie();
    const win = mapWindows(t.game.map)[0]!;
    spawnZombie(t.game, win, win.spawnX, win.spawnZ, 150, 1);
    take('firestorm');
    expect(t.game.zombies.size).toBe(0);
    expect([p.pub.points, q.pub.points]).toEqual([START_POINTS + FIRESTORM_POINTS, START_POINTS + FIRESTORM_POINTS]);
    expect(p.pub.kills).toBe(0);
    expect(t.of('zombieDied').every((e) => e.cause === 'firestorm')).toBe(true);
    expect(t.game.powerups.drops).toHaveLength(0);
  });

  it('Rebuild restores every barricade and pays each player 200', () => {
    const { t, p, take } = setup();
    for (const b of t.game.barricades.values()) setPlanks(t.game, b, 1);
    take('rebuild');
    expect([...t.game.barricades.values()].every((b) => b.planks === BARRICADE_PLANKS)).toBe(true);
    expect(p.pub.points).toBe(START_POINTS + REBUILD_POINTS);
  });

  it('are in the sync a late joiner gets', () => {
    const { t, take } = setup();
    take('double');
    const d = dropPowerup(t.game, 'reaper', 30, 45)!;
    const sync = t.game.syncFor(1);
    if (sync.t !== 'sync') throw new Error('no sync');
    expect(sync.powerups).toEqual([d]);
    expect(sync.activeEffects).toEqual([{ kind: 'double', until: expect.any(Number) }]);
    expect(sync.cache).toEqual({ home: 'cache_yard', boxes: [] });
  });
});
