// Validates the map and writes the top-down ASCII dump to docs/MAP.txt. Usage: npm run map
import { writeFileSync } from 'node:fs';
import { asciiLevels, compileMap, harrowRidge, mapLegend, stacks, validateMap } from '@zh/shared';

// `npm run map -- stacks` checks and prints the height proving ground instead (nothing is written).
const proving = process.argv[2] === 'stacks';
const def = proving ? stacks : harrowRidge;
const map = compileMap(def);
const { errors, warnings } = validateMap(map);
const text = `${def.name} — ${def.size.w} x ${def.size.d} m, north is up, 1 char = 0.5 m wide x 1 m tall\n${mapLegend(map)}\n\n${asciiLevels(map)}\n`;
if (!proving) writeFileSync(new URL('../docs/MAP.txt', import.meta.url), text);
console.log(text);
for (const w of warnings) console.log(`warning: ${w}`);
for (const e of errors) console.error(`ERROR: ${e}`);
console.log(errors.length ? `${errors.length} error(s)` : `map ok — ${map.spawns.length} zombie spawns, ${def.openings.filter((o) => o.kind === 'door').length} doors`);
process.exitCode = errors.length ? 1 : 0;
