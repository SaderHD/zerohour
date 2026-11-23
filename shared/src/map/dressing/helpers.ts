import type { Dir, LightDef, PropInst } from '../types';
import type { PropType } from '../../data/props';

// Shorthand for dressing a zone. Facing is the way a prop's front looks: a locker against the
// north wall faces 's'; a sign on the west wall faces 'e'.

const ROT: Record<Dir, number> = { n: 0, w: 90, s: 180, e: 270 };

type Extra = Pick<PropInst, 'variant' | 'y' | 's' | 'text'> & { rot?: number };

export const prop = (type: PropType, x: number, z: number, face: Dir = 'n', extra: Extra = {}): PropInst => ({
  type, x, z, ...extra, rot: extra.rot ?? ROT[face],
});

/** A row of the same prop, `step` metres apart along x (dx) or z (dz). */
export const row = (type: PropType, x: number, z: number, n: number, dx: number, dz: number, face: Dir = 'n', variants?: number[]): PropInst[] =>
  Array.from({ length: n }, (_, i) => prop(type, x + dx * i, z + dz * i, face, variants ? { variant: variants[i % variants.length] } : {}));

export const sign = (text: string, x: number, z: number, face: Dir, y = 1.9, variant = 0): PropInst => prop('sign', x, z, face, { text, y, variant });

type LightOpts = Partial<Pick<LightDef, 'intensity' | 'needsPower' | 'flicker' | 'fixture'>>;

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
