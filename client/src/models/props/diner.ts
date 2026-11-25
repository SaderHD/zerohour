import type { RGB } from '../../render/bake';
import { C } from './palette';
import { snowCap, strut } from './parts';
import type { Kit } from './kit';

// The diner kit (The Longest Night): the Starlight, where the game starts. Chrome, red leatherette,
// plates nobody cleared, and a sign that has never been switched off.

const VINYL = 0x8a2a26;
const CHROME = 0xa8b0b4;
const FORMICA = 0xc8c4b0;
const CREAM = 0xd8d0b8;
const NEON_RED: RGB = [1.9, 0.28, 0.2];
const NEON_BLUE: RGB = [0.3, 0.75, 1.9];
const NEON_GOLD: RGB = [1.7, 1.25, 0.4];

/** A plate with something left on it, a cup beside it. */
function place(k: Kit, x: number, y: number, z: number): void {
  k.cyl(x, z, y, y + 0.02, 0.11, 0.13, CREAM, 6);
  if (k.rng.chance(0.7)) k.cube(x + k.rng.range(-0.03, 0.03), y + 0.04, z, 0.1, 0.04, 0.08, k.tone([0x7a5a30, 0x9a3028, 0xb89848][k.rng.int(0, 2)]!, 0.1));
  if (k.rng.chance(0.6)) k.cyl(x + 0.19, z + k.rng.range(-0.08, 0.08), y, y + 0.08, 0.035, 0.04, C.enamel, 5);
}

/** A booth: the wall at +z, a bench each side of the table. */
export function dinerBooth(k: Kit): void {
  const vinyl = k.tone(VINYL, 0.06);
  for (const s of [-1, 1]) {
    const b = k.sub(0, 0, 0, s < 0 ? 0 : 180).sub(0, 0, 0);
    // (Drawn once on the left and once turned about: each bench's back is outermost.)
    b.box(-1, 0, -0.7, -0.5, 0.42, 0.7, k.tone(0x4a3a30, 0.05));
    b.box(-0.96, 0.42, -0.68, -0.5, 0.5, 0.68, vinyl);
    b.box(-1, 0.42, -0.7, -0.9, 1.15, 0.7, vinyl);
    b.box(-1.01, 1.15, -0.71, -0.89, 1.19, 0.71, CHROME, { bottom: true });
  }
  // The table on one leg, a strip of chrome round its edge.
  k.cyl(0, 0, 0, 0.72, 0.06, 0.06, CHROME, 6, { noTop: true });
  k.cyl(0, 0, 0, 0.03, 0.2, 0.2, C.steelDark, 6);
  k.box(-0.42, 0.72, -0.62, 0.42, 0.76, 0.7, FORMICA, { bottom: true });
  k.box(-0.43, 0.725, -0.63, 0.43, 0.755, -0.62, CHROME, { bottom: true });
  for (const x of [-0.22, 0.22]) for (const z of [-0.3, 0.25]) if (k.rng.chance(0.75)) place(k, x, 0.76, z);
  // What every table has: sauce, sugar, a rack of napkins against the wall.
  k.cyl(0, 0.58, 0.76, 0.92, 0.03, 0.02, C.red, 5);
  k.cyl(0.09, 0.6, 0.76, 0.88, 0.03, 0.03, C.glass, 5);
  k.cube(-0.12, 0.82, 0.6, 0.12, 0.12, 0.06, CHROME);
}

/** One stool: a chrome post bolted down, a red top. */
function counterStool(k: Kit, x: number, z: number): void {
  k.cyl(x, z, 0, 0.03, 0.17, 0.15, CHROME, 6);
  k.cyl(x, z, 0.03, 0.6, 0.035, 0.035, CHROME, 5, { noTop: true });
  k.cyl(x, z, 0.6, 0.7, 0.16, 0.18, k.tone(VINYL, 0.08), 8, { bottom: true });
}

