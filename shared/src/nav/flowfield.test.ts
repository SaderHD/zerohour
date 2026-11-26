import { describe, expect, it } from 'vitest';
import { CELL_SIZE, PLAYER_RADIUS } from '../constants';
import { Cell, compileMap } from '../map/compile';
import { harrowRidge } from '../map/harrowRidge';
import { longestNight } from '../map/longestNight';
import { stacks } from '../map/stacks';
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

  it('is the shortest way exactly: the same as a search with no queue at all, on every kind of map', () => {
    // Bellman-Ford over the same steps: slow, and nothing to get wrong.
    const reference = (m: typeof map, open: Set<string> | 'all', goal: number): Uint16Array => {
      const dist = new Uint16Array(m.kind.length).fill(UNREACHABLE);
      dist[goal] = 0;
      const wall = (j: number): number => {
        for (let n = 0; n < 8; n++) {
          const k = m.links[j * 8 + n]!;
          if (k < 0 || !(m.kind[k] === Cell.Floor || m.kind[k] === Cell.Door) || m.block[k]) return 8;
        }
        return 0;
      };
      const cost = new Uint8Array(m.kind.length);
      for (let i = 0; i < cost.length; i++) if (m.walkable(i, open)) cost[i] = wall(i);
      for (let changed = true; changed; ) {
        changed = false;
        for (let i = 0; i < dist.length; i++) {
          if (dist[i] === UNREACHABLE) continue;
          for (let n = 0; n < 8; n++) {
            const j = m.links[i * 8 + n]!;
            if (j < 0 || !m.walkable(j, open)) continue;
            if (n >= 4 && !(m.walkable(m.links[i * 8 + (n < 6 ? 0 : 1)]!, open) && m.walkable(m.links[i * 8 + (n % 2 === 0 ? 2 : 3)]!, open))) continue;
            const nd = dist[i]! + (n < 4 ? 10 : 14) + cost[j]!;
            if (nd < dist[j]!) {
              dist[j] = nd;
              changed = true;
            }
          }
        }
      }
      return dist;
    };
    for (const [def, open] of [[stacks, 'all'], [stacks, new Set(['d_loft'])], [longestNight, new Set(['d_diner_square', 'd_square_subway'])]] as const) {
      const m = compileMap(def);
      const s = m.playerSpawns[0]!;
      const field = new FlowField(m);
      expect(field.compute(open, s.x, s.y, s.z)).toBe(true);
      const want = reference(m, open, m.cellAt(s.x, s.y, s.z));
      let differ = 0;
      let reached = 0;
      for (let i = 0; i < want.length; i++) {
        if (field.dist[i] !== want[i]) differ++;
        if (want[i] !== UNREACHABLE) reached++;
      }
      expect(differ, def.id).toBe(0);
      expect(reached, def.id).toBeGreaterThan(500);
    }
  });

  it('costs a field what the map has of floor, not what it has of rock', () => {
    // The Longest Night is a grid of 216,000 cells with a ninth of them floor: a recompute a tick has to stay a small part of the tick.
    const m = compileMap(longestNight);
    const field = new FlowField(m);
    const s = m.playerSpawns[0]!;
    for (let i = 0; i < 5; i++) field.compute('all', s.x, s.y, s.z);
    const t = Date.now();
    for (let i = 0; i < 20; i++) field.compute('all', s.x + (i % 4), s.y, s.z);
    expect((Date.now() - t) / 20).toBeLessThan(4);
  });
});
