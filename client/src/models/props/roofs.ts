import type { RGB } from '../../render/bake';
import { BULBS, bulb } from './festive';
import { letterTile } from '../../render/signs';
import { C } from './palette';
import { fanBlades, snowCap, strut } from './parts';
import type { Kit } from './kit';

// The roof kit (The Longest Night): what stands on a city's roofs, and the iron that hangs off its
// walls. Snow on all of it.

const TAR = 0x2a2826;
const BRICK = 0x7a4a3c;
const GALV = 0x8a9094;
const IRON = 0x24262a;
const SIGN_RED: RGB = [1.8, 0.22, 0.16];

/** A water tank: staves and hoops on a frame of iron legs, a cone for a lid. */
export function waterTank(k: Kit): void {
  for (const x of [-1.2, 1.2]) for (const z of [-1.2, 1.2]) k.box(x - 0.07, 0, z - 0.07, x + 0.07, 1.7, z + 0.07, IRON, { noTop: true });
  for (const yaw of [0, 90, 180, 270]) {
    const s = k.sub(0, 0, 0, yaw);
    strut(s, [-1.2, 0.1, -1.2], [1.2, 1.6, -1.2], 0.05, IRON);
    strut(s, [1.2, 0.1, -1.2], [-1.2, 1.6, -1.2], 0.05, IRON);
    s.box(-1.3, 1.6, -1.3, 1.3, 1.72, -1.16, IRON, { bottom: true });
  }
  k.box(-1.3, 1.72, -1.3, 1.3, 1.8, 1.3, k.tone(C.woodDark, 0.06), { bottom: true });
  const staves = k.tone(0x6a5240, 0.06);
  k.cyl(0, 0, 1.8, 3.7, 1.3, 1.36, staves, 12, { noTop: true });
  for (const y of [2.0, 2.6, 3.2, 3.6]) k.cyl(0, 0, y, y + 0.06, 1.33 + (y - 1.8) * 0.032, 1.33 + (y - 1.8) * 0.032, IRON, 12, { noTop: true });
  k.cyl(0, 0, 3.7, 4.45, 1.46, 0.1, k.tone(C.snow, 0.04), 12);
  k.cyl(0, 0, 4.4, 4.6, 0.08, 0.02, IRON, 5);
  // The ladder up its side, the pipe down, ice where it has wept.
  for (const x of [-0.2, 0.16]) k.box(x, 0, -1.44, x + 0.04, 3.8, -1.4, IRON);
  for (let y = 0.3; y < 3.8; y += 0.32) k.box(-0.16, y, -1.435, 0.16, y + 0.03, -1.405, GALV, { bottom: true });
  k.box(0.5, 0, 0.4, 0.62, 1.8, 0.52, k.tone(C.rust, 0.08), { noTop: true });
  for (const [x, h] of [[-0.7, 0.5], [-0.5, 0.8], [0.9, 0.4]] as const) k.box(x, 1.72 - h, -1.3, x + 0.05, 1.72, -1.25, C.ice, { noTop: true });
}

/** A chimney stack with its pots; variant 1 is still drawing. */
export function chimney(k: Kit): void {
  const brick = k.tone(BRICK, 0.07);
  k.box(-0.45, 0, -0.45, 0.45, 1.6, 0.45, brick);
  k.box(-0.5, 1.6, -0.5, 0.5, 1.72, 0.5, k.tone(C.concrete, 0.06), { bottom: true });
  snowCap(k, -0.5, -0.5, 0.5, 0.5, 1.72, 0.07);
  for (const [i, x] of [-0.22, 0.22].entries()) {
    k.cyl(x, 0, 1.72, 2.15 - i * 0.08, 0.13, 0.1, k.tone(0x9a5a3c, 0.08), 6, { noTop: true });
    k.cyl(x, 0, 2.15 - i * 0.08, 2.17 - i * 0.08, 0.08, 0.08, 0x0c0a08, 6);
  }
  if (k.variant === 1) k.steam(-0.22, 2.2, 0);
}

