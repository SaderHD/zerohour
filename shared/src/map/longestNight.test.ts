import { describe, expect, it } from 'vitest';
import { CELL_SIZE, PLAYER_RADIUS } from '../constants';
import { circleFits, moveCircle } from '../nav/collide';
import { FlowField, UNREACHABLE } from '../nav/flowfield';
import { lineOfSight } from '../nav/los';
import { rayWorld } from '../nav/ray';
import { Cell, DECK, DIR_VEC, compileMap, type DoorSet } from './compile';
import { FLOOR_STYLES, WALL_STYLES } from './types';
import { propDef } from '../data/props';
import { WEAPONS } from '../data/weapons';
import { TONICS } from './dressing/mounts';
import { TREE } from './dressing/nightStreets';
import { longestNight } from './longestNight';
import { massing } from './massing';
import { validateMap } from './validate';
import { mapWindows } from './windows';

// The Longest Night's blockout (PLAN 4.12; section 9, M3 and M4): the streets, every floor, the roofs, the subway;
// and the streets as dressed (M5), the halls (M6), the diner, the tenement, the roofs and the subway (M7); what is sold (M8).

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
// (On the ice, north of the tree.)
const SQUARE: [number, number, number] = [74, 0, 64];
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
    expect(walkTo(doors('d_diner_square'), DINER, SQUARE)).toBeLessThan(45);
  });
});

