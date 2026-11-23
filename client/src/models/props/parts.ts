import type { RGB } from '../../render/bake';
import type { BoxOpts, Kit } from './kit';
import { C } from './palette';

// Shapes the kit's upright prism cannot make by itself: drums and wheels lying on their side.

/** A prism lying along z, from z0 to z1, centred on (x, y). */
export function drumZ(k: Kit, x: number, y: number, z0: number, z1: number, r: number, colour: number | RGB, sides = 8, o: BoxOpts = {}): void {
  k.sub(x, y, 0, 0, 90).cyl(0, 0, z0, z1, r, r, colour, sides, { bottom: true, ...o });
}

/** A prism lying along x, from x0 to x1, centred on (y, z). */
export function drumX(k: Kit, y: number, z: number, x0: number, x1: number, r: number, colour: number | RGB, sides = 8, o: BoxOpts = {}): void {
  k.sub(0, y, z, 0, 0, 90).cyl(0, 0, -x1, -x0, r, r, colour, sides, { bottom: true, ...o });
}

/** A road wheel on an axle along x, `w` wide, centred on (x, r, z). */
export function wheel(k: Kit, x: number, z: number, r: number, w: number): void {
  drumX(k, r, z, x - w / 2, x + w / 2, r, C.rubber);
  drumX(k, r, z, x - w / 2 - 0.02, x + w / 2 + 0.02, r * 0.45, C.steelDark, 6);
}

/** An axle stand: what a vehicle sits on when its wheels are off. */
export function axleStand(k: Kit, x: number, z: number, h: number): void {
  k.cyl(x, z, 0, h - 0.06, 0.2, 0.05, C.red, 4);
  k.box(x - 0.09, h - 0.06, z - 0.09, x + 0.09, h, z + 0.09, C.iron);
}

/** Fan blades about the z axis at (x, y, z), as flat paddles. */
export function fanBlades(k: Kit, x: number, y: number, z: number, r: number, n: number, colour: number | RGB): void {
  for (let i = 0; i < n; i++) {
    k.sub(x, y, z, 0, 0, (i * 360) / n).box(-r * 0.16, r * 0.12, -0.02, r * 0.16, r, 0.02, colour, { bottom: true });
  }
  drumZ(k, x, y, z - 0.05, z + 0.05, r * 0.16, C.iron, 6);
}
