import { C } from './palette';
import { drumX, snowCap, strut } from './parts';
import type { Kit } from './kit';

// Courtyard: everything out here has snow on it.

const MAST_HEIGHT = 17;
const MAST_FOOT = 0.6;
const MAST_HEAD = 0.16;

/** The radio mast: a square lattice in warning bands, a lamp at the head, aerials on its side. */
export function mast(k: Kit): void {
  k.box(-0.75, 0, -0.75, 0.75, 0.3, 0.75, k.tone(C.concrete, 0.06));
  snowCap(k, -0.75, -0.75, 0.75, 0.75, 0.3, 0.06);
  const half = (y: number): number => MAST_FOOT + ((MAST_HEAD - MAST_FOOT) * y) / MAST_HEIGHT;
  const LEVELS = 6;
  const step = (MAST_HEIGHT - 0.3) / LEVELS;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    strut(k, [sx * MAST_FOOT, 0.3, sz * MAST_FOOT], [sx * MAST_HEAD, MAST_HEIGHT, sz * MAST_HEAD], 0.09, C.steelDark);
  }
  for (let i = 0; i < LEVELS; i++) {
    const y0 = 0.3 + i * step;
    const y1 = y0 + step;
    const [a, b] = [half(y0), half(y1)];
    const paint = i % 2 ? C.white : C.red;
    // A ring at the top of each bay and one diagonal a face, turning as it climbs.
    for (let f = 0; f < 4; f++) {
      const s = k.sub(0, 0, 0, f * 90);
      s.box(-b, y1 - 0.04, -b - 0.03, b, y1 + 0.04, -b + 0.03, paint, { bottom: true });
      const dir = (i + f) % 2 ? 1 : -1;
      strut(s, [-dir * a, y0, -a], [dir * b, y1, -b], 0.05, paint, { bottom: true });
    }
  }
  // Head: a platform, the obstruction lamp, a whip.
  k.box(-0.3, MAST_HEIGHT, -0.3, 0.3, MAST_HEIGHT + 0.08, 0.3, C.iron, { bottom: true });
  k.cyl(0, 0, MAST_HEIGHT + 0.08, MAST_HEIGHT + 0.4, 0.13, 0.1, [1.6, 0.2, 0.14], 6, { glow: 'fire' });
  k.box(-0.015, MAST_HEIGHT + 0.4, -0.015, 0.015, MAST_HEIGHT + 3, 0.015, C.iron);
  // Dipoles half way up, and the feeder down one leg into the snow.
  for (const [y, yaw] of [[9.5, 0], [12.5, 90], [14.5, 200]] as const) {
    const s = k.sub(0, y, 0, yaw);
    s.box(-0.02, -0.02, -1.5, 0.02, 0.02, 0, C.steel, { bottom: true });
    s.box(-0.7, -0.02, -1.52, 0.7, 0.02, -1.48, C.steel, { bottom: true });
    s.box(-0.5, -0.02, -1.12, 0.5, 0.02, -1.08, C.steel, { bottom: true });
  }
  strut(k, [MAST_FOOT - 0.06, 0.3, MAST_FOOT - 0.06], [half(12) - 0.03, 12, half(12) - 0.03], 0.05, C.rubber);
  k.box(0.3, 0.3, 0.1, 0.7, 1.1, 0.6, k.tone(C.olive, 0.08));
  snowCap(k, 0.3, 0.1, 0.7, 0.6, 1.1, 0.05);
}

/** A concrete block with an eye bolt, half buried. */
export function anchorBlock(k: Kit): void {
  k.box(-0.24, 0, -0.24, 0.24, 0.42, 0.24, k.tone(C.concrete, 0.08));
  snowCap(k, -0.24, -0.24, 0.24, 0.24, 0.42, 0.05);
  k.box(-0.04, 0.42, -0.04, 0.04, 0.56, 0.04, C.iron);
}

/** A guy wire: from the block here up to `y`, `s` metres off along the prop's front. */
export function guyWire(k: Kit): void {
  const reach = k.inst.s ?? 6;
  const top = k.inst.y ?? 10;
  strut(k, [0, 0.5, 0], [0, top, -reach], 0.035, C.iron, { bottom: true });
  // The turnbuckle, and a rag tied on where somebody walked into it.
  const t = 0.9 / Math.hypot(reach, top);
  strut(k, [0, 0.5 + (top - 0.5) * t * 0.4, -reach * t * 0.4], [0, 0.5 + (top - 0.5) * t, -reach * t], 0.07, C.steel, { bottom: true });
  const r = 2.2 / Math.hypot(reach, top);
  k.box(-0.012, 0.5 + (top - 0.5) * r - 0.22, -reach * r - 0.04, 0.012, 0.5 + (top - 0.5) * r, -reach * r + 0.04, C.red, { bottom: true });
}

