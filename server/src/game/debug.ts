import {
  HOWLER_SPEED, MOVE_BUDGET_CAP, PLAYER_RADIUS, SIREN, ZOMBIE_BASE_HP, ZOMBIE_SPEED_RUN, ZOMBIE_SPEED_SHAMBLE, ZOMBIE_SPEED_WALK, circleFits, isFiniteNum,
  type ClientMsg,
} from '@zh/shared';
import { giveCacheItem } from './cache';
import { giveWeapon } from './combat';
import { powerOn } from './doors';
import { award } from './economy';
import { killZombie, spawnDummy } from './entities';
import { givePerk } from './perks';
import { dropPowerup } from './powerups';
import type { Game, PlayerState } from './Game';
import { setPaused, setRound } from './rounds';
import { zombieCount } from './spawner';
import { spawnZombie } from './zombies';

type Debug = Extract<ClientMsg, { t: 'debug' }>;

/** Debug commands (window.__zh on the client). Only reached when the server runs with ZH_DEBUG=1. */
/** The floor a debug command means at (x, z): the one nearest the `y` it gives, else nearest the player's own height. */
function floorAt(g: Game, p: PlayerState, m: { x: number; z: number; y?: number }): number {
  const y = g.map.nearestFloor(m.x, isFiniteNum(m.y) ? m.y : p.y, m.z, g.openDoors);
  return Number.isNaN(y) ? p.y : y;
}

export function onDebug(g: Game, p: PlayerState, m: Debug): void {
  switch (m.cmd) {
    case 'teleport':
      if (!isFiniteNum(m.x) || !isFiniteNum(m.z)) return;
      p.x = m.x;
      p.z = m.z;
      p.y = floorAt(g, p, m);
      p.budget = MOVE_BUDGET_CAP;
      p.vx = p.vz = 0;
      g.correct(p);
      return;
    case 'god':
      p.god = m.on === true;
      return;
    case 'spawnZombies':
      return spawn(g, p, m);
    case 'killZombies':
      for (const z of [...g.zombies.values()]) if (z.kind !== 'dummy') killZombie(g, z, undefined, undefined, 'debug');
      g.spawnQueue.length = 0;
      g.arrivals.length = 0;
      return;
    case 'give':
      if (typeof m.weapon === 'string') giveWeapon(g, p, m.weapon, m.upgraded === true);
      if (typeof m.perk === 'string') givePerk(g, p, m.perk);
      if (isFiniteNum(m.points)) award(g, p, m.points, 'debug');
      if (m.tactical === true) giveCacheItem(g, p, SIREN);
      return;
    case 'powerup':
      if (typeof m.kind === 'string') dropPowerup(g, m.kind, isFiniteNum(m.x) ? m.x : p.x, isFiniteNum(m.x) && isFiniteNum(m.z) ? floorAt(g, p, m as { x: number; z: number; y?: number }) : p.y, isFiniteNum(m.z) ? m.z : p.z);
      return;
    case 'cache':
      g.cache.force = { weapon: typeof m.weapon === 'string' ? m.weapon : undefined, jinx: m.jinx === true };
      return;
    case 'dummy':
      if ([m.x, m.z, m.yaw].every(isFiniteNum) && g.zombies.size < 32 && circleFits(g.map, g.openDoors, m.x, floorAt(g, p, m), m.z, PLAYER_RADIUS)) {
        spawnDummy(g, m.x, floorAt(g, p, m), m.z, m.yaw);
      }
      return;
    case 'openAllDoors':
      for (const o of g.map.def.openings) if (o.kind === 'door') g.openDoor(o.id, p.pub.id);
      return;
    case 'openDoor':
      if (g.map.openingById(m.id)?.kind === 'door') g.openDoor(m.id, p.pub.id);
      return;
    case 'powerOn':
      return powerOn(g, p.pub.id);
    case 'setRound':
      if (isFiniteNum(m.round)) setRound(g, m.round, m.special === true);
      return;
    case 'rounds':
      setPaused(g, m.on !== true);
      return;
    default:
      return;
  }
}

function spawn(g: Game, p: PlayerState, m: Extract<Debug, { cmd: 'spawnZombies' }>): void {
  const count = Number.isInteger(m.count) ? Math.max(0, Math.min(64, m.count)) : 0;
  const hp = isFiniteNum(m.hp) && m.hp > 0 ? m.hp : ZOMBIE_BASE_HP;
  const speedOf = (): number =>
    isFiniteNum(m.speed) && m.speed > 0 ? Math.min(m.speed, 8) : g.rng.pick([ZOMBIE_SPEED_SHAMBLE, ZOMBIE_SPEED_WALK, ZOMBIE_SPEED_RUN]);
  if (isFiniteNum(m.interval)) g.spawnInterval = Math.max(0.05, m.interval);
  const howler = m.kind === 'howler';
  const howlerSpeed = isFiniteNum(m.speed) && m.speed > 0 ? Math.min(m.speed, 8) : HOWLER_SPEED;
  for (let i = 0; i < count; i++) {
    if (!isFiniteNum(m.x) || !isFiniteNum(m.z)) g.spawnQueue.push(howler ? { hp, speed: howlerSpeed, kind: 'howler' } : { hp, speed: speedOf() });
    else if (zombieCount(g) < 64 && circleFits(g.map, g.openDoors, m.x, floorAt(g, p, m as { x: number; z: number; y?: number }), m.z, PLAYER_RADIUS)) {
      spawnZombie(g, null, m.x, floorAt(g, p, m as { x: number; z: number; y?: number }), m.z, hp, howler ? howlerSpeed : speedOf(), howler ? 'howler' : 'zombie');
    }
  }
}
