import * as THREE from 'three';
import { CELL_SIZE, Cell, NO_ZONE, POWER_OFF_LIGHT, WINDOW_SILL, lineOfSight, type CompiledMap, type LightDef } from '@zh/shared';
import { lightLevels, linear } from './materials';

// All world lighting is baked into vertex colours: zone ambient + light pools (with grid line of
// sight, so light does not leak through walls or tall props) + fake ambient occlusion. Lights
// that change (mains lights waiting for the power, flickering ones) are baked into three extra
// colour attributes which the world shader scales by a uniform each (see materials.ts).

const AMBIENT_GAIN = 2.6;
const LIGHT_GAIN = 2.4;

export type RGB = [number, number, number];
/**
 * How a light or a glowing surface behaves: always on, on the mains (dim until the power is on),
 * a flame (always on, wavering) or a failing tube (mains, stuttering).
 */
export type GlowMode = 'on' | 'power' | 'fire' | 'tube';

export const lightMode = (l: LightDef): GlowMode => (l.flicker ? (l.needsPower ? 'tube' : 'fire') : l.needsPower ? 'power' : 'on');

export interface Vert {
  p: [number, number, number];
  uv: [number, number];
  ao: number;
}

export class Bucket {
  pos: number[] = [];
  col: number[] = [];
  uv: number[] = [];
  /** Extra light when the power is on / from flames / from failing tubes. */
  lp: number[] = [];
  la: number[] = [];
  lb: number[] = [];

  get triangles(): number {
    return this.pos.length / 9;
  }

  toGeometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('lightP', new THREE.Float32BufferAttribute(this.lp, 3));
    g.setAttribute('lightA', new THREE.Float32BufferAttribute(this.la, 3));
    g.setAttribute('lightB', new THREE.Float32BufferAttribute(this.lb, 3));
    g.computeVertexNormals();
    return g;
  }
}

const ORDER = [0, 1, 2, 0, 2, 3];

export class Baker {
  readonly lights: (LightDef & { floor: number; rgb: RGB; mode: GlowMode })[];
  /** Which lights can reach each open cell. */
  private readonly cellLights: number[][];
  private readonly out = new Float32Array(12);

  constructor(readonly map: CompiledMap) {
    const { cols, rows } = map;
    // A light's height is given above its storey's base; from here on it is absolute. `floor` is
    // the floor it hangs over: what it can reach is judged as from someone standing there.
    this.lights = map.def.lights.map((l) => {
      const base = map.levels[Math.max(0, map.layerOf(l.level ?? 0))]!.y;
      const y = base + l.y;
      const under = map.floorUnder(l.x, y, l.z);
      return { ...l, y, floor: under === y ? base : under, rgb: linear(l.color), mode: lightMode(l) };
    });
    this.cellLights = new Array(map.kind.length);
    for (let layer = 0; layer < map.layers; layer++) {
      for (let cz = 0; cz < rows; cz++) {
        for (let cx = 0; cx < cols; cx++) {
          const i = map.idx(cx, cz, layer);
          if (map.kind[i] === Cell.Solid) continue;
          const x = (cx + 0.5) * CELL_SIZE;
          const z = (cz + 0.5) * CELL_SIZE;
          const y = map.kind[i] === Cell.Window ? map.lo[i]! - WINDOW_SILL : map.lo[i]!;
          const list: number[] = [];
          this.lights.forEach((l, li) => {
            if (Math.hypot(l.x - x, l.z - z) < l.radius + 1 && Math.abs(l.y - y) < l.radius + 1 && lineOfSight(map, l.x, l.floor, l.z, x, y, z, 'all')) list.push(li);
          });
          this.cellLights[i] = list;
        }
      }
    }
    // Sight stops at the first cell of a tall prop, which would leave the middle of a big one (a
    // generator, a truck cab) unlit; let those cells borrow from the prop cells around them.
    const spread = new Map<number, number[]>();
    for (let layer = 0; layer < map.layers; layer++) {
      const tall = (cx: number, cz: number): boolean => map.inBounds(cx, cz) && map.block[map.idx(cx, cz, layer)] === 2;
      for (let cz = 0; cz < rows; cz++) {
        for (let cx = 0; cx < cols; cx++) {
          if (!tall(cx, cz)) continue;
          const all = new Set<number>();
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (tall(cx + dx, cz + dz)) for (const li of this.cellLights[map.idx(cx + dx, cz + dz, layer)] ?? []) all.add(li);
          spread.set(map.idx(cx, cz, layer), [...all]);
        }
      }
    }
    for (const [i, list] of spread) this.cellLights[i] = list;
  }

  private ambientOf(i: number): RGB {
    const zi = this.map.zone[i]!;
    const a = linear(zi === NO_ZONE ? this.map.def.scene.outside : this.map.zones[zi]!.ambient);
    return [a[0] * AMBIENT_GAIN, a[1] * AMBIENT_GAIN, a[2] * AMBIENT_GAIN];
  }

