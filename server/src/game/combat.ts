import {
  FIRE_RATE_SLACK, GRENADE_COOLDOWN, GRENADE_DAMAGE, GRENADE_FUSE, GRENADE_LOFT, GRENADE_RADIUS, GRENADE_SPEED,
  HIT_DIST_SLACK, KNIFE_COOLDOWN, MoveState, KNIFE_DAMAGE, KNIFE_RANGE, KNIFE_RANGE_SLACK, PLAYER_EYE_HEIGHT, SWAP_SECONDS,
  WEAPON_SLOTS, aimDir, fireInterval, hitDamage, isFiniteNum, lineOfSight, maxHitsPerShot, weaponDef,
  type ClientMsg, type HitZone, type WeaponId, type WeaponState,
} from '@zh/shared';
import { damageZombie } from './entities';
import type { Game, PlayerState } from './Game';
import { standing } from './players';
import { spawnProjectile } from './projectiles';

type Msg<T extends ClientMsg['t']> = Extract<ClientMsg, { t: T }>;
const ZONES: ReadonlySet<string> = new Set<HitZone>(['head', 'torso', 'limb']);

export function newWeapon(id: WeaponId): WeaponState {
  const def = weaponDef(id)!;
  return { id, upgraded: false, mag: def.magSize, reserve: def.reserve };
}

/** Debug/give path (wall buys and the Cache reuse it later): refill if owned, else fill a slot or replace the held gun. */
export function giveWeapon(g: Game, p: PlayerState, id: WeaponId): boolean {
  if (!weaponDef(id)) return false;
  const ws = p.pub.weapons;
  const owned = ws.findIndex((w) => w.id === id);
  p.reloadUntil = 0;
  if (owned >= 0) ws[owned] = newWeapon(id);
  else if (ws.length < WEAPON_SLOTS) ws.push(newWeapon(id));
  else ws[p.pub.slot] = newWeapon(id);
  p.pub.slot = owned >= 0 ? owned : ws.findIndex((w) => w.id === id);
  g.emit({ e: 'player', player: p.pub });
  return true;
}

/** Finish a reload whose time has come. Called before anything that reads ammo. */
export function settleReload(g: Game, p: PlayerState): void {
  if (p.reloadUntil <= 0 || g.now() < p.reloadUntil) return;
  p.reloadUntil = 0;
  const w = p.pub.weapons[p.pub.slot];
  const def = w && weaponDef(w.id);
  if (!w || !def) return;
  const take = Math.min(def.magSize - w.mag, w.reserve);
  w.mag += take;
  w.reserve -= take;
  g.emit({ e: 'player', player: p.pub });
}

export function onFire(g: Game, p: PlayerState, m: Msg<'fire'>): void {
  if (![m.seq, m.yaw, m.pitch].every(isFiniteNum) || m.seq <= p.fireAck) return;
  p.fireAck = m.seq; // acknowledged even if refused, so the client's ammo count converges
  if (p.state === MoveState.Dead) return; // a downed player still has their pistol
  settleReload(g, p);
  const w = p.pub.weapons[p.pub.slot];
  const def = w && weaponDef(w.id);
  if (!w || !def || m.slot !== p.pub.slot || p.reloadUntil > 0 || w.mag <= 0) return;
  const now = g.now();
  if (now < p.nextFireAt - FIRE_RATE_SLACK) return; // faster than the weapon can cycle
  p.nextFireAt = Math.max(p.nextFireAt, now) + fireInterval(def);
  w.mag--;
  g.emit({ e: 'fired', id: p.pub.id, weapon: w.id, yaw: m.yaw, pitch: m.pitch });

  if (def.projectile) {
    const [dx, dy, dz] = aimDir(m.yaw, m.pitch);
    const s = def.projectile.speed;
    spawnProjectile(g, {
      kind: def.projectile.kind, owner: p.pub.id, x: p.x + dx * 0.5, y: PLAYER_EYE_HEIGHT - 0.1 + dy * 0.5, z: p.z + dz * 0.5,
      vx: dx * s, vy: dy * s, vz: dz * s, fuse: 6, impact: true, damage: def.damage, radius: def.projectile.radius,
    });
    return;
  }

  if (!Array.isArray(m.hits)) return;
  const perTarget = new Map<number, number>();
  for (const h of m.hits.slice(0, maxHitsPerShot(def))) {
    if (!h || !ZONES.has(h.zone) || !isFiniteNum(h.dist)) continue;
    const z = g.zombies.get(h.id);
    if (!z) continue;
    const n = (perTarget.get(z.id) ?? 0) + 1;
    perTarget.set(z.id, n);
    if (n > def.pellets) continue;
    const actual = Math.hypot(z.x - p.x, z.z - p.z);
    if (Math.abs(h.dist - actual) > HIT_DIST_SLACK || actual > def.range + HIT_DIST_SLACK) continue;
    if (!lineOfSight(g.map, p.x, p.z, z.x, z.z, g.openDoors)) continue;
    damageZombie(g, z, hitDamage(def, h.zone, Math.min(h.dist, def.range)), p.pub.id, h.zone, 'bullet');
  }
}

