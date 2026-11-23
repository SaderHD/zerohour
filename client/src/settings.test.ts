// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULTS, Settings, keyLabel, sanitize } from './settings';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
});

describe('settings', () => {
  it('falls back to defaults for anything missing or broken', () => {
    expect(sanitize(null)).toEqual(DEFAULTS);
    expect(sanitize({ sensitivity: 'fast', fov: 500, renderScale: 0, shake: -3, dither: 0, keys: [1, 2] })).toEqual({ ...DEFAULTS, fov: 100, shake: 0 });
    store.set('zh_settings', '{not json');
    expect(new Settings().data).toEqual(DEFAULTS);
  });

  it('saves and reloads', () => {
    const s = new Settings();
    s.set({ sensitivity: 1.5, fov: 90, renderScale: 2, dither: false, invertY: true, shake: 0.5 });
    s.bind('use', 'KeyE');
    const again = new Settings();
    expect(again.data).toMatchObject({ sensitivity: 1.5, fov: 90, renderScale: 2, dither: false, invertY: true, shake: 0.5 });
    expect(again.codeOf('use')).toBe('KeyE');
  });

  it('rebinding swaps with whatever held the key, and the old key goes quiet', () => {
    const s = new Settings();
    expect(s.bind('use', 'KeyE')).toBe(true); // E was the decoy
    expect(s.codeOf('use')).toBe('KeyE');
    expect(s.codeOf('decoy')).toBe('KeyF');
    const map = s.remap();
    expect(map('KeyE')).toBe('KeyF'); // the game still asks for KeyF
    expect(map('KeyF')).toBe('KeyE');
    expect(map('KeyW')).toBe('KeyW');
    expect(map('Digit1')).toBe('Digit1'); // not an action: passes through
    s.bind('fire', 'KeyK');
    expect(s.remap()('KeyK')).toBe('Mouse0');
    expect(s.remap()('Mouse0')).toBeNull(); // the left button no longer fires
    expect(s.bind('fire', 'Escape')).toBe(false);
    s.reset();
    expect(s.data).toEqual(DEFAULTS);
  });

  it('names keys for prompts', () => {
    expect(keyLabel('KeyF')).toBe('F');
    expect(keyLabel('Mouse0')).toBe('LMB');
    expect(keyLabel('ShiftLeft')).toBe('Shift');
    expect(keyLabel('Digit3')).toBe('3');
  });
});
