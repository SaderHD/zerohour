import { describe, expect, it } from 'vitest';
import {
  HAIR_TRIGGER_RATE_MULT, IRONHIDE_MAX_HP, MARATHON_SPEED_MULT, MARATHON_STAMINA_MULT, MAX_PERKS, MoveState, PERK_LIST, PLAYER_MAX_HP,
  QUICKHANDS_RELOAD_MULT, REVIVE_SECONDS, SELF_REVIVE_SECONDS, SOLO_SELF_REVIVES, STAMINA_SECONDS, TONICS, ZOMBIE_DAMAGE, fireInterval,
  harrowRidge, speedMultWith, staminaWith, weaponDef,
} from '@zh/shared';
import { damagePlayer } from './players';
import { makeGame } from './testkit';

// Session 10: tonics - buying them (cost, power, limits) and what each one does.

type T = ReturnType<typeof makeGame>;
const press = (t: T, id: string, who = 1) => t.send(who, { t: 'interact', id, hold: true });
/** Stand a player in front of a dispenser. */
function goTo(t: T, perk: string, who = 1): void {
  const it = harrowRidge.interactables.find((i) => i.id === `tonic_${perk}`)!;
  const d = { n: [0, -0.7], s: [0, 0.7], e: [0.7, 0], w: [-0.7, 0] }[it.facing] as [number, number];
  t.teleport(who, it.x + d[0], it.z + d[1]);
}
const buy = (t: T, perk: string, who = 1) => (goTo(t, perk, who), press(t, `tonic_${perk}`, who));
const give = (t: T, perk: string, who = 1) => t.send(who, { t: 'debug', cmd: 'give', perk });

/** Two players (so the solo rules are off), power on, plenty of points. */
function coop() {
  const t = makeGame();
  const p = t.game.addPlayer(1, 'Ada');
  const q = t.game.addPlayer(2, 'Bo');
  p.pub.points = q.pub.points = 50_000;
  t.send(1, { t: 'debug', cmd: 'powerOn' });
  return { t, p, q };
}

describe('buying tonics', () => {
  it('every dispenser on the map sells a known tonic', () => {
    expect(PERK_LIST.map((d) => d.id).sort()).toEqual(TONICS.map((x) => x.id).sort());
    for (const def of PERK_LIST) expect(harrowRidge.interactables.some((i) => i.kind === 'tonic' && i.ref === def.id)).toBe(true);
  });

  it('needs power, reach and the points; costs its price; cannot be bought twice', () => {
    const t = makeGame();
    const p = t.game.addPlayer(1, 'Ada');
    t.game.addPlayer(2, 'Bo');
    p.pub.points = 2400;
    press(t, 'tonic_ironhide');
    expect(t.denied.at(-1)?.reason).toBe('range');
    buy(t, 'ironhide');
    expect(t.denied.at(-1)?.reason).toBe('power');
    t.send(1, { t: 'debug', cmd: 'powerOn' });
    buy(t, 'ironhide');
    expect(t.denied.at(-1)?.reason).toBe('points');
    expect(p.pub.perks).toEqual([]);
    p.pub.points = 2600;
    buy(t, 'ironhide');
    t.wait(0.1);
    expect(p.pub.perks).toEqual(['ironhide']);
    expect(p.pub.points).toBe(100);
    expect(t.of('purchase').at(-1)).toEqual({ e: 'purchase', id: 1, what: 'perk', ref: 'ironhide' });
    p.pub.points = 9000;
    buy(t, 'ironhide');
    expect(t.denied.at(-1)?.reason).toBe('owned');
    expect(p.pub.points).toBe(9000);
  });

  it('each tonic charges the price in the table', () => {
    for (const def of PERK_LIST) {
      const { t, p } = coop();
      buy(t, def.id);
      expect(p.pub.perks, def.id).toEqual([def.id]);
      expect(50_000 - p.pub.points, def.id).toBe(def.cost);
    }
  });

  it(`a player holds at most ${MAX_PERKS}`, () => {
    const { t, p } = coop();
    for (const id of ['ironhide', 'quickhands', 'hair_trigger', 'marathon']) buy(t, id);
    expect(p.pub.perks).toHaveLength(MAX_PERKS);
    const before = p.pub.points;
    buy(t, 'packmule');
    expect(t.denied.at(-1)?.reason).toBe('limit');
    expect(p.pub.perks).toHaveLength(MAX_PERKS);
    expect(p.pub.points).toBe(before);
  });

  it('going down loses them all', () => {
    const { t, p } = coop();
    buy(t, 'ironhide');
    buy(t, 'quickhands');
    damagePlayer(t.game, p, 1000, 0, 0);
    expect(p.state).toBe(MoveState.Downed);
    expect(p.pub.perks).toEqual([]);
    t.wait(0.1);
    expect(t.of('player').at(-1)?.player.perks).toEqual([]);
  });
});

