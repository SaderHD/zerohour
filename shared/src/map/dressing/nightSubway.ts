import type { LightDef, PropInst } from '../types';
import { LIGHT, lamp, onLevel, prop, row } from './helpers';

// The Longest Night, M7: the subway dressed (PLAN 4.12): the mezzanine and its turnstiles, the
// platform, the train that stands along it, the service tunnel and the signal room. One kit
// (`models/props/subway.ts`). Solid props on the 0.5 m grid, right against a wall or at least
// 1.5 m off it. Run `npm run map -- longest_night` after any edit.

// --- The mezzanine. The way north to the platform is through a bank of turnstiles: two lanes,
// fenced off from the hall, the token booth beside them.
const mezz: PropInst[] = onLevel(-1, [
  prop('turnstile', 86.25, 56.5), prop('turnstile', 88.25, 56.5), prop('turnstile', 90.25, 56.5, 'n', { variant: 1 }),
  prop('iron_fence', 90.25, 55.25, 'e'), prop('token_booth', 93, 55.25, 's'),
  ...[59.25, 63.25].flatMap((z) => [prop('tiled_pillar', 93.25, z), prop('tiled_pillar', 99.25, z)]),
  prop('platform_bench', 89, 66.25), prop('platform_bench', 101, 66.25), prop('bin', 86.25, 66.25), prop('bin', 105.75, 66.25),
  prop('transit_poster', 92, 66.5, 'n'), prop('transit_poster', 98.5, 66.5, 'n', { variant: 1 }),
  prop('transit_poster', 86, 61, 'e', { variant: 2 }), prop('transit_poster', 106, 58, 'w', { variant: 3 }),
  prop('payphone', 106, 62.5, 'w'), prop('payphone', 106, 63.5, 'w'), prop('station_clock', 96.25, 57.5, 'n', { y: 2.1 }),
  prop('garland', 98, 54.5, 's', { s: 6, y: 2.4 }), prop('papers', 95, 60), prop('papers', 102.5, 64, 'n', { rot: 40 }), prop('papers', 88.5, 59.5, 'n', { rot: 20 }),
  prop('stripes', 88.5, 54.3, 'n', { s: 3 }),
]);

// --- The platform, in its two halves, and the side of the train along both.
const platform: PropInst[] = onLevel(-2, [
  ...([[72, 4], [79.75, 8.5], [89.75, 8.5], [99, 2], [102.75, 2.5], [105.75, 0.5]] as const).map(([x, s]) => prop('train_side', x, 32, 's', { s })),
  prop('stripes', 80, 32.4, 'n', { s: 28 }), prop('stripes', 107, 32.4, 'n', { s: 18 }),
  ...[72.25, 79.25, 86.25, 91.25, 103.25, 109.25].map((x) => prop('tiled_pillar', x, 35.75)),
  ...[73, 81, 93, 101, 109].map((x) => prop('platform_bench', x, 39.75)),
  prop('transit_poster', 77, 40, 'n', { variant: 1 }), prop('transit_poster', 84.5, 40, 'n'), prop('transit_poster', 105, 40, 'n', { variant: 2 }), prop('transit_poster', 113, 40, 'n'),
  prop('station_clock', 83, 34.5, 'n', { y: 2.5 }), prop('station_clock', 106, 34.5, 'n', { y: 2.5 }),
  prop('bin', 70.25, 39.75), prop('bin', 115.75, 39.75),
  // Where the roof came down between the halves.
  prop('rubble', 93.2, 34.6), prop('rubble', 98.8, 37.4, 'n', { rot: 90 }), prop('planks', 92.6, 37.6, 'n', { rot: 30 }),
  prop('papers', 76, 37), prop('papers', 88.6, 38.4, 'n', { rot: 60 }), prop('papers', 104, 34), prop('papers', 112.5, 37.5, 'n', { rot: 15 }),
]);