export function onReload(g: Game, p: PlayerState): void {
  if (p.state === MoveState.Dead) return;
  settleReload(g, p);
  const w = p.pub.weapons[p.pub.slot];
  const def = w && weaponDef(w.id);
  if (!w || !def || p.reloadUntil > 0 || w.mag >= def.magSize || w.reserve <= 0) return;
  p.reloadUntil = g.now() + def.reloadTime - FIRE_RATE_SLACK;
}

export function onSwap(g: Game, p: PlayerState, m: Msg<'swap'>): void {
  if (!standing(p) || !Number.isInteger(m.slot) || m.slot === p.pub.slot || !p.pub.weapons[m.slot]) return;
  p.reloadUntil = 0; // swapping abandons a reload
  p.pub.slot = m.slot;
  p.nextFireAt = Math.max(p.nextFireAt, g.now() + SWAP_SECONDS);
  g.emit({ e: 'player', player: p.pub });
}

export function onMelee(g: Game, p: PlayerState, m: Msg<'melee'>): void {
  const now = g.now();
  if (!standing(p) || now < p.nextMeleeAt - FIRE_RATE_SLACK) return;
  p.nextMeleeAt = Math.max(p.nextMeleeAt, now) + KNIFE_COOLDOWN;
  g.emit({ e: 'melee', id: p.pub.id });
  const z = m.hit === undefined ? undefined : g.zombies.get(m.hit);
  if (!z) return;
  if (Math.hypot(z.x - p.x, z.z - p.z) > KNIFE_RANGE + KNIFE_RANGE_SLACK) return;
  if (!lineOfSight(g.map, p.x, p.z, z.x, z.z, g.openDoors)) return;
  damageZombie(g, z, KNIFE_DAMAGE, p.pub.id, 'torso', 'melee');
}

export function onThrow(g: Game, p: PlayerState, m: Msg<'throw'>): void {
  if (!standing(p) || m.kind !== 'frag' || !isFiniteNum(m.yaw) || !isFiniteNum(m.pitch)) return; // tactical: session 11
  const now = g.now();
  if (p.pub.grenades <= 0 || now < p.nextThrowAt - FIRE_RATE_SLACK) return;
  p.nextThrowAt = now + GRENADE_COOLDOWN;
  p.pub.grenades--;
  g.emit({ e: 'player', player: p.pub });
  const [dx, dy, dz] = aimDir(m.yaw, Math.max(-1.5, Math.min(1.5, m.pitch)));
  spawnProjectile(g, {
    kind: 'frag', owner: p.pub.id, x: p.x + dx * 0.4, y: PLAYER_EYE_HEIGHT - 0.15, z: p.z + dz * 0.4,
    vx: dx * GRENADE_SPEED, vy: dy * GRENADE_SPEED + GRENADE_LOFT, vz: dz * GRENADE_SPEED,
    fuse: GRENADE_FUSE, impact: false, damage: GRENADE_DAMAGE, radius: GRENADE_RADIUS,
  });
}
