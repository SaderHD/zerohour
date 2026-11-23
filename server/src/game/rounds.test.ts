import { describe, expect, it } from 'vitest';
import {
  BLEEDOUT_SECONDS, FIRST_ROUND_DELAY, INTERMISSION_SECONDS, MoveState, PLAYER_MAX_HP, REVIVE_SECONDS, START_POINTS, STRAGGLER_SECONDS,
  ZOMBIE_SPEED_RUN, ZOMBIE_SPEED_SHAMBLE, weaponDef, zombiesForRound,
} from '@zh/shared';
import { giveWeapon } from './combat';
import { damageZombie, killZombie } from './entities';
import { damagePlayer } from './players';
import { setPlanks } from './barricades';
import { zombieCount } from './spawner';
import { makeGame } from './testkit';
import { spawnZombie } from './zombies';

const killAll = (t: ReturnType<typeof makeGame>) => {
  for (const z of [...t.game.zombies.values()]) killZombie(t.game, z, undefined, undefined, 'test');
};
/** Kill everything as it appears until the round is over. */
const clearRound = (t: ReturnType<typeof makeGame>) => {
  for (let i = 0; i < 4000 && t.game.rounds.phase === 'active'; i++) t.wait(0.1, () => killAll(t));
};

describe('round loop', () => {
  it('round 1 starts after a short delay with 6 shamblers at 150 hp', () => {
    const t = makeGame(3, { rounds: true });
    const p = t.game.addPlayer(1, 'Ada');
    p.god = true;
    t.wait(FIRST_ROUND_DELAY - 0.2);
    expect(t.of('roundStart')).toHaveLength(0);
    t.wait(0.4);
    expect(t.of('roundStart')).toEqual([{ e: 'roundStart', round: 1, special: false, total: 6 }]);
    expect(t.game.syncFor(1)).toMatchObject({ round: 1, roundPhase: 'active', zombiesLeft: 6, over: false });
    t.wait(20);
    expect(zombieCount(t.game)).toBe(6);
    for (const z of t.game.zombies.values()) expect([z.maxHp, z.speed]).toEqual([150, ZOMBIE_SPEED_SHAMBLE]);
  });

  it('ends when the last zombie falls, waits out the intermission, then starts the next', () => {
    const t = makeGame(3, { rounds: true });
    t.game.addPlayer(1, 'Ada').god = true;
    t.wait(FIRST_ROUND_DELAY + 0.1);
    clearRound(t);
    expect(t.of('roundEnd')).toEqual([{ e: 'roundEnd', round: 1 }]);
    expect(t.of('zombieSpawn')).toHaveLength(6);
    expect(t.of('zombiesLeft').map((e) => e.n).at(-1)).toBe(0);
    t.wait(INTERMISSION_SECONDS - 0.5);
    expect(t.game.rounds.round).toBe(1);
    t.wait(1);
    expect(t.of('roundStart').at(-1)).toMatchObject({ round: 2, total: 8 });
    expect(t.game.players.get(1)!.pub.grenades).toBe(3); // +1 a round
    clearRound(t);
    t.wait(INTERMISSION_SECONDS + 0.1);
    expect(t.of('roundStart').at(-1)).toMatchObject({ round: 3, total: 13 });
    expect(t.game.spawnQueue.every((o) => o.hp === 350)).toBe(true);
  });

  it('scales the count by the players connected', () => {
    const t = makeGame(3, { rounds: true });
    for (const id of [1, 2, 3]) t.game.addPlayer(id, `P${id}`).god = true;
    t.wait(FIRST_ROUND_DELAY + 0.1);
    expect(t.of('roundStart')[0]!.total).toBe(zombiesForRound(1, 3));
  });

  it('the last few stragglers break into a run', () => {
    const t = makeGame(3, { rounds: true });
    t.game.addPlayer(1, 'Ada').god = true;
    t.wait(FIRST_ROUND_DELAY + 0.1);
    // Let them all in, keeping two alive.
    for (let i = 0; i < 600 && (t.game.spawnQueue.length > 0 || zombieCount(t.game) > 2); i++) {
      t.wait(0.1, () => {
        if (zombieCount(t.game) > 2) killZombie(t.game, [...t.game.zombies.values()][0]!, undefined, undefined, 'test');
      });
    }
    expect(zombieCount(t.game)).toBe(2);
    t.wait(STRAGGLER_SECONDS - 1);
    expect([...t.game.zombies.values()].every((z) => z.speed === ZOMBIE_SPEED_SHAMBLE)).toBe(true);
    t.wait(1.5);
    expect([...t.game.zombies.values()].every((z) => z.speed === ZOMBIE_SPEED_RUN)).toBe(true);
  });

  it('debug: setRound jumps, rounds(false) clears the map and stops the loop', () => {
    const t = makeGame(3, { rounds: true });
    t.game.addPlayer(1, 'Ada').god = true;
    t.send(1, { t: 'debug', cmd: 'setRound', round: 10 });
    t.wait(1.2);
    expect(t.of('roundStart').at(-1)).toMatchObject({ round: 10, total: 46 });
    t.wait(3);
    t.send(1, { t: 'debug', cmd: 'rounds', on: false });
    expect(zombieCount(t.game) + t.game.spawnQueue.length).toBe(0);
    t.wait(30);
    expect(t.of('roundStart')).toHaveLength(1);
    t.send(1, { t: 'debug', cmd: 'rounds', on: true });
    t.wait(1.2);
    expect(t.of('roundStart').at(-1)).toMatchObject({ round: 10 });
  });
});

