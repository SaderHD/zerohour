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
  /** A handrail along local x at the edge of a drop; `s` is its length. Variant 1 is timber, for outdoors. */
  railing: clutter(1, 0.1, 1),

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

  // --- Courtyard
  /** A tracked snow vehicle: blade to the front (-z). */
  snowcat: solid(2.5, 4, 2.4, true),
  /** The plinth of a flagpole; the pole and flag are too thin to stop anything. */
  flagpole: solid(0.5, 0.5, 0.6),
  /** The foot of the radio mast: an open lattice, so it does not block sight. */
  mast: solid(1.5, 1.5, 3),
  /** A concrete block a guy wire is made off to. */
  anchor_block: solid(0.5, 0.5, 0.5),
  /** A wire from the ground here up to `y`, `s` metres away along the prop's front. */
  guy_wire: clutter(0.1, 0.1, 0.1),
  sandbags: solid(2, 0.5, 0.9),
  /** Snow blown into a heap, usually against a wall (+z). */
  snow_drift: clutter(2, 1, 0.4),
  /** Wheel ruts in the snow along local z; `s` is the length. */
  tracks: clutter(1.8, 1, 0.01),
  /** Wire strung on angle irons along the top of a fence at `y`; `s` is the length. */
  wire_top: onWall(1, 0.5),

  // --- Comms bunker
  /** An operator's desk: sloped panel of lamps and keys, a scope in the riser. */
  console: solid(2, 1, 1.3),
  /** A plotting scope lying flat in its pedestal, the sweep still turning. */
  radar: solid(1, 1, 1.1),
  map_table: solid(2, 1.5, 0.9),
  radio_rack: solid(1, 0.5, 2, true),
  teleprinter: solid(1, 0.5, 1),
  wall_map: onWall(2.4, 1.4),

  // --- Vault
  /** The Forge: a press between two columns, open to the front. */
  forge: solid(2, 1.5, 2.3, true),
  capacitor: solid(1, 1, 2.2, true),
  transformer: solid(1, 1, 1.2),
  /** Heavy cables clipped along a wall at `y`; `s` is the length. */
  cable_bundle: onWall(1, 0.3),

  // --- The street kit (The Longest Night). A vehicle's front is -z.
  /** A car left where it stopped. Variants 0-4 are saloons by colour, 5 an estate, 6 a cab, 7 a patrol car; add 10 and its lamps are still on. */
  car: solid(2, 4.5, 1.45),
  /** A city bus, its inside lights still failing. */
  bus: solid(2.5, 9, 3.1, true),
  /** A delivery van; variant 1 has its back doors open. */
  van: solid(2, 5, 2.5, true),
  /** A news kiosk: the hatch to the front. */
  kiosk: solid(2, 1.5, 2.7, true),
  phone_booth: solid(1, 1, 2.4, true),
  /** A police trestle: a striped board on two A-frames. */
  sawhorse: solid(2, 0.5, 1.05),
  /** A concrete road barrier. */
  jersey: solid(2, 0.5, 0.85),
  hydrant: solid(0.5, 0.5, 0.8),
  mailbox: solid(0.5, 0.5, 1.2),
  dumpster: solid(2, 1, 1.4),
  /** A grating in the road with steam coming up through it. */
  steam_grate: clutter(1, 1, 0.02),
  /** A manhole cover; variant 1 is ajar and steams. */
  manhole: clutter(0.8, 0.8, 0.03),
  /** A clothes line along local x from height `y` at one end to `y2` at the other; `s` is its length. */
  washing_line: clutter(1, 0.1, 0.8),

  // --- The Christmas kit
  /** The tree in Wexler Square: fourteen metres of it in a stone tub, lit. */
  xmas_tree: solid(3, 3, 14, true),
  /** A cut fir on a stand, for sale. */
  fir: solid(0.5, 0.5, 2.2),
  /** Bulbs on a wire along local x, from height `y` at one end to `y2` at the other, sagging; `s` is its length. Variant 1 is coloured. */
  light_string: clutter(1, 0.1, 0.3),
  wreath: onWall(0.9, 0.9),
  /** Swags of greenery and bulbs along a wall at `y`; `s` is the length. */
  garland: onWall(1, 0.5),
  /** A heap of wrapped presents. */
  presents: clutter(1, 1, 0.5),
  /** A market stall: counter to the front under a striped canopy. Variants 0-2 by colour; add 3 and the canopy is down. */
  market_stall: solid(3, 1.5, 2.7, true),
  /** Two metres of the boards round the rink. */
  rink_board: solid(2, 0.5, 1),
  /** The rink's ice. */
  rink_ice: clutter(15, 11, 0.02),
  /** An octagonal bandstand: open, so it does not block sight. */
  bandstand: solid(4, 4, 1.1),
  park_bench: solid(2, 0.5, 0.9),
  snowman: solid(0.5, 0.5, 1.5),

  /** A small tree in a pot, indoors: tinsel, bulbs, a few presents under it. */
  tinsel_tree: solid(1, 1, 2),
  /** Something big hung from the ceiling down to `y`: variants 0-2 a bauble by colour, 3 a star. */
  hanging_decor: clutter(1, 1, 1),

  // --- The store kit (Abelard's)
  /** Shelves of boxed toys, open to the front. Variant 1 is half empty. */
  toy_shelf: solid(2, 0.5, 2, true),
  /** A table under a cloth heaped with toys: variant 0 bears, 1 boxes and blocks, 2 both. */
  display_table: solid(2, 1, 1.2),
  /** A glass counter with a till on it. */
  shop_counter: solid(2, 1, 1.05),
  /** Shop dummies in winter coats on a plinth: variant 0 two, 1 two and a child, 2 three. */
  mannequins: solid(2, 1, 2),
  /** A rail of coats. */
  clothes_rack: solid(2, 0.5, 1.6),
  /** The gift-wrap counter: rolls of paper on a rack behind it. */
  wrap_counter: solid(3, 1, 1.6),
  /** A model railway on a table: the train runs when the mains are on. */
  model_railway: solid(3, 2, 1.3),
  /** A toy carousel on a stand, still turning. */
  toy_carousel: solid(1, 1, 1.9),
  /** The grotto: the front of a log cabin, its windows lit. */
  grotto_hut: solid(3, 1, 3, true),
  /** The grotto's chair, empty, a sack beside it. */
  throne: solid(1, 1, 1.9),
  /** Two brass posts and a rope between them. */
  rope_barrier: solid(2, 0.5, 1),
  /** The sides of an escalator on a flight that climbs towards its front: `s` is the flight's length, `y2` its rise. */
  escalator: clutter(2, 7, 1),

  // --- The halls kit (the Lyric, St Audra's)
  /** Five tip-up seats in a row. */
  cinema_seats: solid(2.5, 0.5, 1),
  /** The screen, with a white frame thrown on it, between its curtains: `s` wide, its foot at `y`. */
  cinema_screen: onWall(10, 3.8),
  /** A film projector on its pedestal, running: the lens to the front. */
  projector: solid(1, 1, 1.8),
  ticket_booth: solid(1.5, 1.5, 2.6, true),
  /** The popcorn stand: a glass case on a striped counter. */
  popcorn_stand: solid(2, 1, 2.1),
  /** A poster in a frame of bulbs, its foot at `y`; `variant` picks the picture. */
  poster_case: onWall(1.2, 1.8),
  /** A cinema's canopy over the pavement, its foot at `y`; `s` is its length. */
  marquee: onWall(7, 1.2),
  pew: solid(2, 0.5, 1),
  altar: solid(2, 1, 1.5),
  /** The organ: the console to the front, the pipes over it. */
  organ: solid(3, 1, 4.5, true),
  /** A nativity in a stable, the crib empty. */
  nativity: solid(2, 1, 1.6),
  /** A stand of votive candles. */
  candle_stand: solid(0.5, 0.5, 1.3),
  /** Coloured glass in a wall, its foot at `y`: variant 0 a lancet, 1 a rose. */
  stained_glass: onWall(1.4, 3),
  /** A stone doorway: piers, a gable and a cross over a door two metres wide. */
  porch: onWall(3.2, 5.6),

  // --- Mounts: where the things players buy stand (the buying itself is in the server's interactables).
  /** A board a wall weapon hangs on; `text` is the weapon's name. */
  wallbuy: onWall(1.4, 0.8),
  /** A tonic dispenser; `variant` picks its colour, `text` its name. */
  tonic: solid(1, 1, 2.1, true),
  /** A pallet the Cache can stand on; `text` is its site number. */
  cache_site: solid(2, 1, 0.3),
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
