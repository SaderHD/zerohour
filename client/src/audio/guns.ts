// Weapon sounds: every gun's shot, the stages of a reload, the knife, throws and blasts.
import type { WeaponClass, WeaponDef, WeaponId } from '@zh/shared';
import { vary, type Synth, type Voice } from './synth';

type At = { x: number; z: number } | undefined;

/** How one gun's shot is built: a pitch-dropping thump, a noise body, a crack on top, a tail in the room. */
interface GunVoice {
  thump: number;
  body: number;
  crack: number;
  len: number;
  tail: number;
  gain: number;
  kind?: 'zap' | 'whoomp' | 'thoonk';
}

const BY_CLASS: Record<WeaponClass, GunVoice> = {
  pistol: { thump: 150, body: 2400, crack: 0.7, len: 0.16, tail: 0.25, gain: 0.68 },
  revolver: { thump: 105, body: 1700, crack: 0.9, len: 0.3, tail: 0.5, gain: 0.75 },
  rifle: { thump: 120, body: 2600, crack: 1, len: 0.26, tail: 0.55, gain: 0.7 },
  shotgun: { thump: 78, body: 1300, crack: 0.6, len: 0.4, tail: 0.6, gain: 0.85 },
  smg: { thump: 175, body: 3000, crack: 0.6, len: 0.1, tail: 0.18, gain: 0.45 },
  ar: { thump: 135, body: 2500, crack: 0.8, len: 0.14, tail: 0.3, gain: 0.55 },
  lmg: { thump: 95, body: 1900, crack: 0.7, len: 0.17, tail: 0.35, gain: 0.62 },
  sniper: { thump: 85, body: 2200, crack: 1.2, len: 0.55, tail: 0.9, gain: 0.95 },
  launcher: { thump: 200, body: 800, crack: 0.2, len: 0.2, tail: 0.3, gain: 0.7, kind: 'thoonk' },
  wonder: { thump: 90, body: 2500, crack: 0.5, len: 0.4, tail: 0.6, gain: 0.7, kind: 'zap' },
};
/** Where one gun differs from its class. */
const BY_GUN: Partial<Record<WeaponId, Partial<GunVoice>>> = {
  brakeman: { thump: 205, body: 3600, len: 0.08 },
  coachman: { thump: 66, body: 1050, len: 0.5, gain: 0.95 },
  ferrier: { thump: 88, body: 1500, len: 0.26, gain: 0.75 },
  gravewell: { kind: 'whoomp', gain: 0.8 },
};

const gunVoice = (def: WeaponDef): GunVoice => ({ ...BY_CLASS[def.cls], ...BY_GUN[def.id] });

/** A burst of electrical crackle on a voice. */
function crackle(v: Voice, t: number, d: number, g: number): void {
  for (let i = 0; i < 6; i++) v.noise({ t: t + Math.random() * d, d: 0.012 + Math.random() * 0.03, g: g * (0.5 + Math.random()), filter: { type: 'highpass', f: 2500 + Math.random() * 3000 } });
}

export class GunSounds {
  constructor(private readonly s: Synth) {}

  /** A shot. `at` is another player's muzzle; ours has no place. */
  shot(def: WeaponDef, upgraded: boolean, at?: At): void {
    const g = gunVoice(def);
    const p = vary(0.04);
    const v = this.s.voice({ gain: g.gain * (at ? 0.9 : 1), priority: at ? 1 : 3, at, ref: 12, range: 80, reverb: g.tail, pan: at ? 0 : 0.12 });
    if (v.dead) return;
    if (g.kind === 'zap') {
      // The Arclight: a buzzing arc and its crackle.
      v.tone({ type: 'sawtooth', f: 95 * p, f1: 60, d: 0.4, g: 0.6, vib: [43, 0.3], filter: { type: 'lowpass', f: 2600, f1: 500 } });
      v.noise({ d: 0.35, g: 0.7, filter: { type: 'bandpass', f: 3200 * p, f1: 900, q: 3 } });
      v.tone({ type: 'square', f: 2100 * p, f1: 240, d: 0.12, g: 0.25 });
      crackle(v, 0, 0.3, 0.5);
    } else if (g.kind === 'whoomp') {
      // The Gravewell: the air folds in behind the orb.
      v.tone({ f: 190 * p, f1: 28, d: 0.8, g: 1 });
      v.noise({ d: 0.7, g: 0.6, a: 0.02, filter: { type: 'lowpass', f: 600, f1: 70 } });
      v.tone({ type: 'triangle', f: 260, f1: 1300 * p, d: 0.5, g: 0.16, a: 0.2 });
    } else if (g.kind === 'thoonk') {
      v.tone({ f: g.thump * 1.2 * p, f1: 62, d: 0.2, g: 1 });
      v.tone({ type: 'triangle', f: 420 * p, f1: 180, d: 0.08, g: 0.4 });
      v.noise({ d: 0.12, g: 0.5, filter: { type: 'lowpass', f: g.body, f1: 200 } });
    } else {
      v.noise({ d: g.len, g: 1, filter: { type: 'lowpass', f: g.body * 2.4 * p, f1: g.body * 0.25, q: 0.8 } });
      v.noise({ d: 0.035, g: g.crack, filter: { type: 'highpass', f: 3200 } });
      v.tone({ f: g.thump * 2.3 * p, f1: g.thump * 0.45, d: g.len * 0.85, g: 0.95 });
      v.tone({ type: 'square', f: g.thump * 5.1 * p, f1: g.thump * 1.8, d: 0.045, g: 0.22, filter: { type: 'lowpass', f: 3400 } });
      if (def.pellets > 1) v.noise({ t: 0.01, d: g.len * 1.2, g: 0.45, a: 0.01, filter: { type: 'bandpass', f: 700, f1: 260, q: 0.6 } });
    }
    if (upgraded) {
      // Forged guns sing as they fire.
      v.tone({ type: 'sawtooth', f: 1900 * p, f1: 280, d: 0.16, g: 0.16, filter: { type: 'bandpass', f: 1500, q: 2 } });
      v.tone({ f: 2640 * p, f1: 1320, d: 0.22, g: 0.1 });
    }
  }