/** A flagpole on a stone plinth. The flag stirs. */
export function flagpole(k: Kit): void {
  const TOP = 7.2;
  k.box(-0.24, 0, -0.24, 0.24, 0.5, 0.24, k.tone(C.concrete, 0.08));
  snowCap(k, -0.24, -0.24, 0.24, 0.24, 0.5, 0.06);
  k.cyl(0, 0, 0.5, TOP, 0.05, 0.03, C.white, 5);
  k.cyl(0, 0, TOP, TOP + 0.1, 0.06, 0.02, C.brass, 5);
  k.box(0.05, 0.9, -0.01, 0.06, TOP - 0.2, 0.01, C.iron);
  k.box(0.02, 1.1, -0.03, 0.1, 1.16, 0.03, C.iron);
  // The station's colours: frozen stiff, torn at the fly.
  const f = k.mover(0, TOP - 0.6, 0, [0, 1, 0], { kind: 'swing', amp: 0.5, period: 5.5 });
  const [hoist, fly, drop] = [0.06, 1.3, 0.75];
  f.box(hoist, TOP - 0.2 - drop, -0.012, fly, TOP - 0.2, 0.012, k.tone(C.machine, 0.05), { bottom: true });
  f.box(hoist, TOP - 0.2 - drop * 0.62, -0.016, fly * 0.82, TOP - 0.2 - drop * 0.38, 0.016, C.white, { bottom: true });
  f.box(hoist + 0.14, TOP - 0.2 - drop * 0.8, -0.02, hoist + 0.36, TOP - 0.2 - drop * 0.2, 0.02, C.orange, { bottom: true });
}

/**
 * A tracked snow vehicle: two track units, a cab over the front, a load deck behind, a blade.
 * Front towards -z.
 */
export function snowcat(k: Kit): void {
  const paint = k.tone(C.orange, 0.06);
  const dark: [number, number, number] = [paint[0] * 0.55, paint[1] * 0.55, paint[2] * 0.55];
  // Tracks: a belt round two drums and a row of bogies.
  for (const x of [-0.88, 0.88]) {
    k.box(x - 0.32, 0.12, -1.55, x + 0.32, 0.78, 1.55, C.rubber, { bottom: true });
    for (const z of [-1.55, 1.55]) drumX(k, 0.45, z, x - 0.32, x + 0.32, 0.33, C.rubber, 6);
    const outer = k.sub(x + Math.sign(x) * 0.325, 0, 0, x > 0 ? 270 : 90);
    for (let i = 0; i < 5; i++) outer.sub(-1.2 + i * 0.6, 0.4, 0, 0, -90).cyl(0, 0, 0, 0.03, 0.17, 0.17, C.steelDark, 6);
    for (let z = -1.5; z < 1.5; z += 0.3) k.box(x - 0.34, 0.78, z, x + 0.34, 0.81, z + 0.12, C.iron);
    snowCap(k, x - 0.3, -1.3, x + 0.3, 1.5, 0.81, 0.07);
  }
  // Hull between them, cab forward.
  k.box(-0.56, 0.4, -1.7, 0.56, 1.0, 1.85, dark, { bottom: true });
  k.box(-0.95, 1.0, -1.5, 0.95, 1.45, 0.35, paint, { bottom: true });
  k.box(-0.9, 1.45, -1.25, 0.9, 2.15, 0.3, paint);
  k.box(-0.96, 2.15, -1.35, 0.96, 2.22, 0.36, dark, { bottom: true });
  snowCap(k, -0.96, -1.35, 0.96, 0.36, 2.22, 0.1);
  k.plate(-0.8, 1.52, -0.06, 2.06, -1.255, C.darkGlass);
  k.plate(0.06, 1.52, 0.8, 2.06, -1.255, C.darkGlass);
  for (const side of [90, 270]) {
    const s = k.sub(0, 0, -0.45, side);
    s.plate(-0.62, 1.52, 0.6, 2.04, -0.905, C.darkGlass);
    s.plate(-0.1, 1.04, 0.5, 1.42, -0.955, dark);
  }
  k.sub(0, 0, 0.3, 180).plate(-0.6, 1.55, 0.6, 2.0, -0.005, C.darkGlass);
  // Lamps: two on the scuttle, a searchlight on the roof that somebody left burning.
  for (const x of [-0.7, 0.7]) k.sub(x, 1.2, -1.5, 0, -90).cyl(0, 0, 0, 0.08, 0.12, 0.1, C.enamel, 6);
  k.box(-0.1, 2.3, -1.05, 0.1, 2.5, -0.85, C.iron);
  k.plate(-0.08, 2.32, 0.08, 2.48, -1.055, [1.5, 1.2, 0.7], 'fire');
  // Load deck: a drum, a coil of tow rope, jerrycans.
  k.box(-0.95, 1.0, 0.35, 0.95, 1.08, 1.85, C.woodDark, { bottom: true });
  for (const x of [-0.95, 0.89]) k.box(x, 1.08, 0.35, x + 0.06, 1.4, 1.85, paint);
  k.cyl(-0.45, 1.3, 1.08, 1.92, 0.27, 0.27, k.tone(C.olive, 0.1));
  k.cyl(0.4, 1.35, 1.08, 1.22, 0.33, 0.33, C.canvas, 8);
  for (const x of [0.25, 0.55]) k.box(x, 1.08, 0.5, x + 0.2, 1.52, 0.82, k.tone(C.drab, 0.1));
  snowCap(k, -0.75, 0.9, -0.15, 1.6, 1.92, 0.06);
  // The blade, on its arms.
  k.box(-1.25, 0.1, -2.0, 1.25, 0.85, -1.9, k.tone(C.hazard, 0.06), { bottom: true });
  for (const x of [-0.5, 0.5]) k.box(x - 0.05, 0.4, -1.92, x + 0.05, 0.52, -1.5, C.iron, { bottom: true });
  for (let i = 0; i < 5; i++) k.cyl(-1 + i * 0.5, -2.08, 0, k.rng.range(0.15, 0.4), k.rng.range(0.3, 0.45), 0.06, k.tone(C.snow, 0.04), 5);
}

