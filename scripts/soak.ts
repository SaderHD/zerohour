// Real-time soak: an in-process server, four WebSocket bots and a full horde.
// Usage: npm run soak -- [seconds=300] [--shut]   (--shut keeps the doors closed)
// Fails if a zombie goes ZOMBIE_IDLE_LIMIT seconds without getting anywhere, or the tick is slow.
import { WebSocketServer } from 'ws';
import { MAX_ALIVE_CAP, Rng, TICK_BUDGET_MS, ZOMBIE_BASE_HP, ZOMBIE_SPEED_RUN, ZOMBIE_SPEED_SHAMBLE, ZOMBIE_SPEED_WALK } from '@zh/shared';
import { Bot } from '../server/src/bot';
import { Connection } from '../server/src/connection';
import { zombieCount } from '../server/src/game/spawner';
import { idleFor } from '../server/src/game/zombies';
import { Lobby } from '../server/src/lobby';

const IDLE_LIMIT = 10;
const args = process.argv.slice(2);
const seconds = Number(args.find((a) => /^\d+$/.test(a)) ?? 300);
const shut = args.includes('--shut');
const port = 21080 + Math.floor(Math.random() * 900);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const wss = new WebSocketServer({ port, path: '/ws' });
const lobby = new Lobby({ debug: true });
wss.on('connection', (socket) => new Connection(socket, lobby));

const url = `ws://localhost:${port}/ws`;
const god = (send: (m: { t: 'debug'; cmd: 'god'; on: boolean }) => void) => send({ t: 'debug', cmd: 'god', on: true });
const bots = [new Bot(url, 'Bot1', 'SOAK', 1, { create: true, expect: 4, onPlaying: god })];
await sleep(300);
for (let i = 2; i <= 4; i++) bots.push(new Bot(url, `Bot${i}`, 'SOAK', i, { onPlaying: god }));

let game = lobby.rooms.get('SOAK')?.game ?? null;
for (let i = 0; i < 50 && !game; i++) {
  await sleep(100);
  game = lobby.rooms.get('SOAK')?.game ?? null;
}
if (!game) throw new Error('the bots never started a game');
if (!shut) for (const o of game.map.def.openings) if (o.kind === 'door') game.openDoor(o.id, 1);
game.spawnInterval = 0.5;

const rng = new Rng(5);
const speeds = [ZOMBIE_SPEED_SHAMBLE, ZOMBIE_SPEED_WALK, ZOMBIE_SPEED_RUN];
let worstIdle = 0;
let worst = '';
let peak = 0;
const zones = new Set<string>();
const began = Date.now();
let nextLog = 30;
console.log(`[soak] ${seconds} s, doors ${shut ? 'shut' : 'open'}, ${bots.length} bots`);
while (Date.now() - began < seconds * 1000) {
  await sleep(250);
  while (zombieCount(game) + game.spawnQueue.length < MAX_ALIVE_CAP) game.spawnQueue.push({ hp: ZOMBIE_BASE_HP, speed: rng.pick(speeds) });
  peak = Math.max(peak, zombieCount(game));
  for (const z of game.zombies.values()) {
    const idle = idleFor(game, z);
    if (idle > worstIdle) {
      worstIdle = idle;
      worst = `zombie ${z.id} in state ${z.state} at (${z.x.toFixed(1)}, ${z.z.toFixed(1)})`;
    }
    const zone = game.map.zoneAt(z.x, z.z);
    if (zone) zones.add(zone);
  }
  const t = Math.floor((Date.now() - began) / 1000);
  if (t >= nextLog) {
    nextLog += 30;
    console.log(`[soak] ${t} s: ${zombieCount(game)} alive, worst idle ${worstIdle.toFixed(1)} s, tick ${game.stats.tickMs.toFixed(2)} ms avg / ${game.stats.tickMsMax.toFixed(1)} ms max`);
  }
}

const shots = bots.reduce((n, b) => n + b.shots, 0);
const { stats } = game;
console.log(
  `[soak] done: peak ${peak} alive, zones ${[...zones].sort().join(' ')}; worst idle ${worstIdle.toFixed(1)} s (${worst || 'none'}); ` +
  `bots fired ${shots} shots, ${game.nextEntityId} entities spawned, ${bots.reduce((n, b) => n + b.corrections, 0)} corrections; ` +
  `tick ${stats.tickMs.toFixed(2)} ms avg, ${stats.tickMsMax.toFixed(1)} ms max, ${stats.overBudget}/${stats.ticks} over ${TICK_BUDGET_MS} ms`,
);
const failures: string[] = [];
if (peak < MAX_ALIVE_CAP) failures.push(`only ${peak} zombies alive at once`);
if (worstIdle >= IDLE_LIMIT) failures.push(`a zombie was idle for ${worstIdle.toFixed(1)} s: ${worst}`);
if (stats.tickMs >= TICK_BUDGET_MS) failures.push(`average tick ${stats.tickMs.toFixed(2)} ms`);
if (stats.overBudget > stats.ticks * 0.01) failures.push(`${stats.overBudget} ticks over ${TICK_BUDGET_MS} ms`);
if (shots === 0) failures.push('the bots never fired');
for (const f of failures) console.error(`[soak] FAILED: ${f}`);
for (const b of bots) b.stop();
wss.close();
process.exit(failures.length ? 1 : 0);
