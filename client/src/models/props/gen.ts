import { textTile } from '../../render/signs';
import { C } from './palette';
import { drumZ, fanBlades } from './parts';
import type { Kit } from './kit';

// Generator hall.

/**
 * A diesel generator set on a skid: radiator and fan to the front (-z), the engine, a flywheel and
 * the alternator behind. The fan and flywheel share a shaft and turn once the power is on.
 */
export function generator(k: Kit): void {
  const paint = k.tone(C.machine, 0.07);
  const dark = k.tone(C.steelDark, 0.06);
  const AXLE = 1.02;
  k.box(-0.92, 0, -1.92, 0.92, 0.22, 1.92, C.iron);
  // Radiator.
  k.box(-0.82, 0.22, -1.9, 0.82, 1.92, -1.62, dark);
  for (let i = 0; i < 6; i++) k.plate(-0.7, 0.42 + i * 0.23, 0.7, 0.54 + i * 0.23, -1.905, C.iron);
  k.cyl(0.5, -1.76, 1.92, 2.0, 0.1, 0.1, C.brass, 6);
  // Engine block, heads, air filter, exhaust up through the roof.
  k.box(-0.5, 0.22, -1.28, 0.5, 1.42, 0.42, paint);
  k.box(-0.62, 0.22, -1.1, 0.62, 0.62, 0.3, dark);
  for (let i = 0; i < 4; i++) k.box(-0.4, 1.42, -1.18 + i * 0.4, 0.4, 1.6, -0.88 + i * 0.4, [paint[0] * 1.2, paint[1] * 1.2, paint[2] * 1.2]);
  k.box(-0.68, 1.12, -1.2, -0.5, 1.3, 0.3, k.tone(C.rust, 0.1));
  k.cyl(-0.6, 0.38, 1.3, k.ceil, 0.11, 0.11, k.tone(C.rust, 0.1), 6, { noTop: true });
  k.cyl(-0.6, 0.38, 2.3, 3.1, 0.2, 0.2, C.iron, 6);
  k.cyl(0.3, -0.5, 1.6, 1.95, 0.2, 0.2, C.steel, 6);
  // Control box on the side: gauges that light with the mains, one warning lamp that never goes out.
  k.box(0.5, 0.86, -0.72, 0.72, 1.5, 0.14, dark);
  const side = k.sub(0.722, 0, -0.29, 270);
  for (let i = 0; i < 3; i++) side.plate(-0.33 + i * 0.24, 1.2, -0.15 + i * 0.24, 1.38, 0, i === 1 ? C.green : C.amber, 'power');
  side.plate(-0.33, 0.96, -0.2, 1.08, 0, 0xff3020, 'fire');
  side.plate(-0.08, 0.94, 0.33, 1.1, 0, C.iron);
  // The shaft: fan in front of the block, flywheel behind it.
  const shaft = k.mover(0, AXLE, 0, [0, 0, 1], { kind: 'spin', rate: 13, powered: true });
  fanBlades(shaft, 0, AXLE, -1.45, 0.72, 4, C.steel);
  drumZ(shaft, 0, AXLE, 0.5, 0.68, 0.8, k.tone(C.steelDark, 0.05));
  for (const a of [0, 120, 240]) shaft.sub(0, AXLE, 0.59, 0, 0, a).box(-0.1, 0.32, -0.1, 0.1, 0.74, 0.1, C.hazard, { bottom: true });
  drumZ(shaft, 0, AXLE, 0.42, 0.78, 0.14, C.iron, 6);
  k.box(-0.08, 0.22, 0.52, 0.08, 0.3, 0.66, C.iron);
  // Alternator and its terminal box.
  drumZ(k, 0, AXLE, 0.82, 1.78, 0.62, k.tone(C.blue, 0.08));
  drumZ(k, 0, AXLE, 1.78, 1.86, 0.4, dark);
  for (const z of [0.95, 1.55]) k.box(-0.6, 0.22, z, 0.6, 0.5, z + 0.14, C.iron);
  k.box(-0.3, 1.58, 1.0, 0.3, 1.9, 1.6, dark);
  k.cyl(0.1, 1.3, 1.9, k.ceil, 0.05, 0.05, C.rubber, 6, { noTop: true });
}

