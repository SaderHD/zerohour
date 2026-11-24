import { C } from './palette';
import type { Kit } from './kit';

// Bunkhouse and washroom.

/** A two-tier bunk, 1 x 2 m, head towards +z. Blankets come in a few colours; some bunks are stripped. */
export function bunkBed(k: Kit): void {
  const frame = k.tone(C.steelDark, 0.08);
  for (const x of [-0.46, 0.4]) for (const z of [-0.96, 0.9]) k.box(x, 0, z, x + 0.06, 1.8, z + 0.06, frame);
  for (const y of [0.32, 1.22]) {
    k.box(-0.44, y, -0.94, 0.44, y + 0.07, 0.94, frame, { bottom: y > 1 });
    const made = !k.rng.chance(0.25);
    k.box(-0.4, y + 0.07, -0.9, 0.4, y + 0.19, 0.9, k.tone(C.canvas, 0.08));
    if (made) k.box(-0.41, y + 0.19, -0.9, 0.41, y + 0.23, 0.35, k.tone(k.rng.pick(C.blankets), 0.1));
    else k.sub(k.rng.range(-0.1, 0.1), y + 0.19, -0.4, k.rng.range(-25, 25)).box(-0.3, 0, -0.3, 0.3, 0.12, 0.3, k.tone(k.rng.pick(C.blankets), 0.1));
    k.box(-0.28, y + 0.19, 0.5, 0.28, y + 0.28, 0.85, C.enamel);
  }
}

export function footlocker(k: Kit): void {
  const c = k.tone(C.olive, 0.12);
  k.box(-0.46, 0, -0.22, 0.46, 0.4, 0.22, c);
  k.box(-0.48, 0.4, -0.24, 0.48, 0.48, 0.24, [c[0] * 0.8, c[1] * 0.8, c[2] * 0.8]);
  k.box(-0.05, 0.3, -0.25, 0.05, 0.42, -0.22, C.brass);
}

/** A pot-belly stove, still lit, with its flue running up through the roof. */
export function potbelly(k: Kit): void {
  k.box(-0.42, 0, -0.42, 0.42, 0.04, 0.42, C.steelDark);
  for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]] as const) k.box(x - 0.03, 0.04, z - 0.03, x + 0.03, 0.2, z + 0.03, C.iron);
  k.cyl(0, 0, 0.2, 0.55, 0.24, 0.32, C.iron, 8);
  k.cyl(0, 0, 0.55, 0.95, 0.32, 0.2, C.iron, 8);
  k.cyl(0, 0, 0.95, k.ceil, 0.08, 0.08, k.tone(C.steelDark), 6, { noTop: true });
  // The door grate, facing the front.
  k.box(-0.13, 0.36, -0.33, 0.13, 0.6, -0.3, C.ember, { glow: 'fire' });
  for (const x of [-0.07, 0.02]) k.box(x, 0.36, -0.34, x + 0.035, 0.6, -0.33, C.iron);
  k.box(0.25, 0, -0.35, 0.4, 0.22, -0.2, k.tone(C.steel));
}

/** A storm lantern; set `y` to stand it on a table. */
export function lantern(k: Kit): void {
  const y = k.inst.y ?? 0;
  k.cyl(0, 0, y, y + 0.05, 0.07, 0.07, C.iron, 6);
  k.cyl(0, 0, y + 0.05, y + 0.2, 0.05, 0.05, C.flame, 6, { glow: 'fire' });
  k.cyl(0, 0, y + 0.2, y + 0.27, 0.07, 0.02, C.iron, 6);
}

/** A washbasin on the wall behind it (+z), with a mirror above. */
export function sink(k: Kit): void {
  k.box(-0.36, 0.72, -0.2, 0.36, 0.9, 0.24, k.tone(C.enamel, 0.05));
  k.box(-0.28, 0.9, -0.14, 0.28, 0.905, 0.14, C.steelDark, {});
  k.box(-0.05, 0, 0.05, 0.05, 0.72, 0.2, C.steelDark);
  k.box(-0.03, 0.9, 0.16, 0.03, 1.02, 0.2, C.steel);
  const cracked = k.rng.chance(0.3);
  k.box(-0.3, 1.25, 0.21, 0.3, 1.8, 0.24, C.woodDark);
  k.box(-0.26, 1.29, 0.2, 0.26, 1.76, 0.21, cracked ? 0x4a5458 : 0x9ab0b8);
  if (cracked) k.sub(0, 1.5, 0.198, 0, 0, 35).box(-0.25, -0.01, -0.001, 0.2, 0.01, 0, C.iron);
}

/** A toilet stall, 1 wide and 1.5 deep, door at the front: shut, ajar, or gone. */
export function stall(k: Kit): void {
  const wall = k.tone(C.cabinet, 0.06);
  k.box(-0.49, 0.15, -0.72, -0.45, 2, 0.75, wall, { bottom: true });
  k.box(0.45, 0.15, -0.72, 0.49, 2, 0.75, wall, { bottom: true });
  k.box(-0.49, 0, -0.74, -0.43, 2, -0.68, C.steelDark);
  k.box(0.43, 0, -0.74, 0.49, 2, -0.68, C.steelDark);
  const state = k.variant % 3; // 0 shut, 1 ajar, 2 no door
  if (state < 2) k.sub(-0.43, 0, -0.71, state === 1 ? k.rng.range(-80, -40) : 0).box(0, 0.2, -0.04, 0.86, 1.9, 0, k.tone(C.olive, 0.08), { bottom: true });
  k.cyl(0, 0.3, 0, 0.42, 0.16, 0.2, C.enamel, 8);
  k.box(-0.2, 0.42, 0.52, 0.2, 0.95, 0.72, C.enamel);
}

export function boiler(k: Kit): void {
  k.cyl(0, 0, 0.1, 1.7, 0.22, 0.22, k.tone(C.enamel, 0.08), 8);
  k.cyl(0, 0, 0, 0.1, 0.16, 0.16, C.iron, 8, { noTop: true });
  k.box(-0.03, 1.7, -0.03, 0.03, k.ceil, 0.03, C.rust, { noTop: true });
  k.box(-0.06, 1.1, -0.26, 0.06, 1.22, -0.22, C.brass);
}

export function bin(k: Kit): void {
  k.cyl(0, 0, 0, 0.58, 0.16, 0.21, k.tone(C.steelDark, 0.1), 8, { noTop: true });
  k.cyl(0, 0, 0.5, 0.52, 0.18, 0.18, k.tone(C.paper, 0.2), 8);
}