/** A pigeon coop: wire fronts, a tin roof, nobody home. */
export function pigeonCoop(k: Kit): void {
  const wood = k.tone(0x5a6a5c, 0.07);
  k.box(-0.95, 0.3, -0.4, 0.95, 1.6, 0.45, 0x14120e);
  for (const x of [-0.95, -0.02, 0.89]) k.box(x, 0, -0.45, x + 0.06, 1.6, -0.39, wood, { noTop: true });
  for (const x of [-0.95, 0.89]) k.box(x, 0, 0.39, x + 0.06, 1.6, 0.45, wood, { noTop: true });
  for (const y of [0.3, 0.92, 1.54]) k.box(-0.95, y, -0.46, 0.95, y + 0.06, -0.4, wood, { bottom: true });
  for (const yaw of [90, 180, 270]) k.sub(0, 0, 0, yaw).plate(yaw === 180 ? -0.95 : -0.45, 0.3, yaw === 180 ? 0.95 : 0.45, 1.6, yaw === 180 ? -0.452 : -0.952, wood);
  // The wire: thin bars over the dark.
  for (let x = -0.84; x < 0.9; x += 0.11) if (Math.abs(x) > 0.08) k.plate(x, 0.36, x + 0.012, 1.54, -0.44, GALV);
  // Perches, and somebody who stayed.
  for (const y of [0.6, 1.2]) k.box(-0.9, y, -0.2, 0.9, y + 0.03, -0.17, C.woodPale, { bottom: true });
  k.cube(-0.5, 0.69, -0.18, 0.1, 0.12, 0.16, 0x8a8a90);
  k.cube(-0.5, 0.78, -0.25, 0.06, 0.06, 0.06, 0x6a6a74);
  k.sub(0, 1.6, 0, 0, 6).box(-1.02, 0, -0.55, 1.02, 0.04, 0.52, GALV, { bottom: true });
  snowCap(k.sub(0, 1.6, 0, 0, 6), -1.02, -0.55, 1.02, 0.52, 0.04, 0.07);
}

/** A television aerial: a mast in a block, its elements, a stay. */
export function aerial(k: Kit): void {
  k.box(-0.22, 0, -0.22, 0.22, 0.3, 0.22, k.tone(C.concrete, 0.06));
  k.box(-0.02, 0.3, -0.02, 0.02, 3.4, 0.02, GALV);
  const top = k.sub(0, 3.1, 0, k.rng.range(0, 90), 0, k.rng.range(-6, 6));
  top.box(-0.6, 0, -0.012, 0.6, 0.025, 0.012, GALV, { bottom: true });
  for (const [x, w] of [[-0.55, 0.42], [-0.3, 0.36], [-0.05, 0.3], [0.2, 0.26], [0.45, 0.22]] as const) top.box(x, 0.005, -w, x + 0.02, 0.025, w, GALV, { bottom: true });
  strut(k, [0.2, 0.3, 0.2], [0, 2.2, 0], 0.012, IRON);
}

/** A plastic reindeer, lit from inside, a wreath of bulbs round its neck. */
export function reindeer(k: Kit): void {
  const plastic: RGB = [1.25, 1.1, 0.85];
  const g = { glow: 'on', bottom: true } as const;
  k.box(-0.34, 0.62, -0.12, 0.26, 0.9, 0.12, plastic, g);
  for (const x of [-0.3, 0.16]) for (const z of [-0.1, 0.05]) k.box(x, 0, z, x + 0.07, 0.62, z + 0.06, plastic, { glow: 'on' });
  k.sub(0.22, 0.82, 0, 0, 0, -28).box(-0.07, 0, -0.07, 0.07, 0.4, 0.07, plastic, g);
  k.box(0.3, 1.1, -0.08, 0.56, 1.26, 0.08, plastic, g);
  k.cube(0.58, 1.16, 0, 0.05, 0.05, 0.05, BULBS[0]!, g);
  for (const z of [-0.07, 0.07]) {
    strut(k, [0.36, 1.26, z], [0.3, 1.56, z * 2.4], 0.025, C.woodDark);
    strut(k, [0.32, 1.42, z * 1.8], [0.42, 1.54, z * 2.6], 0.02, C.woodDark);
  }
  k.box(-0.38, 0.84, -0.03, -0.32, 0.94, 0.03, plastic, g);
  for (let i = 0; i < 4; i++) bulb(k, 0.24, 0.92 + (i % 2) * 0.06, -0.1 + i * 0.066, BULBS[(i + 1) % BULBS.length]!, 0.05);
  k.box(-0.4, 0, -0.2, 0.34, 0.03, 0.2, C.woodDark);
}

