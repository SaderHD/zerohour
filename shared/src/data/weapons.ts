// Weapon stats. Every name here is fictional (see PLAN section 1). Balance lives in this table.
import { UPGRADED_AMMO_COST } from '../constants';
import type { WeaponId } from '../protocol';

export type WeaponClass = 'pistol' | 'revolver' | 'rifle' | 'shotgun' | 'smg' | 'ar' | 'lmg' | 'sniper' | 'launcher' | 'wonder';

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
  projectile?: { kind: 'thumper' | 'orb'; speed: number; radius: number };
  /** A wonder weapon's effect (PLAN 4.5); only one of each exists in a game at a time. */
  wonder?: WonderSpec;
  /** What the Forge turns it into: a new name, harder hits, a deeper magazine and reserve (and a stronger effect). */
  forged: { name: string; damage: number; magSize: number; reserve: number; wonder?: WonderSpec; projectile?: WeaponDef['projectile'] };
}

export type WonderSpec =
  /** The bolt jumps from the zombie it hits to the nearest one within `radius`, and on, `chain` bodies in all. */
  | { kind: 'arclight'; chain: number; radius: number }
  /** The orb opens a singularity for `seconds` that drags in zombies within `radius` at `pull` m/s, then implodes. */
  | { kind: 'gravewell'; seconds: number; radius: number; pull: number };

type Base = Pick<WeaponDef, 'pellets' | 'pierce' | 'moveSpeedMult' | 'zoom' | 'falloff'>;
const base: Base = { pellets: 1, pierce: 0, moveSpeedMult: 1, zoom: 0.75, falloff: 0.5 };

