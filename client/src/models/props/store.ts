import type { RGB } from '../../render/bake';
import { BULBS, WARM, bulb, present } from './festive';
import { C } from './palette';
import { drumX, strut } from './parts';
import type { Kit } from './kit';

// The store kit (The Longest Night): Abelard's toy department, its counters and dummies, the
// grotto, the model railway. Dressed for the season and left as it was at closing time.

const TOYS = [0xa82c28, 0x2c4c8c, 0xc8a030, 0x2c6a44, 0xd8d4c8, 0x7a3a8a, 0xc8581e];
const COATS = [0x5a2c28, 0x2c3c54, 0x4a4438, 0x34483a, 0x7a6a50, 0x2a2a30];
const OAK = 0x6a4a34;
const SKIN = 0xd8c8b0;
const FELT = 0x8a2420;

/** A teddy bear sitting down, `s` times life size (which is small). */
function teddy(k: Kit, x: number, y: number, z: number, yaw: number, s = 1): void {
  const t = k.sub(x, y, z, yaw);
  const fur = k.tone(0x8a5a30, 0.14);
  t.box(-0.1 * s, 0, -0.07 * s, 0.1 * s, 0.22 * s, 0.07 * s, fur);
  t.box(-0.08 * s, 0.22 * s, -0.07 * s, 0.08 * s, 0.37 * s, 0.07 * s, fur);
  for (const sx of [-1, 1]) {
    t.box((sx * 0.09 - 0.03) * s, 0.35 * s, -0.02 * s, (sx * 0.09 + 0.03) * s, 0.42 * s, 0.02 * s, fur);
    t.box((sx * 0.13 - 0.03) * s, 0.08 * s, -0.1 * s, (sx * 0.13 + 0.03) * s, 0.2 * s, -0.02 * s, fur);
    t.box((sx * 0.06 - 0.035) * s, 0, -0.16 * s, (sx * 0.06 + 0.035) * s, 0.07 * s, -0.05 * s, fur);
  }
  t.plate(-0.03 * s, 0.26 * s, 0.03 * s, 0.31 * s, -0.072 * s, 0xd8c8a0);
  t.plate(-0.05 * s, 0.2 * s, 0.05 * s, 0.235 * s, -0.073 * s, C.ribbon);
}

/** Shelves of boxed toys. Variant 1: most of them sold. */
export function toyShelf(k: Kit): void {
  const wood = k.tone(OAK, 0.06);
  k.box(-1, 0, 0.19, 1, 2, 0.25, wood);
  for (const x of [-1, 0.96]) k.box(x, 0, -0.25, x + 0.04, 2, 0.19, wood);
  k.box(-0.96, 0, -0.25, 0.96, 0.12, 0.19, wood);
  k.box(-0.96, 1.96, -0.25, 0.96, 2, 0.19, wood, { bottom: true });
  const stocked = k.variant === 1 ? 0.35 : 0.85;
  for (const [j, y] of [0.12, 0.6, 1.08, 1.56].entries()) {
    if (j) k.box(-0.96, y - 0.03, -0.25, 0.96, y, 0.19, wood, { bottom: true });
    for (let x = -0.92; x < 0.66; ) {
      const [w, h] = [k.rng.range(0.18, 0.36), k.rng.range(0.2, 0.36)];
      if (k.rng.chance(stocked)) k.box(x, y, -0.2 + k.rng.range(0, 0.05), x + w, y + h, 0.15, k.tone(TOYS[k.rng.int(0, TOYS.length - 1)]!, 0.1));
      x += w + k.rng.range(0.02, 0.1);
    }
  }
}

