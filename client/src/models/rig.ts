import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Building blocks for code-drawn low-poly models. Dynamic models are lit by a white ambient
// only, so each box bakes simple per-face shading into its vertex colours; the model's material
// colour is then set every frame from the world's baked light at its position (World.lightAt).

const FACE_SHADE = { top: 1, bottom: 0.5, side: 0.8, front: 0.93, back: 0.68 };

/** A box with baked face shading. Position is the box centre in the part's local space. */
export function shadedBox(w: number, h: number, d: number, hex: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.translate(x, y, z);
  const base = new THREE.Color(hex);
  const n = g.getAttribute('normal');
  const col = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i++) {
    const ny = n.getY(i);
    const nz = n.getZ(i);
    const s = ny > 0.5 ? FACE_SHADE.top : ny < -0.5 ? FACE_SHADE.bottom : nz < -0.5 ? FACE_SHADE.front : nz > 0.5 ? FACE_SHADE.back : FACE_SHADE.side;
    col[i * 3] = base.r * s;
    col[i * 3 + 1] = base.g * s;
    col[i * 3 + 2] = base.b * s;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
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
