// Validates the map and writes the top-down ASCII dump to docs/MAP.txt. Usage: npm run map
import { writeFileSync } from 'node:fs';
import { asciiMap, compileMap, harrowRidge, mapLegend, validateMap } from '@zh/shared';

const map = compileMap(harrowRidge);
const { errors, warnings } = validateMap(map);
const text = `${harrowRidge.name} — ${harrowRidge.size.w} x ${harrowRidge.size.d} m, north is up, 1 char = 0.5 m wide x 1 m tall\n${mapLegend(map)}\n\n${asciiMap(map)}\n`;
writeFileSync(new URL('../docs/MAP.txt', import.meta.url), text);
console.log(text);
for (const w of warnings) console.log(`warning: ${w}`);
for (const e of errors) console.error(`ERROR: ${e}`);
console.log(errors.length ? `${errors.length} error(s)` : `map ok — ${map.spawns.length} zombie spawns, ${harrowRidge.openings.filter((o) => o.kind === 'door').length} doors`);
process.exitCode = errors.length ? 1 : 0;
