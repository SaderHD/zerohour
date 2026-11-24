import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { modelMaterial, shadedBox } from './rig';

/** Body parts, each drawn as one instanced mesh shared by every zombie (8 draw calls for the horde). */
export const enum Part {
  Pelvis, Torso, Head, Eyes, UpperArm, LowerArm, UpperLeg, LowerLeg,
}

/** Rig dimensions in metres for a zombie of height scale 1. Geometry is authored relative to each joint. */
export const RIG = {
  hipY: 0.9, pelvisH: 0.14, torsoH: 0.5, shoulderX: 0.25, shoulderY: 0.44, hipX: 0.085,
  upperArm: 0.3, lowerArm: 0.32, upperLeg: 0.45, lowerLeg: 0.45,
};

const BODIES = 72;
const BONE = 0xe6e6e6; // near-white: the instance colour supplies skin and cloth
const PER_BODY = [1, 1, 1, 1, 2, 2, 2, 2];

function eyes(): THREE.BufferGeometry {
  const one = (x: number) => new THREE.PlaneGeometry(0.044, 0.028).rotateY(Math.PI).translate(x, 0.14, -0.108);
  const g = mergeGeometries([one(-0.052), one(0.052)]);
  g.deleteAttribute('uv');
  return g;
}

function geometries(): THREE.BufferGeometry[] {
  return [
    shadedBox(0.3, RIG.pelvisH, 0.18, BONE, 0, RIG.pelvisH / 2, 0),
    shadedBox(0.38, RIG.torsoH, 0.2, BONE, 0, RIG.torsoH / 2, 0),
    mergeGeometries([shadedBox(0.2, 0.22, 0.21, BONE, 0, 0.13, 0), shadedBox(0.215, 0.07, 0.225, 0x4a4038, 0, 0.225, 0.004)]),
    eyes(),
    shadedBox(0.1, RIG.upperArm, 0.1, BONE, 0, -RIG.upperArm / 2, 0),
    shadedBox(0.085, RIG.lowerArm, 0.085, BONE, 0, -RIG.lowerArm / 2, 0),
    shadedBox(0.14, RIG.upperLeg, 0.15, BONE, 0, -RIG.upperLeg / 2, 0),
    shadedBox(0.12, RIG.lowerLeg, 0.13, BONE, 0, -RIG.lowerLeg / 2, 0),
  ];
}

/**
 * Draws every zombie with a handful of instanced meshes. Each frame: `begin()`, every zombie
 * `add()`s its part matrices and colours, then `end()`.
 */
export class ZombieHorde {
  private readonly meshes: THREE.InstancedMesh[];
  private readonly counts = new Array<number>(PER_BODY.length).fill(0);
  private readonly material = modelMaterial();
  private readonly eyeMaterial = new THREE.MeshBasicMaterial();

  constructor(private readonly scene: THREE.Scene) {
    this.meshes = geometries().map((geo, part) => {
      const mesh = new THREE.InstancedMesh(geo, part === Part.Eyes ? this.eyeMaterial : this.material, BODIES * PER_BODY[part]!);
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.setColorAt(0, new THREE.Color(0xffffff));
      mesh.name = `zombies:${part}`;
      scene.add(mesh);
      return mesh;
    });
  }

  begin(): void {
    this.counts.fill(0);
  }

  add(part: Part, matrix: THREE.Matrix4, colour: THREE.Color): void {
    const mesh = this.meshes[part]!;
    const i = this.counts[part]!;
    if (i >= mesh.instanceMatrix.count) return;
    mesh.setMatrixAt(i, matrix);
    mesh.setColorAt(i, colour);
    this.counts[part] = i + 1;
  }

  end(): void {
    this.meshes.forEach((mesh, part) => {
      mesh.count = this.counts[part]!;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this.material.dispose();
    this.eyeMaterial.dispose();
  }
}
