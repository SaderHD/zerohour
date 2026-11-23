// Headless bot clients for multiplayer and soak testing. They join (or create) a room, ready up,
// walk around the map and shoot the zombies they can see.
// Usage: npm run bot -- <ROOM> [count=1] [url=ws://localhost:8080/ws]
import { WebSocket } from 'ws';
import {
  CLIENT_MOVE_SEND_HZ, MoveState, PROTOCOL_VERSION, Rng, START_WEAPON, compileMap, decodeServer, encode, fireInterval, harrowRidge,
  weaponDef, type ClientMsg, type EntityId, type ServerMsg,
} from '@zh/shared';
import { BotBrain, type BotTarget } from './botBrain';

const map = compileMap(harrowRidge);
const gun = weaponDef(START_WEAPON)!;
/** Share of shots that connect. */
const ACCURACY = 0.7;

export interface BotOpts {
  /** Create the room (debug servers honour the code) and start once `expect` players are ready. */
  create?: boolean;
  expect?: number;
  /** Sent after spawning, e.g. god mode for soak tests. */
  onPlaying?: (send: (msg: ClientMsg) => void) => void;
}

export class Bot {
  id = 0;
  playing = false;
  corrections = 0;
  shots = 0;
  readonly brain: BotBrain;
  private readonly ws: WebSocket;
  private readonly rng: Rng;
  private readonly open = new Set<string>();
  private readonly zombies = new Map<EntityId, BotTarget>();
  private seq = 0;
  private fireSeq = 0;
  private mag = gun.magSize;
  private reserve = gun.reserve;
  private cooldown = 0;
  private reloading = 0;
  /** Downed or dead bots lie still. */
  private standing = true;
  private timer: NodeJS.Timeout | null = null;

  constructor(url: string, readonly name: string, private readonly room: string, seed: number, private readonly opts: BotOpts = {}) {
    this.rng = new Rng(seed);
    this.brain = new BotBrain(map, this.rng);
    this.ws = new WebSocket(url);
    this.ws.on('open', () => this.send({ t: 'hello', v: PROTOCOL_VERSION, name }));
    this.ws.on('message', (data) => {
      const msg = decodeServer(data.toString());
      if (msg) this.onMessage(msg);
    });
    this.ws.on('close', () => this.stop());
    this.ws.on('error', (e) => console.error(`[bot ${name}]`, e.message));
  }

  get x(): number {
    return this.brain.x;
  }

  get z(): number {
    return this.brain.z;
  }

  private send(msg: ClientMsg): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(encode(msg));
  }

  private onMessage(msg: ServerMsg): void {
    switch (msg.t) {
      case 'welcome':
        this.id = msg.id;
        this.send(this.opts.create ? { t: 'create', name: this.name, code: this.room } : { t: 'join', code: this.room, name: this.name });
        break;
      case 'room': {
        if (msg.phase !== 'lobby') break;
        const me = msg.players.find((p) => p.id === this.id);
        if (me && !me.ready) this.send({ t: 'ready', ready: true });
        else if (me?.host && this.opts.create && msg.players.length >= (this.opts.expect ?? 1) && msg.players.every((p) => p.ready)) this.send({ t: 'start' });
        break;
      }
      case 'sync':
        this.brain.place(msg.self.x, msg.self.z, msg.self.yaw);
        this.open.clear();
        for (const d of msg.openDoors) this.open.add(d);
        this.zombies.clear();
        for (const z of msg.zombies) if (z.kind !== 'dummy') this.zombies.set(z.id, { id: z.id, x: z.x, z: z.z });
        if (!this.playing) {
          this.playing = true;
          this.opts.onPlaying?.((m) => this.send(m));
          this.timer = setInterval(() => this.step(1 / CLIENT_MOVE_SEND_HZ), 1000 / CLIENT_MOVE_SEND_HZ);
        }
        break;
      case 'correct':
        this.brain.place(msg.x, msg.z);
        this.corrections++;
        break;
      case 'snap': {
        const me = msg.players.find((p) => p[0] === this.id);
        this.standing = !me || (me[5] !== MoveState.Downed && me[5] !== MoveState.Dead);
        for (const [id, x, z] of msg.zombies) {
          const zb = this.zombies.get(id);
          if (zb) {
            zb.x = x;
            zb.z = z;
          }
        }
        // Trust the server's count once it has seen our last shot and no reload is under way.
        if (msg.ammo[0] === this.fireSeq && this.reloading <= 0) [, , this.mag, this.reserve] = msg.ammo;
        break;
      }
      case 'ev':
        for (const ev of msg.events) {
          if (ev.e === 'doorOpened') this.open.add(ev.id);
          else if (ev.e === 'zombieSpawn' && ev.kind !== 'dummy') this.zombies.set(ev.id, { id: ev.id, x: ev.x, z: ev.z });
          else if (ev.e === 'zombieDied') this.zombies.delete(ev.id);
          else if (ev.e === 'playerSpawned' && ev.id === this.id) this.brain.place(ev.x, ev.z);
        }
        break;
      case 'error':
        console.error(`[bot ${this.name}] server error: ${msg.code}`);
        break;
      default:
        break;
    }
  }

  private step(dt: number): void {
    const b = this.brain;
    if (!this.standing) return;
    b.step(dt, this.zombies.values(), this.open);
    this.send({ t: 'move', seq: ++this.seq, x: b.x, z: b.z, yaw: b.yaw, pitch: 0, state: b.state });
    this.cooldown -= dt;
    if (this.reloading > 0 && (this.reloading -= dt) <= 0) {
      // Predict the result, as the real client does; snapshots confirm it afterwards.
      const take = Math.min(gun.magSize - this.mag, this.reserve);
      this.mag += take;
      this.reserve -= take;
    }
    if (this.reloading > 0 || this.cooldown > 0) return;
    if (this.mag <= 0) {
      // Reload; a bot that has run dry asks a debug server for a fresh pistol.
      if (this.reserve <= 0) {
        this.send({ t: 'debug', cmd: 'give', weapon: START_WEAPON });
        this.reserve = gun.reserve;
      }
      this.send({ t: 'reload' });
      this.reloading = gun.reloadTime + 0.2;
      return;
    }
    if (!b.aim) return;
    this.cooldown = fireInterval(gun) * this.rng.range(1.5, 3);
    this.mag--;
    this.shots++;
    const hits = this.rng.chance(ACCURACY) ? [{ id: b.aim.id, zone: this.rng.chance(0.15) ? 'head' as const : 'torso' as const, dist: b.aim.dist }] : [];
    this.send({ t: 'fire', seq: ++this.fireSeq, slot: 0, yaw: b.yaw, pitch: 0, aim: false, hits });
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