describe('the streets', () => {
  it('the avenue is a hundred metres from end to end, up a kerb at each side; the bus stands across the road', () => {
    expect(walkTo('all', [21.5, 0, 36], [118.5, 0, 36])).toBeGreaterThan(96);
    // In plain sight from end to end along the north pavement, which is also the way past the bus.
    expect(lineOfSight(map, 21.5, 0.15, 31.75, 118.5, 0.15, 31.75)).toBe(true);
    expect(lineOfSight(map, 21.5, 0, 36, 118.5, 0, 36)).toBe(false);
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
  const ABE_ROOF: [number, number, number] = [117, 8, 75];
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
    expect(lineOfSight(map, 104, 8, 75, 63, 8, 104)).toBe(false);
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

describe('the streets dressed (M5)', () => {
  const count = (type: string): number => longestNight.props.filter((p) => p.type === type).length;
  const zoneOfProp = (type: string): string[] => longestNight.props.filter((p) => p.type === type).map((p) => map.zoneAt(p.x, 0, p.z) ?? '');

  it('the tree stands in the middle of the square, taller than any storey, the rink round it with a gate in each side', () => {
    expect(propDef('xmas_tree')!.h).toBeGreaterThan(12);
    expect(map.walkAt(TREE.x / CELL_SIZE, TREE.z / CELL_SIZE, 0)).toBe(-1);
    // Whoever is north of it cannot see whoever is south of it; from one side of the rink to the other is clear.
    expect(lineOfSight(map, TREE.x, 0, TREE.z - 4, TREE.x, 0, TREE.z + 4)).toBe(false);
    expect(lineOfSight(map, TREE.x - 6, 0, TREE.z - 4, TREE.x + 6, 0, TREE.z - 4)).toBe(true);
    // In at any gate and round the tree.
    for (const [x, z] of [[74, 60], [74, 76], [64, 68], [84, 68]] as const) expect(walkTo(doors(), [x, 0, z], SQUARE), `${x}, ${z}`).toBeLessThan(22);
    expect(count('rink_board')).toBe(20);
  });

  it('the avenue has its traffic, the bus and the police line; the lane its van; the square its market', () => {
    expect(zoneOfProp('car').every((z) => z === 'avenue')).toBe(true);
    expect(count('car')).toBeGreaterThanOrEqual(10);
    expect(zoneOfProp('bus')).toEqual(['avenue']);
    expect(zoneOfProp('van')).toEqual(['lane']);
    expect(zoneOfProp('market_stall').every((z) => z === 'square')).toBe(true);
    expect(count('market_stall')).toBeGreaterThanOrEqual(8);
    for (const type of ['light_string', 'wreath', 'garland', 'presents', 'sawhorse', 'kiosk', 'steam_grate']) expect(count(type), type).toBeGreaterThan(0);
  });

  it('what stands in the street has a top: a shot or a look from above passes over the bus, and stops at it below', () => {
    const bus = longestNight.props.find((p) => p.type === 'bus')!;
    const top = propDef('bus')!.h;
    // Southwards across the road from the north pavement: into the bus at chest height, over it to the far wall from a storey up.
    expect(rayWorld(map, 'all', bus.x, 1.4, 31, 0, 0, 1, 40)).toBeCloseTo(2, 1);
    expect(rayWorld(map, 'all', bus.x, top + 1, 31, 0, 0, 1, 40)).toBeCloseTo(11, 1);
    // Down onto its roof.
    const d = rayWorld(map, 'all', bus.x, 8, 37.5, 0, -1, 0, 40);
    expect(d).toBeCloseTo(8 - top, 1);
    // A line of sight a storey up crosses over a market stall; nothing crosses the tree below its top.
    const stall = longestNight.props.find((p) => p.type === 'market_stall')!;
    expect(map.seeThrough(Math.floor(stall.x / CELL_SIZE), Math.floor(stall.z / CELL_SIZE), 1, 2)).toBe(false);
    expect(map.seeThrough(Math.floor(stall.x / CELL_SIZE), Math.floor(stall.z / CELL_SIZE), 4, 5)).toBe(true);
    expect(map.seeThrough(TREE.x / CELL_SIZE, TREE.z / CELL_SIZE, 9, 10)).toBe(false);
    expect(map.seeThrough(TREE.x / CELL_SIZE, TREE.z / CELL_SIZE, 15, 16)).toBe(true);
  });

  it('nothing dressed blocks a way through: every door is still reached, every window still lands on clear floor', () => {
    expect(validateMap(map).errors).toEqual([]);
    for (const w of mapWindows(map)) expect(Number.isFinite(walkTo('all', [w.inX, w.y, w.inZ], DINER)), w.id).toBe(true);
    // Past the bus on the north pavement; round it is no longer than the avenue.
    expect(walkTo('all', [84, 0, 36], [95, 0, 36])).toBeLessThan(20);
  });
});


describe('the halls dressed (M6)', () => {
  const at = (type: string): { x: number; y: number; z: number }[] => longestNight.props.filter((p) => p.type === type).map((p) => ({ x: p.x, y: (p.level ?? 0) * 4, z: p.z }));
  const zones = (type: string): string[] => [...new Set(at(type).map((p) => map.zoneAt(p.x, p.y, p.z) ?? map.zoneAt(p.x + 0.3, p.y, p.z + 0.3) ?? ''))].sort();
  const walk = (x: number, y: number, z: number, dx: number, dz: number, dist: number) => {
    let p = { x, y, z };
    for (let d = 0; d < dist; d += 0.1) p = moveCircle(map, 'all', p.x, p.y, p.z, dx * 0.1, dz * 0.1, PLAYER_RADIUS);
    return p;
  };

  it('the Lyric: rows of seats each side of the middle aisle, upstairs and down, the screen over the west window, the projector on the balcony', () => {
    expect(at('cinema_seats')).toHaveLength(32);
    expect(at('cinema_seats').filter((p) => p.y === 4)).toHaveLength(8);
    expect(zones('cinema_seats')).toEqual(['lyric']);
    expect(at('projector')).toEqual([{ x: 38.5, y: 4, z: 53.5 }]);
    // Down the aisle from the back row to the window under the screen, without a turn.
    const p = walk(38, 0, 54, -1, 0, 20);
    expect(p.x).toBeLessThan(21.5);
    expect(p.z).toBeCloseTo(54);
    // Seats stop nobody's shot: from the balcony's rail the whole floor is in sight, and from the back of the stalls the screen wall.
    // (The first of these ends exactly on the corner of a cell: the trace used to run on past it into the wall.)
    expect(lineOfSight(map, 34.6, 4, 50, 22, 0, 60)).toBe(true);
    expect(lineOfSight(map, 38, 0, 50, 22, 0, 58)).toBe(true);
    // Between two rows there is room to run, and to be followed.
    expect(walkTo(doors(), [27.25, 0, 50], [27.25, 0, 58])).toBeLessThan(12);
    for (const type of ['cinema_screen', 'ticket_booth', 'popcorn_stand', 'marquee', 'poster_case']) expect(at(type).length, type).toBeGreaterThan(0);
  });

  it('St Audra\'s: pews each side of the nave, the altar at the north end, the nativity and the organ in its corners', () => {
    expect(at('pew')).toHaveLength(24);
    expect(zones('pew')).toEqual(['chapel']);
    // In at the door and straight up the nave to the altar's step.
    const p = walk(47, 0, 29, 0, -1, 22);
    expect(p.x).toBeCloseTo(47);
    expect(p.z).toBeCloseTo(10.5 + PLAYER_RADIUS, 1);
    // The organ's pipes are a wall; a pew is not.
    expect(propDef('organ')!.tall).toBe(true);
    expect(lineOfSight(map, 41, 0, 20, 53, 0, 20)).toBe(true);
    for (const type of ['altar', 'nativity', 'organ', 'candle_stand', 'stained_glass', 'porch']) expect(at(type).length, type).toBeGreaterThan(0);
  });

  it('Abelard\'s: the railway under the atrium, the grotto in its corner, toys downstairs and coats up; both escalators still climb', () => {
    expect(at('model_railway')).toEqual([{ x: 111.5, y: 0, z: 74 }]);
    expect(map.walkAt(Math.floor(111.5 / CELL_SIZE), Math.floor(74 / CELL_SIZE), 0)).toBe(-1);
    expect(zones('toy_shelf')).toEqual(['abelard']);
    expect(zones('clothes_rack')).toEqual(['abelard_up']);
    expect(zones('wrap_counter')).toEqual(['abelard_up']);
    expect(at('throne')).toHaveLength(1);
    expect(at('escalator')).toHaveLength(2);
    expect(walk(107.5, 0, 77.5, 0, -1, 10).y).toBeCloseTo(4);
    expect(walk(115.5, 0, 70.5, 0, 1, 10).y).toBeCloseTo(4);
    // A gondola of shelves hides whoever is behind it; a table of bears does not. From the gallery the railway is in plain sight.
    expect(lineOfSight(map, 100, 0, 63.5, 100, 0, 67.5)).toBe(false);
    expect(lineOfSight(map, 104, 0, 81, 104, 0, 84.5)).toBe(true);
    expect(lineOfSight(map, 111.5, 4, 68, 111.5, 0, 76.5)).toBe(true);
    // Round the store on either floor, and up to the throne between the ropes.
    expect(walkTo(doors('d_square_abelard'), [97.5, 0, 73.5], [123.5, 0, 82.5])).toBeLessThan(45);
    expect(walkTo(doors('d_square_abelard'), [97.5, 0, 73.5], [111, 4, 84])).toBeLessThan(45);
  });

  it('nothing dressed indoors blocks a way through', () => {
    expect(validateMap(map).errors).toEqual([]);
    for (const w of mapWindows(map)) expect(Number.isFinite(walkTo('all', [w.inX, w.y, w.inZ], DINER)), w.id).toBe(true);
    for (const p of longestNight.props) expect(propDef(p.type), p.type).toBeDefined();
  });
});


describe('the rest dressed (M7)', () => {
  const at = (type: string): { x: number; y: number; z: number }[] => longestNight.props.filter((p) => p.type === type).map((p) => ({ x: p.x, y: (p.level ?? 0) * 4, z: p.z }));
  const zones = (type: string): string[] => [...new Set(at(type).map((p) => map.zoneAt(p.x, p.y, p.z) ?? map.zoneAt(p.x + 0.3, p.y, p.z + 0.3) ?? ''))].sort();
  const cell = (x: number, y: number, z: number): number => map.cellAt(x, y, z);

  it('the diner: booths under two walls, the counter in front of the kitchen with a way round behind it, nobody starting in the furniture', () => {
    expect(at('diner_booth')).toHaveLength(6);
    expect(at('diner_counter')).toHaveLength(3);
    for (const type of ['diner_booth', 'diner_counter', 'jukebox', 'fridge']) expect(zones(type), type).toEqual(['diner']);
    for (const s of map.playerSpawns) expect(circleFits(map, 'all', s.x, s.y, s.z, PLAYER_RADIUS)).toBe(true);
    // Behind the counter from either end, and through the arch to the kitchen.
    expect(walkTo(doors(), DINER, [44.5, 0, 95.75])).toBeLessThan(12);
    expect(walkTo(doors(), [40.75, 0, 95.75], [51, 0, 99])).toBeLessThan(14);
    // A counter and a booth stop nobody's shot.
    expect(lineOfSight(map, 44.5, 0, 92, 44.5, 0, 96)).toBe(true);
    expect(lineOfSight(map, 41, 0, 90, 55, 0, 88)).toBe(true);
    // Its sign hangs on the square's side of the door.
    expect(at('diner_sign')).toEqual([{ x: 54, y: 0, z: 86 }]);
  });

  it('the tenement: letter boxes in the hall; upstairs the table, the television and the tree, and room to run between them', () => {
    expect(zones('mailboxes')).toEqual(['tenement']);
    for (const type of ['dinner_table', 'television', 'armchair', 'sofa', 'bed', 'wardrobe', 'sideboard']) {
      expect(at(type).map((p) => p.y), type).toEqual([4]);
      expect(zones(type), type).toEqual(['tenement']);
    }
    // In at the fire escape's door, round the table and out to the stairs.
    expect(walkTo('all', [59.25, 4, 99.5], [65.5, 4, 109])).toBeLessThan(16);
    // The wardrobe hides; the table does not.
    expect(propDef('wardrobe')!.tall).toBe(true);
    expect(lineOfSight(map, 62, 4, 99.6, 62, 4, 105)).toBe(true);
  });

  it('the fire escape is iron: plate underfoot, iron to the lane, and still climbed', () => {
    expect(FLOOR_STYLES[map.floorStyle[cell(63, 2, 97)]!]).toBe('metal');
    expect(FLOOR_STYLES[map.floorStyle[cell(59, 4, 97)]!]).toBe('metal');
    expect(WALL_STYLES[map.wallStyle[cell(63, 0, 95.75)]!]).toBe('iron');
    expect(map.zoneAt(63, 0, 95.75)).toBe('lane');
    expect(at('fire_escape')).toEqual([{ x: 63.5, y: 0, z: 97 }]);
  });

  it('every ledge in the open air has its iron: eight of them, each on the planks outside its window', () => {
    const iron = longestNight.props.filter((p) => p.type === 'ledge_iron');
    expect(iron).toHaveLength(8);
    for (const p of iron) {
      const c = cell(p.x, (p.level ?? 0) * 4, p.z);
      expect(map.kind[c], `${p.x}, ${p.z}`).toBe(Cell.Outside);
      expect(map.deck[c], `${p.x}, ${p.z}`).toBe(1);
    }
    // The two outside the flat lie on something, and have no brackets under them.
    expect(iron.filter((p) => p.variant === 1).map((p) => p.level)).toEqual([1, 1]);
  });

  it('the roofs: the tank hides whoever is behind it, the lantern over the atrium is shot across and walked round', () => {
    expect(zones('water_tank')).toEqual(['ten_roof']);
    expect(lineOfSight(map, 60.5, 8, 104.5, 60.5, 8, 110.5)).toBe(false);
    expect(lineOfSight(map, 58, 8, 100.5, 66, 8, 100.5)).toBe(true);
    for (const type of ['chimney', 'pigeon_coop', 'aerial', 'reindeer']) expect(at(type).length, type).toBeGreaterThan(0);
    const sky = at('skylight')[0]!;
    expect([sky.x, sky.y, sky.z]).toEqual([111.5, 8, 74]);
    expect(map.walkAt(Math.floor(sky.x / CELL_SIZE), Math.floor(sky.z / CELL_SIZE), 8)).toBe(-1);
    expect(lineOfSight(map, 106, 8, 74, 117, 8, 74)).toBe(true);
    expect(walkTo('all', [106, 8, 74], [117, 8, 74])).toBeLessThan(22);
    expect(propDef('plant_room')!.tall).toBe(true);
    expect(zones('sign_back')).toEqual(['abelard_roof']);
    // From the door of each hut to the bridge, and along the walk, nothing stands in the way.
    expect(walkTo('all', [68, 8, 99.5], [123, 8, 63])).toBeLessThan(110);
  });

  it('the subway: two lanes of turnstiles between the mezzanine and the stairs; pillars and benches on the platform', () => {
    expect(at('turnstile')).toHaveLength(3);
    expect(zones('turnstile')).toEqual(['mezz']);
    // Both lanes are walked; the fence and the housings are not.
    for (const x of [87.25, 89.25]) expect(circleFits(map, 'all', x, -4, 56.5, PLAYER_RADIUS), `${x}`).toBe(true);
    for (const [x, z] of [[86.25, 56.5], [88.25, 56.5], [90.25, 56.5], [90.25, 55.25]] as const) expect(map.walkAt(Math.floor(x / CELL_SIZE), Math.floor(z / CELL_SIZE), -4), `${x}, ${z}`).toBe(-1);
    expect(walkTo('all', [95, -4, 60], PLAT_W)).toBeLessThan(45);
    expect(zones('token_booth')).toEqual(['mezz']);
    expect(zones('tiled_pillar')).toEqual(['mezz', 'platform']);
    expect(at('platform_bench')).toHaveLength(7);
    // A pillar hides; a bench does not.
    expect(lineOfSight(map, 79.25, -8, 34, 79.25, -8, 38)).toBe(false);
    expect(lineOfSight(map, 76, -8, 34, 76, -8, 38)).toBe(true);
  });

  it('the train: a bench down each side wherever there is no door, in plain sight from end to end, every door clear', () => {
    expect(at('train_seats')).toHaveLength(23);
    expect(at('train_bulkhead')).toHaveLength(2);
    expect(lineOfSight(map, 70.5, -8, 30, 105.5, -8, 30)).toBe(true);
    expect(walkTo('all', [70.5, -8, 30], [105.5, -8, 30])).toBeLessThan(37);
    for (const o of longestNight.openings.filter((v) => v.id.startsWith('a_train'))) {
      expect(circleFits(map, 'all', o.x + 0.75, -8, 31, PLAYER_RADIUS), o.id).toBe(true);
      expect(circleFits(map, 'all', o.x + 0.75, -8, 32.5, PLAYER_RADIUS), o.id).toBe(true);
    }
    // The side of the train is on the platform's wall wherever the train is, and nowhere else.
    const sides = longestNight.props.filter((p) => p.type === 'train_side');
    expect(sides.reduce((n, p) => n + (p.s ?? 0), 0)).toBeCloseTo(26);
    for (const p of sides) expect(p.x - p.s! / 2 >= 70 && p.x + p.s! / 2 <= 106, `${p.x}`).toBe(true);
  });

  it('the signal room has its frame and its relays; nothing dressed blocks a way through', () => {
    expect(zones('lever_frame')).toEqual(['service']);
    expect(zones('relay_cabinet')).toEqual(['service']);
    expect(validateMap(map).errors).toEqual([]);
    for (const w of mapWindows(map)) expect(Number.isFinite(walkTo('all', [w.inX, w.y, w.inZ], DINER)), w.id).toBe(true);
    for (const p of longestNight.props) expect(propDef(p.type), p.type).toBeDefined();
  });
});

describe('things to buy (M8)', () => {
  const things = longestNight.interactables;
  const zoneOf = (id: string): string | null => {
    const it = things.find((t) => t.id === id)!;
    const v = DIR_VEC[it.facing];
    return map.zoneAt(it.x + v.x * 0.75, map.mountHeight(it), it.z + v.z * 0.75);
  };

  it('every wall gun, tonic and Cache site stands in the zone the plan gives it', () => {
    expect(Object.fromEntries(things.map((t) => [t.id, zoneOf(t.id)]))).toEqual({
      cache_square: 'square', wb_farrow: 'diner', wb_pike: 'diner', tonic_second_wind: 'diner',
      wb_coachman: 'avenue', tonic_quickhands: 'lane', wb_stitch: 'tenement', tonic_marathon: 'tenement', cache_ten_roof: 'ten_roof',
      wb_kestrel: 'abelard', tonic_hair_trigger: 'abelard_up', cache_abelard_up: 'abelard_up',
      wb_brakeman: 'lyric', cache_lyric: 'lyric', tonic_packmule: 'lyric', tonic_ironhide: 'chapel',
      cache_mezz: 'mezz', wb_stitch_platform: 'platform', power: 'abelard_roof', forge: 'service',
    });
    // Every tonic there is, every gun a wall sells, and the Cache starts in the square.
    expect(things.filter((t) => t.kind === 'tonic').map((t) => t.ref).sort()).toEqual(TONICS.map((t) => t.id).sort());
    expect([...new Set(things.filter((t) => t.kind === 'wallbuy').map((t) => t.ref))].sort()).toEqual([...WEAPONS.values()].filter((w) => w.cost !== undefined).map((w) => w.id).sort());
    expect(things.find((t) => t.kind === 'cacheSite')!.id).toBe('cache_square');
  });

  it('each is on its own storey, with floor to stand on in front of it and a prop to look at', () => {
    const heights = Object.fromEntries(things.map((t) => [t.id, map.mountHeight(t)]));
    expect(heights).toMatchObject({ wb_farrow: 0, tonic_marathon: 4, tonic_packmule: 4, tonic_hair_trigger: 4, cache_abelard_up: 4, cache_ten_roof: 8, power: 8, cache_mezz: -4, wb_stitch_platform: -8, forge: -8 });
    for (const t of things) {
      const v = DIR_VEC[t.facing];
      const y = map.mountHeight(t);
      expect(circleFits(map, 'all', t.x + v.x * 0.75, y, t.z + v.z * 0.75, PLAYER_RADIUS), t.id).toBe(true);
      expect(Number.isFinite(walkTo('all', DINER, [t.x + v.x * 0.75, y, t.z + v.z * 0.75])), t.id).toBe(true);
    }
    const count = (type: string): number => longestNight.props.filter((p) => p.type === type).length;
    expect([count('wallbuy'), count('tonic'), count('cache_site'), count('forge'), count('breaker_box')]).toEqual([7, 6, 5, 1, 1]);
  });

  it('the first guns are bought without opening a door; the power is three doors away by either roof and the Forge waits for it', () => {
    const none = doors();
    for (const id of ['wb_farrow', 'wb_pike', 'tonic_second_wind']) {
      const t = things.find((v) => v.id === id)!;
      const v = DIR_VEC[t.facing];
      expect(Number.isFinite(walkTo(none, DINER, [t.x + v.x * 0.75, 0, t.z + v.z * 0.75])), id).toBe(true);
    }
    const sw: [number, number, number] = [100.75, 8, 65.75];
    // By the tenement: the hall, its roof, the bridge. By the store: the square, Abelard's, its roof stairs.
    expect(Number.isFinite(walkTo(doors('d_diner_tenement', 'd_tenement_roof', 'd_bridge'), DINER, sw))).toBe(true);
    expect(Number.isFinite(walkTo(doors('d_diner_square', 'd_square_abelard', 'd_abelard_roof'), DINER, sw))).toBe(true);
    expect(walkTo(doors('d_diner_tenement', 'd_tenement_roof'), DINER, sw)).toBeNaN();
    const forge: [number, number, number] = [59.75, -8, 61.5];
    const street = doors(...longestNight.openings.filter((o) => o.kind === 'door' && !o.needsPower).map((o) => o.id));
    expect(walkTo(street, DINER, forge)).toBeNaN();
    expect(Number.isFinite(walkTo('all', DINER, forge))).toBe(true);
    // The Forge is opposite the signal room's door, with the room to stand at it.
    expect(lineOfSight(map, 66.5, -8, 61, 59.75, -8, 61.5)).toBe(true);
  });
});
