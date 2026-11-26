// Validates a map and prints its top-down ASCII dump. Usage: npm run map [-- <map id>]
// The station (the default) is also written to docs/MAP.txt; any other map is only checked and printed.
import { writeFileSync } from 'node:fs';
import { DEFAULT_MAP, MAPS, asciiLevels, compileMap, isMapId, mapById, mapLegend, validateMap } from '@zh/shared';

const id = process.argv[2] ?? DEFAULT_MAP;
if (!isMapId(id)) throw new Error(`no map called ${id}: ${Object.keys(MAPS).join(', ')}`);
const def = mapById(id);
const map = compileMap(def);
const { errors, warnings } = validateMap(map);
const text = `${def.name} — ${def.size.w} x ${def.size.d} m, north is up, 1 char = 0.5 m wide x 1 m tall\n${mapLegend(map)}\n\n${asciiLevels(map)}\n`;
if (id === DEFAULT_MAP) writeFileSync(new URL('../docs/MAP.txt', import.meta.url), text);
console.log(text);
for (const w of warnings) console.log(`warning: ${w}`);
for (const e of errors) console.error(`ERROR: ${e}`);
console.log(errors.length ? `${errors.length} error(s)` : `map ok — ${map.spawns.length} zombie spawns, ${def.openings.filter((o) => o.kind === 'door').length} doors`);
process.exitCode = errors.length ? 1 : 0;
