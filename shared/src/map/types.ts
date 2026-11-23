// Map definition format ("carved from solid"). See docs/PLAN.md section 6.1.
// Units are metres on a 0.5 m grid; x runs east, z runs south, y is up. Everything is solid
// until a room, opening or window pocket carves it out.

export const FLOOR_STYLES = ['concrete', 'tile', 'plank', 'snow', 'metal', 'lino'] as const;
export type FloorStyle = (typeof FLOOR_STYLES)[number];
export const WALL_STYLES = ['panel', 'block', 'plaster', 'metal', 'fence', 'rock'] as const;
export type WallStyle = (typeof WALL_STYLES)[number];

export type Dir = 'n' | 's' | 'e' | 'w';

export interface ZoneDef {
  id: string;
  name: string;
  /** Single character used in the ASCII dump. */
  letter: string;
  /** Ambient light colour (hex) the zone's surfaces receive before light pools. */
  ambient: number;
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
  /** Doors only: a heap of wreckage to clear instead of a door to open. */
  style?: 'debris';
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
  /** Lettering, for signs. */
  text?: string;
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
}

export interface LightDef {
  x: number;
  y: number;
  z: number;
  color: number;
  radius: number;
  intensity: number;
  /** Glows weakly until the power is on. */
  needsPower?: boolean;
  flicker?: boolean;
  /** The lamp drawn at the light: default 'shade'. 'none' when a prop is the source (a stove, a tank). */
  fixture?: 'shade' | 'tube' | 'cage' | 'flood' | 'none';
}

export interface MapDef {
  id: string;
  name: string;
  size: { w: number; d: number };
  zones: ZoneDef[];
  rooms: Room[];
  openings: Opening[];
  props: PropInst[];
  interactables: Interactable[];
  playerSpawns: { x: number; z: number; yaw: number }[];
  lights: LightDef[];
}

/** Zombie spawn point, generated from each window's pocket. */
export interface ZSpawn {
  id: string;
  x: number;
  z: number;
  windowId: string;
}
