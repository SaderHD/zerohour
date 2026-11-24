import { describe, expect, it } from 'vitest';
import { CELL_SIZE, PLAYER_RADIUS, STEP_HEIGHT } from '../constants';
import { circleFits, moveCircle } from '../nav/collide';
import { FlowField, UNREACHABLE } from '../nav/flowfield';
import { lineOfSight, lineWalkable } from '../nav/los';
import { rayWorld } from '../nav/ray';
import { asciiLevels } from './ascii';
import { Cell, compileMap, type DoorSet } from './compile';
import { stacks } from './stacks';
import type { MapDef } from './types';
import { floodWalkable, validateMap } from './validate';
import { mapWindows } from './windows';

// Height: floors at different levels, ramps and stairs, and rooms that lie over each other
// (PLAN 6.1-6.3), proved on the Stacks.

const map = compileMap(stacks);
const cell = (v: number) => Math.floor(v / CELL_SIZE);

/** Walk a circle in a straight line for `dist` metres in small steps, as a player would. */
function walk(open: DoorSet, x: number, y: number, z: number, dx: number, dz: number, dist: number) {
  let p = { x, y, z };
  for (let d = 0; d < dist; d += 0.1) p = moveCircle(map, open, p.x, p.y, p.z, dx * 0.1, dz * 0.1, PLAYER_RADIUS);
  return p;
}

describe('the Stacks compile', () => {
  it('is a valid map of three storeys', () => {
    expect(map.errors).toEqual([]);
    expect(validateMap(map).errors).toEqual([]);
    expect(map.layers).toBe(3);
    expect(map.levels.map((l) => l.level)).toEqual([-1, 0, 1]);
    expect(map.ground).toBe(1);
  });

  it('stores one room over another: the same spot is a different cell at each height', () => {
    const at = (y: number) => map.walkAt(cell(10), cell(13.5), y);
    const [cellar, hall, loft] = [at(-3), at(0), at(3)];
    expect(new Set([cellar, hall, loft]).size).toBe(3);
    expect([cellar, hall, loft].every((i) => i >= 0)).toBe(true);
    expect([map.lo[cellar]!, map.lo[hall]!, map.lo[loft]!]).toEqual([-3, 0, 3]);
    expect(map.hi[hall]!).toBeLessThan(map.lo[loft]!); // a slab between them
    expect(at(1.5)).toBe(-1); // nobody stands inside the hall's air
    expect([map.zoneAt(10, -3, 13.5), map.zoneAt(10, 0, 13.5), map.zoneAt(10, 3, 13.5)]).toEqual(['cellar', 'hall', 'loft']);
    expect(map.nearestFloor(10, 2.2, 13.5)).toBe(3);
    expect(map.floorUnder(10, 1.4, 13.5)).toBe(0);
    expect(map.floorUnder(10, 4, 13.5)).toBe(3);
  });

  it('furniture blocks only the floor it stands on', () => {
    // A crate stack in the loft at (9, 12); the hall and cellar below it are clear.
    expect(circleFits(map, 'all', 9, 3, 12, PLAYER_RADIUS)).toBe(false);
    expect(circleFits(map, 'all', 9, 0, 12, PLAYER_RADIUS)).toBe(true);
    expect(circleFits(map, 'all', 9, -3, 12, PLAYER_RADIUS)).toBe(true);
    // And the hall's crate at (13, 13) is not in the loft's way.
    expect(circleFits(map, 'all', 13, 0, 13, PLAYER_RADIUS)).toBe(false);
    expect(circleFits(map, 'all', 13, 3, 13, PLAYER_RADIUS)).toBe(true);
  });

  it('gives ramps and stairs equal risers that meet the floors at both ends', () => {
    // The ramp: 7 cells from the hall floor (0) to the landing (1).
    const ramp = Array.from({ length: 7 }, (_, k) => map.lo[map.idx(cell(20) + k, cell(8.5))]!);
    ramp.forEach((h, k) => expect(h).toBeCloseTo((k + 1) / 8));
    // The west stairs: 11 treads of 0.25 m from the lobby (0) up to the loft's door (3).
    const stairs = Array.from({ length: 11 }, (_, k) => map.lo[map.idx(cell(3.5), cell(15) - k)]!);
    stairs.forEach((h, k) => expect(h).toBeCloseTo(0.25 * (k + 1)));
    expect(map.rise[map.idx(cell(3.5), cell(12))]).toBe(1 + 0 + 4); // climbs north, stairs
    expect(map.rise[map.idx(cell(21), cell(8.5))]).toBe(1 + 2); // climbs east, a ramp
  });

  it('prints a sheet for every storey', () => {
    const text = asciiLevels(map);
    expect(text).toContain('Level 1: Loft');
    expect(text).toContain('Level 0: Ground');
    expect(text).toContain('Level -1: Cellar');
    expect(text).toContain('>>>>>>>');
    expect(text).toContain('^^^^');
  });

  it('refuses floors that run into the room below, stairs too steep to walk, and rooms too low to stand in', () => {
    const edit = (f: (d: MapDef) => void): string => {
      const d = JSON.parse(JSON.stringify(stacks)) as MapDef;
      f(d);
      return compileMap(d).errors.join('\n');
    };
    expect(edit((d) => (d.levels!.find((l) => l.level === 1)!.y = 2.5))).toMatch(/floor inside the room below/);
    expect(edit((d) => (d.rooms.find((r) => r.id === 'ramp')!.rise!.by = 3))).toMatch(/too steep/);
    expect(edit((d) => (d.rooms.find((r) => r.id === 'stairs_up')!.ceil = 4))).toMatch(/headroom/);
    expect(edit((d) => (d.rooms.find((r) => r.id === 'loft')!.level = 2))).toMatch(/no level 2/);
    // A storey over a roofless pocket: move the loft's window pocket under... the terrace has no roof to give.
    expect(edit((d) => d.rooms.push({ id: 'over', zone: 'loft', level: 1, x: 15.5, z: 4.5, w: 3, d: 3, ceil: 2.6, floor: 'plank', wall: 'panel' }))).toMatch(/open sky/);
  });
});

