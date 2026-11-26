import { describe, expect, it } from 'vitest';
import { MAPS } from '@zh/shared';
import { AIR } from './ambience';
import { CAROLS } from './music';

describe('what each place sounds like', () => {
  it('every zone of every map names an air there is', () => {
    for (const def of Object.values(MAPS)) for (const z of def.zones) if (z.air) expect(AIR[z.air], `${def.id}: ${z.id} has the air '${z.air}'`).toBeDefined();
  });

  it('The Longest Night has none of the station\'s: streets, roofs, the subway and every hall have their own', () => {
    const airs = new Set(MAPS.longest_night.zones.map((z) => z.air));
    expect([...airs].sort()).toEqual(['alley', 'chapel', 'cinema', 'diner', 'home', 'relays', 'roof', 'store', 'street', 'subway']);
    for (const z of MAPS.longest_night.zones) expect(!!AIR[z.air!]!.open, z.id).toBe(['square', 'avenue', 'lane', 'ten_roof', 'abelard_roof'].includes(z.id));
  });

  it('the carols are four tunes of four phrases, each a few seconds long and within a voice\'s compass', () => {
    expect(CAROLS.map((c) => c.name)).toEqual(['gentlemen', 'coventry', 'greensleeves', 'emmanuel']);
    for (const c of CAROLS) {
      expect(c.phrases).toHaveLength(4);
      for (const p of c.phrases) {
        const seconds = p.reduce((n, [, beats]) => n + beats, 0) * (60 / c.bpm);
        expect(seconds, c.name).toBeGreaterThan(5);
        expect(seconds, c.name).toBeLessThan(22);
        for (const [n] of p) if (n) expect(n >= 60 && n <= 81, `${c.name}: ${n}`).toBe(true);
      }
    }
  });
});
