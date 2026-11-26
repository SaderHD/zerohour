// What a place sounds like when nothing is happening: a low drone for each zone (changed by the
// power coming on), the wind, drips, fires, and the player's heart when things are going badly;
// in a city, the carols from whatever is still playing them and a siren a long way off.
import type { CompiledMap } from '@zh/shared';
import { CAROLS, type Music } from './music';
import type { Sfx } from './sfx';
import type { Synth, Voice } from './synth';

/** A zone's air: a hum (two oscillators beating), filtered noise that swells and fades, how much the room rings. */
interface Air {
  hum: number;
  humGain: number;
  type: OscillatorType;
  noise: [BiquadFilterType, number, number];
  noiseGain: number;
  /** Swell rate in Hz, and how deep (0..1). */
  gust: [number, number];
  room: number;
  /** With the power on: mains hum gain, or an engine. */
  mains?: number;
  engine?: boolean;
  /** The mains' own note (50 Hz unless it says). */
  hz?: number;
  /** Open to the city: the far siren is heard from here. */
  open?: boolean;
}

export const AIR: Record<string, Air> = {
  mess: { hum: 55, humGain: 0.16, type: 'triangle', noise: ['lowpass', 380, 0.5], noiseGain: 0.07, gust: [0.11, 0.5], room: 0.9, mains: 0.05 },
  bunk: { hum: 49, humGain: 0.14, type: 'triangle', noise: ['bandpass', 300, 1.2], noiseGain: 0.09, gust: [0.17, 0.7], room: 0.7, mains: 0.03 },
  lab: { hum: 98, humGain: 0.07, type: 'sine', noise: ['bandpass', 4200, 6], noiseGain: 0.035, gust: [0.07, 0.3], room: 1.1, mains: 0.09 },
  cold: { hum: 41, humGain: 0.2, type: 'sine', noise: ['bandpass', 1500, 2.5], noiseGain: 0.08, gust: [0.23, 0.8], room: 1.5, mains: 0.06 },
  gen: { hum: 36.7, humGain: 0.26, type: 'sawtooth', noise: ['lowpass', 220, 0.6], noiseGain: 0.14, gust: [0.09, 0.3], room: 1.6, engine: true },
  motor: { hum: 46, humGain: 0.15, type: 'triangle', noise: ['bandpass', 520, 1.6], noiseGain: 0.11, gust: [0.14, 0.8], room: 1.3, mains: 0.04 },
  yard: { hum: 61.7, humGain: 0.07, type: 'sine', noise: ['bandpass', 640, 0.9], noiseGain: 0.24, gust: [0.19, 0.9], room: 0.35 },
  comms: { hum: 73.4, humGain: 0.1, type: 'triangle', noise: ['bandpass', 2700, 3.5], noiseGain: 0.05, gust: [0.9, 0.9], room: 0.8, mains: 0.08 },
  vault: { hum: 32.7, humGain: 0.3, type: 'sine', noise: ['bandpass', 880, 9], noiseGain: 0.06, gust: [0.05, 0.6], room: 1.8, mains: 0.1 },
  // --- The Longest Night (PLAN 4.12). The city's mains sing at 60.
  // Wind down a canyon of towers: low, wide, slow to come and go; the city's own note under it.
  street: { hum: 43.7, humGain: 0.1, type: 'sine', noise: ['bandpass', 420, 0.7], noiseGain: 0.13, gust: [0.07, 0.95], room: 0.55, open: true },
  // The same wind squeezed between two walls: higher, and it whistles.
  alley: { hum: 51.9, humGain: 0.07, type: 'sine', noise: ['bandpass', 980, 3.2], noiseGain: 0.13, gust: [0.23, 0.9], room: 0.75, open: true },
  // Up in it: nothing between you and the weather.
  roof: { hum: 38.9, humGain: 0.08, type: 'sine', noise: ['bandpass', 1250, 0.8], noiseGain: 0.16, gust: [0.13, 0.85], room: 0.2, open: true },
  // The Starlight: a refrigerator's compressor, the neon's buzz once the mains are on.
  diner: { hum: 58, humGain: 0.13, type: 'triangle', noise: ['lowpass', 420, 0.5], noiseGain: 0.05, gust: [0.09, 0.4], room: 0.6, mains: 0.07, hz: 60 },
  // A department store with nobody in it: a big soft room, the air handling far off.
  store: { hum: 46.2, humGain: 0.1, type: 'sine', noise: ['lowpass', 300, 0.4], noiseGain: 0.09, gust: [0.05, 0.35], room: 1.4, mains: 0.05, hz: 60 },
  // The Lyric: the projector is still running. Its clatter is this room's air.
  cinema: { hum: 110, humGain: 0.05, type: 'triangle', noise: ['bandpass', 2400, 4.5], noiseGain: 0.05, gust: [11.5, 0.5], room: 1.25, mains: 0.03, hz: 60 },
  // St Audra's: stone, and almost nothing else.
  chapel: { hum: 65.4, humGain: 0.07, type: 'sine', noise: ['lowpass', 240, 0.5], noiseGain: 0.05, gust: [0.04, 0.6], room: 2.3 },
  // Somebody's rooms: a radiator, the television's hiss through the wall.
  home: { hum: 49, humGain: 0.09, type: 'triangle', noise: ['highpass', 5200, 0.7], noiseGain: 0.018, gust: [0.15, 0.3], room: 0.5, mains: 0.03, hz: 60 },
  // The subway: a rumble from further down the line that never becomes a train.
  subway: { hum: 27.5, humGain: 0.3, type: 'sine', noise: ['lowpass', 170, 0.8], noiseGain: 0.15, gust: [0.045, 0.9], room: 1.9, mains: 0.08, hz: 60 },
  // The service tunnel: relays and bus bars.
  relays: { hum: 40, humGain: 0.2, type: 'sawtooth', noise: ['bandpass', 3100, 5], noiseGain: 0.03, gust: [0.6, 0.6], room: 1.4, mains: 0.12, hz: 60 },
};

