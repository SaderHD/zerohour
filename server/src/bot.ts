// Computer-run players for multiplayer, soak and balance testing. `BotPlayer` is one player with
// no socket: it reads the server's messages, asks the shared `BotMind` what to do and answers with
// the same messages a browser sends. `Bot` puts one on a WebSocket (join or create a room, ready up).
// Usage: npm run bot -- <ROOM> [count=1] [url=ws://localhost:8080/ws]
import { WebSocket } from 'ws';
import {
  BotMind, CLIENT_MOVE_SEND_HZ, FLOOR_GAP, KNIFE_COOLDOWN, MoveState, PLAYER_MAX_HP, PLAYER_RADIUS, PROTOCOL_VERSION, Rng, SPRINT_SPEED, STAMINA_REGEN_DELAY, STAMINA_SECONDS,
  SWAP_SECONDS, WALK_SPEED, ZombieState, compileMap, decodeServer, encode, fireInterval, fireRateMultWith, mapById, maxHpWith, moveCircle,
  reloadMultWith, speedMultWith, staminaWith, weaponStats,
  type BotIntent, type BotTarget, type CacheState, type ClientMsg, type FireHit, type ForgeState, type GameEvent, type PlayerPublic, type ServerMsg, type WeaponState,
} from '@zh/shared';

const map = compileMap(mapById(process.env.ZH_MAP));
/** Seconds between presses of F. */
const USE_EVERY = 0.6;
/** Closest a player's centre gets to a zombie's. */
const BODY_GAP = 0.6;

export interface BotSkill {
  /** Share of shots that land at close range; it falls off with distance. */
  accuracy: number;
  /** Share of those that find the head. */
  head: number;
}

const DEFAULT_SKILL: BotSkill = { accuracy: 0.75, head: 0.2 };

interface Mate {
  id: number;
  x: number;
  y: number;
  z: number;
  state: MoveState;
  downed: boolean;
}

export class BotPlayer {
  x = 0;
  y = 0;
  z = 0;
  yaw = 0;
  hp = PLAYER_MAX_HP;
  state: MoveState = MoveState.Idle;
  pub: PlayerPublic | null = null;
  playing = false;
  over = false;
  round = 0;
  corrections = 0;
  shots = 0;
  /** What it last decided, for logs. */
  intent: BotIntent | null = null;
  readonly mind: BotMind;
  private readonly rng: Rng;
  private readonly open = new Set<string>();
  private readonly zombies = new Map<number, BotTarget & { inside?: boolean }>();
  private readonly mates = new Map<number, Mate>();
  private readonly connected = new Map<number, boolean>();
  private readonly drops = new Map<number, { x: number; y: number; z: number }>();
  private weapons: WeaponState[] = [];
  private slot = 0;
  private power = false;
  private forge: ForgeState = { phase: 'idle' };
  private cacheHome = '';
  private readonly boxes = new Map<string, CacheState>();
  private time = 0;
  private seq = 0;
  private fireSeq = 0;
  private cooldown = 0;
  private reloadLeft = 0;
  private knifeAt = 0;
  private useAt = 0;
  private reviving = 0;
  private reviveAt = 0;
  private stamina = STAMINA_SECONDS;
  private sinceSprint = 0;

  constructor(readonly id: number, seed: number, private readonly send: (msg: ClientMsg) => void, private readonly skill: BotSkill = DEFAULT_SKILL) {
    this.rng = new Rng(seed);
    this.mind = new BotMind(map, this.rng.fork(), id);
  }

  private get perks(): readonly string[] {
    return this.pub?.perks ?? [];
  }

  private place(x: number, y: number, z: number): void {
    this.x = x;
    this.y = y;
    this.z = z;
    this.mind.reset();
  }

  private adopt(pub: PlayerPublic): void {
    this.pub = pub;
    this.weapons = pub.weapons.map((w) => ({ ...w }));
    this.slot = pub.slot;
  }

