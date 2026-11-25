import type { RGB } from '../../render/bake';
import { BULBS, bulb } from './festive';
import { C } from './palette';
import { strut } from './parts';
import type { Kit } from './kit';

// The subway kit (The Longest Night): the mezzanine, the platform, the train that stopped, and the
// signal room behind the power.

const TILE = 0xd0d4c8;
const TILE_BAND = 0x4a8a6a;
const CAR = 0x8a9498;
const CAR_DARK = 0x3a4046;
const IRON = 0x2a2c30;
const SEAT = 0x9a5a28;
const LIT: RGB = [1.15, 1.2, 1.0];
const LAMPS: RGB[] = [[1.5, 0.25, 0.18], [0.3, 1.4, 0.4], [1.5, 1.1, 0.25]];

/** The token booth: tile to the sill, glass above with a hole to talk through, tinsel taped to it. */
export function tokenBooth(k: Kit): void {
  k.box(-1, 0, -0.75, 1, 1.05, 0.75, k.tone(TILE, 0.04));
  k.box(-1, 0.5, -0.76, 1, 0.62, 0.76, k.tone(TILE_BAND, 0.05), { noTop: true });
  k.box(-1.04, 1.05, -0.82, 1.04, 1.1, 0.79, C.steel, { bottom: true });
  for (const x of [-1, 0.94]) for (const z of [-0.75, 0.69]) k.box(x, 1.1, z, x + 0.06, 2.3, z + 0.06, C.steelDark, { noTop: true });
  for (const [yaw, half, off] of [[0, 0.94, 0.72], [90, 0.69, 0.97], [270, 0.69, 0.97]] as const) k.sub(0, 0, 0, yaw).plate(-half, 1.1, half, 2.3, -off, C.darkGlass);
  k.box(-1, 1.1, 0.69, 1, 2.3, 0.75, k.tone(TILE, 0.04));
  k.plate(-0.16, 1.12, 0.16, 1.32, -0.725, 0x08080a);
  k.plate(-0.5, 1.95, 0.5, 2.2, -0.725, [0.55, 1.2, 0.75], 'power');
  k.box(-1.06, 2.3, -0.81, 1.06, 2.6, 0.81, C.steelDark, { bottom: true });
  // Tinsel across the glass, a bulb where each swag is taped up.
  for (let i = 0; i < 4; i++) {
    const [a, b] = [-0.9 + i * 0.45, -0.45 + i * 0.45];
    strut(k, [a, 2.1, -0.74], [(a + b) / 2, 1.92, -0.74], 0.05, i % 2 ? 0xc8c8d0 : 0xc8a030);
    strut(k, [(a + b) / 2, 1.92, -0.74], [b, 2.1, -0.74], 0.05, i % 2 ? 0xc8c8d0 : 0xc8a030);
    bulb(k, a, 2.12, -0.76, BULBS[i % BULBS.length]!, 0.06);
  }
  bulb(k, 0.9, 2.12, -0.76, BULBS[4]!, 0.06);
}

/** A turnstile's housing; its three arms stand out across the lane at +x. */
export function turnstile(k: Kit): void {
  k.box(-0.2, 0, -0.5, 0.2, 0.98, 0.5, k.tone(0x8a9094, 0.04));
  k.box(-0.22, 0.98, -0.52, 0.22, 1.03, 0.52, C.steel, { bottom: true });
  k.plate(-0.1, 0.6, 0.1, 0.8, -0.502, IRON);
  k.cube(0, 0.9, -0.505, 0.06, 0.03, 0.01, C.brass);
  if (k.variant === 1) return;
  const hub = k.sub(0.2, 0.86, 0, 0, 0, -40);
  hub.cyl(0, 0, -0.04, 0.1, 0.07, 0.07, C.steelDark, 6);
  for (let i = 0; i < 3; i++) strut(hub.sub(0, 0.06, 0, i * 120), [0, 0, 0], [0.56, 0.42, 0], 0.035, C.steel, { bottom: true });
}