/** Something that plays the carols where it stands (PLAN 4.12): the prop it is, and how it sounds. */
const PLAYERS: Readonly<Record<string, 'jukebox' | 'box'>> = { jukebox: 'jukebox', throne: 'box' };
/** Nearer than this (and no more than a storey away) and it is worth a voice. */
const CAROL_RANGE = 26;
/** Seconds between the far siren's wails: it is a long night. */
const SIREN_GAP: readonly [number, number] = [38, 85];

const CROSSFADE = 1.6;
const DRONE_LEVEL = 0.2;
/** The wind and hiss carry on small speakers where the hum does not: weight them up. */
const NOISE_WEIGHT = 1.8;
/** Health fraction under which the heart is heard and the world dulls. */
const HEART_BELOW = 0.45;

export class Ambience {
  private key = '';
  private drone: Voice | null = null;
  private dripT = 1;
  private emberT = 1;
  private heartT = 0;
  private readonly fires: { x: number; z: number }[];
  /** Which air each zone has (`ZoneDef.air`). */
  private readonly airOf = new Map<string, string>();
  /** Whatever plays carols: where, which tune and phrase is next, and when. */
  private readonly players: { kind: 'jukebox' | 'box'; x: number; y: number; z: number; tune: number; phrase: number; wait: number }[] = [];
  private sirenT = 12 + Math.random() * 20;

  constructor(private readonly s: Synth, private readonly sfx: Sfx, private readonly music: Music, map: CompiledMap, private readonly drips: readonly (readonly [number, number, number])[]) {
    for (const z of map.def.zones) if (z.air) this.airOf.set(z.id, z.air);
    this.fires = map.def.lights.filter((l) => l.flicker && !l.needsPower && !l.silent).map((l) => ({ x: l.x, z: l.z }));
    for (const p of map.def.props) {
      const kind = PLAYERS[p.type];
      const y = kind ? map.floorOn(p.level, p.x, p.z) : NaN;
      // (Each starts on a tune of its own, so two in earshot are never in unison.)
      if (kind) this.players.push({ kind, x: p.x, y: Number.isNaN(y) ? 0 : y, z: p.z, tune: this.players.length * 2 + 1, phrase: 0, wait: 2 + this.players.length * 3 });
    }
  }

  /** Build the held voice for a zone's air. */
  private build(air: Air, power: boolean): Voice {
    const ctx = this.s.ctx;
    const v = this.s.voice({ bus: 'music', gain: 0, priority: 3 });
    if (!v.input) return v;
    const osc = (type: OscillatorType, f: number, gain: number, cutoff: number): OscillatorNode => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = cutoff;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(lp).connect(g).connect(v.input!);
      o.start();
      return o;
    };
    const held: AudioScheduledSourceNode[] = [
      osc(air.type, air.hum, air.humGain, air.hum * 5),
      osc(air.type, air.hum * 1.008, air.humGain * 0.8, air.hum * 5),
      osc('sine', air.hum * 1.498, air.humGain * 0.35, 2000),
    ];
    if (power && air.mains) held.push(osc('sawtooth', air.hz ?? 50, air.mains, (air.hz ?? 50) * 5.2), osc('sine', (air.hz ?? 50) * 2, air.mains * 0.6, 400));

