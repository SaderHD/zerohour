/** Seconds an arc stays up. */
const TTL = 1.4;
const ARCS = 4;

interface Arc {
  el: HTMLElement;
  x: number;
  z: number;
  life: number;
}

/**
 * Damage direction: a red arc on a ring round the crosshair, on the side the blow came from. It
 * stays pointing at the spot as the player turns, and fades.
 */
export class DamageArcs {
  private readonly arcs: Arc[] = [];
  private next = 0;

  constructor() {
    const root = document.getElementById('damage')!;
    for (let i = 0; i < ARCS; i++) {
      const el = document.createElement('i');
      root.append(el);
      this.arcs.push({ el, x: 0, z: 0, life: 0 });
    }
  }

  /** We were hurt from (x, z). */
  hit(x: number, z: number): void {
    const a = this.arcs[this.next++ % ARCS]!;
    a.x = x;
    a.z = z;
    a.life = TTL;
  }

  clear(): void {
    for (const a of this.arcs) a.life = 0;
  }

  /** Bearing of (x, z) from a player at (px, pz) looking along `yaw`: 0 ahead, positive to the right. */
  static bearing(px: number, pz: number, yaw: number, x: number, z: number): number {
    const dx = x - px;
    const dz = z - pz;
    return Math.atan2(dx * Math.cos(yaw) - dz * Math.sin(yaw), -dx * Math.sin(yaw) - dz * Math.cos(yaw));
  }

  update(dt: number, px: number, pz: number, yaw: number): void {
    for (const a of this.arcs) {
      if (a.life <= 0) {
        if (a.el.style.opacity !== '0') a.el.style.opacity = '0';
        continue;
      }
      a.life -= dt;
      a.el.style.opacity = String(Math.max(0, Math.min(1, a.life / (TTL * 0.6))));
      a.el.style.transform = `rotate(${DamageArcs.bearing(px, pz, yaw, a.x, a.z)}rad)`;
    }
  }

  /** For tests: the bearings (radians) of the arcs showing. */
  list(px: number, pz: number, yaw: number): number[] {
    return this.arcs.filter((a) => a.life > 0).map((a) => DamageArcs.bearing(px, pz, yaw, a.x, a.z));
  }
}