/** A length of iron fence: flat bars, a rail top and bottom. */
export function ironFence(k: Kit): void {
  for (const y of [0.1, 1.1]) k.box(-0.75, y, -0.03, 0.75, y + 0.06, 0.03, IRON, { bottom: true });
  for (let x = -0.72; x < 0.75; x += 0.16) k.box(x, 0, -0.012, x + 0.03, 1.2, 0.012, IRON);
  for (const x of [-0.75, 0.69]) k.box(x, 0, -0.03, x + 0.06, 1.24, 0.03, IRON);
}

/** A column in glazed tile, a band of colour at the height of a hand, to the ceiling. */
export function tiledPillar(k: Kit): void {
  const h = k.ceil;
  k.box(-0.24, 0, -0.24, 0.24, h, 0.24, k.tone(TILE, 0.04), { noTop: true });
  k.box(-0.25, 1.0, -0.25, 0.25, 1.25, 0.25, k.tone(TILE_BAND, 0.05), { noTop: true });
  k.box(-0.27, 0, -0.27, 0.27, 0.12, 0.27, 0x3a3c3a);
  k.box(-0.27, h - 0.14, -0.27, 0.27, h, 0.27, 0x8a8c84, { bottom: true, noTop: true });
}

/** A platform bench: slats on iron, a newspaper left on it. */
export function platformBench(k: Kit): void {
  const slat = k.tone(0x6a4a30, 0.08);
  for (const x of [-0.9, 0, 0.9]) {
    k.box(x - 0.03, 0, -0.2, x + 0.03, 0.44, 0.2, IRON);
    k.box(x - 0.03, 0.44, 0.14, x + 0.03, 0.9, 0.2, IRON);
  }
  for (const z of [-0.18, -0.04, 0.1]) k.box(-0.98, 0.42, z, 0.98, 0.46, z + 0.11, slat, { bottom: true });
  for (const y of [0.58, 0.76]) k.box(-0.98, y, 0.15, 0.98, y + 0.12, 0.19, slat, { bottom: true });
  if (k.rng.chance(0.6)) k.sub(k.rng.range(-0.6, 0.6), 0.47, -0.04, k.rng.range(-30, 30)).box(-0.16, 0, -0.11, 0.16, 0.012, 0.11, C.paper);
}

/** Something in a frame on the wall: the line's map (variant 0), or an advertisement for nothing in particular. */
export function transitPoster(k: Kit): void {
  const y = k.inst.y ?? 1.2;
  k.box(-0.7, y, -0.04, 0.7, y + 1, 0, C.steelDark, { bottom: true });
  const p = k.sub(0, y, -0.042);
  if (k.variant % 4 === 0) {
    p.plate(-0.65, 0.05, 0.65, 0.95, 0, 0xd8d4c0);
    // Three lines and where they cross.
    const LINES = [0xa82c28, 0x2c6a44, 0x2c4c8c];
    p.plate(-0.55, 0.48, 0.55, 0.52, -0.002, LINES[0]!);
    strut(p, [-0.5, 0.2, -0.003], [0.5, 0.8, -0.003], 0.035, LINES[1]!);
    p.plate(0.1, 0.12, 0.14, 0.88, -0.002, LINES[2]!);
    for (const [x, yy] of [[-0.4, 0.5], [0, 0.5], [0.12, 0.5], [0.4, 0.5], [0.12, 0.3], [0.12, 0.75], [-0.3, 0.32]] as const) p.plate(x - 0.03, yy - 0.03, x + 0.03, yy + 0.03, -0.005, 0x1a1a1a);
  } else {
    const ART: [number, number, number][] = [[0x1c2c4c, 0xc8a030, 0xd8d0b8], [0x5a1c1c, 0xd8d0b8, 0xc8a030], [0x1c3c2c, 0xd8d0b8, 0xa82c28]];
    const [field, a, b] = ART[k.variant % ART.length]!;
    p.plate(-0.65, 0.05, 0.65, 0.95, 0, k.tone(field, 0.05));
    p.sub(-0.3, 0.52, -0.002, 0, 0, k.rng.range(-12, 12)).plate(-0.2, -0.26, 0.2, 0.26, 0, k.tone(a, 0.05));
    for (const [i, yy] of [0.7, 0.52, 0.34].entries()) p.plate(0.05, yy, 0.55 - i * 0.12, yy + 0.09, -0.002, b);
    p.plate(-0.55, 0.1, 0.55, 0.16, -0.002, a);
  }
  // Somebody has had a corner off it.
  if (k.rng.chance(0.4)) p.sub(0.65, 0.95, -0.006, 0, 0, 45).plate(-0.16, -0.16, 0.16, 0.16, 0, C.steelDark);
}