  /** The hammer falls on nothing. */
  dry(): void {
    this.s.voice({ gain: 0.8, priority: 2 }).noise({ d: 0.02, filter: { type: 'bandpass', f: 2600, q: 3 } }).tone({ type: 'square', f: 900, f1: 500, d: 0.015, g: 0.4 });
  }

  /** One step of a reload, in time with the hands: 'out' (magazine drops), 'in' (the new one seats), 'rack'. */
  reload(def: WeaponDef, stage: 'out' | 'in' | 'rack', at?: At): void {
    const heavy = def.cls === 'lmg' || def.cls === 'sniper' || def.cls === 'launcher' || def.cls === 'shotgun' ? 0.75 : 1;
    const v = this.s.voice({ gain: (at ? 0.7 : 0.6) * (stage === 'out' ? 2 : 1), priority: at ? 0 : 2, at, range: 16, ref: 4, pan: 0.15 });
    if (stage === 'out') {
      v.noise({ d: 0.05, g: 0.8, filter: { type: 'bandpass', f: 1800 * heavy, q: 2 } });
      v.tone({ type: 'triangle', f: 520 * heavy, f1: 300, d: 0.06, g: 0.5 });
      v.noise({ t: 0.06, d: 0.12, g: 0.25, a: 0.03, filter: { type: 'bandpass', f: 900, q: 0.8 } });
    } else if (stage === 'in') {
      v.noise({ d: 0.03, g: 0.9, filter: { type: 'bandpass', f: 2300 * heavy, q: 2.5 } });
      v.tone({ type: 'square', f: 240 * heavy, f1: 130, d: 0.07, g: 0.6, filter: { type: 'lowpass', f: 1400 } });
      v.noise({ t: 0.05, d: 0.03, g: 0.5, filter: { type: 'highpass', f: 3000 } });
    } else this.action(v, heavy, 0);
  }

  /** A slide, bolt or pump going back and home: two strokes. */
  private action(v: Voice, heavy: number, t: number): void {
    for (const [dt, f] of [[0, 1500], [0.11, 2100]] as const) {
      v.noise({ t: t + dt, d: 0.06, g: 0.8, a: 0.008, filter: { type: 'bandpass', f: f * heavy, f1: f * heavy * 0.6, q: 1.6 } });
      v.tone({ t: t + dt + 0.04, type: 'square', f: 330 * heavy, f1: 190, d: 0.03, g: 0.4, filter: { type: 'lowpass', f: 2000 } });
    }
  }

  /** The pump worked after a shot. */
  pump(delay: number): void {
    this.action(this.s.voice({ gain: 0.38, priority: 2, pan: 0.15, delay }), 0.75, 0);
  }

  /** A weapon coming up: cloth and a rattle. */
  swap(): void {
    this.s.voice({ gain: 0.6, priority: 1 })
      .noise({ d: 0.18, g: 0.6, a: 0.05, filter: { type: 'bandpass', f: 700, f1: 1500, q: 0.7 } })
      .noise({ t: 0.16, d: 0.03, g: 0.7, filter: { type: 'bandpass', f: 2400, q: 3 } });
  }

