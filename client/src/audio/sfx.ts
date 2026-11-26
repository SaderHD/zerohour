// The everyday sounds: feet, zombies, the player's own body, doors and planks, the ticks of the HUD.
import type { FloorStyle } from '@zh/shared';
import { vary, type Synth } from './synth';

type At = { x: number; z: number; y?: number } | undefined;

export class Sfx {
  private foot = 1;
  private readonly last = new Map<string, number>();

  /** True at most once every `gap` seconds per `key`: a shotgun's eight hits are one tick, a horde dying at once is not 24 voices. */
  private gate(key: string, gap: number): boolean {
    const now = this.s.ctx.currentTime;
    if (now - (this.last.get(key) ?? -9) < gap) return false;
    this.last.set(key, now);
    return true;
  }

  constructor(private readonly s: Synth) {}

  // ------------------------------------------------------------------ feet

  /** One footfall on a surface. `at`: someone else's. */
  step(surface: FloorStyle, sprint: boolean, at?: At): void {
    this.foot = -this.foot;
    const p = vary(0.07) * (this.foot > 0 ? 1.04 : 0.96);
    const v = this.s.voice({ gain: (at ? 0.8 : 0.6) * (sprint ? 1.35 : 1) * (surface === 'lino' || surface === 'snow' || surface === 'tile' ? 1.6 : 1), priority: at ? 0 : 1, at, range: 18, ref: 4, pan: this.foot * 0.12, reverb: 0.12 });
    if (v.dead) return;
    switch (surface) {
      case 'tile':
        v.noise({ d: 0.04, g: 0.8, filter: { type: 'bandpass', f: 2300 * p, q: 2 } }).tone({ f: 110 * p, f1: 70, d: 0.05, g: 0.5 });
        break;
      case 'plank':
        v.tone({ f: 170 * p, f1: 85, d: 0.1, g: 0.9 }).noise({ d: 0.06, g: 0.6, filter: { type: 'lowpass', f: 800 } });
        // Now and then a board complains.
        if (Math.random() < 0.12) v.tone({ t: 0.05, type: 'sawtooth', f: 310 * p, f1: 370 * p, d: 0.22, g: 0.12, a: 0.06, r: 0.1, filter: { type: 'bandpass', f: 900, q: 6 } });
        break;
      case 'snow':
        v.noise({ d: 0.09, g: 0.7, a: 0.015, filter: { type: 'bandpass', f: 1500 * p, f1: 700, q: 0.8 } });
        v.noise({ t: 0.06, d: 0.1, g: 0.5, a: 0.02, filter: { type: 'bandpass', f: 900 * p, f1: 500, q: 1 } });
        break;
      case 'metal':
        v.tone({ f: 520 * p, d: 0.2, g: 0.22 }).tone({ f: 1340 * p, d: 0.14, g: 0.14 }).tone({ f: 95, f1: 60, d: 0.07, g: 0.6 });
        v.noise({ d: 0.02, g: 0.6, filter: { type: 'highpass', f: 2500 } });
        break;
      case 'lino':
        v.noise({ d: 0.06, g: 0.8, filter: { type: 'lowpass', f: 520 * p } }).tone({ f: 100 * p, f1: 62, d: 0.06, g: 0.5 });
        break;
      default:
        v.noise({ d: 0.07, g: 0.9, filter: { type: 'lowpass', f: 950 * p, f1: 300 } }).tone({ f: 92 * p, f1: 58, d: 0.07, g: 0.6 });
        v.noise({ d: 0.015, g: 0.25, filter: { type: 'highpass', f: 3000 } });
    }
  }

  // ------------------------------------------------------------------ zombies

