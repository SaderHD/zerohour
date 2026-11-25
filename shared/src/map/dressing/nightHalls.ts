import type { LightDef, PropInst } from '../types';
import { BULB } from './nightStreets';
import { LIGHT, glow, lamp, onLevel, prop, row, strung } from './helpers';

// The Longest Night, M6: Abelard's, the Lyric and St Audra's dressed (PLAN 4.12). Two more kits:
// the store's (shelves of toys, counters, dummies, the grotto, the model railway) and the halls'
// (seats, the screen and the projector, the booth; pews, the altar, the organ, coloured glass).
// Solid props on the 0.5 m grid, right against a wall or at least 1.5 m off it. Run
// `npm run map -- longest_night` after any edit.

const up = (things: PropInst[]): PropInst[] => onLevel(1, things);

// --- Abelard's, ground floor: toys along the north side, the atrium in the middle with the
// railway under its decorations, the grotto in the south-east corner.
/** A gondola: shelves back to back, `n` lengths of two metres from x0, about z. */
const gondola = (x0: number, z: number, n: number): PropInst[] => [
  ...row('toy_shelf', x0 + 1, z - 0.25, n, 2, 0, 'n', [0, 1, 0]), ...row('toy_shelf', x0 + 1, z + 0.25, n, 2, 0, 's', [0, 0, 1]),
];
const abelard: PropInst[] = [
  // In at the door from the square: the carousel, dummies each side, the atrium beyond.
  prop('toy_carousel', 100, 73.5, 'w'),
  prop('mannequins', 97, 70.5, 'e'), prop('mannequins', 97, 76.5, 'e', { variant: 1 }), prop('mannequins', 97, 82.5, 'e', { variant: 2 }),
  prop('tinsel_tree', 97, 85.5), prop('garland', 96.5, 73.5, 'e', { s: 5, y: 3 }),
  // Toys: shelves along the north wall between its windows, gondolas and tables down the floor.
  ...row('toy_shelf', 99, 62.25, 3, 2, 0, 's'), ...row('toy_shelf', 110, 62.25, 4, 2, 0, 's', [0, 0, 1, 0]), ...row('toy_shelf', 122, 62.25, 2, 2, 0, 's'),
  ...gondola(99, 65.5, 2), ...gondola(111, 65.5, 2),
  prop('display_table', 107, 65.5), prop('display_table', 121.5, 65.5, 'n', { variant: 2 }),
  ...[71, 76].flatMap((z, i) => [prop('toy_shelf', 120.25, z, 'w', { variant: i }), prop('toy_shelf', 123.25, z, 'e', { variant: 1 - i })]),
  // Counters along the flank of each escalator.
  prop('shop_counter', 106, 71, 'w'), prop('shop_counter', 106, 73, 'w'), prop('shop_counter', 117, 75, 'e'), prop('shop_counter', 117, 77, 'e'),
  prop('escalator', 107.5, 72.5, 'n', { s: 7, y2: 4 }), prop('escalator', 115.5, 75.5, 's', { s: 7, y2: 4 }),
  // The atrium: the railway, and what hangs over it from the upper floor's ceiling.
  prop('model_railway', 111.5, 74),
  prop('hanging_decor', 109.5, 70.5, 'n', { y: 5.3 }), prop('hanging_decor', 113.5, 70.5, 'n', { variant: 1, y: 5.8 }),
  prop('hanging_decor', 109.5, 77.5, 'n', { variant: 2, y: 5.8 }), prop('hanging_decor', 113.5, 77.5, 'n', { variant: 1, y: 5.3 }),
  prop('hanging_decor', 111.5, 72, 'n', { variant: 3, y: 6.3 }),
  strung('light_string', 108.5, 69.1, 5, 114.5, 78.9, 5, 1), strung('light_string', 114.5, 69.1, 5, 108.5, 78.9, 5, 1),
  prop('garland', 111.5, 69, 's', { s: 6, y: 3.9 }), prop('garland', 111.5, 79, 'n', { s: 6, y: 3.9 }),
  // Gifts along the south side.
  prop('display_table', 104, 82.5), prop('display_table', 109, 82.5, 'n', { variant: 1 }), prop('display_table', 114, 82.5, 'n', { variant: 2 }),
  // The grotto: the cabin, the chair in front of it, firs, and ropes for a queue that is not there.
  prop('grotto_hut', 126, 82.5, 'w'), prop('throne', 125, 82.5, 'w'), prop('fir', 126.25, 80.75), prop('fir', 126.25, 84.25, 'n', { variant: 2 }),
  ...row('rope_barrier', 119.5, 80.75, 2, 2, 0), ...row('rope_barrier', 119.5, 84.25, 2, 2, 0),
  prop('presents', 124, 81.3, 'n', { variant: 2 }), prop('presents', 124.1, 83.8, 'n', { variant: 1 }), prop('presents', 123.2, 82.4),
  // The loading bay.
  prop('crate_stack', 112.5, 87.5), prop('crate', 112.5, 88.5), prop('crate', 119.5, 88.5), prop('presents', 118.6, 89.6, 'n', { variant: 2 }), prop('papers', 115.5, 88),
  prop('papers', 102, 68), prop('papers', 118.5, 79.6, 'n', { rot: 50 }),
];

