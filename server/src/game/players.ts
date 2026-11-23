import { MOVE_BUDGET_CAP, PLAYER_MAX_HP, PLAYER_REGEN_DELAY, PLAYER_REGEN_RATE } from '@zh/shared';
import type { Game, PlayerState } from './Game';

/** Hurt a player. `fromX/fromZ` is where it came from (for the client's feedback). */
export function damagePlayer(g: Game, p: PlayerState, dmg: number, fromX: number, fromZ: number): void {
  if (dmg <= 0 || p.god || !p.pub.connected) return;
  p.hp = Math.max(0, p.hp - dmg);
  p.hurtAt = g.time;
  g.emit({ e: 'playerHurt', id: p.pub.id, hp: Math.round(p.hp), fromX, fromZ });
  if (p.hp > 0) return;
  // Until downs and revives exist (session 6), a dead player is put straight back at a spawn point.
  p.pub.downs++;
  g.emit({ e: 'playerDied', id: p.pub.id });
  g.emit({ e: 'player', player: p.pub });
  const s = g.nextSpawn();
  p.x = s.x;
  p.z = s.z;
  p.hp = PLAYER_MAX_HP;
  p.vx = p.vz = 0;
  p.budget = MOVE_BUDGET_CAP;
  g.emit({ e: 'playerSpawned', id: p.pub.id, x: p.x, z: p.z });
  g.correct(p);
}

/** Health comes back quickly once a player has gone unhurt for a few seconds. */
export function updatePlayers(g: Game, dt: number): void {
  for (const p of g.players.values()) {
    if (p.hp < PLAYER_MAX_HP && g.time - p.hurtAt >= PLAYER_REGEN_DELAY) p.hp = Math.min(PLAYER_MAX_HP, p.hp + PLAYER_REGEN_RATE * dt);
  }
}
