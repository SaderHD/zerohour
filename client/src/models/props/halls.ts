import type { RGB } from '../../render/bake';
import { BULBS, WARM, bulb } from './festive';
import { textTile } from '../../render/signs';
import { C } from './palette';
import { drumX, snowCap } from './parts';
import type { Kit } from './kit';

// The halls kit (The Longest Night): the Lyric, a picture house with the last reel still running,
// and St Audra's, where somebody lit every candle before they left.

const PLUSH = 0x7a2224;
const OAK = 0x4a3424;
const STONE = 0x9a9488;
const GILT = 0xb89838;
const FLAME: RGB = [1.7, 1.15, 0.45];
/** Glass with the city's glow behind it. */
const PANES: RGB[] = [[0.7, 0.1, 0.08], [0.1, 0.2, 0.75], [0.8, 0.55, 0.1], [0.1, 0.5, 0.25], [0.5, 0.12, 0.55], [0.75, 0.7, 0.55]];

/** A candle with its flame. */
function candle(k: Kit, x: number, y: number, z: number, h: number, lit = true): void {
  k.box(x - 0.02, y, z - 0.02, x + 0.02, y + h, z + 0.02, 0xd8d0b8);
  if (lit) k.cube(x, y + h + 0.035, z, 0.03, 0.06, 0.03, FLAME, { glow: 'fire', bottom: true });
}

// --- The Lyric

/** Five tip-up seats: most up, one or two left down. */
export function cinemaSeats(k: Kit): void {
  const plush = k.tone(PLUSH, 0.07);
  k.box(-1.23, 0.3, 0.1, 1.23, 1.0, 0.2, plush, { bottom: true });
  k.box(-1.25, 0, 0.12, 1.25, 0.3, 0.18, C.iron, { noTop: true });
  for (let i = 0; i <= 5; i++) {
    const x = -1.25 + i * 0.5;
    k.box(Math.max(-1.25, x - 0.03), 0, -0.2, Math.min(1.25, x + 0.03), 0.62, 0.2, k.tone(OAK, 0.06));
    if (i === 5) break;
    if (k.rng.chance(0.2)) k.box(x + 0.05, 0.4, -0.24, x + 0.45, 0.48, 0.1, plush, { bottom: true });
    else k.box(x + 0.05, 0.3, 0, x + 0.45, 0.72, 0.09, plush, { bottom: true });
  }
}

/** The screen between its curtains, a white frame on it and nothing in the frame. */
export function cinemaScreen(k: Kit): void {
  const [w, y] = [k.inst.s ?? 10, k.inst.y ?? 2.4];
  const h = 3.8;
  const [sw, drape] = [w / 2 - 1.1, k.tone(0x5a1c20, 0.05)];
  k.box(-w / 2, y - 0.25, -0.12, w / 2, y, 0, 0x1a1414, { bottom: true });
  k.plate(-sw, y, sw, y + h, -0.03, 0x24242a);
  // The frame the projector throws: a little off square, a little short of the edges.
  k.sub(0, 0, 0, 0, 0, 0.6).plate(-sw + 0.5, y + 0.3, sw - 0.4, y + h - 0.35, -0.04, [1.0, 0.98, 0.9], 'fire');
  // Curtains, drawn back in folds; the pelmet over them.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const x = s * (w / 2 - 0.14 - i * 0.28);
      k.box(x - 0.14, y - 0.2, -0.16 - (i % 2) * 0.05, x + 0.14, y + h + 0.1, 0, drape, { noTop: true });
    }
  }
  k.box(-w / 2, y + h, -0.26, w / 2, y + h + 0.5, 0, k.tone(0x5a1c20, 0.05), { bottom: true });
  for (let x = -w / 2 + 0.3; x < w / 2; x += 0.6) k.plate(x - 0.2, y + h - 0.14, x + 0.2, y + h, -0.262, GILT);
}