describe('walking over height', () => {
  it('follows a ramp up and back down', () => {
    const up = walk('all', 19, 0, 9, 1, 0, 6);
    expect(up.x).toBeGreaterThan(24.5);
    expect(up.y).toBeCloseTo(1);
    const down = walk('all', up.x, up.y, up.z, -1, 0, 6);
    expect(down.x).toBeLessThan(19.5);
    expect(down.y).toBe(0);
  });

  it('is stopped by a ledge from below and from above', () => {
    // The terrace stands a metre over the hall along x = 20.
    const below = walk('all', 18, 0, 15, 1, 0, 4);
    expect(below.x).toBeCloseTo(20 - PLAYER_RADIUS, 1);
    expect(below.y).toBe(0);
    const above = walk('all', 22, 1, 15, -1, 0, 4);
    expect(above.x).toBeCloseTo(20 + PLAYER_RADIUS, 1);
    expect(above.y).toBe(1);
    expect(lineWalkable(map, 18, 0, 15, 22, 1, 15, 'all')).toBe(false);
    expect(lineWalkable(map, 19, 0, 9, 25, 1, 9, 'all')).toBe(true); // up the ramp
  });

  it('climbs the stairs to the loft and goes down to the cellar, through their doors only when open', () => {
    const shut = walk(undefined, 4, 0, 16.5, 0, -1, 9);
    expect(shut.z).toBeCloseTo(10 + PLAYER_RADIUS, 1); // nose against the loft's door
    expect(shut.y).toBeCloseTo(2.75);
    const loft = walk('all', 4, 0, 16.5, 0, -1, 9);
    expect(loft.z).toBeLessThan(9);
    expect(loft.y).toBe(3);
    expect(map.zoneAt(loft.x, loft.y, loft.z)).toBe('loft');
    const cellar = walk('all', 11, 0, 17, 0, 1, 9);
    expect(cellar.z).toBeGreaterThan(24.5);
    expect(cellar.y).toBe(-3);
    expect(map.zoneAt(cellar.x, cellar.y, cellar.z)).toBe('cellar');
    // Every step on the way was one a body can take.
    let p = { x: 4, y: 0, z: 16.5 };
    for (let i = 0; i < 90; i++) {
      const q = moveCircle(map, 'all', p.x, p.y, p.z, 0, -0.1, PLAYER_RADIUS);
      expect(Math.abs(q.y - p.y)).toBeLessThanOrEqual(STEP_HEIGHT);
      p = q;
    }
  });

  it('keeps a random walker inside the walls on every storey', () => {
    let p = { x: 9, y: 0, z: 15 };
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const zones = new Set<string>();
    const floors = new Set<number>();
    let heading = 0;
    for (let i = 0; i < 80000; i++) {
      if (i % 40 === 0) heading = rnd() * Math.PI * 2;
      const step = 0.05 + rnd() * 0.5;
      const q = moveCircle(map, 'all', p.x, p.y, p.z, Math.cos(heading) * step, Math.sin(heading) * step, PLAYER_RADIUS);
      if (!circleFits(map, 'all', q.x, q.y, q.z, PLAYER_RADIUS - 0.01)) throw new Error(`clipped at ${q.x}, ${q.y}, ${q.z} (step ${i})`);
      if (map.cellAt(q.x, q.y, q.z) < 0) throw new Error(`off the floor at ${q.x}, ${q.y}, ${q.z} (step ${i})`);
      p = q;
      zones.add(map.zoneAt(p.x, p.y, p.z) ?? '?');
      floors.add(Math.round(p.y));
    }
    expect([...zones].sort()).toEqual(['cellar', 'hall', 'loft']);
    expect(floors.has(-3) && floors.has(0) && floors.has(1) && floors.has(3)).toBe(true);
  });

  it('floods every storey from the spawn with the doors open, and only the hall with them shut', () => {
    const s = map.playerSpawns[0]!;
    const zonesOf = (mask: Uint8Array) => new Set([...mask.keys()].filter((i) => mask[i]).map((i) => map.zones[map.zone[i]!]!.id));
    expect([...zonesOf(floodWalkable(map, s.x, s.y, s.z, 'all'))].sort()).toEqual(['cellar', 'hall', 'loft']);
    expect([...zonesOf(floodWalkable(map, s.x, s.y, s.z, undefined))]).toEqual(['hall']);
  });
});

