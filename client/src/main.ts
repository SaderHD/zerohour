import * as THREE from 'three';
import {
  BLEEDOUT_SECONDS, CLIENT_MOVE_SEND_HZ, MARK_RANGE, MoveState, PLAYER_EYE_HEIGHT, aimDir, compileMap, harrowRidge, maxHpWith, rayWorld, validateMap,
} from '@zh/shared';
import { GameAudio } from './audio/audio';
import { debugState, wireDebug } from './debug';
import { Autopilot } from './game/autopilot';
import { Barricades } from './game/barricades';
import { CacheView } from './game/cacheView';
import { Entities } from './game/entities';
import { wireEvents } from './game/events';
import { Shake } from './game/feel';
import { ForgeView } from './game/forgeView';
import { Fx } from './game/fx';
import { Interact } from './game/interact';
import { LocalPlayer } from './game/localPlayer';
import { Marks } from './game/marks';
import { Match } from './game/match';
import { Pickups } from './game/pickups';
import { RemotePlayers } from './game/remotePlayers';
import { Viewmodel } from './game/viewmodel';
import { LocalWeapons } from './game/weapons';
import { Input } from './input/input';
import { ServerClock } from './net/interp';
import { Net } from './net/net';
import { Atmosphere } from './render/atmosphere';
import { PALETTE } from './render/materials';
import { RetroRenderer } from './render/renderer';
import { buildSky } from './render/sky';
import { Snow } from './render/snow';
import { buildWorld } from './render/worldBuilder';
import { Settings } from './settings';
import { Chat } from './ui/chat';
import { DamageArcs } from './ui/damage';
import { buildHelp } from './ui/help';
import { Hud } from './ui/hud';
import { Menu } from './ui/menu';
import { Scoreboard } from './ui/scoreboard';
import { Screens } from './ui/screens';
import { buildSettings } from './ui/settings';

// URL flags: ?name=X  ?room=CODE (join it; with autostart, create it if missing)
//            ?autostart=1 (skip menu and lobby)  ?debug=1 (stats overlay)  ?auto=1 (the autopilot plays)
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
const match = new Match(map, world, fx, scores);
const marks = new Marks(scene);
const forgeView = new ForgeView(scene, map, world.lightAt, fx);
const cacheView = new CacheView(scene, map, world.lightAt, fx);
const pickups = new Pickups(scene, fx);
const settings = new Settings();

const audio = new GameAudio({
  map, openDoors: match.openDoors, drips: world.drips,
  selfId: () => net.id,
  playerAt: (id) => remotes.list().find((r) => r.id === id && Number.isFinite(r.x)) ?? null,
  entityAt: (id) => entities.chest(id),
  planks: (id) => barricades.list().find((b) => b.id === id)?.planks ?? 0,
});
const weapons = new LocalWeapons({ player, camera, map, openDoors: match.openDoors, entities, fx, vm, sound: audio.guns, shake, send: (m) => net.socket.send(m) });
const interact = new Interact(barricades, remotes, map, match.soldDoors, () => ({
  id: net.id, points: scores.players.get(net.id)?.points ?? 0, perks: match.perks, weapons: weapons.slots, slot: weapons.slot, power: match.power, forge: match.forge,
  solo: [...scores.players.values()].filter((p) => p.connected).length <= 1,
  cache: (site) => cacheView.at(site),
}), (m) => net.socket.send(m));

