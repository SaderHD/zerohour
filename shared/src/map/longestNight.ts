import type { BlockDef, LightDef, MapDef, Opening, Room, WallStyle } from './types';

// The Longest Night - Wexler Square on Christmas Eve. See docs/PLAN.md 4.12.
// This is the blockout (PLAN section 9, M3): the streets, every ground floor and the subway, with
// doors and prices and enough light to see by. Nothing is dressed and nothing is sold yet; the
// upper floors and roofs are M4's. Run `npm run map -- longest_night` after any edit.
//
//                  [St Audra's]                              [subway head house]
//   ===============  DRAY AVENUE  ========================================   (the platform and
//     [The Lyric]        | cut |                                              the train under it)
//      auditorium, +-----+     +-----------+
//      lobby  ===== |   WEXLER SQUARE      | == subway stairs (east, down to the mezzanine)
//                   |                      | ==== [ABELARD'S]
//     [Starlight] ==+----------| pass |----+           |
//     [ diner   ]        ===== TALLOW LANE ============+== (loading bay)
//        == [tenement hall]  (hatch: up from the service tunnel)
//
//   level -1 (-4 m)  the mezzanine under the square's north-east corner; the landings of the
//                    flights that climb to the avenue and to the lane
//   level -2 (-8 m)  the platform in two halves (the roof is down between them: the way from one
//                    to the other is through the train), the service tunnel and its signal room
//
// A flight that reaches the street stands inside a building, never under open road: its head room
// runs up past street level (see `FLIGHT`).

const KERB = 0.15;
/** How far up a street's own walls are drawn; the blocks carry on from here. */
const GROUND = 4;
/** One flight of the subway's stairs climbs a storey in 7 m. */
const STOREY = 4;
const FLIGHT = { ceil: 6.5 } as const;

const SOOT = 0xc8beb4;
const RED = 0xe0b0a0;
const PALE = 0xd8d0c0;
const STONE = 0xc4c8cc;
const CINEMA = 0xd0a8a0;
const STORE = 0xc8d0c4;
const DINER = 0xb8c8d0;
const BOARDS = 0xffffff;

type Rest = Omit<Room, 'id' | 'x' | 'z' | 'w' | 'd'>;
const room = (id: string, x: number, z: number, w: number, d: number, rest: Rest): Room => ({ id, x, z, w, d, ...rest });

const AVE = { zone: 'avenue', outdoor: true, ceil: GROUND, floor: 'asphalt', wall: 'brick' } as const;
const AVE_PAVE = { ...AVE, floor: 'pavement', y: KERB, ceil: GROUND - KERB } as const;
const SQUARE = { zone: 'square', outdoor: true, ceil: GROUND, floor: 'pavement', wall: 'brick', tint: SOOT } as const;
const LANE = { zone: 'lane', outdoor: true, ceil: GROUND, floor: 'asphalt', wall: 'brick', tint: SOOT } as const;

const DINER_IN = { zone: 'diner', ceil: 3.2, floor: 'lino', wall: 'panel', tint: 0xd8c8b0 } as const;
const TENEMENT = { zone: 'tenement', ceil: 3, floor: 'plank', wall: 'plaster', tint: 0xc8b8a0 } as const;
const LYRIC = { zone: 'lyric', ceil: 3.5, floor: 'plank', wall: 'plaster', tint: 0xc8a098 } as const;
const CHAPEL = { zone: 'chapel', ceil: 7, floor: 'tile', wall: 'plaster', tint: 0xc8c8d0 } as const;
const ABELARD = { zone: 'abelard', ceil: 3.5, floor: 'tile', wall: 'plaster', tint: 0xd8d0b8 } as const;
const MEZZ = { zone: 'mezz', level: -1, ceil: 3, floor: 'tile', wall: 'subway' } as const;
const PLATFORM = { zone: 'platform', level: -2, ceil: 3.5, floor: 'concrete', wall: 'subway' } as const;
const SERVICE = { zone: 'service', level: -2, ceil: 3, floor: 'concrete', wall: 'block', tint: 0xb0a898 } as const;

