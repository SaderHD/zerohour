import type { RGB } from '../../render/bake';
import { textTile } from '../../render/signs';
import { C } from './palette';
import { drumX, snowCap, strut, wheel } from './parts';
import type { Kit } from './kit';

// The street kit (The Longest Night): what a city leaves in its roads. Vehicles face -z. All of it
// has stood since the snow started.

const PAINTS = [0x6a2420, 0x2c3c54, 0x74746c, 0x34483a, 0x8a7a50, 0x4a3a30];
const CAB = 0xc89a20;
const HEADLAMP: RGB = [1.7, 1.5, 1.1];
const TAIL: RGB = [0.9, 0.08, 0.05];
const INSIDE = 0x0c0a08;

/**
 * A car. Variants 0-4 saloons, 5 an estate, 6 a cab with its sign lit, 7 a patrol car with its
 * bar still showing; add 10 and the lamps are on.
 */
export function car(k: Kit): void {
  const v = k.variant % 10;
  const lamps = k.variant >= 10;
  const paint = v === 6 ? k.tone(CAB, 0.04) : v === 7 ? k.tone(0x1c1e22, 0.04) : k.tone(PAINTS[v % PAINTS.length]!, 0.06);
  const [c0, c1] = [-0.55, v === 5 ? 2.0 : 1.15];
  k.box(-0.86, 0.28, -2.15, 0.86, 0.84, 2.15, paint, { bottom: true });
  k.box(-0.76, 0.84, c0, 0.76, 1.3, c1, C.darkGlass);
  k.box(-0.79, 1.3, c0 + 0.08, 0.79, 1.37, c1 - 0.04, paint, { bottom: true });
  for (const x of [-0.77, 0.71]) for (const z of [c0, (c0 + c1) / 2 - 0.03, c1 - 0.06]) k.box(x, 0.84, z, x + 0.06, 1.3, z + 0.06, paint, { noTop: true });
  for (const z of [-2.25, 2.13]) k.box(-0.9, 0.3, z, 0.9, 0.46, z + 0.12, C.steel, { bottom: true });
  for (const x of [-0.78, 0.78]) for (const z of [-1.4, 1.4]) wheel(k, x, z, 0.31, 0.22);
  for (const x of [-0.6, 0.6]) k.plate(x - 0.16, 0.56, x + 0.16, 0.74, -2.152, lamps ? HEADLAMP : C.enamel, lamps ? 'on' : undefined);
  const back = k.sub(0, 0, 0, 180);
  for (const x of [-0.62, 0.62]) back.plate(x - 0.16, 0.56, x + 0.16, 0.72, -2.152, lamps ? TAIL : 0x5a1410, lamps ? 'on' : undefined);
  if (v === 7) {
    // Doors in white, and the bar on the roof.
    for (const yaw of [90, 270]) k.sub(0, 0, 0, yaw).plate(-1.0, 0.36, 0.5, 0.84, -0.862, C.white);
    k.box(-0.5, 1.37, 0.1, 0, 1.5, 0.3, [1.2, 0.12, 0.08], { glow: 'fire' });
    k.box(0, 1.37, 0.1, 0.5, 1.5, 0.3, [0.12, 0.25, 1.3], { glow: 'fire' });
  } else if (v === 6) {
    k.box(-0.22, 1.37, 0.1, 0.22, 1.53, 0.28, [1.5, 1.05, 0.25], { glow: 'on' });
    snowCap(k, -0.75, 0.4, 0.75, c1 - 0.1, 1.37);
  } else {
    snowCap(k, -0.75, c0 + 0.12, 0.75, c1 - 0.1, 1.37, 0.1);
  }
  snowCap(k, -0.8, -2.1, 0.8, c0 - 0.05, 0.84, 0.07);
  if (v !== 5) snowCap(k, -0.8, c1 + 0.05, 0.8, 2.1, 0.84, 0.07);
}

