import { CELL_SIZE } from '../constants';
import { Cell, type CompiledMap, type DoorSet } from '../map/compile';

export const UNREACHABLE = 0xffff;
const ORTH = 10;
const DIAG = 14;
/** Extra cost of cells that touch a wall, so paths keep to the middle of lanes. */
const WALL_COST = 8;
/** How many cells ahead along the path a mover aims for (smooths the 8-direction staircase). */
const LOOK_AHEAD = 3;

const wallCostCache = new WeakMap<CompiledMap, Uint8Array>();
function wallCosts(map: CompiledMap): Uint8Array {
  let w = wallCostCache.get(map);
  if (w) return w;
  w = new Uint8Array(map.kind.length);
  const open = (i: number) => i >= 0 && (map.kind[i] === Cell.Floor || map.kind[i] === Cell.Door) && !map.block[i];
  for (let i = 0; i < w.length; i++) {
    if (!open(i)) continue;
    // A wall, a ledge or furniture on any side.
    for (let n = 0; n < 8; n++) if (!open(map.links[i * 8 + n]!)) { w[i] = WALL_COST; break; }
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
  goalY = 0;
  goalZ = 0;

  constructor(readonly map: CompiledMap) {
    const n = map.kind.length;
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

  /** Recompute for a goal standing at (x, z) with its feet at `y`. Returns false if the goal is not on walkable ground. */
  compute(open: DoorSet, x: number, y: number, z: number): boolean {
    const { map, dist, walk } = this;
    const links = map.links;
    this.goalX = x;
    this.goalY = y;
    this.goalZ = z;
    dist.fill(UNREACHABLE);
    for (let i = 0; i < walk.length; i++) walk[i] = map.walkable(i, open) ? 1 : 0;
    const goal = map.cellAt(x, y, z);
    if (goal < 0 || !walk[goal]) return false;
    this.heapSize = 0;
    dist[goal] = 0;
    this.push(0, goal);
    while (this.heapSize > 0) {
      const d = this.heap[0]!;
      const i = this.pop();
      if (d > dist[i]!) continue;
      for (let n = 0; n < 8; n++) {
        const j = links[i * 8 + n]!;
        if (j < 0 || !walk[j]) continue;
        if (n >= 4 && !this.cornerOpen(i, n)) continue; // no cutting corners
        const nd = d + (n < 4 ? ORTH : DIAG) + this.wall[j]!;
        if (nd < dist[j]! && nd < UNREACHABLE) {
          dist[j] = nd;
          this.push(nd, j);
        }
      }
    }
    return true;
  }

  /** Both cells round the corner of diagonal step `n` (4..7) from `i` are walkable. */
  private cornerOpen(i: number, n: number): boolean {
    const links = this.map.links;
    // NEIGHBOURS 4..7 are (+,+) (+,-) (-,+) (-,-): the orthogonal steps sharing their signs.
    return this.walk[links[i * 8 + (n < 6 ? 0 : 1)]!] === 1 && this.walk[links[i * 8 + (n % 2 === 0 ? 2 : 3)]!] === 1;
  }

  /** Cost from (x, z), feet at `y`, to the goal, or UNREACHABLE. */
  costAt(x: number, y: number, z: number): number {
    const i = this.map.cellAt(x, y, z);
    return i < 0 ? UNREACHABLE : this.dist[i]!;
  }

  private downhill(i: number): number {
    const dist = this.dist;
    const links = this.map.links;
    let best = i;
    let bestD = dist[i]!;
    for (let n = 0; n < 8; n++) {
      const j = links[i * 8 + n]!;
      if (j < 0 || dist[j]! >= bestD) continue;
      if (n >= 4 && !this.cornerOpen(i, n)) continue;
      best = j;
      bestD = dist[j]!;
    }
    return best;
  }

  /**
   * Unit direction to walk from (x, z), feet at `y`, towards the goal, written to `out`. Returns false when
   * there is no path (or the mover already shares the goal's cell: steer at the goal itself).
   */
  dir(x: number, y: number, z: number, out: { x: number; z: number }): boolean {
    const map = this.map;
    let i = map.cellAt(x, y, z);
    if (i < 0 || this.dist[i] === 0) return false;
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
    const tx = (map.cxOf(i) + 0.5) * CELL_SIZE - x;
    const tz = (map.czOf(i) + 0.5) * CELL_SIZE - z;
    const len = Math.hypot(tx, tz);
    if (len < 1e-6) return false;
    out.x = tx / len;
    out.z = tz / len;
    return true;
  }
}
