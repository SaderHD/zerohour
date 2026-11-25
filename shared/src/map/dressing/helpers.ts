import type { Dir, LightDef, PropInst } from '../types';
import type { PropType } from '../../data/props';

// Shorthand for dressing a zone. Facing is the way a prop's front looks: a locker against the
// north wall faces 's'; a sign on the west wall faces 'e'.

const ROT: Record<Dir, number> = { n: 0, w: 90, s: 180, e: 270 };

type Extra = Pick<PropInst, 'variant' | 'y' | 's' | 'y2' | 'text' | 'level'> & { rot?: number };

export const prop = (type: PropType, x: number, z: number, face: Dir = 'n', extra: Extra = {}): PropInst => ({
  type, x, z, ...extra, rot: extra.rot ?? ROT[face],
});

/** A row of the same prop, `step` metres apart along x (dx) or z (dz). */
export const row = (type: PropType, x: number, z: number, n: number, dx: number, dz: number, face: Dir = 'n', variants?: number[]): PropInst[] =>
  Array.from({ length: n }, (_, i) => prop(type, x + dx * i, z + dz * i, face, variants ? { variant: variants[i % variants.length] } : {}));

export const sign = (text: string, x: number, z: number, face: Dir, y = 1.9, variant = 0): PropInst => prop('sign', x, z, face, { text, y, variant });

/** A sign with an arrow pointing along its wall towards `toward` (as someone reading it sees it). */
export function arrow(text: string, x: number, z: number, face: Dir, toward: Dir, y = 1.9, variant = 2): PropInst {
  // Reading a sign that faces north you look south, so east is on your left.
  const left: Record<Dir, Dir> = { n: 'e', s: 'w', e: 's', w: 'n' };
  return sign(left[face] === toward ? `< ${text}` : `${text} >`, x, z, face, y, variant);
}

/** A guy wire from an anchor block at (ax, az) up to height `y` on a mast at (mx, mz). */
export function guy(ax: number, az: number, mx: number, mz: number, y: number): PropInst[] {
  const rot = (Math.atan2(-(mx - ax), -(mz - az)) * 180) / Math.PI;
  return [prop('anchor_block', ax, az), prop('guy_wire', ax, az, 'n', { rot, s: Math.hypot(mx - ax, mz - az), y })];
}

/**
 * A handrail along the edge of a drop, from (x0, z0) to (x1, z1) (one of the two the same). Give
 * the line just inside the edge: the rail stands on the floor of the cell its middle is in.
 */
export function rail(x0: number, z0: number, x1: number, z1: number, extra: Extra = {}): PropInst {
  return prop('railing', (x0 + x1) / 2, (z0 + z1) / 2, 'n', { s: Math.abs(x1 - x0) + Math.abs(z1 - z0), rot: z0 === z1 ? 0 : 90, ...extra });
}

/** A handrail down a flight or a ramp that runs along z: a short length on every tread from z0 to z1. */
export function stairRail(x: number, z0: number, z1: number, extra: Extra = {}): PropInst[] {
  const out: PropInst[] = [];
  for (let z = z0; z < z1 - 1e-6; z += 0.5) out.push(rail(x, z, x, z + 0.5, extra));
  return out;
}

/**
 * Something strung from (x0, z0) at height y0 to (x1, z1) at height y1: a string of bulbs, a
 * clothes line, a paper chain. It is placed at its middle, which must be over open floor.
 */
export function strung(type: 'light_string' | 'washing_line' | 'paper_chain', x0: number, z0: number, y0: number, x1: number, z1: number, y1: number, variant = 0): PropInst {
  const rot = (Math.atan2(-(z1 - z0), x1 - x0) * 180) / Math.PI;
  return prop(type, (x0 + x1) / 2, (z0 + z1) / 2, 'n', { rot, s: Math.hypot(x1 - x0, z1 - z0), y: y0, y2: y1, variant });
}

/** The same things a storey up or down. */
export const onLevel = <T extends { level?: number }>(level: number, things: T[]): T[] => things.map((t) => ({ ...t, level }));

/** Lights written as heights over a floor that is not at 0: lift them all by `dy`. */
export const lift = (dy: number, lights: LightDef[]): LightDef[] => lights.map((l) => ({ ...l, y: l.y + dy }));

type LightOpts = Partial<Pick<LightDef, 'intensity' | 'needsPower' | 'flicker' | 'fixture' | 'level'>>;

/** A mains lamp: dim until the power is on. */
export const lamp = (x: number, z: number, y: number, color: number, radius: number, o: LightOpts = {}): LightDef => ({
  x, y, z, color, radius, intensity: 1, needsPower: true, ...o,
});

/** A light that does not need the mains: emergency lamps, flames, things that glow. */
export const glow = (x: number, z: number, y: number, color: number, radius: number, o: LightOpts = {}): LightDef => ({
  x, y, z, color, radius, intensity: 1, fixture: 'none', ...o,
});

export const LIGHT = {
  warm: 0xffc880,
  dimWarm: 0xffb060,
  lab: 0xc0ffe8,
  ice: 0x90c8ff,
  red: 0xff4030,
  amber: 0xffa040,
  sodium: 0xffd070,
  flood: 0xa8c8ff,
  crt: 0x70ff90,
  arc: 0xb060ff,
  ember: 0xff7a30,
  flame: 0xffb860,
  specimen: 0x50ffa0,
} as const;
