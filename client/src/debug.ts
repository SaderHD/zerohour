// Test/debug surface exposed as window.__zh. Agents, the smoke test and the screenshot tour
// drive the game through this. Extend it as features land (give, setRound, spawnZombies, god...).
// Commands that change authoritative state are sent to the server, which only honours them
// when started with ZH_DEBUG=1.

import { PLAYER_EYE_HEIGHT, SIREN, aimDir, perkDef, type ClientMsg, type CompiledMap, type ZombieKind } from '@zh/shared';
import type { GameAudio } from './audio/audio';
import type { LocalPlayer } from './game/localPlayer';
import type { Input } from './input/input';
import type { RetroRenderer } from './render/renderer';
import type { Settings } from './settings';
import type { Screens } from './ui/screens';

export interface DebugState {
  phase: string;
  connected: boolean;
  playerId: number | null;
  room: string | null;
  isHost: boolean;
  pingMs: number | null;
  frames: number;
  fps: number;
  x: number;
  /** Height of the floor underfoot, and of the camera. */
  y: number;
  eyeY: number;
  z: number;
  /** Id of the map we are on. */
  map: string;
  yaw: number;
  pitch: number;
  zone: string | null;
  stamina: number;
  sprinting: boolean;
  freeCam: boolean;
  drawCalls: number;
  /** How long the world took to build and bake when the page loaded, ms. */
  worldBuildMs: number;
  triangles: number;
  worldTriangles: number;
  /** World parts that move by themselves (fans, flywheels, swinging lamps). */
  movers: number;
  resolution: [number, number];
  openDoors: string[];
  power: boolean;
  mapErrors: string[];
  /** Other players as currently drawn (interpolated). */
  remotes: { id: number; name: string; x: number; z: number; visible: boolean; connected: boolean; weapon: string | null; shots: number; state: number }[];
  corrections: number;
  /** Held weapon and predicted ammo; `upgraded` lists which of `weapons` the Forge has been at. */
  weapon: string | null;
  weapons: string[];
  upgraded: boolean[];
  /** Tonics held, top health with them, and what the Forge is doing. */
  perks: string[];
  maxHp: number;
  forge: string;
  slot: number;
  mag: number;
  reserve: number;
  grenades: number;
  reloading: boolean;
  aim: number;
  /** Shots we have fired. */
  shots: number;
  /** Enemies as drawn; hp is a 0..1 fraction, state a ZombieState. */
  entities: { id: number; kind: string; x: number; z: number; hp: number; state: number; gait: number }[];
  /** Our health, and how many times we have been hit. */
  hp: number;
  hurts: number;
  /** Round loop as the server reports it. */
  round: number;
  roundPhase: string;
  zombiesLeft: number;
  /** Our points, whether we are up, and the whole scoreboard. */
  points: number;
  life: 'alive' | 'downed' | 'dead';
  roster: { id: number; name: string; points: number; kills: number; headshots: number; downs: number; revives: number; state: string }[];
  /** Everyone went down: the results screen is up. */
  over: boolean;
  barricades: { id: string; planks: number }[];
  prompt: string;
  /** Server-confirmed hits by anyone, newest last (capped). */
  hits: { id: number; by: number; zone: string; dmg: number }[];
  kills: number;
  explosions: number;
  /** Siren decoys held. */
  tacticals: number;
  /** Power-ups lying about, the timed ones running, and every one taken so far. */
  powerups: { id: number; kind: string; x: number; z: number }[];
  effects: string[];
  powerupsTaken: string[];
  /** The Cache: where it stands and what each site's crate is doing. */
  cache: { home: string; boxes: { site: string; phase: string; weapon: string | null; shown: string; visible: boolean }[] };
  /** Bodies struck by each of the last few Arclight bolts, and howler lightning strikes seen. */
  chains: number[];
  strikes: number;
  lastStrike: { x: number; z: number } | null;
  /** Sound: the context's state, voices sounding now and the most ever at once (never over `max`), and the sliders. */
  audio: GameAudio['stats'] | null;
  /** Screen shake left (0..1), and the bearings of the damage arcs showing (radians, 0 ahead, positive right). */
  shake: number;
  damageArcs: number[];
  fx: { particles: number; tracers: number; projectiles: number; bolts: number; kinds: string[] };
  /** Session 13: screens, chat, markers, the connection notice and the settings as applied. */
  paused: boolean;
  panel: string | null;
  chatOpen: boolean;
  chat: { who: string; text: string }[];
  marks: { id: number; x: number; z: number }[];
  net: string;
  locked: boolean;
  /** The autopilot: '' when off, else what it is after ('on' when nothing). */
  auto: string;
  fov: number;
  sensitivity: number;
}

