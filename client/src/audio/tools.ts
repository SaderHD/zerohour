// Tools for checking the sound without ears: render one catalogue entry to a buffer, and record
// what the game is actually playing. Used by `npm run audio` through `__zh.audio`.
import { CATALOGUE, type Lib } from './catalogue';
import { GunSounds } from './guns';
import { Music } from './music';
import { Sfx } from './sfx';
import { Synth } from './synth';

export const RATE = 44100;

/** Render a catalogue sound offline; returns its level and, if asked, the samples as 16-bit mono PCM in base64. */
export async function renderSound(name: string, pcm = false): Promise<{ seconds: number; peak: number; rms: number; pcm?: string; rate: number } | null> {
  const entry = CATALOGUE.find((c) => c.name === name);
  if (!entry) return null;
  const off = new OfflineAudioContext(2, Math.ceil(RATE * entry.seconds), RATE);
  const synth = new Synth(off, true);
  const lib: Lib = { guns: new GunSounds(synth), sfx: new Sfx(synth), music: new Music(synth) };
  entry.play(lib);
  const buf = await off.startRendering();
  const l = buf.getChannelData(0);
  const r = buf.getChannelData(1);
  let peak = 0;
  let sum = 0;
  const out = new Int16Array(l.length);
  for (let i = 0; i < l.length; i++) {
    const s = (l[i]! + r[i]!) / 2;
    peak = Math.max(peak, Math.abs(l[i]!), Math.abs(r[i]!));
    sum += s * s;
    out[i] = Math.max(-1, Math.min(1, s)) * 32767;
  }
  const res = { seconds: entry.seconds, peak, rms: Math.sqrt(sum / l.length), rate: RATE };
  if (!pcm) return res;
  let bin = '';
  const bytes = new Uint8Array(out.buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { ...res, pcm: btoa(bin) };
}

/** Records a node's output; `stop` gives it back as a base64 WebM. */
export class Recorder {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  start(ctx: AudioContext, from: AudioNode): Promise<string> {
    const dest = ctx.createMediaStreamDestination();
    from.connect(dest);
    this.chunks = [];
    this.rec = new MediaRecorder(dest.stream);
    this.rec.ondataavailable = (ev) => this.chunks.push(ev.data);
    this.rec.start();
    return Promise.resolve('');
  }

  stop(): Promise<string> {
    const rec = this.rec;
    if (!rec) return Promise.resolve('');
    this.rec = null;
    return new Promise((resolve) => {
      rec.onstop = () => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
        reader.readAsDataURL(new Blob(this.chunks, { type: rec.mimeType }));
      };
      rec.stop();
    });
  }
}
