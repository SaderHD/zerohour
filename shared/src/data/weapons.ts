// Weapon stats. Every name here is fictional (see PLAN section 1). Balance lives in this table.
import type { WeaponId } from '../protocol';

export type WeaponClass = 'pistol' | 'revolver' | 'rifle' | 'shotgun' | 'smg' | 'ar' | 'lmg' | 'sniper' | 'launcher';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  cls: WeaponClass;
  source: 'start' | 'wall' | 'box';
  cost?: number;
  /** Damage per pellet at close range. */
  damage: number;
  headMult: number;
  rpm: number;
  auto: boolean;
  magSize: number;
  /** Reserve ammo when picked up (also the cap). */
  reserve: number;
  reloadTime: number;
  /** Cone half-angles in radians. */
  spreadHip: number;
  spreadAim: number;
  pellets: number;
  /** Bullets stop here. Damage is full up to `falloffStart`, then drops linearly to `falloff`× at `range`. */
  range: number;
  falloffStart: number;
  falloff: number;
  /** Extra bodies a bullet passes through. */
  pierce: number;
  moveSpeedMult: number;
  /** Camera kick per shot, radians. */
  recoil: number;
  /** FOV multiplier while aiming. */
  zoom: number;
  /** Fires a server-simulated projectile instead of hitscan. */
  projectile?: { kind: 'thumper'; speed: number; radius: number };
}

type Base = Pick<WeaponDef, 'pellets' | 'pierce' | 'moveSpeedMult' | 'zoom' | 'falloff'>;
const base: Base = { pellets: 1, pierce: 0, moveSpeedMult: 1, zoom: 0.75, falloff: 0.5 };

const list: WeaponDef[] = [
  { ...base, id: 'warden', name: 'M9 "Warden"', cls: 'pistol', source: 'start',
    damage: 30, headMult: 2.5, rpm: 400, auto: false, magSize: 8, reserve: 32, reloadTime: 1.5,
    spreadHip: 0.03, spreadAim: 0.004, range: 40, falloffStart: 12, recoil: 0.028, zoom: 0.85 },
  { ...base, id: 'dockhand', name: '"Dockhand" .38', cls: 'revolver', source: 'box',
    damage: 110, headMult: 3, rpm: 180, auto: false, magSize: 6, reserve: 36, reloadTime: 2.6,
    spreadHip: 0.035, spreadAim: 0.003, range: 50, falloffStart: 18, recoil: 0.07, zoom: 0.85 },
  { ...base, id: 'farrow', name: '"Farrow" M1', cls: 'rifle', source: 'wall', cost: 500,
    damage: 90, headMult: 3, rpm: 300, auto: false, magSize: 8, reserve: 64, reloadTime: 2.2,
    spreadHip: 0.045, spreadAim: 0.002, range: 70, falloffStart: 30, falloff: 0.7, pierce: 1, recoil: 0.045, zoom: 0.65 },
  { ...base, id: 'pike', name: '"Pike" 12', cls: 'shotgun', source: 'wall', cost: 500,
    damage: 35, headMult: 1.5, rpm: 70, auto: false, magSize: 6, reserve: 36, reloadTime: 2.8,
    spreadHip: 0.075, spreadAim: 0.055, pellets: 8, range: 16, falloffStart: 5, falloff: 0.2, recoil: 0.11, zoom: 0.85 },
  { ...base, id: 'stitch', name: '"Stitch" SMG', cls: 'smg', source: 'wall', cost: 1000,
    damage: 32, headMult: 3, rpm: 650, auto: true, magSize: 30, reserve: 150, reloadTime: 2.0,
    spreadHip: 0.04, spreadAim: 0.012, range: 35, falloffStart: 10, recoil: 0.018, zoom: 0.8 },
  { ...base, id: 'coachman', name: '"Coachman"', cls: 'shotgun', source: 'wall', cost: 1200,
    damage: 55, headMult: 1.5, rpm: 220, auto: false, magSize: 2, reserve: 40, reloadTime: 2.4,
    spreadHip: 0.095, spreadAim: 0.075, pellets: 8, range: 14, falloffStart: 4, falloff: 0.2, recoil: 0.15, zoom: 0.85 },
  { ...base, id: 'kestrel', name: '"Kestrel" AR', cls: 'ar', source: 'wall', cost: 1500,
    damage: 45, headMult: 4, rpm: 600, auto: true, magSize: 30, reserve: 180, reloadTime: 2.3,
    spreadHip: 0.045, spreadAim: 0.006, range: 60, falloffStart: 25, falloff: 0.7, recoil: 0.022, zoom: 0.65 },
  { ...base, id: 'brakeman', name: '"Brakeman" SMG', cls: 'smg', source: 'wall', cost: 1500,
    damage: 30, headMult: 3, rpm: 900, auto: true, magSize: 32, reserve: 192, reloadTime: 1.9,
    spreadHip: 0.045, spreadAim: 0.016, range: 30, falloffStart: 8, recoil: 0.016, zoom: 0.8 },
  { ...base, id: 'halberd', name: '"Halberd" LMG', cls: 'lmg', source: 'box',
    damage: 55, headMult: 3, rpm: 550, auto: true, magSize: 100, reserve: 300, reloadTime: 5.5,
    spreadHip: 0.06, spreadAim: 0.012, range: 60, falloffStart: 25, falloff: 0.7, pierce: 1, moveSpeedMult: 0.85, recoil: 0.024, zoom: 0.7 },
  { ...base, id: 'longwatch', name: '"Longwatch"', cls: 'sniper', source: 'box',
    damage: 400, headMult: 4, rpm: 45, auto: false, magSize: 5, reserve: 40, reloadTime: 3.2,
    spreadHip: 0.08, spreadAim: 0, range: 120, falloffStart: 120, falloff: 1, pierce: 3, moveSpeedMult: 0.92, recoil: 0.12, zoom: 0.3 },
  { ...base, id: 'ferrier', name: '"Ferrier" auto-shotgun', cls: 'shotgun', source: 'box',
    damage: 30, headMult: 1.5, rpm: 260, auto: true, magSize: 8, reserve: 48, reloadTime: 3.0,
    spreadHip: 0.085, spreadAim: 0.065, pellets: 8, range: 16, falloffStart: 5, falloff: 0.2, recoil: 0.08, zoom: 0.85 },
  { ...base, id: 'thumper', name: '"Thumper"', cls: 'launcher', source: 'box',
    damage: 700, headMult: 1, rpm: 60, auto: false, magSize: 1, reserve: 18, reloadTime: 2.4,
    spreadHip: 0.01, spreadAim: 0.004, range: 60, falloffStart: 60, falloff: 1, recoil: 0.1, zoom: 0.85,
    projectile: { kind: 'thumper', speed: 26, radius: 4 } },
];

export const WEAPONS: ReadonlyMap<WeaponId, WeaponDef> = new Map(list.map((w) => [w.id, w]));
export const WEAPON_LIST: readonly WeaponDef[] = list;
export const START_WEAPON: WeaponId = 'warden';
export const weaponDef = (id: WeaponId): WeaponDef | undefined => WEAPONS.get(id);
