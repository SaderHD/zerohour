import type { ErrorCode } from '@zh/shared';
import type { Net } from '../net/net';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
export type Panel = 'settings' | 'help';

/**
 * Which screen is on top of the game: a panel (settings, how to play) opened from the menu, the
 * lobby or the pause screen; the pause screen itself; and the "connection lost" notice. The menu,
 * lobby and results follow `body[data-phase]` in CSS and need no code here.
 */
export class Screens {
  panel: Panel | null = null;
  paused = false;
  /** When the pause screen last opened (ms). */
  pausedAt = 0;
  private confirmLeave = 0;
  /** A panel is about to open (the help screen rebuilds itself here). */
  onOpen: ((p: Panel) => void) | null = null;
  /** The player asked to go back into the game (Resume). */
  onResume: (() => void) | null = null;

  constructor(private readonly net: Net) {
    for (const [id, panel] of [['menu-help', 'help'], ['menu-settings', 'settings'], ['lobby-help', 'help'], ['lobby-settings', 'settings'], ['pause-help', 'help'], ['pause-settings', 'settings']] as const) {
      el(id).onclick = () => this.open(panel);
    }
    el('resume').onclick = () => this.onResume?.();
    const leave = el<HTMLButtonElement>('pause-leave');
    leave.onclick = () => {
      // Two clicks: the seat, the guns and the points are gone once you leave.
      if (performance.now() < this.confirmLeave) return net.leave();
      this.confirmLeave = performance.now() + 4000;
      leave.textContent = 'Click again to leave';
      setTimeout(() => (leave.textContent = 'Leave game'), 4000);
    };
    el('netlost-reload').onclick = () => location.reload();
  }

  open(p: Panel): void {
    this.onOpen?.(p);
    this.panel = p;
    document.body.dataset.panel = p;
  }

  close(): void {
    this.panel = null;
    delete document.body.dataset.panel;
  }

  setPaused(on: boolean): void {
    if (on === this.paused) return;
    this.paused = on;
    if (on) this.pausedAt = performance.now();
    this.confirmLeave = 0;
    if (on) document.body.dataset.paused = '1';
    else delete document.body.dataset.paused;
    el('pause-sub').textContent = (this.net.room?.players.filter((p) => p.connected).length ?? 1) > 1
      ? 'The game goes on without you' : 'The zombies do not wait';
  }

  /** Anything up that should keep the keyboard and mouse away from the game? */
  get blocking(): boolean {
    return this.paused || this.panel !== null;
  }

  /** Show, update or hide the notice over everything when the server cannot be reached. */
  setNet(state: 'ok' | 'down' | 'fatal', fatal: ErrorCode | null = null): void {
    if (state === 'ok') {
      delete document.body.dataset.net;
      return;
    }
    document.body.dataset.net = state;
    const n = this.net;
    if (state === 'fatal') {
      el('netlost-title').textContent = fatal === 'version' ? 'UPDATED' : 'SEAT TAKEN';
      el('netlost-text').textContent = fatal === 'version'
        ? 'The game was updated while this page was open. Reload to get the new version.'
        : 'This seat was opened in another tab or window. Reload to take it back here.';
      return;
    }
    el('netlost-title').textContent = n.wasConnected ? 'CONNECTION LOST' : 'NO SERVER';
    const tries = `Trying again… (attempt ${n.attempts})`;
    el('netlost-text').textContent = !n.wasConnected ? `Cannot reach the game server. ${tries}`
      : n.room ? `Your seat in room ${n.room.code} is held for a minute. ${tries}` : tries;
  }
}
