import * as THREE from 'three';
import { Socket } from './net/socket';
import { debugState, installDebug } from './debug';

installDebug();

const params = new URLSearchParams(location.search);
const statusEl = document.getElementById('status') as HTMLDivElement;
const canvas = document.getElementById('game') as HTMLCanvasElement;

function setStatus(text: string, state: 'connecting' | 'ok' | 'error'): void {
  statusEl.textContent = text;
  statusEl.dataset.state = state;
}

// --- Placeholder scene: proves WebGL + the build pipeline. Replaced by the retro renderer in session 2.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07080a);
scene.fog = new THREE.Fog(0x07080a, 4, 12);
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
camera.position.set(0, 1.2, 4);
scene.add(new THREE.HemisphereLight(0x8fa3b8, 0x1a1410, 1.2));
const lamp = new THREE.PointLight(0xffb070, 12, 10);
lamp.position.set(2, 3, 2);
scene.add(lamp);
const crate = new THREE.Mesh(
  new THREE.BoxGeometry(1.4, 1.4, 1.4),
  new THREE.MeshLambertMaterial({ color: 0x6b5a3a, flatShading: true }),
);
crate.position.y = 1;
scene.add(crate);
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshLambertMaterial({ color: 0x23262b }),
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

function resize(): void {
  renderer.setPixelRatio(1);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

renderer.setAnimationLoop((ms) => {
  crate.rotation.y = ms / 1500;
  renderer.render(scene, camera);
  debugState.frames++;
});

// --- Network handshake
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
