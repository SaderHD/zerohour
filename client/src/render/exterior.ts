import { CELL_SIZE, Cell, Rng, type CompiledMap, type Room } from '@zh/shared';
import { Bucket, type Baker, type RGB, type Vert } from './bake';
import { linear } from './materials';

// What stands outside the walls, so that looking over the yard fence or up out of a window shows
// a station and not a void: a roof over every building, their chimneys, and the pines beyond the
// wire. Nobody can get there; it is one mesh, lit as part of the yard so the floodlights reach it.

type V3 = [number, number, number];

/** How far a building's shell stands out from its room: the thickness of the walls. */
const WALL = 0.5;
/** No shell wall starts lower than this unless open ground beside it does. */
const YARD_WALL = 3.5;
const SNOW = 0xd0dcec;
/** What a building is clad in outside, by the walls it has inside. */
const CLADDING: Partial<Record<Room['wall'], number>> = { panel: 0x5a4c3e, plaster: 0x5a4c3e, block: 0x62646a, metal: 0x4c565e };
/** Props with a fire or an engine under them get a stack on the roof. */
const STACKS: Record<string, number> = { generator: 0.3, potbelly: 0.18, range: 0.2, boiler: 0.16 };
const TREE_MARGIN = 10;
/** Pines stand one to a square of this size, where they stand at all. */
const TREE_GRID = 4.5;
const TREE_CLEARANCE = 2.5;
/** Within this of the yard the wood is at its full thickness. */
const TREE_NEAR = 20;