/** The projector: lamp house on a pedestal, the lens lit, both reels turning. */
export function projector(k: Kit): void {
  k.box(-0.3, 0, -0.25, 0.3, 0.08, 0.35, C.iron);
  k.box(-0.12, 0.08, -0.05, 0.12, 0.95, 0.2, C.steelDark);
  k.box(-0.2, 0.95, -0.2, 0.2, 1.4, 0.42, k.tone(0x3a4038, 0.05));
  k.box(-0.14, 1.4, 0.14, 0.14, 1.52, 0.34, C.steelDark);
  k.sub(0, 1.18, 0, 0, 90).cyl(0, 0, 0.2, 0.4, 0.07, 0.085, C.steelDark, 8, { noTop: true });
  k.cube(0, 1.18, -0.402, 0.11, 0.11, 0.01, [2.2, 2.1, 1.9], { glow: 'on' });
  k.plate(-0.16, 1.0, -0.06, 1.1, -0.202, [1.4, 0.3, 0.15], 'on');
  // The reels, on an arm fore and aft.
  for (const [z, y, rate] of [[-0.12, 1.72, 1.6], [0.36, 1.66, 1.1]] as const) {
    k.box(0.2, 1.3, z - 0.02, 0.24, y, z + 0.02, C.steelDark);
    const reel = k.mover(0.27, y, z, [1, 0, 0], { kind: 'spin', rate });
    drumX(reel, y, z, 0.25, 0.29, 0.2, C.steel, 8);
    for (const roll of [0, 60, 120]) reel.sub(0.3, y, z, 0, roll).box(-0.004, -0.17, -0.025, 0, 0.17, 0.025, C.iron, { bottom: true });
  }
}

/** The ticket booth: glass above the sill, a hole to talk through, bulbs round its roof. */
export function ticketBooth(k: Kit): void {
  const paint = k.tone(0x5a1c20, 0.05);
  k.box(-0.75, 0, -0.75, 0.75, 1.05, 0.75, paint);
  k.box(-0.8, 1.05, -0.8, 0.8, 1.1, 0.8, GILT, { bottom: true });
  for (const x of [-0.75, 0.69]) for (const z of [-0.75, 0.69]) k.box(x, 1.1, z, x + 0.06, 2.2, z + 0.06, GILT, { noTop: true });
  for (const yaw of [0, 90, 270]) k.sub(0, 0, 0, yaw).plate(-0.69, 1.1, 0.69, 2.2, -0.72, C.darkGlass);
  k.box(-0.75, 1.1, 0.69, 0.75, 2.2, 0.75, paint);
  k.plate(-0.14, 1.12, 0.14, 1.3, -0.725, 0x08080a);
  k.plate(-0.3, 1.9, 0.3, 2.12, -0.725, [1.3, 0.95, 0.45], 'on');
  const label = textTile('TICKETS', 'ink');
  k.picture(0, 2.01, -0.729, 0.17 * label.aspect * 0.8, 0.17, label.uv);
  k.box(-0.85, 2.2, -0.85, 0.85, 2.5, 0.85, paint, { bottom: true });
  for (let i = 0; i < 6; i++) {
    for (const yaw of [0, 90, 270]) bulb(k.sub(0, 0, 0, yaw), -0.7 + i * 0.28, 2.35, -0.87, i % 2 ? WARM : BULBS[1]!, 0.07);
  }
  k.cyl(0, 0, 2.5, 2.6, 0.5, 0.3, GILT, 8);
}

/** The popcorn stand: the lamp over the corn has never gone out. */
export function popcornStand(k: Kit): void {
  for (let i = 0; i < 8; i++) k.box(-1 + i * 0.25, 0, -0.5, -0.75 + i * 0.25, 0.95, 0.5, i % 2 ? 0xd8d0b8 : k.tone(C.ribbon, 0.05), { noTop: true });
  k.box(-1.03, 0.95, -0.53, 1.03, 1.0, 0.53, C.steel, { bottom: true });
  // The glass case, the corn heaped in it.
  for (const x of [-0.6, 0.56]) for (const z of [-0.4, 0.36]) k.box(x, 1.0, z, x + 0.04, 1.7, z + 0.04, C.steel, { noTop: true });
  k.box(-0.56, 1.0, -0.36, 0.56, 1.22, 0.36, [1.5, 1.2, 0.5], { glow: 'on' });
  k.box(-0.3, 1.22, -0.2, 0.35, 1.34, 0.2, [1.5, 1.2, 0.5], { glow: 'on' });
  k.box(-0.66, 1.7, -0.46, 0.66, 2.0, 0.46, k.tone(C.ribbon, 0.05), { bottom: true });
  k.plate(-0.5, 1.76, 0.5, 1.94, -0.462, [1.4, 1.1, 0.5], 'on');
  for (let i = 0; i < 5; i++) bulb(k, -0.56 + i * 0.28, 2.04, -0.42, WARM, 0.07);
  // Tubs, stacked and filled.
  for (const [i, x] of [-0.88, 0.78, 0.9].entries()) {
    k.cyl(x, -0.3 + i * 0.12, 1.0, 1.2, 0.06, 0.08, i % 2 ? 0xd8d0b8 : C.ribbon, 6);
    if (i) k.cyl(x, -0.3 + i * 0.12, 1.2, 1.25, 0.08, 0.05, [1.0, 0.85, 0.4], 6);
  }
}

