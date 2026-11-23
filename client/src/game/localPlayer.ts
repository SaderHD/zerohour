import type * as THREE from 'three';
import {
  PLAYER_EYE_HEIGHT, PLAYER_RADIUS, SPRINT_SPEED, STAMINA_REGEN_DELAY, STAMINA_SECONDS, WALK_SPEED,
  clamp, moveCircle, type CompiledMap, type DoorSet,
} from '@zh/shared';
import type { Input } from '../input/input';

const ACCEL = 14; // how quickly velocity follows input (1/s)
const BASE_FOV = 72;
const SPRINT_FOV_KICK = 7;
const PITCH_LIMIT = Math.PI / 2 - 0.02;
const FREECAM_SPEED = 12;

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
  sprinting = false;
  sensitivity = 0.0022;
  /** Debug fly camera: no collision, free vertical movement. */
  freeCam = false;
  private flyY = PLAYER_EYE_HEIGHT;
  private sinceSprint = STAMINA_REGEN_DELAY;
  private bob = 0;
  private bobAmount = 0;
  private fov = BASE_FOV;

  get speed(): number {
    return Math.hypot(this.vx, this.vz);
  }

  teleport(x: number, z: number, yaw = this.yaw): void {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.vx = this.vz = 0;
  }

  update(dt: number, input: Input, map: CompiledMap, open: DoorSet): void {
    const mouse = input.consumeMouse();
    this.yaw -= mouse.dx * this.sensitivity;
    this.pitch = clamp(this.pitch - mouse.dy * this.sensitivity, -PITCH_LIMIT, PITCH_LIMIT);

    const fwd = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
    const strafe = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let wx = -sin * fwd + cos * strafe;
    let wz = -cos * fwd - sin * strafe;
    const mag = Math.hypot(wx, wz);
    if (mag > 1) {
      wx /= mag;
      wz /= mag;
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
    const wantSprint = input.down('ShiftLeft') && fwd > 0 && mag > 0;
    this.sprinting = wantSprint && this.stamina > 0;
    if (this.sprinting) {
      this.stamina = Math.max(0, this.stamina - dt);
      this.sinceSprint = 0;
    } else {
      this.sinceSprint += dt;
      if (this.sinceSprint >= STAMINA_REGEN_DELAY) this.stamina = Math.min(STAMINA_SECONDS, this.stamina + dt);
    }

    const target = this.sprinting ? SPRINT_SPEED : WALK_SPEED;
    const k = 1 - Math.exp(-ACCEL * dt);
    this.vx += (wx * target - this.vx) * k;
    this.vz += (wz * target - this.vz) * k;

    const before = { x: this.x, z: this.z };
    const p = moveCircle(map, open, this.x, this.z, this.vx * dt, this.vz * dt, PLAYER_RADIUS);
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
    this.fov += (BASE_FOV + (this.sprinting ? SPRINT_FOV_KICK : 0) - this.fov) * (1 - Math.exp(-8 * dt));
  }

  applyTo(camera: THREE.PerspectiveCamera): void {
    const bobY = this.freeCam ? 0 : Math.sin(this.bob * 2) * 0.035 * this.bobAmount;
    const bobX = this.freeCam ? 0 : Math.cos(this.bob) * 0.02 * this.bobAmount;
    const y = this.freeCam ? this.flyY : PLAYER_EYE_HEIGHT + bobY;
    camera.position.set(this.x + Math.cos(this.yaw) * bobX, y, this.z - Math.sin(this.yaw) * bobX);
    camera.rotation.set(this.pitch, this.yaw, this.freeCam ? 0 : bobX * 0.4, 'YXZ');
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
