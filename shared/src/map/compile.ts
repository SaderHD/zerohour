import { CELL_SIZE, MIN_HEADROOM, STEP_HEIGHT } from '../constants';
import { propDef, propRect, quarterTurns } from '../data/props';
import { FLOOR_STYLES, WALL_STYLES, type Dir, type Interactable, type LevelDef, type MapDef, type Opening, type ZSpawn, type ZoneDef } from './types';

export const enum Cell {
  Solid = 0,
  Floor = 1,
  Door = 2,
  Window = 3,
  /** Enclosed outdoor pocket behind a window. Zombies only. */
  Outside = 4,
}

export const NO_ZONE = 255;
export const DOOR_HEIGHT = 2.3;
export const ARCH_HEIGHT = 2.4;
export const WINDOW_SILL = 0.9;
export const WINDOW_TOP = 2.1;
const DEFAULT_POCKET = 3;
/** Least thickness of the slab between a ceiling and the floor above it. */
const MIN_SLAB = 0.1;
const STEP_EPS = 1e-3;
/** The eight neighbours of a cell, in the order `CompiledMap.links` lists them: four orthogonal, then four diagonal. */
export const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

/** Which doors count as open: a set of opening ids, 'all', or none. */
export type DoorSet = ReadonlySet<string> | 'all' | undefined;

export const DIRS: readonly Dir[] = ['n', 's', 'e', 'w'];

export const DIR_VEC: Record<Dir, { x: number; z: number }> = {
  n: { x: 0, z: -1 },
  s: { x: 0, z: 1 },
  e: { x: 1, z: 0 },
  w: { x: -1, z: 0 },
};

/**
 * The map rasterised to cells. Shared by server (collision checks, nav, line of sight) and
 * client (collision, world mesh building). Pure data + lookups; never mutated after compile.
 *
 * The grid is a stack of `layers` (one per storey), each `cols` x `rows`; a cell's index is
 * `layer * plane + cz * cols + cx`. Every open cell has a floor height `lo` and a ceiling `hi`
 * (absolute metres), and the open intervals of the cells in one column never overlap. A storey is
 * only where a cell is stored: what joins two cells is their floors lying within STEP_HEIGHT of
 * each other, so a staircase is a run of cells each a riser above the last, and it can end beside a
 * cell of the layer above. Anything taller is a ledge, and a wall to whoever walks.
 */
export class CompiledMap {
  readonly cols: number;
  readonly rows: number;
  /** Cells in one layer. */
  readonly plane: number;
  readonly layers: number;
  /** The storeys, lowest first; `levels[l]` is layer `l`. */
  readonly levels: LevelDef[];
  /** The layer of level 0. */
  readonly ground: number;
  readonly kind: Uint8Array;
  /** Index into `zones`, or NO_ZONE. */
  readonly zone: Uint8Array;
  /** Index into `def.openings`, or -1. */
  readonly opening: Int16Array;
  /** Open vertical interval of each non-solid cell, absolute: its floor (a window's sill) and its ceiling. */
  readonly lo: Float32Array;
  readonly hi: Float32Array;
  readonly floorStyle: Uint8Array;
  readonly wallStyle: Uint8Array;
  /** 1 = no ceiling. */
  readonly sky: Uint8Array;
  /** Linear-ish multiplier colour per cell (hex), from the room tint. */
  readonly tint: Uint32Array;
  /** Solid props on floor cells: 0 none, 1 blocks movement, 2 also blocks sight. */
  readonly block: Uint8Array;
  /** Height above its floor of the prop standing in the cell (0 = none): shots below it are stopped. */
  readonly propH: Float32Array;
  /** 1 + the direction index (n s e w) a ramp or stair cell climbs towards, +4 for stairs; 0 on level floor. */
  readonly rise: Uint8Array;
  /**
   * How a floor is drawn: its height along the cell's downhill and uphill edges. The same as `lo`
   * except on a ramp, which is walked as shallow steps but drawn (and stood on, see `groundAt`) as
   * one slope from the floor at its foot to the floor at its head.
   */
  readonly slope0: Float32Array;
  readonly slope1: Float32Array;
  /**
   * For each cell, the cell a walker reaches by stepping to each of its eight NEIGHBOURS (-1: a
   * wall or a ledge). Heights only: doors and furniture are the caller's business.
   */
  readonly links: Int32Array;
  readonly zones: ZoneDef[];
  readonly spawns: ZSpawn[] = [];
  /** Player spawn points with the height of the floor under them. */
  readonly playerSpawns: { x: number; y: number; z: number; yaw: number }[] = [];
  /** Floor height at each opening (index as `def.openings`): where someone using it stands. */
  readonly openingY: Float32Array;
  /** Floor height in front of each interactable, by id. */
  readonly mountY = new Map<string, number>();
  /** zone id -> neighbouring zones and the opening that links them. */
  readonly adjacency = new Map<string, { zone: string; via: string }[]>();
  /** Problems found while rasterising (overlaps, misaligned rects...). Reported by validate. */
  readonly errors: string[] = [];