function resize(): void {
  camera.aspect = renderer.resize(window.innerWidth, window.innerHeight);
  vm.setAspect(camera.aspect);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// --- Network and screens
const net = new Net();
const menu = new Menu(net, params.get('name'), autostart ? null : wantedRoom);
const screens = new Screens(net);
const chat = new Chat((text) => net.chat(text));
const playing = () => net.phase === 'playing';
/** In a game that is still going. */
const live = () => playing() && !match.over;
let moveSeq = 0;
let triedCreate = false;

// Settings reach the game here, at start and whenever one changes.
const BASE_SENSITIVITY = player.sensitivity;
settings.onChange((d) => {
  player.sensitivity = BASE_SENSITIVITY * d.sensitivity;
  player.invertY = d.invertY;
  player.baseFov = d.fov;
  shake.scale = d.shake;
  renderer.dither = d.dither;
  if (renderer.scale !== d.renderScale) {
    renderer.scale = d.renderScale;
    resize();
  }
  input.remap = settings.remap();
  interact.useKey = settings.label('use');
  const k = (a: string): string => settings.label(a);
  hud.setHint(`Click to play \u00b7 ${k('forward')} ${k('left')} ${k('back')} ${k('right')} move \u00b7 ${k('sprint')} sprint \u00b7 ${k('fire')} fire \u00b7 ${k('aim')} aim \u00b7 ${k('reload')} reload \u00b7 ${k('swap')} swap \u00b7 ${k('knife')} knife \u00b7 ${k('grenade')} grenade \u00b7 ${k('decoy')} decoy \u00b7 ${k('use')} buy / rebuild / revive \u00b7 ${k('mark')} ping \u00b7 ${k('chat')} chat \u00b7 ${k('scores')} scores \u00b7 Esc menu`);
});
buildSettings(settings, audio, input, () => screens.close());
screens.onOpen = (p) => {
  input.release();
  if (p === 'help') buildHelp(settings, () => screens.close());
};
screens.onResume = () => {
  screens.setPaused(false);
  input.lock(canvas, live);
};
chat.onClose = () => input.release();
chat.onLine = () => (debugState.chat = chat.list());
document.getElementById('again')!.onclick = () => net.again();
document.getElementById('results-leave')!.onclick = () => net.leave();

// A click on the game takes the mouse (and with it ends a pause), unless a panel is open.
input.attach(canvas, () => live() && !screens.panel);
input.onLockChange = (locked) => {
  hud.setLocked(locked);
  if (locked) document.body.dataset.locked = '1';
  else delete document.body.dataset.locked;
  // Losing the mouse mid-game (Esc, alt-tab) is the pause screen; getting it back ends it.
  if (locked) screens.setPaused(false);
  else if (live()) screens.setPaused(true);
};
// Esc with the mouse free: back out of a panel, else open or close the pause screen.
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape' || input.capture) return;
  if (screens.panel) screens.close();
  // The same Esc that freed the mouse has just opened the pause screen: do not close it again.
  else if (live() && !chat.open && !(screens.paused && performance.now() - screens.pausedAt < 400)) screens.setPaused(!screens.paused);
});

/** The connection as the player should see it: fine, down (retrying) or gone for good. */
function showNet(): void {
  const down = net.phase === 'connecting' && (net.wasConnected || net.attempts >= 2);
  screens.setNet(net.phase === 'lost' ? 'fatal' : down ? 'down' : 'ok', net.fatal);
  statusEl.textContent = net.phase === 'connecting' ? 'connecting\u2026' : net.phase === 'lost' ? 'disconnected' : '';
  statusEl.dataset.state = net.phase === 'lost' ? 'error' : net.phase === 'connecting' ? 'connecting' : 'ok';
}

net.onPhase = (phase) => {
  document.body.dataset.phase = phase;
  debugState.phase = phase;
  if (phase === 'connecting' || phase === 'lost') debugState.connected = false;
  if (phase !== 'playing') {
    if (document.pointerLockElement) document.exitPointerLock();
    match.setOver(false);
    screens.setPaused(false);
    chat.hide();
    marks.clear();
  }
  if (phase === 'menu') chat.clear();
  showNet();
};
net.onDown = showNet;
net.onNotice = (what) => {
  menu.showNotice(what);
  if (what === 'seat_back') chat.system('Reconnected');
};
net.onWelcome = (resumed) => {
  remotes.selfId = scores.selfId = net.id;
  debugState.connected = true;
  debugState.playerId = net.id;
  showNet();
  if (resumed) return;
  triedCreate = false;
  if (wantedRoom && autostart) net.join(wantedRoom);
  else if (wantedRoom && !joinedByLink) {
    // An invite link: straight into that room, once.
    joinedByLink = true;
    net.join(wantedRoom);
  } else if (autostart) net.create();
};
let joinedByLink = false;
/** The roster as last seen, to say who came, went, dropped and returned. */
let roster = new Map<number, { name: string; connected: boolean }>();
net.onRoom = (room) => {
  menu.setRoom(room);
  debugState.room = room?.code ?? null;
  debugState.isHost = net.isHost;
  const next = new Map((room?.players ?? []).map((p) => [p.id, { name: p.name, connected: p.connected }]));
  if (room && roster.size) {
    for (const [id, p] of next) {
      const was = roster.get(id);
      if (id === net.id) continue;
      if (!was) chat.system(`${p.name} joined`);
      else if (was.connected && !p.connected) chat.system(`${p.name} lost connection`);
      else if (!was.connected && p.connected) chat.system(`${p.name} is back`);
    }
    for (const [id, p] of roster) if (!next.has(id) && id !== net.id) chat.system(`${p.name} left`);
  }
  roster = next;
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
  if (code === 'rate_limited' && net.room) return chat.system('Slow down \u2014 that one was not sent');
  menu.showError(code);
  showNet();
};

const s = net.socket;
s.on('chat', (m) => {
  chat.add(m.name, m.text, m.from === net.id);
  if (m.from !== net.id) audio.sfx.chat();
});
wireEvents({ net, match, map, world, player, remotes, entities, barricades, scores, hud, audio, arcs, cacheView, pickups, forgeView, fx, weapons, vm, shake, interact, clock, marks });