  onMessage(msg: ServerMsg): void {
    switch (msg.t) {
      case 'sync':
        this.place(msg.self.x, msg.self.y, msg.self.z);
        this.yaw = msg.self.yaw;
        this.open.clear();
        for (const d of msg.openDoors) this.open.add(d);
        this.zombies.clear();
        for (const z of msg.zombies) if (z.kind !== 'dummy') this.zombies.set(z.id, { id: z.id, x: z.x, y: z.y, z: z.z });
        this.drops.clear();
        for (const d of msg.powerups) this.drops.set(d.id, d);
        this.connected.clear();
        for (const p of msg.players) {
          this.connected.set(p.id, p.connected);
          if (p.id === this.id) this.adopt(p);
        }
        this.power = msg.power;
        this.forge = msg.forge;
        this.cacheHome = msg.cache.home;
        this.boxes.clear();
        for (const b of msg.cache.boxes) this.boxes.set(b.site, b);
        this.round = msg.round;
        this.over = msg.over;
        this.playing = true;
        break;
      case 'correct':
        this.place(msg.x, msg.y, msg.z);
        this.corrections++;
        break;
      case 'snap':
        this.mates.clear();
        for (const [id, x, z, , , state, hp, , y] of msg.players) {
          if (id === this.id) {
            this.state = state;
            this.hp = hp;
          } else if (state !== MoveState.Dead && this.connected.get(id) !== false) this.mates.set(id, { id, x, y, z, state, downed: state === MoveState.Downed });
        }
        for (const [id, x, z, , zs, , , y] of msg.zombies) {
          const zb = this.zombies.get(id);
          if (zb) {
            zb.x = x;
            zb.y = y;
            zb.z = z;
            zb.inside = zs !== ZombieState.Approach && zs !== ZombieState.Tear && zs !== ZombieState.Vault;
          }
        }
        // Trust the server's count once it has seen our last shot and no reload is under way.
        if (msg.ammo[0] === this.fireSeq && this.reloadLeft <= 0 && msg.ammo[1] === this.slot && this.weapons[this.slot]) {
          this.weapons[this.slot]!.mag = msg.ammo[2];
          this.weapons[this.slot]!.reserve = msg.ammo[3];
        }
        break;
      case 'ev':
        for (const ev of msg.events) this.onEvent(ev);
        break;
      default:
        break;
    }
  }

  private onEvent(ev: GameEvent): void {
    switch (ev.e) {
      case 'player':
        this.connected.set(ev.player.id, ev.player.connected);
        if (ev.player.id === this.id) this.adopt(ev.player);
        break;
      case 'playerLeft':
        this.connected.delete(ev.id);
        break;
      case 'doorOpened':
        this.open.add(ev.id);
        break;
      case 'zombieSpawn':
        if (ev.kind !== 'dummy') this.zombies.set(ev.id, { id: ev.id, x: ev.x, y: ev.y, z: ev.z });
        break;
      case 'zombieDied':
        this.zombies.delete(ev.id);
        break;
      case 'playerSpawned':
        if (ev.id === this.id) this.place(ev.x, ev.y, ev.z);
        break;
      case 'powerOn':
        this.power = true;
        break;
      case 'forge':
        this.forge = ev.state;
        break;
      case 'cache':
        if (ev.state.phase === 'idle') this.boxes.delete(ev.state.site);
        else this.boxes.set(ev.state.site, ev.state);
        break;
      case 'cacheHome':
        this.cacheHome = ev.site;
        break;
      case 'powerupDrop':
        this.drops.set(ev.drop.id, ev.drop);
        break;
      case 'powerupTaken':
      case 'powerupExpired':
        this.drops.delete(ev.id);
        break;
      case 'roundStart':
        this.round = ev.round;
        break;
      case 'gameOver':
        this.over = true;
        break;
      default:
        break;
    }
  }

  /** Its claim for one pull of the trigger: which pellets found the target, and where. */
  private hits(aim: BotTarget & { dist: number }, pellets: number, range: number): FireHit[] {
    const hits: FireHit[] = [];
    const far = pellets > 1 && aim.dist > range * 0.4 ? 0.5 : 1;
    const chance = Math.max(0.25, this.skill.accuracy - 0.02 * Math.max(0, aim.dist - 5)) * far;
    for (let i = 0; i < pellets; i++) {
      if (!this.rng.chance(chance)) continue;
      const roll = this.rng.next();
      hits.push({ id: aim.id, zone: roll < this.skill.head ? 'head' : roll < this.skill.head + 0.2 ? 'limb' : 'torso', dist: aim.dist });
    }
    return hits;
  }

