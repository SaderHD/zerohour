import {
  BLEEDOUT_SECONDS, FLOOR_GAP, INTERACT_RANGE, MOVE_BUDGET_CAP, MoveState, PLAYER_REGEN_DELAY, PLAYER_REGEN_RATE, POINTS_REVIVE,
  RESPAWN_MIN_POINTS, REVIVE_GRACE_SECONDS, REVIVE_RANGE_SLACK, SELF_REVIVE_SECONDS, START_GRENADES, START_WEAPON, maxHpWith, reviveSecondsWith,
  type ClientMsg,
} from '@zh/shared';
import { newWeapon } from './combat';
import { award, downPenalty } from './economy';
import type { Game, PlayerState } from './Game';
import { isSolo, losePerks } from './perks';

// Player health and the down / revive / bleed-out / respawn cycle (PLAN 4.1).

/** On their feet: not downed, not dead. */
export const standing = (p: PlayerState): boolean => p.state !== MoveState.Downed && p.state !== MoveState.Dead;

/** Hurt a player. `fromX/fromZ` is where it came from (for the client's feedback). */
export function damagePlayer(g: Game, p: PlayerState, dmg: number, fromX: number, fromZ: number): void {
  if (dmg <= 0 || p.god || !p.pub.connected || !standing(p) || g.time < p.safeUntil) return;
  p.hp = Math.max(0, p.hp - dmg);
  p.hurtAt = g.time;
  g.emit({ e: 'playerHurt', id: p.pub.id, hp: Math.round(p.hp), fromX, fromZ });
  if (p.hp <= 0) goDown(g, p);
}

/** On the floor with a pistol until a teammate gets them up or they bleed out. */
function goDown(g: Game, p: PlayerState): void {
  p.state = MoveState.Downed;
  p.hp = 0;
  p.vx = p.vz = 0;
  p.rebuild = null;
  p.reviving = 0;
  p.reloadUntil = 0;
  p.stash = { weapons: p.pub.weapons, slot: p.pub.slot };
  p.pub.weapons = [newWeapon(START_WEAPON)];
  p.pub.slot = 0;
  // Alone with a Second Wind: it is spent getting them back up, with nobody's help.
  const self = losePerks(p).includes('second_wind') && isSolo(g);
  p.down = { until: g.time + BLEEDOUT_SECONDS, by: self ? p.pub.id : 0, progress: 0, self };
  p.pub.downs++;
  award(g, p, -downPenalty(p.pub.points), 'down');
  g.emit({ e: 'playerDowned', id: p.pub.id });
  g.emit({ e: 'player', player: p.pub });
  if (self) g.emit({ e: 'reviving', id: p.pub.id, by: p.pub.id });
}

function getUp(g: Game, p: PlayerState, by?: PlayerState): void {
  p.state = MoveState.Idle;
  p.hp = maxHpWith(p.pub.perks);
  p.safeUntil = g.time + REVIVE_GRACE_SECONDS;
  p.down = null;
  p.reloadUntil = 0;
  if (p.stash) {
    p.pub.weapons = p.stash.weapons;
    p.pub.slot = p.stash.slot;
    p.stash = null;
  }
  g.emit({ e: 'playerRevived', id: p.pub.id, by: by?.pub.id });
  g.emit({ e: 'player', player: p.pub });
  if (!by) return;
  by.reviving = 0;
  by.pub.revives++;
  award(g, by, POINTS_REVIVE, 'revive');
  g.emit({ e: 'player', player: by.pub });
}

/** Bled out: watch until the next round. Everything carried is lost. */
function die(g: Game, p: PlayerState): void {
  p.state = MoveState.Dead;
  p.down = null;
  p.stash = null;
  g.emit({ e: 'playerDied', id: p.pub.id });
}

/** Out of the game until the next round starts (bled out, or joined mid-round). */
export function sitOut(p: PlayerState): void {
  p.state = MoveState.Dead;
  p.hp = 0;
}

/** Back in at a spawn point with the starting pistol and enough points to get going. */
export function respawn(g: Game, p: PlayerState): void {
  const s = g.nextSpawn();
  p.x = s.x;
  p.y = s.y;
  p.z = s.z;
  p.yaw = s.yaw;
  p.vx = p.vz = 0;
  p.budget = MOVE_BUDGET_CAP;
  p.state = MoveState.Idle;
  p.pub.perks = [];
  p.hp = maxHpWith(p.pub.perks);
  p.hurtAt = -100;
  p.down = null;
  p.stash = null;
  p.reloadUntil = 0;
  p.pub.weapons = [newWeapon(START_WEAPON)];
  p.pub.slot = 0;
  p.pub.grenades = START_GRENADES;
  p.pub.tactical = 0;
  award(g, p, Math.max(0, RESPAWN_MIN_POINTS - p.pub.points), 'respawn');
  g.emit({ e: 'playerSpawned', id: p.pub.id, x: p.x, y: p.y, z: p.z });
  g.emit({ e: 'player', player: p.pub });
  g.correct(p);
}

/** F held or released on a downed teammate. */
export function onRevive(_g: Game, p: PlayerState, m: Extract<ClientMsg, { t: 'revive' }>): void {
  p.reviving = standing(p) && m.hold === true && Number.isInteger(m.target) && m.target !== p.pub.id ? m.target : 0;
}

const canRevive = (r: PlayerState, p: PlayerState): boolean =>
  r.reviving === p.pub.id && r.pub.connected && standing(r) && Math.abs(r.y - p.y) < FLOOR_GAP && Math.hypot(r.x - p.x, r.z - p.z) <= INTERACT_RANGE + REVIVE_RANGE_SLACK;

export function updatePlayers(g: Game, dt: number): void {
  for (const p of g.players.values()) {
    if (standing(p)) {
      // Health comes back quickly once a player has gone unhurt for a few seconds.
      const max = maxHpWith(p.pub.perks);
      if (p.hp < max && g.time - p.hurtAt >= PLAYER_REGEN_DELAY) p.hp = Math.min(max, p.hp + PLAYER_REGEN_RATE * dt);
      continue;
    }
    const d = p.down;
    if (!d) continue;
    if (d.self) {
      if ((d.progress += dt) >= SELF_REVIVE_SECONDS) getUp(g, p);
      continue;
    }
    let by = d.by ? g.players.get(d.by) : undefined;
    if (d.by && !(by && canRevive(by, p))) {
      // The reviver let go, walked off or went down: start over.
      if (by?.reviving === p.pub.id) by.reviving = 0;
      by = undefined;
      d.by = 0;
      d.progress = 0;
      g.emit({ e: 'reviving', id: p.pub.id, by: 0 });
    }
    if (!by) {
      for (const q of g.players.values()) {
        if (q.reviving !== p.pub.id) continue;
        if (!canRevive(q, p)) {
          q.reviving = 0;
          continue;
        }
        by = q;
        d.by = q.pub.id;
        g.emit({ e: 'reviving', id: p.pub.id, by: d.by });
        break;
      }
    }
    if (by) {
      d.until += dt; // bleeding stops while someone is working on them
      if ((d.progress += dt) >= reviveSecondsWith(by.pub.perks)) getUp(g, p, by);
    } else if (g.time >= d.until) die(g, p);
  }
}

/** The game is lost when players are connected and none of them is on their feet. */
export function everyoneDown(g: Game): boolean {
  let connected = 0;
  for (const p of g.players.values()) {
    if (!p.pub.connected) continue;
    if (standing(p) || p.down?.self) return false;
    connected++;
  }
  return connected > 0;
}
