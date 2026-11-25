import * as THREE from 'three';
import type { CompiledMap, Fog } from '@zh/shared';

// The air: distance fog everywhere (the map's own, `MapScene.fog`), thicker and tinted in zones that say so (ZoneDef.fog), e.g.
// the frost haze of the cold store. It follows the viewer from zone to zone.

/** How fast the air changes when the viewer walks into another zone (1/s). */
const BLEND_RATE = 2.5;

export class Atmosphere {
  readonly fog: THREE.Fog;
  private readonly target = new THREE.Color();
  private readonly byZone = new Map<string, Fog>();
  private readonly base: Fog;

  constructor(private readonly map: CompiledMap) {
    this.base = map.def.scene.fog;
    this.fog = new THREE.Fog(this.base.color, this.base.near, this.base.far);
    for (const z of map.def.zones) if (z.fog) this.byZone.set(z.id, z.fog);
  }

  /** Call each frame with where the viewer stands (`y`: about the height of their feet). */
  update(dt: number, x: number, y: number, z: number): void {
    const want = this.byZone.get(this.map.zoneAt(x, y, z) ?? '') ?? this.base;
    const k = 1 - Math.exp(-dt * BLEND_RATE);
    this.fog.color.lerp(this.target.set(want.color), k);
    this.fog.near += (want.near - this.fog.near) * k;
    this.fog.far += (want.far - this.fog.far) * k;
  }
}
