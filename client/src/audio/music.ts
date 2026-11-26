// Everything with a tune: round stings, each tonic's own little phrase, the Cache's music box,
// the power-up cues. All of it is written here as notes; nothing is borrowed.
import type { PerkId, PowerupId } from '@zh/shared';
import { midi, type Synth, type ToneSpec, type Voice } from './synth';

type At = { x: number; z: number; y?: number } | undefined;
/** [MIDI note (0 = rest), beats] */
type Note = readonly [number, number];

interface Phrase {
  notes: readonly Note[];
  /** Beats per minute. */
  bpm: number;
  type: OscillatorType;
  /** Fraction of each note that sounds (1 = legato). */
  gate?: number;
  g?: number;
  /** Extra layer: [semitones above, gain]. */
  layer?: readonly [number, number];
  filter?: ToneSpec['filter'];
  /** Ring out like a struck thing rather than hold like a blown one. */
  pluck?: boolean;
}

/** Play a phrase on a voice starting at `t`; returns the time it ends. */
function play(v: Voice, p: Phrase, t = 0): number {
  const beat = 60 / p.bpm;
  for (const [n, beats] of p.notes) {
    const d = beats * beat * (p.gate ?? 0.9);
    if (n > 0) {
      const env = p.pluck ? { d: Math.max(d, 0.25) } : { d, a: Math.min(0.02, d * 0.3), r: Math.min(0.08, d * 0.5) };
      v.tone({ t, type: p.type, f: midi(n), g: p.g ?? 0.5, filter: p.filter, ...env });
      if (p.layer) v.tone({ t, type: p.type, f: midi(n + p.layer[0]), g: (p.g ?? 0.5) * p.layer[1], filter: p.filter, ...env });
    }
    t += beats * beat;
  }
  return t;
}

/** A drum for the stings: a low skin and the slap of the stick. */
function thud(v: Voice, t: number, g = 1): void {
  v.tone({ t, f: 98, f1: 44, d: 0.35, g }).noise({ t, d: 0.05, g: g * 0.4, filter: { type: 'lowpass', f: 900 } });
}

/** Each tonic's phrase: short, and unlike the others in rhythm and voice. */
const TONIC: Record<string, Phrase> = {
  // Heavy and square: three slow steps down to the root.
  ironhide: { notes: [[43, 1], [41, 1], [36, 2]], bpm: 132, type: 'sawtooth', g: 0.45, layer: [7, 0.6], filter: { type: 'lowpass', f: 900 } },
  // A breath drawn in: a rising sixth that hangs.
  second_wind: { notes: [[64, 0.5], [67, 0.5], [73, 1.5], [76, 2]], bpm: 150, type: 'sine', g: 0.5, layer: [12, 0.25] },
  // Too fast to follow.
  quickhands: { notes: [[81, 0.25], [84, 0.25], [81, 0.25], [88, 0.25], [86, 0.25], [93, 0.75]], bpm: 176, type: 'square', g: 0.26, gate: 0.6, filter: { type: 'lowpass', f: 3800 } },
  // Three taps on one note and a snap upwards.
  hair_trigger: { notes: [[74, 0.33], [74, 0.33], [74, 0.34], [81, 0.5], [0, 0.25], [86, 0.75]], bpm: 160, type: 'triangle', g: 0.55, gate: 0.5 },
  // A long-legged gallop.
  marathon: { notes: [[55, 0.5], [55, 0.25], [62, 0.25], [55, 0.5], [55, 0.25], [62, 0.25], [67, 1.5]], bpm: 168, type: 'triangle', g: 0.55, gate: 0.7, layer: [12, 0.3] },
  // A plodding bass under a creak of harness.
  packmule: { notes: [[41, 1], [45, 0.5], [41, 0.5], [48, 1], [53, 1.5]], bpm: 120, type: 'sawtooth', g: 0.5, gate: 0.8, filter: { type: 'lowpass', f: 700 } },
};

/**
 * The carols of The Longest Night (PLAN 4.12): tunes some centuries old, which belong to nobody,
 * set down here as notes a phrase at a time. The diner's jukebox and the music box in the grotto
 * play them a phrase at a time, a little slow and a little flat.
 */
