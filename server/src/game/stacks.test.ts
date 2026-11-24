import { describe, expect, it } from 'vitest';
import {
  MAX_ALIVE_CAP, PLAYER_MAX_HP, Rng, START_POINTS, TICK_DT, ZOMBIE_SPEED_RUN, ZOMBIE_SPEED_SHAMBLE, ZOMBIE_SPEED_WALK, ZombieState, compileMap, mapWindows, stacks,
} from '@zh/shared';
import { BotBrain } from '../botBrain';
import { killZombie } from './entities';
import { explode, spawnProjectile } from './projectiles';
import { zombieCount } from './spawner';
import { makeGame } from './testkit';
import { idleFor, spawnZombie } from './zombies';

// The game on a map with height (PLAN 6.1-6.3): the Stacks has a loft over its hall and a cellar
// under it. Whoever is overhead or underfoot is out of reach until the stairs have been walked.

const map = compileMap(stacks);
const start = (seed = 3, doors = true) => {
  const t = makeGame(seed, { map });
  const p = t.game.addPlayer(1, 'Ada');
  p.pub.points = 5000;
  if (doors) for (const o of map.def.openings) if (o.kind === 'door') t.game.openDoor(o.id, 1);
  return { ...t, p };
};

describe('a match on three storeys', () => {
  it('spawns players on the ground and lets a debug teleport pick a floor', () => {
    const t = start();
    expect([t.p.x, t.p.y, t.p.z]).toEqual([9, 0, 15]);
    t.teleport(1, 12, 13, 3);
    expect(t.p.y).toBe(3);
    expect(t.game.map.zoneAt(t.p.x, t.p.y, t.p.z)).toBe('loft');
    t.teleport(1, 12, 13, -3);
    expect(t.p.y).toBe(-3);
    t.teleport(1, 12, 13); // no height given: the floor nearest where they are
    expect(t.p.y).toBe(-3);
  });

  it('accepts a walk up the stairs and refuses a jump through the ceiling', () => {
    const t = start();
    t.teleport(1, 4, 16.5, 0);
    t.corrections.length = 0;
    // Up the west stairs a stride at a time.
    for (let z = 16.3; z > 8.5; z -= 0.2) {
      t.wait(0.05);
      t.move(1, 4, z, 0, t.game.map.floorAt(4, t.p.y, z));
    }
    expect(t.corrections).toEqual([]);
    expect(t.p.y).toBe(3);
    // Straight down through the floor, or off to a height that is not a floor at all.
    t.wait(0.5);
    t.move(1, t.p.x, t.p.z, 0, 0);
    t.move(1, t.p.x, t.p.z, 0, 1.4);
    expect(t.corrections).toHaveLength(2);
    expect(t.p.y).toBe(3);
  });

  it('a zombie underfoot cannot hit, see or be bumped by the player overhead; it takes the stairs', () => {
    const t = start(4, false);
    t.teleport(1, 12, 13, 3);
    const z = spawnZombie(t.game, null, 12, 0, 13.4, 150, ZOMBIE_SPEED_RUN);
    t.wait(4);
    expect(t.p.hp).toBe(PLAYER_MAX_HP);
    expect(t.of('playerHurt')).toEqual([]);
    expect(z.y).toBe(0); // the loft's door is shut: nowhere to go
    // Open up, and it comes round by the lobby and the stairs.
    t.game.openDoor('d_loft', 1);
    let climbed = 0;
    t.wait(20, () => {
      if (z.y > 0.5 && z.y < 2.9) climbed++;
    });
    expect(climbed).toBeGreaterThan(10);
    expect(z.y).toBe(3);
    expect(t.of('playerHurt').length).toBeGreaterThan(0);
  });

  it('zombies come in through the windows of every storey and reach a player on any other', () => {
    for (const [goal, from] of [[3, 'w_cellar'], [-3, 'w_loft'], [0, 'w_loft'], [3, 'w_hall']] as const) {
      const t = start(5);
      t.p.god = true;
      t.teleport(1, 12, 15, goal);
      const win = mapWindows(map).find((w) => w.id === from)!;
      const z = spawnZombie(t.game, win, win.spawnX, win.y, win.spawnZ, 150, ZOMBIE_SPEED_RUN);
      let worst = 0;
      t.wait(45, () => (worst = Math.max(worst, idleFor(t.game, z))));
      expect(z.y, `${from} -> ${goal}`).toBe(goal);
      expect(Math.hypot(z.x - t.p.x, z.z - t.p.z), `${from} -> ${goal}`).toBeLessThan(2);
      expect(worst, `${from} -> ${goal}`).toBeLessThan(8);
    }
  });

  it('the spawner uses the windows of the storey the players are on', () => {
    const t = start(6, false);
    t.teleport(1, 12, 13, 0);
    t.game.spawnInterval = 0.1;
    for (let i = 0; i < 6; i++) t.game.spawnQueue.push({ hp: 150, speed: ZOMBIE_SPEED_WALK });
    t.wait(3);
    // Doors shut: only the hall is active, so nothing arrives at the loft's or the cellar's window.
    expect(new Set([...t.game.zombies.values()].map((z) => z.y))).toEqual(new Set([0]));
  });

  it('things are bought from the floor they are on, not from under or over them', () => {
    const t = start();
    // The loft's wall buy hangs at (11, 18), a storey above the hall's south wall.
    t.teleport(1, 11, 17.2, 0);
    t.send(1, { t: 'interact', id: 'wb_loft', hold: true });
    expect(t.denied).toEqual([{ id: 1, reason: 'range' }]);
    t.teleport(1, 11, 17.2, 3);
    t.send(1, { t: 'interact', id: 'wb_loft', hold: true });
    expect(t.p.pub.weapons.map((w) => w.id)).toContain('farrow');
    // Doors the same: the cellar's door is in the hall's south wall, and the cellar passes beneath it.
    const u = makeGame(8, { map });
    const q = u.game.addPlayer(1, 'Bo');
    q.pub.points = START_POINTS + 2000;
    u.teleport(1, 13.5, 18.6, -3);
    u.send(1, { t: 'interact', id: 'd_cellar', hold: true });
    expect(u.denied).toEqual([{ id: 1, reason: 'range' }]);
    u.teleport(1, 11, 17.4, 0);
    u.send(1, { t: 'interact', id: 'd_cellar', hold: true });
    expect(u.game.openDoors.has('d_cellar')).toBe(true);
  });

  it('a blast is stopped by the floor', () => {
    const t = start();
    t.p.god = true;
    const above = spawnZombie(t.game, null, 12, 3, 14, 150, 0.01);
    const beside = spawnZombie(t.game, null, 13.5, 0, 15, 150, 0.01);
    const below = spawnZombie(t.game, null, 12, -3, 14, 150, 0.01);
    explode(t.game, spawnProjectile(t.game, { kind: 'frag', owner: 1, x: 12, y: 0.1, z: 14, vx: 0, vy: 0, vz: 0, fuse: 0, impact: false, damage: 400, radius: 5 }));
    t.game.projectiles.length = 0;
    expect([above.hp, below.hp]).toEqual([150, 150]);
    expect(beside.hp).toBeLessThanOrEqual(0);
  });

  it('a power-up is picked up on its own floor only', () => {
    const t = start();
    t.send(1, { t: 'debug', cmd: 'powerup', kind: 'double', x: 12, z: 13, y: 3 });
    t.teleport(1, 12, 13, 0);
    t.wait(0.5);
    expect(t.of('powerupTaken')).toEqual([]);
    t.teleport(1, 12, 13, 3);
    t.wait(0.5);
    expect(t.of('powerupTaken')).toHaveLength(1);
  });
});