  /** The knife through the air; `hit` when it finds a body. */
  knife(hit: boolean, at?: At): void {
    const v = this.s.voice({ gain: at ? 0.8 : 0.7, priority: at ? 1 : 2, at, range: 18, ref: 4 });
    v.noise({ d: 0.16, g: 1.2, a: 0.04, filter: { type: 'bandpass', f: 900, f1: 3800, q: 1.4 } });
    if (!hit) return;
    v.noise({ t: 0.07, d: 0.11, g: 1.1, filter: { type: 'lowpass', f: 900, f1: 180 } });
    v.tone({ t: 0.07, f: 130, f1: 55, d: 0.12, g: 0.9 });
    v.noise({ t: 0.08, d: 0.07, g: 0.4, filter: { type: 'bandpass', f: 2600, q: 1 } });
  }

  /** An arm coming over: a grenade or a decoy on its way. */
  toss(): void {
    this.s.voice({ gain: 0.6, priority: 2 })
      .noise({ d: 0.025, g: 0.6, filter: { type: 'highpass', f: 4000 } })
      .noise({ t: 0.12, d: 0.22, g: 0.7, a: 0.08, filter: { type: 'bandpass', f: 500, f1: 1600, q: 0.9 } });
  }

  /** Something went off: 'frag' or a shell, a 'siren' decoy's last pop, a singularity closing ('well'). */
  explosion(at: At, kind: string): void {
    const v = this.s.voice({ gain: 1, priority: 3, at, ref: 16, range: 110, reverb: 0.8 });
    if (kind === 'well') {
      // Everything rushes inwards, then a hole where the sound was.
      v.noise({ d: 0.3, g: 0.8, a: 0.26, filter: { type: 'bandpass', f: 300, f1: 4200, q: 1.2 } });
      v.tone({ t: 0.28, f: 240, f1: 22, d: 1.1, g: 1.2 });
      v.noise({ t: 0.28, d: 0.9, g: 0.9, filter: { type: 'lowpass', f: 1400, f1: 60 } });
      v.tone({ t: 0.28, type: 'triangle', f: 1760, f1: 110, d: 0.5, g: 0.2 });
      return;
    }
    const small = kind === 'siren' ? 0.6 : 1;
    v.noise({ d: 0.05, g: 1, filter: { type: 'highpass', f: 2000 } });
    v.noise({ d: 1.2 * small, g: 1.1, filter: { type: 'lowpass', f: 2600, f1: 90, q: 0.5 } });
    v.tone({ f: 120 / small, f1: 26, d: 0.9 * small, g: 1.3 });
    v.noise({ t: 0.15, d: 1.4 * small, g: 0.35, a: 0.2, filter: { type: 'bandpass', f: 320, f1: 120, q: 0.6 } });
  }

  /** An Arclight bolt landing on a body. */
  arc(at: At, n: number): void {
    const v = this.s.voice({ gain: 0.5, priority: 1, at, ref: 9, range: 50, reverb: 0.3, delay: n * 0.045 });
    v.tone({ type: 'sawtooth', f: 140 + n * 22, f1: 70, d: 0.18, g: 0.5, vib: [51, 0.35], filter: { type: 'lowpass', f: 3000 } });
    crackle(v, 0, 0.16, 0.6);
  }

  /** The hum of an open singularity (played in overlapping pieces while it lasts). */
  wellHum(at: At): void {
    this.s.voice({ gain: 0.35, priority: 2, at, ref: 9, range: 50, reverb: 0.4 })
      .tone({ type: 'sawtooth', f: 52, f1: 44, d: 0.7, g: 0.8, a: 0.2, r: 0.3, vib: [11, 0.08], filter: { type: 'lowpass', f: 420 } })
      .tone({ f: 660 * vary(0.2), f1: 220, d: 0.6, g: 0.12, a: 0.1, r: 0.3 })
      .noise({ d: 0.7, g: 0.25, a: 0.25, r: 0.3, filter: { type: 'bandpass', f: 1800, f1: 500, q: 2 } });
  }

  /** One rise and fall of a Siren decoy's wail. */
  sirenWail(at: At): void {
    this.s.voice({ gain: 0.5, priority: 2, at, ref: 10, range: 60, reverb: 0.35 })
      .tone({ type: 'sawtooth', f: 520, via: [[0.45, 1150], [1, 520]], d: 0.9, g: 0.5, a: 0.05, r: 0.08, filter: { type: 'bandpass', f: 1300, q: 1.2 } })
      .tone({ type: 'square', f: 526, via: [[0.45, 1160], [1, 526]], d: 0.9, g: 0.12, a: 0.05, r: 0.08, filter: { type: 'lowpass', f: 2400 } });
  }

  /** A thrown thing bouncing off the floor. */
  clink(at: At): void {
    this.s.voice({ gain: 0.4, priority: 0, at, range: 25, ref: 5 }).tone({ type: 'triangle', f: 1900 * vary(0.1), f1: 1400, d: 0.05 }).noise({ d: 0.02, g: 0.5, filter: { type: 'highpass', f: 3500 } });
  }
}
