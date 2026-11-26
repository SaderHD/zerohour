// Every tunable number in the game lives here or in shared/src/data. See docs/PLAN.md section 4.

export const PROTOCOL_VERSION = 10;

// --- Networking ---
export const TICK_RATE = 30; // server sim Hz
export const TICK_DT = 1 / TICK_RATE;
export const TICK_BUDGET_MS = 5; // a server tick should cost less than this with a full horde
export const SNAPSHOT_EVERY_TICKS = 2; // 15 Hz
export const SNAPSHOT_BUDGET_BYTES = 4096; // a snapshot of 4 players and a full horde stays under this
export const CLIENT_MOVE_SEND_HZ = 20;
export const INTERP_DELAY_MS = 120;
export const MAX_PLAYERS = 4;
export const ROOM_CODE_LENGTH = 4;
export const RECONNECT_GRACE_MS = 60_000;
export const MAX_NAME_LENGTH = 16;
export const MAX_CHAT_LENGTH = 120;
export const MAX_MSG_BYTES = 8 * 1024;
export const DEFAULT_PORT = 8080;
export const MAX_ROOMS = 500;
export const ROOM_UNUSED_MS = 30 * 60_000; // a lobby or results screen nobody touches is closed after this
export const HELLO_TIMEOUT_MS = 10_000; // a connection must say hello within this
export const HEARTBEAT_MS = 15_000; // the server pings every socket this often; one missed pong and it is dropped
// Rate limits, as token buckets: [per second, burst]. Over the first, messages are dropped; a
// connection that has had RATE_STRIKES dropped is closed.
export const RATE_ALL: readonly [number, number] = [120, 240];
export const RATE_CHAT: readonly [number, number] = [1, 4];
export const RATE_MARK: readonly [number, number] = [1, 3];
export const RATE_ROOM: readonly [number, number] = [2, 10]; // create, join, leave, ready, map, start, again
export const RATE_PING: readonly [number, number] = [2, 10];
export const RATE_STRIKES = 300;
export const MARK_SECONDS = 6; // a ping marker stays up this long
export const MARK_RANGE = 60;

// --- World ---
export const CELL_SIZE = 0.5; // metres per nav/collision cell
/** Tallest change of floor height between neighbouring cells that can be walked over; anything more is a ledge. */
export const STEP_HEIGHT = 0.3;
/** Least open height over a floor that anyone walks on. */
export const MIN_HEADROOM = 2;
/** Bodies whose feet are further apart in height than this are on different floors: they do not touch. */
export const FLOOR_GAP = 1.5;
/** Height above the feet from which sight lines are taken (chest height). */
export const SIGHT_HEIGHT = 1.2;
export const MIN_LANE_WIDTH = 1.5;
export const POWER_OFF_LIGHT = 0.4; // share of a mains light's glow before the power is on

// --- Player ---
export const PLAYER_RADIUS = 0.35;
export const PLAYER_EYE_HEIGHT = 1.6;
export const WALK_SPEED = 4.5;
export const SPRINT_SPEED = 6.5;
export const STAMINA_SECONDS = 4;
export const STAMINA_REGEN_DELAY = 2;
export const MOVE_SPEED_SLACK = 1.5; // server tolerance multiplier on reported movement
export const MOVE_BUDGET_CAP = 3; // metres of movement a client can bank (absorbs jitter and lag spikes)
export const ROOM_IDLE_MS = 30_000; // empty rooms are deleted after this
export const PLAYER_MAX_HP = 100;
export const PLAYER_REGEN_DELAY = 4;
export const PLAYER_REGEN_RATE = 60; // hp per second once regen starts
export const BLEEDOUT_SECONDS = 45;
export const REVIVE_SECONDS = 3;
export const REVIVE_GRACE_SECONDS = 2; // nothing hurts a player just back on their feet
export const REVIVE_RANGE_SLACK = 0.6; // server tolerance on INTERACT_RANGE for a revive
export const MAX_PERKS = 4;
export const SOLO_SELF_REVIVES = 3;
export const WEAPON_SLOTS = 2;
export const START_GRENADES = 2;
export const MAX_GRENADES = 4;
export const KNIFE_DAMAGE = 150;
export const KNIFE_COOLDOWN = 0.6;
export const KNIFE_RANGE = 1.6;
export const INTERACT_RANGE = 1.8;
export const INTERACT_SLACK = 0.6; // server tolerance on INTERACT_RANGE for a purchase
export const DOOR_OPEN_SECONDS = 0.8; // the client's opening animation; it blocks the player until done

// --- Combat ---
export const LIMB_MULT = 0.75;
export const AIM_MOVE_MULT = 0.6; // walk speed while aiming down sights
export const SWAP_SECONDS = 0.35;
export const FIRE_RATE_SLACK = 0.08; // seconds a shot may arrive early (network jitter)
export const HIT_DIST_SLACK = 3; // metres between a reported hit and where the server has the target
export const KNIFE_RANGE_SLACK = 1;
export const GRENADE_FUSE = 2.5;
export const GRENADE_SPEED = 13;
export const GRENADE_LOFT = 3; // extra upward speed on a throw
export const GRENADE_DAMAGE = 600;
export const GRENADE_RADIUS = 5;
export const GRENADE_COOLDOWN = 0.8;
export const EXPLOSION_MIN_FRAC = 0.25; // damage fraction at the edge of a blast
export const EXPLOSION_PLAYER_MULT = 0.2; // players take this share of a blast
export const PROJECTILE_GRAVITY = 14;
export const DUMMY_HP = 1000;
export const DUMMY_RESET_SECONDS = 3;