    // The air itself: noise through a filter, its level drifting on a slow wave.
    const noise = ctx.createBufferSource();
    noise.buffer = this.s.noiseBuffer;
    noise.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = air.noise[0];
    nf.frequency.value = air.noise[1];
    nf.Q.value = air.noise[2];
    const ng = ctx.createGain();
    ng.gain.value = air.noiseGain * NOISE_WEIGHT * (1 - air.gust[1] * 0.5);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = air.gust[0];
    const depth = ctx.createGain();
    depth.gain.value = air.noiseGain * NOISE_WEIGHT * air.gust[1] * 0.5;
    lfo.connect(depth).connect(ng.gain);
    // The wind's pitch wanders too.
    const sweep = ctx.createGain();
    sweep.gain.value = air.noise[1] * 0.25 * air.gust[1];
    lfo.connect(sweep).connect(nf.frequency);
    noise.connect(nf).connect(ng).connect(v.input);
    noise.start();
    lfo.start();
    held.push(noise, lfo);

    if (power && air.engine) {
      // The generator sets: a low engine note chopped by its own firing.
      const eng = ctx.createOscillator();
      eng.type = 'sawtooth';
      eng.frequency.value = 30;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 210;
      const eg = ctx.createGain();
      eg.gain.value = 0.3;
      const chop = ctx.createOscillator();
      chop.type = 'square';
      chop.frequency.value = 9.5;
      const cd = ctx.createGain();
      cd.gain.value = 0.16;
      chop.connect(cd).connect(eg.gain);
      eng.connect(lp).connect(eg).connect(v.input);
      eng.start();
      chop.start();
      held.push(eng, chop);
    }
    v.hold(...held);
    v.level(DRONE_LEVEL, CROSSFADE);
    return v;
  }

  /**
   * Once a frame. `zone` is where the listener stands (null in a wall), `hp` their health as a
   * fraction, `downed` on the floor; `x`, `z` their position.
   */
  update(dt: number, zone: string | null, power: boolean, x: number, z: number, hp: number, downed: boolean, y = 0): void {
    if (this.s.ctx.state !== 'running') return;
    const air = AIR[this.airOf.get(zone ?? '') ?? ''];
    this.city(dt, air, x, y, z);
    const key = air ? `${zone}|${power}` : this.key;
    if (key !== this.key && air) {
      this.drone?.stop(CROSSFADE);
      this.drone = this.build(air, power);
      // A voice that could not be had is tried for again next frame.
      this.key = this.drone.dead ? '' : key;
      this.s.room = air.room;
    }

    // Drips and fires near enough to hear.
    if ((this.dripT -= dt) <= 0) {
      this.dripT = 0.35 + Math.random() * 1.1;
      const near = this.drips.filter((d) => Math.hypot(d[0] - x, d[2] - z) < 14);
      const d = near[Math.floor(Math.random() * near.length)];
      if (d) this.sfx.drip({ x: d[0], z: d[2] });
    }
    if ((this.emberT -= dt) <= 0) {
      this.emberT = 0.25 + Math.random() * 0.5;
      const near = this.fires.filter((f) => Math.hypot(f.x - x, f.z - z) < 13);
      const f = near[Math.floor(Math.random() * near.length)];
      if (f) this.sfx.ember(f);
    }

    // The heart, and the dulling of everything else, as health goes.
    const fear = downed ? 1 : Math.max(0, Math.min(1, (HEART_BELOW - hp) / HEART_BELOW));
    this.s.setMuffle(downed ? 0.55 : fear * 0.45);
    if (fear <= 0) this.heartT = 0;
    else if ((this.heartT -= dt) <= 0) {
      this.heartT = downed ? 1.05 : 0.95 - fear * 0.45;
      this.sfx.heartbeat(0.5 + fear * 0.5);
    }
  }

  /** What a city adds to its air: the carols, wherever something plays them, and the siren that never arrives. */
  private city(dt: number, air: Air | undefined, x: number, y: number, z: number): void {
    for (const p of this.players) {
      if ((p.wait -= dt) > 0) continue;
      if (Math.hypot(p.x - x, p.z - z) > CAROL_RANGE || Math.abs(p.y - y) > 5) {
        // Nobody to hear it: it plays on all the same, and is somewhere else in the tune when they come back.
        p.wait = 4;
        p.phrase++;
        continue;
      }
      p.wait = this.music.carol(p.kind, p.tune, p.phrase, p);
      if (++p.phrase % CAROLS[p.tune % CAROLS.length]!.phrases.length === 0) {
        // The record changes; the box is wound again.
        p.tune++;
        p.wait += p.kind === 'jukebox' ? 3.5 : 6;
      }
    }
    if (air?.open && (this.sirenT -= dt) <= 0) {
      this.sirenT = SIREN_GAP[0] + Math.random() * (SIREN_GAP[1] - SIREN_GAP[0]);
      this.sfx.distantSiren(Math.random() * 1.4 - 0.7);
    }
  }

  /** Silence the drone (leaving a game for the menu keeps it; a lost context needs it rebuilt). */
  reset(): void {
    this.drone?.stop(0.3);
    this.drone = null;
    this.key = '';
  }
}