/** A wall of sandbags, 2 m long, three courses. */
export function sandbags(k: Kit): void {
  for (let row = 0; row < 3; row++) {
    // Courses break joint; the top one is a bag short.
    const start = row === 0 ? -1 : -0.75;
    const n = row === 0 ? 4 : 3;
    for (let i = 0; i < n; i++) {
      const x = start + i * 0.5;
      k.box(x + 0.02, row * 0.27, -0.23 + k.rng.range(-0.02, 0.02), x + 0.48, row * 0.27 + 0.27, 0.23, k.tone(C.sand, 0.14));
    }
  }
  snowCap(k, -0.7, -0.2, 0.75, 0.2, 0.81, 0.06);
  k.cyl(-0.9, -0.3, 0, 0.16, 0.3, 0.05, k.tone(C.snow, 0.04), 5);
  k.cyl(0.6, 0.32, 0, 0.2, 0.36, 0.05, k.tone(C.snow, 0.04), 5);
}

/** Snow blown into a heap against whatever is behind it (+z). */
export function snowDrift(k: Kit): void {
  const n = k.variant === 1 ? 3 : 4;
  for (let i = 0; i < n; i++) {
    const x = -0.8 + (i * 1.6) / (n - 1) + k.rng.range(-0.15, 0.15);
    const r = k.rng.range(0.45, 0.8);
    k.cyl(x, 0.5 - r * 0.55, 0, k.rng.range(0.22, 0.5), r, r * 0.25, k.tone(C.snow, 0.05), 6);
  }
}

/** Wheel ruts along local z: two bands of packed, dirty snow. */
export function tracks(k: Kit): void {
  const len = k.inst.s ?? 4;
  const steps = Math.max(1, Math.round(len / 1.2));
  for (const x of [-0.8, 0.8]) {
    for (let i = 0; i < steps; i++) {
      const z0 = -len / 2 + (i * len) / steps;
      const z1 = z0 + len / steps - 0.05;
      k.face([[x - 0.16, 0.012, z0], [x - 0.16, 0.012, z1], [x + 0.16, 0.012, z1], [x + 0.16, 0.012, z0]], [0, 1, 0], k.tone(0x8a94a4, 0.1));
    }
  }
}

/** Three strands on angle irons along the top of a fence at `y`, leaning in over the yard. */
export function wireTop(k: Kit): void {
  const len = k.inst.s ?? 4;
  const y = k.inst.y ?? 3.5;
  const posts = Math.max(2, Math.round(len / 2.5) + 1);
  for (let i = 0; i < posts; i++) {
    const x = -len / 2 + 0.05 + (i * (len - 0.1)) / (posts - 1);
    k.box(x - 0.03, y - 0.5, -0.04, x + 0.03, y, 0, C.steelDark);
    strut(k, [x, y, -0.02], [x, y + 0.45, -0.34], 0.05, C.steelDark, { bottom: true });
    k.cube(x, y + 0.03, -0.02, 0.12, 0.06, 0.1, C.snow);
  }
  for (const t of [0.3, 0.65, 1]) k.box(-len / 2, y + 0.45 * t - 0.012, -0.02 - 0.32 * t - 0.012, len / 2, y + 0.45 * t + 0.012, -0.02 - 0.32 * t + 0.012, C.iron, { bottom: true });
  // Rime along the top board.
  k.box(-len / 2, y, -0.03, len / 2, y + 0.04, 0.03, k.tone(C.snow, 0.03));
}
