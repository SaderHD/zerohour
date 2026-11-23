import * as THREE from 'three';
import { WALK_SPEED, clamp } from '@zh/shared';
import { damp, modelMaterial, part, pivot, shadedBox } from './rig';

/** Jacket colours by seat. */
export const PLAYER_COLOURS = [0x5f7a3a, 0x3a5f9a, 0x9a3a3a, 0xb08a2a] as const;

const PANTS = 0x2c2c38;
const BOOTS = 0x1a1612;
const SKIN = 0xc89a78;
const HAT = 0x24262c;
const GUN = 0x16181c;
const HIP_Y = 0.92;

export interface PlayerAnim {
  speed: number;
  sprinting: boolean;
  pitch: number;
}

/**
 * Third-person survivor: a box rig with procedural animation. Faces -z at yaw 0. The root's
 * origin is at the feet.
 */
export class PlayerModel {
  readonly root = new THREE.Group();
  readonly material = modelMaterial();
  private readonly body: THREE.Group;
  private readonly torso: THREE.Group;
  private readonly head: THREE.Group;
  private readonly shoulderL: THREE.Group;
  private readonly shoulderR: THREE.Group;
  private readonly elbowL: THREE.Group;
  private readonly elbowR: THREE.Group;
  private readonly hipL: THREE.Group;
  private readonly hipR: THREE.Group;
  private readonly kneeL: THREE.Group;
  private readonly kneeR: THREE.Group;
  private phase = 0;
  private amp = 0;
  private sprintBlend = 0;
  private time = Math.random() * 10;

  constructor(jacket: number) {
    const m = this.material;
    const arm = (side: -1 | 1, withGun: boolean) => {
      const fore = [shadedBox(0.1, 0.28, 0.1, jacket, 0, -0.14, 0), shadedBox(0.09, 0.08, 0.09, SKIN, 0, -0.32, 0)];
      if (withGun) fore.push(shadedBox(0.06, 0.42, 0.09, GUN, -0.02, -0.5, -0.03), shadedBox(0.05, 0.1, 0.14, GUN, -0.02, -0.36, 0.06));
      const elbow = pivot(0, -0.3, 0, part(m, ...fore));
      const shoulder = pivot(side * 0.27, 0.44, 0, part(m, shadedBox(0.12, 0.32, 0.12, jacket, 0, -0.15, 0)), elbow);
      return { shoulder, elbow };
    };
    const leg = (side: -1 | 1) => {
      const knee = pivot(0, -0.44, 0, part(m, shadedBox(0.12, 0.4, 0.13, PANTS, 0, -0.2, 0), shadedBox(0.13, 0.1, 0.25, BOOTS, 0, -0.43, -0.05)));
      const hip = pivot(side * 0.1, 0, 0, part(m, shadedBox(0.15, 0.46, 0.16, PANTS, 0, -0.22, 0)), knee);
      return { hip, knee };
    };
    const L = arm(-1, false);
    const R = arm(1, true);
    this.shoulderL = L.shoulder;
    this.elbowL = L.elbow;
    this.shoulderR = R.shoulder;
    this.elbowR = R.elbow;
    this.head = pivot(0, 0.52, 0, part(
      m,
      shadedBox(0.1, 0.08, 0.1, SKIN, 0, 0.02, 0),
      shadedBox(0.23, 0.24, 0.24, SKIN, 0, 0.17, 0),
      shadedBox(0.25, 0.09, 0.26, HAT, 0, 0.3, 0),
      shadedBox(0.25, 0.03, 0.1, HAT, 0, 0.26, -0.17),
    ));
    this.torso = pivot(0, 0.1, 0, part(m, shadedBox(0.42, 0.5, 0.24, jacket, 0, 0.26, 0), shadedBox(0.3, 0.3, 0.1, PANTS, 0, 0.3, 0.16)), this.head, this.shoulderL, this.shoulderR);
    const legL = leg(-1);
    const legR = leg(1);
    this.hipL = legL.hip;
    this.kneeL = legL.knee;
    this.hipR = legR.hip;
    this.kneeR = legR.knee;
    this.body = pivot(0, HIP_Y, 0, part(m, shadedBox(0.34, 0.18, 0.2, PANTS, 0, 0.03, 0)), this.torso, this.hipL, this.hipR);
    this.root.add(this.body);
  }

  update(dt: number, a: PlayerAnim): void {
    this.time += dt;
    const moving = a.speed > 0.25;
    this.amp += ((moving ? clamp(a.speed / WALK_SPEED, 0.35, 1.15) : 0) - this.amp) * damp(10, dt);
    this.sprintBlend += ((a.sprinting && moving ? 1 : 0) - this.sprintBlend) * damp(8, dt);
    if (moving) this.phase += dt * (5 + a.speed * 1.4);
    const amp = this.amp;
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);
    const run = this.sprintBlend;

    // Legs: thigh swings, knee folds while that leg travels forward.
    const swing = (0.6 + 0.3 * run) * amp;
    this.hipL.rotation.x = s * swing;
    this.hipR.rotation.x = -s * swing;
    this.kneeL.rotation.x = -(0.1 * amp + Math.max(0, c) * (0.9 + 0.5 * run) * amp);
    this.kneeR.rotation.x = -(0.1 * amp + Math.max(0, -c) * (0.9 + 0.5 * run) * amp);

    const breathe = Math.sin(this.time * 1.7) * 0.006;
    this.body.position.y = HIP_Y - 0.03 * amp + Math.abs(c) * 0.04 * amp + breathe;
    this.torso.rotation.x = -(0.05 + 0.24 * run) * amp;
    this.torso.rotation.y = s * 0.09 * amp;
    this.head.rotation.x = a.pitch * 0.6 + (0.05 + 0.2 * run) * amp;

    // Arms: weapon held forward and aimed with pitch; pumping while sprinting.
    const aim = clamp(a.pitch, -1.1, 1.1) * 0.85;
    const hold = 1 - run;
    this.shoulderR.rotation.set(hold * (1.32 + aim) + run * (-s * 0.9), 0, hold * -0.12);
    this.elbowR.rotation.x = hold * 0.18 + run * 1.1;
    this.shoulderL.rotation.set(hold * (1.05 + aim) + run * (s * 0.9), 0, hold * 0.55);
    this.elbowL.rotation.x = hold * 0.5 + run * 1.1;
    this.shoulderL.position.y = this.shoulderR.position.y = 0.44 + breathe * 1.5;
  }

  /** Tint by the baked light at the model's position. */
  setLight(rgb: [number, number, number]): void {
    this.material.color.setRGB(Math.min(rgb[0], 1.6), Math.min(rgb[1], 1.6), Math.min(rgb[2], 1.6));
  }

  dispose(): void {
    this.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.material.dispose();
  }
}