/** What the Lyric was showing, and what was coming: nothing anybody has heard of. */
const FILMS = ['THE LONG FROST', 'MIDNIGHT TRAM', 'SNOWBLIND', 'A STAR FOR ELSIE'];

/** A poster in its case: nobody's name on it, a border of bulbs. */
export function posterCase(k: Kit): void {
  const y = k.inst.y ?? 0.9;
  k.box(-0.6, y, -0.06, 0.6, y + 1.8, 0, GILT, { bottom: true });
  const ART: [number, number, number][] = [[0x1c2c4c, 0xc8a030, 0xd8d0b8], [0x4c1c1c, 0xd8d0b8, 0x1a1a1a], [0x1c3c2c, 0xa82c28, 0xc8a030], [0x2a2038, 0x6a8ab0, 0xd8d0b8]];
  const [field, a, b] = ART[k.variant % ART.length]!;
  k.plate(-0.52, y + 0.08, 0.52, y + 1.72, -0.062, k.tone(field, 0.05));
  // A shape, a horizon, the bands the title and the names went on.
  k.sub(k.rng.range(-0.15, 0.15), y + 1.15, 0, 0, 0, k.rng.range(-20, 20)).plate(-0.22, -0.3, 0.22, 0.3, -0.064, k.tone(a, 0.05));
  k.plate(-0.52, y + 0.62, 0.52, y + 0.68, -0.064, b);
  k.plate(-0.42, y + 0.36, 0.42, y + 0.52, -0.064, b);
  // What was showing: its name on the band.
  const title = textTile(FILMS[k.variant % FILMS.length]!, k.variant % ART.length === 1 ? 'stencil' : 'ink');
  k.picture(0, y + 0.44, -0.066, Math.min(0.8, 0.13 * title.aspect), 0.13, title.uv);
  k.plate(-0.3, y + 0.18, 0.3, y + 0.25, -0.064, a);
  for (let i = 0; i < 4; i++) {
    for (const x of [-0.56, 0.56]) bulb(k, x, y + 0.2 + i * 0.47, -0.08, WARM, 0.05);
  }
}

/** The canopy over the Lyric's doors: three lit faces, the house's name (`text`) on the long one and what is left of the bill on the ends, bulbs under it. */
export function marquee(k: Kit): void {
  const [len, y] = [k.inst.s ?? 7, k.inst.y ?? 3.2];
  const D = 2;
  k.box(-len / 2, y, -D, len / 2, y + 1.1, 0, k.tone(0x5a1c20, 0.05), { bottom: true });
  snowCap(k, -len / 2, -D, len / 2, 0, y + 1.1, 0.12);
  const board: RGB = [1.05, 0.9, 0.6];
  /** A lit board `w` wide in the plane z = `z` of kit `s`, rails for letters across it, a few letters left. */
  const name = k.inst.text ? textTile(k.inst.text, 'ink') : null;
  const face = (s: Kit, w: number, z: number): void => {
    s.plate(-w / 2 + 0.12, y + 0.18, w / 2 - 0.12, y + 0.92, z, board, 'on');
    // The house's name across the long face; on the ends, what is left of the bill.
    const named = name && w > 3;
    if (named) s.picture(0, y + 0.55, z - 0.004, Math.min(w - 0.8, 0.56 * name.aspect), 0.56, name.uv);
    for (const [j, yy] of [0.3, 0.6].entries()) {
      if (named) continue;
      for (let x = -w / 2 + 0.4; x < w / 2 - 0.5; x += 0.34) if (s.rng.chance(j ? 0.3 : 0.45)) s.plate(x, y + yy, x + 0.2, y + yy + 0.22, z - 0.004, 0x141014);
    }
    for (let x = -w / 2 + 0.15; x < w / 2; x += 0.3) {
      bulb(s, x, y + 0.08, z - 0.03, WARM, 0.07);
      bulb(s, x, y + 1.02, z - 0.03, BULBS[0]!, 0.07);
    }
  };
  face(k, len, -D - 0.004);
  face(k.sub(len / 2, 0, -D / 2, 270), D, -0.004);
  face(k.sub(-len / 2, 0, -D / 2, 90), D, -0.004);
  // The soffit: rows of bulbs to walk in under.
  for (let x = -len / 2 + 0.35; x < len / 2; x += 0.5) for (const z of [-1.6, -1.0, -0.4]) bulb(k, x, y - 0.04, z, WARM, 0.08);
}

