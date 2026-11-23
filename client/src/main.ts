import * as THREE from 'three';
import { CLIENT_MOVE_SEND_HZ, MoveState, compileMap, harrowRidge, validateMap } from '@zh/shared';
import { debugState, installDebug } from './debug';
import { LocalPlayer } from './game/localPlayer';
import { RemotePlayers } from './game/remotePlayers';
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

function resize(): void {
  camera.aspect = renderer.resize(window.innerWidth, window.innerHeight);
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
});
s.on('snap', (m) => {
  clock.observe(m.time);
  remotes.onSnapshot(m.time, m.players);
});
s.on('correct', (m) => {
  player.teleport(m.x, m.z);
  debugState.corrections++;
});
s.on('ev', (m) => {
  for (const ev of m.events) {
    switch (ev.e) {
      case 'player':
        remotes.upsert(ev.player);
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
    player.update(dt, input, map, openDoors);
    player.applyTo(camera);
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
  remotes.update(dt, clock.renderTime, camera, window.innerWidth, window.innerHeight);
  sky.position.set(camera.position.x, 0, camera.position.z);
  renderer.render(scene, camera);

  const zoneId = map.zoneAt(player.x, player.z);
  hud.setZone(map.zones.find((z) => z.id === zoneId)?.name ?? '');
  hud.setStamina(player.stamina);

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
  });
});

document.body.dataset.phase = net.phase;
net.start(params.get('name') ?? '');
