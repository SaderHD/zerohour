import { CELL_SIZE } from '../constants';
import { Cell, type CompiledMap, type DoorSet } from '../map/compile';

export const UNREACHABLE = 0xffff;
const ORTH = 10;
const DIAG = 14;
/** Extra cost of cells that touch a wall, so paths keep to the middle of lanes. */
const WALL_COST = 8;
/** How many cells ahead along the path a mover aims for (smooths the 8-direction staircase). */
const LOOK_AHEAD = 3;

/** Buckets of the queue: a power of two over the most one step can cost (DIAG + WALL_COST), so no two distances in the queue at once share one. */
const BUCKETS = 32;

/** What a field needs to know about a map and never changes: worked out once a map, shared by every field on it. */
interface Ground {
  /** Per cell: WALL_COST if it touches a wall, a ledge or furniture. */
  wall: Uint8Array;
  /** Per cell: 1 if it is floor nothing stands on. A door's cell is 0 here: whether it is open is asked each time. */
  floor: Uint8Array;
  /** The cells that are doorways. */
  doors: Int32Array;
}

const grounds = new WeakMap<CompiledMap, Ground>();
function groundOf(map: CompiledMap): Ground {
  let g = grounds.get(map);
  if (g) return g;
  const n = map.kind.length;
  const wall = new Uint8Array(n);
  const floor = new Uint8Array(n);
  const doors: number[] = [];
  const open = (i: number) => i >= 0 && (map.kind[i] === Cell.Floor || map.kind[i] === Cell.Door) && !map.block[i];
  for (let i = 0; i < n; i++) {
    if (map.kind[i] === Cell.Door) doors.push(i);
    else if (map.walkable(i)) floor[i] = 1;
    if (!open(i)) continue;
    // A wall, a ledge or furniture on any side.
    for (let k = 0; k < 8; k++) if (!open(map.links[i * 8 + k]!)) { wall[i] = WALL_COST; break; }
  }
  grounds.set(map, (g = { wall, floor, doors: Int32Array.from(doors) }));
  return g;
}

/**
 * Walking distance from every walkable cell to one goal (Dijkstra on the collision grid).
 * Zombies follow it downhill to their target player; bots use it to walk to a destination.
 *
 * A step costs a small whole number, so the queue is a ring of buckets, one a distance (Dial's
 * algorithm): no heap, and the work is a few operations a cell reached, whatever the size of the
 * grid it lies in. A map four times the station's is four times the work, not more.
 */
export class FlowField {
  /** Cost to the goal per cell (10 per orthogonal step), or UNREACHABLE. */
  readonly dist: Uint16Array;
  private readonly walk: Uint8Array;
  private readonly ground: Ground;
  private readonly wall: Uint8Array;
  /** The queue: the first cell waiting at each distance (mod BUCKETS), and each waiting cell's neighbours in its list. */
  private readonly head = new Int32Array(BUCKETS);
  private readonly next: Int32Array;
  private readonly prev: Int32Array;
  goalX = 0;
  goalY = 0;
  goalZ = 0;

  constructor(readonly map: CompiledMap) {
    const n = map.kind.length;
    this.dist = new Uint16Array(n).fill(UNREACHABLE);
    this.walk = new Uint8Array(n);
    this.next = new Int32Array(n);
    this.prev = new Int32Array(n);
    this.ground = groundOf(map);
    this.wall = this.ground.wall;
  }

  /** Recompute for a goal standing at (x, z) with its feet at `y`. Returns false if the goal is not on walkable ground. */
  compute(open: DoorSet, x: number, y: number, z: number): boolean {
    const { map, dist, walk, head, next, prev, wall } = this;
    const links = map.links;
    this.goalX = x;
    this.goalY = y;
    this.goalZ = z;
    dist.fill(UNREACHABLE);
    walk.set(this.ground.floor);
    if (open) for (const i of this.ground.doors) if (map.isDoorOpen(i, open)) walk[i] = 1;
    const goal = map.cellAt(x, y, z);
    if (goal < 0 || !walk[goal]) return false;
    head.fill(-1);
    dist[goal] = 0;
    head[0] = goal;
    next[goal] = prev[goal] = -1;
    let waiting = 1;
    for (let d = 0; waiting > 0; d++) {
      const b = d & (BUCKETS - 1);
      for (let i = head[b]!; i >= 0; i = head[b]!) {
        // Take it out: whatever it reaches is further off than `d`, so nothing joins this bucket again before it is empty.
        head[b] = next[i]!;
        if (head[b]! >= 0) prev[head[b]!] = -1;
        waiting--;
        const base = i * 8;
        for (let n = 0; n < 8; n++) {
          const j = links[base + n]!;
          if (j < 0) continue;
          const nd = d + (n < 4 ? ORTH : DIAG) + wall[j]!;
          const old = dist[j]!;
          if (nd >= old || nd >= UNREACHABLE || !walk[j]) continue;
          // No cutting corners: NEIGHBOURS 4..7 are (+,+) (+,-) (-,+) (-,-), the orthogonal steps sharing their signs.
          if (n >= 4 && !(walk[links[base + (n < 6 ? 0 : 1)]!] === 1 && walk[links[base + (n % 2 === 0 ? 2 : 3)]!] === 1)) continue;
          if (old !== UNREACHABLE) {
            // It was waiting further off: out of that list.
            const p = prev[j]!;
            const q = next[j]!;
            if (p >= 0) next[p] = q;
            else head[old & (BUCKETS - 1)] = q;
            if (q >= 0) prev[q] = p;
          } else waiting++;
          dist[j] = nd;
          const nb = nd & (BUCKETS - 1);
          const h = head[nb]!;
          next[j] = h;
          prev[j] = -1;
          if (h >= 0) prev[h] = j;
          head[nb] = j;
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
