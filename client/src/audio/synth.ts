// The synth engine: every sound in the game is oscillators and noise through envelopes and
// filters, built at the moment it plays. It runs on any BaseAudioContext, so the same library
// renders offline for checks (see `catalogue.ts`).

export type Bus = 'sfx' | 'music';

/** At most this many sounds at once; a new one past it steals the least important. */
export const MAX_VOICES = 24;

export interface VoiceOpts {
  bus?: Bus;
  gain?: number;
  /** 0 (first to be stolen) .. 3 (never stolen by lower). */
  priority?: number;
  /** Where in the world it is; without it the sound is "in the head". */
  at?: { x: number; z: number };
  /** Metres at which it is at half power, and beyond which it is not played at all. */
  ref?: number;
  range?: number;
  /** -1..1 for a sound without a place. */
  pan?: number;
  /** 0..1 sent to the reverb. */
  reverb?: number;
  /** Seconds from now that the voice's clock starts. */
  delay?: number;
}

export interface FilterSpec {
  type: BiquadFilterType;
  f: number;
  /** Sweep to this by the end. */
  f1?: number;
  q?: number;
}

interface Env {
  /** Start, seconds after the voice's. */
  t?: number;
  /** Length in seconds. */
  d: number;
  /** Peak gain. */
  g?: number;
  /** Attack seconds. */
  a?: number;
  /** Release seconds: with it the sound holds its level and lets go at the end; without, it decays from the peak. */
  r?: number;
}

export interface ToneSpec extends Env {
  type?: OscillatorType;
  f: number;
  /** Glide to this by the end (exponential), or through `[fraction of d, Hz]` points. */
  f1?: number;
  via?: readonly (readonly [number, number])[];
  /** Vibrato: rate in Hz and depth as a fraction of the pitch. */
  vib?: readonly [number, number];
  filter?: FilterSpec;
}

export interface NoiseSpec extends Env {
  filter?: FilterSpec;
  /** Playback rate: below 1 darkens it. */
  rate?: number;
}

const SILENT = 0.0001;

/** One sound: a handful of sources into a gain, a place in the stereo field, a bus. */
export class Voice {
  /** Context time the last source ends (Infinity for a held one). */
  end = 0;
  readonly t0: number;
  private readonly sources: AudioScheduledSourceNode[] = [];

  constructor(
    private readonly synth: Synth, readonly input: GainNode | null, private readonly tail: AudioNode | null,
    readonly priority: number, delay: number,
  ) {
    this.t0 = synth.ctx.currentTime + delay;
  }

  get dead(): boolean {
    return !this.input;
  }

  private shape(g: GainNode, e: Env): [number, number] {
    const start = this.t0 + (e.t ?? 0);
    const stop = start + e.d;
    const peak = e.g ?? 1;
    const a = Math.min(e.a ?? 0.003, e.d * 0.5);
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(peak, start + a);
    if (e.r !== undefined) {
      g.gain.setValueAtTime(peak, Math.max(start + a, stop - e.r));
      g.gain.linearRampToValueAtTime(0, stop);
    } else g.gain.exponentialRampToValueAtTime(Math.max(SILENT, peak * 0.001), stop);
    this.end = Math.max(this.end, stop + 0.02);
    return [start, stop];
  }

