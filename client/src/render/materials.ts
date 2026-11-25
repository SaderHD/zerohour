import * as THREE from 'three';
import { Rng, type FloorStyle, type WallStyle } from '@zh/shared';

// The fixed palette (sRGB hex). Models and UI pull colours from here so everything coheres.
export const PALETTE = {
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
  // A road: dark, gritty, cracked, with slush lying in the hollows.
  asphalt: (px, r) => {
    const slush = Array.from({ length: 5 }, () => [r.range(0, SIZE), r.range(0, SIZE), r.range(2.5, 6)] as const);
    each((x, y) => {
      let s = 0;
      for (const [bx, by, br] of slush) s = Math.max(s, 1 - Math.hypot(Math.min(Math.abs(x - bx), SIZE - Math.abs(x - bx)), Math.min(Math.abs(y - by), SIZE - Math.abs(y - by))) / br);
      px(x, y, s > 0.35 ? 190 + r.range(-14, 14) : 92 + r.range(-14, 14) + (r.chance(0.05) ? 46 : 0) + s * 60, [0.96, 0.98, 1]);
    });
    let cx = r.int(4, 28);
    for (let y = 0; y < SIZE; y++) {
      px(cx, y, 48);
      if (r.chance(0.5)) cx += r.int(-1, 1);
    }
  },
  // Flagstones a metre square, trodden snow in the joints and over the corners.
  pavement: (px, r) => {
    const flag = [r.range(-10, 10), r.range(-10, 10), r.range(-10, 10), r.range(-10, 10)];
    each((x, y) => {
      const joint = x % 16 === 0 || y % 16 === 0;
      const edge = Math.min(x % 16, 16 - (x % 16), y % 16, 16 - (y % 16));
      const snow = edge < 3 && r.chance(0.55 - edge * 0.15);
      px(x, y, joint ? 104 : snow ? 222 + r.range(-8, 8) : 162 + flag[(x >> 4) + (y >> 4) * 2]! + r.range(-8, 8), [0.97, 0.98, 1]);
    });
  },
  // Roofing felt in metre rolls, the laps tarred, grit and old snow on it.
  felt: (px, r) => each((x, y) => px(x, y, x % 16 === 0 ? 46 : x % 16 === 1 ? 118 : r.chance(0.07) ? 196 : 84 + r.range(-12, 12) + ((x >> 4) % 2) * 8)),
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
  // Weatherboards, the lap of each in shadow, rime along the top edges.
  siding: (px, r) => each((x, y) => px(x, y, y % 8 === 0 ? 96 : y % 8 === 1 ? 228 : x === (y >> 3) * 11 % 32 ? 120 : 176 + r.range(-10, 10) - (y % 8) * 3, [1, 0.94, 0.86])),
  // Brick in running bond: courses a quarter of a metre high (it is a coarse world), every brick its own shade.
  brick: (px, r) => {
    const shade = Array.from({ length: 64 }, () => r.range(-22, 22) - (r.chance(0.12) ? 30 : 0));
    each((x, y) => {
      const row = y >> 2;
      const sx = (x + (row % 2) * 4) % SIZE;
      const mortar = y % 4 === 3 || sx % 8 === 7;
      px(x, y, mortar ? 150 + r.range(-8, 8) : 186 + shade[(row * 4 + (sx >> 3)) % 64]! + r.range(-6, 6), mortar ? [0.9, 0.86, 0.8] : [1, 0.6, 0.47]);
    });
  },
  // A shop front, two metres of it: a panelled stall riser, plate glass between mullions a metre apart, the fascia over it.
  shopfront: (px, r) =>
    each((x, y) => {
      const mullion = x % 16 === 0 || x % 16 === 15;
      if (y < 5) px(x, y, y === 0 ? 215 : y === 4 ? 110 : 168 + r.range(-5, 5), [0.86, 0.92, 0.88]);
      else if (y >= 25) px(x, y, mullion || y === 25 ? 196 : (x % 16 === 2 || x % 16 === 13 || y === 27 || y === 30) ? 122 : 150 + r.range(-5, 5), [0.86, 0.92, 0.88]);
      else if (mullion) px(x, y, 200, [0.86, 0.92, 0.88]);
      // The glass: dark, with the street's glow lying across it.
      else px(x, y, 46 + r.range(-4, 4) + ((x + y) % 16 < 3 ? 34 : 0) + (y < 7 ? 16 : 0), [0.8, 0.9, 1]);
    }),
  // Glazed tile in running bond, with one band of colour at the height of a hand.
  subway: (px, r) =>
    each((x, y) => {
      const row = y >> 2;
      const grout = y % 4 === 3 || (x + (row % 2) * 4) % 8 === 7;
      const band = row === 4;
      px(x, y, grout ? 176 : (band ? 170 : 226) + r.range(-7, 7) + (y % 4 === 0 ? 14 : 0) - (r.chance(0.02) ? 50 : 0), band && !grout ? [0.45, 0.8, 0.62] : [1, 1, 0.96]);
    }),
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

/**
 * How bright the changing lights are right now: mains lights (0 until the power is on), flames
 * and failing tubes. World.update sets them every frame; the world shader and Baker.lightAt read them.
 */
export const lightLevels = { power: 0, fire: 1, tube: 0 };
const uniforms = { uPower: { value: 0 }, uFire: { value: 1 }, uTube: { value: 0 } };
export function setLightLevels(power: number, fire: number, tube: number): void {
  uniforms.uPower.value = lightLevels.power = power;
  uniforms.uFire.value = lightLevels.fire = fire;
  uniforms.uTube.value = lightLevels.tube = tube;
}

/** Make a material add the baked `lightP/A/B` attributes (see bake.ts) to its vertex colours. */
function lit<T extends THREE.Material>(mat: T): T {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      'attribute vec3 lightP;\nattribute vec3 lightA;\nattribute vec3 lightB;\nuniform float uPower;\nuniform float uFire;\nuniform float uTube;\n' +
      shader.vertexShader.replace('#include <color_vertex>', '#include <color_vertex>\n\tvColor.rgb += lightP * uPower + lightA * uFire + lightB * uTube;');
  };
  return mat;
}