/** A plant room: block walls, louvres down both sides, a steel door in the front. */
export function plantRoom(k: Kit): void {
  const wall = k.tone(0x6a6c68, 0.05);
  k.box(-1.95, 0, -1.45, 1.95, 2.6, 1.45, wall);
  k.box(-2, 2.6, -1.5, 2, 2.7, 1.5, TAR, { bottom: true });
  snowCap(k, -2, -1.5, 2, 1.5, 2.7, 0.1);
  k.plate(-0.5, 0, 0.5, 2.05, -1.452, k.tone(0x3c4a44, 0.05));
  k.plate(0.28, 0.95, 0.4, 1.1, -1.454, C.steel);
  k.plate(-0.36, 1.4, 0.36, 1.7, -1.454, C.hazard);
  k.plate(-0.36, 1.48, 0.36, 1.52, -1.456, 0x1a1a1a);
  k.plate(-0.36, 1.58, 0.36, 1.62, -1.456, 0x1a1a1a);
  // A lamp over the door that works off the mains.
  k.box(-0.1, 2.15, -1.56, 0.1, 2.27, -1.45, [1.5, 0.35, 0.25], { glow: 'power', bottom: true });
  for (const yaw of [90, 270]) {
    const s = k.sub(0, 0, 0, yaw);
    s.plate(-0.9, 0.5, 0.9, 2.0, -1.952, 0x14140f);
    for (let y = 0.5; y < 2; y += 0.15) s.sub(0, y, -1.96, 0, 30).box(-0.9, 0, -0.06, 0.9, 0.02, 0.06, GALV, { bottom: true });
  }
  // A duct out of the back and down, a conduit up the front corner.
  k.box(-1.2, 1.6, 1.45, -0.5, 2.2, 2.0, GALV, { bottom: true });
  k.box(1.7, 0, -1.52, 1.76, 2.6, -1.46, C.steelDark, { noTop: true });
}

/** A condenser: a slatted box, the fan in its top turning when there is power. */
export function acUnit(k: Kit): void {
  const body = k.tone(0x8a8e88, 0.05);
  k.box(-0.95, 0.12, -0.45, 0.95, 1.1, 0.45, body);
  for (const x of [-0.9, 0.8]) k.box(x, 0, -0.4, x + 0.1, 0.12, 0.4, IRON, { noTop: true });
  for (const yaw of [0, 180]) for (let y = 0.24; y < 1; y += 0.11) k.sub(0, 0, 0, yaw).plate(-0.86, y, 0.3, y + 0.05, -0.452, 0x1a1c1c);
  k.plate(0.42, 0.3, 0.86, 0.9, -0.452, k.tone(0x6a6e6a, 0.05));
  for (const x of [-0.45, 0.45]) {
    k.cyl(x, 0, 1.1, 1.16, 0.36, 0.36, 0x14140f, 8);
    const fan = k.mover(x, 1.14, 0, [0, 1, 0], { kind: 'spin', rate: 9, powered: true, idle: 0.04 });
    fanBlades(fan.sub(x, 1.14, 0, 0, 90), 0, 0, 0, 0.32, 4, C.steelDark);
    for (const z of [-0.2, 0, 0.2]) k.box(x - 0.36, 1.2, z - 0.008, x + 0.36, 1.215, z + 0.008, IRON, { bottom: true });
  }
  snowCap(k, -0.95, -0.45, -0.85, 0.45, 1.1, 0.05);
}