  constructor(readonly def: MapDef) {
    this.cols = Math.round(def.size.w / CELL_SIZE);
    this.rows = Math.round(def.size.d / CELL_SIZE);
    this.plane = this.cols * this.rows;
    const levels = new Map<number, LevelDef>([[0, { level: 0, name: 'Ground', y: 0 }]]);
    for (const l of def.levels ?? []) levels.set(l.level, l);
    this.levels = [...levels.values()].sort((a, b) => a.level - b.level);
    this.layers = this.levels.length;
    this.ground = this.levels.findIndex((l) => l.level === 0);
    const n = this.plane * this.layers;
    this.kind = new Uint8Array(n);
    this.zone = new Uint8Array(n).fill(NO_ZONE);
    this.opening = new Int16Array(n).fill(-1);
    this.lo = new Float32Array(n);
    this.hi = new Float32Array(n);
    this.floorStyle = new Uint8Array(n);
    this.wallStyle = new Uint8Array(n);
    this.sky = new Uint8Array(n);
    this.tint = new Uint32Array(n).fill(0xffffff);
    this.block = new Uint8Array(n);
    this.propH = new Float32Array(n);
    this.rise = new Uint8Array(n);
    this.slope0 = new Float32Array(n);
    this.slope1 = new Float32Array(n);
    this.links = new Int32Array(n * 8).fill(-1);
    this.openingY = new Float32Array(def.openings.length);
    this.zones = def.zones;
  }

  /** Index of a cell; without a layer, the ground's. */
  idx(cx: number, cz: number, layer = this.ground): number {
    return layer * this.plane + cz * this.cols + cx;
  }

  /** The layer a storey is stored in, or -1 if the map has no such level. */
  layerOf(level = 0): number {
    return level === 0 ? this.ground : this.levels.findIndex((l) => l.level === level);
  }

  cxOf(i: number): number {
    return (i % this.plane) % this.cols;
  }

  czOf(i: number): number {
    return Math.floor((i % this.plane) / this.cols);
  }

  layerOfCell(i: number): number {
    return Math.floor(i / this.plane);
  }

  inBounds(cx: number, cz: number): boolean {
    return cx >= 0 && cz >= 0 && cx < this.cols && cz < this.rows;
  }

  kindAt(cx: number, cz: number, layer = this.ground): Cell {
    return this.inBounds(cx, cz) ? (this.kind[this.idx(cx, cz, layer)] as Cell) : Cell.Solid;
  }

  /** Is anything open in this column, on any layer? */
  openColumn(cx: number, cz: number): boolean {
    if (!this.inBounds(cx, cz)) return false;
    for (let i = cz * this.cols + cx; i < this.kind.length; i += this.plane) if (this.kind[i] !== Cell.Solid) return true;
    return false;
  }

