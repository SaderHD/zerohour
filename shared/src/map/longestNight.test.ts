import { describe, expect, it } from 'vitest';
import { CELL_SIZE, PLAYER_RADIUS } from '../constants';
import { moveCircle } from '../nav/collide';
import { FlowField, UNREACHABLE } from '../nav/flowfield';
import { lineOfSight } from '../nav/los';
import { Cell, compileMap, type DoorSet } from './compile';
import { longestNight } from './longestNight';
import { massing } from './massing';
import { validateMap } from './validate';
import { mapWindows } from './windows';

// The Longest Night's blockout (PLAN 4.12; section 9, M3): the streets, the ground floors, the subway.

const map = compileMap(longestNight);
const doors = (...ids: string[]): DoorSet => new Set(ids);
/** Walking distance in metres between two spots (NaN: no way). */
function walkTo(open: DoorSet, from: [number, number, number], to: [number, number, number]): number {
  const f = new FlowField(map);
  if (!f.compute(open, to[0], to[1], to[2])) return NaN;
  const c = f.costAt(from[0], from[1], from[2]);
  return c === UNREACHABLE ? NaN : c / 20;
}

const DINER: [number, number, number] = [47, 0, 92];
const SQUARE: [number, number, number] = [74, 0, 68];
const PLAT_W: [number, number, number] = [80, -8, 36];
const PLAT_E: [number, number, number] = [107, -8, 36];
const SIGNAL: [number, number, number] = [61, -8, 61];

describe('The Longest Night compiles', () => {
  it('is a valid map: 150 x 120 m, three storeys so far, eleven zones', () => {
    expect(map.errors).toEqual([]);
    const v = validateMap(map);
    expect(v.errors).toEqual([]);
    // Nothing comes out of the dark of a tunnel until M4.
    expect(v.warnings).toEqual(['mezz', 'platform', 'service'].map((z) => `zone ${z} has no windows (zombies can only walk in)`));
    expect([map.cols, map.rows]).toEqual([300, 240]);
    expect(map.levels.map((l) => l.y)).toEqual([-8, -4, 0]);
    expect(map.zones).toHaveLength(11);
    expect(longestNight.hidden).toBe(true);
  });

  it('is about four times the station to walk on', () => {
    let floor = 0;
    for (let i = 0; i < map.kind.length; i++) if (map.kind[i] === Cell.Floor) floor++;
    const m2 = floor * CELL_SIZE * CELL_SIZE;
    expect(m2).toBeGreaterThan(5500);
    expect(m2).toBeLessThan(7000);
  });

  it('has the doors and prices of the plan', () => {
    const got = Object.fromEntries(longestNight.openings.filter((o) => o.kind === 'door').map((o) => [o.id, o.needsPower ? 'power' : o.cost]));
    expect(got).toEqual({
      d_diner_square: 750, d_diner_tenement: 750, d_square_lane: 750,
      d_square_avenue: 1000, d_square_lyric: 1000, d_square_abelard: 1000, d_avenue_chapel: 1000, d_avenue_lyric: 1000, d_lane_abelard: 1000,
      d_square_subway: 1250, d_avenue_subway: 1250,
      d_service: 'power', d_hatch: 'power',
    });
    expect(longestNight.openings.filter((o) => o.style === 'debris').map((o) => o.id)).toEqual(['d_square_lane', 'd_square_avenue']);
  });

  it('has twenty-four ways in at street level, each onto clear floor', () => {
    const wins = mapWindows(map);
    expect(wins).toHaveLength(24);
    const per = new Map<string, number>();
    for (const o of longestNight.openings) if (o.kind === 'window') per.set(o.zones[0], (per.get(o.zones[0]) ?? 0) + 1);
    expect(Object.fromEntries(per)).toEqual({ square: 4, avenue: 4, lane: 3, diner: 3, tenement: 1, lyric: 3, chapel: 2, abelard: 4 });
    for (const w of wins) expect(Number.isFinite(walkTo('all', [w.inX, w.y, w.inZ], DINER)), w.id).toBe(true);
  });

  it('starts everyone in the diner, shut in until a door is bought', () => {
    for (const s of map.playerSpawns) expect(map.zoneAt(s.x, s.y, s.z)).toBe('diner');
    expect(walkTo(undefined, DINER, SQUARE)).toBeNaN();
    expect(walkTo(doors('d_diner_square'), DINER, SQUARE)).toBeLessThan(40);
  });
});

