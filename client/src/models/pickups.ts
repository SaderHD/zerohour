import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { shadedBox, shadedCyl } from './rig';

// Small code-drawn models that float in the world: the six power-ups, the Jinx's skull and a
// Siren decoy. Each is one merged geometry with its colours baked in.

const BONE = 0xe8e4d4;
const GOLD = 0xffd040;

/** One digit in seven bars, `h` tall, centred on (x, y). */
function digit(n: number, x: number, y: number, h: number, hex: number, depth: number): THREE.BufferGeometry[] {
  const w = h / 2;
  const t = h * 0.15;
  const bars: Record<string, [number, number, number, number]> = {
    a: [0, h / 2, w, t], g: [0, 0, w, t], d: [0, -h / 2, w, t],
    f: [-w / 2, h / 4, t, h / 2], b: [w / 2, h / 4, t, h / 2], e: [-w / 2, -h / 4, t, h / 2], c: [w / 2, -h / 4, t, h / 2],
  };
  const lit = ['abcdef', 'bc', 'abged'][n] ?? '';
  return [...lit].map((k) => shadedBox(bars[k]![2] + (bars[k]![2] > t ? t : 0), bars[k]![3] + (bars[k]![3] > t ? t : 0), depth, hex, x + bars[k]![0], y + bars[k]![1], 0));
}

/** A skull: `eyes` adds the sockets as dark boxes (leave them off where something glows there instead). */
export function skullGeometry(eyes = true): THREE.BufferGeometry {
  const g = [
    shadedBox(0.3, 0.24, 0.3, BONE, 0, 0.1, 0),
    shadedBox(0.24, 0.1, 0.24, BONE, 0, -0.05, -0.02),
    shadedBox(0.2, 0.07, 0.2, 0xcfc8b0, 0, -0.14, -0.03),
    shadedBox(0.04, 0.06, 0.02, 0x1a1612, 0, 0.0, -0.152),
  ];
  for (let i = 0; i < 4; i++) g.push(shadedBox(0.03, 0.05, 0.02, 0x1a1612, -0.075 + i * 0.05, -0.12, -0.132));
  if (eyes) for (const x of [-0.075, 0.075]) g.push(shadedBox(0.08, 0.08, 0.02, 0x1a1612, x, 0.1, -0.152));
  return mergeGeometries(g);
}

/** Where a skull's eye sockets are, for a pair of glowing eyes. */
export function skullEyes(): THREE.BufferGeometry {
  return mergeGeometries([-0.075, 0.075].map((x) => new THREE.BoxGeometry(0.08, 0.08, 0.03).translate(x, 0.1, -0.15)));
}

/** A Siren decoy: a squat can with a horn and a red lamp. */
export function sirenGeometry(): THREE.BufferGeometry {
  return mergeGeometries([
    shadedCyl(0.09, 0.2, 8, 0x3d4a30, 0, 0, 0, 'y'),
    shadedCyl(0.1, 0.03, 8, 0x30343b, 0, 0.1, 0, 'y'),
    shadedCyl(0.1, 0.03, 8, 0x30343b, 0, -0.1, 0, 'y'),
    shadedCyl(0.04, 0.06, 6, 0xff3020, 0, 0.15, 0, 'y'),
    shadedBox(0.1, 0.1, 0.08, 0xb08a3a, 0, 0.0, -0.12),
    shadedBox(0.16, 0.16, 0.03, 0xb08a3a, 0, 0.0, -0.17),
  ]);
}

const flame = (size: number, hex: number, y: number): THREE.BufferGeometry => shadedBox(size, size, size * 0.7, hex, 0, y, 0, [0, 0, Math.PI / 4]);

const BUILDERS: Record<string, () => THREE.BufferGeometry[]> = {
  // An ammunition box with a row of rounds standing on it.
  resupply: () => [
    shadedBox(0.4, 0.22, 0.26, 0x55703a, 0, -0.06, 0),
    shadedBox(0.42, 0.04, 0.28, 0x7a9a52, 0, 0.03, 0),
    shadedBox(0.1, 0.1, 0.27, 0xe8e4d4, 0, -0.06, 0),
    ...[-0.12, 0, 0.12].map((x) => shadedCyl(0.035, 0.16, 6, 0xd0a040, x, 0.13, 0, 'y')),
    ...[-0.12, 0, 0.12].map((x) => shadedCyl(0.022, 0.06, 6, 0xb86a30, x, 0.24, 0, 'y')),
  ],
  reaper: () => [skullGeometry().scale(1.25, 1.25, 1.25)],
  // "x2".
  double: () => [
    shadedBox(0.07, 0.34, 0.07, GOLD, -0.16, 0, 0, [0, 0, 0.75]),
    shadedBox(0.07, 0.34, 0.07, GOLD, -0.16, 0, 0, [0, 0, -0.75]),
    ...digit(2, 0.16, 0, 0.36, GOLD, 0.07),
  ],
  firestorm: () => [flame(0.3, 0xff5a18, -0.08), flame(0.22, 0xff9a28, 0.08), flame(0.13, 0xffe060, 0.22)],
  // A hammer across a plank.
  rebuild: () => [
    shadedBox(0.46, 0.09, 0.05, 0x8a5a30, 0, -0.14, 0, [0, 0, -0.12]),
    shadedBox(0.05, 0.4, 0.05, 0x6e4424, 0, 0.02, 0, [0, 0, 0.5]),
    shadedBox(0.2, 0.1, 0.09, 0x9aa0a8, -0.1, 0.19, 0, [0, 0, 0.5]),
  ],
  // A price tag marked down to 10.
  clearance: () => [
    shadedBox(0.4, 0.34, 0.03, 0xe8d8ff, 0.02, -0.03, 0),
    shadedBox(0.14, 0.14, 0.03, 0xe8d8ff, 0, 0.16, 0, [0, 0, Math.PI / 4]),
    shadedBox(0.05, 0.05, 0.05, 0x2a1840, 0, 0.19, 0),
    ...digit(1, -0.12, -0.04, 0.2, 0x7030b0, 0.05),
    ...digit(0, 0.07, -0.04, 0.2, 0x7030b0, 0.05),
  ],
};

const cache = new Map<string, THREE.BufferGeometry>();

/** The model of a power-up, about 0.4 m across, centred on its origin. */
export function powerupGeometry(kind: string): THREE.BufferGeometry {
  let g = cache.get(kind);
  if (!g) cache.set(kind, (g = mergeGeometries((BUILDERS[kind] ?? BUILDERS.resupply!)())));
  return g;
}
