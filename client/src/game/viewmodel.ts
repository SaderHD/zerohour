import * as THREE from 'three';
import { SWAP_SECONDS, clamp, lerp, type WeaponId } from '@zh/shared';
import { damp, modelMaterial, part, shadedBox } from '../models/rig';
import { buildWeapon, type WeaponModel } from '../models/weapons';
import { C } from '../models/weapons/kit';

const VM_FOV = 58;
const PUMP_SECONDS = 0.5;
const MELEE_SECONDS = 0.32;
const THROW_SECONDS = 0.45;
const FLASH_SECONDS = 0.05;

export interface ViewmodelInput {
  /** 0 = hip, 1 = aiming down sights. */
  aim: number;
  speed: number;
  sprinting: boolean;
  /** Mouse movement this frame (pixels), for sway. */
  lookX: number;
  lookY: number;
  light: [number, number, number];
}

const ease = (t: number): number => t * t * (3 - 2 * t);
/** 0 → 1 between a and b, clamped and smoothed. */
const ramp = (t: number, a: number, b: number): number => ease(clamp((t - a) / (b - a), 0, 1));

/**
 * The first-person weapon. Lives in its own scene with a fixed-FOV camera and is drawn over the
 * world after a depth clear, so it never clips into walls. All animation is code: sway, bob,
 * recoil, slide/pump, reload, swap, sprint, knife and grenade throw.
 */
export class Viewmodel {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(VM_FOV, 16 / 9, 0.01, 6);
  private readonly holder = new THREE.Group();
  private readonly models = new Map<WeaponId, WeaponModel>();
  private readonly flash = new THREE.Group();
  private readonly knife: THREE.Group;
  private readonly knifeMat = modelMaterial();
  private model: WeaponModel | null = null;
  private kick = 0;
  private slideKick = 0;
  private pump = 1;
  private raise = 1;
  private reloadT = 0;
  private reloadDur = 0;
  private melee = 1;
  private toss = 1;
  private flashT = 0;
  private bob = 0;
  private bobAmp = 0;
  private sprint = 0;
  private swayX = 0;
  private swayY = 0;
  private time = 0;

