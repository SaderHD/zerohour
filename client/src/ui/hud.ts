import { STAMINA_SECONDS } from '@zh/shared';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Minimal session-2 HUD: zone name, stamina bar, click-to-play hint, debug readout. */
export class Hud {
  private readonly zone = el('zone');
  private readonly stamina = el('stamina');
  private readonly staminaFill = el('stamina-fill');
  private readonly hint = el('hint');
  private readonly stats = el('stats');
  private lastZone = '';

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
}
