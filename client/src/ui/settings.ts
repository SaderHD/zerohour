import type { GameAudio } from '../audio/audio';
import type { Input } from '../input/input';
import { ACTIONS, LIMITS, RESERVED, keyLabel, type Settings, type SettingsData } from '../settings';
import { buildVolumes } from './volumes';

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
};

type NumKey = 'sensitivity' | 'fov' | 'shake';
const RESOLUTIONS = ['270 lines (as intended)', '540 lines', '810 lines'];

/**
 * The settings screen: look, picture, sound and keys. Built once into `#settings`; every control
 * writes straight to the Settings store, which saves and tells the game.
 */
export function buildSettings(settings: Settings, audio: GameAudio, input: Input, onBack: () => void): void {
  const root = document.getElementById('settings')!;
  const refresh: ((d: SettingsData) => void)[] = [];

  const slider = (key: NumKey, label: string, step: number, show: (v: number) => string): HTMLElement => {
    const [min, max] = LIMITS[key];
    const range = h('input', { type: 'range', id: `set-${key}`, min: String(min), max: String(max), step: String(step) });
    const out = h('output');
    range.oninput = () => settings.set({ [key]: Number(range.value) });
    refresh.push((d) => {
      range.value = String(d[key]);
      out.textContent = show(d[key]);
    });
    return h('label', {}, h('span', {}, label), range, out);
  };
  const toggle = (key: 'invertY' | 'dither', label: string): HTMLElement => {
    const box = h('input', { type: 'checkbox', id: `set-${key}` });
    box.onchange = () => settings.set({ [key]: box.checked });
    refresh.push((d) => (box.checked = d[key]));
    return h('label', { className: 'check' }, h('span', {}, label), box);
  };

  const scale = h('select', { id: 'set-renderScale' }, ...RESOLUTIONS.map((text, i) => h('option', { value: String(i + 1) }, text)));
  scale.onchange = () => settings.set({ renderScale: Number(scale.value) });
  refresh.push((d) => (scale.value = String(d.renderScale)));

  const sound = h('div', { className: 'group' }, h('h2', {}, 'Sound'));
  buildVolumes(audio, sound);

  // Keys: click one, then press the key (or mouse button) it should be. Escape cancels.
  const keys = h('div', { className: 'keys' });
  for (const a of ACTIONS) {
    const btn = h('button', { id: `key-${a.id}`, className: 'key' });
    btn.onclick = () => {
      btn.textContent = 'press a key…';
      btn.classList.add('waiting');
      input.capture = (code) => {
        btn.classList.remove('waiting');
        if (!RESERVED.has(code)) settings.bind(a.id, code);
        for (const fn of refresh) fn(settings.data);
      };
    };
    refresh.push(() => (btn.textContent = keyLabel(settings.codeOf(a.id))));
    keys.append(h('div', { className: 'keyrow' }, h('span', {}, a.label), btn));
  }

  const reset = h('button', { id: 'settings-reset', className: 'quiet' }, 'Reset to defaults');
  reset.onclick = () => settings.reset();
  const back = h('button', { id: 'settings-back' }, 'Back');
  back.onclick = () => {
    input.capture = null;
    onBack();
  };

  root.append(
    h('h1', {}, 'SETTINGS'),
    h('div', { className: 'columns' },
      h('div', {},
        h('div', { className: 'group' }, h('h2', {}, 'Look'),
          slider('sensitivity', 'Sensitivity', 0.05, (v) => v.toFixed(2)), toggle('invertY', 'Invert Y')),
        h('div', { className: 'group' }, h('h2', {}, 'Picture'),
          slider('fov', 'Field of view', 1, (v) => `${v}°`),
          h('label', {}, h('span', {}, 'Resolution'), scale),
          toggle('dither', 'Dither'),
          slider('shake', 'Screen shake', 0.05, (v) => `${Math.round(v * 100)}%`)),
        sound),
      h('div', { className: 'group' }, h('h2', {}, 'Keys'), keys, h('p', { className: 'sub' }, 'Number keys pick a weapon; the wheel swaps.'))),
    h('div', { className: 'row' }, reset, back),
  );
  settings.onChange((d) => {
    for (const fn of refresh) fn(d);
  });
}
