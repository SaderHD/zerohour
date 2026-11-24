import { eastLights, eastProps } from './dressing/east';
import { interactables, mountLights, mountProps } from './dressing/mounts';
import { southLights, southProps } from './dressing/south';
import { westLights, westProps } from './dressing/west';
import { GALLERY_Y, TERRACE_N, TERRACE_S, VAULT_Y } from './terraces';
import type { MapDef, Opening, Room } from './types';

// Harrow Ridge Station — a snowed-in 1970s mountain signals outpost. See docs/PLAN.md 4.11.
// Layout (north is up). Run `npm run map` after any edit and read docs/MAP.txt.
//
//   Lab ─────── Cold Storage ── tunnel ┐         the north terrace, 1.5 m up the ridge
//    │ (stairs)                 (climbs)│
//   Bunkhouse ── Mess Hall         Generator Hall  (the tunnel comes out on its gallery, upstairs)
//                   │                  │
//               Courtyard ──────── Motor Pool      (the yard slopes down to the south terrace, 1.5 m down)
//                   │
//              Comms Bunker ── Vault               (the Vault is the cellar under the bunker)

const door = (id: string, a: string, b: string, cost: number, x: number, z: number, w: number, d: number): Opening => ({
  id, kind: 'door', zones: [a, b], cost, x, z, w, d,
});

const win = (id: string, zone: string, out: 'n' | 's' | 'e' | 'w', x: number, z: number, len = 1.5): Opening => ({
  id, kind: 'window', zones: [zone, 'outside'], out, x, z,
  w: out === 'n' || out === 's' ? len : 0.5,
  d: out === 'n' || out === 's' ? 0.5 : len,
});

const N = TERRACE_N;
const S = TERRACE_S;
/** Each of the tunnel's two ramps climbs half the way from the cold store to the gallery. */
const CLIMB = (GALLERY_Y - N) / 2;
/** Each of the vault's two flights goes down half the way from the bunker. */
const FLIGHT = (S - VAULT_Y) / 2;

type Rest = Omit<Room, 'id' | 'x' | 'z' | 'w' | 'd'>;
const room = (id: string, x: number, z: number, w: number, d: number, rest: Rest): Room => ({ id, x, z, w, d, ...rest });

const MESS = { zone: 'mess', ceil: 3.2, floor: 'lino', wall: 'panel', tint: 0xd8c8a8 } as const;
const LAB = { zone: 'lab', ceil: 3.4, floor: 'tile', wall: 'plaster', tint: 0xc0d8d0, y: N } as const;
const TUNNEL = { zone: 'cold', ceil: 2.6, floor: 'concrete', wall: 'rock', tint: 0xa0a8b8 } as const;
const GEN = { zone: 'gen', ceil: 5.6, floor: 'metal', wall: 'block', tint: 0xc8b090 } as const;
// The motor pool's roof is level; its floor is not.
const MOTOR = { zone: 'motor', ceil: 4.5 - S, floor: 'concrete', wall: 'block', tint: 0xc0b8a8, y: S } as const;
// The yard's fence keeps a level top (3.5 m over the mess door) all the way down the slope.
const YARD = { zone: 'yard', ceil: 3.5, floor: 'snow', wall: 'fence', outdoor: true, tint: 0xc8d8f0 } as const;
const LOW = { ...YARD, ceil: 3.5 - S, y: S } as const;
const SLOPE = { ...LOW, rise: { to: 'n', by: -S } } as const;
const VAULT = { zone: 'vault', level: -1, ceil: 2.6, floor: 'metal', wall: 'metal', tint: 0xb8a8d0 } as const;

