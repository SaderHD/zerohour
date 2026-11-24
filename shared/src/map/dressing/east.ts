import type { LightDef, PropInst } from '../types';
import { LIGHT, arrow, glow, lamp, prop, row, sign } from './helpers';

// Session 8: the industrial wing — Cold Storage (and the tunnel behind it), Generator Hall, Motor
// Pool. Same rules as the west wing: solid props on the 0.5 m grid, gaps of nothing or at least
// 1.5 m. Run `npm run map` after any edit and read docs/MAP.txt.

const cold: PropInst[] = [
  // Three aisles of racking down the room; a lane is left along both long walls.
  ...row('rack', 26, 10.5, 2, 0, 2), ...row('rack', 29, 10.5, 2, 0, 2, 'n', [1, 2]), ...row('rack', 35, 10.5, 2, 0, 2, 'n', [3, 4]),
  // Lake ice stacked under the meat rail, the plant in the corner.
  prop('ice_block', 38, 8.5), prop('ice_stack', 39, 8.5, 'n', { variant: 1 }), prop('ice_block', 40, 8.5, 'n', { variant: 2 }), prop('ice_stack', 41, 8.5),
  prop('hook_rail', 39.3, 8.55, 'n', { s: 4.2, y: 2.62, variant: 1 }), prop('hook_rail', 32, 11.6, 'n', { s: 4.6, y: 2.62 }),
  prop('chiller', 42, 9, 'w'),
  // Stock that never made it onto a shelf.
  prop('crate', 38, 12), prop('crate_stack', 39, 12), prop('crate_stack', 23, 14.5), prop('crate', 24, 14.5), prop('barrels', 23, 8.5),
  prop('papers', 31.6, 13.6), prop('planks', 37, 13.8, 'n', { rot: 30 }), prop('rubble', 33.2, 9.2),
  // Frost.
  prop('pipes', 32.4, 8.3, 'n', { s: 19.6, y: 2.72 }), prop('icicles', 27, 8.3, 'n', { s: 5, y: 2.66 }), prop('icicles', 36, 8.3, 'n', { s: 3, y: 2.66 }),
  prop('icicles', 42.45, 13, 'n', { s: 3.6, y: 2.6, rot: 90 }), prop('icicles', 32.75, 8.05, 'n', { s: 1.4, y: 2.1 }),
  prop('vent', 30, 15, 'n', { y: 2.5 }), prop('pipe_drop', 36.5, 15, 'n'),
  sign('COLD STORE', 22.5, 9.2, 'e', 2.3, 2), sign('LAB', 22.5, 12.6, 'e'), sign('KEEP SHUT', 26, 15, 'n', 1.9, 2), sign('GENERATORS', 40.5, 15, 'n', 2.1),
];

const tunnel: PropInst[] = [
  prop('timber_frame', 44.5, 13, 'n', { s: 4, rot: 90 }), prop('timber_frame', 48, 13, 'n', { s: 4, rot: 90 }),
  prop('timber_frame', 52, 17, 'n', { s: 4 }), prop('timber_frame', 52, 20.5, 'n', { s: 4 }),
  prop('crate_stack', 53.5, 14.5), prop('crate', 53.5, 15.5), prop('barrel', 50.25, 22.75), prop('crate_small', 50.25, 22.25),
  prop('drip', 46.4, 12.3), prop('drip', 51.3, 18.6), prop('rubble', 45.8, 14.3), prop('rubble', 53, 21.6, 'n', { variant: 1 }),
  prop('pipes', 46.5, 11.3, 'n', { s: 7.6, y: 2.3, variant: 1 }), prop('cable', 47, 14.6, 'n', { s: 8, rot: 2 }), prop('cable', 50.5, 18.5, 'n', { s: 6.5, rot: 88 }),
  sign('GENERATORS', 52, 15, 's', 2.2, 1), sign('COLD STORE', 46, 15, 'n', 1.9),
];

