/** A token bucket: `rate` per second, at most `burst` saved up. Time is passed in (ms) so tests own the clock. */
export class Bucket {
  private tokens: number;
  private at: number;

  constructor(private readonly rate: number, private readonly burst: number, now: number) {
    this.tokens = burst;
    this.at = now;
  }

  /** Spend one token; false when there is none. */
  take(now: number): boolean {
    this.tokens = Math.min(this.burst, this.tokens + (Math.max(0, now - this.at) / 1000) * this.rate);
    this.at = now;
    if (this.tokens < 1) return false;
    this.tokens--;
    return true;
  }
}