describe('sight and shots over height', () => {
  it('floors and ceilings block sight; a ledge and a staircase do not', () => {
    expect(lineOfSight(map, 10, 0, 13, 12, 3, 13, 'all')).toBe(false); // hall to the loft above it
    expect(lineOfSight(map, 10, 0, 13, 12, -3, 13, 'all')).toBe(false); // hall to the cellar below
    expect(lineOfSight(map, 12, 0, 13.2, 12, 3, 13.2, 'all')).toBe(false); // straight overhead, in the same column
    expect(lineOfSight(map, 12, 0, 13.2, 12.1, -3, 13.3, 'all')).toBe(false); // and straight underfoot
    expect(lineOfSight(map, 8, 3, 15, 14, 3, 15, 'all')).toBe(true); // across the loft
    expect(lineOfSight(map, 17, 0, 15, 23, 1, 15, 'all')).toBe(true); // up onto the terrace
    expect(lineOfSight(map, 4, 0, 16.5, 4, 2.75, 10.2, 'all')).toBe(true); // up the stairs
    expect(lineOfSight(map, 4, 0, 16.5, 4, 3, 8.5, 'all')).toBe(true); // and through the open door at their head
    expect(lineOfSight(map, 4, 0, 16.5, 4, 3, 8.5, undefined)).toBe(false); // not when it is shut
  });

  it('rays stop at the floor above, the floor below and the face of a ledge', () => {
    expect(rayWorld(map, 'all', 10, 1.6, 13.2, 0, 1, 0, 50)).toBeCloseTo(1.2); // the hall's ceiling at 2.8
    expect(rayWorld(map, 'all', 12, 4, 13.2, 0, -1, 0, 50)).toBeCloseTo(1); // the loft's floor at 3
    expect(rayWorld(map, 'all', 12, -1.4, 13.2, 0, 1, 0, 50)).toBeCloseTo(1.1); // the cellar's ceiling at -0.3
    expect(rayWorld(map, 'all', 18, 0.5, 15.2, 1, 0, 0, 50)).toBeCloseTo(2); // the terrace's face
    expect(rayWorld(map, 'all', 18, 1.6, 15.2, 1, 0, 0, 50)).toBeCloseTo(8); // over it to the far wall
    const d = Math.SQRT1_2;
    // Down a slope of 45 degrees from the top of the stairwell: it lands on a tread, not through to anything below.
    // (3.25 m along it drops to 1.25 m, the top of the fifth tread.)
    expect(rayWorld(map, 'all', 4, 4.5, 10.2, 0, -d, d, 50)).toBeCloseTo(3.25 / d);
  });
});

