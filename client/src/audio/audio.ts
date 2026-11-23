// The sound of the game as a whole: owns the audio context, hears every game event and decides
// what it sounds like and where, and each frame does the continuous things (feet, groans, air).
import {
  CELL_SIZE, FORGE_SECONDS, FLOOR_STYLES, MoveState, ZombieState, lineOfSight, weaponStats,
  type CompiledMap, type DoorSet, type FloorStyle, type GameEvent, type PowerupId, type ProjectileSnap, type SyncState,
} from '@zh/shared';
import { Ambience } from './ambience';
import { CATALOGUE } from './catalogue';
import { GunSounds } from './guns';
import { Music } from './music';
import { Sfx } from './sfx';
import { MAX_VOICES, Synth } from './synth';
import { RATE, Recorder, renderSound } from './tools';

type Spot = { x: number; z: number };

/** What the sounds need to know about the world; read when an event arrives. */
export interface AudioWorld {
  map: CompiledMap;
  openDoors: DoorSet;
  drips: readonly (readonly [number, number, number])[];
  selfId(): number;
  /** Where another player is drawn. */
  playerAt(id: number): Spot | null;
  entityAt(id: number): Spot | null;
  /** Planks on a barricade as currently shown. */
  planks(id: string): number;
}

export interface AudioFrame {
  dt: number;
  playing: boolean;
  alive: boolean;
  downed: boolean;
  /** The listener: the camera. */
  x: number;
  z: number;
  yaw: number;
  zone: string | null;
  power: boolean;
  /** Health as a fraction, and in points. */
  hp: number;
  hpNow: number;
  speed: number;
  sprinting: boolean;
  /** Footfalls taken so far (a running count; a step sounds when it passes a whole number). */
  stride: number;
  /** 0..1 through a held revive. */
  reviving: number;
  gameTime: number;
  entities: readonly { id: number; kind: string; x: number; z: number; state: number; gait: number }[];
  remotes: readonly { id: number; x: number; z: number; state: number; connected: boolean }[];
}

const STORE_KEY = 'zh_audio';
/** Metres between another player's footfalls. */
const REMOTE_STRIDE = 1.65;

export class GameAudio {
  readonly ctx: AudioContext;
  readonly synth: Synth;
  readonly guns: GunSounds;
  readonly sfx: Sfx;
  readonly music: Music;
  private readonly ambience: Ambience;
  private lastStride = 0;
  private groanT = 1;
  private reviveStep = 0;
  /** Our health when last seen, to tell a scratch from a mauling. */
  private hp = 100;
  private readonly states = new Map<number, number>();
  private readonly walked = new Map<number, { x: number; z: number; d: number }>();
  private readonly drops = new Map<number, Spot>();
  private readonly effects = new Map<PowerupId, number>();
  private projectiles: ProjectileSnap[] = [];
  private readonly loops = new Map<number, { t: number; y: number; falling: boolean }>();
  private readonly recorder = new Recorder();

