import { mapTile } from '../../render/signs';
import { C } from './palette';
import type { Kit } from './kit';

// Comms bunker: desks of lamps and keys, the plot, racks of sets.

const LAMPS = [C.amber, C.green, 0xff3020, C.crt] as const;

/**
 * An operator's desk, 2 m wide: a sloped panel of lamps and keys towards the operator (-z), a
 * riser behind with a scope and meters. Variant 1 has a handset off its hook.
 */
export function opsConsole(k: Kit): void {
  const body = k.tone(0x5a6660, 0.06);
  const dark: [number, number, number] = [body[0] * 0.6, body[1] * 0.6, body[2] * 0.6];
  k.box(-0.98, 0, -0.1, 0.98, 1.3, 0.48, body);
  k.box(-0.98, 0, -0.46, 0.98, 0.74, -0.1, body);
  k.box(-0.9, 0.08, -0.48, 0.9, 0.2, -0.46, C.iron);
  // The panel: a slab tilted towards whoever sits here.
  const p = k.sub(0, 0.74, -0.48, 0, 58);
  p.box(-0.98, 0, 0, 0.98, 0.5, 0.06, dark, { bottom: true });
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 12; col++) {
      if (k.rng.chance(0.25)) continue;
      const x = -0.86 + col * 0.15;
      const y = 0.08 + row * 0.14;
      const mode = k.rng.chance(0.3) ? 'on' : k.rng.chance(0.4) ? 'tube' : 'power';
      p.plate(x, y, x + 0.07, y + 0.07, -0.004, k.rng.pick(LAMPS), mode);
    }
  }
  for (let i = 0; i < 4; i++) p.box(-0.7 + i * 0.42, 0.02, -0.07, -0.64 + i * 0.42, 0.06, 0, C.steel);
  // Riser: a scope with a trace on it, two meters, a row of jacks.
  k.plate(-0.82, 0.86, -0.3, 1.22, -0.105, [0.01, 0.05, 0.03]);
  k.plate(-0.76, 0.9, -0.36, 1.18, -0.108, [0.03, 0.2, 0.1], 'on');
  for (let i = 0; i < 6; i++) {
    const y = 1.04 + Math.sin(i * 1.7 + k.variant) * 0.08;
    k.plate(-0.74 + i * 0.062, y, -0.7 + i * 0.062, y + 0.03, -0.11, [0.2, 1.3, 0.5], 'on');
  }
  for (const x of [-0.08, 0.32]) {
    k.plate(x, 0.96, x + 0.28, 1.2, -0.105, C.enamel);
    k.plate(x + 0.13, 0.99, x + 0.15, 1.15, -0.108, C.iron);
  }
  for (let i = 0; i < 5; i++) k.plate(0.68 + (i % 3) * 0.09, 0.94 + Math.floor(i / 3) * 0.12, 0.73 + (i % 3) * 0.09, 0.99 + Math.floor(i / 3) * 0.12, -0.105, C.brass);
  k.box(-0.98, 1.3, -0.12, 0.98, 1.33, 0.48, dark);
  // On top: a mug, a clipboard; the handset.
  k.cyl(0.6, 0.2, 1.33, 1.43, 0.045, 0.045, C.enamel, 6);
  k.sub(-0.4, 1.33, 0.18, k.rng.range(-25, 25)).box(-0.11, 0, -0.15, 0.11, 0.015, 0.15, C.paper);
  if (k.variant === 1) {
    k.box(0.7, 0.3, -0.5, 0.74, 0.74, -0.47, C.bakelite);
    k.sub(0.72, 0.28, -0.5, 0, 0, 20).box(-0.03, -0.1, -0.03, 0.03, 0.1, 0.03, C.bakelite, { bottom: true });
  } else {
    k.box(0.62, 0.74, -0.42, 0.86, 0.8, -0.3, C.bakelite);
  }
}