  /** The open cell at (x, z) on the storey of `fallback`, or `fallback` when that spot is inside a wall. */
  cellNear(x: number, z: number, fallback: number): number {
    const cx = Math.floor(x / CELL_SIZE);
    const cz = Math.floor(z / CELL_SIZE);
    const layer = this.map.layerOfCell(fallback);
    return this.map.kindAt(cx, cz, layer) === Cell.Solid ? fallback : this.map.idx(cx, cz, layer);
  }

  /** Baked colour for a vertex at p with face normal n, lit as part of cell i: [base, power, fire, tube] x rgb. */
  private shade(p: [number, number, number], n: [number, number, number], i: number, tint: RGB, ao: number): Float32Array {
    const o = this.out;
    const amb = this.ambientOf(i);
    const face = n[1] > 0.5 ? 1 : n[1] < -0.5 ? 0.7 : 0.8 + 0.12 * Math.abs(n[0]);
    o.fill(0);
    o[0] = amb[0] * face;
    o[1] = amb[1] * face;
    o[2] = amb[2] * face;
    for (const li of this.cellLights[i] ?? []) {
      const l = this.lights[li]!;
      const dx = l.x - p[0];
      const dy = l.y - p[1];
      const dz = l.z - p[2];
      const d = Math.hypot(dx, dy, dz);
      if (d >= l.radius) continue;
      const att = (1 - d / l.radius) ** 2 / (1 + (d * d) / 6);
      const ndl = d > 1e-4 ? Math.max(0, (n[0] * dx + n[1] * dy + n[2] * dz) / d) : 1;
      const k = att * (0.3 + 0.7 * ndl) * l.intensity * LIGHT_GAIN;
      const at = l.mode === 'on' ? 0 : l.mode === 'power' ? 3 : l.mode === 'fire' ? 6 : 9;
      const share = l.mode === 'power' ? 1 - POWER_OFF_LIGHT : 1;
      for (let c = 0; c < 3; c++) {
        o[at + c] = o[at + c]! + l.rgb[c]! * k * share;
        if (l.mode === 'power') o[c] = o[c]! + l.rgb[c]! * k * POWER_OFF_LIGHT;
      }
    }
    for (let c = 0; c < 12; c++) o[c] = o[c]! * tint[c % 3]! * ao;
    return o;
  }

  /** Emit a lit quad (CCW seen from the front). */
  quad(b: Bucket, v: [Vert, Vert, Vert, Vert], n: [number, number, number], cell: number, tint: RGB): void {
    const c = v.map((q) => Array.from(this.shade(q.p, n, cell, tint, q.ao)));
    for (const k of ORDER) {
      const s = c[k]!;
      b.pos.push(...v[k]!.p);
      b.uv.push(...v[k]!.uv);
      b.col.push(s[0]!, s[1]!, s[2]!);
      b.lp.push(s[3]!, s[4]!, s[5]!);
      b.la.push(s[6]!, s[7]!, s[8]!);
      b.lb.push(s[9]!, s[10]!, s[11]!);
    }
  }

  /** Emit a quad that glows by itself (lamp faces, screens, embers). Mains glows keep a faint ember when off. */
  glow(b: Bucket, pts: [number, number, number][], rgb: RGB, mode: GlowMode): void {
    const off = mode === 'power' ? 0.12 : mode === 'tube' ? 0.05 : mode === 'fire' ? 0.25 : 1;
    for (const k of ORDER) {
      b.pos.push(...pts[k]!);
      b.uv.push(0, 0);
      b.col.push(rgb[0] * off, rgb[1] * off, rgb[2] * off);
      const rest = [rgb[0] * (1 - off), rgb[1] * (1 - off), rgb[2] * (1 - off)];
      b.lp.push(...(mode === 'power' ? rest : [0, 0, 0]));
      b.la.push(...(mode === 'fire' ? rest : [0, 0, 0]));
      b.lb.push(...(mode === 'tube' ? rest : [0, 0, 0]));
    }
  }

  /** Light level at a point right now, for tinting dynamic models so they sit in the scene. */
  lightAt(x: number, y: number, z: number): RGB {
    const i = this.map.holdAt(Math.floor(x / CELL_SIZE), Math.floor(z / CELL_SIZE), y);
    if (i < 0) return [0.25, 0.25, 0.3];
    const c = this.ambientOf(i);
    for (const li of this.cellLights[i] ?? []) {
      const l = this.lights[li]!;
      const d = Math.hypot(l.x - x, l.y - y, l.z - z);
      if (d >= l.radius) continue;
      const level =
        l.mode === 'on' ? 1 : l.mode === 'power' ? POWER_OFF_LIGHT + (1 - POWER_OFF_LIGHT) * lightLevels.power : l.mode === 'fire' ? lightLevels.fire : lightLevels.tube;
      const k = ((1 - d / l.radius) ** 2 / (1 + (d * d) / 6)) * 0.8 * l.intensity * LIGHT_GAIN * level;
      c[0] += l.rgb[0] * k;
      c[1] += l.rgb[1] * k;
      c[2] += l.rgb[2] * k;
    }
    return c;
  }
}