export const CAROLS: readonly { name: string; bpm: number; phrases: readonly (readonly Note[])[] }[] = [
  {
    // "God rest ye merry, gentlemen" (English, traditional), in E minor.
    name: 'gentlemen', bpm: 104,
    phrases: [
      [[64, 1], [64, 1], [71, 1], [71, 1], [69, 1], [67, 1], [66, 1], [64, 1], [62, 1], [64, 1], [66, 1], [67, 1], [69, 1], [71, 3]],
      [[64, 1], [64, 1], [71, 1], [71, 1], [69, 1], [67, 1], [66, 1], [64, 1], [62, 1], [64, 1], [66, 1], [67, 1], [69, 1], [71, 3]],
      [[71, 1], [72, 1], [69, 1], [71, 1], [72, 1], [74, 1], [76, 1], [71, 1], [69, 1], [67, 1], [64, 1], [66, 1], [67, 1], [69, 3]],
      [[67, 0.5], [69, 0.5], [71, 2], [72, 1], [71, 1], [71, 1], [69, 1], [67, 1], [66, 1], [64, 2], [67, 0.5], [66, 0.5], [64, 1], [69, 2], [67, 1], [69, 1], [71, 1], [72, 1], [74, 1], [76, 1], [71, 1], [69, 1], [67, 1], [66, 1], [64, 4]],
    ],
  },
  {
    // The Coventry Carol (English, sixteenth century), in G minor, three in a bar.
    name: 'coventry', bpm: 92,
    phrases: [
      [[67, 1], [67, 1], [66, 1], [67, 2], [70, 1], [69, 2], [67, 1], [66, 3]],
      [[67, 1], [69, 1], [70, 1], [72, 2], [69, 1], [67, 3], [0, 1]],
      [[74, 1], [72, 2], [70, 1], [69, 2], [70, 1], [69, 1], [67, 1], [66, 1], [67, 3]],
      [[67, 1], [69, 1], [70, 1], [72, 2], [69, 1], [71, 5]],
    ],
  },
  {
    // The tune called Greensleeves (English, sixteenth century), in A minor.
    name: 'greensleeves', bpm: 132,
    phrases: [
      [[69, 1], [72, 2], [74, 1], [76, 1.5], [77, 0.5], [76, 1], [74, 2], [71, 1], [67, 1.5], [69, 0.5], [71, 1], [72, 2], [69, 1], [69, 1.5], [68, 0.5], [69, 1], [71, 2], [68, 1], [64, 2]],
      [[69, 1], [72, 2], [74, 1], [76, 1.5], [77, 0.5], [76, 1], [74, 2], [71, 1], [67, 1.5], [69, 0.5], [71, 1], [72, 1.5], [71, 0.5], [69, 1], [68, 1.5], [66, 0.5], [68, 1], [69, 5]],
      [[79, 3], [79, 1.5], [78, 0.5], [76, 1], [74, 2], [71, 1], [67, 1.5], [69, 0.5], [71, 1], [72, 2], [69, 1], [69, 1.5], [68, 0.5], [69, 1], [71, 2], [68, 1], [64, 3]],
      [[79, 3], [79, 1.5], [78, 0.5], [76, 1], [74, 2], [71, 1], [67, 1.5], [69, 0.5], [71, 1], [72, 1.5], [71, 0.5], [69, 1], [68, 1.5], [66, 0.5], [68, 1], [69, 5]],
    ],
  },
  {
    // "O come, O come, Emmanuel" (the plainsong Veni Emmanuel, fifteenth century), in E minor.
    name: 'emmanuel', bpm: 84,
    phrases: [
      [[64, 1], [67, 1], [71, 1], [71, 1], [71, 1], [69, 1], [72, 1], [71, 1], [69, 1], [67, 3]],
      [[69, 1], [71, 1], [67, 1], [64, 1], [67, 1], [69, 1], [66, 1], [64, 1], [62, 1], [64, 3]],
      [[69, 1], [69, 1], [64, 1], [64, 1], [66, 1], [67, 2], [66, 1], [64, 1], [62, 3]],
      [[74, 2], [74, 1], [71, 2], [71, 1], [71, 1], [69, 1], [72, 1], [71, 1], [69, 1], [67, 3], [69, 1], [71, 1], [67, 1], [64, 1], [67, 1], [69, 1], [66, 1], [64, 1], [62, 1], [64, 4]],
    ],
  },
];
/** How flat the old machines play: a little under a third of a semitone. */
const FLAT = -0.3;

