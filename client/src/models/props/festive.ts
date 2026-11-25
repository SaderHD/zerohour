import type { RGB } from '../../render/bake';
import { C } from './palette';
import { snowCap, strut } from './parts';
import type { Kit } from './kit';

// The Christmas kit (The Longest Night): the tree, strings of bulbs, wreaths, garlands, presents,
// the market and the rink. Whatever glows here glows whether the mains are on or not: nobody
// turned any of it off.

/** Bulb colours as light, brighter than any paint. */
const BULBS: RGB[] = [[1.7, 0.3, 0.2], [1.6, 1.15, 0.3], [0.3, 1.5, 0.45], [0.35, 0.6, 1.7], [1.5, 0.4, 1.1]];
const WARM: RGB = [1.6, 1.25, 0.7];
const WRAPS = [0xa82c28, 0x2c6a44, 0x2c4c8c, 0xc8a030, 0xd8d4c8, 0x7a3a8a];
const STRIPES = [0xa83028, 0x2c5a3c, 0x2c4878];
const CREAM = 0xd8d0b8;

/** One bulb: small enough that five faces are plenty. */
function bulb(k: Kit, x: number, y: number, z: number, rgb: RGB, size = 0.09): void {
  k.cube(x, y, z, size, size, size, rgb, { glow: 'on', bottom: true, noTop: true });
}

/** A ring of greenery with a bow, standing in the plane z = `z` and facing -z. */
export function wreathAt(k: Kit, x: number, y: number, z: number, r = 0.3): void {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    k.cube(x + Math.cos(a) * r, y + Math.sin(a) * r, z - 0.05, r * 0.62, r * 0.62, 0.1, k.tone(C.pine, 0.14), { bottom: true });
  }
  k.cube(x, y - r, z - 0.11, r * 0.7, r * 0.34, 0.04, C.ribbon, { bottom: true });
  for (const s of [-1, 1]) k.cube(x + s * r * 0.24, y - r * 1.45, z - 0.11, r * 0.22, r * 0.6, 0.03, C.ribbon, { bottom: true });
  for (let i = 0; i < 4; i++) {
    const a = ((i + 0.5) / 4) * Math.PI * 2;
    bulb(k, x + Math.cos(a) * r, y + Math.sin(a) * r, z - 0.12, BULBS[(i * 2) % BULBS.length]!, 0.06);
  }
}

export function wreath(k: Kit): void {
  wreathAt(k, 0, k.inst.y ?? 2.2, 0, 0.32);
}

/** Height of something strung along local x at `x`: from `y0` at one end to `y1` at the other, sagging between. */
function slung(k: Kit, len: number): (x: number) => number {
  const y0 = k.inst.y ?? 4.5;
  const y1 = k.inst.y2 ?? y0;
  const sag = Math.min(1.3, 0.15 + len * 0.035);
  return (x) => {
    const t = x / len + 0.5;
    return y0 + (y1 - y0) * t - sag * 4 * t * (1 - t);
  };
}

/** The wire itself, in straight lengths. */
function wire(k: Kit, len: number, at: (x: number) => number): void {
  const n = Math.max(2, Math.ceil(len / 2.5));
  for (let i = 0; i < n; i++) {
    const [a, b] = [-len / 2 + (i * len) / n, -len / 2 + ((i + 1) * len) / n];
    strut(k, [a, at(a), 0], [b, at(b), 0], 0.025, C.iron);
  }
}

/** Bulbs on a wire: warm white, or (variant 1) one colour after another. */
export function lightString(k: Kit): void {
  const len = k.inst.s ?? 6;
  const at = slung(k, len);
  wire(k, len, at);
  const n = Math.max(2, Math.round(len / 0.6));
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + ((i + 0.5) * len) / n;
    bulb(k, x, at(x) - 0.07, 0, k.variant === 1 ? BULBS[i % BULBS.length]! : WARM);
  }
}

