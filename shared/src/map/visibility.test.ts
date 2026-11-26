import { describe, expect, it } from 'vitest';
import { CELL_SIZE } from '../constants';
import { Cell, NO_ZONE, type CompiledMap } from './compile';
import { compiledMap } from './maps';
import { doorInSight, doorSights, seenFrom, visibility } from './visibility';

// The table is worked out from the boundaries of zones. This looks instead: from eyes all over
// each map it marches rays every way, a step at a time, and whatever cell a ray is ever in must
// belong to something the table says is seen from there.
const STEP = 0.12;
/** What stands or hangs in a street is within this of its floor (lamps, strings of bulbs, awnings). */
const LOW = 8;

function look(map: CompiledMap, every: number, yaws: number): Set<string> {
  const v = visibility(map);
  const missed = new Set<string>();
  const pitches = [-1.1, -0.7, -0.4, -0.2, -0.07, 0.05, 0.2, 0.45, 0.8, 1.2];
  let k = 0;
  for (let i = 0; i < map.kind.length; i++) {
    if (map.kind[i] !== Cell.Floor || map.zone[i] === NO_ZONE) continue;
    const [cx, cz] = [map.cxOf(i), map.czOf(i)];
    if (cx % every !== 0 || cz % every !== 0) continue;
    const a = v.label[i]!;
    for (const eye of [0.5, 1.6, 2.2]) {
      const y0 = map.lo[i]! + eye;
      if (y0 > map.cap[i]! - 0.1) continue;
      // What the client draws from this eye: a roofed region only if the eye looks into it.
      const [ex, ez] = [(cx + 0.5) * CELL_SIZE, (cz + 0.5) * CELL_SIZE];
      const into = new Uint8Array(v.regions.length);
      const open = seenFrom(map, v, [a], ex, y0, ez, into);
      for (let n = 0; n < yaws; n++) {
        // (No two eyes look quite the same way.)
        const yaw = ((n + ((k++ * 0.618) % 1)) / yaws) * Math.PI * 2;
        const pitch = pitches[k % pitches.length]!;
        const [dx, dy, dz] = [Math.cos(yaw) * Math.cos(pitch) * STEP, Math.sin(pitch) * STEP, Math.sin(yaw) * Math.cos(pitch) * STEP];
        let [x, y, z] = [(cx + 0.5) * CELL_SIZE, y0, (cz + 0.5) * CELL_SIZE];
        for (let s = 0; s < 1600; s++) {
          x += dx;
          y += dy;
          z += dz;
          const [px, pz] = [Math.floor(x / CELL_SIZE), Math.floor(z / CELL_SIZE)];
          const j = map.holdAt(px, pz, y);
          if (j < 0) {
            if (!map.aloft(px, pz, y)) break;
            if (!open) missed.add(`${v.regions[a]} at ${ex}, ${y0.toFixed(1)}, ${ez} does not see the air at ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}`);
            continue;
          }
          const b = v.label[j]!;
          if (b < 0) {
            if (!open) missed.add(`${v.regions[a]} at ${ex}, ${y0.toFixed(1)}, ${ez} does not see the outside at ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}`);
          } else if (!v.outdoor[b] || y < map.lo[j]! + Math.max(LOW, map.propH[j]! + 1)) {
            // (High over a street a ray sees nothing of the street.)
            if (!into[b]) missed.add(`${v.regions[a]} at ${ex}, ${y0.toFixed(1)}, ${ez} does not see ${v.regions[b]} at ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}`);
          }
        }
      }
    }
  }
  return missed;
}

