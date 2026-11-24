import * as THREE from 'three';
import { MARK_SECONDS, type PlayerId } from '@zh/shared';

/** Seat colours, as on the scoreboard. */
const COLOURS = [0xa9d06a, 0x7fb0f0, 0xf08a7a, 0xf0c860];
const HEIGHT = 1.5;

interface Mark {
  id: PlayerId;
  name: string;
  x: number;
  z: number;
  until: number;
  mesh: THREE.Mesh;
  tag: HTMLDivElement;
}

/** A diamond over a thin post, in one geometry so a marker is one draw call. */
function markGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const tri = (a: number[], b: number[], c: number[]): void => void pos.push(...a, ...b, ...c);
  const r = 0.16;
  const top = [0, 0.26, 0];
  const bottom = [0, -0.26, 0];
  const ring = [[r, 0, 0], [0, 0, r], [-r, 0, 0], [0, 0, -r]];
  for (let i = 0; i < 4; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % 4]!;
    tri(top, b, a);
    tri(bottom, a, b);
  }
  // The post: two crossed quads from the diamond down to the floor.
  const w = 0.015;
  for (const [dx, dz] of [[w, 0], [0, w]] as const) {
    const y0 = -HEIGHT;
    const y1 = -0.34;
    tri([-dx, y0, -dz], [dx, y0, dz], [dx, y1, dz]);
    tri([-dx, y0, -dz], [dx, y1, dz], [-dx, y1, -dz]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/**
 * Ping markers: "look here". One per player (a new one replaces the old), a bright diamond in the
 * world with the player's name and the distance under it, seen through walls, gone in a few seconds.
 */
export class Marks {
  private readonly marks = new Map<PlayerId, Mark>();
  private readonly geometry = markGeometry();
  private readonly root = document.getElementById('marks') as HTMLDivElement;
  private readonly v = new THREE.Vector3();

  constructor(private readonly scene: THREE.Scene) {}

  add(id: PlayerId, name: string, seat: number, x: number, z: number, now: number): void {
    this.remove(id);
    const colour = COLOURS[seat % COLOURS.length]!;
    const mat = new THREE.MeshBasicMaterial({ color: colour, fog: false, depthTest: false, transparent: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(this.geometry, mat);
    mesh.position.set(x, HEIGHT, z);
    mesh.renderOrder = 10;
    this.scene.add(mesh);
    const tag = document.createElement('div');
    tag.className = 'mark-tag';
    tag.style.color = `#${colour.toString(16).padStart(6, '0')}`;
    this.root.append(tag);
    this.marks.set(id, { id, name, x, z, until: now + MARK_SECONDS, mesh, tag });
  }

  remove(id: PlayerId): void {
    const m = this.marks.get(id);
    if (!m) return;
    this.scene.remove(m.mesh);
    (m.mesh.material as THREE.Material).dispose();
    m.tag.remove();
    this.marks.delete(id);
  }

  clear(): void {
    for (const id of [...this.marks.keys()]) this.remove(id);
  }

  /** `now` is game time; `px/pz` where we stand (for the distance on the tag). */
  update(now: number, t: number, camera: THREE.Camera, viewW: number, viewH: number, px: number, pz: number): void {
    for (const m of [...this.marks.values()]) {
      const left = m.until - now;
      if (left <= 0) {
        this.remove(m.id);
        continue;
      }
      m.mesh.rotation.y = t * 2.4;
      m.mesh.position.y = HEIGHT + Math.sin(t * 3) * 0.06;
      (m.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, left);
      const v = this.v.set(m.x, HEIGHT + 0.45, m.z).project(camera);
      const visible = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      m.tag.style.display = visible ? 'block' : 'none';
      if (!visible) continue;
      const text = `${m.name} · ${Math.round(Math.hypot(m.x - px, m.z - pz))} m`;
      if (m.tag.textContent !== text) m.tag.textContent = text;
      m.tag.style.opacity = String(Math.min(1, left));
      m.tag.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * viewW}px, ${((1 - v.y) / 2) * viewH}px)`;
    }
  }

  /** For tests. */
  list(): { id: PlayerId; x: number; z: number }[] {
    return [...this.marks.values()].map(({ id, x, z }) => ({ id, x, z }));
  }
}
