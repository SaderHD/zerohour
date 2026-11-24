import { describe, expect, it } from 'vitest';
import { FORGE_COLLECT_SECONDS, FORGE_COST, FORGE_SECONDS, GALLERY_Y, UPGRADED_AMMO_COST, VAULT_Y, hitDamage, weaponDef, weaponStats, WEAPON_LIST } from '@zh/shared';
import { makeGame } from './testkit';

// Session 10: the generic F path for wall buys, the master switch and the Forge.

const press = (t: ReturnType<typeof makeGame>, id: string, who = 1) => t.send(who, { t: 'interact', id, hold: true });
/** Where to stand for each thing. */
/** Where to stand for each thing: the master switch is up on the generator hall's gallery, the Forge down in the vault. */
const AT = { farrow: [23.5, 24, 0], power: [56.5, 25.3, GALLERY_Y], forge: [26.4, 57.5, VAULT_Y] } as const;

function setup(points = 10_000) {
  const t = makeGame();
  const p = t.game.addPlayer(1, 'Ada');
  p.pub.points = points;
  const go = (where: keyof typeof AT) => t.teleport(1, AT[where][0], AT[where][1], AT[where][2]);
  return { t, p, go };
}

describe('wall buys', () => {
  it('sell the weapon for its price, within reach and with the points', () => {
    const { t, p, go } = setup(400);
    t.teleport(1, 29, 26);
    press(t, 'wb_farrow');
    expect(t.denied).toEqual([{ id: 1, reason: 'range' }]);
    go('farrow');
    press(t, 'wb_farrow');
    expect(t.denied[1]).toEqual({ id: 1, reason: 'points' });
    expect(p.pub.weapons.map((w) => w.id)).toEqual(['warden']);
    p.pub.points = 500;
    press(t, 'wb_farrow');
    t.wait(0.1);
    expect(p.pub.points).toBe(0);
    expect(p.pub.weapons.map((w) => w.id)).toEqual(['warden', 'farrow']);
    expect(p.pub.slot).toBe(1);
    expect(t.of('purchase')).toEqual([{ e: 'purchase', id: 1, what: 'weapon', ref: 'farrow' }]);
    expect(t.of('points').at(-1)).toMatchObject({ delta: -500, reason: 'weapon' });
  });

  it('sell ammo at half price to someone who holds the weapon, and nothing when it is full', () => {
    const { t, p, go } = setup(2000);
    go('farrow');
    press(t, 'wb_farrow');
    press(t, 'wb_farrow');
    expect(t.denied).toEqual([{ id: 1, reason: 'full' }]);
    expect(p.pub.points).toBe(1500);
    const w = p.pub.weapons[1]!;
    w.reserve = 3;
    w.mag = 2;
    press(t, 'wb_farrow');
    t.wait(0.1);
    expect(p.pub.points).toBe(1250);
    expect(w).toMatchObject({ mag: 2, reserve: weaponDef('farrow')!.reserve });
    expect(t.of('purchase').at(-1)).toEqual({ e: 'purchase', id: 1, what: 'ammo', ref: 'farrow' });
  });

  it('charge the upgraded price for upgraded ammo and keep the upgrade', () => {
    const { t, p, go } = setup(UPGRADED_AMMO_COST + 100);
    t.send(1, { t: 'debug', cmd: 'give', weapon: 'farrow', upgraded: true });
    const w = p.pub.weapons[1]!;
    w.reserve = 0;
    go('farrow');
    press(t, 'wb_farrow');
    expect(p.pub.points).toBe(100);
    expect(w).toMatchObject({ upgraded: true, reserve: weaponStats('farrow', true)!.reserve });
  });

  it('replace the held weapon when both slots are taken; downed players buy nothing', () => {
    const { t, p, go } = setup();
    t.send(1, { t: 'debug', cmd: 'give', weapon: 'pike' });
    t.send(1, { t: 'swap', slot: 0 });
    go('farrow');
    press(t, 'wb_farrow');
    expect(p.pub.weapons.map((w) => w.id)).toEqual(['farrow', 'pike']);
    const q = t.game.addPlayer(2, 'Bo');
    q.pub.points = 5000;
    t.teleport(2, AT.farrow[0], AT.farrow[1]);
    q.state = 3; // downed
    press(t, 'wb_farrow', 2);
    expect(q.pub.points).toBe(5000);
  });
});

describe('the master switch', () => {
  it('turns the power on once, from within reach, and opens the vault', () => {
    const { t, go } = setup();
    press(t, 'power');
    expect(t.game.power).toBe(false);
    expect(t.denied).toEqual([{ id: 1, reason: 'range' }]);
    // Standing right under it, on the hall floor, is not within reach either.
    t.teleport(1, AT.power[0], AT.power[1], 0);
    press(t, 'power');
    expect(t.game.power).toBe(false);
    expect(t.denied).toHaveLength(2);
    go('power');
    press(t, 'power');
    press(t, 'power');
    t.wait(0.1);
    expect(t.game.power).toBe(true);
    expect(t.of('powerOn')).toEqual([{ e: 'powerOn', by: 1 }]);
    expect(t.game.openDoors.has('d_vault')).toBe(true);
    expect(t.game.syncFor(1)).toMatchObject({ power: true });
  });
});

