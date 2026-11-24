import { C, Kit, type WeaponModel } from './kit';

/** "Farrow" M1: wood-stocked semi-automatic rifle. */
export function farrow(hands: boolean, upgraded = false): WeaponModel {
  return new Kit(hands, upgraded)
    .box(0.045, 0.055, 0.5, C.wood, 0, 0, -0.12)
    .box(0.042, 0.095, 0.28, C.wood, 0, -0.042, 0.25, [0.18, 0, 0])
    .box(0.046, 0.1, 0.014, C.dark, 0, -0.068, 0.39, [0.18, 0, 0])
    .box(0.04, 0.036, 0.2, C.metal, 0, 0.04, -0.02)
    .cyl(0.011, 0.5, C.steel, 0, 0.046, -0.4)
    .box(0.04, 0.026, 0.22, C.woodDark, 0, 0.052, -0.26)
    .box(0.012, 0.012, 0.3, C.dark, 0, 0.022, -0.5)
    .box(0.008, 0.03, 0.012, C.dark, 0, 0.07, -0.62)
    .box(0.03, 0.012, 0.012, C.dark, 0, 0.058, -0.62)
    .box(0.03, 0.022, 0.015, C.dark, 0, 0.068, 0.06)
    .box(0.01, 0.008, 0.07, C.dark, 0, -0.036, 0)
    .slide(0.03, 0.014, 0.04, C.steel, 0.03, 0.046, -0.02)
    .mag(0.03, 0.05, 0.07, C.dark, 0, -0.045, -0.085)
    .build({ muzzle: [0, 0.046, -0.66], sightY: 0.088, action: 'blowback', slideTravel: 0.06, fore: [-0.02, -0.28] });
}
