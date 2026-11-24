import { C, Kit, type WeaponModel } from './kit';

/** "Kestrel" AR: a carry-handled assault rifle in olive furniture with a curved magazine. */
export function kestrel(hands: boolean, upgraded = false): WeaponModel {
  return new Kit(hands, upgraded)
    .box(0.046, 0.07, 0.3, C.dark, 0, 0.02, -0.05)
    .box(0.044, 0.052, 0.24, C.olive, 0, 0.03, -0.31)
    .box(0.046, 0.012, 0.2, C.dark, 0, 0.0, -0.31)
    .cyl(0.01, 0.2, C.steel, 0, 0.035, -0.52)
    .cyl(0.014, 0.05, C.dark, 0, 0.035, -0.62)
    .box(0.04, 0.085, 0.26, C.olive, 0, -0.012, 0.25, [0.12, 0, 0])
    .box(0.042, 0.09, 0.014, C.rubber, 0, -0.028, 0.385, [0.12, 0, 0])
    .box(0.032, 0.095, 0.045, C.dark, 0, -0.06, 0.04, [0.25, 0, 0])
    // Carry handle with the rear sight in it, and the front sight on its tower.
    .box(0.012, 0.03, 0.02, C.dark, 0, 0.068, 0.05)
    .box(0.012, 0.03, 0.02, C.dark, 0, 0.068, -0.1)
    .box(0.014, 0.012, 0.19, C.dark, 0, 0.088, -0.025)
    .box(0.008, 0.05, 0.014, C.dark, 0, 0.07, -0.44)
    .box(0.026, 0.01, 0.014, C.dark, 0, 0.05, -0.44)
    .box(0.01, 0.008, 0.07, C.dark, 0, -0.036, -0.01)
    .slide(0.026, 0.012, 0.03, C.steel, 0.034, 0.04, -0.02)
    .mag(0.028, 0.1, 0.055, C.metal, 0, -0.05, -0.1, [-0.15, 0, 0])
    .mag(0.028, 0.08, 0.05, C.metal, 0, -0.13, -0.125, [-0.4, 0, 0])
    .build({ muzzle: [0, 0.035, -0.65], sightY: 0.098, action: 'blowback', slideTravel: 0.05, fore: [-0.01, -0.3] });
}

/** "Brakeman" SMG: short, fast, with a perforated shroud, a front grip and a long straight magazine. */
export function brakeman(hands: boolean, upgraded = false): WeaponModel {
  const k = new Kit(hands, upgraded)
    .box(0.042, 0.06, 0.26, C.metal, 0, 0.025, -0.04)
    .cyl(0.02, 0.15, C.dark, 0, 0.03, -0.245, 8)
    .cyl(0.008, 0.05, C.steel, 0, 0.03, -0.345)
    .box(0.032, 0.095, 0.045, C.dark, 0, -0.06, 0.04, [0.2, 0, 0])
    .box(0.028, 0.085, 0.03, C.woodDark, 0, -0.05, -0.2, [-0.12, 0, 0])
    // Wire stock.
    .box(0.008, 0.008, 0.25, C.steel, -0.019, 0.045, 0.21)
    .box(0.008, 0.008, 0.25, C.steel, 0.019, 0.045, 0.21)
    .box(0.05, 0.085, 0.012, C.steel, 0, 0.01, 0.34)
    .box(0.008, 0.02, 0.01, C.dark, 0, 0.066, -0.3)
    .box(0.026, 0.018, 0.012, C.dark, 0, 0.064, 0.06)
    .box(0.01, 0.008, 0.06, C.dark, 0, -0.036, -0.02)
    .slide(0.026, 0.012, 0.02, C.steel, -0.03, 0.04, -0.06)
    .mag(0.026, 0.17, 0.036, C.dark, 0, -0.105, -0.11)
    .mag(0.03, 0.01, 0.042, C.steel, 0, -0.195, -0.11);
  for (let i = 0; i < 3; i++) k.box(0.044, 0.01, 0.014, C.steel, 0, 0.03, -0.2 - i * 0.04);
  return k.build({ muzzle: [0, 0.03, -0.38], sightY: 0.076, action: 'blowback', slideTravel: 0.045, fore: [-0.05, -0.2] });
}

/** "Longwatch": a bolt-action rifle in dark wood under a long scope. The bolt is worked after each shot. */
export function longwatch(hands: boolean, upgraded = false): WeaponModel {
  return new Kit(hands, upgraded)
    .box(0.044, 0.05, 0.56, C.woodDark, 0, 0.0, -0.12)
    .box(0.042, 0.1, 0.28, C.woodDark, 0, -0.04, 0.27, [0.16, 0, 0])
    .box(0.046, 0.105, 0.014, C.rubber, 0, -0.062, 0.41, [0.16, 0, 0])
    .box(0.03, 0.03, 0.1, C.woodDark, 0, 0.03, 0.2)
    .box(0.036, 0.04, 0.26, C.metal, 0, 0.04, -0.02)
    .cyl(0.011, 0.62, C.steel, 0, 0.045, -0.46)
    .cyl(0.015, 0.04, C.dark, 0, 0.045, -0.76)
    // The scope on its two rings.
    .cyl(0.019, 0.3, C.dark, 0, 0.102, -0.04, 8)
    .cyl(0.027, 0.07, C.dark, 0, 0.102, -0.2, 8)
    .cyl(0.024, 0.05, C.dark, 0, 0.102, 0.12, 8)
    .box(0.012, 0.022, 0.012, C.steel, 0, 0.118, -0.04)
    .box(0.014, 0.03, 0.022, C.metal, 0, 0.072, 0.04)
    .box(0.014, 0.03, 0.022, C.metal, 0, 0.072, -0.12)
    .box(0.01, 0.008, 0.07, C.dark, 0, -0.03, 0)
    .slide(0.05, 0.012, 0.012, C.steel, 0.04, 0.045, 0.06)
    .slide(0.02, 0.02, 0.02, C.dark, 0.066, 0.04, 0.06)
    .mag(0.03, 0.035, 0.08, C.dark, 0, -0.035, -0.07)
    .build({ muzzle: [0, 0.045, -0.79], sightY: 0.102, action: 'pump', slideTravel: 0.07, fore: [-0.03, -0.3] });
}