  /** A zombie's voice somewhere in the dark. `seed` gives each its own pitch; `rage` 0..1 for runners. */
  groan(at: At, seed: number, rage = 0): void {
    const base = (62 + (seed % 37)) * (1 + rage * 0.5);
    const d = (0.8 + ((seed >> 3) % 7) * 0.1) * (1 - rage * 0.4) * vary(0.2);
    const v = this.s.voice({ gain: 0.55 + rage * 0.15, priority: 0, at, range: 30, ref: 5, reverb: 0.3 });
    if (v.dead) return;
    const drift = base * (Math.random() < 0.5 ? 0.82 : 1.15);
    const vib: [number, number] = [5 + rage * 9 + Math.random() * 2, 0.04 + rage * 0.05];
    // A raw throat through two mouth shapes, and breath over it.
    v.tone({ type: 'sawtooth', f: base, f1: drift, d, g: 0.9, a: 0.14, r: d * 0.4, vib, filter: { type: 'bandpass', f: 560 * vary(0.2), f1: 420, q: 4 } });
    v.tone({ type: 'sawtooth', f: base * 1.01, f1: drift, d, g: 0.5, a: 0.18, r: d * 0.4, vib, filter: { type: 'bandpass', f: 1150 * vary(0.2), f1: 900, q: 5 } });
    v.noise({ d, g: 0.12 + rage * 0.1, a: 0.2, r: d * 0.5, filter: { type: 'bandpass', f: 1300, q: 1.5 } });
  }

  /** A zombie swings. */
  attack(at: At, seed: number): void {
    const base = 120 + (seed % 40);
    const v = this.s.voice({ gain: 0.75, priority: 1, at, range: 26, ref: 5, reverb: 0.2 });
    v.tone({ type: 'sawtooth', f: base * 1.3, f1: base * 0.7, d: 0.32, g: 0.9, a: 0.02, r: 0.1, vib: [19, 0.12], filter: { type: 'bandpass', f: 900, f1: 600, q: 3 } });
    v.noise({ t: 0.08, d: 0.16, g: 0.6, a: 0.05, filter: { type: 'bandpass', f: 1700, f1: 450, q: 1 } });
  }

  /** A body going down. */
  death(at: At, seed: number): void {
    if (!this.gate('death', 0.07)) return;
    const base = 105 + (seed % 30);
    const v = this.s.voice({ gain: 0.6, priority: 0, at, range: 26, ref: 5, reverb: 0.25 });
    v.tone({ type: 'sawtooth', f: base, f1: base * 0.42, d: 0.5, g: 0.8, a: 0.01, r: 0.3, vib: [8, 0.06], filter: { type: 'bandpass', f: 700, f1: 300, q: 3 } });
    v.noise({ t: 0.42, d: 0.14, g: 0.8, filter: { type: 'lowpass', f: 420, f1: 120 } });
    v.tone({ t: 0.42, f: 85, f1: 48, d: 0.12, g: 0.7 });
  }

  /** A bullet finding flesh (someone else's shot, or a blast). */
  flesh(at: At): void {
    if (!this.gate('flesh', 0.05)) return;
    this.s.voice({ gain: 0.9, priority: 0, at, range: 22, ref: 5 }).noise({ d: 0.07, filter: { type: 'lowpass', f: 1300 * vary(0.2), f1: 300 } }).tone({ f: 150, f1: 70, d: 0.05, g: 0.5 });
  }

  /** A howler calling as it arrives. */
  howl(at: At, seed: number): void {
    const f = 430 + (seed % 90);
    const v = this.s.voice({ gain: 0.7, priority: 2, at, range: 70, ref: 12, reverb: 0.7 });
    for (const [mult, g] of [[1, 0.6], [1.5, 0.2]] as const) {
      v.tone({ type: 'sawtooth', f: f * 0.7 * mult, via: [[0.25, f * mult], [0.7, f * 1.08 * mult], [1, f * 0.6 * mult]], d: 1.3, g, a: 0.15, r: 0.5, vib: [6.5, 0.02], filter: { type: 'bandpass', f: 1000 * mult, q: 3 } });
    }
  }

  /** A howler's snap. */
  bark(at: At): void {
    const v = this.s.voice({ gain: 0.5, priority: 1, at, range: 30, ref: 6, reverb: 0.2 });
    for (const t of [0, 0.14]) v.tone({ t, type: 'square', f: 330 * vary(0.1), f1: 170, d: 0.1, g: 0.8, filter: { type: 'bandpass', f: 1100, q: 2 } }).noise({ t, d: 0.06, g: 0.4, filter: { type: 'bandpass', f: 2000, q: 1 } });
  }

