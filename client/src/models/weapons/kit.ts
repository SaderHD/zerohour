import * as THREE from 'three';
import { modelMaterial, part, shadedBox, shadedCyl, type Rot } from '../rig';

/** Gun palette. */
export const C = {
  metal: 0x30343b, dark: 0x17191d, steel: 0x666c75, wood: 0x6e4424, woodDark: 0x4a2c18,
  brass: 0xb08a3a, sleeve: 0x4a5a34, glove: 0x25241f, olive: 0x3d4a30, rubber: 0x101012, glass: 0x2a5a78,
};

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

  constructor(private readonly hands: boolean) {}

  box(w: number, h: number, d: number, hex: number, x: number, y: number, z: number, rot?: Rot): this {
    this.body.push(shadedBox(w, h, d, hex, x, y, z, rot));
    return this;
  }

  cyl(r: number, len: number, hex: number, x: number, y: number, z: number, sides = 6, axis: 'x' | 'y' | 'z' = 'z'): this {
    this.body.push(shadedCyl(r, len, sides, hex, x, y, z, axis));
    return this;
  }

  mag(w: number, h: number, d: number, hex: number, x: number, y: number, z: number, rot?: Rot): this {
    this.magG.push(shadedBox(w, h, d, hex, x, y, z, rot));
    return this;
  }

  magCyl(r: number, len: number, hex: number, x: number, y: number, z: number, sides = 6, axis: 'x' | 'y' | 'z' = 'z'): this {
    this.magG.push(shadedCyl(r, len, sides, hex, x, y, z, axis));
    return this;
  }

  slide(w: number, h: number, d: number, hex: number, x: number, y: number, z: number, rot?: Rot): this {
    this.slideG.push(shadedBox(w, h, d, hex, x, y, z, rot));
    return this;
  }

  build(spec: BuildSpec): WeaponModel {
    const material = modelMaterial();
    const group = new THREE.Group();
    if (this.hands) {
      this.box(0.052, 0.08, 0.062, C.glove, 0.004, -0.06, 0.04, [0.2, 0, 0]);
      this.box(0.07, 0.07, 0.36, C.sleeve, 0.05, -0.15, 0.25, [0.38, 0.2, 0]);
      if (spec.fore) {
        const [fy, fz] = spec.fore;
        this.box(0.06, 0.05, 0.085, C.glove, -0.004, fy - 0.03, fz);
        this.box(0.07, 0.07, 0.4, C.sleeve, -0.11, fy - 0.13, fz + 0.2, [0.42, -0.5, 0]);
      }
    }
    group.add(part(material, ...this.body));
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
