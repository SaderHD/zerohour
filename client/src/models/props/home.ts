import type { RGB } from '../../render/bake';
import { C } from './palette';
import { drumZ, strut } from './parts';
import type { Kit } from './kit';

// The home kit (The Longest Night): the tenement's hall, and the flat upstairs, where dinner was
// on the table and the television is still on.

const WALNUT = 0x5a4030;
const CLOTH = 0xd8d4c8;
const SNOW_SCREEN: RGB = [1.25, 1.3, 1.4];
const FABRICS = [0x5a6a4a, 0x6e4a3a, 0x4a5a70, 0x7a6a4a];

/** A bank of letter boxes: three rows of brass doors, a card in some. */
export function mailboxes(k: Kit): void {
  const y = k.inst.y ?? 1;
  k.box(-0.8, y, -0.12, 0.8, y + 0.9, 0, k.tone(0x4a4438, 0.05), { bottom: true });
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 6; c++) {
      const [x, yy] = [-0.74 + c * 0.25, y + 0.06 + r * 0.28];
      k.plate(x, yy, x + 0.22, yy + 0.24, -0.122, k.tone(C.brass, 0.1));
      k.plate(x + 0.04, yy + 0.15, x + 0.18, yy + 0.2, -0.124, k.rng.chance(0.6) ? C.paper : 0x1a1814);
      k.plate(x + 0.09, yy + 0.04, x + 0.13, yy + 0.08, -0.124, 0x1a1814);
    }
  }
}

/** A cast-iron radiator under the wall. */
export function radiator(k: Kit): void {
  const iron = k.tone(0xb8b4a4, 0.05);
  for (let i = 0; i < 9; i++) k.box(-0.56 + i * 0.125, 0.12, -0.16, -0.46 + i * 0.125, 0.78, -0.04, iron, { bottom: true });
  for (const x of [-0.56, 0.5]) k.box(x, 0, -0.14, x + 0.06, 0.12, -0.06, iron, { noTop: true });
  k.box(0.56, 0.16, -0.12, 0.74, 0.2, -0.08, C.copper, { bottom: true });
  k.box(0.7, 0, -0.12, 0.74, 0.16, -0.08, C.copper, { noTop: true });
}

/** A picture: somebody's hills, somebody's family, a calendar. */
export function pictureFrame(k: Kit): void {
  const y = k.inst.y ?? 1.5;
  const v = k.variant % 3;
  const [w, h] = v === 1 ? [0.5, 0.64] : [0.8, 0.56];
  k.sub(0, 0, 0, 0, 0, k.rng.range(-3, 3)).box(-w / 2, y, -0.04, w / 2, y + h, 0, k.tone(v === 2 ? C.paper : WALNUT, 0.06), { bottom: true });
  const p = k.sub(0, y, -0.042);
  if (v === 0) {
    p.plate(-w / 2 + 0.05, 0.05, w / 2 - 0.05, h - 0.05, 0, 0x6a8090);
    p.plate(-w / 2 + 0.05, 0.05, w / 2 - 0.05, 0.24, -0.002, 0x3a5038);
    p.plate(-0.12, 0.2, 0.2, 0.34, -0.003, 0x4a5a50);
  } else if (v === 1) {
    p.plate(-w / 2 + 0.05, 0.05, w / 2 - 0.05, h - 0.05, 0, 0x8a8068);
    for (const x of [-0.1, 0.08]) {
      p.plate(x - 0.07, 0.08, x + 0.07, 0.36, -0.002, 0x2a2622);
      p.plate(x - 0.045, 0.36, x + 0.045, 0.46, -0.002, 0xb89878);
    }
  } else {
    p.plate(-w / 2 + 0.04, h - 0.2, w / 2 - 0.04, h - 0.04, 0, C.ribbon);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 7; c++) p.plate(-0.33 + c * 0.1, 0.04 + r * 0.07, -0.27 + c * 0.1, 0.09 + r * 0.07, 0, r === 0 && c === 3 ? C.red : 0x4a4a48);
  }
}

