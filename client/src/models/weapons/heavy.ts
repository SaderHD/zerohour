import { C, Kit, type WeaponModel } from './kit';

/** "Coachman": a side-by-side double-barrel with twin hammers. */
export function coachman(hands: boolean, upgraded = false): WeaponModel {
  return new Kit(hands, upgraded)
    .cyl(0.014, 0.5, C.steel, -0.015, 0.04, -0.36)
    .cyl(0.014, 0.5, C.steel, 0.015, 0.04, -0.36)
    .box(0.008, 0.006, 0.48, C.dark, 0, 0.056, -0.36)
    .box(0.052, 0.062, 0.14, C.metal, 0, 0.026, -0.04)
    .box(0.05, 0.036, 0.22, C.wood, 0, 0.012, -0.25)
    .box(0.036, 0.055, 0.11, C.wood, 0, -0.012, 0.075, [0.45, 0, 0])
    .box(0.042, 0.09, 0.3, C.wood, 0, -0.04, 0.26, [0.2, 0, 0])
    .box(0.046, 0.095, 0.014, C.dark, 0, -0.07, 0.41, [0.2, 0, 0])
    .box(0.008, 0.022, 0.014, C.dark, -0.016, 0.066, 0.03, [-0.5, 0, 0])
    .box(0.008, 0.022, 0.014, C.dark, 0.016, 0.066, 0.03, [-0.5, 0, 0])
    .box(0.01, 0.008, 0.08, C.steel, 0, -0.024, -0.01)
    .box(0.008, 0.008, 0.008, C.brass, 0, 0.062, -0.6)
    .magCyl(0.012, 0.06, C.brass, -0.015, 0.04, -0.1)
    .magCyl(0.012, 0.06, C.brass, 0.015, 0.04, -0.1)
    .build({ muzzle: [0, 0.04, -0.62], sightY: 0.066, fore: [0.0, -0.26] });
}

/** "Ferrier": a drum-fed automatic shotgun, all black. */
export function ferrier(hands: boolean, upgraded = false): WeaponModel {
  return new Kit(hands, upgraded)
    .box(0.05, 0.075, 0.26, C.dark, 0, 0.02, -0.04)
    .cyl(0.015, 0.42, C.steel, 0, 0.045, -0.38)
    .cyl(0.013, 0.32, C.metal, 0, 0.014, -0.33)
    .box(0.052, 0.058, 0.2, C.metal, 0, 0.026, -0.28)
    .box(0.032, 0.095, 0.045, C.dark, 0, -0.06, 0.04, [0.25, 0, 0])
    // Skeleton stock.
    .box(0.036, 0.03, 0.27, C.dark, 0, 0.035, 0.225)
    .box(0.036, 0.11, 0.03, C.dark, 0, -0.005, 0.36)
    .box(0.03, 0.022, 0.2, C.dark, 0, -0.045, 0.24, [0.22, 0, 0])
    .box(0.008, 0.03, 0.012, C.dark, 0, 0.074, -0.56)
    .box(0.028, 0.02, 0.012, C.dark, 0, 0.068, 0.06)
    .box(0.01, 0.008, 0.07, C.dark, 0, -0.036, -0.01)
    .slide(0.03, 0.014, 0.03, C.steel, 0.036, 0.04, -0.03)
    .magCyl(0.066, 0.052, C.metal, 0, -0.08, -0.1, 8, 'x')
    .magCyl(0.02, 0.058, C.steel, 0, -0.08, -0.1, 6, 'x')
    .build({ muzzle: [0, 0.045, -0.6], sightY: 0.086, action: 'blowback', slideTravel: 0.05, fore: [0.0, -0.3] });
}

