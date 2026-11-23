import * as THREE from 'three';
import {
  BLEEDOUT_SECONDS, CLIENT_MOVE_SEND_HZ, DOOR_OPEN_SECONDS, MoveState, PLAYER_EYE_HEIGHT, PLAYER_MAX_HP, TONICS, aimDir, compileMap, harrowRidge,
  maxHpWith, perkDef, powerupDef, rayWorld, staminaWith, validateMap, weaponDef,
  type ForgeState, type PerkId, type PlayerPublic, type PowerupId,
} from '@zh/shared';
import { GameAudio } from './audio/audio';
import { debugState, wireDebug } from './debug';
import { Barricades } from './game/barricades';
import { CacheView } from './game/cacheView';
import { Entities } from './game/entities';
import { Shake } from './game/feel';
import { ForgeView } from './game/forgeView';
import { Fx } from './game/fx';
import { Interact } from './game/interact';
import { LocalPlayer } from './game/localPlayer';
import { Pickups } from './game/pickups';
import { RemotePlayers } from './game/remotePlayers';
import { Viewmodel } from './game/viewmodel';
import { ARC_COLOUR, LocalWeapons } from './game/weapons';
import { Input } from './input/input';
import { ServerClock } from './net/interp';
import { Net } from './net/net';
import { Atmosphere } from './render/atmosphere';
import { PALETTE } from './render/materials';
import { RetroRenderer } from './render/renderer';
import { buildSky } from './render/sky';
import { Snow } from './render/snow';
import { buildWorld } from './render/worldBuilder';
import { DamageArcs } from './ui/damage';
import { Hud } from './ui/hud';
import { Menu } from './ui/menu';
import { Scoreboard } from './ui/scoreboard';
import { buildVolumes } from './ui/volumes';

// URL flags: ?name=X  ?room=CODE (join it; with autostart, create it if missing)
//            ?autostart=1 (skip menu and lobby)  ?debug=1 (stats overlay)
const params = new URLSearchParams(location.search);
const debugMode = params.has('debug');
const autostart = params.has('autostart');
const wantedRoom = params.get('room')?.toUpperCase() ?? null;
const canvas = document.getElementById('game') as HTMLCanvasElement;
const statusEl = document.getElementById('status') as HTMLDivElement;

// --- World
const map = compileMap(harrowRidge);
const validation = validateMap(map);
for (const e of validation.errors) console.error(`[map] ${e}`);
debugState.mapErrors = validation.errors;

const renderer = new RetroRenderer(canvas);
const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.skyTop);
const atmosphere = new Atmosphere(map);
scene.fog = atmosphere.fog;
// World surfaces carry baked lighting in vertex colours; this ambient passes it through 1:1
// (Lambert divides by pi). Realtime lights added later (muzzle flashes...) stack on top.
scene.add(new THREE.AmbientLight(0xffffff, Math.PI));
const sky = buildSky();
scene.add(sky);
const world = buildWorld(map);
scene.add(world.group);
const snow = new Snow(map);
scene.add(snow.points);
debugState.worldTriangles = world.triangles;
debugState.movers = world.movers;

const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.08, 400);
const input = new Input();
const hud = new Hud();
const player = new LocalPlayer();
const remotes = new RemotePlayers(scene, world, map);
const clock = new ServerClock();
const entities = new Entities(scene, world);
const fx = new Fx(scene);
const vm = new Viewmodel();
const barricades = new Barricades(scene, map, world, fx);
const scores = new Scoreboard();
const shake = new Shake();
const arcs = new DamageArcs();
let hp = PLAYER_MAX_HP;

// Round and life state, as the server reports it.
type Life = 'alive' | 'downed' | 'dead';
let life: Life = 'alive';
let round = 0;
let roundPhase = 'intermission';
let zombiesLeft = 0;
let over = false;
/** Seconds of bleed-out left (a local estimate) and who is reviving us (0 = nobody). */
let bleed = 0;
let revivedBy = 0;

function setLife(next: Life): void {
  if (next === life) return;
  if (next === 'downed') bleed = BLEEDOUT_SECONDS;
  life = next;
  revivedBy = 0;
  document.body.dataset.life = next;
}
const lifeOf = (state: MoveState): Life => (state === MoveState.Downed ? 'downed' : state === MoveState.Dead ? 'dead' : 'alive');

