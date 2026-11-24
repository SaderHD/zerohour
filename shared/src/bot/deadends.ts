// Where running away ends against a wall: the parts of the map that lie on no round trip.
// Rooms and doorways are the nodes of a graph, joined where someone can step from one to the
// other; whatever is left hanging off it by a single way in (a recess, a balcony, a cellar down
// one staircase, a wing whose other door is still shut) is a dead end. Only the bots ask.
import { Cell, type CompiledMap } from '../map/compile';

/** Cells across (4 m) at which a way in stops being a neck. */
const WIDE = 8;
type Doors = ReadonlySet<string>;

export class DeadEnds {
  /** Node of each cell (a room or an opening), or -1. */
  private readonly node: Int32Array;
  private readonly edges: Set<number>[] = [];
  private readonly dead: Uint8Array;
  private doors = -1;

  constructor(private readonly map: CompiledMap) {
    const rooms = map.def.rooms;
    const count = rooms.length + map.def.openings.length;
    this.node = new Int32Array(map.kind.length).fill(-1);
    this.dead = new Uint8Array(count);
    for (let n = 0; n < count; n++) this.edges.push(new Set());
    rooms.forEach((r, n) => {
      const layer = map.layerOf(r.level ?? 0);
      for (let cz = Math.round(r.z * 2); cz < Math.round((r.z + r.d) * 2); cz++) {
        for (let cx = Math.round(r.x * 2); cx < Math.round((r.x + r.w) * 2); cx++) {
          if (map.inBounds(cx, cz)) this.node[map.idx(cx, cz, layer)] = n;
        }
      }
    });
    const stands = (i: number): boolean => (map.kind[i] === Cell.Floor && map.block[i] === 0) || map.kind[i] === Cell.Door;
    for (let i = 0; i < map.kind.length; i++) {
      if (map.opening[i]! >= 0) this.node[i] = map.kind[i] === Cell.Door || map.kind[i] === Cell.Floor ? rooms.length + map.opening[i]! : -1;
      if (!stands(i)) this.node[i] = -1;
    }
    // A mouth this wide is no way in to be caught at: the two sides count as one place.
    const width = new Map<number, number>();
    for (let i = 0; i < map.kind.length; i++) {
      const a = this.node[i]!;
      if (a < 0) continue;
      for (let n = 0; n < 4; n++) {
        const j = map.links[i * 8 + n]!;
        const b = j < 0 ? -1 : this.node[j]!;
        if (b > a) width.set(a * count + b, (width.get(a * count + b) ?? 0) + 1);
      }
    }
    const same = Array.from({ length: count }, (_, n) => n);
    const find = (n: number): number => (same[n] === n ? n : (same[n] = find(same[n]!)));
    for (const [key, cells] of width) if (cells >= WIDE) same[find(key % count)] = find(Math.floor(key / count));
    for (let i = 0; i < this.node.length; i++) if (this.node[i]! >= 0) this.node[i] = find(this.node[i]!);
    for (const key of width.keys()) {
      const a = find(Math.floor(key / count));
      const b = find(key % count);
      if (a === b) continue;
      this.edges[a]!.add(b);
      this.edges[b]!.add(a);
    }
  }

  /** Strip everything with one way in, again and again, with the doors as they stand. */
  private settle(open: Doors): void {
    const rooms = this.map.def.rooms.length;
    const gone = this.dead.fill(0);
    const degree = this.edges.map(() => 0);
    this.map.def.openings.forEach((o, k) => {
      if (o.kind === 'door' && !open.has(o.id)) gone[rooms + k] = 1;
    });
    this.edges.forEach((to, a) => {
      for (const b of to) if (!gone[a] && !gone[b]) degree[a]!++;
    });
    const queue: number[] = [];
    degree.forEach((d, a) => {
      if (!gone[a] && d <= 1) queue.push(a);
    });
    while (queue.length) {
      const a = queue.pop()!;
      if (gone[a]) continue;
      gone[a] = 1;
      for (const b of this.edges[a]!) if (!gone[b] && --degree[b]! <= 1) queue.push(b);
    }
  }

  /** Is the floor under (x, z) at height `y` part of a dead end, with these doors open? */
  at(open: Doors, x: number, y: number, z: number): boolean {
    if (open.size !== this.doors) {
      this.doors = open.size;
      this.settle(open);
    }
    const i = this.map.cellAt(x, y, z);
    const n = i < 0 ? -1 : this.node[i]!;
    return n >= 0 && this.dead[n] === 1;
  }

  /** The rooms that are dead ends with these doors open (for tests and the curious). */
  rooms(open: Doors): string[] {
    return this.map.def.rooms.filter((r) => this.at(open, r.x + r.w / 2, this.map.floorOn(r.level, r.x + r.w / 2, r.z + r.d / 2), r.z + r.d / 2)).map((r) => r.id);
  }
}
