import { DIR_VEC } from '../compile';
import type { Dir, Interactable, LightDef, PropInst } from '../types';
import { TERRACE_N, TERRACE_S } from '../terraces';
import { lamp, prop } from './helpers';

// Session 9: everything a player can buy has its place in the station (PLAN 4.5-4.9). Each line
// here is both the thing you see (a prop) and the thing you press F at (an interactable); the
// buying is server/src/game/interact.ts (the Cache: session 11). `mountKit()` is how any map
// writes such lines (The Longest Night's are in `nightMounts.ts`).

/** Tonics in the order of their `variant`, with the colour each one glows. */
export const TONICS = [
  { id: 'ironhide', name: 'IRONHIDE', glow: 0x6090ff },
  { id: 'second_wind', name: 'SECOND WIND', glow: 0x50f0a0 },
  { id: 'quickhands', name: 'QUICKHANDS', glow: 0xffd040 },
  { id: 'hair_trigger', name: 'HAIR TRIGGER', glow: 0xff5038 },
  { id: 'marathon', name: 'MARATHON', glow: 0xff9028 },
  { id: 'packmule', name: 'PACKMULE', glow: 0xc070ff },
] as const;

/** Where a mount is other than on the ground storey: its storey, and how far its floor is above that storey's base. */
export interface MountAt {
  level?: number;
  floor?: number;
}

/** A map's list of things to buy, built a line at a time. */
export function mountKit() {
  const props: PropInst[] = [];
  const lights: LightDef[] = [];
  const interactables: Interactable[] = [];
  const on = (at: MountAt): { level?: number } => (at.level ? { level: at.level } : {});
  let sites = 0;
  return {
    props,
    lights,
    interactables,
    /** A weapon on a wall: (x, z) is on the wall face, `face` the way it looks. A map's second board for a gun takes a `tag` (its id is then `wb_<weapon>_<tag>`). */
    wallbuy(weapon: string, x: number, z: number, face: Dir, at: MountAt & { tag?: string } = {}): void {
      props.push(prop('wallbuy', x, z, face, { text: weapon.toUpperCase(), y: 1.45, ...on(at) }));
      interactables.push({ id: at.tag ? `wb_${weapon}_${at.tag}` : `wb_${weapon}`, kind: 'wallbuy', ref: weapon, x, z, facing: face, ...on(at) });
    },
    /** A tonic dispenser standing in the cell centred on (x, z). */
    tonic(id: (typeof TONICS)[number]['id'], x: number, z: number, face: Dir, at: MountAt = {}): void {
      const variant = TONICS.findIndex((t) => t.id === id);
      const v = DIR_VEC[face];
      props.push(prop('tonic', x, z, face, { variant, text: TONICS[variant]!.name, ...on(at) }));
      lights.push(lamp(x + v.x * 0.7, z + v.z * 0.7, (at.floor ?? 0) + 1.4, TONICS[variant]!.glow, 3.5, { fixture: 'none', intensity: 0.8, ...on(at) }));
      interactables.push({ id: `tonic_${id}`, kind: 'tonic', ref: id, x: x + v.x * 0.5, z: z + v.z * 0.5, facing: face, ...on(at) });
    },
    /** One of the places the Cache can stand. It starts at the first on the list: `start` puts this one there. */
    cacheSite(zone: string, x: number, z: number, face: Dir, at: MountAt & { start?: boolean } = {}): void {
      const v = DIR_VEC[face];
      props.push(prop('cache_site', x, z, face, { text: `SITE ${++sites}`, ...on(at) }));
      const it: Interactable = { id: `cache_${zone}`, kind: 'cacheSite', x: x + v.x * 0.5, z: z + v.z * 0.5, facing: face, ...on(at) };
      if (at.start) interactables.unshift(it);
      else interactables.push(it);
    },
  };
}

const { wallbuy, tonic, cacheSite, props: mountProps, lights: mountLights, interactables } = mountKit();
export { mountProps, mountLights, interactables };

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
tonic('hair_trigger', 21.5, 17.5, 'n', { floor: TERRACE_N });
// Cold storage and its tunnel
wallbuy('brakeman', 30, 8, 's');
tonic('packmule', 32, 14.5, 'n', { floor: TERRACE_N });
cacheSite('cold', 50, 11.5, 's');
// Motor pool
wallbuy('coachman', 58.75, 36, 's');
tonic('quickhands', 56, 38.5, 's', { floor: TERRACE_S });
cacheSite('motor', 51.5, 47.5, 'n');
// Courtyard: where the Cache starts
cacheSite('yard', 20.5, 37, 'e', { start: true });
// Comms bunker
tonic('ironhide', 35.5, 54, 'w', { floor: TERRACE_S });
cacheSite('comms', 35, 62.5, 'n');
// The master switch is the lever on the middle switchgear cabinet, up on the generator hall's
// gallery; the Forge is its own prop, down in the vault.
interactables.push({ id: 'power', kind: 'powerSwitch', x: 56.5, z: 24.5, facing: 's', level: 1 });
interactables.push({ id: 'forge', kind: 'forge', x: 25.5, z: 57.5, facing: 'e', level: -1 });
