import type { LightDef, PropInst } from '../types';
import { LIGHT, glow, lamp, prop, row, strung } from './helpers';

// The Longest Night, M5: Wexler Square, Dray Avenue and Tallow Lane dressed (PLAN 4.12). Two kits:
// the street's (cars, the bus, trestles, kiosks, steam) and Christmas's (the tree, strings of bulbs,
// wreaths, garlands, presents, the market). Nothing festive is damaged: it is all still on.
// Solid props on the 0.5 m grid, right against a wall or at least 1.5 m off it. Run
// `npm run map -- longest_night` after any edit.

/** Where the tree stands: the middle of the square, and of the rink. */
export const TREE = { x: 74, z: 68 };
/** How high the strings of bulbs are made off to it. */
const TREE_TIE = 10;
/** The top of a street lamp, where a string can be tied. */
const POST_TOP = 4.75;
/** The square's lamp posts: the strings from the tree come down to them. */
export const SQUARE_POSTS = [[61, 57], [74, 57], [87, 57], [61, 79], [74, 79], [87, 79]] as const;

export const BULB = { red: 0xff6050, green: 0x60ff90, blue: 0x6090ff, gold: 0xffd060, warm: 0xffd9a0 } as const;
const ACCENTS = [BULB.red, BULB.gold, BULB.green, BULB.blue];

/** Snow blown against a wall: `face` is the way the wall looks. */
const drifts = (face: 'n' | 's' | 'e' | 'w', at: number, along: number[]): PropInst[] =>
  along.map((a, i) => (face === 'n' || face === 's' ? prop('snow_drift', a, at, face, { variant: i % 2 }) : prop('snow_drift', at, a, face, { variant: i % 2 })));

// --- Wexler Square: the tree in its tub, the rink round it, the market round that.
const RINK = { x0: 66, x1: 82, z0: 62, z1: 74 };
const rink: PropInst[] = [
  prop('rink_ice', TREE.x, TREE.z),
  // Boards all round, a gate in the middle of each side.
  ...[RINK.z0 + 0.25, RINK.z1 - 0.25].flatMap((z) => [...row('rink_board', 67, z, 3, 2, 0), ...row('rink_board', 77, z, 3, 2, 0)]),
  ...[RINK.x0 + 0.25, RINK.x1 - 0.25].flatMap((x) => [...row('rink_board', x, 63.5, 2, 0, 2, 'e'), ...row('rink_board', x, 70.5, 2, 0, 2, 'e')]),
];

