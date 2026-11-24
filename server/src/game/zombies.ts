import {
  FLOOR_GAP, HOWLER_DAMAGE, SIREN_LURE_RANGE, SIREN_STANDOFF, CRAWLER_DAMAGE, CRAWLER_SPEED, PLANK_TEAR_SECONDS, UNREACHABLE, ZOMBIE_ATTACK_COOLDOWN, ZOMBIE_ATTACK_HIT_RANGE,
  ZOMBIE_ATTACK_RANGE, ZOMBIE_ATTACK_WINDUP, ZOMBIE_DAMAGE, ZOMBIE_DIRECT_CHASE_RANGE, ZOMBIE_QUEUE_GAP, ZOMBIE_RADIUS,
  ZOMBIE_RETARGET_SECONDS, ZOMBIE_SEPARATION, ZOMBIE_TURN_RATE, ZOMBIE_VAULT_SECONDS, ZombieState, lineOfSight, lineWalkable, moveCircle,
  wrapAngle, type WindowInfo, type ZombieKind,
} from '@zh/shared';
import { setPlanks } from './barricades';
import type { Zombie, ZombieAI } from './entities';
import type { Game } from './Game';
import { damagePlayer } from './players';
import type { Projectile } from './projectiles';

// Zombie brain and movement (PLAN 4.4, 6.3). Outside: walk straight to the window, tear the
// planks off, climb in. Inside: follow the target player's flow field, keep apart from the
// others, swing when close.

/** How far a zombie must get from its anchor to count as making progress. */
const PROGRESS_DIST = 0.5;
/** Speed at which crowded zombies push each other apart, m/s. */
const SEPARATION_SPEED = 3;
/** Bodies never end a step closer than this. */
const MIN_GAP = 0.5;
const WEAVE = 0.3;
/** A chaser that has got nowhere for this long tries a different player for a while. */
const BLOCKED_SECONDS = 3;
/** Standing this close to its target, in sight, a zombie is crowding round rather than stuck. */
const CROWD_RANGE = 2.5;
const dir = { x: 0, z: 0 };
/** Flow-field cost of a metre of walking. */
const COST_PER_METRE = 20;

const yawTo = (dx: number, dz: number): number => Math.atan2(-dx, -dz);
const isOutside = (s: ZombieState): boolean => s === ZombieState.Approach || s === ZombieState.Tear || s === ZombieState.Vault;

export function spawnZombie(g: Game, win: WindowInfo | null, x: number, y: number, z: number, hp: number, speed: number, kind: ZombieKind = 'zombie'): Zombie {
  const ai: ZombieAI = {
    windowId: win?.id ?? null, target: 0, retargetAt: 0, swingAt: 0, readyAt: 0, vault: 0, crawler: false,
    weave: g.rng.range(0, Math.PI * 2), ax: x, az: z, progressAt: g.time,
  };
  const zb: Zombie = {
    id: g.nextEntityId++, kind, seed: g.rng.int(0, 0xffff), x, y, z, yaw: win ? yawTo(-win.ox, -win.oz) : g.rng.range(-Math.PI, Math.PI),
    state: win ? ZombieState.Approach : ZombieState.Chase, hp, maxHp: hp, speed, ai,
  };
  g.zombies.set(zb.id, zb);
  g.emit({ e: 'zombieSpawn', id: zb.id, kind: zb.kind, seed: zb.seed, x, y, z });
  return zb;
}

/** Take a zombie's legs: it drags itself along from now on. (Howlers have four and keep running.) */
export function cripple(z: Zombie): void {
  if (!z.ai || z.ai.crawler || z.kind === 'howler') return;
  z.ai.crawler = true;
  z.speed = CRAWLER_SPEED;
  if (z.state === ZombieState.Chase) z.state = ZombieState.Crawl;
  else if (z.state === ZombieState.Attack) z.state = ZombieState.CrawlAttack;
}

/** Seconds since this zombie last got anywhere (moved, tore a plank, swung, or waited its turn). */
export const idleFor = (g: Game, z: Zombie): number => (z.ai ? g.time - z.ai.progressAt : 0);

function progress(g: Game, z: Zombie, ai: ZombieAI): void {
  ai.ax = z.x;
  ai.az = z.z;
  ai.progressAt = g.time;
}

function turn(z: Zombie, want: number, dt: number): void {
  const d = wrapAngle(want - z.yaw);
  const max = ZOMBIE_TURN_RATE * dt;
  z.yaw = wrapAngle(z.yaw + Math.max(-max, Math.min(max, d)));
}

export function updateZombies(g: Game, dt: number): void {
  const list: Zombie[] = [];
  for (const z of g.zombies.values()) if (z.ai) list.push(z);
  const wells = g.projectiles.filter((pr) => pr.kind === 'well' && pr.well);
  for (const z of list) {
    const ai = z.ai!;
    if (isOutside(z.state)) outside(g, z, ai, list, dt);
    else if (dragged(g, z, ai, wells, dt)) continue;
    else if (z.state === ZombieState.Attack || z.state === ZombieState.CrawlAttack) attack(g, z, ai, dt);
    else chase(g, z, ai, list, dt);
  }
}