  /** Lightning coming down. */
  thunder(at: At): void {
    const v = this.s.voice({ gain: 1, priority: 3, at, ref: 22, range: 160, reverb: 0.9 });
    v.noise({ d: 0.09, g: 1.2, filter: { type: 'highpass', f: 1800 } });
    v.noise({ t: 0.03, d: 1.9, g: 1, filter: { type: 'lowpass', f: 1500, f1: 70, q: 0.4 } });
    v.tone({ t: 0.03, f: 70, f1: 30, d: 1.4, g: 0.8, vib: [13, 0.2] });
  }

  // ------------------------------------------------------------------ the world

  /** A plank torn off (`gone`) or nailed back. */
  plank(at: At, gone: boolean): void {
    const v = this.s.voice({ gain: gone ? 1 : 0.4, priority: 1, at, range: 30, ref: 6, reverb: 0.2 });
    if (gone) {
      v.noise({ d: 0.09, g: 1, filter: { type: 'bandpass', f: 950 * vary(0.15), q: 2.5 } });
      v.tone({ type: 'triangle', f: 240 * vary(0.1), f1: 110, d: 0.12, g: 0.8 });
      v.noise({ t: 0.03, d: 0.2, g: 0.3, a: 0.02, filter: { type: 'bandpass', f: 2400, f1: 1000, q: 3 } });
    } else {
      for (const t of [0, 0.17]) v.tone({ t, f: 190, f1: 120, d: 0.07, g: 0.9 }).noise({ t, d: 0.025, g: 0.8, filter: { type: 'bandpass', f: 1900, q: 2 } }).tone({ t, f: 2300, d: 0.05, g: 0.1 });
    }
  }

  /** A bought door grinding open, or rubble sliding away. */
  door(at: At, debris: boolean): void {
    const v = this.s.voice({ gain: 0.5, priority: 2, at, range: 40, ref: 8, reverb: 0.4 });
    if (debris) {
      for (let i = 0; i < 9; i++) {
        const t = Math.random() * 0.8;
        v.noise({ t, d: 0.1 + Math.random() * 0.2, g: 0.5 + Math.random() * 0.5, filter: { type: 'lowpass', f: 500 + Math.random() * 900, f1: 150 } });
        v.tone({ t, f: 60 + Math.random() * 60, f1: 40, d: 0.1, g: 0.5 });
      }
      return;
    }
    v.tone({ type: 'sawtooth', f: 48, f1: 64, d: 0.75, g: 0.6, a: 0.05, r: 0.1, vib: [23, 0.25], filter: { type: 'lowpass', f: 520 } });
    v.noise({ d: 0.75, g: 0.4, a: 0.05, r: 0.1, filter: { type: 'bandpass', f: 1400, f1: 700, q: 3 } });
    v.tone({ t: 0.74, f: 110, f1: 45, d: 0.25, g: 1.1 });
    v.noise({ t: 0.74, d: 0.12, g: 0.8, filter: { type: 'lowpass', f: 1800, f1: 300 } });
  }

  /** The master switch: the breaker slams and the station winds up. */
  powerOn(): void {
    const v = this.s.voice({ gain: 0.6, priority: 3, reverb: 0.7 });
    v.noise({ d: 0.08, g: 1, filter: { type: 'lowpass', f: 3000, f1: 400 } }).tone({ f: 140, f1: 42, d: 0.3, g: 1.2 });
    v.tone({ t: 0.25, type: 'sawtooth', f: 24, f1: 100, d: 2.2, g: 0.55, a: 0.6, r: 0.8, filter: { type: 'lowpass', f: 200, f1: 900 } });
    v.tone({ t: 0.25, type: 'triangle', f: 300, f1: 2400, d: 1.8, g: 0.12, a: 0.8, r: 0.5 });
    for (let i = 0; i < 6; i++) v.noise({ t: 0.5 + i * 0.22 + Math.random() * 0.1, d: 0.03, g: 0.4, filter: { type: 'highpass', f: 4000 } });
  }

