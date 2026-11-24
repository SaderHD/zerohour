import { Rng, type PropInst } from '@zh/shared';
import { Bucket, type Baker, type GlowMode, type RGB, type Vert } from '../../render/bake';
import { linear } from '../../render/materials';
import type { UVRect } from '../../render/signs';

// The prop builders' drawing tools. A prop is a handful of boxes and prisms in its own space
// (metres, origin on the floor at the centre of its footprint, front towards -z); the kit turns
// them into world-space quads with baked lighting, merged into the world's shared buckets.

const GRAIN_METRES = 2;

/** How a moving part moves: round and round, or to and fro. Angles in radians, about `axis`. */
export type Motion =
  /** `rate` rad/s. `powered` parts only run with the mains on, turning over at `idle` x rate until then. */
  | { kind: 'spin'; rate: number; powered?: boolean; idle?: number }
  | { kind: 'swing'; amp: number; period: number };

/** A part of a prop that moves: its own little mesh, turning about a pivot (see render/ambient.ts). */
export interface Mover {
  pivot: [number, number, number];
  axis: [number, number, number];
  motion: Motion;
  prop: Bucket;
  glow: Bucket;
}

export interface PropOut {
  baker: Baker;
  prop: Bucket;
  glow: Bucket;
  sign: Bucket;
  /** Collected while building; absent where nothing may move (doors). */
  movers?: Mover[];
  /** Where water drips from: [x, y, z] of each nozzle. */
  drips?: [number, number, number][];
}

type V3 = [number, number, number];
type Mat = [number, number, number, number, number, number, number, number, number]; // row-major 3x3

const mul = (a: Mat, b: Mat): Mat => {
  const o = [0, 0, 0, 0, 0, 0, 0, 0, 0] as Mat;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3]! * b[c]! + a[r * 3 + 1]! * b[3 + c]! + a[r * 3 + 2]! * b[6 + c]!;
  return o;
};
const rad = (deg: number): number => (deg * Math.PI) / 180;
/** Yaw about y (positive turns left seen from above), then pitch about x, then roll about z. Degrees. */
function rotation(yaw: number, pitch = 0, roll = 0): Mat {
  const [cy, sy, cx, sx, cz, sz] = [Math.cos(rad(yaw)), Math.sin(rad(yaw)), Math.cos(rad(pitch)), Math.sin(rad(pitch)), Math.cos(rad(roll)), Math.sin(rad(roll))];
  return mul(mul([cy, 0, sy, 0, 1, 0, -sy, 0, cy], [1, 0, 0, 0, cx, -sx, 0, sx, cx]), [cz, -sz, 0, sz, cz, 0, 0, 0, 1]);
}

export interface BoxOpts {
  /** Glows by itself instead of being lit. */
  glow?: GlowMode;
  /** Draw the underside too (things overhead). */
  bottom?: boolean;
  /** Leave the top off (things that reach the ceiling). */
  noTop?: boolean;
}

export class Kit {
  constructor(
    private readonly out: PropOut,
    private readonly R: Mat,
    private readonly t: V3,
    /** The open cell this prop is lit as part of when a face lies inside a wall. */
    private readonly cell: number,
    readonly rng: Rng,
    readonly inst: PropInst,
    /** Ceiling height over the prop. */
    readonly ceil: number,
  ) {}

  /** `ceil` is the height of the ceiling over the prop's own floor, which is at `base`. */
  static at(out: PropOut, inst: PropInst, cell: number, ceil: number, base = 0): Kit {
    const seed = (Math.round(inst.x * 4) * 73856093) ^ (Math.round(inst.z * 4) * 19349663) ^ ((inst.variant ?? 0) * 83492791);
    return new Kit(out, rotation(inst.rot ?? 0), [inst.x, base, inst.z], cell, new Rng(seed >>> 0), inst, ceil);
  }

  get variant(): number {
    return this.inst.variant ?? 0;
  }

  /** A kit for a part that is moved and turned within this one. */
  sub(x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0): Kit {
    return new Kit(this.out, mul(this.R, rotation(yaw, pitch, roll)), this.world([x, y, z]), this.cell, this.rng, this.inst, this.ceil);
  }

  /**
   * A kit for a part that turns about `axis` through (x, y, z). It draws in this kit's space, in
   * the part's rest position, and ends up as a mesh of its own.
   */
  mover(x: number, y: number, z: number, axis: V3, motion: Motion): Kit {
    if (!this.out.movers) return this;
    const m: Mover = { pivot: this.world([x, y, z]), axis: this.dir(axis), motion, prop: new Bucket(), glow: new Bucket() };
    this.out.movers.push(m);
    return new Kit({ ...this.out, prop: m.prop, glow: m.glow }, this.R, this.t, this.cell, this.rng, this.inst, this.ceil);
  }

  /** Water drips from this point. */
  drip(x: number, y: number, z: number): void {
    this.out.drips?.push(this.world([x, y, z]));
  }

