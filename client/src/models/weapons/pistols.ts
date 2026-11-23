import { C, Kit, type WeaponModel } from './kit';

/** M9 "Warden": the starting service pistol. */
export function warden(hands: boolean): WeaponModel {
  return new Kit(hands)
    .box(0.03, 0.028, 0.18, C.dark, 0, 0, -0.04)
    .box(0.016, 0.016, 0.02, C.steel, 0, 0.034, -0.148)
    .box(0.031, 0.11, 0.05, 0x3a2a1e, 0, -0.065, 0.04, [0.22, 0, 0])
    .box(0.01, 0.008, 0.06, C.dark, 0, -0.046, -0.022)
    .box(0.01, 0.036, 0.008, C.dark, 0, -0.03, -0.05)
    .slide(0.034, 0.04, 0.21, C.metal, 0, 0.034, -0.035)
    .slide(0.006, 0.012, 0.01, C.dark, 0, 0.06, -0.13)
    .slide(0.008, 0.012, 0.008, C.dark, -0.011, 0.06, 0.062)
    .slide(0.008, 0.012, 0.008, C.dark, 0.011, 0.06, 0.062)
    .slide(0.036, 0.022, 0.03, C.dark, 0, 0.034, 0.045)
    .mag(0.022, 0.1, 0.034, C.steel, 0, -0.07, 0.043, [0.22, 0, 0])
    .mag(0.028, 0.012, 0.044, C.dark, 0, -0.123, 0.055, [0.22, 0, 0])
    .build({ muzzle: [0, 0.034, -0.16], sightY: 0.066, action: 'blowback', slideTravel: 0.045 });
}

/** "Dockhand" .38: a heavy six-shot revolver. */
export function dockhand(hands: boolean): WeaponModel {
  return new Kit(hands)
    .box(0.022, 0.026, 0.17, C.steel, 0, 0.042, -0.125)
    .box(0.014, 0.016, 0.11, C.steel, 0, 0.021, -0.1)
    .box(0.03, 0.062, 0.075, C.steel, 0, 0.024, 0.002)
    .box(0.008, 0.02, 0.016, C.dark, 0, 0.06, 0.04, [-0.5, 0, 0])
    .box(0.03, 0.105, 0.046, C.wood, 0, -0.062, 0.046, [0.32, 0, 0])
    .box(0.034, 0.02, 0.05, C.woodDark, 0, -0.115, 0.064, [0.32, 0, 0])
    .box(0.01, 0.008, 0.05, C.steel, 0, -0.04, -0.02)
    .box(0.006, 0.014, 0.01, C.dark, 0, 0.062, -0.2)
    .magCyl(0.03, 0.052, C.dark, 0, 0.03, -0.012)
    .build({ muzzle: [0, 0.042, -0.215], sightY: 0.066 });
}
