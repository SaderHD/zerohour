import { REVIVE_SECONDS, type ClientMsg } from '@zh/shared';
import type { Input } from '../input/input';
import type { Barricades } from './barricades';
import type { RemotePlayers } from './remotePlayers';

/** Seconds between repeats of a held interaction, so the server picks it back up after it stopped. */
const RESEND = 0.5;

/**
 * "Hold F" interactions: reviving a downed teammate, or rebuilding the barricade you are standing
 * at. Doors, wall buys and the rest join the same path later (PLAN 6.5).
 */
export class Interact {
  /** Text for the HUD prompt, or '' when there is nothing in reach. */
  prompt = '';
  /** 0..1 through a held revive (a local estimate; the server decides), else 0. */
  progress = 0;
  /** What F is held on: a window id, or `p:<player id>` for a revive. */
  private holding: string | null = null;
  private resend = 0;
  private held = 0;

  constructor(private readonly barricades: Barricades, private readonly remotes: RemotePlayers, private readonly send: (msg: ClientMsg) => void) {}

  private msg(key: string, hold: boolean): ClientMsg {
    return key.startsWith('p:') ? { t: 'revive', target: Number(key.slice(2)), hold } : { t: 'interact', id: key, hold };
  }

  update(dt: number, input: Input, x: number, z: number, active: boolean): void {
    const mate = active ? this.remotes.revivable(x, z) : null;
    const win = active && !mate ? this.barricades.rebuildable(x, z) : null;
    this.prompt = mate ? `Hold F \u2014 revive ${mate.name}` : win ? 'Hold F \u2014 rebuild barricade' : '';
    const want = !input.down('KeyF') ? null : mate ? `p:${mate.id}` : win ? win.id : null;
    if (want !== this.holding) {
      if (this.holding) this.send(this.msg(this.holding, false));
      this.holding = want;
      this.resend = 0;
      this.held = 0;
    }
    if (want) {
      this.held += dt;
      if ((this.resend -= dt) <= 0) {
        this.resend = RESEND;
        this.send(this.msg(want, true));
      }
    }
    this.progress = want && mate ? Math.min(1, this.held / REVIVE_SECONDS) : 0;
  }
}
