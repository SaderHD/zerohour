import { chalkTile } from '../../render/signs';
import { C } from './palette';
import type { Kit } from './kit';
import { shelfUnit } from './common';

// Laboratory.

/** An island bench: black top, drawers, and a clutter of glassware (some of it still glowing). */
export function labBench(k: Kit): void {
  const body = k.tone(C.cabinet, 0.05);
  k.box(-1.44, 0.08, -0.44, 1.44, 0.89, 0.44, body);
  k.box(-1.4, 0, -0.38, 1.4, 0.08, 0.38, C.iron);
  k.box(-1.5, 0.89, -0.5, 1.5, 0.95, 0.5, C.slate);
  for (const x of [-0.72, 0.72]) k.box(x - 0.02, 0.12, -0.45, x + 0.02, 0.86, 0.45, C.steelDark);
  // Glassware.
  for (let i = 0; i < 5; i++) {
    const x = k.rng.range(-1.25, 1.25);
    const z = k.rng.range(-0.3, 0.3);
    const glows = k.rng.chance(0.35);
    const h = k.rng.range(0.12, 0.3);
    k.cyl(x, z, 0.95, 0.95 + h, k.rng.range(0.04, 0.08), 0.03, glows ? C.specimen : C.glass, 6, glows ? { glow: 'on' } : {});
  }
  // A microscope or a rack, and a ring stand.
  const m = k.sub(k.rng.range(-0.9, 0.9), 0.95, k.rng.range(-0.15, 0.15), k.rng.range(0, 360));
  m.box(-0.1, 0, -0.14, 0.1, 0.04, 0.14, C.iron);
  m.box(-0.03, 0.04, 0.06, 0.03, 0.34, 0.12, C.iron);
  m.box(-0.04, 0.22, -0.1, 0.04, 0.34, 0.06, C.steel);
}

/** A specimen tank. Variant 1 is smashed and dark, its contents gone. */
export function tank(k: Kit): void {
  const steel = k.tone(C.steelDark, 0.08);
  k.cyl(0, 0, 0, 0.38, 0.46, 0.44, steel, 8);
  if (k.variant === 1) {
    k.cyl(0, 0, 0.38, 0.9, 0.39, 0.39, [0.03, 0.09, 0.07], 8, { noTop: true });
    k.cyl(0, 0, 0.38, 0.4, 0.38, 0.38, [0.05, 0.3, 0.2], 8, { glow: 'on' });
    for (const a of [20, 150, 260]) k.sub(0, 0.02, 0, a).face([[0.3, 0, -0.25], [0.3, 0, 0.3], [0.95, 0, 0.2], [0.8, 0, -0.2]], [0, 1, 0], [0.03, 0.2, 0.13], 'on');
  } else {
    const lit = k.variant === 2 ? 0.55 : 1;
    k.cyl(0, 0, 0.38, 1.9, 0.38, 0.38, [0.1 * lit, 0.62 * lit, 0.4 * lit], 8, { glow: 'on', noTop: true });
    // The thing inside, as a darker shape against the glow.
    const dark: [number, number, number] = [0.02, 0.17, 0.11];
    const lift = k.rng.range(-0.12, 0.12);
    for (const turn of [0, 90]) {
      const s = k.sub(0, lift, 0, turn);
      s.box(-0.1, 0.78, -0.362, 0.1, 1.36, 0.362, dark, { glow: 'on' });
      s.box(-0.07, 1.36, -0.362, 0.07, 1.56, 0.362, dark, { glow: 'on' });
    }
    for (let i = 0; i < 4; i++) k.sub(0, 0, 0, i * 90 + 22.5).box(0.37, 0.38, -0.03, 0.42, 1.9, 0.03, steel, { noTop: true });
  }
  k.cyl(0, 0, 1.9, 2.2, 0.44, 0.4, steel, 8, { bottom: true });
  k.box(-0.05, 2.2, -0.05, 0.05, k.ceil, 0.05, C.iron, { noTop: true });
}

/** A tape-reel computer cabinet: reels behind glass, rows of lamps that come alive with the power. */
export function computer(k: Kit): void {
  k.box(-0.47, 0, -0.4, 0.47, 1.9, 0.46, k.tone(0x6c7c84, 0.06));
  k.box(-0.42, 1.12, -0.42, 0.42, 1.82, -0.4, C.iron);
  for (const x of [-0.2, 0.2]) {
    k.sub(x, 1.47, -0.42, 0, -90).cyl(0, 0, 0, 0.03, 0.15, 0.15, k.tone(C.steel), 8);
    k.sub(x, 1.47, -0.45, 0, -90).cyl(0, 0, 0, 0.02, 0.05, 0.05, C.iron, 6);
  }
  k.box(-0.42, 0.62, -0.43, 0.42, 1.04, -0.4, k.tone(C.steelDark, 0.05));
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 6; col++) {
      if (k.rng.chance(0.3)) continue;
      const x = -0.34 + col * 0.125;
      const y = 0.7 + row * 0.11;
      k.plate(x, y, x + 0.05, y + 0.05, -0.432, k.rng.chance(0.5) ? C.amber : C.green, k.rng.chance(0.3) ? 'tube' : 'power');
    }
  }
  for (let i = 0; i < 3; i++) k.plate(-0.36, 0.14 + i * 0.12, 0.36, 0.19 + i * 0.12, -0.402, C.iron);
}

export function chalkboard(k: Kit): void {
  const y = k.inst.y ?? 1.5;
  k.box(-1.26, y - 0.66, -0.04, 1.26, y + 0.66, 0, k.tone(C.woodDark, 0.06));
  k.picture(0, y, -0.045, 2.4, 1.2, chalkTile(k.variant + Math.round(k.inst.x * 3 + k.inst.z)), [0.85, 0.85, 0.85]);
  k.box(-1.2, y - 0.72, -0.12, 1.2, y - 0.68, 0, C.woodDark, { bottom: true });
  k.box(-0.3, y - 0.68, -0.1, -0.2, y - 0.66, -0.07, C.enamel);
}

/** A shelf unit pulled over (2 x 1 m, along local x), its jars across the floor. */
export function shelfToppled(k: Kit): void {
  shelfUnit(k.sub(0.95, 0.27, k.rng.range(-0.08, 0.08), 90 + k.rng.range(-6, 6)).sub(0, 0, 0, 0, 81), false);
  for (let i = 0; i < 6; i++) {
    const x = k.rng.range(-0.9, 0.9);
    const z = k.rng.range(-0.75, -0.3);
    k.cyl(x, z, 0, k.rng.range(0.06, 0.16), 0.06, 0.05, k.rng.chance(0.3) ? C.specimen : C.glass, 6, k.rng.chance(0.3) ? { glow: 'on' } : {});
  }
}