  /** A drop of meltwater from the roof. */
  drip(at: At): void {
    this.s.voice({ gain: 0.3, priority: 0, at, range: 14, ref: 4, reverb: 0.5 }).tone({ f: 1300 * vary(0.2), f1: 2500, d: 0.05, a: 0.004 }).tone({ t: 0.03, f: 800, f1: 620, d: 0.06, g: 0.3 });
  }

  /** A spit from a fire. */
  ember(at: At): void {
    const v = this.s.voice({ gain: 0.35, priority: 0, at, range: 13, ref: 3.5 });
    for (let i = 0; i < 3; i++) v.noise({ t: Math.random() * 0.3, d: 0.01 + Math.random() * 0.03, g: 0.4 + Math.random() * 0.6, filter: { type: 'bandpass', f: 1500 + Math.random() * 4000, q: 2 } });
    v.noise({ d: 0.4, g: 0.12, a: 0.1, r: 0.2, filter: { type: 'lowpass', f: 400 } });
  }

  /**
   * A siren a long way off across the city, that never gets any nearer: two slow wails through
   * a lot of air. `pan` is which way it seems to come from.
   */
  distantSiren(pan = 0): void {
    const v = this.s.voice({ gain: 0.11, priority: 0, bus: 'music', pan, reverb: 1 });
    for (let i = 0; i < 2; i++) {
      v.tone({ t: i * 4.6, type: 'sawtooth', f: 520, via: [[0.42, 880], [0.55, 860], [1, 500]], d: 4.4, g: 0.5, a: 0.8, r: 1.6, filter: { type: 'bandpass', f: 760, q: 1.2 } });
      v.tone({ t: i * 4.6 + 0.35, type: 'sine', f: 518, via: [[0.42, 874], [0.55, 856], [1, 498]], d: 4.4, g: 0.2, a: 1, r: 1.8 });
    }
  }

  // ------------------------------------------------------------------ our own body

  hurt(heavy: boolean): void {
    const v = this.s.voice({ gain: 0.8, priority: 3 });
    v.noise({ d: 0.12, g: 1, filter: { type: 'lowpass', f: 700, f1: 150 } }).tone({ f: 95, f1: 45, d: 0.16, g: 1 });
    v.noise({ t: 0.01, d: 0.07, g: 0.5, filter: { type: 'bandpass', f: 2200, q: 1.5 } });
    if (heavy) v.tone({ f: 3100, d: 0.5, g: 0.05, a: 0.02 });
  }

  /** One beat of a frightened heart. */
  heartbeat(strength: number): void {
    this.s.voice({ gain: 0.7 * strength, priority: 2, bus: 'music' }).tone({ f: 62, f1: 40, d: 0.12, g: 1 }).tone({ t: 0.16, f: 54, f1: 36, d: 0.14, g: 0.7 });
  }

  /** Going down, and getting back up. */
  downed(): void {
    this.s.voice({ gain: 0.45, priority: 3, bus: 'music', reverb: 0.6 })
      .tone({ type: 'triangle', f: 330, f1: 55, d: 1.4, g: 0.7, a: 0.01, r: 0.6 }).tone({ type: 'sawtooth', f: 165, f1: 41, d: 1.4, g: 0.3, r: 0.6, filter: { type: 'lowpass', f: 600, f1: 120 } });
  }

  revived(): void {
    const v = this.s.voice({ gain: 0.5, priority: 3, bus: 'music', reverb: 0.5 });
    [220, 277, 330, 440].forEach((f, i) => v.tone({ t: i * 0.09, type: 'triangle', f, d: 0.5, g: 0.6 }));
    v.noise({ d: 0.5, g: 0.2, a: 0.3, filter: { type: 'bandpass', f: 800, f1: 3000, q: 1 } });
  }

  /** A held revive ticking along (every half second or so). */
  reviveTick(n: number): void {
    this.s.voice({ gain: 0.55, priority: 1 }).tone({ type: 'triangle', f: 440 + n * 55, d: 0.09 });
  }

  // ------------------------------------------------------------------ HUD

