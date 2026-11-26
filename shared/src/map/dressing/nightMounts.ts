import type { Interactable, LightDef, PropInst } from '../types';
import { LIGHT, glow, lamp, prop } from './helpers';
import { mountKit } from './mounts';

// The Longest Night, M8: where everything a player buys stands (PLAN 4.12, the table of zones).
// Each line is the thing you see and the thing you press F at, as on the station (`mounts.ts`).
// Six wall guns on seven boards (the Stitch hangs twice: in the tenement and down on the
// platform), the six tonics, five places for the Cache, the master switch on the plant room on
// Abelard's roof and the Forge in the signal room. Run `npm run map -- longest_night` after any edit.

const { wallbuy, tonic, cacheSite, props, lights, interactables } = mountKit();

// The Starlight: what a team starts with.
wallbuy('farrow', 53.5, 96.5, 'n');
wallbuy('pike', 40, 93, 'e');
tonic('second_wind', 55.5, 93.5, 'w');
// Wexler Square: the Cache starts under the south wall, in sight of the diner's door.
cacheSite('square', 67, 85.5, 'n', { start: true });
// Dray Avenue, east of the cut.
wallbuy('coachman', 78, 42, 'n');
// Tallow Lane, between the passage and the hatch.
tonic('quickhands', 80.5, 92.5, 's');
// The tenement: the hall, and the flat upstairs.
wallbuy('stitch', 58.5, 104.5, 'n');
tonic('marathon', 64.5, 109.5, 'n', { level: 1 });
// Its roof.
cacheSite('ten_roof', 68.5, 102, 'w', { level: 2 });
// Abelard's: the far wall of the ground floor; upstairs the north-west corner and the south-west.
wallbuy('kestrel', 126.5, 67.5, 'w');
tonic('hair_trigger', 97, 62.5, 's', { level: 1 });
cacheSite('abelard_up', 97.5, 85.5, 'n', { level: 1 });
// The Lyric: the auditorium's north wall, the corner under the screen, the back of the balcony.
wallbuy('brakeman', 28, 46, 's');
cacheSite('lyric', 24, 61.5, 'n');
tonic('packmule', 36.5, 46.5, 's', { level: 1 });
// St Audra's.
tonic('ironhide', 40.5, 27.5, 'e');
// The subway: the mezzanine's north wall; the far half of the platform.
cacheSite('mezz', 99, 55, 's', { level: -1 });
wallbuy('stitch', 104, 40, 'n', { level: -2, tag: 'platform' });

/** The master switch: a breaker box on the plant room's front, on Abelard's roof. */
const SWITCH = { x: 100.75, z: 65 };
/** The Forge, against the signal room's west wall. */
const FORGE = { x: 58.25, z: 61.5 };
interactables.push({ id: 'power', kind: 'powerSwitch', x: SWITCH.x, z: SWITCH.z, facing: 's', level: 2 });
interactables.push({ id: 'forge', kind: 'forge', x: FORGE.x + 0.75, z: FORGE.z, facing: 'e', level: -2 });

export const mountProps: PropInst[] = [
  ...props,
  prop('breaker_box', SWITCH.x, SWITCH.z, 's', { y: 0.9, level: 2 }),
  prop('forge', FORGE.x, FORGE.z, 'e', { level: -2 }),
];

export const mountLights: LightDef[] = [
  ...lights,
  // The switch's own lamp, lit before the mains so it is found; the Forge's arc once they are on.
  glow(SWITCH.x, SWITCH.z + 0.6, 1.9, LIGHT.red, 4.5, { intensity: 0.8, level: 2 }),
  lamp(FORGE.x + 1.2, FORGE.z, 1.5, LIGHT.arc, 5, { fixture: 'none', level: -2 }),
];

export const mountInteractables: Interactable[] = interactables;
