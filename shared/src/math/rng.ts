/** Seeded PRNG (mulberry32). All gameplay randomness goes through one of these. */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** Float in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [lo, hi). */
  range(lo: number, hi: number): number {
    return lo + this.next() * (hi - lo);
  }

  /** Integer in [lo, hi] inclusive. */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick on empty array');
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /** Pick by weight; entries with weight <= 0 are never chosen. */
  weighted<T>(items: readonly T[], weightOf: (item: T) => number): T {
    let total = 0;
    for (const it of items) total += Math.max(0, weightOf(it));
    if (total <= 0) throw new Error('Rng.weighted with no positive weights');
    let r = this.next() * total;
    let last: T | undefined;
    for (const it of items) {
      const w = Math.max(0, weightOf(it));
      if (w <= 0) continue;
      last = it;
      if (r < w) return it;
      r -= w;
    }
    return last as T;
  }

  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [items[i], items[j]] = [items[j] as T, items[i] as T];
    }
    return items;
  }

  /** Derive an independent stream (e.g. per zombie cosmetic seed). */
  fork(): Rng {
    return new Rng(Math.floor(this.next() * 4294967296));
  }
}
