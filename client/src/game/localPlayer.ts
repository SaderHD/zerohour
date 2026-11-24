import type * as THREE from 'three';
import {
  PLAYER_EYE_HEIGHT, PLAYER_RADIUS, SPRINT_SPEED, STAMINA_REGEN_DELAY, STAMINA_SECONDS, WALK_SPEED,
  clamp, moveCircle, type CompiledMap, type DoorSet,
} from '@zh/shared';
import type { Input } from '../input/input';

const ACCEL = 14; // how quickly velocity follows input (1/s)
const SPRINT_FOV_KICK = 7;
const PITCH_LIMIT = Math.PI / 2 - 0.02;
const FREECAM_SPEED = 12;
/** Closest the player's centre can get to a zombie's: bodies block, with a little give. */
const BODY_GAP = 0.6;
/** How far the view sinks, and tilts, when downed. */
const DOWNED_DROP = 1.05;
const DOWNED_ROLL = 0.28;

/**
 * The player's own body. Movement is simulated locally with the shared collision code and (from
 * session 3) reported to the server, which sanity-checks it. Yaw 0 looks north (-z).
 */
export class LocalPlayer {
  x = 0;
  z = 0;
  yaw = 0;
  pitch = 0;
  vx = 0;
  vz = 0;
  /** Seconds of sprint left. */
  stamina = STAMINA_SECONDS;
  /** Seconds of sprint when rested (Marathon doubles it). */
  staminaMax = STAMINA_SECONDS;
  sprinting = false;
  sensitivity = 0.0022;
  /** Settings: pushing the mouse forward looks down; the resting field of view in degrees. */
  invertY = false;
  baseFov = 72;
  /** Debug fly camera: no collision, free vertical movement. */
  freeCam = false;
  /** Set each frame by the weapon system: speed multiplier, sprint lock-out and FOV zoom. */
  speedMult = 1;
  noSprint = false;
  zoom = 1;
  /** Cannot walk (downed, dead or the game is over); `lying` also drops the view to the floor. */
  frozen = false;
  /** The autopilot's legs: a world direction to walk in, instead of the keys. */
  wish: { x: number; z: number; sprint: boolean } | null = null;
  lying = false;
  private drop = 0;
  /** Mouse movement consumed this frame (pixels), for viewmodel sway. */
  lookX = 0;
  lookY = 0;
  private recoil = 0;
  private recoilTarget = 0;
  /** Sideways recoil still to be fed into the yaw (it does not come back; the player corrects). */
  private yawKick = 0;
  private flyY = PLAYER_EYE_HEIGHT;
  private sinceSprint = STAMINA_REGEN_DELAY;
  private bob = 0;
  private bobAmount = 0;
  private fov = 72;

  get speed(): number {
    return Math.hypot(this.vx, this.vz);
  }

  /** Where the camera (and the next shot) points, recoil included. */
  get viewPitch(): number {
    return clamp(this.pitch + this.recoil, -PITCH_LIMIT, PITCH_LIMIT);
  }

  /** Recoil: the view climbs quickly, then settles back. */
  kick(radians: number, side = (Math.random() - 0.5) * radians * 0.5): void {
    this.recoilTarget += radians;
    this.yawKick += side;
  }

  /** Footfalls so far: the view's bob bottoms out each time this passes a whole number. */
  get stride(): number {
    return this.bob / Math.PI + 0.25;
  }

  teleport(x: number, z: number, yaw = this.yaw): void {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.vx = this.vz = 0;
  }

