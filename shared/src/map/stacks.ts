import type { MapDef, Room } from './types';

// The Stacks — a small proving ground for height, not a map anyone plays: a hall with a ramp up to
// a terrace, a staircase to a loft that lies over half the hall, and a cellar under all of it.
// Tests and the soak run on it (see map.test.ts, server/src/game/stacks.test.ts).
//
//   level 1    loft (over the west of the hall), reached by the west stairs through a door
//   level 0    lobby - hall - ramp - landing - terrace (1 m up)
//   level -1   cellar (under the hall), reached by the south stairs through a door

const HALL = { zone: 'hall', ceil: 2.8, floor: 'concrete', wall: 'block' } as const;
const room = (id: string, x: number, z: number, w: number, d: number, rest: Omit<Room, 'id' | 'x' | 'z' | 'w' | 'd'>): Room => ({ id, x, z, w, d, ...rest });

export const stacks: MapDef = {
  id: 'stacks',
  name: 'The Stacks',
  size: { w: 30, d: 30 },
  hidden: true,
  scene: {
    sky: 'ridge', skyTop: 0x04060a, skyHorizon: 0x1b2c48, haze: 0x0a0e16,
    beyond: 'pines', snow: true, fog: { color: 0x0a0e16, near: 6, far: 42 },
    vista: { x: 13, y: 1.8, z: 13 },
  },
  zones: [
    { id: 'hall', name: 'Hall', letter: 'h', ambient: 0x2a2620 },
    { id: 'loft', name: 'Loft', letter: 'l', ambient: 0x26221c },
    { id: 'cellar', name: 'Cellar', letter: 'c', ambient: 0x181c22 },
  ],
  levels: [
    { level: -1, name: 'Cellar', y: -3 },
    { level: 1, name: 'Loft', y: 3 },
  ],
  rooms: [
    room('hall', 6, 8, 14, 10, HALL),
    // A ramp along the north wall climbs a metre to a landing, which opens onto the terrace.
    room('ramp', 20, 8, 3.5, 2, { ...HALL, ceil: 3.8, rise: { to: 'e', by: 1 } }),
    room('landing', 23.5, 8, 2.5, 4, { ...HALL, y: 1 }),
    room('terrace', 20, 12, 6, 6, { ...HALL, y: 1 }),
    // West stairs: from a lobby off the hall up to the loft's door, walled off from the hall.
    room('lobby', 3, 15.5, 3, 2, HALL),
    room('stairs_up', 3, 10, 2, 5.5, { ...HALL, ceil: 5.6, rise: { to: 'n', by: 3, stairs: true } }),
    room('loft_landing', 3, 7.5, 3, 2, { zone: 'loft', level: 1, ceil: 2.6, floor: 'plank', wall: 'panel' }),
    room('loft', 6, 8, 10, 10, { zone: 'loft', level: 1, ceil: 2.6, floor: 'plank', wall: 'panel' }),
    // South stairs: down from the hall's south door, round a corner and back under the hall.
    room('stairs_down', 10, 18.5, 2, 5.5, { zone: 'cellar', level: -1, ceil: 5.3, floor: 'concrete', wall: 'rock', rise: { to: 'n', by: 3, stairs: true } }),
    room('cellar_lobby', 10, 24, 5, 2, { zone: 'cellar', level: -1, ceil: 2.7, floor: 'concrete', wall: 'rock' }),
    room('cellar_passage', 13, 18, 2, 6, { zone: 'cellar', level: -1, ceil: 2.7, floor: 'concrete', wall: 'rock' }),
    room('cellar', 6, 8, 14, 10, { zone: 'cellar', level: -1, ceil: 2.7, floor: 'concrete', wall: 'rock', mist: true }),
  ],
  openings: [
    { id: 'd_loft', kind: 'door', zones: ['loft', 'hall'], cost: 750, x: 3, z: 9.5, w: 2, d: 0.5, level: 1 },
    { id: 'd_cellar', kind: 'door', zones: ['hall', 'cellar'], cost: 500, x: 10, z: 18, w: 2, d: 0.5 },
    { id: 'w_hall', kind: 'window', zones: ['hall', 'outside'], out: 'n', x: 16, z: 7.5, w: 1.5, d: 0.5 },
    // Over the hall's roof.
    { id: 'w_loft', kind: 'window', zones: ['loft', 'outside'], out: 'e', x: 16, z: 12, w: 0.5, d: 1.5, level: 1 },
    { id: 'w_cellar', kind: 'window', zones: ['cellar', 'outside'], out: 's', x: 16, z: 18, w: 1.5, d: 0.5, level: -1 },
  ],
  props: [
    { type: 'crate', x: 13, z: 13 },
    // The same spot a storey up and a storey down: each blocks only its own floor.
    { type: 'crate_stack', x: 9, z: 12, level: 1 },
    { type: 'crate', x: 17, z: 11, level: -1 },
  ],
  interactables: [
    { id: 'wb_hall', kind: 'wallbuy', ref: 'pike', x: 11, z: 8, facing: 's' },
    { id: 'wb_loft', kind: 'wallbuy', ref: 'farrow', x: 11, z: 18, facing: 'n', level: 1 },
    { id: 'wb_cellar', kind: 'wallbuy', ref: 'stitch', x: 6, z: 13, facing: 'e', level: -1 },
  ],
  playerSpawns: [
    { x: 9, z: 15, yaw: 0 },
    { x: 11, z: 15, yaw: 0 },
    { x: 15, z: 15, yaw: 0 },
    { x: 17, z: 15, yaw: 0 },
  ],
  lights: [
    { x: 13, y: 2.6, z: 13, color: 0xffd9a0, radius: 9, intensity: 1 },
    { x: 23, y: 2.6, z: 15, color: 0xffd9a0, radius: 6, intensity: 0.9 },
    { x: 4, y: 5, z: 12.5, color: 0xffd9a0, radius: 6, intensity: 0.8 },
    { x: 11, y: 2.4, z: 13, color: 0xffe2b8, radius: 8, intensity: 1, level: 1 },
    { x: 13, y: 2.4, z: 13, color: 0x9fb8d8, radius: 9, intensity: 0.8, level: -1 },
    { x: 11, y: 4.5, z: 21, color: 0x9fb8d8, radius: 5, intensity: 0.7, level: -1 },
  ],
};