describe('tonic effects', () => {
  it('Ironhide: 250 health, which takes more hits and regenerates to the top', () => {
    const { t, p } = coop();
    expect(p.hp).toBe(PLAYER_MAX_HP);
    give(t, 'ironhide');
    expect(p.hp).toBe(IRONHIDE_MAX_HP);
    for (let i = 0; i < 5; i++) damagePlayer(t.game, p, ZOMBIE_DAMAGE, 0, 0);
    expect(p.state).not.toBe(MoveState.Downed);
    expect(p.hp).toBe(IRONHIDE_MAX_HP - 5 * ZOMBIE_DAMAGE);
    t.wait(10);
    expect(p.hp).toBe(IRONHIDE_MAX_HP);
    damagePlayer(t.game, p, 6 * ZOMBIE_DAMAGE, 0, 0);
    expect(p.state).toBe(MoveState.Downed);
  });

  it('Quickhands: reloads take half the time', () => {
    const time = (perk: boolean): number => {
      const { t, p } = coop();
      if (perk) give(t, 'quickhands');
      p.pub.weapons[0]!.mag = 0;
      t.send(1, { t: 'reload' });
      let took = 0;
      t.wait(3, () => {
        if (p.pub.weapons[0]!.mag === 0) took += 1 / 30;
      });
      return took;
    };
    const plain = time(false);
    expect(plain).toBeCloseTo(weaponDef('warden')!.reloadTime, 0);
    expect(time(true) / plain).toBeCloseTo(QUICKHANDS_RELOAD_MULT, 1);
  });

  it('Hair Trigger: a third more shots in the same time, and no more than that', () => {
    const shots = (perk: boolean): number => {
      const { t, p } = coop();
      if (perk) give(t, 'hair_trigger');
      t.send(1, { t: 'debug', cmd: 'give', weapon: 'halberd' });
      let seq = 0;
      // Ask for far more shots than any weapon can fire; count what the server lets through.
      t.wait(4, () => t.send(1, { t: 'fire', seq: ++seq, slot: p.pub.slot, yaw: 0, pitch: 0, aim: false, hits: [] }));
      return weaponDef('halberd')!.magSize - p.pub.weapons[p.pub.slot]!.mag;
    };
    const def = weaponDef('halberd')!;
    const plain = shots(false);
    expect(plain).toBeGreaterThan(4 / fireInterval(def) - 5);
    expect(plain).toBeLessThanOrEqual(4 / fireInterval(def) + 2);
    const quick = shots(true);
    expect(quick / plain).toBeGreaterThan(1.2);
    expect(quick).toBeLessThanOrEqual(4 / fireInterval(def, HAIR_TRIGGER_RATE_MULT) + 2);
  });

  it('Marathon: twice the stamina and a little more speed (the client moves; the server allows it)', () => {
    expect(staminaWith(['marathon'])).toBe(STAMINA_SECONDS * MARATHON_STAMINA_MULT);
    expect(staminaWith([])).toBe(STAMINA_SECONDS);
    expect(speedMultWith(['marathon'])).toBe(MARATHON_SPEED_MULT);
    const { t, p } = coop();
    give(t, 'marathon');
    t.teleport(1, 29, 26);
    t.wait(1);
    // A second of marathon sprinting, reported at 20 Hz, is accepted without a correction.
    let x = 29;
    const before = t.corrections.length;
    t.wait(1, () => {
      x += (6.5 * MARATHON_SPEED_MULT) / 30;
      t.move(1, x, 26);
    });
    expect(t.corrections.length).toBe(before);
    expect(p.x).toBeCloseTo(x, 3);
  });

  it('Packmule: a third weapon, which goes when the tonic does', () => {
    const { t, p, q } = coop();
    for (const w of ['farrow', 'pike']) t.send(1, { t: 'debug', cmd: 'give', weapon: w });
    expect(p.pub.weapons.map((w) => w.id)).toEqual(['warden', 'pike']);
    give(t, 'packmule');
    t.send(1, { t: 'debug', cmd: 'give', weapon: 'stitch' });
    expect(p.pub.weapons.map((w) => w.id)).toEqual(['warden', 'pike', 'stitch']);
    expect(p.pub.slot).toBe(2);
    t.send(1, { t: 'swap', slot: 0 });
    t.send(1, { t: 'swap', slot: 2 });
    expect(p.pub.slot).toBe(2);
    // Down and up again: two weapons, and the hand is on one of them.
    t.teleport(1, 29, 26);
    t.teleport(2, 29.8, 26);
    damagePlayer(t.game, p, 1000, 0, 0);
    t.send(2, { t: 'revive', target: 1, hold: true });
    t.wait(REVIVE_SECONDS + 0.2);
    expect(p.state).toBe(MoveState.Idle);
    expect(p.pub.weapons.map((w) => w.id)).toEqual(['warden', 'pike']);
    expect(p.pub.slot).toBe(0);
    expect(q.pub.revives).toBe(1);
  });

  it('Second Wind in company: the holder revives twice as fast', () => {
    const { t, p, q } = coop();
    buy(t, 'second_wind', 2);
    expect(q.pub.points).toBe(50_000 - 1500);
    t.teleport(1, 29, 26);
    t.teleport(2, 29.8, 26);
    damagePlayer(t.game, p, 1000, 0, 0);
    t.send(2, { t: 'revive', target: 1, hold: true });
    t.wait(REVIVE_SECONDS / 2 + 0.2);
    expect(p.state).toBe(MoveState.Idle);
    // And being downed with one, in company, is an ordinary down: no getting up alone.
    t.send(2, { t: 'revive', target: 1, hold: false });
    give(t, 'second_wind');
    t.wait(3);
    damagePlayer(t.game, p, 1000, 0, 0);
    expect(p.state).toBe(MoveState.Downed);
    t.wait(SELF_REVIVE_SECONDS + 2);
    expect(p.state).toBe(MoveState.Downed);
  });
});

