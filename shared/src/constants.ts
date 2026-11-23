// Every tunable number in the game lives here or in shared/src/data. See docs/PLAN.md section 4.

export const PROTOCOL_VERSION = 1;

// --- Networking ---
export const TICK_RATE = 30; // server sim Hz
export const TICK_DT = 1 / TICK_RATE;
export const SNAPSHOT_EVERY_TICKS = 2; // 15 Hz
export const CLIENT_MOVE_SEND_HZ = 20;
export const INTERP_DELAY_MS = 120;
export const MAX_PLAYERS = 4;
export const ROOM_CODE_LENGTH = 4;
export const RECONNECT_GRACE_MS = 60_000;
export const MAX_NAME_LENGTH = 16;
export const MAX_CHAT_LENGTH = 120;
export const MAX_MSG_BYTES = 8 * 1024;
export const DEFAULT_PORT = 8080;

// --- World ---
export const CELL_SIZE = 0.5; // metres per nav/collision cell
export const MIN_LANE_WIDTH = 1.5;

// --- Player ---
export const PLAYER_RADIUS = 0.35;
export const PLAYER_EYE_HEIGHT = 1.6;
export const WALK_SPEED = 4.5;
export const SPRINT_SPEED = 6.5;
export const STAMINA_SECONDS = 4;
export const STAMINA_REGEN_DELAY = 2;
export const MOVE_SPEED_SLACK = 1.5; // server tolerance multiplier on reported movement
export const PLAYER_MAX_HP = 100;
export const PLAYER_REGEN_DELAY = 4;
export const BLEEDOUT_SECONDS = 45;
export const REVIVE_SECONDS = 3;
export const MAX_PERKS = 4;
export const SOLO_SELF_REVIVES = 3;
export const WEAPON_SLOTS = 2;
export const START_GRENADES = 2;
export const MAX_GRENADES = 4;
export const KNIFE_DAMAGE = 150;
export const KNIFE_COOLDOWN = 0.6;
export const KNIFE_RANGE = 1.6;
export const INTERACT_RANGE = 1.8;

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

// --- Rounds ---
export const INTERMISSION_SECONDS = 10;

// --- Economy ---
export const CACHE_COST = 950;
export const CACHE_CLEARANCE_COST = 10;
export const FORGE_COST = 5000;
export const UPGRADED_AMMO_COST = 4500;
export const POWERUP_DROP_CHANCE = 0.02;
export const POWERUP_MAX_PER_ROUND = 4;
export const POWERUP_LIFETIME = 30;
export const POWERUP_DURATION = 30;
