import { describe, expect, it } from 'vitest';
import { MAX_ALIVE_CAP, Rng, TICK_BUDGET_MS, TICK_DT, ZOMBIE_SPEED_RUN, ZOMBIE_SPEED_SHAMBLE, ZOMBIE_SPEED_WALK, ZombieState, compileMap, lineOfSight, longestNight, mapWindows, wallFor, type Interactable } from '@zh/shared';
import { BotBrain } from '../botBrain';
import { runCampaign } from './campaign';
import { killZombie } from './entities';
import { activeZones, zombieCount } from './spawner';
import { makeGame } from './testkit';
import { idleFor, spawnZombie } from './zombies';

// The game on The Longest Night's blockout (PLAN section 9, M3 and M4): a map four times the
// station's size, the subway two storeys under its streets and the roofs two storeys over them;
// and (M8) what is bought on it.

const map = compileMap(longestNight);
const start = (seed = 3) => {
  const t = makeGame(seed, { map });
  const p = t.game.addPlayer(1, 'Ada');
  p.god = true;
  for (const o of map.def.openings) if (o.kind === 'door') t.game.openDoor(o.id, 1);
  return { ...t, p };
};

describe('a match on The Longest Night', () => {
  it('spawns players in the diner', () => {
    const t = makeGame(2, { map });
    const p = t.game.addPlayer(1, 'Ada');
    expect(t.game.map.zoneAt(p.x, p.y, p.z)).toBe('diner');
    expect([...activeZones(t.game)]).toEqual(['diner']);
  });

  it('a zombie from the far end of the map finds a player anywhere: down in the signal room, along the avenue, in the chapel', () => {
    for (const [from, x, y, z, within] of [
      ['w_avenue_e', 61, -8, 61, 150], // from the avenue's east end to the signal room, two storeys under the square
      ['w_lane_e', 47, 0, 14, 150], // from the lane's east end to the chapel
      ['w_chapel_w', 110, -8, 36, 120], // from the chapel to the platform's east half
      ['w_diner_w', 118, 0, 36, 120], // from the diner to the far end of the avenue
      ['w_platform_e', 104, 8, 75, 150], // out of the track tunnel, up four storeys to Abelard's roof
      ['w_abelard_roof_w', 36.5, 4, 50, 150], // over Abelard's parapet, down, across the square and up to the Lyric's balcony
      ['w_chapel_e', 68.2, 8, 95, 150], // from the chapel to the middle of the plank bridge
    ] as const) {
      const t = start(5);
      t.teleport(1, x, z, y);
      expect(t.p.y, from).toBe(y);
      const win = mapWindows(map).find((w) => w.id === from)!;
      const zb = spawnZombie(t.game, win, win.spawnX, win.y, win.spawnZ, 150, ZOMBIE_SPEED_RUN);
      let worst = 0;
      let took = 0;
      t.wait(within, () => {
        worst = Math.max(worst, idleFor(t.game, zb));
        if (Math.hypot(zb.x - t.p.x, zb.z - t.p.z) > 2 || zb.y !== y) took += TICK_DT;
      });
      expect(Math.hypot(zb.x - t.p.x, zb.z - t.p.z), from).toBeLessThan(2);
      expect(zb.y, from).toBe(y);
      expect(worst, from).toBeLessThan(8);
      expect(took, from).toBeLessThan(within - 5);
    }
  }, 60_000);

  it('a shot from a roof goes over its parapet from the eye: the square from Abelard\'s roof, but not what stands under the wall, nor the roof from the shop floor', () => {
    const t = start();
    let seq = 0;
    const shoot = (zb: { id: number; x: number; y: number; z: number }) => {
      t.wait(0.5);
      t.game.onMessage(1, { t: 'fire', seq: ++seq, slot: t.p.pub.slot, yaw: 0, pitch: 0, aim: true, hits: [{ id: zb.id, zone: 'torso', dist: Math.hypot(zb.x - t.p.x, zb.y - t.p.y, zb.z - t.p.z) }] });
    };
    // At the west parapet, a metre of wall between us and the square eight metres down.
    t.teleport(1, 97.3, 79, 8);
    expect(t.p.y).toBe(8);
    const far = spawnZombie(t.game, null, 72, 0, 79, 150, 0.01);
    const under = spawnZombie(t.game, null, 93, 0, 79, 150, 0.01);
    // Chest to chest the parapet is in the way; the eye, 40 cm higher, sees over it.
    expect(lineOfSight(map, t.p.x, t.p.y, t.p.z, far.x, far.y, far.z)).toBe(false);
    shoot(far);
    expect(far.hp).toBeLessThan(150);
    shoot(under);
    expect(under.hp).toBe(150);
    // From the shop floor, straight up through two floors: no.
    const high = spawnZombie(t.game, null, 110, 8, 80, 150, 0.01);
    t.teleport(1, 110, 82, 0);
    expect(t.p.y).toBe(0);
    shoot(high);
    expect(high.hp).toBe(150);
  });

  it('the dead come in within a block of somebody: nothing from the far end of a street a hundred metres long', () => {
    // At the avenue's west end, every door open: the avenue's own windows run to its east end, 90 m off.
    const t = start(7);
    t.teleport(1, 24, 36, 0);
    const wins = new Map(mapWindows(map).map((w) => [w.id, w]));
    const offered = [...t.game.barricades.values()].filter((b) => activeZones(t.game).has(b.win.zone));
    expect(Math.max(...offered.map((b) => Math.abs(b.win.x - 24)))).toBeGreaterThan(70);
    t.wait(1); // (the way to where the player now stands is worked out)
    t.game.spawnInterval = 0.1;
    for (let i = 0; i < 24; i++) t.game.spawnQueue.push({ hp: 150, speed: ZOMBIE_SPEED_SHAMBLE });
    const from = new Set<string>();
    t.wait(6, () => {
      for (const z of t.game.zombies.values()) if (z.ai?.windowId) from.add(z.ai.windowId);
    });
    expect(from.size).toBeGreaterThanOrEqual(2);
    for (const id of from) expect(Math.hypot(wins.get(id)!.x - 24, wins.get(id)!.z - 36), id).toBeLessThan(40);
  });

  it('the dead come where the living are: out of the tunnels for someone on the platform, over the parapet for someone on a roof', () => {
    for (const [x, y, z, zones, floor] of [
      [80, -8, 36, ['platform', 'mezz', 'service', 'avenue'], -8],
      [104, 8, 75, ['abelard_roof', 'ten_roof', 'abelard_up'], 8],
    ] as const) {
      const t = start(6);
      t.teleport(1, x, z, y);
      expect(activeZones(t.game)).toEqual(new Set(zones));
      t.game.spawnInterval = 0.1;
      for (let i = 0; i < 12; i++) t.game.spawnQueue.push({ hp: 150, speed: ZOMBIE_SPEED_WALK });
      const floors = new Set<number>();
      t.wait(8, () => {
        for (const zb of t.game.zombies.values()) floors.add(zb.y);
      });
      expect(zombieCount(t.game)).toBeGreaterThan(0);
      expect(floors.has(floor), `spawned on ${[...floors]}`).toBe(true);
    }
  });

  it('a zombie on a ledge over the lane tears its way in over the parapet and is on the roof', () => {
    const t = start(8);
    t.teleport(1, 63, 104, 8);
    const win = mapWindows(map).find((w) => w.id === 'w_ten_roof_n')!;
    const zb = spawnZombie(t.game, win, win.spawnX, win.y, win.spawnZ, 150, ZOMBIE_SPEED_RUN);
    expect(zb.y).toBe(8);
    t.wait(40);
    expect([ZombieState.Approach, ZombieState.Tear, ZombieState.Vault]).not.toContain(zb.state);
    expect(t.game.map.zoneAt(zb.x, zb.y, zb.z)).toBe('ten_roof');
    expect(Math.hypot(zb.x - t.p.x, zb.z - t.p.z)).toBeLessThan(2);
  });
});

