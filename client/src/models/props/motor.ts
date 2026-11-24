import { textTile } from '../../render/signs';
import { crateAt } from './common';
import { C } from './palette';
import { axleStand, drumX, snowCap, wheel } from './parts';
import type { Kit } from './kit';

// Motor pool.

const STAND = 0.62;

/** The front half of a truck: bonnet to the front (-z), cab behind. Variant 1 is on stands, wheels off; 2 is snowed in. */
export function truckCab(k: Kit): void {
  const paint = k.tone(C.drab, 0.06);
  const dark: [number, number, number] = [paint[0] * 0.6, paint[1] * 0.6, paint[2] * 0.6];
  k.box(-0.45, 0.55, -0.98, 0.45, 0.75, 1, C.iron, { bottom: true });
  drumX(k, 0.5, -0.45, -1.0, 1.0, 0.07, C.iron, 6);
  // Bonnet, grille, lamps, bumper.
  k.box(-0.72, 0.75, -0.98, 0.72, 1.5, -0.1, paint, { bottom: true });
  for (let i = 0; i < 5; i++) k.plate(-0.5, 0.86 + i * 0.12, 0.5, 0.93 + i * 0.12, -0.985, C.iron);
  for (const x of [-0.92, 0.92]) {
    k.box(x - 0.3, 0.98, -0.95, x + 0.3, 1.08, 0.05, dark, { bottom: true });
    k.sub(x, 1.22, -0.92, 0, -90).cyl(0, 0, 0, 0.1, 0.13, 0.11, C.enamel, 6);
  }
  k.box(-1.2, 0.5, -1, 1.2, 0.68, -0.9, C.iron, { bottom: true });
  // Cab: windscreen, side windows, a canvas roof.
  k.box(-1.08, 0.72, -0.1, 1.08, 1.5, 1, paint, { bottom: true });
  k.box(-1.04, 1.5, 0, 1.04, 2.12, 1, paint);
  k.box(-1.1, 2.12, -0.1, 1.1, 2.22, 1, k.tone(C.tarp, 0.08), { bottom: true });
  k.plate(-0.92, 1.56, -0.06, 2.04, -0.005, C.darkGlass);
  k.plate(0.06, 1.56, 0.92, 2.04, -0.005, C.darkGlass);
  for (const side of [90, 270]) {
    const s = k.sub(0, 0, 0.45, side);
    s.plate(-0.4, 1.56, 0.36, 2.02, -1.045, C.darkGlass);
    s.plate(-0.42, 0.8, -0.4, 1.5, -1.085, dark);
    s.box(0.2, 1.2, -1.11, 0.32, 1.24, -1.08, C.steel);
  }
  if (k.variant === 1) {
    for (const x of [-0.85, 0.85]) {
      axleStand(k, x, -0.45, STAND - 0.12);
      drumX(k, 0.5, -0.45, x - 0.14 + Math.sign(x) * 0.2, x + 0.14 + Math.sign(x) * 0.2, 0.2, C.rust, 6);
    }
    // Bonnet side panel propped open, and the lamp someone was working by.
    k.sub(0.72, 1.5, -0.55, 0, 0, -50).box(0, -0.6, -0.42, 0.03, 0, 0.42, paint);
  } else {
    for (const x of [-1.02, 1.02]) wheel(k, x, -0.45, 0.5, 0.3);
  }
  if (k.variant === 2) {
    snowCap(k, -0.72, -0.98, 0.72, -0.1, 1.5, 0.1);
    snowCap(k, -1.1, -0.1, 1.1, 1, 2.22, 0.12);
    for (const x of [-0.95, 0.95]) k.cyl(x, -0.6, 0, 0.35, 0.5, 0.1, k.tone(C.snow, 0.04), 5);
  }
}