/** A stretch of a street's edge: from, to, the face of the building behind it, its tint. */
type Stretch = [from: number, to: number, wall: WallStyle, tint: number];
/** A street's outermost half metre along z = `z`, in stretches: each gives its wall the face of what stands behind. */
const alongX = (id: string, base: Rest, z: number, parts: Stretch[]): Room[] => parts.map(([a, b, wall, tint], i) => room(`${id}_${i}`, a, z, b - a, 0.5, { ...base, wall, tint }));
/** The same along x = `x`. */
const alongZ = (id: string, base: Rest, x: number, parts: Stretch[]): Room[] => parts.map(([a, b, wall, tint], i) => room(`${id}_${i}`, x, a, 0.5, b - a, { ...base, wall, tint }));

const door = (id: string, a: string, b: string, cost: number, x: number, z: number, w: number, d: number, rest: Partial<Opening> = {}): Opening => ({
  id, kind: 'door', zones: [a, b], cost, x, z, w, d, ...rest,
});
const arch = (id: string, zone: string, x: number, z: number, w: number, d: number, level?: number): Opening => ({
  id, kind: 'arch', zones: [zone, zone], x, z, w, d, ...(level === undefined ? {} : { level }),
});
/** A window, or on a street a barricade: (x, z) is its corner, `len` how long it is along the wall. */
const win = (id: string, zone: string, out: 'n' | 's' | 'e' | 'w', x: number, z: number, len = 1.5): Opening => ({
  id, kind: 'window', zones: [zone, 'outside'], out, x, z,
  w: out === 'n' || out === 's' ? len : 0.5,
  d: out === 'n' || out === 's' ? 0.5 : len,
});

const block = (x: number, z: number, w: number, d: number, h: number, face: WallStyle, tint: number, rest: Partial<BlockDef> = {}): BlockDef => ({ x, z, w, d, h, face, tint, ...rest });
/** Boards across the mouth of a street: over them, whatever stands behind. */
const boards = (x: number, z: number, w: number, d: number): BlockDef => block(x, z, w, d, 3.5, 'fence', BOARDS, { parapet: 0, lit: false });

const SODIUM = 0xffb060;
const WARM = 0xffd9a0;
const TUBE = 0xc0ffe8;
const street = (x: number, z: number, radius = 14): LightDef => ({ x, y: 4.6, z, color: SODIUM, radius, intensity: 1.2, fixture: 'flood' });
const bulb = (x: number, z: number, y: number, radius: number, rest: Partial<LightDef> = {}): LightDef => ({ x, y, z, color: WARM, radius, intensity: 1, ...rest });
const tube = (x: number, z: number, y: number, level: number, rest: Partial<LightDef> = {}): LightDef => ({ x, y, z, level, color: TUBE, radius: 9, intensity: 0.9, fixture: 'tube', ...rest });

