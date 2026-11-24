import { describe, expect, it } from 'vitest';
import { compileMap } from '../map/compile';
import { harrowRidge } from '../map/harrowRidge';
import { GALLERY_Y, TERRACE_N, TERRACE_S, VAULT_Y } from '../map/terraces';
import { DeadEnds } from './deadends';

const map = compileMap(harrowRidge);
const doors = map.def.openings.filter((o) => o.kind === 'door').map((o) => o.id);

describe('dead ends', () => {
  const dead = new DeadEnds(map);
  const all = new Set(doors);

  it('with every door open, the vault and its stairs are one and the loop is not', () => {
    expect(dead.at(all, 30, VAULT_Y, 57)).toBe(true); // the vault floor
    expect(dead.at(all, 37.5, TERRACE_S, 58)).toBe(true); // the head of its stairs
    expect(dead.at(all, 30, TERRACE_S, 56)).toBe(true); // the bunker hangs off the yard by one door
    for (const [x, y, z] of [[29, 0, 27], [14, 0, 27], [14, TERRACE_N, 10], [30, TERRACE_N, 13], [55, 0, 29], [55, TERRACE_S, 44], [30, 0, 35], [30, TERRACE_S, 48]] as const) {
      expect(dead.at(all, x, y, z), `${x}, ${z}`).toBe(false);
    }
  });

  it('a gallery with stairs at both ends is a way through; a wide-mouthed recess is part of its room', () => {
    expect(dead.at(all, 56, GALLERY_Y, 24.75)).toBe(false);
    expect(dead.at(all, 56, 0, 24.75)).toBe(false); // under the gallery
    expect(dead.at(all, 18, TERRACE_N, 5)).toBe(false); // the specimen bay
    expect(dead.at(all, 37.5, 0, 30.5)).toBe(true); // the servery: three metres of mouth
  });

  it('a wing whose other door is still shut is a dead end until it opens', () => {
    const early = new Set(['d_mess_bunk']);
    expect(new DeadEnds(map).at(early, 14, 0, 27)).toBe(true);
    expect(new DeadEnds(map).at(new Set(['d_mess_bunk', 'd_bunk_lab', 'd_lab_cold', 'd_cold_gen', 'd_gen_motor', 'd_yard_motor', 'd_mess_yard']), 14, 0, 27)).toBe(false);
  });

  it('nowhere off the floor counts', () => {
    expect(dead.at(all, 1, 0, 1)).toBe(false);
  });
});
