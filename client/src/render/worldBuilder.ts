import * as THREE from 'three';
import { CELL_SIZE, Cell, DECK, FLOOR_STYLES, NO_ZONE, WALL_STYLES, WINDOW_SILL, massing, propDef, type CompiledMap, type FloorStyle, type WallStyle } from '@zh/shared';
import { PROP_BUILDERS, Kit, fixture } from '../models/props';
import type { PropOut } from '../models/props/kit';
import { Ambient } from './ambient';
import { Baker, Bucket, type RGB, type Vert } from './bake';
import { buildCity } from './city';
import { Doors } from './doors';
import { buildExterior } from './exterior';
import { glowMaterial, linear, propMaterial, setLightLevels, signMaterial, surfaceMaterial } from './materials';
import { signTexture } from './signs';
import { buildTowers } from './towers';

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
  const { cols } = map;
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
  /** Is there open space beside a floor at height `y`: something to stand in, or a window to look through? */
  const open = (cx: number, cz: number, y: number): boolean => map.holdAt(cx, cz, y + 0.5) >= 0 || map.holdAt(cx, cz, y + 1.2) >= 0;
  /** Corner AO: darker where a floor/ceiling corner touches solid (or a ledge), or (floors) furniture. */
  const cornerAo = (vx: number, vz: number, y: number, floor = false): number => {
    let solid = 0;
    let prop = 0;
    for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]] as const) {
      if (!open(vx + dx, vz + dz, y)) solid++;
      else if (floor) {
        const j = map.standAt(vx + dx, vz + dz, y);
        if (j >= 0 && map.block[j]) prop++;
      }
    }
    return (solid === 0 ? 1 : solid === 1 ? 0.78 : 0.6) * (prop === 0 ? 1 : prop < 4 ? 0.7 : 0.5);
  };
  /** Height of a cell's drawn floor at a point on its edge (a window's is the top of its sill). */
  const floorAt = (i: number, x: number, z: number): number => (map.kind[i] === Cell.Window ? map.lo[i]! : map.groundIn(i, x, z));

  // Neighbour directions with the shared edge listed left->right as seen from inside the cell.
  const SIDES = [
    { dx: 1, dz: 0, n: [-1, 0, 0], edge: (cx: number, cz: number) => [(cx + 1) * S, cz * S, (cx + 1) * S, (cz + 1) * S] },
    { dx: -1, dz: 0, n: [1, 0, 0], edge: (cx: number, cz: number) => [cx * S, (cz + 1) * S, cx * S, cz * S] },
    { dx: 0, dz: -1, n: [0, 0, 1], edge: (cx: number, cz: number) => [cx * S, cz * S, (cx + 1) * S, cz * S] },
    { dx: 0, dz: 1, n: [0, 0, -1], edge: (cx: number, cz: number) => [(cx + 1) * S, (cz + 1) * S, cx * S, (cz + 1) * S] },
  ] as const;
  /** A face lower than this is a step or a kerb: it is drawn as floor, not as wall. */
  const STEP_FACE = 0.35;
  /** In a city the solid has a height: a wall stops where the building behind it does. */
  const mass = massing(map);

  let triangles = 0;
  for (let i = 0; i < map.kind.length; i++) {
    const kind = map.kind[i] as Cell;
    if (kind === Cell.Solid) continue;
    {
      const cx = map.cxOf(i);
      const cz = map.czOf(i);
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

      // Floor (a window's "floor" is the top of its sill, so it uses the wall surface). A ramp's slopes.
      const floorB = kind === Cell.Window ? wallB : bucket(`floor:${floorStyle}|${zone}`);
      const F = (x: number, z: number, vx: number, vz: number): Vert => ({ p: [x, floorAt(i, x, z), z], uv: [x / t, z / t], ao: cornerAo(vx, vz, lo, true) });
      quad(floorB, [F(x0, z0, cx, cz), F(x0, z1, cx, cz + 1), F(x1, z1, cx + 1, cz + 1), F(x1, z0, cx + 1, cz)], [0, 1, 0], i, tint);

      // Ceiling
      if (!map.sky[i]) {
        const C = (x: number, z: number, vx: number, vz: number): Vert => ({ p: [x, hi, z], uv: [x / t, z / t], ao: 0.55 + 0.45 * cornerAo(vx, vz, lo) });
        quad(wallB, [C(x0, z0, cx, cz), C(x1, z0, cx + 1, cz), C(x1, z1, cx + 1, cz + 1), C(x0, z1, cx, cz + 1)], [0, -1, 0], i, tint);
      }

      // A floor that hangs in the air (a bridge over a street, a ledge outside a window) has an
      // underside, and an edge wherever there is air beside it.
      const hangs = map.deck[i] === 1 && kind !== Cell.Window;
      if (hangs) {
        const y0 = lo - DECK;
        let under = i;
        for (let j = i - map.plane; j >= 0; j -= map.plane) {
          if (map.kind[j] === Cell.Solid) continue;
          under = j;
          break;
        }
        const U = (x: number, z: number): Vert => ({ p: [x, y0, z], uv: [x / t, z / t], ao: 0.7 });
        quad(floorB, [U(x0, z0), U(x1, z0), U(x1, z1), U(x0, z1)], [0, -1, 0], under, tint);
        for (const side of SIDES) {
          const [nx, nz] = [cx + side.dx, cz + side.dz];
          if (map.holdAt(nx, nz, lo - DECK / 2) < 0 && !map.aloft(nx, nz, lo - DECK / 2)) continue;
          const [ax, az, bx, bz] = side.edge(cx, cz);
          const E = (x: number, y: number, z: number): Vert => ({ p: [x, y, z], uv: [(x + z) / t, y / t], ao: 0.85 });
          quad(floorB, [E(bx, y0, bz), E(ax, y0, az), E(ax, lo, az), E(bx, lo, bz)], [-side.n[0], 0, -side.n[2]], i, tint);
        }
      }

      // Walls: wherever this cell's open interval is not matched by anything open in the column
      // beside it (this one rule yields walls, lintels, sills, stair risers, the faces of ledges
      // and the edges of the slabs between storeys).
      for (const side of SIDES) {
        const nx = cx + side.dx;
        const nz = cz + side.dz;
        const [ax, az, bx, bz] = side.edge(cx, cz);
        // My own floor along this edge: the wall starts at its lower end (the rest is under the slope).
        const bottom = Math.min(floorAt(i, ax, az), floorAt(i, bx, bz));
        let spans: [number, number][] = [[bottom, hi]];
        /** Sloping floors next door: the triangle between a ramp's low end and its surface. */
        const skirts: [number, number, number][] = [];
        if (map.inBounds(nx, nz)) {
          for (let j = nz * cols + nx; j < map.kind.length; j += map.plane) {
            if (map.kind[j] === Cell.Solid) continue;
            const na = floorAt(j, ax, az);
            const nb = floorAt(j, bx, bz);
            const nlo = Math.min(na, nb);
            // (Open sky has no top: a roof's edge over a street is a drop, not a wall.)
            const nhi = map.cap[j]!;
            if (na !== nb && nlo >= bottom - 1e-4 && Math.max(na, nb) <= hi + 1e-4) skirts.push([nlo, na, nb]);
            const next: [number, number][] = [];
            for (const [s0, s1] of spans) {
              if (nhi <= s0 || nlo >= s1) next.push([s0, s1]);
              else {
                if (nlo > s0) next.push([s0, nlo]);
                if (nhi < s1) next.push([nhi, s1]);
              }
            }
            spans = next;
          }
          const col = nz * cols + nx;
          // (What hangs over a street has the building's own wall behind it, drawn from the street up: city.ts.)
          if (mass && !mass.open[col]) spans = hangs && mass.open[i % map.plane] ? [] : spans.filter(([s0]) => s0 < mass.top[col]!).map(([s0, s1]) => [s0, Math.min(s1, mass.top[col]!)]);
        }
        const u0 = (side.dx !== 0 ? az : ax) / t;
        const u1 = (side.dx !== 0 ? bz : bx) / t;
        const sky = !!map.sky[i];
        const aoAt = (y: number) => (y - lo < 0.6 ? 0.6 + (Math.max(0, y - lo) / 0.6) * 0.4 : !sky && y > hi - 0.5 ? 1 - ((y - (hi - 0.5)) / 0.5) * 0.25 : 1);
        const W = (x: number, y: number, z: number, u: number): Vert => ({ p: [x, y, z], uv: [u, y / t], ao: aoAt(y) });
        const n = side.n as unknown as [number, number, number];
        for (const [s0, s1] of spans) {
          if (s1 - s0 < 1e-4) continue;
          const into = s1 - s0 < STEP_FACE && s0 - bottom < 1e-4 && kind !== Cell.Window ? floorB : wallB;
          // Split at the AO breakpoints so the gradients interpolate correctly.
          const ys = [s0, ...[lo + 0.6, hi - 0.5].filter((y) => y > s0 + 1e-4 && y < s1 - 1e-4), s1].sort((a, b) => a - b);
          for (let k = 0; k + 1 < ys.length; k++) {
            const y0 = ys[k]!;
            const y1 = ys[k + 1]!;
            quad(into, [W(ax, y0, az, u0), W(bx, y0, bz, u1), W(bx, y1, bz, u1), W(ax, y1, az, u0)], n, i, tint);
          }
        }
        for (const [y0, ya, yb] of skirts) quad(wallB, [W(ax, y0, az, u0), W(bx, y0, bz, u1), W(bx, yb, bz, u1), W(ax, ya, az, u0)], n, i, tint);
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
  // Props and lamp fixtures, merged into three meshes a zone.
  const all: PropOut = { baker, prop: new Bucket(), glow: new Bucket(), sign: new Bucket(), movers: [], drips: [] };

  // What stands outside the walls. A station's huts and pines are a mesh of their own; a city's
  // buildings go on in the street's own surfaces.
  const city = map.def.scene.built === 'city';
  const exterior = city ? new Bucket() : buildExterior(map, baker);
  if (city) buildCity(map, baker, { surface: (kind, style) => bucket(`${kind}:${style}|out`), prop: exterior, glow: all.glow });

  for (const [key, b] of buckets) {
    const [kind, style] = key.split('|')[0]!.split(':') as ['floor' | 'wall', FloorStyle | WallStyle];
    addMesh(key, b, surfaceMaterial(kind, style));
  }
  const outs = new Map<string, PropOut>();
  const outFor = (cell: number): PropOut => {
    const zone = zoneOf(cell);
    let o = outs.get(zone);
    if (!o) outs.set(zone, (o = { ...all, prop: new Bucket() }));
    return o;
  };
  for (const p of map.def.props) {
    const layer = Math.max(0, map.layerOf(p.level ?? 0));
    const cellOf = (x: number, z: number): number => map.idx(Math.floor(x / S), Math.floor(z / S), layer);
    const def = propDef(p.type);
    const build = (PROP_BUILDERS as Record<string, (k: Kit) => void>)[p.type];
    if (!def || !build) continue;
    // Wall-hung props are lit as part of the cell they face into.
    const a = ((p.rot ?? 0) * Math.PI) / 180;
    const cell = def.wall ? cellOf(p.x - Math.sin(a) * 0.25, p.z - Math.cos(a) * 0.25) : cellOf(p.x, p.z);
    // It stands on its cell's floor (on a ramp, where the slope is under its middle); wall-hung ones hang over it.
    const open = map.kind[cell] !== Cell.Solid;
    const base = !open ? map.levels[layer]!.y : map.kind[cell] === Cell.Window ? map.lo[cell]! - WINDOW_SILL : def.wall ? map.lo[cell]! : map.groundIn(cell, p.x, p.z);
    build(Kit.at(outFor(cell), p, cell, open ? map.hi[cell]! - base : 3, base));
  }
  for (const l of baker.lights) {
    // Lamps are placed, like everything in a prop's own space, from the floor they hang over.
    const held = map.holdAt(Math.floor(l.x / S), Math.floor(l.z / S), l.y);
    const cell = held >= 0 ? held : map.idx(Math.floor(l.x / S), Math.floor(l.z / S), Math.max(0, map.layerOf(l.level ?? 0)));
    const base = l.floor;
    const top = map.sky[cell] ? l.y + 0.2 : map.hi[cell]!;
    fixture(Kit.at(outFor(cell), { type: 'light', x: l.x, z: l.z, rot: l.fixture === 'tube' ? Math.round(l.x + l.z) * 90 : 0 }, cell, top - base, base), { ...l, y: l.y - base }, l.rgb, l.mode);
  }
  for (const [zone, o] of outs) addMesh(`props|${zone}`, o.prop, propMaterial());
  // Lamps' glow and lettering are little: one mesh each for the whole map costs fewer draw calls than culling saves.
  addMesh('glow', all.glow, glowMaterial);
  addMesh('signs', all.sign, signMaterial(signTexture()));

  addMesh('exterior', exterior, propMaterial());
  const towers = buildTowers(map);
  if (towers) {
    group.add(towers);
    triangles += towers.geometry.getAttribute('position').count / 3;
  }

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