/** Two metres of counter, the front (-z) to the customers: stools along it, what was served still on it. */
export function dinerCounter(k: Kit): void {
  k.box(-1, 0, -0.3, 1, 0.98, 0.5, k.tone(0x6a7478, 0.04));
  for (let i = 0; i < 4; i++) k.plate(-0.96 + i * 0.5, 0.14, -0.54 + i * 0.5, 0.9, -0.302, i % 2 ? CREAM : k.tone(VINYL, 0.05));
  k.box(-1, 0.98, -0.48, 1, 1.04, 0.5, FORMICA, { bottom: true });
  k.box(-1, 0.99, -0.5, 1, 1.03, -0.48, CHROME, { bottom: true });
  k.box(-1, 0.14, -0.42, 1, 0.2, -0.3, CHROME, { bottom: true });
  for (const x of [-0.66, 0, 0.66]) counterStool(k, x, -0.78);
  if (k.variant === 1) {
    // The pie case: three shelves under glass, most of a pie on each, its lamp still on.
    for (const x of [-0.5, 0.46]) for (const z of [-0.2, 0.26]) k.box(x, 1.04, z, x + 0.04, 1.62, z + 0.04, CHROME, { noTop: true });
    k.box(-0.52, 1.62, -0.22, 0.52, 1.68, 0.32, CHROME, { bottom: true });
    k.box(-0.46, 1.6, -0.16, 0.46, 1.62, 0.26, [1.4, 1.2, 0.8], { glow: 'on', bottom: true });
    for (const [i, y] of [1.06, 1.25, 1.44].entries()) {
      k.box(-0.46, y - 0.02, -0.16, 0.46, y, 0.26, C.glass, { bottom: true });
      k.cyl(-0.18 + (i % 2) * 0.34, 0.05, y, y + 0.07, 0.17, 0.15, k.tone([0xb88838, 0x7a2a30, 0xc8b070][i]!, 0.06), 6);
    }
    place(k, 0.78, 1.04, -0.2);
  } else if (k.variant === 2) {
    // The till, and the coffee urn with its light on.
    k.box(-0.7, 1.04, -0.1, -0.2, 1.3, 0.36, C.steelDark);
    k.sub(-0.45, 1.3, -0.1, 0, -25).box(-0.22, 0, 0, 0.22, 0.2, 0.24, C.steelDark);
    k.plate(-0.6, 1.36, -0.3, 1.44, -0.104, [0.5, 1.3, 0.6], 'on');
    k.cyl(0.5, 0.1, 1.04, 1.1, 0.16, 0.16, C.steelDark, 8);
    k.cyl(0.5, 0.1, 1.1, 1.62, 0.15, 0.15, CHROME, 8);
    k.cyl(0.5, 0.1, 1.62, 1.7, 0.15, 0.05, C.steelDark, 8);
    k.cube(0.5, 1.2, -0.06, 0.04, 0.04, 0.03, [1.6, 0.3, 0.2], { glow: 'on' });
    for (const x of [0.12, 0.84]) k.cyl(x, -0.15, 1.04, 1.12, 0.035, 0.04, C.enamel, 5);
  } else {
    for (const x of [-0.66, 0, 0.66]) if (k.rng.chance(0.8)) place(k, x - 0.06, 1.04, -0.2);
    k.cube(0.33, 1.1, 0.2, 0.12, 0.12, 0.06, CHROME);
  }
}