/** A telephone on the wall, the receiver hanging. */
export function payphone(k: Kit): void {
  const y = k.inst.y ?? 1;
  k.box(-0.3, y - 0.1, -0.03, 0.3, y + 0.9, 0, C.steelDark, { bottom: true });
  k.box(-0.2, y, -0.2, 0.2, y + 0.6, -0.03, k.tone(0x2a3c58, 0.05), { bottom: true });
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) k.plate(-0.1 + c * 0.07, y + 0.12 + r * 0.07, -0.05 + c * 0.07, y + 0.17 + r * 0.07, -0.202, C.steel);
  k.plate(-0.14, y + 0.4, 0.14, y + 0.52, -0.202, 0x0c0c0e);
  strut(k, [-0.22, y + 0.3, -0.1], [-0.26, y - 0.5, -0.12], 0.02, C.steel);
  k.box(-0.3, y - 0.72, -0.16, -0.22, y - 0.5, -0.08, C.bakelite, { bottom: true });
}

/** The station's clock, hung from the ceiling, both faces stopped at the same minute. */
export function stationClock(k: Kit): void {
  const y = k.inst.y ?? k.ceil - 0.9;
  for (const x of [-0.2, 0.2]) k.box(x - 0.012, y + 0.56, -0.012, x + 0.012, k.ceil, 0.012, IRON, { noTop: true });
  k.box(-0.32, y, -0.1, 0.32, y + 0.6, 0.1, IRON, { bottom: true });
  for (const yaw of [0, 180]) {
    const f = k.sub(0, y + 0.3, 0, yaw);
    f.plate(-0.26, -0.26, 0.26, 0.26, -0.102, [0.95, 0.9, 0.7], 'power');
    f.sub(0, 0, -0.104, 0, 0, -50).plate(-0.012, 0, 0.012, 0.2, 0, 0x0c0c0e);
    f.sub(0, 0, -0.104, 0, 0, 105).plate(-0.015, 0, 0.015, 0.14, 0, 0x0c0c0e);
  }
}

/** The side of the train along the platform: steel to the sill, a band of lit windows, the roof line, the dark over it. */
export function trainSide(k: Kit): void {
  const len = k.inst.s ?? 4;
  const paint = k.tone(CAR, 0.03);
  k.box(-len / 2, 0, -0.06, len / 2, 1.0, 0, paint, { noTop: true });
  k.box(-len / 2, 1.0, -0.04, len / 2, 1.9, 0, CAR_DARK, { noTop: true });
  k.box(-len / 2, 1.9, -0.06, len / 2, 2.35, 0, paint, { noTop: true });
  k.box(-len / 2, 2.35, -0.12, len / 2, 2.5, 0, CAR_DARK, { bottom: true });
  k.plate(-len / 2, 2.5, len / 2, k.ceil, -0.01, 0x08090a);
  // The stripe, and the windows: most lit, one failing, one dead.
  k.plate(-len / 2, 0.78, len / 2, 0.9, -0.062, k.tone(0x2c4c6c, 0.05));
  const n = Math.max(1, Math.floor(len / 1.3));
  const w = len / n;
  for (let i = 0; i < n && len >= 1; i++) {
    const x = -len / 2 + i * w;
    const r = k.rng.next();
    k.plate(x + 0.14, 1.05, x + w - 0.14, 1.85, -0.042, r < 0.15 ? 0x0c0e10 : LIT, r < 0.15 ? undefined : r < 0.4 ? 'tube' : 'power');
    k.plate(x + w / 2 - 0.02, 1.05, x + w / 2 + 0.02, 1.85, -0.044, CAR_DARK);
  }
  // Rivets along the sill, the gap at the platform's edge.
  for (let x = -len / 2 + 0.15; x < len / 2; x += 0.3) k.plate(x, 0.95, x + 0.03, 0.98, -0.062, C.steel);
  k.plate(-len / 2, 0, len / 2, 0.12, -0.064, 0x08090a);
}

