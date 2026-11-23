import {
  CELL_SIZE, CRAWLER_MIN_BLAST_FRAC, Cell, EXPLOSION_PLAYER_MULT, PLAYER_RADIUS, PROJECTILE_GRAVITY, ZOMBIE_RADIUS, explosionDamage, lineOfSight,
  type EntityId, type PlayerId, type ProjectileSnap,
} from '@zh/shared';
import { damageZombie } from './entities';
import type { Game } from './Game';
import { damagePlayer } from './players';
import { cripple } from './zombies';

export interface Projectile {
  id: EntityId;
  kind: 'frag' | 'thumper';
  owner: PlayerId;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Seconds until it goes off regardless. */
  fuse: number;
  /** Explodes on first contact instead of bouncing. */
  impact: boolean;
  damage: number;
  radius: number;
}

const SIZE = 0.08;
const MAX_STEP = 0.2; // metres per sub-step, under half a cell
const WALL_BOUNCE = 0.45;
const FLOOR_BOUNCE = 0.35;
const FLOOR_FRICTION = 0.65;

export function spawnProjectile(g: Game, p: Omit<Projectile, 'id'>): Projectile {
  const pr = { ...p, id: g.nextEntityId++ };
  g.projectiles.push(pr);
  return pr;
}

/** Is the point inside something solid (wall, closed door, below a sill, above a ceiling)? */
function blocked(g: Game, x: number, y: number, z: number): boolean {
  const cx = Math.floor(x / CELL_SIZE);
  const cz = Math.floor(z / CELL_SIZE);
  if (g.map.isOpaque(cx, cz, g.openDoors)) return true;
  const i = g.map.idx(cx, cz);
  if (y < g.map.lo[i]!) return true;
  return !g.map.sky[i] && g.map.kind[i] !== Cell.Outside && y > g.map.hi[i]!;
}

export function explode(g: Game, pr: Projectile): void {
  g.emit({ e: 'explosion', x: pr.x, y: pr.y, z: pr.z, radius: pr.radius, kind: pr.kind });
  for (const z of [...g.zombies.values()]) {
    const d = Math.max(0, Math.hypot(z.x - pr.x, z.z - pr.z) - ZOMBIE_RADIUS);
    if (d >= pr.radius || !lineOfSight(g.map, pr.x, pr.z, z.x, z.z, g.openDoors)) continue;
    const dmg = explosionDamage(pr.damage, pr.radius, d);
    // A blast that fails to kill takes the legs: the zombie crawls from here on.
    if (!damageZombie(g, z, dmg, pr.owner, 'torso', pr.kind) && dmg >= z.maxHp * CRAWLER_MIN_BLAST_FRAC) cripple(z);
  }
  for (const p of g.players.values()) {
    const d = Math.max(0, Math.hypot(p.x - pr.x, p.z - pr.z) - PLAYER_RADIUS);
    if (d >= pr.radius || !lineOfSight(g.map, pr.x, pr.z, p.x, p.z, g.openDoors)) continue;
    damagePlayer(g, p, explosionDamage(pr.damage, pr.radius, d) * EXPLOSION_PLAYER_MULT, pr.x, pr.z);
  }
}

export function updateProjectiles(g: Game, dt: number): void {
  for (let i = g.projectiles.length - 1; i >= 0; i--) {
    const pr = g.projectiles[i]!;
    let boom = (pr.fuse -= dt) <= 0;
    const steps = Math.max(1, Math.ceil((Math.hypot(pr.vx, pr.vy, pr.vz) * dt) / MAX_STEP));
    const h = dt / steps;
    for (let s = 0; s < steps && !boom; s++) {
      pr.vy -= PROJECTILE_GRAVITY * h;
      let hit = false;
      if (blocked(g, pr.x + pr.vx * h, pr.y, pr.z)) {
        pr.vx *= -WALL_BOUNCE;
        hit = true;
      } else pr.x += pr.vx * h;
      if (blocked(g, pr.x, pr.y, pr.z + pr.vz * h)) {
        pr.vz *= -WALL_BOUNCE;
        hit = true;
      } else pr.z += pr.vz * h;
      const ny = pr.y + pr.vy * h;
      if (ny < SIZE || blocked(g, pr.x, ny, pr.z)) {
        if (pr.vy < 0) {
          pr.vx *= FLOOR_FRICTION;
          pr.vz *= FLOOR_FRICTION;
        }
        pr.vy = Math.abs(pr.vy) < 1 ? 0 : -pr.vy * FLOOR_BOUNCE;
        hit = true;
      } else pr.y = ny;
      if (pr.impact) {
        if (!hit) for (const z of g.zombies.values()) if (pr.y < 2 && Math.hypot(z.x - pr.x, z.z - pr.z) < ZOMBIE_RADIUS + 0.3) hit = true;
        boom = hit;
      }
    }
    if (boom) {
      g.projectiles.splice(i, 1);
      explode(g, pr);
    }
  }
}

const r2 = (n: number): number => Math.round(n * 100) / 100;
export const projectileSnap = (p: Projectile): ProjectileSnap => [p.id, p.kind, r2(p.x), r2(p.y), r2(p.z)];
