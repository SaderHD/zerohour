import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Building blocks for code-drawn low-poly models. Dynamic models are lit by a white ambient
// only, so each box bakes simple per-face shading into its vertex colours; the model's material
// colour is then set every frame from the world's baked light at its position (World.lightAt).

const FACE_SHADE = { top: 1, bottom: 0.5, side: 0.8, front: 0.93, back: 0.68 };

export type Rot = [number, number, number];

function bake(g: THREE.BufferGeometry, hex: number, shadeOf: (nx: number, ny: number, nz: number) => number): void {
  const base = new THREE.Color(hex);
  const n = g.getAttribute('normal');
  const col = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i++) {
    const s = shadeOf(n.getX(i), n.getY(i), n.getZ(i));
    col[i * 3] = base.r * s;
    col[i * 3 + 1] = base.g * s;
    col[i * 3 + 2] = base.b * s;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
}

function place(g: THREE.BufferGeometry, x: number, y: number, z: number, rot?: Rot): THREE.BufferGeometry {
  if (rot) g.rotateX(rot[0]).rotateY(rot[1]).rotateZ(rot[2]);
  return g.translate(x, y, z);
}

/**
 * A box with baked face shading. Position is the box centre in the part's local space; the
 * optional rotation (applied about the centre, X then Y then Z) keeps the unrotated shading.
 */
export function shadedBox(w: number, h: number, d: number, hex: number, x = 0, y = 0, z = 0, rot?: Rot): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  bake(g, hex, (_nx, ny, nz) => (ny > 0.5 ? FACE_SHADE.top : ny < -0.5 ? FACE_SHADE.bottom : nz < -0.5 ? FACE_SHADE.front : nz > 0.5 ? FACE_SHADE.back : FACE_SHADE.side));
  return place(g, x, y, z, rot);
}

/** A flat-shaded prism (<= 8 sides) lying along the given axis. */
export function shadedCyl(radius: number, length: number, sides: number, hex: number, x = 0, y = 0, z = 0, axis: 'x' | 'y' | 'z' = 'z'): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(radius, radius, length, sides).toNonIndexed();
  if (axis === 'z') g.rotateX(Math.PI / 2);
  else if (axis === 'x') g.rotateZ(Math.PI / 2);
  g.computeVertexNormals();
  bake(g, hex, (_nx, ny, nz) => 0.76 + 0.24 * ny - 0.1 * nz);
  return place(g, x, y, z);
}

/** Merge boxes into one mesh. */
export function part(material: THREE.Material, ...boxes: THREE.BufferGeometry[]): THREE.Mesh {
  const geo = boxes.length === 1 ? boxes[0]! : mergeGeometries(boxes);
  return new THREE.Mesh(geo, material);
}

/** An empty joint at a position, with children hanging off it. */
export function pivot(x: number, y: number, z: number, ...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  for (const c of children) g.add(c);
  return g;
}

export const modelMaterial = (): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial({ vertexColors: true });

/** Exponential smoothing factor for frame-rate independent lerps. */
export const damp = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);
