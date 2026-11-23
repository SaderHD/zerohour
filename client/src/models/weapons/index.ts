import type { WeaponId } from '@zh/shared';
import { farrow } from './farrow';
import { longGun } from './generic';
import { C, type WeaponModel } from './kit';
import { pike } from './pike';
import { dockhand, warden } from './pistols';
import { stitch } from './stitch';

export type { WeaponModel } from './kit';

const BUILDERS: Record<WeaponId, (hands: boolean) => WeaponModel> = {
  warden, dockhand, farrow, pike, stitch,
  coachman: (h) => longGun(h, { barrel: 0.42, body: C.metal, furniture: C.wood, mag: 'none', barrels: 2, bore: 0.014, action: 'none' }),
  kestrel: (h) => longGun(h, { barrel: 0.4, body: C.dark, furniture: C.olive, mag: 'curved' }),
  brakeman: (h) => longGun(h, { barrel: 0.2, body: C.metal, furniture: C.dark, mag: 'box', stock: 'wire' }),
  halberd: (h) => longGun(h, { barrel: 0.52, body: C.metal, furniture: C.olive, mag: 'belt', bore: 0.014, bipod: true }),
  longwatch: (h) => longGun(h, { barrel: 0.62, body: C.metal, furniture: C.woodDark, mag: 'box', scope: true, action: 'pump' }),
  ferrier: (h) => longGun(h, { barrel: 0.4, body: C.dark, furniture: C.dark, mag: 'drum', bore: 0.015 }),
  thumper: (h) => longGun(h, { barrel: 0.26, body: C.olive, furniture: C.wood, mag: 'none', bore: 0.034, action: 'none' }),
};

/** Build a weapon model. First-person models include gloves and sleeves. */
export function buildWeapon(id: WeaponId, hands: boolean): WeaponModel {
  return (BUILDERS[id] ?? warden)(hands);
}

export function disposeWeapon(m: WeaponModel): void {
  m.group.traverse((o) => (o as { geometry?: { dispose(): void } }).geometry?.dispose());
  m.material.dispose();
}