/** A bicycle leant on the wall behind it. */
export function bicycle(k: Kit): void {
  const paint = k.tone([0x7a2a26, 0x2c4c6c, 0x3a5a3c][k.variant % 3]!, 0.06);
  const b = k.sub(0, 0, 0.12, 0, -9);
  for (const x of [-0.56, 0.56]) {
    drumZ(b, x, 0.34, -0.02, 0.02, 0.34, C.rubber, 10);
    drumZ(b, x, 0.34, -0.03, 0.03, 0.05, C.steel, 6);
  }
  const P = (x: number, y: number): [number, number, number] => [x, y, 0];
  for (const [a, c] of [[P(-0.56, 0.34), P(-0.2, 0.84)], [P(-0.2, 0.84), P(0.4, 0.86)], [P(-0.1, 0.36), P(0.4, 0.86)], [P(-0.2, 0.84), P(-0.1, 0.36)], [P(-0.56, 0.34), P(-0.1, 0.36)], [P(0.56, 0.34), P(0.42, 0.98)]] as const) {
    strut(b, a, c, 0.035, paint, { bottom: true });
  }
  b.box(-0.3, 0.9, -0.07, -0.06, 0.95, 0.07, 0x2a2420, { bottom: true });
  b.box(0.38, 0.98, -0.24, 0.44, 1.02, 0.24, C.steel, { bottom: true });
  b.box(0.5, 0.74, -0.14, 0.72, 0.92, 0.14, k.tone(C.cork, 0.08), { bottom: true });
}

/** One dining chair at (x, z), its back to `yaw`. */
function chair(k: Kit, x: number, z: number, yaw: number): void {
  const c = k.sub(x, 0, z, yaw);
  const wood = k.tone(WALNUT, 0.08);
  c.box(-0.2, 0.42, -0.2, 0.2, 0.46, 0.2, wood, { bottom: true });
  for (const lx of [-0.2, 0.16]) for (const lz of [-0.2, 0.16]) c.box(lx, 0, lz, lx + 0.04, 0.42, lz + 0.04, wood, { noTop: true });
  c.box(-0.2, 0.46, 0.16, 0.2, 0.92, 0.2, wood);
}

/** The table laid for Christmas dinner: a cloth, six places, the bird in the middle, candles lit. */
export function dinnerTable(k: Kit): void {
  k.box(-0.95, 0.72, -0.5, 0.95, 0.78, 0.5, CLOTH, { bottom: true });
  for (const s of [-1, 1]) {
    k.sub(0, 0, 0, s < 0 ? 0 : 180).box(-0.95, 0.5, -0.51, 0.95, 0.72, -0.5, CLOTH, { noTop: true });
    k.box(s * 0.8 - 0.04, 0, -0.04, s * 0.8 + 0.04, 0.72, 0.04, WALNUT, { noTop: true });
  }
  for (const x of [-0.6, 0, 0.6]) {
    for (const s of [-1, 1]) {
      // One chair is pushed back, and one is over.
      const out = k.rng.chance(0.25) ? 0.22 : 0;
      chair(k, x + k.rng.range(-0.04, 0.04), s * (0.72 + out), s < 0 ? 180 + k.rng.range(-12, 12) : k.rng.range(-12, 12));
      k.cyl(x, s * 0.3, 0.78, 0.8, 0.11, 0.13, 0xd8d0b8, 6);
      k.cube(x + 0.2, 0.785, s * 0.3, 0.02, 0.01, 0.16, C.steel);
      if (k.rng.chance(0.6)) k.cyl(x - 0.2, s * 0.36, 0.78, 0.9, 0.02, 0.04, C.glass, 5);
    }
  }
  // The bird, the dishes, the candles, a cracker by a plate.
  k.cyl(0, 0, 0.78, 0.81, 0.26, 0.28, C.steel, 8);
  k.cube(0, 0.89, 0, 0.3, 0.16, 0.22, k.tone(0x8a5a2a, 0.06));
  for (const x of [-0.14, 0.14]) k.cube(x, 0.86, -0.13, 0.07, 0.07, 0.1, k.tone(0x8a5a2a, 0.06));
  for (const x of [-0.6, 0.6]) {
    k.cyl(x, 0, 0.78, 0.86, 0.12, 0.14, k.tone(0x5a7a4a, 0.1), 6);
    k.cyl(x * 0.55, 0.08, 0.78, 0.8, 0.04, 0.04, C.brass, 5);
    k.box(x * 0.55 - 0.012, 0.8, 0.068, x * 0.55 + 0.012, 0.98, 0.092, C.red);
    k.cube(x * 0.55, 1.01, 0.08, 0.03, 0.06, 0.03, [1.7, 1.15, 0.45], { glow: 'fire', bottom: true });
  }
  k.sub(-0.3, 0.8, -0.34, 30).box(-0.1, 0, -0.02, 0.1, 0.04, 0.02, C.ribbon);
}

