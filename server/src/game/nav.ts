import { FLOWFIELD_INTERVAL_MS, FlowField, type PlayerId } from '@zh/shared';
import type { Projectile } from './projectiles';
import type { Game } from './Game';

interface Entry {
  field: FlowField;
  nextAt: number;
  valid: boolean;
}

/** One flow field per targetable player, refreshed on a staggered timer and whenever a door opens. */
export class Nav {
  private readonly fields = new Map<PlayerId, Entry>();
  private lureEntry: Entry | null = null;
  /** The Siren zombies are drawn to right now, with the way to it; null when none is out (or it lies out of reach). */
  lure: { x: number; y: number; z: number; field: FlowField } | null = null;

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
    // One scheduled recompute a tick: after a door opens the fields follow on successive ticks, not all at once.
    let spent = false;
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
      if (g.time >= e.nextAt && (!spent || !e.valid)) {
        spent = true;
        e.valid = e.field.compute(g.openDoors, p.x, p.y, p.z);
        e.nextAt = g.time + interval + (e.nextAt === 0 ? (slot * interval) / 4 : 0);
      }
      slot++;
    }
    for (const id of this.fields.keys()) if (!g.players.has(id)) this.fields.delete(id);
    // The oldest Siren out is the one they hear.
    let siren: Projectile | undefined;
    for (const pr of g.projectiles) if (pr.kind === 'siren' && (!siren || pr.id < siren.id)) siren = pr;
    this.lure = null;
    if (!siren) return;
    const l = (this.lureEntry ??= { field: new FlowField(g.map), nextAt: 0, valid: false });
    // It calls from the floor it lies on.
    const y = g.map.floorUnder(siren.x, siren.y, siren.z);
    if (g.time >= l.nextAt || Math.hypot(l.field.goalX - siren.x, l.field.goalY - y, l.field.goalZ - siren.z) > 1) {
      l.valid = l.field.compute(g.openDoors, siren.x, y, siren.z);
      l.nextAt = g.time + interval;
    }
    if (l.valid) this.lure = { x: siren.x, y, z: siren.z, field: l.field };
  }
}
