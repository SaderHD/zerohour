import { describe, expect, it } from 'vitest';
import { START_POINTS, ZOMBIE_SPEED_RUN, ZombieState, harrowRidge } from '@zh/shared';
import { activeZones } from './spawner';
import { makeGame } from './testkit';

// Session 7: buying doors and debris, what that does to zombie paths and spawning, and the power.

const buy = (t: ReturnType<typeof makeGame>, id: string) => t.send(1, { t: 'interact', id, hold: true });

describe('doors', () => {
  it('a door costs its price, opens for good, and is refused out of reach or without the points', () => {
    const t = makeGame();
    const p = t.game.addPlayer(1, 'Ada');
    t.teleport(1, 29, 26); // middle of the mess hall: too far from the yard door
    buy(t, 'd_mess_yard');
    expect(t.denied).toEqual([{ id: 1, reason: 'range' }]);
    t.teleport(1, 29, 31);
    p.pub.points = 700;
    buy(t, 'd_mess_yard');
    expect(t.denied[1]).toEqual({ id: 1, reason: 'points' });
    expect(t.game.openDoors.size).toBe(0);
    p.pub.points = 800;
    buy(t, 'd_mess_yard');
    t.wait(0.1);
    expect(p.pub.points).toBe(50);
    expect([...t.game.openDoors]).toEqual(['d_mess_yard']);
    expect(t.of('doorOpened')).toEqual([{ e: 'doorOpened', id: 'd_mess_yard', by: 1 }]);
    expect(t.of('purchase')).toEqual([{ e: 'purchase', id: 1, what: 'door', ref: 'd_mess_yard' }]);
    expect(t.of('points').at(-1)).toMatchObject({ delta: -750, reason: 'door' });
    // Paying twice is not possible.
    p.pub.points = 5000;
    buy(t, 'd_mess_yard');
    expect(p.pub.points).toBe(5000);
    expect(t.game.syncFor(1)).toMatchObject({ openDoors: ['d_mess_yard'], power: false });
  });

  it('the player can walk through only once it is open', () => {
    const t = makeGame();
    const p = t.game.addPlayer(1, 'Ada');
    p.pub.points = 2000;
    t.teleport(1, 29, 31.5);
    t.wait(0.5);
    t.move(1, 29, 32.2);
    expect(p.z).toBe(31.5);
    buy(t, 'd_mess_yard');
    t.wait(0.5);
    t.move(1, 29, 32.2);
    expect(p.z).toBe(32.2);
  });

  it('downed players cannot buy, and a window id still means the barricade', () => {
    const t = makeGame();
    const p = t.game.addPlayer(1, 'Ada');
    t.game.addPlayer(2, 'Bo');
    p.pub.points = 2000;
    t.teleport(1, 29, 31);
    t.send(1, { t: 'debug', cmd: 'god', on: false });
    p.hp = 1;
    t.send(2, { t: 'debug', cmd: 'spawnZombies', count: 1, x: 29, z: 30.2, speed: ZOMBIE_SPEED_RUN });
    t.wait(3);
    expect(p.down).not.toBeNull();
    buy(t, 'd_mess_yard');
    expect(t.game.openDoors.size).toBe(0);
    buy(t, 'nonsense');
    expect(p.pub.points).toBeLessThanOrEqual(2000);
  });

  it('opening a door activates the next zone: its windows spawn and zombies path through', () => {
    const t = makeGame();
    const p = t.game.addPlayer(1, 'Ada');
    p.god = true;
    p.pub.points = 5000;
    t.teleport(1, 23.2, 27); // in the mess hall, by the bunkhouse door
    t.wait(0.3);
    expect([...activeZones(t.game)]).toEqual(['mess']);
    buy(t, 'd_mess_bunk');
    expect([...activeZones(t.game)].sort()).toEqual(['bunk', 'mess']);
    // Walk into the bunkhouse, past the beds, and wait at the far end.
    t.teleport(1, 8, 25);
    t.wait(0.5);
    expect([...activeZones(t.game)].sort()).toEqual(['bunk', 'mess']);
    t.send(1, { t: 'debug', cmd: 'spawnZombies', count: 12, interval: 0.2, speed: ZOMBIE_SPEED_RUN });
    let viaMess = 0;
    let viaBunk = 0;
    const reached = new Set<number>();
    t.wait(40, () => {
      for (const z of t.game.zombies.values()) {
        if (z.state !== ZombieState.Chase && z.state !== ZombieState.Attack) continue;
        if (Math.hypot(z.x - p.x, z.z - p.z) < 1.6) reached.add(z.id);
      }
    });
    for (const ev of t.of('zombieSpawn')) {
      const zone = harrowRidge.openings.find((o) => o.kind === 'window' && Math.hypot(o.x - ev.x, o.z - ev.z) < 5)?.zones[0];
      if (zone === 'mess') viaMess++;
      if (zone === 'bunk') viaBunk++;
    }
    expect(viaMess).toBeGreaterThan(0);
    expect(viaBunk).toBeGreaterThan(0);
    // Mess hall zombies had to come through the bought door and round the furniture to get here.
    expect(reached.size).toBeGreaterThanOrEqual(10);
  });

  it('debris is bought like a door', () => {
    const t = makeGame();
    const p = t.game.addPlayer(1, 'Ada');
    p.pub.points = 3000;
    t.game.openDoor('d_mess_bunk', 1);
    t.teleport(1, 11, 19);
    buy(t, 'd_bunk_lab');
    expect(t.game.openDoors.has('d_bunk_lab')).toBe(true);
    expect(p.pub.points).toBe(2000);
    expect(harrowRidge.openings.find((o) => o.id === 'd_bunk_lab')?.style).toBe('debris');
  });
});

describe('power', () => {
  it('power doors cannot be bought; switching the power on opens them, once', () => {
    const t = makeGame();
    const p = t.game.addPlayer(1, 'Ada');
    p.pub.points = START_POINTS;
    for (const o of harrowRidge.openings) if (o.kind === 'door' && !o.needsPower) t.game.openDoor(o.id, 1);
    t.teleport(1, 35, 58);
    buy(t, 'd_vault');
    expect(t.denied).toEqual([{ id: 1, reason: 'power' }]);
    expect(t.game.openDoors.has('d_vault')).toBe(false);
    t.send(1, { t: 'debug', cmd: 'powerOn' });
    t.send(1, { t: 'debug', cmd: 'powerOn' });
    t.wait(0.1);
    expect(t.of('powerOn')).toEqual([{ e: 'powerOn', by: 1 }]);
    expect(t.game.openDoors.has('d_vault')).toBe(true);
    expect(t.game.syncFor(1)).toMatchObject({ power: true });
    expect(p.pub.points).toBe(START_POINTS);
  });
});
