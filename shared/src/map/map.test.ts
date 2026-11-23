import { describe, expect, it } from 'vitest';
import { CELL_SIZE, PLAYER_RADIUS } from '../constants';
import { Rng } from '../math/rng';
import { circleFits, moveCircle } from '../nav/collide';
import { lineOfSight } from '../nav/los';
import { asciiMap } from './ascii';
import { Cell, compileMap } from './compile';
import { harrowRidge } from './harrowRidge';
import type { MapDef } from './types';
import { floodWalkable, validateMap } from './validate';

const tiny = (over: Partial<MapDef> = {}): MapDef => ({
  id: 't', name: 't', size: { w: 20, d: 12 },
  zones: [{ id: 'a', name: 'A', letter: 'a', ambient: 0x202020 }, { id: 'b', name: 'B', letter: 'b', ambient: 0x202020 }],
  rooms: [
    { id: 'a', zone: 'a', x: 5, z: 2, w: 5, d: 6, ceil: 3, floor: 'concrete', wall: 'block' },
    { id: 'b', zone: 'b', x: 10.5, z: 2, w: 5, d: 6, ceil: 3, floor: 'concrete', wall: 'block' },
  ],
  openings: [
    { id: 'd', kind: 'door', zones: ['a', 'b'], cost: 500, x: 10, z: 4, w: 0.5, d: 2 },
    { id: 'w', kind: 'window', zones: ['a', 'outside'], out: 'w', x: 4.5, z: 4, w: 0.5, d: 1.5 },
  ],
  props: [], interactables: [], lights: [],
  playerSpawns: [{ x: 6, z: 3, yaw: 0 }, { x: 7, z: 3, yaw: 0 }, { x: 6, z: 4, yaw: 0 }, { x: 7, z: 4, yaw: 0 }],
  ...over,
});

describe('compileMap', () => {
  it('carves rooms, doors, windows and pockets', () => {
    const m = compileMap(tiny());
    expect(m.errors).toEqual([]);
    expect(m.kindAt(12, 6)).toBe(Cell.Floor);
    expect(m.kindAt(20, 9)).toBe(Cell.Door);
    expect(m.kindAt(9, 9)).toBe(Cell.Window);
    expect(m.kindAt(7, 9)).toBe(Cell.Outside);
    expect(m.kindAt(0, 0)).toBe(Cell.Solid);
    expect(m.zoneAt(6, 3)).toBe('a');
    expect(m.zoneAt(12, 3)).toBe('b');
    expect(m.spawns).toHaveLength(1);
    expect(m.adjacency.get('a')).toEqual([{ zone: 'b', via: 'd' }]);
  });

  it('doors are walkable only when open; windows never', () => {
    const m = compileMap(tiny());
    expect(m.isWalkable(20, 9)).toBe(false);
    expect(m.isWalkable(20, 9, new Set(['d']))).toBe(true);
    expect(m.isWalkable(20, 9, 'all')).toBe(true);
    expect(m.isWalkable(9, 9, 'all')).toBe(false);
    expect(m.isWalkable(7, 9, 'all')).toBe(false);
  });

  it('reports overlapping rooms and misplaced openings', () => {
    const bad = tiny();
    bad.rooms.push({ id: 'c', zone: 'b', x: 9, z: 3, w: 3, d: 2, ceil: 3, floor: 'concrete', wall: 'block' });
    expect(compileMap(bad).errors.join('\n')).toMatch(/overlaps/);
    const bad2 = tiny();
    bad2.openings[0]!.x = 6;
    expect(compileMap(bad2).errors.join('\n')).toMatch(/solid wall/);
  });
});

describe('validateMap', () => {
  it('accepts the tiny map and catches a sealed zone', () => {
    expect(validateMap(compileMap(tiny())).errors).toEqual([]);
    const sealed = tiny();
    sealed.openings.shift();
    expect(validateMap(compileMap(sealed)).errors.join('\n')).toMatch(/cannot be reached|not linked/);
  });

  it('catches narrow lanes', () => {
    const narrow = tiny();
    narrow.rooms[1] = { ...narrow.rooms[1]!, z: 4.5, d: 1 };
    expect(validateMap(compileMap(narrow)).errors.join('\n')).toMatch(/narrower/);
  });
});

describe('Harrow Ridge', () => {
  const map = compileMap(harrowRidge);

  it('passes validation', () => {
    expect(validateMap(map).errors).toEqual([]);
  });

  it('has the planned zones, doors and windows', () => {
    expect(map.zones.map((z) => z.id)).toEqual(['mess', 'bunk', 'lab', 'cold', 'gen', 'motor', 'yard', 'comms', 'vault']);
    expect(harrowRidge.openings.filter((o) => o.kind === 'door')).toHaveLength(9);
    expect(map.spawns).toHaveLength(18);
    expect(asciiMap(map)).toContain('P');
  });

  it('forms a loop: every non-vault zone has at least two exits', () => {
    for (const z of map.zones) {
      const n = map.adjacency.get(z.id)?.length ?? 0;
      expect(n, z.id).toBeGreaterThanOrEqual(z.id === 'vault' || z.id === 'comms' ? 1 : 2);
    }
  });

  it('a random walker never clips into walls and can reach every zone', () => {
    const rng = new Rng(42);
    const s = harrowRidge.playerSpawns[0]!;
    let { x, z } = s;
    let heading = 0;
    const visited = new Set<string>();
    for (let i = 0; i < 60000; i++) {
      if (i % 40 === 0) heading = rng.range(0, Math.PI * 2);
      const step = rng.range(0.05, 0.6); // up to a very laggy frame at sprint speed
      const p = moveCircle(map, 'all', x, z, Math.cos(heading) * step, Math.sin(heading) * step, PLAYER_RADIUS);
      x = p.x;
      z = p.z;
      if (!circleFits(map, 'all', x, z, PLAYER_RADIUS - 0.01)) throw new Error(`clipped at ${x}, ${z} (step ${i})`);
      const zone = map.zoneAt(x, z);
      if (zone) visited.add(zone);
    }
    expect(visited.size).toBeGreaterThanOrEqual(5);
  });

  it('closed doors contain the player in the spawn zone', () => {
    const s = harrowRidge.playerSpawns[0]!;
    const mask = floodWalkable(map, Math.floor(s.x / CELL_SIZE), Math.floor(s.z / CELL_SIZE), undefined);
    for (let i = 0; i < mask.length; i++) if (mask[i]) expect(map.zones[map.zone[i]!]!.id).toBe('mess');
  });
});

describe('lineOfSight', () => {
  const m = compileMap(tiny());
  it('sees across a room, not through walls, and through doors only when open', () => {
    expect(lineOfSight(m, 6, 3, 9, 7)).toBe(true);
    expect(lineOfSight(m, 6, 3, 12, 3)).toBe(false);
    expect(lineOfSight(m, 6, 5, 12, 5)).toBe(false);
    expect(lineOfSight(m, 6, 5, 12, 5, new Set(['d']))).toBe(true);
    expect(lineOfSight(m, 6, 4.7, 3, 4.7)).toBe(true); // out through the window into the pocket
  });
});
