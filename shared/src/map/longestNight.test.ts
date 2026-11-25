import { describe, expect, it } from 'vitest';
import { CELL_SIZE, PLAYER_RADIUS } from '../constants';
import { moveCircle } from '../nav/collide';
import { FlowField, UNREACHABLE } from '../nav/flowfield';
import { lineOfSight } from '../nav/los';
import { rayWorld } from '../nav/ray';
import { Cell, DECK, compileMap, type DoorSet } from './compile';
import { longestNight } from './longestNight';
import { massing } from './massing';
import { validateMap } from './validate';
import { mapWindows } from './windows';

// The Longest Night's blockout (PLAN 4.12; section 9, M3 and M4): the streets, every floor, the roofs, the subway.

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
  it('is a valid map: 150 x 120 m, five storeys, fourteen zones, every one with a way in of its own', () => {
    expect(map.errors).toEqual([]);
    const v = validateMap(map);
    expect(v.errors).toEqual([]);
    expect(v.warnings).toEqual([]);
    expect([map.cols, map.rows]).toEqual([300, 240]);
    expect(map.levels.map((l) => l.y)).toEqual([-8, -4, 0, 4, 8]);
    expect(map.zones).toHaveLength(14);
    expect(longestNight.hidden).toBe(true);
  });

  it('is about four times the station to walk on', () => {
    let floor = 0;
    for (let i = 0; i < map.kind.length; i++) if (map.kind[i] === Cell.Floor) floor++;
    const m2 = floor * CELL_SIZE * CELL_SIZE;
    expect(m2).toBeGreaterThan(7500);
    expect(m2).toBeLessThan(8500);
  });

  it('has the doors and prices of the plan', () => {
    const got = Object.fromEntries(longestNight.openings.filter((o) => o.kind === 'door').map((o) => [o.id, o.needsPower ? 'power' : o.cost]));
    expect(got).toEqual({
      d_diner_square: 750, d_diner_tenement: 750, d_square_lane: 750,
      d_square_avenue: 1000, d_square_lyric: 1000, d_square_abelard: 1000, d_avenue_chapel: 1000, d_avenue_lyric: 1000, d_lane_abelard: 1000,
      d_square_subway: 1250, d_avenue_subway: 1250,
      d_service: 'power', d_hatch: 'power',
      d_lane_tenement: 750, d_tenement_roof: 1000, d_bridge: 1250, d_abelard_roof: 1250,
    });
    expect(longestNight.openings.filter((o) => o.style === 'debris').map((o) => o.id)).toEqual(['d_square_lane', 'd_square_avenue']);
  });

  it('has thirty-six ways in, each onto clear floor: off the street, over the parapets, out of the tunnels', () => {
    const wins = mapWindows(map);
    expect(wins).toHaveLength(36);
    const per = new Map<string, number>();
    for (const o of longestNight.openings) if (o.kind === 'window') per.set(o.zones[0], (per.get(o.zones[0]) ?? 0) + 1);
    expect(Object.fromEntries(per)).toEqual({
      square: 4, avenue: 4, lane: 3, diner: 3, tenement: 3, lyric: 3, chapel: 2, abelard: 4,
      abelard_up: 2, ten_roof: 2, abelard_roof: 2, platform: 2, mezz: 1, service: 1,
    });
    const behind = (kind: string | undefined) => longestNight.openings.filter((o) => o.kind === 'window' && o.behind === kind).length;
    expect([behind(undefined), behind('air'), behind('tunnel')]).toEqual([19, 8, 9]);
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
    for (const [x, z] of [[97, 53], [109, 29]] as const) expect(ms.open[col(x, z)], `${x}, ${z}`).toBe(0);
    // (The lane's hatch has the roof walk over it now.)
    expect(ms.roof[col(78, 90.5)]).toBe(8);
    // The diner is one storey, Abelard's two, and the towers of the avenue's north side far over both.
    expect(ms.roof[col(48, 91)]).toBeCloseTo(3.75);
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

describe('upstairs', () => {
  const walk = (x: number, y: number, z: number, dx: number, dz: number, dist: number) => {
    let p = { x, y, z };
    for (let d = 0; d < dist; d += 0.1) p = moveCircle(map, 'all', p.x, p.y, p.z, dx * 0.1, dz * 0.1, PLAYER_RADIUS);
    return p;
  };
  const FLAT: [number, number, number] = [61, 4, 104];
  const TEN_ROOF: [number, number, number] = [63, 8, 104];
  const ABE_ROOF: [number, number, number] = [110, 8, 75];
  const GALLERY: [number, number, number] = [101, 4, 74];

  it('every new flight is walked: the tenement\'s two, the fire escape, both escalators, the roof stairs, the Lyric\'s', () => {
    expect(walk(68, 0, 99.5, 0, 1, 10).y).toBeCloseTo(4);
    expect(walk(70.5, 4, 108.5, 0, -1, 9).y).toBeCloseTo(8);
    expect(walk(68.5, 0, 97, -1, 0, 10).y).toBeCloseTo(4); // up the fire escape to its landing
    expect(walk(107.5, 0, 77.5, 0, -1, 10).y).toBeCloseTo(4);
    expect(walk(115.5, 0, 70.5, 0, 1, 10).y).toBeCloseTo(4);
    expect(walk(125.5, 4, 72, 0, -1, 9.5).y).toBeCloseTo(8);
    expect(walk(50.5, 0, 55, -1, 0, 10).y).toBeCloseTo(4);
  });

  it('the flat is reached up the stairwell, or from the lane up the fire escape', () => {
    expect(walkTo(doors('d_diner_tenement'), DINER, FLAT)).toBeLessThan(50);
    const byLane = doors('d_diner_square', 'd_square_lane', 'd_lane_tenement');
    expect(walkTo(doors('d_diner_square', 'd_square_lane'), DINER, FLAT)).toBeNaN();
    expect(walkTo(byLane, DINER, FLAT)).toBeGreaterThan(50);
    expect(map.zoneAt(59, 4, 97)).toBe('lane'); // the landing is the lane's
    expect(map.zoneAt(...FLAT)).toBe('tenement');
  });

  it('the roofs are a circuit: tenement, plank bridge, the walk, Abelard\'s, down its escalators', () => {
    const up = ['d_diner_tenement', 'd_tenement_roof'];
    expect(walkTo(doors(...up), DINER, TEN_ROOF)).toBeLessThan(80);
    expect(walkTo(doors(...up), DINER, ABE_ROOF)).toBeNaN();
    // Over the bridge and along the walk: Abelard's roof without ever setting foot in the street.
    const over = walkTo(doors(...up, 'd_bridge'), DINER, ABE_ROOF);
    expect(over).toBeGreaterThan(100);
    expect(over).toBeLessThan(160);
    // ...and down through the store.
    expect(walkTo(doors(...up, 'd_bridge', 'd_abelard_roof'), DINER, GALLERY)).toBeLessThan(over + 60);
    expect(walkTo(doors('d_diner_square', 'd_square_abelard'), SQUARE, GALLERY)).toBeLessThan(70);
    for (const [x, y, z, zone] of [[68.2, 8, 95, 'abelard_roof'], [80, 8, 90.5, 'abelard_roof'], [63, 8, 104, 'ten_roof'], [101, 4, 74, 'abelard_up'], [111.5, 0, 74, 'abelard'], [36.5, 4, 54, 'lyric']] as const) {
      expect(map.zoneAt(x, y, z), `${x}, ${y}, ${z}`).toBe(zone);
    }
  });

  it('the bridge and the walk hang over the lane and the passage: floor above, street below, and the plank between them', () => {
    const [cx, cz] = [Math.floor(68.2 / CELL_SIZE), Math.floor(95 / CELL_SIZE)];
    const below = map.standAt(cx, cz, 0);
    const deck = map.standAt(cx, cz, 8);
    expect(map.deck[deck]).toBe(1);
    expect(map.deck[below]).toBe(0);
    expect(map.cap[below]).toBeCloseTo(8 - DECK);
    expect(map.cap[deck]).toBe(Infinity);
    expect(map.zoneAt(68.2, 0, 95)).toBe('lane');
    expect(map.zoneAt(83.5, 0, 90.5)).toBe('lane');
    expect(map.zoneAt(83.5, 8, 90.5)).toBe('abelard_roof');
    // Nobody steps off it, and nobody sees or shoots through it.
    expect(walk(68.2, 8, 95, 1, 0, 3).x).toBeLessThan(69);
    expect(lineOfSight(map, 68.2, 0, 95, 68.2, 8, 95)).toBe(false);
    expect(rayWorld(map, 'all', 68.2, 1.5, 95, 0, 1, 0, 60)).toBeCloseTo(8 - DECK - 1.5);
    expect(rayWorld(map, 'all', 68.2, 9.5, 95, 0, -1, 0, 60)).toBeCloseTo(1.5);
    // To the buildings it is not there: the lane under it is still open street.
    const ms = massing(map)!;
    expect(ms.open[cz * map.cols + cx]).toBe(1);
    expect(ms.top[cz * map.cols + cx]).toBe(0);
  });

  it('solid has a top: from a roof, sight and shots pass over what is lower and stop at what is not', () => {
    expect(map.skyline).not.toBeNull();
    // Across the lane, from the walk to the tenement's roof, over two parapets.
    expect(lineOfSight(map, 75, 8, 90.5, 62, 8, 100)).toBe(true);
    // Not through the taller building between Abelard's roof and the tenement's.
    expect(lineOfSight(map, 110, 8, 75, 63, 8, 104)).toBe(false);
    // Not from the lane up through a parapet to someone standing behind it.
    expect(lineOfSight(map, 90, 0, 95, 90, 8, 90.5)).toBe(false);
    // Over the diner's roof from the tenement's, as far as the next tall wall; into the parapet below eye level.
    expect(rayWorld(map, 'all', 58, 9.6, 102, -1, 0, 0, 80)).toBeCloseTo(37.5);
    expect(rayWorld(map, 'all', 58, 8.5, 106, -1, 0, 0, 80)).toBeCloseTo(1.5);
    // A shot dropping over the parapet lands on the diner's roof; one straight down, on the ledge outside the flat's window.
    const d = Math.hypot(1, 0.5);
    const drop = (x: number): number => 10.6 - (rayWorld(map, 'all', x, 10.6, 100, -1 / d, -0.5 / d, 0, 80) * 0.5) / d;
    expect(drop(58)).toBeCloseTo(3.75);
    expect(rayWorld(map, 'all', 55, 9, 100, 0, -1, 0, 80)).toBeCloseTo(5);
    // Indoors nothing has changed: the floors between storeys still hide.
    expect(lineOfSight(map, 61, 0, 101, 61, 4, 101)).toBe(false);
    expect(lineOfSight(map, 111.5, 0, 74, 106, 4, 74)).toBe(true); // up out of the atrium to someone at the gallery's rail
    expect(lineOfSight(map, 111.5, 0, 74, 101, 4, 74)).toBe(false); // but not to someone well back from it
  });

  it('a ledge hangs in the air outside its window; a tunnel is roofed, so it lies under the street', () => {
    const wins = mapWindows(map);
    const cell = (id: string) => {
      const w = wins.find((v) => v.id === id)!;
      return map.cellAt(w.spawnX, w.y, w.spawnZ);
    };
    const ms = massing(map)!;
    // Over the lane, a storey above the fire escape's landing.
    const roofN = cell('w_ten_roof_n');
    expect(map.kind[roofN]).toBe(Cell.Outside);
    expect([map.deck[roofN], map.sky[roofN], map.lo[roofN]]).toEqual([1, 1, 8]);
    // On the diner's roof: the diner is still a building 3.75 m tall there, with a ledge over it.
    const flatW = cell('w_flat_w');
    expect(map.deck[flatW]).toBe(1);
    expect(ms.open[flatW % map.plane]).toBe(0);
    expect(ms.top[flatW % map.plane]).toBeCloseTo(3.75);
    // A gap in a parapet has nothing over it.
    const gap = map.def.openings.findIndex((o) => o.id === 'w_abelard_roof_w');
    const gapCell = map.opening.findIndex((o, i) => o === gap && map.kind[i] === Cell.Window);
    expect(map.cap[gapCell]).toBe(Infinity);
    expect(ms.top[gapCell % map.plane]).toBe(9);
    // The track tunnel: roofed, dark, under the avenue.
    const track = cell('w_platform_w');
    expect(map.kind[track]).toBe(Cell.Outside);
    expect([map.sky[track], map.deck[track]]).toEqual([0, 0]);
    expect(map.cap[track]).toBeCloseTo(-4.5);
    expect(map.zoneAt(64, 0, 35.5)).toBe('avenue');
    // A ledge sunk into the roof it is meant to hang over is refused.
    const sunk = compileMap({ ...longestNight, blocks: longestNight.blocks!.map((b) => (b.h === 3.75 ? { ...b, h: 4.5 } : b)) });
    expect(validateMap(sunk).errors.join()).toMatch(/hangs in the air/);
  });
});