/** A plotting scope lying flat in a pedestal: range rings, a few returns, the sweep going round. */
export function radar(k: Kit): void {
  const body = k.tone(0x5a6660, 0.06);
  k.cyl(0, 0, 0, 0.2, 0.46, 0.46, C.iron, 8);
  k.cyl(0, 0, 0.2, 0.9, 0.3, 0.44, body, 8);
  k.cyl(0, 0, 0.9, 1.04, 0.48, 0.48, k.tone(C.steelDark, 0.06), 8);
  k.cyl(0, 0, 1.045, 1.045, 0.42, 0.42, [0.02, 0.13, 0.06], 8, { glow: 'on' });
  for (const [r, y] of [[0.3, 1.047], [0.16, 1.049]] as const) {
    k.cyl(0, 0, y, y, r, r, [0.05, 0.32, 0.14], 8, { glow: 'on' });
    k.cyl(0, 0, y + 0.001, y + 0.001, r - 0.015, r - 0.015, [0.02, 0.13, 0.06], 8, { glow: 'on' });
  }
  for (let i = 0; i < 4; i++) {
    const a = k.rng.range(0, Math.PI * 2);
    const r = k.rng.range(0.1, 0.36);
    k.cube(Math.cos(a) * r, 1.052, Math.sin(a) * r, 0.04, 0.002, 0.04, [0.4, 1.6, 0.7], { glow: 'on' });
  }
  // The sweep: it only crawls until the mains are back.
  const sweep = k.mover(0, 1.05, 0, [0, 1, 0], { kind: 'spin', rate: 2.2, powered: true, idle: 0.2 });
  sweep.box(-0.012, 1.053, -0.41, 0.012, 1.056, 0, [0.5, 1.8, 0.8], { glow: 'on' });
  sweep.sub(0, 0, 0, 8).box(-0.03, 1.052, -0.4, 0.01, 1.054, -0.05, [0.12, 0.6, 0.25], { glow: 'on' });
  // Hood struts and a bearing ring; a grease pencil on the rim.
  for (const a of [45, 135, 225, 315]) k.sub(0, 0, 0, a).box(-0.02, 1.04, -0.47, 0.02, 1.1, -0.43, C.brass);
  k.sub(0.2, 1.04, 0.42, 30).box(-0.07, 0, -0.01, 0.07, 0.02, 0.01, 0xd04030);
}

/** The plot: a big table with the ridge under glass, a lamp, dividers and markers. */
export function mapTable(k: Kit): void {
  const wood = k.tone(C.woodDark, 0.06);
  k.box(-1, 0.8, -0.75, 1, 0.9, 0.75, wood);
  for (const x of [-0.9, 0.78]) for (const z of [-0.65, 0.53]) k.box(x, 0, z, x + 0.12, 0.8, z + 0.12, wood);
  k.box(-0.9, 0.3, -0.03, 0.9, 0.38, 0.03, wood, { bottom: true });
  // The sheet lies face up.
  k.sub(0, 0.905, 0, 0, 90).picture(0, 0, 0, 1.84, 1.36, mapTile(1), [0.9, 0.9, 0.86]);
  // A lamp on a bent arm, lit off the batteries.
  k.cyl(-0.8, -0.55, 0.9, 0.94, 0.09, 0.09, C.iron, 6);
  k.box(-0.81, 0.94, -0.56, -0.79, 1.3, -0.54, C.iron);
  k.sub(-0.8, 1.3, -0.55, -40, 0, 0).box(-0.01, -0.01, -0.3, 0.01, 0.01, 0, C.iron, { bottom: true });
  k.cyl(-0.62, -0.4, 1.2, 1.3, 0.11, 0.05, k.tone(C.olive, 0.08), 6);
  k.cyl(-0.62, -0.4, 1.19, 1.2, 0.09, 0.09, [1.6, 1.3, 0.8], 6, { glow: 'on', bottom: true, noTop: true });
  // Markers, a rule, a mug holding the corner down.
  for (let i = 0; i < 5; i++) k.cyl(k.rng.range(-0.6, 0.8), k.rng.range(-0.5, 0.5), 0.91, 0.97, 0.03, 0.02, k.rng.pick([C.red, C.blue, C.hazard]), 5);
  k.sub(0.3, 0.91, 0.4, k.rng.range(-30, 30)).box(-0.3, 0, -0.02, 0.3, 0.012, 0.02, C.brass);
  k.cyl(0.85, -0.6, 0.9, 1.0, 0.045, 0.045, C.enamel, 6);
}