describe('Second Wind alone', () => {
  function solo() {
    const t = makeGame();
    const p = t.game.addPlayer(1, 'Ada');
    p.pub.points = 10_000;
    return { t, p };
  }

  it('costs 500 and works without power', () => {
    const { t, p } = solo();
    buy(t, 'second_wind');
    expect(t.denied).toEqual([]);
    expect(p.pub.perks).toEqual(['second_wind']);
    expect(p.pub.points).toBe(9500);
    // The others still wait for the mains.
    buy(t, 'marathon');
    expect(t.denied.at(-1)?.reason).toBe('power');
  });

  it('gets its holder back up, once, and the game goes on meanwhile', () => {
    const { t, p } = solo();
    t.send(1, { t: 'debug', cmd: 'give', weapon: 'farrow' });
    buy(t, 'second_wind');
    damagePlayer(t.game, p, 1000, 0, 0);
    expect(p.state).toBe(MoveState.Downed);
    expect(p.pub.perks).toEqual([]);
    t.wait(SELF_REVIVE_SECONDS - 0.5);
    expect(t.game.over).toBe(false);
    expect(p.state).toBe(MoveState.Downed);
    expect(t.of('reviving').at(-1)).toEqual({ e: 'reviving', id: 1, by: 1 });
    t.wait(1);
    expect(p.state).toBe(MoveState.Idle);
    expect(p.hp).toBe(PLAYER_MAX_HP);
    expect(p.pub.weapons.map((w) => w.id)).toEqual(['warden', 'farrow']);
    // Nothing hurts for a moment after getting up; then the next down is the end.
    damagePlayer(t.game, p, 1000, 0, 0);
    expect(p.state).toBe(MoveState.Idle);
    t.wait(3);
    damagePlayer(t.game, p, 1000, 0, 0);
    t.wait(0.1);
    expect(t.game.over).toBe(true);
  });

  it(`can be bought ${SOLO_SELF_REVIVES} times a game`, () => {
    const { t, p } = solo();
    for (let i = 0; i < SOLO_SELF_REVIVES; i++) {
      buy(t, 'second_wind');
      expect(p.pub.perks).toEqual(['second_wind']);
      damagePlayer(t.game, p, 1000, 0, 0);
      t.wait(SELF_REVIVE_SECONDS + 3);
      expect(p.state).toBe(MoveState.Idle);
    }
    const before = p.pub.points;
    buy(t, 'second_wind');
    expect(t.denied.at(-1)?.reason).toBe('limit');
    expect(p.pub.points).toBe(before);
  });
});