export function buildExterior(map: CompiledMap, baker: Baker): Bucket {
  const b = new Bucket();
  const yard = map.def.rooms.find((r) => r.outdoor);
  if (!yard) return b;
  const lit = map.idx(Math.floor((yard.x + yard.w / 2) / CELL_SIZE), Math.floor((yard.z + yard.d / 2) / CELL_SIZE));

  const quad = (p: [V3, V3, V3, V3], n: V3, colour: RGB): void => {
    const v = p.map((q): Vert => ({ p: q, uv: [(q[0] + q[2]) / 2, (q[1] + q[2] * 0.5) / 2], ao: 1 })) as [Vert, Vert, Vert, Vert];
    baker.quad(b, v, n, lit, colour);
  };
  /** An upright box from y0 to y1; `top` is its lid colour (none when a roof covers it). */
  const box = (x0: number, z0: number, x1: number, z1: number, y0: [number, number, number, number], y1: number, side: RGB, top?: RGB): void => {
    const [n, s, e, w] = y0;
    quad([[x1, n, z0], [x0, n, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], side);
    quad([[x0, s, z1], [x1, s, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], side);
    quad([[x1, e, z1], [x1, e, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], side);
    quad([[x0, w, z0], [x0, w, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], side);
    if (top) quad([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [0, 1, 0], top);
  };

  /** Where a shell wall may start: the top of the lowest open ground just outside it, else the floor. */
  const startOf = (cx0: number, cz0: number, cx1: number, cz1: number): number => {
    let lo = Infinity;
    for (let cz = cz0; cz < cz1; cz++) {
      for (let cx = cx0; cx < cx1; cx++) {
        // The top of whatever is open highest in this column.
        let top = -Infinity;
        for (let layer = 0; layer < map.layers; layer++) if (map.kindAt(cx, cz, layer) !== Cell.Solid) top = Math.max(top, map.hi[map.idx(cx, cz, layer)]!);
        if (top > -Infinity) lo = Math.min(lo, top);
      }
    }
    return lo === Infinity ? 0 : lo;
  };
  const cell = (v: number): number => Math.round(v / CELL_SIZE);

  const rng = new Rng(9009);
  /** Each building's footprint, with the height of its roof at a point. */
  const roofs: { x0: number; z0: number; x1: number; z1: number; at: (x: number, z: number) => number }[] = [];
  for (const room of map.def.rooms) {
    const clad = CLADDING[room.wall];
    if (room.outdoor || clad === undefined) continue;
    // A building is roofed over its top storey: nothing for a cellar, nor for a room with another over it.
    const floor = map.levels[Math.max(0, map.layerOf(room.level ?? 0))]!.y + (room.y ?? 0);
    const top = floor + room.ceil;
    const under = map.def.rooms.some((r) => (r.level ?? 0) > (room.level ?? 0) && !r.outdoor && r.x < room.x + room.w && r.x + r.w > room.x && r.z < room.z + room.d && r.z + r.d > room.z);
    if (top < 1 || under) continue;
    const [x0, z0, x1, z1] = [room.x - WALL, room.z - WALL, room.x + room.w + WALL, room.z + room.d + WALL];
    const side = linear(clad).map((c) => c * rng.range(0.9, 1.1)) as RGB;
    const snow = linear(SNOW).map((c) => c * rng.range(0.92, 1.04)) as RGB;
    const eave = Math.max(YARD_WALL, top) + 0.25;
    const [cx0, cz0, cx1, cz1] = [cell(x0), cell(z0), cell(x1), cell(z1)];
    const starts: [number, number, number, number] = [
      startOf(cx0, cz0 - 1, cx1, cz0), startOf(cx0, cz1, cx1, cz1 + 1), startOf(cx1, cz0, cx1 + 1, cz1), startOf(cx0 - 1, cz0, cx0, cz1),
    ];
    const gable = room.wall === 'panel' || room.wall === 'plaster';
    if (!gable) {
      // A flat roof behind a parapet, the snow lying a little below its lip.
      box(x0, z0, x1, z1, starts, eave + 0.35, side, side);
      box(x0 + 0.3, z0 + 0.3, x1 - 0.3, z1 - 0.3, [eave, eave, eave, eave], eave + 0.42, snow, snow);
      roofs.push({ x0, z0, x1, z1, at: () => eave + 0.42 });
      continue;
    }
    // A pitched roof, ridge along the longer side, eaves overhanging.
    box(x0, z0, x1, z1, starts, eave, side);
    const alongX = room.w >= room.d;
    const rise = Math.min(room.w, room.d) * 0.24;
    const ridge = eave + rise;
    const o = 0.3;
    if (alongX) {
      const zm = (z0 + z1) / 2;
      const ny = (z1 - z0) / 2;
      quad([[x0 - o, eave - 0.1, z0 - o], [x0 - o, ridge, zm], [x1 + o, ridge, zm], [x1 + o, eave - 0.1, z0 - o]], [0, ny, -rise], snow);
      quad([[x0 - o, ridge, zm], [x0 - o, eave - 0.1, z1 + o], [x1 + o, eave - 0.1, z1 + o], [x1 + o, ridge, zm]], [0, ny, rise], snow);
      quad([[x0, eave, z1], [x0, eave, z0], [x0, ridge, zm], [x0, ridge, zm]], [-1, 0, 0], side);
      quad([[x1, eave, z0], [x1, eave, z1], [x1, ridge, zm], [x1, ridge, zm]], [1, 0, 0], side);
    } else {
      const xm = (x0 + x1) / 2;
      const ny = (x1 - x0) / 2;
      quad([[x0 - o, eave - 0.1, z1 + o], [xm, ridge, z1 + o], [xm, ridge, z0 - o], [x0 - o, eave - 0.1, z0 - o]], [-rise, ny, 0], snow);
      quad([[xm, ridge, z1 + o], [x1 + o, eave - 0.1, z1 + o], [x1 + o, eave - 0.1, z0 - o], [xm, ridge, z0 - o]], [rise, ny, 0], snow);
      quad([[x0, eave, z0], [x1, eave, z0], [xm, ridge, z0], [xm, ridge, z0]], [0, 0, -1], side);
      quad([[x1, eave, z1], [x0, eave, z1], [xm, ridge, z1], [xm, ridge, z1]], [0, 0, 1], side);
    }
    roofs.push({ x0, z0, x1, z1, at: (x, z) => ridge - (alongX ? Math.abs(z - (z0 + z1) / 2) / ((z1 - z0) / 2) : Math.abs(x - (x0 + x1) / 2) / ((x1 - x0) / 2)) * rise });
  }

  // Stacks: a flue over every stove and engine, capped with snow.
  for (const p of map.def.props) {
    const r = STACKS[p.type];
    const roof = roofs.find((q) => p.x > q.x0 && p.x < q.x1 && p.z > q.z0 && p.z < q.z1);
    if (!r || !roof) continue;
    const top = roof.at(p.x, p.z) + 0.6 + r * 3;
    box(p.x - r, p.z - r, p.x + r, p.z + r, [YARD_WALL, YARD_WALL, YARD_WALL, YARD_WALL], top, linear(0x2c2a2a), linear(0x101010));
    box(p.x - r - 0.05, p.z - r - 0.05, p.x + r + 0.05, p.z + r + 0.05, [top - 0.12, top - 0.12, top - 0.12, top - 0.12], top - 0.04, linear(SNOW));
  }

  // Pines beyond the wire and behind the buildings, wherever there is rock for them to stand on.
  const solidAround = (x: number, z: number): boolean => {
    const n = Math.ceil(TREE_CLEARANCE / CELL_SIZE);
    const cx = Math.floor(x / CELL_SIZE);
    const cz = Math.floor(z / CELL_SIZE);
    for (let dz = -n; dz <= n; dz++) for (let dx = -n; dx <= n; dx++) if (map.openColumn(cx + dx, cz + dz)) return false;
    return !roofs.some((q) => x > q.x0 - 1.5 && x < q.x1 + 1.5 && z > q.z0 - 1.5 && z < q.z1 + 1.5);
  };
  const needles = linear(0x1c3028);
  const cone = (x: number, z: number, y0: number, y1: number, r: number, turn: number, shade: number): void => {
    const SIDES = 5;
    for (let i = 0; i < SIDES; i++) {
      const a0 = turn + (i / SIDES) * Math.PI * 2;
      const a1 = turn + ((i + 1) / SIDES) * Math.PI * 2;
      const am = (a0 + a1) / 2;
      const p0: V3 = [x + Math.cos(a0) * r, y0, z - Math.sin(a0) * r];
      const p1: V3 = [x + Math.cos(a1) * r, y0, z - Math.sin(a1) * r];
      // Snow lies on the boughs that face the weather.
      const c = Math.cos(am - 0.6) > 0.2 ? linear(SNOW).map((v) => v * 0.8 * shade) : needles.map((v) => v * shade);
      quad([p0, p1, [x, y1, z], [x, y1, z]], [Math.cos(am), 0.5, -Math.sin(am)], c as RGB);
    }
  };
  const { w, d } = map.def.size;
  for (let z = -TREE_MARGIN; z < d + TREE_MARGIN; z += TREE_GRID) {
    for (let x = -TREE_MARGIN; x < w + TREE_MARGIN; x += TREE_GRID) {
      const tx = x + rng.range(0, TREE_GRID - 0.5);
      const tz = z + rng.range(0, TREE_GRID - 0.5);
      const keep = rng.chance(0.6);
      const h = rng.range(6.5, 11);
      const turn = rng.range(0, 6);
      const shade = rng.range(0.75, 1.1);
      // Thick where the yard looks out on them, thin where only a window does.
      const fromYard = Math.hypot(Math.max(yard.x - tx, 0, tx - yard.x - yard.w), Math.max(yard.z - tz, 0, tz - yard.z - yard.d));
      const seen = fromYard < TREE_NEAR || rng.chance(0.3);
      if (!keep || !seen || !solidAround(tx, tz)) continue;
      box(tx - 0.15, tz - 0.15, tx + 0.15, tz + 0.15, [0, 0, 0, 0], h * 0.4, linear(0x2a2018));
      for (let tier = 0; tier < 3; tier++) cone(tx, tz, h * (0.28 + tier * 0.22), h * (0.62 + tier * 0.19), (1.9 - tier * 0.5) * (h / 9), turn + tier, shade);
    }
  }
  return b;
}
