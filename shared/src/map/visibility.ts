import { CELL_SIZE } from '../constants';
import { Cell, NO_ZONE, type CompiledMap } from './compile';

// Which zones can be seen from which. The renderer culls by the view's frustum, but on a map the
// size of a city most of the world lies inside the frustum from anywhere and behind a wall: the
// subway from the street, the store from the chapel. This works out, once a map, the pairs of
// zones with a clear line between them, so the client can leave the rest undrawn.
//
// It errs towards seeing. Doors are open and furniture is not there (a prop is smaller than the
// cells it blocks). Every open cell belongs to a region: its zone, or for the roofed cells no zone
// owns (a doorway, the dark behind a window) the zone they are reached from; what is under the
// sky and nobody's (a yard behind a window, a ledge) is part of the outside. A line from one
// region into another leaves the first through its boundary and enters the second through its
// own, so two regions see each other when some point on the one's boundary has a clear line to
// some point on the other's; a boundary is sampled every half metre along and up. A region under
// the sky is also entered from above, over whatever lower thing stands beside it: its boundary
// goes on up the air there as far as anything is built. Two zones under the sky are taken to see
// each other.
//
// That table is by zone, and a zone sees whatever any eye in it could: the whole square "sees" the
// diner because its door is on it. So the client asks again, as the eye moves, from where the eye
// is (`seenFrom`): for a region with a roof on it, is any of its boundary in sight? and from
// indoors, is any way out to the open air? Whatever is seen of a region is seen through its boundary.

export interface Visibility {
  /** Region ids: the map's zones, in the map's order. */
  readonly regions: readonly string[];
  /** For each cell the index of its region, or -1 (solid, or part of the outside). */
  readonly label: Int16Array;
  /** Can anything of region `b` be seen from anywhere in region `a`? (Symmetric; a region sees itself.) */
  sees(a: number, b: number): boolean;
  /** Has the region floor of its own under the sky? (One that has not is asked about again from wherever the eye is: `seenFrom`.) */
  readonly outdoor: readonly boolean[];
  /**
   * For each roofed region the points it is entered at, by what lies on the other side (a region's
   * index, or -1 for the outside); five numbers a point: x, y, z and the way out of the region there (dx, dz).
   */
  readonly entries: readonly (readonly { from: number; points: Float32Array }[])[];
}

/** The eye is taken to be anywhere within this of where it is said to be: a line that only just misses is no reason to leave a room out. */
const EYE_BOX = 0.35;
const BOX = [[0, 0], [EYE_BOX, 0], [-EYE_BOX, 0], [0, EYE_BOX], [0, -EYE_BOX]] as const;
/** A boundary of more points than this is only looked for from a region that is itself seen: a line to it comes through there. */
const WAITS_OVER = 240;

/**
 * What an eye at (x, y, z) sees, by region; `within` are the regions it is in or beside. Fills
 * `into` (1 = draw the region) and returns whether the outside is seen as well.
 *
 * An eye under the sky sees every region under the sky that the table allows. An eye indoors
 * sees them only if some way out - a point where a roofed region it sees meets the open air - is
 * in sight from the inside. Either way a roofed region is seen when a point of its boundary is
 * in sight from outside it.
 */