/** Swags of greenery along a wall at `y`, a bow where each is pinned up, bulbs in it. */
export function garland(k: Kit): void {
  const len = k.inst.s ?? 4;
  const y = k.inst.y ?? 3;
  const swags = Math.max(1, Math.round(len / 2.2));
  const w = len / swags;
  const PARTS = 4;
  for (let s = 0; s < swags; s++) {
    const x0 = -len / 2 + s * w;
    for (let i = 0; i < PARTS; i++) {
      const t = (i + 0.5) / PARTS;
      const drop = 0.38 * 4 * t * (1 - t);
      k.cube(x0 + t * w, y - drop, -0.07, w / PARTS + 0.04, 0.2, 0.14, k.tone(C.pine, 0.14), { bottom: true });
      bulb(k, x0 + t * w, y - drop - 0.12, -0.13, BULBS[(s * PARTS + i) % BULBS.length]!, 0.07);
    }
  }
  for (let s = 0; s <= swags; s++) {
    const x = -len / 2 + s * w;
    k.cube(x, y + 0.02, -0.1, 0.26, 0.16, 0.06, C.ribbon, { bottom: true });
    k.cube(x, y - 0.2, -0.1, 0.1, 0.3, 0.04, C.ribbon, { bottom: true });
  }
}

/** One wrapped box with a ribbon round it. */
function present(k: Kit, x: number, y: number, z: number, w: number, h: number, d: number, yaw: number, i: number): void {
  const s = k.sub(x, y, z, yaw);
  const paper = k.tone(WRAPS[i % WRAPS.length]!, 0.08);
  const band = WRAPS[(i + 3) % WRAPS.length]!;
  s.box(-w / 2, 0, -d / 2, w / 2, h, d / 2, paper);
  s.box(-0.035, 0, -d / 2 - 0.006, 0.035, h + 0.006, d / 2 + 0.006, band);
  s.cube(0, h + 0.03, 0, 0.14, 0.06, 0.08, band);
}

/** A heap of presents, a few on top of the rest. */
export function presents(k: Kit): void {
  const n = 4 + k.variant;
  for (let i = 0; i < n; i++) {
    const [w, h, d] = [k.rng.range(0.22, 0.46), k.rng.range(0.14, 0.34), k.rng.range(0.22, 0.4)];
    const up = i >= 4 ? 0.2 : 0;
    const r = up ? 0.12 : 0.34;
    present(k, k.rng.range(-r, r), up, k.rng.range(-r, r), w, h, d, k.rng.range(0, 90), i + k.variant * 2);
  }
}

const TREE_TOP = 13.5;
/** Each tier of boughs: where it starts, how wide it is there. */
const TIERS = [[2.3, 3.0], [4.1, 2.65], [5.9, 2.25], [7.6, 1.85], [9.2, 1.45], [10.7, 1.05]] as const;

/** The tree in the square: fourteen metres, in a stone tub, every bulb on it lit. */
export function xmasTree(k: Kit): void {
  k.cyl(0, 0, 0, 0.7, 1.45, 1.4, k.tone(C.concrete, 0.05), 8);
  k.cyl(0, 0, 0.7, 0.78, 1.3, 1.2, k.tone(C.snow, 0.04), 8);
  k.cyl(0, 0, 0.7, 2.6, 0.3, 0.24, C.woodDark, 6, { noTop: true });
  for (const [ti, [y0, r0]] of TIERS.entries()) {
    const y1 = ti + 1 < TIERS.length ? TIERS[ti + 1]![0] + 0.9 : TREE_TOP;
    const r1 = ti + 1 < TIERS.length ? TIERS[ti + 1]![1] * 0.55 : 0.04;
    const s = k.sub(0, 0, 0, ti * 22.5);
    s.cyl(0, 0, y0, y1, r0, r1, k.tone(ti % 2 ? C.pine : C.pineDark, 0.06), 8, { bottom: true, noTop: true });
    // Snow lies on the upper side of every bough.
    const ym = y0 + (y1 - y0) * 0.55;
    const rm = r0 + (r1 - r0) * 0.55;
    s.cyl(0, 0, ym, y1 + 0.04, rm + 0.05, r1 + 0.05, k.tone(C.snow, 0.04), 8, { noTop: true });
    // Bulbs, more on the wide tiers.
    const n = 16 - ti * 2;
    for (let i = 0; i < n; i++) {
      const t = k.rng.range(0.04, 0.5);
      const a = ((i + k.rng.range(0, 0.6)) / n) * Math.PI * 2;
      const r = (r0 + (r1 - r0) * t) * 0.97 + 0.05;
      bulb(k, Math.cos(a) * r, y0 + (y1 - y0) * t, Math.sin(a) * r, BULBS[(i + ti) % BULBS.length]!, 0.13);
    }
  }
  // The star.
  k.cyl(0, 0, TREE_TOP - 0.1, TREE_TOP + 0.3, 0.03, 0.34, WARM, 4, { glow: 'on', noTop: true });
  k.cyl(0, 0, TREE_TOP + 0.3, TREE_TOP + 0.75, 0.34, 0.02, WARM, 4, { glow: 'on' });
}

