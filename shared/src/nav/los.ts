import { CELL_SIZE } from '../constants';
import type { CompiledMap, DoorSet } from '../map/compile';

/**
 * Grid line of sight (Amanatides–Woo traversal). True if no opaque cell lies strictly between
 * the two points. Closed doors block unless listed in `open`.
 */
export function lineOfSight(map: CompiledMap, x0: number, z0: number, x1: number, z1: number, open?: DoorSet): boolean {
  return trace(map, x0, z0, x1, z1, open, false);
}

/** True if nothing stands on the straight line between the two points: no wall and no furniture. */
export function lineWalkable(map: CompiledMap, x0: number, z0: number, x1: number, z1: number, open?: DoorSet): boolean {
  return trace(map, x0, z0, x1, z1, open, true);
}

function trace(map: CompiledMap, x0: number, z0: number, x1: number, z1: number, open: DoorSet, walk: boolean): boolean {
  let cx = Math.floor(x0 / CELL_SIZE);
  let cz = Math.floor(z0 / CELL_SIZE);
  const ex = Math.floor(x1 / CELL_SIZE);
  const ez = Math.floor(z1 / CELL_SIZE);
  const dx = x1 - x0;
  const dz = z1 - z0;
  const stepX = dx > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(CELL_SIZE / dx) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(CELL_SIZE / dz) : Infinity;
  let tMaxX = dx !== 0 ? ((dx > 0 ? (cx + 1) * CELL_SIZE - x0 : x0 - cx * CELL_SIZE) / Math.abs(dx)) : Infinity;
  let tMaxZ = dz !== 0 ? ((dz > 0 ? (cz + 1) * CELL_SIZE - z0 : z0 - cz * CELL_SIZE) / Math.abs(dz)) : Infinity;

  for (let guard = 0; guard < 4096; guard++) {
    if (cx === ex && cz === ez) return true;
    if (tMaxX < tMaxZ) {
      cx += stepX;
      tMaxX += tDeltaX;
    } else {
      cz += stepZ;
      tMaxZ += tDeltaZ;
    }
    if (cx === ex && cz === ez) return true;
    if (walk ? !map.isWalkable(cx, cz, open) : map.isOpaque(cx, cz, open)) return false;
  }
  return false;
}
