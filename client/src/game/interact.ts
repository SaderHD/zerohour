import { INTERACT_RANGE, REVIVE_SECONDS, openingDistance, type ClientMsg, type CompiledMap, type Opening } from '@zh/shared';
import type { Input } from '../input/input';
import type { Barricades } from './barricades';
import type { RemotePlayers } from './remotePlayers';

/** Seconds between repeats of a held interaction, so the server picks it back up after it stopped. */
const RESEND = 0.5;

/**
 * F interactions: reviving a downed teammate, rebuilding the barricade you are standing at (both
 * held), or buying the door in front of you (one press). Wall buys and the rest join the same
 * path later (PLAN 6.5).
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
  /** Why the server refused the last purchase, shown for a moment. */
  private refusal = '';
  private refusalFor = 0;

  constructor(
    private readonly barricades: Barricades, private readonly remotes: RemotePlayers, private readonly map: CompiledMap,
    private readonly soldDoors: ReadonlySet<string>, private readonly send: (msg: ClientMsg) => void,
  ) {}

  /** The shut door in reach that the player is facing, if any. */
  private door(x: number, z: number, yaw: number): Opening | null {
    let best: Opening | null = null;
    let bestD = INTERACT_RANGE;
    for (const o of this.map.def.openings) {
      if (o.kind !== 'door' || this.soldDoors.has(o.id)) continue;
      const d = openingDistance(o, x, z);
      const dx = o.x + o.w / 2 - x;
      const dz = o.z + o.d / 2 - z;
      const facing = (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / (Math.hypot(dx, dz) || 1);
      if (d < bestD && facing > 0.3) {
        best = o;
        bestD = d;
      }
    }
    return best;
  }

  /** The server turned a purchase down. */
  deny(reason: string): void {
    this.refusal = reason === 'points' ? 'Not enough points' : reason === 'power' ? 'Needs power' : '';
    this.refusalFor = 1.5;
  }

  private msg(key: string, hold: boolean): ClientMsg {
    return key.startsWith('p:') ? { t: 'revive', target: Number(key.slice(2)), hold } : { t: 'interact', id: key, hold };
  }

  update(dt: number, input: Input, x: number, z: number, yaw: number, active: boolean): void {
    const mate = active ? this.remotes.revivable(x, z) : null;
    const win = active && !mate ? this.barricades.rebuildable(x, z) : null;
    const door = active && !mate && !win ? this.door(x, z, yaw) : null;
    this.refusalFor -= dt;
    this.prompt = mate ? `Hold F \u2014 revive ${mate.name}` : win ? 'Hold F \u2014 rebuild barricade' : '';
    if (door) {
      const what = door.style === 'debris' ? 'clear debris' : 'open door';
      this.prompt = this.refusalFor > 0 && this.refusal ? this.refusal : door.needsPower ? 'This door needs power' : `Press F \u2014 ${what} [${door.cost ?? 0}]`;
      if (!door.needsPower && input.pressed('KeyF')) this.send({ t: 'interact', id: door.id, hold: true });
    }
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