  /** Our bullet landed: a tick, brighter for a head, a pop for a kill, a ring for a headshot kill. */
  tick(kind: 'hit' | 'head' | 'kill' | 'headkill'): void {
    if (!this.gate(kind === 'hit' || kind === 'head' ? 'hit' : 'kill', 0.045)) return;
    const v = this.s.voice({ gain: 0.7, priority: 2 });
    if (kind === 'hit') v.tone({ type: 'triangle', f: 1750, f1: 1300, d: 0.035 });
    else if (kind === 'head') v.tone({ type: 'triangle', f: 2600, f1: 2100, d: 0.045 }).tone({ f: 3900, d: 0.05, g: 0.4 });
    else {
      v.tone({ type: 'triangle', f: 980, f1: 420, d: 0.09, g: 1.1 }).noise({ d: 0.03, g: 0.4, filter: { type: 'bandpass', f: 1800, q: 1 } });
      if (kind === 'headkill') v.tone({ t: 0.03, f: 3136, d: 0.35, g: 0.5 }).tone({ t: 0.03, f: 4699, d: 0.22, g: 0.2 });
    }
  }

  /** The till: points spent. */
  purchase(at?: At): void {
    const v = this.s.voice({ gain: at ? 0.5 : 0.45, priority: at ? 1 : 2, at, range: 25, ref: 5, reverb: 0.2 });
    v.noise({ d: 0.03, g: 0.8, filter: { type: 'bandpass', f: 1600, q: 2 } }).tone({ type: 'square', f: 180, f1: 110, d: 0.05, g: 0.5, filter: { type: 'lowpass', f: 1200 } });
    v.tone({ t: 0.07, f: 1568, d: 0.35, g: 0.5 }).tone({ t: 0.07, f: 3136, d: 0.2, g: 0.15 }).tone({ t: 0.15, f: 2093, d: 0.45, g: 0.5 }).tone({ t: 0.15, f: 4186, d: 0.25, g: 0.12 });
  }

  /** No: not enough points, no power. */
  denied(): void {
    const v = this.s.voice({ gain: 0.2, priority: 2 });
    for (const t of [0, 0.13]) v.tone({ t, type: 'square', f: 117, d: 0.1, g: 0.8, r: 0.02, filter: { type: 'lowpass', f: 700 } });
  }

  /** A button in a menu. */
  click(): void {
    this.s.voice({ gain: 0.6, priority: 2 }).tone({ type: 'triangle', f: 660, f1: 520, d: 0.05 }).noise({ d: 0.015, g: 0.3, filter: { type: 'highpass', f: 3000 } });
  }

  /** A teammate's ping marker: two bright notes, from where it was put. */
  mark(at?: At): void {
    const v = this.s.voice({ gain: 0.5, priority: 2, at, range: 70, ref: 12 });
    v.tone({ type: 'triangle', f: 1175, d: 0.09 }).tone({ t: 0.09, type: 'triangle', f: 1760, d: 0.2, g: 0.9 }).tone({ t: 0.09, f: 3520, d: 0.12, g: 0.15 });
  }

  /** A chat line from someone else. */
  chat(): void {
    this.s.voice({ gain: 0.35, priority: 3 }).tone({ type: 'triangle', f: 880, f1: 990, d: 0.06 }).tone({ t: 0.05, f: 1320, d: 0.08, g: 0.5 });
  }

  /** The Forge's hammer on hot metal. */
  anvil(at: At, n: number): void {
    const v = this.s.voice({ gain: 0.6, priority: 1, at, range: 40, ref: 8, reverb: 0.5, delay: n * 0.62 });
    for (const [f, g, d] of [[830, 0.5, 0.5], [1265, 0.35, 0.4], [1990, 0.25, 0.3], [2740, 0.15, 0.2]] as const) v.tone({ f: f * vary(0.01), d, g });
    v.noise({ d: 0.03, g: 0.9, filter: { type: 'highpass', f: 2200 } }).tone({ f: 150, f1: 70, d: 0.08, g: 0.8 });
    v.noise({ t: 0.1, d: 0.4, g: 0.15, a: 0.1, filter: { type: 'bandpass', f: 5000, f1: 2000, q: 1 } });
  }
}