describe('the Forge', () => {
  it('needs power, the points and a weapon that is not already upgraded', () => {
    const { t, p, go } = setup(FORGE_COST - 10);
    go('forge');
    press(t, 'forge');
    expect(t.denied.at(-1)?.reason).toBe('power');
    t.send(1, { t: 'debug', cmd: 'powerOn' });
    press(t, 'forge');
    expect(t.denied.at(-1)?.reason).toBe('points');
    p.pub.points = 20_000;
    p.pub.weapons[0]!.upgraded = true;
    press(t, 'forge');
    expect(t.denied.at(-1)?.reason).toBe('upgraded');
    expect(p.pub.points).toBe(20_000);
    expect(t.game.forge.phase).toBe('idle');
  });

  it('takes the held weapon, works for a while, then hands back the upgraded one to its owner only', () => {
    const { t, p, go } = setup(FORGE_COST + 500);
    const q = t.game.addPlayer(2, 'Bo');
    q.pub.points = 20_000;
    t.send(1, { t: 'debug', cmd: 'powerOn' });
    t.send(1, { t: 'debug', cmd: 'give', weapon: 'farrow' });
    go('forge');
    t.teleport(2, 26.6, 58.3, VAULT_Y);
    press(t, 'forge');
    t.wait(0.1);
    expect(p.pub.points).toBe(500);
    expect(p.pub.weapons.map((w) => w.id)).toEqual(['warden']);
    expect(p.pub.slot).toBe(0);
    expect(t.game.forge).toMatchObject({ phase: 'working', by: 1, weapon: 'farrow' });
    expect(t.of('purchase').at(-1)).toEqual({ e: 'purchase', id: 1, what: 'forge', ref: 'farrow' });
    // Busy for everyone while it works, the owner included.
    press(t, 'forge');
    press(t, 'forge', 2);
    expect(t.denied.slice(-2).map((d) => d.reason)).toEqual(['busy', 'busy']);
    t.wait(FORGE_SECONDS);
    expect(t.game.forge).toMatchObject({ phase: 'offering', by: 1, weapon: 'farrow' });
    expect(t.game.syncFor(2)).toMatchObject({ forge: { phase: 'offering', by: 1 } });
    press(t, 'forge', 2);
    expect(t.denied.at(-1)).toEqual({ id: 2, reason: 'busy' });
    expect(q.pub.points).toBe(20_000);
    press(t, 'forge');
    t.wait(0.1);
    const up = weaponStats('farrow', true)!;
    expect(p.pub.weapons[1]).toEqual({ id: 'farrow', upgraded: true, mag: up.magSize, reserve: up.reserve });
    expect(p.pub.slot).toBe(1);
    expect(t.game.forge.phase).toBe('idle');
    expect(t.of('forge').map((e) => e.state.phase)).toEqual(['working', 'offering', 'idle']);
  });

  it('keeps a weapon nobody collects', () => {
    const { t, p, go } = setup();
    t.send(1, { t: 'debug', cmd: 'powerOn' });
    go('forge');
    press(t, 'forge');
    expect(p.pub.weapons).toEqual([]);
    t.wait(FORGE_SECONDS + FORGE_COLLECT_SECONDS + 0.2);
    expect(t.game.forge.phase).toBe('idle');
    expect(p.pub.weapons).toEqual([]);
    // Unarmed, the Forge has nothing to take.
    press(t, 'forge');
    expect(t.denied.at(-1)?.reason).toBe('invalid');
  });

  it('an upgraded weapon hits harder and holds more, for every weapon', () => {
    for (const def of WEAPON_LIST) {
      const up = weaponStats(def.id, true)!;
      expect(up.name).not.toBe(def.name);
      expect(up.damage / def.damage).toBeGreaterThanOrEqual(2);
      expect(up.damage / def.damage).toBeLessThanOrEqual(3);
      expect(up.magSize).toBeGreaterThanOrEqual(def.magSize);
      expect(up.reserve).toBeGreaterThan(def.reserve);
    }
    const { t, p } = setup();
    t.send(1, { t: 'debug', cmd: 'give', weapon: 'farrow', upgraded: true });
    t.teleport(1, 29, 26);
    t.send(1, { t: 'debug', cmd: 'dummy', x: 29, z: 23, yaw: 0 });
    t.wait(0.5);
    const d = [...t.game.zombies.values()][0]!;
    t.send(1, { t: 'fire', seq: 1, slot: p.pub.slot, yaw: 0, pitch: 0, aim: false, hits: [{ id: d.id, zone: 'torso', dist: 3 }] });
    t.wait(0.1);
    expect(t.of('zombieHit').at(-1)?.dmg).toBe(hitDamage(weaponStats('farrow', true)!, 'torso', 3));
    expect(p.pub.weapons[1]!.mag).toBe(weaponStats('farrow', true)!.magSize - 1);
  });
});