const SPEEDS = [ZOMBIE_SPEED_SHAMBLE, ZOMBIE_SPEED_WALK, ZOMBIE_SPEED_RUN];

describe('soak on the Stacks: a full horde, 4 bots roaming three storeys', () => {
  it('3 minutes with the doors open: nobody gets stuck on a stair, a ramp or a ledge', () => {
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
    const botFloors = new Set<number>();
    const zombieFloors = new Set<number>();
    const ticks = Math.round(180 / TICK_DT);
    for (let i = 0; i < ticks; i++) {
      t.wait(TICK_DT, () => {
        const zombies = [...game.zombies.values()];
        for (const b of bots) {
          b.brain.step(TICK_DT, zombies, game.openDoors);
          t.move(b.id, b.brain.x, b.brain.z, b.brain.yaw, b.brain.y);
          botFloors.add(Math.round(b.brain.y));
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
        if (z.state === ZombieState.Chase) zombieFloors.add(Math.round(z.y));
        // Wherever it is, it is standing on a floor.
        if (z.state === ZombieState.Chase && game.map.cellAt(z.x, z.y, z.z) < 0) throw new Error(`zombie ${z.id} is off the floor at (${z.x}, ${z.y}, ${z.z})`);
      }
    }
    console.log(`[soak stacks] worst idle ${worstIdle.toFixed(1)} s (${worst}); peak ${peak}; kills ${kills}; tick avg ${game.stats.tickMs.toFixed(2)} ms, max ${game.stats.tickMsMax.toFixed(2)} ms; bot floors ${[...botFloors].sort()}; zombie floors ${[...zombieFloors].sort()}`);
    expect(t.corrections).toEqual([]);
    expect(peak).toBeGreaterThan(20);
    expect(kills).toBeGreaterThan(60);
    for (const y of [-3, 0, 1, 3]) {
      expect(botFloors.has(y), `bots on ${y}`).toBe(true);
      expect(zombieFloors.has(y), `zombies on ${y}`).toBe(true);
    }
    expect(worstIdle, worst).toBeLessThan(10);
    expect(game.stats.tickMs).toBeLessThan(5);
  }, 120_000);
});
