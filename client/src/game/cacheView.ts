import * as THREE from 'three';
import {
  CACHE_CLEARANCE_COST, CACHE_COST, CACHE_MOVE_SECONDS, CACHE_OFFER_SECONDS, CACHE_ROLL_SECONDS, CACHE_TABLE, DIR_VEC, SIREN, clamp,
  type CacheState, type CompiledMap, type Dir,
} from '@zh/shared';
import { skullEyes, skullGeometry, sirenGeometry } from '../models/pickups';
import { damp, modelMaterial, part, shadedBox } from '../models/rig';
import { buildWeapon } from '../models/weapons';
import type { Fx } from './fx';

const ROT: Record<Dir, number> = { n: 0, w: Math.PI / 2, s: Math.PI, e: -Math.PI / 2 };
const GOLD = 0xffc850;
const LID_OPEN = 1.85;
/** Heights over the floor: the crate's rim, and where a rolled weapon hangs. */
const RIM = 0.66;
const HANG = 1.3;

interface Site {
  id: string;
  x: number;
  /** Height of the floor it stands on. */
  y: number;
  z: number;
  group: THREE.Group;
  lid: THREE.Group;
  glow: THREE.Mesh;
  material: THREE.MeshLambertMaterial;
  /** What floats over it: a weapon, the Siren or the skull. */
  item: THREE.Group;
  shown: string;
  state: CacheState;
  /** 0 = not there, 1 = standing on its pallet. */
  here: number;
  open: number;
  nextSwap: number;
}

type LightAt = (x: number, y: number, z: number) => [number, number, number];

/**
 * The Cache as drawn (PLAN 4.7): a banded crate on one of the pallets. Its lid lifts, weapons
 * flicker past over it, and the one it lands on hangs there for the buyer; on a Jinx a skull comes
 * up instead and the crate leaves through the roof. A beam of light marks where it stands.
 */