describe('paths over height', () => {
  it('measures the way round by the stairs, not the distance through the floor', () => {
    const f = new FlowField(map);
    expect(f.compute('all', 12, 3, 13)).toBe(true);
    expect(f.costAt(12, 3, 13)).toBe(0);
    const below = f.costAt(12, 0, 13);
    expect(below).toBeLessThan(UNREACHABLE);
    expect(below).toBeGreaterThan(20 * 20); // more than 20 m of walking to a spot 3 m overhead
    expect(f.costAt(12, -3, 13)).toBeGreaterThan(below);
    f.compute(undefined, 12, 3, 13);
    expect(f.costAt(12, 0, 13)).toBe(UNREACHABLE); // the loft's door is shut
    expect(f.compute('all', 12, 1.5, 13)).toBe(false); // no floor at that height
  });

  it('leads a walker from every window, on every storey, to a goal on any other', () => {
    const f = new FlowField(map);
    const dir = { x: 0, z: 0 };
    for (const goal of [{ x: 12, y: 3, z: 15 }, { x: 8, y: -3, z: 10 }, { x: 23, y: 1, z: 16 }]) {
      expect(f.compute('all', goal.x, goal.y, goal.z)).toBe(true);
      for (const w of mapWindows(map)) {
        let p = { x: w.inX, y: w.y, z: w.inZ };
        expect(f.costAt(p.x, p.y, p.z), w.id).toBeLessThan(UNREACHABLE);
        for (let i = 0; i < 4000 && f.dir(p.x, p.y, p.z, dir); i++) p = moveCircle(map, 'all', p.x, p.y, p.z, dir.x * 0.1, dir.z * 0.1, PLAYER_RADIUS);
        expect(Math.hypot(p.x - goal.x, p.z - goal.z), `${w.id} -> ${goal.y}`).toBeLessThan(0.75);
        expect(p.y, `${w.id} -> ${goal.y}`).toBe(goal.y);
      }
    }
  });

  it('puts each window, its pocket and its spawn at the height of its own floor', () => {
    const wins = mapWindows(map);
    expect(wins.map((w) => [w.id, w.y])).toEqual([['w_hall', 0], ['w_loft', 3], ['w_cellar', -3]]);
    for (const w of wins) {
      const sp = map.spawns.find((s) => s.windowId === w.id)!;
      expect(sp.y).toBe(w.y);
      expect(map.kind[map.cellAt(sp.x, sp.y, sp.z)]).toBe(Cell.Outside);
      expect(map.zoneAt(w.inX, w.y, w.inZ)).toBe(w.zone);
    }
  });
});
