import * as THREE from 'three';
import {
  CELL_SIZE, Cell, DOOR_HEIGHT, FLOOR_STYLES, NO_ZONE, WALL_STYLES, lineOfSight,
  type CompiledMap, type FloorStyle, type WallStyle,
} from '@zh/shared';
import { PALETTE, emissiveMaterial, linear, surfaceMaterial } from './materials';

// All world lighting is baked into vertex colours here: zone ambient + light pools (with grid
// line-of-sight so light doesn't leak through walls) + fake ambient occlusion. The scene's only
// realtime light for the world is a white ambient that passes the baked colour through.

const S = CELL_SIZE;
const TEX_METRES = 2; // one texture repeat covers 2 m
const AMBIENT_GAIN = 2.6;
const LIGHT_GAIN = 2.4;
const OUTDOOR_AMBIENT = 0x1c2638;

type RGB = [number, number, number];

class Bucket {
  pos: number[] = [];
  col: number[] = [];
  uv: number[] = [];

  toGeometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals();
    return g;
  }
}

interface Vert {
  p: [number, number, number];
  uv: [number, number];
  ao: number;
}

export interface World {
  group: THREE.Group;
  setDoorOpen(id: string, open: boolean): void;
  /** Baked light level at a point, for tinting dynamic models so they sit in the scene. */
  lightAt(x: number, y: number, z: number): [number, number, number];
  triangles: number;
}

