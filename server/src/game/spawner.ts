import { MAX_ALIVE_CAP, MAX_ALIVE_PER_EXTRA_PLAYER, MAX_ALIVE_SOLO, ZOMBIE_QUEUE_GAP } from '@zh/shared';
import type { Game } from './Game';
import { spawnZombie } from './zombies';

/** A zombie waiting to be let in. The round system fills the queue (session 6); so does the debug hook. */
export interface SpawnOrder {
  hp: number;
  speed: number;
}

export const maxAlive = (players: number): number =>
  Math.min(MAX_ALIVE_CAP, MAX_ALIVE_SOLO + MAX_ALIVE_PER_EXTRA_PLAYER * Math.max(0, players - 1));

export function zombieCount(g: Game): number {
  let n = 0;
  for (const z of g.zombies.values()) if (z.kind !== 'dummy') n++;
  return n;
}

/** Zones with a player in them, plus their neighbours through open doors and arches. */
export function activeZones(g: Game): Set<string> {
  const zones = new Set<string>();
  for (const p of g.players.values()) {
    if (!g.targetable(p)) continue;
    const zone = g.map.zoneAt(p.x, p.z);
    if (!zone) continue;
    zones.add(zone);
    for (const n of g.map.adjacency.get(zone) ?? []) {
      if (g.map.openingById(n.via)?.kind !== 'door' || g.openDoors.has(n.via)) zones.add(n.zone);
    }
  }
  return zones;
}

/** Release queued zombies one at a time at the windows of active zones. */
export function updateSpawner(g: Game): void {
  if (g.spawnQueue.length === 0 || g.time < g.nextSpawnAt) return;
  let players = 0;
  for (const p of g.players.values()) if (g.targetable(p)) players++;
  if (players === 0 || zombieCount(g) >= maxAlive(players)) return;
  const zones = activeZones(g);
  const free = [...g.barricades.values()].filter((b) => {
    if (!zones.has(b.win.zone)) return false;
    for (const z of g.zombies.values()) if (Math.hypot(z.x - b.win.spawnX, z.z - b.win.spawnZ) < ZOMBIE_QUEUE_GAP) return false;
    return true;
  });
  if (free.length === 0) return;
  const { win } = g.rng.pick(free);
  const order = g.spawnQueue.shift()!;
  spawnZombie(g, win, win.spawnX, win.spawnZ, order.hp, order.speed);
  g.nextSpawnAt = g.time + g.spawnInterval;
}