/** The Cache's music box: a pentatonic wander that never quite repeats. */
const BOX_SCALE = [74, 76, 79, 81, 84, 86, 88, 91];

export class Music {
  constructor(private readonly s: Synth) {}

  /** A tonic going down. `at`: someone else drinking. */
  tonic(id: PerkId, at?: At): void {
    const p = TONIC[id];
    if (!p) return;
    const v = this.s.voice({ gain: at ? 0.45 : 0.45, priority: at ? 1 : 3, at, range: 30, ref: 6, reverb: 0.35 });
    // The cap comes off, it goes down, then the phrase.
    v.noise({ d: 0.05, g: 0.5, filter: { type: 'highpass', f: 3500 } }).noise({ t: 0.05, d: 0.25, g: 0.2, a: 0.02, filter: { type: 'bandpass', f: 5000, f1: 2500, q: 1 } });
    for (let i = 0; i < 3; i++) v.tone({ t: 0.35 + i * 0.2, f: 190 - i * 14, f1: 120, d: 0.09, g: 0.5 });
    play(v, p, 0.95);
    if (id === 'packmule') for (let i = 0; i < 4; i++) v.noise({ t: 0.95 + i * 0.5, d: 0.04, g: 0.35, filter: { type: 'bandpass', f: 1300, q: 3 } });
  }

  /**
   * One phrase of a carol, from the diner's jukebox (a worn record: a reedy lead over its own
   * bass, the needle's crackle) or the music box in the grotto (a comb of steel, an octave up,
   * slower still). Returns how long the phrase lasts, so whoever plays it knows when the next is due.
   */
  carol(player: 'jukebox' | 'box', tune: number, phrase: number, at?: At): number {
    const c = CAROLS[tune % CAROLS.length]!;
    const notes = c.phrases[phrase % c.phrases.length]!;
    const box = player === 'box';
    const bpm = c.bpm * (box ? 0.8 : 0.9);
    const seconds = notes.reduce((n, [, beats]) => n + beats, 0) * (60 / bpm);
    const v = this.s.voice({ gain: box ? 0.3 : 0.2, priority: 0, bus: 'music', at, range: box ? 24 : 30, ref: box ? 5 : 6, reverb: box ? 0.5 : 0.3 });
    if (v.dead) return seconds;
    const shifted = (by: number): Note[] => notes.map(([n, beats]) => [n ? n + by : 0, beats] as const);
    if (box) {
      play(v, { notes: shifted(12 + FLAT), bpm, type: 'sine', g: 0.5, pluck: true, layer: [12, 0.2] });
      // The comb's own tick, and the drum turning.
      let t = 0;
      for (const [n, beats] of notes) {
        if (n) v.noise({ t, d: 0.012, g: 0.25, filter: { type: 'highpass', f: 5000 } });
        t += beats * (60 / bpm);
      }
    } else {
      play(v, { notes: shifted(FLAT), bpm, type: 'triangle', g: 0.42, gate: 0.95, layer: [12.06, 0.22], filter: { type: 'lowpass', f: 2200 } });
      // The bass plods along under it on the first of every three beats, a fifth and an octave down.
      let t = 0;
      let beat = 0;
      for (const [n, beats] of notes) {
        if (n && Math.floor(beat / 3) !== Math.floor((beat - 0.01) / 3)) v.tone({ t, type: 'sine', f: midi(n - 19 + FLAT), d: 0.5, g: 0.3, a: 0.02, r: 0.2 });
        t += beats * (60 / bpm);
        beat += beats;
      }
      v.noise({ d: seconds, g: 0.035, a: 0.05, r: 0.1, filter: { type: 'highpass', f: 4200 } });
      for (let i = 0; i < seconds * 2.2; i++) v.noise({ t: Math.random() * seconds, d: 0.006, g: 0.18 + Math.random() * 0.2, filter: { type: 'bandpass', f: 2500 + Math.random() * 3000, q: 1.5 } });
    }
    return seconds;
  }

