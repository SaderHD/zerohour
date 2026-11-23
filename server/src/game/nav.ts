import { FLOWFIELD_INTERVAL_MS, FlowField, type PlayerId } from '@zh/shared';
import type { Game } from './Game';

interface Entry {
  field: FlowField;
  nextAt: number;
  valid: boolean;
}

/** One flow field per targetable player, refreshed on a staggered timer and whenever a door opens. */
export class Nav {
  private readonly fields = new Map<PlayerId, Entry>();

  /** The field leading to this player, if they can be chased right now. */
  fieldTo(id: PlayerId): FlowField | null {
    const e = this.fields.get(id);
    return e?.valid ? e.field : null;
  }

  /** Recompute everything on the next update (a door opened). */
  invalidate(): void {
    for (const e of this.fields.values()) e.nextAt = 0;
  }

  update(g: Game): void {
    const interval = FLOWFIELD_INTERVAL_MS / 1000;
    let slot = 0;
    for (const p of g.players.values()) {
      let e = this.fields.get(p.pub.id);
      if (!g.targetable(p)) {
        if (e) e.valid = false;
        continue;
      }
      if (!e) {
        // Stagger the players across the interval so their recomputes land on different ticks.
        e = { field: new FlowField(g.map), nextAt: 0, valid: false };
        this.fields.set(p.pub.id, e);
      }
      if (!e.valid) e.nextAt = 0;
      if (g.time >= e.nextAt) {
        e.valid = e.field.compute(g.openDoors, p.x, p.z);
        e.nextAt = g.time + interval + (e.nextAt === 0 ? (slot * interval) / 4 : 0);
      }
      slot++;
    }
    for (const id of this.fields.keys()) if (!g.players.has(id)) this.fields.delete(id);
  }
}
