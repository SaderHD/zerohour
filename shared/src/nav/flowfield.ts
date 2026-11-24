import { CELL_SIZE } from '../constants';
import { Cell, type CompiledMap, type DoorSet } from '../map/compile';

export const UNREACHABLE = 0xffff;
const ORTH = 10;
const DIAG = 14;
/** Extra cost of cells that touch a wall, so paths keep to the middle of lanes. */
const WALL_COST = 8;
/** How many cells ahead along the path a mover aims for (smooths the 8-direction staircase). */
const LOOK_AHEAD = 3;
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

const wallCostCache = new WeakMap<CompiledMap, Uint8Array>();
function wallCosts(map: CompiledMap): Uint8Array {
  let w = wallCostCache.get(map);
  if (w) return w;
  w = new Uint8Array(map.cols * map.rows);
  const open = (cx: number, cz: number) => { const k = map.kindAt(cx, cz); return (k === Cell.Floor || k === Cell.Door) && !map.block[map.idx(cx, cz)]; };
  for (let cz = 0; cz < map.rows; cz++) {
    for (let cx = 0; cx < map.cols; cx++) {
      if (!open(cx, cz)) continue;
      for (const [dx, dz] of NEIGHBOURS) if (!open(cx + dx, cz + dz)) { w[map.idx(cx, cz)] = WALL_COST; break; }
    }
  }
  wallCostCache.set(map, w);
  return w;
}

/**
 * Walking distance from every walkable cell to one goal (Dijkstra on the collision grid).
 * Zombies follow it downhill to their target player; bots use it to walk to a destination.
 */
export class FlowField {
  /** Cost to the goal per cell (10 per orthogonal step), or UNREACHABLE. */
  readonly dist: Uint16Array;
  private readonly walk: Uint8Array;
  private readonly heap: Int32Array;
  private heapSize = 0;
  private readonly wall: Uint8Array;
  goalX = 0;
  goalZ = 0;

  constructor(readonly map: CompiledMap) {
    const n = map.cols * map.rows;
    this.dist = new Uint16Array(n).fill(UNREACHABLE);
    this.walk = new Uint8Array(n);
    this.heap = new Int32Array(n * 16); // room for every relaxation of every cell
    this.wall = wallCosts(map);
  }

  // Binary min-heap of [dist, index] pairs.
  private push(d: number, i: number): void {
    const h = this.heap;
    let k = this.heapSize++;
    while (k > 0) {
      const parent = (k - 1) >> 1;
      if (h[parent * 2]! <= d) break;
      h[k * 2] = h[parent * 2]!;
      h[k * 2 + 1] = h[parent * 2 + 1]!;
      k = parent;
    }
    h[k * 2] = d;
    h[k * 2 + 1] = i;
  }

  private pop(): number {
    const h = this.heap;
    const top = h[1]!;
    const n = --this.heapSize;
    const d = h[n * 2]!;
    const i = h[n * 2 + 1]!;
    let k = 0;
    for (;;) {
      let c = k * 2 + 1;
      if (c >= n) break;
      if (c + 1 < n && h[(c + 1) * 2]! < h[c * 2]!) c++;
      if (h[c * 2]! >= d) break;
      h[k * 2] = h[c * 2]!;
      h[k * 2 + 1] = h[c * 2 + 1]!;
      k = c;
    }
    h[k * 2] = d;
    h[k * 2 + 1] = i;
    return top;
  }

  /** Recompute for a goal at (x, z). Returns false if the goal is not on walkable ground. */
  compute(open: DoorSet, x: number, z: number): boolean {
    const { map, dist, walk } = this;
    const { cols, rows } = map;
    this.goalX = x;
    this.goalZ = z;
    dist.fill(UNREACHABLE);
    for (let cz = 0, i = 0; cz < rows; cz++) for (let cx = 0; cx < cols; cx++, i++) walk[i] = map.isWalkable(cx, cz, open) ? 1 : 0;
    const gx = Math.floor(x / CELL_SIZE);
    const gz = Math.floor(z / CELL_SIZE);
    if (!map.inBounds(gx, gz) || !walk[map.idx(gx, gz)]) return false;
    this.heapSize = 0;
    dist[map.idx(gx, gz)] = 0;
    this.push(0, map.idx(gx, gz));
    while (this.heapSize > 0) {
      const d = this.heap[0]!;
      const i = this.pop();
      if (d > dist[i]!) continue;
      for (let n = 0; n < 8; n++) {
        const dx = NEIGHBOURS[n]![0];
        const dz = NEIGHBOURS[n]![1];
        const j = i + dx + dz * cols; // the solid border keeps this in bounds
        if (!walk[j]) continue;
        if (n >= 4 && (!walk[i + dx] || !walk[i + dz * cols])) continue; // no cutting corners
        const nd = d + (n < 4 ? ORTH : DIAG) + this.wall[j]!;
        if (nd < dist[j]! && nd < UNREACHABLE) {
          dist[j] = nd;
          this.push(nd, j);
        }
      }
    }
    return true;
  }

  /** Cost from (x, z) to the goal, or UNREACHABLE. */
  costAt(x: number, z: number): number {
    const cx = Math.floor(x / CELL_SIZE);
    const cz = Math.floor(z / CELL_SIZE);
    return this.map.inBounds(cx, cz) ? this.dist[this.map.idx(cx, cz)]! : UNREACHABLE;
  }

  private downhill(i: number): number {
    const { dist, walk } = this;
    const cols = this.map.cols;
    let best = i;
    let bestD = dist[i]!;
    for (let n = 0; n < 8; n++) {
      const dx = NEIGHBOURS[n]![0];
      const dz = NEIGHBOURS[n]![1];
      const j = i + dx + dz * cols;
      if (j < 0 || j >= dist.length || dist[j]! >= bestD) continue;
      if (n >= 4 && (!walk[i + dx] || !walk[i + dz * cols])) continue;
      best = j;
      bestD = dist[j]!;
    }
    return best;
  }

  /**
   * Unit direction to walk from (x, z) towards the goal, written to `out`. Returns false when
   * there is no path (or the mover already shares the goal's cell: steer at the goal itself).
   */
  dir(x: number, z: number, out: { x: number; z: number }): boolean {
    const map = this.map;
    const cx = Math.floor(x / CELL_SIZE);
    const cz = Math.floor(z / CELL_SIZE);
    if (!map.inBounds(cx, cz)) return false;
    let i = map.idx(cx, cz);
    if (this.dist[i] === 0) return false;
    let first = -1;
    for (let step = 0; step < LOOK_AHEAD; step++) {
      const next = this.downhill(i);
      if (next === i) break;
      // Only look further ahead while the path keeps clear of walls; near them, take it cell by cell.
      if (step > 0 && this.wall[next]) break;
      i = next;
      if (first < 0) first = next;
    }
    if (first < 0) return false;
    const tx = ((i % map.cols) + 0.5) * CELL_SIZE - x;
    const tz = (Math.floor(i / map.cols) + 0.5) * CELL_SIZE - z;
    const len = Math.hypot(tx, tz);
    if (len < 1e-6) return false;
    out.x = tx / len;
    out.z = tz / len;
    return true;
  }
}
