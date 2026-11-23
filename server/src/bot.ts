// Headless bot clients for multiplayer and soak testing. They join a room, ready up and wander
// using the shared collision code. (They learn to fight in session 5.)
// Usage: npm run bot -- <ROOM> [count=1] [url=ws://localhost:8080/ws]
import { WebSocket } from 'ws';
import {
  CLIENT_MOVE_SEND_HZ, MoveState, PLAYER_RADIUS, PROTOCOL_VERSION, Rng, WALK_SPEED, compileMap, decodeServer, encode,
  harrowRidge, moveCircle, type ClientMsg, type ServerMsg,
} from '@zh/shared';

const map = compileMap(harrowRidge);

export class Bot {
  id = 0;
  x = 0;
  z = 0;
  yaw = 0;
  playing = false;
  corrections = 0;
  private readonly ws: WebSocket;
  private readonly rng: Rng;
  private readonly open = new Set<string>();
  private seq = 0;
  private turnIn = 0;
  private pauseFor = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(url: string, readonly name: string, private readonly room: string, seed: number) {
    this.rng = new Rng(seed);
    this.ws = new WebSocket(url);
    this.ws.on('open', () => this.send({ t: 'hello', v: PROTOCOL_VERSION, name }));
    this.ws.on('message', (data) => {
      const msg = decodeServer(data.toString());
      if (msg) this.onMessage(msg);
    });
    this.ws.on('close', () => this.stop());
    this.ws.on('error', (e) => console.error(`[bot ${name}]`, e.message));
  }

  private send(msg: ClientMsg): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(encode(msg));
  }

  private onMessage(msg: ServerMsg): void {
    switch (msg.t) {
      case 'welcome':
        this.id = msg.id;
        this.send({ t: 'join', code: this.room, name: this.name });
        break;
      case 'room':
        if (msg.phase === 'lobby' && !msg.players.find((p) => p.id === this.id)?.ready) this.send({ t: 'ready', ready: true });
        break;
      case 'sync':
        this.x = msg.self.x;
        this.z = msg.self.z;
        this.yaw = msg.self.yaw;
        this.open.clear();
        for (const d of msg.openDoors) this.open.add(d);
        if (!this.playing) {
          this.playing = true;
          this.timer = setInterval(() => this.step(1 / CLIENT_MOVE_SEND_HZ), 1000 / CLIENT_MOVE_SEND_HZ);
        }
        break;
      case 'correct':
        this.x = msg.x;
        this.z = msg.z;
        this.corrections++;
        break;
      case 'ev':
        for (const ev of msg.events) if (ev.e === 'doorOpened') this.open.add(ev.id);
        break;
      case 'error':
        console.error(`[bot ${this.name}] server error: ${msg.code}`);
        break;
      default:
        break;
    }
  }

  private step(dt: number): void {
    this.turnIn -= dt;
    if (this.turnIn <= 0) {
      this.turnIn = this.rng.range(1, 3.5);
      this.yaw += this.rng.range(-1.6, 1.6);
      this.pauseFor = this.rng.chance(0.2) ? this.rng.range(0.4, 1.2) : 0;
    }
    let state = MoveState.Idle;
    if (this.pauseFor > 0) this.pauseFor -= dt;
    else {
      const before = { x: this.x, z: this.z };
      const p = moveCircle(map, this.open, this.x, this.z, -Math.sin(this.yaw) * WALK_SPEED * dt, -Math.cos(this.yaw) * WALK_SPEED * dt, PLAYER_RADIUS);
      this.x = p.x;
      this.z = p.z;
      state = MoveState.Walk;
      // Blocked by a wall: pick a new heading soon.
      if (Math.hypot(p.x - before.x, p.z - before.z) < WALK_SPEED * dt * 0.5) this.turnIn = Math.min(this.turnIn, 0.15);
    }
    this.send({ t: 'move', seq: ++this.seq, x: this.x, z: this.z, yaw: this.yaw, pitch: 0, state });
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.playing = false;
    if (this.ws.readyState === WebSocket.OPEN) this.ws.close();
  }
}

// CLI entry
if (process.argv[1] && /bot\.(ts|js)$/.test(process.argv[1])) {
  const [room, count = '1', url = `ws://localhost:${process.env.PORT ?? 8080}/ws`] = process.argv.slice(2);
  if (!room) {
    console.error('usage: npm run bot -- <ROOM> [count] [ws url]');
    process.exit(1);
  }
  const bots = Array.from({ length: Number(count) }, (_, i) => new Bot(url, `Bot${i + 1}`, room.toUpperCase(), 1000 + i));
  console.log(`[bot] ${bots.length} bot(s) joining ${room.toUpperCase()} at ${url}`);
  process.on('SIGINT', () => {
    for (const b of bots) b.stop();
    process.exit(0);
  });
}