  constructor() {
    this.scene.add(new THREE.AmbientLight(0xffffff, Math.PI), this.holder);
    // Muzzle flash: three crossed additive quads.
    const quad = new THREE.PlaneGeometry(0.2, 0.2);
    const geos = [quad.clone(), quad.clone().rotateZ(Math.PI / 4), quad.clone().rotateY(Math.PI / 2).scale(1, 0.6, 1.8), quad.clone().rotateX(Math.PI / 2).scale(0.6, 1, 1.8)];
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd070, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (const g of geos) this.flash.add(new THREE.Mesh(g, mat));
    this.flash.visible = false;
    this.holder.add(this.flash);

    this.knife = new THREE.Group();
    this.knife.add(part(
      this.knifeMat,
      shadedBox(0.006, 0.035, 0.2, 0x9aa0a8, 0, 0.01, -0.16),
      shadedBox(0.014, 0.05, 0.016, C.dark, 0, 0, -0.055),
      shadedBox(0.026, 0.034, 0.1, 0x3a2a1e, 0, 0, 0),
      shadedBox(0.055, 0.08, 0.07, C.glove, 0, -0.005, 0.01),
      shadedBox(0.07, 0.07, 0.4, C.sleeve, 0.02, -0.03, 0.24, [0.1, 0.1, 0]),
    ));
    this.knife.visible = false;
    this.scene.add(this.knife);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  setWeapon(id: WeaponId): void {
    let m = this.models.get(id);
    if (!m) this.models.set(id, (m = buildWeapon(id, true)));
    if (this.model) this.holder.remove(this.model.group);
    this.model = m;
    this.holder.add(m.group);
    this.flash.position.copy(m.muzzle.position);
    this.raise = 0;
    this.reloadT = 0;
    this.pump = 1;
    this.kick = this.slideKick = 0;
  }

  fire(): void {
    this.kick = 1;
    this.slideKick = 1;
    this.flashT = FLASH_SECONDS;
    this.flash.rotation.z = Math.random() * Math.PI;
    this.flash.scale.setScalar(0.7 + Math.random() * 0.6);
    if (this.model?.action === 'pump') this.pump = 0;
  }

  reload(duration: number): void {
    this.reloadT = this.reloadDur = duration;
  }

  cancelReload(): void {
    this.reloadT = 0;
  }

  swing(): void {
    this.melee = 0;
  }

  throwGrenade(): void {
    this.toss = 0;
  }

  /** Muzzle position in the main camera's world, corrected for the viewmodel's narrower FOV. */
  muzzleWorld(main: THREE.PerspectiveCamera, out: THREE.Vector3): THREE.Vector3 {
    if (!this.model) return out.copy(main.position);
    this.model.muzzle.getWorldPosition(out);
    const k = Math.tan((main.fov * Math.PI) / 360) / Math.tan((VM_FOV * Math.PI) / 360);
    out.x *= k;
    out.y *= k;
    return out.applyMatrix4(main.matrixWorld);
  }

  update(dt: number, i: ViewmodelInput): void {
    const m = this.model;
    if (!m) return;
    this.time += dt;
    const aim = i.aim;
    const hip = 1 - aim;

    // Timers
    this.kick *= 1 - damp(14, dt);
    this.slideKick *= 1 - damp(26, dt);
    this.raise = Math.min(1, this.raise + dt / SWAP_SECONDS);
    this.pump = Math.min(1, this.pump + dt / PUMP_SECONDS);
    this.melee = Math.min(1, this.melee + dt / MELEE_SECONDS);
    this.toss = Math.min(1, this.toss + dt / THROW_SECONDS);
    this.reloadT = Math.max(0, this.reloadT - dt);
    this.sprint += ((i.sprinting ? 1 : 0) - this.sprint) * damp(10, dt);
    this.bob += dt * (3 + i.speed * 1.9);
    this.bobAmp += (clamp(i.speed / 4.5, 0, 1.3) - this.bobAmp) * damp(8, dt);
    this.swayX += (clamp(-i.lookX * 0.0006, -0.03, 0.03) - this.swayX) * damp(9, dt);
    this.swayY += (clamp(i.lookY * 0.0006, -0.03, 0.03) - this.swayY) * damp(9, dt);

    // Base pose: hip → sights.
    const long = m.twoHanded;
    const pos = this.holder.position.set(
      lerp(long ? 0.13 : 0.14, 0, aim),
      lerp(long ? -0.17 : -0.15, -m.sightY, aim),
      lerp(long ? -0.36 : -0.46, long ? -0.4 : -0.42, aim),
    );
    const rot = this.holder.rotation.set(0, lerp(0.035, 0, aim), 0);

    // Idle breathing, walk bob, look sway.
    const bobK = this.bobAmp * (0.25 + 0.75 * hip);
    pos.x += Math.cos(this.bob) * 0.007 * bobK + this.swayX * (0.4 + 0.6 * hip);
    pos.y += Math.sin(this.bob * 2) * 0.006 * bobK + Math.sin(this.time * 1.6) * 0.0018 * hip + this.swayY * (0.4 + 0.6 * hip);
    rot.z += this.swayX * 1.5;
    rot.y += this.swayX * 1.2;
    rot.x += this.swayY * 1.2;

    // Recoil.
    pos.z += this.kick * 0.05 * (0.5 + 0.5 * hip);
    pos.y += this.kick * 0.008 * hip;
    rot.x += this.kick * 0.11 * (0.4 + 0.6 * hip);

    // Sprint: gun swings across the body and bounces.
    pos.x -= this.sprint * 0.06;
    pos.y -= this.sprint * (0.05 - Math.sin(this.bob * 2) * 0.012);
    rot.y += this.sprint * 0.75;
    rot.x -= this.sprint * 0.18;

    // Swap raise, knife and grenade: the gun drops out of the way.
    const meleeDip = Math.sin(this.melee * Math.PI);
    const tossDip = Math.sin(this.toss * Math.PI);
    const down = (1 - ease(this.raise)) + meleeDip * 0.8 + tossDip * 0.7;
    pos.y -= down * 0.26;
    rot.x -= down * 0.7;

    // Reload: roll the gun, drop the magazine, seat a new one, come back up.
    let magOut = 0;
    let rack = this.pump < 1 ? Math.sin(ramp(this.pump, 0.2, 1) * Math.PI) : 0;
    if (this.reloadT > 0) {
      const t = 1 - this.reloadT / this.reloadDur;
      const env = ramp(t, 0, 0.14) * (1 - ramp(t, 0.84, 1));
      rot.z += env * (long ? 0.5 : 0.7);
      rot.x += env * 0.4;
      pos.y -= env * 0.035;
      pos.x -= env * 0.02;
      magOut = ramp(t, 0.14, 0.32) * (1 - ramp(t, 0.5, 0.72));
      pos.y += Math.sin(ramp(t, 0.68, 0.78) * Math.PI) * 0.012; // the new magazine slaps home
      if (m.action !== 'none') rack = Math.max(rack, Math.sin(ramp(t, 0.8, 0.95) * Math.PI));
    }
    if (m.mag) {
      m.mag.position.set(0, -magOut * 0.3, magOut * 0.04);
      m.mag.visible = magOut < 0.98;
    }
    if (m.slide) m.slide.position.z = m.slideTravel * (m.action === 'blowback' ? Math.max(this.slideKick, rack) : rack);

    // Knife swipe across the view.
    this.knife.visible = this.melee < 1;
    if (this.knife.visible) {
      const t = ease(this.melee);
      this.knife.position.set(lerp(0.3, -0.24, t), -0.1 + Math.sin(t * Math.PI) * 0.05, -0.34 - Math.sin(t * Math.PI) * 0.1);
      this.knife.rotation.set(0.15, lerp(-0.5, 1.2, t), lerp(-1.2, -0.3, t));
    }

    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;
    const glow = this.flashT > 0 ? 1.8 : 1;
    const [r, g, b] = i.light;
    m.material.color.setRGB(Math.min(r, 1.6) * glow, Math.min(g, 1.6) * glow, Math.min(b, 1.6) * glow);
    this.knifeMat.color.setRGB(Math.min(r, 1.6), Math.min(g, 1.6), Math.min(b, 1.6));
  }
}
