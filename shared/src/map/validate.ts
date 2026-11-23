import { CELL_SIZE, MIN_LANE_WIDTH, PLAYER_RADIUS } from '../constants';
import { circleFits } from '../nav/collide';
import { Cell, NO_ZONE, type CompiledMap, type DoorSet } from './compile';

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/** Flood fill over walkable cells from a start cell. Returns a 0/1 mask. */
export function floodWalkable(map: CompiledMap, startCx: number, startCz: number, open: DoorSet): Uint8Array {
  const reached = new Uint8Array(map.cols * map.rows);
  if (!map.isWalkable(startCx, startCz, open)) return reached;
  const stack = [map.idx(startCx, startCz)];
  reached[stack[0]!] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const cx = i % map.cols;
    const cz = (i - cx) / map.cols;
    for (const [dx, dz] of N4) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (!map.isWalkable(nx, nz, open)) continue;
      const j = map.idx(nx, nz);
      if (reached[j]) continue;
      reached[j] = 1;
      stack.push(j);
    }
  }
  return reached;
}

const at = (cx: number, cz: number) => `(${cx * CELL_SIZE}, ${cz * CELL_SIZE})`;

/** Structural checks from docs/PLAN.md section 6.1. A map with any error must not ship. */
export function validateMap(map: CompiledMap): ValidationResult {
  const errors = [...map.errors];
  const warnings: string[] = [];
  const def = map.def;
  const cell = (v: number) => Math.floor(v / CELL_SIZE);

  // Player spawns
  if (def.playerSpawns.length < 4) errors.push('need at least 4 player spawns');
  const spawnZones = new Set<string | null>();
  for (const [i, s] of def.playerSpawns.entries()) {
    if (!circleFits(map, undefined, s.x, s.z, PLAYER_RADIUS)) errors.push(`player spawn ${i} is not on open floor`);
    spawnZones.add(map.zoneAt(s.x, s.z));
  }
  if (spawnZones.size > 1) errors.push('player spawns are spread over several zones');
  const s0 = def.playerSpawns[0];
  if (!s0) return { errors, warnings };
  const sx = cell(s0.x);
  const sz = cell(s0.z);
  const spawnZone = map.zone[map.idx(sx, sz)]!;

  // Reachability with every door open
  const all = floodWalkable(map, sx, sz, 'all');
  const unreachableZones = new Set<string>();
  for (let i = 0; i < all.length; i++) {
    const k = map.kind[i];
    if ((k === Cell.Floor || k === Cell.Door) && !all[i]) unreachableZones.add(map.zones[map.zone[i]!]?.id ?? '?');
  }
  for (const z of unreachableZones) errors.push(`zone ${z} has floor that cannot be reached from the spawn with all doors open`);
  for (const z of map.zones) {
    if (!map.zone.includes(map.zones.indexOf(z))) errors.push(`zone ${z.id} has no rooms`);
  }

  // Containment with every door closed
  const closed = floodWalkable(map, sx, sz, undefined);
  for (let i = 0; i < closed.length; i++) {
    if (closed[i] && map.zone[i] !== spawnZone) {
      errors.push(`with doors closed the spawn zone leaks into ${map.zones[map.zone[i]!]?.id} at ${at(i % map.cols, Math.floor(i / map.cols))}`);
      break;
    }
  }

  // Lane width: every walkable cell must sit inside some fully walkable square of MIN_LANE_WIDTH.
  const n = Math.round(MIN_LANE_WIDTH / CELL_SIZE);
  const covered = new Uint8Array(all.length);
  for (let cz = 0; cz + n <= map.rows; cz++) {
    for (let cx = 0; cx + n <= map.cols; cx++) {
      let ok = true;
      for (let j = 0; j < n && ok; j++) for (let i = 0; i < n && ok; i++) ok = map.isWalkable(cx + i, cz + j, 'all');
      if (ok) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) covered[map.idx(cx + i, cz + j)] = 1;
    }
  }
  let narrow = 0;
  let firstNarrow = '';
  for (let i = 0; i < all.length; i++) {
    if (all[i] && !covered[i]) {
      narrow++;
      firstNarrow ||= at(i % map.cols, Math.floor(i / map.cols));
    }
  }
  if (narrow) errors.push(`${narrow} walkable cells are in lanes narrower than ${MIN_LANE_WIDTH} m (first at ${firstNarrow})`);

  // Openings
  const windowsPerZone = new Map<string, number>();
  for (const o of def.openings) {
    if (o.kind === 'door' && !o.needsPower && !(o.cost && o.cost > 0)) errors.push(`door ${o.id}: needs a cost or needsPower`);
    if (o.kind === 'window') windowsPerZone.set(o.zones[0], (windowsPerZone.get(o.zones[0]) ?? 0) + 1);
    // A window must face reachable floor; a door/arch must touch reachable floor on both sides.
    let touches = 0;
    const x0 = cell(o.x);
    const z0 = cell(o.z);
    const x1 = Math.round((o.x + o.w) / CELL_SIZE);
    const z1 = Math.round((o.z + o.d) / CELL_SIZE);
    const sides = [
      { cx: x0 - 1, cz: z0 }, { cx: x1, cz: z0 }, { cx: x0, cz: z0 - 1 }, { cx: x0, cz: z1 },
    ];
    for (const s of sides) if (map.inBounds(s.cx, s.cz) && map.kind[map.idx(s.cx, s.cz)] === Cell.Floor && all[map.idx(s.cx, s.cz)]) touches++;
    if (o.kind === 'window' ? touches < 1 : touches < 2) errors.push(`opening ${o.id}: does not connect ${o.kind === 'window' ? 'to reachable floor' : 'two reachable spaces'}`);
  }
  for (const z of map.zones) {
    if (!windowsPerZone.get(z.id)) warnings.push(`zone ${z.id} has no windows (zombies can only walk in)`);
  }

  // Zone graph must be connected through doors/arches
  const seen = new Set([map.zones[spawnZone]!.id]);
  const queue = [...seen];
  while (queue.length) {
    for (const n of map.adjacency.get(queue.pop()!) ?? []) {
      if (seen.has(n.zone)) continue;
      seen.add(n.zone);
      queue.push(n.zone);
    }
  }
  for (const z of map.zones) if (!seen.has(z.id)) errors.push(`zone ${z.id} is not linked to the spawn zone by any door`);

  // Interactables must stand next to reachable floor; lights must be inside open space.
  for (const it of def.interactables) {
    const cx = cell(it.x);
    const cz = cell(it.z);
    let ok = false;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (map.inBounds(cx + dx, cz + dz) && all[map.idx(cx + dx, cz + dz)]) ok = true;
    if (!ok) errors.push(`interactable ${it.id}: not next to reachable floor`);
  }
  for (const [i, l] of def.lights.entries()) {
    if (map.kindAt(cell(l.x), cell(l.z)) === Cell.Solid) errors.push(`light ${i} at (${l.x}, ${l.z}) is inside solid`);
  }
  for (const sp of map.spawns) {
    if (map.kindAt(cell(sp.x), cell(sp.z)) !== Cell.Outside) errors.push(`zombie spawn ${sp.id} is not inside its pocket`);
  }
  if (map.zone.every((z) => z === NO_ZONE)) errors.push('map has no rooms');
  return { errors, warnings };
}