function setOver(on: boolean): void {
  over = on;
  if (on) {
    document.body.dataset.over = '1';
    scores.results(round);
    if (document.pointerLockElement) document.exitPointerLock();
  } else delete document.body.dataset.over;
}
document.getElementById('again')!.onclick = () => net.again();
document.getElementById('results-leave')!.onclick = () => net.leave();

/** Doors the server has opened. Also used for local collision. */
const openDoors = new Set<string>();
/** Doors that are open or on their way: nothing left to buy. */
const soldDoors = new Set<string>();
function setDoors(ids: Iterable<string>): void {
  const want = new Set(ids);
  world.setDoors(want);
  openDoors.clear();
  soldDoors.clear();
  for (const id of want) {
    openDoors.add(id);
    soldDoors.add(id);
  }
}
/** A door was just bought: play it opening; it stops blocking us once it is out of the way. */
function openDoor(id: string): void {
  if (soldDoors.has(id)) return;
  soldDoors.add(id);
  world.openDoor(id);
  const o = map.openingById(id);
  if (o) for (let i = 0; i < 3; i++) fx.puff(o.x + o.w * Math.random(), o.style === 'debris' ? 0.8 : 0.1, o.z + o.d * Math.random(), 0x8a8478, 6, 1.2, 0.05, 0.7);
  setTimeout(() => {
    if (soldDoors.has(id)) openDoors.add(id);
  }, DOOR_OPEN_SECONDS * 800);
}
let power = false;
/** Our tonics, and what the Forge is doing. */
let perks: readonly PerkId[] = [];
let forge: ForgeState = { phase: 'idle' };
const forgeView = new ForgeView(scene, map, world.lightAt, fx);
const cacheView = new CacheView(scene, map, world.lightAt, fx);
const pickups = new Pickups(scene, fx);
/** Timed power-ups that are running: the game time each one ends. */
const effects = new Map<PowerupId, number>();
const interact = new Interact(barricades, remotes, map, soldDoors, () => ({
  id: net.id, points: scores.players.get(net.id)?.points ?? 0, perks, weapons: weapons.slots, slot: weapons.slot, power, forge,
  solo: [...scores.players.values()].filter((p) => p.connected).length <= 1,
  cache: (site) => cacheView.at(site),
}), (m) => net.socket.send(m));

/** Our own slow state changed: guns, grenades, tonics. */
function onSelf(me: PlayerPublic): void {
  weapons.onPlayer(me);
  perks = me.perks;
  player.staminaMax = staminaWith(perks);
  player.stamina = Math.min(player.stamina, player.staminaMax);
  hud.setPerks(perks);
}
function setForge(state: ForgeState): void {
  forge = state;
  forgeView.set(state);
}

const audio = new GameAudio({
  map, openDoors, drips: world.drips,
  selfId: () => net.id,
  playerAt: (id) => remotes.list().find((r) => r.id === id && Number.isFinite(r.x)) ?? null,
  entityAt: (id) => entities.chest(id),
  planks: (id) => barricades.list().find((b) => b.id === id)?.planks ?? 0,
});
buildVolumes(audio);
const weapons = new LocalWeapons({ player, camera, map, openDoors, entities, fx, vm, sound: audio.guns, shake, send: (m) => net.socket.send(m) });