// --- Abelard's, upstairs: coats round the gallery, the gift-wrap counter on the south side.
const upper: PropInst[] = up([
  ...[101, 105, 111, 115, 120].map((x) => prop('clothes_rack', x, 65.25)),
  prop('mannequins', 104, 62.5, 's'), prop('mannequins', 116, 62.5, 's', { variant: 1 }),
  ...[100.25, 103.25].flatMap((x) => [prop('clothes_rack', x, 72, 'e'), prop('clothes_rack', x, 76, 'e')]),
  prop('clothes_rack', 120.25, 75, 'e'), prop('clothes_rack', 123.25, 75, 'e'), prop('tinsel_tree', 126, 79, 'n', { variant: 1 }),
  prop('wrap_counter', 111, 85.5), prop('presents', 108.8, 85.3, 'n', { variant: 2 }), prop('presents', 113.3, 85.4, 'n', { variant: 1 }),
  prop('display_table', 104, 82.5, 'n', { variant: 1 }), prop('display_table', 120, 82.5, 'n', { variant: 2 }),
  prop('garland', 110, 62, 's', { s: 10, y: 2.9 }), prop('garland', 104, 86, 'n', { s: 8, y: 2.9 }),
  prop('papers', 110.5, 83.6), prop('papers', 99, 69.5, 'n', { rot: 30 }),
]);

// --- The Lyric. Seats in blocks of five metres each side of the middle aisle, every row facing the screen.
const SEAT_Z = [49.25, 51.75, 56.25, 58.75];
const seats = (x: number, zs = SEAT_Z): PropInst[] => zs.map((z) => prop('cinema_seats', x, z, 'w'));
const lyric: PropInst[] = [
  // The lobby: the booth and the popcorn by the door, posters, a tree in the corner.
  prop('ticket_booth', 50.75, 63.25), prop('popcorn_stand', 49, 63.5), prop('rope_barrier', 48.5, 60.75),
  prop('tinsel_tree', 40, 63.5, 'n', { variant: 2 }),
  prop('poster_case', 42, 64, 'n'), prop('poster_case', 51.5, 56.75, 'w', { variant: 1 }), prop('poster_case', 51.5, 61.25, 'w', { variant: 2 }),
  prop('poster_case', 39.5, 58.5, 'e', { variant: 3 }), prop('garland', 44.75, 64, 'n', { s: 4, y: 3 }),
  prop('papers', 46, 59.5), prop('papers', 41.5, 57.5, 'n', { rot: 40 }),
  // Its front on the square.
  prop('marquee', 52, 59, 'e', { s: 7, y: 3.3, text: 'THE LYRIC' }), prop('poster_case', 52, 55.5, 'e', { variant: 2 }), prop('poster_case', 52, 62.5, 'e'),
  // The auditorium: the screen over the west wall's window, four rows in the open, two under the balcony.
  prop('cinema_screen', 21, 54, 'e', { s: 11, y: 2.5 }),
  ...[26.25, 28.25, 30.25, 32.25, 34.25, 36.25].flatMap((x) => seats(x)),
  prop('papers', 33, 54), prop('papers', 27.4, 47), prop('papers', 23.5, 58, 'n', { rot: 70 }),
  // The balcony: a row behind the walk along the rail, a row against the back wall, the projector between its halves.
  ...up([...seats(35.75), ...seats(38.75, [49.25, 51.75, 58.25, 60.75]), prop('projector', 38.5, 53.5, 'w')]),
];

