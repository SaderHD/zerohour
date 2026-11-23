import type { GameAudio } from '../audio/audio';

const SLIDERS = [['master', 'Volume'], ['sfx', 'Effects'], ['music', 'Music']] as const;

/** Three sliders (master, effects, music), shown whenever the mouse is free. Saved by the audio itself. */
export function buildVolumes(audio: GameAudio): void {
  const root = document.getElementById('volumes')!;
  for (const [key, label] of SLIDERS) {
    const row = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.id = `vol-${key}`;
    input.value = String(Math.round(audio.synth.volumes[key] * 100));
    input.oninput = () => audio.setVolume(key, Number(input.value) / 100);
    // Let go of the effects slider and hear where it now stands.
    input.onchange = () => (key === 'music' ? audio.music.effectEnd() : audio.sfx.tick('headkill'));
    row.append(label, input);
    root.append(row);
  }
}
