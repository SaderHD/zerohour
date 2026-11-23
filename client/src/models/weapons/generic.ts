import { C, Kit, type WeaponModel } from './kit';

/** Parametric long gun used by weapons that do not have a bespoke model yet (finished in session 11). */
export interface LongGunSpec {
  barrel: number;
  body: number;
  furniture: number;
  mag: 'box' | 'curved' | 'drum' | 'belt' | 'none';
  barrels?: 1 | 2;
  /** Barrel radius. */
  bore?: number;
  scope?: boolean;
  bipod?: boolean;
  stock?: 'solid' | 'wire' | 'none';
  action?: WeaponModel['action'];
}

export function longGun(hands: boolean, s: LongGunSpec): WeaponModel {
  const k = new Kit(hands);
  const bore = s.bore ?? 0.011;
  const front = -0.14 - s.barrel;
  k.box(0.046, 0.065, 0.28, s.body, 0, 0.025, -0.03);
  k.box(0.032, 0.095, 0.045, s.furniture, 0, -0.06, 0.04, [0.25, 0, 0]);
  k.box(0.044, 0.045, 0.2, s.furniture, 0, 0.012, -0.26);
  for (const x of s.barrels === 2 ? [-bore, bore] : [0]) k.cyl(bore, s.barrel, C.steel, x, 0.04, -0.14 - s.barrel / 2);
  if (s.stock !== 'none') {
    if (s.stock === 'wire') k.box(0.01, 0.01, 0.26, C.steel, 0, 0.03, 0.24).box(0.04, 0.09, 0.012, C.steel, 0, 0.0, 0.37);
    else k.box(0.04, 0.085, 0.28, s.furniture, 0, -0.02, 0.25, [0.14, 0, 0]);
  }
  if (s.mag === 'box') k.mag(0.028, 0.11, 0.06, C.dark, 0, -0.06, -0.1);
  if (s.mag === 'curved') k.mag(0.028, 0.1, 0.055, C.dark, 0, -0.05, -0.1, [-0.15, 0, 0]).mag(0.028, 0.08, 0.05, C.dark, 0, -0.13, -0.125, [-0.4, 0, 0]);
  if (s.mag === 'drum') k.magCyl(0.065, 0.05, C.dark, 0, -0.07, -0.1, 8, 'x');
  if (s.mag === 'belt') k.mag(0.1, 0.09, 0.1, C.olive, -0.03, -0.04, -0.1).mag(0.03, 0.012, 0.04, C.brass, 0.02, 0.05, -0.1);
  if (s.scope) {
    k.cyl(0.02, 0.26, C.dark, 0, 0.1, -0.04, 8).cyl(0.026, 0.05, C.dark, 0, 0.1, -0.17, 8).box(0.012, 0.03, 0.02, C.dark, 0, 0.07, 0.02).box(0.012, 0.03, 0.02, C.dark, 0, 0.07, -0.1);
  } else {
    k.box(0.008, 0.026, 0.012, C.dark, 0, 0.066, front + 0.04).box(0.026, 0.02, 0.012, C.dark, 0, 0.066, 0.06);
  }
  if (s.bipod) k.box(0.008, 0.16, 0.008, C.steel, -0.03, -0.03, front + 0.1, [0, 0, -0.25]).box(0.008, 0.16, 0.008, C.steel, 0.03, -0.03, front + 0.1, [0, 0, 0.25]);
  k.slide(0.028, 0.014, 0.03, C.steel, 0.034, 0.04, -0.03);
  return k.build({
    muzzle: [0, 0.04, front - 0.02], sightY: s.scope ? 0.1 : 0.08,
    action: s.action ?? 'blowback', slideTravel: 0.05, fore: [-0.01, -0.26],
  });
}
