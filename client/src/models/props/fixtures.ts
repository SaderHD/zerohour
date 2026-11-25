import type { LightDef } from '@zh/shared';
import type { GlowMode, RGB } from '../../render/bake';
import { wreathAt } from './festive';
import { C } from './palette';
import type { Kit } from './kit';

// The lamp drawn at each light, so every pool of light has a visible source. The kit's origin is
// on the floor under the light.

export function fixture(k: Kit, l: LightDef, rgb: RGB, mode: GlowMode): void {
  const glow: RGB = [rgb[0] * 1.5 + 0.35, rgb[1] * 1.5 + 0.33, rgb[2] * 1.5 + 0.28];
  const y = l.y;
  switch (l.fixture ?? 'shade') {
    case 'none':
      return;
    case 'tube':
      // A strip light on the ceiling.
      k.box(-0.7, k.ceil - 0.08, -0.11, 0.7, k.ceil, 0.11, C.steelDark, { bottom: true });
      k.box(-0.62, k.ceil - 0.13, -0.05, 0.62, k.ceil - 0.08, 0.05, glow, { glow: mode, bottom: true });
      return;
    case 'cage':
      // A bulkhead lamp in a wire guard.
      k.cube(0, y, 0, 0.2, 0.16, 0.2, glow, { glow: mode, bottom: true });
      k.cube(0, y + 0.1, 0, 0.26, 0.05, 0.26, C.iron, { bottom: true });
      k.cube(0, y - 0.1, 0, 0.26, 0.03, 0.26, C.iron, { bottom: true });
      return;
    case 'flood':
      // A floodlight on a mast.
      k.box(-0.05, 0, -0.05, 0.05, y, 0.05, C.steelDark);
      k.cube(0, y, 0, 0.5, 0.3, 0.3, C.iron, { bottom: true });
      k.cube(0, y - 0.16, 0, 0.42, 0.03, 0.24, glow, { glow: mode, bottom: true });
      return;
    case 'post':
      // A street lamp: a fluted iron post, a lantern, and this year's wreath.
      k.cyl(0, 0, 0, 0.55, 0.15, 0.1, C.iron, 6);
      k.cyl(0, 0, 0.55, y - 0.2, 0.065, 0.05, C.iron, 6, { noTop: true });
      k.cube(0, y - 0.2, 0, 0.36, 0.05, 0.36, C.iron, { bottom: true });
      k.sub(0, 0, 0, 45).cyl(0, 0, y - 0.17, y + 0.14, 0.13, 0.2, glow, 4, { glow: mode, noTop: true });
      k.sub(0, 0, 0, 45).cyl(0, 0, y + 0.14, y + 0.3, 0.3, 0.03, C.iron, 4, { bottom: true });
      k.cyl(0, 0, y + 0.3, y + 0.34, 0.2, 0.08, k.tone(C.snow, 0.04), 4);
      for (const yaw of [0, 180]) wreathAt(k.sub(0, 0, 0, yaw), 0, 2.9, -0.07, 0.26);
      return;
    case 'swing': {
      // A caged work lamp on a chain, never quite still.
      const length = Math.max(0.5, k.ceil - y);
      const s = k.mover(0, k.ceil, 0, [k.rng.range(0.6, 1), 0, k.rng.range(-0.5, 0.5)], { kind: 'swing', amp: 0.11, period: 2 * Math.sqrt(length) });
      s.box(-0.012, y + 0.2, -0.012, 0.012, k.ceil, 0.012, C.iron, { noTop: true });
      s.cyl(0, 0, y + 0.08, y + 0.2, 0.22, 0.06, C.iron, 6);
      s.cyl(0, 0, y - 0.14, y + 0.08, 0.07, 0.09, glow, 6, { glow: mode, bottom: true });
      for (const a of [0, 90]) s.sub(0, 0, 0, a).box(-0.11, y - 0.18, -0.008, 0.11, y - 0.16, 0.008, C.iron, { bottom: true });
      return;
    }
    default:
      // A bulb under a tin shade, hung on its flex.
      k.box(-0.012, y + 0.2, -0.012, 0.012, k.ceil, 0.012, C.iron, { noTop: true });
      k.cyl(0, 0, y + 0.04, y + 0.2, 0.3, 0.07, k.tone(C.olive, 0.1), 8);
      k.cyl(0, 0, y + 0.02, y + 0.04, 0.26, 0.26, glow, 8, { glow: mode, bottom: true, noTop: true });
      k.cyl(0, 0, y - 0.06, y + 0.04, 0.05, 0.06, glow, 6, { glow: mode, bottom: true });
  }
}
