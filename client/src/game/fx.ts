import * as THREE from 'three';
import type { EntityId, ProjectileSnap } from '@zh/shared';
import { damp } from '../models/rig';

const MAX_PARTICLES = 160;
const MAX_TRACERS = 24;
const GRAVITY = 9;

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number;
  ttl: number;
  size: number;
}

interface Tracer {
  mesh: THREE.Mesh;
  life: number;
}

interface Blast {
  mesh: THREE.Mesh;
  t: number;
  radius: number;
}

/** Short-lived combat effects: tracers, flash lights, impact puffs, explosions, thrown projectiles. */
export class Fx {
  private readonly particles: Particle[] = [];
  private readonly inst: THREE.InstancedMesh;
  private readonly tracers: Tracer[] = [];
  private readonly lights: THREE.PointLight[] = [];
  private readonly blasts: Blast[] = [];
  private readonly projectiles = new Map<EntityId, { mesh: THREE.Mesh; tx: number; ty: number; tz: number }>();
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly colour = new THREE.Color();
  private readonly projGeo = new THREE.BoxGeometry(0.1, 0.13, 0.1);
  private readonly projMat = new THREE.MeshBasicMaterial({ color: 0x2c3a22 });
  private nextLight = 0;

  constructor(private readonly scene: THREE.Scene) {
    this.inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), MAX_PARTICLES);
    this.inst.frustumCulled = false;
    this.inst.count = 0;
    this.inst.setColorAt(0, this.colour.set(0xffffff));
    scene.add(this.inst);
    const tGeo = new THREE.BoxGeometry(0.014, 0.014, 1);
    const tMat = new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    for (let i = 0; i < MAX_TRACERS; i++) {
      const mesh = new THREE.Mesh(tGeo, tMat);
      mesh.visible = false;
      scene.add(mesh);
      this.tracers.push({ mesh, life: 0 });
    }
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(0xffb060, 0, 11, 1.6);
      scene.add(l);
      this.lights.push(l);
    }
    const bGeo = new THREE.IcosahedronGeometry(1, 1);
    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(bGeo, new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
      mesh.visible = false;
      scene.add(mesh);
      this.blasts.push({ mesh, t: 1, radius: 1 });
    }
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3): void {
    const t = this.tracers.find((x) => x.life <= 0) ?? this.tracers[0]!;
    const len = from.distanceTo(to);
    if (len < 0.3) return;
    t.life = 0.07;
    t.mesh.visible = true;
    t.mesh.position.copy(from).lerp(to, 0.5);
    t.mesh.lookAt(to);
    t.mesh.scale.set(1, 1, len);
  }

  /** A brief point light (muzzle flash, explosion). */
  flash(x: number, y: number, z: number, intensity = 9): void {
    const l = this.lights[this.nextLight++ % this.lights.length]!;
    l.position.set(x, y, z);
    l.intensity = intensity;
  }

  /** A burst of little boxes. */
  puff(x: number, y: number, z: number, hex: number, count = 5, speed = 1.6, size = 0.035, ttl = 0.35): void {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      const a = Math.random() * Math.PI * 2;
      const up = Math.random();
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({
        x, y, z, vx: Math.cos(a) * sp * (1 - up * 0.5), vy: sp * (0.3 + up), vz: Math.sin(a) * sp * (1 - up * 0.5),
        life: ttl * (0.6 + Math.random() * 0.6), ttl, size: size * (0.6 + Math.random() * 0.8),
      });
      this.inst.setColorAt(this.particles.length - 1, this.colour.set(hex).multiplyScalar(0.7 + Math.random() * 0.5));
    }
  }

  explosion(x: number, y: number, z: number, radius: number): void {
    const b = this.blasts.reduce((a, c) => (c.t > a.t ? c : a));
    b.t = 0;
    b.radius = radius;
    b.mesh.position.set(x, Math.max(y, 0.3), z);
    b.mesh.visible = true;
    this.flash(x, Math.max(y, 0.6), z, 60);
    this.puff(x, y + 0.2, z, 0xff9a30, 16, 7, 0.12, 0.5);
    this.puff(x, y + 0.2, z, 0x3a3632, 18, 4.5, 0.1, 0.9);
  }

  /** Server-simulated projectiles from the latest snapshot. */
  setProjectiles(list: ProjectileSnap[]): void {
    const seen = new Set<EntityId>();
    for (const [id, , x, y, z] of list) {
      seen.add(id);
      let p = this.projectiles.get(id);
      if (!p) {
        p = { mesh: new THREE.Mesh(this.projGeo, this.projMat), tx: x, ty: y, tz: z };
        p.mesh.position.set(x, y, z);
        this.scene.add(p.mesh);
        this.projectiles.set(id, p);
      }
      p.tx = x;
      p.ty = y;
      p.tz = z;
    }
    for (const [id, p] of this.projectiles) {
      if (seen.has(id)) continue;
      this.scene.remove(p.mesh);
      this.projectiles.delete(id);
    }
  }

  update(dt: number): void {
    for (const t of this.tracers) {
      if (t.life > 0 && (t.life -= dt) <= 0) t.mesh.visible = false;
    }
    for (const l of this.lights) l.intensity = l.intensity < 0.05 ? 0 : l.intensity * (1 - damp(28, dt));
    for (const b of this.blasts) {
      if (b.t >= 1) continue;
      b.t = Math.min(1, b.t + dt / 0.28);
      b.mesh.visible = b.t < 1;
      b.mesh.scale.setScalar(b.radius * (0.15 + 0.5 * Math.sqrt(b.t)));
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - b.t) * 0.9;
    }
    for (const p of this.projectiles.values()) {
      const k = damp(22, dt);
      p.mesh.position.x += (p.tx - p.mesh.position.x) * k;
      p.mesh.position.y += (p.ty - p.mesh.position.y) * k;
      p.mesh.position.z += (p.tz - p.mesh.position.z) * k;
      p.mesh.rotation.x += dt * 9;
      p.mesh.rotation.z += dt * 6;
    }
    // Particles: compact the live ones to the front of the instance buffer.
    let n = 0;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i]!;
      if ((p.life -= dt) <= 0) continue;
      p.vy -= GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.02) {
        p.y = 0.02;
        p.vy *= -0.3;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
      if (n !== i) {
        this.particles[n] = p;
        this.inst.getColorAt(i, this.colour);
        this.inst.setColorAt(n, this.colour);
      }
      const sz = p.size * Math.min(1, (p.life / p.ttl) * 2);
      this.inst.setMatrixAt(n, this.m4.compose(this.v.set(p.x, p.y, p.z), this.q, this.s.setScalar(sz)));
      n++;
    }
    this.particles.length = n;
    this.inst.count = n;
    this.inst.instanceMatrix.needsUpdate = true;
    if (this.inst.instanceColor) this.inst.instanceColor.needsUpdate = true;
  }

  /** For tests/debug. */
  get counts(): { particles: number; tracers: number; projectiles: number } {
    return { particles: this.particles.length, tracers: this.tracers.filter((t) => t.life > 0).length, projectiles: this.projectiles.size };
  }
}
