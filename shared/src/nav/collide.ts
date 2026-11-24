import { CELL_SIZE } from '../constants';
import type { CompiledMap, DoorSet } from '../map/compile';

export interface Pos {
  x: number;
  z: number;
}

/**
 * Move a circle by (dx, dz) against the cell grid, sliding along walls. Shared by the client's
 * local movement and (later) server-side zombies.
 */
export function moveCircle(map: CompiledMap, open: DoorSet, x: number, z: number, dx: number, dz: number, r: number): Pos {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (r * 0.5)));
  const sx = dx / steps;
  const sz = dz / steps;
  for (let s = 0; s < steps; s++) {
    const px = x;
    const pz = z;
    x += sx;
    z += sz;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const cx0 = Math.floor((x - r) / CELL_SIZE);
      const cx1 = Math.floor((x + r) / CELL_SIZE);
      const cz0 = Math.floor((z - r) / CELL_SIZE);
      const cz1 = Math.floor((z + r) / CELL_SIZE);
      for (let cz = cz0; cz <= cz1; cz++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          if (map.isWalkable(cx, cz, open)) continue;
          const minX = cx * CELL_SIZE;
          const minZ = cz * CELL_SIZE;
          const nx = Math.max(minX, Math.min(x, minX + CELL_SIZE));
          const nz = Math.max(minZ, Math.min(z, minZ + CELL_SIZE));
          const ox = x - nx;
          const oz = z - nz;
          const d2 = ox * ox + oz * oz;
          if (d2 >= r * r) continue;
          if (d2 > 1e-12) {
            const d = Math.sqrt(d2);
            x += (ox / d) * (r - d);
            z += (oz / d) * (r - d);
          } else {
            // Centre is inside a solid cell: fall back to where this sub-step started.
            x = px;
            z = pz;
          }
          moved = true;
        }
      }
      if (!moved) break;
    }
  }
  return { x, z };
}

/** True if a circle at (x, z) overlaps no blocked cell. */
export function circleFits(map: CompiledMap, open: DoorSet, x: number, z: number, r: number): boolean {
  const cx0 = Math.floor((x - r) / CELL_SIZE);
  const cx1 = Math.floor((x + r) / CELL_SIZE);
  const cz0 = Math.floor((z - r) / CELL_SIZE);
  const cz1 = Math.floor((z + r) / CELL_SIZE);
  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      if (map.isWalkable(cx, cz, open)) continue;
      const minX = cx * CELL_SIZE;
      const minZ = cz * CELL_SIZE;
      const nx = Math.max(minX, Math.min(x, minX + CELL_SIZE));
      const nz = Math.max(minZ, Math.min(z, minZ + CELL_SIZE));
      if ((x - nx) ** 2 + (z - nz) ** 2 < r * r - 1e-6) return false;
    }
  }
  return true;
}
