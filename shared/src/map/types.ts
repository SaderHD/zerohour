// Map definition format ("carved from solid"). See docs/PLAN.md section 6.1.
// Units are metres on a 0.5 m grid; x runs east, z runs south, y is up. Everything is solid
// until a room, opening or window pocket carves it out.

// (New styles go at the end: a compiled cell stores its style's place in the list.)
export const FLOOR_STYLES = ['concrete', 'tile', 'plank', 'snow', 'metal', 'lino', 'asphalt', 'pavement', 'felt'] as const;
export type FloorStyle = (typeof FLOOR_STYLES)[number];
export const WALL_STYLES = ['panel', 'block', 'plaster', 'metal', 'fence', 'rock', 'siding', 'brick', 'shopfront', 'subway', 'iron'] as const;
export type WallStyle = (typeof WALL_STYLES)[number];

export type Dir = 'n' | 's' | 'e' | 'w';

export interface ZoneDef {
  id: string;
  name: string;
  /** Single character used in the ASCII dump. */
  letter: string;
  /** Ambient light colour (hex) the zone's surfaces receive before light pools. */
  ambient: number;
  /** The air in here: fog colour and range (metres) while the viewer stands in the zone. */
  fog?: Fog;
  /** What it sounds like when nothing is happening: one of the client's airs (`audio/ambience.ts`). None is silence. */
  air?: string;
}

/** The air: fog colour and where it starts and ends, in metres. */
export interface Fog {
  color: number;
  near: number;
  far: number;
}

/**
 * Where a map is: everything about its look and sound that is the place and not the engine. The
 * client draws each part from the kind named here (`render/sky.ts`, `render/exterior.ts`,
 * `render/snow.ts`, `render/atmosphere.ts`).
 */
export interface MapScene {
  /**
   * The sky round the map. 'ridge': stars, a low moon, an aurora and two ranges of mountains.
   * 'city': low cloud lit from below, and a far skyline with its windows on.
   */
  sky: 'ridge' | 'city';
  /** The sky's colours: overhead, at the horizon, and the haze below the horizon. */
  skyTop: number;
  skyHorizon: number;
  haze: number;
  /**
   * What the solid is, seen from outside. 'station': a hut or a shed over every room, clad by the
   * walls it has inside, under a snowed roof. 'city': the solid is buildings (`MapDef.blocks`), each
   * as tall as its block says, faced in masonry with rows of windows under a flat roof.
   */
  built: 'station' | 'city';
  /**
   * What stands beyond the map. 'pines': a wood, thickest where the outdoor rooms look out on it.
   * 'towers': a ring of towers far taller than anything in the map, their windows lit.
   */
  beyond: 'pines' | 'towers' | 'none';
  /** The light (hex) on whatever belongs to no zone: the pockets behind windows, roofs, what stands outside. */
  outside: number;
  /** What the pockets behind windows are floored and walled in (snow and rock when it does not say). */
  pocket?: { floor: FloorStyle; wall: WallStyle };
  /** Snow falls wherever a cell is open to the sky. */
  snow: boolean;
  /** The air in every zone that names none of its own. */
  fog: Fog;
  /** Where the camera stands behind the menu, turning slowly. */
  vista: { x: number; y: number; z: number };
}

/** A map's own numbers, where it needs other than the game's (`rulesOf` fills in the rest). */
export interface MapRules {
  /** Seconds between rounds. */
  intermission?: number;
  /** What the Forge charges. */
  forgeCost?: number;
}

/**
 * A building as it stands outside, on a map whose scene is `built: 'city'`: the solid in this
 * rectangle, and the rooms carved in it, are a building `h` metres tall. Where blocks overlap the
 * later one has the ground; solid no block covers is `BLOCK_HEIGHT` of brick. See `map/massing.ts`.
 */
export interface BlockDef {
  x: number;
  z: number;
  w: number;
  d: number;
  /** Height of its roof above the ground storey's base, metres. */
  h: number;
  /** What it is faced in above the street: the wall style of the strip of street in front of it, to carry on from it. */
  face: WallStyle;
  /** Hex colour multiplied into its walls (as a room's tint is). */
  tint?: number;
  /** How far its edge stands above its roof, metres (default `PARAPET`; 0 for a roof that is walked on, or a fence). */
  parapet?: number;
  /** The share of its windows with a light on, 0-1 (default 0.2); `false` for a wall with no windows in it. */
  lit?: number | false;
  /** What stands on its roof (default: by its size, from the map's seed). */
  roof?: 'bare' | 'tank' | 'hut' | 'vents';
}

