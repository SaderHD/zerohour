import { CELL_SIZE, SIGHT_HEIGHT, STEP_HEIGHT } from '../constants';
import type { CompiledMap, DoorSet } from '../map/compile';

/**
 * Line of sight between two bodies (Amanatides–Woo traversal). `y0` and `y1` are the heights of
 * their feet: the line runs chest to chest, and is clear if every column strictly between the two
 * has open space at the height it passes (so walls, shut doors, tall furniture, and the floors
 * and ceilings between storeys all block it; windows and low furniture do not).
 */
export function lineOfSight(map: CompiledMap, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, open?: DoorSet): boolean {
  return trace(map, x0, y0 + SIGHT_HEIGHT, z0, x1, y1 + SIGHT_HEIGHT, z1, open, false);
}

/**
 * True if someone standing at height `y0` could walk the straight line to the other point and
 * arrive at height `y1`: no wall, no furniture and no ledge on the way.
 */
export function lineWalkable(map: CompiledMap, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, open?: DoorSet): boolean {
  return trace(map, x0, y0, z0, x1, y1, z1, open, true);
}

function trace(map: CompiledMap, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, open: DoorSet, walk: boolean): boolean {
  let cx = Math.floor(x0 / CELL_SIZE);
  let cz = Math.floor(z0 / CELL_SIZE);
  const ex = Math.floor(x1 / CELL_SIZE);
  const ez = Math.floor(z1 / CELL_SIZE);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dz = z1 - z0;
  const stepX = dx > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(CELL_SIZE / dx) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(CELL_SIZE / dz) : Infinity;
  let tMaxX = dx !== 0 ? ((dx > 0 ? (cx + 1) * CELL_SIZE - x0 : x0 - cx * CELL_SIZE) / Math.abs(dx)) : Infinity;
  let tMaxZ = dz !== 0 ? ((dz > 0 ? (cz + 1) * CELL_SIZE - z0 : z0 - cz * CELL_SIZE) / Math.abs(dz)) : Infinity;
  // Walking: the height of the floor underfoot, cell by cell.
  let y = y0;
  // Seeing: the two ends stand in their own cells, but a floor between them still hides one from the other.
  if (!walk) {
    const tOut = Math.min(tMaxX, tMaxZ, 1);
    const same = cx === ex && cz === ez;
    const a = y0 + dy * (same ? 1 : tOut);
    if (!map.spanOpen(cx, cz, Math.min(y0, a), Math.max(y0, a))) return false;
  }

  for (let guard = 0; guard < 4096; guard++) {
    if (cx === ex && cz === ez) break;
    const tIn = Math.min(tMaxX, tMaxZ);
    // The line is at its end: the target stands on the very edge of its cell, on the side the line comes from.
    if (tIn >= 1) break;
    if (tMaxX < tMaxZ) {
      cx += stepX;
      tMaxX += tDeltaX;
    } else {
      cz += stepZ;
      tMaxZ += tDeltaZ;
    }
    if (cx === ex && cz === ez) {
      if (!walk) {
        const a = y0 + dy * Math.min(tIn, 1);
        if (!map.spanOpen(cx, cz, Math.min(a, y1), Math.max(a, y1))) return false;
      }
      break;
    }
    if (walk) {
      const i = map.walkAt(cx, cz, y, open);
      if (i < 0) return false;
      y = map.lo[i]!;
    } else {
      const a = y0 + dy * tIn;
      const b = y0 + dy * Math.min(tMaxX, tMaxZ, 1);
      if (!map.seeThrough(cx, cz, Math.min(a, b), Math.max(a, b), open)) return false;
    }
    if (guard === 4095) return false;
  }
  // The last cell is the target's own: all that is asked is that the walk ends at its height.
  return !walk || Math.abs(y - y1) <= STEP_HEIGHT * 2;
}