/** The back half: a drop-side bed on the chassis, twin rear wheels. Variant 1 is on stands. */
export function truckBed(k: Kit): void {
  const paint = k.tone(C.drab, 0.06);
  const wood = k.tone(C.wood, 0.1);
  k.box(-0.45, 0.55, -1.75, 0.45, 0.75, 1.7, C.iron, { bottom: true });
  for (const z of [-1.2, 0, 1.2]) k.box(-1.15, 0.75, z - 0.06, 1.15, 0.93, z + 0.06, C.iron, { bottom: true });
  k.box(-1.2, 0.93, -1.7, 1.2, 1.0, 1.72, wood, { bottom: true });
  k.box(-1.2, 1, -1.7, 1.2, 1.85, -1.62, paint);
  for (const x of [-1.2, 1.14]) k.box(x, 1, -1.62, x + 0.06, 1.42, 1.72, paint);
  // Tailgate down.
  k.sub(0, 0.98, 1.72, 0, 75).box(-1.14, -0.42, 0, 1.14, 0, 0.05, paint, { bottom: true });
  // Load: a crate, a drum on its side, a tarpaulin heap.
  crateAt(k.sub(-0.55, 1.0, -1.05, 0), 0, 0.8, 0.7);
  drumX(k, 1.27, 0.2, -0.3, 0.6, 0.27, k.tone(C.rust, 0.1));
  k.cyl(0.4, 1.1, 1.0, 1.32, 0.55, 0.2, k.tone(C.tarp, 0.1), 6);
  drumX(k, 0.5, 0.75, -1.0, 1.0, 0.09, C.iron, 6);
  if (k.variant === 1) {
    for (const x of [-0.8, 0.8]) {
      axleStand(k, x, 0.75, STAND - 0.12);
      drumX(k, 0.5, 0.75, x - 0.12 + Math.sign(x) * 0.25, x + 0.12 + Math.sign(x) * 0.25, 0.2, C.rust, 6);
    }
  } else {
    for (const x of [-0.92, 0.92]) wheel(k, x, 0.75, 0.5, 0.5);
  }
  for (const x of [-1.0, 1.0]) k.box(x - 0.28, 0.96, 0.2, x + 0.28, 1.0, 1.3, C.iron, { bottom: true, noTop: true });
  if (k.variant === 2) {
    snowCap(k, -1.14, -1.6, 1.14, 0.9, 1.0, 0.12);
    k.cyl(0.4, 1.1, 1.32, 1.42, 0.2, 0.05, k.tone(C.snow, 0.04), 6);
    for (const x of [-0.95, 0.95]) k.cyl(x, 0.9, 0, 0.4, 0.55, 0.1, k.tone(C.snow, 0.04), 5);
  }
}

/** The fitters' bench: back to the wall (+z), a vice, a stripped part, a shelf of tins underneath. */
export function workbench(k: Kit): void {
  k.box(-1.5, 0.84, -0.5, 1.5, 0.95, 0.48, k.tone(C.woodDark, 0.08));
  for (const x of [-1.42, 1.34]) for (const z of [-0.42, 0.36]) k.box(x, 0, z, x + 0.08, 0.84, z + 0.08, C.steelDark);
  k.box(-1.4, 0.25, -0.38, 1.4, 0.3, 0.4, k.tone(C.wood, 0.1), { bottom: true });
  k.box(-1.5, 0.95, 0.42, 1.5, 1.25, 0.48, k.tone(C.woodDark, 0.08));
  for (let i = 0; i < 5; i++) {
    const x = -1.2 + i * 0.55 + k.rng.range(-0.1, 0.1);
    k.cyl(x, k.rng.range(-0.1, 0.2), 0.3, 0.3 + k.rng.range(0.18, 0.34), 0.11, 0.11, k.tone(k.rng.pick([C.red, C.olive, C.steel, C.blue, C.rust]), 0.1), 6);
  }
  // Vice.
  k.box(-1.3, 0.95, -0.44, -1.02, 1.03, -0.16, C.iron);
  k.box(-1.26, 1.03, -0.42, -1.2, 1.2, -0.2, C.steelDark);
  k.box(-1.12, 1.03, -0.42, -1.06, 1.2, -0.2, C.steelDark);
  k.box(-1.02, 1.08, -0.32, -0.8, 1.11, -0.29, C.steel);
  // A carburettor in bits, a can, rags, spanners.
  k.sub(0.15, 0.95, -0.05, k.rng.range(-30, 30)).box(-0.18, 0, -0.14, 0.18, 0.2, 0.14, k.tone(C.steel, 0.1));
  k.cyl(0.2, 0, 1.15, 1.26, 0.07, 0.05, C.steelDark, 6);
  k.cyl(0.95, 0.1, 0.95, 1.18, 0.09, 0.07, C.red, 6);
  k.cyl(1.0, 0.1, 1.18, 1.3, 0.015, 0.015, C.brass, 4);
  k.sub(0.6, 0.95, -0.25, k.rng.range(0, 90)).box(-0.14, 0, -0.1, 0.14, 0.03, 0.1, k.tone(C.canvas, 0.2));
  for (let i = 0; i < 3; i++) k.sub(-0.5 + i * 0.12, 0.952, -0.2, k.rng.range(-50, 50)).box(-0.015, 0, -0.14, 0.015, 0.012, 0.14, C.steel);
}