export function seenFrom(map: CompiledMap, v: Visibility, within: Iterable<number>, x: number, y: number, z: number, into = new Uint8Array(v.regions.length)): boolean {
  into.fill(0);
  const R = v.regions.length;
  const may = new Uint8Array(R);
  let open = false;
  for (const a of within) {
    into[a] = 1;
    open ||= v.outdoor[a]!;
    for (let b = 0; b < R; b++) if (v.sees(a, b)) may[b] = 1;
  }
  /** Is one of the points in sight, from the side of its boundary that `way` says (1: outside the region, -1: inside it)? */
  const sight = (points: Float32Array, way: 1 | -1): boolean => {
    for (const [ox, oz] of BOX) {
      const [ex, ez] = [x + ox, z + oz];
      for (let i = 0; i < points.length; i += 5) {
        if (((points[i]! - ex) * points[i + 3]! + (points[i + 2]! - ez) * points[i + 4]!) * way >= 0) continue;
        if (clearLine(map, ex, y, ez, points[i]!, points[i + 1]!, points[i + 2]!)) return true;
      }
    }
    return false;
  };
  const tried = new Uint8Array(2 * R * (R + 1));
  const once = (b: number, from: number, way: number): boolean => {
    const k = (way * R + b) * (R + 1) + from + 1;
    if (tried[k]) return false;
    tried[k] = 1;
    return true;
  };
  let opened = false;
  for (let changed = true; changed; ) {
    changed = false;
    for (let b = 0; b < R && !open; b++) {
      if (!into[b]) continue;
      for (const e of v.entries[b]!) if ((e.from < 0 || v.outdoor[e.from]) && once(b, e.from, 1) && sight(e.points, -1)) open = true;
    }
    if (open && !opened) {
      opened = changed = true;
      for (let b = 0; b < R; b++) if (may[b] && v.outdoor[b]) into[b] = 1;
    }
    for (let b = 0; b < R; b++) {
      if (into[b] || !may[b]) continue;
      for (const e of v.entries[b]!) {
        // (A long boundary - the store's two floors meet all round its atrium - waits until its far side is seen.)
        if (e.points.length > WAITS_OVER * 5 && (e.from < 0 ? !open : !into[e.from])) continue;
        if (!once(b, e.from, 0) || !sight(e.points, 1)) continue;
        into[b] = 1;
        changed = true;
        break;
      }
    }
  }
  return open;
}

const EPS = 0.05;
/** A boundary is sampled this far apart upwards as far as a head reaches, then in bigger steps up the open air. */
const FINE = 0.5;
const FINE_FOR = 3;
const COARSE = 3;
/** The air over a roof's edge: every so many cells along, and this far apart upwards. */
const AIR_EVERY = 4;
const AIR_STEP = 6;

const cache = new WeakMap<CompiledMap, Visibility>();

export function visibility(map: CompiledMap): Visibility {
  let v = cache.get(map);
  if (!v) cache.set(map, (v = build(map)));
  return v;
}

