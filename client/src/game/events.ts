import * as THREE from 'three';
import {
  PLAYER_EYE_HEIGHT, TONICS, aimDir, perkDef, powerupDef, rayWorld, staminaWith, weaponDef,
  type CompiledMap, type ForgeState, type PlayerPublic,
} from '@zh/shared';
import type { GameAudio } from '../audio/audio';
import { debugState } from '../debug';
import type { ServerClock } from '../net/interp';
import type { Net } from '../net/net';
import type { World } from '../render/worldBuilder';
import type { DamageArcs } from '../ui/damage';
import type { Hud } from '../ui/hud';
import type { Scoreboard } from '../ui/scoreboard';
import type { Barricades } from './barricades';
import type { CacheView } from './cacheView';
import type { Entities } from './entities';
import type { Shake } from './feel';
import type { ForgeView } from './forgeView';
import type { Fx } from './fx';
import type { Interact } from './interact';
import type { LocalPlayer } from './localPlayer';
import type { Marks } from './marks';
import { lifeOf, type Match } from './match';
import type { Pickups } from './pickups';
import type { RemotePlayers } from './remotePlayers';
import type { Viewmodel } from './viewmodel';
import { ARC_COLOUR, type LocalWeapons } from './weapons';

export interface EventDeps {
  net: Net;
  match: Match;
  map: CompiledMap;
  world: World;
  player: LocalPlayer;
  remotes: RemotePlayers;
  entities: Entities;
  barricades: Barricades;
  scores: Scoreboard;
  hud: Hud;
  audio: GameAudio;
  arcs: DamageArcs;
  cacheView: CacheView;
  pickups: Pickups;
  forgeView: ForgeView;
  fx: Fx;
  weapons: LocalWeapons;
  vm: Viewmodel;
  shake: Shake;
  interact: Interact;
  clock: ServerClock;
  marks: Marks;
}

/**
 * What the server says, applied to the client: the full  on joining, the 15 Hz snapshots,
 * and the one-shot events in between. main.ts builds the systems; this is the only place that
 * feeds them from the network.
 */
