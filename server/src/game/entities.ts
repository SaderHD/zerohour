import {
  DUMMY_HP, DUMMY_RESET_SECONDS, ZombieState, type EntityId, type HitZone, type PlayerId, type ZombieKind, type ZombieSnap,
} from '@zh/shared';
import { scoreHit } from './economy';
import { onZombieKilled } from './powerups';
import type { Game } from './Game';

/** What a walking zombie is up to (see zombies.ts). Dummies have none. */
export interface ZombieAI {
  /** The window it enters through; null once inside (or when debug-spawned inside). */
  windowId: string | null;
  target: PlayerId;
  retargetAt: number;
  /** Game time the current swing lands; 0 when not swinging. */
  swingAt: number;
  /** Game time it may act again (plank timer, attack recovery). */
  readyAt: number;
  /** Progress through a vault, 0..1. */
  vault: number;
  crawler: boolean;
  /** Phase of its sideways weave. */
  weave: number;
  /** Last spot and time it made progress, for the stuck check. */
  ax: number;
  az: number;
  progressAt: number;
}

/** A server-owned enemy: a zombie, or the stationary target dummy. */
export interface Zombie {
  id: EntityId;
  kind: ZombieKind;
  seed: number;
  x: number;
  /** Height of the floor it stands on. */
  y: number;
  z: number;
  yaw: number;
  state: ZombieState;
  hp: number;
  maxHp: number;
  /** Nominal move speed in m/s (also tells clients which gait to play). */
  speed: number;
  ai?: ZombieAI;
}

export function spawnDummy(g: Game, x: number, y: number, z: number, yaw: number): Zombie {
  const d: Zombie = {
    id: g.nextEntityId++, kind: 'dummy', seed: g.rng.int(0, 0xffff), x, y, z, yaw,
    state: ZombieState.Idle, hp: DUMMY_HP, maxHp: DUMMY_HP, speed: 0,
  };
  g.zombies.set(d.id, d);
  g.emit({ e: 'zombieSpawn', id: d.id, kind: d.kind, seed: d.seed, x, y, z });
  return d;
}

/** Apply damage, announce it, and remove the entity if it dies. Returns true on a kill. */
export function damageZombie(g: Game, z: Zombie, dmg: number, by: PlayerId, zone: HitZone, cause: string): boolean {
  if (dmg <= 0 || z.hp <= 0) return false;
  // Reaper: anything a player lands is enough.
  if (z.kind !== 'dummy' && g.effectOn('reaper') && g.players.has(by)) dmg = Math.max(dmg, z.hp);
  z.hp -= dmg;
  g.emit({ e: 'zombieHit', id: z.id, by, zone, dmg });
  const killed = z.hp <= 0;
  if (killed) killZombie(g, z, by, zone, cause);
  scoreHit(g, z, by, zone, cause, killed);
  return killed;
}

export function killZombie(g: Game, z: Zombie, by: PlayerId | undefined, zone: HitZone | undefined, cause: string): void {
  z.hp = 0;
  g.zombies.delete(z.id);
  g.emit({ e: 'zombieDied', id: z.id, by, zone, cause });
  // A destroyed dummy stands back up so damage tests can continue.
  if (z.kind === 'dummy') g.dummyResets.push({ at: g.time + DUMMY_RESET_SECONDS, x: z.x, y: z.y, z: z.z, yaw: z.yaw });
  else if (cause !== 'debug' && cause !== 'firestorm') onZombieKilled(g, z, by);
}

export function updateEntities(g: Game): void {
  for (let i = g.dummyResets.length - 1; i >= 0; i--) {
    const r = g.dummyResets[i]!;
    if (g.time < r.at) continue;
    g.dummyResets.splice(i, 1);
    spawnDummy(g, r.x, r.y, r.z, r.yaw);
  }
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

export const zombieSnap = (z: Zombie): ZombieSnap =>
  [z.id, r2(z.x), r2(z.z), r2(z.yaw), z.state, Math.max(0, Math.round((z.hp / z.maxHp) * 1000) / 1000), z.speed, r2(z.y)];
