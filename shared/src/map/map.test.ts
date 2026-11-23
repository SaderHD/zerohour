import { describe, expect, it } from 'vitest';
import { CELL_SIZE, PLAYER_RADIUS } from '../constants';
import { Rng } from '../math/rng';
import { circleFits, moveCircle } from '../nav/collide';
import { propDef } from '../data/props';
import { WEAPONS } from '../data/weapons';
import { lineOfSight, lineWalkable } from '../nav/los';
import { rayWorld } from '../nav/ray';
import { asciiMap } from './ascii';
import { Cell, DIR_VEC, compileMap } from './compile';
import { TONICS } from './dressing/mounts';
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

describe('props', () => {
  const withProps = (...props: MapDef['props']) => compileMap(tiny({ props }));

  it('solid props take their cells out of the floor; clutter does not', () => {
    const m = withProps({ type: 'crate', x: 8, z: 6 }, { type: 'papers', x: 6.5, z: 6.5 });
    expect(m.errors).toEqual([]);
    expect(m.isWalkable(15, 11)).toBe(false);
    expect(m.isWalkable(16, 12)).toBe(false);
    expect(m.isWalkable(17, 12)).toBe(true);
    expect(m.isWalkable(13, 13)).toBe(true);
    expect(circleFits(m, undefined, 8, 6, PLAYER_RADIUS)).toBe(false);
    expect(asciiMap(m)).toContain('o');
  });

  it('turn in quarter turns: a 3 x 0.5 bench turned 90 degrees is 0.5 x 3', () => {
    const m = withProps({ type: 'bench', x: 7.75, z: 5.5, rot: 90 });
    expect(m.errors).toEqual([]);
    expect([8, 9, 10, 11, 12, 13].every((cz) => !m.isWalkable(15, cz))).toBe(true);
    expect(m.isWalkable(14, 10) && m.isWalkable(16, 10)).toBe(true);
    expect(withProps({ type: 'bench', x: 7.75, z: 5.5, rot: 45 }).errors.join('\n')).toMatch(/quarter turns/);
  });

  it('low props stop movement and low shots, but not sight; tall ones stop both', () => {
    const low = withProps({ type: 'crate', x: 8, z: 6 });
    expect(lineOfSight(low, 6, 6, 9.5, 6)).toBe(true);
    expect(lineWalkable(low, 6, 6, 9.5, 6)).toBe(false);
    expect(lineWalkable(low, 6, 4, 9.5, 4)).toBe(true);
    expect(rayWorld(low, undefined, 6, 0.5, 6, 1, 0, 0, 50)).toBeCloseTo(1.5); // into the crate's side
    expect(rayWorld(low, undefined, 6, 1.6, 6, 1, 0, 0, 50)).toBeCloseTo(4); // over it, to the far wall
    const d = Math.SQRT1_2;
    expect(rayWorld(low, undefined, 7, 2, 6, d, -d, 0, 50)).toBeCloseTo(1 / d); // down onto its top (1 m)
    const tall = withProps({ type: 'crate_stack', x: 8, z: 6 });
    expect(lineOfSight(tall, 6, 6, 9.5, 6)).toBe(false);
    expect(rayWorld(tall, undefined, 6, 1.6, 6, 1, 0, 0, 50)).toBeCloseTo(1.5);
  });

  it('reports props that are misplaced', () => {
    expect(withProps({ type: 'nope', x: 8, z: 6 }).errors.join('\n')).toMatch(/unknown type/);
    expect(withProps({ type: 'crate', x: 8.25, z: 6 }).errors.join('\n')).toMatch(/not aligned/);
    expect(withProps({ type: 'crate', x: 5, z: 6 }).errors.join('\n')).toMatch(/room floor/);
    expect(withProps({ type: 'crate', x: 8, z: 6 }, { type: 'barrel', x: 8.25, z: 6.25 }).errors.join('\n')).toMatch(/overlaps another prop/);
  });

  it('the validator rejects props that pinch a lane, wall off floor, or block a window', () => {
    // 1 m between the crate and the north wall.
    expect(validateMap(withProps({ type: 'crate', x: 8, z: 3.5 })).errors.join('\n')).toMatch(/narrower/);
    // A bench across the room's whole width seals the south half.
    const sealed = validateMap(withProps({ type: 'bench', x: 6.5, z: 5.75 }, { type: 'crate', x: 8.5, z: 5.5 }, { type: 'crate', x: 9.5, z: 5.5 }));
    expect(sealed.errors.join('\n')).toMatch(/cannot be reached|narrower/);
    expect(validateMap(withProps({ type: 'crate', x: 5.5, z: 4.5 })).errors.join('\n')).toMatch(/blocks the floor inside/);
    expect(validateMap(withProps({ type: 'crate', x: 9.5, z: 7.5 })).errors).toEqual([]);
  });
});

