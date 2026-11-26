import { describe, expect, it } from 'vitest';
import { CELL_SIZE, PLAYER_RADIUS } from '../constants';
import { moveCircle } from '../nav/collide';
import { lineOfSight } from '../nav/los';
import { compileMap } from './compile';
import { corner } from './corner';
import { harrowRidge } from './harrowRidge';
import { BLOCK_HEIGHT, PARAPET, ROOF_SLAB, checkBlocks, massing } from './massing';
import { FLOOR_STYLES, WALL_STYLES, type MapDef } from './types';
import { validateMap } from './validate';

// A city's outside (PLAN section 9, M2), proved on the Corner: the solid has a height.

const map = compileMap(corner);
const ms = massing(map)!;
const col = (x: number, z: number): number => Math.floor(z / CELL_SIZE) * map.cols + Math.floor(x / CELL_SIZE);

describe('the Corner compiles', () => {
  it('is a valid map of four storeys in the city\'s surfaces', () => {
    expect(map.errors).toEqual([]);
    expect(validateMap(map).errors).toEqual([]);
    expect(map.levels.map((l) => l.y)).toEqual([-4, 0, 4, 8]);
    const used = (styles: readonly string[], of: Uint8Array) => new Set([...of].filter((_, i) => map.kind[i] !== 0).map((s) => styles[s]));
    expect([...used(FLOOR_STYLES, map.floorStyle)]).toEqual(expect.arrayContaining(['asphalt', 'pavement', 'felt']));
    expect([...used(WALL_STYLES, map.wallStyle)]).toEqual(expect.arrayContaining(['brick', 'shopfront', 'subway']));
  });

  it('paves the pockets behind its windows as the scene says', () => {
    const sp = map.spawns.find((s) => s.windowId === 'w_street')!;
    const i = map.cellAt(sp.x, sp.y, sp.z);
    expect(FLOOR_STYLES[map.floorStyle[i]!]).toBe('asphalt');
    expect(WALL_STYLES[map.wallStyle[i]!]).toBe('brick');
  });

  it('a kerb is a step and a roof\'s edge is a drop', () => {
    let p = { x: 20, y: 0, z: 19.5 };
    for (let d = 0; d < 2; d += 0.1) p = moveCircle(map, 'all', p.x, p.y, p.z, 0, -0.1, PLAYER_RADIUS);
    expect(p.y).toBeCloseTo(0.15);
    expect(p.z).toBeLessThan(18);
    p = { x: 16, y: 8, z: 14 };
    for (let d = 0; d < 4; d += 0.1) p = moveCircle(map, 'all', p.x, p.y, p.z, 0, 0.1, PLAYER_RADIUS);
    expect(p.y).toBe(8);
    expect(p.z).toBeLessThan(16);
    // From up there the street is in plain sight, and from the street the roof's edge.
    expect(lineOfSight(map, 16, 8, 15.5, 18, 0, 21)).toBe(true);
    expect(lineOfSight(map, 16, 8, 10, 18, 0, 21)).toBe(false);
  });
});

describe('massing: how tall the solid stands', () => {
  it('is only for a city', () => {
    expect(massing(compileMap(harrowRidge))).toBeNull();
    expect(massing(map)).toBe(ms);
  });

  it('the street, a walked roof and a pocket are open from their floors', () => {
    for (const [x, z, floor, ceiling] of [[20, 21, 0, 4], [20, 17, 0.15, 4], [16, 10, 8, 10.5], [16, 3, 4, 7.5], [20, 3, 0, 3.5]] as const) {
      expect(ms.open[col(x, z)], `${x}, ${z}`).toBe(1);
      expect(ms.top[col(x, z)], `${x}, ${z}`).toBeCloseTo(floor);
      expect(ms.drawn[col(x, z)], `${x}, ${z}`).toBeCloseTo(ceiling);
    }
    expect(ms.highest).toBe(8);
  });

  it('a building is as tall as its block, with a parapet round its rim', () => {
    expect(ms.top[col(4, 8)]).toBe(20);
    expect(ms.roof[col(0.2, 8)]).toBe(20);
    expect(ms.top[col(0.2, 8)]).toBe(20 + PARAPET);
    // The low building next to the shop: a rim over the street, none against the shop's taller wall.
    expect(ms.top[col(30, 15.8)]).toBe(5.5 + PARAPET);
    expect(ms.top[col(24.7, 10)]).toBe(5.5);
    expect(ms.top[col(30, 10)]).toBe(5.5);
    // Where blocks overlap the later one has the ground; the boards across the street's end have no rim.
    expect(ms.top[col(46, 28)]).toBe(22);
    expect(ms.top[col(3.7, 17)]).toBe(3.5);
    expect(corner.blocks![ms.block[col(3.7, 17)]!]!.face).toBe('fence');
  });

  it('rooms taller than their block stand through its roof, their walls with them', () => {
    // The head of the stairs to the roof: a room 7.5 m high on the upper floor, in a block 8 m tall.
    const hut = 4 + 7.5 + ROOF_SLAB;
    expect(ms.open[col(23, 10)]).toBe(0);
    expect(ms.top[col(23, 10)]).toBe(hut);
    expect(ms.top[col(21.7, 10)]).toBe(hut);
    expect(ms.top[col(24.2, 10)]).toBe(hut);
    // The lobby at its foot is under the roof people walk on.
    expect(ms.open[col(23, 15)]).toBe(1);
  });

  it('solid that no block covers is a building all the same', () => {
    const bare = massing(compileMap({ ...corner, blocks: [] }))!;
    expect(bare.roof[col(4, 8)]).toBe(BLOCK_HEIGHT);
    expect(bare.top[col(8.2, 8)]).toBe(BLOCK_HEIGHT + PARAPET);
    expect(bare.top[col(20, 21)]).toBe(0);
  });

  it('the validator turns away blocks that are off the grid, off the map, or on a map that is not a city', () => {
    const errors = (def: MapDef) => checkBlocks(compileMap(def));
    expect(errors(corner)).toEqual([]);
    const b = corner.blocks![0]!;
    expect(errors({ ...corner, blocks: [{ ...b, x: 0.25 }] })[0]).toMatch(/not aligned/);
    expect(errors({ ...corner, blocks: [{ ...b, w: 60 }] })[0]).toMatch(/outside the map/);
    expect(errors({ ...corner, blocks: [{ ...b, h: 0 }] })[0]).toMatch(/empty/);
    expect(errors({ ...harrowRidge, blocks: [b] })[0]).toMatch(/built 'station'/);
    expect(validateMap(compileMap({ ...corner, blocks: [{ ...b, x: 0.25 }] })).errors.join()).toMatch(/not aligned/);
  });
});
