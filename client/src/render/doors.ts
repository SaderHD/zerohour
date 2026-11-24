import * as THREE from 'three';
import { CELL_SIZE, DOOR_HEIGHT, DOOR_OPEN_SECONDS, type CompiledMap, type Opening } from '@zh/shared';
import { Kit, type PropOut } from '../models/props/kit';
import { crateAt, shelfUnit } from '../models/props/common';
import { C } from '../models/props/palette';
import { Baker, Bucket } from './bake';
import { glowMaterial, propMaterial, signMaterial } from './materials';
import { signTexture, textTile } from './signs';

// What fills a doorway until it is bought: a steel shutter with its price stencilled on, or a
// heap of wreckage. One small group per door so it can move: shutters rise into the lintel,
// debris drops through the floor.

const TRAVEL = DOOR_HEIGHT + 0.1;

function shutter(k: Kit, o: Opening, w: number): void {
  const powered = !!o.needsPower;
  const slab = k.tone(powered ? 0x5a5078 : C.rust, 0.05);
  k.box(-w / 2, 0, -0.09, w / 2, DOOR_HEIGHT, 0.09, slab, { noTop: true });
  for (const side of [0, 180]) {
    const f = k.sub(0, 0, 0, side);
    for (let y = 0.28; y < DOOR_HEIGHT; y += 0.5) f.box(-w / 2, y, -0.11, w / 2, y + 0.05, -0.09, [slab[0] * 0.7, slab[1] * 0.7, slab[2] * 0.7]);
    f.box(-w / 2, 0.95, -0.13, w / 2, 1.2, -0.09, C.brass);
    for (let x = -w / 2; x < w / 2 - 0.01; x += 0.5) f.sub(x + 0.25, 1.075, -0.131, 0, 0, 45).box(-0.05, -0.2, -0.002, 0.05, 0.2, 0, C.iron);
    const label = textTile(powered ? 'POWER' : String(o.cost ?? 0), 'stencil');
    f.picture(0, 1.62, -0.112, 0.34 * label.aspect, 0.34, label.uv);
    if (powered) f.box(-0.1, 2.02, -0.12, 0.1, 2.12, -0.09, [1.2, 0.25, 0.2], { glow: 'on' });
  }
}

function debris(k: Kit, w: number): void {
  crateAt(k.sub(-w / 2 + 0.5, 0, 0), 0, 0.92, 0.95);
  crateAt(k.sub(w / 2 - 0.52, 0, 0.02), 0, 0.88, 0.8);
  crateAt(k.sub(-w / 2 + 0.62, 0.95, 0, 20), 0, 0.7, 0.7);
  shelfUnit(k.sub(w / 2 - 0.2, 0.75, 0.05, 90).sub(0, 0, 0, 0, 0, 62), false);
  for (let i = 0; i < 5; i++) {
    const s = k.sub(k.rng.range(-0.4, 0.4), 0, k.rng.range(-0.12, 0.12), k.rng.range(-8, 8), 0, k.rng.range(-38, 38));
    s.box(-0.09, 0, -0.02, 0.09, DOOR_HEIGHT - 0.1 - k.rng.range(0, 0.3), 0.02, k.tone(C.wood, 0.2));
  }
  k.sub(0, 1.5, -0.03, 0, 0, k.rng.range(-12, 12)).box(-w / 2, -0.08, -0.02, w / 2, 0.08, 0.02, k.tone(C.woodDark, 0.15));
}

interface Door {
  group: THREE.Group;
  debris: boolean;
  /** 0 shut .. 1 open. */
  t: number;
  open: boolean;
}

export class Doors {
  readonly group = new THREE.Group();
  triangles = 0;
  private readonly doors = new Map<string, Door>();

  constructor(map: CompiledMap, baker: Baker) {
    this.group.name = 'doors';
    for (const o of map.def.openings) {
      if (o.kind !== 'door') continue;
      const out: PropOut = { baker, prop: new Bucket(), glow: new Bucket(), sign: new Bucket() };
      const alongX = o.w > o.d;
      const x = o.x + o.w / 2;
      const z = o.z + o.d / 2;
      const k = Kit.at(out, { type: 'door', x, z, rot: alongX ? 0 : 90 }, map.idx(Math.floor(x / CELL_SIZE), Math.floor(z / CELL_SIZE)), DOOR_HEIGHT);
      if (o.style === 'debris') debris(k, Math.max(o.w, o.d));
      else shutter(k, o, Math.max(o.w, o.d));
      const group = new THREE.Group();
      group.name = `door:${o.id}`;
      for (const [b, mat] of [[out.prop, propMaterial()], [out.glow, glowMaterial], [out.sign, signMaterial(signTexture())]] as const) {
        if (!b.pos.length) continue;
        group.add(new THREE.Mesh(b.toGeometry(), mat));
        this.triangles += b.triangles;
      }
      this.doors.set(o.id, { group, debris: o.style === 'debris', t: 0, open: false });
      this.group.add(group);
    }
  }

  /** Open or shut a door; `animate` plays the opening instead of jumping to it. */
  set(id: string, open: boolean, animate = false): void {
    const d = this.doors.get(id);
    if (!d || d.open === open) return;
    d.open = open;
    if (!open || !animate) d.t = open ? 1 : 0;
    this.place(d);
  }

  private place(d: Door): void {
    const ease = d.t * d.t * (3 - 2 * d.t);
    d.group.position.y = (d.debris ? -1 : 1) * TRAVEL * ease;
    d.group.visible = d.t < 1;
  }

  update(dt: number): void {
    for (const d of this.doors.values()) {
      if (!d.open || d.t >= 1) continue;
      d.t = Math.min(1, d.t + dt / DOOR_OPEN_SECONDS);
      this.place(d);
    }
  }
}