/** A rack of sets, 1 m wide: receivers with dials and meters, a patch bay, a speaker grille. */
export function radioRack(k: Kit): void {
  const frame = k.tone(C.steelDark, 0.06);
  k.box(-0.48, 0, -0.2, 0.48, 2, 0.24, frame);
  const z = -0.203;
  let y = 0.12;
  for (let unit = 0; unit < 4; unit++) {
    const h = unit === 3 ? 0.36 : 0.46;
    const face = k.tone(unit % 2 ? 0x5a6660 : 0x6e6a58, 0.08);
    k.plate(-0.44, y, 0.44, y + h - 0.04, z, face);
    const kind = (unit + k.variant) % 3;
    if (kind === 0) {
      // A receiver: tuning dial, a meter, a lamp.
      k.sub(-0.2, y + h / 2 - 0.02, z, 0, -90).cyl(0, 0, 0, 0.03, 0.11, 0.09, C.bakelite, 8);
      k.plate(0.08, y + 0.12, 0.34, y + h - 0.12, z - 0.004, C.enamel, 'power');
      k.plate(0.2, y + 0.14, 0.22, y + h - 0.16, z - 0.007, C.iron);
      k.plate(-0.4, y + h - 0.14, -0.34, y + h - 0.08, z - 0.004, C.green, 'on');
    } else if (kind === 1) {
      // A patch bay: rows of jacks, a couple of cords hanging.
      for (let row = 0; row < 2; row++) for (let col = 0; col < 7; col++) k.plate(-0.38 + col * 0.11, y + 0.1 + row * 0.14, -0.33 + col * 0.11, y + 0.15 + row * 0.14, z - 0.004, C.brass);
      for (let i = 0; i < 2; i++) {
        const x = k.rng.range(-0.3, 0.3);
        k.box(x, y - k.rng.range(0.1, 0.3), z - 0.03, x + 0.02, y + 0.12, z - 0.01, k.rng.pick([C.red, C.rubber]), { bottom: true });
      }
    } else {
      // A transmitter: two knobs, a row of lamps.
      for (const x of [-0.26, 0.02]) k.sub(x, y + h / 2 - 0.04, z, 0, -90).cyl(0, 0, 0, 0.04, 0.06, 0.05, C.bakelite, 6);
      for (let i = 0; i < 4; i++) k.plate(0.16 + i * 0.07, y + h - 0.16, 0.2 + i * 0.07, y + h - 0.12, z - 0.004, k.rng.pick(LAMPS), k.rng.chance(0.5) ? 'tube' : 'power');
    }
    y += h;
  }
  for (let i = 0; i < 4; i++) k.plate(-0.3, 1.86 + i * 0.025, 0.3, 1.87 + i * 0.025, z, C.iron);
  k.box(-0.1, 2, 0, 0.1, k.ceil, 0.2, C.steelDark, { noTop: true });
}

/** A teleprinter on its stand, paper spilling out of it. */
export function teleprinter(k: Kit): void {
  k.box(-0.42, 0, -0.18, 0.42, 0.7, 0.22, k.tone(0x5a6660, 0.06));
  k.box(-0.38, 0.7, -0.2, 0.38, 0.92, 0.2, k.tone(C.olive, 0.08));
  k.sub(0, 0.76, -0.2, 0, 35).box(-0.3, 0, 0, 0.3, 0.14, 0.03, C.bakelite, { bottom: true });
  k.box(-0.22, 0.92, 0.02, 0.22, 1.0, 0.16, C.iron);
  const paper = k.tone(C.paper, 0.05);
  k.box(-0.16, 0.5, -0.24, 0.16, 0.99, -0.225, paper, { bottom: true });
  k.sub(0, 0.012, -0.5, k.rng.range(-20, 20)).face([[-0.16, 0, -0.3], [-0.16, 0, 0.28], [0.16, 0, 0.28], [0.16, 0, -0.3]], [0, 1, 0], paper);
  k.plate(0.26, 0.76, 0.32, 0.82, -0.203, C.amber, 'power');
}

/** The ridge on the wall: a framed sheet, strings pinned across it. */
export function wallMap(k: Kit): void {
  const y = k.inst.y ?? 1.7;
  k.box(-1.22, y - 0.72, -0.04, 1.22, y + 0.72, 0, k.tone(C.woodDark, 0.06));
  k.picture(0, y, -0.045, 2.3, 1.3, mapTile(2 + k.variant), [0.85, 0.85, 0.8]);
  for (let i = 0; i < 3; i++) {
    const s = k.sub(k.rng.range(-0.6, 0.6), y + k.rng.range(-0.3, 0.3), -0.05, 0, 0, k.rng.range(-70, 70));
    s.plate(-0.006, -0.4, 0.006, 0.4, 0, C.red);
  }
}