  constructor(private readonly w: AudioWorld) {
    this.ctx = new AudioContext({ sampleRate: RATE, latencyHint: 'interactive' });
    this.synth = new Synth(this.ctx);
    this.guns = new GunSounds(this.synth);
    this.sfx = new Sfx(this.synth);
    this.music = new Music(this.synth);
    this.ambience = new Ambience(this.synth, this.sfx, w.map, w.drips);
    let lx = 0;
    let lz = 0;
    this.listenerAt = (x, z) => {
      lx = x;
      lz = z;
    };
    this.synth.occluded = (x, z) => !lineOfSight(w.map, lx, lz, x, z, w.openDoors);
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as Partial<Synth['volumes']>;
      for (const k of ['master', 'sfx', 'music'] as const) if (typeof saved[k] === 'number') this.synth.setVolume(k, saved[k]);
    } catch {
      // no storage, or nonsense in it: the defaults stand
    }
    // Browsers keep a context silent until the player has touched the page.
    const unlock = (): void => void this.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    document.addEventListener('click', (ev) => {
      if ((ev.target as HTMLElement | null)?.closest?.('button')) this.sfx.click();
    });
  }

  private readonly listenerAt: (x: number, z: number) => void;

  unlock(): Promise<void> {
    return this.ctx.state === 'suspended' ? this.ctx.resume() : Promise.resolve();
  }

  setVolume(which: 'master' | 'sfx' | 'music', v: number): void {
    this.synth.setVolume(which, v);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.synth.volumes));
    } catch {
      // not saved, then
    }
  }

  /** A fresh game (or a rejoin): forget what was sounding. */
  sync(m: SyncState): void {
    this.states.clear();
    this.walked.clear();
    this.loops.clear();
    this.drops.clear();
    this.effects.clear();
    for (const d of m.powerups) this.drops.set(d.id, d);
    for (const e of m.activeEffects) this.effects.set(e.kind, e.until);
  }

  setProjectiles(list: ProjectileSnap[]): void {
    this.projectiles = list;
  }

  private floorAt(x: number, z: number): FloorStyle {
    const { map } = this.w;
    return FLOOR_STYLES[map.floorStyle[map.idx(Math.floor(x / CELL_SIZE), Math.floor(z / CELL_SIZE))] ?? 0] ?? 'concrete';
  }

  private opening(id: string): Spot | undefined {
    const o = this.w.map.openingById(id);
    return o && { x: o.x + o.w / 2, z: o.z + o.d / 2 };
  }

  private thing(id: string | undefined): Spot | undefined {
    return this.w.map.def.interactables.find((i) => i.id === id);
  }

  /** Call for every game event *before* the game applies it (so the dead can still be found). */
  event(ev: GameEvent, gameTime: number): void {
    const me = this.w.selfId();
    const { sfx, guns, music } = this;
    switch (ev.e) {
      case 'fired': {
        const def = weaponStats(ev.weapon, false);
        const at = this.w.playerAt(ev.id);
        if (ev.id !== me && def && at) guns.shot(def, false, at);
        break;
      }
      case 'melee':
        if (ev.id !== me) guns.knife(false, this.w.playerAt(ev.id) ?? undefined);
        break;
      case 'zombieHit':
        if (ev.by === me) sfx.tick(ev.zone === 'head' ? 'head' : 'hit');
        else sfx.flesh(this.w.entityAt(ev.id) ?? undefined);
        break;
      case 'zombieDied': {
        const at = this.w.entityAt(ev.id);
        if (at) sfx.death(at, ev.id);
        if (ev.by === me) sfx.tick(ev.zone === 'head' ? 'headkill' : 'kill');
        this.states.delete(ev.id);
        break;
      }
      case 'zombieSpawn':
        if (ev.kind === 'howler') sfx.howl(ev, ev.seed);
        break;
      case 'strike':
        sfx.thunder(ev);
        break;
      case 'playerHurt':
        if (ev.id !== me) break;
        sfx.hurt(this.hp - ev.hp > 40);
        break;
      case 'playerDowned':
        if (ev.id === me) sfx.downed();
        else music.mateDown();
        break;
      case 'playerRevived':
        if (ev.id === me) sfx.revived();
        break;
      case 'roundStart':
        if (ev.special) music.roundSpecial();
        else music.roundStart(ev.round);
        break;
      case 'roundEnd':
        music.roundEnd();
        break;
      case 'gameOver':
        music.gameOver();
        break;
      case 'doorOpened':
        sfx.door(this.opening(ev.id), this.w.map.openingById(ev.id)?.style === 'debris');
        break;
      case 'barricade':
        if (ev.planks !== this.w.planks(ev.id)) sfx.plank(this.opening(ev.id), ev.planks < this.w.planks(ev.id));
        break;
      case 'powerOn':
        sfx.powerOn();
        music.powerChord();
        break;
      case 'denied':
        sfx.denied();
        break;
      case 'purchase': {
        const at = ev.id === me ? undefined : this.w.playerAt(ev.id) ?? undefined;
        if (ev.id !== me && !at) break;
        if (ev.what === 'perk') music.tonic(ev.ref, at);
        sfx.purchase(at);
        break;
      }
      case 'forge': {
        const at = this.w.map.def.interactables.find((i) => i.kind === 'forge');
        if (ev.state.phase === 'working') for (let i = 0; i < Math.floor(FORGE_SECONDS / 0.62); i++) sfx.anvil(at, i);
        else if (ev.state.phase === 'offering') music.forged(at);
        break;
      }
      case 'cache': {
        const at = this.thing(ev.state.site);
        const p = ev.state.phase;
        if (p === 'rolling') music.cacheRoll(at, Math.max(1, (ev.state.until ?? gameTime + 4) - gameTime), ev.state.by ?? 0);
        else if (p === 'offering') music.cacheOffer(at);
        else if (p === 'jinx') music.jinx(at);
        else if (p === 'moving') music.cacheLeave(at);
        break;
      }
      case 'cacheHome':
        music.cacheLand();
        break;
      case 'powerupDrop':
        this.drops.set(ev.drop.id, ev.drop);
        music.drop(ev.drop);
        break;
      case 'powerupExpired':
        music.dropGone(this.drops.get(ev.id));
        this.drops.delete(ev.id);
        break;
      case 'powerupTaken':
        this.drops.delete(ev.id);
        music.powerup(ev.kind);
        if (ev.until !== undefined) this.effects.set(ev.kind, ev.until);
        break;
      case 'explosion':
        guns.explosion(ev, ev.kind);
        break;
      case 'chain':
        ev.targets.slice(0, 4).forEach((id, n) => guns.arc(this.w.entityAt(id) ?? undefined, n));
        break;
      default:
        break;
    }
  }

  /** Once a frame. */
  frame(f: AudioFrame): void {
    const { sfx, guns } = this;
    this.synth.setListener(f.x, f.z, f.yaw);
    this.listenerAt(f.x, f.z);
    this.ambience.update(f.dt, f.zone, f.power, f.x, f.z, f.playing ? f.hp : 1, f.playing && f.downed);
    if (!f.playing) return;
    this.hp = f.hpNow;

    // Our own feet, in step with the bob of the view.
    const stride = Math.floor(f.stride);
    if (stride !== this.lastStride) {
      this.lastStride = stride;
      if (f.alive && f.speed > 1) sfx.step(this.floorAt(f.x, f.z), f.sprinting);
    }
    // Everyone else's, by the ground they cover.
    for (const r of f.remotes) {
      const w = this.walked.get(r.id);
      if (!w || !Number.isFinite(r.x)) {
        if (Number.isFinite(r.x)) this.walked.set(r.id, { x: r.x, z: r.z, d: 0 });
        continue;
      }
      const moved = Math.hypot(r.x - w.x, r.z - w.z);
      w.x = r.x;
      w.z = r.z;
      if (moved > 2 || !r.connected || r.state === MoveState.Downed || r.state === MoveState.Dead) continue;
      if ((w.d += moved) >= REMOTE_STRIDE) {
        w.d -= REMOTE_STRIDE;
        sfx.step(this.floorAt(r.x, r.z), r.state === MoveState.Sprint, r);
      }
    }

    // Zombies: a swing is heard when it starts; otherwise one of those nearby moans now and then.
    const near: AudioFrame['entities'][number][] = [];
    for (const e of f.entities) {
      if (e.kind === 'dummy') continue;
      const was = this.states.get(e.id);
      if (was !== e.state) {
        this.states.set(e.id, e.state);
        const swing = e.state === ZombieState.Attack || e.state === ZombieState.CrawlAttack;
        if (swing && was !== undefined) {
          if (e.kind === 'howler') sfx.bark(e);
          else sfx.attack(e, e.id);
        }
      }
      if (Math.hypot(e.x - f.x, e.z - f.z) < 30) near.push(e);
    }
    if ((this.groanT -= f.dt) <= 0 && near.length) {
      // The more of them, the more often, up to a point.
      this.groanT = (0.5 + Math.random() * 1.4) / Math.min(4, 0.6 + near.length * 0.25);
      const e = near[Math.floor(Math.random() * near.length)]!;
      if (e.kind === 'howler') sfx.bark(e);
      else sfx.groan(e, e.id, Math.max(0, Math.min(1, (e.gait - 2.2) / 2.6)));
    }

    // Things in flight: a grenade's bounce, a singularity's hum, a decoy's wail.
    for (const [id, kind, x, y, z] of this.projectiles) {
      let l = this.loops.get(id);
      if (!l) this.loops.set(id, (l = { t: 0, y, falling: false }));
      const at = { x, z };
      if (kind === 'well' || kind === 'siren') {
        if ((l.t -= f.dt) <= 0) {
          l.t = kind === 'well' ? 0.45 : 0.85;
          if (kind === 'well') guns.wellHum(at);
          else guns.sirenWail(at);
        }
      } else if (kind !== 'orb') {
        const falling = y < l.y - 0.001;
        if (l.falling && !falling && y < 0.5 && y !== l.y) guns.clink(at);
        if (y !== l.y) l.falling = falling;
      }
      l.y = y;
    }
    if (this.loops.size > this.projectiles.length) for (const id of this.loops.keys()) if (!this.projectiles.some((p) => p[0] === id)) this.loops.delete(id);

    for (const [kind, until] of this.effects) {
      if (until > f.gameTime) continue;
      this.effects.delete(kind);
      this.music.effectEnd();
    }

    // A revive being held: a rising tick every third of the way.
    const step = Math.floor(f.reviving * 6);
    if (step !== this.reviveStep) {
      this.reviveStep = step;
      if (step > 0) sfx.reviveTick(step);
    }
  }

  /** For tests and the debug overlay. */
  get stats(): { state: string; voices: number; max: number; played: number; dropped: number; stolen: number; peak: number; volumes: Synth['volumes'] } {
    return { state: this.ctx.state, voices: this.synth.active, max: MAX_VOICES, ...this.synth.stats, volumes: { ...this.synth.volumes } };
  }

  /** The names in the catalogue. */
  names(): string[] {
    return CATALOGUE.map((c) => c.name);
  }

  /** Play a catalogue sound now. */
  play(name: string): boolean {
    const entry = CATALOGUE.find((c) => c.name === name);
    entry?.play(this);
    return !!entry;
  }

  /** Render a catalogue sound offline (see `tools.ts`). */
  render(name: string, pcm = false): ReturnType<typeof renderSound> {
    return renderSound(name, pcm);
  }

  /** Start recording what is heard (`true`), or stop and get it back as a base64 WebM (`false`). */
  record(on: boolean): Promise<string> {
    return on ? this.recorder.start(this.ctx, this.synth.out) : this.recorder.stop();
  }
}