  private chain(src: AudioScheduledSourceNode, e: Env, filter: FilterSpec | undefined): void {
    const ctx = this.synth.ctx;
    const g = ctx.createGain();
    const [start, stop] = this.shape(g, e);
    let node: AudioNode = src;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filter.type;
      f.Q.value = filter.q ?? 0.7;
      f.frequency.setValueAtTime(filter.f, start);
      if (filter.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, filter.f1), stop);
      node.connect(f);
      node = f;
    }
    node.connect(g).connect(this.input!);
    src.start(start);
    src.stop(stop + 0.03);
    this.sources.push(src);
  }

  tone(s: ToneSpec): this {
    if (!this.input) return this;
    const ctx = this.synth.ctx;
    const osc = ctx.createOscillator();
    osc.type = s.type ?? 'sine';
    const start = this.t0 + (s.t ?? 0);
    osc.frequency.setValueAtTime(s.f, start);
    if (s.via) for (const [at, hz] of s.via) osc.frequency.linearRampToValueAtTime(hz, start + at * s.d);
    else if (s.f1 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, s.f1), start + s.d);
    if (s.vib) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = s.vib[0];
      depth.gain.value = s.f * s.vib[1];
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(start);
      lfo.stop(start + s.d + 0.03);
    }
    this.chain(osc, s, s.filter);
    return this;
  }

  noise(s: NoiseSpec): this {
    if (!this.input) return this;
    const src = this.synth.ctx.createBufferSource();
    src.buffer = this.synth.noiseBuffer;
    src.loop = true;
    src.loopStart = Math.random() * 1.5;
    src.playbackRate.value = s.rate ?? 1;
    this.chain(src, s, s.filter);
    return this;
  }

  /** Keep a hand-built source (a drone's oscillators) with this voice; it sounds until `stop`. */
  hold(...srcs: AudioScheduledSourceNode[]): this {
    this.sources.push(...srcs);
    this.end = Infinity;
    return this;
  }

  /** Move the voice's level (for fades on a held voice). */
  level(v: number, seconds: number): void {
    if (!this.input) return;
    const now = this.synth.ctx.currentTime;
    this.input.gain.cancelScheduledValues(now);
    this.input.gain.setTargetAtTime(v, now, seconds / 3);
  }

  stop(fade = 0.04): void {
    if (!this.input) return;
    const now = this.synth.ctx.currentTime;
    if (this.end <= now) return;
    this.level(0, fade);
    this.end = now + fade * 1.5;
    for (const s of this.sources) {
      try {
        s.stop(this.end);
      } catch {
        // not started yet, or already stopped
      }
    }
  }

  /** Called by the synth once the voice is over. */
  release(): void {
    this.tail?.disconnect();
  }
}

/** Seeded noise, so an offline render is the same every time. */
function fillNoise(data: Float32Array, seed: number): void {
  let s = seed >>> 0;
  for (let i = 0; i < data.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    data[i] = s / 0x80000000 - 1;
  }
}

export class Synth {
  readonly noiseBuffer: AudioBuffer;
  readonly volumes = { master: 0.8, sfx: 1, music: 0.7 };
  /** Sounds started, refused or cut short for want of a free voice, and the most that ever sounded at once. */
  readonly stats = { played: 0, dropped: 0, stolen: 0, peak: 0 };
  /** Set by the game: is there a wall between the listener and this spot? */
  occluded: (x: number, z: number) => boolean = () => false;
  /** How much the room rings (scales every voice's reverb send). */
  room = 1;
  private readonly voices: Voice[] = [];
  private readonly master: GainNode;
  private readonly buses: Record<Bus, GainNode>;
  private readonly muffle: BiquadFilterNode;
  private readonly reverb: ConvolverNode;
  readonly out: AudioNode;
  private lx = 0;
  private lz = 0;
  private lyaw = 0;

  /** `offline`: rendering to a buffer, where the context only "runs" once everything is scheduled. */
  constructor(readonly ctx: BaseAudioContext, private readonly offline = false) {
    const rate = ctx.sampleRate;
    this.noiseBuffer = ctx.createBuffer(1, rate * 2, rate);
    fillNoise(this.noiseBuffer.getChannelData(0), 0x5eed);

    // Reverb: two seconds of decaying, darkening noise.
    const len = Math.floor(rate * 1.9);
    const impulse = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = impulse.getChannelData(ch);
      fillNoise(d, 0xa11ce + ch * 977);
      let low = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        low += (d[i]! - low) * (0.6 - 0.5 * t);
        d[i] = low * Math.pow(1 - t, 2.4) * (i < 400 ? i / 400 : 1);
      }
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulse;

