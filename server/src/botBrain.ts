import {
  FlowField, MoveState, PLAYER_RADIUS, UNREACHABLE, WALK_SPEED, lineOfSight, moveCircle,
  type CompiledMap, type DoorSet, type EntityId, type Rng,
} from '@zh/shared';

export interface BotTarget {
  id: EntityId;
  x: number;
  y: number;
  z: number;
}

const SIGHT = 14;
const ARRIVE_COST = 30;
const dir = { x: 0, z: 0 };

/**
 * What a bot does each step, with no networking: walk to random spots around the map along a
 * flow field and face the nearest zombie it can see. Used by the WebSocket bot and by sim tests.
 */
export class BotBrain {
  x = 0;
  /** Height of the floor underfoot. */
  y = 0;
  z = 0;
  yaw = 0;
  state = MoveState.Idle;
  /** The zombie it would shoot right now, with its distance. */
  aim: (BotTarget & { dist: number }) | null = null;
  private readonly route: FlowField;
  private hasRoute = false;
  private pause = 0;
  private stalled = 0;

  constructor(private readonly map: CompiledMap, private readonly rng: Rng) {
    this.route = new FlowField(map);
  }

  place(x: number, y: number, z: number, yaw = this.yaw): void {
    this.x = x;
    this.y = y;
    this.z = z;
    this.yaw = yaw;
    this.hasRoute = false;
  }

  private pickRoute(open: DoorSet): void {
    const room = this.rng.pick(this.map.def.rooms);
    const gx = room.x + this.rng.range(1, room.w - 1);
    const gz = room.z + this.rng.range(1, room.d - 1);
    const gy = this.map.floorOn(room.level, gx, gz);
    this.hasRoute = !Number.isNaN(gy) && this.route.compute(open, gx, gy, gz) && this.route.costAt(this.x, this.y, this.z) < UNREACHABLE;
    this.stalled = 0;
  }

  step(dt: number, zombies: Iterable<BotTarget>, open: DoorSet): void {
    // Walk.
    this.state = MoveState.Idle;
    let heading = this.yaw;
    if (this.pause > 0) this.pause -= dt;
    else if (!this.hasRoute) this.pickRoute(open); // one try per step; unreachable rooms are just retried
    else if (this.route.costAt(this.x, this.y, this.z) <= ARRIVE_COST || !this.route.dir(this.x, this.y, this.z, dir) || this.stalled > 1) {
      this.hasRoute = false;
      this.pause = this.rng.chance(0.4) ? this.rng.range(0.3, 1.2) : 0;
    } else {
      const p = moveCircle(this.map, open, this.x, this.y, this.z, dir.x * WALK_SPEED * dt, dir.z * WALK_SPEED * dt, PLAYER_RADIUS);
      this.stalled = Math.hypot(p.x - this.x, p.z - this.z) < WALK_SPEED * dt * 0.3 ? this.stalled + dt : 0;
      this.x = p.x;
      this.y = p.y;
      this.z = p.z;
      this.state = MoveState.Walk;
      heading = Math.atan2(-dir.x, -dir.z);
    }
    // Look at the nearest zombie in sight, else where we are going.
    this.aim = null;
    let best = SIGHT;
    for (const zb of zombies) {
      const d = Math.hypot(zb.x - this.x, zb.z - this.z);
      if (d >= best || !lineOfSight(this.map, this.x, this.y, this.z, zb.x, zb.y, zb.z, open)) continue;
      best = d;
      this.aim = { id: zb.id, x: zb.x, y: zb.y, z: zb.z, dist: d };
    }
    this.yaw = this.aim ? Math.atan2(-(this.aim.x - this.x), -(this.aim.z - this.z)) : heading;
  }
}
