import { describe, expect, it } from 'vitest';
import { MAX_ALIVE_CAP, Rng, TICK_DT, ZOMBIE_SPEED_RUN, ZOMBIE_SPEED_SHAMBLE, ZOMBIE_SPEED_WALK, ZombieState, compileMap, longestNight, mapWindows } from '@zh/shared';
import { BotBrain } from '../botBrain';
import { killZombie } from './entities';
import { activeZones, zombieCount } from './spawner';
import { makeGame } from './testkit';
import { idleFor, spawnZombie } from './zombies';

// The game on The Longest Night's blockout (PLAN section 9, M3): a map four times the station's
// size, with the subway two storeys under its streets.

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
  });

  it('the subway has no way in of its own yet: someone down there is come for from the street', () => {
    const t = start(6);
    t.teleport(1, 80, 36, -8);
    expect(activeZones(t.game)).toEqual(new Set(['platform', 'mezz', 'service', 'avenue']));
    t.game.spawnInterval = 0.1;
    for (let i = 0; i < 6; i++) t.game.spawnQueue.push({ hp: 150, speed: ZOMBIE_SPEED_WALK });
    t.wait(5);
    expect(zombieCount(t.game)).toBeGreaterThan(0);
    for (const z of t.game.zombies.values()) expect(z.y).toBeGreaterThan(-1);
  });
});

const SPEEDS = [ZOMBIE_SPEED_SHAMBLE, ZOMBIE_SPEED_WALK, ZOMBIE_SPEED_RUN];

describe('soak on The Longest Night: a full horde, 4 bots roaming the streets and the subway', () => {
  it('4 minutes with the doors open: nobody gets stuck on a kerb, a flight or a train door, and the tick stays in budget', () => {
    const t = makeGame(21, { map });
    const { game } = t;
    const rng = new Rng(77);
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
    expect(botZones.size).toBeGreaterThanOrEqual(8);
    for (const y of [-8, -4, 0]) expect(zombieFloors.has(y), `zombies on ${y}`).toBe(true);
    expect(worstIdle, worst).toBeLessThan(10);
    expect(game.stats.tickMs).toBeLessThan(5);
  }, 240_000);
});