/** A fuel tank on cradles, lying along z. */
export function fuelTank(k: Kit): void {
  const c = k.tone(k.variant === 1 ? C.rust : C.olive, 0.08);
  drumZ(k, 0, 1.02, -1.38, 1.38, 0.68, c);
  for (const z of [-0.9, 0.9]) {
    k.box(-0.62, 0, z - 0.1, 0.62, 0.5, z + 0.1, C.iron);
    drumZ(k, 0, 1.02, z - 0.05, z + 0.05, 0.71, C.steelDark);
  }
  k.cyl(0.1, -0.5, 1.68, 1.84, 0.1, 0.1, C.red, 6);
  // Sight gauge and the draw-off pipe.
  k.box(-0.03, 0.5, -1.44, 0.03, 1.5, -1.4, C.glass);
  k.box(0.2, 0.3, -1.46, 0.3, 0.4, -1.38, C.brass);
  k.box(0.22, 0, -1.46, 0.28, 0.3, -1.4, C.steelDark);
  const label = textTile('DIESEL', 'hazard');
  k.sub(-0.7, 0, 0, 90).picture(0, 1.05, -0.01, 0.24 * label.aspect, 0.24, label.uv);
  k.sub(0.7, 0, 0, 270).picture(0, 1.05, -0.01, 0.24 * label.aspect, 0.24, label.uv);
}

/** A switchgear cabinet: dials, a row of lamps. Variant 1 has the master lever. */
export function switchgear(k: Kit): void {
  const c = k.tone(0x5c6a70, 0.06);
  k.box(-0.47, 0, -0.38, 0.47, 2.05, 0.48, c);
  k.box(-0.5, 0, -0.42, 0.5, 0.1, 0.5, C.iron);
  k.plate(-0.4, 0.2, 0.4, 1.95, -0.383, [c[0] * 0.8, c[1] * 0.8, c[2] * 0.8]);
  for (let i = 0; i < 4; i++) k.plate(-0.32 + i * 0.18, 1.72, -0.22 + i * 0.18, 1.82, -0.386, k.rng.pick([C.amber, C.green, 0xff3020]), k.rng.chance(0.25) ? 'tube' : 'power');
  for (const x of [-0.2, 0.2]) k.sub(x, 1.45, -0.385, 0, -90).cyl(0, 0, 0, 0.02, 0.12, 0.12, C.enamel, 8);
  if (k.variant === 1) {
    k.box(-0.16, 0.75, -0.42, 0.16, 1.2, -0.38, C.iron);
    k.sub(0, 0.98, -0.42, 0, -35).box(-0.03, 0, -0.03, 0.03, 0.42, 0.03, C.steel);
    k.sub(0, 0.98, -0.42, 0, -35).box(-0.1, 0.4, -0.05, 0.1, 0.5, 0.05, C.red);
    const label = textTile('MAINS', 'hazard');
    k.picture(0, 0.52, -0.39, 0.2 * label.aspect, 0.2, label.uv);
  } else {
    for (let i = 0; i < 3; i++) k.plate(-0.3, 0.5 + i * 0.25, 0.3, 0.68 + i * 0.25, -0.386, C.iron);
    for (let i = 0; i < 3; i++) k.box(0.18, 0.56 + i * 0.25, -0.41, 0.24, 0.62 + i * 0.25, -0.38, C.steel);
  }
  k.box(-0.1, 2.05, 0.1, 0.1, k.ceil, 0.3, C.steelDark, { noTop: true });
}