describe('buying on The Longest Night (M8)', () => {
  const press = (t: ReturnType<typeof start>, id: string) => t.send(1, { t: 'interact', id, hold: true });
  const shop = () => {
    const t = makeGame(4, { map });
    const p = t.game.addPlayer(1, 'Ada');
    p.pub.points = 20_000;
    return { ...t, p };
  };

  it('sells a gun in the diner, and the Stitch off either of its two boards, each from its own floor', () => {
    const t = shop();
    t.teleport(1, 53.5, 95.6, 0);
    press(t, 'wb_farrow');
    expect(t.p.pub.weapons.map((w) => w.id)).toEqual(['warden', 'farrow']);
    // The platform's board from the street over it: out of reach.
    t.teleport(1, 104, 39.6, 0);
    press(t, 'wb_stitch_platform');
    expect(t.denied.at(-1)).toEqual({ id: 1, reason: 'range' });
    t.teleport(1, 104, 39.2, -8);
    press(t, 'wb_stitch_platform');
    expect(t.p.pub.weapons.map((w) => w.id)).toEqual(['warden', 'stitch']);
    // And ammunition for it off the other, in the tenement.
    t.p.pub.weapons[1]!.reserve = 0;
    t.teleport(1, 58.5, 103.7, 0);
    press(t, 'wb_stitch');
    t.wait(0.1);
    expect(t.of('purchase').at(-1)).toEqual({ e: 'purchase', id: 1, what: 'ammo', ref: 'stitch' });
  });

  it('the switch on Abelard\'s roof opens both ends of the service tunnel, wakes the tonics, and the Forge works two storeys under the square', () => {
    const t = shop();
    t.teleport(1, 41.4, 27.5, 0);
    press(t, 'tonic_ironhide');
    expect(t.denied.at(-1)).toEqual({ id: 1, reason: 'power' });
    t.teleport(1, 59.8, 61.5, -8);
    press(t, 'forge');
    expect(t.denied.at(-1)).toEqual({ id: 1, reason: 'power' });
    t.teleport(1, 100.75, 65.8, 8);
    press(t, 'power');
    expect(t.game.power).toBe(true);
    expect(t.game.openDoors.has('d_service') && t.game.openDoors.has('d_hatch')).toBe(true);
    t.teleport(1, 41.4, 27.5, 0);
    press(t, 'tonic_ironhide');
    t.teleport(1, 36.5, 47.4, 4);
    press(t, 'tonic_packmule');
    expect(t.p.pub.perks).toEqual(['ironhide', 'packmule']);
    t.teleport(1, 59.8, 61.5, -8);
    press(t, 'forge');
    t.wait(0.1);
    expect(t.of('purchase').at(-1)).toMatchObject({ what: 'forge', ref: 'warden' });
  });

  it('the Cache starts in the square and has four other places to go, on four storeys', () => {
    const t = shop();
    expect(t.game.cache.home).toBe('cache_square');
    const sites = map.def.interactables.filter((i) => i.kind === 'cacheSite');
    expect(sites.map((s) => map.mountHeight(s)).sort((a, b) => a - b)).toEqual([-4, 0, 0, 4, 8]);
    t.teleport(1, 67, 84.4, 0);
    press(t, 'cache_square');
    t.wait(0.1);
    expect(t.of('purchase').at(-1)).toMatchObject({ what: 'cache' });
  });

  it('a bot after a Stitch goes to the board nearer it: the tenement\'s from the diner, the platform\'s from the platform', () => {
    const things = new Map(map.def.interactables.map((i) => [i.id, i]));
    const h = (it: Interactable): number => map.mountHeight(it);
    expect(wallFor(things, 'stitch', { x: 47, y: 0, z: 92 }, h)?.id).toBe('wb_stitch');
    expect(wallFor(things, 'stitch', { x: 100, y: -8, z: 36 }, h)?.id).toBe('wb_stitch_platform');
    // (Standing on the avenue right over it, the one a floor away is still the tenement's.)
    expect(wallFor(things, 'kestrel', { x: 47, y: 0, z: 92 }, h)?.id).toBe('wb_kestrel');
  });

  it('four mortal bots leave the diner, light the city and drink: six rounds', () => {
    // (How much a team buys in six rounds goes by the seed: 3 to 7 doors over six of them, a tonic in three.)
    const r = runCampaign({ seed: 4, players: 4, rounds: 6, map: 'longest_night' });
    console.log(`[campaign night] ${r.cleared} rounds in ${Math.round(r.seconds)} s of game time; tick ${r.tickMs.toFixed(2)} ms avg; bought ${JSON.stringify(r.purchases)}`);
    expect(r.cleared).toBe(6);
    expect(r.refused).toBe(0);
    expect(r.purchases.weapon).toBeGreaterThanOrEqual(4);
    expect(r.purchases.door).toBeGreaterThanOrEqual(4);
    expect(r.purchases.power).toBe(1);
    expect(r.purchases.perk).toBeGreaterThanOrEqual(1);
    expect(r.worstIdle, r.worstIdleWhat).toBeLessThan(10);
    expect(r.tickMs).toBeLessThan(TICK_BUDGET_MS);
    expect(r.corrections).toBeLessThan(20);
  }, 120_000);
});

