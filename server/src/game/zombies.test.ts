import { describe, expect, it } from 'vitest';
import {
  BARRICADE_PLANKS, CRAWLER_DAMAGE, CRAWLER_SPEED, GRENADE_FUSE, PLANK_REBUILD_SECONDS, PLANK_TEAR_SECONDS, PLAYER_MAX_HP,
  PLAYER_REGEN_DELAY, ZOMBIE_DAMAGE, ZOMBIE_SPEED_RUN, ZOMBIE_SPEED_WALK, ZombieState, mapWindows,
} from '@zh/shared';
import { gameMap } from './Game';
import { activeZones, maxAlive, zombieCount } from './spawner';
import { makeGame } from './testkit';
import { spawnZombie } from './zombies';

const win = (id: string) => mapWindows(gameMap()).find((w) => w.id === id)!;
const north = win('w_mess_n1'); // centre (26.75, 21.75), opens north of the mess hall

describe('zombie life cycle', () => {
  it('walks to its window, tears every plank, climbs in, chases and hits the player', () => {
    const t = makeGame();
    const p = t.game.addPlayer(1, 'Ada'); // (28, 26)
    const z = spawnZombie(t.game, north, north.spawnX, 0, north.spawnZ, 150, ZOMBIE_SPEED_WALK);
    expect(z.state).toBe(ZombieState.Approach);
    t.wait(2);
    expect(z.state).toBe(ZombieState.Tear);
    expect([z.x, z.z]).toEqual([north.outX, north.outZ]);
    const b = t.game.barricades.get(north.id)!;
    let tearing = 0;
    while (b.planks > 0 && tearing < 20) t.wait((tearing += 0.1) && 0.1);
    expect(tearing).toBeGreaterThan((BARRICADE_PLANKS - 1) * PLANK_TEAR_SECONDS);
    expect(tearing).toBeLessThan(BARRICADE_PLANKS * PLANK_TEAR_SECONDS + 0.2);
    t.wait(0.1);
    expect(t.of('barricade').map((ev) => ev.planks)).toEqual([5, 4, 3, 2, 1, 0]);
    expect(z.state).toBe(ZombieState.Vault);
    t.wait(1.2);
    expect(z.state).toBe(ZombieState.Chase);
    expect(t.game.map.zoneAt(z.x, 0, z.z)).toBe('mess');
    t.wait(3);
    expect(Math.hypot(z.x - p.x, z.z - p.z)).toBeLessThan(1.05);
    expect(t.of('playerHurt').length).toBeGreaterThan(0);
    expect(t.of('playerHurt')[0]).toMatchObject({ id: 1, hp: PLAYER_MAX_HP - ZOMBIE_DAMAGE });
  });

  it('a swing misses a player who steps back in time', () => {
    const t = makeGame();
    const p = t.game.addPlayer(1, 'Ada');
    const z = spawnZombie(t.game, null, p.x, 0, p.z - 3, 150, ZOMBIE_SPEED_WALK);
    t.wait(5, () => {
      if (z.state === ZombieState.Attack) t.teleport(1, 28, 30);
      else if (Math.hypot(z.x - p.x, z.z - p.z) > 4) t.teleport(1, z.x, z.z + 0.9);
    });
    expect(t.of('playerHurt')).toHaveLength(0);
    expect(p.hp).toBe(PLAYER_MAX_HP);
  });

  it('two hits kill; health regenerates after a quiet spell; god mode ignores damage', () => {
    const t = makeGame();
    const p = t.game.addPlayer(1, 'Ada');
    const z = spawnZombie(t.game, null, p.x, 0, p.z - 1.5, 150, ZOMBIE_SPEED_RUN);
    t.wait(1);
    expect(p.hp).toBe(PLAYER_MAX_HP - ZOMBIE_DAMAGE);
    t.game.zombies.delete(z.id);
    t.wait(PLAYER_REGEN_DELAY - 1.2);
    expect(p.hp).toBe(PLAYER_MAX_HP - ZOMBIE_DAMAGE);
    t.wait(2);
    expect(p.hp).toBe(PLAYER_MAX_HP);
    expect(t.snaps.at(-1)!.players[0]![6]).toBe(PLAYER_MAX_HP);

    t.send(1, { t: 'debug', cmd: 'god', on: true });
    t.teleport(1, 33, 30);
    spawnZombie(t.game, null, 33, 0, 28.5, 150, ZOMBIE_SPEED_RUN);
    const hurts = t.of('playerHurt').length;
    t.wait(6);
    expect(t.of('playerHurt')).toHaveLength(hurts);
  });

  it('zombies keep apart instead of stacking', () => {
    const t = makeGame();
    const p = t.game.addPlayer(1, 'Ada');
    t.send(1, { t: 'debug', cmd: 'god', on: true });
    for (let i = 0; i < 12; i++) spawnZombie(t.game, null, p.x + 5, 0, p.z + (i % 3) * 0.01, 150, ZOMBIE_SPEED_WALK);
    t.wait(8);
    const zs = [...t.game.zombies.values()];
    let closest = Infinity;
    for (const a of zs) for (const b of zs) if (a.id < b.id) closest = Math.min(closest, Math.hypot(a.x - b.x, a.z - b.z));
    expect(closest).toBeGreaterThan(0.3);
    expect(zs.filter((z) => z.state === ZombieState.Attack).length).toBeGreaterThan(1);
  });

  it('a blast that does not kill leaves a crawler: slow, low, weaker', () => {
    const t = makeGame();
    const p = t.game.addPlayer(1, 'Ada');
    t.send(1, { t: 'debug', cmd: 'god', on: true });
    const z = spawnZombie(t.game, null, p.x, 0, p.z - 3.5, 5000, 0.01);
    t.send(1, { t: 'throw', kind: 'frag', yaw: 0, pitch: -0.9 });
    t.wait(GRENADE_FUSE + 0.2);
    expect(t.of('explosion')).toHaveLength(1);
    expect(z.hp).toBeLessThan(5000);
    expect(z.ai!.crawler).toBe(false); // 600 at most is under 30% of 5000
    z.hp = z.maxHp = 1000;
    t.send(1, { t: 'throw', kind: 'frag', yaw: 0, pitch: -0.9 });
    t.wait(GRENADE_FUSE + 0.2);
    expect(z.ai!.crawler).toBe(true);
    expect(z.speed).toBe(CRAWLER_SPEED);
    expect([ZombieState.Crawl, ZombieState.CrawlAttack]).toContain(z.state);
    p.god = false;
    t.wait(6);
    expect(t.of('playerHurt')[0]!.hp).toBe(PLAYER_MAX_HP - CRAWLER_DAMAGE);
  });

  it('explosions hurt players too', () => {
    const t = makeGame();
    const p = t.game.addPlayer(1, 'Ada');
    t.send(1, { t: 'throw', kind: 'frag', yaw: 0, pitch: -1.4 });
    t.wait(GRENADE_FUSE + 0.2);
    expect(p.hp).toBeLessThan(PLAYER_MAX_HP);
    expect(p.hp).toBeGreaterThan(0);
  });
});