/** A table under a red cloth, heaped: bears (0), boxes and blocks (1), both (2). */
export function displayTable(k: Kit): void {
  k.box(-1, 0, -0.5, 1, 0.8, 0.5, k.tone(FELT, 0.05));
  k.box(-1.03, 0.8, -0.53, 1.03, 0.83, 0.53, k.tone(0xd8d0b8, 0.04), { bottom: true });
  const Y = 0.83;
  if (k.variant !== 1) {
    for (let i = 0; i < 5; i++) teddy(k, -0.75 + i * 0.37 + k.rng.range(-0.05, 0.05), Y, k.rng.range(-0.2, 0.25), 180 + k.rng.range(-35, 35), k.rng.range(0.9, 1.25));
    teddy(k, k.variant === 2 ? -0.5 : 0, Y, -0.05, 180 + k.rng.range(-15, 15), 2.1);
  }
  if (k.variant !== 0) {
    const x0 = k.variant === 2 ? 0.1 : -0.85;
    for (let x = x0, i = 0; x < 0.7; i++) {
      const [w, h, d] = [k.rng.range(0.22, 0.4), k.rng.range(0.08, 0.3), k.rng.range(0.25, 0.4)];
      present(k, x + w / 2, Y, k.rng.range(-0.15, 0.15), w, h, d, k.rng.range(-12, 12), i + k.variant);
      if (k.rng.chance(0.5)) k.cube(x + w / 2, Y + h + 0.06, 0, 0.12, 0.12, 0.12, k.tone(TOYS[i % TOYS.length]!, 0.1));
      x += w + k.rng.range(0.04, 0.12);
    }
  }
}

/** A glass counter: what was under the glass is still lit when the mains are. A till at one end. */
export function shopCounter(k: Kit): void {
  const wood = k.tone(OAK, 0.06);
  k.box(-1, 0, -0.45, 1, 0.45, 0.45, wood);
  for (const x of [-1, 0.96]) for (const z of [-0.45, 0.41]) k.box(x, 0.45, z, x + 0.04, 0.97, z + 0.04, C.brass, { noTop: true });
  k.box(-1, 0.97, -0.45, 1, 1.0, 0.45, C.brass, { bottom: true });
  for (const yaw of [0, 90, 180, 270]) {
    const half = yaw % 180 ? 0.45 : 1;
    k.sub(0, 0, 0, yaw).plate(-half + 0.04, 0.45, half - 0.04, 0.97, -(yaw % 180 ? 1 : 0.45) + 0.02, C.darkGlass);
  }
  k.box(-0.9, 0.9, -0.35, 0.9, 0.93, -0.3, [0.9, 0.8, 0.5], { glow: 'power', bottom: true });
  for (let i = 0; i < 5; i++) k.cube(-0.75 + i * 0.36, 0.5, k.rng.range(-0.2, 0.2), 0.14, 0.1, 0.14, k.tone(TOYS[i % TOYS.length]!, 0.1));
  // The till.
  k.box(0.45, 1.0, -0.2, 0.85, 1.18, 0.2, C.iron);
  k.box(0.5, 1.18, 0, 0.8, 1.34, 0.2, C.iron);
  k.plate(0.52, 1.2, 0.78, 1.32, -0.002, [0.3, 0.9, 0.45], 'power');
}

/** One dummy: no face, a coat, a hat. `h` is how tall it stands. */
function dummy(k: Kit, x: number, z: number, yaw: number, h: number, i: number): void {
  const d = k.sub(x, 0.2, z, yaw);
  const coat = k.tone(COATS[i % COATS.length]!, 0.08);
  const u = h / 1.75;
  for (const sx of [-0.09, 0.09]) d.box((sx - 0.06) * u, 0, -0.07 * u, (sx + 0.06) * u, 0.8 * u, 0.07 * u, 0x24242a);
  d.box(-0.2 * u, 0.62 * u, -0.12 * u, 0.2 * u, 1.45 * u, 0.12 * u, coat);
  d.box(-0.05 * u, 1.45 * u, -0.05 * u, 0.05 * u, 1.52 * u, 0.05 * u, SKIN);
  d.box(-0.09 * u, 1.52 * u, -0.1 * u, 0.09 * u, 1.75 * u, 0.1 * u, SKIN);
  // Arms: one at its side, one held a little out, as if to take somebody's hand.
  strut(d, [-0.24 * u, 1.4 * u, 0], [-0.3 * u, 0.82 * u, 0.02], 0.1 * u, coat, { bottom: true });
  strut(d, [0.24 * u, 1.4 * u, 0], [0.34 * u, 0.95 * u, -0.26 * u], 0.1 * u, coat, { bottom: true });
  if (i % 2) d.box(-0.11 * u, 1.7 * u, -0.12 * u, 0.11 * u, 1.82 * u, 0.12 * u, k.tone(C.ribbon, 0.1));
  else d.box(-0.21 * u, 1.36 * u, -0.14 * u, 0.21 * u, 1.47 * u, 0.14 * u, k.tone(TOYS[(i + 2) % TOYS.length]!, 0.1));
}

