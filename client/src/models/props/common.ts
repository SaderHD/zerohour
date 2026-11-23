import { textTile } from '../../render/signs';
import { C } from './palette';
import type { Kit } from './kit';

// The shared kit: props that turn up in every zone.

export function crateAt(k: Kit, y: number, w: number, h: number): void {
  const s = k.sub(k.rng.range(-0.03, 0.03), y, k.rng.range(-0.03, 0.03), k.rng.range(-6, 6));
  const band = k.tone(C.woodDark);
  s.box(-w / 2, 0, -w / 2, w / 2, h, w / 2, k.tone(C.wood));
  s.box(-w / 2 - 0.02, h * 0.1, -w / 2 - 0.02, w / 2 + 0.02, h * 0.1 + 0.09, w / 2 + 0.02, band);
  s.box(-w / 2 - 0.02, h * 0.9 - 0.09, -w / 2 - 0.02, w / 2 + 0.02, h * 0.9, w / 2 + 0.02, band);
}

export const crate = (k: Kit): void => crateAt(k, 0, 0.9, 0.95);
export const crateSmall = (k: Kit): void => crateAt(k, 0, 0.46, 0.5);
export function crateStack(k: Kit): void {
  crateAt(k, 0, 0.94, 1);
  crateAt(k, 1, 0.8, 0.85);
}

function barrelAt(k: Kit, x: number, z: number, hoops: boolean): void {
  const c = k.tone(k.rng.pick([C.olive, C.rust, C.blue, C.steelDark]), 0.15);
  k.cyl(x, z, 0, 0.9, 0.27, 0.27, c);
  if (!hoops) return;
  k.cyl(x, z, 0.25, 0.31, 0.29, 0.29, C.iron, 8, { noTop: true });
  k.cyl(x, z, 0.6, 0.66, 0.29, 0.29, C.iron, 8, { noTop: true });
}

export const barrel = (k: Kit): void => barrelAt(k, 0, 0, true);
export function barrels(k: Kit): void {
  barrelAt(k, -0.22, -0.2, false);
  barrelAt(k, 0.24, -0.16, false);
  barrelAt(k, 0.02, 0.24, false);
}

/** An upright shelf unit: 1 wide, 0.5 deep, open towards -z. */
export function shelfUnit(k: Kit, stocked = true): void {
  const frame = k.tone(C.steelDark);
  k.box(-0.5, 0, -0.22, -0.45, 2, 0.22, frame);
  k.box(0.45, 0, -0.22, 0.5, 2, 0.22, frame);
  k.box(-0.45, 0, 0.19, 0.45, 2, 0.22, k.tone(C.steelDark, 0.05));
  for (const y of [0.12, 0.62, 1.12, 1.62]) {
    k.box(-0.45, y, -0.22, 0.45, y + 0.04, 0.19, frame);
    if (!stocked || k.rng.chance(0.3)) continue;
    const x = k.rng.range(-0.3, 0.05);
    const w = k.rng.range(0.25, 0.4);
    k.box(x, y + 0.04, -0.15, x + w, y + 0.04 + k.rng.range(0.18, 0.36), 0.15, k.tone(k.rng.pick([C.canvas, C.wood, C.olive, C.paper, C.rust]), 0.15));
  }
}
export const shelf = (k: Kit): void => shelfUnit(k);

export function locker(k: Kit): void {
  const c = k.tone(k.variant === 1 ? C.blue : C.olive, 0.1);
  k.box(-0.24, 0, -0.2, 0.24, 1.9, 0.24, c);
  // The door: shut, or hanging open.
  const open = k.rng.chance(0.25);
  const d = k.sub(-0.22, 0, -0.2, open ? k.rng.range(-70, -30) : 0);
  d.box(0, 0.06, -0.035, 0.44, 1.84, 0, [c[0] * 1.12, c[1] * 1.12, c[2] * 1.12]);
  d.box(0.08, 1.5, -0.04, 0.36, 1.68, -0.03, C.iron);
  d.box(0.36, 0.95, -0.06, 0.4, 1.05, -0.03, C.steel);
  if (open) k.box(-0.2, 0.06, -0.2, 0.2, 1.84, -0.19, C.iron);
}