function resize(): void {
  camera.aspect = renderer.resize(window.innerWidth, window.innerHeight);
  vm.setAspect(camera.aspect);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// --- Network
const net = new Net();
const menu = new Menu(net, params.get('name'));
const playing = () => net.phase === 'playing';
/** In a game that is still going. */
const live = () => playing() && !over;
let moveSeq = 0;
let triedCreate = false;

input.attach(canvas, live);
input.onLockChange = (locked) => {
  hud.setLocked(locked);
  if (locked) document.body.dataset.locked = '1';
  else delete document.body.dataset.locked;
};

net.onPhase = (phase) => {
  document.body.dataset.phase = phase;
  debugState.phase = phase;
  if (phase === 'connecting' || phase === 'lost') debugState.connected = false;
  if (phase !== 'playing' && document.pointerLockElement) document.exitPointerLock();
  if (phase !== 'playing') setOver(false);
  const text = { connecting: 'connecting…', menu: '', lobby: '', playing: '', lost: 'disconnected' }[phase];
  statusEl.textContent = text;
  statusEl.dataset.state = phase === 'lost' ? 'error' : phase === 'connecting' ? 'connecting' : 'ok';
};
net.onWelcome = (resumed) => {
  remotes.selfId = scores.selfId = net.id;
  debugState.connected = true;
  debugState.playerId = net.id;
  if (resumed) return;
  triedCreate = false;
  if (wantedRoom) net.join(wantedRoom);
  else if (autostart) net.create();
};
net.onRoom = (room) => {
  menu.setRoom(room);
  debugState.room = room?.code ?? null;
  debugState.isHost = net.isHost;
  if (room?.phase === 'lobby' && autostart) {
    if (net.isHost) net.startGame();
    else if (!room.players.find((p) => p.id === net.id)?.ready) net.ready(true);
  }
};
net.onError = (code) => {
  if (code === 'room_not_found' && wantedRoom && autostart && !triedCreate) {
    triedCreate = true;
    return net.create(wantedRoom);
  }
  if (code === 'not_ready' && autostart) return void setTimeout(() => net.phase === 'lobby' && net.startGame(), 300);
  menu.showError(code);
  if (net.phase === 'lost') statusEl.textContent = 'disconnected';
};

const s = net.socket;
s.on('sync', (m) => {
  player.teleport(m.self.x, m.self.z, m.self.yaw);
  player.pitch = 0;
  setDoors(m.openDoors);
  world.setPower((power = m.power));
  remotes.reset(m.players);
  entities.reset(m.zombies);
  barricades.reset(m.barricades);
  scores.reset(m.players);
  const me = m.players.find((p) => p.id === net.id);
  if (me) onSelf(me);
  setForge(m.forge);
  cacheView.reset(m.cache.home, m.cache.boxes);
  pickups.reset(m.powerups);
  effects.clear();
  for (const e of m.activeEffects) effects.set(e.kind, e.until);
  round = scores.round = m.round;
  roundPhase = m.roundPhase;
  zombiesLeft = m.zombiesLeft;
  hud.setRound(round, false);
  audio.sync(m);
  arcs.clear();
  setLife('alive'); // the next snapshot says otherwise if we are down or sitting out
  setOver(m.over);
});
s.on('snap', (m) => {
  clock.observe(m.time);
  remotes.onSnapshot(m.time, m.players);
  for (const p of m.players) {
    scores.setLife(p[0], p[5]);
    if (p[0] !== net.id) continue;
    hp = p[6];
    setLife(lifeOf(p[5]));
  }
  entities.onSnapshot(m.time, m.zombies);
  fx.setProjectiles(m.projectiles);
  audio.setProjectiles(m.projectiles);
  weapons.onAmmo(m.ammo);
});
s.on('correct', (m) => {
  player.teleport(m.x, m.z);
  debugState.corrections++;
});
s.on('ev', (m) => {
  for (const ev of m.events) {
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
        round = scores.round = ev.round;
        roundPhase = ev.special ? 'special' : 'active';
        zombiesLeft = ev.total;
        hud.setRound(round);
        hud.banner(`Round ${round}`, ev.special ? 'Something is howling out there' : '');
        break;
      case 'roundEnd':
        roundPhase = 'intermission';
        break;
      case 'zombiesLeft':
        zombiesLeft = ev.n;
        break;
      case 'playerDowned':
        if (ev.id === net.id) setLife('downed');
        else hud.banner('', `${scores.players.get(ev.id)?.name ?? 'A survivor'} is down`);
        break;
      case 'reviving':
        if (ev.id === net.id) revivedBy = ev.by;
        else remotes.setReviving(ev.id, ev.by !== 0);
        break;
      case 'playerRevived':
        if (ev.id === net.id) setLife('alive');
        break;
      case 'playerSpawned':
        if (ev.id !== net.id) break;
        player.teleport(ev.x, ev.z);
        setLife('alive');
        break;
      case 'gameOver':
        round = scores.round = ev.round;
        for (const p of ev.players) scores.upsert(p);
        setOver(true);
        break;
      case 'zombieSpawn':
        entities.spawn(ev.id, ev.kind, ev.seed, ev.x, ev.z);
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
        shake.add(0.25 + (hp - ev.hp) / 200);
        arcs.hit(ev.fromX, ev.fromZ);
        vm.flinch();
        hp = ev.hp;
        hud.hurt();
        player.kick(0.05);
        debugState.hurts++;
        break;
      case 'playerDied':
        if (ev.id === net.id) setLife('dead');
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
        break;
      case 'doorOpened':
        openDoor(ev.id);
        break;
      case 'powerOn':
        power = true;
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
        if (ev.until !== undefined) effects.set(ev.kind, ev.until);
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
    const wall = rayWorld(map, openDoors, from.x, PLAYER_EYE_HEIGHT, from.z, dx, dy, dz, def.range);
    const body = entities.raycast(from.x, PLAYER_EYE_HEIGHT, from.z, dx, dy, dz, wall)[def.pierce];
    const reach = body?.dist ?? wall;
    shotTo.set(from.x + dx * reach, PLAYER_EYE_HEIGHT + dy * reach, from.z + dz * reach);
    if (def.wonder?.kind === 'arclight') fx.bolts.arc(from, shotTo, ARC_COLOUR, 0.07, 0.4);
    else fx.tracer(from, shotTo);
  }
}

wireDebug({ player, input, socket: s, playing, renderer, resize, audio });

const SPECTATE_BACK = 2.4;
const SPECTATE_HEIGHT = 2;

// --- Main loop
let last = performance.now();
let fpsFrames = 0;
let fpsTime = 0;
let sendTimer = 0;
let attract = 0;
renderer.gl.setAnimationLoop((now) => {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  const watching = playing() && life === 'dead' && !player.freeCam ? remotes.spectate() : null;
  if (playing()) {
    const acting = live() && !player.freeCam;
    weapons.update(dt, input, acting && life !== 'dead', life === 'downed');
    interact.update(dt, input, player.x, player.z, player.yaw, acting && life === 'alive');
    player.frozen = over || life !== 'alive';
    player.lying = life === 'downed';
    player.update(dt, input, map, openDoors, player.freeCam ? [] : entities.blockers());
    player.applyTo(camera);
    if (watching) {
      // Out of the game: ride behind a teammate until the next round.
      const [bx, , bz] = aimDir(watching.yaw + Math.PI, 0);
      const back = Math.min(SPECTATE_BACK, rayWorld(map, openDoors, watching.x, SPECTATE_HEIGHT, watching.z, bx, 0, bz, SPECTATE_BACK + 0.3) - 0.3);
      camera.position.set(watching.x + bx * back, SPECTATE_HEIGHT, watching.z + bz * back);
      camera.rotation.set(watching.pitch * 0.5 - 0.12, watching.yaw, 0, 'YXZ');
    }
    shake.apply(dt, camera);
    camera.updateMatrixWorld();
    if (life === 'downed' && !revivedBy) bleed = Math.max(0, bleed - dt);
    vm.update(dt, {
      aim: weapons.aim, speed: player.speed, sprinting: player.sprinting, lookX: player.lookX, lookY: player.lookY,
      strafe: player.vx * Math.cos(player.yaw) - player.vz * Math.sin(player.yaw),
      light: world.lightAt(player.x, 1.4, player.z),
    });
    sendTimer += dt;
    if (sendTimer >= 1 / CLIENT_MOVE_SEND_HZ && !player.freeCam && life !== 'dead' && !over) {
      sendTimer = 0;
      const state = player.sprinting ? MoveState.Sprint : player.speed > 0.3 ? MoveState.Walk : MoveState.Idle;
      s.send({ t: 'move', seq: ++moveSeq, x: player.x, z: player.z, yaw: player.yaw, pitch: player.pitch, state });
    }
  } else {
    // Menu backdrop: a slow pan around the courtyard.
    attract += dt;
    input.consumeMouse();
    camera.position.set(33, 2.4, 43);
    camera.rotation.set(0.12, attract * 0.06, 0, 'YXZ');
  }
  remotes.update(dt, clock.renderTime, camera, window.innerWidth, window.innerHeight);
  entities.update(dt, clock.renderTime);
  const ents = entities.list();
  const mates = remotes.list();
  fx.update(dt);
  forgeView.update(dt, now / 1000);
  const gameTime = clock.now;
  for (const [kind, until] of effects) if (until <= gameTime) effects.delete(kind);
  cacheView.setClearance(effects.has('clearance'));
  cacheView.update(dt, gameTime);
  pickups.update(dt, gameTime);
  hud.setEffects(live() ? [...effects].map(([kind, until]) => ({ kind, left: until - gameTime })) : []);
  world.update(dt, now / 1000);
  atmosphere.update(dt, camera.position.x, camera.position.z);
  sky.position.set(camera.position.x, 0, camera.position.z);
  snow.update(now / 1000, camera.position);
  // A scoped rifle swaps the viewmodel for a scope overlay once the sights are up.
  const scoped = playing() && weapons.def?.cls === 'sniper' && weapons.aim > 0.85;
  renderer.render(scene, camera, live() && !player.freeCam && !scoped && life !== 'dead' ? vm : null);
  hud.setScope(scoped);

  const cur = weapons.current;
  hud.setAmmo(weapons.def?.name ?? '', cur?.mag ?? 0, cur?.reserve ?? 0, weapons.grenades, weapons.reloading, weapons.tacticals);
  const gapPx = (Math.tan(weapons.spread()) / Math.tan((camera.fov * Math.PI) / 360)) * (window.innerHeight / 2);
  hud.setCrosshair(gapPx, weapons.aim < 0.5);

  const zoneId = map.zoneAt(player.x, player.z);
  hud.setZone(map.zones.find((z) => z.id === zoneId)?.name ?? '');
  hud.setStamina(player.stamina, player.staminaMax);
  const maxHp = maxHpWith(perks);
  audio.frame({
    dt, playing: live(), alive: life === 'alive', downed: life === 'downed', x: camera.position.x, z: camera.position.z, yaw: camera.rotation.y,
    zone: map.zoneAt(camera.position.x, camera.position.z), power, hp: life === 'dead' ? 1 : hp / maxHp, hpNow: hp, speed: player.speed, sprinting: player.sprinting,
    stride: player.stride, reviving: interact.progress, gameTime, entities: ents, remotes: mates,
  });
  arcs.update(dt, player.x, player.z, player.yaw);
  hud.setHealth(live() && life !== 'dead' ? hp : maxHp, maxHp, dt);
  hud.setPrompt(live() ? interact.prompt : '');
  hud.setProgress(live() ? interact.progress : 0);
  if (!live() || life === 'alive') hud.setDowned('', -1, '', false);
  else if (life === 'downed') {
    const self = revivedBy === net.id;
    const by = scores.players.get(revivedBy)?.name;
    const alone = scores.players.size < 2;
    const sub = self ? 'Second Wind \u2014 getting back up' : by ? `${by} is reviving you` : alone ? '' : 'Hold on \u2014 a teammate can revive you';
    hud.setDowned('YOU ARE DOWN', self ? -1 : bleed / BLEEDOUT_SECONDS, sub, !!by);
  } else hud.setDowned('SPECTATING', -1, `${watching ? `${watching.name} \u00b7 ` : ''}you are back in when the next round starts`, false);
  scores.update(live() && input.down('Tab'));
  input.endFrame();

  fpsFrames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    debugState.fps = Math.round(fpsFrames / fpsTime);
    fpsFrames = fpsTime = 0;
    hud.setStats(
      debugMode
        ? `${debugState.fps} fps · ${renderer.lastDrawCalls} calls · ${renderer.lastTriangles} tris · ${net.pingMs ?? '?'} ms\n${player.x.toFixed(1)}, ${player.z.toFixed(1)} · yaw ${player.yaw.toFixed(2)} · room ${net.room?.code ?? '-'}`
        : null,
    );
  }
  Object.assign(debugState, {
    frames: debugState.frames + 1,
    x: player.x, z: player.z, yaw: player.yaw, pitch: player.pitch, zone: zoneId,
    stamina: player.stamina, sprinting: player.sprinting, freeCam: player.freeCam,
    drawCalls: renderer.lastDrawCalls, triangles: renderer.lastTriangles,
    resolution: [renderer.width, renderer.height], openDoors: [...openDoors], power,
    pingMs: net.pingMs, remotes: mates, audio: audio.stats, shake: shake.trauma, damageArcs: arcs.list(player.x, player.z, player.yaw),
    weapon: cur?.id ?? null, weapons: weapons.slots.map((w) => w.id), upgraded: weapons.slots.map((w) => w.upgraded), perks: [...perks], maxHp,
    forge: forge.phase, slot: weapons.slot, mag: cur?.mag ?? 0,
    reserve: cur?.reserve ?? 0, grenades: weapons.grenades, reloading: weapons.reloading, aim: weapons.aim,
    shots: weapons.shots, entities: ents, fx: fx.counts, hp, barricades: barricades.list(), prompt: interact.prompt,
    tacticals: weapons.tacticals, powerups: pickups.list(), effects: [...effects.keys()], cache: cacheView.list(),
    round, roundPhase, zombiesLeft, life, over, points: scores.players.get(net.id)?.points ?? 0, roster: scores.list(),
  });
});

document.body.dataset.phase = net.phase;
net.start(params.get('name') ?? '');
