import * as THREE from 'three';
import { CELL_SIZE, Cell, FLOOR_STYLES, NO_ZONE, WALL_STYLES, propDef, type CompiledMap, type FloorStyle, type WallStyle } from '@zh/shared';
import { PROP_BUILDERS, Kit, fixture } from '../models/props';
import type { PropOut } from '../models/props/kit';
import { Ambient } from './ambient';
import { Baker, Bucket, type RGB, type Vert } from './bake';
import { Doors } from './doors';
import { buildExterior } from './exterior';
import { glowMaterial, linear, propMaterial, setLightLevels, signMaterial, surfaceMaterial } from './materials';
import { signTexture } from './signs';

// Turns the compiled map into meshes: for each zone one per surface style for its cells and one
// for its props, so the renderer can leave out the zones that are not in
// view; a small group per door and one per moving part (ambient.ts). Lighting is baked (see bake.ts);
// the scene's only realtime light for the world is a white ambient that passes it through.

const S = CELL_SIZE;
const TEX_METRES = 2; // one texture repeat covers 2 m
/** Seconds for the lights to come up when the power is switched on. */
const POWER_UP_SECONDS = 1.6;

export interface World {
  group: THREE.Group;
  /** Set which doors are open (no animation), e.g. from a sync. */
  setDoors(open: Iterable<string>): void;
  /** Play a door opening. */
  openDoor(id: string): void;
  setPower(on: boolean, animate?: boolean): void;
  /** Advance door animations and the flickering lights. */
  update(dt: number, time: number): void;
  /** Baked light level at a point, for tinting dynamic models so they sit in the scene. */
  lightAt(x: number, y: number, z: number): [number, number, number];
  triangles: number;
  /** Parts that move by themselves (fans, flywheels, swinging lamps). */
  movers: number;
  /** Where water drips from the roof (for the sound of it). */
  drips: readonly (readonly [number, number, number])[];
}

const hash = (n: number): number => {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
};