// --- St Audra's

export function pew(k: Kit): void {
  const oak = k.tone(OAK, 0.07);
  k.box(-0.94, 0.4, -0.2, 0.94, 0.45, 0.14, oak, { bottom: true });
  k.box(-0.94, 0.1, 0.14, 0.94, 0.95, 0.19, oak, { bottom: true });
  for (const x of [-1, 0.94]) {
    k.box(x, 0, -0.24, x + 0.06, 0.7, 0.24, oak);
    k.box(x, 0.7, 0.02, x + 0.06, 1.0, 0.24, oak);
  }
  k.box(-0.94, 0.95, 0.12, 0.94, 0.99, 0.21, oak);
  // A book left on the seat.
  if (k.rng.chance(0.6)) k.sub(k.rng.range(-0.7, 0.7), 0.45, -0.04, k.rng.range(-30, 30)).box(-0.07, 0, -0.1, 0.07, 0.03, 0.1, k.tone(0x3a1c1c, 0.1));
}

/** The altar: a white cloth, a cross, a book open, six candles alight. */
export function altar(k: Kit): void {
  k.box(-0.9, 0, -0.4, 0.9, 1.0, 0.4, k.tone(STONE, 0.04));
  k.box(-1, 1.0, -0.5, 1, 1.04, 0.5, k.tone(0xd8d4c8, 0.03), { bottom: true });
  k.box(-1, 0.7, -0.5, 1, 1.0, -0.49, k.tone(0xd8d4c8, 0.03), { bottom: true });
  k.plate(-0.16, 0.3, 0.16, 1.0, -0.502, k.tone(0x5a2c6a, 0.05));
  k.plate(-0.04, 0.5, 0.04, 0.9, -0.504, GILT);
  k.plate(-0.12, 0.74, 0.12, 0.8, -0.504, GILT);
  k.box(-0.03, 1.04, 0.2, 0.03, 1.5, 0.26, GILT);
  k.box(-0.15, 1.32, 0.2, 0.15, 1.38, 0.26, GILT);
  k.sub(0, 1.04, -0.2, 0, -12).box(-0.2, 0, -0.14, 0.2, 0.03, 0.14, 0xd8d0b8);
  for (const x of [-0.82, -0.62, -0.42, 0.42, 0.62, 0.82]) {
    k.cyl(x, 0.15, 1.04, 1.16, 0.045, 0.025, GILT, 6);
    candle(k, x, 1.16, 0.15, 0.22 + Math.abs(x) * 0.12);
  }
}