/** Pegboard on the wall, each tool on its painted outline. Some outlines are empty. */
export function toolBoard(k: Kit): void {
  const y = k.inst.y ?? 1.75;
  k.box(-1.2, y - 0.6, -0.04, 1.2, y + 0.6, 0, k.tone(C.woodPale, 0.06));
  const z = -0.045;
  // Spanners in a falling row, a saw, hammers, a square.
  for (let i = 0; i < 6; i++) {
    const s = k.sub(-1.02 + i * 0.16, y + 0.12, z, 0, 0, -8);
    const h = 0.42 - i * 0.045;
    if (i === 3) s.plate(-0.02, -h / 2, 0.02, h / 2, 0, C.red);
    else s.plate(-0.02, -h / 2, 0.02, h / 2, 0, C.steel);
  }
  const saw = k.sub(0.45, y + 0.3, z, 0, 0, 0);
  saw.plate(-0.42, -0.07, 0.2, 0.05, 0, C.steel);
  saw.plate(0.2, -0.1, 0.4, 0.1, 0, C.wood);
  for (const [x, c] of [[-0.02, C.wood], [0.22, C.wood], [0.46, C.red]] as const) {
    const h = k.sub(x, y - 0.22, z, 0, 0, k.rng.range(-6, 6));
    h.plate(-0.02, -0.2, 0.02, 0.16, 0, c);
    h.plate(-0.09, 0.16, 0.09, 0.23, 0, C.iron);
  }
  k.plate(0.72, y - 0.42, 0.76, y + 0.02, z, C.steel);
  k.plate(0.72, y - 0.42, 1.04, y - 0.38, z, C.steel);
  k.sub(-0.7, y - 0.28, z).plate(-0.3, -0.03, 0.3, 0.03, 0, C.iron);
  for (const x of [-0.95, -0.8, -0.65, -0.5]) k.plate(x, y - 0.5, x + 0.07, y - 0.36, z, k.rng.pick([C.steel, C.brass, C.red]));
  k.box(-1.2, y - 0.68, -0.14, 1.2, y - 0.64, 0, C.woodDark, { bottom: true });
}

/** A roller shutter 4 m wide, down and seized: slats, guide rails, the drum housing, a hand chain. */
export function rollerDoor(k: Kit): void {
  const slat = k.tone(0x6a7078, 0.05);
  k.box(-1.9, 0, -0.06, 1.9, 3.0, 0, slat, { noTop: true });
  for (let y = 0.2; y < 3.0; y += 0.22) k.box(-1.9, y, -0.085, 1.9, y + 0.06, -0.06, [slat[0] * 0.72, slat[1] * 0.72, slat[2] * 0.72], { bottom: true });
  for (let i = 0; i < 12; i++) k.plate(-1.9 + i * (3.8 / 12), 0, -1.9 + (i + 1) * (3.8 / 12), 0.18, -0.09, i % 2 ? [0.02, 0.02, 0.02] : C.hazard);
  for (const x of [-2, 1.9]) k.box(x, 0, -0.14, x + 0.1, 3.0, 0, C.steelDark);
  k.box(-2.05, 3.0, -0.3, 2.05, 3.4, 0, k.tone(C.steelDark, 0.06), { bottom: true });
  k.box(1.78, 0.9, -0.17, 1.8, 3.0, -0.15, C.iron);
  k.box(1.72, 0.9, -0.17, 1.74, 3.0, -0.15, C.iron);
  // Snow has blown in underneath.
  for (let i = 0; i < 4; i++) {
    const x = k.rng.range(-1.7, 1.7);
    k.cyl(x, -0.12, 0, k.rng.range(0.05, 0.14), k.rng.range(0.3, 0.55), 0.08, k.tone(C.frost, 0.05), 5);
  }
  const label = textTile(k.inst.text ?? 'BAY 1', 'stencil');
  k.picture(0, 2.2, -0.092, 0.4 * label.aspect, 0.4, label.uv);
}

