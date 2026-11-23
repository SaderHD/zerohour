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
  /** A cable drum on its side. */
  spool: solid(1, 1, 1),
  tyres: solid(1, 1, 1),
  tyre: clutter(0.9, 0.9, 0.25),
  tool_chest: solid(1, 0.5, 1),
  /** An oil drum with a fire in it. */
  brazier: solid(0.5, 0.5, 1),
  /** Hazard stripes painted on the floor along local x; `s` is the length. */
  stripes: clutter(1, 0.3, 0.01),
  /** A row of icicles along local x under `y` (default the ceiling); `s` is the length. */
  icicles: clutter(1, 0.2, 0.4),
  /** Water dripping from `y` (default the ceiling) into a puddle. */
  drip: clutter(0.5, 0.5, 0.01),
  /** Pit props and a cap beam across a tunnel: `s` is the span along local x. */
  timber_frame: clutter(1, 0.25, 2.6),
  /** An extractor fan high on a wall, at `y`. */
  wall_fan: onWall(1.2, 1.2),
  /** Rungs up a wall to `y`. */
  ladder: onWall(0.5, 3),

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

  // --- Cold storage
  /** Pallet racking, 2 m of it along z, open to both sides. */
  rack: solid(1, 2, 2.4, true),
  ice_block: solid(1, 1, 0.6),
  ice_stack: solid(1, 1, 1.3),
  /** A meat rail along local x at `y`; `s` is the length. Variant 1 has loads hanging from it. */
  hook_rail: clutter(1, 0.3, 0.5),
  /** The refrigeration plant: fan to the front. */
  chiller: solid(2, 1, 2, true),

  // --- Generator hall
  /** A diesel generator set, 4 m long: radiator to the front (-z), alternator behind. */
  generator: solid(2, 4, 2.3, true),
  fuel_tank: solid(1.5, 3, 1.9, true),
  /** A switchgear cabinet. Variant 1 carries the master lever. */
  switchgear: solid(1, 1, 2.1, true),
  /** A walkway overhead along local x at `y`; `s` is the length. Nobody can get up there. */
  catwalk: clutter(1, 1.2, 1.1),

  // --- Motor pool. A truck is a cab with a bed behind it (+z); variant 1 is up on stands.
  truck_cab: solid(2.5, 2, 2.3, true),
  truck_bed: solid(2.5, 3.5, 1.45),
  workbench: solid(3, 1, 0.95),
  tool_board: onWall(2.4, 1.2),
  roller_door: onWall(4, 3.4),
  creeper: clutter(1, 0.5, 0.12),
  oil_stain: clutter(1.6, 1.4, 0.01),
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
