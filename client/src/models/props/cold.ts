import { C } from './palette';
import { fanBlades } from './parts';
import type { Kit } from './kit';

// Cold storage, and the rock tunnel behind it.

/** Pallet racking: 1 m wide, 2 m long (along z), three levels of frosted stock. */
export function rack(k: Kit): void {
  const post = k.tone(C.blue, 0.08);
  for (const x of [-0.46, 0.38]) for (const z of [-0.98, 0.9]) k.box(x, 0, z, x + 0.08, 2.4, z + 0.08, post);
  for (const y of [0.14, 0.95, 1.76]) {
    for (const x of [-0.48, 0.42]) k.box(x, y - 0.1, -0.98, x + 0.06, y, 0.98, C.beam, { bottom: true });
    k.box(-0.42, y - 0.04, -0.92, 0.42, y, 0.92, k.tone(C.woodDark, 0.1), { bottom: true });
    // Two pallet loads a level; some gone.
    for (const z of [-0.47, 0.47]) {
      if (k.rng.chance(0.22)) continue;
      const w = k.rng.range(0.62, 0.8);
      const h = k.rng.range(0.34, 0.62);
      const s = k.sub(k.rng.range(-0.04, 0.04), y, z, k.rng.range(-5, 5));
      s.box(-0.4, 0, -w / 2, 0.4, h, w / 2, k.tone(k.rng.pick([C.paper, C.canvas, C.wood, C.cabinet, C.tarp]), 0.14), { noTop: true });
      s.box(-0.41, h, -w / 2 - 0.01, 0.41, h + 0.03, w / 2 + 0.01, k.tone(C.frost, 0.05));
    }
  }
}

function iceAt(k: Kit, x: number, y: number, z: number, w: number, h: number): void {
  const s = k.sub(x, y, z, k.rng.range(-9, 9));
  const c = k.tone(C.ice, 0.08);
  s.box(-w / 2, 0, -w / 2, w / 2, h, w / 2, c, { noTop: true });
  s.box(-w / 2, h - 0.02, -w / 2, w / 2, h, w / 2, [c[0] * 1.3, c[1] * 1.25, c[2] * 1.2]);
  // The cold light it holds on to.
  s.box(-w / 4, h * 0.25, -w / 2 - 0.004, w / 4, h * 0.75, w / 2 + 0.004, [0.05, 0.13, 0.2], { glow: 'on', noTop: true });
}

/** A block of lake ice on a bed of sawdust. */
export function iceBlock(k: Kit): void {
  k.box(-0.5, 0, -0.5, 0.5, 0.03, 0.5, k.tone(C.woodPale, 0.1));
  iceAt(k, 0, 0.03, 0, 0.84, 0.55);
}

export function iceStack(k: Kit): void {
  k.box(-0.5, 0, -0.5, 0.5, 0.03, 0.5, k.tone(C.woodPale, 0.1));
  iceAt(k, 0, 0.03, 0, 0.9, 0.6);
  iceAt(k, k.rng.range(-0.06, 0.06), 0.63, k.rng.range(-0.06, 0.06), 0.74, 0.5);
  if (k.variant !== 1) iceAt(k, k.rng.range(-0.15, 0.15), 1.13, 0, 0.4, 0.17);
}

/** An overhead rail of hooks along x. Variant 1: sacking-wrapped sides still hang from some. */
export function hookRail(k: Kit): void {
  const len = k.inst.s ?? 4;
  const y = k.inst.y ?? k.ceil - 0.35;
  k.box(-len / 2, y, -0.04, len / 2, y + 0.1, 0.04, k.tone(C.steelDark, 0.06), { bottom: true });
  for (let x = -len / 2 + 0.3; x < len / 2; x += 2) k.box(x, y + 0.1, -0.03, x + 0.06, k.ceil, 0.03, C.iron, { noTop: true });
  for (let x = -len / 2 + 0.5; x < len / 2 - 0.2; x += 0.8) {
    const h = k.sub(x, y, 0, k.rng.range(-25, 25));
    h.box(-0.015, -0.3, -0.015, 0.015, 0, 0.015, C.steel, { bottom: true });
    h.box(-0.015, -0.34, -0.015, 0.1, -0.3, 0.015, C.steel, { bottom: true });
    h.box(0.08, -0.3, -0.015, 0.11, -0.2, 0.015, C.steel);
    if (k.variant !== 1 || k.rng.chance(0.35)) continue;
    const drop = k.rng.range(0.85, 1.15);
    h.cyl(0, 0, -0.34 - drop, -0.34, 0.1, 0.2, k.tone(C.canvas, 0.12), 6, { bottom: true });
    h.box(-0.21, -0.7, -0.012, 0.21, -0.66, 0.012, C.woodDark);
  }
}