// --- Points ---
export const START_POINTS = 500;
export const RESPAWN_MIN_POINTS = 1500;
export const POINTS_HIT = 10;
export const POINTS_KILL = 60;
export const POINTS_HEADSHOT = 100;
export const POINTS_MELEE = 130;
export const POINTS_SPECIAL_KILL = 50; // grenade / wonder weapon
export const POINTS_PLANK = 10;
export const POINTS_REVIVE = 100;
export const DOWN_POINTS_PENALTY = 0.05;
export const POINTS_ROUNDING = 10; // the down penalty is rounded to this
export const PLANK_POINTS_BASE = 50; // per-round cap on plank points: base + per-round x round
export const PLANK_POINTS_PER_ROUND = 50;

// --- Zombies ---
export const ZOMBIE_RADIUS = 0.35;
export const ZOMBIE_DAMAGE = 45;
export const ZOMBIE_ATTACK_RANGE = 1.0;
export const ZOMBIE_ATTACK_HIT_RANGE = 1.3;
export const ZOMBIE_ATTACK_WINDUP = 0.5;
export const ZOMBIE_SPEED_SHAMBLE = 1.0;
export const ZOMBIE_SPEED_WALK = 2.2;
export const ZOMBIE_SPEED_RUN = 4.8;
export const MAX_ALIVE_SOLO = 24;
export const MAX_ALIVE_PER_EXTRA_PLAYER = 3;
export const MAX_ALIVE_CAP = 32;
export const BARRICADE_PLANKS = 6;
export const PLANK_TEAR_SECONDS = 1.5;
export const PLANK_REBUILD_SECONDS = 1.0;
export const FLOWFIELD_INTERVAL_MS = 250;
export const ZOMBIE_RETARGET_SECONDS = 1;
export const ZOMBIE_BASE_HP = 150; // round 1; data/rounds.ts scales it
export const ZOMBIE_ATTACK_COOLDOWN = 0.7; // recovery after a swing before moving again
export const ZOMBIE_SEPARATION = 0.75; // zombies closer than this push apart
export const ZOMBIE_QUEUE_GAP = 0.8; // spacing while queueing outside a window
export const ZOMBIE_VAULT_SECONDS = 1.1;
export const ZOMBIE_SPAWN_INTERVAL = 2; // round 1; data/rounds.ts shrinks it
export const ZOMBIE_TURN_RATE = 7; // rad/s
export const ZOMBIE_DIRECT_CHASE_RANGE = 3; // within this and in sight, run straight at the target
export const WINDOW_STANDOFF = 0.7; // from a window's centre to where a zombie tears / lands
export const CRAWLER_SPEED = 0.8;
export const CRAWLER_DAMAGE = 25;
export const CRAWLER_MIN_BLAST_FRAC = 0.3; // a blast this share of max HP that fails to kill takes the legs

// --- Rounds ---
export const INTERMISSION_SECONDS = 20; // long enough to cross the site (it was 10 on the flat station)
export const FIRST_ROUND_DELAY = 5; // from the start of a game to round 1
export const SPAWN_INTERVAL_MIN = 0.25; // ZOMBIE_SPAWN_INTERVAL shrinks towards this
export const SPAWN_INTERVAL_DECAY = 0.88; // per round
export const STRAGGLER_COUNT = 3; // this few left, with none to come, for STRAGGLER_SECONDS: they run
export const STRAGGLER_SECONDS = 20;
export const ROUND_GRENADE_REFILL = 1;

// --- Economy ---
export const CACHE_COST = 950;
export const CACHE_CLEARANCE_COST = 10;
export const FORGE_COST = 4000; // it stands two flights down a dead end (5000 when it was next door)
export const FORGE_SECONDS = 3; // the Forge at work
export const FORGE_COLLECT_SECONDS = 15; // then the weapon waits this long for its owner
export const UPGRADED_AMMO_COST = 2500;
export const POWERUP_DROP_CHANCE = 0.02;
export const POWERUP_MAX_PER_ROUND = 4;
export const POWERUP_LIFETIME = 30;
export const POWERUP_DURATION = 30;
export const POWERUP_BLINK_SECONDS = 8; // a drop blinks for this long before it goes
export const POWERUP_PICKUP_RANGE = 1.1;
export const FIRESTORM_POINTS = 400;
export const REBUILD_POINTS = 200;

// --- The Cache
export const CACHE_ROLL_SECONDS = 4;
export const CACHE_OFFER_SECONDS = 10;
export const CACHE_JINX_SECONDS = 3; // the skull hangs there
export const CACHE_MOVE_SECONDS = 2.5; // then the Cache leaves for another site
export const CACHE_JINX_MIN_USES = 4; // the Jinx comes on a use picked between these
export const CACHE_JINX_MAX_USES = 8;

// --- Howlers
export const HOWLER_SPEED = 5.6;
export const HOWLER_DAMAGE = 30;
export const HOWLER_HP_FRAC = 0.35; // of a zombie's health that round
export const HOWLER_TELL_SECONDS = 1.2; // lightning strikes, then the howler is there
export const HOWLER_SPAWN_INTERVAL = 0.7;
export const HOWLER_MIN_DIST = 6; // metres of walking from the player it arrives near
export const HOWLER_MAX_DIST = 22;
export const HOWLER_ROUND_MIN_GAP = 5; // a howler round comes every 5 to 7 rounds
export const HOWLER_ROUND_MAX_GAP = 7;

// --- The Siren decoy
export const MAX_TACTICALS = 3;
export const SIREN_SECONDS = 6;
export const SIREN_DAMAGE = 1500;
export const SIREN_RADIUS = 5;
export const SIREN_LURE_RANGE = 30; // metres of walking: zombies nearer than this come to it
export const SIREN_STANDOFF = 1.2; // they crowd round it this close