/** A city bus: cream over green, the lights inside still failing. */
export function bus(k: Kit): void {
  const [W, L] = [1.2, 4.45];
  const cream = k.tone(0xc8c0a0, 0.04);
  k.box(-W, 0.35, -L, W, 1.3, L, k.tone(0x2c5040, 0.05), { bottom: true });
  k.box(-W, 1.3, -L, W, 2.9, L, cream);
  k.box(-W - 0.03, 0.4, -L - 0.08, W + 0.03, 0.62, -L, C.steelDark, { bottom: true });
  const lit: RGB = [0.95, 0.82, 0.5];
  for (const yaw of [90, 270]) {
    const s = k.sub(0, 0, 0, yaw);
    for (let i = 0; i < 7; i++) {
      const x = -4.1 + i * 1.18;
      const dark = k.rng.chance(0.25);
      s.plate(x, 1.5, x + 1.0, 2.42, -W - 0.004, dark ? C.darkGlass : lit, dark ? undefined : 'fire');
    }
    // The doors, standing open on the dark.
    if (yaw === 270) s.plate(-4.2, 0.45, -3.3, 2.42, -W - 0.006, INSIDE);
  }
  k.plate(-1.05, 1.4, 1.05, 2.4, -L - 0.004, C.darkGlass);
  k.plate(-0.75, 2.5, 0.75, 2.8, -L - 0.004, [1.3, 0.8, 0.22], 'fire');
  for (const x of [-0.85, 0.85]) k.plate(x - 0.17, 0.72, x + 0.17, 0.92, -L - 0.004, C.enamel);
  const back = k.sub(0, 0, 0, 180);
  back.plate(-0.95, 1.6, 0.95, 2.4, -L - 0.004, C.darkGlass);
  for (const x of [-0.9, 0.9]) back.plate(x - 0.14, 0.8, x + 0.14, 1.1, -L - 0.004, 0x5a1410);
  for (const x of [-1.0, 1.0]) for (const z of [-3.0, 2.6]) wheel(k, x, z, 0.48, 0.3);
  snowCap(k, -W + 0.05, -L + 0.05, W - 0.05, L - 0.05, 2.9, 0.13);
}

/** A delivery van. Variant 1: the back doors are open, the last of the load on the step. */
export function van(k: Kit): void {
  const paint = k.tone(0xc0b8a0, 0.05);
  k.box(-0.9, 0.35, -2.4, 0.9, 1.15, -1.7, paint, { bottom: true });
  k.box(-0.9, 0.35, -1.7, 0.9, 1.95, -0.9, paint, { bottom: true });
  k.plate(-0.78, 1.22, 0.78, 1.86, -1.704, C.darkGlass);
  k.box(-0.95, 0.35, -0.9, 0.95, 2.4, 1.6, paint, { bottom: true });
  for (const yaw of [90, 270]) {
    const s = k.sub(0, 0, 0, yaw);
    s.plate(yaw === 90 ? -1.6 : 1.0, 1.25, yaw === 90 ? -1.0 : 1.6, 1.85, -0.904, C.darkGlass);
    s.plate(-1.55, 1.1, 0.85, 1.4, -0.954, 0x8a2c24);
  }
  k.box(-0.93, 0.35, -2.5, 0.93, 0.5, -2.4, C.steelDark, { bottom: true });
  for (const x of [-0.62, 0.62]) k.plate(x - 0.15, 0.75, x + 0.15, 0.93, -2.404, C.enamel);
  for (const x of [-0.83, 0.83]) for (const z of [-1.75, 0.9]) wheel(k, x, z, 0.36, 0.24);
  k.box(-0.85, 0.35, 1.6, 0.85, 0.55, 2.05, C.steelDark, { bottom: true });
  const back = k.sub(0, 0, 0, 180);
  if (k.variant === 1) {
    back.plate(-0.82, 0.55, 0.82, 2.28, -1.604, INSIDE);
    for (const x of [-0.95, 0.9]) k.box(x, 0.5, 1.6, x + 0.05, 2.35, 2.42, paint, { bottom: true });
    k.box(-0.6, 0.55, 1.65, -0.2, 0.85, 1.98, 0xa82c28);
    k.box(0.05, 0.55, 1.68, 0.5, 0.95, 2.0, 0x2c6a44);
    k.box(-0.5, 0.85, 1.7, -0.25, 1.05, 1.92, 0xc8a030);
  } else {
    back.plate(-0.02, 0.55, 0.02, 2.28, -1.604, C.steelDark);
  }
  snowCap(k, -0.9, -0.85, 0.9, 1.55, 2.4, 0.12);
  snowCap(k, -0.85, -2.35, 0.85, -1.72, 1.15, 0.07);
  snowCap(k, -0.85, -1.68, 0.85, -0.92, 1.95, 0.08);
}

