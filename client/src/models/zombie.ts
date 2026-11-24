import * as THREE from 'three';
import { Rng, ZOMBIE_ATTACK_WINDUP, ZOMBIE_SPEED_RUN, ZOMBIE_SPEED_WALK, ZOMBIE_VAULT_SECONDS, ZombieState, clamp, isCrawlState, lerp } from '@zh/shared';
import type { EntityModel, HitBox } from './dummy';
import { damp } from './rig';
import { Part, RIG, type ZombieHorde } from './zombieHorde';

const SKIN = [0x8fa08a, 0xa8a898, 0x7c9098, 0xb0a084, 0x90887c];
const SHIRT = [0x6a5a48, 0x4a5a6a, 0x705050, 0x5a6248, 0x8a8478, 0x3c4450, 0x6e6a3a];
const PANTS = [0x33363e, 0x3e3628, 0x2c3a34, 0x4a4238];
const EYES = [0xffc040, 0xffa020, 0xff5028, 0xe8ff60];
const DEATH_SECONDS = 2.6;
const SINK_SECONDS = 0.7;

const STANDING: HitBox[] = [
  { zone: 'head', c: [0, 1.66, -0.03], h: [0.14, 0.14, 0.15] },
  { zone: 'torso', c: [0, 1.22, 0], h: [0.21, 0.32, 0.14] },
  { zone: 'limb', c: [-0.3, 1.25, -0.14], h: [0.07, 0.28, 0.24] },
  { zone: 'limb', c: [0.3, 1.25, -0.14], h: [0.07, 0.28, 0.24] },
  { zone: 'limb', c: [0, 0.45, 0], h: [0.17, 0.45, 0.12] },
];
const CRAWLING: HitBox[] = [
  { zone: 'head', c: [0, 0.4, -0.7], h: [0.15, 0.15, 0.15] },
  { zone: 'torso', c: [0, 0.26, -0.3], h: [0.22, 0.17, 0.3] },
  { zone: 'limb', c: [0, 0.2, -0.95], h: [0.3, 0.14, 0.2] },
  { zone: 'limb', c: [0, 0.16, 0.5], h: [0.2, 0.14, 0.5] },
];
const scaled = (boxes: HitBox[], s: number): HitBox[] =>
  boxes.map((b) => ({ zone: b.zone, c: [b.c[0] * s, b.c[1] * s, b.c[2] * s], h: [b.h[0] * s, b.h[1] * s, b.h[2] * s] }));

