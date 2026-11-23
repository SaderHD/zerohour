import { DIR_VEC } from '../compile';
import type { Dir, Interactable, LightDef, PropInst } from '../types';
import { lamp, prop } from './helpers';

// Session 9: everything a player can buy has its place in the station (PLAN 4.5-4.9). Each line
// here is both the thing you see (a prop) and the thing you press F at (an interactable); the
// buying is server/src/game/interact.ts (the Cache: session 11).

/** Tonics in the order of their `variant`, with the colour each one glows. */
export const TONICS = [
  { id: 'ironhide', name: 'IRONHIDE', glow: 0x6090ff },
  { id: 'second_wind', name: 'SECOND WIND', glow: 0x50f0a0 },
  { id: 'quickhands', name: 'QUICKHANDS', glow: 0xffd040 },
  { id: 'hair_trigger', name: 'HAIR TRIGGER', glow: 0xff5038 },
  { id: 'marathon', name: 'MARATHON', glow: 0xff9028 },
  { id: 'packmule', name: 'PACKMULE', glow: 0xc070ff },
] as const;

export const mountProps: PropInst[] = [];
export const mountLights: LightDef[] = [];
export const interactables: Interactable[] = [];

/** A weapon on a wall: (x, z) is on the wall face, `face` the way it looks. */
function wallbuy(weapon: string, x: number, z: number, face: Dir): void {
  mountProps.push(prop('wallbuy', x, z, face, { text: weapon.toUpperCase(), y: 1.45 }));
  interactables.push({ id: `wb_${weapon}`, kind: 'wallbuy', ref: weapon, x, z, facing: face });
}

/** A tonic dispenser standing in the cell centred on (x, z). */
function tonic(id: (typeof TONICS)[number]['id'], x: number, z: number, face: Dir): void {
  const variant = TONICS.findIndex((t) => t.id === id);
  const v = DIR_VEC[face];
  mountProps.push(prop('tonic', x, z, face, { variant, text: TONICS[variant]!.name }));
  mountLights.push(lamp(x + v.x * 0.7, z + v.z * 0.7, 1.4, TONICS[variant]!.glow, 3.5, { fixture: 'none', intensity: 0.8 }));
  interactables.push({ id: `tonic_${id}`, kind: 'tonic', ref: id, x: x + v.x * 0.5, z: z + v.z * 0.5, facing: face });
}

let sites = 0;
/** One of the places the Cache can stand; the first listed is where it starts. */
function cacheSite(zone: string, x: number, z: number, face: Dir): void {
  const v = DIR_VEC[face];
  mountProps.push(prop('cache_site', x, z, face, { text: `SITE ${++sites}` }));
  interactables.push({ id: `cache_${zone}`, kind: 'cacheSite', x: x + v.x * 0.5, z: z + v.z * 0.5, facing: face });
}

// Mess hall
wallbuy('farrow', 22.5, 24, 'e');
wallbuy('pike', 32.2, 32, 'n');
tonic('second_wind', 23, 31.5, 'e');
// Bunkhouse
wallbuy('stitch', 8.25, 23, 's');
tonic('marathon', 21.5, 24.5, 'w');
cacheSite('bunk', 12.5, 30.5, 'n');
// Laboratory
wallbuy('kestrel', 22, 7.6, 'w');
tonic('hair_trigger', 21.5, 17.5, 'n');
// Cold storage and its tunnel
wallbuy('brakeman', 30, 8, 's');
tonic('packmule', 32, 14.5, 'n');
cacheSite('cold', 50, 11.5, 's');
// Motor pool
wallbuy('coachman', 58.75, 36, 's');
tonic('quickhands', 62, 38.5, 'w');
cacheSite('motor', 51.5, 47.5, 'n');
// Courtyard: where the Cache starts
cacheSite('yard', 20.5, 37, 'e');
interactables.unshift(interactables.pop()!);
// Comms bunker
tonic('ironhide', 35.5, 54, 'w');
cacheSite('comms', 35, 62.5, 'n');
// The master switch is the lever on the middle switchgear cabinet; the Forge is its own prop.
interactables.push({ id: 'power', kind: 'powerSwitch', x: 61, z: 32.5, facing: 'w' });
interactables.push({ id: 'forge', kind: 'forge', x: 41, z: 58, facing: 'w' });
