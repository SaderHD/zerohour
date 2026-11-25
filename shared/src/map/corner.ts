import { rail } from './dressing/helpers';
import type { BlockDef, MapDef, Opening, Room, WallStyle } from './types';

// The Corner - one block of a city, a proving ground for what a city looks like from outside
// (PLAN section 9, M2), not a map anyone plays: a street between buildings of six heights, a shop
// to go into, a flat over it, its roof to walk on, an underpass, and towers all round.
//
//   level 2    the shop's roof (+8 m): looks down on the street, over the low building next door,
//              and into the two light wells behind (the pockets of the windows below)
//   level 1    the flat over the shop (+4 m)
//   level 0    the street (a road between two pavements, a kerb up), the shop
//   level -1   the underpass (-4 m), down a flight from the south pavement
//
// A street's wall is a building: each stretch of pavement edge is a half-metre strip room that
// gives the ground storey its face (a shop front, brick), and the block behind it carries on up.

const KERB = 0.15;
/** How far up the street's own walls are drawn; the blocks carry on from here. */
const GROUND = 4;
const SOOT = 0xc8beb4;
const RED = 0xe0b0a0;
const PALE = 0xd8d0c0;
const SHOP = 0xb8c4c0;
const CAFE = 0xd0b890;

type Rest = Omit<Room, 'id' | 'x' | 'z' | 'w' | 'd'>;
const room = (id: string, x: number, z: number, w: number, d: number, rest: Rest): Room => ({ id, x, z, w, d, ...rest });

const ROAD = { zone: 'street', outdoor: true, ceil: GROUND, floor: 'asphalt', wall: 'brick' } as const;
const PAVE = { ...ROAD, floor: 'pavement', y: KERB, ceil: GROUND - KERB } as const;
/** A strip of pavement along a building: it gives that stretch of wall the building's face. */
const strip = (id: string, x: number, z: number, w: number, d: number, wall: WallStyle, tint: number): Room => room(id, x, z, w, d, { ...PAVE, wall, tint });

const INSIDE = { zone: 'shop', ceil: 3.5, floor: 'plank', wall: 'plaster', tint: 0xd8c8a8 } as const;
const UP = { ...INSIDE, level: 1 } as const;
const ROOF = { zone: 'roof', level: 2, outdoor: true, ceil: 2.5, floor: 'felt', wall: 'brick', tint: RED } as const;
const UNDER = { zone: 'under', level: -1, ceil: 3, floor: 'tile', wall: 'subway' } as const;

const door = (id: string, a: string, b: string, cost: number, x: number, z: number, w: number, d: number, level?: number): Opening => ({
  id, kind: 'door', zones: [a, b], cost, x, z, w, d, ...(level === undefined ? {} : { level }),
});

const block = (x: number, z: number, w: number, d: number, h: number, face: WallStyle, tint: number, rest: Partial<BlockDef> = {}): BlockDef => ({ x, z, w, d, h, face, tint, ...rest });