export interface ZhDebug {
  state(): DebugState;
  /** `y` picks the floor where storeys lie over each other (default: the one nearest our own height). */
  teleport(x: number, z: number, yaw?: number, y?: number): void;
  /** Teleport to the middle of a zone's largest room. */
  gotoZone(zoneId: string, yaw?: number): void;
  look(yaw: number, pitch?: number): void;
  /** What is drawn under the crosshair: the mesh's name (with its parents'), how far off, and where. For finding what a stray surface belongs to. */
  pick(): { name: string; dist: number; at: [number, number, number] } | null;
  /** Aim the view at a world point. */
  lookAt(x: number, y: number, z: number): void;
  /** `give('pike')` hands over a weapon (`give('pike', true)` its Forge upgrade), `give('ironhide')` a tonic, `give('siren')` decoys, `give(500)` points (debug servers only). */
  give(what: string | number, upgraded?: boolean): void;
  /** Queue zombies at the windows; `opts.x/z` drops them at a spot instead (debug servers only). */
  spawnZombies(count: number, opts?: { hp?: number; speed?: number; interval?: number; x?: number; y?: number; z?: number; kind?: ZombieKind }): void;
  /** Drop a power-up at our feet, or at (x, z). */
  powerup(kind: string, x?: number, z?: number): void;
  /** Fix the Cache's next roll: a weapon id, 'siren', or 'jinx'. */
  cacheNext(what: string): void;
  killZombies(): void;
  /** Jump to a round (it starts a second later); `special` makes it a howler round. */
  setRound(round: number, special?: boolean): void;
  /** Stop the round loop and clear the map (`false`), or resume it. */
  rounds(on: boolean): void;
  god(on: boolean): void;
  /** Stand a target dummy at (x, z), or 3 m in front of the player. */
  dummy(x?: number, z?: number): void;
  /** Tap a key for one frame, e.g. press('Mouse0') to fire once. */
  press(code: string): void;
  freeCam(on?: boolean): void;
  /** The free camera, put at a point in the air: `fly(24, 30, 20, 0, -1.2)` looks down on the map from 30 m. */
  fly(x: number, y: number, z: number, yaw?: number, pitch?: number): void;
  openAllDoors(): void;
  openDoor(id: string): void;
  /** Throw the master switch (debug servers only). */
  powerOn(): void;
  /** Hold or release a key by KeyboardEvent.code, e.g. key('KeyW', true). */
  key(code: string, down: boolean): void;
  renderScale(scale: 1 | 2): void;
  dither(on: boolean): void;
  /** Close the socket as if the network dropped; the client reconnects on its own. */
  dropConnection(): void;
  /** Send a chat line; drop a ping marker where the view points. */
  chat(text: string): void;
  ping(): void;
  /** Hand the controls to the autopilot (or take them back). */
  auto(on?: boolean): void;
  /** The settings store (`settings.set({ fov: 90 })`, `settings.bind('use', 'KeyE')`) and the screens (`screens.setPaused(true)`, `screens.open('help')`). */
  settings: Settings;
  screens: Screens;
  /** Sound: `audio.play('shot-pike')`, `audio.names()`, `audio.render(name)` (offline), `audio.record(true|false)`, `audio.setVolume('music', 0.5)`, `audio.unlock()`. */
  audio: GameAudio;
}

declare global {
  interface Window {
    __zh: ZhDebug;
  }
}

export const debugState: DebugState = {
  phase: 'connecting', connected: false, playerId: null, room: null, isHost: false, pingMs: null, frames: 0, fps: 0,
  x: 0, y: 0, eyeY: 0, z: 0, yaw: 0, pitch: 0, zone: null, map: '', stamina: 0, sprinting: false, freeCam: false,
  drawCalls: 0, worldBuildMs: 0, triangles: 0, worldTriangles: 0, movers: 0, resolution: [0, 0], openDoors: [], power: false, mapErrors: [],
  remotes: [], corrections: 0,
  weapon: null, weapons: [], upgraded: [], perks: [], maxHp: 100, forge: 'idle', slot: 0, mag: 0, reserve: 0, grenades: 0, reloading: false, aim: 0, shots: 0,
  entities: [], hp: 100, hurts: 0, round: 0, roundPhase: 'intermission', zombiesLeft: 0, points: 0, life: 'alive', roster: [], over: false, barricades: [], prompt: '', hits: [], kills: 0, explosions: 0, tacticals: 0, powerups: [], effects: [], powerupsTaken: [], cache: { home: '', boxes: [] }, chains: [], strikes: 0, lastStrike: null, audio: null, shake: 0, damageArcs: [], fx: { particles: 0, tracers: 0, projectiles: 0, bolts: 0, kinds: [] },
  paused: false, panel: null, chatOpen: false, chat: [], marks: [], net: 'ok', locked: false, auto: '', fov: 72, sensitivity: 0,
};

