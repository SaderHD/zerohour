import { CELL_SIZE } from '../constants';
import { Cell, type CompiledMap, type DoorSet } from '../map/compile';

/** Rays that climb above this over open sky are gone. */
const SKY_LIMIT = 14;

/**
 * 3D ray against the cell grid (walls, floors, ceilings, sills, lintels and the props standing
 * on it, as boxes the size of their cells). Returns the distance
 * to the first surface, or `max` if nothing is hit. The direction must be normalised.
 */
export function rayWorld(
  map: CompiledMap, open: DoorSet,
  ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number,
): number {
  let cx = Math.floor(ox / CELL_SIZE);
  let cz = Math.floor(oz / CELL_SIZE);
  if (map.isOpaque(cx, cz, open)) return 0;
  const stepX = dx > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(CELL_SIZE / dx) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(CELL_SIZE / dz) : Infinity;
  let tMaxX = dx !== 0 ? (dx > 0 ? (cx + 1) * CELL_SIZE - ox : ox - cx * CELL_SIZE) / Math.abs(dx) : Infinity;
  let tMaxZ = dz !== 0 ? (dz > 0 ? (cz + 1) * CELL_SIZE - oz : oz - cz * CELL_SIZE) / Math.abs(dz) : Infinity;
  let tEnter = 0;

  for (let guard = 0; guard < 4096; guard++) {
    const i = map.idx(cx, cz);
    const lo = Math.max(map.lo[i]!, map.propH[i]!);
    const hi = map.sky[i] || map.kind[i] === Cell.Outside ? SKY_LIMIT : map.hi[i]!;
    const yIn = oy + dy * tEnter;
    if (yIn < lo || yIn > hi) return tEnter; // sill, lintel or a lower ceiling's face
    const tExit = Math.min(tMaxX, tMaxZ, max);
    const yOut = oy + dy * tExit;
    if (yOut < lo) return (lo - oy) / dy;
    if (yOut > hi) return hi >= SKY_LIMIT ? max : (hi - oy) / dy;
    if (tExit >= max) return max;
    if (tMaxX < tMaxZ) {
      cx += stepX;
      tMaxX += tDeltaX;
    } else {
      cz += stepZ;
      tMaxZ += tDeltaZ;
    }
    tEnter = tExit;
    if (map.isOpaque(cx, cz, open)) return tEnter;
  }
  return max;
}
