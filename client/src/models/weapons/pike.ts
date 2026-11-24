import { C, Kit, type WeaponModel } from './kit';

/** "Pike" 12: pump-action shotgun. The pump is the animated part. */
export function pike(hands: boolean, upgraded = false): WeaponModel {
  return new Kit(hands, upgraded)
    .box(0.046, 0.07, 0.22, C.metal, 0, 0.02, -0.02)
    .cyl(0.013, 0.56, C.steel, 0, 0.04, -0.4)
    .cyl(0.012, 0.42, C.dark, 0, 0.012, -0.34)
    .box(0.02, 0.02, 0.02, C.dark, 0, 0.026, -0.54)
    .box(0.04, 0.09, 0.3, C.wood, 0, -0.035, 0.25, [0.2, 0, 0])
    .box(0.044, 0.095, 0.014, C.rubber, 0, -0.066, 0.4, [0.2, 0, 0])
    .box(0.038, 0.06, 0.09, C.wood, 0, -0.02, 0.09, [0.5, 0, 0])
    .box(0.008, 0.012, 0.008, C.brass, 0, 0.058, -0.665)
    .box(0.01, 0.008, 0.07, C.dark, 0, -0.022, 0.0)
    .slide(0.052, 0.046, 0.16, C.woodDark, 0, 0.01, -0.36)
    .slide(0.054, 0.006, 0.12, C.wood, 0, 0.0, -0.36)
    .build({ muzzle: [0, 0.04, -0.69], sightY: 0.066, action: 'pump', slideTravel: 0.09, fore: [0.0, -0.36] });
}