/** A cut fir on a wooden cross; variant 1 is still in its net. */
export function fir(k: Kit): void {
  k.box(-0.22, 0, -0.04, 0.22, 0.07, 0.04, C.woodPale);
  k.box(-0.04, 0, -0.22, 0.04, 0.07, 0.22, C.woodPale);
  k.cyl(0, 0, 0.07, 0.5, 0.045, 0.04, C.woodDark, 5, { noTop: true });
  const netted = k.variant === 1;
  const h = k.rng.range(1.8, 2.15);
  k.cyl(0, 0, 0.4, h, netted ? 0.26 : 0.5, 0.03, k.tone(netted ? 0x3c5a48 : C.pine, 0.1), 6, { bottom: true });
  if (!netted) k.cyl(0, 0, 0.4 + (h - 0.4) * 0.6, h + 0.03, 0.24, 0.05, k.tone(C.snow, 0.04), 6);
}

/** A market stall: counter to the front, a striped canopy over it. Variants 3-5: the canopy has come down. */
export function marketStall(k: Kit): void {
  const stripe = STRIPES[k.variant % 3]!;
  const down = k.variant >= 3;
  k.box(-1.45, 0, -0.7, 1.45, 0.9, -0.2, k.tone(C.wood, 0.08));
  k.box(-1.45, 0, 0.3, 1.45, 0.75, 0.7, k.tone(C.woodDark, 0.08));
  // What was for sale.
  for (let i = 0; i < 5; i++) present(k, -1.15 + i * 0.56 + k.rng.range(-0.08, 0.08), 0.9, -0.45, k.rng.range(0.18, 0.3), k.rng.range(0.12, 0.3), k.rng.range(0.16, 0.26), k.rng.range(-20, 20), i + k.variant);
  for (const x of [-1.42, 1.42]) k.box(x - 0.035, 0, 0.61, x + 0.035, 2.5, 0.68, C.woodDark);
  const [zB, yB] = [0.72, 2.5];
  const [zF, yF] = down ? [-0.86, 1.0] : [-0.95, 2.12];
  if (down) {
    strut(k, [-1.42, 0, -0.68], [-1.9, 0.5, -1.5], 0.07, C.woodDark, { bottom: true });
    strut(k, [1.42, 0, -0.68], [1.3, 1.9, -0.9], 0.07, C.woodDark, { bottom: true });
  } else {
    for (const x of [-1.42, 1.42]) k.box(x - 0.035, 0, -0.72, x + 0.035, 2.14, -0.65, C.woodDark);
  }
  // The canopy: six stripes, seen from above and from under it.
  const len = Math.hypot(zB - zF, yB - yF);
  const up: [number, number, number] = [0, (zB - zF) / len, -(yB - yF) / len];
  for (let i = 0; i < 6; i++) {
    const [x0, x1] = [-1.5 + i * 0.5, -1 + i * 0.5];
    const col = k.tone(i % 2 ? CREAM : stripe, 0.05);
    k.face([[x0, yF, zF], [x0, yB, zB], [x1, yB, zB], [x1, yF, zF]], up, col);
    k.face([[x1, yF, zF], [x1, yB, zB], [x0, yB, zB], [x0, yF, zF]], [0, -up[1], -up[2]], [col[0] * 0.6, col[1] * 0.6, col[2] * 0.6]);
    k.plate(x0, yF - 0.18, x1, yF, zF, i % 2 ? stripe : CREAM);
    bulb(k, x0 + 0.25, yF - 0.24, zF - 0.02, BULBS[(i + k.variant) % BULBS.length]!);
  }
  if (!down) snowCap(k, -1.4, -0.6, 1.4, 0.5, 2.36, 0.05);
  // The canvas at the back, both faces.
  k.plate(-1.45, 0.75, 1.45, 2.45, 0.69, k.tone(C.canvas, 0.06));
  k.sub(0, 0, 0, 180).plate(-1.45, 0, 1.45, 2.45, -0.72, k.tone(C.canvas, 0.06));
}