/** A rectangle of open floor. Rooms of the same zone may abut to form L-shapes. */
export interface Room {
  id: string;
  zone: string;
  x: number;
  z: number;
  w: number;
  d: number;
  ceil: number;
  floor: FloorStyle;
  wall: WallStyle;
  /** No ceiling; lit by the sky. */
  outdoor?: boolean;
  /** Hex colour multiplied into the room's surfaces. */
  tint?: number;
  /** Cold enough that mist lies on the floor. */
  mist?: boolean;
  /** Storey: -1 a basement, 0 the ground (default), 1 upstairs. Rooms on different levels may lie over each other. */
  level?: number;
  /** Floor height in metres above the level's base (default 0; negative for a pit). `ceil` is measured from here. */
  y?: number;
  /**
   * A ramp or staircase: the floor climbs `by` metres in all towards `to`, in equal risers a cell
   * apart, meeting floor at `y` at its foot and at `y + by` at its head. The ceiling stays flat.
   */
  rise?: { to: Dir; by: number; stairs?: boolean };
}

/** A storey of the map: where its floors sit unless a room says otherwise. */
export interface LevelDef {
  level: number;
  name: string;
  /** Height of the level's base floor, metres. */
  y: number;
}

/**
 * A hole carved through solid wall between two spaces.
 * - arch: always open. - door: bought with points (or opened by power). - window: zombie entry,
 *   never walkable by players; carves an enclosed outdoor "pocket" behind it where zombies spawn.
 */
export interface Opening {
  id: string;
  kind: 'arch' | 'door' | 'window';
  x: number;
  z: number;
  w: number;
  d: number;
  /** Zones on either side. For windows: [zone, 'outside']. */
  zones: [string, string];
  cost?: number;
  needsPower?: boolean;
  /** Windows only: which way is outside. */
  out?: Dir;
  /** Windows only: pocket depth in metres (default 3). */
  pocket?: number;
  /**
   * Windows only: what its pocket is. By default a walled yard open to the sky, carved out of solid
   * ground. 'air': a ledge in the open air with nothing round it - outside an upstairs window, over
   * a parapet (the window is then a gap in it, open above), hanging over a street or a lower roof.
   * 'tunnel': roofed and dark - a track tunnel, a cellar, a back room - so it can lie under a
   * street or under the floor above.
   */
  behind?: 'air' | 'tunnel';
  /** Doors only: a heap of wreckage to clear instead of a door to open. */
  style?: 'debris';
  /** The storey it is cut on (default 0). It stands at the floor height of the room it touches. */
  level?: number;
}

/**
 * A placed prop (see data/props.ts). (x, z) is the centre of its footprint; wall-hung props sit
 * with their back on that point. `rot` is in degrees like a yaw: 0 faces north, 90 west, 180
 * south, 270 east. Solid props only turn in quarter turns.
 */
export interface PropInst {
  type: string;
  x: number;
  z: number;
  rot?: number;
  /** Picks the look (contents, colour, damage); the rest is seeded from the position. */
  variant?: number;
  /** Height off the floor, for props that hang (signs, pipes, lamps). */
  y?: number;
  /** Length in metres, for runs (pipes, cables). */
  s?: number;
  /** Height of the far end, for things strung between two points (`y` is the near end's). */
  y2?: number;
  /** Lettering, for signs. */
  text?: string;
  /** The storey it stands on (default 0). */
  level?: number;
}

export type InteractableKind = 'wallbuy' | 'tonic' | 'cacheSite' | 'powerSwitch' | 'forge';

export interface Interactable {
  id: string;
  kind: InteractableKind;
  /** Weapon/perk id where relevant. */
  ref?: string;
  x: number;
  z: number;
  facing: Dir;
  /** The storey it is on (default 0). */
  level?: number;
}

export interface LightDef {
  x: number;
  /** Height above the base of its level. */
  y: number;
  z: number;
  /** The storey it lights (default 0). */
  level?: number;
  color: number;
  radius: number;
  intensity: number;
  /** Glows weakly until the power is on. */
  needsPower?: boolean;
  flicker?: boolean;
  /** It wavers and is no flame (a screen, a lamp on its way out): nothing crackles there. */
  silent?: boolean;
  /**
   * The lamp drawn at the light: default 'shade'. 'swing' is a caged lamp swaying on its chain,
   * 'none' when a prop is the source (a stove, a tank). 'post' is a street lamp on an iron post,
   * a wreath hung on it.
   */
  fixture?: 'shade' | 'tube' | 'cage' | 'flood' | 'swing' | 'post' | 'none';
}

export interface MapDef {
  id: string;
  name: string;
  size: { w: number; d: number };
  /** Not offered in the lobby (a proving ground): only a debug server lets a host choose it. */
  hidden?: boolean;
  scene: MapScene;
  rules?: MapRules;
  zones: ZoneDef[];
  /** Storeys other than the ground (level 0 at y 0 is always there). */
  levels?: LevelDef[];
  /** The buildings, where the scene is `built: 'city'`. */
  blocks?: BlockDef[];
  rooms: Room[];
  openings: Opening[];
  props: PropInst[];
  interactables: Interactable[];
  playerSpawns: { x: number; z: number; yaw: number; level?: number }[];
  lights: LightDef[];
}

/** Zombie spawn point, generated from each window's pocket. */
export interface ZSpawn {
  id: string;
  x: number;
  y: number;
  z: number;
  windowId: string;
}