describe('Harrow Ridge dressing', () => {
  const map = compileMap(harrowRidge);
  const count = (zone: string, solid: boolean) =>
    harrowRidge.props.filter((p) => !!propDef(p.type)?.solid === solid && (map.zoneAt(p.x, p.z) ?? map.zoneAt(p.x + 0.3, p.z + 0.3) ?? map.zoneAt(p.x - 0.3, p.z - 0.3)) === zone).length;

  it('the west wing is furnished', () => {
    for (const zone of ['mess', 'bunk', 'lab']) {
      expect(count(zone, true), zone).toBeGreaterThanOrEqual(12);
      expect(count(zone, false), zone).toBeGreaterThanOrEqual(8);
    }
  });

  it('the industrial wing is furnished, each zone with its own pieces', () => {
    for (const zone of ['cold', 'gen', 'motor']) {
      expect(count(zone, true), zone).toBeGreaterThanOrEqual(12);
      expect(count(zone, false), zone).toBeGreaterThanOrEqual(8);
    }
    const has = (zone: string, type: string) => harrowRidge.props.filter((p) => p.type === type && map.zoneAt(p.x, p.z) === zone).length;
    expect(has('cold', 'rack')).toBeGreaterThanOrEqual(4);
    expect(has('cold', 'ice_block') + has('cold', 'ice_stack')).toBeGreaterThanOrEqual(3);
    expect(has('gen', 'generator')).toBe(2);
    expect(has('gen', 'fuel_tank')).toBeGreaterThanOrEqual(1);
    expect(has('motor', 'truck_cab') && has('motor', 'truck_bed') && has('motor', 'workbench')).toBeTruthy();
    expect(harrowRidge.rooms.some((r) => r.zone === 'cold' && r.mist)).toBe(true);
    expect(harrowRidge.zones.find((z) => z.id === 'cold')?.fog).toBeDefined();
  });

  it('the yard, the comms bunker and the vault are furnished, each with its own pieces', () => {
    expect(count('yard', true)).toBeGreaterThanOrEqual(20);
    expect(count('yard', false)).toBeGreaterThanOrEqual(20);
    expect(count('comms', true)).toBeGreaterThanOrEqual(12);
    expect(count('comms', false)).toBeGreaterThanOrEqual(8);
    expect(count('vault', true)).toBeGreaterThanOrEqual(8);
    expect(count('vault', false)).toBeGreaterThanOrEqual(8);
    const has = (zone: string, type: string) => harrowRidge.props.filter((p) => p.type === type && map.zoneAt(p.x, p.z) === zone).length;
    for (const type of ['truck_cab', 'truck_bed', 'snowcat', 'flagpole', 'mast']) expect(has('yard', type), type).toBe(1);
    expect(has('yard', 'guy_wire')).toBe(has('yard', 'anchor_block'));
    expect(has('yard', 'sandbags')).toBe(harrowRidge.openings.filter((o) => o.kind === 'window' && o.zones[0] === 'yard').length);
    expect(harrowRidge.lights.filter((l) => l.fixture === 'flood' && map.zoneAt(l.x, l.z) === 'yard').length).toBeGreaterThanOrEqual(4);
    for (const type of ['console', 'radar', 'map_table', 'radio_rack']) expect(has('comms', type), type).toBeGreaterThanOrEqual(1);
    expect(has('vault', 'forge')).toBe(1);
    expect(has('vault', 'stripes')).toBeGreaterThanOrEqual(2);
    expect(harrowRidge.openings.find((o) => o.id === 'd_vault')?.needsPower).toBe(true);
    // The yard is one zone however many strips its walls are painted in, and it is all outdoors.
    for (const r of harrowRidge.rooms) expect(r.zone === 'yard', r.id).toBe(!!r.outdoor);
  });

  it('everything a player can buy has a place to stand and a mount to see (PLAN 4.5-4.9)', () => {
    const its = harrowRidge.interactables;
    expect(new Set(its.map((i) => i.id)).size).toBe(its.length);
    const of = (kind: string) => its.filter((i) => i.kind === kind);
    const wallGuns = [...WEAPONS.values()].filter((w) => w.source === 'wall').map((w) => w.id as string).sort();
    expect(of('wallbuy').map((i) => i.ref).sort()).toEqual(wallGuns);
    expect(of('tonic').map((i) => i.ref).sort()).toEqual(TONICS.map((t) => t.id).sort());
    expect(of('cacheSite').map((i) => map.zoneAt(i.x, i.z))).toEqual(['yard', 'bunk', 'cold', 'motor', 'comms']);
    expect(of('powerSwitch').map((i) => map.zoneAt(i.x, i.z))).toEqual(['gen']);
    expect(of('forge').map((i) => map.zoneAt(i.x, i.z))).toEqual(['vault']);
    const zoneOf = (ref: string) => {
      const it = its.find((i) => i.ref === ref)!;
      const v = DIR_VEC[it.facing];
      return map.zoneAt(it.x + v.x * 0.3, it.z + v.z * 0.3);
    };
    expect(['farrow', 'pike', 'stitch', 'kestrel', 'brakeman', 'coachman'].map(zoneOf)).toEqual(['mess', 'mess', 'bunk', 'lab', 'cold', 'motor']);
    expect(TONICS.map((t) => zoneOf(t.id))).toEqual(['comms', 'mess', 'motor', 'lab', 'bunk', 'cold']);
    // Each has its mount, and a player can stand in front of it.
    const mounts = { wallbuy: 'wallbuy', tonic: 'tonic', cacheSite: 'cache_site', powerSwitch: 'switchgear', forge: 'forge' } as const;
    for (const it of its) {
      expect(harrowRidge.props.some((p) => p.type === mounts[it.kind] && Math.hypot(p.x - it.x, p.z - it.z) < 1), it.id).toBe(true);
      const v = DIR_VEC[it.facing];
      expect(circleFits(map, 'all', it.x + v.x * 0.6, it.z + v.z * 0.6, PLAYER_RADIUS), it.id).toBe(true);
    }
  });

  it('signs point the way to the power from both ends of the station', () => {
    const arrows = harrowRidge.props.filter((p) => p.type === 'sign' && /^< POWER$|^POWER >$/.test(p.text ?? ''));
    const zones = new Set(arrows.map((p) => { const a = ((p.rot ?? 0) * Math.PI) / 180; return map.zoneAt(p.x - Math.sin(a) * 0.3, p.z - Math.cos(a) * 0.3); }));
    for (const zone of ['mess', 'bunk', 'lab', 'yard', 'motor', 'gen']) expect(zones.has(zone), zone).toBe(true);
  });

  it('every prop has a definition and every zone keeps a light that works without the mains', () => {
    for (const p of harrowRidge.props) expect(propDef(p.type), p.type).toBeDefined();
    for (const zone of ['mess', 'bunk', 'lab', 'cold', 'gen', 'motor', 'yard', 'comms', 'vault']) {
      expect(harrowRidge.lights.some((l) => !l.needsPower && map.zoneAt(l.x, l.z) === zone), zone).toBe(true);
      expect(harrowRidge.lights.some((l) => l.needsPower && map.zoneAt(l.x, l.z) === zone), zone).toBe(true);
    }
  });

  it('player spawns have elbow room', () => {
    for (const s of harrowRidge.playerSpawns) expect(circleFits(map, undefined, s.x, s.z, PLAYER_RADIUS + 0.15)).toBe(true);
  });
});
