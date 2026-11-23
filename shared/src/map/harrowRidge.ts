import { LIGHT, glow, lamp } from './dressing/helpers';
import { westLights, westProps } from './dressing/west';
import type { MapDef, Opening } from './types';

// Harrow Ridge Station — a snowed-in 1970s mountain signals outpost. See docs/PLAN.md 4.11.
// Layout (north is up). Run `npm run map` after any edit and read docs/MAP.txt.
//
//   Lab ─────── Cold Storage ── tunnel ┐
//    │ (washroom)                      │
//   Bunkhouse ── Mess Hall         Generator Hall
//                   │                  │
//               Courtyard ──────── Motor Pool
//                   │
//              Comms Bunker ── Vault

const door = (id: string, a: string, b: string, cost: number, x: number, z: number, w: number, d: number): Opening => ({
  id, kind: 'door', zones: [a, b], cost, x, z, w, d,
});

const win = (id: string, zone: string, out: 'n' | 's' | 'e' | 'w', x: number, z: number, len = 1.5): Opening => ({
  id, kind: 'window', zones: [zone, 'outside'], out, x, z,
  w: out === 'n' || out === 's' ? len : 0.5,
  d: out === 'n' || out === 's' ? 0.5 : len,
});

export const harrowRidge: MapDef = {
  id: 'harrow_ridge',
  name: 'Harrow Ridge Station',
  size: { w: 70, d: 70 },
  zones: [
    { id: 'mess', name: 'Mess Hall', letter: 'm', ambient: 0x2a241e },
    { id: 'bunk', name: 'Bunkhouse', letter: 'b', ambient: 0x221c18 },
    { id: 'lab', name: 'Laboratory', letter: 'l', ambient: 0x1a2622 },
    { id: 'cold', name: 'Cold Storage', letter: 'c', ambient: 0x161e2a },
    { id: 'gen', name: 'Generator Hall', letter: 'g', ambient: 0x221a12 },
    { id: 'motor', name: 'Motor Pool', letter: 'p', ambient: 0x24201a },
    { id: 'yard', name: 'Courtyard', letter: 'y', ambient: 0x1c2638 },
    { id: 'comms', name: 'Comms Bunker', letter: 'k', ambient: 0x141e18 },
    { id: 'vault', name: 'Vault', letter: 'v', ambient: 0x1a1424 },
  ],
  rooms: [
    { id: 'mess', zone: 'mess', x: 22.5, z: 22, w: 14, d: 10, ceil: 3.2, floor: 'lino', wall: 'panel', tint: 0xd8c8a8 },
    { id: 'bunk', zone: 'bunk', x: 6, z: 23, w: 16, d: 8, ceil: 2.8, floor: 'plank', wall: 'panel', tint: 0xc8a888 },
    { id: 'washroom', zone: 'bunk', x: 8, z: 18.5, w: 6, d: 4, ceil: 2.6, floor: 'tile', wall: 'plaster', tint: 0xb8d0c8 },
    { id: 'lab', zone: 'lab', x: 6, z: 6, w: 16, d: 12, ceil: 3.4, floor: 'tile', wall: 'plaster', tint: 0xc0d8d0 },
    { id: 'cold', zone: 'cold', x: 22.5, z: 8, w: 20, d: 7, ceil: 3, floor: 'metal', wall: 'metal', tint: 0xa8c0d8 },
    { id: 'tunnel', zone: 'cold', x: 42.5, z: 11, w: 11.5, d: 4, ceil: 2.6, floor: 'concrete', wall: 'rock', tint: 0xa0a8b8 },
    { id: 'tunnel_leg', zone: 'cold', x: 50, z: 15, w: 4, d: 8, ceil: 2.6, floor: 'concrete', wall: 'rock', tint: 0xa0a8b8 },
    { id: 'gen', zone: 'gen', x: 48, z: 23.5, w: 14, d: 12, ceil: 5, floor: 'metal', wall: 'block', tint: 0xc8b090 },
    { id: 'motor', zone: 'motor', x: 46.5, z: 36, w: 16, d: 12, ceil: 4.5, floor: 'concrete', wall: 'block', tint: 0xc0b8a8 },
    { id: 'yard', zone: 'yard', x: 20, z: 32.5, w: 26, d: 20, ceil: 3.5, floor: 'snow', wall: 'fence', outdoor: true, tint: 0xc8d8f0 },
    { id: 'comms', zone: 'comms', x: 24, z: 53, w: 12, d: 10, ceil: 2.8, floor: 'concrete', wall: 'block', tint: 0xa8c0a8 },
    { id: 'vault', zone: 'vault', x: 36.5, z: 55, w: 6, d: 6, ceil: 2.6, floor: 'metal', wall: 'metal', tint: 0xb8a8d0 },
  ],
  openings: [
    door('d_mess_bunk', 'mess', 'bunk', 750, 22, 26, 0.5, 2),
    door('d_mess_yard', 'mess', 'yard', 750, 28, 32, 2, 0.5),
    { id: 'a_bunk_wash', kind: 'arch', zones: ['bunk', 'bunk'], x: 10, z: 22.5, w: 2, d: 0.5 },
    { ...door('d_bunk_lab', 'bunk', 'lab', 1000, 10, 18, 2, 0.5), style: 'debris' },
    door('d_lab_cold', 'lab', 'cold', 1250, 22, 10, 0.5, 2),
    door('d_cold_gen', 'cold', 'gen', 1000, 51, 23, 2, 0.5),
    door('d_gen_motor', 'gen', 'motor', 1250, 54, 35.5, 2, 0.5),
    door('d_yard_motor', 'yard', 'motor', 1000, 46, 41, 0.5, 2),
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
    win('w_gen_e', 'gen', 'e', 62, 28),
    win('w_gen_n', 'gen', 'n', 58, 23),
    win('w_motor_e', 'motor', 'e', 62.5, 41),
    win('w_motor_s', 'motor', 's', 54, 48),
    win('w_yard_w', 'yard', 'w', 19.5, 40, 2),
    win('w_yard_n', 'yard', 'n', 40, 32, 2),
    win('w_yard_e', 'yard', 'e', 46, 49.5, 2),
    win('w_comms_w', 'comms', 'w', 23.5, 57),
    win('w_comms_s', 'comms', 's', 29, 63),
  ],
  props: [...westProps],
  interactables: [],
  playerSpawns: [
    { x: 28, z: 26, yaw: 0 },
    { x: 31, z: 26, yaw: 0 },
    { x: 28, z: 28.5, yaw: 0 },
    { x: 31, z: 28.5, yaw: 0 },
  ],
  lights: [
    ...westLights,
    // The rest of the station is dressed in sessions 8 and 9; until then, bare bulbs.
    lamp(27, 11.5, 2.8, LIGHT.ice, 8), lamp(37, 11.5, 2.8, LIGHT.ice, 8),
    glow(47, 13, 2.4, LIGHT.red, 6, { fixture: 'cage', intensity: 0.9 }), glow(52, 19, 2.4, LIGHT.red, 6, { fixture: 'cage', intensity: 0.9 }),
    lamp(52, 29, 4.6, LIGHT.amber, 10), lamp(58, 31, 4.6, LIGHT.amber, 10),
    lamp(51, 40, 4.2, LIGHT.sodium, 10), lamp(58, 44, 4.2, LIGHT.sodium, 10),
    lamp(24, 36, 5, LIGHT.flood, 13, { fixture: 'flood', intensity: 0.9 }), lamp(42, 50, 5, LIGHT.flood, 13, { fixture: 'flood', intensity: 0.9 }),
    lamp(33, 43, 5, LIGHT.flood, 12, { fixture: 'flood', intensity: 0.7 }),
    lamp(27, 57, 2.6, LIGHT.crt, 7), lamp(33, 60, 2.6, LIGHT.crt, 7),
    lamp(39.5, 58, 2.4, LIGHT.arc, 6),
  ],
};
