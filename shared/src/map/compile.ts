import { CELL_SIZE } from '../constants';
import { propDef, propRect, quarterTurns } from '../data/props';
import { FLOOR_STYLES, WALL_STYLES, type Dir, type MapDef, type Opening, type ZSpawn, type ZoneDef } from './types';

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

/** Which doors count as open: a set of opening ids, 'all', or none. */
export type DoorSet = ReadonlySet<string> | 'all' | undefined;

export const DIR_VEC: Record<Dir, { x: number; z: number }> = {
  n: { x: 0, z: -1 },
  s: { x: 0, z: 1 },
  e: { x: 1, z: 0 },
  w: { x: -1, z: 0 },
};

/**
 * The map rasterised to a cell grid. Shared by server (collision checks, nav, line of sight) and
 * client (collision, world mesh building). Pure data + lookups; never mutated after compile.
 */
export class CompiledMap {
  readonly cols: number;
  readonly rows: number;
  readonly kind: Uint8Array;
  /** Index into `zones`, or NO_ZONE. */
  readonly zone: Uint8Array;
  /** Index into `def.openings`, or -1. */
  readonly opening: Int16Array;
  /** Open vertical interval of each non-solid cell. */
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
  /** Height of the prop standing in the cell (0 = none): shots below it are stopped. */
  readonly propH: Float32Array;
  readonly zones: ZoneDef[];
  readonly spawns: ZSpawn[] = [];
  /** zone id -> neighbouring zones and the opening that links them. */
  readonly adjacency = new Map<string, { zone: string; via: string }[]>();
  /** Problems found while rasterising (overlaps, misaligned rects...). Reported by validate. */
  readonly errors: string[] = [];

  constructor(readonly def: MapDef) {
    this.cols = Math.round(def.size.w / CELL_SIZE);
    this.rows = Math.round(def.size.d / CELL_SIZE);
    const n = this.cols * this.rows;
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
    this.zones = def.zones;
  }

  idx(cx: number, cz: number): number {
    return cz * this.cols + cx;
  }

  inBounds(cx: number, cz: number): boolean {
    return cx >= 0 && cz >= 0 && cx < this.cols && cz < this.rows;
  }

  kindAt(cx: number, cz: number): Cell {
    return this.inBounds(cx, cz) ? (this.kind[this.idx(cx, cz)] as Cell) : Cell.Solid;
  }

  /** Can a player stand in this cell? */
  isWalkable(cx: number, cz: number, open?: DoorSet): boolean {
    if (!this.inBounds(cx, cz)) return false;
    const i = this.idx(cx, cz);
    const k = this.kind[i];
    if (k === Cell.Floor) return this.block[i] === 0;
    if (k === Cell.Door) return this.isDoorOpen(i, open);
    return false;
  }

  /** Does this cell block sight/bullets at torso height? Windows, pockets and low props do not. */
  isOpaque(cx: number, cz: number, open?: DoorSet): boolean {
    if (!this.inBounds(cx, cz)) return true;
    const i = this.idx(cx, cz);
    const k = this.kind[i];
    if (k === Cell.Solid) return true;
    if (k === Cell.Door) return !this.isDoorOpen(i, open);
    return this.block[i] === 2;
  }

  private isDoorOpen(i: number, open: DoorSet): boolean {
    if (open === 'all') return true;
    if (!open) return false;
    const o = this.def.openings[this.opening[i]!];
    return !!o && open.has(o.id);
  }

  /** Zone id at a world position, or null (solid, pocket, out of bounds). */
  zoneAt(x: number, z: number): string | null {
    const cx = Math.floor(x / CELL_SIZE);
    const cz = Math.floor(z / CELL_SIZE);
    if (!this.inBounds(cx, cz)) return null;
    const zi = this.zone[this.idx(cx, cz)]!;
    return zi === NO_ZONE ? null : this.zones[zi]!.id;
  }

