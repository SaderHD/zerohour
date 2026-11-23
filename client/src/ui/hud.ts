import { STAMINA_SECONDS } from '@zh/shared';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** HUD: zone name, stamina bar, crosshair, hit marker, ammo, click-to-play hint, debug readout. */
export class Hud {
  private readonly zone = el('zone');
  private readonly stamina = el('stamina');
  private readonly staminaFill = el('stamina-fill');
  private readonly hint = el('hint');
  private readonly stats = el('stats');
  private readonly crosshair = el('crosshair');
  private readonly hitmarker = el('hitmarker');
  private readonly ammo = el('ammo');
  private readonly ammoName = el('ammo-name');
  private readonly ammoMag = el('ammo-mag');
  private readonly ammoReserve = el('ammo-reserve');
  private readonly nades = el('ammo-nades');
  private lastZone = '';
  private lastAmmo = '';
  private lastGap = -1;
  private readonly scope = el('scope');
  private scoped = false;

  setZone(name: string): void {
    if (name === this.lastZone) return;
    this.lastZone = name;
    this.zone.textContent = name;
  }

  setStamina(seconds: number): void {
    const f = seconds / STAMINA_SECONDS;
    this.staminaFill.style.width = `${Math.round(f * 100)}%`;
    this.stamina.style.opacity = f >= 0.999 ? '0' : '1';
  }

  setLocked(locked: boolean): void {
    this.hint.style.display = locked ? 'none' : 'block';
  }

  setStats(text: string | null): void {
    this.stats.style.display = text ? 'block' : 'none';
    if (text) this.stats.textContent = text;
  }

  setScope(on: boolean): void {
    if (on === this.scoped) return;
    this.scoped = on;
    this.scope.style.display = on ? 'block' : 'none';
  }

  /** Crosshair gap in CSS pixels (the current spread cone); hidden while aiming down sights. */
  setCrosshair(gapPx: number, visible: boolean): void {
    const gap = visible ? Math.round(gapPx) : -1;
    if (gap === this.lastGap) return;
    this.lastGap = gap;
    this.crosshair.style.opacity = visible ? '0.8' : '0';
    this.crosshair.style.setProperty('--gap', `${Math.max(3, gap)}px`);
  }

  /** Flash the hit marker; red for a kill, brighter for a headshot. */
  hit(kind: 'hit' | 'head' | 'kill'): void {
    this.hitmarker.className = '';
    void this.hitmarker.offsetWidth; // restart the CSS animation
    this.hitmarker.className = `show ${kind}`;
  }

  setAmmo(name: string, mag: number, reserve: number, grenades: number, reloading: boolean): void {
    const key = `${name}|${mag}|${reserve}|${grenades}|${reloading}`;
    if (key === this.lastAmmo) return;
    this.lastAmmo = key;
    this.ammo.style.display = name ? 'block' : 'none';
    this.ammoName.textContent = reloading ? 'reloading' : name;
    this.ammoMag.textContent = String(mag);
    this.ammoMag.classList.toggle('empty', mag === 0);
    this.ammoReserve.textContent = ` / ${reserve}`;
    this.nades.textContent = '\u25c6'.repeat(grenades);
  }
}
