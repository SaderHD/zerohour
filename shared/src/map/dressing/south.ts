import type { LightDef, PropInst } from '../types';
import { LIGHT, arrow, glow, guy, lamp, prop, row, sign } from './helpers';

// Session 9: the yard, the comms bunker and the vault. Same rules as the other wings: solid props
// on the 0.5 m grid, gaps of nothing or at least 1.5 m. Run `npm run map` after any edit and read
// docs/MAP.txt.

/** Where the radio mast stands; its guy wires are made off to blocks at the fences. */
const MAST = { x: 24.75, z: 47.75 };
const GUY_HEIGHT = 11;

const yard: PropInst[] = [
  // The mast in the south-west corner, guyed three ways.
  prop('mast', MAST.x, MAST.z),
  ...guy(20.25, 52.25, MAST.x, MAST.z, GUY_HEIGHT), ...guy(20.25, 43.25, MAST.x, MAST.z, GUY_HEIGHT), ...guy(32.25, 52.25, MAST.x, MAST.z, GUY_HEIGHT),
  prop('cable', 27.4, 50.3, 'n', { s: 5.4, rot: -38 }),
  // A truck that never left, nose to the east along the mess wall; the snowcat that was to tow it.
  prop('truck_cab', 36, 33.75, 'e', { variant: 2 }), prop('truck_bed', 33.25, 33.75, 'e', { variant: 2 }),
  prop('tracks', 28.6, 34.6, 'n', { s: 5.4, rot: 84 }), prop('tyre', 37.6, 34.9, 'n', { variant: 3 }),
  prop('snowcat', 33.25, 43), prop('crate_stack', 31.5, 44.5), prop('crate', 31.5, 43.5), prop('barrels', 35, 41.5),
  prop('tracks', 33.25, 48, 'n', { s: 5.6, rot: 4 }),
  // The flag, and the fire the last watch kept by the mess door.
  prop('flagpole', 25.25, 36.25), prop('brazier', 27.25, 35.25), prop('stool', 26.2, 34.6), prop('stool', 28.1, 36.2, 'n', { variant: 1 }),
  // Stores stacked wherever there was a wall to stack them against.
  prop('crate_stack', 20.5, 33), prop('crate', 21.5, 33), prop('crate', 20.5, 34),
  prop('crate_stack', 45.5, 33), prop('barrels', 45.5, 34),
  prop('spool', 45.5, 37.5), prop('crate', 45.5, 38.5), prop('tyres', 45.5, 45.5), prop('tyres', 45.5, 46.5, 'n', { variant: 1 }),
  prop('barrels', 37.5, 52), prop('crate_stack', 38.5, 52), prop('crate', 39.5, 52), prop('crate_stack', 40.5, 52),
  prop('crate_stack', 40.5, 38.5), prop('crate', 41.5, 38.5), prop('crate', 40.5, 39.5),
  prop('spool', 38.5, 47), prop('crate', 39.5, 47),
  // Each breach in the fence got a wall of sandbags, and not much else.
  prop('sandbags', 22.25, 41, 'e'), prop('sandbags', 41, 35.25), prop('sandbags', 43.75, 50, 'w'),
  prop('planks', 21, 39.4, 'n', { rot: 70 }), prop('planks', 43, 33.4, 'n', { rot: 10 }), prop('planks', 45.2, 48.8, 'n', { rot: 100 }),
  prop('rubble', 21.2, 42.4), prop('rubble', 39.2, 33.3, 'n', { variant: 1 }),
  // Snow against everything.
  prop('snow_drift', 20.5, 45.4, 'e'), prop('snow_drift', 20.5, 50, 'e', { variant: 1 }), prop('snow_drift', 23.5, 52, 'n'),
  prop('snow_drift', 27, 52, 'n', { variant: 1 }), prop('snow_drift', 34.8, 52, 'n'), prop('snow_drift', 42.6, 52, 'n', { variant: 1 }),
  prop('snow_drift', 38.6, 33, 's'), prop('snow_drift', 43.6, 33, 's', { variant: 1 }), prop('snow_drift', 24.2, 33, 's'),
  prop('snow_drift', 45.5, 35.6, 'w'), prop('snow_drift', 45.5, 40, 'w', { variant: 1 }), prop('snow_drift', 45.5, 48, 'w'),
  prop('snow_drift', 31.4, 42.2, 'e', { variant: 1 }), prop('snow_drift', 26.2, 47.6, 'w'),
  // Wire along the top of the fence, wherever there is no building behind it.
  prop('wire_top', 20, 42.5, 'e', { s: 20, y: 3.5 }), prop('wire_top', 21.25, 32.5, 's', { s: 2.5, y: 3.5 }), prop('wire_top', 41.25, 32.5, 's', { s: 9.5, y: 3.5 }),
  prop('wire_top', 46, 34.25, 'w', { s: 3.5, y: 3.5 }), prop('wire_top', 46, 50.25, 'w', { s: 4.5, y: 3.5 }),
  prop('wire_top', 22, 52.5, 'n', { s: 4, y: 3.5 }), prop('wire_top', 41, 52.5, 'n', { s: 10, y: 3.5 }),
  // Painted on the buildings, so nobody has to ask.
  sign('MESS HALL', 29, 32.5, 's', 2.85, 1), sign('MOTOR POOL', 46, 42, 'w', 2.85, 1), sign('COMMS', 30, 52.5, 'n', 2.85, 1),
  arrow('POWER', 46, 39.8, 'w', 's', 2), arrow('FORGE', 27.7, 52.5, 'n', 'e', 2, 0), sign('KEEP OUT', 20, 38.9, 'e', 2.2, 2),
  prop('vent', 25.5, 32.5, 's', { y: 2.8 }), prop('pipe_drop', 23.2, 32.5, 's', { y: 3.5 }), prop('pipe_drop', 46, 44.4, 'w', { y: 3.5 }),
];

