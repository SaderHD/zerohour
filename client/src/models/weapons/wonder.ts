import { C, Kit, type WeaponModel } from './kit';

const ARC = 0x7ad8ff;
const WELL = 0xb060ff;

/**
 * "Arclight": something from the station's laboratory - a capacitor bank on a rifle stock, two
 * copper rails with a live rod between them, coil rings, and a forked electrode for a muzzle.
 */
export function arclight(hands: boolean, upgraded = false): WeaponModel {
  const k = new Kit(hands, upgraded)
    .box(0.06, 0.075, 0.22, C.metal, 0, 0.03, -0.04)
    .box(0.064, 0.02, 0.1, C.dark, 0, 0.075, -0.03)
    .box(0.008, 0.014, 0.38, C.brass, -0.022, 0.045, -0.33)
    .box(0.008, 0.014, 0.38, C.brass, 0.022, 0.045, -0.33)
    .glow(0.012, 0.012, 0.36, ARC, 0, 0.045, -0.33)
    // The fork: two prongs angled in towards the spark gap.
    .box(0.008, 0.012, 0.07, C.steel, -0.026, 0.045, -0.545, [0, -0.3, 0])
    .box(0.008, 0.012, 0.07, C.steel, 0.026, 0.045, -0.545, [0, 0.3, 0])
    .glow(0.014, 0.014, 0.014, ARC, 0, 0.045, -0.585)
    // A valve under a wire cage on top.
    .glow(0.016, 0.024, 0.08, ARC, 0, 0.099, -0.03)
    .box(0.022, 0.005, 0.09, C.steel, 0, 0.114, -0.03)
    .box(0.022, 0.03, 0.005, C.steel, 0, 0.099, 0.014)
    .box(0.022, 0.03, 0.005, C.steel, 0, 0.099, -0.074)
    .box(0.005, 0.07, 0.008, C.steel, 0, 0.088, -0.5)
    .box(0.046, 0.03, 0.16, C.dark, 0, 0.012, -0.25)
    .box(0.032, 0.095, 0.045, C.dark, 0, -0.06, 0.04, [0.25, 0, 0])
    .box(0.008, 0.008, 0.25, C.steel, -0.02, 0.04, 0.21)
    .box(0.008, 0.008, 0.25, C.steel, 0.02, 0.04, 0.21)
    .box(0.05, 0.09, 0.014, C.rubber, 0, 0.005, 0.34)
    .box(0.01, 0.008, 0.07, C.dark, 0, -0.036, -0.01)
    // The cell: a square battery with brass terminals.
    .mag(0.05, 0.085, 0.07, C.olive, 0, -0.06, -0.1)
    .mag(0.012, 0.014, 0.012, C.brass, -0.014, -0.11, -0.1)
    .mag(0.012, 0.014, 0.012, C.brass, 0.014, -0.11, -0.1);
  for (let i = 0; i < 3; i++) k.cyl(0.036, 0.018, C.steel, 0, 0.045, -0.2 - i * 0.11, 8);
  return k.build({ muzzle: [0, 0.045, -0.6], sightY: 0.124, fore: [-0.01, -0.25] });
}

/**
 * "Gravewell": a squat launcher built round a containment drum - brass hoops, an open cage of rods
 * for a barrel and something violet turning in the middle of it.
 */
export function gravewell(hands: boolean, upgraded = false): WeaponModel {
  const k = new Kit(hands, upgraded)
    .box(0.056, 0.075, 0.18, C.metal, 0, 0.02, -0.03)
    .cyl(0.05, 0.16, C.dark, 0, 0.04, -0.2, 8)
    .cyl(0.056, 0.016, C.brass, 0, 0.04, -0.14, 8)
    .cyl(0.056, 0.016, C.brass, 0, 0.04, -0.26, 8)
    .cyl(0.05, 0.014, C.brass, 0, 0.04, -0.49, 8)
    // The core, seen through the cage.
    .glow(0.045, 0.045, 0.045, WELL, 0, 0.04, -0.39, [0.6, 0.6, 0])
    .glow(0.018, 0.018, 0.16, WELL, 0, 0.04, -0.37)
    .glow(0.03, 0.012, 0.03, WELL, 0, 0.074, -0.03)
    .box(0.036, 0.014, 0.05, C.steel, 0, 0.064, -0.03)
    .box(0.046, 0.03, 0.14, C.woodDark, 0, -0.018, -0.2)
    .box(0.036, 0.055, 0.11, C.woodDark, 0, -0.012, 0.075, [0.45, 0, 0])
    .box(0.042, 0.09, 0.27, C.woodDark, 0, -0.04, 0.25, [0.2, 0, 0])
    .box(0.046, 0.095, 0.016, C.rubber, 0, -0.066, 0.385, [0.2, 0, 0])
    .box(0.01, 0.008, 0.07, C.dark, 0, -0.024, -0.01)
    .magCyl(0.028, 0.1, C.brass, 0, -0.07, -0.09, 8, 'y')
    .magCyl(0.032, 0.014, C.steel, 0, -0.125, -0.09, 8, 'y');
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    k.box(0.008, 0.008, 0.22, C.steel, Math.cos(a) * 0.042, 0.04 + Math.sin(a) * 0.042, -0.385);
  }
  return k.build({ muzzle: [0, 0.04, -0.5], sightY: 0.092, fore: [-0.03, -0.2] });
}
