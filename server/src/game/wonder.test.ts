import { describe, expect, it } from 'vitest';
import {
  MAX_TACTICALS, POINTS_SPECIAL_KILL, SIREN_SECONDS, START_POINTS, ZombieState, lineOfSight, weaponStats, zombieHpForRound,
} from '@zh/shared';
import { makeGame } from './testkit';
import { spawnZombie } from './zombies';

// Session 11: the Arclight, the Gravewell and the Siren (PLAN 4.5), each against a horde.

/** A player in the yard's open south-west with a wonder weapon, looking east. */
function setup(weapon: string, upgraded = false) {
  const t = makeGame();
  const p = t.game.addPlayer(1, 'Ada');
  t.game.openDoor('d_mess_yard', 1);
  t.teleport(1, 22, 49);
  t.send(1, { t: 'debug', cmd: 'give', weapon, upgraded });
  const sees = (x: number, z: number) => lineOfSight(t.game.map, p.x, p.y, p.z, x, 0, z, t.game.openDoors);
  const hp = zombieHpForRound(30);
  /** `n` zombies in a rank across the yard, `gap` metres apart, barely moving. */
  const rank = (n: number, gap: number, x0 = 25) => Array.from({ length: n }, (_, i) => {
    expect(sees(x0 + i * gap, 49)).toBe(true);
    return spawnZombie(t.game, null, x0 + i * gap, 0, 49, hp, 0.01);
  });
  const east = -Math.PI / 2;
  let seq = 0;
  const fire = (hitId?: number) => {
    const z = hitId === undefined ? undefined : t.game.zombies.get(hitId);
    t.send(1, { t: 'fire', seq: ++seq, slot: p.pub.slot, yaw: east, pitch: 0, aim: false, hits: z ? [{ id: z.id, zone: 'torso', dist: Math.hypot(z.x - p.x, z.z - p.z) }] : [] });
  };
  return { t, p, rank, fire, hp };
}

describe('the Arclight', () => {
  it('chains through eight of a 24-zombie horde, nearest to nearest, and kills at round 30 health', () => {
    const { t, p, rank, fire } = setup('arclight');
    const horde = [...rank(12, 1.5), ...rank(12, 1.5, 25.5).map((z) => ((z.z = 50.2), z))];
    expect(horde).toHaveLength(24);
    fire(horde[0]!.id);
    t.wait(0.1);
    const chain = t.of('chain');
    expect(chain).toHaveLength(1);
    expect(chain[0]!.by).toBe(1);
    expect(chain[0]!.targets).toHaveLength(8);
    expect(chain[0]!.targets[0]).toBe(horde[0]!.id);
    expect(new Set(chain[0]!.targets).size).toBe(8);
    expect(t.game.zombies.size).toBe(16);
    expect(t.of('zombieDied').map((e) => e.id)).toEqual(chain[0]!.targets);
    expect(t.of('zombieDied').every((e) => e.cause === 'arclight')).toBe(true);
    expect(p.pub.points).toBe(START_POINTS + 8 * POINTS_SPECIAL_KILL);
    expect(p.pub.kills).toBe(8);
    expect(p.pub.weapons[p.pub.slot]!.mag).toBe(weaponStats('arclight', false)!.magSize - 1);
  });

  it('does nothing without a first target, and stops where the horde thins out', () => {
    const { t, rank, fire } = setup('arclight');
    const near = rank(3, 2);
    const far = spawnZombie(t.game, null, 40, 0, 49, 150, 0.01);
    fire();
    t.wait(1);
    expect(t.of('chain')).toHaveLength(0);
    fire(near[0]!.id);
    t.wait(0.1);
    expect(t.of('chain')[0]!.targets).toEqual(near.map((z) => z.id));
    expect(t.game.zombies.has(far.id)).toBe(true);
  });

  it('reaches further and through more once forged', () => {
    const { t, rank, fire } = setup('arclight', true);
    const horde = rank(16, 1.2);
    fire(horde[0]!.id);
    t.wait(0.1);
    const spec = weaponStats('arclight', true)!.wonder!;
    expect(spec).toMatchObject({ kind: 'arclight', chain: 14, radius: 7 });
    expect(t.of('chain')[0]!.targets).toHaveLength(14);
    expect(t.game.zombies.size).toBe(2);
  });
});