  private world(p: V3): V3 {
    const R = this.R;
    return [R[0] * p[0] + R[1] * p[1] + R[2] * p[2] + this.t[0], R[3] * p[0] + R[4] * p[1] + R[5] * p[2] + this.t[1], R[6] * p[0] + R[7] * p[1] + R[8] * p[2] + this.t[2]];
  }

  private dir(n: V3): V3 {
    const R = this.R;
    return [R[0] * n[0] + R[1] * n[1] + R[2] * n[2], R[3] * n[0] + R[4] * n[1] + R[5] * n[2], R[6] * n[0] + R[7] * n[1] + R[8] * n[2]];
  }

  /** A colour nudged lighter or darker so repeats do not look stamped. */
  tone(hex: number, amount = 0.12): RGB {
    const c = linear(hex);
    const k = 1 + this.rng.range(-amount, amount);
    return [c[0] * k, c[1] * k, c[2] * k];
  }

  /** One face: four local points, CCW seen from outside. */
  face(pts: [V3, V3, V3, V3], normal: V3, colour: number | RGB, glow?: GlowMode, uv?: UVRect): void {
    const rgb = typeof colour === 'number' ? linear(colour) : colour;
    const w = pts.map((p) => this.world(p)) as [V3, V3, V3, V3];
    if (glow) return this.out.baker.glow(this.out.glow, w, rgb, glow);
    const n = this.dir(normal);
    const cx = (w[0][0] + w[2][0]) / 2 + n[0] * 0.05;
    const cz = (w[0][2] + w[2][2]) / 2 + n[2] * 0.05;
    const cell = this.out.baker.cellNear(cx, cz, this.cell);
    const corners = uv ? [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]] : null;
    const verts = w.map((p, i): Vert => ({
      p,
      uv: corners ? (corners[i] as [number, number]) : [(pts[i]![0] + pts[i]![2]) / GRAIN_METRES, (pts[i]![1] + pts[i]![2] * 0.5) / GRAIN_METRES],
      ao: p[1] < 0.03 ? 0.6 : 1,
    })) as [Vert, Vert, Vert, Vert];
    this.out.baker.quad(uv ? this.out.sign : this.out.prop, verts, n, cell, rgb);
  }

  /** An axis-aligned box in the kit's space. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, colour: number | RGB, o: BoxOpts = {}): void {
    const c = typeof colour === 'number' ? linear(colour) : colour;
    if (!o.noTop) this.face([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [0, 1, 0], c, o.glow);
    this.face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], c, o.glow);
    this.face([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], c, o.glow);
    this.face([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], c, o.glow);
    this.face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], c, o.glow);
    if (o.bottom) this.face([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], c, o.glow);
  }

  /** A flat rectangle in the plane z = `z`, facing -z: for details too thin to deserve a box. */
  plate(x0: number, y0: number, x1: number, y1: number, z: number, colour: number | RGB, glow?: GlowMode): void {
    this.face([[x1, y0, z], [x0, y0, z], [x0, y1, z], [x1, y1, z]], [0, 0, -1], colour, glow);
  }

  /** A box given by its centre and size. */
  cube(x: number, y: number, z: number, w: number, h: number, d: number, colour: number | RGB, o: BoxOpts = {}): void {
    this.box(x - w / 2, y - h / 2, z - d / 2, x + w / 2, y + h / 2, z + d / 2, colour, o);
  }

  /** An upright prism (a barrel, a pot, a lamp shade): radius r0 at y0, r1 at y1. */
  cyl(x: number, z: number, y0: number, y1: number, r0: number, r1: number, colour: number | RGB, sides = 8, o: BoxOpts = {}): void {
    const c = typeof colour === 'number' ? linear(colour) : colour;
    const ring = (r: number, y: number): V3[] => Array.from({ length: sides }, (_, i) => {
      const a = ((i + 0.5) / sides) * Math.PI * 2;
      return [x + Math.cos(a) * r, y, z - Math.sin(a) * r] as V3;
    });
    const lo = ring(r0, y0);
    const hi = ring(r1, y1);
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      const a = ((i + 1) / sides) * Math.PI * 2;
      this.face([lo[i]!, lo[j]!, hi[j]!, hi[i]!], [Math.cos(a), 0, -Math.sin(a)], c, o.glow);
    }
    for (let i = 1; i + 2 < sides + 1; i += 2) {
      const a = Math.min(i + 1, sides - 1);
      const b = Math.min(i + 2, sides - 1);
      if (!o.noTop) this.face([hi[0]!, hi[i]!, hi[a]!, hi[b]!], [0, 1, 0], c, o.glow);
      if (o.bottom) this.face([lo[0]!, lo[b]!, lo[a]!, lo[i]!], [0, -1, 0], c, o.glow);
    }
  }

  /** A flat picture from the sign atlas, standing in the plane z = `z`, facing -z, centred on (x, y). */
  picture(x: number, y: number, z: number, w: number, h: number, uv: UVRect, tint: number | RGB = 0xffffff): void {
    this.face([[x + w / 2, y - h / 2, z], [x - w / 2, y - h / 2, z], [x - w / 2, y + h / 2, z], [x + w / 2, y + h / 2, z]], [0, 0, -1], tint, undefined, uv);
  }
}