function tyreAt(k: Kit, y: number, r: number): void {
  const s = k.sub(k.rng.range(-0.05, 0.05), y, k.rng.range(-0.05, 0.05), k.rng.range(0, 45));
  s.cyl(0, 0, 0, 0.24, r, r, k.tone(C.rubber, 0.25), 8, { noTop: true });
  // The top is a ring: tread, then the dark of the hole.
  s.cyl(0, 0, 0.24, 0.24, r, r, k.tone(0x2c2c30, 0.2), 8);
  s.cyl(0, 0, 0.241, 0.241, r * 0.52, r * 0.52, [0.006, 0.006, 0.008], 8);
}

/** A stack of tyres. */
export function tyres(k: Kit): void {
  const n = k.variant === 1 ? 3 : 4;
  for (let i = 0; i < n; i++) tyreAt(k, i * 0.245, 0.44 - (i === n - 1 ? 0.03 : 0));
}

/** One tyre flat on the floor; variant 1 leans on whatever is behind it (+z). */
export function tyre(k: Kit): void {
  if (k.variant === 1) tyreAt(k.sub(0, 0.42, 0.1, 0, -78), -0.12, 0.44);
  else tyreAt(k, 0, 0.44);
}

/** A roller cabinet of tools. */
export function toolChest(k: Kit): void {
  const c = k.tone(C.red, 0.08);
  k.box(-0.46, 0.1, -0.22, 0.46, 0.92, 0.22, c);
  for (let i = 0; i < 5; i++) {
    k.plate(-0.42, 0.16 + i * 0.15, 0.42, 0.28 + i * 0.15, -0.224, [c[0] * 0.75, c[1] * 0.75, c[2] * 0.75]);
    k.box(-0.2, 0.2 + i * 0.15, -0.245, 0.2, 0.22 + i * 0.15, -0.224, C.steel);
  }
  for (const x of [-0.38, 0.38]) for (const z of [-0.16, 0.16]) k.cyl(x, z, 0, 0.1, 0.05, 0.05, C.rubber, 6);
  k.sub(k.rng.range(-0.2, 0.2), 0.92, 0, k.rng.range(-30, 30)).box(-0.16, 0, -0.07, 0.16, 0.09, 0.07, C.steelDark);
}

/** A mechanic's board on castors. */
export function creeper(k: Kit): void {
  k.box(-0.45, 0.07, -0.2, 0.45, 0.1, 0.2, k.tone(C.wood, 0.1), { bottom: true });
  k.box(0.28, 0.1, -0.14, 0.45, 0.15, 0.14, C.rubber);
  for (const x of [-0.38, 0.38]) for (const z of [-0.16, 0.16]) k.cyl(x, z, 0, 0.07, 0.035, 0.035, C.iron, 5);
}

/** Old oil on the floor. */
export function oilStain(k: Kit): void {
  for (let i = 0; i < 3; i++) {
    const r = k.rng.range(0.25, 0.6);
    k.sub(k.rng.range(-0.4, 0.4), 0.011 + i * 0.001, k.rng.range(-0.3, 0.3), k.rng.range(0, 360)).face(
      [[-r, 0, -r * 0.6], [-r * 0.7, 0, r * 0.7], [r, 0, r * 0.5], [r * 0.6, 0, -r * 0.8]], [0, 1, 0], [0.035, 0.032, 0.03]);
  }
}

/** An oil drum with holes punched in it and a fire inside. */
export function brazier(k: Kit): void {
  k.cyl(0, 0, 0.06, 0.92, 0.25, 0.25, k.tone(0x3a2a22, 0.12), 8, { noTop: true });
  for (const [x, z] of [[-0.17, -0.17], [0.17, -0.17], [0, 0.22]] as const) k.box(x - 0.03, 0, z - 0.03, x + 0.03, 0.06, z + 0.03, C.iron);
  k.cyl(0, 0, 0.8, 0.8, 0.24, 0.24, C.ember, 8, { glow: 'fire' });
  for (let i = 0; i < 8; i++) k.sub(0, 0, 0, i * 45).plate(-0.035, 0.3 + (i % 2) * 0.22, 0.035, 0.37 + (i % 2) * 0.22, -0.252, C.ember, 'fire');
  for (let i = 0; i < 3; i++) k.sub(k.rng.range(-0.08, 0.08), 0.8, k.rng.range(-0.08, 0.08), k.rng.range(0, 360)).box(-0.02, 0, -0.02, 0.02, k.rng.range(0.12, 0.24), 0.02, C.flame, { glow: 'fire' });
}