const SPEEDS = [ZOMBIE_SPEED_SHAMBLE, ZOMBIE_SPEED_WALK, ZOMBIE_SPEED_RUN];

describe('soak on The Longest Night: a full horde, 4 bots roaming the streets, the roofs and the subway', () => {
  it('4 minutes with the doors open: nobody gets stuck on a kerb, a flight, a bridge or a train door, and the tick stays in budget', () => {
    const t = makeGame(21, { map });
    const { game } = t;
    // (How many zones four bots wander into in four minutes goes by the seed: 9 to 13 over eight of them.)
    const rng = new Rng(2);
    const bots = [1, 2, 3, 4].map((id) => {
      const p = game.addPlayer(id, `Bot${id}`);
      p.god = true;
      const brain = new BotBrain(game.map, rng.fork());
      brain.place(p.x, p.y, p.z);
      return { id, brain };
    });
    for (const o of map.def.openings) if (o.kind === 'door') game.openDoor(o.id, 1);
    game.spawnInterval = 0.5;
    let worstIdle = 0;
    let worst = '';
    let kills = 0;
    let peak = 0;
    const botZones = new Set<string>();
    const zombieFloors = new Set<number>();
    const ticks = Math.round(240 / TICK_DT);
    for (let i = 0; i < ticks; i++) {
      t.wait(TICK_DT, () => {
        const zombies = [...game.zombies.values()];
        for (const b of bots) {
          b.brain.step(TICK_DT, zombies, game.openDoors);
          t.move(b.id, b.brain.x, b.brain.z, b.brain.yaw, b.brain.y);
          if (i % 30 === 0) botZones.add(game.map.zoneAt(b.brain.x, b.brain.y, b.brain.z) ?? '');
        }
        if (i % 30 === 0) {
          const aim = bots[(i / 30) % 4]!.brain.aim;
          const z = aim && game.zombies.get(aim.id);
          if (z) {
            killZombie(game, z, undefined, undefined, 'test');
            kills++;
          }
        }
        while (zombieCount(game) + game.spawnQueue.length < MAX_ALIVE_CAP) game.spawnQueue.push({ hp: 150, speed: rng.pick(SPEEDS) });
      });
      peak = Math.max(peak, zombieCount(game));
      for (const z of game.zombies.values()) {
        const idle = idleFor(game, z);
        if (idle > worstIdle) {
          worstIdle = idle;
          worst = `zombie ${z.id} state ${z.state} at (${z.x.toFixed(2)}, ${z.y.toFixed(2)}, ${z.z.toFixed(2)}) target ${z.ai?.target} t=${game.time.toFixed(1)}`;
        }
        if (z.state === ZombieState.Chase) zombieFloors.add(Math.round(z.y / 4) * 4);
        // Wherever it is, it is standing on a floor.
        if (z.state === ZombieState.Chase && game.map.cellAt(z.x, z.y, z.z) < 0) throw new Error(`zombie ${z.id} is off the floor at (${z.x}, ${z.y}, ${z.z})`);
      }
    }
    console.log(`[soak night] worst idle ${worstIdle.toFixed(1)} s (${worst}); peak ${peak}; kills ${kills}; tick avg ${game.stats.tickMs.toFixed(2)} ms, max ${game.stats.tickMsMax.toFixed(2)} ms; bot zones ${[...botZones].sort()}; zombie floors ${[...zombieFloors].sort()}`);
    expect(t.corrections).toEqual([]);
    expect(peak).toBeGreaterThan(20);
    expect(botZones.size).toBeGreaterThanOrEqual(10);
    for (const y of [-8, -4, 0, 4, 8]) expect(zombieFloors.has(y), `zombies on ${y}`).toBe(true);
    expect(worstIdle, worst).toBeLessThan(10);
    expect(game.stats.tickMs).toBeLessThan(5);
  }, 240_000);
});
