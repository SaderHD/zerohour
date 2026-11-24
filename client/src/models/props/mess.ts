import { C } from './palette';
import type { Kit } from './kit';

// Mess hall: the kitchen end and the notice board.

/** The cooking range: back against the wall (+z), oven doors to the front, a hood and flue above. */
export function range(k: Kit): void {
  k.box(-0.96, 0, -0.42, 0.96, 0.86, 0.46, k.tone(C.steelDark, 0.06));
  k.box(-0.96, 0.86, -0.44, 0.96, 0.9, 0.46, C.iron);
  for (const x of [-0.88, 0.06]) {
    k.box(x, 0.2, -0.45, x + 0.82, 0.72, -0.42, C.iron);
    k.box(x + 0.1, 0.62, -0.48, x + 0.72, 0.66, -0.45, C.steel);
  }
  // Something is still burning in the firebox.
  k.box(-0.3, 0.05, -0.43, 0.3, 0.13, -0.42, C.ember, { glow: 'fire' });
  k.cyl(-0.5, 0.05, 0.9, 1.18, 0.2, 0.2, k.tone(C.steel), 8);
  k.cyl(0.4, -0.1, 0.9, 1.06, 0.15, 0.17, C.iron, 8);
  k.box(0.52, 0.98, -0.12, 0.84, 1.01, -0.08, C.iron);
  // Hood and flue.
  k.box(-1, 1.75, -0.3, 1, 2.05, 0.48, k.tone(C.steel, 0.06), { bottom: true });
  k.box(-0.18, 2.05, 0.1, 0.18, k.ceil, 0.46, C.steelDark, { noTop: true });
}

/** The serving counter: customers at the front (-z), trays and a tea urn on top. */
export function counter(k: Kit): void {
  k.box(-1.48, 0, -0.4, 1.48, 0.94, 0.46, k.tone(C.cabinet, 0.06));
  k.box(-1.5, 0.94, -0.48, 1.5, 1, 0.48, k.tone(C.steel, 0.05));
  k.box(-1.5, 0.78, -0.62, 1.5, 0.81, -0.4, C.steel, { bottom: true });
  for (let i = 0; i < 3; i++) k.box(-1.3 + i * 0.012, 1 + i * 0.03, -0.3, -0.8 + i * 0.012, 1.025 + i * 0.03, 0.1, k.tone(C.rust, 0.1));
  k.cyl(0.9, 0.05, 1, 1.42, 0.17, 0.17, k.tone(C.steel), 8);
  k.cyl(0.9, 0.05, 1.42, 1.5, 0.06, 0.04, C.iron, 6);
  k.box(0.86, 1.08, -0.2, 0.94, 1.12, -0.12, C.brass);
  for (let i = 0; i < 4; i++) k.cyl(-0.1 + (i % 2) * 0.3, -0.12 + Math.floor(i / 2) * 0.3, 1, 1.03 + k.rng.int(0, 3) * 0.025, 0.12, 0.13, C.enamel, 6);
}

/** Cork board with whatever was pinned up last: rotas, orders, a warning in red. */
export function noticeBoard(k: Kit): void {
  const y = k.inst.y ?? 1.55;
  k.box(-0.92, y - 0.57, -0.05, 0.92, y + 0.57, 0, C.woodDark);
  k.box(-0.86, y - 0.51, -0.06, 0.86, y + 0.51, -0.05, k.tone(C.cork, 0.06));
  for (let i = 0; i < 7; i++) {
    const s = k.sub(-0.68 + (i % 4) * 0.44 + k.rng.range(-0.06, 0.06), y + (i < 4 ? 0.22 : -0.24) + k.rng.range(-0.05, 0.05), -0.062, 0, 0, k.rng.range(-7, 7));
    const w = k.rng.range(0.11, 0.17);
    const h = k.rng.range(0.14, 0.2);
    s.plate(-w, -h, w, h, -0.004, k.tone(i === 5 ? C.red : k.rng.pick([C.paper, C.paper, C.enamel, 0xc8c098]), 0.08));
  }
}