const gen: PropInst[] = [
  // The two sets side by side, hazard lines round each.
  prop('generator', 53, 29.5), prop('generator', 58, 29.5, 's'),
  ...[53, 58].flatMap((x) => [
    prop('stripes', x, 27.25, 'n', { s: 2.6 }), prop('stripes', x, 31.75, 'n', { s: 2.6 }),
    prop('stripes', x - 1.25, 29.5, 'n', { s: 4.8, rot: 90 }), prop('stripes', x + 1.25, 29.5, 'n', { s: 4.8, rot: 90 }),
  ]),
  // Fuel along the west wall, switchgear along the east.
  ...row('locker', 48.25, 23.75, 3, 0.5, 0, 's', [1]), prop('fuel_tank', 48.75, 25.5), prop('fuel_tank', 48.75, 28.5, 'n', { variant: 1 }),
  ...row('switchgear', 61.5, 31.5, 3, 0, 1, 'w', [0, 1, 0]),
  // The walkway nobody can reach any more, and the ladder that used to.
  prop('catwalk', 55, 25.5, 'n', { s: 14, y: 3.1 }), prop('ladder', 62, 25.5, 'w', { y: 3.1 }),
  prop('wall_fan', 50.5, 35.5, 'n', { y: 3.9 }), prop('wall_fan', 59.5, 35.5, 'n', { y: 3.9 }),
  prop('spool', 48.5, 35), prop('crate_stack', 49.5, 35), prop('barrels', 61.5, 24),
  // Plumbing and wiring.
  prop('pipes', 53.2, 27.1, 'n', { s: 9.6, y: 4.3 }), prop('pipe_drop', 48, 31.6, 'e', { y: 4.3 }), prop('pipe_drop', 56.8, 35.5, 'n'),
  prop('pipes', 60.6, 29.5, 'n', { s: 11.6, y: 4.5, rot: 90, variant: 1 }),
  prop('cable', 60, 32, 'n', { s: 2.2, rot: -25 }), prop('cable', 55.5, 32.6, 'n', { s: 3.2, rot: 10 }), prop('cable', 51, 32.8, 'n', { s: 2.6, rot: 160 }),
  prop('drip', 50.2, 33.2), prop('papers', 59.8, 34.2), prop('stool', 60.4, 30.6), prop('rubble', 56.2, 24.4),
  sign('DANGER 440 V', 62, 30.4, 'w', 2.2, 2), sign('NO NAKED FLAME', 48, 30.8, 'e', 2.3, 2), sign('GENERATOR HALL', 55.5, 23.5, 's', 4, 1),
  sign('MOTOR POOL', 53.2, 35.5, 'n', 2.2), sign('TUNNEL', 53.8, 23.5, 's', 2.2), arrow('POWER', 58.2, 35.5, 'n', 'e', 2.1), prop('vent', 60.5, 23.5, 's', { y: 3.6 }),
];

const motor: PropInst[] = [
  // A truck up on stands in front of the shutter it came in by.
  prop('truck_cab', 58.75, 42, 'n', { variant: 1 }), prop('truck_bed', 58.75, 44.75, 'n', { variant: 1 }),
  prop('roller_door', 58.75, 48, 'n', { text: 'BAY 2' }), prop('stripes', 58.75, 47.7, 'n', { s: 4 }),
  prop('tool_chest', 57.25, 45, 'w'), prop('tyre', 57.1, 41.6, 'w', { variant: 1 }), prop('tyre', 56.4, 43.3), prop('creeper', 56.8, 44.2, 'n', { rot: 20 }),
  prop('oil_stain', 56.2, 42.2), prop('oil_stain', 51.5, 40.2, 'n', { variant: 1 }), prop('cable', 55.4, 40.4, 'n', { s: 3.2, rot: 35 }),
  // The fitters' corner.
  prop('workbench', 48, 36.5, 's'), prop('tool_board', 48, 36, 's'), prop('tool_chest', 50, 36.25, 's', { variant: 1 }),
  prop('stool', 49.2, 37.6, 'n', { variant: 1 }), prop('brazier', 53.25, 38.25),
  // Stores.
  ...row('shelf', 46.75, 44.5, 2, 0, 1, 'e', [7, 8]), prop('tyres', 47, 46.5, 'n', { variant: 1 }), prop('tyres', 47, 47.5), prop('tyres', 48, 47.5, 'n', { variant: 2 }),
  prop('tyre', 48.2, 46.3, 'n', { variant: 3 }),
  prop('crate_stack', 51.5, 44), prop('tyres', 52.5, 44, 'n', { variant: 1 }), prop('barrels', 51.5, 45), prop('crate', 52.5, 45),
  prop('barrels', 62, 36.5), prop('barrel', 61.25, 36.25), prop('crate', 62, 37.5), prop('spool', 62, 47.5),
  // Walls and roof.
  prop('wall_fan', 62.5, 39.3, 'w', { y: 3.6 }), prop('pipes', 54.5, 36.4, 'n', { s: 15.6, y: 4.1 }), prop('pipe_drop', 51.6, 36, 's', { y: 4.1 }),
  prop('drip', 55.9, 46.6), prop('planks', 49.6, 46.9, 'n', { rot: 15 }), prop('papers', 50.6, 38.2), prop('vent', 50, 48, 'n', { y: 3 }),
  sign('MOTOR POOL', 58.75, 36, 's', 3.4, 1), sign('YARD', 46.5, 40.5, 'e'), sign('GENERATORS', 53.2, 36, 's', 2.2), sign('NO SMOKING', 46.5, 38.5, 'e', 2.2, 2), arrow('POWER', 57.1, 36, 's', 'w', 2.35),
];