/** Plates, mugs and the odd bottle scattered over a table top. */
function tableware(k: Kit, w: number, y: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const x = k.rng.range(-w / 2 + 0.2, w / 2 - 0.2);
    const z = k.rng.range(-0.3, 0.3);
    const kind = k.rng.int(0, 2);
    if (kind === 0) k.cyl(x, z, y, y + 0.025, 0.11, 0.13, C.enamel, 6);
    else if (kind === 1) k.cyl(x, z, y, y + 0.1, 0.045, 0.045, k.rng.pick([C.enamel, C.blue, C.red]), 6);
    else k.cyl(x, z, y, y + 0.24, 0.04, 0.03, 0x3a5a3c, 6);
  }
}

function tableOf(k: Kit, w: number, d: number, things: number): void {
  const wood = k.tone(C.wood);
  k.box(-w / 2, 0.72, -d / 2, w / 2, 0.8, d / 2, wood);
  for (const x of [-w / 2 + 0.12, w / 2 - 0.2]) k.box(x, 0, -d / 2 + 0.1, x + 0.08, 0.72, d / 2 - 0.1, k.tone(C.woodDark));
  k.box(-w / 2 + 0.2, 0.3, -0.04, w / 2 - 0.2, 0.38, 0.04, C.woodDark);
  tableware(k, w, 0.8, things);
}

export const table = (k: Kit): void => tableOf(k, 1.9, 0.9, k.variant === 9 ? 0 : 3);
export const tableLong = (k: Kit): void => tableOf(k, 2.9, 0.9, k.variant === 9 ? 0 : 5);
export const tableSmall = (k: Kit): void => tableOf(k, 0.9, 0.9, k.variant === 9 ? 0 : 1);

export function bench(k: Kit): void {
  k.box(-1.45, 0.4, -0.2, 1.45, 0.47, 0.2, k.tone(C.wood));
  for (const x of [-1.25, 1.17]) k.box(x, 0, -0.17, x + 0.08, 0.4, 0.17, k.tone(C.woodDark));
}

export function desk(k: Kit): void {
  const c = k.tone(C.steel, 0.08);
  k.box(-0.74, 0.72, -0.48, 0.74, 0.78, 0.48, k.tone(C.woodPale));
  k.box(-0.72, 0, -0.42, -0.3, 0.72, 0.44, c);
  k.box(0.3, 0, -0.42, 0.72, 0.72, 0.44, c);
  k.box(-0.3, 0.3, 0.38, 0.3, 0.72, 0.44, c);
  // Typewriter, a stack of files, a mug.
  k.sub(0.1, 0.78, 0.05, k.rng.range(-15, 15)).box(-0.2, 0, -0.15, 0.2, 0.13, 0.15, C.iron);
  k.sub(-0.48, 0.78, -0.1, k.rng.range(-20, 20)).box(-0.14, 0, -0.18, 0.14, k.rng.range(0.04, 0.12), 0.18, C.paper);
  k.cyl(0.52, 0.2, 0.78, 0.88, 0.045, 0.045, C.enamel, 6);
}

function chairUpright(k: Kit): void {
  const c = k.tone(C.woodDark, 0.15);
  k.box(-0.2, 0.42, -0.2, 0.2, 0.46, 0.2, c, { bottom: true });
  k.box(-0.2, 0.46, 0.16, 0.2, 0.9, 0.2, c);
  k.box(-0.2, 0, -0.2, -0.16, 0.42, 0.2, c);
  k.box(0.16, 0, -0.2, 0.2, 0.42, 0.2, c);
}

/** A chair knocked over: on its back or on its side. */
export function chairTipped(k: Kit): void {
  if (k.variant % 2) chairUpright(k.sub(0, 0.2, 0, k.rng.range(-20, 20), 0, 90));
  else chairUpright(k.sub(0, 0.2, 0.2, k.rng.range(-20, 20), 90));
}

export function stool(k: Kit): void {
  const s = k.variant ? k.sub(0, 0.17, 0, k.rng.range(0, 360), 0, 90) : k;
  s.cyl(0, 0, 0.4, 0.45, 0.17, 0.17, k.tone(C.wood), 6, { bottom: true });
  s.box(-0.03, 0, -0.03, 0.03, 0.4, 0.03, C.steelDark);
  s.box(-0.14, 0, -0.02, 0.14, 0.03, 0.02, C.steelDark);
}

export function rubble(k: Kit): void {
  for (let i = 0; i < 6; i++) {
    const s = k.sub(k.rng.range(-0.5, 0.5), 0, k.rng.range(-0.4, 0.4), k.rng.range(0, 360), k.rng.range(-18, 18), k.rng.range(-18, 18));
    const w = k.rng.range(0.15, 0.4);
    s.box(-w / 2, -0.03, -w / 3, w / 2, k.rng.range(0.06, 0.24), w / 3, k.tone(k.rng.pick([C.steelDark, C.tile, C.woodDark, C.iron]), 0.2));
  }
}