/** Two metres of the boards round the rink. */
export function rinkBoard(k: Kit): void {
  k.box(-1, 0, -0.08, 1, 0.95, 0.08, k.tone(0xc8ccd0, 0.04));
  k.box(-1, 0.95, -0.11, 1, 1.0, 0.11, 0x2c4878);
  for (const yaw of [0, 180]) k.sub(0, 0, 0, yaw).plate(-1, 0, 1, 0.2, -0.082, 0x9a3028);
  k.box(-0.97, 1.0, -0.09, 0.97, 1.04, 0.09, k.tone(C.snow, 0.04));
}

/** The ice: dark, scored by skates, a little snow blown over it. */
export function rinkIce(k: Kit): void {
  const [W, D, NX, NZ] = [15, 11, 6, 5];
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const [x0, z0] = [-W / 2 + (i * W) / NX, -D / 2 + (j * D) / NZ];
      k.face([[x0, 0.015, z0], [x0, 0.015, z0 + D / NZ], [x0 + W / NX, 0.015, z0 + D / NZ], [x0 + W / NX, 0.015, z0]], [0, 1, 0], k.tone(0x587c98, 0.05));
    }
  }
  for (let i = 0; i < 16; i++) {
    const s = k.sub(k.rng.range(-6, 6), 0.022, k.rng.range(-4.2, 4.2), k.rng.range(0, 180));
    const l = k.rng.range(0.8, 2);
    s.face([[-l, 0, -0.02], [-l, 0, 0.02], [l, 0, 0.02], [l, 0, -0.02]], [0, 1, 0], k.tone(0xa8c4d8, 0.06));
  }
}

/** The bandstand: eight posts on a drum, a pointed roof, bulbs round the eaves. */
export function bandstand(k: Kit): void {
  k.cyl(0, 0, 0, 0.55, 2, 2, k.tone(C.concrete, 0.05), 8);
  k.box(-0.6, 0, -2.0, 0.6, 0.28, -1.75, k.tone(C.concrete, 0.05));
  for (let f = 0; f < 8; f++) {
    const s = k.sub(0, 0, 0, f * 45);
    const post = k.tone(0x2c4a3a, 0.06);
    s.sub(0, 0, 0, 22.5).box(-0.06, 0.55, -1.86, 0.06, 3.0, -1.74, post);
    if (f) {
      s.box(-0.72, 1.4, -1.7, 0.72, 1.47, -1.63, post, { bottom: true });
      s.box(-0.72, 0.95, -1.69, 0.72, 1.0, -1.64, post, { bottom: true });
    }
    bulb(s, -0.4, 2.9, -1.95, BULBS[f % BULBS.length]!);
    bulb(s, 0.4, 2.9, -1.95, BULBS[(f + 2) % BULBS.length]!);
  }
  const s = k.sub(0, 0, 0, 22.5);
  s.cyl(0, 0, 3.0, 4.3, 2.4, 0.12, k.tone(0x34503c, 0.05), 8, { bottom: true });
  s.cyl(0, 0, 3.5, 4.36, 1.5, 0.1, k.tone(C.snow, 0.04), 8);
  k.cyl(0, 0, 4.3, 4.9, 0.05, 0.02, C.brass, 4);
}

