import * as THREE from 'three';
import { HOWLER_SPEED, Rng, ZOMBIE_ATTACK_WINDUP, ZombieState, clamp, lerp } from '@zh/shared';
import type { EntityModel, HitBox } from './dummy';
import { damp } from './rig';
import { Part, RIG, type ZombieHorde } from './zombieHorde';

const HIDE = [0xa9b2bc, 0x959aa8, 0xb4aca4, 0x8c96a4];
const EYES = [0x9ae8ff, 0xc8f4ff, 0x80c8ff];
const DEATH_SECONDS = 1.8;
const SINK_SECONDS = 0.6;
/** How far the trunk is tipped forward: nearly level. */
const LEVEL = -1.3;
const SCALE = 0.86;

const BOXES: HitBox[] = [
  { zone: 'head', c: [0, 0.62, -0.62], h: [0.15, 0.15, 0.17] },
  { zone: 'torso', c: [0, 0.56, -0.1], h: [0.2, 0.2, 0.42] },
  { zone: 'limb', c: [0, 0.2, -0.05], h: [0.24, 0.2, 0.5] },
];

const joint = (parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group => {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
};

/**
 * A Howler: the zombie's box rig down on all fours - trunk level, arms for forelegs, head thrust
 * out in front - galloping. Drawn through the shared ZombieHorde like every other body.
 */
export class HowlerActor implements EntityModel {
  readonly deathSeconds = DEATH_SECONDS;
  readonly blood = 0x3a5a70;
  private readonly root = new THREE.Group();
  private readonly body = joint(this.root, 0, 0.52, 0.28);
  private readonly torso = joint(this.body, 0, RIG.pelvisH, 0);
  private readonly head = joint(this.torso, 0, RIG.torsoH, 0);
  private readonly shoulder = [joint(this.torso, -0.2, RIG.shoulderY, 0), joint(this.torso, 0.2, RIG.shoulderY, 0)] as const;
  private readonly elbow = [joint(this.shoulder[0], 0, -RIG.upperArm, 0), joint(this.shoulder[1], 0, -RIG.upperArm, 0)] as const;
  private readonly hip = [joint(this.body, -0.1, 0, 0), joint(this.body, 0.1, 0, 0)] as const;
  private readonly knee = [joint(this.hip[0], 0, -RIG.upperLeg, 0), joint(this.hip[1], 0, -RIG.upperLeg, 0)] as const;
  private readonly hide: THREE.Color;
  private readonly dark: THREE.Color;
  private readonly eyes: THREE.Color;
  private readonly light = new THREE.Color(1, 1, 1);
  private readonly tmp = new THREE.Color();
  private state = ZombieState.Chase;
  private stateT = 0;
  private speed = 0;
  private phase: number;
  private amp = 0;
  private time: number;
  private flinch = 0;
  private flinchVel = 0;
  private dead = -1;
  private readonly side: number;

  constructor(seed: number, private readonly horde: ZombieHorde) {
    const rng = new Rng(seed * 2246822519);
    const s = SCALE * rng.range(0.94, 1.08);
    this.root.scale.set(s * rng.range(0.9, 1.05), s, s);
    this.hide = new THREE.Color(rng.pick(HIDE));
    this.dark = this.hide.clone().multiplyScalar(0.62);
    this.eyes = new THREE.Color(rng.pick(EYES));
    this.phase = rng.range(0, 6.28);
    this.time = rng.range(0, 10);
    this.side = rng.chance(0.5) ? 1 : -1;
  }

  boxes(): HitBox[] {
    return BOXES;
  }

  place(x: number, z: number, yaw: number, state: number, speed: number, _gait = 0, y = 0): void {
    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw;
    if (this.dead >= 0) return;
    if (state !== this.state) {
      this.state = state;
      this.stateT = 0;
    }
    this.speed = speed;
  }

  hit(strength = 1): void {
    this.flinchVel += 3.2 * Math.min(strength, 1.5);
  }

  die(): void {
    if (this.dead < 0) this.dead = 0;
  }

  setLight(rgb: [number, number, number]): void {
    this.light.setRGB(Math.min(rgb[0], 1.6), Math.min(rgb[1], 1.6), Math.min(rgb[2], 1.6));
  }

  update(dt: number): void {
    this.time += dt;
    this.stateT += dt;
    this.flinchVel += -this.flinch * 140 * dt;
    this.flinchVel *= 1 - damp(9, dt);
    this.flinch += this.flinchVel * dt;
    this.pose(dt);
    this.root.updateMatrixWorld(true);
    this.write();
  }

  private pose(dt: number): void {
    const moving = this.dead >= 0 ? 0 : this.speed;
    this.amp += (clamp(moving / HOWLER_SPEED, 0, 1.1) - this.amp) * damp(10, dt);
    this.phase += moving * dt * 2.4;
    const a = this.amp;
    const sw = Math.sin(this.phase);
    const cw = Math.cos(this.phase);
    const idle = Math.sin(this.time * 2.3);

    // A bounding gallop: forelegs reach together while the hind legs gather, then the reverse.
    let bodyY = 0.52 + cw * 0.06 * a + idle * 0.008;
    let pitch = LEVEL + sw * 0.14 * a;
    let fore = -LEVEL + sw * 0.75 * a;
    let foreBend = 0.15 + Math.max(0, -cw) * 0.9 * a;
    let hind = 2.25 - sw * 0.6 * a;
    let hindBend = -1.95 + Math.max(0, cw) * 0.7 * a;
    let headX = 1.05 - sw * 0.1 * a + idle * 0.04;
    let roll = 0;

    if (this.state === ZombieState.Attack) {
      // Rear back, then snap forward with the forelegs raking down.
      const k = this.stateT / ZOMBIE_ATTACK_WINDUP;
      const up = k < 0.7 ? k / 0.7 : Math.max(0, 1 - (k - 0.7) / 0.2);
      pitch = LEVEL + up * 0.6;
      bodyY += up * 0.12;
      fore = -LEVEL + up * 1.2;
      foreBend = 0.3;
      headX = 1.05 - up * 0.5;
    }

    let sink = 0;
    if (this.dead >= 0) {
      this.dead += dt;
      const k = Math.min(1, this.dead / 0.4) ** 2;
      bodyY = lerp(bodyY, 0.16, k);
      pitch = lerp(pitch, -1.5, k);
      roll = k * 0.9 * this.side;
      fore = lerp(fore, 2.2, k);
      hind = lerp(hind, 1.2, k);
      hindBend = lerp(hindBend, -0.4, k);
      headX = lerp(headX, 0.5, k);
      sink = (Math.max(0, this.dead - (DEATH_SECONDS - SINK_SECONDS)) / SINK_SECONDS) * 0.4;
    }

    this.body.position.y = bodyY - sink;
    this.body.rotation.set(pitch, 0, roll);
    this.torso.rotation.set(this.flinch * 0.4, 0, 0);
    this.head.rotation.set(headX + this.flinch * 0.4, 0, 0);
    for (let s = 0; s < 2; s++) {
      const lag = s === 0 ? 0 : 0.18 * a; // the pair lands a beat apart
      this.shoulder[s]!.rotation.set(fore - lag, 0, s === 0 ? -0.12 : 0.12);
      this.elbow[s]!.rotation.x = foreBend;
      this.hip[s]!.rotation.set(hind + lag, 0, s === 0 ? -0.1 : 0.1);
      this.knee[s]!.rotation.x = hindBend;
    }
  }

  private write(): void {
    const { horde, tmp, light } = this;
    const lit = (c: THREE.Color) => tmp.copy(c).multiply(light);
    horde.add(Part.Pelvis, this.body.matrixWorld, lit(this.dark));
    horde.add(Part.Torso, this.torso.matrixWorld, lit(this.hide));
    horde.add(Part.Head, this.head.matrixWorld, lit(this.hide));
    const glow = this.dead >= 0 ? Math.max(0, 1 - this.dead * 2.5) : 1.1 + 0.3 * Math.sin(this.time * 14);
    if (glow > 0) horde.add(Part.Eyes, this.head.matrixWorld, tmp.copy(this.eyes).multiplyScalar(glow));
    for (let s = 0; s < 2; s++) {
      horde.add(Part.UpperArm, this.shoulder[s]!.matrixWorld, lit(this.hide));
      horde.add(Part.LowerArm, this.elbow[s]!.matrixWorld, lit(this.dark));
      horde.add(Part.UpperLeg, this.hip[s]!.matrixWorld, lit(this.hide));
      horde.add(Part.LowerLeg, this.knee[s]!.matrixWorld, lit(this.dark));
    }
  }

  dispose(): void {
    // Nothing of its own on the GPU: the horde owns the meshes.
  }
}
