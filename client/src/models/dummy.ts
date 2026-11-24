import * as THREE from 'three';
import type { HitZone } from '@zh/shared';
import { damp, modelMaterial, part, pivot, shadedBox } from './rig';

const BURLAP = 0xa08a58;
const WOOD = 0x6e4424;
const PAINT = 0xd8d2c0;
const RED = 0xb3241c;

/** Axis-aligned hit box in an entity's local space (entity faces -z, origin at the feet). */
export interface HitBox {
  zone: HitZone;
  c: [number, number, number];
  h: [number, number, number];
}

/** What the entity system needs from anything it draws (the dummy, a zombie). */
export interface EntityModel {
  /** How long the corpse stays after `die()`. */
  readonly deathSeconds: number;
  /** Colour of the bits that fly off when it is hit. */
  readonly blood: number;
  /** Hit boxes for its current posture. */
  boxes(): HitBox[];
  /** `speed` is how fast it is actually moving, `gait` its nominal speed, `y` the height its feet are drawn at. */
  place(x: number, z: number, yaw: number, state: number, speed: number, gait: number, y?: number): void;
  update(dt: number): void;
  hit(strength?: number): void;
  die(): void;
  setLight(rgb: [number, number, number]): void;
  dispose(): void;
}

export const DUMMY_HITBOXES: HitBox[] = [
  { zone: 'head', c: [0, 1.6, 0], h: [0.13, 0.14, 0.13] },
  { zone: 'torso', c: [0, 1.1, 0], h: [0.24, 0.34, 0.13] },
  { zone: 'limb', c: [0, 1.3, 0], h: [0.4, 0.05, 0.05] },
  { zone: 'limb', c: [0, 0.4, 0], h: [0.07, 0.4, 0.07] },
];

/** Practice target: a burlap torso and head on a post, with painted aiming marks on the front. */
export class DummyModel implements EntityModel {
  readonly deathSeconds = 1.2;
  readonly blood = 0xb8a468;
  readonly root = new THREE.Group();
  readonly material = modelMaterial();
  private readonly body: THREE.Group;
  private lean = 0;
  private leanVel = 0;
  private falling = 0;

  constructor() {
    const m = this.material;
    this.body = pivot(0, 0.06, 0, part(
      m,
      shadedBox(0.08, 0.78, 0.08, WOOD, 0, 0.39, 0),
      shadedBox(0.8, 0.07, 0.07, WOOD, 0, 1.24, 0),
      shadedBox(0.46, 0.66, 0.24, BURLAP, 0, 1.04, 0),
      shadedBox(0.3, 0.3, 0.012, PAINT, 0, 1.06, -0.124),
      shadedBox(0.14, 0.14, 0.012, RED, 0, 1.06, -0.13),
      shadedBox(0.24, 0.26, 0.24, BURLAP, 0, 1.54, 0),
      shadedBox(0.1, 0.1, 0.012, RED, 0, 1.55, -0.124),
      shadedBox(0.5, 0.04, 0.26, 0x7a6a40, 0, 0.72, 0),
    ));
    this.root.add(part(m, shadedBox(0.5, 0.06, 0.5, 0x2a2c30, 0, 0.03, 0)), this.body);
  }

  boxes(): HitBox[] {
    return DUMMY_HITBOXES;
  }

  place(x: number, z: number, yaw: number, _state = 0, _speed = 0, _gait = 0, y = 0): void {
    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw;
  }

  /** Rock back from a hit. */
  hit(strength = 1): void {
    this.leanVel += 2.2 * strength;
  }

  /** Topple over (it is removed shortly after). */
  die(): void {
    this.falling = 0.001;
  }

  update(dt: number): void {
    if (this.falling > 0) {
      this.falling = Math.min(1, this.falling + dt * 2.2);
      this.body.rotation.x = (this.falling * this.falling * Math.PI) / 2;
      return;
    }
    this.leanVel += -this.lean * 160 * dt;
    this.leanVel *= 1 - damp(7, dt);
    this.lean += this.leanVel * dt;
    this.body.rotation.x = this.lean;
  }

  setLight(rgb: [number, number, number]): void {
    this.material.color.setRGB(Math.min(rgb[0], 1.6), Math.min(rgb[1], 1.6), Math.min(rgb[2], 1.6));
  }

  dispose(): void {
    this.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.material.dispose();
  }
}
