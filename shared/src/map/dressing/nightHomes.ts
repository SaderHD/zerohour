import type { LightDef, PropInst } from '../types';
import { BULB } from './nightStreets';
import { LIGHT, glow, onLevel, prop, row, strung } from './helpers';

// The Longest Night, M7: the Starlight Diner, the tenement and the two roofs dressed (PLAN 4.12).
// Three kits: the diner's (booths, the counter, the jukebox), the home's (the hall's letter boxes;
// the flat's table, chairs and television) and the roofs' (the tank, chimneys, the coop; Abelard's
// plant, its skylight and the back of its sign; the iron of the ledges and the fire escape).
// Solid props on the 0.5 m grid, right against a wall or at least 1.5 m off it. Run
// `npm run map -- longest_night` after any edit.

// --- The Starlight: booths along the north and east walls, the counter in front of the kitchen.
const diner: PropInst[] = [
  prop('diner_booth', 41, 87.25, 's'), ...row('diner_booth', 47, 87.25, 3, 2, 0, 's'),
  ...row('diner_booth', 55.25, 90, 2, 0, 2, 'w'),
  prop('diner_counter', 42.5, 94.5, 'n', { variant: 2 }), prop('diner_counter', 44.5, 94.5), prop('diner_counter', 46.5, 94.5, 'n', { variant: 1 }),
  prop('jukebox', 40.5, 88.5, 'e'), prop('tinsel_tree', 55.5, 96, 'n', { variant: 1 }),
  // Paper chains from wall to wall, and what was dropped on the way out.
  strung('paper_chain', 44.5, 86.6, 2.95, 42, 96.4, 2.95), strung('paper_chain', 44.5, 86.6, 2.95, 49, 96.4, 2.95),
  strung('paper_chain', 52.5, 86.6, 2.95, 49, 96.4, 2.95), strung('paper_chain', 52.5, 86.6, 2.95, 55.8, 94, 2.95),
  prop('chair_tipped', 51.5, 93.2, 'n', { rot: 40 }), prop('papers', 48.5, 91.5), prop('papers', 43.4, 92.2, 'n', { rot: 35 }), prop('papers', 53.5, 88.5, 'n', { rot: 70 }),
  prop('wreath', 56, 94.75, 'w', { y: 1.9 }), prop('garland', 49, 96.5, 'n', { s: 6, y: 2.6 }),
  // The kitchen: the range and the sink under the wall to the diner, cold and dry goods down the west side.
  prop('range', 47, 97.5, 's'), prop('sink', 48.5, 97.25, 's'), prop('fridge', 46.5, 98.5, 'e'),
  ...row('shelf', 46.25, 99.5, 3, 0, 1, 'e'), prop('counter', 47.5, 102.5), ...row('shelf', 54.5, 102.75, 2, 1, 0),
  prop('bin', 55.75, 97.25), prop('papers', 52, 100.5), prop('pipes', 51, 97.3, 'n', { s: 8, y: 2.6 }),
  // Its front on the square.
  prop('diner_sign', 54, 86, 'n', { y: 2.6 }), prop('wreath', 52.6, 86, 'n', { y: 1.9 }), prop('wreath', 55.5, 86, 'n', { y: 1.9 }),
];

// --- The tenement. The hall: letter boxes, a radiator, somebody's bicycle.
const hall: PropInst[] = [
  prop('mailboxes', 61, 98.5, 's', { y: 1 }), prop('radiator', 64.5, 98.5, 's'), prop('picture_frame', 58.2, 98.5, 's', { variant: 2, y: 1.4 }),
  prop('bicycle', 64, 104.25), prop('bin', 56.75, 104.25), prop('papers', 60, 101), prop('papers', 65, 100.2, 'n', { rot: 50 }),
  prop('wreath', 56.5, 102.2, 'e', { y: 1.8 }),
];

// --- The flat: dinner on the table, the tree in the corner, the television showing snow.
const flat: PropInst[] = onLevel(1, [
  prop('dinner_table', 62, 102), prop('sideboard', 62, 98.75, 's'),
  prop('television', 61, 109.75), prop('armchair', 61, 107, 's'), prop('sofa', 57.5, 106, 'e'), prop('rug', 61, 108.3),
  prop('tinsel_tree', 57.5, 109.5), prop('presents', 58.5, 109.4, 'n', { variant: 1 }), prop('presents', 57.6, 108.5, 'n', { variant: 2 }),
  prop('bed', 65.5, 103.25, 'w'), prop('wardrobe', 66.25, 104.75, 'w'),
  prop('radiator', 57, 103, 'e'), prop('picture_frame', 57, 106, 'e', { variant: 1, y: 1.5 }), prop('picture_frame', 64, 110, 'n', { y: 1.4 }),
  prop('picture_frame', 66.5, 100.5, 'w', { variant: 2, y: 1.4 }),
  strung('paper_chain', 57.1, 101.5, 2.8, 66.4, 100.5, 2.8), strung('paper_chain', 57.1, 108, 2.8, 66.4, 106.6, 2.8),
  prop('garland', 59.25, 98.5, 's', { s: 2.5, y: 2.4 }), prop('papers', 63.5, 105.5), prop('chair_tipped', 59.6, 103.6, 'n', { rot: 110 }),
]);