/** A news kiosk: the hatch to the front, papers racked under it, a strip light under the roof. */
export function kiosk(k: Kit): void {
  const green = k.tone(0x2c4a3a, 0.05);
  k.box(-1, 0, -0.45, 1, 2.3, 0.75, green);
  k.box(-1, 0, -0.75, 1, 1.0, -0.45, green);
  k.plate(-0.85, 1.05, 0.85, 2.0, -0.452, INSIDE);
  const COVERS = [0xa82c28, 0xd8d0b8, 0x2c4c8c, 0xc8a030, 0x2c6a44, 0xd8d0b8];
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 7; i++) k.plate(-0.86 + i * 0.25, 0.22 + j * 0.36, -0.66 + i * 0.25, 0.5 + j * 0.36, -0.752, k.tone(COVERS[(i + j * 2) % COVERS.length]!, 0.1));
  }
  for (let i = 0; i < 5; i++) k.plate(-0.8 + i * 0.33, 1.62, -0.56 + i * 0.33, 1.94, -0.454, k.tone(COVERS[(i * 5 + 1) % COVERS.length]!, 0.1));
  k.box(-1.1, 2.3, -1.0, 1.1, 2.4, 0.8, k.tone(0x1e3428, 0.05), { bottom: true });
  const label = textTile('NEWS', 'stencil');
  k.picture(0, 2.12, -0.454, 0.22 * label.aspect, 0.22, label.uv);
  k.box(-0.8, 2.24, -0.92, 0.8, 2.3, -0.84, [0.8, 1.05, 0.95], { glow: 'power', bottom: true });
  snowCap(k, -1.05, -0.95, 1.05, 0.75, 2.4, 0.1);
  // Yesterday's bundles, still tied.
  k.box(0.55, 1.0, -0.72, 0.9, 1.16, -0.5, C.paper);
}

/** A telephone box: glazed on three sides, the lamp in its head on the mains. */
export function phoneBooth(k: Kit): void {
  const frame = k.tone(0x2c4064, 0.05);
  const H = 0.45;
  for (const x of [-H, H - 0.06]) for (const z of [-H, H - 0.06]) k.box(x, 0, z, x + 0.06, 2.1, z + 0.06, frame, { noTop: true });
  k.box(-H - 0.03, 2.1, -H - 0.03, H + 0.03, 2.4, H + 0.03, frame, { bottom: true });
  const glass: RGB = [0.05, 0.09, 0.1];
  for (const yaw of [0, 90, 180, 270]) {
    const s = k.sub(0, 0, 0, yaw);
    s.plate(-0.36, 2.15, 0.36, 2.33, -H - 0.034, [0.75, 0.95, 1.05], 'power');
    if (yaw) s.plate(-H + 0.06, 0.25, H - 0.06, 2.1, -H + 0.02, glass);
    if (yaw) s.plate(-H + 0.06, 0, H - 0.06, 0.25, -H + 0.02, frame);
  }
  // Seen through the open side: the back wall, and the telephone on it.
  k.plate(-H + 0.06, 0, H - 0.06, 2.1, H - 0.07, 0x1c2024);
  k.face([[-H + 0.05, 0, -H], [-H + 0.05, 0, H], [-H + 0.05, 2.1, H], [-H + 0.05, 2.1, -H]], [1, 0, 0], 0x1c2024);
  k.face([[H - 0.05, 0, H], [H - 0.05, 0, -H], [H - 0.05, 2.1, -H], [H - 0.05, 2.1, H]], [-1, 0, 0], 0x1c2024);
  k.box(-0.16, 1.05, H - 0.24, 0.16, 1.55, H - 0.08, C.iron);
  k.box(-0.2, 1.2, H - 0.29, -0.13, 1.5, H - 0.24, C.bakelite);
  snowCap(k, -H, -H, H, H, 2.4, 0.08);
}

/** A police trestle: a striped board on two A-frames. */
export function sawhorse(k: Kit): void {
  for (const x of [-0.8, 0.8]) {
    for (const z of [-0.22, 0.22]) strut(k, [x, 0, z], [x, 0.9, 0], 0.06, C.woodPale);
  }
  for (let i = 0; i < 4; i++) k.box(-1 + i * 0.5, 0.72, -0.03, -0.5 + i * 0.5, 0.96, 0.03, i % 2 ? 0x2c4a8c : C.white, { bottom: true });
  k.box(-0.98, 0.96, -0.03, 0.98, 1.0, 0.03, k.tone(C.snow, 0.04));
}

/** A concrete road barrier. */
export function jersey(k: Kit): void {
  const c = k.tone(C.concrete, 0.07);
  k.box(-1, 0, -0.24, 1, 0.3, 0.24, c);
  k.box(-1, 0.3, -0.12, 1, 0.8, 0.12, c);
  for (const yaw of [0, 180]) k.sub(0, 0, 0, yaw).plate(-0.9, 0.5, -0.3, 0.62, -0.122, C.hazard);
  snowCap(k, -1, -0.12, 1, 0.12, 0.8, 0.05);
}

