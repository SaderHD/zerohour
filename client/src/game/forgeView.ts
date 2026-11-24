import * as THREE from 'three';
import type { CompiledMap, ForgeState } from '@zh/shared';
import { buildWeapon, disposeWeapon, type WeaponModel } from '../models/weapons';
import type { Fx } from './fx';

const ARC = 0xb070ff;
/** Height of the cradle, and of a finished weapon held up for its owner. */
const CRADLE_Y = 1.12;
const OFFER_Y = 1.22;

/**
 * The weapon inside the Forge: lying in the cradle and shaking while it is worked on, then
 * floating over it in its new finish until its owner takes it.
 */
export class ForgeView {
  private readonly holder = new THREE.Group();
  private model: WeaponModel | null = null;
  private key = '';
  private phase: ForgeState['phase'] = 'idle';
  private spark = 0;
  private readonly at: { x: number; y: number; z: number } | null;

  constructor(scene: THREE.Scene, map: CompiledMap, private readonly lightAt: (x: number, y: number, z: number) => [number, number, number], private readonly fx: Fx) {
    const prop = map.def.props.find((p) => p.type === 'forge');
    const floor = prop ? map.floorOn(prop.level, prop.x, prop.z) : NaN;
    this.at = prop ? { x: prop.x, y: Number.isNaN(floor) ? 0 : floor, z: prop.z } : null;
    // Along the cradle: across the machine, whichever way it faces.
    this.holder.rotation.y = ((prop?.rot ?? 0) * Math.PI) / 180 + Math.PI / 2;
    this.holder.visible = false;
    scene.add(this.holder);
  }

  set(state: ForgeState): void {
    this.phase = state.phase;
    const key = state.phase === 'idle' || !state.weapon ? '' : `${state.weapon}:${state.phase === 'offering'}`;
    if (key === this.key) return;
    this.key = key;
    if (this.model) {
      this.holder.remove(this.model.group);
      disposeWeapon(this.model);
      this.model = null;
    }
    this.holder.visible = !!key && !!this.at;
    if (!key || !state.weapon || !this.at) return;
    this.model = buildWeapon(state.weapon, false, state.phase === 'offering');
    // Centre the gun on the cradle (its origin is at the grip).
    this.model.group.position.z = -this.model.muzzle.position.z / 2 - 0.08;
    this.holder.add(this.model.group);
    if (state.phase === 'offering') this.fx.puff(this.at.x, OFFER_Y, this.at.z, ARC, 14, 2.2, 0.05, 0.7);
  }

  update(dt: number, time: number): void {
    const m = this.model;
    if (!m || !this.at) return;
    const { x, y, z } = this.at;
    const [r, g, b] = this.lightAt(x - 0.6, y + 1.2, z);
    if (this.phase === 'working') {
      this.holder.position.set(x + (Math.random() - 0.5) * 0.012, y + CRADLE_Y + (Math.random() - 0.5) * 0.012, z);
      this.holder.rotation.z = Math.PI / 2 + (Math.random() - 0.5) * 0.06;
      if ((this.spark -= dt) <= 0) {
        this.spark = 0.07;
        this.fx.puff(x + (Math.random() - 0.5) * 0.5, y + CRADLE_Y + 0.1, z + (Math.random() - 0.5) * 0.7, ARC, 2, 2.4, 0.035, 0.35);
      }
      const hot = 1.4 + Math.sin(time * 40) * 0.5;
      m.material.color.setRGB(r + hot * 0.5, g + hot * 0.2, b + hot);
    } else {
      this.holder.position.set(x, y + OFFER_Y + Math.sin(time * 2.2) * 0.04, z);
      this.holder.rotation.z = Math.sin(time * 1.3) * 0.25;
      m.material.color.setRGB(r + 0.35, g + 0.3, b + 0.5);
    }
  }
}
