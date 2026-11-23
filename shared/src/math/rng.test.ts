import { describe, expect, it } from 'vitest';
import { Rng } from './rng';

describe('Rng', () => {
  it('is deterministic for a seed', () => {
    const a = new Rng(1234);
    const b = new Rng(1234);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('differs between seeds and stays in [0,1)', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    let same = 0;
    for (let i = 0; i < 1000; i++) {
      const x = a.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      if (x === b.next()) same++;
    }
    expect(same).toBeLessThan(5);
  });

  it('int is inclusive and roughly uniform', () => {
    const r = new Rng(7);
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 4000; i++) counts[r.int(0, 3)]!++;
    for (const c of counts) expect(c).toBeGreaterThan(850);
  });

  it('weighted respects weights and skips zero', () => {
    const r = new Rng(99);
    const items = [
      { id: 'a', w: 0 },
      { id: 'b', w: 1 },
      { id: 'c', w: 3 },
    ];
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 4000; i++) counts[r.weighted(items, (it) => it.w).id]!++;
    expect(counts.a).toBe(0);
    expect(counts.c! / counts.b!).toBeGreaterThan(2.5);
    expect(counts.c! / counts.b!).toBeLessThan(3.5);
    expect(() => r.weighted(items, () => 0)).toThrow();
  });

  it('shuffle keeps all elements; fork is independent but deterministic', () => {
    const r = new Rng(5);
    expect(r.shuffle([1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(new Rng(5).fork().next()).toBe(new Rng(5).fork().next());
  });
});
