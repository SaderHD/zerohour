import { CELL_SIZE } from '../constants';
import type { CompiledMap, DoorSet } from '../map/compile';

/** Rays that climb above this over open sky are gone (on a map whose solid has no height). */
const SKY_LIMIT = 14;

/**
 * 3D ray against the cells (walls, floors and ceilings on every storey, sills, lintels and the
 * props standing on them, as boxes the size of their cells; in a city the roofs, and the air
 * over them). Returns the distance
 * to the first surface, or `max` if nothing is hit. The direction must be normalised.
 */
export function rayWorld(
  map: CompiledMap, open: DoorSet,
  ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number,
): number {
  let cx = Math.floor(ox / CELL_SIZE);
  let cz = Math.floor(oz / CELL_SIZE);
  // In a city the solid has a top, and over it is air (`map.aloft`): a ray is then in a cell, or in none over a roof.
  const tops = map.skyline;
  let i = map.holdAt(cx, cz, oy);
  if (i < 0 ? !map.aloft(cx, cz, oy) : map.shutAt(i, oy, open)) return 0;
  const stepX = dx > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(CELL_SIZE / dx) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(CELL_SIZE / dz) : Infinity;
  let tMaxX = dx !== 0 ? (dx > 0 ? (cx + 1) * CELL_SIZE - ox : ox - cx * CELL_SIZE) / Math.abs(dx) : Infinity;
  let tMaxZ = dz !== 0 ? (dz > 0 ? (cz + 1) * CELL_SIZE - oz : oz - cz * CELL_SIZE) / Math.abs(dz) : Infinity;
  let tEnter = 0;

  for (let guard = 0; guard < 4096; guard++) {
    // The cell of this column the ray is in: its floor (or the furniture on it) and its ceiling.
    const lo = i < 0 ? tops![cz * map.cols + cx]! : map.lo[i]! + map.propH[i]!;
    const open2sky = i < 0 || map.cap[i] === Infinity;
    // (Where nothing has a top, a ray that climbs far enough over open ground is gone.)
    const hi = !open2sky ? map.cap[i]! : tops ? Infinity : map.lo[i]! + SKY_LIMIT;
    const yIn = oy + dy * tEnter;
    if (yIn < lo || yIn > hi) return open2sky && yIn > hi ? max : tEnter; // sill, lintel or a lower ceiling's face
    const tExit = Math.min(tMaxX, tMaxZ, max);
    const yOut = oy + dy * tExit;
    if (yOut < lo) return (lo - oy) / dy;
    if (yOut > hi) return open2sky ? max : (hi - oy) / dy;
    if (tExit >= max) return max;
    if (tMaxX < tMaxZ) {
      cx += stepX;
      tMaxX += tDeltaX;
    } else {
      cz += stepZ;
      tMaxZ += tDeltaZ;
    }
    tEnter = tExit;
    i = map.holdAt(cx, cz, yOut);
    if (i < 0 ? !map.aloft(cx, cz, yOut) : map.shutAt(i, yOut, open)) return tEnter;
  }
  return max;
}