const square: PropInst[] = [
  prop('xmas_tree', TREE.x, TREE.z),
  prop('presents', 74, 65.9), prop('presents', 71.9, 67.4, 'n', { variant: 1 }), prop('presents', 76.1, 68.7, 'n', { variant: 2 }),
  prop('presents', 73.3, 70.1, 'n', { variant: 1 }), prop('presents', 75.4, 70, 'n', { variant: 2 }), prop('presents', 72.4, 66.2),
  ...rink,
  // Strings of bulbs from the tree down to every lamp post, and across to the Lyric and to Abelard's.
  ...SQUARE_POSTS.map(([x, z]) => strung('light_string', TREE.x, TREE.z, TREE_TIE, x, z, POST_TOP, 1)),
  strung('light_string', TREE.x, TREE.z, TREE_TIE, 52.1, 67, 6.5), strung('light_string', TREE.x, TREE.z, TREE_TIE, 95.9, 69, 6.5),
  // The bandstand, on the Lyric's side.
  prop('bandstand', 58, 64),
  // The market. Along the north side, backs to the avenue; down the east side; along the south.
  prop('market_stall', 63.5, 53.75, 's'), prop('market_stall', 68, 53.75, 's', { variant: 1 }),
  prop('market_stall', 79.5, 53.75, 's', { variant: 5 }), prop('market_stall', 84, 53.75, 's', { variant: 2 }),
  prop('market_stall', 88.75, 62, 'w', { variant: 1 }), prop('market_stall', 88.75, 66.5, 'w', { variant: 3 }), prop('market_stall', 88.75, 79, 'w'),
  prop('market_stall', 65.5, 81.25, 'n', { variant: 4 }), prop('market_stall', 70, 81.25, 'n', { variant: 2 }), prop('market_stall', 78.5, 81.25, 'n', { variant: 1 }),
  // Trees nobody came back for, at the end of a stall.
  prop('fir', 85.75, 53.25), prop('fir', 85.75, 53.75, 'n', { variant: 1 }), prop('fir', 85.75, 54.25, 'n', { variant: 2 }),
  prop('presents', 66, 55.4, 'n', { variant: 2 }), prop('presents', 81, 55.6), prop('presents', 87.4, 64.4, 'n', { variant: 1 }),
  prop('presents', 72.4, 80.1), prop('presents', 80.9, 80.2, 'n', { variant: 2 }), prop('papers', 76.5, 55.5), prop('papers', 86, 70.5, 'n', { rot: 40 }),
  // Benches facing the ice, and what somebody built beside it.
  prop('park_bench', 63.75, 66, 'e'), prop('park_bench', 63.75, 71, 'e'), prop('park_bench', 84.25, 64, 'w'), prop('park_bench', 84.25, 72, 'w'),
  prop('park_bench', 70, 60.25, 's'), prop('park_bench', 78, 60.25, 's'), prop('park_bench', 70, 75.75), prop('park_bench', 78, 75.75),
  prop('snowman', 64.25, 60.25, 's'), prop('bin', 86.25, 57.25), prop('bin', 61.75, 78.75),
  // The police line that was to keep the avenue out of the square.
  prop('sawhorse', 71, 51.75, 's'), prop('sawhorse', 77, 51.75, 's'), prop('planks', 74.4, 52.6, 'n', { rot: 25 }),
  // Abelard's front, and the two doors that were dressed for the season.
  prop('garland', 96, 65.75, 'w', { s: 12.5, y: 3.4 }), prop('garland', 96, 80.25, 'w', { s: 10.5, y: 3.4 }),
  prop('wreath', 96, 71.4, 'w', { y: 2.3 }), prop('wreath', 96, 75.6, 'w', { y: 2.3 }),
  prop('wreath', 52, 57.4, 'e', { y: 2.3 }), prop('wreath', 52, 60.6, 'e', { y: 2.3 }),
  // Wire on the boards across each side street.
  prop('wire_top', 59, 50, 's', { s: 4, y: 3.5 }), prop('wire_top', 61, 86, 'n', { s: 4, y: 3.5 }),
  prop('wire_top', 52, 75, 'e', { s: 4, y: 3.5 }), prop('wire_top', 96, 57, 'w', { s: 4, y: 3.5 }),
  ...drifts('s', 50.6, [55, 66, 80, 91]), ...drifts('n', 85.4, [58, 71, 76, 90]),
  ...drifts('e', 52.6, [54, 64, 70, 82]), ...drifts('w', 95.4, [61, 68, 78, 83]),
  // The cut and the passage.
  prop('sawhorse', 73, 43.25, 's'), prop('papers', 74.5, 47.5), prop('rubble', 75, 44.6), prop('planks', 73.2, 48.6, 'n', { rot: 70 }),
  prop('papers', 83.4, 87.2), prop('planks', 83.6, 90.3, 'n', { rot: 100 }),
];

