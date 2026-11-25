import { describe, expect, it } from 'vitest';
import { FORGE_COST, INTERMISSION_SECONDS } from '../constants';
import { DEFAULT_MAP, MAPS, compiledMap, isMapId, mapById, mapChoices, rulesOf } from './maps';

describe('the maps', () => {
  it('lists the ones people play, and the proving grounds only for a debug server', () => {
    expect(mapChoices(false)).toEqual(['harrow_ridge']);
    expect(mapChoices(true)).toEqual(['harrow_ridge', 'stacks']);
    expect(mapChoices(false)).toContain(DEFAULT_MAP);
  });

  it('knows a map id from anything else', () => {
    for (const id of Object.keys(MAPS)) expect(isMapId(id)).toBe(true);
    for (const bad of ['', 'nowhere', '__proto__', 'constructor', 'toString', null, undefined, 3]) expect(isMapId(bad), String(bad)).toBe(false);
    expect(mapById('constructor').id).toBe(DEFAULT_MAP);
  });

  it('compiles each map once', () => {
    expect(compiledMap('stacks')).toBe(compiledMap('stacks'));
    expect(compiledMap('stacks').def.id).toBe('stacks');
    expect(compiledMap(undefined).def.id).toBe(DEFAULT_MAP);
  });

  it('gives a map the game\'s numbers except where it has its own', () => {
    const station = mapById(DEFAULT_MAP);
    expect(rulesOf(station)).toEqual({ intermission: INTERMISSION_SECONDS, forgeCost: FORGE_COST });
    expect(rulesOf({ ...station, rules: { forgeCost: 2500 } })).toEqual({ intermission: INTERMISSION_SECONDS, forgeCost: 2500 });
  });

  it('every map says where it is: its air, and a vista inside it', () => {
    for (const def of Object.values(MAPS)) {
      expect(def.scene.fog.far, def.id).toBeGreaterThan(def.scene.fog.near);
      const { x, z } = def.scene.vista;
      expect(x >= 0 && x <= def.size.w && z >= 0 && z <= def.size.d, def.id).toBe(true);
    }
  });
});