export function buildWorld(map: CompiledMap): World {
  const { cols, rows } = map;
  const baker = new Baker(map);
  const buckets = new Map<string, Bucket>();
  const bucket = (key: string): Bucket => {
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = new Bucket()));
    return b;
  };
  const quad = (b: Bucket, v: [Vert, Vert, Vert, Vert], n: [number, number, number], cell: number, tint: RGB) => baker.quad(b, v, n, cell, tint);

  /** The zone a cell's surfaces are drawn with (window pockets and the like share one). */
  const zoneOf = (i: number): string => (map.zone[i] === NO_ZONE ? 'out' : map.zones[map.zone[i]!]!.id);
  const open = (cx: number, cz: number): boolean => map.kindAt(cx, cz) !== Cell.Solid;
  /** Corner AO: darker where a floor/ceiling corner touches solid, or (floors) furniture. */
  const cornerAo = (vx: number, vz: number, floor = false): number => {
    let solid = 0;
    let prop = 0;
    for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]] as const) {
      if (!open(vx + dx, vz + dz)) solid++;
      else if (floor && map.block[map.idx(vx + dx, vz + dz)]) prop++;
    }
    return (solid === 0 ? 1 : solid === 1 ? 0.78 : 0.6) * (prop === 0 ? 1 : prop < 4 ? 0.7 : 0.5);
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
      const zone = zoneOf(i);
      const wallB = bucket(`wall:${wallStyle}|${zone}`);
      const x0 = cx * S;
      const x1 = x0 + S;
      const z0 = cz * S;
      const z1 = z0 + S;
      const t = TEX_METRES;

      // Floor (a window's "floor" is the top of its sill, so it uses the wall surface)
      const floorB = kind === Cell.Window ? wallB : bucket(`floor:${floorStyle}|${zone}`);
      const F = (x: number, z: number, vx: number, vz: number): Vert => ({ p: [x, lo, z], uv: [x / t, z / t], ao: cornerAo(vx, vz, true) });
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
  const addMesh = (name: string, b: Bucket, mat: THREE.Material): void => {
    if (!b.pos.length) return;
    const mesh = new THREE.Mesh(b.toGeometry(), mat);
    mesh.name = name;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    triangles += b.triangles;
  };
  for (const [key, b] of buckets) {
    const [kind, style] = key.split('|')[0]!.split(':') as ['floor' | 'wall', FloorStyle | WallStyle];
    addMesh(key, b, surfaceMaterial(kind, style));
  }

  // Props and lamp fixtures, merged into three meshes a zone.
  const all: PropOut = { baker, prop: new Bucket(), glow: new Bucket(), sign: new Bucket(), movers: [], drips: [] };
  const outs = new Map<string, PropOut>();
  const outFor = (cell: number): PropOut => {
    const zone = zoneOf(cell);
    let o = outs.get(zone);
    if (!o) outs.set(zone, (o = { ...all, prop: new Bucket() }));
    return o;
  };
  const cellOf = (x: number, z: number): number => map.idx(Math.floor(x / S), Math.floor(z / S));
  for (const p of map.def.props) {
    const def = propDef(p.type);
    const build = (PROP_BUILDERS as Record<string, (k: Kit) => void>)[p.type];
    if (!def || !build) continue;
    // Wall-hung props are lit as part of the cell they face into.
    const a = ((p.rot ?? 0) * Math.PI) / 180;
    const cell = def.wall ? cellOf(p.x - Math.sin(a) * 0.25, p.z - Math.cos(a) * 0.25) : cellOf(p.x, p.z);
    build(Kit.at(outFor(cell), p, cell, map.hi[cell] || 3));
  }
  for (const l of baker.lights) {
    const cell = cellOf(l.x, l.z);
    fixture(Kit.at(outFor(cell), { type: 'light', x: l.x, z: l.z, rot: l.fixture === 'tube' ? Math.round(l.x + l.z) * 90 : 0 }, cell, map.sky[cell] ? l.y + 0.2 : map.hi[cell]!), l, l.rgb, l.mode);
  }
  for (const [zone, o] of outs) addMesh(`props|${zone}`, o.prop, propMaterial());
  // Lamps' glow and lettering are little: one mesh each for the whole map costs fewer draw calls than culling saves.
  addMesh('glow', all.glow, glowMaterial);
  addMesh('signs', all.sign, signMaterial(signTexture()));

  addMesh('exterior', buildExterior(map, baker), propMaterial());

  // Whatever moves by itself: fans, flywheels, swinging lamps, drips, mist.
  const ambient = new Ambient(map, baker, all.movers!, all.drips!);
  group.add(ambient.group);
  triangles += ambient.triangles;

  const doors = new Doors(map, baker);
  group.add(doors.group);
  triangles += doors.triangles;

  let power = false;
  let powerT = 0;
  setLightLevels(0, 1, 0);

  return {
    group,
    triangles,
    movers: ambient.movers,
    drips: all.drips!,
    lightAt: (x, y, z) => baker.lightAt(x, y, z),
    setDoors: (open) => {
      const want = new Set(open);
      for (const o of map.def.openings) if (o.kind === 'door') doors.set(o.id, want.has(o.id));
    },
    openDoor: (id) => doors.set(id, true, true),
    setPower: (on, animate = false) => {
      power = on;
      if (!animate || !on) powerT = on ? 1 : 0;
    },
    update: (dt, time) => {
      doors.update(dt);
      if (power && powerT < 1) powerT = Math.min(1, powerT + dt / POWER_UP_SECONDS);
      // Coming on, the mains stutter before they hold.
      const level = powerT >= 1 || !power ? powerT : hash(Math.floor(time * 18)) < powerT ? 0.3 + 0.7 * powerT : 0.05;
      const fire = 0.8 + 0.1 * Math.sin(time * 9.1) + 0.07 * Math.sin(time * 23.7 + 1) + 0.05 * Math.sin(time * 3.3 + 2);
      // A failing tube: mostly steady, with bursts of stutter.
      const burst = Math.sin(time * 0.9) + Math.sin(time * 0.37 + 1) > 0.6;
      const tube = level * (burst && hash(Math.floor(time * 16) + 0.5) < 0.45 ? 0.12 : 0.92 + 0.08 * Math.sin(time * 50));
      setLightLevels(level, fire, tube);
      ambient.update(dt, time, power);
    },
  };
}