/** "Halberd": a belt-fed machine gun with a ribbed barrel, a carry handle and a folded bipod. */
export function halberd(hands: boolean, upgraded = false): WeaponModel {
  const k = new Kit(hands, upgraded)
    .box(0.052, 0.08, 0.34, C.metal, 0, 0.03, -0.06)
    .box(0.048, 0.016, 0.2, C.steel, 0, 0.078, -0.05)
    .cyl(0.014, 0.5, C.steel, 0, 0.045, -0.47)
    .cyl(0.018, 0.06, C.dark, 0, 0.045, -0.72)
    .box(0.042, 0.09, 0.24, C.olive, 0, 0.0, 0.26, [0.1, 0, 0])
    .box(0.046, 0.1, 0.016, C.dark, 0, -0.012, 0.385, [0.1, 0, 0])
    .box(0.032, 0.095, 0.045, C.dark, 0, -0.065, 0.04, [0.25, 0, 0])
    .box(0.046, 0.04, 0.16, C.olive, 0, 0.0, -0.3)
    // Carry handle.
    .box(0.01, 0.045, 0.012, C.dark, 0, 0.105, -0.17)
    .box(0.01, 0.045, 0.012, C.dark, 0, 0.105, -0.27)
    .box(0.014, 0.014, 0.13, C.dark, 0, 0.13, -0.22)
    // Bipod, folded back under the barrel.
    .box(0.008, 0.008, 0.2, C.steel, -0.02, 0.018, -0.5)
    .box(0.008, 0.008, 0.2, C.steel, 0.02, 0.018, -0.5)
    .box(0.008, 0.036, 0.012, C.dark, 0, 0.074, -0.68)
    .box(0.028, 0.022, 0.012, C.dark, 0, 0.096, 0.07)
    .box(0.01, 0.008, 0.07, C.dark, 0, -0.04, -0.01)
    .slide(0.03, 0.014, 0.03, C.steel, 0.036, 0.045, -0.02)
    .mag(0.1, 0.095, 0.11, C.olive, -0.04, -0.045, -0.1)
    .mag(0.104, 0.01, 0.114, C.dark, -0.04, 0.004, -0.1)
    .mag(0.036, 0.012, 0.05, C.brass, 0.012, 0.062, -0.1);
  for (let i = 0; i < 6; i++) k.box(0.036, 0.036, 0.012, C.metal, 0, 0.045, -0.4 - i * 0.045);
  return k.build({ muzzle: [0, 0.045, -0.75], sightY: 0.112, action: 'blowback', slideTravel: 0.05, fore: [-0.03, -0.3] });
}

/** "Thumper": a single-shot break-open grenade launcher with a tall leaf sight. */
export function thumper(hands: boolean, upgraded = false): WeaponModel {
  return new Kit(hands, upgraded)
    .cyl(0.036, 0.32, C.metal, 0, 0.035, -0.26, 8)
    .cyl(0.041, 0.03, C.steel, 0, 0.035, -0.41, 8)
    .cyl(0.04, 0.024, C.steel, 0, 0.035, -0.11, 8)
    .box(0.052, 0.072, 0.15, C.olive, 0, 0.02, -0.03)
    .box(0.046, 0.03, 0.17, C.wood, 0, -0.012, -0.24)
    .box(0.036, 0.055, 0.11, C.wood, 0, -0.012, 0.075, [0.45, 0, 0])
    .box(0.042, 0.09, 0.28, C.wood, 0, -0.04, 0.25, [0.2, 0, 0])
    .box(0.046, 0.095, 0.016, C.rubber, 0, -0.068, 0.39, [0.2, 0, 0])
    // Leaf sight, flipped up.
    .box(0.022, 0.07, 0.006, C.dark, 0, 0.105, -0.16)
    .box(0.026, 0.008, 0.02, C.dark, 0, 0.074, -0.16)
    .box(0.008, 0.02, 0.01, C.dark, 0, 0.082, -0.39)
    .box(0.01, 0.008, 0.07, C.dark, 0, -0.024, -0.01)
    .box(0.014, 0.02, 0.03, C.steel, 0, 0.066, 0.02)
    .magCyl(0.03, 0.09, C.brass, 0, 0.035, -0.14, 8)
    .build({ muzzle: [0, 0.035, -0.43], sightY: 0.1, fore: [-0.025, -0.24] });
}