/** Drop a marker where we are looking, for the team. */
function ping(): void {
  const [dx, dy, dz] = aimDir(player.yaw, player.viewPitch);
  const d = Math.min(rayWorld(map, match.openDoors, player.x, PLAYER_EYE_HEIGHT, player.z, dx, dy, dz, MARK_RANGE - 1), MARK_RANGE - 1);
  s.send({ t: 'mark', x: player.x + dx * d * 0.98, z: player.z + dz * d * 0.98 });
}

const autopilot = new Autopilot(map, player, input, entities, remotes, weapons, {
  id: () => net.id, hp: () => match.hp, life: () => match.life, points: () => scores.players.get(net.id)?.points ?? 0, perks: () => match.perks,
  power: () => match.power, forge: () => match.forge, openDoors: match.openDoors, drops: () => pickups.list(),
  cacheHome: () => cacheView.home, cacheAt: (site) => cacheView.at(site).state,
});
autopilot.on = params.has('auto');
wireDebug({ player, input, socket: s, playing, renderer, resize, audio, settings, screens, chat: (text) => net.chat(text), ping, autopilot });

const MAX_FRAME = 0.2;
const SPECTATE_BACK = 2.4;
const SPECTATE_HEIGHT = 2;

// --- Main loop
let last = performance.now();
let fpsFrames = 0;
let fpsTime = 0;
let sendTimer = 0;
let attract = 0;
let watchIndex = 0;
renderer.gl.setAnimationLoop((now) => {
  // A slow frame still covers its real time (up to a point), or a slow machine would play in slow motion
  // against a server that does not wait: the shared collision code takes long steps in its stride.
  const frame = (now - last) / 1000;
  const dt = Math.min(MAX_FRAME, frame);
  last = now;

  const spectating = playing() && match.life === 'dead' && !player.freeCam;
  // Out of the game: left and right mouse step through the teammates still standing.
  if (spectating && live() && !screens.blocking) watchIndex += (input.pressed('Mouse0') ? 1 : 0) - (input.pressed('Mouse2') ? 1 : 0);
  const watching = spectating ? remotes.spectate(watchIndex) : null;
  if (playing()) {
    const free = !screens.blocking && !chat.open;
    const acting = live() && !player.freeCam && free;
    if (acting && input.pressed('Enter')) {
      input.release();
      chat.show();
    }
    if (acting && match.life !== 'dead' && input.pressed('KeyZ')) ping();
    autopilot.update(dt, acting && match.life !== 'dead');
    weapons.update(dt, input, acting && match.life !== 'dead', match.life === 'downed');
    interact.update(dt, input, player.x, player.z, player.yaw, acting && match.life === 'alive');
    player.frozen = match.over || match.life !== 'alive' || !free;
    player.lying = match.life === 'downed';
    player.update(dt, input, map, match.openDoors, player.freeCam ? [] : entities.blockers());
    player.applyTo(camera);
    if (watching) {
      // Out of the game: ride behind a teammate until the next round.
      const [bx, , bz] = aimDir(watching.yaw + Math.PI, 0);
      const back = Math.min(SPECTATE_BACK, rayWorld(map, match.openDoors, watching.x, SPECTATE_HEIGHT, watching.z, bx, 0, bz, SPECTATE_BACK + 0.3) - 0.3);
      camera.position.set(watching.x + bx * back, SPECTATE_HEIGHT, watching.z + bz * back);
      camera.rotation.set(watching.pitch * 0.5 - 0.12, watching.yaw, 0, 'YXZ');
    }
    shake.apply(dt, camera);
    camera.updateMatrixWorld();
    if (match.life === 'downed' && !match.revivedBy) match.bleed = Math.max(0, match.bleed - dt);
    vm.update(dt, {
      aim: weapons.aim, speed: player.speed, sprinting: player.sprinting, lookX: player.lookX, lookY: player.lookY,
      strafe: player.vx * Math.cos(player.yaw) - player.vz * Math.sin(player.yaw),
      light: world.lightAt(player.x, 1.4, player.z),
    });
    sendTimer += dt;
    if (sendTimer >= 1 / CLIENT_MOVE_SEND_HZ && !player.freeCam && match.life !== 'dead' && !match.over) {
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
  marks.update(clock.now, now / 1000, camera, window.innerWidth, window.innerHeight, player.x, player.z);
  entities.update(dt, clock.renderTime);
  const ents = entities.list();
  const mates = remotes.list();
  fx.update(dt);
  forgeView.update(dt, now / 1000);
  const gameTime = clock.now;
  for (const [kind, until] of match.effects) if (until <= gameTime) match.effects.delete(kind);
  cacheView.setClearance(match.effects.has('clearance'));
  cacheView.update(dt, gameTime);
  pickups.update(dt, gameTime);
  hud.setEffects(live() ? [...match.effects].map(([kind, until]) => ({ kind, left: until - gameTime })) : []);
  world.update(dt, now / 1000);
  atmosphere.update(dt, camera.position.x, camera.position.z);
  sky.position.set(camera.position.x, 0, camera.position.z);
  snow.update(now / 1000, camera.position);
  // A scoped rifle swaps the viewmodel for a scope overlay once the sights are up.
  const scoped = playing() && weapons.def?.cls === 'sniper' && weapons.aim > 0.85;
  renderer.render(scene, camera, live() && !player.freeCam && !scoped && match.life !== 'dead' ? vm : null);
  hud.setScope(scoped);

  const cur = weapons.current;
  hud.setAmmo(weapons.def?.name ?? '', cur?.mag ?? 0, cur?.reserve ?? 0, weapons.grenades, weapons.reloading, weapons.tacticals);
  const gapPx = (Math.tan(weapons.spread()) / Math.tan((camera.fov * Math.PI) / 360)) * (window.innerHeight / 2);
  hud.setCrosshair(gapPx, weapons.aim < 0.5);

  const zoneId = map.zoneAt(player.x, player.z);
  hud.setZone(map.zones.find((z) => z.id === zoneId)?.name ?? '');
  hud.setStamina(player.stamina, player.staminaMax);
  const maxHp = maxHpWith(match.perks);
  audio.frame({
    dt, playing: live(), alive: match.life === 'alive', downed: match.life === 'downed', x: camera.position.x, z: camera.position.z, yaw: camera.rotation.y,
    zone: map.zoneAt(camera.position.x, camera.position.z), power: match.power, hp: match.life === 'dead' ? 1 : match.hp / maxHp, hpNow: match.hp, speed: player.speed, sprinting: player.sprinting,
    stride: player.stride, reviving: interact.progress, gameTime, entities: ents, remotes: mates,
  });
  arcs.update(dt, player.x, player.z, player.yaw);
  hud.setHealth(live() && match.life !== 'dead' ? match.hp : maxHp, maxHp, dt);
  hud.setPrompt(live() ? interact.prompt : '');
  hud.setProgress(live() ? interact.progress : 0);
  if (!live() || match.life === 'alive') hud.setDowned('', -1, '', false);
  else if (match.life === 'downed') {
    const self = match.revivedBy === net.id;
    const by = scores.players.get(match.revivedBy)?.name;
    const alone = scores.players.size < 2;
    const sub = self ? 'Second Wind \u2014 getting back up' : by ? `${by} is reviving you` : alone ? '' : 'Hold on \u2014 a teammate can revive you';
    hud.setDowned('YOU ARE DOWN', self ? -1 : match.bleed / BLEEDOUT_SECONDS, sub, !!by);
  } else hud.setDowned('SPECTATING', -1, `${watching ? `Watching ${watching.name} \u00b7 ` : ''}you are back in when the next round starts${remotes.standing() > 1 ? ` \u00b7 ${settings.label('fire')} next` : ''}`, false);
  scores.update(live() && input.down('Tab'));
  input.endFrame();

  fpsFrames++;
  fpsTime += frame;
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
    resolution: [renderer.width, renderer.height], openDoors: [...match.openDoors], power: match.power,
    pingMs: net.pingMs, remotes: mates, audio: audio.stats, shake: shake.trauma, damageArcs: arcs.list(player.x, player.z, player.yaw),
    weapon: cur?.id ?? null, weapons: weapons.slots.map((w) => w.id), upgraded: weapons.slots.map((w) => w.upgraded), perks: [...match.perks], maxHp,
    forge: match.forge.phase, slot: weapons.slot, mag: cur?.mag ?? 0,
    reserve: cur?.reserve ?? 0, grenades: weapons.grenades, reloading: weapons.reloading, aim: weapons.aim,
    shots: weapons.shots, entities: ents, fx: fx.counts, hp: match.hp, barricades: barricades.list(), prompt: interact.prompt,
    tacticals: weapons.tacticals, powerups: pickups.list(), effects: [...match.effects.keys()], cache: cacheView.list(),
    round: match.round, roundPhase: match.roundPhase, zombiesLeft: match.zombiesLeft, life: match.life, over: match.over, paused: screens.paused, panel: screens.panel,
    marks: marks.list(), auto: autopilot.on ? autopilot.goal || 'on' : '', chatOpen: chat.open, net: document.body.dataset.net ?? 'ok', locked: input.locked, fov: camera.fov, sensitivity: player.sensitivity, points: scores.players.get(net.id)?.points ?? 0, roster: scores.list(),
  });
});

document.body.dataset.phase = net.phase;
net.start(params.get('name') ?? '');
