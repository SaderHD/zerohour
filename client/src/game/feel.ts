// Feel: how the view shakes and how a gun climbs. No game state here, only the camera.
import type * as THREE from 'three';
import type { WeaponDef } from '@zh/shared';

/** Trauma lost per second. */
const DECAY = 1.7;
const MAX_ANGLE = 0.045;
const MAX_ROLL = 0.07;
const MAX_SHIFT = 0.04;

/** A wobble that looks random but is smooth: three sines that never line up. */
const wobble = (t: number): number => (Math.sin(t) + Math.sin(t * 2.31 + 1.7) * 0.6 + Math.sin(t * 4.07 + 0.4) * 0.3) / 1.9;

/**
 * Screen shake. Things that jolt the player add "trauma" (0..1); the view shakes by its square,
 * so small knocks barely register and big ones are violent, and it all dies away quickly.
 */
export class Shake {
  trauma = 0;
  /** Multiplier for players who want less of it (a setting, session 13). */
  scale = 1;
  private t = 0;

  add(amount: number): void {
    this.trauma = Math.min(1, this.trauma + Math.max(0, amount));
  }

  /** A blast `d` metres away with a damage radius of `radius`. */
  blast(d: number, radius: number): void {
    this.add(Math.max(0, 1.1 - d / (radius * 4)) * 0.9);
  }

  /** Call after the camera has been placed for the frame. */
  apply(dt: number, camera: THREE.PerspectiveCamera): void {
    this.trauma = Math.max(0, this.trauma - DECAY * dt);
    if (this.trauma <= 0) return;
    this.t += dt * 38;
    const s = this.trauma * this.trauma * this.scale;
    camera.rotation.x += wobble(this.t) * MAX_ANGLE * s;
    camera.rotation.y += wobble(this.t * 0.9 + 40) * MAX_ANGLE * s;
    camera.rotation.z += wobble(this.t * 1.1 + 80) * MAX_ROLL * s;
    camera.position.y += wobble(this.t * 1.3 + 120) * MAX_SHIFT * s;
  }
}

/** Seconds without a shot before a burst counts as over. */
export const burstGap = (def: Pick<WeaponDef, 'rpm'>): number => Math.max(0.28, (60 / def.rpm) * 2.2);

/**
 * How shot number `n` of a burst (0 = the first) kicks the view, in radians. Automatics jump on
 * the first rounds, settle into a steady climb, then stop climbing and start to weave side to
 * side in a pattern that can be learned; single-shot guns kick harder the faster they are worked.
 * Aiming steadies everything.
 */
export function recoilFor(def: Pick<WeaponDef, 'recoil' | 'auto'>, n: number, aim: number): { up: number; side: number } {
  const steady = 1 - 0.35 * aim;
  if (def.auto) {
    const up = n < 3 ? 1.3 : n < 9 ? 1 : 0.55;
    const side = Math.sin(n * 0.7) * 0.6 * Math.min(1, n / 4);
    return { up: def.recoil * up * steady, side: def.recoil * side * steady };
  }
  const k = Math.min(n, 4);
  return { up: def.recoil * (1 + 0.12 * k) * steady, side: def.recoil * 0.25 * (n % 2 ? 1 : -1) * Math.min(1, n / 2) * steady };
}
