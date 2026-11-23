import { WINDOW_STANDOFF } from '../constants';
import { DIR_VEC, type CompiledMap } from './compile';

/** A barricaded zombie entry, with the points zombies and players use around it. */
export interface WindowInfo {
  id: string;
  zone: string;
  /** Centre of the hole. */
  x: number;
  z: number;
  /** Unit vector pointing outside. */
  ox: number;
  oz: number;
  /** Length along the wall. */
  len: number;
  /** True when the wall runs east-west (the hole is wide in x). */
  alongX: boolean;
  /** Where a zombie stands to tear planks, and where it lands after vaulting. */
  outX: number;
  outZ: number;
  inX: number;
  inZ: number;
  spawnX: number;
  spawnZ: number;
}

const cache = new WeakMap<CompiledMap, WindowInfo[]>();

export function mapWindows(map: CompiledMap): WindowInfo[] {
  let list = cache.get(map);
  if (list) return list;
  list = [];
  for (const o of map.def.openings) {
    if (o.kind !== 'window' || !o.out) continue;
    const v = DIR_VEC[o.out];
    const sp = map.spawns.find((s) => s.windowId === o.id);
    if (!sp) continue;
    const x = o.x + o.w / 2;
    const z = o.z + o.d / 2;
    list.push({
      id: o.id, zone: o.zones[0], x, z, ox: v.x, oz: v.z, len: Math.max(o.w, o.d), alongX: o.w > o.d,
      outX: x + v.x * WINDOW_STANDOFF, outZ: z + v.z * WINDOW_STANDOFF,
      inX: x - v.x * WINDOW_STANDOFF, inZ: z - v.z * WINDOW_STANDOFF,
      spawnX: sp.x, spawnZ: sp.z,
    });
  }
  cache.set(map, list);
  return list;
}
