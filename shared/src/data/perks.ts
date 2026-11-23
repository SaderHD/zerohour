// Tonics (PLAN 4.6): what each one costs and does. The ids, order and colours of the dispensers
// are in map/dressing/mounts.ts (`TONICS`); every number a tonic changes is here.
import { PLAYER_MAX_HP, REVIVE_SECONDS, STAMINA_SECONDS, WEAPON_SLOTS } from '../constants';
import type { PerkId } from '../protocol';

export interface PerkDef {
  id: PerkId;
  name: string;
  cost: number;
  /** Price and power rule for a player on their own, where they differ. */
  soloCost?: number;
  soloNoPower?: boolean;
  /** One line for the prompt. */
  blurb: string;
}

const list: PerkDef[] = [
  { id: 'ironhide', name: 'Ironhide', cost: 2500, blurb: 'more health' },
  { id: 'second_wind', name: 'Second Wind', cost: 1500, soloCost: 500, soloNoPower: true, blurb: 'faster revives' },
  { id: 'quickhands', name: 'Quickhands', cost: 3000, blurb: 'faster reloads' },
  { id: 'hair_trigger', name: 'Hair Trigger', cost: 2000, blurb: 'faster fire' },
  { id: 'marathon', name: 'Marathon', cost: 2000, blurb: 'longer sprint' },
  { id: 'packmule', name: 'Packmule', cost: 4000, blurb: 'a third weapon' },
];

export const PERKS: ReadonlyMap<PerkId, PerkDef> = new Map(list.map((p) => [p.id, p]));
export const PERK_LIST: readonly PerkDef[] = list;
export const perkDef = (id: PerkId): PerkDef | undefined => PERKS.get(id);

// --- The effects
export const IRONHIDE_MAX_HP = 250;
export const QUICKHANDS_RELOAD_MULT = 0.5;
export const HAIR_TRIGGER_RATE_MULT = 1.33;
export const MARATHON_STAMINA_MULT = 2;
export const MARATHON_SPEED_MULT = 1.08;
export const SECOND_WIND_REVIVE_MULT = 2;
export const PACKMULE_SLOTS = 3;
/** Seconds a lone player with Second Wind lies on the floor before getting back up. */
export const SELF_REVIVE_SECONDS = 8;

type Perks = readonly PerkId[];
export const perkCost = (def: PerkDef, solo: boolean): number => (solo && def.soloCost !== undefined ? def.soloCost : def.cost);
export const perkNeedsPower = (def: PerkDef, solo: boolean): boolean => !(solo && def.soloNoPower);
export const maxHpWith = (perks: Perks): number => (perks.includes('ironhide') ? IRONHIDE_MAX_HP : PLAYER_MAX_HP);
export const reloadMultWith = (perks: Perks): number => (perks.includes('quickhands') ? QUICKHANDS_RELOAD_MULT : 1);
export const fireRateMultWith = (perks: Perks): number => (perks.includes('hair_trigger') ? HAIR_TRIGGER_RATE_MULT : 1);
export const staminaWith = (perks: Perks): number => STAMINA_SECONDS * (perks.includes('marathon') ? MARATHON_STAMINA_MULT : 1);
export const speedMultWith = (perks: Perks): number => (perks.includes('marathon') ? MARATHON_SPEED_MULT : 1);
export const weaponSlotsWith = (perks: Perks): number => (perks.includes('packmule') ? PACKMULE_SLOTS : WEAPON_SLOTS);
/** Seconds a teammate must hold F to get someone up. */
export const reviveSecondsWith = (reviverPerks: Perks): number =>
  REVIVE_SECONDS / (reviverPerks.includes('second_wind') ? SECOND_WIND_REVIVE_MULT : 1);