/** The organ: console and stool below, the pipes standing over them. */
export function organ(k: Kit): void {
  const oak = k.tone(OAK, 0.06);
  k.box(-1.5, 0, -0.1, 1.5, 1.7, 0.5, oak);
  k.box(-0.7, 0.72, -0.34, 0.7, 0.8, -0.1, oak, { bottom: true });
  for (const [j, y] of [0.8, 0.92].entries()) {
    k.box(-0.6, y, -0.3 + j * 0.1, 0.6, y + 0.03, -0.1, 0xd8d4c8);
    for (let i = 0; i < 16; i++) if (i % 7 !== 2 && i % 7 !== 6) k.box(-0.57 + i * 0.072, y + 0.03, -0.24 + j * 0.1, -0.54 + i * 0.072, y + 0.045, -0.1, 0x141014);
  }
  k.plate(-0.5, 1.12, 0.5, 1.5, -0.102, 0xd8d0b8);
  for (const x of [-0.85, 0.85]) for (let i = 0; i < 4; i++) k.cyl(x, -0.13, 0.9 + i * 0.16, 0.94 + i * 0.16, 0.035, 0.035, 0xd8d4c8, 6);
  k.box(-0.4, 0, -0.5, 0.4, 0.5, -0.38, oak);
  // The pipes: tallest at the ends and in the middle.
  const tin = (): RGB => k.tone(0xa8a898, 0.06);
  for (let i = 0; i < 19; i++) {
    const t = Math.abs(i - 9) / 9;
    const top = 2.6 + 1.8 * Math.max(1 - Math.abs(t - 0) * 3, 1 - Math.abs(t - 1) * 2.2, 0.15);
    const x = -1.35 + i * 0.15;
    k.cyl(x, 0.2, 1.7, top, 0.06, 0.06, tin(), 6);
    k.plate(x - 0.03, 1.95, x + 0.03, 2.02, 0.138, 0x141014);
  }
  k.box(-1.5, 1.7, -0.02, 1.5, 1.86, 0.5, oak);
  for (const x of [-1.5, 1.42]) k.box(x, 1.86, 0.05, x + 0.08, 4.5, 0.45, oak);
}

/** A robed figure, knee high. */
function figure(k: Kit, x: number, z: number, yaw: number, h: number, robe: number): void {
  const s = k.sub(x, 0.12, z, yaw);
  s.cyl(0, 0, 0, h * 0.72, h * 0.2, h * 0.11, k.tone(robe, 0.08), 6);
  s.cube(0, h * 0.84, 0, h * 0.17, h * 0.2, h * 0.17, 0xc8a888);
  s.box(-h * 0.11, h * 0.86, -h * 0.02, h * 0.11, h * 0.98, h * 0.12, k.tone(robe, 0.08));
}

/** The nativity: everyone is there but the child. */
export function nativity(k: Kit): void {
  const wood = k.tone(0x6a4a2c, 0.08);
  k.box(-1, 0, -0.5, 1, 0.12, 0.5, wood);
  k.box(-0.95, 0.12, 0.38, 0.95, 1.2, 0.44, wood);
  for (const x of [-0.95, 0.89]) k.box(x, 0.12, -0.42, x + 0.06, 1.1, -0.36, wood, { noTop: true });
  k.sub(0, 1.2, 0.5, 0, 14).box(-1.02, 0, -1.02, 1.02, 0.06, 0, k.tone(0x9a8448, 0.08), { bottom: true });
  k.cube(0, 1.52, -0.3, 0.14, 0.14, 0.03, WARM, { glow: 'on' });
  k.box(-0.9, 0.12, -0.4, 0.9, 0.14, 0.38, k.tone(0xb89a50, 0.08));
  figure(k, -0.34, 0.08, 160, 0.62, 0x2c4c8c);
  figure(k, 0.36, 0.1, 200, 0.7, 0x6a4a34);
  figure(k, -0.74, -0.14, 130, 0.6, 0x7a3a8a);
  figure(k, 0.74, -0.2, 235, 0.62, 0xa82c28);
  figure(k, 0.62, 0.22, 215, 0.6, 0x2c6a44);
  // An ox, lying down.
  k.box(-0.8, 0.12, 0.14, -0.46, 0.32, 0.34, k.tone(0x5a4030, 0.08));
  k.box(-0.5, 0.2, 0.16, -0.36, 0.36, 0.3, k.tone(0x5a4030, 0.08));
  // The crib: straw in it, and that is all.
  for (const sx of [-1, 1]) {
    k.sub(sx * 0.12, 0.12, -0.12, 0, 0, sx * 28).box(-0.015, 0, -0.1, 0.015, 0.32, 0.1, wood);
    k.sub(sx * 0.12, 0.12, -0.12, 0, 0, sx * -28).box(-0.015, 0, -0.1, 0.015, 0.32, 0.1, wood);
  }
  k.box(-0.12, 0.26, -0.21, 0.12, 0.3, -0.03, k.tone(0xb89a50, 0.08), { bottom: true });
}