  step(dt: number): void {
    if (!this.playing || this.over || !this.pub) return;
    this.time += dt;
    const life = this.state === MoveState.Dead ? 'dead' : this.state === MoveState.Downed ? 'downed' : 'alive';
    const perks = this.perks;
    const it = this.mind.think({
      time: this.time, id: this.id, x: this.x, y: this.y, z: this.z, hp: this.hp, maxHp: maxHpWith(perks), life, points: this.pub.points,
      weapons: this.weapons, slot: this.slot, perks, reloading: this.reloadLeft > 0, zombies: this.zombies.values(), mates: this.mates.values(),
      drops: this.drops.values(), open: this.open, power: this.power, solo: this.mates.size === 0, forge: this.forge,
      cache: { home: this.cacheHome, boxes: this.boxes.values() },
    });
    this.intent = it;
    if (life === 'dead') return;
    const w = this.weapons[this.slot];
    const stats = w && weaponStats(w.id, w.upgraded);

    // Legs.
    let state = MoveState.Idle;
    const moving = life === 'alive' && (it.moveX !== 0 || it.moveZ !== 0);
    const sprint = moving && it.sprint && this.stamina > 0;
    if (sprint) {
      this.stamina -= dt;
      this.sinceSprint = 0;
    } else if ((this.sinceSprint += dt) >= STAMINA_REGEN_DELAY) this.stamina = Math.min(staminaWith(perks), this.stamina + dt);
    if (moving) {
      const speed = (sprint ? SPRINT_SPEED : WALK_SPEED) * (stats?.moveSpeedMult ?? 1) * speedMultWith(perks);
      let p = moveCircle(map, this.open, this.x, this.y, this.z, it.moveX * speed * dt, it.moveZ * speed * dt, PLAYER_RADIUS);
      // Bodies are in the way, as they are for a player at a screen (client/src/game/localPlayer.ts).
      for (const zb of this.zombies.values()) {
        if (!zb.inside || Math.abs(zb.y - p.y) >= FLOOR_GAP) continue;
        const ox = p.x - zb.x;
        const oz = p.z - zb.z;
        const d = Math.hypot(ox, oz);
        if (d >= BODY_GAP || d < 1e-4) continue;
        p = moveCircle(map, this.open, p.x, p.y, p.z, (ox / d) * (BODY_GAP - d), (oz / d) * (BODY_GAP - d), PLAYER_RADIUS);
      }
      this.x = p.x;
      this.y = p.y;
      this.z = p.z;
      state = sprint ? MoveState.Sprint : MoveState.Walk;
    }
    const face = it.aim ?? it.look;
    if (face) this.yaw = Math.atan2(-(face.x - this.x), -(face.z - this.z));
    else if (moving) this.yaw = Math.atan2(-it.moveX, -it.moveZ);
    this.send({ t: 'move', seq: ++this.seq, x: this.x, y: this.y, z: this.z, yaw: this.yaw, pitch: 0, state });

    // Hands.
    if (it.revive !== this.reviving || (it.revive && this.time >= this.reviveAt)) {
      if (this.reviving && it.revive !== this.reviving) this.send({ t: 'revive', target: this.reviving, hold: false });
      if (it.revive) this.send({ t: 'revive', target: it.revive, hold: true });
      this.reviving = it.revive;
      this.reviveAt = this.time + 0.5;
    }
    if (it.use && this.time >= this.useAt) {
      this.useAt = this.time + USE_EVERY;
      this.send({ t: 'interact', id: it.use, hold: true });
    }
    if (it.melee && this.time >= this.knifeAt) {
      this.knifeAt = this.time + KNIFE_COOLDOWN + 0.05;
      this.send({ t: 'melee', hit: it.melee });
    }
    this.cooldown -= dt;
    if (this.reloadLeft > 0 && (this.reloadLeft -= dt) <= 0 && w && stats) {
      // Predict the result, as the real client does; snapshots confirm it afterwards.
      const take = Math.min(stats.magSize - w.mag, w.reserve);
      w.mag += take;
      w.reserve -= take;
    }
    if (it.swap >= 0 && it.swap !== this.slot && this.weapons[it.swap]) {
      this.slot = it.swap;
      this.reloadLeft = 0;
      this.cooldown = SWAP_SECONDS + 0.1;
      this.send({ t: 'swap', slot: it.swap });
      return;
    }
    if (!w || !stats || this.reloadLeft > 0) return;
    if (it.reload) {
      this.send({ t: 'reload' });
      this.reloadLeft = stats.reloadTime * reloadMultWith(perks) + 0.2;
      return;
    }
    if (!it.fire || !it.aim || this.cooldown > 0 || w.mag <= 0) return;
    const interval = fireInterval(stats, fireRateMultWith(perks));
    // An automatic keeps its rate; a finger on a trigger is slower and less even.
    this.cooldown = stats.auto ? Math.max(this.cooldown + interval, 0) : Math.max(0.16, interval * this.rng.range(1.2, 1.9));
    w.mag--;
    this.shots++;
    this.send({ t: 'fire', seq: ++this.fireSeq, slot: this.slot, yaw: this.yaw, pitch: 0, aim: false, hits: this.hits(it.aim, stats.pellets, stats.range) });
  }
}

