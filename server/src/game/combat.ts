import {
  SIREN_DAMAGE, SIREN_RADIUS, SIREN_SECONDS, chainTargets,
  FIRE_RATE_SLACK, FLOOR_GAP, GRENADE_COOLDOWN, GRENADE_DAMAGE, GRENADE_FUSE, GRENADE_LOFT, GRENADE_RADIUS, GRENADE_SPEED,
  HIT_DIST_SLACK, KNIFE_COOLDOWN, MoveState, KNIFE_DAMAGE, KNIFE_RANGE, KNIFE_RANGE_SLACK, PLAYER_EYE_HEIGHT, SIGHT_HEIGHT, SWAP_SECONDS,
  aimDir, fireInterval, fireRateMultWith, hitDamage, isFiniteNum, lineOfSight, maxHitsPerShot, reloadMultWith, weaponSlotsWith, weaponStats,
  type ClientMsg, type HitZone, type WeaponDef, type WeaponId, type WeaponState,
} from '@zh/shared';
import { damageZombie, type Zombie } from './entities';
import type { Game, PlayerState } from './Game';
import { standing } from './players';
import { spawnProjectile } from './projectiles';

type Msg<T extends ClientMsg['t']> = Extract<ClientMsg, { t: T }>;
const ZONES: ReadonlySet<string> = new Set<HitZone>(['head', 'torso', 'limb']);

export function newWeapon(id: WeaponId, upgraded = false): WeaponState {
  const def = weaponStats(id, upgraded)!;
  return { id, upgraded, mag: def.magSize, reserve: def.reserve };
}

/** The stats of a held weapon, upgrade included. */
const statsOf = (w: WeaponState | undefined): WeaponDef | undefined => w && weaponStats(w.id, w.upgraded);

/** Hand a weapon over (wall buys, the Forge, the debug hook): refill if owned, else fill a slot or replace the held gun. */
export function giveWeapon(g: Game, p: PlayerState, id: WeaponId, upgraded = false): boolean {
  if (!weaponStats(id, upgraded)) return false;
  const ws = p.pub.weapons;
  const owned = ws.findIndex((w) => w.id === id);
  p.reloadUntil = 0;
  if (owned >= 0) ws[owned] = newWeapon(id, upgraded || ws[owned]!.upgraded);
  else if (ws.length < weaponSlotsWith(p.pub.perks)) ws.push(newWeapon(id, upgraded));
  else ws[p.pub.slot] = newWeapon(id, upgraded);
  p.pub.slot = owned >= 0 ? owned : ws.findIndex((w) => w.id === id);
  g.emit({ e: 'player', player: p.pub });
  return true;
}

