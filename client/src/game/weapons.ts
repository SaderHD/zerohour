import * as THREE from 'three';
import {
  AIM_MOVE_MULT, GRENADE_COOLDOWN, KNIFE_COOLDOWN, KNIFE_RANGE, SWAP_SECONDS, aimDir, fireInterval, lerp, rayWorld, weaponDef,
  type ClientMsg, type CompiledMap, type DoorSet, type FireHit, type PlayerPublic, type WeaponDef, type WeaponId,
} from '@zh/shared';
import type { Input } from '../input/input';
import { damp } from '../models/rig';
import type { Entities } from './entities';
import type { Fx } from './fx';
import type { LocalPlayer } from './localPlayer';
import type { Viewmodel } from './viewmodel';

export interface WeaponCtx {
  player: LocalPlayer;
  camera: THREE.PerspectiveCamera;
  map: CompiledMap;
  openDoors: DoorSet;
  entities: Entities;
  fx: Fx;
  vm: Viewmodel;
  send(msg: ClientMsg): void;
}

interface Slot {
  id: WeaponId;
  mag: number;
  reserve: number;
}

/** Seconds after a local reload before server ammo counts are trusted again (covers the round trip). */
const RECONCILE_QUIET = 0.5;
const WALL_COLOUR = 0x8a8478;

/**
 * The local player's guns: trigger, spread, recoil, reload, swap, knife and grenades. Shots are
 * resolved here against the entities we are drawing and reported to the server, which validates
 * them. Ammo is predicted locally and reconciled from snapshots once things are quiet.
 */
export class LocalWeapons {
  slots: Slot[] = [];
  slot = 0;
  grenades = 0;
  /** 0 = hip, 1 = sights. */
  aim = 0;
  /** Shots fired this session (for tests). */
  shots = 0;
  reloading = false;
  private cooldown = 0;
  private reloadT = 0;
  private swapT = 0;
  private meleeT = 0;
  private throwT = 0;
  private bloom = 0;
  /** A semi-auto trigger pull is remembered briefly, so a shot asked for mid-sprint or mid-cycle still fires. */
  private queued = 0;
  private sinceReload = RECONCILE_QUIET;
  private fireSeq = 0;
  private readonly muzzle = new THREE.Vector3();
  private readonly end = new THREE.Vector3();

  constructor(private readonly ctx: WeaponCtx) {}

  get current(): Slot | undefined {
    return this.slots[this.slot];
  }

  get def(): WeaponDef | undefined {
    return this.current && weaponDef(this.current.id);
  }

  /** Our loadout as the server sees it. Predicted ammo is kept for weapons we already hold. */
  onPlayer(pub: PlayerPublic): void {
    const changed = pub.weapons.length !== this.slots.length || pub.weapons.some((w, i) => w.id !== this.slots[i]?.id);
    this.slots = pub.weapons.map((w, i) => (this.slots[i]?.id === w.id && !changed ? this.slots[i]! : { id: w.id, mag: w.mag, reserve: w.reserve }));
    this.grenades = pub.grenades;
    if (changed) {
      this.slot = pub.slot;
      this.reloadT = 0;
      this.reloading = false;
      this.swapT = SWAP_SECONDS;
      if (this.current) this.ctx.vm.setWeapon(this.current.id);
    }
  }

  /** Snapshot ammo for the held weapon: [last fire seq processed, slot, mag, reserve]. */
  onAmmo([ack, slot, mag, reserve]: [number, number, number, number]): void {
    const cur = this.current;
    if (!cur || ack !== this.fireSeq || slot !== this.slot || this.reloadT > 0 || this.sinceReload < RECONCILE_QUIET) return;
    cur.mag = mag;
    cur.reserve = reserve;
  }

  /** Current cone half-angle in radians. */
  spread(): number {
    const def = this.def;
    if (!def) return 0;
    const moving = Math.min(1, this.ctx.player.speed / 4.5);
    return lerp(def.spreadHip * (1 + 0.5 * moving), def.spreadAim, this.aim) + this.bloom;
  }

  update(dt: number, input: Input, active: boolean): void {
    const { player, vm, send } = this.ctx;
    const cur = this.current;
    const def = this.def;
    if (!cur || !def) return;
    const held = (code: string) => active && input.down(code);
    const hit = (code: string) => active && input.pressed(code);

    this.cooldown = Math.max(this.cooldown - dt, -dt);
    this.swapT -= dt;
    this.meleeT -= dt;
    this.throwT -= dt;
    this.sinceReload += dt;
    this.bloom *= 1 - damp(7, dt);

    // Reload finishing.
    if (this.reloadT > 0 && (this.reloadT -= dt) <= 0) {
      const take = Math.min(def.magSize - cur.mag, cur.reserve);
      cur.mag += take;
      cur.reserve -= take;
      this.sinceReload = 0;
    }
    const busy = this.reloadT > 0 || this.swapT > 0 || this.meleeT > KNIFE_COOLDOWN - 0.3;

    // Swap: Q / wheel cycle, number keys pick.
    let want = this.slot;
    if (hit('KeyQ') || (active && input.wheel !== 0)) want = (this.slot + 1) % this.slots.length;
    for (let n = 0; n < this.slots.length; n++) if (hit(`Digit${n + 1}`)) want = n;
    if (want !== this.slot && this.slots[want]) {
      this.slot = want;
      this.swapT = SWAP_SECONDS;
      this.reloadT = 0;
      this.cooldown = 0;
      this.bloom = 0;
      vm.setWeapon(this.slots[want]!.id);
      send({ t: 'swap', slot: want });
      this.finish(player, weaponDef(this.slots[want]!.id)!, false);
      return;
    }

    const aiming = held('Mouse2') && this.reloadT <= 0 && !player.sprinting;
    this.aim += ((aiming ? 1 : 0) - this.aim) * damp(16, dt);
    if (hit('Mouse0')) this.queued = 0.15;
    else this.queued -= dt;
    const trigger = def.auto ? held('Mouse0') : this.queued > 0;

    if (hit('KeyV') && this.meleeT <= 0) this.knife();
    if (hit('KeyG') && this.throwT <= 0 && this.grenades > 0) {
      this.throwT = GRENADE_COOLDOWN;
      this.grenades--;
      vm.throwGrenade();
      send({ t: 'throw', kind: 'frag', yaw: player.yaw, pitch: player.viewPitch });
    }

    const wantReload = hit('KeyR') || (cur.mag === 0 && (trigger || hit('Mouse0')));
    if (wantReload && !busy && cur.mag < def.magSize && cur.reserve > 0) {
      this.reloadT = def.reloadTime;
      vm.reload(def.reloadTime);
      send({ t: 'reload' });
    } else if (trigger && !busy && this.cooldown <= 0 && cur.mag > 0 && !player.sprinting && this.throwT < GRENADE_COOLDOWN - 0.4) {
      this.shoot(cur, def);
    }
    this.finish(player, def, held('Mouse0'));
  }

