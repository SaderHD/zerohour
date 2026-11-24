import { CELL_SIZE, MIN_LANE_WIDTH, PLAYER_RADIUS } from '../constants';
import { circleFits } from '../nav/collide';
import { mapWindows } from './windows';
import { Cell, NO_ZONE, type CompiledMap, type DoorSet } from './compile';

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}


/** Flood fill over walkable cells (every storey) from where someone stands. Returns a 0/1 mask over all cells. */
export function floodWalkable(map: CompiledMap, x: number, y: number, z: number, open: DoorSet): Uint8Array {
  const reached = new Uint8Array(map.kind.length);
  const start = map.cellAt(x, y, z);
  if (start < 0 || !map.walkable(start, open)) return reached;
  const stack = [start];
  reached[start] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    for (let n = 0; n < 4; n++) {
      const j = map.links[i * 8 + n]!;
      if (j < 0 || reached[j] || !map.walkable(j, open)) continue;
      reached[j] = 1;
      stack.push(j);
    }
  }
  return reached;
}



/** Structural checks from docs/PLAN.md section 6.1. A map with any error must not ship. */
export function validateMap(map: CompiledMap): ValidationResult {
  const errors = [...map.errors];
  const warnings: string[] = [];
  const def = map.def;
  const cell = (v: number) => Math.floor(v / CELL_SIZE);
  const at = (i: number) => `(${map.cxOf(i) * CELL_SIZE}, ${map.czOf(i) * CELL_SIZE})${map.layers > 1 ? ` on level ${map.levels[map.layerOfCell(i)]!.level}` : ''}`;

  // Player spawns
  if (def.playerSpawns.length < 4) errors.push('need at least 4 player spawns');
  const spawnZones = new Set<string | null>();
  for (const [i, s] of map.playerSpawns.entries()) {
    if (!circleFits(map, undefined, s.x, s.y, s.z, PLAYER_RADIUS)) errors.push(`player spawn ${i} is not on open floor`);
    spawnZones.add(map.zoneAt(s.x, s.y, s.z));
  }
  if (spawnZones.size > 1) errors.push('player spawns are spread over several zones');
  const s0 = map.playerSpawns[0];
  if (!s0) return { errors, warnings };
  const spawnCell = map.cellAt(s0.x, s0.y, s0.z);
  if (spawnCell < 0) return { errors, warnings };
  const spawnZone = map.zone[spawnCell]!;

  // Reachability with every door open
  const all = floodWalkable(map, s0.x, s0.y, s0.z, 'all');
  const unreachableZones = new Set<string>();
  for (let i = 0; i < all.length; i++) {
    const k = map.kind[i];
    if ((k === Cell.Floor || k === Cell.Door) && !all[i] && !map.block[i]) unreachableZones.add(map.zones[map.zone[i]!]?.id ?? '?');
  }
  for (const z of unreachableZones) errors.push(`zone ${z} has floor that cannot be reached from the spawn with all doors open`);
  for (const z of map.zones) {
    if (!map.zone.includes(map.zones.indexOf(z))) errors.push(`zone ${z.id} has no rooms`);
  }

  // Containment with every door closed
  const closed = floodWalkable(map, s0.x, s0.y, s0.z, undefined);
  for (let i = 0; i < closed.length; i++) {
    if (closed[i] && map.zone[i] !== spawnZone) {
      errors.push(`with doors closed the spawn zone leaks into ${map.zones[map.zone[i]!]?.id} at ${at(i)}`);
      break;
    }
  }

  // Lane width: every walkable cell must sit inside some fully walkable square of MIN_LANE_WIDTH.
  const n = Math.round(MIN_LANE_WIDTH / CELL_SIZE);
  const covered = new Uint8Array(all.length);
  // (The square is walked out from its corner along the step links, so it may run up a staircase.)
  const square = new Int32Array(n * n);
  for (let c = 0; c < all.length; c++) {
    if (!map.walkable(c, 'all')) continue;
    let ok = true;
    for (let j = 0; j < n && ok; j++) {
      for (let i = 0; i < n && ok; i++) {
        const from = i > 0 ? square[j * n + i - 1]! : j > 0 ? square[(j - 1) * n]! : -1;
        const cellHere = from < 0 ? c : map.links[from * 8 + (i > 0 ? 0 : 2)]!;
        ok = cellHere >= 0 && map.walkable(cellHere, 'all');
        square[j * n + i] = cellHere;
      }
    }
    if (ok) for (const i of square) covered[i] = 1;
  }
  let narrow = 0;
  let firstNarrow = '';
  for (let i = 0; i < all.length; i++) {
    if (all[i] && !covered[i]) {
      narrow++;
      firstNarrow ||= at(i);
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
    // Whatever floor lies within a step of the opening's own, on any storey (a stair may end at a door).
    const oy = map.openingHeight(o);
    for (const s of sides) {
      const i = map.standAt(s.cx, s.cz, oy);
      if (i >= 0 && map.kind[i] === Cell.Floor && all[i]) touches++;
    }
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
    const layer = map.layerOf(it.level ?? 0);
    let ok = false;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (layer >= 0 && map.inBounds(cx + dx, cz + dz) && all[map.idx(cx + dx, cz + dz, layer)]) ok = true;
    if (!ok) errors.push(`interactable ${it.id}: not next to reachable floor`);
  }
  for (const [i, l] of def.lights.entries()) {
    const layer = map.layerOf(l.level ?? 0);
    if (layer < 0 || map.kindAt(cell(l.x), cell(l.z), layer) === Cell.Solid) errors.push(`light ${i} at (${l.x}, ${l.z}) is inside solid`);
  }
  // Zombies climbing in must land on clear, reachable floor.
  for (const w of mapWindows(map)) {
    const i = map.cellAt(w.inX, w.y, w.inZ);
    if (i < 0 || !all[i] || !circleFits(map, 'all', w.inX, w.y, w.inZ, PLAYER_RADIUS)) errors.push(`window ${w.id}: a prop blocks the floor inside it`);
  }
  for (const sp of map.spawns) {
    const i = map.cellAt(sp.x, sp.y, sp.z);
    if (i < 0 || map.kind[i] !== Cell.Outside) errors.push(`zombie spawn ${sp.id} is not inside its pocket`);
  }
  if (map.zone.every((z) => z === NO_ZONE)) errors.push('map has no rooms');
  return { errors, warnings };
}