  /** The Cache rolling: a music box winding down over `seconds`, the slower the nearer it is to choosing. */
  cacheRoll(at: At, seconds: number, seed: number): void {
    const v = this.s.voice({ gain: 0.5, priority: 2, at, range: 40, ref: 8, reverb: 0.45 });
    if (v.dead) return;
    v.noise({ d: 0.3, g: 0.5, a: 0.02, filter: { type: 'lowpass', f: 500, f1: 1500 } }).tone({ f: 90, f1: 150, d: 0.3, g: 0.5 });
    let t = 0.25;
    let step = 0.09;
    let i = seed % BOX_SCALE.length;
    while (t < seconds - 0.2) {
      const n = BOX_SCALE[i]!;
      v.tone({ t, type: 'triangle', f: midi(n), d: 0.3, g: 0.4 }).tone({ t, f: midi(n + 12), d: 0.12, g: 0.12 });
      i = (i + 3 + ((seed + Math.floor(t * 7)) % 3)) % BOX_SCALE.length;
      t += step;
      step *= 1.045;
    }
  }

  /** The lid stops on a weapon. */
  cacheOffer(at: At): void {
    const v = this.s.voice({ gain: 0.55, priority: 2, at, range: 40, ref: 8, reverb: 0.5 });
    [74, 78, 81, 86].forEach((n, i) => v.tone({ t: i * 0.05, type: 'triangle', f: midi(n), d: 1.1, g: 0.4 }));
    v.tone({ f: midi(98), d: 0.6, g: 0.1 });
  }

  /** The Jinx: the box plays its tune wrong and laughs. */
  jinx(at: At): void {
    const v = this.s.voice({ gain: 0.45, priority: 3, at, range: 60, ref: 12, reverb: 0.6 });
    play(v, { notes: [[86, 0.5], [80, 0.5], [85, 0.5], [79, 0.5], [73, 1.5]], bpm: 150, type: 'square', g: 0.3, gate: 0.8, layer: [6, 0.5], filter: { type: 'lowpass', f: 2600 } });
    for (let i = 0; i < 7; i++) v.tone({ t: 1.5 + i * 0.11, type: 'sawtooth', f: 560 - i * 38, f1: 420 - i * 30, d: 0.08, g: 0.3, filter: { type: 'bandpass', f: 1200, q: 3 } });
    v.tone({ t: 0, f: 55, f1: 49, d: 2.2, g: 0.5, a: 0.3, r: 0.8 });
  }

  /** The Cache taking off for somewhere else. */
  cacheLeave(at: At): void {
    this.s.voice({ gain: 0.6, priority: 2, at, range: 60, ref: 12, reverb: 0.6 })
      .noise({ d: 2.2, g: 0.6, a: 0.8, r: 0.6, filter: { type: 'bandpass', f: 300, f1: 5000, q: 1.5 } })
      .tone({ type: 'triangle', f: 196, f1: 1568, d: 2.2, g: 0.3, a: 0.5, r: 0.5, vib: [7, 0.03] });
  }

  /** It has come down at its new site (heard from anywhere, faintly). */
  cacheLand(): void {
    const v = this.s.voice({ gain: 0.35, priority: 1, reverb: 0.8 });
    v.tone({ f: 80, f1: 40, d: 0.5, g: 0.8 });
    [86, 81, 74].forEach((n, i) => v.tone({ t: 0.2 + i * 0.14, type: 'triangle', f: midi(n), d: 0.7, g: 0.3 }));
  }

  /** A power-up falls: a shimmer where it lies. */
  drop(at: At): void {
    const v = this.s.voice({ gain: 0.5, priority: 2, at, range: 45, ref: 9, reverb: 0.5 });
    [93, 100, 105].forEach((n, i) => v.tone({ t: i * 0.07, f: midi(n), d: 0.7, g: 0.3 }));
  }

  /** A power-up left lying fades away. */
  dropGone(at: At): void {
    this.s.voice({ gain: 0.8, priority: 0, at, range: 30, ref: 7 }).tone({ type: 'triangle', f: 1400, f1: 500, d: 0.4, g: 0.5 });
  }