/** Is the straight line between two points clear of walls, floors and ceilings? (Doors and furniture do not count.) */
export function clearLine(map: CompiledMap, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean {
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
  let tMaxX = dx !== 0 ? (dx > 0 ? (cx + 1) * CELL_SIZE - x0 : x0 - cx * CELL_SIZE) / Math.abs(dx) : Infinity;
  let tMaxZ = dz !== 0 ? (dz > 0 ? (cz + 1) * CELL_SIZE - z0 : z0 - cz * CELL_SIZE) / Math.abs(dz) : Infinity;
  let tIn = 0;
  const floor = floorsOf(map);
  const { kind, cap, plane, cols, rows } = map;
  const n = kind.length;
  for (let guard = 0; guard < 4096; guard++) {
    const tOut = Math.min(tMaxX, tMaxZ, 1);
    const ya = y0 + dy * tIn;
    const yb = y0 + dy * tOut;
    const [a, b] = ya < yb ? [ya, yb] : [yb, ya];
    // Is everything between the two heights in this column inside one open space: a cell's, or the air over a roof?
    if (cx < 0 || cz < 0 || cx >= cols || cz >= rows) return false;
    let clear = false;
    for (let i = cz * cols + cx; i < n && !clear; i += plane) clear = kind[i] !== Cell.Solid && a >= floor[i]! - EPS && b <= cap[i]! + EPS;
    if (!clear && !map.clearAir(cx, cz, a - EPS, b)) return false;
    if (tOut >= 1 || (cx === ex && cz === ez)) return true;
    if (tMaxX < tMaxZ) {
      cx += stepX;
      tMaxX += tDeltaX;
    } else {
      cz += stepZ;
      tMaxZ += tDeltaZ;
    }
    tIn = tOut;
  }
  return false;
}

/** The lowest the open space of each cell goes (a ramp's low end). */
const floors = new WeakMap<CompiledMap, Float32Array>();
function floorsOf(map: CompiledMap): Float32Array {
  let f = floors.get(map);
  if (!f) {
    f = new Float32Array(map.kind.length);
    for (let i = 0; i < f.length; i++) f[i] = Math.min(map.lo[i]!, map.slope0[i]!, map.slope1[i]!);
    floors.set(map, f);
  }
  return f;
}
const floorOf = (map: CompiledMap, i: number): number => floorsOf(map)[i]!;

const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

function build(map: CompiledMap): Visibility {
  const { cols, plane } = map;
  const n = map.kind.length;
  const regions = map.zones.map((z) => z.id);
  const R = regions.length;

  // Regions: a zone's own cells, then the roofed cells that are reached from them and belong to no zone.
  const label = new Int16Array(n).fill(-1);
  const queue: number[] = [];
  const outdoor = regions.map(() => false);
  for (let i = 0; i < n; i++) {
    if (map.kind[i] === Cell.Solid || map.zone[i] === NO_ZONE) continue;
    label[i] = map.zone[i]!;
    if (map.sky[i]) outdoor[label[i]!] = true;
    queue.push(i);
  }
  /** The open cells of the column beside `i` whose air overlaps its own. */
  const beside = (i: number, dx: number, dz: number, out: number[]): number[] => {
    out.length = 0;
    const cx = map.cxOf(i) + dx;
    const cz = map.czOf(i) + dz;
    if (!map.inBounds(cx, cz)) return out;
    for (let j = cz * cols + cx; j < n; j += plane) {
      if (map.kind[j] !== Cell.Solid && floorOf(map, j) < map.cap[i]! - EPS && map.cap[j]! > floorOf(map, i) + EPS) out.push(j);
    }
    return out;
  };
  const near: number[] = [];
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!;
    for (const [dx, dz] of SIDES) {
      for (const j of beside(i, dx, dz, near)) {
        if (label[j] !== -1 || map.sky[j]) continue;
        label[j] = label[i]!;
        queue.push(j);
      }
    }
  }

  // Each region's boundary, as points (x, y, z): `side` where its air meets another's, `air` where
  // (under the sky) it meets the air over a lower roof.
  const tops = map.skyline;
  let ceiling = -Infinity;
  for (let i = 0; i < n; i++) if (map.kind[i] !== Cell.Solid) ceiling = Math.max(ceiling, map.lo[i]!);
  if (tops) for (let c = 0; c < plane; c++) ceiling = Math.max(ceiling, tops[c]!);
  ceiling += 2;
  const side: number[][] = regions.map(() => []);
  const air: number[][] = regions.map(() => []);
  const entries: Map<number, number[]>[] = regions.map(() => new Map());
  const joined = regions.map(() => new Uint8Array(R));
  /** Has the region a way into the open air: is it under the sky, or beside a yard or a ledge that is? */
  const airy = [...outdoor];
  // (Each with the way out of the region there, (dx, dz): a line that crosses a boundary crosses it one way.)
  const sample = (into: number[], x: number, z: number, from: number, to: number, coarse: number, dx: number, dz: number): void => {
    const top = Math.min(to, ceiling);
    for (let y = from + 0.15; y < top - 0.05; y += y < from + FINE_FOR ? FINE : coarse) into.push(x, y, z, dx, dz);
  };
  for (let i = 0; i < n; i++) {
    const r = label[i]!;
    if (r < 0) continue;
    const cx = map.cxOf(i);
    const cz = map.czOf(i);
    const lo = floorOf(map, i);
    const cap = map.cap[i]!;
    for (const [dx, dz] of SIDES) {
      // A point on the shared edge, just inside this cell.
      const x = (cx + 0.5 + dx * 0.45) * CELL_SIZE;
      const z = (cz + 0.5 + dz * 0.45) * CELL_SIZE;
      for (const j of beside(i, dx, dz, near)) {
        const other = label[j]!;
        if (other === r) continue;
        if (other < 0) airy[r] = true;
        else joined[r]![other] = 1;
        sample(side[r]!, x, z, Math.max(lo, floorOf(map, j)), Math.min(cap, map.cap[j]!), COARSE, dx, dz);
        if (outdoor[r]) continue;
        // (Closer together along the edge, as these are asked about from wherever an eye happens to be,
        // and hard by each end of it, at the floor and under the top, for the line that only just squeezes past a jamb, a sill or a lintel.)
        const [from, to] = [Math.max(lo, floorOf(map, j)), Math.min(cap, map.cap[j]!, ceiling)];
        const key = Math.max(other, -1);
        const list = entries[r]!.get(key) ?? entries[r]!.set(key, []).get(key)!;
        for (const t of [-0.24, 0, 0.24]) {
          const [px, pz] = [x + (dx === 0 ? t : 0), z + (dz === 0 ? t : 0)];
          sample(list, px, pz, from, to, COARSE, dx, dz);
          list.push(px, from + 0.005, pz, dx, dz, px, to - 0.005, pz, dx, dz);
        }
      }
      // The air over whatever stands beside it (a lower roof, a parapet).
      const [nx, nz] = [cx + dx, cz + dz];
      if (!tops || !map.inBounds(nx, nz) || cap !== Infinity || (cx + cz) % AIR_EVERY !== 0) continue;
      const c = nz * cols + nx;
      let solid = true;
      for (let j = c; j < n; j += plane) if (map.kind[j] !== Cell.Solid && map.cap[j] === Infinity && floorOf(map, j) <= tops[c]! + EPS) solid = false;
      if (solid) sample(air[r]!, x, z, Math.max(lo, tops[c]!) - FINE_FOR, Infinity, AIR_STEP, dx, dz);
    }
  }

  // A line into a region comes through a region beside it (or down out of the air), so a pair is
  // only worth trying once something beside the far one is already seen.
  const beside2 = (a: number, b: number): boolean => joined[a]![b] === 1 || joined[b]![a] === 1 || (airy[a]! && airy[b]!);
  const seen = regions.map((_, a) => {
    const row = new Uint8Array(R);
    row[a] = 1;
    return row;
  });
  const tried = regions.map(() => new Uint8Array(R));
  const any = (pa: number[], pb: number[]): boolean => {
    for (let i = 0; i < pa.length; i += 5) {
      const [x, y, z, nx, nz] = [pa[i]!, pa[i + 1]!, pa[i + 2]!, pa[i + 3]!, pa[i + 4]!];
      for (let j = 0; j < pb.length; j += 5) {
        const [ux, uz] = [pb[j]! - x, pb[j + 2]! - z];
        // Out of the one and into the other.
        if (ux * nx + uz * nz <= 0 || ux * pb[j + 3]! + uz * pb[j + 4]! >= 0) continue;
        if (clearLine(map, x, y, z, pb[j]!, pb[j + 1]!, pb[j + 2]!)) return true;
      }
    }
    return false;
  };
  const pair = (a: number, b: number): boolean => {
    if (joined[a]![b] || joined[b]![a] || (outdoor[a] && outdoor[b])) return true;
    return any(side[a]!, side[b]!) || (outdoor[b]! && any(side[a]!, air[b]!)) || (outdoor[a]! && any(side[b]!, air[a]!));
  };
  for (let changed = true; changed; ) {
    changed = false;
    for (let a = 0; a < R; a++) {
      for (let b = a + 1; b < R; b++) {
        if (seen[a]![b] || tried[a]![b]) continue;
        let reach = false;
        for (let c = 0; c < R && !reach; c++) reach = (seen[a]![c] === 1 && beside2(c, b)) || (seen[b]![c] === 1 && beside2(c, a));
        if (!reach) continue;
        tried[a]![b] = 1;
        if (pair(a, b)) {
          seen[a]![b] = seen[b]![a] = 1;
          changed = true;
        }
      }
    }
  }
  return { regions, label, outdoor, entries: entries.map((m) => [...m].map(([from, pts]) => ({ from, points: new Float32Array(pts) }))), sees: (a, b) => seen[a]?.[b] === 1 };
}