  /** Feed movement modifiers back to the player body. */
  private finish(player: LocalPlayer, def: WeaponDef, triggerHeld: boolean): void {
    this.reloading = this.reloadT > 0;
    player.speedMult = def.moveSpeedMult * lerp(1, AIM_MOVE_MULT, this.aim);
    player.zoom = lerp(1, def.zoom, this.aim);
    player.noSprint = triggerHeld || this.aim > 0.3 || this.reloadT > 0;
  }

  private shoot(cur: Slot, def: WeaponDef): void {
    const { player, camera, map, openDoors, entities, fx, vm, send } = this.ctx;
    const eye = camera.position;
    const yaw = player.yaw;
    const pitch = player.viewPitch;
    const [fx0, fy0, fz0] = aimDir(yaw, pitch);
    // Basis around the aim direction for the spread cone.
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const ux = -rz * fy0;
    const uy = rz * fx0 - rx * fz0;
    const uz = rx * fy0;
    const spread = this.spread();
    const hits: FireHit[] = [];
    vm.muzzleWorld(camera, this.muzzle);

    for (let p = 0; p < def.pellets; p++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.tan(spread * Math.sqrt(Math.random()));
      const ca = Math.cos(a) * r;
      const sa = Math.sin(a) * r;
      let dx = fx0 + rx * ca + ux * sa;
      let dy = fy0 + uy * sa;
      let dz = fz0 + rz * ca + uz * sa;
      const len = Math.hypot(dx, dy, dz);
      dx /= len;
      dy /= len;
      dz /= len;
      const wall = rayWorld(map, openDoors, eye.x, eye.y, eye.z, dx, dy, dz, def.range);
      let reach = wall;
      if (!def.projectile) {
        const struck = entities.raycast(eye.x, eye.y, eye.z, dx, dy, dz, wall).slice(0, def.pierce + 1);
        for (const h of struck) {
          hits.push({ id: h.id, zone: h.zone, dist: Math.round(h.dist * 100) / 100 });
          fx.puff(h.x, h.y, h.z, h.colour, 3, 1.4);
          entities.flinch(h.id, 1 / def.pellets);
        }
        if (struck.length > def.pierce) reach = struck[struck.length - 1]!.dist; // the bullet stopped in a body
        else if (wall < def.range) fx.puff(eye.x + dx * (wall - 0.03), eye.y + dy * (wall - 0.03), eye.z + dz * (wall - 0.03), WALL_COLOUR, 3, 1.2);
        fx.tracer(this.muzzle, this.end.set(eye.x + dx * reach, eye.y + dy * reach, eye.z + dz * reach));
      }
    }

    send({ t: 'fire', seq: ++this.fireSeq, slot: this.slot, yaw, pitch, aim: this.aim > 0.5, hits });
    cur.mag--;
    this.queued = 0;
    this.shots++;
    this.cooldown += fireInterval(def);
    this.bloom = Math.min(def.spreadHip, this.bloom + def.spreadHip * 0.18 * (1 - 0.6 * this.aim));
    player.kick(def.recoil * (1 - 0.35 * this.aim));
    vm.fire();
    fx.flash(eye.x + fx0 * 0.7, eye.y + fy0 * 0.7 - 0.1, eye.z + fz0 * 0.7);
  }

  private knife(): void {
    const { player, camera, map, openDoors, entities, fx, vm, send } = this.ctx;
    this.meleeT = KNIFE_COOLDOWN;
    vm.swing();
    const eye = camera.position;
    const [dx, dy, dz] = aimDir(player.yaw, player.viewPitch);
    const reach = rayWorld(map, openDoors, eye.x, eye.y, eye.z, dx, dy, dz, KNIFE_RANGE);
    // Forgiving: also try slightly lower so a level swing catches a torso.
    const target = entities.raycast(eye.x, eye.y, eye.z, dx, dy, dz, reach)[0] ?? entities.raycast(eye.x, eye.y - 0.35, eye.z, dx, dy, dz, reach)[0];
    if (target) {
      fx.puff(target.x, target.y, target.z, target.colour, 5, 1.8);
      entities.flinch(target.id, 1.5);
    }
    send({ t: 'melee', hit: target?.id });
  }
}
