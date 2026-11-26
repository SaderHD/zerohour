import { CELL_SIZE, Cell, STOREY, massing, type CompiledMap, type FloorStyle, type WallStyle } from '@zh/shared';
import type { Baker, Bucket, RGB, Vert } from './bake';
import { linear } from './materials';

// A city seen from outside (`scene.built: 'city'`). The world builder draws a street's walls as
// far up as its room says (`Room.ceil`) and stops; every building carries on from there to the
// top of its block (shared `map/massing.ts`): the same wall, lit by the same lamps, with a string
// course over the ground storey, a row of windows to each storey, a cornice, and above it a roof
// under snow with whatever stands on roofs. Nobody goes there: it is drawn, never walked.

type V3 = [number, number, number];

/** Where the buckets are: the world's own surfaces (so a block's brick is the street's brick), props, things that glow. */
export interface CitySinks {
  /** (Each takes the open-air cell the thing is seen from, if it stands over one: it is drawn with that cell's zone, and left out with it.) */
  surface(kind: 'floor' | 'wall', style: FloorStyle | WallStyle, cell?: number): Bucket;
  prop(cell?: number): Bucket;
  glow(cell?: number): Bucket;
}

const S = CELL_SIZE;
const TEX_METRES = 2;
/** Windows stand one to a bay this many cells wide. */
const BAY = 5;
const WINDOW = { w: 1.3, sill: 1.1, head: 2.9 };
/** Clear wall a window needs over the string course under it and under the roof over it. */
const OVER_COURSE = 0.45;
const UNDER_ROOF = 0.6;
/** Walls dim as they climb away from the street lamps: from full at `DIM_FROM` to `DIM_TO` of it `DIM_OVER` metres higher. */
const DIM_FROM = 4;
const DIM_OVER = 24;
const DIM_TO = 0.58;
const STONE = 0x9a9488;
const GLASS = 0x0e1218;
/** Snow on a roof has the whole sky's glow on it: brighter than the light in the street says. */
const SNOW_GAIN = 1.7;
const SNOW = 0xc4ccd8;
/** What a lit window is lit by: a lamp, a bare bulb, firelight through a curtain, a television. */
const LAMPS: readonly (readonly [number, number])[] = [[0xffc070, 0.95], [0xffdca0, 0.7], [0xd88040, 0.6], [0xffc070, 0.45], [0x7090d0, 0.5]];
/** The four ways a column can look at the one beside it; the shared edge runs left to right as seen from it. */
const SIDES = [
  { dx: 1, dz: 0, n: [-1, 0, 0], edge: (cx: number, cz: number) => [(cx + 1) * S, cz * S, (cx + 1) * S, (cz + 1) * S] },
  { dx: -1, dz: 0, n: [1, 0, 0], edge: (cx: number, cz: number) => [cx * S, (cz + 1) * S, cx * S, cz * S] },
  { dx: 0, dz: -1, n: [0, 0, 1], edge: (cx: number, cz: number) => [cx * S, cz * S, (cx + 1) * S, cz * S] },
  { dx: 0, dz: 1, n: [0, 0, -1], edge: (cx: number, cz: number) => [(cx + 1) * S, (cz + 1) * S, cx * S, (cz + 1) * S] },
] as const;

const hash = (a: number, b: number, c: number, d: number): number => {
  const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7 + d * 19.19) * 43758.5453;
  return s - Math.floor(s);
};
const dim = (y: number): number => 1 - (1 - DIM_TO) * Math.max(0, Math.min(1, (y - DIM_FROM) / DIM_OVER));