const joint = (parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group => {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
};

/**
 * One zombie: a box rig posed in code every frame and drawn through the shared ZombieHorde.
 * Faces -z at yaw 0, origin at the feet. Looks (height, colours, a missing arm, head tilt, limp)
 * come from the seed, so every client sees the same zombie.
 */
export class ZombieActor implements EntityModel {
  readonly deathSeconds = DEATH_SECONDS;
  readonly blood = 0x8a1a12;
  private readonly root = new THREE.Group();
  private readonly body = joint(this.root, 0, RIG.hipY, 0);
  private readonly torso = joint(this.body, 0, RIG.pelvisH, 0);
  private readonly head = joint(this.torso, 0, RIG.torsoH, 0);
  private readonly shoulder = [joint(this.torso, -RIG.shoulderX, RIG.shoulderY, 0), joint(this.torso, RIG.shoulderX, RIG.shoulderY, 0)] as const;
  private readonly elbow = [joint(this.shoulder[0], 0, -RIG.upperArm, 0), joint(this.shoulder[1], 0, -RIG.upperArm, 0)] as const;
  private readonly hip = [joint(this.body, -RIG.hipX, 0, 0), joint(this.body, RIG.hipX, 0, 0)] as const;
  private readonly knee = [joint(this.hip[0], 0, -RIG.upperLeg, 0), joint(this.hip[1], 0, -RIG.upperLeg, 0)] as const;
  private readonly skin: THREE.Color;
  private readonly shirt: THREE.Color;
  private readonly pants: THREE.Color;
  private readonly eyes: THREE.Color;
  private readonly sleeves: boolean;
  /** -1 none, 0 left, 1 right. */
  private readonly missingArm: number;
  private readonly height: number;
  private readonly headTilt: number;
  private readonly limp: number;
  private readonly fallBack: boolean;
  private readonly standBoxes: HitBox[];
  private readonly crawlBoxes: HitBox[];
  private readonly light = new THREE.Color(1, 1, 1);
  private readonly tmp = new THREE.Color();
  private state = ZombieState.Approach;
  private stateT = 0;
  private speed = 0;
  private gait = 1;
  private phase: number;
  private amp = 0;
  private time: number;
  private flinch = 0;
  private flinchVel = 0;
  private dead = -1;
  private lean = 0;

  constructor(seed: number, private readonly horde: ZombieHorde) {
    const rng = new Rng(seed * 2654435761);
    this.height = rng.range(0.92, 1.08);
    this.root.scale.set(this.height * rng.range(0.92, 1.14), this.height, this.height * rng.range(0.95, 1.1));
    this.skin = new THREE.Color(rng.pick(SKIN));
    this.shirt = new THREE.Color(rng.pick(SHIRT));
    this.pants = new THREE.Color(rng.pick(PANTS));
    this.eyes = new THREE.Color(rng.pick(EYES));
    this.sleeves = rng.chance(0.6);
    this.missingArm = rng.chance(0.18) ? rng.int(0, 1) : -1;
    this.headTilt = rng.range(-0.35, 0.35);
    this.limp = rng.chance(0.4) ? rng.range(0.35, 0.7) : 1;
    this.fallBack = rng.chance(0.6);
    this.phase = rng.range(0, 6.28);
    this.time = rng.range(0, 10);
    this.standBoxes = scaled(STANDING, this.height);
    this.crawlBoxes = scaled(CRAWLING, this.height);
  }

  boxes(): HitBox[] {
    return isCrawlState(this.state) ? this.crawlBoxes : this.standBoxes;
  }

  place(x: number, z: number, yaw: number, state: number, speed: number, gait: number): void {
    this.root.position.set(x, 0, z);
    this.root.rotation.y = yaw;
    if (this.dead >= 0) return;
    if (state !== this.state) {
      this.state = state;
      this.stateT = 0;
    }
    this.speed = speed;
    this.gait = gait;
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
    const { body, torso, head, shoulder, elbow, hip, knee } = this;
    const crawl = isCrawlState(this.state);
    const runK = clamp((this.gait - ZOMBIE_SPEED_WALK) / (ZOMBIE_SPEED_RUN - ZOMBIE_SPEED_WALK), 0, 1);
    const walkK = clamp((this.gait - 1) / (ZOMBIE_SPEED_WALK - 1), 0, 1);
    const moving = this.dead >= 0 ? 0 : this.speed;
    this.amp += (clamp(moving / Math.max(this.gait, 0.6), 0, 1.2) - this.amp) * damp(8, dt);
    this.phase += moving * dt * lerp(lerp(4.2, 2.9, walkK), 2.1, runK);
    const sw = Math.sin(this.phase);
    const cw = Math.cos(this.phase);
    const a = this.amp;
    const idle = Math.sin(this.time * 1.7);

    // Upright gait: shamble -> walk -> run.
    let bodyY = RIG.hipY - Math.abs(cw) * 0.03 * a;
    let lean = -(0.1 + 0.08 * walkK + 0.3 * runK) + idle * 0.02;
    let roll = sw * 0.09 * a * (1 - runK * 0.6);
    const legAmp = (0.38 + 0.2 * walkK + 0.4 * runK) * a;
    let hipL = sw * legAmp;
    let hipR = -sw * legAmp * this.limp;
    let kneeL = -Math.max(0, -cw) * legAmp * 1.3 - 0.08;
    let kneeR = -Math.max(0, cw) * legAmp * 1.3 * this.limp - 0.08;
    const reach = 0.35 + 0.75 * walkK + 0.2 * runK;
    let armL = reach + 0.25 - sw * 0.2 * a + idle * 0.05;
    let armR = reach + 0.6 + sw * 0.2 * a - idle * 0.05;
    let foreL = 0.35;
    let foreR = 0.2;
    let splay = 0.06;
    let headX = -lean * 0.7 + idle * 0.04;
    let twist = sw * 0.12 * a;

    if (this.state === ZombieState.Tear) {
      const pull = Math.sin(this.time * 7);
      lean = -0.22 + pull * 0.05;
      armL = 1.45 + pull * 0.3;
      armR = 1.45 - pull * 0.3;
      foreL = foreR = 0.3;
      twist = pull * 0.15;
    } else if (this.state === ZombieState.Vault) {
      const k = Math.sin(Math.PI * clamp(this.stateT / ZOMBIE_VAULT_SECONDS, 0, 1));
      bodyY += k * 0.45;
      lean = -0.2 - k * 0.9;
      armL = armR = 1.5 + k * 0.5;
      hipL = k * 1.0;
      hipR = k * 0.6;
      kneeL = -k * 1.3;
      kneeR = -k * 1.0;
      headX = k * 0.6;
    } else if (this.state === ZombieState.Attack) {
      // Wind up (arms overhead), then slam down as the hit lands.
      const k = this.stateT / ZOMBIE_ATTACK_WINDUP;
      const up = k < 0.7 ? k / 0.7 : Math.max(0, 1 - (k - 0.7) / 0.25);
      const struck = clamp((k - 0.7) / 0.25, 0, 1);
      armL = armR = lerp(1.2, 2.75, up) - struck * 0.5 * (1 - up);
      foreL = foreR = 0.5 - up * 0.3;
      lean = 0.12 * up - 0.4 * struck * (1 - up * 0.5);
      headX = -lean * 0.5;
    }
    if (crawl) {
      // Prone: dragging itself forward on its arms, legs trailing.
      const pullK = this.state === ZombieState.CrawlAttack ? 0 : a;
      bodyY = 0.2 + Math.abs(sw) * 0.03 * pullK;
      lean = -1.42;
      roll = sw * 0.12 * pullK;
      twist = sw * 0.2 * pullK;
      armL = 2.85 + sw * 0.45 * pullK;
      armR = 2.85 - sw * 0.45 * pullK;
      foreL = 0.5 - sw * 0.4 * pullK;
      foreR = 0.5 + sw * 0.4 * pullK;
      splay = 0.3;
      hipL = 0.08 + sw * 0.06;
      hipR = 0.02 - sw * 0.06;
      kneeL = kneeR = -0.08;
      headX = 1.05 + idle * 0.05;
      if (this.state === ZombieState.CrawlAttack) {
        const k = clamp(this.stateT / ZOMBIE_ATTACK_WINDUP, 0, 1.3);
        armR = k < 0.7 ? lerp(2.85, 2.1, k / 0.7) : lerp(2.1, 3.1, clamp((k - 0.7) / 0.25, 0, 1));
        foreR = 0.2;
      }
    }

    let sink = 0;
    if (this.dead >= 0) {
      this.dead += dt;
      const k = Math.min(1, this.dead / 0.5) ** 2;
      const flat = crawl ? -1.57 : this.fallBack ? 1.5 : -1.52;
      lean = lerp(this.lean, flat, k);
      bodyY = lerp(bodyY, crawl ? 0.12 : 0.13, k);
      roll *= 1 - k;
      twist *= 1 - k;
      splay = lerp(splay, 0.7, k);
      armL = lerp(armL, crawl ? 2.9 : 0.5, k);
      armR = lerp(armR, crawl ? 2.6 : 0.2, k);
      hipL = lerp(hipL, 0.15, k);
      hipR = lerp(hipR, -0.1, k);
      kneeL = lerp(kneeL, -0.2, k);
      kneeR = lerp(kneeR, -0.05, k);
      headX = lerp(headX, 0.2, k);
      sink = Math.max(0, this.dead - (DEATH_SECONDS - SINK_SECONDS)) / SINK_SECONDS * 0.45;
    } else this.lean = lean;

    body.position.y = bodyY - sink;
    body.rotation.set(lean, twist, roll);
    torso.rotation.set(this.flinch * 0.5, -twist * 0.5, 0);
    head.rotation.set(headX + this.flinch * 0.4, 0, this.headTilt);
    shoulder[0].rotation.set(armL, 0, -splay);
    shoulder[1].rotation.set(armR, 0, splay);
    elbow[0].rotation.x = foreL;
    elbow[1].rotation.x = foreR;
    hip[0].rotation.x = hipL;
    hip[1].rotation.x = hipR;
    knee[0].rotation.x = kneeL;
    knee[1].rotation.x = kneeR;
  }

  private write(): void {
    const { horde, tmp, light } = this;
    const lit = (c: THREE.Color) => tmp.copy(c).multiply(light);
    horde.add(Part.Pelvis, this.body.matrixWorld, lit(this.pants));
    horde.add(Part.Torso, this.torso.matrixWorld, lit(this.shirt));
    horde.add(Part.Head, this.head.matrixWorld, lit(this.skin));
    // Eyes glow on their own, flickering a little, and go out in death.
    const glow = this.dead >= 0 ? Math.max(0, 1 - this.dead * 2) : 0.85 + 0.15 * Math.sin(this.time * 9);
    if (glow > 0) horde.add(Part.Eyes, this.head.matrixWorld, tmp.copy(this.eyes).multiplyScalar(glow));
    for (let s = 0; s < 2; s++) {
      if (s !== this.missingArm) {
        horde.add(Part.UpperArm, this.shoulder[s]!.matrixWorld, lit(this.sleeves ? this.shirt : this.skin));
        horde.add(Part.LowerArm, this.elbow[s]!.matrixWorld, lit(this.skin));
      }
      horde.add(Part.UpperLeg, this.hip[s]!.matrixWorld, lit(this.pants));
      horde.add(Part.LowerLeg, this.knee[s]!.matrixWorld, lit(this.pants));
    }
  }

  dispose(): void {
    // Nothing of its own on the GPU: the horde owns the meshes.
  }
}