// --- The tenement's roof: the tank, the stacks, the coop, and somebody's reindeer looking over the lane.
const tenRoof: PropInst[] = onLevel(2, [
  prop('water_tank', 60.5, 107.5), prop('chimney', 65.5, 103.5, 'n', { variant: 1 }), prop('chimney', 66.5, 110.5),
  prop('pigeon_coop', 68.5, 104, 'w'), prop('aerial', 56.75, 110.75), prop('aerial', 64.75, 98.75),
  prop('reindeer', 62.5, 98.75), strung('light_string', 57.2, 98.6, 1.15, 67.3, 98.6, 1.15, 1),
  prop('crate', 72, 110.5), prop('planks', 70.4, 109.2, 'n', { rot: 20 }), prop('tyre', 69.8, 110.4),
  prop('snow_drift', 68.4, 101.6, 'w'), prop('snow_drift', 58, 104.6, 'e', { variant: 1 }), prop('snow_drift', 63, 110.4, 'n'),
]);

// --- Abelard's roof: the plant, the lantern over the atrium, the back of the sign that faces the square.
const abelardRoof: PropInst[] = onLevel(2, [
  prop('skylight', 111.5, 74), prop('plant_room', 102, 63.5, 's'), prop('ac_unit', 109, 62), prop('ac_unit', 112.5, 62),
  prop('roof_vent', 119.5, 67.5), prop('roof_vent', 119.5, 80.5), prop('roof_vent', 104.5, 84.5), prop('roof_vent', 100.5, 79.5, 'n', { variant: 2 }),
  prop('sign_back', 96.75, 66, 'w'), prop('aerial', 126.75, 59.75),
  strung('light_string', 96.7, 77, 1.15, 96.7, 86.3, 1.15, 1),
  prop('snow_drift', 123.4, 68, 'w'), prop('snow_drift', 110, 91, 'n', { variant: 1 }), prop('snow_drift', 118, 60.1, 's'), prop('snow_drift', 104.6, 63.5, 'e', { variant: 1 }),
  // The walk along the lane.
  prop('snow_drift', 74, 90, 's'), prop('snow_drift', 88, 90, 's', { variant: 1 }), prop('planks', 79, 90.8, 'n', { rot: 10 }),
]);

export const homeProps: PropInst[] = [...diner, ...hall, ...flat, ...tenRoof, ...abelardRoof];

export const homeLights: LightDef[] = [
  // The diner: the jukebox, the pie case, the tree; the sign over its door.
  glow(41.4, 88.5, 1.1, 0xff80a0, 5, { intensity: 0.8 }), glow(46.5, 94.2, 1.5, LIGHT.warm, 3.5, { intensity: 0.6 }),
  glow(55, 95.4, 1.2, BULB.green, 3.5, { intensity: 0.5 }),
  glow(54, 85.2, 3, 0xff5040, 8, { intensity: 0.9 }), glow(54, 85, 5, BULB.gold, 7, { intensity: 0.6 }),
  // The flat: the television, the candles on the table, the tree.
  glow(61, 109.2, 0.9, 0xc8d8ff, 5.5, { flicker: true, intensity: 0.8, level: 1 }),
  glow(62, 102, 1.1, LIGHT.flame, 4, { flicker: true, intensity: 0.7, level: 1 }), glow(58.1, 109, 1.2, BULB.red, 3.5, { intensity: 0.5, level: 1 }),
  // The roofs: the reindeer; the sign's red and the store's light up through the glass.
  glow(62.5, 99.4, 0.9, 0xffe0b0, 4.5, { intensity: 0.7, level: 2 }),
  glow(98.4, 66, 1.9, 0xff4030, 9, { intensity: 0.8, level: 2 }), glow(111.5, 69.2, 1.2, LIGHT.warm, 6, { intensity: 0.5, level: 2 }),
  glow(111.5, 78.8, 1.2, LIGHT.warm, 6, { intensity: 0.5, level: 2 }),
];