export interface DebugWiring {
  map: CompiledMap;
  player: LocalPlayer;
  input: Input;
  socket: { send(msg: ClientMsg): void; drop(): void };
  playing(): boolean;
  renderer: RetroRenderer;
  resize(): void;
  audio: GameAudio;
  settings: Settings;
  screens: Screens;
  chat(text: string): void;
  ping(): void;
  autopilot: { on: boolean };
  pick: ZhDebug['pick'];
}

/** Install window.__zh. Anything that changes the game is a debug message to the server. */
export function wireDebug({ map, player, input, socket: s, playing, renderer, resize, audio, settings, screens, chat, ping, autopilot, pick }: DebugWiring): void {
  const api: Omit<ZhDebug, 'state'> = {
    pick,
  audio, settings, screens, chat, ping,
  teleport: (x, z, yaw, y) => {
    const floor = map.nearestFloor(x, y ?? player.y, z, 'all');
    player.teleport(x, z, yaw, Number.isNaN(floor) ? player.y : floor);
    if (playing()) s.send({ t: 'debug', cmd: 'teleport', x, z, y: player.y });
  },
  gotoZone: (zoneId, yaw = 0) => {
    const room = map.def.rooms.filter((r) => r.zone === zoneId && !r.rise).sort((a, b) => b.w * b.d - a.w * a.d)[0];
    if (room) api.teleport(room.x + room.w / 2, room.z + room.d / 2, yaw, map.floorOn(room.level, room.x + room.w / 2, room.z + room.d / 2));
  },
  look: (yaw, pitch = 0) => {
    player.yaw = yaw;
    player.pitch = pitch;
  },
  lookAt: (x, y, z) => {
    const dx = x - player.x;
    const dz = z - player.z;
    player.yaw = Math.atan2(-dx, -dz);
    player.pitch = Math.atan2(y - (player.y + PLAYER_EYE_HEIGHT), Math.hypot(dx, dz));
  },
  give: (what, upgraded = false) =>
    s.send(typeof what === 'number' ? { t: 'debug', cmd: 'give', points: what }
      : what === SIREN ? { t: 'debug', cmd: 'give', tactical: true }
      : perkDef(what) ? { t: 'debug', cmd: 'give', perk: what } : { t: 'debug', cmd: 'give', weapon: what, upgraded }),
  spawnZombies: (count, opts = {}) => s.send({ t: 'debug', cmd: 'spawnZombies', count, ...opts }),
  killZombies: () => s.send({ t: 'debug', cmd: 'killZombies' }),
  setRound: (n, special = false) => s.send({ t: 'debug', cmd: 'setRound', round: n, special }),
  powerup: (kind, x, z) => s.send({ t: 'debug', cmd: 'powerup', kind, x, z }),
  cacheNext: (what) => s.send({ t: 'debug', cmd: 'cache', ...(what === 'jinx' ? { jinx: true } : { weapon: what }) }),
  rounds: (on) => s.send({ t: 'debug', cmd: 'rounds', on }),
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
  fly: (x, y, z, yaw = 0, pitch = 0) => player.flyTo(x, y, z, yaw, pitch),
  openAllDoors: () => s.send({ t: 'debug', cmd: 'openAllDoors' }),
  openDoor: (id) => s.send({ t: 'debug', cmd: 'openDoor', id }),
  powerOn: () => s.send({ t: 'debug', cmd: 'powerOn' }),
  key: (code, down) => input.setKey(code, down),
  renderScale: (scale) => {
    renderer.scale = scale;
    resize();
  },
  dither: (on) => {
    renderer.dither = on;
  },
  dropConnection: () => s.drop(),
  auto: (on = true) => {
    autopilot.on = on;
  },
};
  window.__zh = { state: () => ({ ...debugState }), ...api };
}
