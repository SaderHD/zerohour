import * as THREE from 'three';
import { Rng, type FloorStyle, type WallStyle } from '@zh/shared';

// The fixed palette (sRGB hex). Models and UI pull colours from here so everything coheres.
export const PALETTE = {
  fog: 0x0a0e16,
  skyTop: 0x04060a,
  skyHorizon: 0x1b2c48,
  snow: 0xdfe8f2,
  rust: 0x7a3b22,
  hazard: 0xd8a020,
  steel: 0x6c7480,
  wood: 0x6b5a3a,
  bone: 0xd8d2c0,
  blood: 0xb3241c,
  lampGlow: 0xfff0c8,
} as const;

const SIZE = 32;
type Draw = (px: (x: number, y: number, v: number, tint?: [number, number, number]) => void, rng: Rng) => void;

/** Tiny greyscale-ish procedural texture; vertex colours provide the hue. */
function makeTexture(seed: number, draw: Draw): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(SIZE, SIZE);
  const px = (x: number, y: number, v: number, tint: [number, number, number] = [1, 1, 1]) => {
    const i = (((y % SIZE) + SIZE) % SIZE) * SIZE * 4 + (((x % SIZE) + SIZE) % SIZE) * 4;
    const c = Math.max(0, Math.min(255, v));
    img.data[i] = c * tint[0];
    img.data[i + 1] = c * tint[1];
    img.data[i + 2] = c * tint[2];
    img.data[i + 3] = 255;
  };
  draw(px, new Rng(seed));
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const each = (fn: (x: number, y: number) => void) => {
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) fn(x, y);
};

const FLOOR_DRAW: Record<FloorStyle, Draw> = {
  concrete: (px, r) => {
    each((x, y) => px(x, y, 196 + r.range(-16, 16)));
    for (let i = 0; i < 14; i++) px(r.int(0, 31), r.int(0, 31), 140);
    let cx = r.int(4, 28);
    for (let y = 0; y < SIZE; y++) {
      px(cx, y, 130);
      if (r.chance(0.4)) cx += r.int(-1, 1);
    }
  },
  tile: (px, r) => each((x, y) => px(x, y, x % 16 === 0 || y % 16 === 0 ? 125 : 214 + r.range(-7, 7) - ((x >> 4) ^ (y >> 4)) * 6)),
  plank: (px, r) => {
    for (let row = 0; row < 4; row++) {
      const base = r.range(165, 205);
      const joint = r.int(0, 31);
      for (let y = row * 8; y < row * 8 + 8; y++) {
        for (let x = 0; x < SIZE; x++) px(x, y, y % 8 === 0 || x === joint ? 95 : base + r.range(-9, 9) + (r.chance(0.06) ? -30 : 0), [1, 0.93, 0.82]);
      }
    }
  },
  snow: (px, r) => each((x, y) => px(x, y, r.chance(0.03) ? 255 : r.chance(0.05) ? 196 : 232 + r.range(-8, 8), [0.95, 0.98, 1])),
  metal: (px, r) =>
    each((x, y) => {
      const edge = x === 0 || y === 0;
      const rivet = (x === 3 || x === 28) && (y === 3 || y === 28);
      const tread = (x % 8 === 4 && y % 8 > 1 && y % 8 < 5 && (x >> 3) % 2 === (y >> 3) % 2) || (y % 8 === 4 && x % 8 > 1 && x % 8 < 5 && (x >> 3) % 2 !== (y >> 3) % 2);
      px(x, y, edge ? 100 : rivet ? 235 : tread ? 205 : 176 + r.range(-6, 6));
    }),
  lino: (px, r) => each((x, y) => px(x, y, (((x >> 4) + (y >> 4)) % 2 ? 205 : 158) + r.range(-6, 6))),
};

const WALL_DRAW: Record<WallStyle, Draw> = {
  panel: (px, r) => each((x, y) => px(x, y, x % 8 === 0 ? 110 : y === 0 || y === 12 ? 135 : (y > 12 ? 150 : 198) + r.range(-8, 8), [1, 0.95, 0.86])),
  block: (px, r) =>
    each((x, y) => {
      const row = y >> 3;
      const mortar = y % 8 === 0 || (x + (row % 2) * 8) % 16 === 0;
      px(x, y, mortar ? 118 : 190 + r.range(-12, 12));
    }),
  plaster: (px, r) => each((x, y) => px(x, y, 208 + r.range(-7, 7) - (y < 5 ? 26 : 0) - (r.chance(0.02) ? 45 : 0))),
  metal: (px, r) => each((x, y) => px(x, y, 150 + Math.sin((x / 4) * Math.PI) * 42 + r.range(-5, 5) - (y % 16 === 0 ? 40 : 0))),
  fence: (px, r) => each((x, y) => px(x, y, x % 8 === 7 ? 40 : y === 6 || y === 25 ? 120 : 160 + ((x >> 3) % 2) * 18 + r.range(-12, 12), [1, 0.94, 0.84])),
  rock: (px, r) => {
    const blobs = Array.from({ length: 9 }, () => [r.int(0, 31), r.int(0, 31), r.range(60, 150)] as const);
    each((x, y) => {
      let best = 1e9;
      let v = 100;
      for (const [bx, by, bv] of blobs) {
        const dx = Math.min(Math.abs(x - bx), SIZE - Math.abs(x - bx));
        const dy = Math.min(Math.abs(y - by), SIZE - Math.abs(y - by));
        const d = dx * dx + dy * dy;
        if (d < best) {
          best = d;
          v = bv;
        }
      }
      px(x, y, v + r.range(-14, 14));
    });
  },
};

const cache = new Map<string, THREE.MeshLambertMaterial>();

/** World surface material: baked vertex colours x a procedural texture. One per style, shared. */
export function surfaceMaterial(kind: 'floor' | 'wall', style: FloorStyle | WallStyle): THREE.MeshLambertMaterial {
  const key = `${kind}:${style}`;
  let mat = cache.get(key);
  if (!mat) {
    const draw = kind === 'floor' ? FLOOR_DRAW[style as FloorStyle] : WALL_DRAW[style as WallStyle];
    const seed = [...key].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
    mat = new THREE.MeshLambertMaterial({ map: makeTexture(seed, draw), vertexColors: true });
    cache.set(key, mat);
  }
  return mat;
}

export const emissiveMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });

/** sRGB hex -> linear [r, g, b]. */
export function linear(hex: number): [number, number, number] {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}