describe('the Gravewell', () => {
  it('opens a singularity that drags a 24-zombie horde in, then implodes on them', () => {
    const { t, p, rank, fire, hp } = setup('gravewell');
    const horde = [...rank(8, 0.6, 28), ...rank(8, 0.6, 28).map((z) => ((z.z = 48), z)), ...rank(8, 0.6, 28).map((z) => ((z.z = 50), z))];
    const out = spawnZombie(t.game, null, 44, 0, 40, hp, 0.01); // well out of reach
    fire();
    t.wait(0.2);
    expect(t.snaps.at(-1)!.projectiles.map((pr) => pr[1])).toEqual(['orb']);
    t.wait(1.2); // the orb is slow: 9 m/s to a horde 6 m off
    const well = t.game.projectiles.find((pr) => pr.kind === 'well')!;
    expect(well).toBeDefined();
    expect(t.snaps.at(-1)!.projectiles.map((pr) => pr[1])).toEqual(['well']);
    const spread = () => Math.max(...horde.filter((z) => t.game.zombies.has(z.id)).map((z) => Math.hypot(z.x - well.x, z.z - well.z)));
    expect(Math.hypot(well.x - 28, well.z - 49)).toBeLessThan(1.5); // where the orb met the front rank
    expect(t.game.zombies.size).toBe(25);
    t.wait(1.5);
    expect(spread()).toBeLessThan(1); // from a block 4 m across to a knot
    expect(horde.every((z) => z.state === ZombieState.Chase)).toBe(true);
    t.wait(2);
    // All 24 gone in one implosion; the one out of reach never noticed.
    expect([...t.game.zombies.keys()]).toEqual([out.id]);
    expect(t.of('explosion').map((e) => e.kind)).toEqual(['well']);
    expect(t.of('zombieDied').every((e) => e.cause === 'well')).toBe(true);
    expect(p.pub.points).toBe(START_POINTS + 24 * POINTS_SPECIAL_KILL);
    expect(t.game.projectiles).toHaveLength(0);
  });

  it('does not hurt the players standing by it', () => {
    const { t, p, rank, fire } = setup('gravewell');
    rank(2, 1, 24.5);
    fire();
    t.wait(5);
    expect(t.of('explosion')).toHaveLength(1);
    expect(t.of('playerHurt')).toHaveLength(0);
    expect(p.hp).toBe(100);
  });

  it('holds longer and reaches wider once forged', () => {
    const base = weaponStats('gravewell', false)!;
    const up = weaponStats('gravewell', true)!;
    if (base.wonder?.kind !== 'gravewell' || up.wonder?.kind !== 'gravewell') throw new Error('not a gravewell');
    expect(up.wonder.seconds).toBeGreaterThan(base.wonder.seconds);
    expect(up.wonder.radius).toBeGreaterThan(base.wonder.radius);
    expect(up.name).not.toBe(base.name);
  });
});

describe('the Siren', () => {
  it('calls the horde to it for six seconds, then blows up', () => {
    const { t, p, rank } = setup('warden');
    t.send(1, { t: 'debug', cmd: 'give', tactical: true });
    expect(p.pub.tactical).toBe(MAX_TACTICALS);
    const horde = rank(6, 1.2, 26).map((z) => ((z.speed = 3), z));
    // Thrown north, away from the player and the zombies.
    t.send(1, { t: 'throw', kind: 'tactical', yaw: 0, pitch: -0.1 });
    expect(p.pub.tactical).toBe(MAX_TACTICALS - 1);
    t.wait(1.5);
    const siren = t.game.projectiles.find((pr) => pr.kind === 'siren')!;
    expect(siren.z).toBeLessThan(45);
    expect(siren.z).toBeGreaterThan(36);
    expect(t.game.nav.lure).not.toBeNull();
    const toSiren = () => horde.map((z) => Math.hypot(z.x - siren.x, z.z - siren.z));
    const before = toSiren();
    t.wait(SIREN_SECONDS - 2.5);
    toSiren().forEach((d, i) => expect(d).toBeLessThan(Math.min(3, before[i]! - 2)));
    expect(t.of('playerHurt')).toHaveLength(0);
    expect(horde.some((z) => z.state === ZombieState.Attack)).toBe(false);
    t.wait(1.5);
    expect(t.of('explosion').map((e) => e.kind)).toEqual(['siren']);
    expect(t.game.projectiles).toHaveLength(0);
    expect(t.game.nav.lure).toBeNull();
    expect(horde.every((z) => z.hp < z.maxHp)).toBe(true);
    // With it gone, they remember the player.
    t.wait(8);
    expect(t.of('playerHurt').length).toBeGreaterThan(0);
  });

  it('cannot be thrown without one', () => {
    const { t } = setup('warden');
    t.send(1, { t: 'throw', kind: 'tactical', yaw: 0, pitch: 0 });
    t.wait(0.2);
    expect(t.game.projectiles).toHaveLength(0);
  });
});