  /**
   * The cell someone with their feet at height `y` stands on in this column: the one whose floor
   * is within a step of `y`. -1 if there is none (solid, or the floors here are a ledge away).
   */
  standAt(cx: number, cz: number, y: number): number {
    if (!this.inBounds(cx, cz)) return -1;
    let best = -1;
    let bestD = STEP_HEIGHT + STEP_EPS;
    for (let i = cz * this.cols + cx; i < this.kind.length; i += this.plane) {
      const k = this.kind[i];
      if (k === Cell.Solid || k === Cell.Window) continue;
      const d = Math.abs(this.lo[i]! - y);
      if (d <= bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  /** The cell whose open space holds the point at height `y` in this column (open sky has no top), or -1. */
  holdAt(cx: number, cz: number, y: number): number {
    if (!this.inBounds(cx, cz)) return -1;
    for (let i = cz * this.cols + cx; i < this.kind.length; i += this.plane) {
      const k = this.kind[i];
      if (k === Cell.Solid || y < this.lo[i]!) continue;
      if (this.sky[i] || k === Cell.Outside || y <= this.hi[i]!) return i;
    }
    return -1;
  }

  /** The cell under a world position with its feet at `y`, or -1. */
  cellAt(x: number, y: number, z: number): number {
    return this.standAt(Math.floor(x / CELL_SIZE), Math.floor(z / CELL_SIZE), y);
  }

  /** Height of the floor under someone at (x, z) whose feet were at about `y`; `y` itself where there is none. */
  floorAt(x: number, y: number, z: number): number {
    const i = this.cellAt(x, y, z);
    return i < 0 ? y : this.lo[i]!;
  }

  /** Height of the floor below a point in the air (a thrown thing, a blast); `y` itself where the point is in solid. */
  floorUnder(x: number, y: number, z: number): number {
    const i = this.holdAt(Math.floor(x / CELL_SIZE), Math.floor(z / CELL_SIZE), y);
    return i < 0 ? y : this.kind[i] === Cell.Window ? this.lo[i]! - WINDOW_SILL : this.lo[i]!;
  }

  /**
   * The floor someone at (x, z) is on when all that is known is roughly how high they are: the
   * walkable floor nearest `y` in that column, or NaN if nobody could stand there.
   */
  nearestFloor(x: number, y: number, z: number, open?: DoorSet): number {
    const cx = Math.floor(x / CELL_SIZE);
    const cz = Math.floor(z / CELL_SIZE);
    if (!this.inBounds(cx, cz)) return NaN;
    let best = NaN;
    for (let i = cz * this.cols + cx; i < this.kind.length; i += this.plane) {
      if (this.walkable(i, open) && !(Math.abs(this.lo[i]! - y) >= Math.abs(best - y))) best = this.lo[i]!;
    }
    return best;
  }

  /** Height of the drawn floor of cell `i` under (x, z): `lo`, or the point on a ramp's slope. */
  groundIn(i: number, x: number, z: number): number {
    const r = this.rise[i]!;
    if (r === 0 || r > 4 || this.slope0[i] === this.slope1[i]) return this.kind[i] === Cell.Window ? this.lo[i]! - WINDOW_SILL : this.lo[i]!;
    const v = DIR_VEC[DIRS[r - 1]!];
    // How far across the cell towards its uphill edge, 0..1.
    const u = v.x !== 0 ? x / CELL_SIZE - this.cxOf(i) : z / CELL_SIZE - this.czOf(i);
    const k = Math.max(0, Math.min(1, v.x + v.z > 0 ? u : 1 - u));
    return this.slope0[i]! + (this.slope1[i]! - this.slope0[i]!) * k;
  }

  /** Where the feet of someone standing at (x, z) on the floor at height `y` are drawn. */
  groundAt(x: number, y: number, z: number): number {
    const i = this.cellAt(x, y, z);
    return i < 0 ? y : this.groundIn(i, x, z);
  }

  /**
   * Where to draw the feet of a body whose (possibly smoothed) floor height is `y`: on a ramp, the
   * slope under it; anywhere else `y` itself, so that a climb up stairs is as smooth as `y` is.
   */
  footAt(x: number, y: number, z: number): number {
    const i = this.cellAt(x, y, z);
    return i >= 0 && this.slope0[i] !== this.slope1[i] ? this.groundIn(i, x, z) : y;
  }

  /** Can a player stand in this cell? */
  walkable(i: number, open?: DoorSet): boolean {
    const k = this.kind[i];
    if (k === Cell.Floor) return this.block[i] === 0;
    if (k === Cell.Door) return this.isDoorOpen(i, open);
    return false;
  }

  /** The cell a walker at height `y` can stand on in this column, or -1 (wall, ledge, furniture, shut door). */
  walkAt(cx: number, cz: number, y: number, open?: DoorSet): number {
    const i = this.standAt(cx, cz, y);
    return i >= 0 && this.walkable(i, open) ? i : -1;
  }

  /** Does this cell stop sight and shots across the whole of its height? (A shut door, tall furniture.) */
  shut(i: number, open?: DoorSet): boolean {
    return this.kind[i] === Cell.Door ? !this.isDoorOpen(i, open) : this.block[i] === 2;
  }

  /** Can a sight line cross this column between heights `a` and `b` (a <= b)? Low props do not stop it. */
  seeThrough(cx: number, cz: number, a: number, b: number, open?: DoorSet): boolean {
    if (!this.inBounds(cx, cz)) return false;
    for (let i = cz * this.cols + cx; i < this.kind.length; i += this.plane) {
      const k = this.kind[i];
      if (k === Cell.Solid || a < this.lo[i]! - 0.01) continue;
      if (!this.sky[i] && k !== Cell.Outside && b > this.hi[i]! + 0.01) continue;
      return !this.shut(i, open);
    }
    return false;
  }

  /**
   * Is there one open space in this column that holds everything between heights `a` and `b`?
   * For the two ends of a sight line, which stand in their cells whatever is in them (a doorway,
   * a window): only a floor or ceiling between the heights says no. A column of solid says yes,
   * as it does not come between anything.
   */
  spanOpen(cx: number, cz: number, a: number, b: number): boolean {
    if (!this.inBounds(cx, cz)) return true;
    let any = false;
    for (let i = cz * this.cols + cx; i < this.kind.length; i += this.plane) {
      const k = this.kind[i];
      if (k === Cell.Solid) continue;
      any = true;
      // (A window's own cell is open from the floor up for whoever is climbing through it.)
      const lo = k === Cell.Window ? this.lo[i]! - WINDOW_SILL : this.lo[i]!;
      if (a >= lo - 0.01 && (this.sky[i] || k === Cell.Outside || k === Cell.Window || b <= this.hi[i]! + 0.01)) return true;
    }
    return !any;
  }

  isDoorOpen(i: number, open: DoorSet): boolean {
    if (open === 'all') return true;
    if (!open) return false;
    const o = this.def.openings[this.opening[i]!];
    return !!o && open.has(o.id);
  }

  /** Zone id at a world position with its feet at `y`, or null (solid, pocket, out of bounds). */
  zoneAt(x: number, y: number, z: number): string | null {
    const i = this.holdAt(Math.floor(x / CELL_SIZE), Math.floor(z / CELL_SIZE), y + 1);
    if (i < 0) return null;
    const zi = this.zone[i]!;
    return zi === NO_ZONE ? null : this.zones[zi]!.id;
  }

  /** Floor height of a storey's cell under (x, z): for placing things given by level. NaN where it has no floor. */
  floorOn(level: number | undefined, x: number, z: number): number {
    const l = this.layerOf(level ?? 0);
    const cx = Math.floor(x / CELL_SIZE);
    const cz = Math.floor(z / CELL_SIZE);
    if (l < 0 || !this.inBounds(cx, cz)) return NaN;
    const i = this.idx(cx, cz, l);
    return this.kind[i] === Cell.Solid ? NaN : this.lo[i]!;
  }

  /** Zone of a storey's cell under (x, z): for things placed by level (props, lights). Null where it has none. */
  zoneOn(level: number | undefined, x: number, z: number): string | null {
    const l = this.layerOf(level ?? 0);
    const cx = Math.floor(x / CELL_SIZE);
    const cz = Math.floor(z / CELL_SIZE);
    if (l < 0 || !this.inBounds(cx, cz)) return null;
    const zi = this.zone[this.idx(cx, cz, l)]!;
    return zi === NO_ZONE ? null : this.zones[zi]!.id;
  }

  /** Where someone stands to use an interactable: the height of the floor in front of it. */
  mountHeight(it: Interactable): number {
    return this.mountY.get(it.id) ?? 0;
  }

  openingById(id: string): Opening | undefined {
    return this.def.openings.find((o) => o.id === id);
  }

  /** Floor height at an opening (a window: the floor inside it). */
  openingHeight(o: Opening): number {
    return this.openingY[this.def.openings.indexOf(o)] ?? 0;
  }
}

const aligned = (v: number): boolean => Math.abs(v / CELL_SIZE - Math.round(v / CELL_SIZE)) < 1e-6;

interface CellRect {
  x0: number;
  z0: number;
  x1: number;
  z1: number; // exclusive
}

function toCells(r: { x: number; z: number; w: number; d: number }): CellRect {
  return {
    x0: Math.round(r.x / CELL_SIZE),
    z0: Math.round(r.z / CELL_SIZE),
    x1: Math.round((r.x + r.w) / CELL_SIZE),
    z1: Math.round((r.z + r.d) / CELL_SIZE),
  };
}

export function compileMap(def: MapDef): CompiledMap {
  const m = new CompiledMap(def);
  const err = (s: string) => m.errors.push(s);
  const zoneIndex = new Map(def.zones.map((z, i) => [z.id, i]));

  const checkRect = (what: string, r: { x: number; z: number; w: number; d: number }): CellRect | null => {
    if (![r.x, r.z, r.w, r.d].every(aligned)) err(`${what}: not aligned to the ${CELL_SIZE} m grid`);
    if (r.w <= 0 || r.d <= 0) {
      err(`${what}: empty rect`);
      return null;
    }
    const c = toCells(r);
    if (c.x0 < 1 || c.z0 < 1 || c.x1 > m.cols - 1 || c.z1 > m.rows - 1) {
      err(`${what}: outside the map bounds (need a 1-cell solid border)`);
      return null;
    }
    return c;
  };
  const layerFor = (what: string, level: number | undefined): number => {
    const l = m.layerOf(level ?? 0);
    if (l < 0) err(`${what}: the map has no level ${level}`);
    return l;
  };

  // 1. Rooms
  for (const room of def.rooms) {
    const zi = zoneIndex.get(room.zone);
    if (zi === undefined) {
      err(`room ${room.id}: unknown zone ${room.zone}`);
      continue;
    }
    const c = checkRect(`room ${room.id}`, room);
    const layer = layerFor(`room ${room.id}`, room.level);
    if (!c || layer < 0) continue;
    const base = m.levels[layer]!.y + (room.y ?? 0);
    // A rise: `n` cells along its axis make n + 1 equal risers between the floors at its two ends.
    const r = room.rise;
    const v = r ? DIR_VEC[r.to] : null;
    const n = v ? (v.x !== 0 ? c.x1 - c.x0 : c.z1 - c.z0) : 0;
    if (r && Math.abs(r.by) / (n + 1) > STEP_HEIGHT + STEP_EPS) err(`room ${room.id}: rises ${(Math.abs(r.by) / (n + 1)).toFixed(2)} m a cell, too steep to walk (most ${STEP_HEIGHT})`);
    let overlapped = false;
    for (let cz = c.z0; cz < c.z1; cz++) {
      for (let cx = c.x0; cx < c.x1; cx++) {
        const i = m.idx(cx, cz, layer);
        if (m.kind[i] !== Cell.Solid) overlapped = true;
        m.kind[i] = Cell.Floor;
        m.zone[i] = zi;
        let lo = base;
        if (r && v) {
          const k = v.x > 0 ? cx - c.x0 : v.x < 0 ? c.x1 - 1 - cx : v.z > 0 ? cz - c.z0 : c.z1 - 1 - cz;
          lo += (r.by * (k + 1)) / (n + 1);
          m.rise[i] = 1 + DIRS.indexOf(r.to) + (r.stairs ? 4 : 0);
        }
        m.lo[i] = lo;
        m.slope0[i] = m.slope1[i] = lo;
        if (r && v && !r.stairs) {
          const k = v.x > 0 ? cx - c.x0 : v.x < 0 ? c.x1 - 1 - cx : v.z > 0 ? cz - c.z0 : c.z1 - 1 - cz;
          m.slope0[i] = base + (r.by * k) / n;
          m.slope1[i] = base + (r.by * (k + 1)) / n;
        }
        m.hi[i] = base + room.ceil;
        m.floorStyle[i] = FLOOR_STYLES.indexOf(room.floor);
        m.wallStyle[i] = WALL_STYLES.indexOf(room.wall);
        m.sky[i] = room.outdoor ? 1 : 0;
        m.tint[i] = room.tint ?? 0xffffff;
      }
    }
    if (overlapped) err(`room ${room.id}: overlaps another room`);
  }

  // Abutting rooms must belong to the same zone (zone boundaries need an opening).
  for (let layer = 0; layer < m.layers; layer++) {
    for (let cz = 1; cz < m.rows; cz++) {
      for (let cx = 1; cx < m.cols; cx++) {
        const i = m.idx(cx, cz, layer);
        if (m.kind[i] !== Cell.Floor) continue;
        for (const j of [i - 1, i - m.cols]) {
          if (m.kind[j] === Cell.Floor && m.zone[j] !== m.zone[i]) {
            err(`zones ${m.zones[m.zone[i]!]!.id} and ${m.zones[m.zone[j]!]!.id} touch without a wall near (${cx * CELL_SIZE}, ${cz * CELL_SIZE})`);
            cx = m.cols;
            cz = m.rows;
            break;
          }
        }
      }
    }
  }

  // 2. Openings
  const seen = new Set<string>();
  def.openings.forEach((o, oi) => {
    if (seen.has(o.id)) err(`opening ${o.id}: duplicate id`);
    seen.add(o.id);
    const c = checkRect(`opening ${o.id}`, o);
    const layer = layerFor(`opening ${o.id}`, o.level);
    if (!c || layer < 0) return;
    const zi = zoneIndex.get(o.zones[0]);
    if (zi === undefined) return err(`opening ${o.id}: unknown zone ${o.zones[0]}`);
    if (o.kind !== 'window' && !zoneIndex.has(o.zones[1])) return err(`opening ${o.id}: unknown zone ${o.zones[1]}`);

    // Borrow surface styles from a neighbouring floor cell of the first zone.
    let src = -1;
    for (let cz = c.z0 - 1; cz <= c.z1 && src < 0; cz++) {
      for (let cx = c.x0 - 1; cx <= c.x1 && src < 0; cx++) {
        const i = m.idx(cx, cz, layer);
        if (m.kind[i] === Cell.Floor && m.zone[i] === zi && m.opening[i] < 0) src = i;
      }
    }
    if (src < 0) return err(`opening ${o.id}: does not touch zone ${o.zones[0]}`);
    const floor = m.lo[src]!;
    m.openingY[oi] = floor;

    let blocked = false;
    for (let cz = c.z0; cz < c.z1; cz++) {
      for (let cx = c.x0; cx < c.x1; cx++) {
        const i = m.idx(cx, cz, layer);
        if (m.kind[i] !== Cell.Solid) blocked = true;
        m.kind[i] = o.kind === 'door' ? Cell.Door : o.kind === 'window' ? Cell.Window : Cell.Floor;
        m.zone[i] = zi;
        m.opening[i] = oi;
        m.lo[i] = o.kind === 'window' ? floor + WINDOW_SILL : floor;
        m.slope0[i] = m.slope1[i] = m.lo[i]!;
        m.hi[i] = Math.min(m.hi[src]!, floor + (o.kind === 'window' ? WINDOW_TOP : o.kind === 'door' ? DOOR_HEIGHT : ARCH_HEIGHT));
        m.floorStyle[i] = m.floorStyle[src]!;
        m.wallStyle[i] = m.wallStyle[src]!;
        m.tint[i] = m.tint[src]!;
      }
    }
    if (blocked) err(`opening ${o.id}: must be carved through solid wall`);

    if (o.kind === 'window') {
      if (!o.out) return err(`window ${o.id}: missing 'out' direction`);
      const depth = Math.round((o.pocket ?? DEFAULT_POCKET) / CELL_SIZE);
      const v = DIR_VEC[o.out];
      // Pocket: `depth` cells beyond the window, one cell wider on each side.
      const p: CellRect =
        v.x !== 0
          ? { x0: v.x > 0 ? c.x1 : c.x0 - depth, x1: v.x > 0 ? c.x1 + depth : c.x0, z0: c.z0 - 1, z1: c.z1 + 1 }
          : { z0: v.z > 0 ? c.z1 : c.z0 - depth, z1: v.z > 0 ? c.z1 + depth : c.z0, x0: c.x0 - 1, x1: c.x1 + 1 };
      if (p.x0 < 1 || p.z0 < 1 || p.x1 > m.cols - 1 || p.z1 > m.rows - 1) return err(`window ${o.id}: pocket leaves the map`);
      let clash = false;
      for (let cz = p.z0; cz < p.z1; cz++) {
        for (let cx = p.x0; cx < p.x1; cx++) {
          const i = m.idx(cx, cz, layer);
          if (m.kind[i] !== Cell.Solid) clash = true;
          m.kind[i] = Cell.Outside;
          m.opening[i] = oi;
          m.lo[i] = floor;
          m.slope0[i] = m.slope1[i] = floor;
          m.hi[i] = floor + Math.max(3, m.hi[src]! - floor);
          m.floorStyle[i] = FLOOR_STYLES.indexOf('snow');
          m.wallStyle[i] = WALL_STYLES.indexOf('rock');
          m.sky[i] = 1;
        }
      }
      if (clash) err(`window ${o.id}: pocket overlaps something`);
      const cxMid = ((p.x0 + p.x1) / 2) * CELL_SIZE;
      const czMid = ((p.z0 + p.z1) / 2) * CELL_SIZE;
      const back = (depth * CELL_SIZE) / 2 - 0.75;
      m.spawns.push({ id: `sp_${o.id}`, x: cxMid + v.x * back, y: floor, z: czMid + v.z * back, windowId: o.id });
    } else {
      const [a, b] = o.zones;
      if (a !== b) {
        if (!m.adjacency.has(a)) m.adjacency.set(a, []);
        if (!m.adjacency.has(b)) m.adjacency.set(b, []);
        m.adjacency.get(a)!.push({ zone: b, via: o.id });
        m.adjacency.get(b)!.push({ zone: a, via: o.id });
      }
    }
  });

  // Pockets must be sealed from rooms except through their window.
  for (let layer = 0; layer < m.layers; layer++) {
    for (let cz = 1; cz < m.rows - 1; cz++) {
      for (let cx = 1; cx < m.cols - 1; cx++) {
        const i = m.idx(cx, cz, layer);
        if (m.kind[i] !== Cell.Outside) continue;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const j = m.idx(cx + dx, cz + dz, layer);
          const k = m.kind[j];
          if (k === Cell.Floor || k === Cell.Door) err(`pocket of ${def.openings[m.opening[i]!]!.id} leaks into a room at (${cx * CELL_SIZE}, ${cz * CELL_SIZE})`);
          if (k === Cell.Outside && m.opening[j] !== m.opening[i]) err(`pockets touch at (${cx * CELL_SIZE}, ${cz * CELL_SIZE})`);
        }
      }
    }
  }

  // Storeys: what is open in one column must not run into what is open above it.
  let stacked = '';
  for (let c = 0; c < m.plane && !stacked; c++) {
    let top = -Infinity;
    let roofless = false;
    for (let i = c; i < m.kind.length; i += m.plane) {
      if (m.kind[i] === Cell.Solid) continue;
      const floor = m.kind[i] === Cell.Window ? m.lo[i]! - WINDOW_SILL : m.lo[i]!;
      const where = `(${(c % m.cols) * CELL_SIZE}, ${Math.floor(c / m.cols) * CELL_SIZE})`;
      if (roofless) stacked = `level ${m.levels[m.layerOfCell(i)]!.level} lies over open sky at ${where}`;
      else if (floor < top + MIN_SLAB - STEP_EPS) stacked = `level ${m.levels[m.layerOfCell(i)]!.level} has its floor inside the room below at ${where} (floor ${floor.toFixed(2)}, ceiling below ${top.toFixed(2)})`;
      if (m.kind[i] !== Cell.Window && m.hi[i]! - m.lo[i]! < MIN_HEADROOM - STEP_EPS) stacked ||= `only ${(m.hi[i]! - m.lo[i]!).toFixed(2)} m of headroom at ${where} on level ${m.levels[m.layerOfCell(i)]!.level}`;
      top = m.hi[i]!;
      roofless = m.sky[i] === 1 || m.kind[i] === Cell.Outside;
    }
  }
  if (stacked) err(stacked);

  // 3. Props: the solid ones take their cells out of the floor.
  def.props.forEach((p, pi) => {
    const pd = propDef(p.type);
    const what = `prop ${pi} (${p.type} at ${p.x}, ${p.z})`;
    if (!pd) return err(`${what}: unknown type`);
    const layer = layerFor(what, p.level);
    if (layer < 0) return;
    if (!pd.solid) {
      if (m.kindAt(Math.floor(p.x / CELL_SIZE), Math.floor(p.z / CELL_SIZE), layer) === Cell.Solid && !pd.wall) err(`${what}: inside solid`);
      return;
    }
    if (quarterTurns(p.rot) < 0) return err(`${what}: solid props turn in quarter turns only`);
    const c = checkRect(what, propRect(pd, p));
    if (!c) return;
    let bad = '';
    for (let cz = c.z0; cz < c.z1; cz++) {
      for (let cx = c.x0; cx < c.x1; cx++) {
        const i = m.idx(cx, cz, layer);
        if (m.kind[i] !== Cell.Floor || m.opening[i]! >= 0) bad = 'must stand on room floor';
        else if (m.block[i]) bad = 'overlaps another prop';
        else if (m.rise[i]) bad = 'stands on a ramp or stairs';
        m.block[i] = pd.tall ? 2 : 1;
        m.propH[i] = pd.h;
      }
    }
    if (bad) err(`${what}: ${bad}`);
  });

  // 4. Who can step where: floors within a step of each other join, whatever layer they are stored on.
  const stands = (i: number): boolean => m.kind[i] === Cell.Floor || m.kind[i] === Cell.Door;
  for (let i = 0; i < m.kind.length; i++) {
    if (!stands(i)) continue;
    const cx = m.cxOf(i);
    const cz = m.czOf(i);
    for (let n = 0; n < 4; n++) {
      const j = m.standAt(cx + NEIGHBOURS[n]![0], cz + NEIGHBOURS[n]![1], m.lo[i]!);
      if (j >= 0 && stands(j)) m.links[i * 8 + n] = j;
    }
  }
  for (let i = 0; i < m.kind.length; i++) {
    if (!stands(i)) continue;
    for (let n = 4; n < 8; n++) {
      // A diagonal step needs both ways round the corner to be open and to arrive at the same cell.
      const a = m.links[i * 8 + (NEIGHBOURS[n]![0] > 0 ? 0 : 1)]!;
      const b = m.links[i * 8 + (NEIGHBOURS[n]![1] > 0 ? 2 : 3)]!;
      if (a < 0 || b < 0) continue;
      const j = m.links[a * 8 + (NEIGHBOURS[n]![1] > 0 ? 2 : 3)]!;
      if (j >= 0 && j === m.links[b * 8 + (NEIGHBOURS[n]![0] > 0 ? 0 : 1)] && Math.abs(m.lo[j]! - m.lo[i]!) <= STEP_HEIGHT + STEP_EPS) m.links[i * 8 + n] = j;
    }
  }

  // 5. Where people stand: spawn points, and the floor in front of each thing they use.
  for (const [i, s] of def.playerSpawns.entries()) {
    const y = m.floorOn(s.level, s.x, s.z);
    if (Number.isNaN(y)) err(`player spawn ${i}: no floor under it on level ${s.level ?? 0}`);
    m.playerSpawns.push({ x: s.x, y: Number.isNaN(y) ? 0 : y, z: s.z, yaw: s.yaw });
  }
  for (const it of def.interactables) {
    const v = DIR_VEC[it.facing];
    let y = NaN;
    for (const f of [0.75, 0.25, 1.25, 0]) if (Number.isNaN(y)) y = m.floorOn(it.level, it.x + v.x * f, it.z + v.z * f);
    if (Number.isNaN(y)) err(`interactable ${it.id}: no floor in front of it on level ${it.level ?? 0}`);
    else m.mountY.set(it.id, y);
  }
  return m;
}