describe('points (PLAN 4.2)', () => {
  const setup = () => {
    const t = makeGame();
    const p = t.game.addPlayer(1, 'Ada');
    p.god = true;
    const zombie = (hp = 150) => spawnZombie(t.game, null, p.x, p.z - 4, hp, 0.1);
    return { t, p, zombie };
  };

  it('starts with 500; 10 for a hit, 60 / 100 / 130 / 50 for body, head, knife and blast kills', () => {
    const { t, p, zombie } = setup();
    expect(p.pub.points).toBe(START_POINTS);
    const z = zombie();
    damageZombie(t.game, z, 30, 1, 'torso', 'bullet');
    expect(p.pub.points).toBe(510);
    damageZombie(t.game, z, 200, 1, 'torso', 'bullet');
    expect(p.pub.points).toBe(570); // the killing hit pays the kill only
    damageZombie(t.game, zombie(), 200, 1, 'head', 'bullet');
    expect(p.pub.points).toBe(670);
    damageZombie(t.game, zombie(), 200, 1, 'torso', 'melee');
    expect(p.pub.points).toBe(800);
    damageZombie(t.game, zombie(), 900, 1, 'torso', 'frag');
    expect(p.pub.points).toBe(850);
    expect(p.pub).toMatchObject({ kills: 4, headshots: 1 });
    t.wait(0.1);
    expect(t.of('points').map((e) => [e.delta, e.reason])).toEqual([[10, 'hit'], [60, 'kill'], [100, 'headshot'], [130, 'melee'], [50, 'kill']]);
    expect(t.of('points').at(-1)!.total).toBe(850);
  });

  it('real shots score through the fire path; dummies pay nothing', () => {
    const { t, p, zombie } = setup();
    const z = zombie(60);
    const dist = Math.hypot(z.x - p.x, z.z - p.z);
    t.send(1, { t: 'fire', seq: 1, slot: 0, yaw: 0, pitch: 0, aim: false, hits: [{ id: z.id, zone: 'torso', dist }] });
    expect(p.pub.points).toBe(510);
    t.wait(0.5);
    t.send(1, { t: 'fire', seq: 2, slot: 0, yaw: 0, pitch: 0, aim: false, hits: [{ id: z.id, zone: 'head', dist }] });
    expect(p.pub.points).toBe(610);
    t.send(1, { t: 'debug', cmd: 'dummy', x: p.x, z: p.z - 3, yaw: 0 });
    const d = [...t.game.zombies.values()].find((e) => e.kind === 'dummy')!;
    damageZombie(t.game, d, 5000, 1, 'head', 'bullet');
    expect(p.pub.points).toBe(610);
    expect(p.pub.kills).toBe(1);
  });

  it('a shotgun blast pays per pellet that lands', () => {
    const { t, p, zombie } = setup();
    giveWeapon(t.game, p, 'pike');
    const z = zombie(100000);
    const dist = Math.hypot(z.x - p.x, z.z - p.z);
    const pellets = weaponDef('pike')!.pellets;
    t.wait(1);
    t.send(1, { t: 'fire', seq: 1, slot: p.pub.slot, yaw: 0, pitch: 0, aim: false, hits: Array.from({ length: pellets }, () => ({ id: z.id, zone: 'torso' as const, dist })) });
    expect(p.pub.points).toBe(START_POINTS + 10 * pellets);
  });

  it('planks pay 10 each up to 50 + 50 x round per round', () => {
    const t = makeGame(3, { rounds: true });
    const p = t.game.addPlayer(1, 'Ada');
    p.god = true;
    t.wait(FIRST_ROUND_DELAY + 0.1);
    t.game.spawnQueue.length = 0;
    t.game.rounds.paused = true; // hold round 1 open
    const b = t.game.barricades.get('w_mess_n1')!;
    t.teleport(1, b.win.inX, b.win.inZ);
    let built = 0;
    for (let i = 0; i < 4; i++) {
      setPlanks(t.game, b, 0);
      t.wait(7, () => t.send(1, { t: 'interact', id: b.win.id, hold: true }));
      built += b.planks;
    }
    expect(built).toBe(24);
    expect(p.pub.points).toBe(START_POINTS + 100); // capped at 50 + 50 x 1
    expect(t.of('points').filter((e) => e.reason === 'plank')).toHaveLength(10);
  });
});

