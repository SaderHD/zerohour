import * as THREE from 'three';
import { Rng, type CompiledMap } from '@zh/shared';
import { linear } from './materials';

// The skyline (`scene.beyond: 'towers'`): a ring of towers round the map, two deep, far taller
// than anything in it, a few windows lit on every one, their heads lost in the glow of the cloud.
// One mesh, unlit, its colours fixed here; the fog thins for it, or nothing so far off would show.

type V3 = [number, number, number];
type RGB = [number, number, number];

/** A cross street lies between the map's edge and the first row. */
const SETBACK = [11, 17] as const;
/** How far past the map's corners the rows run. */
const OVERRUN = 46;
const STOREY = 3.6;
const BAY = 3;
/** The fog reaches the towers this much less than it reaches the world. */
const FOG_REACH = 0.28;
/** By this height a tower has taken on most of the sky's colour, and its lights most of the haze. */
const LOST_AT = 170;
const BODIES = [0x0d0e13, 0x12100e, 0x0f1114, 0x15120f] as const;
/** Office strip lights, and the odd warm room. */
const LIGHTS: readonly (readonly [number, number])[] = [[0xc8d4b8, 0.5], [0xffd090, 0.6], [0xd8e0d0, 0.35], [0xffb060, 0.5]];

export function buildTowers(map: CompiledMap): THREE.Mesh | null {
  const scene = map.def.scene;
  if (scene.beyond !== 'towers') return null;
  const rng = new Rng([...map.def.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 2112));
  const pos: number[] = [];
  const col: number[] = [];
  const glow = linear(scene.skyHorizon);
  const lost = (y: number): number => Math.max(0, Math.min(1, y / LOST_AT));
  const quad = (p: [V3, V3, V3, V3], c: (y: number) => RGB): void => {
    for (const k of [0, 1, 2, 0, 2, 3]) {
      pos.push(...p[k]!);
      col.push(...c(p[k]![1]));
    }
  };
  const { w, d } = map.def.size;
  const centre = [w / 2, d / 2] as const;

  /** One tier of a tower: a box, with lit windows on the sides that face the map. */
  const tier = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, body: RGB, lit: number): void => {
    const shade = (k: number) => (y: number): RGB => {
      const t = lost(y) ** 1.3 * 0.55;
      return [body[0] * k + (glow[0] - body[0] * k) * t, body[1] * k + (glow[1] - body[1] * k) * t, body[2] * k + (glow[2] - body[2] * k) * t];
    };
    // [corner a, corner b] left to right as seen from outside, and the outward normal.
    const faces: [number, number, number, number, number, number][] = [
      [x1, z0, x0, z0, 0, -1], [x0, z1, x1, z1, 0, 1], [x1, z1, x1, z0, 1, 0], [x0, z0, x0, z1, -1, 0],
    ];
    for (const [ax, az, bx, bz, nx, nz] of faces) {
      quad([[ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]], shade(nx !== 0 ? 0.8 : 1));
      // Windows only where the map can see them.
      const [mx, mz] = [(ax + bx) / 2, (az + bz) / 2];
      if ((centre[0] - mx) * nx + (centre[1] - mz) * nz < 0) continue;
      const len = Math.hypot(bx - ax, bz - az);
      const [tx, tz] = [(bx - ax) / len, (bz - az) / len];
      const bays = Math.floor((len - 1.5) / BAY);
      const first = (len - bays * BAY) / 2;
      for (let y = Math.max(y0 + 1, 7); y + 2.6 < y1; y += STOREY) {
        // Now and then a whole floor has been left on.
        const floorOn = rng.chance(0.035);
        for (let b = 0; b < bays; b++) {
          const on = rng.chance(floorOn ? 0.75 : lit);
          const [lamp, level] = LIGHTS[rng.int(0, LIGHTS.length - 1)]!;
          if (!on) continue;
          const a = first + b * BAY + 0.6;
          const k = level * (1 - 0.7 * lost(y)) * rng.range(0.6, 1);
          const c = linear(lamp).map((v) => v * k) as RGB;
          const at = (t: number, h: number): V3 => [ax + tx * t + nx * 0.06, h, az + tz * t + nz * 0.06];
          quad([at(a, y), at(a + BAY - 1.2, y), at(a + BAY - 1.2, y + 1.9), at(a, y + 1.9)], () => c);
        }
      }
    }
    quad([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], shade(1.2));
  };

  /** A tower: one to three tiers, each set back from the one under it. */
  const tower = (x0: number, z0: number, x1: number, z1: number, h: number): void => {
    const body = linear(BODIES[rng.int(0, BODIES.length - 1)]!);
    const lit = rng.range(0.04, 0.16);
    const tiers = rng.chance(0.3) ? 1 : rng.chance(0.5) ? 2 : 3;
    let y = 0;
    for (let t = 0; t < tiers; t++) {
      const top = t === tiers - 1 ? h : h * (t === 0 ? rng.range(0.5, 0.72) : rng.range(0.82, 0.92));
      const inset = t === 0 ? 0 : Math.min(x1 - x0, z1 - z0) * rng.range(0.1, 0.16) * t;
      tier(x0 + inset, z0 + inset, x1 - inset, z1 - inset, y, top, body, lit);
      y = top;
    }
    // A red lamp on the tallest, for aeroplanes that are not coming.
    if (h > 120) {
      const [cx, cz] = [(x0 + x1) / 2, (z0 + z1) / 2];
      const red: RGB = [1.6, 0.1, 0.06];
      for (const [ax, az, bx, bz] of [[cx + 0.5, cz - 0.5, cx - 0.5, cz - 0.5], [cx - 0.5, cz + 0.5, cx + 0.5, cz + 0.5], [cx + 0.5, cz + 0.5, cx + 0.5, cz - 0.5], [cx - 0.5, cz - 0.5, cx - 0.5, cz + 0.5]] as const) {
        quad([[ax, h, az], [bx, h, bz], [bx, h + 1, bz], [ax, h + 1, az]], () => red);
      }
    }
  };

  // Two rows along each side of the map: the nearer lower, the farther showing over its shoulders.
  for (const row of [0, 1]) {
    for (const side of [0, 1, 2, 3]) {
      const length = side < 2 ? w : d;
      // (The rows along x take the corners.)
      const over = side < 2 ? OVERRUN + row * 40 : 4;
      for (let t = -over + row * 13; t < length + over; ) {
        const width = rng.range(16, 30);
        const depth = rng.range(18, 30);
        const back = rng.range(SETBACK[0], SETBACK[1]) + row * 44;
        const h = row === 0 ? rng.range(48, 105) : rng.range(90, 165);
        const [a0, a1] = [t, t + width];
        if (side === 0) tower(a0, -back - depth, a1, -back, h);
        else if (side === 1) tower(a0, d + back, a1, d + back + depth, h);
        else if (side === 2) tower(-back - depth, a0, -back, a1, h);
        else tower(w + back, a0, w + back + depth, a1, h);
        t += width + rng.range(2, 9);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <fog_vertex>', `#include <fog_vertex>\n#ifdef USE_FOG\n\tvFogDepth *= ${FOG_REACH.toFixed(3)};\n#endif`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'towers';
  mesh.matrixAutoUpdate = false;
  return mesh;
}
