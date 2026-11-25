import { TONICS, weaponDef } from '@zh/shared';
import { linear } from '../../render/materials';
import { outlineTile, textTile } from '../../render/signs';
import { C } from './palette';
import type { Kit } from './kit';

// Where the things players buy stand: wall-buy boards, tonic dispensers, Cache sites.

/** A board on the wall with pegs for a weapon: its outline chalked on, its name and price underneath. */
export function wallbuy(k: Kit): void {
  const y = k.inst.y ?? 1.45;
  const name = k.inst.text ?? '';
  const cost = weaponDef(name.toLowerCase())?.cost;
  k.box(-0.7, y - 0.4, -0.04, 0.7, y + 0.4, 0, k.tone(C.woodDark, 0.06));
  k.box(-0.72, y + 0.4, -0.06, 0.72, y + 0.44, 0, C.wood, { bottom: true });
  k.picture(0, y + 0.1, -0.045, 1.26, 0.45, outlineTile(name.toLowerCase()), [1.3, 1.3, 1.3]);
  for (const x of [-0.32, 0.36]) k.box(x - 0.02, y - 0.02, -0.14, x + 0.02, y + 0.02, -0.04, C.steel, { bottom: true });
  const label = textTile(cost === undefined ? name : `${name} ${cost}`, 'chalk');
  k.picture(0, y - 0.26, -0.045, Math.min(1.3, 0.2 * label.aspect), 0.2, label.uv, [1.3, 1.3, 1.3]);
}

/**
 * A tonic dispenser: a cabinet in the tonic's colour with the canister standing in a lit alcove.
 * It only wakes with the mains. `variant` is the index into TONICS.
 */
export function tonic(k: Kit): void {
  const t = TONICS[k.variant % TONICS.length]!;
  const hue = linear(t.glow);
  const paint = k.tone(t.glow, 0.04).map((c, i) => c * 0.28 + [0.06, 0.06, 0.07][i]!) as [number, number, number];
  const glow: [number, number, number] = [hue[0] * 1.6 + 0.1, hue[1] * 1.6 + 0.1, hue[2] * 1.6 + 0.1];
  k.box(-0.45, 0, -0.38, 0.45, 1.0, 0.46, paint);
  k.box(-0.45, 1.0, -0.08, 0.45, 2.02, 0.46, paint);
  for (const x of [-0.45, 0.37]) k.box(x, 1.0, -0.38, x + 0.08, 2.02, -0.08, paint);
  k.box(-0.45, 1.8, -0.4, 0.45, 2.02, -0.08, paint, { bottom: true });
  k.box(-0.48, 0, -0.42, 0.48, 0.1, 0.48, C.iron);
  // The alcove: a dark back, a lamp under the hood, the canister on its plate.
  k.plate(-0.37, 1.0, 0.37, 1.8, -0.085, [0.012, 0.012, 0.016]);
  k.plate(-0.3, 1.74, 0.3, 1.79, -0.09, glow, 'power');
  k.cyl(0, -0.24, 1.0, 1.03, 0.16, 0.16, C.steel, 8);
  k.cyl(0, -0.24, 1.03, 1.5, 0.11, 0.11, glow, 8, { glow: 'power', noTop: true });
  k.cyl(0, -0.24, 1.5, 1.6, 0.11, 0.05, C.brass, 8);
  k.cyl(0, -0.24, 1.6, 1.66, 0.03, 0.03, C.steel, 6);
  // Name on the hood, the works below: a coin slot, a pull handle, a chute.
  const label = textTile(t.name, 'plate');
  k.picture(0, 1.91, -0.404, Math.min(0.84, 0.15 * label.aspect), 0.15, label.uv);
  k.plate(-0.36, 0.2, 0.36, 0.9, -0.383, [paint[0] * 0.7, paint[1] * 0.7, paint[2] * 0.7]);
  k.box(0.2, 0.62, -0.42, 0.3, 0.8, -0.38, C.steel);
  k.plate(0.24, 0.68, 0.26, 0.76, -0.422, C.iron);
  k.sub(-0.2, 0.74, -0.38, 0, -40).box(-0.02, 0, -0.02, 0.02, 0.2, 0.02, C.steel);
  k.cube(-0.2, 0.9, -0.5, 0.1, 0.05, 0.05, C.bakelite);
  k.box(-0.14, 0.26, -0.42, 0.14, 0.44, -0.38, C.iron);
  k.plate(-0.3, 0.5, -0.1, 0.56, -0.386, glow, 'power');
}

/** A pallet chained to the floor where the Cache can stand, its site number painted on. */
export function cacheSite(k: Kit): void {
  const wood = k.tone(C.wood, 0.1);
  for (const z of [-0.44, -0.04, 0.36]) k.box(-0.98, 0, z, 0.98, 0.1, z + 0.08, k.tone(C.woodDark, 0.1));
  for (let i = 0; i < 7; i++) {
    const x = -0.98 + i * 0.285;
    k.box(x, 0.1, -0.48, x + 0.25, 0.14, 0.48, i === 0 || i === 6 ? k.tone(C.hazard, 0.08) : wood);
  }
  for (const [x, z] of [[-0.9, -0.42], [0.9, -0.42], [-0.9, 0.42], [0.9, 0.42]] as const) k.cube(x, 0.17, z, 0.08, 0.06, 0.08, C.iron);
  const label = textTile(k.inst.text ?? 'SITE', 'stencil');
  k.sub(0, 0.145, 0, 0, 90).picture(0, 0, 0, 0.3 * label.aspect, 0.3, label.uv, [0.8, 0.8, 0.75]);
}

/** The master switch on a wall: a grey steel box, a lever on its side, a lamp that comes on with the mains. Its foot is at `y`. */
export function breakerBox(k: Kit): void {
  const y = k.inst.y ?? 0.9;
  const c = k.tone(0x5c6a70, 0.06);
  k.box(-0.32, y, -0.2, 0.32, y + 0.95, 0, c, { bottom: true });
  k.plate(-0.27, y + 0.06, 0.27, y + 0.89, -0.203, [c[0] * 0.8, c[1] * 0.8, c[2] * 0.8]);
  k.box(-0.3, y + 0.95, -0.22, 0.3, y + 0.98, 0, C.iron, { bottom: true });
  // The lever, down until somebody throws it.
  k.box(0.32, y + 0.4, -0.14, 0.38, y + 0.62, -0.06, C.iron, { bottom: true });
  const arm = k.sub(0.38, y + 0.5, -0.1, 0, 0, -125);
  arm.box(-0.025, 0, -0.025, 0.025, 0.36, 0.025, C.steel);
  arm.box(-0.05, 0.32, -0.05, 0.05, 0.44, 0.05, C.red, { bottom: true });
  const label = textTile('MAINS', 'hazard');
  k.picture(0, y + 0.66, -0.206, 0.15 * label.aspect, 0.15, label.uv);
  k.plate(-0.2, y + 0.3, 0.2, y + 0.46, -0.206, C.iron);
  k.plate(-0.16, y + 0.14, -0.08, y + 0.22, -0.206, [1.5, 0.3, 0.2], 'on');
  k.plate(0.08, y + 0.14, 0.16, y + 0.22, -0.206, [0.4, 1.4, 0.5], 'power');
  // Conduit down to the roof and away.
  k.box(-0.04, 0, -0.1, 0.04, y, -0.02, C.steelDark, { noTop: true });
}