/** A park bench: iron ends, slats, snow on the seat. */
export function parkBench(k: Kit): void {
  const slat = k.tone(0x4a5a3c, 0.1);
  for (const x of [-0.9, 0.9]) {
    k.box(x - 0.03, 0, -0.2, x + 0.03, 0.45, 0.2, C.iron);
    k.box(x - 0.03, 0.45, 0.14, x + 0.03, 0.9, 0.2, C.iron);
  }
  k.box(-0.98, 0.42, -0.2, 0.98, 0.47, 0.14, slat, { bottom: true });
  for (const y of [0.6, 0.78]) k.box(-0.98, y, 0.15, 0.98, y + 0.12, 0.19, slat, { bottom: true });
  snowCap(k, -0.95, -0.2, 0.95, 0.14, 0.47, 0.06);
}

/** A snowman: somebody's hat and scarf, and it has not melted. */
export function snowman(k: Kit): void {
  const snow = k.tone(C.snow, 0.03);
  k.cyl(0, 0, 0, 0.6, 0.3, 0.24, snow, 6);
  k.cyl(0, 0, 0.55, 1.0, 0.23, 0.17, snow, 6);
  k.cyl(0, 0, 0.98, 1.28, 0.16, 0.13, snow, 6);
  k.cyl(0, 0, 0.96, 1.03, 0.2, 0.2, C.ribbon, 6, { bottom: true });
  k.box(0.08, 0.7, -0.2, 0.15, 0.98, -0.16, C.ribbon);
  k.cyl(0, 0, 1.28, 1.3, 0.2, 0.2, C.iron, 6, { bottom: true });
  k.cyl(0, 0, 1.3, 1.5, 0.12, 0.12, C.iron, 6);
  k.box(-0.02, 1.1, -0.3, 0.02, 1.14, -0.14, C.orange, { bottom: true });
  for (const x of [-0.06, 0.06]) k.plate(x - 0.015, 1.17, x + 0.015, 1.2, -0.15, C.iron);
  strut(k, [-0.2, 0.8, 0], [-0.55, 1.05, -0.1], 0.03, C.woodDark, { bottom: true });
  strut(k, [0.2, 0.8, 0], [0.55, 0.95, 0.05], 0.03, C.woodDark, { bottom: true });
}

/** A clothes line across a street, the washing on it frozen stiff. Variant 1 has sheets on it. */
export function washingLine(k: Kit): void {
  const len = k.inst.s ?? 6;
  const at = slung(k, len);
  wire(k, len, at);
  const CLOTH = [0xd8d0c0, 0x9aa8b8, 0xb08878, 0x7a8a6a, 0xd0d0d0, 0x8a5a50];
  let x = -len / 2 + 0.7;
  for (let i = 0; x < len / 2 - 0.9; i++) {
    const sheet = k.variant === 1 && i % 2 === 0;
    const w = sheet ? k.rng.range(1.1, 1.5) : k.rng.range(0.3, 0.6);
    const drop = sheet ? k.rng.range(0.9, 1.2) : k.rng.range(0.4, 0.8);
    const y = at(x + w / 2);
    k.sub(x + w / 2, y, 0, k.rng.range(-8, 8), 0, k.rng.range(-5, 5)).box(-w / 2, -drop, -0.012, w / 2, 0, 0.012, k.tone(CLOTH[k.rng.int(0, CLOTH.length - 1)]!, 0.08), { bottom: true });
    x += w + k.rng.range(0.25, 0.8);
  }
}