export const eastProps: PropInst[] = [...cold, ...tunnel, ...gen, ...motor];

export const eastLights: LightDef[] = [
  // Cold storage: hard blue tubes down the aisles, one on its way out; the plant's gauge and the
  // emergency lamps are all there is until the power is on.
  lamp(27.5, 11.5, 2.9, LIGHT.ice, 8, { fixture: 'tube' }), lamp(32, 12.8, 2.9, LIGHT.ice, 8, { fixture: 'tube' }),
  lamp(37.4, 10.5, 2.9, LIGHT.ice, 8, { fixture: 'tube', flicker: true }),
  glow(41.2, 9.4, 1.5, LIGHT.ice, 4.5, { intensity: 0.6 }), glow(23, 12.6, 2.4, LIGHT.red, 5, { fixture: 'cage', intensity: 0.8 }),
  glow(41.9, 14.5, 2.4, LIGHT.amber, 5, { fixture: 'cage', intensity: 0.7 }),
  // Tunnel: emergency lighting only.
  glow(47, 11.4, 2.3, LIGHT.red, 6, { fixture: 'cage', intensity: 0.9 }), glow(53.6, 19, 2.3, LIGHT.red, 6, { fixture: 'cage', intensity: 0.9 }),
  // Generator hall: big amber lamps high up, a tube under the walkway; each set keeps a red
  // warning lamp burning.
  lamp(55.5, 29.5, 4.2, LIGHT.amber, 13, { intensity: 2.4 }), lamp(50.6, 32.8, 4.2, LIGHT.amber, 12, { intensity: 2 }), lamp(60.2, 26.6, 4.2, LIGHT.amber, 11, { intensity: 2 }),
  lamp(55, 26.7, 2.95, LIGHT.sodium, 7, { fixture: 'tube', flicker: true, intensity: 0.8 }),
  glow(54.5, 29.2, 1.1, LIGHT.red, 4, { flicker: true, intensity: 0.6 }), glow(56.5, 29.8, 1.1, LIGHT.red, 4, { flicker: true, intensity: 0.6 }),
  glow(52, 24, 2.6, LIGHT.red, 5.5, { fixture: 'cage', intensity: 0.8 }), glow(55, 35, 2.6, LIGHT.red, 5.5, { fixture: 'cage', intensity: 0.8 }),
  glow(60.6, 34.9, 2.4, LIGHT.amber, 5, { fixture: 'cage', intensity: 0.7 }),
  // Motor pool: sodium lamps, a work lamp swinging by the truck, a tube over the bench, and the
  // brazier the fitters left burning.
  lamp(50.5, 41.5, 3.8, LIGHT.sodium, 11, { intensity: 1.5 }), lamp(60.8, 38.6, 3.8, LIGHT.sodium, 10, { intensity: 1.4 }),
  lamp(55.6, 45.4, 3.8, LIGHT.sodium, 10, { intensity: 1.4 }),
  lamp(56.4, 41, 2.5, LIGHT.sodium, 8, { fixture: 'swing' }),
  lamp(48.4, 37.5, 4.4, LIGHT.lab, 6.5, { fixture: 'tube', flicker: true, intensity: 0.8 }),
  glow(53.25, 38.25, 1.15, LIGHT.ember, 7, { flicker: true }),
  glow(47, 40.5, 2.5, LIGHT.red, 5, { fixture: 'cage', intensity: 0.8 }), glow(56.5, 36.4, 2.6, LIGHT.amber, 5, { fixture: 'cage', intensity: 0.7 }),
];
