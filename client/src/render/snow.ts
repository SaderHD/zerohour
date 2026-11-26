import * as THREE from 'three';
import { CELL_SIZE, Rng, massing, type CompiledMap } from '@zh/shared';

// Snow falling wherever there is sky overhead: the yard, and the pockets outside the windows.
// One cloud of points in a box that follows the viewer; flakes wrap round inside it, and any that
// would fall through a roof are put out of sight.

const FLAKES = 700;
/** The box the flakes live in: metres across, and metres tall. */
const SPAN = 26;
const HEIGHT = 12;
/** Under a roof, snow shows only above this height (so it can be seen falling behind buildings). */
const ROOF_CLEARANCE = 6.5;
/** Looking down from this far above where it lands, the box of flakes comes up to the viewer (a roof over a street). */
const LIFT = 7;
/** ...and then reaches this far below the eye. */
const BELOW = 4;
const WIND = [0.5, 0.22] as const;

export class Snow {
  readonly points: THREE.Points;
  private readonly seeds: Float32Array;
  private readonly pos: THREE.BufferAttribute;

  /**
   * For every column: the height of what the snow lands on there. The ground that lies open to
   * the sky; in a city the roofs as well (`massing`); NaN under a roof nobody has measured.
   */
  private readonly ground: Float32Array;

  constructor(private readonly map: CompiledMap) {
    this.ground = new Float32Array(map.plane).fill(NaN);
    const roofs = massing(map);
    if (roofs) this.ground.set(roofs.top);
    for (let i = 0; i < map.kind.length; i++) if (map.sky[i] === 1) this.ground[i % map.plane] = map.lo[i]!;
    const rng = new Rng(1206);
    this.seeds = new Float32Array(FLAKES * 5);
    for (let i = 0; i < FLAKES; i++) this.seeds.set([rng.range(0, SPAN), rng.range(0, HEIGHT), rng.range(0, SPAN), rng.range(0.9, 1.9), rng.range(0, 6.28)], i * 5);
    const geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(FLAKES * 3), 3);
    geo.setAttribute('position', this.pos);
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xaab8d0, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.85, depthWrite: false }));
    this.points.name = 'snow';
    this.points.frustumCulled = false;
  }

  update(time: number, eye: { x: number; y: number; z: number }): void {
    const p = this.pos.array as Float32Array;
    const s = this.seeds;
    const wrap = (v: number, centre: number, span: number): number => centre + ((((v - centre) % span) + span * 1.5) % span) - span / 2;
    for (let i = 0; i < FLAKES; i++) {
      const o = i * 5;
      const sway = Math.sin(time * 0.9 + s[o + 4]!) * 0.35;
      const x = wrap(s[o]! + time * WIND[0] + sway, eye.x, SPAN);
      const z = wrap(s[o + 2]! + time * WIND[1] + sway * 0.6, eye.z, SPAN);
      const y = ((((s[o + 1]! - time * s[o + 3]!) % HEIGHT) + HEIGHT) % HEIGHT);
      const cx = Math.floor(x / CELL_SIZE);
      const cz = Math.floor(z / CELL_SIZE);
      // Outside the map it falls to the ground; inside, onto whatever lies open to the sky.
      const ground = this.map.inBounds(cx, cz) ? this.ground[cz * this.map.cols + cx]! : 0;
      p[i * 3] = x;
      let h = !Number.isNaN(ground) ? ground + y : y > ROOF_CLEARANCE ? y : -100;
      if (eye.y - ground > LIFT) {
        h = eye.y - BELOW + ((((h - eye.y + BELOW) % HEIGHT) + HEIGHT) % HEIGHT);
        if (h < ground) h = -100;
      }
      p[i * 3 + 1] = h;
      p[i * 3 + 2] = z;
    }
    this.pos.needsUpdate = true;
  }
}