/** A vent stack under a cowl: the building is still breathing. */
export function roofVent(k: Kit): void {
  k.box(-0.4, 0, -0.4, 0.4, 0.25, 0.4, TAR);
  k.cyl(0, 0, 0.25, 1.15, 0.24, 0.24, k.tone(GALV, 0.06), 8, { noTop: true });
  k.cyl(0, 0, 1.25, 1.5, 0.42, 0.1, k.tone(GALV, 0.06), 8, { bottom: true });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    k.box(Math.cos(a) * 0.22 - 0.015, 1.15, Math.sin(a) * 0.22 - 0.015, Math.cos(a) * 0.22 + 0.015, 1.27, Math.sin(a) * 0.22 + 0.015, IRON, { noTop: true });
  }
  if (k.variant !== 2) k.steam(0, 1.3, 0);
}

/** The lantern over the atrium: a kerb, glazing bars, and the store's light coming up through the glass. */
export function skylight(k: Kit): void {
  const [w, d] = [2.9, 3.9];
  k.box(-3, 0, -4, 3, 0.4, 4, k.tone(0x5a5c58, 0.05));
  const glass: RGB = [0.4, 0.33, 0.2];
  const rise = 0.55;
  // Four slopes up to a ridge along z.
  const [e0, e1] = [-d + 1.6, d - 1.6];
  const P = (x: number, z: number, top: boolean): [number, number, number] => [x, top ? 0.4 + rise : 0.4, z];
  k.face([P(-w, -d, false), P(-w, d, false), P(0, e1, true), P(0, e0, true)], [-0.5, 0.86, 0], glass, 'on');
  k.face([P(w, d, false), P(w, -d, false), P(0, e0, true), P(0, e1, true)], [0.5, 0.86, 0], glass, 'on');
  k.face([P(w, -d, false), P(-w, -d, false), P(0, e0, true), P(0, e0, true)], [0, 0.86, -0.5], glass, 'on');
  k.face([P(-w, d, false), P(w, d, false), P(0, e1, true), P(0, e1, true)], [0, 0.86, 0.5], glass, 'on');
  // The bars, and snow lying in the lee of the ridge.
  k.box(-0.04, 0.4 + rise - 0.02, e0, 0.04, 0.4 + rise + 0.05, e1, IRON);
  for (let z = -d + 0.8; z < d; z += 0.8) {
    const zz = Math.min(Math.max(z, e0), e1);
    strut(k, [-w, 0.42, z], [0, 0.42 + rise, zz], 0.04, IRON);
    strut(k, [w, 0.42, z], [0, 0.42 + rise, zz], 0.04, IRON);
  }
  for (const s of [-1, 1]) {
    k.box(s * w - 0.06, 0.4, -d, s * w + 0.06, 0.46, d, IRON);
    k.box(-w, 0.4, s * d - 0.06, w, 0.46, s * d + 0.06, IRON);
  }
  snowCap(k, -3, -4, -2.9, 4, 0.4, 0.06);
  snowCap(k, -3, 3.9, 3, 4, 0.4, 0.06);
}

/** The back of the store's sign: a frame on stays, and the red of its letters round the edges of their cans. */
export function signBack(k: Kit): void {
  for (let x = -3.9; x <= 3.9; x += 1.3) {
    k.box(x - 0.04, 0, -0.04, x + 0.04, 3.2, 0.04, IRON);
    strut(k, [x, 0.05, 0.22], [x, 2.3, 0], 0.035, IRON);
  }
  for (const y of [0.9, 2.0, 3.1]) k.box(-3.95, y, -0.03, 3.95, y + 0.06, 0.03, IRON, { bottom: true });
  for (let x = -3.9; x < 3.8; x += 1.3) strut(k, [x, 0.95, 0], [x + 1.3, 2.0, 0], 0.025, IRON);
  // Nine letters, each a can with the light spilling past it; to the street its face is the letter.
  // (Seen from the street the first letter is at this side's right: the sign reads from +x to -x.)
  const name = (k.inst.text ?? "ABELARD'S").slice(0, 9);
  for (let i = 0; i < 9; i++) {
    const x = -3.5 + i * 0.875;
    const ch = name[8 - i] ?? ' ';
    const w = ch === "'" ? 0.2 : 0.62;
    k.box(x - w / 2 - 0.05, 1.0, -0.2, x + w / 2 + 0.05, 2.95, -0.16, SIGN_RED, { glow: i === 4 ? 'fire' : 'on', bottom: true });
    k.box(x - w / 2, 1.05, -0.16, x + w / 2, 2.9, -0.06, k.tone(0x2a2c30, 0.05), { bottom: true });
    if (ch !== ' ') {
      const letter = letterTile(ch, true);
      k.picture(x, ch === "'" ? 2.45 : 1.98, -0.204, (ch === "'" ? 0.9 : 1.75) * letter.aspect * 0.52, ch === "'" ? 0.9 : 1.75, letter.uv);
    }
  }
  k.box(-3.95, 0.86, 0.02, 3.95, 0.9, 0.1, C.steelDark, { bottom: true });
  snowCap(k, -3.95, -0.03, 3.95, 0.03, 3.16, 0.05);
}

