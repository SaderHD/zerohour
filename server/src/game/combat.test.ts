import { describe, expect, it } from 'vitest';
import {
  DUMMY_HP, DUMMY_RESET_SECONDS, GRENADE_FUSE, KNIFE_DAMAGE, START_GRENADES, TICK_DT, fireInterval, hitDamage, weaponDef,
  type ClientMsg, type FireHit, type GameEvent, type ServerMsg, type Snapshot,
} from '@zh/shared';
import { giveWeapon } from './combat';
import { spawnDummy } from './entities';
import { Game } from './Game';

function setup() {
  let now = 100;
  const events: GameEvent[] = [];
  const snaps: Snapshot[] = [];
  const out = {
    send: (_id: number, m: ServerMsg) => void (m.t === 'snap' && snaps.push(m)),
    broadcast: (m: ServerMsg) => void (m.t === 'ev' && events.push(...m.events)),
  };
  const game = new Game(out, { debug: true, seed: 7, now: () => now });
  const p = game.addPlayer(1, 'Ada'); // spawns at (28, 26) in the mess hall
  const dummy = spawnDummy(game, p.x, 0, p.z - 4, 0);
  let seq = 0;
  /** Advance the wall clock and the sim together. */
  const wait = (sec: number) => {
    for (let t = 0; t < sec - 1e-9; t += TICK_DT) {
      now += TICK_DT;
      game.step(TICK_DT);
    }
  };
  const send = (m: ClientMsg) => game.onMessage(1, m);
  const fire = (hits: FireHit[] = [], slot = p.pub.slot) => send({ t: 'fire', seq: ++seq, slot, yaw: 0, pitch: 0, aim: false, hits });
  const of = <E extends GameEvent['e']>(e: E) => events.filter((ev) => ev.e === e) as Extract<GameEvent, { e: E }>[];
  const flush = () => game.step(TICK_DT);
  return { game, p, dummy, wait, send, fire, of, flush, events, snaps, tick: (s: number) => (now += s) };
}

const warden = weaponDef('warden')!;

describe('fire validation', () => {
  it('applies body and head damage to the dummy and spends ammo', () => {
    const { p, dummy, fire, wait, of } = setup();
    fire([{ id: dummy.id, zone: 'torso', dist: 4 }]);
    expect(dummy.hp).toBe(DUMMY_HP - warden.damage);
    wait(fireInterval(warden));
    fire([{ id: dummy.id, zone: 'head', dist: 4 }]);
    expect(dummy.hp).toBe(DUMMY_HP - warden.damage - Math.round(warden.damage * warden.headMult));
    expect(p.pub.weapons[0]!.mag).toBe(warden.magSize - 2);
    wait(TICK_DT);
    expect(of('zombieHit').map((h) => h.dmg)).toEqual([30, 75]);
    expect(of('fired')).toHaveLength(2);
  });

  it('rejects shots faster than the fire rate but tolerates jitter', () => {
    const { p, dummy, fire, tick } = setup();
    const hit: FireHit[] = [{ id: dummy.id, zone: 'torso', dist: 4 }];
    fire(hit);
    fire(hit); // same instant
    tick(0.05);
    fire(hit); // a third of an interval later: still too fast
    expect(dummy.hp).toBe(DUMMY_HP - warden.damage);
    expect(p.pub.weapons[0]!.mag).toBe(warden.magSize - 1);
    tick(fireInterval(warden) - 0.05 - 0.03); // 30 ms early is within the slack
    fire(hit);
    expect(dummy.hp).toBe(DUMMY_HP - 2 * warden.damage);
  });

  it('cannot sustain a rate above the weapon rpm', () => {
    const { game, p, fire, tick } = setup();
    giveWeapon(game, p, 'halberd');
    const def = weaponDef('halberd')!;
    for (let i = 0; i < 200; i++) {
      fire();
      tick(fireInterval(def) / 2); // twice the legal rate for ~11 s
    }
    const spent = def.magSize - p.pub.weapons[p.pub.slot]!.mag;
    expect(spent).toBeGreaterThan(90);
    expect(spent).toBeLessThanOrEqual(def.magSize);
    expect(spent).toBeLessThan(110);
  });

  it('rejects hits that are out of range, misreported or behind a wall', () => {
    const { game, p, dummy, fire, wait } = setup();
    fire([{ id: dummy.id, zone: 'torso', dist: 12 }]); // dummy is 4 m away
    wait(0.2);
    fire([{ id: 9999, zone: 'torso', dist: 4 }]);
    wait(0.2);
    fire([{ id: dummy.id, zone: 'elbow' as never, dist: 4 }]);
    wait(0.2);
    const hidden = spawnDummy(game, p.x, 0, 20, 0); // other side of the north wall (z = 22)
    fire([{ id: hidden.id, zone: 'torso', dist: 6 }]);
    expect(dummy.hp).toBe(DUMMY_HP);
    expect(hidden.hp).toBe(DUMMY_HP);
    expect(p.pub.weapons[0]!.mag).toBe(warden.magSize - 4); // the rounds are still spent
  });

  it('caps the pellets one shot can land on a target', () => {
    const { game, p, dummy, fire } = setup();
    giveWeapon(game, p, 'pike');
    const pike = weaponDef('pike')!;
    fire(Array.from({ length: 20 }, () => ({ id: dummy.id, zone: 'torso' as const, dist: 4 })));
    expect(dummy.hp).toBe(DUMMY_HP - pike.pellets * hitDamage(pike, 'torso', 4));
    expect(hitDamage(pike, 'torso', 4)).toBe(pike.damage);
  });

  it('refuses to fire with an empty magazine or the wrong slot', () => {
    const { p, dummy, fire, wait, of } = setup();
    fire([], 1);
    expect(of('fired')).toHaveLength(0);
    for (let i = 0; i < warden.magSize + 3; i++) {
      fire([{ id: dummy.id, zone: 'torso', dist: 4 }]);
      wait(0.2);
    }
    expect(p.pub.weapons[0]!.mag).toBe(0);
    expect(dummy.hp).toBe(DUMMY_HP - warden.magSize * warden.damage);
  });
});