/** The refrigeration plant: a fan behind a guard up top, louvres below, frosted pipes to the ceiling. */
export function chiller(k: Kit): void {
  const body = k.tone(C.cabinet, 0.05);
  k.box(-0.96, 0, -0.38, 0.96, 2, 0.46, body);
  k.box(-0.98, 0, -0.42, 0.98, 0.1, 0.48, C.iron);
  // Fan housing.
  k.plate(-0.82, 0.95, 0.02, 1.85, -0.385, C.iron);
  fanBlades(k.mover(-0.4, 1.4, 0, [0, 0, 1], { kind: 'spin', rate: 7, powered: true, idle: 0.04 }), -0.4, 1.4, -0.42, 0.38, 4, C.steel);
  for (const d of [-0.28, 0, 0.28]) k.box(-0.82, 1.39 + d, -0.5, 0.02, 1.41 + d, -0.48, C.steelDark, { bottom: true });
  k.box(-0.41, 0.95, -0.5, -0.39, 1.85, -0.48, C.steelDark);
  // Louvres, a gauge that works off the mains, the maker's plate.
  for (let i = 0; i < 5; i++) k.box(-0.82, 0.22 + i * 0.13, -0.41, 0.02, 0.27 + i * 0.13, -0.38, C.steelDark);
  k.box(0.2, 0.3, -0.4, 0.84, 1.85, -0.38, k.tone(C.steelDark, 0.06));
  k.plate(0.32, 1.5, 0.5, 1.68, -0.402, C.amber, 'power');
  k.plate(0.56, 1.5, 0.74, 1.68, -0.402, 0x40b0ff, 'on');
  k.plate(0.3, 0.5, 0.74, 1.3, -0.402, C.iron);
  // Pipes up, white with frost.
  for (const x of [-0.6, -0.3, 0.55]) k.cyl(x, 0.2, 2, k.ceil, 0.07, 0.07, k.tone(C.frost, 0.06), 6, { noTop: true });
}

/** Icicles under a pipe or a lintel, along x. */
export function icicles(k: Kit): void {
  const len = k.inst.s ?? 2;
  const y = k.inst.y ?? k.ceil;
  for (let x = -len / 2 + 0.1; x < len / 2; x += k.rng.range(0.14, 0.36)) {
    const h = k.rng.range(0.08, 0.5) * (k.rng.chance(0.2) ? 1.5 : 1);
    k.cyl(x, k.rng.range(-0.05, 0.05), y - h, y, 0.004, k.rng.range(0.025, 0.05), k.tone(C.frost, 0.1), 4, { noTop: true });
  }
}

/** Water coming through the roof: a wet patch on the floor and the drops that feed it. */
export function drip(k: Kit): void {
  const wet: [number, number, number] = [0.045, 0.06, 0.08];
  for (const [r, a] of [[0.34, 20], [0.22, 65]] as const) {
    k.sub(k.rng.range(-0.08, 0.08), 0.012, k.rng.range(-0.08, 0.08), a + k.rng.range(-20, 20)).face([[-r, 0, -r * 0.7], [-r * 0.8, 0, r * 0.8], [r, 0, r * 0.6], [r * 0.7, 0, -r]], [0, 1, 0], wet);
  }
  k.drip(0, k.inst.y ?? k.ceil, 0);
}

/** Pit props and a cap beam shoring up the tunnel: `s` is the span. */
export function timberFrame(k: Kit): void {
  const span = k.inst.s ?? 4;
  const top = k.ceil - 0.02;
  for (const side of [-1, 1]) {
    const x = side * (span / 2 - 0.13);
    k.sub(x, 0, 0, 0, 0, side * k.rng.range(0.5, 2.5)).box(-0.11, 0, -0.11, 0.11, top - 0.22, 0.11, k.tone(C.woodDark, 0.15), { noTop: true });
    k.sub(x - side * 0.1, top - 0.22, 0, 0, 0, side * 45).box(-0.05, -0.55, -0.06, 0.05, 0, 0.06, k.tone(C.wood, 0.15), { bottom: true });
  }
  k.box(-span / 2, top - 0.22, -0.13, span / 2, top, 0.13, k.tone(C.woodDark, 0.12), { bottom: true, noTop: true });
}
