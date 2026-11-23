import * as THREE from 'three';
import {
  CLIENT_MOVE_SEND_HZ, MoveState, PLAYER_EYE_HEIGHT, PLAYER_MAX_HP, aimDir, compileMap, harrowRidge, rayWorld, validateMap, weaponDef,
} from '@zh/shared';
import { debugState, installDebug } from './debug';
import { Barricades } from './game/barricades';
import { Entities } from './game/entities';
import { Fx } from './game/fx';
import { Interact } from './game/interact';
import { LocalPlayer } from './game/localPlayer';
import { RemotePlayers } from './game/remotePlayers';
import { Viewmodel } from './game/viewmodel';
import { LocalWeapons } from './game/weapons';
import { Input } from './input/input';
import { ServerClock } from './net/interp';
import { Net } from './net/net';
import { PALETTE } from './render/materials';
import { RetroRenderer } from './render/renderer';
import { buildSky } from './render/sky';
import { buildWorld } from './render/worldBuilder';
import { Hud } from './ui/hud';
import { Menu } from './ui/menu';

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
scene.fog = new THREE.Fog(PALETTE.fog, 6, 42);
// World surfaces carry baked lighting in vertex colours; this ambient passes it through 1:1
// (Lambert divides by pi). Realtime lights added later (muzzle flashes...) stack on top.
scene.add(new THREE.AmbientLight(0xffffff, Math.PI));
const sky = buildSky();
scene.add(sky);
const world = buildWorld(map);
scene.add(world.group);
debugState.worldTriangles = world.triangles;

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
const interact = new Interact(barricades, (m) => net.socket.send(m));
let hp = PLAYER_MAX_HP;

/** Doors the server has opened. Also used for local collision. */
const openDoors = new Set<string>();
function setDoors(ids: Iterable<string>): void {
  const want = new Set(ids);
  for (const o of harrowRidge.openings) {
    if (o.kind !== 'door') continue;
    world.setDoorOpen(o.id, want.has(o.id));
  }
  openDoors.clear();
  for (const id of want) openDoors.add(id);
}

const weapons = new LocalWeapons({ player, camera, map, openDoors, entities, fx, vm, send: (m) => net.socket.send(m) });

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
let moveSeq = 0;
let triedCreate = false;

input.attach(canvas, playing);
input.onLockChange = (locked) => hud.setLocked(locked);

