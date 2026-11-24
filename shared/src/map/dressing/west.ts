import { TERRACE_N } from '../terraces';
import type { LightDef, PropInst } from '../types';
import { LIGHT, arrow, glow, lamp, lift, prop, rail, row, sign } from './helpers';

// Session 7: the west wing — Mess Hall, Bunkhouse + Washroom, Laboratory (up on the north terrace). Solid props sit on the
// 0.5 m grid and leave gaps of nothing or at least 1.5 m (the validator checks). Run `npm run map`
// after any edit and read docs/MAP.txt.

const mess: PropInst[] = [
  // Two tables still set for a meal, north side.
  prop('table_long', 25.5, 24.5), prop('bench', 25.5, 23.75), prop('bench', 25.5, 25.25),
  prop('table_long', 33.5, 24.5, 'n', { variant: 1 }), prop('bench', 33.5, 23.75), prop('bench', 33.5, 25.25),
  // The third was left in a hurry.
  prop('table_long', 26, 29.5, 'n', { variant: 2 }), prop('bench', 26, 28.75),
  prop('chair_tipped', 26.8, 30.9, 'n', { rot: 40 }), prop('chair_tipped', 24.9, 31.1, 'n', { variant: 1, rot: 200 }),
  prop('stool', 28.2, 30.4, 'n', { variant: 1 }), prop('stool', 30.6, 23.1), prop('papers', 29.8, 27.2),
  // Kitchen corner: the range on the south wall, the counter in the servery beside it.
  prop('counter', 38.5, 30.5, 'w'), prop('range', 34.5, 31.5, 'n'), prop('papers', 37.2, 30.2), sign('SERVERY', 37.6, 29, 's', 2.1),
  // Stores.
  ...row('shelf', 22.75, 29.5, 2, 0, 1, 'e', [0, 1]),
  prop('crate_stack', 36, 22.5), prop('barrel', 22.75, 22.25),
  // Walls and ceiling.
  prop('notice_board', 29.75, 22, 's'), sign('MESS HALL', 29.75, 22, 's', 2.6, 1),
  sign('BUNKS', 22.5, 25.3, 'e'), sign('YARD', 30.8, 32, 'n'), arrow('POWER', 27.2, 32, 'n', 'e'),
  prop('vent', 25, 32, 'n'), prop('pipe_drop', 31, 22, 's'),
  prop('pipes', 29.5, 22.45, 'n', { s: 13.6, y: 2.85 }), prop('cable', 32.6, 28.4, 'n', { s: 2.6, rot: 25 }),
];

const bunk: PropInst[] = [
  // Bunks head-to-wall down both sides, a footlocker at the end of each.
  ...row('bunk_bed', 14, 24, 3, 2.5, 0, 's'), ...row('footlocker', 14, 25.25, 3, 2.5, 0, 's'),
  ...row('bunk_bed', 14, 30, 3, 2.5, 0, 'n'), ...row('footlocker', 14, 28.75, 3, 2.5, 0, 'n'),
  ...row('locker', 14.75, 23.25, 3, 0.5, 0, 's'), ...row('locker', 17.25, 30.75, 3, 0.5, 0, 'n', [1]),
  ...row('locker', 6.25, 23.25, 4, 0, 0.5, 'e'),
  // The warm corner: stove, somewhere to sit, a card table with the lantern still lit.
  prop('potbelly', 9, 27.5, 'e'), prop('stool', 10.3, 26.6), prop('stool', 10.1, 28.5, 'n', { variant: 1 }), prop('stool', 7.6, 28.4),
  prop('table_small', 6.5, 30.5, 'n', { variant: 9 }), prop('lantern', 6.4, 30.4, 'n', { y: 0.8 }), prop('crate', 7.5, 30.5),
  // Stores by the mess door.
  prop('crate_stack', 21.5, 23.5), ...row('shelf', 21.75, 29.5, 2, 0, 1, 'w', [2, 3]),
  prop('chair_tipped', 12.4, 28.3, 'n', { rot: 110 }), prop('papers', 11.4, 26.8), prop('planks', 7.4, 25.6, 'n', { rot: 70 }),
  sign('WASHROOM', 11, 23, 's', 2.6), sign('MESS', 22, 25.3, 'w', 2.4), arrow('POWER', 13, 23, 's', 'w', 2.05), sign('BUNKHOUSE', 14, 31, 'n', 2.3, 1),
  prop('pipes', 14, 26.2, 'n', { s: 15.6, y: 2.62, variant: 1 }), prop('vent', 17, 31, 'n'), prop('cable', 19.5, 27.6, 'n', { s: 3.4, rot: -15 }),
];

const washroom: PropInst[] = [
  prop('boiler', 8.25, 18.75), ...row('sink', 8.25, 19.5, 3, 0, 1, 'e'), prop('bin', 8.25, 22.25),
  ...row('stall', 13.25, 19, 4, 0, 1, 'w', [0, 1, 2, 0]),
  prop('papers', 10.6, 20.8), prop('pipe_drop', 9.2, 18.5, 's'), prop('pipes', 9.2, 20.5, 'n', { s: 3.8, y: 2.45, rot: 90, variant: 1 }),
  sign('LAB', 11, 18.5, 's', 2.45, 2), sign('BUNKS', 11, 22.5, 'n', 2.5),
];