  /** The announcer's cue for a power-up taken: every kind has its own. */
  powerup(kind: PowerupId): void {
    const v = this.s.voice({ gain: 0.6, priority: 3, bus: 'music', reverb: 0.5 });
    v.tone({ f: 1760, f1: 3520, d: 0.12, g: 0.3 }); // the grab
    const t = 0.1;
    switch (kind) {
      case 'resupply': // magazines going home, then two bright steps up
        for (const dt of [0, 0.12]) v.noise({ t: t + dt, d: 0.03, g: 0.7, filter: { type: 'bandpass', f: 2300, q: 2.5 } }).tone({ t: t + dt, type: 'square', f: 240, f1: 130, d: 0.06, g: 0.5, filter: { type: 'lowpass', f: 1400 } });
        play(v, { notes: [[72, 0.5], [79, 1.5]], bpm: 140, type: 'triangle', g: 0.5, layer: [12, 0.3] }, t + 0.3);
        break;
      case 'reaper': // a bell, and something cold under it
        v.tone({ t, type: 'sawtooth', f: midi(38), f1: midi(37), d: 1.8, g: 0.5, a: 0.3, r: 0.6, filter: { type: 'lowpass', f: 500 } });
        for (const [n, g] of [[62, 0.5], [63, 0.35], [74.3, 0.25], [81.1, 0.15]] as const) v.tone({ t: t + 0.1, f: midi(n), d: 1.8, g });
        break;
      case 'double': // the same thing twice
        for (const dt of [0, 0.28]) play(v, { notes: [[76, 0.25], [83, 0.5]], bpm: 150, type: 'square', g: 0.28, layer: [12, 0.4], filter: { type: 'lowpass', f: 4000 } }, t + dt);
        break;
      case 'firestorm': // a rush of flame falling into a roar
        v.noise({ t, d: 1.5, g: 0.8, a: 0.15, r: 0.7, filter: { type: 'bandpass', f: 3500, f1: 250, q: 0.8 } });
        v.tone({ t, type: 'sawtooth', f: 330, f1: 55, d: 1.4, g: 0.4, a: 0.05, r: 0.5, filter: { type: 'lowpass', f: 1200, f1: 200 } });
        break;
      case 'rebuild': // three nails and a job done
        for (let i = 0; i < 3; i++) v.tone({ t: t + i * 0.15, f: 190, f1: 120, d: 0.07, g: 0.8 }).noise({ t: t + i * 0.15, d: 0.025, g: 0.7, filter: { type: 'bandpass', f: 1900, q: 2 } });
        play(v, { notes: [[65, 0.5], [69, 0.5], [72, 1.5]], bpm: 160, type: 'triangle', g: 0.5 }, t + 0.5);
        break;
      default: // clearance: coins down a stair, then up
        play(v, { notes: [[96, 0.25], [93, 0.25], [91, 0.25], [88, 0.25], [86, 0.25], [91, 0.25], [98, 1]], bpm: 190, type: 'triangle', g: 0.4, pluck: true, layer: [12, 0.25] }, t);
    }
  }

  /** A timed power-up running out. */
  effectEnd(): void {
    this.s.voice({ gain: 0.4, priority: 1, bus: 'music' }).tone({ type: 'triangle', f: 880, f1: 220, d: 0.6, g: 0.5, r: 0.3 }).noise({ d: 0.5, g: 0.1, r: 0.3, filter: { type: 'bandpass', f: 3000, f1: 400, q: 1 } });
  }

  /** A round begins: the station's four-note warning over a drum. */
  roundStart(round: number): void {
    const v = this.s.voice({ gain: 0.6, priority: 3, bus: 'music', reverb: 0.7 });
    v.tone({ type: 'sawtooth', f: midi(38), d: 3.4, g: 0.35, a: 0.4, r: 1.2, filter: { type: 'lowpass', f: 300, f1: 700 } });
    const end = play(v, { notes: [[50, 1], [53, 1], [57, 1], [56, 3]], bpm: 100, type: 'sawtooth', g: 0.3, layer: [-12, 0.7], filter: { type: 'lowpass', f: 1500 } }, 0.1);
    for (let i = 0; i < 4; i++) thud(v, 0.1 + i * 0.6, i === 3 ? 1 : 0.6);
    // Later rounds add a cold fifth on top.
    if (round >= 5) v.tone({ t: 1.9, type: 'triangle', f: midi(75), d: end - 1.9, g: 0.12, a: 0.3, r: 0.8, vib: [5, 0.01] });
  }

