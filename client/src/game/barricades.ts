import * as THREE from 'three';
import { BARRICADE_PLANKS, INTERACT_RANGE, Rng, mapWindows, type BarricadeState, type CompiledMap, type WindowInfo } from '@zh/shared';
import { modelMaterial, shadedBox } from '../models/rig';
import type { World } from '../render/worldBuilder';
import type { Fx } from './fx';

const WOOD = [0x8a6a42, 0x7a5a36, 0x94744c, 0x6e5230];
const SPLINTER = 0x9a7a50;
/** Planks sit just inside the hole, between the sill and the lintel. */
const INSET = 0.2;
const LOW = 1.02;
const STEP = 0.19;

interface Site {
  win: WindowInfo;
  planks: number;
  first: number; // index of its first plank instance
}

/** The planks across every window: one instanced mesh, shown or hidden as the server says. */
export class Barricades {
  private readonly sites = new Map<string, Site>();
  private readonly mesh: THREE.InstancedMesh;
  private readonly matrices: THREE.Matrix4[] = [];
  private readonly hidden = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(scene: THREE.Scene, map: CompiledMap, world: World, private readonly fx: Fx) {
    const wins = mapWindows(map);
    this.mesh = new THREE.InstancedMesh(shadedBox(1, 0.15, 0.045, 0xffffff), modelMaterial(), wins.length * BARRICADE_PLANKS);
    this.mesh.name = 'barricades';
    this.mesh.frustumCulled = false;
    const rng = new Rng(4242);
    const colour = new THREE.Color();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();
    wins.forEach((win, w) => {
      this.sites.set(win.id, { win, planks: BARRICADE_PLANKS, first: w * BARRICADE_PLANKS });
      const light = world.lightAt(win.inX, 1.5, win.inZ);
      // Nailed up in a hurry: uneven heights, tilts and lengths. Order of removal is top-down-ish.
      const order = rng.shuffle([0, 1, 2, 3, 4, 5]);
      for (let i = 0; i < BARRICADE_PLANKS; i++) {
        const row = order[i]!;
        const along = rng.range(-0.06, 0.06);
        pos.set(win.x - win.ox * INSET + (win.alongX ? along : 0), LOW + row * STEP + rng.range(-0.02, 0.02), win.z - win.oz * INSET + (win.alongX ? 0 : along));
        euler.set(0, win.alongX ? 0 : Math.PI / 2, rng.range(-0.11, 0.11), 'YXZ');
        scale.set(win.len + rng.range(0.25, 0.45), 1, 1);
        const m = new THREE.Matrix4().compose(pos, quat.setFromEuler(euler), scale);
        this.matrices.push(m);
        this.mesh.setMatrixAt(w * BARRICADE_PLANKS + i, m);
        const shade = rng.range(0.8, 1.05);
        this.mesh.setColorAt(w * BARRICADE_PLANKS + i, colour.set(rng.pick(WOOD)).multiplyScalar(shade).multiply(new THREE.Color(Math.min(light[0], 1.4), Math.min(light[1], 1.4), Math.min(light[2], 1.4))));
      }
    });
    scene.add(this.mesh);
  }

  reset(states: BarricadeState[]): void {
    for (const s of states) this.set(s.id, s.planks, false);
  }

  set(id: string, planks: number, effects = true): void {
    const site = this.sites.get(id);
    if (!site) return;
    if (effects && planks !== site.planks) {
      const { win } = site;
      // Splinters fly into the room when a plank is torn off; a little dust when one goes back up.
      const torn = planks < site.planks;
      this.fx.puff(win.x - win.ox * 0.35, LOW + STEP * 2.5, win.z - win.oz * 0.35, SPLINTER, torn ? 9 : 4, torn ? 2.2 : 0.9, torn ? 0.06 : 0.035, 0.6);
    }
    site.planks = planks;
    for (let i = 0; i < BARRICADE_PLANKS; i++) this.mesh.setMatrixAt(site.first + i, i < planks ? this.matrices[site.first + i]! : this.hidden);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** The nearest window in reach that is missing planks. */
  rebuildable(x: number, z: number): WindowInfo | null {
    let best: WindowInfo | null = null;
    let bestD = INTERACT_RANGE;
    for (const { win, planks } of this.sites.values()) {
      const d = Math.hypot(x - win.inX, z - win.inZ);
      if (planks < BARRICADE_PLANKS && d < bestD) {
        best = win;
        bestD = d;
      }
    }
    return best;
  }

  /** For tests/debug. */
  list(): BarricadeState[] {
    return [...this.sites.values()].map((s) => ({ id: s.win.id, planks: s.planks }));
  }
}
