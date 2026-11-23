import { describe, expect, it } from 'vitest';
import { Shake, burstGap, recoilFor } from './feel';

const auto = { recoil: 0.02, auto: true };
const semi = { recoil: 0.05, auto: false };

describe('recoil curves', () => {
  it('an automatic jumps first, then climbs less and weaves', () => {
    expect(recoilFor(auto, 0, 0).up).toBeCloseTo(0.026);
    expect(recoilFor(auto, 0, 0).side).toBe(0);
    expect(recoilFor(auto, 5, 0).up).toBeCloseTo(0.02);
    expect(recoilFor(auto, 12, 0).up).toBeLessThan(recoilFor(auto, 5, 0).up);
    const sides = Array.from({ length: 20 }, (_, n) => recoilFor(auto, n, 0).side);
    expect(Math.max(...sides)).toBeGreaterThan(0.008);
    expect(Math.min(...sides)).toBeLessThan(-0.008);
  });

  it('a single-shot gun kicks harder when worked fast, up to a limit', () => {
    expect(recoilFor(semi, 0, 0)).toEqual({ up: 0.05, side: -0 });
    expect(recoilFor(semi, 3, 0).up).toBeGreaterThan(recoilFor(semi, 1, 0).up);
    expect(recoilFor(semi, 9, 0).up).toBe(recoilFor(semi, 4, 0).up);
    expect(Math.sign(recoilFor(semi, 2, 0).side)).toBe(-Math.sign(recoilFor(semi, 3, 0).side));
  });

  it('aiming steadies the gun', () => {
    expect(recoilFor(auto, 4, 1).up).toBeCloseTo(recoilFor(auto, 4, 0).up * 0.65);
  });

  it('a burst ends after a pause that fits the gun', () => {
    expect(burstGap({ rpm: 900 })).toBe(0.28);
    expect(burstGap({ rpm: 60 })).toBeCloseTo(2.2);
  });
});

describe('screen shake', () => {
  const cam = () => ({ rotation: { x: 0, y: 0, z: 0 }, position: { y: 1.6 } }) as never;

  it('dies away and leaves the camera alone afterwards', () => {
    const s = new Shake();
    s.add(0.8);
    const c = cam() as { rotation: { x: number } };
    s.apply(0.016, c as never);
    expect(c.rotation.x).not.toBe(0);
    for (let i = 0; i < 60; i++) s.apply(0.016, cam());
    expect(s.trauma).toBe(0);
    const still = cam() as { rotation: { x: number } };
    s.apply(0.016, still as never);
    expect(still.rotation.x).toBe(0);
  });

  it('a blast shakes by how near it is', () => {
    const near = new Shake();
    const far = new Shake();
    near.blast(2, 5);
    far.blast(18, 5);
    expect(near.trauma).toBeGreaterThan(far.trauma);
    far.blast(40, 5);
    expect(far.trauma).toBeLessThan(0.2);
    near.add(5);
    expect(near.trauma).toBe(1);
  });
});
