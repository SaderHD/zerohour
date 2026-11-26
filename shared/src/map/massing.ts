import { CELL_SIZE } from '../constants';
import { Cell, type CompiledMap } from './compile';
import { WALL_STYLES } from './types';

// How tall the solid stands. To whoever walks, solid is a wall of no particular height; seen from
// outside it is a building, and on a map whose scene is `built: 'city'` every column of the grid
// has a top: the roof of the block that stands there. The client draws the buildings from this
// (render/city.ts), stops a wall where the building behind it stops (worldBuilder.ts) and lets the
// snow lie on the roofs (snow.ts); sight and shots pass over whatever is lower than they are
// (`CompiledMap.skyline`, `aloft`).

/** How tall solid stands where no block says. */
export const BLOCK_HEIGHT = 14;
/** How far the edge of a roof stands above it, unless its block says otherwise. */
export const PARAPET = 0.5;
/** What lies between a room's ceiling and the roof over it, at the least. */
export const ROOF_SLAB = 0.5;
/** From one floor to the next in a building seen from outside: rows of windows are this far apart. */
export const STOREY = 4;

export interface Massing {
  /**
   * For each column of the grid: where the air above it starts. Under the sky (a street, a walked
   * roof, the pocket behind a window) that is the floor that lies open, the lowest if a bridge or
   * a ledge hangs over it; anywhere else the top of the building there, its parapet included.
   */
  readonly top: Float32Array;
  /** The same without the parapet: the height of the roof itself. */
  readonly roof: Float32Array;
  /** 1 where the column is open to the sky from a floor. */
  readonly open: Uint8Array;
  /**
   * How far up the world builder has drawn the walls that face into the column: the ceiling of
   * the open-air room there (`Room.ceil`), or for a building its top. The buildings round about
   * are drawn from here up.
   */
  readonly drawn: Float32Array;
  /** The block each column belongs to (an index into `def.blocks`), or -1. */
  readonly block: Int16Array;
  /** The highest floor anyone can stand on: nothing is ever seen from above more than a storey over it. */
  readonly highest: number;
}

const cache = new WeakMap<CompiledMap, Massing | null>();

/** The heights of a city map's buildings, or null for a map that has none (`scene.built` is not 'city'). */
export function massing(map: CompiledMap): Massing | null {
  let m = cache.get(map);
  if (m === undefined) cache.set(map, (m = map.def.scene.built === 'city' ? build(map) : null));
  return m;
}

function build(map: CompiledMap): Massing {
  const { cols, rows, plane } = map;
  const blocks = map.def.blocks ?? [];
  const block = new Int16Array(plane).fill(-1);
  blocks.forEach((b, bi) => {
    const [x0, z0, x1, z1] = [b.x, b.z, b.x + b.w, b.z + b.d].map((v) => Math.round(v / CELL_SIZE)) as [number, number, number, number];
    for (let cz = Math.max(0, z0); cz < Math.min(rows, z1); cz++) for (let cx = Math.max(0, x0); cx < Math.min(cols, x1); cx++) block[cz * cols + cx] = bi;
  });

  const open = new Uint8Array(plane);
  const drawn = new Float32Array(plane);
  const roof = new Float32Array(plane);
  /** The roof a column's own rooms need over them (-Infinity where it has none). */
  const rooms = new Float32Array(plane).fill(-Infinity);
  /** The same, as far as it asks the columns round it to stand as tall. */
  const beside = new Float32Array(plane).fill(-Infinity);
  let highest = 0;
  for (let c = 0; c < plane; c++) {
    for (let i = c; i < map.kind.length; i += plane) {
      const k = map.kind[i] as Cell;
      if (k === Cell.Solid) continue;
      if (k === Cell.Floor || k === Cell.Door) highest = Math.max(highest, map.lo[i]!);
      // The lowest floor under the sky is what the column is open from: what hangs in the air
      // (a bridge over a street, a ledge outside a window) stands on nothing and changes nothing,
      // and a gap in a parapet is part of its wall.
      if (map.sky[i]) {
        if (open[c] || map.deck[i] || k === Cell.Window) continue;
        open[c] = 1;
        roof[c] = map.lo[i]!;
        drawn[c] = map.hi[i]!;
      } else {
        rooms[c] = Math.max(rooms[c]!, map.hi[i]! + ROOF_SLAB);
        // (A window is in a wall already: it asks nothing of the walls beside it.)
        if (k !== Cell.Window) beside[c] = rooms[c]!;
      }
    }
  }
  // A building is as tall as its block, or as its rooms need; and a wall is as tall as the tallest room it stands beside.
  for (let cz = 0; cz < rows; cz++) {
    for (let cx = 0; cx < cols; cx++) {
      const c = cz * cols + cx;
      if (open[c]) continue;
      let h = Math.max(blocks[block[c]!]?.h ?? BLOCK_HEIGHT, rooms[c]!);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (map.inBounds(cx + dx, cz + dz) && !open[c + dz * cols + dx]) h = Math.max(h, beside[c + dz * cols + dx]!);
      roof[c] = h;
    }
  }
  // A parapet: the rim of a roof, wherever something lower (or the edge of the map) lies beside it.
  const top = roof.slice();
  for (let cz = 0; cz < rows; cz++) {
    for (let cx = 0; cx < cols; cx++) {
      const c = cz * cols + cx;
      const rim = blocks[block[c]!]?.parapet ?? PARAPET;
      if (open[c] || rim <= 0) continue;
      let edge = false;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (!map.inBounds(cx + dx, cz + dz) || roof[c + dz * cols + dx]! < roof[c]! - 1e-3) edge = true;
      if (edge) top[c] = roof[c]! + rim;
    }
  }
  for (let c = 0; c < plane; c++) if (!open[c]) drawn[c] = top[c]!;
  return { top, roof, open, drawn, block, highest };
}

/** What is wrong with a map's blocks, for the validator. */
export function checkBlocks(map: CompiledMap): string[] {
  const errors: string[] = [];
  const def = map.def;
  if (def.blocks?.length && def.scene.built !== 'city') errors.push(`the map has blocks but its scene is built '${def.scene.built}'`);
  const aligned = (v: number): boolean => Math.abs(v / CELL_SIZE - Math.round(v / CELL_SIZE)) < 1e-6;
  for (const [i, b] of (def.blocks ?? []).entries()) {
    const what = `block ${i} (at ${b.x}, ${b.z})`;
    if (![b.x, b.z, b.w, b.d].every(aligned)) errors.push(`${what}: not aligned to the ${CELL_SIZE} m grid`);
    if (b.w <= 0 || b.d <= 0 || !(b.h > 0)) errors.push(`${what}: empty`);
    if (b.x < 0 || b.z < 0 || b.x + b.w > def.size.w || b.z + b.d > def.size.d) errors.push(`${what}: outside the map`);
    if (!WALL_STYLES.includes(b.face)) errors.push(`${what}: unknown face ${String(b.face)}`);
  }
  return errors;
}
