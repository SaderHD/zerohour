import { TONICS, perkDef, type PerkId } from '@zh/shared';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/**
 * HUD: zone name, stamina bar, crosshair, hit marker, ammo, hurt vignette, interaction prompt and
 * its progress bar, round numeral and banner, downed / spectating overlay, debug readout.
 * and the tray of tonics held. (#effects stays empty until session 11.)
 */
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
  private readonly hurtEl = el('hurt');
  private readonly prompt = el('prompt');
  private lastPrompt = '';
  private lastHurt = -1;
  private flash = 0;
  private readonly round = el('round');
  private readonly bannerEl = el('banner');
  private readonly progress = el('progress');
  private readonly downed = el('downed');
  private lastRound = -1;
  private lastProgress = -1;
  private lastDowned = '';
  private readonly perks = el('perks');
  private lastPerks = '';

  /** The round numeral; it flashes when the round changes. */
  setRound(n: number, flash = true): void {
    if (n === this.lastRound) return;
    this.lastRound = n;
    this.round.textContent = n > 0 ? String(n) : '';
    this.round.classList.remove('flash');
    if (!flash) return;
    void this.round.offsetWidth; // restart the CSS animation
    this.round.classList.add('flash');
  }

  /** A line across the top of the view that fades by itself. */
  banner(title: string, sub = ''): void {
    el('banner-title').textContent = title;
    el('banner-sub').textContent = sub;
    this.bannerEl.classList.remove('show');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('show');
  }

  /** Bar under the prompt for a held interaction (0 hides it). */
  setProgress(frac: number): void {
    const f = Math.round(frac * 50) / 50;
    if (f === this.lastProgress) return;
    this.lastProgress = f;
    this.progress.style.display = f > 0 ? 'block' : 'none';
    (this.progress.firstElementChild as HTMLElement).style.width = `${f * 100}%`;
  }

  /** Overlay while downed (title, a bar of `frac`, a line under it); an empty title hides it. */
  setDowned(title: string, frac: number, sub: string, reviving: boolean): void {
    const key = `${title}|${Math.round(frac * 100)}|${sub}|${reviving}`;
    if (key === this.lastDowned) return;
    this.lastDowned = key;
    this.downed.style.display = title ? 'block' : 'none';
    this.downed.classList.toggle('reviving', reviving);
    el('downed-title').textContent = title;
    el('downed-sub').textContent = sub;
    const bar = el('downed-bar');
    bar.style.display = frac >= 0 ? 'block' : 'none';
    (bar.firstElementChild as HTMLElement).style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  }

  /** Red closes in from the edges as health drops; a fresh hit flashes it. */
  setHealth(hp: number, max: number, dt: number): void {
    this.flash = Math.max(0, this.flash - dt * 2.5);
    const level = Math.round(Math.min(1, (1 - hp / max) * 1.1 + this.flash * 0.5) * 50) / 50;
    if (level === this.lastHurt) return;
    this.lastHurt = level;
    this.hurtEl.classList.toggle('flash', this.flash > 0);
    this.hurtEl.style.opacity = String(level);
  }

  /** We were just hit. */
  hurt(): void {
    this.flash = 1;
  }

  /** The tonics held, as a row of coloured tabs; a new one pops in. */
  setPerks(perks: readonly PerkId[]): void {
    const key = perks.join(',');
    if (key === this.lastPerks) return;
    const had = new Set(this.lastPerks.split(','));
    this.lastPerks = key;
    this.perks.replaceChildren(...perks.map((id) => {
      const tonic = TONICS.find((t) => t.id === id);
      const name = perkDef(id)?.name ?? id;
      const tab = document.createElement('div');
      tab.className = had.has(id) ? 'perk' : 'perk new';
      tab.dataset.perk = id;
      tab.title = name;
      tab.style.setProperty('--glow', `#${(tonic?.glow ?? 0xffffff).toString(16).padStart(6, '0')}`);
      tab.textContent = name.split(' ').map((w) => w[0]).join('');
      return tab;
    }));
  }

  setPrompt(text: string): void {
    if (text === this.lastPrompt) return;
    this.lastPrompt = text;
    this.prompt.textContent = text;
    this.prompt.style.display = text ? 'block' : 'none';
  }

  setZone(name: string): void {
    if (name === this.lastZone) return;
    this.lastZone = name;
    this.zone.textContent = name;
  }

  setStamina(seconds: number, max: number): void {
    const f = Math.min(1, seconds / max);
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