describe('visibility', () => {
  it('sees itself, and is the same both ways', () => {
    const v = visibility(compiledMap('longest_night'));
    for (let a = 0; a < v.regions.length; a++) {
      expect(v.sees(a, a)).toBe(true);
      for (let b = 0; b < v.regions.length; b++) expect(v.sees(a, b)).toBe(v.sees(b, a));
    }
  });

  it('hides what walls hide', () => {
    const night = visibility(compiledMap('longest_night'));
    const sees = (a: string, b: string): boolean => night.sees(night.regions.indexOf(a), night.regions.indexOf(b));
    // The subway from the street and from every building; the store from the chapel.
    for (const up of ['diner', 'lane', 'tenement', 'abelard', 'lyric', 'chapel', 'ten_roof', 'abelard_roof']) expect(sees('platform', up), up).toBe(false);
    for (const up of ['square', 'avenue', 'abelard', 'lyric', 'chapel']) expect(sees('service', up), up).toBe(false);
    expect(sees('chapel', 'abelard')).toBe(false);
    // What is joined is seen: through a door, up a stair, across the square.
    for (const [a, b] of [['diner', 'square'], ['square', 'avenue'], ['mezz', 'platform'], ['abelard', 'abelard_up'], ['ten_roof', 'abelard_roof'], ['platform', 'service']] as const) expect(sees(a, b), `${a} ${b}`).toBe(true);
    const ridge = visibility(compiledMap('harrow_ridge'));
    expect(ridge.sees(ridge.regions.indexOf('vault'), ridge.regions.indexOf('mess'))).toBe(false);
    expect(ridge.sees(ridge.regions.indexOf('mess'), ridge.regions.indexOf('yard'))).toBe(true);
  });

  // A shut door is drawn only while `doorInSight` says so: wherever a line from an eye ends on a
  // shut door, it must (furniture is not there: it is seen over and past). Three times a map: every door shut, then every other one open, then the others.
  for (const [id, every, yaws] of [['harrow_ridge', 2, 144], ['longest_night', 3, 120]] as const) {
    it(`draws every shut door an eye on ${id} can see`, () => {
      const map = compiledMap(id);
      const doors = map.def.openings.filter((o) => o.kind === 'door');
      const sights = new Map(doors.map((o) => [o.id, doorSights(map, o)]));
      const missed = new Set<string>();
      const pitches = [-0.9, -0.5, -0.25, -0.1, 0, 0.1, 0.25, 0.5];
      let k = 0;
      for (const open of [new Set<string>(), new Set(doors.filter((_, n) => n % 2 === 0).map((o) => o.id)), new Set(doors.filter((_, n) => n % 2 === 1).map((o) => o.id))]) {
        for (let i = 0; i < map.kind.length; i++) {
          if (map.kind[i] !== Cell.Floor || map.zone[i] === NO_ZONE || map.block[i]) continue;
          const [cx, cz] = [map.cxOf(i), map.czOf(i)];
          if (cx % every !== 0 || cz % every !== 0) continue;
          const [ex, ey, ez] = [(cx + 0.5) * CELL_SIZE, map.lo[i]! + 1.6, (cz + 0.5) * CELL_SIZE];
          if (ey > map.cap[i]! - 0.1) continue;
          const seen = new Map<string, boolean>();
          for (let n = 0; n < yaws; n++) {
            const yaw = ((n + ((k++ * 0.618) % 1)) / yaws) * Math.PI * 2;
            const pitch = pitches[k % pitches.length]!;
            const [dx, dy, dz] = [Math.cos(yaw) * Math.cos(pitch) * STEP, Math.sin(pitch) * STEP, Math.sin(yaw) * Math.cos(pitch) * STEP];
            let [x, y, z] = [ex, ey, ez];
            for (let s = 0; s < 1200; s++) {
              x += dx;
              y += dy;
              z += dz;
              const [px, pz] = [Math.floor(x / CELL_SIZE), Math.floor(z / CELL_SIZE)];
              const j = map.holdAt(px, pz, y);
              if (j < 0) {
                if (!map.aloft(px, pz, y)) break;
                continue;
              }
              if (map.kind[j] === Cell.Door && !map.isDoorOpen(j, open)) {
                // (The slab is in the middle of its cell, and stops at the lintel.)
                const o = map.def.openings[map.opening[j]!]!;
                if (y < map.lo[j]! + 2.2) {
                  if (!seen.has(o.id)) seen.set(o.id, doorInSight(map, open, sights.get(o.id)!, ex, ey, ez));
                  if (!seen.get(o.id)) missed.add(`${o.id} from ${ex}, ${ey.toFixed(1)}, ${ez} (a line ends on it at ${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`);
                }
                break;
              }
            }
          }
        }
      }
      expect([...missed].slice(0, 12)).toEqual([]);
    }, 120_000);
  }

  // (`VIS_DENSE=1 npx vitest run shared/src/map/visibility.test.ts` looks four times as hard: after a change to the sampling, or to a map's doors.)
  const dense = !!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.VIS_DENSE;
  for (const [id, every, yaws] of [['harrow_ridge', dense ? 2 : 3, dense ? 144 : 96], ['longest_night', dense ? 4 : 6, dense ? 120 : 72], ['stacks', 2, 96], ['corner', 3, 96]] as const) {
    it(`leaves out nothing that an eye on ${id} can see`, () => {
      expect([...look(compiledMap(id), every, yaws)].slice(0, 12)).toEqual([]);
    }, 120_000);
  }
});
