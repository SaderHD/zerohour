import type { LightDef } from '@zh/shared';
import type { GlowMode, RGB } from '../../render/bake';
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
    default:
      // A bulb under a tin shade, hung on its flex.
      k.box(-0.012, y + 0.2, -0.012, 0.012, k.ceil, 0.012, C.iron, { noTop: true });
      k.cyl(0, 0, y + 0.04, y + 0.2, 0.3, 0.07, k.tone(C.olive, 0.1), 8);
      k.cyl(0, 0, y + 0.02, y + 0.04, 0.26, 0.26, glow, 8, { glow: mode, bottom: true, noTop: true });
      k.cyl(0, 0, y - 0.06, y + 0.04, 0.05, 0.06, glow, 6, { glow: mode, bottom: true });
  }
}