/** Shop dummies on a plinth, dressed for the cold. */
export function mannequins(k: Kit): void {
  k.box(-1, 0, -0.5, 1, 0.2, 0.5, k.tone(0xd8d0b8, 0.04));
  k.box(-0.9, 0.2, -0.4, 0.9, 0.22, 0.4, k.tone(C.snow, 0.03));
  if (k.variant === 2) {
    for (const [i, x] of [-0.62, 0, 0.62].entries()) dummy(k, x, k.rng.range(-0.05, 0.12), k.rng.range(-18, 18), k.rng.range(1.68, 1.78), i + 1);
  } else {
    dummy(k, -0.5, 0.05, 12, 1.76, k.rng.int(0, 5));
    dummy(k, 0.15, 0.08, -8, 1.68, k.rng.int(0, 5));
    if (k.variant === 1) dummy(k, 0.66, -0.08, -14, 1.12, 3);
    else present(k, 0.68, 0.22, -0.1, 0.3, 0.26, 0.3, 20, 1);
  }
}

/** A rail of winter coats. */
export function clothesRack(k: Kit): void {
  for (const x of [-0.95, 0.95]) {
    k.box(x - 0.02, 0, -0.02, x + 0.02, 1.55, 0.02, C.steel);
    k.box(x - 0.03, 0, -0.24, x + 0.03, 0.04, 0.24, C.steel);
  }
  k.box(-0.95, 1.5, -0.015, 0.95, 1.53, 0.015, C.steel, { bottom: true });
  for (let x = -0.82; x < 0.8; x += k.rng.range(0.12, 0.3)) {
    const len = k.rng.range(0.7, 1.05);
    k.sub(x, 1.46, 0, k.rng.range(-10, 10)).box(-0.035, -len, -0.21, 0.035, 0, 0.21, k.tone(COATS[k.rng.int(0, COATS.length - 1)]!, 0.1), { bottom: true });
  }
}

/** The gift-wrap counter: paper on the roll behind it, a box half done, ribbon. */
export function wrapCounter(k: Kit): void {
  k.box(-1.5, 0, -0.5, 1.5, 0.92, 0.1, k.tone(OAK, 0.06));
  k.box(-1.52, 0.92, -0.52, 1.52, 0.96, 0.12, k.tone(0xd8d0b8, 0.04), { bottom: true });
  // The rack of rolls.
  for (const x of [-1.46, 1.42]) k.box(x, 0, 0.3, x + 0.04, 1.6, 0.44, C.woodDark);
  for (const [i, y] of [1.08, 1.29, 1.5].entries()) {
    for (const [j, x0] of [-1.38, 0.04].entries()) drumX(k, y, 0.37, x0, x0 + 1.32, 0.095 - i * 0.008, k.tone(TOYS[(i * 2 + j) % TOYS.length]!, 0.06), 6);
  }
  // A sheet pulled down over the counter, the box on it, the ribbon, the scissors.
  const paper = k.tone(TOYS[0]!, 0.05);
  k.box(-1.2, 0.962, -0.4, -0.3, 0.966, 0.1, paper);
  present(k, -0.75, 0.966, -0.15, 0.38, 0.2, 0.3, 14, 4);
  for (const [i, x] of [0.3, 0.52, 0.74].entries()) k.cyl(x, -0.1, 0.96, 1.04, 0.07, 0.07, k.tone([C.ribbon, 0xc8a030, 0x2c6a44][i]!, 0.06), 6);
  k.sub(1.0, 0.962, -0.2, 35).box(-0.11, 0, -0.012, 0.11, 0.012, 0.012, C.steel);
  present(k, 1.15, 0.96, -0.25, 0.26, 0.16, 0.22, -10, 1);
  present(k, 1.2, 1.12, -0.25, 0.18, 0.1, 0.16, 8, 2);
}

/** A little house with its lamp lit (when the mains are). */
function cottage(k: Kit, x: number, z: number, yaw: number, i: number): void {
  const s = k.sub(x, 0.86, z, yaw);
  s.box(-0.11, 0, -0.08, 0.11, 0.13, 0.08, k.tone([0x9a5a40, 0xb8a888, 0x6a7a8a][i % 3]!, 0.08));
  s.box(-0.13, 0.13, -0.1, 0.13, 0.16, 0.1, k.tone(C.snow, 0.03));
  s.box(-0.07, 0.16, -0.06, 0.07, 0.2, 0.06, k.tone(C.snow, 0.03));
  s.plate(-0.06, 0.04, -0.01, 0.1, -0.082, [1.3, 0.95, 0.4], 'power');
  s.plate(0.03, 0.04, 0.08, 0.1, -0.082, [1.3, 0.95, 0.4], 'power');
}

