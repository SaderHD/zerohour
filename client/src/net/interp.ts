import { INTERP_DELAY_MS, lerp, lerpAngle, type MoveState } from '@zh/shared';

/** Estimates server time from snapshot timestamps and yields the (delayed) time to render at. */
export class ServerClock {
  private offset: number | null = null;

  /** Call with each snapshot's server time. */
  observe(serverTime: number): void {
    const o = serverTime - performance.now() / 1000;
    // Follow the earliest-arriving snapshots (least latency), but slew rather than jump so a late
    // first snapshot doesn't make everything lurch forward when a timely one arrives.
    if (this.offset === null || Math.abs(o - this.offset) > 1) this.offset = o;
    else if (o > this.offset) this.offset += (o - this.offset) * 0.08;
    else this.offset -= 0.0005;
  }

  /** Our best estimate of the server's game time right now. */
  get now(): number {
    return performance.now() / 1000 + (this.offset ?? 0);
  }

  get renderTime(): number {
    return performance.now() / 1000 + (this.offset ?? 0) - INTERP_DELAY_MS / 1000;
  }
}

export interface Pose {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  state: MoveState;
  /** Horizontal speed in m/s, derived from the bracketing samples. */
  speed: number;
}

interface Sample extends Omit<Pose, 'speed'> {
  t: number;
}

/** Snapshot history for one remote entity, sampled in the past for smooth motion. */
export class InterpBuffer {
  private readonly samples: Sample[] = [];

  push(t: number, x: number, z: number, yaw: number, pitch: number, state: MoveState): void {
    const last = this.samples[this.samples.length - 1];
    if (last && t <= last.t) return;
    this.samples.push({ t, x, z, yaw, pitch, state });
    if (this.samples.length > 24) this.samples.shift();
  }

  /** Forget history (after a teleport/respawn) so we don't glide across the map. */
  reset(): void {
    this.samples.length = 0;
  }

  sample(t: number): Pose | null {
    const s = this.samples;
    if (s.length === 0) return null;
    const first = s[0]!;
    const last = s[s.length - 1]!;
    if (t <= first.t) return { ...first, speed: 0 };
    if (t >= last.t) return { ...last, speed: 0 }; // starved: hold the newest pose
    let i = s.length - 2;
    while (i > 0 && s[i]!.t > t) i--;
    const a = s[i]!;
    const b = s[i + 1]!;
    const span = b.t - a.t;
    const k = span > 0 ? (t - a.t) / span : 1;
    const jump = Math.hypot(b.x - a.x, b.z - a.z);
    if (jump > 4) return { ...b, speed: 0 }; // teleport: snap, don't slide
    return {
      x: lerp(a.x, b.x, k),
      z: lerp(a.z, b.z, k),
      yaw: lerpAngle(a.yaw, b.yaw, k),
      pitch: lerp(a.pitch, b.pitch, k),
      state: b.state,
      speed: span > 0 ? jump / span : 0,
    };
  }
}
