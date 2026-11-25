import * as THREE from 'three';
import { CELL_SIZE, Cell, type CompiledMap } from '@zh/shared';
import type { Mover } from '../models/props/kit';
import { Bucket, type Baker, type Vert } from './bake';
import { glowMaterial, mistMaterial, propMaterial, steamMaterial } from './materials';

// The things in the world that move by themselves: fans, flywheels and swinging lamps (the
// `Mover`s the prop builders hand over), water dripping from the roof, mist drifting over a cold
// floor and steam climbing off a grating in the road. None of it touches gameplay.

/** Seconds for machinery to run up to speed once the power is on. */
const SPIN_UP_SECONDS = 2.5;
const GRAVITY = 9.8;
const SPLASH_SECONDS = 0.22;
const DROP_LENGTH = 0.14;
const DROP_COLOUR = [0.5, 0.66, 0.8] as const;
/** Mist layers: height off the floor, and how bright. */
const MIST_LAYERS = [[0.2, 1], [0.48, 0.6]] as const;
const MIST_TILE = 1; // metres
const MIST_GAIN = 2.4;
const MIST_DRIFT = 0.012; // texture repeats per second
/** A plume of steam: how high it climbs, how wide it is at the vent and at the top, how fast. */
const STEAM_HEIGHT = 4.2;
const STEAM_WIDTH = [0.5, 1.7] as const;
const STEAM_BANDS = 4;
const STEAM_GAIN = 2.2;
const STEAM_RISE = 0.22; // texture repeats per second

interface Moving {
  mover: Mover;
  meshes: THREE.Mesh[];
  angle: number;
  phase: number;
}

interface Drip {
  x: number;
  y: number;
  z: number;
  /** Height of the floor it falls to. */
  floor: number;
  period: number;
  phase: number;
}

export class Ambient {
  readonly group = new THREE.Group();
  triangles = 0;
  private readonly moving: Moving[] = [];
  private readonly drips: Drip[];
  private readonly dripGeo = new THREE.BufferGeometry();
  private readonly mist: THREE.Texture | null = null;
  private readonly steam: THREE.Texture | null = null;
  /** 0..1: how far the machinery has run up. */
  private run = 0;
  private readonly axis = new THREE.Vector3();

