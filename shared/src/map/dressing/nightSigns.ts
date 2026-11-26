import type { PropInst } from '../types';
import { arrow, onLevel, sign } from './helpers';

// The Longest Night, M8: what is written on the city (PLAN 4.12). Street names at the corners,
// the way to the subway and out of it, what each floor of the store sells, and - in yellow, as on
// the station - the way to the power. The big names (the Starlight's neon, the letters on
// Abelard's roof, the Lyric's canopy) are the `text` of those props; a booth's or a kiosk's name
// is part of its model. A sign hangs on a wall face: on a street that is the outer edge of its
// half-metre strip.

const HAZARD = 2;

const streets: PropInst[] = [
  // Dray Avenue, and the way down the cut to the square.
  sign('DRAY AVENUE', 62, 30, 's', 2.7), sign('DRAY AVENUE', 66, 42, 'n', 2.7), sign('DRAY AVENUE', 100, 42, 'n', 2.7),
  arrow('WEXLER SQ', 70.9, 42, 'n', 'e', 2.2), sign('SUBWAY', 109, 30, 's', 2.85), sign("ST AUDRA'S", 50.6, 30, 's', 2.1),
  // Wexler Square.
  sign('WEXLER SQUARE', 66, 50, 's', 2.8), sign('WEXLER SQUARE', 90, 86, 'n', 2.8),
  arrow('DRAY AVE', 70.9, 50, 's', 'e', 2.3), arrow('TALLOW LANE', 80.9, 86, 'n', 'e', 2.3), sign('SUBWAY', 96, 53, 'w', 2.85),
  // Tallow Lane.
  sign('TALLOW LANE', 90, 92, 's', 2.7), arrow('WEXLER SQ', 86.1, 92, 's', 'w', 2.2),
  sign('DELIVERIES', 110.5, 92, 's', 2.7), sign('SERVICE', 78.5, 92, 's', 2.75, HAZARD),
];

const indoors: PropInst[] = [
  // The tenement: the stairs go on up to the roof, and the roofs are the way to the plant room.
  arrow('ROOF', 66.5, 102.5, 'w', 'n', 2.3), arrow('POWER', 66.5, 102.5, 'w', 'n', 1.85, HAZARD),
  // Abelard's.
  sign('TOYS', 108, 62, 's', 2.9), arrow('THE GROTTO', 122.5, 86, 'n', 'e', 2.6), sign('LOADING BAY', 110.5, 86, 'n', 2.6),
  ...onLevel(1, [
    sign('COATS', 110, 62, 's', 2.25), sign('GIFT WRAPPING', 111, 86, 'n', 2.5),
    arrow('ROOF', 124.5, 69.5, 'w', 's', 2.45), arrow('POWER', 124.5, 69.5, 'w', 's', 2, HAZARD),
  ]),
  // The Lyric.
  sign('BALCONY', 51.5, 55, 'w', 2.4), sign('EXIT', 25, 46, 's', 3.1),
];

const subway: PropInst[] = [
  ...onLevel(-1, [
    sign('WEXLER SQUARE', 86, 64, 'e', 2.2), arrow('TRAINS', 91.1, 54.5, 's', 'w', 2.45), arrow('EXIT', 102.6, 54.5, 's', 'e', 2.55),
  ]),
  ...onLevel(-2, [
    sign('WEXLER SQUARE', 78.9, 40, 'n', 2.5), sign('WEXLER SQUARE', 110.9, 40, 'n', 2.5),
    arrow('EXIT', 86.1, 40, 'n', 'e', 2.5), arrow('EXIT', 110.8, 32, 's', 'e', 2.5),
    sign('STAFF ONLY', 68, 40, 'n', 2.6, HAZARD), sign('SIGNAL ROOM', 66, 62.9, 'e', 2.2, HAZARD),
  ]),
];

export const signProps: PropInst[] = [...streets, ...indoors, ...subway];
