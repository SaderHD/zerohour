import { BotMind, MoveState, PLAYER_EYE_HEIGHT, Rng, maxHpWith, type BotIntent, type CacheState, type CompiledMap, type ForgeState, type PerkId } from '@zh/shared';
import type { Input } from '../input/input';
import type { Entities } from './entities';
import type { LocalPlayer } from './localPlayer';
import type { RemotePlayers } from './remotePlayers';
import type { LocalWeapons } from './weapons';

/** What the autopilot reads of the game; each is asked fresh. */
export interface AutopilotWorld {
  id(): number;
  hp(): number;
  life(): 'alive' | 'downed' | 'dead';
  points(): number;
  perks(): readonly PerkId[];
  power(): boolean;
  forge(): ForgeState;
  openDoors: ReadonlySet<string>;
  drops(): { x: number; y: number; z: number }[];
  cacheHome(): string;
  cacheAt(site: string): CacheState | null;
}

const THINK_EVERY = 0.05;
const USE_EVERY = 0.6;
/** A finger on a trigger: taps a second for a gun that is not automatic. */
const TRIGGER_EVERY = 0.2;
const ZOMBIE_DYING = 6;
const SIGHTS_BEYOND = 5;

/**
 * A computer at the controls (`?auto=1`, `__zh.auto(true)`): the shared `BotMind` decides, and this
 * turns its wishes into the same key presses, looks and steps a person makes, so every shot, reload,
 * prompt and purchase goes through the real client code. For the acceptance run and soak tests.
 */
export class Autopilot {
  on = false;
  /** What it is after, for the debug state. */
  goal = '';
  private readonly mind: BotMind;
  private readonly sites: string[];
  private intent: BotIntent | null = null;
  private time = 0;
  private thinkAt = 0;
  private tapAt = 0;
  private useAt = 0;
  private triggerAt = 0;
  private readonly taps: string[] = [];
  private readonly held = new Set<string>();

  constructor(
    map: CompiledMap, private readonly player: LocalPlayer, private readonly input: Input, private readonly entities: Entities,
    private readonly remotes: RemotePlayers, private readonly weapons: LocalWeapons, private readonly world: AutopilotWorld,
  ) {
    this.mind = new BotMind(map, new Rng((Math.random() * 0xffffffff) >>> 0), Math.floor(Math.random() * 4));
    this.sites = map.def.interactables.filter((i) => i.kind === 'cacheSite').map((i) => i.id);
  }

  private hold(code: string, down: boolean): void {
    if (down) this.held.add(code);
    else this.held.delete(code);
    // Ask the input itself: it drops every key when the window loses focus.
    if (down !== this.input.down(code)) this.input.setKey(code, down);
  }

  private tap(code: string): void {
    this.input.setKey(code, true);
    this.taps.push(code);
  }

  private letGo(): void {
    for (const code of this.held) this.input.setKey(code, false);
    this.held.clear();
    this.player.wish = null;
    this.intent = null;
  }

  /** Call once a frame, before the weapons and the player read the input. */
  update(dt: number, active: boolean): void {
    for (const code of this.taps) if (!this.held.has(code)) this.input.setKey(code, false);
    this.taps.length = 0;
    if (!this.on || !active) {
      if (this.intent) this.letGo();
      return;
    }
    const { player, world, weapons } = this;
    this.time += dt;
    const life = world.life();
    if (this.time >= this.thinkAt || !this.intent) {
      this.thinkAt = this.time + THINK_EVERY;
      const id = world.id();
      const perks = world.perks();
      const boxes: CacheState[] = [];
      for (const site of this.sites) {
        const s = world.cacheAt(site);
        if (s && s.phase !== 'idle') boxes.push(s);
      }
      const mates = this.remotes.list().filter((r) => r.connected && Number.isFinite(r.x) && r.state !== MoveState.Dead);
      this.intent = this.mind.think({
        time: this.time, id, x: player.x, y: player.y, z: player.z, hp: world.hp(), maxHp: maxHpWith(perks), life, points: world.points(),
        weapons: weapons.slots, slot: weapons.slot, perks, reloading: weapons.reloading,
        zombies: this.entities.list().filter((e) => e.kind !== 'dummy' && e.state !== ZOMBIE_DYING && e.hp > 0),
        mates: mates.map((r) => ({ id: r.id, x: r.x, y: r.y, z: r.z, downed: r.state === MoveState.Downed })),
        drops: world.drops(), open: world.openDoors, power: world.power(), solo: mates.length === 0, forge: world.forge(),
        cache: { home: world.cacheHome(), boxes },
      });
      this.goal = this.intent.goal;
    }
    const it = this.intent;

    // Legs and eyes.
    const moving = life === 'alive' && (it.moveX !== 0 || it.moveZ !== 0);
    player.wish = moving ? { x: it.moveX, z: it.moveZ, sprint: it.sprint } : { x: 0, z: 0, sprint: false };
    let lx = NaN;
    let ly = 1.3;
    let lz = NaN;
    if (it.aim) {
      // For the head, as anyone who has played a while does.
      const head = this.entities.head(it.aim.id);
      lx = head?.x ?? it.aim.x;
      lz = head?.z ?? it.aim.z;
      ly = head?.y ?? 1.2;
    } else if (it.look) {
      lx = it.look.x;
      lz = it.look.z;
    }
    if (Number.isFinite(lx)) {
      const dx = lx - player.x;
      const dz = lz - player.z;
      const eye = life === 'downed' ? 0.55 : PLAYER_EYE_HEIGHT;
      player.yaw = Math.atan2(-dx, -dz);
      // Hold the muzzle down against the climb, as a hand does.
      player.pitch = Math.atan2(ly - eye, Math.hypot(dx, dz)) - (it.aim ? player.viewPitch - player.pitch : 0);
    } else if (moving) {
      player.yaw = Math.atan2(-it.moveX, -it.moveZ);
      player.pitch = 0;
    }

    // Hands.
    const auto = weapons.def?.auto === true;
    const cur = weapons.current;
    this.hold('Mouse0', it.fire && auto);
    // Sights up for a target that is not on top of us, unless we are backing away: they slow the feet.
    this.hold('Mouse2', it.fire && !!it.aim && it.aim.dist > SIGHTS_BEYOND && life === 'alive' && !it.fleeing);
    if (it.fire && !auto && this.time >= this.triggerAt) {
      this.triggerAt = this.time + TRIGGER_EVERY;
      this.tap('Mouse0');
    }
    this.hold('KeyF', it.revive !== 0);
    // One key at a time, the urgent ones first; a reload outranks the knife or it would never happen.
    if (this.time >= this.tapAt) {
      const press = it.swap >= 0 && it.swap !== weapons.slot ? `Digit${it.swap + 1}`
        : it.reload && cur && !weapons.reloading ? 'KeyR'
        : it.use && !it.revive && this.time >= this.useAt ? 'KeyF'
        : it.melee ? 'KeyV' : '';
      if (press) {
        this.tapAt = this.time + 0.15;
        if (press === 'KeyF') this.useAt = this.time + USE_EVERY;
        this.tap(press);
      }
    }
  }
}
