// Prints part of one storey of a map a character a cell (0.5 m both ways), with a ruler: for
// finding where to put something. Usage: tsx scripts/region.ts <map> <level> <x0> <z0> <x1> <z1>
import { Cell, compileMap, isMapId, mapById } from '@zh/shared';

const [id = '', lv = '0', ...nums] = process.argv.slice(2);
if (!isMapId(id)) throw new Error(`no map called ${id}`);
const [x0 = 0, z0 = 0, x1 = 20, z1 = 20] = nums.map(Number);
const map = compileMap(mapById(id));
const layer = map.layerOf(Number(lv));
const marks = new Map<string, string>();
for (const it of map.def.interactables) if ((it.level ?? 0) === Number(lv)) marks.set(`${Math.floor(it.x * 2)},${Math.floor(it.z * 2)}`, '$');
let ruler = '       ';
for (let cx = x0 * 2; cx < x1 * 2; cx++) ruler += cx % 4 === 0 ? String((cx / 2) % 10) : ' ';
console.log(ruler);
for (let cz = z0 * 2; cz < z1 * 2; cz++) {
  let line = `${(cz / 2).toFixed(1).padStart(6)} `;
  for (let cx = x0 * 2; cx < x1 * 2; cx++) {
    const i = map.idx(cx, cz, layer);
    const k = map.kind[i] as Cell;
    line += marks.get(`${cx},${cz}`) ?? (k === Cell.Door ? '=' : k === Cell.Window ? 'w' : map.block[i] ? (map.block[i] === 2 ? 'O' : 'o') : k === Cell.Floor ? (map.opening[i]! >= 0 ? ':' : map.rise[i] ? '/' : '.') : k === Cell.Outside ? '~' : '#');
  }
  console.log(line);
}