describe('reload, swap, melee, grenades', () => {
  it('reloads after the reload time and blocks fire meanwhile', () => {
    const { p, fire, wait, send, snaps } = setup();
    for (let i = 0; i < 3; i++) {
      fire();
      wait(0.2);
    }
    send({ t: 'reload' });
    wait(warden.reloadTime / 2);
    fire();
    expect(p.pub.weapons[0]!.mag).toBe(warden.magSize - 3);
    wait(warden.reloadTime / 2);
    expect(p.pub.weapons[0]).toMatchObject({ mag: warden.magSize, reserve: warden.reserve - 3 });
    fire();
    expect(p.pub.weapons[0]!.mag).toBe(warden.magSize - 1);
    wait(0.1);
    expect(snaps.at(-1)!.ammo).toEqual([5, 0, warden.magSize - 1, warden.reserve - 3]);
  });

  it('swapping cancels a reload and delays the next shot', () => {
    const { game, p, fire, wait, send, of } = setup();
    giveWeapon(game, p, 'stitch');
    expect(p.pub.slot).toBe(1);
    send({ t: 'swap', slot: 0 });
    fire(); // still raising the weapon
    expect(of('fired')).toHaveLength(0);
    wait(0.4);
    fire();
    send({ t: 'reload' });
    send({ t: 'swap', slot: 1 });
    wait(3);
    expect(p.pub.weapons[0]!.mag).toBe(warden.magSize - 1); // reload was abandoned
    send({ t: 'swap', slot: 5 });
    expect(p.pub.slot).toBe(1);
  });

  it('knife hits need range and respect the cooldown', () => {
    const { game, p, dummy, send, wait } = setup();
    send({ t: 'melee', hit: dummy.id }); // 4 m away
    expect(dummy.hp).toBe(DUMMY_HP);
    wait(1);
    const near = spawnDummy(game, p.x, 0, p.z - 1.2, 0);
    send({ t: 'melee', hit: near.id });
    send({ t: 'melee', hit: near.id });
    expect(near.hp).toBe(DUMMY_HP - KNIFE_DAMAGE);
  });

  it('a frag bounces, explodes on its fuse and damages by distance', () => {
    const { p, dummy, send, wait, of } = setup();
    send({ t: 'throw', kind: 'frag', yaw: 0, pitch: -0.3 });
    send({ t: 'throw', kind: 'frag', yaw: 0, pitch: -0.3 }); // cooldown
    expect(p.pub.grenades).toBe(START_GRENADES - 1);
    wait(GRENADE_FUSE - 0.2);
    expect(of('explosion')).toHaveLength(0);
    wait(0.4);
    const [boom] = of('explosion');
    expect(boom).toBeDefined();
    expect(boom!.z).toBeGreaterThan(22); // stayed inside the room
    expect(boom!.z).toBeLessThan(p.z);
    expect(dummy.hp).toBeLessThan(DUMMY_HP);
    expect(dummy.hp).toBeGreaterThan(0);
  });

  it('the Thumper round explodes on impact and a destroyed dummy stands back up', () => {
    const { game, p, dummy, fire, wait, of } = setup();
    giveWeapon(game, p, 'thumper');
    fire();
    wait(0.5);
    expect(of('explosion')).toHaveLength(1);
    expect(dummy.hp).toBeLessThan(DUMMY_HP - 400);
    dummy.hp = 10;
    game.onMessage(1, { t: 'swap', slot: 0 });
    wait(0.5);
    fire([{ id: dummy.id, zone: 'torso', dist: 4 }]);
    wait(TICK_DT);
    expect(of('zombieDied')).toHaveLength(1);
    expect(game.zombies.size).toBe(0);
    wait(DUMMY_RESET_SECONDS + 0.1);
    expect(game.zombies.size).toBe(1);
    expect([...game.zombies.values()][0]!.hp).toBe(DUMMY_HP);
  });
});