  openingById(id: string): Opening | undefined {
    return this.def.openings.find((o) => o.id === id);
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

  // 1. Rooms
  for (const room of def.rooms) {
    const zi = zoneIndex.get(room.zone);
    if (zi === undefined) {
      err(`room ${room.id}: unknown zone ${room.zone}`);
      continue;
    }
    const c = checkRect(`room ${room.id}`, room);
    if (!c) continue;
    let overlapped = false;
    for (let cz = c.z0; cz < c.z1; cz++) {
      for (let cx = c.x0; cx < c.x1; cx++) {
        const i = m.idx(cx, cz);
        if (m.kind[i] !== Cell.Solid) overlapped = true;
        m.kind[i] = Cell.Floor;
        m.zone[i] = zi;
        m.lo[i] = 0;
        m.hi[i] = room.ceil;
        m.floorStyle[i] = FLOOR_STYLES.indexOf(room.floor);
        m.wallStyle[i] = WALL_STYLES.indexOf(room.wall);
        m.sky[i] = room.outdoor ? 1 : 0;
        m.tint[i] = room.tint ?? 0xffffff;
      }
    }
    if (overlapped) err(`room ${room.id}: overlaps another room`);
  }

  // Abutting rooms must belong to the same zone (zone boundaries need an opening).
  for (let cz = 1; cz < m.rows; cz++) {
    for (let cx = 1; cx < m.cols; cx++) {
      const i = m.idx(cx, cz);
      if (m.kind[i] !== Cell.Floor) continue;
      for (const j of [m.idx(cx - 1, cz), m.idx(cx, cz - 1)]) {
        if (m.kind[j] === Cell.Floor && m.zone[j] !== m.zone[i]) {
          err(`zones ${m.zones[m.zone[i]!]!.id} and ${m.zones[m.zone[j]!]!.id} touch without a wall near (${cx * CELL_SIZE}, ${cz * CELL_SIZE})`);
          cx = m.cols;
          cz = m.rows;
          break;
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
    if (!c) return;
    const zi = zoneIndex.get(o.zones[0]);
    if (zi === undefined) return err(`opening ${o.id}: unknown zone ${o.zones[0]}`);
    if (o.kind !== 'window' && !zoneIndex.has(o.zones[1])) return err(`opening ${o.id}: unknown zone ${o.zones[1]}`);

    // Borrow surface styles from a neighbouring floor cell of the first zone.
    let src = -1;
    for (let cz = c.z0 - 1; cz <= c.z1 && src < 0; cz++) {
      for (let cx = c.x0 - 1; cx <= c.x1 && src < 0; cx++) {
        const i = m.idx(cx, cz);
        if (m.kind[i] === Cell.Floor && m.zone[i] === zi && m.opening[i] < 0) src = i;
      }
    }
    if (src < 0) return err(`opening ${o.id}: does not touch zone ${o.zones[0]}`);

    let blocked = false;
    for (let cz = c.z0; cz < c.z1; cz++) {
      for (let cx = c.x0; cx < c.x1; cx++) {
        const i = m.idx(cx, cz);
        if (m.kind[i] !== Cell.Solid) blocked = true;
        m.kind[i] = o.kind === 'door' ? Cell.Door : o.kind === 'window' ? Cell.Window : Cell.Floor;
        m.zone[i] = zi;
        m.opening[i] = oi;
        m.lo[i] = o.kind === 'window' ? WINDOW_SILL : 0;
        m.hi[i] = Math.min(m.hi[src]!, o.kind === 'window' ? WINDOW_TOP : o.kind === 'door' ? DOOR_HEIGHT : ARCH_HEIGHT);
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
          const i = m.idx(cx, cz);
          if (m.kind[i] !== Cell.Solid) clash = true;
          m.kind[i] = Cell.Outside;
          m.opening[i] = oi;
          m.lo[i] = 0;
          m.hi[i] = Math.max(3, m.hi[src]!);
          m.floorStyle[i] = FLOOR_STYLES.indexOf('snow');
          m.wallStyle[i] = WALL_STYLES.indexOf('rock');
          m.sky[i] = 1;
        }
      }
      if (clash) err(`window ${o.id}: pocket overlaps something`);
      const cxMid = ((p.x0 + p.x1) / 2) * CELL_SIZE;
      const czMid = ((p.z0 + p.z1) / 2) * CELL_SIZE;
      const back = (depth * CELL_SIZE) / 2 - 0.75;
      m.spawns.push({ id: `sp_${o.id}`, x: cxMid + v.x * back, z: czMid + v.z * back, windowId: o.id });
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
  for (let cz = 1; cz < m.rows - 1; cz++) {
    for (let cx = 1; cx < m.cols - 1; cx++) {
      if (m.kind[m.idx(cx, cz)] !== Cell.Outside) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const j = m.idx(cx + dx, cz + dz);
        const k = m.kind[j];
        if (k === Cell.Floor || k === Cell.Door) err(`pocket of ${def.openings[m.opening[m.idx(cx, cz)]!]!.id} leaks into a room at (${cx * CELL_SIZE}, ${cz * CELL_SIZE})`);
        if (k === Cell.Outside && m.opening[j] !== m.opening[m.idx(cx, cz)]) err(`pockets touch at (${cx * CELL_SIZE}, ${cz * CELL_SIZE})`);
      }
    }
  }

  // 3. Props: the solid ones take their cells out of the floor.
  def.props.forEach((p, pi) => {
    const pd = propDef(p.type);
    const what = `prop ${pi} (${p.type} at ${p.x}, ${p.z})`;
    if (!pd) return err(`${what}: unknown type`);
    if (!pd.solid) {
      if (m.kindAt(Math.floor(p.x / CELL_SIZE), Math.floor(p.z / CELL_SIZE)) === Cell.Solid && !pd.wall) err(`${what}: inside solid`);
      return;
    }
    if (quarterTurns(p.rot) < 0) return err(`${what}: solid props turn in quarter turns only`);
    const c = checkRect(what, propRect(pd, p));
    if (!c) return;
    let bad = '';
    for (let cz = c.z0; cz < c.z1; cz++) {
      for (let cx = c.x0; cx < c.x1; cx++) {
        const i = m.idx(cx, cz);
        if (m.kind[i] !== Cell.Floor || m.opening[i]! >= 0) bad = 'must stand on room floor';
        else if (m.block[i]) bad = 'overlaps another prop';
        m.block[i] = pd.tall ? 2 : 1;
        m.propH[i] = pd.h;
      }
    }
    if (bad) err(`${what}: ${bad}`);
  });
  return m;
}