// --- St Audra's: the door in the south wall, the altar under the rose at the north end.
const chapel: PropInst[] = [
  ...[15.25, 17.25, 19.25, 21.25, 23.25, 25.25].flatMap((z) => [43, 45, 49, 51].map((x) => prop('pew', x, z))),
  prop('altar', 47, 10, 's'), prop('nativity', 41, 10, 's'), prop('organ', 52.5, 10, 's'),
  prop('candle_stand', 40.25, 13.25, 'e'), prop('candle_stand', 53.75, 13.25, 'w'), prop('candle_stand', 44.25, 29.25, 's'), prop('candle_stand', 49.75, 29.25, 's'),
  prop('stained_glass', 47, 9.5, 's', { variant: 1, y: 3.5 }),
  ...[12.5, 20.5, 24.5].map((z) => prop('stained_glass', 40, z, 'e', { y: 2 })), ...[12.5, 16.5, 24.5].map((z) => prop('stained_glass', 54, z, 'w', { y: 2 })),
  prop('papers', 47, 20), prop('papers', 41, 26.5, 'n', { rot: 25 }),
  // Its front on the avenue.
  prop('porch', 47, 30, 's'), prop('stained_glass', 42.5, 30, 's', { y: 1.3 }), prop('stained_glass', 52, 30, 's', { y: 1.3 }),
  prop('stained_glass', 47, 30, 's', { variant: 1, y: 5.9 }),
];

export const hallProps: PropInst[] = [...abelard, ...upper, ...lyric, ...chapel];

const WHITE = 0xf4f0e8;
export const hallLights: LightDef[] = [
  // Abelard's: the railway's lamps (on the mains), the carousel, the grotto's windows, the strings over the atrium, the trees.
  lamp(111.5, 72.4, 1.4, LIGHT.warm, 4.5, { fixture: 'none' }),
  glow(100.9, 73.5, 1.5, BULB.gold, 4.5, { intensity: 0.6 }),
  glow(124, 82.5, 1.5, LIGHT.dimWarm, 6, { intensity: 0.9 }), glow(120.5, 82.5, 2.2, BULB.red, 5, { intensity: 0.4 }),
  glow(110, 71.5, 4.4, BULB.gold, 7, { intensity: 0.5 }), glow(113, 76.5, 4.4, BULB.red, 7, { intensity: 0.4 }),
  glow(97.8, 85, 1.2, BULB.green, 3.5, { intensity: 0.5 }), glow(125.2, 78.4, 1.2, BULB.red, 3.5, { intensity: 0.5, level: 1 }),
  // The Lyric: under the marquee, the popcorn's lamp, the booth; the screen, and the projector's lens.
  glow(53.6, 59, 3, BULB.warm, 9), glow(49, 62.4, 1.8, BULB.gold, 5, { intensity: 0.8 }), glow(40.8, 62.6, 1.2, BULB.blue, 3.5, { intensity: 0.5 }),
  glow(23.5, 54, 4.4, WHITE, 17, { flicker: true, silent: true }), glow(37.6, 53.5, 1.3, WHITE, 4, { intensity: 0.6, level: 1 }),
  // St Audra's: the altar's candles, the four stands, the lantern in the porch.
  glow(47, 11, 1.5, LIGHT.flame, 7.5, { flicker: true }),
  ...[[40.8, 13.25], [53.2, 13.25], [44.25, 28.6], [49.75, 28.6]].map(([x, z]) => glow(x!, z!, 1.3, LIGHT.flame, 4.5, { flicker: true, intensity: 0.8 })),
  glow(47, 30.7, 2.6, BULB.warm, 6, { intensity: 0.8 }),
];