describe('barricades', () => {
  it('are rebuilt plank by plank while F is held nearby, but not under attack', () => {
    const t = makeGame();
    const p = t.game.addPlayer(1, 'Ada');
    const b = t.game.barricades.get(north.id)!;
    b.planks = 2;
    t.send(1, { t: 'interact', id: north.id, hold: true }); // too far away
    t.wait(PLANK_REBUILD_SECONDS * 2);
    expect(b.planks).toBe(2);
    t.teleport(1, north.inX, north.inZ + 0.5);
    t.send(1, { t: 'interact', id: north.id, hold: true });
    t.wait(PLANK_REBUILD_SECONDS * 2 + 0.1);
    expect(b.planks).toBe(4);
    expect(t.of('barricade').at(-1)).toMatchObject({ id: north.id, planks: 4, by: 1 });
    t.send(1, { t: 'interact', id: north.id, hold: false });
    t.wait(PLANK_REBUILD_SECONDS * 2);
    expect(b.planks).toBe(4);
    // A zombie tearing at it blocks the rebuild.
    p.god = true;
    const z = spawnZombie(t.game, north, north.outX, 0, north.outZ - 0.2, 150, ZOMBIE_SPEED_WALK);
    t.wait(0.5);
    expect(z.state).toBe(ZombieState.Tear);
    t.send(1, { t: 'interact', id: north.id, hold: true });
    t.wait(PLANK_TEAR_SECONDS + 0.1);
    expect(b.planks).toBe(3);
    t.game.zombies.delete(z.id);
    t.wait(PLANK_REBUILD_SECONDS * 3 + 0.4);
    expect(b.planks).toBe(BARRICADE_PLANKS);
    expect(t.game.syncFor(1)).toMatchObject({ barricades: expect.arrayContaining([{ id: north.id, planks: BARRICADE_PLANKS }]) });
  });
});

describe('spawner', () => {
  it('caps the number alive by player count', () => {
    expect([1, 2, 3, 4].map(maxAlive)).toEqual([24, 27, 30, 32]);
  });

  it('only uses windows of zones the players can reach', () => {
    const t = makeGame();
    t.game.addPlayer(1, 'Ada');
    expect([...activeZones(t.game)]).toEqual(['mess']);
    t.send(1, { t: 'debug', cmd: 'god', on: true });
    t.send(1, { t: 'debug', cmd: 'spawnZombies', count: 40, interval: 0.1 });
    t.wait(40);
    expect(zombieCount(t.game)).toBe(24);
    const used = new Set([...t.game.zombies.values()].map((z) => z.ai!.windowId).filter(Boolean));
    for (const id of used) expect(id).toMatch(/^w_mess_/);
    expect(t.of('zombieSpawn')).toHaveLength(24);
    t.game.openDoor('d_mess_yard', 1);
    expect([...activeZones(t.game)].sort()).toEqual(['mess', 'yard']);
    t.send(1, { t: 'debug', cmd: 'killZombies' });
    expect(zombieCount(t.game)).toBe(0);
    expect(t.game.spawnQueue).toHaveLength(0);
  });

  it('zombies ignore disconnected players and nothing spawns for an empty game', () => {
    const t = makeGame();
    t.game.addPlayer(1, 'Ada');
    t.game.setConnected(1, false);
    t.send(1, { t: 'debug', cmd: 'spawnZombies', count: 3, interval: 0.1 });
    t.wait(2);
    expect(zombieCount(t.game)).toBe(0);
  });
});