/** A bench seat along the side of a carriage: the wall at +z, the window over it, a strap rail above. */
export function trainSeats(k: Kit): void {
  const seat = k.tone(SEAT, 0.07);
  k.box(-1, 0, -0.2, 1, 0.4, 0.25, CAR_DARK);
  k.box(-0.98, 0.4, -0.22, 0.98, 0.48, 0.25, seat);
  k.box(-0.98, 0.48, 0.14, 0.98, 0.98, 0.25, seat);
  k.plate(-0.02, 0.4, 0.02, 0.98, 0.13, CAR_DARK);
  // The window: black glass with the tunnel behind it, an advertisement card over it.
  k.plate(-0.9, 1.1, 0.9, 1.75, 0.24, 0x0a0c0e);
  k.plate(-0.03, 1.1, 0.03, 1.75, 0.238, C.steel);
  k.box(-1, 1.02, 0.2, 1, 1.1, 0.25, C.steel, { bottom: true });
  for (const [i, x] of [-0.5, 0.5].entries()) k.sub(x, 1.86, 0.22, 0, 20).plate(-0.42, 0, 0.42, 0.26, 0, k.tone([0xd8d0b8, 0x8a2a26, 0x2c4c6c, 0xc8a030][(k.rng.int(0, 3) + i) % 4]!, 0.06));
  // The rail, and the straps on it.
  k.box(-1, 1.98, -0.16, 1, 2.01, -0.13, C.steel, { bottom: true });
  for (let x = -0.75; x < 1; x += 0.5) k.sub(x, 1.98, -0.145, 0, 0, k.rng.range(-10, 10)).box(-0.015, -0.24, -0.01, 0.015, 0, 0.01, 0x2a2420, { bottom: true });
}

/** A pole to hold on to, floor to ceiling. */
export function grabPole(k: Kit): void {
  k.cyl(0, 0, 0, k.ceil, 0.025, 0.025, C.steel, 5, { noTop: true });
  k.cyl(0, 0, 0, 0.03, 0.07, 0.05, C.steelDark, 6);
}

/** The end of a carriage: a panel each side, a header over, the way through between them. */
export function trainBulkhead(k: Kit): void {
  const half = (k.inst.s ?? 3) / 2;
  const paint = k.tone(CAR, 0.03);
  for (const s of [-1, 1]) {
    const z0 = s < 0 ? -half : half - 0.5;
    k.box(-0.08, 0, z0, 0.08, k.ceil, z0 + 0.5, paint, { noTop: true });
    k.box(-0.1, 0, s < 0 ? z0 + 0.46 : z0 - 0.02, 0.1, k.ceil, s < 0 ? z0 + 0.52 : z0 + 0.04, C.steel, { noTop: true });
  }
  k.box(-0.08, 2.05, -half + 0.5, 0.08, k.ceil, half - 0.5, paint, { bottom: true, noTop: true });
  for (const yaw of [90, 270]) k.sub(0, 0, 0, yaw).plate(-0.3, 2.12, 0.3, 2.28, -0.082, [0.5, 1.2, 0.6], 'tube');
}

/** A cabinet of relays behind glass, lamps down its face, some still counting. */
export function relayCabinet(k: Kit): void {
  k.box(-0.48, 0, -0.2, 0.48, 1.95, 0.25, k.tone(0x4a5048, 0.05));
  k.plate(-0.4, 0.9, 0.4, 1.8, -0.202, 0x0e1210);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      const [x, y] = [-0.34 + c * 0.15, 0.98 + r * 0.2];
      k.plate(x, y, x + 0.09, y + 0.13, -0.204, k.tone(0x6a5a3a, 0.12));
    }
  }
  for (let i = 0; i < 6; i++) {
    const lit = k.rng.chance(0.55);
    k.cube(-0.36 + i * 0.145, 0.78, -0.205, 0.05, 0.05, 0.02, lit ? LAMPS[k.rng.int(0, 2)]! : 0x2a1a14, lit ? { glow: k.rng.chance(0.3) ? 'tube' : 'power' } : {});
  }
  k.plate(-0.4, 0.12, 0.4, 0.66, -0.202, k.tone(0x3a4038, 0.05));
  for (let y = 0.2; y < 0.62; y += 0.08) k.plate(-0.32, y, 0.32, y + 0.025, -0.204, 0x14140f);
  k.box(-0.3, 1.95, -0.05, 0.3, 2.0, 0.2, C.steelDark);
}