/** A television on a stand: nothing on but snow. */
export function television(k: Kit): void {
  k.box(-0.4, 0, -0.18, 0.4, 0.5, 0.22, k.tone(WALNUT, 0.06));
  k.plate(-0.34, 0.08, 0.34, 0.42, -0.182, 0x2a1c14);
  const set = k.tone(0x4a3a2c, 0.05);
  k.box(-0.36, 0.5, -0.2, 0.36, 1.06, 0.2, set);
  k.plate(-0.3, 0.56, 0.16, 1.0, -0.202, SNOW_SCREEN, 'fire');
  for (let i = 0; i < 9; i++) k.plate(-0.3, 0.58 + i * 0.045, 0.16, 0.592 + i * 0.045, -0.204, [0.55, 0.58, 0.66], 'fire');
  for (const y of [0.9, 0.76]) k.cube(0.26, y, -0.205, 0.07, 0.07, 0.02, C.bakelite);
  // The aerial on top, bent.
  k.cyl(0, 0, 1.06, 1.1, 0.07, 0.05, C.bakelite, 6);
  strut(k, [0, 1.1, 0], [-0.3, 1.55, 0.05], 0.012, C.steel);
  strut(k, [0, 1.1, 0], [0.34, 1.42, -0.04], 0.012, C.steel);
}

/** An armchair, a blanket over one arm. */
export function armchair(k: Kit): void {
  const cloth = k.tone(FABRICS[k.variant % FABRICS.length]!, 0.06);
  k.box(-0.42, 0.08, -0.4, 0.42, 0.42, 0.42, cloth);
  k.box(-0.3, 0.42, -0.36, 0.3, 0.5, 0.2, k.tone(FABRICS[k.variant % FABRICS.length]!, 0.1));
  k.box(-0.42, 0.42, 0.2, 0.42, 0.95, 0.42, cloth);
  for (const x of [-0.45, 0.31]) k.box(x, 0.42, -0.4, x + 0.14, 0.64, 0.24, cloth);
  k.box(0.3, 0.64, -0.3, 0.47, 0.67, 0.1, k.tone(0x8a3a30, 0.08));
  for (const x of [-0.4, 0.34]) for (const z of [-0.38, 0.34]) k.box(x, 0, z, x + 0.06, 0.08, z + 0.06, WALNUT, { noTop: true });
}

/** A sofa with its cushions. */
export function sofa(k: Kit): void {
  const cloth = k.tone(FABRICS[(k.variant + 1) % FABRICS.length]!, 0.06);
  k.box(-0.95, 0.08, -0.42, 0.95, 0.42, 0.44, cloth);
  for (const x of [-0.8, 0.02]) k.box(x, 0.42, -0.38, x + 0.78, 0.5, 0.2, k.tone(FABRICS[(k.variant + 1) % FABRICS.length]!, 0.1));
  k.box(-0.95, 0.42, 0.2, 0.95, 0.92, 0.44, cloth);
  for (const x of [-0.98, 0.82]) k.box(x, 0.42, -0.42, x + 0.16, 0.66, 0.24, cloth);
  k.sub(-0.5, 0.5, 0.05, 20, -20).box(-0.2, 0, -0.06, 0.2, 0.36, 0.06, k.tone(0xb8a068, 0.08), { bottom: true });
  for (const x of [-0.92, 0.84]) k.box(x, 0, -0.38, x + 0.08, 0.08, 0.38, WALNUT, { noTop: true });
}