const list: WeaponDef[] = [
  { ...base, id: 'warden', name: 'M9 "Warden"', cls: 'pistol', source: 'start',
    forged: { name: '"Warden-Regent"', damage: 75, magSize: 16, reserve: 96 },
    damage: 30, headMult: 2.5, rpm: 400, auto: false, magSize: 8, reserve: 32, reloadTime: 1.5,
    spreadHip: 0.03, spreadAim: 0.004, range: 40, falloffStart: 12, recoil: 0.028, zoom: 0.85 },
  { ...base, id: 'dockhand', name: '"Dockhand" .38', cls: 'revolver', source: 'box',
    forged: { name: '"Stevedore" .44', damage: 275, magSize: 6, reserve: 72 },
    damage: 110, headMult: 3, rpm: 180, auto: false, magSize: 6, reserve: 36, reloadTime: 2.6,
    spreadHip: 0.035, spreadAim: 0.003, range: 50, falloffStart: 18, recoil: 0.07, zoom: 0.85 },
  { ...base, id: 'farrow', name: '"Farrow" M1', cls: 'rifle', source: 'wall', cost: 500,
    forged: { name: '"Farrowgate"', damage: 225, magSize: 12, reserve: 120 },
    damage: 90, headMult: 3, rpm: 300, auto: false, magSize: 8, reserve: 64, reloadTime: 2.2,
    spreadHip: 0.045, spreadAim: 0.002, range: 70, falloffStart: 30, falloff: 0.7, pierce: 1, recoil: 0.045, zoom: 0.65 },
  { ...base, id: 'pike', name: '"Pike" 12', cls: 'shotgun', source: 'wall', cost: 500,
    forged: { name: '"Lance" 12', damage: 77, magSize: 8, reserve: 60 },
    damage: 35, headMult: 1.5, rpm: 70, auto: false, magSize: 6, reserve: 36, reloadTime: 2.8,
    spreadHip: 0.075, spreadAim: 0.055, pellets: 8, range: 16, falloffStart: 5, falloff: 0.2, recoil: 0.11, zoom: 0.85 },
  { ...base, id: 'stitch', name: '"Stitch" SMG', cls: 'smg', source: 'wall', cost: 1000,
    forged: { name: '"Suture"', damage: 77, magSize: 45, reserve: 270 },
    damage: 32, headMult: 3, rpm: 650, auto: true, magSize: 30, reserve: 150, reloadTime: 2.0,
    spreadHip: 0.04, spreadAim: 0.012, range: 35, falloffStart: 10, recoil: 0.018, zoom: 0.8 },
  { ...base, id: 'coachman', name: '"Coachman"', cls: 'shotgun', source: 'wall', cost: 1200,
    forged: { name: '"Four-in-Hand"', damage: 121, magSize: 4, reserve: 60 },
    damage: 55, headMult: 1.5, rpm: 220, auto: false, magSize: 2, reserve: 40, reloadTime: 2.4,
    spreadHip: 0.095, spreadAim: 0.075, pellets: 8, range: 14, falloffStart: 4, falloff: 0.2, recoil: 0.15, zoom: 0.85 },
  { ...base, id: 'kestrel', name: '"Kestrel" AR', cls: 'ar', source: 'wall', cost: 1500,
    forged: { name: '"Peregrine"', damage: 108, magSize: 45, reserve: 270 },
    damage: 45, headMult: 4, rpm: 600, auto: true, magSize: 30, reserve: 180, reloadTime: 2.3,
    spreadHip: 0.045, spreadAim: 0.006, range: 60, falloffStart: 25, falloff: 0.7, recoil: 0.022, zoom: 0.65 },
  { ...base, id: 'brakeman', name: '"Brakeman" SMG', cls: 'smg', source: 'wall', cost: 1500,
    forged: { name: '"Signalman"', damage: 72, magSize: 50, reserve: 300 },
    damage: 30, headMult: 3, rpm: 900, auto: true, magSize: 32, reserve: 192, reloadTime: 1.9,
    spreadHip: 0.045, spreadAim: 0.016, range: 30, falloffStart: 8, recoil: 0.016, zoom: 0.8 },
  { ...base, id: 'halberd', name: '"Halberd" LMG', cls: 'lmg', source: 'box',
    forged: { name: '"Glaive"', damage: 121, magSize: 125, reserve: 500 },
    damage: 55, headMult: 3, rpm: 550, auto: true, magSize: 100, reserve: 300, reloadTime: 5.5,
    spreadHip: 0.06, spreadAim: 0.012, range: 60, falloffStart: 25, falloff: 0.7, pierce: 1, moveSpeedMult: 0.85, recoil: 0.024, zoom: 0.7 },
  { ...base, id: 'longwatch', name: '"Longwatch"', cls: 'sniper', source: 'box',
    forged: { name: '"Vigil"', damage: 1200, magSize: 8, reserve: 64 },
    damage: 400, headMult: 4, rpm: 45, auto: false, magSize: 5, reserve: 40, reloadTime: 3.2,
    spreadHip: 0.08, spreadAim: 0, range: 120, falloffStart: 120, falloff: 1, pierce: 3, moveSpeedMult: 0.92, recoil: 0.12, zoom: 0.3 },
  { ...base, id: 'ferrier', name: '"Ferrier" auto-shotgun', cls: 'shotgun', source: 'box',
    forged: { name: '"Smithy"', damage: 66, magSize: 12, reserve: 72 },
    damage: 30, headMult: 1.5, rpm: 260, auto: true, magSize: 8, reserve: 48, reloadTime: 3.0,
    spreadHip: 0.085, spreadAim: 0.065, pellets: 8, range: 16, falloffStart: 5, falloff: 0.2, recoil: 0.08, zoom: 0.85 },
  { ...base, id: 'thumper', name: '"Thumper"', cls: 'launcher', source: 'box',
    forged: { name: '"Thunderclap"', damage: 1750, magSize: 2, reserve: 30 },
    damage: 700, headMult: 1, rpm: 60, auto: false, magSize: 1, reserve: 18, reloadTime: 2.4,
    spreadHip: 0.01, spreadAim: 0.004, range: 60, falloffStart: 60, falloff: 1, recoil: 0.1, zoom: 0.85,
    projectile: { kind: 'thumper', speed: 26, radius: 4 } },
  // The wonder weapons: their damage is what each body caught takes, enough to kill past round 30.
  { ...base, id: 'arclight', name: '"Arclight"', cls: 'wonder', source: 'box',
    forged: { name: '"Stormglass"', damage: 36000, magSize: 8, reserve: 40, wonder: { kind: 'arclight', chain: 14, radius: 7 } },
    damage: 12000, headMult: 1, rpm: 75, auto: false, magSize: 4, reserve: 20, reloadTime: 3.0,
    spreadHip: 0.012, spreadAim: 0.004, range: 40, falloffStart: 40, falloff: 1, recoil: 0.06, zoom: 0.8,
    wonder: { kind: 'arclight', chain: 8, radius: 5 } },
  { ...base, id: 'gravewell', name: '"Gravewell"', cls: 'wonder', source: 'box',
    forged: { name: '"Deepwell"', damage: 45000, magSize: 2, reserve: 14, wonder: { kind: 'gravewell', seconds: 4, radius: 8, pull: 7 },
      projectile: { kind: 'orb', speed: 9, radius: 8 } },
    damage: 15000, headMult: 1, rpm: 40, auto: false, magSize: 1, reserve: 8, reloadTime: 3.2,
    spreadHip: 0.01, spreadAim: 0.004, range: 60, falloffStart: 60, falloff: 1, recoil: 0.09, zoom: 0.85,
    projectile: { kind: 'orb', speed: 9, radius: 6 }, wonder: { kind: 'gravewell', seconds: 3, radius: 6, pull: 5 } },
];

export const WEAPONS: ReadonlyMap<WeaponId, WeaponDef> = new Map(list.map((w) => [w.id, w]));
export const WEAPON_LIST: readonly WeaponDef[] = list;
export const START_WEAPON: WeaponId = 'warden';
export const weaponDef = (id: WeaponId): WeaponDef | undefined => WEAPONS.get(id);

const FORGED: ReadonlyMap<WeaponId, WeaponDef> = new Map(list.map((w) => [w.id, { ...w, ...w.forged }]));
/** The stats a held weapon actually has: the table's, or its Forge upgrade's. */
export const weaponStats = (id: WeaponId, upgraded: boolean): WeaponDef | undefined => (upgraded ? FORGED : WEAPONS).get(id);

/** What a wall buy charges for ammo when you already hold its weapon. */
export const ammoCost = (def: WeaponDef, upgraded: boolean): number => (upgraded ? UPGRADED_AMMO_COST : Math.round((def.cost ?? 0) / 2));