// --- Dray Avenue: the traffic that never got out, and the bus that stopped it.
const avenue: PropInst[] = [
  // Westbound, nose to tail; eastbound beside it.
  prop('car', 32.25, 34, 'w'), prop('car', 42.25, 34, 'w', { variant: 3 }), prop('car', 52.75, 34, 'w', { variant: 5 }), prop('car', 64.25, 34, 'w', { variant: 12 }),
  prop('car', 37.25, 38, 'e', { variant: 2 }), prop('car', 47.75, 38, 'e', { variant: 6 }), prop('car', 59.25, 38, 'e', { variant: 1 }),
  // The police line at the cut, the patrol car across the road behind it.
  prop('sawhorse', 79.25, 33.5, 'e'), prop('sawhorse', 79.25, 37.5, 'e'), prop('car', 82.5, 35.25, 'n', { variant: 7 }),
  // The bus: over the south kerb and into the wall. The way past is the north pavement.
  prop('bus', 89.25, 37.5, 's'),
  prop('car', 98.25, 34, 'w', { variant: 4 }), prop('car', 103.75, 38, 'e', { variant: 11 }), prop('car', 111.75, 33, 'w'),
  // Barriers inside the boards at each end.
  prop('jersey', 24.25, 33.5, 'e'), prop('jersey', 24.25, 38.5, 'e'), prop('jersey', 116.75, 33.5, 'e'), prop('jersey', 116.75, 38.5, 'e'),
  // The pavements.
  prop('kiosk', 69, 41.25, 'n'), prop('phone_booth', 56.5, 30.5, 's'), prop('mailbox', 50.25, 30.25, 's'),
  prop('hydrant', 36.25, 32.25), prop('hydrant', 84.75, 39.75), prop('bin', 70.25, 41.75), prop('bin', 100.25, 30.25),
  prop('papers', 67.5, 39.2), prop('papers', 71.2, 40.6, 'n', { rot: 30 }), prop('papers', 58.2, 31.6),
  // The road: steam off the mains, and the ruts of whoever drove through last.
  prop('steam_grate', 45, 36), prop('steam_grate', 86, 35.5), prop('steam_grate', 108, 36),
  prop('manhole', 30, 36), prop('manhole', 70, 36, 'n', { variant: 1 }), prop('manhole', 96, 36.2),
  prop('tracks', 72, 36, 'n', { s: 9, rot: 88 }), prop('tracks', 26.5, 36, 'n', { s: 5, rot: 92 }), prop('tracks', 112, 36.4, 'n', { s: 7, rot: 86 }),
  // Strung across from one side to the other.
  ...[26, 38, 50, 62, 74, 86, 98, 110].map((x, i) => strung('light_string', x, 30.1, 6, x, 41.9, 6, i % 2)),
  prop('wreath', 107.3, 30, 's', { y: 2.3 }), prop('wreath', 110.7, 30, 's', { y: 2.3 }), prop('wreath', 23.4, 42, 'n', { y: 2.3 }), prop('wreath', 26.6, 42, 'n', { y: 2.3 }),
  prop('wire_top', 20, 36, 'e', { s: 12, y: 3.5 }), prop('wire_top', 120, 36, 'w', { s: 12, y: 3.5 }),
  prop('wire_top', 77, 30, 's', { s: 4, y: 3.5 }), prop('wire_top', 115, 42, 'n', { s: 4, y: 3.5 }),
  ...drifts('s', 30.6, [27, 43, 61, 70, 84, 103, 116]), ...drifts('n', 41.4, [31, 40, 55, 64, 80, 94, 106, 118]),
];