const comms: PropInst[] = [
  // The operators' corner: two desks and the plotting scope, the wall chart over them.
  prop('console', 25, 53.5, 's'), prop('radar', 26.5, 53.5, 's'), prop('console', 24.5, 55, 'e', { variant: 1 }),
  prop('wall_map', 25.6, 53, 's', { y: 2.05 }), prop('stool', 25.2, 54.7, 'n', { variant: 1 }), prop('chair_tipped', 26.6, 55.4, 'n', { rot: 150 }),
  // Sets along the north wall, another by the Cache.
  ...row('radio_rack', 33.5, 53.25, 3, 1, 0, 's', [0, 1, 2]), prop('radio_rack', 33.5, 62.75, 'n', { variant: 1 }),
  // The plot.
  prop('map_table', 30, 57.75), prop('stool', 28.5, 58.3), prop('stool', 31.6, 57.2), prop('papers', 30.6, 59.6), prop('papers', 28.2, 56.2),
  // Signals office.
  prop('desk', 24.75, 62.5, 'n'), prop('teleprinter', 26, 62.75, 'n'), ...row('locker', 24.25, 60.75, 3, 0, 0.5, 'e', [1]),
  prop('papers', 26.4, 61.6), prop('chair_tipped', 25.6, 60.9, 'n', { variant: 1, rot: 20 }),
  // Wiring: everything in here is joined to everything else.
  prop('cable', 28.4, 54.6, 'n', { s: 3.2, rot: 20 }), prop('cable', 32.6, 55.2, 'n', { s: 3.8, rot: -35 }), prop('cable', 33.8, 59.6, 'n', { s: 4.4, rot: 60 }),
  prop('cable_bundle', 30, 63, 'n', { s: 11.6, y: 2.45 }), prop('cable_bundle', 24, 59.6, 'e', { s: 6.4, y: 2.45 }), prop('cable_bundle', 36, 55.6, 'w', { s: 2.4, y: 2.45 }),
  prop('pipes', 30, 54.9, 'n', { s: 11.6, y: 2.6, variant: 1 }), prop('vent', 27.6, 63, 'n', { y: 2.3 }), prop('pipe_drop', 36, 60.4, 'w'),
  sign('COMMS BUNKER', 31.7, 63, 'n', 2.05, 1), sign('VAULT', 36, 58, 'w', 2.55, 2), sign('YARD', 31.9, 53, 's'), arrow('FORGE', 36, 56, 'w', 's', 1.9, 0),
  sign('LISTEN OUT', 24, 56.5, 'e', 2.3),
];

