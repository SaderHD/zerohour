import {
  FLOOR_GAP, HOWLER_MAX_DIST, HOWLER_MIN_DIST, HOWLER_TELL_SECONDS, MAX_ALIVE_CAP, MAX_ALIVE_PER_EXTRA_PLAYER, MAX_ALIVE_SOLO, ZOMBIE_QUEUE_GAP, ZOMBIE_RADIUS, circleFits, rulesOf,
} from '@zh/shared';
import type { Game } from './Game';
import { spawnZombie } from './zombies';

/** A zombie waiting to be let in. The round system fills the queue (session 6); so does the debug hook. */
export interface SpawnOrder {
  hp: number;
  speed: number;
  /** Howlers do not come through the windows: lightning strikes inside and they are there. */
  kind?: 'howler';
}

/** A howler on its way: the lightning has struck at (x, z). */
export interface Arrival {
  at: number;
  x: number;
  y: number;
  z: number;
  order: SpawnOrder;
}

/** Flow-field cost of a metre of walking (10 per half-metre cell). */
const COST_PER_METRE = 20;
const SPOT_TRIES = 24;

export const maxAlive = (players: number): number =>
  Math.min(MAX_ALIVE_CAP, MAX_ALIVE_SOLO + MAX_ALIVE_PER_EXTRA_PLAYER * Math.max(0, players - 1));

export function zombieCount(g: Game): number {
  let n = 0;
  for (const z of g.zombies.values()) if (z.kind !== 'dummy') n++;
  return n;
}

/** Enemies still on their way in: queued, or about to appear. */
export const zombiesToCome = (g: Game): number => g.spawnQueue.length + g.arrivals.length + zombieCount(g);

/** Somewhere inside for a howler to appear: a short run from a player, never on top of one. */
function howlerSpot(g: Game): { x: number; y: number; z: number } | null {
  const targets = [...g.players.values()].filter((p) => g.targetable(p));
  if (targets.length === 0) return null;
  const field = g.nav.fieldTo(g.luck.pick(targets).pub.id);
  const zones = activeZones(g);
  const rooms = g.map.def.rooms.filter((r) => zones.has(r.zone) && r.w >= 2 && r.d >= 2);
  if (!field || rooms.length === 0) return null;
  for (let i = 0; i < SPOT_TRIES; i++) {
    const room = g.luck.pick(rooms);
    const x = room.x + g.luck.range(0.5, room.w - 0.5);
    const z = room.z + g.luck.range(0.5, room.d - 0.5);
    const y = g.map.floorOn(room.level, x, z);
    if (Number.isNaN(y)) continue;
    const cost = field.costAt(x, y, z);
    if (cost < HOWLER_MIN_DIST * COST_PER_METRE || cost > HOWLER_MAX_DIST * COST_PER_METRE) continue;
    if (circleFits(g.map, g.openDoors, x, y, z, ZOMBIE_RADIUS + 0.1)) return { x, y, z };
  }
  return null;
}

/** Zones with a player in them, plus their neighbours through open doors and arches. */
export function activeZones(g: Game): Set<string> {
  const zones = new Set<string>();
  for (const p of g.players.values()) {
    if (!g.targetable(p)) continue;
    const zone = g.map.zoneAt(p.x, p.y, p.z);
    if (!zone) continue;
    zones.add(zone);
    for (const n of g.map.adjacency.get(zone) ?? []) {
      if (g.map.openingById(n.via)?.kind !== 'door' || g.openDoors.has(n.via)) zones.add(n.zone);
    }
  }
  return zones;
}

/** How far the nearest player has to be walked to from where a window lets the dead in, metres. */
function walkFrom(g: Game, win: { inX: number; y: number; inZ: number }): number {
  let best = Infinity;
  for (const p of g.players.values()) {
    if (!g.targetable(p)) continue;
    const cost = g.nav.fieldTo(p.pub.id)?.costAt(win.inX, win.y, win.inZ) ?? Infinity;
    best = Math.min(best, cost / COST_PER_METRE);
  }
  return best;
}

/** The windows no further from a player than the map lets the dead come from (`MapRules.spawnReach`): failing any, the nearest. */
function withinReach<B extends { win: { inX: number; y: number; inZ: number } }>(g: Game, offered: B[]): B[] {
  const reach = rulesOf(g.map.def).spawnReach;
  if (reach === Infinity || offered.length === 0) return offered;
  const far = offered.map((b) => walkFrom(g, b.win));
  const near = offered.filter((_, i) => far[i]! <= reach);
  if (near.length) return near;
  const least = Math.min(...far);
  return offered.filter((_, i) => far[i] === least);
}

/** Release queued zombies one at a time at the windows of active zones. */
export function updateSpawner(g: Game): void {
  for (let i = g.arrivals.length - 1; i >= 0; i--) {
    const a = g.arrivals[i]!;
    if (g.time < a.at) continue;
    g.arrivals.splice(i, 1);
    spawnZombie(g, null, a.x, a.y, a.z, a.order.hp, a.order.speed, 'howler');
  }
  if (g.spawnQueue.length === 0 || g.time < g.nextSpawnAt) return;
  let players = 0;
  for (const p of g.players.values()) if (g.targetable(p)) players++;
  if (players === 0 || zombieCount(g) + g.arrivals.length >= maxAlive(players)) return;
  if (g.spawnQueue[0]!.kind === 'howler') {
    const spot = howlerSpot(g);
    if (!spot) return; // nowhere good this tick: try again on the next
    g.arrivals.push({ at: g.time + HOWLER_TELL_SECONDS, ...spot, order: g.spawnQueue.shift()! });
    g.emit({ e: 'strike', x: spot.x, y: spot.y, z: spot.z });
    g.nextSpawnAt = g.time + g.spawnInterval;
    return;
  }
  const zones = activeZones(g);
  // (A window with one of them still standing at it waits its turn: where few windows are in reach, so does the round.)
  const free = withinReach(g, [...g.barricades.values()].filter((b) => zones.has(b.win.zone))).filter((b) => {
    for (const z of g.zombies.values()) if (Math.abs(z.y - b.win.y) < FLOOR_GAP && Math.hypot(z.x - b.win.spawnX, z.z - b.win.spawnZ) < ZOMBIE_QUEUE_GAP) return false;
    return true;
  });
  if (free.length === 0) return;
  const { win } = g.rng.pick(free);
  const order = g.spawnQueue.shift()!;
  spawnZombie(g, win, win.spawnX, win.y, win.spawnZ, order.hp, order.speed);
  g.nextSpawnAt = g.time + g.spawnInterval;
}
