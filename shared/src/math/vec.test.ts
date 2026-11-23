import { describe, expect, it } from 'vitest';
import { clamp, dist, lerpAngle, normalize, wrapAngle } from './vec';

describe('vec', () => {
  it('normalizes and handles zero', () => {
    expect(normalize({ x: 3, z: 4 })).toEqual({ x: 0.6, z: 0.8 });
    expect(normalize({ x: 0, z: 0 })).toEqual({ x: 0, z: 0 });
    expect(dist({ x: 0, z: 0 }, { x: 3, z: 4 })).toBe(5);
    expect(clamp(5, 0, 1)).toBe(1);
  });

  it('wraps and lerps angles along the short arc', () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI / 2)).toBeCloseTo(-Math.PI / 2);
    const a = 170 * (Math.PI / 180);
    const b = -170 * (Math.PI / 180);
    expect(Math.abs(wrapAngle(lerpAngle(a, b, 0.5)))).toBeCloseTo(Math.PI);
  });
});