// --- Tallow Lane: the backs of everything.
const lane: PropInst[] = [
  // The van that was unloading at Abelard's, its doors open.
  prop('van', 101.5, 93, 'e', { variant: 1 }), prop('presents', 98.1, 93.2, 'n', { variant: 1 }), prop('presents', 97.6, 94.3),
  prop('tracks', 108, 93.2, 'n', { s: 7, rot: 90 }),
  prop('dumpster', 87, 97.5), prop('dumpster', 119, 92.5, 's', { variant: 1 }),
  prop('bin', 70.25, 97.75), prop('bin', 70.75, 97.75), prop('bin', 94.25, 92.25, 's'), prop('bin', 94.75, 92.25, 's'),
  prop('crate_stack', 73.5, 92.5), prop('crate', 74.5, 92.5), prop('crate_small', 75.25, 92.25),
  prop('crate', 111.5, 92.5), prop('crate_stack', 112.5, 92.5), prop('barrels', 106, 97.5),
  // Somebody kept a fire going by the hatch.
  prop('brazier', 76.25, 97.75), prop('stool', 75.4, 96.9), prop('stool', 77.2, 96.8, 'n', { variant: 1 }),
  prop('jersey', 117.25, 97, 'e'),
  prop('rubble', 81, 96.6), prop('planks', 92.6, 95.2, 'n', { rot: 15 }), prop('papers', 89, 94), prop('papers', 105.5, 95.6, 'n', { rot: 60 }),
  // Washing nobody took in, and the one string of bulbs the lane ran to.
  strung('washing_line', 72, 92.05, 5.5, 72, 97.95, 6.2), strung('washing_line', 86, 92.05, 6.8, 86, 97.95, 6),
  strung('washing_line', 95, 92.05, 5.6, 95, 97.95, 5.2, 1), strung('washing_line', 104, 92.05, 6.5, 104, 97.95, 7), strung('washing_line', 112, 92.05, 5.4, 112, 97.95, 6, 1),
  strung('light_string', 79, 92.05, 4.6, 83.5, 97.95, 4.3, 1), strung('light_string', 83.5, 97.95, 4.3, 89, 92.05, 4.6, 1),
  prop('wire_top', 91, 98, 'n', { s: 4, y: 3.5 }), prop('wire_top', 109, 98, 'n', { s: 4, y: 3.5 }), prop('wire_top', 122, 95, 'w', { s: 6, y: 3.5 }),
  ...drifts('s', 92.6, [62, 90, 107]), ...drifts('n', 97.4, [79, 83, 100, 114]),
];

export const streetProps: PropInst[] = [...square, ...avenue, ...lane];

export const streetLights: LightDef[] = [
  // The tree lights its own foot; each string of bulbs colours a little of the square under it.
  ...[[0, -2.6], [2.6, 0], [0, 2.6], [-2.6, 0]].map(([dx, dz]) => glow(TREE.x + dx!, TREE.z + dz!, 3.4, BULB.warm, 10, { intensity: 0.9 })),
  ...SQUARE_POSTS.map(([x, z], i) => glow((TREE.x + x) / 2, (TREE.z + z) / 2, 3.6, ACCENTS[i % ACCENTS.length]!, 7, { intensity: 0.5 })),
  glow(63, 67.5, 3.6, BULB.warm, 7, { intensity: 0.5 }), glow(85.5, 68.5, 3.6, BULB.warm, 7, { intensity: 0.5 }),
  // Under the canopies still standing, and in the bandstand.
  ...[[63.5, 54.9], [68, 54.9], [84, 54.9], [87.6, 62], [87.6, 79], [70, 80.1], [78.5, 80.1]].map(([x, z]) => glow(x!, z!, 2, BULB.warm, 4.5, { intensity: 0.6 })),
  glow(58, 64, 2.6, BULB.warm, 6, { intensity: 0.7 }),
  // The avenue: under every other string; the lamps of two cars; the bus; the kiosk and the booth.
  ...[26, 50, 74, 98].map((x, i) => glow(x, 36, 3.6, ACCENTS[i]!, 7, { intensity: 0.45 })),
  glow(61.2, 34, 0.7, 0xfff0d0, 6, { intensity: 0.7 }), glow(106.8, 38, 0.7, 0xfff0d0, 6, { intensity: 0.7 }),
  glow(87.2, 36, 2, 0xffe6b0, 6, { intensity: 0.7, flicker: true, silent: true }), glow(91.3, 38, 2, 0xffe6b0, 6, { intensity: 0.7, flicker: true, silent: true }),
  lamp(69, 39.9, 2.2, LIGHT.lab, 4.5, { fixture: 'none' }), lamp(56.5, 31.5, 2.2, LIGHT.lab, 3.5, { fixture: 'none' }),
  // The lane: the brazier, and the one string.
  glow(76.25, 96.9, 1.2, LIGHT.flame, 6.5, { flicker: true }), glow(84, 95, 3.2, BULB.red, 6, { intensity: 0.45 }),
];