export const longestNight: MapDef = {
  id: 'longest_night',
  name: 'The Longest Night',
  size: { w: 150, d: 120 },
  // Until it is finished (M10) only a debug server offers it.
  hidden: true,
  scene: {
    sky: 'city', skyTop: 0x1c130d, skyHorizon: 0x553218, haze: 0x1a1410,
    built: 'city', beyond: 'towers', outside: 0x241c18, snow: true,
    pocket: { floor: 'asphalt', wall: 'brick' },
    fog: { color: 0x1c1512, near: 10, far: 110 },
    vista: { x: 74, y: 2.6, z: 68 },
  },
  zones: [
    { id: 'diner', air: 'mess', name: 'Starlight Diner', letter: 'd', ambient: 0x2a241e },
    { id: 'square', air: 'yard', name: 'Wexler Square', letter: 'q', ambient: 0x241d1a },
    { id: 'avenue', air: 'yard', name: 'Dray Avenue', letter: 'a', ambient: 0x221c1a },
    { id: 'lane', air: 'yard', name: 'Tallow Lane', letter: 't', ambient: 0x1c1816 },
    { id: 'tenement', air: 'bunk', name: 'The Tenement', letter: 'n', ambient: 0x221c18 },
    { id: 'abelard', air: 'mess', name: "Abelard's", letter: 'b', ambient: 0x24221c },
    { id: 'lyric', air: 'bunk', name: 'The Lyric', letter: 'l', ambient: 0x201818 },
    { id: 'chapel', air: 'comms', name: "St Audra's", letter: 'c', ambient: 0x1a1c22 },
    { id: 'mezz', air: 'vault', name: 'Subway Mezzanine', letter: 'm', ambient: 0x161a1c, fog: { color: 0x10100e, near: 4, far: 40 } },
    { id: 'platform', air: 'vault', name: 'The Platform', letter: 'p', ambient: 0x14181a, fog: { color: 0x0c0c0c, near: 4, far: 48 } },
    { id: 'service', air: 'gen', name: 'Service Tunnel', letter: 's', ambient: 0x1a1612, fog: { color: 0x0c0a08, near: 3, far: 36 } },
  ],
  levels: [
    { level: -2, name: 'Platform', y: -2 * STOREY },
    { level: -1, name: 'Mezzanine', y: -STOREY },
  ],
  // The buildings. Later ones have the ground where they overlap.
  blocks: [
    // North of the avenue.
    block(0, 0, 39.5, 30, 22, 'brick', SOOT),
    block(39.5, 0, 15, 30, 9, 'brick', STONE, { lit: false }),
    block(54.5, 0, 21.5, 30, 26, 'brick', RED),
    block(76, 0, 28, 30, 18, 'brick', PALE),
    block(104, 0, 14, 30, 16, 'brick', SOOT),
    block(118, 0, 32, 30, 30, 'brick', RED),
    // The avenue's two ends: boards, and a building across each.
    block(0, 30, 16, 12, 20, 'brick', PALE),
    boards(16, 30, 4, 12),
    boards(120, 30, 4, 12),
    block(124, 30, 26, 12, 24, 'brick', SOOT),
    // Between the avenue and the square.
    block(0, 42, 20.5, 78, 24, 'brick', SOOT),
    block(20.5, 42, 31.5, 26, 11, 'brick', CINEMA, { lit: false }),
    block(52, 42, 20, 8, 16, 'brick', SOOT),
    block(76, 42, 20, 8, 12, 'brick', SOOT),
    block(96, 42, 54, 17.5, 20, 'brick', PALE),
    // Round the square.
    block(20.5, 68, 31.5, 15, 18, 'brick', RED),
    block(96, 59.5, 31, 32.5, 8, 'brick', STORE),
    block(127, 59.5, 23, 60.5, 28, 'brick', RED),
    block(20.5, 83, 36, 20.5, 4.5, 'brick', DINER, { lit: false, roof: 'vents' }),
    block(56.5, 86, 39.5, 6, 9, 'brick', SOOT),
    // South of the lane.
    block(56.5, 92, 1.5, 6, 9, 'brick', SOOT),
    block(56.5, 98, 16, 13, 8, 'brick', RED),
    block(72.5, 98, 23.5, 22, 14, 'brick', PALE),
    block(96, 98, 31, 22, 20, 'brick', SOOT),
    block(20.5, 103.5, 36, 16.5, 16, 'brick', PALE),
    block(56.5, 111, 16, 9, 16, 'brick', PALE),
    boards(122, 92, 5, 6),
    // The walls the two heaps of wreckage lie in: no taller than the street's own, the sky over them.
    block(72, 45.5, 4, 0.5, GROUND, 'brick', SOOT, { parapet: 0, lit: false }),
    block(82, 88.5, 3, 0.5, GROUND, 'brick', SOOT, { parapet: 0, lit: false }),
  ],
  rooms: [
    // Dray Avenue: a road between two pavements, a hundred metres of it.
    room('ave_road', 20.5, 32.5, 99, 7, AVE),
    room('ave_pave_n', 20.5, 30.5, 99, 2, AVE_PAVE),
    room('ave_pave_s', 20.5, 39.5, 99, 2, AVE_PAVE),
    ...alongX('ave_n', AVE_PAVE, 30, [
      [20.5, 39.5, 'brick', SOOT], [39.5, 54.5, 'brick', STONE], [54.5, 75, 'brick', RED], [75, 79, 'fence', BOARDS],
      [79, 104, 'brick', PALE], [104, 118, 'brick', SOOT], [118, 119.5, 'brick', RED],
    ]),
    ...alongX('ave_s', AVE_PAVE, 41.5, [
      [20.5, 52, 'brick', CINEMA], [52, 96, 'brick', SOOT], [96, 113, 'brick', PALE], [113, 117, 'fence', BOARDS], [117, 119.5, 'brick', PALE],
    ]),
    room('ave_w_n', 20, 30, 0.5, 2.5, { ...AVE_PAVE, wall: 'fence' }),
    room('ave_w', 20, 32.5, 0.5, 7, { ...AVE, wall: 'fence' }),
    room('ave_w_s', 20, 39.5, 0.5, 2.5, { ...AVE_PAVE, wall: 'fence' }),
    room('ave_e_n', 119.5, 30, 0.5, 2.5, { ...AVE_PAVE, wall: 'fence' }),
    room('ave_e', 119.5, 32.5, 0.5, 7, { ...AVE, wall: 'fence' }),
    room('ave_e_s', 119.5, 39.5, 0.5, 2.5, { ...AVE_PAVE, wall: 'fence' }),
    // The cut from the avenue down to the square, a heap of wreckage across the middle of it.
    room('cut_n', 72, 42, 4, 3.5, { ...AVE_PAVE, tint: SOOT }),
    room('cut_s', 72, 46, 4, 4, { ...SQUARE, floor: 'asphalt' }),

    // Wexler Square.
    room('square', 52.5, 50.5, 43, 35, SQUARE),
    ...alongX('sq_n', SQUARE, 50, [[52, 57, 'brick', SOOT], [57, 61, 'fence', BOARDS], [61, 96, 'brick', SOOT]]),
    ...alongX('sq_s', SQUARE, 85.5, [[52, 56.5, 'shopfront', DINER], [56.5, 59, 'brick', SOOT], [59, 63, 'fence', BOARDS], [63, 96, 'brick', SOOT]]),
    ...alongZ('sq_w', SQUARE, 52, [[50.5, 68, 'brick', CINEMA], [68, 73, 'brick', RED], [73, 77, 'fence', BOARDS], [77, 85.5, 'brick', RED]]),
    ...alongZ('sq_e', SQUARE, 95.5, [[50.5, 55, 'brick', PALE], [55, 59, 'fence', BOARDS], [59, 59.5, 'brick', PALE], [59.5, 85.5, 'shopfront', STORE]]),
    // The passage from the square through to the lane, wreckage across it too.
    room('pass_n', 82, 86, 3, 2.5, { ...SQUARE, floor: 'asphalt' }),
    room('pass_s', 82, 89, 3, 3, LANE),

    // Tallow Lane.
    room('lane', 58.5, 92.5, 63, 5, LANE),
    ...alongX('lane_n', LANE, 92, [[58.5, 96, 'brick', SOOT], [96, 121.5, 'brick', STORE]]),
    ...alongX('lane_s', LANE, 97.5, [
      [58.5, 72.5, 'brick', RED], [72.5, 89, 'brick', PALE], [89, 93, 'fence', BOARDS], [93, 96, 'brick', PALE],
      [96, 107, 'brick', SOOT], [107, 111, 'fence', BOARDS], [111, 121.5, 'brick', SOOT],
    ]),
    room('lane_w', 58, 92, 0.5, 6, LANE),
    room('lane_e', 121.5, 92, 0.5, 6, { ...LANE, wall: 'fence', tint: BOARDS }),

    // The Starlight Diner (the spawn), its kitchen through the arch behind the counter.
    room('diner', 40, 86.5, 16, 10, DINER_IN),
    room('diner_kitchen', 46, 97, 10, 6, { ...DINER_IN, ceil: 2.8, floor: 'tile', wall: 'plaster', tint: 0xc8d0c8 }),
    // The tenement's hall: the stairs up are M4's.
    room('tenement_hall', 56.5, 98.5, 10, 6, TENEMENT),

    // The Lyric: the lobby on the square, the auditorium behind, the fire exit out to the avenue.
    room('lyric_lobby', 39.5, 54, 12, 10, LYRIC),
    room('lyric_hall', 21, 46, 18, 16, { ...LYRIC, ceil: 7, floor: 'concrete' }),
    room('lyric_exit', 24, 42.5, 2, 3.5, { ...LYRIC, ceil: 2.8, floor: 'concrete' }),

    // St Audra's, north of the avenue.
    room('chapel', 40, 9.5, 14, 20, CHAPEL),

    // Abelard's ground floor, the loading bay at its back.
    room('abelard', 96.5, 62, 30, 24, ABELARD),
    room('abelard_bay', 112, 86, 8, 5.5, { ...ABELARD, floor: 'concrete', wall: 'block', tint: 0xc0b8a8 }),

    // The subway. From the square: a door in its east side, a flight down to the mezzanine.
    room('mezz_stairs', 96.5, 52, 7, 2, { ...MEZZ, ...FLIGHT, rise: { to: 'w', by: STOREY, stairs: true } }),
    room('mezz_landing', 103.5, 52, 2.5, 2.5, MEZZ),
    room('mezz', 86, 54.5, 20, 12, MEZZ),
    room('mezz_pass', 87, 47.5, 3, 7, MEZZ),
    // Through the turnstiles and down to the platform's west half.
    room('plat_stairs', 87, 40, 3, 7, { ...PLATFORM, ...FLIGHT, rise: { to: 's', by: STOREY, stairs: true } }),
    room('plat_w', 66, 32, 28, 8, PLATFORM),
    room('plat_e', 98, 32, 18, 8, PLATFORM),
    // The stalled train, alongside both halves: its doors stand open.
    room('train', 70, 28.5, 36, 3, { ...PLATFORM, ceil: 2.4, floor: 'lino', wall: 'metal', tint: 0xb8c0c8 }),
    // Up from the east half to the avenue: two flights and a landing, in the head house on its north side.
    room('ave_foot', 112, 29.5, 2, 2.5, PLATFORM),
    room('ave_flight_1', 112, 22.5, 2, 7, { ...PLATFORM, ...FLIGHT, rise: { to: 'n', by: STOREY, stairs: true } }),
    room('ave_landing', 108, 20, 6, 2.5, { ...PLATFORM, level: -1, ceil: 3 }),
    // (This one climbs to the kerb, not the road.)
    room('ave_flight_2', 108, 22.5, 2, 7, { ...PLATFORM, ...FLIGHT, level: -1, rise: { to: 's', by: STOREY + KERB, stairs: true } }),

    // The service tunnel, behind the power: south from the platform under the square, the signal
    // room off it (the Forge will stand there), and up two flights to a door in Tallow Lane.
    room('service', 66, 40.5, 4, 35.5, SERVICE),
    room('signal_room', 57.5, 58, 8, 6, { ...SERVICE, floor: 'metal', tint: 0xb8a8d0 }),
    room('service_flight_1', 67, 76, 2, 7, { ...SERVICE, ...FLIGHT, rise: { to: 's', by: STOREY, stairs: true } }),
    room('service_landing', 66, 83, 4, 8.5, { ...SERVICE, level: -1 }),
    room('service_flight_2', 70, 89.5, 7, 2, { ...SERVICE, ...FLIGHT, level: -1, rise: { to: 'e', by: STOREY, stairs: true } }),
    room('service_hatch', 77, 89.5, 2.5, 2, { ...SERVICE, level: 0, ceil: 2.5 }),
  ],
  openings: [
    door('d_diner_square', 'diner', 'square', 750, 53, 86, 2, 0.5),
    door('d_diner_tenement', 'diner', 'tenement', 750, 56, 99, 0.5, 2),
    door('d_square_lane', 'square', 'lane', 750, 82, 88.5, 3, 0.5, { style: 'debris' }),
    door('d_square_avenue', 'square', 'avenue', 1000, 72, 45.5, 4, 0.5, { style: 'debris' }),
    door('d_square_lyric', 'square', 'lyric', 1000, 51.5, 58, 0.5, 2),
    door('d_square_abelard', 'square', 'abelard', 1000, 96, 72, 0.5, 3),
    door('d_square_subway', 'square', 'mezz', 1250, 96, 52, 0.5, 2),
    door('d_avenue_chapel', 'avenue', 'chapel', 1000, 46, 29.5, 2, 0.5),
    door('d_avenue_lyric', 'avenue', 'lyric', 1000, 24, 42, 2, 0.5),
    door('d_avenue_subway', 'avenue', 'platform', 1250, 108, 29.5, 2, 0.5),
    door('d_lane_abelard', 'lane', 'abelard', 1000, 114, 91.5, 3, 0.5),
    { id: 'd_service', kind: 'door', zones: ['platform', 'service'], needsPower: true, x: 67, z: 40, w: 2, d: 0.5, level: -2 },
    { id: 'd_hatch', kind: 'door', zones: ['lane', 'service'], needsPower: true, x: 77.5, z: 91.5, w: 2, d: 0.5 },
    // The turnstiles.
    { id: 'a_turnstiles', kind: 'arch', zones: ['mezz', 'platform'], x: 87, z: 47, w: 3, d: 0.5, level: -1 },
    arch('a_kitchen', 'diner', 50, 96.5, 2, 0.5),
    arch('a_lyric_n', 'lyric', 39, 55, 0.5, 2),
    arch('a_lyric_s', 'lyric', 39, 60, 0.5, 2),
    arch('a_signal', 'service', 65.5, 60, 0.5, 2, -2),
    // The train's doors.
    arch('a_train_1', 'platform', 74, 31.5, 1.5, 0.5, -2),
    arch('a_train_2', 'platform', 84, 31.5, 1.5, 0.5, -2),
    arch('a_train_3', 'platform', 100, 31.5, 1.5, 0.5, -2),
    arch('a_train_4', 'platform', 104, 31.5, 1.5, 0.5, -2),

    // Barricades across the mouths of the side streets.
    win('w_square_n', 'square', 'n', 58, 49.5, 2),
    win('w_square_e', 'square', 'e', 96, 56, 2),
    win('w_square_s', 'square', 's', 60, 86, 2),
    win('w_square_w', 'square', 'w', 51.5, 74, 2),
    win('w_avenue_w', 'avenue', 'w', 19.5, 35, 2),
    win('w_avenue_e', 'avenue', 'e', 120, 35, 2),
    win('w_avenue_n', 'avenue', 'n', 76, 29.5, 2),
    win('w_avenue_s', 'avenue', 's', 114, 42, 2),
    win('w_lane_s1', 'lane', 's', 90, 98, 2),
    win('w_lane_s2', 'lane', 's', 108, 98, 2),
    win('w_lane_e', 'lane', 'e', 122, 94, 2),
    // Windows.
    win('w_diner_w', 'diner', 'w', 39.5, 90),
    win('w_diner_n', 'diner', 'n', 43, 86),
    win('w_diner_kitchen', 'diner', 's', 50, 103),
    win('w_tenement_hall', 'tenement', 's', 60, 104.5),
    win('w_lyric_w', 'lyric', 'w', 20.5, 53),
    win('w_lyric_s', 'lyric', 's', 28, 62),
    win('w_lyric_lobby', 'lyric', 's', 44, 64),
    win('w_chapel_w', 'chapel', 'w', 39.5, 16),
    win('w_chapel_e', 'chapel', 'e', 54, 20),
    win('w_abelard_n1', 'abelard', 'n', 106, 61.5),
    win('w_abelard_n2', 'abelard', 'n', 118, 61.5),
    win('w_abelard_e', 'abelard', 'e', 126.5, 72),
    win('w_abelard_s', 'abelard', 's', 100, 86),
  ],
  props: [],
  interactables: [],
  playerSpawns: [
    { x: 46, z: 90.5, yaw: 0 },
    { x: 49, z: 90.5, yaw: 0 },
    { x: 46, z: 93, yaw: 0 },
    { x: 49, z: 93, yaw: 0 },
  ],
  lights: [
    // Street lamps: the avenue's on alternate sides, six round the square, the lane's few and dim.
    ...[28, 60, 92, 116].map((x) => street(x, 31.2)),
    ...[44, 76, 104].map((x) => street(x, 40.8)),
    ...[60, 74, 88].flatMap((x) => [street(x, 58), street(x, 78)]),
    ...[64, 80, 98, 116].map((x) => ({ ...street(x, 95, 11), y: 4.2, intensity: 0.9 })),
    bulb(74, 46.5, 3.6, 7, { fixture: 'cage' }),
    bulb(83.5, 89.5, 3.6, 7, { fixture: 'cage' }),
    // Indoors.
    bulb(44, 91.5, 2.9, 9), bulb(52, 91.5, 2.9, 9), bulb(51, 100, 2.5, 8),
    bulb(61.5, 101.5, 2.7, 8),
    bulb(45.5, 59, 3.2, 10), bulb(30, 54, 6.4, 15, { intensity: 0.8 }), bulb(25, 44.2, 2.5, 5, { fixture: 'cage' }),
    bulb(47, 14.5, 6.4, 13, { color: 0xffe2b8 }), bulb(47, 24.5, 6.4, 13, { color: 0xffe2b8 }),
    ...[104, 119].flatMap((x) => [bulb(x, 68, 3.2, 11), bulb(x, 80, 3.2, 11)]), bulb(111.5, 74, 3.2, 11),
    bulb(116, 88.7, 3.2, 8, { fixture: 'cage' }),
    // The mezzanine and the ways down to it.
    tube(91, 60.5, 2.8, -1), tube(101, 60.5, 2.8, -1), tube(88.5, 51, 2.8, -1),
    tube(100, 53, 5.6, -1, { fixture: 'cage', radius: 7 }),
    // The platform: the tubes over the west half are the ones that fail.
    tube(71, 36, 3.3, -2, { flicker: true }), tube(80, 36, 3.3, -2), tube(89, 36, 3.3, -2, { flicker: true }),
    tube(102.5, 36, 3.3, -2), tube(111.5, 36, 3.3, -2),
    tube(76, 30, 2.2, -2, { radius: 6 }), tube(88, 30, 2.2, -2, { radius: 6 }), tube(100, 30, 2.2, -2, { radius: 6 }),
    tube(88.5, 43.5, 5.6, -2, { fixture: 'cage', radius: 7 }),
    tube(113, 26, 5.6, -2, { fixture: 'cage', radius: 7 }), tube(111, 21.2, 2.7, -1, { radius: 6 }), tube(109, 26, 5.6, -1, { fixture: 'cage', radius: 7 }),
    // The service tunnel.
    ...[47, 59, 71].map((z) => bulb(68, z, 2.7, 8, { level: -2, color: 0xffa040, fixture: 'cage', intensity: 0.8 })),
    bulb(61.5, 61, 2.7, 8, { level: -2, color: 0xb060ff, fixture: 'cage', intensity: 0.8 }),
    bulb(68, 79.5, 5.6, 7, { level: -2, color: 0xffa040, fixture: 'cage' }),
    bulb(68, 87, 2.7, 7, { level: -1, color: 0xffa040, fixture: 'cage' }),
    bulb(73.5, 90.5, 5.6, 7, { level: -1, color: 0xffa040, fixture: 'cage' }),
    bulb(78.2, 90.5, 2.2, 5, { color: 0xffa040, fixture: 'cage' }),
  ],
};