const vault: PropInst[] = [
  // The Forge fills the far wall, fed from both sides.
  prop('capacitor', 42, 55.5, 'w'), prop('transformer', 42, 56.5, 'w'), prop('forge', 41.75, 58, 'w'),
  prop('transformer', 42, 59.5, 'w', { variant: 1 }), prop('capacitor', 42, 60.5, 'w', { variant: 1 }),
  prop('stripes', 40.7, 58, 'n', { s: 6, rot: 90 }), prop('stripes', 36.85, 58, 'n', { s: 2, rot: 90 }),
  prop('stripes', 39.4, 56.9, 'n', { s: 2.4 }), prop('stripes', 39.4, 59.1, 'n', { s: 2.4 }),
  // Its switchgear, and what was carried in and never unpacked.
  ...row('switchgear', 37, 55.5, 2, 1, 0, 's'), prop('crate_stack', 37, 60.5), prop('barrels', 38, 60.5),
  prop('cable', 39.6, 56.2, 'n', { s: 3.4, rot: 12 }), prop('cable', 39.8, 59.9, 'n', { s: 3.2, rot: -14 }), prop('cable', 38.6, 57.6, 'n', { s: 2.2, rot: 75 }),
  prop('cable_bundle', 40, 55, 's', { s: 3, y: 2.2 }), prop('cable_bundle', 40, 61, 'n', { s: 3, y: 2.2 }), prop('cable_bundle', 36.5, 56.2, 'e', { s: 1.4, y: 2.3 }),
  prop('papers', 38.4, 59.2), prop('vent', 39.5, 61, 'n', { y: 2.2 }),
  sign('DANGER HIGH TENSION', 39.9, 55, 's', 1.75, 2), sign('STAND CLEAR', 39.9, 61, 'n', 1.75, 2), sign('COMMS', 36.5, 59.6, 'e', 2.3),
];

export const southProps: PropInst[] = [...yard, ...comms, ...vault];

export const southLights: LightDef[] = [
  // The yard: floodlights on the fences (mains), the watch fire, a red lamp on the mast, and the
  // emergency lamps over each door.
  lamp(20.4, 46.2, 5.5, LIGHT.flood, 18, { fixture: 'flood', intensity: 5 }), lamp(45.6, 34.6, 5.5, LIGHT.flood, 18, { fixture: 'flood', intensity: 5 }),
  lamp(36.4, 52.1, 5.5, LIGHT.flood, 18, { fixture: 'flood', intensity: 5 }), lamp(23.4, 32.9, 5.5, LIGHT.flood, 17, { fixture: 'flood', intensity: 4.5 }),
  lamp(45.6, 47.6, 5.5, LIGHT.flood, 16, { fixture: 'flood', intensity: 4, flicker: true }),
  glow(27.25, 35.25, 1.15, LIGHT.ember, 8, { flicker: true, intensity: 1.2 }),
  glow(MAST.x, MAST.z - 0.9, 2.6, LIGHT.red, 6, { fixture: 'cage', intensity: 0.9 }),
  glow(30.6, 32.9, 2.5, LIGHT.amber, 6, { fixture: 'cage', intensity: 0.9 }), glow(45.6, 43.6, 2.5, LIGHT.amber, 6, { fixture: 'cage', intensity: 0.9 }),
  glow(28.4, 52.1, 2.5, LIGHT.red, 6, { fixture: 'cage', intensity: 0.9 }), glow(33.25, 40.6, 1.6, LIGHT.sodium, 5, { intensity: 0.5 }),
  // Comms: green tubes, and the scopes that never went dark.
  lamp(27.6, 56.6, 2.7, LIGHT.crt, 8, { fixture: 'tube' }), lamp(32.6, 59.6, 2.7, LIGHT.crt, 8, { fixture: 'tube', flicker: true }),
  lamp(31, 55, 2.7, LIGHT.crt, 6, { fixture: 'tube', intensity: 0.8 }),
  glow(26.5, 53.7, 1.25, LIGHT.crt, 4.5, { intensity: 0.7 }), glow(25.2, 55, 1.3, LIGHT.crt, 3.5, { intensity: 0.4 }), glow(30, 57.75, 1.3, LIGHT.warm, 3.5, { intensity: 0.5 }),
  glow(30, 53.4, 2.4, LIGHT.red, 5, { fixture: 'cage', intensity: 0.8 }), glow(35.6, 59.6, 2.3, LIGHT.red, 4.5, { fixture: 'cage', intensity: 0.7 }),
  // Vault: the arc of the Forge once it has power; until then its pilot glow and a red lamp.
  lamp(39.4, 58, 2.5, LIGHT.arc, 7, { fixture: 'tube', intensity: 1.2 }), lamp(41, 58, 1.3, LIGHT.arc, 5, { fixture: 'none', intensity: 1.2, flicker: true }),
  glow(41, 58, 1.1, LIGHT.arc, 3.5, { intensity: 0.4 }), glow(36.9, 59.4, 2.2, LIGHT.red, 4.5, { fixture: 'cage', intensity: 0.8 }),
];