// --- The train: three carriages end to end, a bench down each side wherever there is no door.
const NORTH_SEATS = [71, 73, 75, 79.5, 81.5, 83.5, 87, 89, 91, 94.5, 96.5, 98.5, 103, 105];
const SOUTH_SEATS = [71, 78, 80, 82, 88, 90, 92, 95.5, 97.5];
const train: PropInst[] = onLevel(-2, [
  ...NORTH_SEATS.map((x) => prop('train_seats', x, 28.75, 's')), ...SOUTH_SEATS.map((x) => prop('train_seats', x, 31.25)),
  prop('train_bulkhead', 82, 30), prop('train_bulkhead', 95, 30),
  ...[[73.6, 30.8], [76, 30.8], [83.6, 30.8], [86, 30.8], [99.6, 30.8], [102, 30.8], [103.6, 30.8], [77.75, 29.2], [85.25, 29.2], [92.75, 29.2], [100.25, 29.2]].map(([x, z]) => prop('grab_pole', x!, z!)),
  prop('presents', 90.4, 30.2, 'n', { variant: 1 }), prop('papers', 80, 30), prop('papers', 97, 30.2, 'n', { rot: 70 }), prop('papers', 104.5, 29.8, 'n', { rot: 30 }),
]);

// --- The service tunnel: cable down both walls, relays in cabinets; the signal room off it,
// its west wall kept clear for what will stand there (M8).
const service: PropInst[] = [
  ...onLevel(-2, [
    prop('cable_bundle', 66, 50, 'e', { s: 18, y: 2.3 }), prop('cable_bundle', 70, 56.5, 'w', { s: 17, y: 2 }), prop('cable_bundle', 70, 72, 'w', { s: 7, y: 2 }),
    prop('pipes', 68.6, 58, 'n', { rot: 90, s: 34, y: 2.75 }),
    ...row('relay_cabinet', 69.75, 44.5, 2, 0, 1, 'w'), ...row('relay_cabinet', 69.75, 52.5, 2, 0, 1, 'w'), ...row('relay_cabinet', 66.25, 70.5, 2, 0, 1, 'e'),
    prop('transformer', 66.5, 47.5), prop('stripes', 66.3, 61, 'n', { rot: 90, s: 2 }), prop('stripes', 68, 75.7, 'n', { s: 4 }), prop('stripes', 68, 40.9, 'n', { s: 4 }),
    prop('papers', 68, 50), prop('cable', 67.6, 64.5, 'n', { rot: 80, s: 5 }),
    // The signal room.
    prop('lever_frame', 61.5, 58.5, 's'), prop('track_diagram', 61.5, 58, 's', { y: 1.6 }),
    prop('transformer', 58, 58.5), prop('capacitor', 58, 63.5), ...row('relay_cabinet', 59, 63.75, 3, 1, 0), prop('teleprinter', 65, 63.75),
    prop('chair_tipped', 63.4, 61.6, 'n', { rot: 200 }), prop('papers', 62.5, 60.5), prop('cable', 61.5, 62.9, 'n', { s: 5 }),
    prop('cable_bundle', 65.5, 63, 'w', { s: 2, y: 2.3 }),
  ]),
  // The landing between the two flights up to the lane.
  ...onLevel(-1, [prop('crate_stack', 66.5, 83.5), prop('barrels', 66.5, 91), prop('papers', 68.5, 87), prop('cable_bundle', 66, 87, 'e', { s: 5, y: 2.2 })]),
];

export const subwayProps: PropInst[] = [...mezz, ...platform, ...train, ...service];

export const subwayLights: LightDef[] = [
  // The booth's sign and the clocks come up with the mains; so does the board in the signal room.
  lamp(93, 56.4, 2, LIGHT.specimen, 4, { fixture: 'none', level: -1, intensity: 0.7 }),
  lamp(61.5, 59, 2.1, LIGHT.sodium, 5, { fixture: 'none', level: -2, intensity: 0.7 }),
];