describe('the streets', () => {
  it('the avenue is a hundred metres from end to end, in plain sight, up a kerb at each side', () => {
    expect(walkTo('all', [21.5, 0, 36], [118.5, 0, 36])).toBeGreaterThan(96);
    expect(lineOfSight(map, 21.5, 0, 36, 118.5, 0, 36)).toBe(true);
    let p = { x: 60, y: 0, z: 34 };
    for (let d = 0; d < 3; d += 0.1) p = moveCircle(map, 'all', p.x, p.y, p.z, 0, -0.1, PLAYER_RADIUS);
    expect(p.y).toBeCloseTo(0.15);
    expect(p.z).toBeLessThan(31);
  });

  it('the square is reached from the avenue only through the wreckage in the cut', () => {
    const open = doors('d_diner_square', 'd_square_lyric', 'd_avenue_lyric');
    // Round through the Lyric and out of its fire exit...
    const round = walkTo(open, SQUARE, [74, 0.15, 43]);
    expect(round).toBeGreaterThan(90);
    // ...or straight up the cut once it is cleared.
    expect(walkTo(doors('d_square_avenue'), SQUARE, [74, 0.15, 43])).toBeLessThan(30);
  });

  it('every building is a block of its own height, and a flight that reaches the street comes up inside one', () => {
    const ms = massing(map)!;
    const col = (x: number, z: number): number => Math.floor(z / CELL_SIZE) * map.cols + Math.floor(x / CELL_SIZE);
    // Open to the sky: the square, the avenue, the lane, the cut, a barricade's pocket.
    for (const [x, z] of [[74, 68], [60, 36], [90, 95], [74, 48], [59, 48]] as const) expect(ms.open[col(x, z)], `${x}, ${z}`).toBe(1);
    // Roofed: the heads of the three flights.
    for (const [x, z] of [[97, 53], [109, 29], [76.5, 90.5], [78, 90.5]] as const) expect(ms.open[col(x, z)], `${x}, ${z}`).toBe(0);
    // The diner is one storey, Abelard's two, and the towers of the avenue's north side far over both.
    expect(ms.roof[col(48, 91)]).toBeCloseTo(4.5);
    expect(ms.roof[col(110, 74)]).toBeCloseTo(8);
    expect(ms.roof[col(130, 10)]).toBeCloseTo(30);
    // The subway lies under open street: the mezzanine under the square, the platform under the avenue.
    expect(map.zoneAt(90, -4, 58)).toBe('mezz');
    expect(map.zoneAt(90, 0, 58)).toBe('square');
    expect(map.zoneAt(80, -8, 36)).toBe('platform');
    expect(map.zoneAt(80, 0, 36)).toBe('avenue');
  });
});

describe('the subway', () => {
  const SUBWAY = ['d_diner_square', 'd_square_subway', 'd_square_avenue', 'd_avenue_subway'];

  it('is a circuit: down from the square, along the platform, through the train, up to the avenue', () => {
    expect(walkTo(doors('d_diner_square', 'd_square_subway'), SQUARE, PLAT_W)).toBeGreaterThan(40);
    // The roof is down between the platform's two halves: the only way from one to the other is the train.
    const f = new FlowField(map);
    f.compute(doors(...SUBWAY), ...PLAT_E);
    let p = { x: PLAT_W[0], y: PLAT_W[1], z: PLAT_W[2] };
    const dir = { x: 0, z: 0 };
    let inTrain = 0;
    for (let i = 0; i < 2000 && f.dir(p.x, p.y, p.z, dir); i++) {
      p = moveCircle(map, 'all', p.x, p.y, p.z, dir.x * 0.1, dir.z * 0.1, PLAYER_RADIUS);
      if (p.z < 31.5) inTrain++;
    }
    expect(Math.hypot(p.x - PLAT_E[0], p.z - PLAT_E[2])).toBeLessThan(1);
    expect(inTrain).toBeGreaterThan(100);
    // With only the avenue's door bought the west half is still reached, the long way.
    expect(walkTo(doors('d_diner_square', 'd_square_avenue', 'd_avenue_subway'), SQUARE, PLAT_W)).toBeGreaterThan(walkTo(doors(...SUBWAY), SQUARE, PLAT_W));
  });

  it('every flight is walked without a correction: 4 m down in 7 m', () => {
    const walk = (x: number, y: number, z: number, dx: number, dz: number, dist: number) => {
      let p = { x, y, z };
      for (let d = 0; d < dist; d += 0.1) p = moveCircle(map, 'all', p.x, p.y, p.z, dx * 0.1, dz * 0.1, PLAYER_RADIUS);
      return p;
    };
    expect(walk(95, 0, 53, 1, 0, 10).y).toBeCloseTo(-4); // the square's
    expect(walk(88.5, -4, 48, 0, -1, 10).y).toBeCloseTo(-8); // the turnstiles'
    expect(walk(113, -8, 31, 0, -1, 9.5).y).toBeCloseTo(-4); // the avenue's lower
    expect(walk(109, -4, 21.5, 0, 1, 10).y).toBeCloseTo(0.15); // and its upper, out onto the pavement
    expect(walk(68, -8, 75, 0, 1, 10).y).toBeCloseTo(-4); // the service tunnel's
    expect(walk(69, -4, 90.5, 1, 0, 9.5).y).toBeCloseTo(0);
  });

  it('the service tunnel and its signal room wait for the power, at both ends', () => {
    const noPower = longestNight.openings.filter((o) => o.kind === 'door' && !o.needsPower).map((o) => o.id);
    expect(walkTo(doors(...noPower), SQUARE, SIGNAL)).toBeNaN();
    const byPlatform = walkTo(doors(...noPower, 'd_service'), SQUARE, SIGNAL);
    const byLane = walkTo(doors(...noPower, 'd_hatch'), SQUARE, SIGNAL);
    expect(byPlatform).toBeGreaterThan(60);
    expect(byLane).toBeGreaterThan(60);
    // Not a dead end: with both open, the way from the lane to the platform is through it.
    expect(walkTo('all', [78.5, 0, 95], PLAT_W)).toBeLessThan(walkTo(doors(...noPower), [78.5, 0, 95], PLAT_W));
  });

  it('what is underfoot is out of sight and out of reach from the street', () => {
    expect(lineOfSight(map, 90, 0, 58, 90, -4, 60)).toBe(false);
    expect(lineOfSight(map, 80, 0, 36, 80, -8, 36)).toBe(false);
    expect(map.walkAt(Math.floor(90 / CELL_SIZE), Math.floor(58 / CELL_SIZE), -2)).toBe(-1);
  });
});