export function planks(k: Kit): void {
  for (let i = 0; i < 4; i++) {
    const s = k.sub(k.rng.range(-0.2, 0.2), 0.02 + i * 0.03, k.rng.range(-0.25, 0.25), k.rng.range(-35, 35), 0, k.rng.range(-4, 4));
    const len = k.rng.range(0.8, 1.4);
    s.box(-len / 2, 0, -0.07, len / 2, 0.03, 0.07, k.tone(C.wood, 0.2));
  }
}

export function papers(k: Kit): void {
  for (let i = 0; i < 7; i++) {
    const s = k.sub(k.rng.range(-0.45, 0.45), 0.012 + i * 0.002, k.rng.range(-0.45, 0.45), k.rng.range(0, 360));
    s.face([[-0.1, 0, -0.14], [-0.1, 0, 0.14], [0.1, 0, 0.14], [0.1, 0, -0.14]], [0, 1, 0], k.tone(C.paper, 0.15));
  }
}

/** Ceiling pipes along local x: `s` metres long at height `y`. */
export function pipes(k: Kit): void {
  const len = k.inst.s ?? 4;
  const y = k.inst.y ?? k.ceil - 0.35;
  const n = k.variant === 1 ? 1 : 3;
  for (let i = 0; i < n; i++) {
    const r = i === 0 ? 0.07 : 0.04;
    const z = (i - (n - 1) / 2) * 0.17;
    k.box(-len / 2, y - r, z - r, len / 2, y + r, z + r, k.tone(i === 0 ? C.rust : C.steelDark, 0.08), { bottom: true });
  }
  for (let x = -len / 2 + 0.6; x < len / 2; x += 2.2) k.box(x, y + 0.06, -0.28, x + 0.06, k.ceil, 0.28, C.iron, { bottom: true, noTop: true });
}

/** A slack cable along local x, lying where it fell. */
export function cable(k: Kit): void {
  const len = k.inst.s ?? 3;
  const y = k.inst.y ?? 0;
  const steps = Math.max(2, Math.round(len / 0.7));
  let z = 0;
  for (let i = 0; i < steps; i++) {
    const nz = i === steps - 1 ? 0 : k.rng.range(-0.18, 0.18);
    const x0 = -len / 2 + (i * len) / steps;
    const seg = k.sub(x0, y, z, (Math.atan2(-(nz - z), len / steps) * 180) / Math.PI);
    seg.box(0, 0, -0.025, Math.hypot(len / steps, nz - z) + 0.02, 0.04, 0.025, C.rubber);
    z = nz;
  }
}

/** A pipe down the wall with a valve wheel. */
export function pipeDrop(k: Kit): void {
  const top = k.inst.y ?? k.ceil;
  k.box(-0.06, 0, -0.16, 0.06, top, -0.04, k.tone(C.rust, 0.1), { noTop: true });
  k.box(-0.1, 1.1, -0.2, 0.1, 1.2, 0, C.iron);
  k.box(-0.14, 1.02, -0.26, 0.14, 1.3, -0.22, C.red);
}

/** Lettering on a wall: variant 0 a painted plate, 1 a stencil straight on the wall, 2 a hazard plate. */
export function sign(k: Kit): void {
  const style = k.variant === 1 ? 'stencil' : k.variant === 2 ? 'hazard' : 'plate';
  const { uv, aspect } = textTile(k.inst.text ?? '', style);
  const h = style === 'stencil' ? 0.42 : 0.3;
  const y = k.inst.y ?? 2;
  if (style !== 'stencil') k.box((-h * aspect) / 2 - 0.02, y - h / 2 - 0.02, -0.025, (h * aspect) / 2 + 0.02, y + h / 2 + 0.02, 0, C.iron);
  k.picture(0, y, style === 'stencil' ? -0.012 : -0.032, h * aspect, h, uv);
}

export function vent(k: Kit): void {
  const y = k.inst.y ?? 2.2;
  k.box(-0.4, y - 0.25, -0.05, 0.4, y + 0.25, 0, C.steelDark);
  for (let i = 0; i < 4; i++) k.plate(-0.34, y - 0.19 + i * 0.11, 0.34, y - 0.15 + i * 0.11, -0.052, C.iron);
}
