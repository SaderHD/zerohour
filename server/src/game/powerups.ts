import {
  BARRICADE_PLANKS, DropCycle, FIRESTORM_POINTS, FLOOR_GAP, MAX_GRENADES, MoveState, PLAYER_RADIUS, POWERUP_DROP_CHANCE, POWERUP_DURATION, POWERUP_LIFETIME,
  POWERUP_MAX_PER_ROUND, POWERUP_PICKUP_RANGE, REBUILD_POINTS, circleFits, powerupDef, weaponStats,
  type PowerupDrop, type PowerupId, type WeaponState,
} from '@zh/shared';
import { setPlanks } from './barricades';
import { award } from './economy';
import { killZombie, type Zombie } from './entities';
import type { Game, PlayerState } from './Game';
import { standing } from './players';
import { zombiesToCome } from './spawner';

// Power-ups (PLAN 4.10): a kill inside the station sometimes leaves one floating where the zombie
// fell; whoever walks into it sets it off for the whole team.

export interface Powerups {
  drops: PowerupDrop[];
  readonly cycle: DropCycle;
  /** Chance drops so far this round (there is a cap). */
  dropped: number;
}

export const createPowerups = (): Powerups => ({ drops: [], cycle: new DropCycle(), dropped: 0 });

export function dropPowerup(g: Game, kind: PowerupId, x: number, y: number, z: number): PowerupDrop | null {
  if (!powerupDef(kind)) return null;
  const drop: PowerupDrop = { id: g.nextEntityId++, kind, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, z: Math.round(z * 100) / 100, expiresAt: g.time + POWERUP_LIFETIME };
  g.powerups.drops.push(drop);
  g.emit({ e: 'powerupDrop', drop });
  return drop;
}

/** Clearance has nothing to offer until the Cache has moved once. */
const allowed = (g: Game) => (id: PowerupId): boolean => id !== 'clearance' || g.cache.moves > 0;

/** A zombie died: maybe it leaves something. Only kills by players, inside the walls, count. */
export function onZombieKilled(g: Game, z: Zombie, by: number | undefined): void {
  if (by === undefined || !z.ai || z.ai.windowId !== null || !circleFits(g.map, g.openDoors, z.x, z.y, z.z, PLAYER_RADIUS)) return;
  // The last howler of its round always leaves a Resupply.
  if (z.kind === 'howler' && g.rounds.special && g.rounds.phase === 'active' && zombiesToCome(g) === 0) return void dropPowerup(g, 'resupply', z.x, z.y, z.z);
  const p = g.powerups;
  if (p.dropped >= POWERUP_MAX_PER_ROUND || !g.luck.chance(POWERUP_DROP_CHANCE)) return;
  p.dropped++;
  dropPowerup(g, p.cycle.next(g.rng, allowed(g)), z.x, z.y, z.z);
}

const refill = (ws: WeaponState[]): void => ws.forEach((w) => (w.reserve = weaponStats(w.id, w.upgraded)?.reserve ?? w.reserve));

/** Set a power-up off for everyone. */
export function applyPowerup(g: Game, kind: PowerupId, by: number, id = 0): void {
  const def = powerupDef(kind);
  if (!def) return;
  const until = def.timed ? g.time + POWERUP_DURATION : undefined;
  if (until !== undefined) g.effects.set(kind, until);
  g.emit({ e: 'powerupTaken', id, kind, by, until });
  const everyone = (fn: (p: PlayerState) => void): void => {
    for (const p of g.players.values()) if (p.state !== MoveState.Dead) fn(p);
  };
  if (kind === 'resupply') {
    everyone((p) => {
      refill(p.pub.weapons);
      if (p.stash) refill(p.stash.weapons);
      p.pub.grenades = MAX_GRENADES;
      g.emit({ e: 'player', player: p.pub });
    });
  } else if (kind === 'firestorm') {
    for (const z of [...g.zombies.values()]) if (z.kind !== 'dummy') killZombie(g, z, undefined, undefined, 'firestorm');
    everyone((p) => award(g, p, FIRESTORM_POINTS, 'powerup'));
  } else if (kind === 'rebuild') {
    for (const b of g.barricades.values()) if (b.planks < BARRICADE_PLANKS) setPlanks(g, b, BARRICADE_PLANKS);
    everyone((p) => award(g, p, REBUILD_POINTS, 'powerup'));
  }
}

export const activeEffects = (g: Game): { kind: PowerupId; until: number }[] =>
  [...g.effects].filter(([, until]) => until > g.time).map(([kind, until]) => ({ kind, until }));

export function updatePowerups(g: Game): void {
  const drops = g.powerups.drops;
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i]!;
    let taker = 0;
    for (const p of g.players.values()) {
      if (p.pub.connected && standing(p) && Math.abs(p.y - d.y) < FLOOR_GAP && Math.hypot(p.x - d.x, p.z - d.z) <= POWERUP_PICKUP_RANGE) taker = p.pub.id;
    }
    if (!taker && g.time < d.expiresAt) continue;
    drops.splice(i, 1);
    if (taker) applyPowerup(g, d.kind, taker, d.id);
    else g.emit({ e: 'powerupExpired', id: d.id });
  }
}
