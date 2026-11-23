import type * as THREE from 'three';
import type { EntityId, HitZone, ZombieKind, ZombieSnap } from '@zh/shared';
import { DUMMY_HITBOXES, DummyModel, type HitBox } from '../models/dummy';
import { InterpBuffer, type Pose } from '../net/interp';
import type { World } from '../render/worldBuilder';

interface Entity {
  id: EntityId;
  kind: ZombieKind;
  model: DummyModel;
  boxes: HitBox[];
  buffer: InterpBuffer;
  pose: Pose;
  hp: number;
  /** Seconds left of the death animation; 0 while alive. */
  dying: number;
}

export interface EntityHit {
  id: EntityId;
  zone: HitZone;
  dist: number;
  x: number;
  y: number;
  z: number;
}

const DEATH_SECONDS = 1.2;

/**
 * Server-owned enemies as drawn on this client: interpolated models plus the hit boxes our own
 * shots are tested against. Session 4 only has the target dummy; zombies plug in here in session 5.
 */
export class Entities {
  private readonly live = new Map<EntityId, Entity>();
  private readonly dead: Entity[] = [];

  constructor(private readonly scene: THREE.Scene, private readonly world: World) {}

  reset(list: { id: EntityId; kind: ZombieKind; seed: number; x: number; z: number }[]): void {
    for (const e of [...this.live.values(), ...this.dead]) this.discard(e);
    this.live.clear();
    this.dead.length = 0;
    for (const z of list) this.spawn(z.id, z.kind, z.seed, z.x, z.z);
  }

  spawn(id: EntityId, kind: ZombieKind, _seed: number, x: number, z: number): void {
    if (this.live.has(id)) return;
    const model = new DummyModel();
    model.root.position.set(x, 0, z);
    this.scene.add(model.root);
    this.live.set(id, {
      id, kind, model, boxes: DUMMY_HITBOXES, buffer: new InterpBuffer(), hp: 1, dying: 0,
      pose: { x, z, yaw: 0, pitch: 0, state: 0, speed: 0 },
    });
  }

  onSnapshot(time: number, zombies: ZombieSnap[]): void {
    for (const [id, x, z, yaw, state, hp] of zombies) {
      const e = this.live.get(id);
      if (!e) continue;
      e.buffer.push(time, x, z, yaw, 0, state as never);
      e.hp = hp;
    }
  }

  flinch(id: EntityId, strength = 1): void {
    this.live.get(id)?.model.hit(strength);
  }

  die(id: EntityId): void {
    const e = this.live.get(id);
    if (!e) return;
    this.live.delete(id);
    e.dying = DEATH_SECONDS;
    e.hp = 0;
    e.model.die();
    this.dead.push(e);
  }

  update(dt: number, renderTime: number): void {
    for (const e of this.live.values()) {
      e.pose = e.buffer.sample(renderTime) ?? e.pose;
      this.draw(e, dt);
    }
    for (let i = this.dead.length - 1; i >= 0; i--) {
      const e = this.dead[i]!;
      this.draw(e, dt);
      if ((e.dying -= dt) <= 0) {
        this.discard(e);
        this.dead.splice(i, 1);
      }
    }
  }

  private draw(e: Entity, dt: number): void {
    e.model.root.position.set(e.pose.x, 0, e.pose.z);
    e.model.root.rotation.y = e.pose.yaw;
    e.model.update(dt);
    e.model.setLight(this.world.lightAt(e.pose.x, 1, e.pose.z));
  }

  private discard(e: Entity): void {
    this.scene.remove(e.model.root);
    e.model.dispose();
  }

  /** Everything a ray passes through within `max`, nearest first (one entry per entity). */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): EntityHit[] {
    const hits: EntityHit[] = [];
    for (const e of this.live.values()) {
      const px = ox - e.pose.x;
      const pz = oz - e.pose.z;
      // Cheap reject: closest approach of the ray to the entity's vertical axis.
      const along = -(px * dx + pz * dz);
      if (along < -1 || along > max + 1) continue;
      // Into the entity's local frame (undo its yaw).
      const c = Math.cos(e.pose.yaw);
      const s = Math.sin(e.pose.yaw);
      const lo = [px * c - pz * s, oy, px * s + pz * c] as const;
      const ld = [dx * c - dz * s, dy, dx * s + dz * c] as const;
      let best = Infinity;
      let zone: HitZone = 'torso';
      for (const b of e.boxes) {
        let t0 = 0;
        let t1 = max;
        for (let a = 0; a < 3 && t0 <= t1; a++) {
          const min = b.c[a]! - b.h[a]!;
          const maxA = b.c[a]! + b.h[a]!;
          if (Math.abs(ld[a]!) < 1e-9) {
            if (lo[a]! < min || lo[a]! > maxA) t0 = Infinity;
            continue;
          }
          const ta = (min - lo[a]!) / ld[a]!;
          const tb = (maxA - lo[a]!) / ld[a]!;
          t0 = Math.max(t0, Math.min(ta, tb));
          t1 = Math.min(t1, Math.max(ta, tb));
        }
        if (t0 <= t1 && t0 < best) {
          best = t0;
          zone = b.zone;
        }
      }
      if (best < Infinity) hits.push({ id: e.id, zone, dist: best, x: ox + dx * best, y: oy + dy * best, z: oz + dz * best });
    }
    return hits.sort((a, b) => a.dist - b.dist);
  }

  /** For tests/debug. */
  list(): { id: EntityId; kind: ZombieKind; x: number; z: number; hp: number }[] {
    return [...this.live.values()].map((e) => ({ id: e.id, kind: e.kind, x: e.pose.x, z: e.pose.z, hp: e.hp }));
  }
}