/** Finish a reload whose time has come. Called before anything that reads ammo. */
export function settleReload(g: Game, p: PlayerState): void {
  if (p.reloadUntil <= 0 || g.now() < p.reloadUntil) return;
  p.reloadUntil = 0;
  const w = p.pub.weapons[p.pub.slot];
  const def = statsOf(w);
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
  const def = statsOf(w);
  if (!w || !def || m.slot !== p.pub.slot || p.reloadUntil > 0 || w.mag <= 0) return;
  const now = g.now();
  if (now < p.nextFireAt - FIRE_RATE_SLACK) return; // faster than the weapon can cycle
  p.nextFireAt = Math.max(p.nextFireAt, now) + fireInterval(def, fireRateMultWith(p.pub.perks));
  w.mag--;
  g.emit({ e: 'fired', id: p.pub.id, weapon: w.id, yaw: m.yaw, pitch: m.pitch });

  if (def.projectile) {
    const [dx, dy, dz] = aimDir(m.yaw, m.pitch);
    const s = def.projectile.speed;
    spawnProjectile(g, {
      kind: def.projectile.kind, owner: p.pub.id, x: p.x + dx * 0.5, y: p.y + PLAYER_EYE_HEIGHT - 0.1 + dy * 0.5, z: p.z + dz * 0.5,
      vx: dx * s, vy: dy * s, vz: dz * s, fuse: 6, impact: true, damage: def.damage, radius: def.projectile.radius,
      float: def.projectile.kind === 'orb', well: def.wonder?.kind === 'gravewell' ? def.wonder : undefined,
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
    // The client reports how far along the shot the body was: over the floor, and up or down to its storey.
    const actual = Math.hypot(z.x - p.x, z.z - p.z, z.y - p.y);
    if (Math.abs(h.dist - actual) > HIT_DIST_SLACK || actual > def.range + HIT_DIST_SLACK) continue;
    // Chest to chest, as bodies see each other; or from the eye, where the shot leaves: over a
    // roof's parapet the eye sees into the street when the chest does not, and the client scored it.
    if (
      !lineOfSight(g.map, p.x, p.y, p.z, z.x, z.y, z.z, g.openDoors) &&
      !lineOfSight(g.map, p.x, p.y + PLAYER_EYE_HEIGHT - SIGHT_HEIGHT, p.z, z.x, z.y, z.z, g.openDoors)
    ) continue;
    if (def.wonder?.kind === 'arclight') return arc(g, p, z, def);
    damageZombie(g, z, hitDamage(def, h.zone, Math.min(h.dist, def.range)), p.pub.id, h.zone, 'bullet');
  }
}

/** An Arclight bolt has struck `first`: it jumps on from body to body (PLAN 4.5). */
function arc(g: Game, p: PlayerState, first: Zombie, def: WeaponDef): void {
  if (def.wonder?.kind !== 'arclight') return;
  const sees = (a: Zombie, b: Zombie): boolean => lineOfSight(g.map, a.x, a.y, a.z, b.x, b.y, b.z, g.openDoors);
  const struck = chainTargets(first, g.zombies.values(), def.wonder.chain, def.wonder.radius, sees);
  g.emit({ e: 'chain', by: p.pub.id, targets: struck.map((z) => z.id) });
  for (const z of struck) damageZombie(g, z, def.damage, p.pub.id, 'torso', 'arclight');
}

export function onReload(g: Game, p: PlayerState): void {
  if (p.state === MoveState.Dead) return;
  settleReload(g, p);
  const w = p.pub.weapons[p.pub.slot];
  const def = statsOf(w);
  if (!w || !def || p.reloadUntil > 0 || w.mag >= def.magSize || w.reserve <= 0) return;
  p.reloadUntil = g.now() + def.reloadTime * reloadMultWith(p.pub.perks) - FIRE_RATE_SLACK;
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
  if (Math.hypot(z.x - p.x, z.z - p.z) > KNIFE_RANGE + KNIFE_RANGE_SLACK || Math.abs(z.y - p.y) >= FLOOR_GAP) return;
  if (!lineOfSight(g.map, p.x, p.y, p.z, z.x, z.y, z.z, g.openDoors)) return;
  damageZombie(g, z, KNIFE_DAMAGE, p.pub.id, 'torso', 'melee');
}

export function onThrow(g: Game, p: PlayerState, m: Msg<'throw'>): void {
  const siren = m.kind === 'tactical';
  if (!standing(p) || (m.kind !== 'frag' && !siren) || !isFiniteNum(m.yaw) || !isFiniteNum(m.pitch)) return;
  const now = g.now();
  if ((siren ? p.pub.tactical : p.pub.grenades) <= 0 || now < p.nextThrowAt - FIRE_RATE_SLACK) return;
  p.nextThrowAt = now + GRENADE_COOLDOWN;
  if (siren) p.pub.tactical--;
  else p.pub.grenades--;
  g.emit({ e: 'player', player: p.pub });
  const [dx, dy, dz] = aimDir(m.yaw, Math.max(-1.5, Math.min(1.5, m.pitch)));
  spawnProjectile(g, {
    kind: siren ? 'siren' : 'frag', owner: p.pub.id, x: p.x + dx * 0.4, y: p.y + PLAYER_EYE_HEIGHT - 0.15, z: p.z + dz * 0.4,
    vx: dx * GRENADE_SPEED, vy: dy * GRENADE_SPEED + GRENADE_LOFT, vz: dz * GRENADE_SPEED,
    // A Siren calls zombies to it for a while (nav.ts, zombies.ts) before it goes off.
    fuse: siren ? SIREN_SECONDS : GRENADE_FUSE, impact: false, damage: siren ? SIREN_DAMAGE : GRENADE_DAMAGE, radius: siren ? SIREN_RADIUS : GRENADE_RADIUS,
  });
}