/** A bed, made, the head at +z. */
export function bed(k: Kit): void {
  const wood = k.tone(WALNUT, 0.06);
  k.box(-0.72, 0.12, -0.98, 0.72, 0.4, 0.94, wood);
  k.box(-0.7, 0.4, -0.96, 0.7, 0.56, 0.9, k.tone(C.blankets[k.variant % C.blankets.length]!, 0.08));
  k.box(-0.7, 0.4, 0.28, 0.7, 0.58, 0.9, 0xd8d4c8);
  for (const x of [-0.6, 0.06]) k.box(x, 0.58, 0.46, x + 0.54, 0.68, 0.86, 0xe0dcd0);
  k.box(-0.74, 0, 0.94, 0.74, 1.05, 1, wood);
  k.box(-0.74, 0, -1, 0.74, 0.62, -0.96, wood);
}

/** A wardrobe: two doors, one not quite shut. */
export function wardrobe(k: Kit): void {
  const wood = k.tone(WALNUT, 0.06);
  k.box(-0.72, 0.06, -0.2, 0.72, 1.95, 0.24, wood);
  k.box(-0.75, 1.95, -0.24, 0.75, 2.0, 0.25, k.tone(WALNUT, 0.1), { bottom: true });
  k.plate(-0.68, 0.12, -0.02, 1.9, -0.202, k.tone(0x6a4c38, 0.05));
  k.sub(0.7, 0, -0.2, 14).box(-0.68, 0.12, -0.03, 0, 1.9, 0, k.tone(0x6a4c38, 0.05), { bottom: true });
  k.plate(0.06, 0.2, 0.66, 1.8, -0.19, 0x0c0a08);
  for (const x of [-0.1, 0.02]) k.cube(x, 1.0, -0.215, 0.03, 0.1, 0.03, C.brass);
  k.box(-0.4, 2.0, -0.1, 0.2, 2.22, 0.2, k.tone(C.cork, 0.08));
}

/** A sideboard: the wireless, a clock, a row of cards. */
export function sideboard(k: Kit): void {
  const wood = k.tone(WALNUT, 0.06);
  k.box(-0.97, 0.1, -0.2, 0.97, 0.86, 0.24, wood);
  for (const x of [-0.94, 0.86]) k.box(x, 0, -0.18, x + 0.08, 0.1, 0.22, wood, { noTop: true });
  for (let i = 0; i < 3; i++) {
    k.plate(-0.92 + i * 0.63, 0.16, -0.34 + i * 0.63, 0.8, -0.202, k.tone(0x6a4c38, 0.05));
    k.cube(-0.63 + i * 0.63, 0.5, -0.21, 0.04, 0.04, 0.02, C.brass);
  }
  // The wireless, its dial lit.
  k.box(-0.8, 0.86, -0.12, -0.3, 1.18, 0.16, k.tone(0x6a4028, 0.06));
  k.plate(-0.76, 0.92, -0.52, 1.12, -0.122, 0x2a1c14);
  k.plate(-0.48, 0.96, -0.34, 1.1, -0.122, [1.3, 1.0, 0.45], 'on');
  for (let i = 0; i < 5; i++) {
    const x = -0.1 + i * 0.2;
    k.sub(x, 0.86, 0.04, k.rng.range(-25, 25)).box(-0.07, 0, -0.005, 0.07, 0.17, 0.005, k.tone([0xa82c28, 0xd8d4c8, 0x2c6a44, 0x2c4c8c][i % 4]!, 0.08), { bottom: true });
  }
}

/** A rug, worn through the middle. */
export function rug(k: Kit): void {
  const c = k.tone([0x6a2c28, 0x2c4458, 0x5a5030][k.variant % 3]!, 0.06);
  k.face([[-1.2, 0.012, -0.8], [-1.2, 0.012, 0.8], [1.2, 0.012, 0.8], [1.2, 0.012, -0.8]], [0, 1, 0], c);
  k.face([[-1.05, 0.014, -0.65], [-1.05, 0.014, 0.65], [1.05, 0.014, 0.65], [1.05, 0.014, -0.65]], [0, 1, 0], k.tone(0xb8a078, 0.06));
  k.face([[-0.9, 0.016, -0.5], [-0.9, 0.016, 0.5], [0.9, 0.016, 0.5], [0.9, 0.016, -0.5]], [0, 1, 0], c);
}