/** The model railway: a town under snow on a table, and a train that goes round it while there is current. */
export function modelRailway(k: Kit): void {
  k.box(-1.5, 0.3, -1, 1.5, 0.8, 1, k.tone(0x2c4a3a, 0.05), { bottom: true });
  for (const x of [-1.4, 1.32]) for (const z of [-0.9, 0.82]) k.box(x, 0, z, x + 0.08, 0.3, z + 0.08, C.woodDark, { noTop: true });
  k.box(-1.46, 0.8, -0.96, 1.46, 0.86, 0.96, k.tone(C.snow, 0.03));
  k.box(-1.5, 0.8, -1, 1.5, 0.9, -0.96, C.woodDark);
  k.box(-1.5, 0.8, 0.96, 1.5, 0.9, 1, C.woodDark);
  for (const x of [-1.5, 1.46]) k.box(x, 0.8, -0.96, x + 0.04, 0.9, 0.96, C.woodDark);
  // The track: a ring, sleeper by sleeper.
  const R = 0.78;
  for (let i = 0; i < 16; i++) k.sub(0, 0.862, 0, i * 22.5).box(-0.17, 0, -R - 0.045, 0.17, 0.008, -R + 0.045, C.iron);
  // The town in the middle of it, a church, firs; a hill at each end of the table.
  for (const [i, [x, z, yaw]] of ([[-0.3, -0.2, 10], [0.25, -0.3, -20], [-0.05, 0.3, 190], [0.38, 0.22, 160], [-0.42, 0.25, 200]] as const).entries()) cottage(k, x, z, yaw, i);
  k.box(-0.05, 0.86, -0.06, 0.05, 1.12, 0.04, k.tone(0xb8a888, 0.05));
  k.cyl(0, -0.01, 1.12, 1.26, 0.06, 0.005, k.tone(C.snow, 0.03), 4);
  for (const [x, z] of [[-1.25, -0.6], [-1.1, 0.5], [1.2, -0.45], [1.05, 0.65], [-1.3, 0.05], [1.3, 0.2], [0.6, -0.02]] as const) {
    k.cyl(x, z, 0.86, 1.08 + k.rng.range(0, 0.08), 0.07, 0.005, k.tone(C.pine, 0.1), 5);
  }
  k.cyl(-1.18, -0.2, 0.86, 1.02, 0.26, 0.1, k.tone(C.snow, 0.04), 6);
  k.cyl(1.2, 0.1, 0.86, 1.06, 0.24, 0.08, k.tone(C.snow, 0.04), 6);
  // The train.
  const train = k.mover(0, 0.87, 0, [0, 1, 0], { kind: 'spin', rate: 0.9, powered: true });
  const car = (a: number, len: number, h: number, colour: number | RGB): void => train.sub(0, 0.87, 0, a).box(-len / 2, 0.01, -R - 0.04, len / 2, h, -R + 0.04, colour);
  car(0, 0.2, 0.1, 0x1c1e22);
  train.sub(0, 0.87, 0, 0).box(-0.1, 0.1, -R - 0.03, -0.04, 0.15, -R + 0.03, 0x1c1e22);
  train.sub(0, 0.87, 0, 0).box(0.04, 0.1, -R - 0.015, 0.07, 0.17, -R + 0.015, 0x1c1e22);
  train.sub(0, 0.87, 0, 0).box(0.1, 0.05, -R - 0.02, 0.104, 0.09, -R + 0.02, [1.6, 1.4, 0.9], { glow: 'power' });
  for (const [i, a] of [17, 33, 49].entries()) car(a, 0.18, 0.09, k.tone(TOYS[i]!, 0.06));
}