/** A walkway overhead, along x: grating, handrails, hangers up to the roof. */
export function catwalk(k: Kit): void {
  const len = k.inst.s ?? 6;
  const y = k.inst.y ?? 3.1;
  const steel = k.tone(C.steelDark, 0.05);
  k.box(-len / 2, y - 0.05, -0.55, len / 2, y, 0.55, k.tone(C.iron, 0.1), { bottom: true });
  for (const z of [-0.6, 0.54]) {
    k.box(-len / 2, y - 0.16, z, len / 2, y + 0.04, z + 0.06, steel, { bottom: true });
    k.box(-len / 2, y + 0.98, z, len / 2, y + 1.03, z + 0.06, C.hazard, { bottom: true });
    k.box(-len / 2, y + 0.5, z + 0.02, len / 2, y + 0.53, z + 0.04, steel, { bottom: true });
    const posts = Math.max(2, Math.round(len / 1.75) + 1);
    for (let i = 0; i < posts; i++) {
      const x = -len / 2 + 0.03 + (i * (len - 0.06)) / (posts - 1);
      // Every other post carries on up as a hanger.
      k.box(x - 0.025, y, z + 0.005, x + 0.025, i % 2 ? y + 1 : k.ceil, z + 0.055, steel, { noTop: i % 2 === 0 });
    }
  }
}

/** Rungs up a wall to `y`. */
export function ladder(k: Kit): void {
  const top = k.inst.y ?? 3.1;
  for (const x of [-0.22, 0.18]) k.box(x, 0, -0.14, x + 0.04, top + 1, -0.1, C.steelDark);
  for (let y = 0.3; y < top + 0.9; y += 0.3) k.box(-0.18, y, -0.135, 0.18, y + 0.03, -0.105, C.steel, { bottom: true });
  for (const y of [1, top]) for (const x of [-0.22, 0.18]) k.box(x, y, -0.1, x + 0.04, y + 0.04, 0, C.steelDark, { bottom: true });
}

/** An extractor fan in a square housing high on the wall. It turns in the draught until the power is on. */
export function wallFan(k: Kit): void {
  const y = k.inst.y ?? 3.8;
  const frame = k.tone(C.steelDark, 0.06);
  k.plate(-0.55, y - 0.55, 0.55, y + 0.55, -0.01, [0.012, 0.014, 0.02]);
  for (const s of [-1, 1]) {
    k.box(s * 0.6 - 0.06, y - 0.66, -0.16, s * 0.6 + 0.06, y + 0.66, 0, frame, { bottom: true });
    k.box(-0.6, y + s * 0.6 - 0.06, -0.16, 0.6, y + s * 0.6 + 0.06, 0, frame, { bottom: true });
  }
  fanBlades(k.mover(0, y, 0, [0, 0, 1], { kind: 'spin', rate: 9, powered: true, idle: 0.07 }), 0, y, -0.08, 0.52, 5, C.steel);
  k.box(-0.56, y - 0.015, -0.17, 0.56, y + 0.015, -0.15, C.iron, { bottom: true });
  k.box(-0.015, y - 0.56, -0.17, 0.015, y + 0.56, -0.15, C.iron);
}

/** A cable drum on its side. */
export function spool(k: Kit): void {
  const s = k.sub(0, 0, 0, k.rng.range(-8, 8));
  const wood = k.tone(C.wood, 0.1);
  for (const z of [-0.4, 0.34]) drumZ(s, 0, 0.48, z, z + 0.06, 0.48, wood);
  drumZ(s, 0, 0.48, -0.34, 0.34, 0.32, C.rubber);
  s.box(-0.2, 0, -0.3, -0.1, 0.06, 0.3, C.woodDark);
  s.box(0.1, 0, -0.3, 0.2, 0.06, 0.3, C.woodDark);
}

/** Hazard stripes painted on the floor, along x. */
export function stripes(k: Kit): void {
  const len = k.inst.s ?? 2;
  const n = Math.max(1, Math.round(len / 0.3));
  for (let i = 0; i < n; i++) {
    const x0 = -len / 2 + (i * len) / n;
    const x1 = x0 + len / n;
    const c = i % 2 ? [0.02, 0.02, 0.02] as [number, number, number] : k.tone(C.hazard, 0.12);
    k.face([[x0, 0.011, -0.15], [x0, 0.011, 0.15], [x1, 0.011, 0.15], [x1, 0.011, -0.15]], [0, 1, 0], c);
  }
}
