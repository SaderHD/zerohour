import type { WeaponId } from '@zh/shared';
import { farrow } from './farrow';
import { coachman, ferrier, halberd, thumper } from './heavy';
import { type WeaponModel } from './kit';
import { brakeman, kestrel, longwatch } from './longarms';
import { pike } from './pike';
import { dockhand, warden } from './pistols';
import { stitch } from './stitch';
import { arclight, gravewell } from './wonder';

export type { WeaponModel } from './kit';

const BUILDERS: Record<WeaponId, (hands: boolean, upgraded: boolean) => WeaponModel> = {
  warden, dockhand, farrow, pike, stitch, coachman, kestrel, brakeman, halberd, longwatch, ferrier, thumper, arclight, gravewell,
};

/** Build a weapon model. First-person models include gloves and sleeves. */
export function buildWeapon(id: WeaponId, hands: boolean, upgraded = false): WeaponModel {
  return (BUILDERS[id] ?? warden)(hands, upgraded);
}

export function disposeWeapon(m: WeaponModel): void {
  m.group.traverse((o) => (o as { geometry?: { dispose(): void } }).geometry?.dispose());
  m.material.dispose();
}