  /** A howler round: something calls, and something answers. */
  roundSpecial(): void {
    const v = this.s.voice({ gain: 0.7, priority: 3, bus: 'music', reverb: 0.9 });
    v.noise({ d: 4, g: 0.25, a: 1, r: 1.5, filter: { type: 'bandpass', f: 500, f1: 900, q: 2 } });
    for (const [t, f] of [[0, 392], [1.3, 554]] as const) {
      v.tone({ t, type: 'sawtooth', f: f * 0.7, via: [[0.3, f], [0.75, f * 1.06], [1, f * 0.62]], d: 2.2, g: 0.3, a: 0.2, r: 0.9, vib: [6, 0.015], filter: { type: 'bandpass', f: 950, q: 2.5 } });
    }
    v.tone({ type: 'sawtooth', f: midi(37), d: 4, g: 0.35, a: 0.5, r: 1.5, filter: { type: 'lowpass', f: 260 } });
    thud(v, 0.05);
  }

  /** The last one falls: the warning turned over and let down gently. */
  roundEnd(): void {
    const v = this.s.voice({ gain: 0.55, priority: 3, bus: 'music', reverb: 0.8 });
    play(v, { notes: [[57, 1], [53, 1], [50, 3]], bpm: 96, type: 'triangle', g: 0.4, layer: [12, 0.3] });
    for (const n of [38, 45, 62]) v.tone({ t: 1.25, type: 'sine', f: midi(n), d: 2.8, g: 0.22, a: 0.3, r: 1.4 });
    v.tone({ t: 1.25, f: midi(86), d: 1.5, g: 0.08 });
  }

  /** Everyone is down. */
  gameOver(): void {
    const v = this.s.voice({ gain: 0.6, priority: 3, bus: 'music', reverb: 1 });
    play(v, { notes: [[62, 2], [60, 2], [58, 2], [57, 2], [53, 2], [50, 6]], bpm: 104, type: 'triangle', g: 0.4, layer: [-12, 0.8] });
    v.tone({ type: 'sawtooth', f: midi(38), f1: midi(26), d: 9, g: 0.4, a: 1, r: 3, filter: { type: 'lowpass', f: 320, f1: 120 } });
    for (const t of [0, 2.3, 4.6]) thud(v, t, 0.8);
    for (const [n, g] of [[50, 0.4], [51, 0.25], [62.3, 0.2]] as const) v.tone({ t: 5.8, f: midi(n), d: 3.2, g });
  }

  /** The lights come up: a plain rising chord, the first major one of the night. */
  powerChord(): void {
    const v = this.s.voice({ gain: 0.5, priority: 3, bus: 'music', reverb: 0.8, delay: 1.2 });
    [50, 57, 62, 66, 69].forEach((n, i) => v.tone({ t: i * 0.12, type: 'triangle', f: midi(n), d: 2.6 - i * 0.12, g: 0.32, a: 0.05, r: 1.2 }));
  }

  /** The Forge hands a weapon back. */
  forged(at: At): void {
    const v = this.s.voice({ gain: 0.55, priority: 2, at, range: 40, ref: 8, reverb: 0.6 });
    v.noise({ d: 0.6, g: 0.5, a: 0.01, filter: { type: 'highpass', f: 3000, f1: 800 } }); // quench
    [57, 64, 69, 73].forEach((n, i) => v.tone({ t: 0.15 + i * 0.06, type: 'sawtooth', f: midi(n), d: 1.2, g: 0.2, a: 0.02, r: 0.6, filter: { type: 'lowpass', f: 2600, f1: 900 } }));
  }

  /** A teammate is down: two falling notes, like a dropped signal. */
  mateDown(): void {
    const v = this.s.voice({ gain: 0.45, priority: 2, bus: 'music', reverb: 0.4 });
    play(v, { notes: [[69, 0.5], [62, 1.5]], bpm: 120, type: 'square', g: 0.3, filter: { type: 'lowpass', f: 1800 } });
  }
}
