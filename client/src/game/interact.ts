import type { ClientMsg } from '@zh/shared';
import type { Input } from '../input/input';
import type { Barricades } from './barricades';

/** Seconds between repeats of a held interaction, so the server picks it back up after it stopped. */
const RESEND = 0.5;

/**
 * "Hold F" interactions. For now that is rebuilding the barricade you are standing at; doors,
 * wall buys and the rest join the same path later (PLAN 6.5).
 */
export class Interact {
  /** Text for the HUD prompt, or '' when there is nothing in reach. */
  prompt = '';
  private holding: string | null = null;
  private resend = 0;

  constructor(private readonly barricades: Barricades, private readonly send: (msg: ClientMsg) => void) {}

  update(dt: number, input: Input, x: number, z: number, active: boolean): void {
    const win = active ? this.barricades.rebuildable(x, z) : null;
    this.prompt = win ? 'Hold F — rebuild barricade' : '';
    const want = win && input.down('KeyF') ? win.id : null;
    if (want !== this.holding) {
      if (this.holding) this.send({ t: 'interact', id: this.holding, hold: false });
      this.holding = want;
      this.resend = 0;
    }
    if (want && (this.resend -= dt) <= 0) {
      this.resend = RESEND;
      this.send({ t: 'interact', id: want, hold: true });
    }
  }
}