/** A toy carousel as tall as a man, turning: nobody stopped it. */
export function toyCarousel(k: Kit): void {
  k.cyl(0, 0, 0, 0.5, 0.42, 0.42, k.tone(FELT, 0.05), 8);
  k.cyl(0, 0, 0.5, 0.56, 0.46, 0.46, C.brass, 8);
  const top = k.mover(0, 0.56, 0, [0, 1, 0], { kind: 'spin', rate: 0.45 });
  top.cyl(0, 0, 0.56, 1.5, 0.04, 0.04, C.brass, 6, { noTop: true });
  top.cyl(0, 0, 0.56, 0.6, 0.4, 0.4, k.tone(0xd8d0b8, 0.04), 8);
  for (let i = 0; i < 8; i++) {
    const s = top.sub(0, 0, 0, i * 45);
    // The canopy, a stripe to each side of it.
    s.face([[-0.19, 1.5, -0.46], [0.19, 1.5, -0.46], [0.02, 1.84, 0], [-0.02, 1.84, 0]], [0, 0.8, -0.6], i % 2 ? 0xd8d0b8 : C.ribbon);
    s.plate(-0.19, 1.42, 0.19, 1.5, -0.46, i % 2 ? C.ribbon : 0xd8d0b8);
    bulb(s, 0, 1.39, -0.47, BULBS[i % BULBS.length]!, 0.05);
    if (i % 2) continue;
    // A horse on its pole.
    const y = 0.78 + (i % 4 ? 0.12 : 0);
    s.box(-0.012, 0.6, -0.312, 0.012, 1.5, -0.288, C.brass, { noTop: true });
    s.box(-0.13, y, -0.34, 0.1, y + 0.12, -0.26, k.tone(0xd8d4c8, 0.05), { bottom: true });
    s.box(0.07, y + 0.08, -0.33, 0.14, y + 0.26, -0.27, k.tone(0xd8d4c8, 0.05), { bottom: true });
    s.box(-0.07, y + 0.12, -0.345, 0.03, y + 0.15, -0.255, k.tone(TOYS[i % TOYS.length]!, 0.06));
    for (const x of [-0.11, 0.07]) s.box(x, y - 0.14, -0.32, x + 0.03, y, -0.28, k.tone(0xd8d4c8, 0.05), { bottom: true });
  }
  k.cyl(0, 0, 1.84, 1.9, 0.04, 0.01, WARM, 4, { glow: 'on' });
}

/** The grotto: the front of a log cabin under cotton-wool snow, its windows lit, the door shut. */
export function grottoHut(k: Kit): void {
  for (let i = 0; i < 8; i++) k.box(-1.5, i * 0.28, -0.2 - (i % 2) * 0.03, 1.5, i * 0.28 + 0.28, 0.5, k.tone(0x6a4428, 0.1), { noTop: i < 7 });
  // The roof, coming forward over the porch; snow on it, and hanging off its edge.
  k.sub(0, 2.2, 0.5, 0, 24).box(-1.5, 0, -1.05, 1.5, 0.1, 0, k.tone(0x4a3020, 0.06), { bottom: true });
  k.sub(0, 2.31, 0.5, 0, 24).box(-1.46, 0, -1.0, 1.46, 0.09, 0, k.tone(C.snow, 0.03));
  for (let x = -1.42; x < 1.3; x += 0.24) k.box(x, 1.72 - k.rng.range(0, 0.12), -0.5, x + 0.2, 1.84, -0.44, k.tone(C.snow, 0.03), { bottom: true });
  k.box(-1.5, 2.24, 0.3, 1.5, 3, 0.5, k.tone(0x6a4428, 0.08));
  // The door, a wreath on it; a window each side.
  k.plate(-0.42, 0, 0.42, 1.7, -0.235, k.tone(0x8a2420, 0.05));
  k.cube(0.3, 0.85, -0.25, 0.06, 0.06, 0.04, C.brass);
  for (const x of [-1.0, 1.0]) {
    k.plate(x - 0.3, 0.9, x + 0.3, 1.5, -0.236, [1.5, 1.05, 0.5], 'on');
    k.box(x - 0.34, 0.84, -0.27, x + 0.34, 0.9, -0.2, k.tone(C.snow, 0.03));
    k.box(x - 0.015, 0.9, -0.25, x + 0.015, 1.5, -0.236, 0x4a3020, { noTop: true });
    k.box(x - 0.3, 1.19, -0.25, x + 0.3, 1.21, -0.236, 0x4a3020);
  }
  for (let i = 0; i < 10; i++) bulb(k, -1.35 + i * 0.3, 1.66, -0.5, BULBS[i % BULBS.length]!, 0.07);
  // A striped post at each corner of the porch.
  for (const x of [-1.42, 1.42]) {
    for (let j = 0; j < 9; j++) k.cyl(x, -0.42, j * 0.2, j * 0.2 + 0.2, 0.05, 0.05, j % 2 ? 0xd8d4c8 : C.ribbon, 6, { noTop: j < 8 });
  }
}

