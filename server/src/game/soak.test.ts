import { describe, expect, it } from 'vitest';
import { MAX_ALIVE_CAP, Rng, SNAPSHOT_BUDGET_BYTES, encode, TICK_DT, ZOMBIE_SPEED_RUN, ZOMBIE_SPEED_SHAMBLE, ZOMBIE_SPEED_WALK, ZombieState } from '@zh/shared';
import { BotBrain } from '../botBrain';
import { killZombie } from './entities';
import { zombieCount } from './spawner';
import { makeGame } from './testkit';
import { idleFor } from './zombies';

// The session 5 acceptance soak, on a fake clock: four bots roam for five minutes while the
// spawner keeps 32 zombies coming at them. No zombie may go 10 s without getting anywhere.

const SPEEDS = [ZOMBIE_SPEED_SHAMBLE, ZOMBIE_SPEED_WALK, ZOMBIE_SPEED_RUN];

function soak(seconds: number, openDoors: boolean) {
  const t = makeGame(openDoors ? 11 : 12);
  const { game } = t;
  const rng = new Rng(99);
  const bots = [1, 2, 3, 4].map((id) => {
    const p = game.addPlayer(id, `Bot${id}`);
    p.god = true;
    const brain = new BotBrain(game.map, rng.fork());
    brain.place(p.x, p.z);
    return { id, brain };
  });
  if (openDoors) for (const o of game.map.def.openings) if (o.kind === 'door') game.openDoor(o.id, 1);
  game.spawnInterval = 0.5;
  let worstIdle = 0;
  let worst = '';
  let peak = 0;
  let kills = 0;
  let tickMsTotal = 0;
  let tickMsMax = 0;
  const zones = new Set<string>();
  const ticks = Math.round(seconds / TICK_DT);
  for (let i = 0; i < ticks; i++) {
    t.wait(TICK_DT, () => {
      const zombies = [...game.zombies.values()];
      for (const b of bots) {
        b.brain.step(TICK_DT, zombies, game.openDoors);
        t.move(b.id, b.brain.x, b.brain.z, b.brain.yaw);
      }
      // The bots "shoot": every second the zombie nearest to one of them drops, so fresh ones keep arriving.
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
    tickMsTotal += game.stats.tickMs;
    tickMsMax = Math.max(tickMsMax, game.stats.tickMsMax);
    peak = Math.max(peak, zombieCount(game));
    for (const z of game.zombies.values()) {
      const idle = idleFor(game, z);
      if (idle > worstIdle) {
        worstIdle = idle;
        worst = `zombie ${z.id} state ${z.state} at (${z.x.toFixed(2)}, ${z.z.toFixed(2)}) target ${z.ai?.target} t=${game.time.toFixed(1)}`;
      }
      if (z.state === ZombieState.Chase) zones.add(game.map.zoneAt(z.x, z.z) ?? '?');
    }
  }
  const hits = t.of("playerHurt").length;
  const snapBytes = Math.max(...t.snaps.filter((m) => m.zombies.length === MAX_ALIVE_CAP).slice(-200).map((m) => encode(m).length));
  return { snapBytes, worstIdle, worst, peak, kills, hits, zones, tickMs: tickMsTotal / ticks, tickMsMax, corrections: t.corrections.length, game };
}

describe('soak: 32 zombies, 4 roaming bots', () => {
  it('5 minutes with every door open: nobody gets stuck, the tick stays cheap', () => {
    const r = soak(300, true);
    console.log(`[soak open] worst idle ${r.worstIdle.toFixed(1)} s (${r.worst}); peak ${r.peak}; kills ${r.kills}; tick avg ${r.tickMs.toFixed(2)} ms, max ${r.tickMsMax.toFixed(2)} ms; snapshot ${r.snapBytes} bytes; zones ${[...r.zones].join(',')}`);
    expect(r.peak).toBe(MAX_ALIVE_CAP);
    // PLAN session 14: a snapshot of four players and the full horde, as it goes on the wire.
    expect(r.snapBytes).toBeGreaterThan(500);
    expect(r.snapBytes).toBeLessThan(SNAPSHOT_BUDGET_BYTES);
    expect(r.kills).toBeGreaterThan(100);
    expect(r.zones.size).toBeGreaterThanOrEqual(8); // zombies chased through (nearly) the whole map
    expect(r.corrections).toBe(0);
    expect(r.worstIdle, r.worst).toBeLessThan(10);
    expect(r.tickMs).toBeLessThan(5);
  }, 120_000);

  it('2 minutes with the doors shut: the horde funnels through the mess hall windows', () => {
    const r = soak(120, false);
    console.log(`[soak shut] worst idle ${r.worstIdle.toFixed(1)} s (${r.worst}); peak ${r.peak}; kills ${r.kills}; tick avg ${r.tickMs.toFixed(2)} ms`);
    expect([...r.zones]).toEqual(['mess']);
    expect(r.worstIdle, r.worst).toBeLessThan(10);
    expect(r.tickMs).toBeLessThan(5);
  }, 60_000);
});
