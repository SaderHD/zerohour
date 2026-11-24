// Harrow Ridge stands on a slope. The mess hall, the bunkhouse, the generator hall and the top of
// the yard are at 0; these are the other floors, metres from there. A terrace is FLOOR_GAP from
// the next, so nothing reaches up or down a terrace wall: whoever is at its foot has to walk round.

/** The laboratory and the cold store, up the ridge. */
export const TERRACE_N = 1.5;
/** The low yard, the motor pool's floor and the comms bunker, down it. */
export const TERRACE_S = -1.5;
/** The generator hall's gallery. */
export const GALLERY_Y = 3;
/** The vault, under the bunker. */
export const VAULT_Y = -4.5;
