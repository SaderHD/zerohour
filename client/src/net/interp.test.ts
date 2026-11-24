import { describe, expect, it } from 'vitest';
import { MoveState } from '@zh/shared';
import { InterpBuffer } from './interp';

describe('InterpBuffer', () => {
  it('interpolates position, angle (short way) and derives speed', () => {
    const b = new InterpBuffer();
    b.push(1.0, 0, 0, 3.0, 0, MoveState.Walk);
    b.push(1.1, 0.45, 0, -3.0, 0.2, MoveState.Walk);
    const p = b.sample(1.05)!;
    expect(p.x).toBeCloseTo(0.225);
    expect(Math.abs(p.yaw)).toBeGreaterThan(3.0); // went through pi, not through 0
    expect(p.pitch).toBeCloseTo(0.1);
    expect(p.speed).toBeCloseTo(4.5);
  });

  it('holds at the ends, ignores out-of-order samples and snaps teleports', () => {
    const b = new InterpBuffer();
    expect(b.sample(0)).toBeNull();
    b.push(1, 1, 1, 0, 0, MoveState.Idle);
    b.push(0.5, 9, 9, 0, 0, MoveState.Idle);
    expect(b.sample(0)!.x).toBe(1);
    expect(b.sample(5)!.x).toBe(1);
    b.push(1.1, 30, 1, 0, 0, MoveState.Idle);
    expect(b.sample(1.05)!.x).toBe(30);
  });
});
