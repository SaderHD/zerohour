import { textTile } from '../../render/signs';
import { C } from './palette';
import type { Kit } from './kit';

// The vault: the Forge and what feeds it. Everything in here waits for the mains.

const ARC: [number, number, number] = [1.1, 0.5, 2.0];

/**
 * The Forge: a bed plate, two columns wound with coils, a crosshead and a ram over the cradle a
 * weapon is laid in. 2 m wide, open to the front (-z).
 */
export function forge(k: Kit): void {
  const iron = k.tone(0x3a3c44, 0.05);
  const steel = k.tone(C.steelDark, 0.05);
  // Bed plate with a hazard lip.
  k.box(-1, 0, -0.75, 1, 0.5, 0.75, iron);
  for (let i = 0; i < 10; i++) k.plate(-1 + i * 0.2, 0.36, -0.8 + i * 0.2, 0.5, -0.752, i % 2 ? [0.02, 0.02, 0.02] : C.hazard);
  k.box(-0.62, 0.5, -0.5, 0.62, 0.86, 0.4, steel);
  // The cradle: two forks, and the slot between them that glows.
  for (const x of [-0.42, 0.34]) k.box(x, 0.86, -0.3, x + 0.08, 1.02, 0.2, C.brass);
  k.box(-0.5, 0.86, -0.12, 0.5, 0.88, 0.02, ARC, { glow: 'power' });
  // Columns and their coils.
  for (const x of [-0.82, 0.82]) {
    k.cyl(x, 0.1, 0.5, 2.0, 0.11, 0.11, steel, 6, { noTop: true });
    for (let i = 0; i < 5; i++) {
      const y = 0.72 + i * 0.24;
      k.cyl(x, 0.1, y, y + 0.14, 0.2, 0.2, k.tone(C.copper, 0.08), 8);
      k.cyl(x, 0.1, y + 0.14, y + 0.2, 0.15, 0.15, ARC, 8, { glow: i % 2 ? 'tube' : 'power', noTop: true });
    }
  }
  // Crosshead, with its name on it, and the ram.
  k.box(-1, 2.0, -0.4, 1, 2.3, 0.6, iron, { bottom: true });
  const label = textTile('FORGE', 'stencil');
  k.picture(0, 2.15, -0.403, 0.22 * label.aspect, 0.22, label.uv);
  k.box(-0.2, 1.5, -0.2, 0.2, 2.0, 0.2, steel, { bottom: true });
  k.box(-0.3, 1.38, -0.26, 0.3, 1.5, 0.2, iron, { bottom: true });
  k.box(-0.24, 1.36, -0.2, 0.24, 1.38, 0.14, ARC, { glow: 'power', bottom: true });
  // Back plate: a window on the core, gauges, the feed coming down from the roof.
  k.box(-0.6, 0.86, 0.4, 0.6, 2.0, 0.7, iron);
  k.plate(-0.3, 1.0, 0.3, 1.34, 0.398, [0.5, 0.2, 0.9], 'tube');
  for (const x of [-0.5, 0.36]) k.plate(x, 1.6, x + 0.14, 1.74, 0.398, C.enamel, 'power');
  k.plate(-0.07, 1.62, 0.07, 1.72, 0.398, 0xff3020, 'fire');
  for (const x of [-0.4, 0.4]) k.box(x - 0.06, 2.3, 0.2, x + 0.06, k.ceil, 0.32, C.rubber, { noTop: true });
  // The lever that sets it going.
  k.box(0.88, 0.5, -0.7, 1.0, 1.0, -0.56, iron);
  k.sub(0.94, 0.95, -0.63, 0, -30).box(-0.02, 0, -0.02, 0.02, 0.34, 0.02, C.steel);
  k.sub(0.94, 0.95, -0.63, 0, -30).box(-0.05, 0.32, -0.04, 0.05, 0.4, 0.04, C.red);
}

/** A capacitor bank: a ribbed porcelain stack with a corona ring that lights with the mains. */
export function capacitor(k: Kit): void {
  k.box(-0.46, 0, -0.46, 0.46, 0.3, 0.46, k.tone(C.steelDark, 0.06));
  k.cyl(0, 0, 0.3, 1.7, 0.3, 0.26, k.tone(0x3c4650, 0.06), 8);
  for (let i = 0; i < 5; i++) k.cyl(0, 0, 0.44 + i * 0.26, 0.52 + i * 0.26, 0.38, 0.34, k.tone(C.enamel, 0.05), 8, { bottom: true });
  k.cyl(0, 0, 1.7, 1.86, 0.16, 0.16, C.brass, 6);
  k.cyl(0, 0, 1.86, 2.0, 0.42, 0.42, k.tone(C.steel, 0.05), 8, { bottom: true });
  k.cyl(0, 0, 1.9, 1.96, 0.44, 0.44, ARC, 8, { glow: k.variant === 1 ? 'tube' : 'power', noTop: true });
  k.box(-0.04, 2.0, -0.04, 0.04, k.ceil, 0.04, C.rubber, { noTop: true });
}

/** A transformer: a finned tank, two bushings, its plate. */
export function transformer(k: Kit): void {
  const c = k.tone(k.variant === 1 ? 0x56605a : 0x4c5660, 0.06);
  k.box(-0.36, 0.08, -0.36, 0.36, 1.0, 0.4, c);
  k.box(-0.42, 0, -0.42, 0.42, 0.08, 0.44, C.iron);
  for (let i = 0; i < 6; i++) {
    const x = -0.3 + i * 0.12;
    k.box(x - 0.015, 0.16, -0.46, x + 0.015, 0.92, -0.36, [c[0] * 0.8, c[1] * 0.8, c[2] * 0.8]);
  }
  for (const x of [-0.18, 0.18]) {
    k.cyl(x, 0.1, 1.0, 1.2, 0.07, 0.05, k.tone(C.enamel, 0.05), 6);
    k.box(x - 0.025, 1.2, 0.075, x + 0.025, k.ceil, 0.125, C.rubber, { noTop: true });
  }
  k.plate(-0.1, 1.02, 0.1, 1.1, -0.2, 0xff3020, 'fire');
  const label = textTile('11 kV', 'hazard');
  k.sub(0, 0, 0, 0).picture(0, 0.66, -0.465, 0.16 * label.aspect, 0.16, label.uv);
}

/** Heavy cables clipped along a wall at `y`: `s` metres of them. */
export function cableBundle(k: Kit): void {
  const len = k.inst.s ?? 3;
  const y = k.inst.y ?? 2.2;
  for (let i = 0; i < 3; i++) {
    const r = i === 1 ? 0.045 : 0.03;
    const cy = y + (i - 1) * 0.085 + k.rng.range(-0.01, 0.01);
    k.box(-len / 2, cy - r, -0.03 - r * 2, len / 2, cy + r, -0.03, i === 1 ? C.rubber : k.tone(0x3a2c28, 0.12), { bottom: true });
  }
  for (let x = -len / 2 + 0.3; x < len / 2; x += 1.1) k.box(x, y - 0.15, -0.14, x + 0.05, y + 0.15, 0, C.steelDark, { bottom: true });
}