function outside(g: Game, z: Zombie, ai: ZombieAI, list: Zombie[], dt: number): void {
  const b = g.barricades.get(ai.windowId ?? '');
  if (!b) {
    z.state = ZombieState.Chase;
    return;
  }
  const w = b.win;
  if (z.state === ZombieState.Approach) {
    const dx = w.outX - z.x;
    const dz = w.outZ - z.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) {
      z.x = w.outX;
      z.z = w.outZ;
      z.yaw = yawTo(-w.ox, -w.oz);
      z.state = ZombieState.Tear;
      ai.readyAt = g.time + PLANK_TEAR_SECONDS;
      progress(g, z, ai);
      return;
    }
    // Queue: wait while another zombie for this window is just ahead.
    for (const o of list) {
      if (o === z || o.ai!.windowId !== w.id || Math.hypot(o.x - z.x, o.z - z.z) >= ZOMBIE_QUEUE_GAP) continue;
      const od = Math.hypot(w.outX - o.x, w.outZ - o.z);
      if (o.state !== ZombieState.Approach || od < d || (od === d && o.id < z.id)) {
        progress(g, z, ai); // waiting its turn is not being stuck
        return;
      }
    }
    const step = Math.min(d, z.speed * dt);
    z.x += (dx / d) * step;
    z.z += (dz / d) * step;
    turn(z, yawTo(dx, dz), dt);
    if (Math.hypot(z.x - ai.ax, z.z - ai.az) > PROGRESS_DIST) progress(g, z, ai);
    return;
  }
  b.attackedAt = g.time;
  if (z.state === ZombieState.Tear) {
    if (b.planks <= 0) {
      z.state = ZombieState.Vault;
      ai.vault = 0;
      progress(g, z, ai);
    } else if (g.time >= ai.readyAt) {
      setPlanks(g, b, b.planks - 1);
      ai.readyAt = g.time + PLANK_TEAR_SECONDS;
      progress(g, z, ai);
    }
    return;
  }
  // Vault: over the sill and down inside.
  ai.vault = Math.min(1, ai.vault + dt / ZOMBIE_VAULT_SECONDS);
  z.y = w.y;
  z.x = w.outX + (w.inX - w.outX) * ai.vault;
  z.z = w.outZ + (w.inZ - w.outZ) * ai.vault;
  if (ai.vault >= 1) {
    ai.windowId = null;
    z.state = ai.crawler ? ZombieState.Crawl : ZombieState.Chase;
    progress(g, z, ai);
  }
}

/** A singularity in reach and in sight has hold of it: it goes where it is pulled and does nothing else. */
function dragged(g: Game, z: Zombie, ai: ZombieAI, wells: Projectile[], dt: number): boolean {
  for (const w of wells) {
    const dx = w.x - z.x;
    const dz = w.z - z.z;
    const d = Math.hypot(dx, dz);
    if (d > w.well!.radius || Math.abs(w.y - z.y - 1) > w.well!.radius || !lineOfSight(g.map, z.x, z.y, z.z, w.x, g.map.floorUnder(w.x, w.y, w.z), w.z, g.openDoors)) continue;
    if (d > 0.3) {
      const step = Math.min(d - 0.3, w.well!.pull * dt);
      const moved = moveCircle(g.map, g.openDoors, z.x, z.y, z.z, (dx / d) * step, (dz / d) * step, ZOMBIE_RADIUS);
      z.x = moved.x;
      z.y = moved.y;
      z.z = moved.z;
    }
    ai.swingAt = 0;
    z.state = ai.crawler ? ZombieState.Crawl : ZombieState.Chase;
    progress(g, z, ai);
    return true;
  }
  return false;
}

/** Pick the player with the shortest walk; `avoid` skips one (for a zombie that cannot get at its target). */
function retarget(g: Game, z: Zombie, ai: ZombieAI, avoid = 0): void {
  ai.retargetAt = g.time + ZOMBIE_RETARGET_SECONDS;
  let best = UNREACHABLE;
  const before = ai.target;
  ai.target = 0;
  for (const p of g.players.values()) {
    if (p.pub.id === avoid) continue;
    const cost = g.nav.fieldTo(p.pub.id)?.costAt(z.x, z.y, z.z) ?? UNREACHABLE;
    if (cost < best) {
      best = cost;
      ai.target = p.pub.id;
    }
  }
  if (avoid && !ai.target) ai.target = before;
}