describe('downs, revives and game over (PLAN 4.1)', () => {
  const two = () => {
    const t = makeGame();
    const a = t.game.addPlayer(1, 'Ada');
    const b = t.game.addPlayer(2, 'Bea');
    t.teleport(1, 28, 26);
    t.teleport(2, 29, 26);
    return { t, a, b };
  };
  const hit = (t: ReturnType<typeof makeGame>, p: Parameters<typeof damagePlayer>[1], n = 3) => {
    for (let i = 0; i < n; i++) damagePlayer(t.game, p, 45, 0, 0);
  };

  it('a player at 0 hp goes down: pistol only, 5% of points gone, cannot move, zombies leave them', () => {
    const { t, a, b } = two();
    giveWeapon(t.game, b, 'stitch');
    b.pub.points = 2130;
    hit(t, b, 2);
    expect(b.state).not.toBe(MoveState.Downed);
    hit(t, b, 1);
    expect(b.state).toBe(MoveState.Downed);
    expect(b.pub).toMatchObject({ downs: 1, points: 2130 - 110, slot: 0 });
    expect(b.pub.weapons.map((w) => w.id)).toEqual(['warden']);
    expect(t.game.targetable(b)).toBe(false);
    t.move(2, 29.5, 26);
    expect([b.x, b.z]).toEqual([29, 26]);
    expect(t.corrections.at(-1)).toMatchObject({ id: 2, x: 29, z: 26 });
    // Still shoots from the floor.
    const z = spawnZombie(t.game, null, 29, 23, 150, 0.1);
    t.send(2, { t: 'fire', seq: 1, slot: 0, yaw: 0, pitch: 0, aim: false, hits: [{ id: z.id, zone: 'torso', dist: 3 }] });
    expect(z.hp).toBe(120);
    t.send(2, { t: 'melee', hit: z.id });
    expect(z.hp).toBe(120);
    t.wait(1.5);
    expect(z.ai!.target).toBe(1);
    t.wait(0.1);
    expect(t.snaps.at(-1)!.players.find((s) => s[0] === 2)![5]).toBe(MoveState.Downed);
    expect(t.of('playerDowned')).toEqual([{ e: 'playerDowned', id: 2 }]);
    expect(a.state).not.toBe(MoveState.Downed);
  });

  it('a teammate holding F for 3 s revives them: loadout back, +100 and a revive credited', () => {
    const { t, a, b } = two();
    giveWeapon(t.game, b, 'stitch');
    hit(t, b);
    t.send(1, { t: 'revive', target: 2, hold: true });
    t.wait(REVIVE_SECONDS - 0.3);
    expect(b.state).toBe(MoveState.Downed);
    expect(t.of('reviving')).toEqual([{ e: 'reviving', id: 2, by: 1 }]);
    t.wait(0.5);
    expect(b.state).toBe(MoveState.Idle);
    expect(b.hp).toBe(PLAYER_MAX_HP);
    expect(b.pub.weapons.map((w) => w.id)).toEqual(['warden', 'stitch']);
    expect(a.pub).toMatchObject({ revives: 1, points: START_POINTS + 100 });
    expect(t.of('playerRevived')).toEqual([{ e: 'playerRevived', id: 2, by: 1 }]);
    expect(t.game.targetable(b)).toBe(true);
    t.move(2, 29.2, 26);
    expect(b.x).toBe(29.2);
  });

  it('letting go or walking off starts the revive over; reviving stops the bleed-out clock', () => {
    const { t, a, b } = two();
    hit(t, b);
    t.send(1, { t: 'revive', target: 2, hold: true });
    t.wait(2);
    t.send(1, { t: 'revive', target: 2, hold: false });
    t.wait(0.1);
    expect(t.of('reviving').at(-1)).toMatchObject({ by: 0 });
    t.send(1, { t: 'revive', target: 2, hold: true });
    t.wait(2);
    expect(b.state).toBe(MoveState.Downed);
    t.teleport(1, 28, 30); // out of reach
    t.wait(2);
    expect(b.state).toBe(MoveState.Downed);
    expect(a.reviving).toBe(0);
    expect(b.down!.until).toBeCloseTo(BLEEDOUT_SECONDS + 4, 0);
    // Out of range from the start does nothing either.
    t.send(1, { t: 'revive', target: 2, hold: true });
    t.wait(4);
    expect(b.state).toBe(MoveState.Downed);
  });

  it('bleeds out after 45 s, sits out, and respawns next round with a pistol and at least 1500', () => {
    const t = makeGame(3, { rounds: true });
    const a = t.game.addPlayer(1, 'Ada');
    const b = t.game.addPlayer(2, 'Bea');
    a.god = true;
    t.wait(FIRST_ROUND_DELAY + 0.1);
    giveWeapon(t.game, b, 'stitch');
    hit(t, b);
    t.wait(BLEEDOUT_SECONDS - 1);
    expect(b.state).toBe(MoveState.Downed);
    t.wait(1.5);
    expect(b.state).toBe(MoveState.Dead);
    expect(t.of('playerDied')).toEqual([{ e: 'playerDied', id: 2 }]);
    expect(t.of('gameOver')).toHaveLength(0);
    clearRound(t);
    t.wait(INTERMISSION_SECONDS + 0.1);
    expect(t.game.rounds.round).toBe(2);
    expect(b.state).toBe(MoveState.Idle);
    expect(b.hp).toBe(PLAYER_MAX_HP);
    expect(b.pub.weapons.map((w) => w.id)).toEqual(['warden']);
    expect(b.pub.points).toBe(1500);
    expect(t.of('playerSpawned').at(-1)).toMatchObject({ id: 2 });
  });

  it('a late joiner watches until the next round', () => {
    const t = makeGame(3, { rounds: true });
    t.game.addPlayer(1, 'Ada').god = true;
    t.wait(FIRST_ROUND_DELAY + 0.1);
    const b = t.game.addPlayer(2, 'Bea');
    expect(b.state).toBe(MoveState.Dead);
    expect(t.game.targetable(b)).toBe(false);
    clearRound(t);
    t.wait(INTERMISSION_SECONDS + 0.1);
    expect(b.state).toBe(MoveState.Idle);
    expect(b.pub.points).toBe(1500);
    expect(t.of('roundStart').at(-1)!.total).toBe(zombiesForRound(2, 2));
  });

  it('game over when everyone is down; solo that is the first down', () => {
    const { t, a, b } = two();
    hit(t, b);
    t.wait(0.2);
    expect(t.game.over).toBe(false);
    hit(t, a);
    t.wait(0.2);
    expect(t.game.over).toBe(true);
    const over = t.of('gameOver');
    expect(over).toHaveLength(1);
    expect(over[0]!.players.map((p) => p.downs)).toEqual([1, 1]);
    const time = t.game.time;
    t.wait(1);
    expect(t.game.time).toBe(time); // the sim has stopped

    const solo = makeGame(5, { rounds: true });
    const p = solo.game.addPlayer(1, 'Ada');
    solo.wait(FIRST_ROUND_DELAY + 0.1);
    hit(solo, p);
    solo.wait(0.1);
    expect(solo.of('gameOver')).toEqual([expect.objectContaining({ round: 1 })]);
  });

  it('a downed player whose only standing teammate has disconnected ends the game', () => {
    const { t, b } = two();
    hit(t, b);
    t.game.setConnected(1, false);
    t.wait(0.1);
    expect(t.game.over).toBe(true);
  });
});