/** The chair in the grotto: red plush, gilt, far too big, and nobody in it. His sack is still beside it. */
export function throne(k: Kit): void {
  const plush = k.tone(FELT, 0.05);
  k.box(-0.5, 0, -0.5, 0.5, 0.12, 0.5, k.tone(0x2c4a3a, 0.05));
  k.box(-0.32, 0.12, -0.28, 0.32, 0.55, 0.3, plush);
  k.box(-0.32, 0.55, 0.16, 0.32, 1.7, 0.3, plush);
  k.box(-0.36, 1.7, 0.14, 0.36, 1.78, 0.32, C.brass);
  k.cyl(0, 0.23, 1.78, 1.9, 0.1, 0.02, C.brass, 4);
  for (const x of [-0.4, 0.32]) {
    k.box(x, 0.12, -0.3, x + 0.08, 0.82, 0.3, plush);
    k.box(x - 0.01, 0.82, -0.32, x + 0.09, 0.86, 0.3, C.brass);
  }
  // The sack, a present showing at its neck.
  k.cyl(-0.3, -0.36, 0.12, 0.5, 0.15, 0.1, k.tone(0x7a2c28, 0.08), 6);
  k.cube(-0.3, 0.54, -0.36, 0.14, 0.1, 0.12, k.tone(TOYS[2]!, 0.06));
}

/** Two brass posts and the rope between them. */
export function ropeBarrier(k: Kit): void {
  for (const x of [-0.9, 0.9]) {
    k.cyl(x, 0, 0, 0.04, 0.16, 0.14, C.brass, 8);
    k.cyl(x, 0, 0.04, 0.95, 0.03, 0.03, C.brass, 6, { noTop: true });
    k.cyl(x, 0, 0.95, 1.0, 0.05, 0.02, C.brass, 6);
  }
  const rope = k.tone(FELT, 0.05);
  const pts: [number, number, number][] = [[-0.9, 0.9, 0], [-0.3, 0.72, 0], [0.3, 0.72, 0], [0.9, 0.9, 0]];
  for (let i = 0; i < 3; i++) strut(k, pts[i]!, pts[i + 1]!, 0.045, rope, { bottom: true });
}

/** The sides of a dead escalator: it climbs `y2` towards the front over a length `s`, and the prop stands at its middle. */
export function escalator(k: Kit): void {
  const [len, rise] = [k.inst.s ?? 7, k.inst.y2 ?? 4];
  const [zA, yA, zB, yB] = [-len / 2, rise / 2, len / 2, -rise / 2];
  /** A length of something that follows the slope, `h` tall, between x0 and x1. */
  const slab = (x0: number, x1: number, lo: number, h: number, colour: number): void => {
    const [a, b] = [yA + lo, yB + lo];
    k.face([[x0, a + h, zA], [x0, b + h, zB], [x1, b + h, zB], [x1, a + h, zA]], [0, 1, 0], colour);
    k.face([[x1, b, zB], [x1, a, zA], [x1, a + h, zA], [x1, b + h, zB]], [1, 0, 0], colour);
    k.face([[x0, a, zA], [x0, b, zB], [x0, b + h, zB], [x0, a + h, zA]], [-1, 0, 0], colour);
  };
  for (const x of [-1, 0.88]) {
    slab(x, x + 0.12, 0, 0.3, C.steel);
    slab(x + 0.04, x + 0.08, 0.3, 0.5, C.darkGlass);
    slab(x + 0.01, x + 0.11, 0.8, 0.07, C.rubber);
    // The newel at each end.
    k.box(x, yB, zB - 0.12, x + 0.12, yB + 0.87, zB, C.steel);
    k.box(x, yA, zA, x + 0.12, yA + 0.87, zA + 0.12, C.steel);
  }
  // The comb plates, yellow at the lip.
  k.box(-0.88, yB, zB - 0.3, 0.88, yB + 0.012, zB - 0.06, C.steelDark);
  k.box(-0.88, yB, zB - 0.06, 0.88, yB + 0.014, zB, C.hazard);
}