export interface BotOpts {
  /** Create the room (debug servers honour the code) and start once `expect` players are ready. */
  create?: boolean;
  expect?: number;
  /** Sent after spawning, e.g. god mode for soak tests. */
  onPlaying?: (send: (msg: ClientMsg) => void) => void;
  /** Wander the station when there is nothing to buy. */
  roam?: boolean;
}

export class Bot {
  id = 0;
  player: BotPlayer | null = null;
  private readonly ws: WebSocket;
  private timer: NodeJS.Timeout | null = null;

  constructor(url: string, readonly name: string, private readonly room: string, private readonly seed: number, private readonly opts: BotOpts = {}) {
    this.ws = new WebSocket(url);
    this.ws.on('open', () => this.send({ t: 'hello', v: PROTOCOL_VERSION, name }));
    this.ws.on('message', (data) => {
      const msg = decodeServer(data.toString());
      if (msg) this.onMessage(msg);
    });
    this.ws.on('close', () => this.stop());
    this.ws.on('error', (e) => console.error(`[bot ${name}]`, e.message));
  }

  get playing(): boolean {
    return this.player?.playing ?? false;
  }

  get shots(): number {
    return this.player?.shots ?? 0;
  }

  get corrections(): number {
    return this.player?.corrections ?? 0;
  }

  private send(msg: ClientMsg): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(encode(msg));
  }

  private onMessage(msg: ServerMsg): void {
    switch (msg.t) {
      case 'welcome':
        this.id = msg.id;
        this.player = new BotPlayer(msg.id, this.seed, (m) => this.send(m));
        this.player.mind.roam = this.opts.roam === true;
        this.send(this.opts.create ? { t: 'create', name: this.name, code: this.room } : { t: 'join', code: this.room, name: this.name });
        break;
      case 'room': {
        if (msg.phase === 'gameover' && this.player) this.player.playing = false;
        if (msg.phase !== 'lobby') break;
        if (this.player) this.player.playing = false;
        const me = msg.players.find((p) => p.id === this.id);
        if (me && !me.ready) this.send({ t: 'ready', ready: true });
        else if (me?.host && this.opts.create && msg.players.length >= (this.opts.expect ?? 1) && msg.players.every((p) => p.ready)) this.send({ t: 'start' });
        break;
      }
      case 'sync': {
        const fresh = !this.playing;
        this.player?.onMessage(msg);
        if (fresh) this.opts.onPlaying?.((m) => this.send(m));
        this.timer ??= setInterval(() => this.player?.step(1 / CLIENT_MOVE_SEND_HZ), 1000 / CLIENT_MOVE_SEND_HZ);
        break;
      }
      case 'error':
        console.error(`[bot ${this.name}] server error: ${msg.code}`);
        break;
      default:
        this.player?.onMessage(msg);
        break;
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.player) this.player.playing = false;
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