  constructor(map: CompiledMap, private readonly baker: Baker, movers: Mover[], drips: [number, number, number][], steams: [number, number, number][] = []) {
    this.group.name = 'ambient';
    for (const [i, mover] of movers.entries()) {
      const meshes: THREE.Mesh[] = [];
      for (const [b, mat] of [[mover.prop, propMaterial()], [mover.glow, glowMaterial]] as const) {
        if (!b.pos.length) continue;
        const geo = b.toGeometry();
        geo.translate(-mover.pivot[0], -mover.pivot[1], -mover.pivot[2]);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(...mover.pivot);
        mesh.name = `mover:${i}`;
        meshes.push(mesh);
        this.group.add(mesh);
        this.triangles += b.triangles;
      }
      this.moving.push({ mover, meshes, angle: 0, phase: i * 1.7 });
    }

    this.drips = drips.map(([x, y, z], i) => ({ x, y, z, floor: Math.min(y, map.floorUnder(x, y - 0.1, z)) === y ? 0 : map.floorUnder(x, y - 0.1, z), period: 1.3 + ((i * 0.618) % 1) * 1.9, phase: (i * 0.37) % 1 }));
    if (this.drips.length) {
      // Per drip: two crossed quads for the drop and one flat one for the splash.
      const verts = this.drips.length * 18;
      this.dripGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
      this.dripGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
      const mesh = new THREE.Mesh(this.dripGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
      mesh.name = 'drips';
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.triangles += this.drips.length * 6;
    }

    const mist = this.buildMist(map);
    if (mist.pos.length) {
      const mat = mistMaterial();
      this.mist = mat.map;
      const mesh = new THREE.Mesh(mist.toGeometry(), mat);
      mesh.name = 'mist';
      mesh.renderOrder = 5;
      this.group.add(mesh);
      this.triangles += mist.triangles;
    }

    const steam = this.buildSteam(map, steams);
    if (steam.pos.length) {
      const mat = steamMaterial();
      this.steam = mat.map;
      const mesh = new THREE.Mesh(steam.toGeometry(), mat);
      mesh.name = 'steam';
      mesh.renderOrder = 5;
      this.group.add(mesh);
      this.triangles += steam.triangles;
    }
  }

  /** Two crossed sheets of wisps over each vent, widening as they climb and thinning to nothing at the top. */
  private buildSteam(map: CompiledMap, vents: [number, number, number][]): Bucket {
    const b = new Bucket();
    for (const [vi, [x, y, z]] of vents.entries()) {
      const cell = map.cellAt(x, y, z);
      if (cell < 0) continue;
      for (const [sx, sz] of [[1, 0.25], [-0.25, 1]] as const) {
        for (let i = 0; i < STEAM_BANDS; i++) {
          const at = (t: number, side: number): Vert => {
            const w = (STEAM_WIDTH[0] + (STEAM_WIDTH[1] - STEAM_WIDTH[0]) * t) / 2;
            // Lean with the wind as it climbs.
            const lean = t * t * 0.9;
            // Thickest up the middle: nothing at either edge, nothing at the vent or the top.
            const thick = (1 - Math.abs(side)) * Math.sin(Math.min(1, 0.08 + t * 1.1) * Math.PI) ** 0.7;
            return { p: [x + sx * side * w + lean, y + t * STEAM_HEIGHT, z + sz * side * w + lean * 0.4], uv: [0.5 + side * 0.22 + vi * 0.31 + (sx > 0 ? 0 : 0.4), t * 0.9 + vi * 0.17], ao: thick };
          };
          const [t0, t1] = [i / STEAM_BANDS, (i + 1) / STEAM_BANDS];
          for (const [a, c] of [[-1, 0], [0, 1]] as const) this.baker.quad(b, [at(t0, a), at(t0, c), at(t1, c), at(t1, a)], [0, 1, 0], cell, [STEAM_GAIN, STEAM_GAIN, STEAM_GAIN]);
        }
      }
    }
    return b;
  }

  get movers(): number {
    return this.moving.length;
  }

  /** Two layers of wisps over the floor of every room marked `mist`, fading out at the room's edges. */
  private buildMist(map: CompiledMap): Bucket {
    const b = new Bucket();
    for (const room of map.def.rooms) {
      if (!room.mist) continue;
      const edge = (x: number, z: number): number => (x <= room.x + 1e-3 || x >= room.x + room.w - 1e-3 || z <= room.z + 1e-3 || z >= room.z + room.d - 1e-3 ? 0 : 1);
      for (const [li, [y, gain]] of MIST_LAYERS.entries()) {
        for (let z = room.z; z < room.z + room.d - 1e-3; z += MIST_TILE) {
          for (let x = room.x; x < room.x + room.w - 1e-3; x += MIST_TILE) {
            const cx = Math.floor((x + MIST_TILE / 2) / CELL_SIZE);
            const cz = Math.floor((z + MIST_TILE / 2) / CELL_SIZE);
            const cell = map.idx(cx, cz, Math.max(0, map.layerOf(room.level ?? 0)));
            if (map.kind[cell] === Cell.Solid) continue;
            const floor = map.lo[cell]!;
            // The two layers drift across each other.
            const V = (px: number, pz: number): Vert => ({ p: [px, floor + y, pz], uv: li ? [pz / 5 + 0.37, px / 5 + 0.11] : [px / 6, pz / 6], ao: edge(px, pz) });
            const x1 = Math.min(x + MIST_TILE, room.x + room.w);
            const z1 = Math.min(z + MIST_TILE, room.z + room.d);
            const k = gain * MIST_GAIN;
            this.baker.quad(b, [V(x, z), V(x, z1), V(x1, z1), V(x1, z)], [0, 1, 0], cell, [k * 0.8, k * 0.92, k]);
          }
        }
      }
    }
    return b;
  }

  update(dt: number, time: number, power: boolean): void {
    this.run = Math.max(0, Math.min(1, this.run + ((power ? 1 : -1) * dt) / SPIN_UP_SECONDS));
    for (const m of this.moving) {
      const mo = m.mover.motion;
      if (mo.kind === 'spin') m.angle += mo.rate * dt * (mo.powered ? (mo.idle ?? 0) + (1 - (mo.idle ?? 0)) * this.run : 1);
      else m.angle = mo.amp * (Math.sin((time / mo.period) * Math.PI * 2 + m.phase) + 0.3 * Math.sin((time / mo.period) * Math.PI * 2 * 1.31 + m.phase * 2));
      this.axis.set(...m.mover.axis).normalize();
      for (const mesh of m.meshes) mesh.quaternion.setFromAxisAngle(this.axis, m.angle);
    }
    if (this.mist) this.mist.offset.set(time * MIST_DRIFT, time * MIST_DRIFT * 0.6);
    if (this.steam) this.steam.offset.set(Math.sin(time * 0.31) * 0.04, -time * STEAM_RISE);
    if (this.drips.length) this.updateDrips(time);
  }

  private updateDrips(time: number): void {
    const pos = this.dripGeo.getAttribute('position') as THREE.BufferAttribute;
    const col = this.dripGeo.getAttribute('color') as THREE.BufferAttribute;
    const p = pos.array as Float32Array;
    const c = col.array as Float32Array;
    let o = 0;
    const quad = (a: number[], b: number[], cc: number[], d: number[]): void => {
      for (const v of [a, b, cc, a, cc, d]) {
        p[o++] = v[0]!;
        p[o++] = v[1]!;
        p[o++] = v[2]!;
      }
    };
    for (const [i, d] of this.drips.entries()) {
      const t = ((time / d.period + d.phase) % 1) * d.period;
      const drop = Math.max(0.1, d.y - d.floor);
      const fall = Math.sqrt((2 * drop) / GRAVITY);
      const w = 0.018;
      if (t < fall) {
        const y1 = d.y - 0.5 * GRAVITY * t * t;
        const y0 = Math.max(d.floor, y1 - DROP_LENGTH * Math.min(1, t / 0.15));
        quad([d.x - w, y0, d.z], [d.x + w, y0, d.z], [d.x + w, y1, d.z], [d.x - w, y1, d.z]);
        quad([d.x, y0, d.z - w], [d.x, y0, d.z + w], [d.x, y1, d.z + w], [d.x, y1, d.z - w]);
      } else {
        p.fill(0, o, o + 36);
        o += 36;
      }
      const s = (t - fall) / SPLASH_SECONDS;
      if (s >= 0 && s < 1) {
        const r = 0.04 + s * 0.16;
        const f = d.floor + 0.03;
        quad([d.x - r, f, d.z - r], [d.x - r, f, d.z + r], [d.x + r, f, d.z + r], [d.x + r, f, d.z - r]);
      } else {
        p.fill(0, o, o + 18);
        o += 18;
      }
      // Drops catch whatever light there is.
      const l = this.baker.lightAt(d.x, d.floor + 1, d.z);
      const fade = s >= 0 && s < 1 ? 1 - s : 1;
      for (let v = 0; v < 18; v++) {
        const k = v < 12 ? 1 : fade * 0.7;
        for (let ch = 0; ch < 3; ch++) c[(i * 18 + v) * 3 + ch] = Math.min(1.1, 0.08 + l[ch]! * 0.8) * DROP_COLOUR[ch]! * k;
      }
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }
}