export function hydrant(k: Kit): void {
  const red = k.tone(C.red, 0.08);
  k.cyl(0, 0, 0, 0.1, 0.15, 0.15, red, 6);
  k.cyl(0, 0, 0.1, 0.58, 0.1, 0.1, red, 6);
  k.cyl(0, 0, 0.58, 0.7, 0.13, 0.05, red, 6);
  for (const x of [-0.13, 0.13]) k.cube(x, 0.42, 0, 0.08, 0.1, 0.1, red, { bottom: true });
  k.cube(0, 0.42, -0.12, 0.12, 0.12, 0.06, C.steel, { bottom: true });
  k.cyl(0, 0, 0.7, 0.78, 0.11, 0.05, k.tone(C.snow, 0.04), 6);
}

export function mailbox(k: Kit): void {
  const blue = k.tone(0x2c4878, 0.06);
  for (const x of [-0.17, 0.13]) for (const z of [-0.17, 0.13]) k.box(x, 0, z, x + 0.04, 0.35, z + 0.04, C.iron, { noTop: true });
  k.box(-0.2, 0.35, -0.2, 0.2, 1.0, 0.2, blue, { bottom: true });
  drumX(k, 1.0, 0, -0.2, 0.2, 0.2, blue, 6);
  k.plate(-0.14, 0.92, 0.14, 0.97, -0.202, C.iron);
  k.plate(-0.12, 0.5, 0.12, 0.72, -0.202, C.enamel);
  k.box(-0.15, 1.2, -0.1, 0.15, 1.25, 0.1, k.tone(C.snow, 0.04));
}

/** A dumpster; variant 1 has its lid thrown back. */
export function dumpster(k: Kit): void {
  const paint = k.tone(0x34503c, 0.08);
  k.box(-0.95, 0.12, -0.45, 0.95, 1.15, 0.45, paint, { bottom: true });
  for (const x of [-0.95, 0.91]) k.box(x, 0.6, -0.5, x + 0.04, 0.72, 0.5, C.steelDark, { bottom: true });
  for (const x of [-0.8, 0.8]) for (const z of [-0.35, 0.35]) k.cube(x, 0.06, z, 0.1, 0.12, 0.14, C.rubber);
  if (k.variant === 1) {
    k.box(-0.98, 1.15, 0.4, 0.98, 2.0, 0.46, k.tone(0x2a4030, 0.06), { bottom: true });
    k.plate(-0.9, 1.0, 0.9, 1.15, 0.38, INSIDE);
    for (const x of [-0.5, 0.1, 0.55]) k.cyl(x, k.rng.range(-0.15, 0.1), 0.95, k.rng.range(1.3, 1.5), 0.28, 0.12, k.tone(0x1a1a1e, 0.2), 5);
  } else {
    k.box(-0.98, 1.15, -0.48, 0.98, 1.22, 0.48, k.tone(0x2a4030, 0.06), { bottom: true });
    snowCap(k, -0.95, -0.45, 0.95, 0.45, 1.22, 0.09);
  }
}

/** A grating in the road, the mains under it leaking steam. */
export function steamGrate(k: Kit): void {
  k.face([[-0.5, 0.012, -0.5], [-0.5, 0.012, 0.5], [0.5, 0.012, 0.5], [0.5, 0.012, -0.5]], [0, 1, 0], 0x08080a);
  for (let i = 0; i < 6; i++) {
    const x = -0.45 + i * 0.18;
    k.face([[x, 0.02, -0.5], [x, 0.02, 0.5], [x + 0.07, 0.02, 0.5], [x + 0.07, 0.02, -0.5]], [0, 1, 0], C.steelDark);
  }
  for (const z of [-0.5, 0.43]) k.face([[-0.5, 0.022, z], [-0.5, 0.022, z + 0.07], [0.5, 0.022, z + 0.07], [0.5, 0.022, z]], [0, 1, 0], C.steelDark);
  k.steam(0, 0.05, 0);
}

/** A manhole cover; variant 1 has been dragged half off, and steams. */
export function manhole(k: Kit): void {
  if (k.variant === 1) {
    k.cyl(0, 0, 0.005, 0.012, 0.36, 0.36, 0x060606, 8);
    k.cyl(0.3, 0.12, 0.012, 0.05, 0.38, 0.38, k.tone(C.iron, 0.1), 8);
    k.steam(-0.1, 0.05, 0);
  } else {
    k.cyl(0, 0, 0.005, 0.03, 0.38, 0.38, k.tone(C.iron, 0.1), 8);
  }
}