  update(dt: number, input: Input, map: CompiledMap, open: DoorSet, blockers: readonly { x: number; z: number }[] = []): void {
    const mouse = input.consumeMouse();
    const sens = this.sensitivity * this.zoom;
    this.lookX = mouse.dx;
    this.lookY = mouse.dy;
    this.yaw -= mouse.dx * sens;
    this.pitch = clamp(this.pitch - mouse.dy * sens * (this.invertY ? -1 : 1), -PITCH_LIMIT, PITCH_LIMIT);
    this.recoil += (this.recoilTarget - this.recoil) * (1 - Math.exp(-30 * dt));
    const turn = this.yawKick * (1 - Math.exp(-30 * dt));
    this.yaw += turn;
    this.yawKick -= turn;
    this.recoilTarget *= Math.exp(-7 * dt);

    const walk = this.frozen && !this.freeCam ? 0 : 1;
    const fwd = walk * ((input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0));
    const strafe = walk * ((input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0));
    this.drop += ((this.lying ? 1 : 0) - this.drop) * (1 - Math.exp(-6 * dt));
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let wx = -sin * fwd + cos * strafe;
    let wz = -cos * fwd - sin * strafe;
    const mag = Math.hypot(wx, wz);
    if (mag > 1) {
      wx /= mag;
      wz /= mag;
    }
    if (this.wish && !this.freeCam) {
      wx = walk * this.wish.x;
      wz = walk * this.wish.z;
    }

    if (this.freeCam) {
      const up = (input.down('Space') ? 1 : 0) - (input.down('ControlLeft') ? 1 : 0);
      const boost = input.down('ShiftLeft') ? 3 : 1;
      this.x += wx * FREECAM_SPEED * boost * dt;
      this.z += wz * FREECAM_SPEED * boost * dt;
      this.flyY += (up + fwd * Math.sin(this.pitch)) * FREECAM_SPEED * boost * dt;
      this.vx = this.vz = 0;
      return;
    }

    // Sprint: only while moving forward with stamina left; regen after a short delay.
    const wantSprint = (this.wish ? this.wish.sprint && walk > 0 && (wx !== 0 || wz !== 0) : input.down('ShiftLeft') && fwd > 0 && mag > 0) && !this.noSprint;
    this.sprinting = wantSprint && this.stamina > 0;
    if (this.sprinting) {
      this.stamina = Math.max(0, this.stamina - dt);
      this.sinceSprint = 0;
    } else {
      this.sinceSprint += dt;
      if (this.sinceSprint >= STAMINA_REGEN_DELAY) this.stamina = Math.min(this.staminaMax, this.stamina + dt);
    }

    const target = (this.sprinting ? SPRINT_SPEED : WALK_SPEED) * this.speedMult;
    const k = 1 - Math.exp(-ACCEL * dt);
    this.vx += (wx * target - this.vx) * k;
    this.vz += (wz * target - this.vz) * k;

    const before = { x: this.x, z: this.z };
    let p = moveCircle(map, open, this.x, this.z, this.vx * dt, this.vz * dt, PLAYER_RADIUS);
    // Zombies are in the way: slide out of any we overlap (walls still win).
    for (const b of blockers) {
      const ox = p.x - b.x;
      const oz = p.z - b.z;
      const d = Math.hypot(ox, oz);
      if (d >= BODY_GAP || d < 1e-4) continue;
      p = moveCircle(map, open, p.x, p.z, (ox / d) * (BODY_GAP - d), (oz / d) * (BODY_GAP - d), PLAYER_RADIUS);
    }
    this.x = p.x;
    this.z = p.z;
    // Kill velocity into walls so we don't "stick" when turning away.
    if (dt > 0) {
      const ax = (this.x - before.x) / dt;
      const az = (this.z - before.z) / dt;
      if (Math.abs(ax) < Math.abs(this.vx)) this.vx = ax;
      if (Math.abs(az) < Math.abs(this.vz)) this.vz = az;
    }

    const moved = Math.hypot(this.x - before.x, this.z - before.z);
    this.bob += moved * 1.9;
    this.bobAmount += (clamp(this.speed / WALK_SPEED, 0, 1.4) - this.bobAmount) * (1 - Math.exp(-8 * dt));
    this.fov += ((this.baseFov + (this.sprinting ? SPRINT_FOV_KICK : 0)) * this.zoom - this.fov) * (1 - Math.exp(-14 * dt));
  }

  applyTo(camera: THREE.PerspectiveCamera): void {
    const bobY = this.freeCam ? 0 : Math.sin(this.bob * 2) * 0.035 * this.bobAmount;
    const bobX = this.freeCam ? 0 : Math.cos(this.bob) * 0.02 * this.bobAmount;
    const y = this.freeCam ? this.flyY : PLAYER_EYE_HEIGHT + bobY - DOWNED_DROP * this.drop;
    camera.position.set(this.x + Math.cos(this.yaw) * bobX, y, this.z - Math.sin(this.yaw) * bobX);
    camera.rotation.set(this.freeCam ? this.pitch : this.viewPitch, this.yaw, this.freeCam ? 0 : bobX * 0.4 + DOWNED_ROLL * this.drop, 'YXZ');
    if (Math.abs(camera.fov - this.fov) > 0.01) {
      camera.fov = this.fov;
      camera.updateProjectionMatrix();
    }
  }

  setFreeCam(on: boolean): void {
    this.freeCam = on;
    this.flyY = PLAYER_EYE_HEIGHT;
  }
}
