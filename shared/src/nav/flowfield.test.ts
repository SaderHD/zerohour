import { describe, expect, it } from 'vitest';
import { CELL_SIZE, PLAYER_RADIUS } from '../constants';
import { compileMap } from '../map/compile';
import { harrowRidge } from '../map/harrowRidge';
import { mapWindows } from '../map/windows';
import { moveCircle } from './collide';
import { FlowField, UNREACHABLE } from './flowfield';

const map = compileMap(harrowRidge);
const spawn = harrowRidge.playerSpawns[0]!;

/** Walk a circle downhill and return how far from the goal it ends up. */
function walk(field: FlowField, open: Set<string> | 'all', x: number, y: number, z: number, maxSteps = 4000): number {
  const d = { x: 0, z: 0 };
  for (let i = 0; i < maxSteps && field.dir(x, y, z, d); i++) {
    ({ x, y, z } = moveCircle(map, open, x, y, z, d.x * 0.1, d.z * 0.1, PLAYER_RADIUS));
  }
  return Math.hypot(x - field.goalX, z - field.goalZ);
}

describe('flow field', () => {
  it('measures straight-line distance in open floor', () => {
    const f = new FlowField(map);
    expect(f.compute(undefined, spawn.x, 0, spawn.z)).toBe(true);
    expect(f.costAt(spawn.x, 0, spawn.z)).toBe(0);
    expect(f.costAt(spawn.x + 3, 0, spawn.z)).toBe((3 / CELL_SIZE) * 10);
  });

  it('respects closed doors and opens up with them', () => {
    const f = new FlowField(map);
    f.compute(undefined, spawn.x, 0, spawn.z);
    expect(f.costAt(30, 0, 40)).toBe(UNREACHABLE); // the courtyard, behind a closed door
    f.compute(new Set(['d_mess_yard']), spawn.x, 0, spawn.z);
    expect(f.costAt(30, 0, 40)).toBeLessThan(UNREACHABLE);
    expect(f.costAt(10, 0, 27)).toBe(UNREACHABLE); // bunkhouse still shut
  });

  it('refuses a goal inside a wall', () => {
    expect(new FlowField(map).compute('all', 1, 0, 1)).toBe(false);
  });

  it('leads a walker from every window to the player spawn', () => {
    const f = new FlowField(map);
    f.compute('all', spawn.x, 0, spawn.z);
    for (const w of mapWindows(map)) {
      expect(f.costAt(w.inX, w.y, w.inZ), w.id).toBeLessThan(UNREACHABLE);
      expect(walk(f, 'all', w.inX, w.y, w.inZ), w.id).toBeLessThan(0.75);
    }
  });

  it('gives every window a tear point outside and a landing point on the floor inside', () => {
    const wins = mapWindows(map);
    expect(wins).toHaveLength(harrowRidge.openings.filter((o) => o.kind === 'window').length);
    for (const w of wins) {
      expect(map.walkAt(Math.floor(w.inX / CELL_SIZE), Math.floor(w.inZ / CELL_SIZE), w.y), w.id).toBeGreaterThanOrEqual(0);
      expect(map.zoneAt(w.inX, w.y, w.inZ), w.id).toBe(w.zone);
      expect(map.zoneAt(w.outX, w.y, w.outZ), w.id).toBeNull();
    }
  });
});
