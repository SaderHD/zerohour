// What the player has chosen: look sensitivity, field of view, how sharp the picture is, and which
// key does what. Kept in localStorage; anything missing or broken there falls back to the default.
// (The three volumes are saved by the audio engine itself.)

export interface ActionDef {
  id: string;
  label: string;
  /** The KeyboardEvent.code (or `Mouse0`..`Mouse4`) it has until rebound. The game asks Input for this code. */
  code: string;
}

/** Every rebindable action, in the order the settings screen lists them. */
export const ACTIONS: readonly ActionDef[] = [
  { id: 'forward', label: 'Move forward', code: 'KeyW' },
  { id: 'back', label: 'Move back', code: 'KeyS' },
  { id: 'left', label: 'Move left', code: 'KeyA' },
  { id: 'right', label: 'Move right', code: 'KeyD' },
  { id: 'sprint', label: 'Sprint', code: 'ShiftLeft' },
  { id: 'fire', label: 'Fire', code: 'Mouse0' },
  { id: 'aim', label: 'Aim', code: 'Mouse2' },
  { id: 'reload', label: 'Reload', code: 'KeyR' },
  { id: 'swap', label: 'Swap weapon', code: 'KeyQ' },
  { id: 'knife', label: 'Knife', code: 'KeyV' },
  { id: 'grenade', label: 'Grenade', code: 'KeyG' },
  { id: 'decoy', label: 'Decoy', code: 'KeyE' },
  { id: 'use', label: 'Buy / rebuild / revive', code: 'KeyF' },
  { id: 'mark', label: 'Ping marker', code: 'KeyZ' },
  { id: 'chat', label: 'Chat', code: 'Enter' },
  { id: 'scores', label: 'Scoreboard', code: 'Tab' },
];

/** Keys that cannot be bound: they belong to the browser or to the menus. */
export const RESERVED: ReadonlySet<string> = new Set(['Escape', 'MetaLeft', 'MetaRight', 'F5', 'F11', 'F12']);

export interface SettingsData {
  /** Look speed, 1 = the default. */
  sensitivity: number;
  invertY: boolean;
  /** Vertical field of view in degrees. */
  fov: number;
  /** 1 = 270 lines, 2 = 540, 3 = 810. */
  renderScale: number;
  dither: boolean;
  /** Screen shake, 0..1. */
  shake: number;
  /** Action id -> code, for the ones that differ from the default. */
  keys: Record<string, string>;
}

export const DEFAULTS: SettingsData = { sensitivity: 1, invertY: false, fov: 72, renderScale: 1, dither: true, shake: 1, keys: {} };
export const LIMITS = { sensitivity: [0.2, 3], fov: [60, 100], renderScale: [1, 3], shake: [0, 1] } as const;

const STORE_KEY = 'zh_settings';
const clamp = (v: unknown, [lo, hi]: readonly [number, number], dflt: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dflt;

/** Make whatever was in storage into valid settings. */
export function sanitize(raw: unknown): SettingsData {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<Record<keyof SettingsData, unknown>>;
  const keys: Record<string, string> = {};
  const taken = new Set<string>();
  if (typeof r.keys === 'object' && r.keys !== null) {
    for (const a of ACTIONS) {
      const code = (r.keys as Record<string, unknown>)[a.id];
      if (typeof code !== 'string' || code.length > 24 || code === a.code || RESERVED.has(code) || taken.has(code)) continue;
      keys[a.id] = code;
      taken.add(code);
    }
  }
  return {
    sensitivity: clamp(r.sensitivity, LIMITS.sensitivity, DEFAULTS.sensitivity),
    invertY: r.invertY === true,
    fov: Math.round(clamp(r.fov, LIMITS.fov, DEFAULTS.fov)),
    renderScale: Math.round(clamp(r.renderScale, LIMITS.renderScale, DEFAULTS.renderScale)),
    dither: r.dither !== false,
    shake: clamp(r.shake, LIMITS.shake, DEFAULTS.shake),
    keys,
  };
}

/** How a key reads on a prompt: `KeyF` -> F, `Mouse0` -> LMB. */
export function keyLabel(code: string): string {
  const mouse: Record<string, string> = { Mouse0: 'LMB', Mouse1: 'MMB', Mouse2: 'RMB', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5' };
  if (mouse[code]) return mouse[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  if (code.startsWith('Arrow')) return code.slice(5);
  const named: Record<string, string> = {
    ShiftLeft: 'Shift', ShiftRight: 'R Shift', ControlLeft: 'Ctrl', ControlRight: 'R Ctrl', AltLeft: 'Alt', AltRight: 'R Alt',
    Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
  };
  return named[code] ?? code;
}

export class Settings {
  data: SettingsData;
  private readonly listeners: ((d: SettingsData) => void)[] = [];

  constructor() {
    let raw: unknown = null;
    try {
      raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    } catch {
      // no storage, or nonsense in it
    }
    this.data = sanitize(raw);
  }

  /** `fn` runs now and again after every change. */
  onChange(fn: (d: SettingsData) => void): void {
    this.listeners.push(fn);
    fn(this.data);
  }

  set(patch: Partial<SettingsData>): void {
    this.data = sanitize({ ...this.data, ...patch });
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.data));
    } catch {
      // not saved, then
    }
    for (const fn of this.listeners) fn(this.data);
  }

  reset(): void {
    this.set({ ...DEFAULTS, keys: {} });
  }

  /** The code an action is on now. */
  codeOf(action: string): string {
    return this.data.keys[action] ?? ACTIONS.find((a) => a.id === action)?.code ?? '';
  }

  /** The key to name in a prompt for an action. */
  label(action: string): string {
    return keyLabel(this.codeOf(action));
  }

  /** Put an action on a key. Whatever had that key swaps to the one this action is leaving. */
  bind(action: string, code: string): boolean {
    if (RESERVED.has(code) || !ACTIONS.some((a) => a.id === action)) return false;
    const was = this.codeOf(action);
    if (was === code) return true;
    const keys: Record<string, string> = {};
    for (const a of ACTIONS) keys[a.id] = this.codeOf(a.id);
    const other = ACTIONS.find((a) => a.id !== action && keys[a.id] === code);
    if (other) keys[other.id] = was;
    keys[action] = code;
    this.set({ keys });
    return this.codeOf(action) === code;
  }

  /**
   * Physical key -> the default code of the action it is bound to, which is what the game asks
   * for. A key that is some action's default but has been bound away from it does nothing.
   */
  remap(): (code: string) => string | null {
    const byKey = new Map<string, string>();
    const moved = new Set<string>();
    for (const a of ACTIONS) {
      const code = this.codeOf(a.id);
      byKey.set(code, a.code);
      if (code !== a.code) moved.add(a.code);
    }
    return (code) => byKey.get(code) ?? (moved.has(code) ? null : code);
  }
}