/** A jukebox: an arch of coloured light over a window on the record, the selector under it. */
export function jukebox(k: Kit): void {
  const wood = k.tone(0x5a3424, 0.05);
  k.box(-0.42, 0, -0.3, 0.42, 1.05, 0.4, wood);
  k.box(-0.38, 1.05, -0.28, 0.38, 1.4, 0.4, wood);
  k.box(-0.26, 1.4, -0.26, 0.26, 1.56, 0.4, wood);
  // The arch, in tubes of colour.
  for (const [x0, x1, y0, y1, c] of [
    [-0.44, -0.36, 0.2, 1.08, NEON_RED], [0.36, 0.44, 0.2, 1.08, NEON_RED],
    [-0.4, -0.3, 1.08, 1.42, NEON_GOLD], [0.3, 0.4, 1.08, 1.42, NEON_GOLD],
    [-0.28, 0.28, 1.42, 1.5, NEON_BLUE],
  ] as const) k.box(x0, y0, -0.34, x1, y1, -0.26, c, { glow: 'on', bottom: true });
  // The record under glass, the arm on it; the grille, the buttons.
  k.plate(-0.3, 1.02, 0.3, 1.38, -0.285, [1.1, 0.85, 0.45], 'on');
  k.sub(0, 1.2, -0.29, 0, 90).cyl(0, 0, 0, 0.012, 0.15, 0.15, 0x0c0c0e, 8);
  k.cube(0, 1.2, -0.305, 0.07, 0.07, 0.01, C.red);
  k.plate(-0.3, 0.2, 0.3, 0.62, -0.302, 0x2a1c14);
  for (let i = 0; i < 5; i++) k.plate(-0.26 + i * 0.11, 0.22, -0.2 + i * 0.11, 0.6, -0.304, CHROME);
  k.box(-0.34, 0.72, -0.36, 0.34, 0.95, -0.3, CHROME, { bottom: true });
  for (let i = 0; i < 6; i++) k.plate(-0.29 + i * 0.1, 0.78, -0.23 + i * 0.1, 0.9, -0.362, i % 2 ? CREAM : [1.2, 0.9, 0.4], i % 2 ? undefined : 'on');
}

/** A refrigerator: enamel, a chrome handle, a hum. */
export function fridge(k: Kit): void {
  const enamel = k.tone(C.enamel, 0.04);
  k.box(-0.45, 0.06, -0.4, 0.45, 1.95, 0.45, enamel);
  k.box(-0.42, 0, -0.36, 0.42, 0.06, 0.42, C.iron, { noTop: true });
  k.plate(-0.45, 1.38, 0.45, 1.4, -0.402, C.steelDark);
  for (const y of [0.9, 1.5]) k.box(0.3, y, -0.46, 0.34, y + 0.3, -0.4, CHROME, { bottom: true });
  k.plate(-0.3, 1.6, -0.05, 1.8, -0.402, C.paper);
  k.box(-0.3, 1.95, -0.2, 0.2, 2.0, 0.3, C.cork);
}

/** The sign over the diner's door: three bands of neon on a fascia, and a star on a mast above the roof. */
export function dinerSign(k: Kit): void {
  const y = k.inst.y ?? 2.5;
  k.box(-1.5, y, -0.3, 1.5, y + 0.9, 0, k.tone(0x2a3c48, 0.05), { bottom: true });
  snowCap(k, -1.5, -0.3, 1.5, 0, y + 0.9, 0.1);
  k.box(-1.44, y + 0.68, -0.33, 1.44, y + 0.76, -0.3, NEON_RED, { glow: 'on', bottom: true });
  k.box(-1.44, y + 0.14, -0.33, 1.44, y + 0.22, -0.3, NEON_BLUE, { glow: 'on', bottom: true });
  // Where the name is: tubes with one gone dark, till the signwriter comes (M8).
  for (let i = 0; i < 9; i++) if (i !== 6) k.box(-1.28 + i * 0.3, y + 0.3, -0.33, -1.12 + i * 0.3, y + 0.6, -0.3, NEON_GOLD, { glow: i === 2 ? 'fire' : 'on', bottom: true });
  // The mast and the star.
  k.box(-0.05, y + 0.9, -0.2, 0.05, y + 2.3, -0.1, C.steelDark);
  strut(k, [-0.7, y + 0.9, -0.15], [0, y + 1.9, -0.15], 0.03, C.steelDark);
  strut(k, [0.7, y + 0.9, -0.15], [0, y + 1.9, -0.15], 0.03, C.steelDark);
  const star = k.sub(0, y + 2.75, -0.15);
  for (let i = 0; i < 5; i++) {
    const s = star.sub(0, 0, 0, 0, 0, i * 72);
    s.box(-0.07, 0.12, -0.05, 0.07, 0.62, 0.05, NEON_GOLD, { glow: 'on', bottom: true });
    s.sub(0, 0.3, 0, 0, 0, 36).box(-0.04, 0, -0.04, 0.04, 0.28, 0.04, NEON_GOLD, { glow: 'on', bottom: true });
  }
  star.cube(0, 0, 0, 0.3, 0.3, 0.08, NEON_GOLD, { glow: 'on', bottom: true });
}
