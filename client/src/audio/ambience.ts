// What a place sounds like when nothing is happening: a low drone for each zone (changed by the
// power coming on), the wind, drips, fires, and the player's heart when things are going badly.
import type { CompiledMap } from '@zh/shared';
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
}

const AIR: Record<string, Air> = {
  mess: { hum: 55, humGain: 0.16, type: 'triangle', noise: ['lowpass', 380, 0.5], noiseGain: 0.07, gust: [0.11, 0.5], room: 0.9, mains: 0.05 },
  bunk: { hum: 49, humGain: 0.14, type: 'triangle', noise: ['bandpass', 300, 1.2], noiseGain: 0.09, gust: [0.17, 0.7], room: 0.7, mains: 0.03 },
  lab: { hum: 98, humGain: 0.07, type: 'sine', noise: ['bandpass', 4200, 6], noiseGain: 0.035, gust: [0.07, 0.3], room: 1.1, mains: 0.09 },
  cold: { hum: 41, humGain: 0.2, type: 'sine', noise: ['bandpass', 1500, 2.5], noiseGain: 0.08, gust: [0.23, 0.8], room: 1.5, mains: 0.06 },
  gen: { hum: 36.7, humGain: 0.26, type: 'sawtooth', noise: ['lowpass', 220, 0.6], noiseGain: 0.14, gust: [0.09, 0.3], room: 1.6, engine: true },
  motor: { hum: 46, humGain: 0.15, type: 'triangle', noise: ['bandpass', 520, 1.6], noiseGain: 0.11, gust: [0.14, 0.8], room: 1.3, mains: 0.04 },
  yard: { hum: 61.7, humGain: 0.07, type: 'sine', noise: ['bandpass', 640, 0.9], noiseGain: 0.24, gust: [0.19, 0.9], room: 0.35 },
  comms: { hum: 73.4, humGain: 0.1, type: 'triangle', noise: ['bandpass', 2700, 3.5], noiseGain: 0.05, gust: [0.9, 0.9], room: 0.8, mains: 0.08 },
  vault: { hum: 32.7, humGain: 0.3, type: 'sine', noise: ['bandpass', 880, 9], noiseGain: 0.06, gust: [0.05, 0.6], room: 1.8, mains: 0.1 },
};

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

  constructor(private readonly s: Synth, private readonly sfx: Sfx, map: CompiledMap, private readonly drips: readonly (readonly [number, number, number])[]) {
    this.fires = map.def.lights.filter((l) => l.flicker && !l.needsPower).map((l) => ({ x: l.x, z: l.z }));
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
    if (power && air.mains) held.push(osc('sawtooth', 50, air.mains, 260), osc('sine', 100, air.mains * 0.6, 400));

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
  update(dt: number, zone: string | null, power: boolean, x: number, z: number, hp: number, downed: boolean): void {
    if (this.s.ctx.state !== 'running') return;
    const air = AIR[zone ?? ''];
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

  /** Silence the drone (leaving a game for the menu keeps it; a lost context needs it rebuilt). */
  reset(): void {
    this.drone?.stop(0.3);
    this.drone = null;
    this.key = '';
  }
}
