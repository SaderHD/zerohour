import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { modelMaterial, part, shadedBox, shadedCyl, type Rot } from '../rig';

/** Gun palette. */
export const C = {
  metal: 0x30343b, dark: 0x17191d, steel: 0x666c75, wood: 0x6e4424, woodDark: 0x4a2c18,
  brass: 0xb08a3a, sleeve: 0x4a5a34, glove: 0x25241f, olive: 0x3d4a30, rubber: 0x101012, glass: 0x2a5a78,
};

/** The Forge's finish, and the trim that glows on it whatever the light. */
const FORGED_FINISH = new THREE.Color(0x4a3890);
const SCRATCH = new THREE.Color();
const TRIM_MATERIAL = new THREE.MeshBasicMaterial({ color: 0xc8a0ff });

export interface WeaponModel {
  group: THREE.Group;
  material: THREE.MeshLambertMaterial;
  muzzle: THREE.Object3D;
  /** Magazine (or cylinder); drops out during a reload. */
  mag: THREE.Object3D | null;
  /** Slide, bolt handle or pump. */
  slide: THREE.Object3D | null;
  /** `blowback`: the slide snaps back with each shot. `pump`: it is racked after the shot. */
  action: 'blowback' | 'pump' | 'none';
  slideTravel: number;
  /** Height of the sight line above the model origin (for aiming down sights). */
  sightY: number;
  twoHanded: boolean;
}

export interface BuildSpec {
  muzzle: [number, number, number];
  sightY: number;
  action?: WeaponModel['action'];
  slideTravel?: number;
  /** Where the support hand holds the fore-end; omit for one-handed guns. */
  fore?: [number, number];
}

/**
 * Collects boxes for one gun. The gun points down -z with its origin at the top of the grip.
 * `hands` adds first-person gloves and sleeves (left off for third-person models).
 */
export class Kit {
  private readonly body: THREE.BufferGeometry[] = [];
  private readonly magG: THREE.BufferGeometry[] = [];
  private readonly slideG: THREE.BufferGeometry[] = [];
  /** Every box of the gun itself as [half width from the centre line, y, half height, z, half depth]. */
  private readonly extents: [number, number, number, number, number][] = [];

  /** `upgraded`: the Forge's work - the same gun in a dark violet finish with glowing trim. */
  constructor(private readonly hands: boolean, private readonly upgraded = false) {}

  private hue(hex: number): number {
    return this.upgraded ? SCRATCH.set(hex).lerp(FORGED_FINISH, 0.6).multiplyScalar(1.15).getHex() : hex;
  }

  private note(w: number, h: number, d: number, x: number, y: number, z: number): void {
    this.extents.push([Math.abs(x) + w / 2, y, h / 2, z, d / 2]);
  }

  box(w: number, h: number, d: number, hex: number, x: number, y: number, z: number, rot?: Rot): this {
    this.body.push(shadedBox(w, h, d, this.hue(hex), x, y, z, rot));
    this.note(w, h, d, x, y, z);
    return this;
  }

  cyl(r: number, len: number, hex: number, x: number, y: number, z: number, sides = 6, axis: 'x' | 'y' | 'z' = 'z'): this {
    this.body.push(shadedCyl(r, len, sides, this.hue(hex), x, y, z, axis));
    if (axis === 'z') this.note(r * 2, r * 2, len, x, y, z);
    return this;
  }

  mag(w: number, h: number, d: number, hex: number, x: number, y: number, z: number, rot?: Rot): this {
    this.magG.push(shadedBox(w, h, d, this.hue(hex), x, y, z, rot));
    return this;
  }

  magCyl(r: number, len: number, hex: number, x: number, y: number, z: number, sides = 6, axis: 'x' | 'y' | 'z' = 'z'): this {
    this.magG.push(shadedCyl(r, len, sides, this.hue(hex), x, y, z, axis));
    return this;
  }

  slide(w: number, h: number, d: number, hex: number, x: number, y: number, z: number, rot?: Rot): this {
    this.slideG.push(shadedBox(w, h, d, this.hue(hex), x, y, z, rot));
    this.note(w, h, d, x, y, z);
    return this;
  }

  /**
   * Glowing strips down both flanks at barrel height, each stretch standing just proud of
   * whatever part of the gun is widest there.
   */
  private trim(muzzle: [number, number, number]): THREE.Mesh {
    const [, my, mz] = muzzle;
    const strips: THREE.BufferGeometry[] = [];
    const step = 0.03;
    for (let z = 0.04; z > mz + step; z -= step) {
      let half = 0;
      for (const [hw, y, hh, cz, hd] of this.extents) {
        if (Math.abs(y - my) <= hh + 0.004 && Math.abs(cz - (z - step / 2)) <= hd) half = Math.max(half, hw);
      }
      if (half === 0) continue;
      for (const side of [-1, 1]) strips.push(new THREE.BoxGeometry(0.003, 0.007, step).translate(side * (half + 0.0015), my, z - step / 2));
    }
    strips.push(new THREE.BoxGeometry(0.012, 0.012, 0.004).translate(0, my, mz + 0.001));
    const mesh = new THREE.Mesh(mergeGeometries(strips), TRIM_MATERIAL);
    mesh.name = 'trim';
    return mesh;
  }

  build(spec: BuildSpec): WeaponModel {
    const material = modelMaterial();
    const group = new THREE.Group();
    const trim = this.upgraded ? this.trim(spec.muzzle) : null;
    if (this.hands) {
      this.body.push(shadedBox(0.052, 0.08, 0.062, C.glove, 0.004, -0.06, 0.04, [0.2, 0, 0]));
      this.body.push(shadedBox(0.07, 0.07, 0.36, C.sleeve, 0.05, -0.15, 0.25, [0.38, 0.2, 0]));
      if (spec.fore) {
        const [fy, fz] = spec.fore;
        this.body.push(shadedBox(0.06, 0.05, 0.085, C.glove, -0.004, fy - 0.03, fz));
        this.body.push(shadedBox(0.07, 0.07, 0.4, C.sleeve, -0.11, fy - 0.13, fz + 0.2, [0.42, -0.5, 0]));
      }
    }
    group.add(part(material, ...this.body));
    if (trim) group.add(trim);
    const sub = (geos: THREE.BufferGeometry[]): THREE.Object3D | null => {
      if (!geos.length) return null;
      const m = part(material, ...geos);
      group.add(m);
      return m;
    };
    const muzzle = new THREE.Object3D();
    muzzle.position.set(...spec.muzzle);
    group.add(muzzle);
    return {
      group, material, muzzle, mag: sub(this.magG), slide: sub(this.slideG),
      action: spec.action ?? 'none', slideTravel: spec.slideTravel ?? 0, sightY: spec.sightY, twoHanded: !!spec.fore,
    };
  }
}
