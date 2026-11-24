import * as THREE from 'three';

const MAX_SEGMENTS = 160;

interface Segment {
  a: THREE.Vector3;
  b: THREE.Vector3;
  life: number;
  ttl: number;
  width: number;
  colour: number;
}

/**
 * Lightning: the Arclight's bolt and its jumps from body to body, and the strike that announces a
 * howler. Every segment of every bolt is one instance of one additive box.
 */
export class Bolts {
  private readonly segs: Segment[] = [];
  private readonly inst: THREE.InstancedMesh;
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly mid = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly colour = new THREE.Color();
  private static readonly FORWARD = new THREE.Vector3(0, 0, 1);

  constructor(scene: THREE.Scene) {
    const mat = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, MAX_SEGMENTS);
    this.inst.frustumCulled = false;
    this.inst.count = 0;
    this.inst.setColorAt(0, this.colour.set(0xffffff));
    this.inst.name = 'bolts';
    scene.add(this.inst);
  }

  /** A jagged bolt between two points. `jitter` is how far it strays, in metres. */
  arc(from: THREE.Vector3, to: THREE.Vector3, colour = 0x9adfff, width = 0.035, ttl = 0.22, jitter = 0.22): void {
    const len = from.distanceTo(to);
    if (len < 0.05) return;
    const n = Math.max(2, Math.min(8, Math.ceil(len / 1.1)));
    let prev = from.clone();
    for (let i = 1; i <= n; i++) {
      const next = from.clone().lerp(to, i / n);
      if (i < n) next.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(2 * jitter));
      if (this.segs.length >= MAX_SEGMENTS) this.segs.shift();
      this.segs.push({ a: prev, b: next, life: ttl * (0.7 + Math.random() * 0.5), ttl, width, colour });
      prev = next;
    }
  }

  /** Lightning out of the sky onto a spot on the floor, with a couple of forks. */
  /** `y`: the height of the floor it strikes. */
  strike(x: number, z: number, colour = 0xbfe8ff, y = 0): void {
    const ground = new THREE.Vector3(x, y + 0.05, z);
    const sky = new THREE.Vector3(x + (Math.random() - 0.5) * 6, y + 26, z + (Math.random() - 0.5) * 6);
    this.arc(sky, ground, colour, 0.11, 0.6, 0.9);
    for (let i = 0; i < 2; i++) {
      const from = sky.clone().lerp(ground, 0.75 + Math.random() * 0.15);
      this.arc(from, new THREE.Vector3(x + (Math.random() - 0.5) * 3, y + 0.05, z + (Math.random() - 0.5) * 3), colour, 0.05, 0.45, 0.3);
    }
  }

  update(dt: number): void {
    let n = 0;
    for (let i = 0; i < this.segs.length; i++) {
      const s = this.segs[i]!;
      if ((s.life -= dt) <= 0) continue;
      this.segs[n] = s;
      this.dir.copy(s.b).sub(s.a);
      const len = this.dir.length();
      this.q.setFromUnitVectors(Bolts.FORWARD, this.dir.divideScalar(len || 1));
      // It flickers as it fades.
      const k = Math.min(1, (s.life / s.ttl) * 1.6) * (0.75 + Math.random() * 0.25);
      this.inst.setMatrixAt(n, this.m4.compose(this.mid.copy(s.a).add(s.b).multiplyScalar(0.5), this.q, this.s.set(s.width * k, s.width * k, len)));
      this.inst.setColorAt(n, this.colour.set(s.colour).multiplyScalar(k));
      n++;
    }
    this.segs.length = n;
    this.inst.count = n;
    this.inst.instanceMatrix.needsUpdate = true;
    if (this.inst.instanceColor) this.inst.instanceColor.needsUpdate = true;
  }

  /** For tests/debug. */
  get count(): number {
    return this.segs.length;
  }
}
