import { CELL_SIZE } from '../constants';
import { Cell, type CompiledMap } from './compile';

/**
 * Top-down text rendering of a compiled map: one character per 0.5 m in x and per 1 m in z
 * (terminal characters are about twice as tall as wide, so proportions come out right).
 * Legend: zone letter = floor, # wall, = door, : arch, w window, ~ zombie pocket, Z zombie
 * spawn, P player spawn, * light, o low prop, O tall prop.
 */
export function asciiMap(map: CompiledMap): string {
  const marks = new Map<number, string>();
  const mark = (x: number, z: number, ch: string) => marks.set(Math.floor(z) * 10000 + Math.floor(x / CELL_SIZE), ch);
  for (const l of map.def.lights) mark(l.x, l.z, '*');
  for (const s of map.spawns) mark(s.x, s.z, 'Z');
  for (const s of map.def.playerSpawns) mark(s.x, s.z, 'P');

  const glyph = (cx: number, cz: number): [number, string] => {
    const i = map.idx(cx, cz);
    const k = map.kind[i] as Cell;
    if (k === Cell.Door) return [6, '='];
    if (k === Cell.Window) return [5, 'w'];
    if (map.block[i]) return [2.5, map.block[i] === 2 ? 'O' : 'o'];
    if (k === Cell.Floor) return map.opening[i]! >= 0 ? [4, ':'] : [2, map.zones[map.zone[i]!]!.letter];
    if (k === Cell.Outside) return [1, '~'];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (map.kindAt(cx + dx, cz + dz) !== Cell.Solid) return [3, '#'];
    return [0, ' '];
  };

  const lines: string[] = [];
  for (let cz = 0; cz < map.rows; cz += 2) {
    let line = '';
    for (let cx = 0; cx < map.cols; cx++) {
      const m = marks.get((cz / 2) * 10000 + cx);
      if (m) {
        line += m;
        continue;
      }
      const a = glyph(cx, cz);
      const b = cz + 1 < map.rows ? glyph(cx, cz + 1) : a;
      line += (a[0] >= b[0] ? a : b)[1];
    }
    lines.push(line.trimEnd());
  }
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines.join('\n');
}

export function mapLegend(map: CompiledMap): string {
  const zones = map.zones.map((z) => `${z.letter} ${z.name}`).join(' · ');
  const doors = map.def.openings
    .filter((o) => o.kind === 'door')
    .map((o) => `  ${o.id}: ${o.zones[0]} <-> ${o.zones[1]} ${o.needsPower ? '(power)' : `(${o.cost})`}${o.style ? ` ${o.style}` : ''}`)
    .join('\n');
  return `Zones: ${zones}\n# wall  = door  : arch  w window  ~ zombie pocket  Z zombie spawn  P player spawn  * light  o low prop  O tall prop\nDoors:\n${doors}`;
}
