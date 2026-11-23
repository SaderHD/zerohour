import { C, Kit, type WeaponModel } from './kit';

/** "Stitch" SMG: a stamped-steel submachine gun with a wire stock and stick magazine. */
export function stitch(hands: boolean, upgraded = false): WeaponModel {
  const k = new Kit(hands, upgraded)
    .box(0.045, 0.05, 0.3, C.metal, 0, 0.03, -0.05)
    .box(0.04, 0.04, 0.16, C.dark, 0, 0.03, -0.28)
    .cyl(0.009, 0.06, C.steel, 0, 0.03, -0.385)
    .box(0.032, 0.1, 0.045, C.dark, 0, -0.06, 0.04, [0.2, 0, 0])
    .box(0.034, 0.045, 0.052, C.metal, 0, -0.012, -0.12)
    .box(0.008, 0.008, 0.27, C.steel, -0.018, 0.03, 0.22)
    .box(0.008, 0.008, 0.27, C.steel, 0.018, 0.03, 0.22)
    .box(0.05, 0.09, 0.012, C.steel, 0, 0.005, 0.355)
    .box(0.008, 0.022, 0.01, C.dark, 0, 0.066, -0.34)
    .box(0.026, 0.02, 0.012, C.dark, 0, 0.064, 0.07)
    .box(0.01, 0.008, 0.06, C.dark, 0, -0.04, -0.02)
    .slide(0.026, 0.012, 0.02, C.steel, 0.032, 0.04, -0.02)
    .mag(0.026, 0.2, 0.04, C.steel, 0, -0.13, -0.12)
    .mag(0.03, 0.01, 0.046, C.dark, 0, -0.232, -0.12);
  for (let i = 0; i < 4; i++) k.box(0.046, 0.046, 0.01, C.steel, 0, 0.03, -0.22 - i * 0.04);
  return k.build({ muzzle: [0, 0.03, -0.42], sightY: 0.078, action: 'blowback', slideTravel: 0.05, fore: [-0.02, -0.26] });
}