export function wireEvents(d: EventDeps): void {
  const { net, match: m, map, world, player, remotes, entities, barricades, scores, hud, audio, arcs, cacheView, pickups, forgeView, fx, weapons, vm, shake, interact, clock, marks } = d;
  const s = net.socket;

  /** Our own slow state changed: guns, grenades, tonics. */
  function onSelf(me: PlayerPublic): void {
    weapons.onPlayer(me);
    m.perks = me.perks;
    player.staminaMax = staminaWith(m.perks);
    player.stamina = Math.min(player.stamina, player.staminaMax);
    hud.setPerks(m.perks);
  }
  function setForge(state: ForgeState): void {
    m.forge = state;
    forgeView.set(state);
  }

  /** Another player's shot: flash their gun and draw tracers along their aim. */
  const shotFrom = new THREE.Vector3();
  const shotTo = new THREE.Vector3();
  function remoteShot(id: number, weapon: string, yaw: number, pitch: number): void {
    const from = remotes.fired(id, shotFrom);
    const def = weaponDef(weapon);
    if (!from || !def) return;
    fx.flash(from.x, from.y, from.z, 6);
    if (def.projectile) return;
    for (let i = 0; i < def.pellets; i++) {
      const jitter = def.pellets > 1 ? def.spreadHip : 0;
      const [dx, dy, dz] = aimDir(yaw + (Math.random() - 0.5) * 2 * jitter, pitch + (Math.random() - 0.5) * 2 * jitter);
      const wall = rayWorld(map, m.openDoors, from.x, PLAYER_EYE_HEIGHT, from.z, dx, dy, dz, def.range);
      const body = entities.raycast(from.x, PLAYER_EYE_HEIGHT, from.z, dx, dy, dz, wall)[def.pierce];
      const reach = body?.dist ?? wall;
      shotTo.set(from.x + dx * reach, PLAYER_EYE_HEIGHT + dy * reach, from.z + dz * reach);
      if (def.wonder?.kind === 'arclight') fx.bolts.arc(from, shotTo, ARC_COLOUR, 0.07, 0.4);
      else fx.tracer(from, shotTo);
    }
  }

  s.on('sync', (msg) => {
    player.teleport(msg.self.x, msg.self.z, msg.self.yaw, msg.self.y);
    player.pitch = 0;
    m.setDoors(msg.openDoors);
    world.setPower((m.power = msg.power));
    remotes.reset(msg.players);
    entities.reset(msg.zombies);
    barricades.reset(msg.barricades);
    scores.reset(msg.players);
    const me = msg.players.find((p) => p.id === net.id);
    if (me) onSelf(me);
    setForge(msg.forge);
    cacheView.reset(msg.cache.home, msg.cache.boxes);
    pickups.reset(msg.powerups);
    m.effects.clear();
    for (const e of msg.activeEffects) m.effects.set(e.kind, e.until);
    m.round = scores.round = msg.round;
    m.roundPhase = msg.roundPhase;
    m.zombiesLeft = msg.zombiesLeft;
    hud.setRound(m.round, false);
    audio.sync(msg);
    arcs.clear();
    marks.clear();
    m.setLife('alive'); // the next snapshot says otherwise if we are down or sitting out
    m.setOver(msg.over);
  });
  s.on('snap', (msg) => {
    clock.observe(msg.time);
    remotes.onSnapshot(msg.time, msg.players);
    for (const p of msg.players) {
      scores.setLife(p[0], p[5]);
      if (p[0] !== net.id) continue;
      m.hp = p[6];
      m.setLife(lifeOf(p[5]));
    }
    entities.onSnapshot(msg.time, msg.zombies);
    fx.setProjectiles(msg.projectiles);
    audio.setProjectiles(msg.projectiles);
    weapons.onAmmo(msg.ammo);
  });
  s.on('correct', (msg) => {
    player.teleport(msg.x, msg.z, undefined, msg.y);
    debugState.corrections++;
  });
  s.on('ev', (msg) => {
    for (const ev of msg.events) {
      audio.event(ev, clock.now); // first: it needs to find things the event is about to remove
      switch (ev.e) {
        case 'player':
          scores.upsert(ev.player);
          if (ev.player.id === net.id) onSelf(ev.player);
          else remotes.upsert(ev.player);
          break;
        case 'points':
          scores.points(ev.id, ev.total, ev.delta);
          break;
        case 'roundStart':
          m.round = scores.round = ev.round;
          m.roundPhase = ev.special ? 'special' : 'active';
          m.zombiesLeft = ev.total;
          hud.setRound(m.round);
          hud.banner(`Round ${m.round}`, ev.special ? 'Something is howling out there' : '');
          break;
        case 'roundEnd':
          m.roundPhase = 'intermission';
          break;
        case 'zombiesLeft':
          m.zombiesLeft = ev.n;
          break;
        case 'playerDowned':
          if (ev.id === net.id) m.setLife('downed');
          else hud.banner('', `${scores.players.get(ev.id)?.name ?? 'A survivor'} is down`);
          break;
        case 'reviving':
          if (ev.id === net.id) m.revivedBy = ev.by;
          else remotes.setReviving(ev.id, ev.by !== 0);
          break;
        case 'playerRevived':
          if (ev.id === net.id) m.setLife('alive');
          break;
        case 'playerSpawned':
          if (ev.id !== net.id) break;
          player.teleport(ev.x, ev.z, undefined, ev.y);
          m.setLife('alive');
          break;
        case 'gameOver':
          m.round = scores.round = ev.round;
          for (const p of ev.players) scores.upsert(p);
          m.setOver(true);
          break;
        case 'zombieSpawn':
          entities.spawn(ev.id, ev.kind, ev.seed, ev.x, ev.z, ev.y);
          break;
        case 'zombieHit':
          if (ev.by === net.id) hud.hit(ev.zone === 'head' ? 'head' : 'hit');
          else {
            // Someone else's hit (or a blast): we did not draw it when the trigger was pulled.
            entities.flinch(ev.id, 0.6);
            const at = entities.chest(ev.id);
            if (at) fx.puff(at.x, at.y, at.z, at.colour, 3, 1.4);
          }
          debugState.hits = [...debugState.hits.slice(-31), { id: ev.id, by: ev.by, zone: ev.zone, dmg: ev.dmg }];
          break;
        case 'zombieDied': {
          const at = entities.chest(ev.id);
          if (at) fx.puff(at.x, at.y, at.z, at.colour, 10, 2.4, 0.05, 0.6);
          entities.die(ev.id);
          if (ev.by === net.id) hud.hit(ev.zone === 'head' ? 'headkill' : 'kill');
          debugState.kills++;
          break;
        }
        case 'barricade':
          barricades.set(ev.id, ev.planks);
          break;
        case 'playerHurt':
          if (ev.id !== net.id) break;
          shake.add(0.25 + (m.hp - ev.hp) / 200);
          arcs.hit(ev.fromX, ev.fromZ);
          vm.flinch();
          m.hp = ev.hp;
          hud.hurt();
          player.kick(0.05);
          debugState.hurts++;
          break;
        case 'playerDied':
          if (ev.id === net.id) m.setLife('dead');
          break;
        case 'fired':
          if (ev.id !== net.id) remoteShot(ev.id, ev.weapon, ev.yaw, ev.pitch);
          break;
        case 'melee':
          if (ev.id !== net.id) remotes.melee(ev.id);
          break;
        case 'explosion':
          fx.explosion(ev.x, ev.y, ev.z, ev.radius, ev.kind);
          shake.blast(Math.hypot(ev.x - player.x, ev.z - player.z), ev.radius);
          debugState.explosions++;
          break;
        case 'playerLeft':
          scores.remove(ev.id);
          remotes.remove(ev.id);
          marks.remove(ev.id);
          break;
        case 'doorOpened':
          m.openDoor(ev.id);
          break;
        case 'powerOn':
          m.power = true;
          world.setPower(true, true);
          shake.add(0.35);
          hud.banner('', 'The power is back on');
          break;
        case 'denied':
          interact.deny(ev.reason);
          break;
        case 'forge':
          setForge(ev.state);
          break;
        case 'cache':
          cacheView.set(ev.state);
          if (ev.state.phase === 'jinx') hud.banner('', ev.state.by === net.id ? 'Jinx! Your points are back \u2014 the Cache is leaving' : 'Jinx! The Cache is leaving');
          break;
        case 'cacheHome':
          cacheView.setHome(ev.site);
          hud.banner('', 'The Cache has come down somewhere else \u2014 follow the light');
          break;
        case 'powerupDrop':
          pickups.add(ev.drop);
          break;
        case 'powerupExpired':
          pickups.remove(ev.id, false);
          break;
        case 'powerupTaken':
          pickups.remove(ev.id, true);
          if (ev.until !== undefined) m.effects.set(ev.kind, ev.until);
          hud.banner(powerupDef(ev.kind)?.name ?? ev.kind, powerupDef(ev.kind)?.blurb ?? '');
          debugState.powerupsTaken = [...debugState.powerupsTaken, ev.kind];
          break;
        case 'chain': {
          // An Arclight bolt jumping on from the body it struck (the first leg is drawn with the shot).
          let prev: THREE.Vector3 | null = null;
          for (const id of ev.targets) {
            const at = entities.chest(id);
            if (!at) continue;
            const here = new THREE.Vector3(at.x, at.y, at.z);
            if (prev) fx.bolts.arc(prev, here, ARC_COLOUR, 0.06, 0.45);
            fx.puff(at.x, at.y, at.z, ARC_COLOUR, 4, 2.2, 0.04, 0.3);
            prev = here;
          }
          if (prev) fx.flash(prev.x, prev.y, prev.z, 20);
          debugState.chains = [...debugState.chains.slice(-7), ev.targets.length];
          break;
        }
        case 'strike':
          // Lightning: a howler is a moment behind it.
          fx.bolts.strike(ev.x, ev.z);
          fx.flash(ev.x, 1.5, ev.z, 50);
          fx.puff(ev.x, 0.1, ev.z, 0xbfe8ff, 10, 3, 0.05, 0.5);
          shake.blast(Math.hypot(ev.x - player.x, ev.z - player.z), 4);
          debugState.strikes++;
          debugState.lastStrike = { x: ev.x, z: ev.z };
          break;
        case 'mark': {
          const who = scores.players.get(ev.id);
          marks.add(ev.id, who?.name ?? 'Survivor', [...scores.players.keys()].sort((a, b) => a - b).indexOf(ev.id), ev.x, ev.z, clock.now);
          break;
        }
        case 'purchase':
          // Our own tonic: knock it back.
          if (ev.id !== net.id || ev.what !== 'perk') break;
          vm.drink(TONICS.find((t) => t.id === ev.ref)?.glow ?? 0xffffff);
          hud.banner('', `${perkDef(ev.ref)?.name ?? ev.ref} \u2014 ${perkDef(ev.ref)?.blurb ?? ''}`);
          break;
        default:
          break;
      }
    }
  });
}