function chase(g: Game, z: Zombie, ai: ZombieAI, list: Zombie[], dt: number): void {
  if (g.time >= ai.retargetAt) retarget(g, z, ai);
  // A Siren within earshot matters more than any player.
  const lure = g.nav.lure && g.nav.lure.field.costAt(z.x, z.y, z.z) < SIREN_LURE_RANGE * COST_PER_METRE ? g.nav.lure : null;
  const player = lure ? undefined : g.players.get(ai.target);
  const t = lure ?? player;
  const field = lure ? lure.field : player && g.nav.fieldTo(player.pub.id);
  if (!t || !field) {
    progress(g, z, ai); // nobody it can reach: standing around is fine
    return;
  }
  const tx = t.x - z.x;
  const tz = t.z - z.z;
  const d = Math.hypot(tx, tz);
  // "Sees" means a clear run: a table between them is as good as a wall.
  const sees = d < ZOMBIE_DIRECT_CHASE_RANGE && Math.abs(t.y - z.y) < FLOOR_GAP && lineWalkable(g.map, z.x, z.y, z.z, t.x, t.y, t.z, g.openDoors);
  if (lure && d <= SIREN_STANDOFF && sees) {
    turn(z, yawTo(tx, tz), dt);
    progress(g, z, ai); // crowding round the noise
    return;
  }
  if (!lure && d <= ZOMBIE_ATTACK_RANGE && sees) {
    z.state = ai.crawler ? ZombieState.CrawlAttack : ZombieState.Attack;
    ai.swingAt = g.time + ZOMBIE_ATTACK_WINDUP;
    progress(g, z, ai);
    return;
  }
  if (sees && d < CROWD_RANGE) ai.progressAt = Math.max(ai.progressAt, g.time - BLOCKED_SECONDS + dt);
  else if (g.time - ai.progressAt > BLOCKED_SECONDS) {
    retarget(g, z, ai, ai.target);
    ai.retargetAt = g.time + BLOCKED_SECONDS * 2;
    ai.progressAt = g.time - BLOCKED_SECONDS + 1;
  }
  if (sees || field.costAt(z.x, z.y, z.z) === 0) {
    dir.x = tx / (d || 1);
    dir.z = tz / (d || 1);
  } else if (field.dir(z.x, z.y, z.z, dir)) {
    // A slow sideways weave so a horde does not walk in single file.
    const w = Math.sin(g.time * 1.3 + ai.weave) * WEAVE;
    const wx = dir.x - dir.z * w;
    const wz = dir.z + dir.x * w;
    const len = Math.hypot(wx, wz);
    dir.x = wx / len;
    dir.z = wz / len;
  } else {
    ai.retargetAt = 0; // no path to this player any more
    progress(g, z, ai);
    return;
  }
  // Step, steering away from close neighbours; then make sure no two bodies overlap.
  let mx = dir.x * z.speed * dt;
  let mz = dir.z * z.speed * dt;
  for (let pass = 0; pass < 2; pass++) {
    const nx = z.x + (pass ? mx : 0);
    const nz = z.z + (pass ? mz : 0);
    for (const o of list) {
      if (o === z || isOutside(o.state) || Math.abs(o.y - z.y) >= FLOOR_GAP) continue;
      let ox = nx - o.x;
      let oz = nz - o.z;
      let od = Math.hypot(ox, oz);
      const reach = pass ? MIN_GAP : ZOMBIE_SEPARATION;
      if (od >= reach) continue;
      if (od < 1e-4) {
        // Exactly stacked: split along a direction that differs per zombie.
        ox = Math.cos(z.id * 2.4);
        oz = Math.sin(z.id * 2.4);
        od = 1;
      }
      const push = pass ? MIN_GAP - Math.hypot(nx - o.x, nz - o.z) : ((reach - od) / reach) * SEPARATION_SPEED * dt;
      mx += (ox / od) * push;
      mz += (oz / od) * push;
    }
  }
  const moved = moveCircle(g.map, g.openDoors, z.x, z.y, z.z, mx, mz, ZOMBIE_RADIUS);
  z.x = moved.x;
  z.y = moved.y;
  z.z = moved.z;
  turn(z, yawTo(dir.x, dir.z), dt);
  if (Math.hypot(z.x - ai.ax, z.z - ai.az) > PROGRESS_DIST) progress(g, z, ai);
}

function attack(g: Game, z: Zombie, ai: ZombieAI, dt: number): void {
  const t = g.players.get(ai.target);
  if (t) turn(z, yawTo(t.x - z.x, t.z - z.z), dt);
  if (ai.swingAt > 0) {
    if (g.time < ai.swingAt) return;
    ai.swingAt = 0;
    ai.readyAt = g.time + ZOMBIE_ATTACK_COOLDOWN;
    if (t && g.targetable(t) && Math.hypot(t.x - z.x, t.z - z.z) <= ZOMBIE_ATTACK_HIT_RANGE && Math.abs(t.y - z.y) < FLOOR_GAP && lineOfSight(g.map, z.x, z.y, z.z, t.x, t.y, t.z, g.openDoors)) {
      damagePlayer(g, t, ai.crawler ? CRAWLER_DAMAGE : z.kind === 'howler' ? HOWLER_DAMAGE : ZOMBIE_DAMAGE, z.x, z.z);
    }
    return;
  }
  if (g.time >= ai.readyAt) z.state = ai.crawler ? ZombieState.Crawl : ZombieState.Chase;
}