const lab: PropInst[] = [
  // Specimen tanks in their bay off the north wall; the middle one has been broken out of.
  prop('tank', 15.5, 4.5), prop('tank', 18, 4.5, 'n', { variant: 1 }), prop('tank', 20.5, 4.5, 'n', { variant: 2 }),
  // The stairs up from the washroom door, railed where the floor looks down on them.
  rail(12.1, 15.5, 12.1, 18),
  prop('lab_bench', 10.5, 9.5), prop('lab_bench', 10.5, 13, 'n', { variant: 1 }),
  prop('lab_bench', 16.5, 10, 'n', { variant: 2 }), prop('lab_bench', 16.5, 13.5, 'n', { variant: 3 }),
  ...row('computer', 21.5, 13, 3, 0, 1, 'w'),
  ...row('shelf', 14.5, 17.75, 3, 1, 0, 'n', [4, 5, 6]),
  prop('shelf_toppled', 7, 15), prop('desk', 6.5, 6.75, 'e'), prop('chair_tipped', 7.8, 7.1, 'n', { rot: 300 }),
  prop('crate', 19.5, 17.5), prop('barrels', 20.5, 17.5),
  prop('chalkboard', 6, 9.3, 'e'), prop('chalkboard', 8, 15.5, 'n', { variant: 1 }),
  sign('SPECIMENS', 18, 4, 's', 2.3, 2), sign('COLD STORE', 22, 9.2, 'w'), sign('BUNKS', 12.9, 18, 'n'), arrow('POWER', 22, 13.4, 'w', 'n', 2.5),
  sign('LABORATORY', 10.6, 6, 's', 2.9, 1),
  prop('stool', 13, 9.4), prop('stool', 14.2, 13.3, 'n', { variant: 1 }), prop('papers', 12.3, 15.4), prop('papers', 8.4, 11.3),
  prop('rubble', 17.4, 6.4), prop('cable', 19.4, 12.2, 'n', { s: 3.6, rot: -20 }), prop('pipes', 14, 8.1, 'n', { s: 15.6, y: 3.05 }),
  prop('vent', 9, 6, 's', { y: 2.7 }), prop('pipe_drop', 6, 13.4, 'e'),
];

export const westProps: PropInst[] = [...mess, ...bunk, ...washroom, ...lab];

const lowLights: LightDef[] = [
  // Mess hall: shaded bulbs over the tables, a strip light in the kitchen, the range still warm.
  lamp(25.5, 24.5, 2.4, LIGHT.warm, 8), lamp(33.5, 24.5, 2.4, LIGHT.warm, 8), lamp(29.5, 28.5, 2.4, LIGHT.warm, 8),
  lamp(34.3, 29.6, 3, LIGHT.lab, 6, { fixture: 'tube', flicker: true, intensity: 0.8 }),
  glow(34.5, 30.6, 0.5, LIGHT.ember, 4, { flicker: true, intensity: 0.7 }),
  glow(29, 31.6, 2.5, LIGHT.red, 5, { fixture: 'cage', intensity: 0.8 }), glow(22.9, 27, 2.5, LIGHT.amber, 5, { fixture: 'cage', intensity: 0.8 }),
  // Bunkhouse: two bulbs down the aisle; the stove and the lantern burn without the mains.
  lamp(13, 27, 2.3, LIGHT.dimWarm, 7), lamp(18.5, 27, 2.3, LIGHT.dimWarm, 7),
  glow(8.5, 27.5, 0.6, LIGHT.ember, 6, { flicker: true }), glow(6.4, 30.4, 1.05, LIGHT.flame, 4.5, { flicker: true, intensity: 0.8 }),
  glow(21.6, 27, 2.4, LIGHT.amber, 4.5, { fixture: 'cage', intensity: 0.7 }),
  // Washroom: one tube on its way out.
  lamp(11, 20.5, 2.5, LIGHT.lab, 6, { fixture: 'tube', flicker: true, intensity: 0.9 }),
  glow(9.6, 18.8, 2.3, LIGHT.red, 4, { fixture: 'cage', intensity: 0.6 }),
  glow(37.6, 30.4, 2.3, LIGHT.amber, 3.5, { fixture: 'cage', intensity: 0.6 }),
];

/** Heights over the laboratory's own floor. */
const labLights: LightDef[] = [
  // Laboratory: strip lights, the glow of the tanks, emergency lamps at the doors.
  lamp(10.5, 11.2, 3.3, LIGHT.lab, 9, { fixture: 'tube' }), lamp(16.5, 11.8, 3.3, LIGHT.lab, 9, { fixture: 'tube' }),
  lamp(13.5, 15.6, 3.3, LIGHT.lab, 7, { fixture: 'tube', flicker: true }),
  glow(15.5, 5.3, 1.2, LIGHT.specimen, 5, { intensity: 0.7 }), glow(20.5, 5.3, 1.2, LIGHT.specimen, 4.5, { intensity: 0.5 }),
  glow(21.6, 11, 2.5, LIGHT.red, 5, { fixture: 'cage', intensity: 0.8 }), glow(11, 17.6, 2.5, LIGHT.red, 5, { fixture: 'cage', intensity: 0.8 }),
];

export const westLights: LightDef[] = [...lowLights, ...lift(TERRACE_N, labLights)];