    // Everything sums into a limiter (so a firefight cannot clip), and the master volume comes
    // after it (so turning down is turning down, not just less limiting).
    this.master = ctx.createGain();
    const mix = ctx.createGain();
    mix.gain.value = 1.3;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.buses = { sfx: ctx.createGain(), music: ctx.createGain() };
    this.buses.sfx.connect(this.muffle).connect(mix);
    this.buses.music.connect(mix);
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    this.reverb.connect(wet).connect(this.muffle);
    mix.connect(limiter).connect(this.master).connect(ctx.destination);
    this.out = this.master;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    this.master.gain.value = this.volumes.master;
    this.buses.sfx.gain.value = this.volumes.sfx;
    this.buses.music.gain.value = this.volumes.music;
  }

  setVolume(which: 'master' | Bus, v: number): void {
    this.volumes[which] = Math.max(0, Math.min(1, v));
    this.applyVolumes();
  }

  setListener(x: number, z: number, yaw: number): void {
    this.lx = x;
    this.lz = z;
    this.lyaw = yaw;
  }

  /** 0 = clear, 1 = everything but the music sounds as if through a wall (downed, nearly dead). */
  setMuffle(amount: number): void {
    this.muffle.frequency.setTargetAtTime(20000 * Math.pow(0.03, amount), this.ctx.currentTime, 0.15);
  }

  /** Sounds sounding now. */
  get active(): number {
    this.sweep();
    return this.voices.length;
  }

  private sweep(): void {
    const now = this.ctx.currentTime;
    for (let i = this.voices.length - 1; i >= 0; i--) {
      if (this.voices[i]!.end > now) continue;
      this.voices[i]!.release();
      this.voices.splice(i, 1);
    }
  }

  private none(): Voice {
    this.stats.dropped++;
    return new Voice(this, null, null, 0, 0);
  }

  /** Start a sound. Always returns a voice; one that cannot play (out of earshot, no room) ignores what is added to it. */
  voice(o: VoiceOpts = {}): Voice {
    const ctx = this.ctx;
    if (ctx.state !== 'running' && !this.offline) return this.none();
    const priority = o.priority ?? 1;
    let gain = o.gain ?? 1;
    let pan = o.pan ?? 0;
    let cutoff = 0;
    if (o.at) {
      const dx = o.at.x - this.lx;
      const dz = o.at.z - this.lz;
      const d = Math.hypot(dx, dz);
      const range = o.range ?? 45;
      if (d > range) return this.none();
      const k = d / (o.ref ?? 6);
      gain *= (1 / (1 + k * k)) * Math.min(1, (range - d) / (range * 0.2));
      pan = d < 0.3 ? 0 : Math.max(-0.85, Math.min(0.85, ((dx * Math.cos(this.lyaw) - dz * Math.sin(this.lyaw)) / d) * 0.9));
      cutoff = 16000 - 11000 * (d / range);
      if (d > 2 && this.occluded(o.at.x, o.at.z)) {
        gain *= 0.5;
        cutoff = 700;
      }
    }
    this.sweep();
    if (this.voices.length >= MAX_VOICES) {
      // The least important goes; among equals, the one nearest its end.
      const victim = this.voices.reduce((a, b) => (b.priority < a.priority || (b.priority === a.priority && b.end < a.end) ? b : a));
      if (victim.priority > priority) return this.none();
      victim.stop(0.02);
      victim.end = 0;
      this.stats.stolen++;
      this.sweep();
    }

    const input = ctx.createGain();
    input.gain.value = gain;
    let node: AudioNode = input;
    if (cutoff) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = cutoff;
      node = node.connect(lp);
    }
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    node = node.connect(panner);
    const bus = o.bus ?? 'sfx';
    node.connect(this.buses[bus]);
    const send = (o.reverb ?? 0) * this.room * (bus === 'music' ? this.volumes.music : this.volumes.sfx);
    if (send > 0) {
      const s = ctx.createGain();
      s.gain.value = send;
      node.connect(s).connect(this.reverb);
    }
    const v = new Voice(this, input, node, priority, o.delay ?? 0);
    this.voices.push(v);
    this.stats.played++;
    this.stats.peak = Math.max(this.stats.peak, this.voices.length);
    return v;
  }

  stopAll(): void {
    for (const v of this.voices) v.stop(0.05);
  }
}

/** Equal-tempered pitch of a MIDI note number. */
export const midi = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);
/** A little random spread around 1, so repeats are not identical. */
export const vary = (amount: number): number => 1 + (Math.random() * 2 - 1) * amount;