export function buildCity(map: CompiledMap, baker: Baker, out: CitySinks): void {
  const ms = massing(map);
  if (!ms) return;
  const { cols, rows, plane } = map;
  const blocks = map.def.blocks ?? [];
  /** The cell each column's outside is lit as part of: the open-air floor there, or (ambient only) a cell of the map's solid rim. */
  const NOWHERE = map.idx(0, 0);
  const litAs = new Int32Array(plane).fill(NOWHERE);
  // (The lowest: a bridge or a ledge that hangs over a street does not light the walls under it.)
  for (let i = 0; i < map.kind.length; i++) if (map.sky[i] && !map.deck[i] && map.kind[i] !== Cell.Window && litAs[i % plane] === NOWHERE) litAs[i % plane] = i;

  const faceOf = (c: number): WallStyle => blocks[ms.block[c]!]?.face ?? 'brick';
  const tints = blocks.map((b) => linear(b.tint ?? 0xffffff));
  const tintOf = (c: number): RGB => tints[ms.block[c]!] ?? [1, 1, 1];
  const stone = linear(STONE);
  const quad = (b: Bucket, p: [V3, V3, V3, V3], uv: (q: V3) => [number, number], n: V3, cell: number, tint: RGB): void => {
    baker.quad(b, p.map((q): Vert => ({ p: q, uv: uv(q), ao: dim(q[1]) })) as [Vert, Vert, Vert, Vert], n, cell, tint);
  };
  const grain = (q: V3): [number, number] => [(q[0] + q[2]) / TEX_METRES, q[1] / TEX_METRES];
  /** A flat panel standing `proud` of a wall whose face runs from (ax, az) to (bx, bz), between two heights. */
  const panel = (b: Bucket, ax: number, az: number, bx: number, bz: number, y0: number, y1: number, n: V3, proud: number, cell: number, tint: RGB): void => {
    const [ox, oz] = [n[0] * proud, n[2] * proud];
    quad(b, [[ax + ox, y0, az + oz], [bx + ox, y0, bz + oz], [bx + ox, y1, bz + oz], [ax + ox, y1, az + oz]], grain, n, cell, tint);
  };

  // Walls. Seen from column P, the column Q beside it is wall from where P's own walls stop to Q's top.
  // (P may be a cell outside the map: the buildings on its rim have backs.)
  const from = new Float32Array(plane * 4).fill(NaN);
  interface Piece { b: Bucket; v: Vert[]; c: number[][] }
  const rows_ = new Map<string, { wall: Map<number, Piece>; n: V3 }>();
  for (let pz = -1; pz <= rows; pz++) {
    for (let px = -1; px <= cols; px++) {
      const inside = map.inBounds(px, pz);
      const p = pz * cols + px;
      const y0 = inside ? ms.drawn[p]! : 0;
      for (const [si, side] of SIDES.entries()) {
        const [qx, qz] = [px + side.dx, pz + side.dz];
        if (!map.inBounds(qx, qz)) continue;
        const q = qz * cols + qx;
        const y1 = ms.top[q]!;
        if (y1 < y0 + 1e-3) continue;
        const [ax, az, bx, bz] = side.edge(px, pz);
        const n = side.n as unknown as V3;
        const cell = inside ? litAs[p]! : NOWHERE;
        const style = faceOf(q);
        const tint = tintOf(q);
        const u = (v: V3): [number, number] => [(side.dx !== 0 ? v[2] : v[0]) / TEX_METRES, v[1] / TEX_METRES];
        // Split at every storey, so that light worked out at the corners is right in between.
        const ys = [y0];
        for (let y = (Math.floor(y0 / STOREY) + 1) * STOREY; y < y1 - 1e-3; y += STOREY) ys.push(y);
        ys.push(y1);
        const wall = out.surface('wall', style, cell);
        for (let k = 0; k + 1 < ys.length; k++) {
          const v = ([[ax, ys[k]!, az], [bx, ys[k]!, bz], [bx, ys[k + 1]!, bz], [ax, ys[k + 1]!, az]] as V3[]).map((q): Vert => ({ p: q, uv: u(q), ao: dim(q[1]) }));
          const c = baker.colours(v, n, cell, tint);
          // The storey next to the street is lit by its lamps, half a metre at a time. Above it a wall is
          // much the same from one end to the other: those go in rows, to be joined up (below).
          if (k === 0) baker.emit(wall, v, c);
          else {
            const along = side.dx !== 0 ? pz : px;
            const key = `${si}|${side.dx !== 0 ? px : pz}|${ys[k]}|${ys[k + 1]}|${style}|${ms.block[q]}`;
            (rows_.get(key) ?? rows_.set(key, { wall: new Map(), n }).get(key)!).wall.set(along, { b: wall, v, c });
          }
        }
        if (!inside || style === 'fence') continue;
        from[p * 4 + si] = y0;
        // A string course where the street's wall ends and the building's begins, and a cornice under the roof.
        if (ms.open[p] && y1 - y0 > 0.6) panel(out.prop(cell), ax, az, bx, bz, y0, y0 + 0.3, n, 0.06, cell, stone);
        if (y1 - y0 > 1.5) panel(out.prop(cell), ax, az, bx, bz, y1 - 0.4, y1, n, 0.09, cell, stone);
      }
    }
  }

  // Join each row's pieces into as few quads as look the same: a run goes on for as long as every
  // piece is the colour of the first, corner for corner (so nothing a lamp reaches is joined).
  const NEAR = 0.012;
  const alike = (a: number[], b: number[]): boolean => {
    for (let ch = 0; ch < 12; ch++) if (Math.abs(a[ch]! - b[ch]!) > NEAR * Math.max(0.25, a[ch]!)) return false;
    return true;
  };
  for (const row of rows_.values()) {
    // (In the order a piece's own corners run: 0 and 3 are its near end, 1 and 2 its far one.)
    const any = row.wall.values().next().value!;
    const back = any.v[1]!.p[0] + any.v[1]!.p[2] < any.v[0]!.p[0] + any.v[0]!.p[2] ? -1 : 1;
    const at = [...row.wall.keys()].sort((a, b) => (a - b) * back);
    for (let i = 0; i < at.length; ) {
      const first = row.wall.get(at[i]!)!;
      const flat = alike(first.c[0]!, first.c[1]!) && alike(first.c[3]!, first.c[2]!);
      let j = i;
      while (flat && j + 1 < at.length) {
        const next = row.wall.get(at[j + 1]!)!;
        if (next.b !== first.b || Math.abs(at[j + 1]! - at[j]!) !== 1) break;
        if (!alike(first.c[0]!, next.c[0]!) || !alike(first.c[0]!, next.c[1]!) || !alike(first.c[3]!, next.c[3]!) || !alike(first.c[3]!, next.c[2]!)) break;
        j++;
      }
      const last = row.wall.get(at[j]!)!;
      baker.emit(first.b, [first.v[0]!, last.v[1]!, last.v[2]!, first.v[3]!], [first.c[0]!, last.c[1]!, last.c[2]!, first.c[3]!]);
      i = j + 1;
    }
  }

  // Windows: a row to a storey, one to a bay, wherever a whole bay of the same building's wall is clear.
  const glass = linear(GLASS);
  for (const [si, side] of SIDES.entries()) {
    const alongX = side.dx === 0;
    const [lines, length] = alongX ? [rows, cols] : [cols, rows];
    const n = side.n as unknown as V3;
    for (let line = 0; line < lines; line++) {
      const at = (a: number): number => (alongX ? line * cols + a : a * cols + line);
      const beyond = (a: number): number => at(a) + side.dz * cols + side.dx;
      for (let a = 0; a + BAY <= length; a++) {
        const q = beyond(a);
        const b = blocks[ms.block[q]!];
        if (Number.isNaN(from[at(a) * 4 + si]!) || (b && b.lit === false)) continue;
        // Bays are counted from the building's own corner, so its windows sit evenly on it.
        const origin = Math.round((b ? (alongX ? b.x : b.z) : 0) / S);
        if ((((a - origin) % BAY) + BAY) % BAY !== 0) continue;
        let y0 = -Infinity;
        let y1 = Infinity;
        for (let k = 0; k < BAY; k++) {
          const f = from[at(a + k) * 4 + si]!;
          const qk = beyond(a + k);
          if (Number.isNaN(f) || ms.block[qk] !== ms.block[q]) y1 = -Infinity;
          y0 = Math.max(y0, f);
          y1 = Math.min(y1, ms.roof[qk]!);
        }
        const mid = at(a + (BAY >> 1));
        const cell = litAs[mid]!;
        const share = typeof b?.lit === 'number' ? b.lit : 0.2;
        for (let storey = Math.max(0, Math.floor(y0 / STOREY)); storey * STOREY + WINDOW.head + UNDER_ROOF <= y1; storey++) {
          const base = storey * STOREY;
          if (base + WINDOW.sill < y0 + OVER_COURSE) continue;
          // The middle of the bay, along the edge this side of the column shares with the wall.
          const [ax, az, bx, bz] = side.edge(alongX ? a : line, alongX ? line : a);
          const span = (BAY * S) / 2;
          const [mx, mz] = alongX ? [Math.min(ax, bx) + span, az] : [ax, Math.min(az, bz) + span];
          const [tx, tz] = [Math.sign(bx - ax), Math.sign(bz - az)];
          const half = WINDOW.w / 2;
          const piece = (bucket: Bucket | null, h0: number, h1: number, grow: number, proud: number, tint: RGB, glow?: RGB): void => {
            const [x0, z0, x1, z1] = [mx - tx * (half + grow), mz - tz * (half + grow), mx + tx * (half + grow), mz + tz * (half + grow)];
            if (bucket) return panel(bucket, x0, z0, x1, z1, base + h0, base + h1, n, proud, cell, tint);
            const [ox, oz] = [n[0] * proud, n[2] * proud];
            baker.glow(out.glow(cell), [[x0 + ox, base + h0, z0 + oz], [x1 + ox, base + h0, z1 + oz], [x1 + ox, base + h1, z1 + oz], [x0 + ox, base + h1, z0 + oz]], glow!, 'on');
          };
          piece(out.prop(cell), WINDOW.sill - 0.14, WINDOW.head + 0.14, 0.12, 0.03, stone);
          // A sash: two panes, one over the other. Lit ones glow; the higher, the dimmer.
          const roll = hash(line, a, storey, si);
          const lamp = roll < share ? LAMPS[Math.floor(hash(a, line, si, storey) * LAMPS.length)]! : null;
          const meet = (WINDOW.sill + WINDOW.head) / 2;
          for (const [h0, h1, upper] of [[WINDOW.sill, meet - 0.04, false], [meet + 0.04, WINDOW.head, true]] as const) {
            if (!lamp) piece(out.prop(cell), h0, h1, 0, 0.05, glass);
            else {
              // (A blind half down, as often as not.)
              const k = lamp[1] * dim(base) * (upper && roll < share * 0.5 ? 0.45 : 1);
              piece(null, h0, h1, 0, 0.05, glass, linear(lamp[0]).map((c) => c * k) as RGB);
            }
          }
        }
      }
    }
  }

  // Roofs under snow, a strip a row: only the ones somebody could look down on.
  const seen = ms.highest + 2.5;
  const snow = linear(SNOW).map((c) => c * SNOW_GAIN) as RGB;
  const lid = out.surface('floor', 'snow');
  const flat = (q: V3): [number, number] => [q[0] / TEX_METRES, q[2] / TEX_METRES];
  for (let cz = 0; cz < rows; cz++) {
    for (let cx = 0; cx < cols; ) {
      const c = cz * cols + cx;
      let end = cx + 1;
      if (ms.open[c] || ms.top[c]! > seen) {
        cx = end;
        continue;
      }
      while (end < cols && !ms.open[cz * cols + end] && ms.top[cz * cols + end] === ms.top[c]) end++;
      const y = ms.top[c]!;
      baker.quad(lid, ([[cx * S, y, cz * S], [cx * S, y, (cz + 1) * S], [end * S, y, (cz + 1) * S], [end * S, y, cz * S]] as V3[]).map((p): Vert => ({ p, uv: flat(p), ao: 1 })) as [Vert, Vert, Vert, Vert], [0, 1, 0], NOWHERE, snow);
      cx = end;
    }
  }

  // The ground beyond the map: the next streets over, seen from a roof between the towers.
  const { w, d } = map.def.size;
  const FAR = 260;
  const ground = out.surface('floor', 'asphalt');
  for (const [x0, z0, x1, z1] of [[-FAR, -FAR, w + FAR, 0], [-FAR, d, w + FAR, d + FAR], [-FAR, 0, 0, d], [w, 0, w + FAR, d]] as const) {
    baker.quad(ground, ([[x0, 0, z0], [x0, 0, z1], [x1, 0, z1], [x1, 0, z0]] as V3[]).map((p): Vert => ({ p, uv: flat(p), ao: 1 })) as [Vert, Vert, Vert, Vert], [0, 1, 0], NOWHERE, [0.8, 0.8, 0.8]);
  }

  // What stands on a roof: a water tank on its legs, the hut over a stair head, a huddle of vents.
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, side: RGB, top: RGB = side): void => {
    const b = out.prop();
    quad(b, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], grain, [0, 0, -1], NOWHERE, side);
    quad(b, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], grain, [0, 0, 1], NOWHERE, side);
    quad(b, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], grain, [1, 0, 0], NOWHERE, side);
    quad(b, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], grain, [-1, 0, 0], NOWHERE, side);
    quad(b, [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], grain, [0, 1, 0], NOWHERE, top);
  };
  /** A drum, or with `r1` 0 a cone, of `sides` flat faces. */
  const drum = (x: number, z: number, y0: number, y1: number, r0: number, r1: number, sides: number, colour: RGB): void => {
    for (let i = 0; i < sides; i++) {
      const [a0, a1] = [(i / sides) * Math.PI * 2, ((i + 1) / sides) * Math.PI * 2];
      const am = (a0 + a1) / 2;
      const at = (a: number, r: number, y: number): V3 => [x + Math.cos(a) * r, y, z - Math.sin(a) * r];
      quad(out.prop(), [at(a0, r0, y0), at(a1, r0, y0), at(a1, r1, y1), at(a0, r1, y1)], grain, [Math.cos(am), r1 < r0 ? 0.5 : 0, -Math.sin(am)], NOWHERE, colour);
    }
  };
  const [wood, iron, tar] = [linear(0x4a3a2c), linear(0x2c2c30), linear(0x3a3634)];
  blocks.forEach((b, bi) => {
    const pick = hash(bi, b.x, b.z, b.h);
    const kind = b.roof ?? (b.w * b.d < 60 || b.h > seen ? 'bare' : (['tank', 'vents', 'hut', 'bare'] as const)[Math.floor(pick * 4)]!);
    if (kind === 'bare') return;
    // Somewhere on the block's own roof, three metres clear.
    for (let attempt = 0; attempt < 12; attempt++) {
      const x = Math.round(b.x + 2 + hash(bi, attempt, 1, 0) * Math.max(0, b.w - 4));
      const z = Math.round(b.z + 2 + hash(bi, attempt, 2, 0) * Math.max(0, b.d - 4));
      let clear = true;
      for (let dz = -3; dz < 3; dz++) {
        for (let dx = -3; dx < 3; dx++) {
          const [cx, cz] = [Math.round(x / S) + dx, Math.round(z / S) + dz];
          const c = cz * cols + cx;
          if (!map.inBounds(cx, cz) || ms.block[c] !== bi || ms.open[c] || ms.top[c] !== b.h) clear = false;
        }
      }
      if (!clear) continue;
      const y = b.h;
      if (kind === 'tank') {
        for (const [lx, lz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]] as const) box(x + lx - 0.07, y, z + lz - 0.07, x + lx + 0.07, y + 1.7, z + lz + 0.07, iron);
        box(x - 1.2, y + 1.7, z - 1.2, x + 1.2, y + 1.82, z + 1.2, iron);
        drum(x, z, y + 1.82, y + 4.4, 1.25, 1.25, 10, wood);
        drum(x, z, y + 4.4, y + 5.2, 1.4, 0, 10, snow);
      } else if (kind === 'hut') {
        box(x - 1.25, y, z - 1.5, x + 1.25, y + 2.5, z + 1.5, tintOf(Math.round(z / S) * cols + Math.round(x / S)).map((c) => c * 0.45) as RGB, snow);
        panel(out.prop(), x - 0.45, z - 1.5, x + 0.45, z - 1.5, y, y + 2, [0, 0, -1], 0.04, NOWHERE, iron);
      } else {
        box(x - 1.2, y, z - 0.6, x - 0.2, y + 0.9, z + 0.4, iron, snow);
        box(x + 0.3, y, z - 0.2, x + 0.7, y + 1.7, z + 0.2, tar, snow);
        box(x + 0.6, y, z + 0.8, x + 1.3, y + 1.2, z + 1.5, tar, snow);
        drum(x - 0.7, z + 1.1, y, y + 0.7, 0.3, 0.3, 6, iron);
        drum(x - 0.7, z + 1.1, y + 0.7, y + 1, 0.45, 0, 6, snow);
      }
      return;
    }
  });
}