net.onPhase = (phase) => {
  document.body.dataset.phase = phase;
  debugState.phase = phase;
  if (phase === 'connecting' || phase === 'lost') debugState.connected = false;
  if (phase !== 'playing' && document.pointerLockElement) document.exitPointerLock();
  const text = { connecting: 'connecting…', menu: '', lobby: '', playing: '', lost: 'disconnected' }[phase];
  statusEl.textContent = text;
  statusEl.dataset.state = phase === 'lost' ? 'error' : phase === 'connecting' ? 'connecting' : 'ok';
};
net.onWelcome = (resumed) => {
  remotes.selfId = net.id;
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
  remotes.reset(m.players);
  entities.reset(m.zombies);
  barricades.reset(m.barricades);
  const me = m.players.find((p) => p.id === net.id);
  if (me) weapons.onPlayer(me);
});
s.on('snap', (m) => {
  clock.observe(m.time);
  remotes.onSnapshot(m.time, m.players);
  hp = m.players.find((p) => p[0] === net.id)?.[6] ?? hp;
  entities.onSnapshot(m.time, m.zombies);
  fx.setProjectiles(m.projectiles);
  weapons.onAmmo(m.ammo);
});
s.on('correct', (m) => {
  player.teleport(m.x, m.z);
  debugState.corrections++;
});
s.on('ev', (m) => {
  for (const ev of m.events) {
    switch (ev.e) {
      case 'player':
        if (ev.player.id === net.id) weapons.onPlayer(ev.player);
        else remotes.upsert(ev.player);
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
        if (ev.by === net.id) hud.hit('kill');
        debugState.kills++;
        break;
      }
      case 'barricade':
        barricades.set(ev.id, ev.planks);
        break;
      case 'playerHurt':
        if (ev.id !== net.id) break;
        hp = ev.hp;
        hud.hurt();
        player.kick(0.05);
        debugState.hurts++;
        break;
      case 'playerDied':
        if (ev.id === net.id) debugState.deaths++;
        break;
      case 'fired':
        if (ev.id !== net.id) remoteShot(ev.id, ev.weapon, ev.yaw, ev.pitch);
        break;
      case 'melee':
        if (ev.id !== net.id) remotes.melee(ev.id);
        break;
      case 'explosion':
        fx.explosion(ev.x, ev.y, ev.z, ev.radius);
        debugState.explosions++;
        break;
      case 'playerLeft':
        remotes.remove(ev.id);
        break;
      case 'doorOpened':
        setDoors([...openDoors, ev.id]);
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
    fx.tracer(from, shotTo.set(from.x + dx * reach, PLAYER_EYE_HEIGHT + dy * reach, from.z + dz * reach));
  }
}

installDebug({
  teleport: (x, z, yaw) => {
    player.teleport(x, z, yaw);
    if (playing()) s.send({ t: 'debug', cmd: 'teleport', x, z });
  },
  gotoZone: (zoneId, yaw = 0) => {
    const room = harrowRidge.rooms.filter((r) => r.zone === zoneId).sort((a, b) => b.w * b.d - a.w * a.d)[0];
    if (room) window.__zh.teleport(room.x + room.w / 2, room.z + room.d / 2, yaw);
  },
  look: (yaw, pitch = 0) => {
    player.yaw = yaw;
    player.pitch = pitch;
  },
  lookAt: (x, y, z) => {
    const dx = x - player.x;
    const dz = z - player.z;
    player.yaw = Math.atan2(-dx, -dz);
    player.pitch = Math.atan2(y - PLAYER_EYE_HEIGHT, Math.hypot(dx, dz));
  },
  give: (what) => s.send(typeof what === 'number' ? { t: 'debug', cmd: 'give', points: what } : { t: 'debug', cmd: 'give', weapon: what }),
  spawnZombies: (count, opts = {}) => s.send({ t: 'debug', cmd: 'spawnZombies', count, ...opts }),
  killZombies: () => s.send({ t: 'debug', cmd: 'killZombies' }),
  god: (on) => s.send({ t: 'debug', cmd: 'god', on }),
  dummy: (x, z) => {
    const [dx, , dz] = aimDir(player.yaw, 0);
    const px = x ?? player.x + dx * 3;
    const pz = z ?? player.z + dz * 3;
    s.send({ t: 'debug', cmd: 'dummy', x: px, z: pz, yaw: Math.atan2(-(player.x - px), -(player.z - pz)) });
  },
  press: (code) => {
    input.setKey(code, true);
    requestAnimationFrame(() => requestAnimationFrame(() => input.setKey(code, false)));
  },
  freeCam: (on) => player.setFreeCam(on ?? !player.freeCam),
  openAllDoors: () => s.send({ t: 'debug', cmd: 'openAllDoors' }),
  openDoor: (id) => s.send({ t: 'debug', cmd: 'openDoor', id }),
  key: (code, down) => input.setKey(code, down),
  renderScale: (scale) => {
    renderer.scale = scale;
    resize();
  },
  dither: (on) => {
    renderer.dither = on;
  },
  dropConnection: () => s.drop(),
});

// --- Main loop
let last = performance.now();
let fpsFrames = 0;
let fpsTime = 0;
let sendTimer = 0;
let attract = 0;
renderer.gl.setAnimationLoop((now) => {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (playing()) {
    weapons.update(dt, input, !player.freeCam);
    interact.update(dt, input, player.x, player.z, !player.freeCam);
    player.update(dt, input, map, openDoors, player.freeCam ? [] : entities.blockers());
    player.applyTo(camera);
    camera.updateMatrixWorld();
    vm.update(dt, {
      aim: weapons.aim, speed: player.speed, sprinting: player.sprinting, lookX: player.lookX, lookY: player.lookY,
      light: world.lightAt(player.x, 1.4, player.z),
    });
    sendTimer += dt;
    if (sendTimer >= 1 / CLIENT_MOVE_SEND_HZ && !player.freeCam) {
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
  input.endFrame();
  remotes.update(dt, clock.renderTime, camera, window.innerWidth, window.innerHeight);
  entities.update(dt, clock.renderTime);
  fx.update(dt);
  sky.position.set(camera.position.x, 0, camera.position.z);
  // A scoped rifle swaps the viewmodel for a scope overlay once the sights are up.
  const scoped = playing() && weapons.def?.cls === 'sniper' && weapons.aim > 0.85;
  renderer.render(scene, camera, playing() && !player.freeCam && !scoped ? vm : null);
  hud.setScope(scoped);

  const cur = weapons.current;
  hud.setAmmo(weapons.def?.name ?? '', cur?.mag ?? 0, cur?.reserve ?? 0, weapons.grenades, weapons.reloading);
  const gapPx = (Math.tan(weapons.spread()) / Math.tan((camera.fov * Math.PI) / 360)) * (window.innerHeight / 2);
  hud.setCrosshair(gapPx, weapons.aim < 0.5);

  const zoneId = map.zoneAt(player.x, player.z);
  hud.setZone(map.zones.find((z) => z.id === zoneId)?.name ?? '');
  hud.setStamina(player.stamina);
  hud.setHealth(playing() ? hp : PLAYER_MAX_HP, dt);
  hud.setPrompt(playing() ? interact.prompt : '');

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
    resolution: [renderer.width, renderer.height], openDoors: [...openDoors],
    pingMs: net.pingMs, remotes: remotes.list(),
    weapon: cur?.id ?? null, weapons: weapons.slots.map((w) => w.id), slot: weapons.slot, mag: cur?.mag ?? 0,
    reserve: cur?.reserve ?? 0, grenades: weapons.grenades, reloading: weapons.reloading, aim: weapons.aim,
    shots: weapons.shots, entities: entities.list(), fx: fx.counts, hp, barricades: barricades.list(), prompt: interact.prompt,
  });
});

document.body.dataset.phase = net.phase;
net.start(params.get('name') ?? '');
