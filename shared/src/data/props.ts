// Prop catalogue: what each piece of furniture occupies. The client's builders
// (client/src/models/props) draw them; the map compiler rasterises the solid ones into the
// collision grid. See docs/PLAN.md sections 4.11 and 6.1.

export interface PropDef {
  /** Footprint in metres at rot 0: w along x, d along z. Solid props must be multiples of 0.5. */
  w: number;
  d: number;
  /** Height in metres: bullets pass over anything lower than their path. */
  h: number;
  /** Blocks movement (players and zombies). Small clutter does not. */
  solid: boolean;
  /** Blocks sight, light and explosions as a wall would. */
  tall?: boolean;
  /** Hangs on a wall: placed with its back at the wall face. */
  wall?: boolean;
}

const solid = (w: number, d: number, h: number, tall = false): PropDef => ({ w, d, h, solid: true, tall });
const clutter = (w: number, d: number, h: number): PropDef => ({ w, d, h, solid: false });
const onWall = (w: number, h: number): PropDef => ({ w, d: 0.1, h, solid: false, wall: true });

export const PROPS = {
  // --- Kit: used all over the station
  crate: solid(1, 1, 1),
  crate_stack: solid(1, 1, 1.9, true),
  crate_small: solid(0.5, 0.5, 0.55),
  barrel: solid(0.5, 0.5, 0.95),
  barrels: solid(1, 1, 0.95),
  shelf: solid(1, 0.5, 2, true),
  locker: solid(0.5, 0.5, 1.9, true),
  table: solid(2, 1, 0.8),
  table_long: solid(3, 1, 0.8),
  table_small: solid(1, 1, 0.8),
  bench: solid(3, 0.5, 0.5),
  desk: solid(1.5, 1, 0.8),
  chair_tipped: clutter(0.9, 0.5, 0.45),
  stool: clutter(0.4, 0.4, 0.45),
  rubble: clutter(1.2, 1, 0.3),
  planks: clutter(1.4, 0.8, 0.15),
  papers: clutter(1, 1, 0.02),
  /** Ceiling pipe run along local x; `s` is its length, `y` its height. */
  pipes: clutter(1, 0.4, 0.2),
  /** Slack cable along local x on the floor (or at `y`); `s` is its length. */
  cable: clutter(1, 0.1, 0.05),
  /** A drop of pipe down a wall, from `y` (default the ceiling) to the floor. */
  pipe_drop: onWall(0.2, 2.6),
  sign: onWall(1.2, 0.4),
  vent: onWall(0.8, 0.5),

  // --- Mess hall
  range: solid(2, 1, 0.9),
  counter: solid(3, 1, 1),
  notice_board: onWall(1.8, 1.1),

  // --- Bunkhouse and washroom
  bunk_bed: solid(1, 2, 1.8, true),
  footlocker: solid(1, 0.5, 0.5),
  potbelly: solid(1, 1, 1),
  lantern: clutter(0.2, 0.2, 0.3),
  sink: solid(1, 0.5, 0.9),
  stall: solid(1, 1.5, 2, true),
  boiler: solid(0.5, 0.5, 1.8, true),
  bin: solid(0.5, 0.5, 0.6),

  // --- Laboratory
  lab_bench: solid(3, 1, 0.95),
  tank: solid(1, 1, 2.2, true),
  computer: solid(1, 1, 1.9, true),
  chalkboard: onWall(2.4, 1.2),
  shelf_toppled: solid(2, 1, 0.6),
} satisfies Record<string, PropDef>;

export type PropType = keyof typeof PROPS;

export const propDef = (type: string): PropDef | undefined => (PROPS as Record<string, PropDef>)[type];

/** Quarter turns of a rotation in degrees, or -1 if it is not a multiple of 90. */
export function quarterTurns(rot = 0): number {
  const q = rot / 90;
  return Math.abs(q - Math.round(q)) < 1e-6 ? ((Math.round(q) % 4) + 4) % 4 : -1;
}

/** World-space footprint of a placed prop (centred on x, z). Only meaningful for quarter-turn rotations. */
export function propRect(def: PropDef, inst: { x: number; z: number; rot?: number }): { x: number; z: number; w: number; d: number } {
  const turned = quarterTurns(inst.rot) % 2 === 1;
  const w = turned ? def.d : def.w;
  const d = turned ? def.w : def.d;
  return { x: inst.x - w / 2, z: inst.z - d / 2, w, d };
}