export function buildWorld(map: CompiledMap): World {
  const { cols, rows } = map;
  const lights = map.def.lights.map((l) => ({ ...l, rgb: linear(l.color) }));

  // Which lights can reach each open cell.
  const cellLights: number[][] = new Array(cols * rows);
  for (let cz = 0; cz < rows; cz++) {
    for (let cx = 0; cx < cols; cx++) {
      const i = map.idx(cx, cz);
      if (map.kind[i] === Cell.Solid) continue;
      const x = (cx + 0.5) * S;
      const z = (cz + 0.5) * S;
      const list: number[] = [];
      lights.forEach((l, li) => {
        if (Math.hypot(l.x - x, l.z - z) < l.radius + 1 && lineOfSight(map, l.x, l.z, x, z, 'all')) list.push(li);
      });
      cellLights[i] = list;
    }
  }

  const ambientOf = (i: number): RGB => {
    const zi = map.zone[i]!;
    const a = linear(zi === NO_ZONE ? OUTDOOR_AMBIENT : map.zones[zi]!.ambient);
    return [a[0] * AMBIENT_GAIN, a[1] * AMBIENT_GAIN, a[2] * AMBIENT_GAIN];
  };

  /** Baked colour for a vertex at p with face normal n, belonging to cell i. */
  const shade = (p: [number, number, number], n: [number, number, number], i: number, tint: RGB, ao: number): RGB => {
    const amb = ambientOf(i);
    const face = n[1] > 0.5 ? 1 : n[1] < -0.5 ? 0.7 : Math.abs(n[0]) > 0.5 ? 0.92 : 0.8;
    let r = amb[0] * face;
    let g = amb[1] * face;
    let b = amb[2] * face;
    for (const li of cellLights[i] ?? []) {
      const l = lights[li]!;
      const dx = l.x - p[0];
      const dy = l.y - p[1];
      const dz = l.z - p[2];
      const d = Math.hypot(dx, dy, dz);
      if (d >= l.radius) continue;
      const att = (1 - d / l.radius) ** 2 / (1 + (d * d) / 6);
      const ndl = d > 1e-4 ? Math.max(0, (n[0] * dx + n[1] * dy + n[2] * dz) / d) : 1;
      const k = att * (0.3 + 0.7 * ndl) * l.intensity * LIGHT_GAIN;
      r += l.rgb[0] * k;
      g += l.rgb[1] * k;
      b += l.rgb[2] * k;
    }
    return [r * tint[0] * ao, g * tint[1] * ao, b * tint[2] * ao];
  };

  const buckets = new Map<string, Bucket>();
  const bucket = (key: string): Bucket => {
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = new Bucket()));
    return b;
  };

  /** Emit a quad (CCW seen from the front) with baked colours. */
  const quad = (b: Bucket, v: [Vert, Vert, Vert, Vert], n: [number, number, number], cell: number, tint: RGB) => {
    const c = v.map((q) => shade(q.p, n, cell, tint, q.ao));
    for (const k of [0, 1, 2, 0, 2, 3]) {
      b.pos.push(...v[k]!.p);
      b.col.push(...c[k]!);
      b.uv.push(...v[k]!.uv);
    }
  };

  /** Axis-aligned box with baked colours; used for door slabs now and props later. */
  const box = (b: Bucket, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, cell: number, tint: RGB) => {
    const t = TEX_METRES;
    const V = (x: number, y: number, z: number, u: number, w: number): Vert => ({ p: [x, y, z], uv: [u / t, w / t], ao: y <= 0.01 ? 0.7 : 1 });
    quad(b, [V(x0, y1, z0, x0, z0), V(x0, y1, z1, x0, z1), V(x1, y1, z1, x1, z1), V(x1, y1, z0, x1, z0)], [0, 1, 0], cell, tint);
    quad(b, [V(x0, y0, z1, x0, y0), V(x1, y0, z1, x1, y0), V(x1, y1, z1, x1, y1), V(x0, y1, z1, x0, y1)], [0, 0, 1], cell, tint);
    quad(b, [V(x1, y0, z0, x1, y0), V(x0, y0, z0, x0, y0), V(x0, y1, z0, x0, y1), V(x1, y1, z0, x1, y1)], [0, 0, -1], cell, tint);
    quad(b, [V(x1, y0, z1, z1, y0), V(x1, y0, z0, z0, y0), V(x1, y1, z0, z0, y1), V(x1, y1, z1, z1, y1)], [1, 0, 0], cell, tint);
    quad(b, [V(x0, y0, z0, z0, y0), V(x0, y0, z1, z1, y0), V(x0, y1, z1, z1, y1), V(x0, y1, z0, z0, y1)], [-1, 0, 0], cell, tint);
  };

  const open = (cx: number, cz: number): boolean => map.kindAt(cx, cz) !== Cell.Solid;
  /** Corner AO: darker where a floor/ceiling corner touches solid. */
  const cornerAo = (vx: number, vz: number): number => {
    let solid = 0;
    for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]] as const) if (!open(vx + dx, vz + dz)) solid++;
    return solid === 0 ? 1 : solid === 1 ? 0.78 : 0.6;
  };

  // Neighbour directions with the shared edge listed left->right as seen from inside the cell.
  const SIDES = [
    { dx: 1, dz: 0, n: [-1, 0, 0], edge: (cx: number, cz: number) => [(cx + 1) * S, cz * S, (cx + 1) * S, (cz + 1) * S] },
    { dx: -1, dz: 0, n: [1, 0, 0], edge: (cx: number, cz: number) => [cx * S, (cz + 1) * S, cx * S, cz * S] },
    { dx: 0, dz: -1, n: [0, 0, 1], edge: (cx: number, cz: number) => [cx * S, cz * S, (cx + 1) * S, cz * S] },
    { dx: 0, dz: 1, n: [0, 0, -1], edge: (cx: number, cz: number) => [(cx + 1) * S, (cz + 1) * S, cx * S, (cz + 1) * S] },
  ] as const;

  let triangles = 0;
  for (let cz = 0; cz < rows; cz++) {
    for (let cx = 0; cx < cols; cx++) {
      const i = map.idx(cx, cz);
      const kind = map.kind[i] as Cell;
      if (kind === Cell.Solid) continue;
      const lo = map.lo[i]!;
      const hi = map.hi[i]!;
      const tint = linear(map.tint[i]!);
      const wallStyle = WALL_STYLES[map.wallStyle[i]!] as WallStyle;
      const floorStyle = FLOOR_STYLES[map.floorStyle[i]!] as FloorStyle;
      const wallB = bucket(`wall:${wallStyle}`);
      const x0 = cx * S;
      const x1 = x0 + S;
      const z0 = cz * S;
      const z1 = z0 + S;
      const t = TEX_METRES;

      // Floor (a window's "floor" is the top of its sill, so it uses the wall surface)
      const floorB = kind === Cell.Window ? wallB : bucket(`floor:${floorStyle}`);
      const F = (x: number, z: number, vx: number, vz: number): Vert => ({ p: [x, lo, z], uv: [x / t, z / t], ao: cornerAo(vx, vz) });
      quad(floorB, [F(x0, z0, cx, cz), F(x0, z1, cx, cz + 1), F(x1, z1, cx + 1, cz + 1), F(x1, z0, cx + 1, cz)], [0, 1, 0], i, tint);

      // Ceiling
      if (!map.sky[i]) {
        const C = (x: number, z: number, vx: number, vz: number): Vert => ({ p: [x, hi, z], uv: [x / t, z / t], ao: 0.55 + 0.45 * cornerAo(vx, vz) });
        quad(wallB, [C(x0, z0, cx, cz), C(x1, z0, cx + 1, cz), C(x1, z1, cx + 1, cz + 1), C(x0, z1, cx, cz + 1)], [0, -1, 0], i, tint);
      }

      // Walls: wherever this cell's open interval is not matched by the neighbour's.
      for (const side of SIDES) {
        const nx = cx + side.dx;
        const nz = cz + side.dz;
        const nk = map.kindAt(nx, nz);
        const j = map.idx(nx, nz);
        const nlo = nk === Cell.Solid ? Infinity : map.lo[j]!;
        const nhi = nk === Cell.Solid ? -Infinity : map.hi[j]!;
        const spans: [number, number][] = [];
        if (nk === Cell.Solid) spans.push([lo, hi]);
        else {
          if (nlo > lo) spans.push([lo, Math.min(hi, nlo)]);
          if (nhi < hi) spans.push([Math.max(lo, nhi), hi]);
        }
        const [ax, az, bx, bz] = side.edge(cx, cz);
        const u0 = (side.dx !== 0 ? az : ax) / t;
        const u1 = (side.dx !== 0 ? bz : bx) / t;
        const sky = !!map.sky[i];
        const aoAt = (y: number) => (y < 0.6 ? 0.6 + (y / 0.6) * 0.4 : !sky && y > hi - 0.5 ? 1 - ((y - (hi - 0.5)) / 0.5) * 0.25 : 1);
        for (const [s0, s1] of spans) {
          if (s1 - s0 < 1e-4) continue;
          // Split at the AO breakpoints so the gradients interpolate correctly.
          const ys = [s0, ...[0.6, hi - 0.5].filter((y) => y > s0 + 1e-4 && y < s1 - 1e-4), s1].sort((a, b) => a - b);
          for (let k = 0; k + 1 < ys.length; k++) {
            const y0 = ys[k]!;
            const y1 = ys[k + 1]!;
            const W = (x: number, y: number, z: number, u: number): Vert => ({ p: [x, y, z], uv: [u, y / t], ao: aoAt(y) });
            quad(wallB, [W(ax, y0, az, u0), W(bx, y0, bz, u1), W(bx, y1, bz, u1), W(ax, y1, az, u0)], side.n as unknown as [number, number, number], i, tint);
          }
        }
      }
    }
  }

  const group = new THREE.Group();
  group.name = 'world';
  for (const [key, b] of buckets) {
    const [kind, style] = key.split(':') as ['floor' | 'wall', FloorStyle | WallStyle];
    const mesh = new THREE.Mesh(b.toGeometry(), surfaceMaterial(kind, style));
    mesh.name = key;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    triangles += b.pos.length / 9;
  }

  // Lamp fixtures: small glowing boxes so each light pool has a visible source.
  const lampPos: number[] = [];
  const lampCol: number[] = [];
  for (const l of lights) {
    const geo = new THREE.BoxGeometry(0.5, 0.1, 0.5).toNonIndexed();
    geo.translate(l.x, l.y, l.z);
    const p = geo.getAttribute('position');
    const glow = linear(PALETTE.lampGlow);
    for (let v = 0; v < p.count; v++) {
      lampPos.push(p.getX(v), p.getY(v), p.getZ(v));
      lampCol.push(l.rgb[0] * 1.6 + glow[0] * 0.4, l.rgb[1] * 1.6 + glow[1] * 0.4, l.rgb[2] * 1.6 + glow[2] * 0.4);
    }
  }
  const lampGeo = new THREE.BufferGeometry();
  lampGeo.setAttribute('position', new THREE.Float32BufferAttribute(lampPos, 3));
  lampGeo.setAttribute('color', new THREE.Float32BufferAttribute(lampCol, 3));
  const lamps = new THREE.Mesh(lampGeo, emissiveMaterial);
  lamps.name = 'lamps';
  group.add(lamps);

  // Door slabs: one mesh per door so they can be hidden when opened.
  const doors = new Map<string, THREE.Object3D>();
  for (const o of map.def.openings) {
    if (o.kind !== 'door') continue;
    const b = new Bucket();
    const alongX = o.w > o.d;
    const cell = map.idx(Math.floor(o.x / S), Math.floor(o.z / S));
    const slab = linear(o.needsPower ? 0x6a5a9a : PALETTE.rust);
    const bar = linear(PALETTE.hazard);
    const inset = 0.15;
    if (alongX) {
      box(b, o.x, 0, o.z + inset, o.x + o.w, DOOR_HEIGHT, o.z + o.d - inset, cell, slab);
      box(b, o.x, 1.0, o.z + inset - 0.04, o.x + o.w, 1.25, o.z + o.d - inset + 0.04, cell, bar);
    } else {
      box(b, o.x + inset, 0, o.z, o.x + o.w - inset, DOOR_HEIGHT, o.z + o.d, cell, slab);
      box(b, o.x + inset - 0.04, 1.0, o.z, o.x + o.w - inset + 0.04, 1.25, o.z + o.d, cell, bar);
    }
    const mesh = new THREE.Mesh(b.toGeometry(), surfaceMaterial('wall', 'metal'));
    mesh.name = `door:${o.id}`;
    doors.set(o.id, mesh);
    group.add(mesh);
    triangles += b.pos.length / 9;
  }

  const lightAt = (x: number, y: number, z: number): RGB => {
    const cx = Math.floor(x / S);
    const cz = Math.floor(z / S);
    if (map.kindAt(cx, cz) === Cell.Solid) return [0.25, 0.25, 0.3];
    const i = map.idx(cx, cz);
    const c = ambientOf(i);
    for (const li of cellLights[i] ?? []) {
      const l = lights[li]!;
      const d = Math.hypot(l.x - x, l.y - y, l.z - z);
      if (d >= l.radius) continue;
      const k = ((1 - d / l.radius) ** 2 / (1 + (d * d) / 6)) * 0.8 * l.intensity * LIGHT_GAIN;
      c[0] += l.rgb[0] * k;
      c[1] += l.rgb[1] * k;
      c[2] += l.rgb[2] * k;
    }
    return c;
  };

  return {
    group,
    triangles,
    lightAt,
    setDoorOpen: (id, isOpen) => {
      const d = doors.get(id);
      if (d) d.visible = !isOpen;
    },
  };
}