export const corner: MapDef = {
  id: 'corner',
  name: 'The Corner',
  size: { w: 48, d: 40 },
  hidden: true,
  scene: {
    sky: 'city', skyTop: 0x1c130d, skyHorizon: 0x553218, haze: 0x1a1410,
    built: 'city', beyond: 'towers', outside: 0x241c18, snow: true,
    pocket: { floor: 'asphalt', wall: 'brick' },
    fog: { color: 0x1c1512, near: 8, far: 85 },
    vista: { x: 24, y: 2.2, z: 21 },
  },
  zones: [
    { id: 'street', air: 'yard', name: 'The Street', letter: 's', ambient: 0x241d1a },
    { id: 'shop', air: 'mess', name: 'The Shop', letter: 'h', ambient: 0x241e18 },
    { id: 'roof', air: 'yard', name: 'The Roof', letter: 'r', ambient: 0x201a1a },
    { id: 'under', air: 'vault', name: 'The Underpass', letter: 'u', ambient: 0x161a1c },
  ],
  levels: [
    { level: -1, name: 'Underpass', y: -4 },
    { level: 1, name: 'Upstairs', y: 4 },
    { level: 2, name: 'Roofs', y: 8 },
  ],
  // The buildings. Later ones have the ground where they overlap.
  blocks: [
    block(0, 0, 8.5, 16.5, 20, 'brick', SOOT),
    block(8.5, 0, 16, 4.5, 26, 'brick', PALE),
    block(24.5, 0, 23.5, 6.5, 18, 'brick', SOOT),
    // The shop: its roof is walked on, so it has rails and no parapet.
    block(8.5, 4.5, 16, 11.5, 8, 'brick', RED, { parapet: 0 }),
    block(24.5, 6.5, 19.5, 9.5, 5.5, 'brick', PALE, { roof: 'vents' }),
    block(0, 25.5, 20, 14.5, 16, 'brick', RED),
    block(20, 25.5, 14, 14.5, 10, 'brick', SOOT, { roof: 'tank' }),
    block(34, 25.5, 14, 14.5, 30, 'brick', PALE),
    // Across the east end of the street.
    block(44, 6.5, 4, 23.5, 22, 'brick', RED),
    // The west end is boarded off: over the boards, the towers.
    block(0, 16.5, 4, 9, 3.5, 'fence', 0xffffff, { parapet: 0, lit: false }),
  ],
  rooms: [
    room('road', 4.5, 18.5, 39, 5, ROAD),
    room('pave_n', 4.5, 16.5, 39, 2, PAVE),
    room('pave_s', 4.5, 23.5, 39, 2, PAVE),
    // The street's two ends.
    room('end_w_n', 4, 16.5, 0.5, 2, { ...PAVE, wall: 'fence' }),
    room('end_w', 4, 18.5, 0.5, 5, { ...ROAD, wall: 'fence' }),
    room('end_w_s', 4, 23.5, 0.5, 2, { ...PAVE, wall: 'fence' }),
    room('end_e_n', 43.5, 16.5, 0.5, 2, { ...PAVE, tint: RED }),
    room('end_e', 43.5, 18.5, 0.5, 5, { ...ROAD, tint: RED }),
    room('end_e_s', 43.5, 23.5, 0.5, 2, { ...PAVE, tint: RED }),
    // What each building shows the pavement.
    strip('front_w1', 4, 16, 4.5, 0.5, 'brick', SOOT),
    strip('front_shop', 8.5, 16, 16, 0.5, 'shopfront', SHOP),
    strip('front_e1', 24.5, 16, 19.5, 0.5, 'shopfront', CAFE),
    strip('front_s1', 4, 25.5, 16, 0.5, 'brick', RED),
    strip('front_s2', 20, 25.5, 14, 0.5, 'shopfront', CAFE),
    strip('front_s3', 34, 25.5, 10, 0.5, 'brick', PALE),

    // The shop, and the stairs up its west wall.
    room('shop', 11.5, 5, 12.5, 10.5, INSIDE),
    room('shop_lobby', 9, 14, 2.5, 1.5, INSIDE),
    room('stairs_1', 9, 7, 2, 7, { ...INSIDE, ceil: 7.5, rise: { to: 'n', by: 4, stairs: true } }),
    // The flat over it, and the stairs up its east wall to the roof.
    room('flat_landing', 9, 5, 2.5, 1.5, UP),
    room('flat', 11.5, 5, 10, 10.5, UP),
    room('flat_lobby', 21.5, 14, 2.5, 1.5, UP),
    room('stairs_2', 22, 7, 2, 7, { ...UP, ceil: 7.5, rise: { to: 'n', by: 4, stairs: true } }),
    // The roof: all of the building but the head of those stairs, which stands on it as a hut.
    room('roof', 8.5, 4.5, 13, 11.5, ROOF),
    room('roof_n', 21.5, 4.5, 3, 2, ROOF),
    room('roof_s', 21.5, 14.5, 3, 1.5, ROOF),

    // The underpass: a flight down from the south pavement (it climbs to the kerb, not the road).
    room('under_stairs', 10, 26.5, 2, 7, { ...UNDER, ceil: 6.5, rise: { to: 'n', by: 4 + KERB, stairs: true } }),
    room('under', 6, 33.5, 20, 4, UNDER),
  ],
  openings: [
    door('d_shop', 'street', 'shop', 500, 16, 15.5, 2, 0.5),
    { id: 'a_flat', kind: 'arch', zones: ['shop', 'shop'], x: 9, z: 6.5, w: 2, d: 0.5, level: 1 },
    door('d_roof', 'roof', 'shop', 750, 22, 6.5, 2, 0.5, 2),
    door('d_under', 'street', 'under', 750, 10, 26, 2, 0.5),
    // The street's barricade, in the boards across its west end.
    { id: 'w_street', kind: 'window', zones: ['street', 'outside'], out: 'w', x: 3.5, z: 20, w: 0.5, d: 1.5 },
    // Two windows at the back, one over the other's shoulder: their pockets are light wells in the building behind.
    { id: 'w_shop', kind: 'window', zones: ['shop', 'outside'], out: 'n', x: 19, z: 4.5, w: 1.5, d: 0.5 },
    { id: 'w_flat', kind: 'window', zones: ['shop', 'outside'], out: 'n', x: 15, z: 4.5, w: 1.5, d: 0.5, level: 1 },
  ],
  props: [
    { type: 'crate', x: 30, z: 21 },
    { type: 'crate_stack', x: 14, z: 7 },
    // The roof's edges: over the street, over the low building next door, over the two wells.
    rail(8.5, 15.75, 24.5, 15.75, { level: 2 }),
    rail(24.25, 14.5, 24.25, 16, { level: 2 }),
    rail(14.5, 4.75, 17, 4.75, { level: 2 }),
    rail(18.5, 4.75, 21, 4.75, { level: 2 }),
  ],
  interactables: [
    { id: 'wb_street', kind: 'wallbuy', ref: 'pike', x: 30, z: 16, facing: 's' },
    { id: 'wb_flat', kind: 'wallbuy', ref: 'farrow', x: 16, z: 15.5, facing: 'n', level: 1 },
    { id: 'wb_under', kind: 'wallbuy', ref: 'stitch', x: 16, z: 33.5, facing: 's', level: -1 },
  ],
  playerSpawns: [
    { x: 20, z: 21, yaw: 0 },
    { x: 22, z: 21, yaw: 0 },
    { x: 24, z: 21, yaw: 0 },
    { x: 26, z: 21, yaw: 0 },
  ],
  lights: [
    // Street lamps.
    { x: 11, y: 4.6, z: 17.2, color: 0xffb060, radius: 13, intensity: 1.2, fixture: 'flood' },
    { x: 25, y: 4.6, z: 24.8, color: 0xffb060, radius: 13, intensity: 1.2, fixture: 'flood' },
    { x: 38, y: 4.6, z: 17.2, color: 0xffb060, radius: 13, intensity: 1.2, fixture: 'flood' },
    { x: 17, y: 3.1, z: 10, color: 0xffd9a0, radius: 9, intensity: 1 },
    { x: 10, y: 6.6, z: 10.5, color: 0xffd9a0, radius: 7, intensity: 0.8, fixture: 'cage' },
    { x: 16.5, y: 3.1, z: 10, color: 0xffe2b8, radius: 9, intensity: 1, level: 1 },
    { x: 23, y: 6.6, z: 10.5, color: 0xffd9a0, radius: 7, intensity: 0.8, level: 1, fixture: 'cage' },
    { x: 15, y: 2.2, z: 10, color: 0xa8c8ff, radius: 9, intensity: 0.7, level: 2, fixture: 'flood' },
    { x: 11, y: 2.9, z: 35.5, color: 0xc0ffe8, radius: 8, intensity: 0.9, level: -1, fixture: 'tube', flicker: true, needsPower: true },
    { x: 21, y: 2.9, z: 35.5, color: 0xc0ffe8, radius: 8, intensity: 0.9, level: -1, fixture: 'tube' },
    { x: 11, y: 5.6, z: 30, color: 0xc0ffe8, radius: 6, intensity: 0.7, level: -1, fixture: 'cage' },
  ],
};