export const harrowRidge: MapDef = {
  id: 'harrow_ridge',
  name: 'Harrow Ridge Station',
  size: { w: 70, d: 70 },
  zones: [
    { id: 'mess', name: 'Mess Hall', letter: 'm', ambient: 0x2a241e },
    { id: 'bunk', name: 'Bunkhouse', letter: 'b', ambient: 0x221c18 },
    { id: 'lab', name: 'Laboratory', letter: 'l', ambient: 0x1a2622 },
    { id: 'cold', name: 'Cold Storage', letter: 'c', ambient: 0x161e2a, fog: { color: 0x1c2834, near: 1, far: 22 } },
    { id: 'gen', name: 'Generator Hall', letter: 'g', ambient: 0x221a12, fog: { color: 0x120e0a, near: 5, far: 36 } },
    { id: 'motor', name: 'Motor Pool', letter: 'p', ambient: 0x24201a },
    { id: 'yard', name: 'Courtyard', letter: 'y', ambient: 0x1c2638, fog: { color: 0x0c121e, near: 5, far: 44 } },
    { id: 'comms', name: 'Comms Bunker', letter: 'k', ambient: 0x141e18 },
    { id: 'vault', name: 'Vault', letter: 'v', ambient: 0x1a1424 },
  ],
  levels: [
    { level: -1, name: 'Vault', y: VAULT_Y },
    { level: 1, name: 'Gallery', y: GALLERY_Y },
  ],
  rooms: [
    // Mess hall, with the servery let into its east wall.
    room('mess', 22.5, 22, 14, 10, MESS),
    room('mess_servery', 36.5, 29, 2.5, 3, { ...MESS, ceil: 2.6 }),
    room('bunk', 6, 23, 16, 8, { zone: 'bunk', ceil: 2.8, floor: 'plank', wall: 'panel', tint: 0xc8a888 }),
    room('washroom', 8, 18.5, 6, 4, { zone: 'bunk', ceil: 2.6, floor: 'tile', wall: 'plaster', tint: 0xb8d0c8 }),
    // The laboratory stands on the north terrace: the door from the washroom opens on a flight of
    // stairs up into its south-west corner (the corner itself is rock). The specimen tanks have a
    // bay of their own.
    room('lab', 6, 6, 16, 9.5, LAB),
    room('lab_se', 12, 15.5, 10, 2.5, LAB),
    room('lab_stairs', 10, 15.5, 2, 2.5, { ...LAB, y: 0, ceil: LAB.ceil + N, rise: { to: 'n', by: N, stairs: true } }),
    room('lab_bay', 15, 4, 6, 2, { ...LAB, ceil: 2.8 }),
    room('cold', 22.5, 8, 20, 7, { zone: 'cold', ceil: 3, floor: 'metal', wall: 'metal', tint: 0xa8c0d8, mist: true, y: N }),
    // The tunnel climbs through the rock from the cold store to the generator hall's gallery.
    room('tunnel', 42.5, 11, 1.5, 4, { ...TUNNEL, y: N }),
    room('tunnel_ramp', 44, 11, 5, 4, { ...TUNNEL, y: N, ceil: 2.6 + CLIMB, rise: { to: 'e', by: CLIMB } }),
    room('tunnel_bend', 49, 11, 5, 5, { ...TUNNEL, y: N + CLIMB }),
    room('tunnel_leg', 50, 16, 4, 5, { ...TUNNEL, y: N + CLIMB, ceil: 2.6 + CLIMB, rise: { to: 's', by: CLIMB } }),
    room('tunnel_foot', 50, 21, 4, 2, { ...TUNNEL, y: GALLERY_Y }),
    // Generator hall: the sets on the floor, a gallery along the north wall with a stair at each
    // end (the switchgear is up there), the fuel store off the corner under it.
    room('gen_under', 48, 23.5, 17, 2.5, { ...GEN, ceil: 2.7 }),
    room('gen_hall', 50, 26, 13, 5.5, GEN),
    room('gen_south', 48, 31.5, 17, 4, GEN),
    room('gen_stair_w', 48, 26, 2, 5.5, { ...GEN, rise: { to: 'n', by: GALLERY_Y, stairs: true } }),
    room('gen_stair_e', 63, 26, 2, 5.5, { ...GEN, rise: { to: 'n', by: GALLERY_Y, stairs: true } }),
    room('gen_gallery', 48, 23.5, 17, 2.5, { ...GEN, level: 1, ceil: 2.6 }),
    room('gen_fuel', 65, 23.5, 4.5, 3, { ...GEN, ceil: 2.7 }),
    // Motor pool: the door from the generators opens on a loading dock; a ramp and a flight of
    // steps go down to the floor the trucks stand on.
    room('motor_dock', 49.5, 36, 13, 2, { ...MOTOR, y: 0, ceil: 4.5 }),
    room('motor_w', 46.5, 36, 3, 5.5, MOTOR),
    room('motor_ramp', 49.5, 38, 3, 3.5, { ...MOTOR, rise: { to: 'n', by: -S } }),
    room('motor_mid', 52.5, 38, 7.5, 3.5, MOTOR),
    room('motor_steps', 60, 38, 2.5, 2, { ...MOTOR, rise: { to: 'n', by: -S, stairs: true } }),
    room('motor_e', 60, 40, 2.5, 1.5, MOTOR),
    room('motor', 46.5, 41.5, 16, 6.5, MOTOR),
    // The yard: a terrace along the mess hall, a bluff held up by a wall in the middle, snow
    // slopes either side of it down to the low yard.
    room('yard', 20, 33, 25.5, 6.5, YARD),
    room('yard_bluff', 28, 39.5, 10, 2.5, YARD),
    room('yard_slope_w', 20, 39.5, 7.5, 4.5, SLOPE),
    room('yard_slope_w_wall', 27.5, 39.5, 0.5, 4.5, { ...SLOPE, wall: 'rock' }),
    room('yard_slope_e_wall', 38, 39.5, 0.5, 4.5, { ...SLOPE, wall: 'rock' }),
    room('yard_slope_e', 38.5, 39.5, 7, 4.5, SLOPE),
    room('yard_foot', 28, 42, 10, 2, { ...LOW, wall: 'rock' }),
    room('yard_low', 20, 44, 25.5, 8, LOW),
    // The yard's outermost half metre, in strips, so each stretch of its wall is the face of what
    // stands behind it: the fence, the mess hall's boards, the block of the motor pool and the bunker.
    room('yard_n_w', 20, 32.5, 2.5, 0.5, YARD),
    room('yard_n_mess', 22.5, 32.5, 14, 0.5, { ...YARD, wall: 'siding' }),
    room('yard_n_e', 36.5, 32.5, 9.5, 0.5, YARD),
    room('yard_e_n', 45.5, 33, 0.5, 3, YARD),
    room('yard_e_motor', 45.5, 36, 0.5, 3.5, { ...YARD, wall: 'block' }),
    room('yard_e_slope', 45.5, 39.5, 0.5, 4.5, { ...SLOPE, wall: 'block' }),
    room('yard_e_low', 45.5, 44, 0.5, 4, { ...LOW, wall: 'block' }),
    room('yard_e_s', 45.5, 48, 0.5, 4, LOW),
    room('yard_s_w', 20, 52, 4, 0.5, LOW),
    room('yard_s_comms', 24, 52, 12, 0.5, { ...LOW, wall: 'block' }),
    room('yard_s_e', 36, 52, 10, 0.5, LOW),
    // The bunker on the south terrace, the signals office off its corner.
    room('comms', 24, 53, 12, 10, { zone: 'comms', ceil: 2.8, floor: 'concrete', wall: 'block', tint: 0xa8c0a8, y: S }),
    room('comms_office', 21, 59.5, 3, 3.5, { zone: 'comms', ceil: 2.6, floor: 'concrete', wall: 'block', tint: 0xa8c0a8, y: S }),
    // The Vault is the cellar under the bunker: through the power door, down two flights that
    // double back, and in under the floor. The Forge stands in a recess at the far end.
    room('vault_head', 36.5, 57, 2, 2, { ...VAULT, level: 0, y: S }),
    room('vault_flight_1', 38.5, 57, 3, 2, { ...VAULT, y: FLIGHT, ceil: 2.6 + FLIGHT, rise: { to: 'w', by: FLIGHT, stairs: true } }),
    room('vault_turn', 41.5, 55, 2, 4, { ...VAULT, y: FLIGHT }),
    room('vault_flight_2', 38.5, 55, 3, 2, { ...VAULT, ceil: 2.6 + FLIGHT, rise: { to: 'e', by: FLIGHT, stairs: true } }),
    room('vault_foot', 36.5, 55, 2, 2, VAULT),
    room('vault', 26, 54, 10.5, 7, VAULT),
    room('vault_recess', 24, 56.5, 2, 2, VAULT),
  ],
  openings: [
    door('d_mess_bunk', 'mess', 'bunk', 750, 22, 26, 0.5, 2),
    door('d_mess_yard', 'mess', 'yard', 750, 28, 32, 2, 0.5),
    { id: 'a_bunk_wash', kind: 'arch', zones: ['bunk', 'bunk'], x: 10, z: 22.5, w: 2, d: 0.5 },
    { ...door('d_bunk_lab', 'bunk', 'lab', 1000, 10, 18, 2, 0.5), style: 'debris' },
    door('d_lab_cold', 'lab', 'cold', 1250, 22, 10, 0.5, 2),
    // On the gallery: the tunnel has climbed a storey by the time it gets here.
    { ...door('d_cold_gen', 'gen', 'cold', 1000, 51, 23, 2, 0.5), level: 1 },
    door('d_gen_motor', 'gen', 'motor', 1250, 54, 35.5, 2, 0.5),
    door('d_yard_motor', 'yard', 'motor', 1000, 46, 45, 0.5, 2),
    door('d_yard_comms', 'yard', 'comms', 1250, 29, 52.5, 2, 0.5),
    { id: 'd_vault', kind: 'door', zones: ['comms', 'vault'], needsPower: true, x: 36, z: 57, w: 0.5, d: 2 },

    win('w_mess_n1', 'mess', 'n', 26, 21.5),
    win('w_mess_n2', 'mess', 'n', 32, 21.5),
    win('w_mess_e', 'mess', 'e', 36.5, 26),
    win('w_bunk_w', 'bunk', 'w', 5.5, 26),
    win('w_bunk_s', 'bunk', 's', 10, 31),
    win('w_lab_n', 'lab', 'n', 12, 5.5),
    win('w_lab_w', 'lab', 'w', 5.5, 11),
    win('w_cold_n', 'cold', 'n', 32, 7.5),
    win('w_cold_e', 'cold', 'e', 54, 12),
    win('w_gen_e', 'gen', 'e', 65, 32.5),
    win('w_gen_n', 'gen', 'n', 58, 23),
    win('w_motor_e', 'motor', 'e', 62.5, 41),
    win('w_motor_s', 'motor', 's', 54, 48),
    win('w_yard_w', 'yard', 'w', 19.5, 46, 2),
    win('w_yard_n', 'yard', 'n', 40, 32, 2),
    win('w_yard_e', 'yard', 'e', 46, 49.5, 2),
    win('w_comms_w', 'comms', 'w', 23.5, 57),
    win('w_comms_s', 'comms', 's', 29, 63),
  ],
  props: [...westProps, ...eastProps, ...southProps, ...mountProps],
  interactables,
  playerSpawns: [
    { x: 28, z: 26, yaw: 0 },
    { x: 31, z: 26, yaw: 0 },
    { x: 28, z: 28.5, yaw: 0 },
    { x: 31, z: 28.5, yaw: 0 },
  ],
  lights: [...westLights, ...eastLights, ...southLights, ...mountLights],
};