/** The iron of a ledge: brackets back to the wall (+z) under the planks (variant 1 has none: it lies on something), a rail round the three open sides. */
export function ledgeIron(k: Kit): void {
  const d = k.inst.s ?? 3;
  const w = 2.5;
  const [z0, z1] = [-d / 2, d / 2];
  for (const x of k.variant === 1 ? [] : [-w / 2 + 0.1, 0, w / 2 - 0.1]) {
    k.box(x - 0.04, -0.3, z0 + 0.05, x + 0.04, -0.2, z1, IRON, { bottom: true });
    strut(k, [x, -0.25, z0 + 0.3], [x, -1.5, z1 - 0.02], 0.05, IRON, { bottom: true });
  }
  if (k.variant !== 1) k.box(-w / 2, -0.3, z0 + 0.02, w / 2, -0.2, z0 + 0.1, IRON, { bottom: true });
  // The rail: a top bar, a middle bar, uprights; snow along the top.
  const side = (s: Kit, len: number): void => {
    s.box(-len / 2, 0.98, -0.025, len / 2, 1.03, 0.025, IRON, { bottom: true });
    s.box(-len / 2, 0.5, -0.02, len / 2, 0.54, 0.02, IRON, { bottom: true });
    for (let x = -len / 2 + 0.02; x <= len / 2; x += (len - 0.04) / Math.round(len / 0.5)) s.box(x - 0.015, 0, -0.015, x + 0.015, 0.98, 0.015, IRON, { noTop: true });
    s.box(-len / 2, 1.03, -0.03, len / 2, 1.06, 0.03, k.tone(C.snow, 0.04));
  };
  side(k.sub(0, 0, z0 + 0.04), w);
  for (const s of [-1, 1]) side(k.sub(s * (w / 2 - 0.04), 0, 0, 90), d);
}

/** A fire escape's iron on a flight that climbs `y2` towards the front over a length `s`: stringers, a rail each side on balusters. */
export function fireEscape(k: Kit): void {
  const [len, rise, w] = [k.inst.s ?? 7, k.inst.y2 ?? 4, 2];
  const [zA, yA, zB, yB] = [-len / 2, rise / 2, len / 2, -rise / 2];
  const at = (z: number): number => yA + ((z - zA) / (zB - zA)) * (yB - yA);
  for (const x of [-w / 2 + 0.05, w / 2 - 0.05]) {
    strut(k, [x, yB + 0.02, zB], [x, yA + 0.02, zA], 0.09, IRON, { bottom: true });
    strut(k, [x, yB + 1.0, zB], [x, yA + 1.0, zA], 0.05, IRON, { bottom: true });
    strut(k, [x, yB + 0.55, zB], [x, yA + 0.55, zA], 0.03, IRON, { bottom: true });
    for (let z = zA + 0.25; z < zB; z += 0.5) k.box(x - 0.015, at(z), z - 0.015, x + 0.015, at(z) + 1.0, z + 0.015, IRON, { noTop: true });
    // Snow that has stayed on the top rail.
    strut(k, [x, yB + 1.04, zB], [x, yA + 1.04, zA], 0.04, k.tone(C.snow, 0.04));
  }
}