/** A stand of votive candles, most of them burning. */
export function candleStand(k: Kit): void {
  k.cyl(0, 0, 0, 0.04, 0.2, 0.18, C.iron, 6);
  k.cyl(0, 0, 0.04, 0.85, 0.025, 0.025, C.iron, 5, { noTop: true });
  for (const [j, y] of [0.85, 1.0].entries()) {
    k.box(-0.22, y, -0.16 + j * 0.16, 0.22, y + 0.02, 0.0 + j * 0.16, C.iron, { bottom: true });
    for (let i = 0; i < 5; i++) candle(k, -0.18 + i * 0.09, y + 0.02, -0.08 + j * 0.16, k.rng.range(0.05, 0.13), k.rng.chance(0.75));
  }
}

/** Coloured glass: a lancet (0) or a rose (1), in stone, the city's glow coming through it. */
export function stainedGlass(k: Kit): void {
  const y = k.inst.y ?? 1.6;
  const stone = k.tone(STONE, 0.04);
  const pane = (): RGB => {
    const c = PANES[k.rng.int(0, PANES.length - 1)]!;
    const g = k.rng.range(0.2, 0.42);
    return [c[0] * g, c[1] * g, c[2] * g];
  };
  if (k.variant === 1) {
    const R = 1.3;
    k.sub(0, y + R, 0, 0, 90).cyl(0, 0, 0, 0.06, R + 0.18, R + 0.12, stone, 12, { bottom: true });
    k.sub(0, y + R, -0.062, 0, 90).cyl(0, 0, 0, 0.004, 0.2, 0.2, [0.5, 0.4, 0.18], 8, { glow: 'on', bottom: true });
    for (let i = 0; i < 12; i++) {
      const s = k.sub(0, y + R, 0, 0, 0, i * 30);
      s.plate(-0.13, 0.26, 0.13, 0.78, -0.064, pane(), 'on');
      s.plate(-0.26, 0.84, 0.26, R - 0.06, -0.064, pane(), 'on');
    }
    return;
  }
  const [W, H] = [0.55, 2.2];
  k.box(-W - 0.1, y - 0.1, -0.06, W + 0.1, y + H, 0, stone, { bottom: true });
  for (let j = 0; j < 5; j++) {
    for (const [x0, x1] of [[-W, -0.02], [0.02, W]] as const) k.plate(x0, y + j * 0.44 + 0.02, x1, y + j * 0.44 + 0.42, -0.064, pane(), 'on');
  }
  // The point of the arch, in steps.
  for (const [j, w] of [0.44, 0.3, 0.14].entries()) {
    k.box(-w - 0.1, y + H + j * 0.24, -0.06, w + 0.1, y + H + j * 0.24 + 0.24, 0, stone, { bottom: true });
    k.plate(-w, y + H + j * 0.24, w, y + H + j * 0.24 + 0.22, -0.064, pane(), 'on');
  }
}

/** The chapel's doorway: stone piers, a pointed gable over the door, a cross on that, snow on every ledge. */
export function porch(k: Kit): void {
  const stone = (): RGB => k.tone(STONE, 0.05);
  for (const x of [-1.6, 1.15]) {
    k.box(x, 0, -0.4, x + 0.45, 3.0, 0, stone());
    k.box(x - 0.05, 3.0, -0.45, x + 0.5, 3.15, 0, stone(), { bottom: true });
  }
  for (let j = 0; j < 6; j++) {
    const w = 1.65 - j * 0.28;
    k.box(-w, 3.15 + j * 0.28, -0.42, w, 3.43 + j * 0.28, 0, stone(), { bottom: true });
    for (const s of [-1, 1]) k.box(s * w - 0.14, 3.43 + j * 0.28, -0.4, s * w + 0.14, 3.48 + j * 0.28, -0.02, k.tone(C.snow, 0.03));
  }
  k.box(-0.07, 4.83, -0.28, 0.07, 5.6, -0.14, stone());
  k.box(-0.28, 5.2, -0.28, 0.28, 5.34, -0.14, stone());
  // A lantern under the point of it.
  k.box(-0.01, 2.75, -0.22, 0.01, 3.15, -0.2, C.iron, { noTop: true });
  k.cube(0, 2.62, -0.21, 0.2, 0.26, 0.2, [1.5, 1.1, 0.5], { glow: 'on', bottom: true });
  k.cube(0, 2.77, -0.21, 0.26, 0.04, 0.26, C.iron, { bottom: true });
}
