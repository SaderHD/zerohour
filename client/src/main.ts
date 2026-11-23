import * as THREE from 'three';
import { compileMap, harrowRidge, validateMap } from '@zh/shared';
import { debugState, installDebug } from './debug';
import { LocalPlayer } from './game/localPlayer';
import { Input } from './input/input';
import { Socket } from './net/socket';
import { PALETTE } from './render/materials';
import { RetroRenderer } from './render/renderer';
import { buildSky } from './render/sky';
import { buildWorld } from './render/worldBuilder';
import { Hud } from './ui/hud';

const params = new URLSearchParams(location.search);
const debugMode = params.has('debug');
const canvas = document.getElementById('game') as HTMLCanvasElement;
const statusEl = document.getElementById('status') as HTMLDivElement;

function setStatus(text: string, state: 'connecting' | 'ok' | 'error'): void {
  statusEl.textContent = text;
  statusEl.dataset.state = state;
}

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
input.attach(canvas);
const hud = new Hud();
input.onLockChange = (locked) => hud.setLocked(locked);

const player = new LocalPlayer();
const spawn = harrowRidge.playerSpawns[0]!;
player.teleport(spawn.x, spawn.z, spawn.yaw);

/** Doors opened so far. Local-only until the server owns door state (session 7). */
const openDoors = new Set<string>();
function setDoor(id: string, open: boolean): void {
  if (open) openDoors.add(id);
  else openDoors.delete(id);
  world.setDoorOpen(id, open);
}

function resize(): void {
  camera.aspect = renderer.resize(window.innerWidth, window.innerHeight);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

installDebug({
  teleport: (x, z, yaw) => player.teleport(x, z, yaw),
  gotoZone: (zoneId, yaw = 0) => {
    const room = harrowRidge.rooms.filter((r) => r.zone === zoneId).sort((a, b) => b.w * b.d - a.w * a.d)[0];
    if (room) player.teleport(room.x + room.w / 2, room.z + room.d / 2, yaw);
  },
  look: (yaw, pitch = 0) => {
    player.yaw = yaw;
    player.pitch = pitch;
  },
  freeCam: (on) => player.setFreeCam(on ?? !player.freeCam),
  openAllDoors: () => harrowRidge.openings.forEach((o) => o.kind === 'door' && setDoor(o.id, true)),
  openDoor: (id, open = true) => setDoor(id, open),
  key: (code, down) => input.setKey(code, down),
  renderScale: (scale) => {
    renderer.scale = scale;
    resize();
  },
  dither: (on) => {
    renderer.dither = on;
  },
});

// --- Main loop
let last = performance.now();
let fpsFrames = 0;
let fpsTime = 0;
renderer.gl.setAnimationLoop((now) => {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  player.update(dt, input, map, openDoors);
  player.applyTo(camera);
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
        ? `${debugState.fps} fps · ${renderer.lastDrawCalls} calls · ${renderer.lastTriangles} tris\n${player.x.toFixed(1)}, ${player.z.toFixed(1)} · yaw ${player.yaw.toFixed(2)}`
        : null,
    );
  }
  Object.assign(debugState, {
    frames: debugState.frames + 1,
    x: player.x, z: player.z, yaw: player.yaw, pitch: player.pitch, zone: zoneId,
    stamina: player.stamina, sprinting: player.sprinting, freeCam: player.freeCam,
    drawCalls: renderer.lastDrawCalls, triangles: renderer.lastTriangles,
    resolution: [renderer.width, renderer.height], openDoors: [...openDoors],
  });
});

// --- Network handshake (lobby and player sync arrive in session 3)
const socket = new Socket(params.get('name') ?? 'Survivor');
socket.on('welcome', (msg) => {
  debugState.connected = true;
  debugState.playerId = msg.id;
  console.log(`[zh] welcome: player ${msg.id}, protocol v${msg.v}`);
  setStatus(`connected · player ${msg.id}`, 'ok');
  socket.send({ t: 'ping', c: performance.now() });
});
socket.on('pong', (msg) => {
  debugState.pingMs = Math.round(performance.now() - msg.c);
});
socket.on('error', (msg) => setStatus(`server error: ${msg.code}`, 'error'));
socket.onClose = () => {
  debugState.connected = false;
  if (statusEl.dataset.state !== 'error') setStatus('disconnected', 'error');
};
socket.connect();