export class CacheView {
  home = '';
  private clearance = false;
  private readonly sites = new Map<string, Site>();
  private readonly beam: THREE.Mesh;
  private readonly itemMat = modelMaterial();
  private readonly eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2a18 });
  private readonly items = new Map<string, THREE.Object3D>();

  constructor(private readonly scene: THREE.Scene, map: CompiledMap, private readonly lightAt: LightAt, private readonly fx: Fx) {
    for (const it of map.def.interactables) {
      if (it.kind !== 'cacheSite') continue;
      const v = DIR_VEC[it.facing];
      const material = modelMaterial();
      const group = new THREE.Group();
      const floor = map.mountHeight(it);
      group.position.set(it.x - v.x * 0.5, floor, it.z - v.z * 0.5);
      group.rotation.y = ROT[it.facing];
      const bands = [-0.6, 0, 0.6].flatMap((x) => [shadedBox(0.07, 0.5, 0.74, 0xb08a3a, x, 0.4, 0)]);
      group.add(part(material, shadedBox(1.5, 0.48, 0.7, 0x27332c, 0, 0.4, 0), shadedBox(1.54, 0.05, 0.74, 0x161d19, 0, 0.17, 0), ...bands,
        shadedBox(0.16, 0.14, 0.03, 0xb08a3a, 0, 0.5, -0.36)));
      const lid = new THREE.Group();
      lid.position.set(0, RIM - 0.02, 0.36);
      lid.add(part(material, shadedBox(1.56, 0.1, 0.76, 0x2f3d34, 0, 0.05, -0.37), ...[-0.6, 0, 0.6].map((x) => shadedBox(0.07, 0.11, 0.78, 0xb08a3a, x, 0.05, -0.37))));
      const glow = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 0.6), new THREE.MeshBasicMaterial({ color: GOLD }));
      glow.position.y = RIM - 0.04;
      const item = new THREE.Group();
      item.rotation.y = Math.PI / 2;
      group.add(lid, glow, item);
      group.visible = false;
      scene.add(group);
      this.sites.set(it.id, {
        id: it.id, x: group.position.x, y: floor, z: group.position.z, group, lid, glow, material, item, shown: '',
        state: { site: it.id, phase: 'idle' }, here: 0, open: 0, nextSwap: 0,
      });
    }
    const beamMat = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 70, 8, 1, true), beamMat);
    this.beam.name = 'cache-beam';
    this.beam.visible = false;
    scene.add(this.beam);
  }

  /** Everything at once, from a sync. */
  reset(home: string, boxes: CacheState[]): void {
    this.home = home;
    for (const s of this.sites.values()) {
      s.state = boxes.find((b) => b.site === s.id) ?? { site: s.id, phase: 'idle' };
      s.here = this.present(s) ? 1 : 0;
      this.show(s, '');
    }
  }

  set(state: CacheState): void {
    const s = this.sites.get(state.site);
    if (!s) return;
    const was = s.state.phase;
    s.state = state;
    if (state.phase === 'offering' && was !== 'offering') this.fx.puff(s.x, s.y + HANG, s.z, GOLD, 12, 2, 0.05, 0.6);
    if (state.phase === 'jinx') this.fx.puff(s.x, s.y + HANG, s.z, 0xff2a18, 16, 2.5, 0.06, 0.8);
    if (state.phase === 'idle') this.show(s, '');
  }

  /** The Cache has landed somewhere else. */
  setHome(site: string): void {
    this.home = site;
    const s = this.sites.get(site);
    if (s) this.fx.puff(s.x, s.y + 0.6, s.z, GOLD, 20, 3, 0.07, 0.9);
  }

  setClearance(on: boolean): void {
    this.clearance = on;
  }

  /** Is there a Cache at this site, what is it doing, and what does a roll cost? */
  at(site: string): { present: boolean; state: CacheState | null; cost: number } {
    const s = this.sites.get(site);
    return { present: !!s && this.present(s), state: s?.state ?? null, cost: this.clearance ? CACHE_CLEARANCE_COST : CACHE_COST };
  }

  private present(s: Site): boolean {
    return s.id === this.home || this.clearance || s.state.phase !== 'idle';
  }

  /** Put a model over the crate: a weapon id, 'siren', 'jinx', or '' for nothing. */
  private show(s: Site, key: string): void {
    if (key === s.shown) return;
    s.shown = key;
    s.item.clear();
    if (!key) return;
    let model = this.items.get(key);
    if (!model) {
      if (key === 'jinx') {
        model = new THREE.Group().add(new THREE.Mesh(skullGeometry(false), this.itemMat), new THREE.Mesh(skullEyes(), this.eyeMat));
        model.scale.setScalar(1.5);
        model.rotation.y = -Math.PI / 2; // face out of the crate's front
      } else if (key === SIREN) {
        model = new THREE.Mesh(sirenGeometry(), this.itemMat);
        model.scale.setScalar(1.5);
      } else {
        const w = buildWeapon(key, false);
        w.group.traverse((o) => {
          if ((o as THREE.Mesh).isMesh && o.name !== 'trim') (o as THREE.Mesh).material = this.itemMat;
        });
        w.material.dispose();
        // Centred over the crate (a gun's origin is at its grip), a little larger than life.
        w.group.position.z = -w.muzzle.position.z / 2 - 0.08;
        model = new THREE.Group().add(w.group);
        model.scale.setScalar(1.25);
      }
      this.items.set(key, model);
    }
    // A model can only hang in one place: during Clearance two crates may want the same one.
    s.item.add(model.parent ? model.clone() : model);
  }

  /** `time` is the server's game time. */
  update(dt: number, time: number): void {
    let beamAt: Site | null = null;
    for (const s of this.sites.values()) {
      const st = s.state;
      const present = this.present(s);
      s.here += ((present ? 1 : 0) - s.here) * damp(6, dt);
      const moving = st.phase === 'moving';
      s.group.visible = s.here > 0.02;
      if (!s.group.visible) continue;
      if (s.id === this.home && !moving) beamAt = s;
      const left = (st.until ?? time) - time;
      const [r, g, b] = this.lightAt(s.x, s.y + 0.8, s.z);
      s.material.color.setRGB(Math.min(r, 1.6), Math.min(g, 1.6), Math.min(b, 1.6));

      // Leaving: straight up, faster and faster. Arriving: dropping the last metre onto the pallet.
      const gone = moving ? clamp(1 - left / CACHE_MOVE_SECONDS, 0, 1) : 0;
      s.group.position.y = s.y + gone * gone * 30 + (1 - Math.min(1, s.here * 1.2)) * 1.2;
      s.group.scale.setScalar(0.3 + 0.7 * Math.min(1, s.here * 1.2));
      const busy = st.phase !== 'idle';
      s.open += ((busy ? 1 : 0) - s.open) * damp(busy ? 9 : 5, dt);
      s.lid.rotation.x = s.open * LID_OPEN;
      s.glow.visible = s.open > 0.05;

      let y = RIM;
      let spin = 0;
      if (st.phase === 'rolling') {
        // Weapons flicker past, slowing as the roll runs out.
        const k = clamp(1 - left / CACHE_ROLL_SECONDS, 0, 1);
        y = RIM + 0.1 + (HANG - RIM - 0.1) * Math.min(1, k * 1.6);
        if (time >= s.nextSwap) {
          s.nextSwap = time + 0.07 + k * k * 0.3;
          const pool = CACHE_TABLE.filter((e) => e.id !== s.shown);
          this.show(s, pool[Math.floor(Math.random() * pool.length)]!.id);
        }
      } else if (st.phase === 'offering') {
        this.show(s, st.weapon ?? '');
        // It sinks back towards the crate as the offer runs out.
        y = RIM + 0.25 + (HANG - RIM - 0.25) * clamp(left / (CACHE_OFFER_SECONDS * 0.6), 0, 1) + Math.sin(time * 2.4) * 0.03;
        spin = Math.sin(time * 1.2) * 0.3;
      } else if (st.phase === 'jinx' || moving) {
        this.show(s, 'jinx');
        y = HANG + Math.sin(time * 31) * 0.025;
        spin = Math.sin(time * 9) * 0.35;
      }
      s.item.position.y = y;
      s.item.rotation.y = Math.PI / 2 + spin;
    }
    this.itemMat.color.setRGB(1.5, 1.35, 1.0);
    this.eyeMat.color.setHex(0xff2a18).multiplyScalar(0.7 + 0.3 * Math.sin(time * 23));
    this.beam.visible = !!beamAt;
    if (beamAt) {
      this.beam.position.set(beamAt.x, beamAt.y + 35, beamAt.z);
      this.beam.rotation.y = time * 0.5;
      (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.14 + Math.sin(time * 3) * 0.03;
    }
  }

  /** For tests/debug. */
  list(): { home: string; boxes: { site: string; phase: string; weapon: string | null; shown: string; visible: boolean }[] } {
    return {
      home: this.home,
      boxes: [...this.sites.values()].map((s) => ({ site: s.id, phase: s.state.phase, weapon: s.state.weapon ?? null, shown: s.shown, visible: s.group.visible })),
    };
  }
}
