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
  kind: 'frag' | 'thumper' | 'siren' | 'orb' | 'well';
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
  /** Flies straight: gravity does not touch it (the Gravewell's orb). */
  float?: boolean;
  /** An orb opens this singularity where it lands; a `well` is that singularity (see zombies.ts for the pull). */
  well?: { seconds: number; radius: number; pull: number };
}

const SIZE = 0.08;
const BODY_HEIGHT = 2;
const MAX_STEP = 0.2; // metres per sub-step, under half a cell
const WALL_BOUNCE = 0.45;
const FLOOR_BOUNCE = 0.35;
const FLOOR_FRICTION = 0.65;

export function spawnProjectile(g: Game, p: Omit<Projectile, 'id'>): Projectile {
  const pr = { ...p, id: g.nextEntityId++ };
  g.projectiles.push(pr);
  return pr;
}

/** Is the point inside something solid (wall, closed door, below a sill, above a ceiling, under a roof)? */
function blocked(g: Game, x: number, y: number, z: number): boolean {
  const cx = Math.floor(x / CELL_SIZE);
  const cz = Math.floor(z / CELL_SIZE);
  const i = g.map.holdAt(cx, cz, y);
  // (Over a roof lower than it is, it is in the air.)
  return i < 0 ? !g.map.aloft(cx, cz, y) : g.map.shutAt(i, y, g.openDoors);
}

/** Has it come down onto a floor (as opposed to a window's sill)? */
function landed(g: Game, x: number, y: number, z: number): boolean {
  const i = g.map.holdAt(Math.floor(x / CELL_SIZE), Math.floor(z / CELL_SIZE), y);
  return i >= 0 && g.map.kind[i] !== Cell.Window && y < g.map.lo[i]! + SIZE;
}

/** How far a blast at height `y` is from a body standing on `feet`: over the floor, plus whatever it is above the head or below the feet. */
function blastDist(dx: number, dz: number, y: number, feet: number, radius: number): number {
  const dy = Math.max(0, feet - y, y - (feet + BODY_HEIGHT));
  return Math.max(0, Math.hypot(dx, dz, dy) - radius);
}

export function explode(g: Game, pr: Projectile): void {
  g.emit({ e: 'explosion', x: pr.x, y: pr.y, z: pr.z, radius: pr.radius, kind: pr.kind });
  // Who it reaches is judged as from someone standing where it went off.
  const floor = g.map.floorUnder(pr.x, pr.y, pr.z);
  for (const z of [...g.zombies.values()]) {
    const d = blastDist(z.x - pr.x, z.z - pr.z, pr.y, z.y, ZOMBIE_RADIUS);
    if (d >= pr.radius || !lineOfSight(g.map, pr.x, floor, pr.z, z.x, z.y, z.z, g.openDoors)) continue;
    // An implosion takes everything it caught whole; a blast weakens towards its edge.
    const dmg = pr.kind === 'well' ? pr.damage : explosionDamage(pr.damage, pr.radius, d);
    // A blast that fails to kill takes the legs: the zombie crawls from here on.
    if (!damageZombie(g, z, dmg, pr.owner, 'torso', pr.kind) && dmg >= z.maxHp * CRAWLER_MIN_BLAST_FRAC) cripple(z);
  }
  if (pr.kind === 'well') return; // it only wants the dead
  for (const p of g.players.values()) {
    const d = blastDist(p.x - pr.x, p.z - pr.z, pr.y, p.y, PLAYER_RADIUS);
    if (d >= pr.radius || !lineOfSight(g.map, pr.x, floor, pr.z, p.x, p.y, p.z, g.openDoors)) continue;
    damagePlayer(g, p, explosionDamage(pr.damage, pr.radius, d) * EXPLOSION_PLAYER_MULT, pr.x, pr.z);
  }
}

export function updateProjectiles(g: Game, dt: number): void {
  for (let i = g.projectiles.length - 1; i >= 0; i--) {
    const pr = g.projectiles[i]!;
    let boom = (pr.fuse -= dt) <= 0;
    if (pr.kind === 'well') {
      if (boom) {
        g.projectiles.splice(i, 1);
        explode(g, pr);
      }
      continue;
    }
    const steps = Math.max(1, Math.ceil((Math.hypot(pr.vx, pr.vy, pr.vz) * dt) / MAX_STEP));
    const h = dt / steps;
    for (let s = 0; s < steps && !boom; s++) {
      if (!pr.float) pr.vy -= PROJECTILE_GRAVITY * h;
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
      if (landed(g, pr.x, ny, pr.z) || blocked(g, pr.x, ny, pr.z)) {
        if (pr.vy < 0) {
          pr.vx *= FLOOR_FRICTION;
          pr.vz *= FLOOR_FRICTION;
        }
        pr.vy = Math.abs(pr.vy) < 1 ? 0 : -pr.vy * FLOOR_BOUNCE;
        hit = true;
      } else pr.y = ny;
      if (pr.impact) {
        if (!hit) for (const z of g.zombies.values()) if (pr.y < z.y + BODY_HEIGHT && pr.y > z.y - 0.5 && Math.hypot(z.x - pr.x, z.z - pr.z) < ZOMBIE_RADIUS + 0.3) hit = true;
        boom = hit;
      }
    }
    if (boom && pr.kind === 'orb' && pr.well) {
      // The orb has landed: it hangs there as a singularity until its time is up.
      pr.kind = 'well';
      pr.vx = pr.vy = pr.vz = 0;
      pr.y = Math.max(pr.y, g.map.floorUnder(pr.x, pr.y, pr.z) + 0.9);
      pr.fuse = pr.well.seconds;
      pr.radius = pr.well.radius;
    } else if (boom) {
      g.projectiles.splice(i, 1);
      explode(g, pr);
    }
  }
}

const r2 = (n: number): number => Math.round(n * 100) / 100;
export const projectileSnap = (p: Projectile): ProjectileSnap => [p.id, p.kind, r2(p.x), r2(p.y), r2(p.z)];
