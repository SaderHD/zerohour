import * as THREE from 'three';
import { POWERUP_BLINK_SECONDS, powerupDef, type EntityId, type PowerupDrop } from '@zh/shared';
import { powerupGeometry } from '../models/pickups';
import type { Fx } from './fx';

const HEIGHT = 0.95;

interface Shown {
  drop: PowerupDrop;
  group: THREE.Group;
  age: number;
}

/**
 * Power-ups lying about (PLAN 4.10): each floats at chest height over a disc of its own colour,
 * turning, and blinks through its last seconds. They glow by themselves, whatever the room's light.
 */
export class Pickups {
  private readonly shown = new Map<EntityId, Shown>();
  private readonly material = new THREE.MeshBasicMaterial({ vertexColors: true });
  private readonly disc = new THREE.CircleGeometry(0.42, 12).rotateX(-Math.PI / 2);

  constructor(private readonly scene: THREE.Scene, private readonly fx: Fx) {}

  reset(drops: PowerupDrop[]): void {
    for (const s of this.shown.values()) this.discard(s);
    this.shown.clear();
    for (const d of drops) this.add(d);
  }

  add(drop: PowerupDrop): void {
    if (this.shown.has(drop.id)) return;
    const colour = powerupDef(drop.kind)?.colour ?? 0xffffff;
    const group = new THREE.Group();
    const model = new THREE.Mesh(powerupGeometry(drop.kind), this.material);
    model.position.y = HEIGHT;
    const glow = new THREE.Mesh(this.disc, new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.y = 0.04;
    group.add(model, glow);
    group.position.set(drop.x, 0, drop.z);
    this.scene.add(group);
    this.shown.set(drop.id, { drop, group, age: 0 });
    this.fx.puff(drop.x, HEIGHT, drop.z, colour, 10, 2, 0.05, 0.6);
  }

  /** Gone: picked up (`taken`, with a burst of its colour) or timed out. */
  remove(id: EntityId, taken: boolean): void {
    const s = this.shown.get(id);
    if (!s) return;
    this.shown.delete(id);
    if (taken) this.fx.puff(s.drop.x, HEIGHT, s.drop.z, powerupDef(s.drop.kind)?.colour ?? 0xffffff, 18, 3.5, 0.06, 0.7);
    this.discard(s);
  }

  private discard(s: Shown): void {
    this.scene.remove(s.group);
    ((s.group.children[1] as THREE.Mesh).material as THREE.Material).dispose();
  }

  /** `time` is the server's game time (drops carry the time they expire). */
  update(dt: number, time: number): void {
    for (const s of this.shown.values()) {
      s.age += dt;
      const model = s.group.children[0]!;
      model.rotation.y = s.age * 1.8;
      model.position.y = HEIGHT + Math.sin(s.age * 2.4) * 0.07;
      model.scale.setScalar(Math.min(1, s.age * 4) * 1.15);
      const left = s.drop.expiresAt - time;
      // Blinking, faster towards the end.
      model.visible = left > POWERUP_BLINK_SECONDS || Math.sin(s.age * (left < 3 ? 26 : 13)) > -0.2;
    }
  }

  /** For tests/debug. */
  list(): { id: EntityId; kind: string; x: number; z: number }[] {
    return [...this.shown.values()].map((s) => ({ id: s.drop.id, kind: s.drop.kind, x: s.drop.x, z: s.drop.z }));
  }
}