const cache = new Map<string, THREE.MeshLambertMaterial>();

/** World surface material: baked vertex colours x a procedural texture. One per style, shared. */
export function surfaceMaterial(kind: 'floor' | 'wall', style: FloorStyle | WallStyle): THREE.MeshLambertMaterial {
  const key = `${kind}:${style}`;
  let mat = cache.get(key);
  if (!mat) {
    const draw = kind === 'floor' ? FLOOR_DRAW[style as FloorStyle] : WALL_DRAW[style as WallStyle];
    const seed = [...key].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
    mat = lit(new THREE.MeshLambertMaterial({ map: makeTexture(seed, draw), vertexColors: true }));
    cache.set(key, mat);
  }
  return mat;
}

let propMat: THREE.MeshLambertMaterial | null = null;
/** Props: baked vertex colours over a faint grain so flat faces are not dead flat. */
export function propMaterial(): THREE.MeshLambertMaterial {
  propMat ??= lit(new THREE.MeshLambertMaterial({
    map: makeTexture(977, (px, r) => each((x, y) => px(x, y, 226 + r.range(-12, 12) - (r.chance(0.04) ? 34 : 0) - (y % 16 === 0 ? 14 : 0)))),
    vertexColors: true,
  }));
  return propMat;
}

/** Things that glow by themselves: lamp faces, screens, embers. */
export const glowMaterial = lit(new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }));

let mistMat: THREE.MeshBasicMaterial | null = null;
/** Mist lying on a cold floor: wisps added over the scene, lit by the baked lights, drifting (see ambient.ts). */
export function mistMaterial(): THREE.MeshBasicMaterial {
  mistMat ??= lit(new THREE.MeshBasicMaterial({
    map: makeTexture(4111, (px, r) => {
      const blobs = Array.from({ length: 7 }, () => [r.range(0, SIZE), r.range(0, SIZE), r.range(5, 11)] as const);
      each((x, y) => {
        let v = 0;
        for (const [bx, by, br] of blobs) {
          const dx = Math.min(Math.abs(x - bx), SIZE - Math.abs(x - bx));
          const dy = Math.min(Math.abs(y - by), SIZE - Math.abs(y - by));
          v += Math.max(0, 1 - Math.hypot(dx, dy) / br);
        }
        px(x, y, Math.min(1, v) * 200 + r.range(0, 30));
      });
    }),
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  }));
  return mistMat;
}

/** Lettering and drawings from the sign atlas (render/signs.ts), lit like everything else. */
export const signMaterial = (map: THREE.Texture): THREE.MeshLambertMaterial =>
  lit(new THREE.MeshLambertMaterial({ map, vertexColors: true, alphaTest: 0.5 }));

/** sRGB hex -> linear [r, g, b]. */
export function linear(hex: number): [number, number, number] {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}