/** A frame of signal levers: a row of them in a quadrant, some pulled, their plates in colours. */
export function leverFrame(k: Kit): void {
  k.box(-1.45, 0, -0.3, 1.45, 0.5, 0.4, k.tone(0x3a3c3a, 0.05));
  k.sub(0, 0.5, -0.3, 0, -20).box(-1.45, 0, 0, 1.45, 0.05, 0.72, C.steelDark, { bottom: true });
  const PLATES = [0xa82c28, 0x2c4c8c, 0x1a1a1a, 0xc8a030, 0xd8d4c8];
  for (let i = 0; i < 12; i++) {
    const x = -1.32 + i * 0.24;
    const pulled = k.rng.chance(0.35);
    const l = k.sub(x, 0.5, 0.05, 0, pulled ? 28 : -14);
    l.box(-0.02, 0, -0.02, 0.02, 0.85, 0.02, C.steel);
    l.box(-0.03, 0.85, -0.03, 0.03, 1.0, 0.03, C.brass);
    l.box(-0.05, 0.1, -0.03, 0.05, 0.24, -0.02, PLATES[k.rng.int(0, PLATES.length - 1)]!, { bottom: true });
  }
  // The block shelf over the back of it: bells and a telephone.
  for (const x of [-1.4, 1.34]) k.box(x, 0.5, 0.3, x + 0.06, 1.3, 0.4, C.steelDark);
  k.box(-1.45, 1.3, 0.1, 1.45, 1.35, 0.42, k.tone(C.woodDark, 0.06), { bottom: true });
  for (const x of [-0.9, 0.1]) k.cyl(x, 0.26, 1.35, 1.47, 0.09, 0.05, C.brass, 6);
  k.box(0.7, 1.35, 0.16, 1.0, 1.5, 0.36, C.bakelite);
}

/** The lines as lamps on a board: lit when there is current, one section showing red. */
export function trackDiagram(k: Kit): void {
  const y = k.inst.y ?? 1.5;
  k.box(-1.5, y, -0.06, 1.5, y + 1.2, 0, k.tone(0x1c2420, 0.04), { bottom: true });
  for (const s of [-1, 1]) k.plate(-1.5, s < 0 ? y : y + 1.16, 1.5, s < 0 ? y + 0.04 : y + 1.2, -0.062, C.steel);
  const p = k.sub(0, y, -0.062);
  // Two tracks, a crossover, a siding.
  for (const yy of [0.42, 0.74]) p.plate(-1.36, yy, 1.36, yy + 0.035, 0, [0.9, 0.85, 0.5], 'power');
  strut(p, [-0.3, 0.44, -0.001], [0.2, 0.76, -0.001], 0.035, [0.9, 0.85, 0.5], { glow: 'power' });
  strut(p, [0.6, 0.44, -0.001], [0.95, 0.2, -0.001], 0.035, [0.9, 0.85, 0.5], { glow: 'power' });
  p.plate(0.95, 0.19, 1.36, 0.225, 0, [0.9, 0.85, 0.5], 'power');
  // The train that is not going anywhere.
  p.plate(-0.5, 0.735, 0.35, 0.78, -0.002, LAMPS[0]!, 'tube');
  for (const [i, x] of [-1.2, -0.75, -0.1, 0.45, 1.1].entries()) {
    p.cube(x, 0.9, 0, 0.06, 0.06, 0.02, LAMPS[i === 1 || i === 2 ? 0 : 1]!, { glow: 'power' });
    p.cube(x + 0.1, 0.3, 0, 0.06, 0.06, 0.02, LAMPS[i % 2 ? 2 : 1]!, { glow: 'power' });
  }
}
