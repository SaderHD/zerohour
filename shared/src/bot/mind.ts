// What a computer-run player wants to do next, with no networking and no rendering: the server's
// bots (server/src/bot.ts), the fake-clock campaign and the browser autopilot all ask this.
// It plays the whole loop - shoot, back away, reload, buy guns and ammunition, open doors, throw
// the master switch, drink tonics, use the Forge, pick up drops, get teammates up.
import { FLOOR_GAP, INTERACT_RANGE, PLAYER_RADIUS } from '../constants';
import { weaponSlotsWith } from '../data/perks';
import { weaponStats } from '../data/weapons';
import { DIR_VEC, type CompiledMap } from '../map/compile';
import type { Interactable, Opening } from '../map/types';
import { openingDistance } from '../map/windows';
import type { Rng } from '../math/rng';
import { circleFits, moveCircle } from '../nav/collide';
import { FlowField, UNREACHABLE } from '../nav/flowfield';
import { lineOfSight, lineWalkable } from '../nav/los';
import { base, listWants, rank, type BotIntent, type BotTarget, type BotView } from './wants';

export type { BotIntent, BotTarget, BotView } from './wants';

interface Goal {
  key: string;
  x: number;
  /** Height of the floor there. */
  y: number;
  z: number;
  /** Stop this close to (x, z). */
  reach: number;
  it?: Interactable;
  revive?: number;
  /** Shut doors on the way, bought as we come to them. */
  doors: Opening[];
  /** Slot to have in hand when pressing F (the gun to give up, or to forge). */
  hold?: number;
}

const SIGHT = 20;
const NEAR = 9;
/** Back away from anything this close; further out when we cannot shoot or are hurt. */
const FLEE_RANGE = 4.5;
const PANIC_RANGE = 6.5;
const RESCUE_RANGE = 1.8;
const BODY_WIDTH = 0.75;
const HOT = 5;
const HOT_RANGE = 8;
const SAVE_FOR: ReadonlySet<string> = new Set(['power', 'tonic:ironhide']);
const RESCUE_CLEAR = 5;
/** This many within this range and we move before they close the ring. */
const CROWD = 4;
const CROWD_RANGE = 6;
const KNIFE_REACH = 1.5;
const REPLAN_SECONDS = 0.5;
const FLEE_DIRS = 12;
const step = { x: 0, z: 0 };
/** On the same floor: near enough in height to touch, block or be reached. */
const level = (a: { y: number }, b: { y: number }): boolean => Math.abs(a.y - b.y) < FLOOR_GAP;
/** Distance over the floor; nothing a storey away is near. */
const gap = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number =>
  level(a, b) ? Math.hypot(a.x - b.x, a.z - b.z) : Infinity;

export class BotMind {
  private readonly out: BotIntent = { moveX: 0, moveZ: 0, sprint: false, aim: null, look: null, fire: false, melee: 0, reload: false, swap: -1, use: null, revive: 0, fleeing: false, goal: '' };
  private readonly route: FlowField;
  private readonly things = new Map<string, Interactable>();
  private readonly spots = new Map<string, { x: number; y: number; z: number }>();
  private readonly guns: string[];
  private readonly near: BotTarget[] = [];
  private readonly all: BotTarget[] = [];
  private goal: Goal | null = null;
  private routed = false;
  private replanAt = 0;
  /** Wants given up on for a while (key -> until). */
  private readonly blocked = new Map<string, number>();
  private usingSince = 0;
  private usingKey = '';
  private fleeX = 0;
  private fleeZ = 0;
  private fleeAt = 0;

  /** With nothing to do, wander the station instead of standing by the others (soak tests). */
  roam = false;
  private roams = 0;

  /** `index` spreads a team's tastes: who takes the rifle and who the shotgun. */
  constructor(private readonly map: CompiledMap, private readonly rng: Rng, index = 0) {
    this.route = new FlowField(map);
    for (const it of map.def.interactables) this.things.set(it.id, it);
    this.guns = [index % 2 === 0 ? 'farrow' : 'pike', 'stitch', 'kestrel', 'brakeman'];
  }

  /** Forget the route (we were put somewhere else). */
  reset(): void {
    this.goal = null;
    this.replanAt = 0;
  }

  // ------------------------------------------------------------ goals

  /** Somewhere to stand in front of an interactable. */
  private spot(it: Interactable): { x: number; y: number; z: number } {
    let s = this.spots.get(it.id);
    if (s) return s;
    const v = DIR_VEC[it.facing];
    const y = this.map.mountHeight(it);
    s = { x: it.x + v.x, y, z: it.z + v.z };
    for (const [f, side] of [[0.75, 0], [1.25, 0], [0.75, 0.5], [0.75, -0.5], [1.25, 0.5], [1.25, -0.5], [0.4, 0]] as const) {
      const x = it.x + v.x * f - v.z * side;
      const z = it.z + v.z * f + v.x * side;
      if (circleFits(this.map, 'all', x, y, z, PLAYER_RADIUS) && this.map.zoneAt(x, y, z)) {
        s = { x, y, z };
        break;
      }
    }
    this.spots.set(it.id, s);
    return s;
  }

  /** Cheapest set of shut doors between two zones (the zone graph is tiny: plain relaxation). */
  private doorsTo(from: string, to: string, v: BotView): { cost: number; doors: Opening[] } | null {
    const best = new Map<string, { cost: number; doors: Opening[] }>([[from, { cost: 0, doors: [] }]]);
    for (let pass = 0; pass < this.map.zones.length; pass++) {
      let changed = false;
      for (const [zone, at] of [...best]) {
        for (const edge of this.map.adjacency.get(zone) ?? []) {
          const o = this.map.openingById(edge.via);
          if (!o) continue;
          const shut = o.kind === 'door' && !v.open.has(o.id);
          if (shut && o.needsPower) continue;
          const cost = at.cost + (shut ? o.cost ?? 0 : 0);
          if (cost < (best.get(edge.zone)?.cost ?? Infinity)) {
            best.set(edge.zone, { cost, doors: shut ? [...at.doors, o] : at.doors });
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
    return best.get(to) ?? null;
  }


  private pickGoal(v: BotView): Goal | null {
    const zone = this.map.zoneAt(v.x, v.y, v.z);
    // A teammate is down: nothing matters more.
    let mate: { id: number; x: number; y: number; z: number } | null = null;
    let mateD = Infinity;
    let cx = 0;
    let cz = 0;
    let up = 0;
    const standing: { x: number; y: number; z: number }[] = [];
    for (const m of v.mates) {
      const d = Math.hypot(m.x - v.x, m.z - v.z);
      if (m.downed && d < mateD) {
        // Leave them while a crowd stands over them: it soon turns on someone else, and three down help nobody.
        let over = 0;
        for (const zb of this.all) if (gap(zb, m) < RESCUE_CLEAR) over++;
        if (over < 2 || d < 3) {
          mate = m;
          mateD = d;
        }
      }
      if (!m.downed) {
        cx += m.x;
        cz += m.z;
        up++;
        standing.push(m);
      }
    }
    if (mate) return { key: `revive:${mate.id}`, x: mate.x, y: mate.y, z: mate.z, reach: 1.1, revive: mate.id, doors: [] };
    const forge = this.things.get('forge');
    if (forge && v.forge.by === v.id && v.forge.phase !== 'idle') return { key: 'forge-take', ...this.spot(forge), reach: 0.6, it: forge, doors: [] };
    // Our roll of the Cache: wait for it, and take it if it beats what we would give up.
    for (const b of v.cache.boxes) {
      const site = this.things.get(b.site);
      if (!site || b.by !== v.id || (b.phase !== 'rolling' && b.phase !== 'offering')) continue;
      let worst = 0;
      v.weapons.forEach((w, i) => (worst = rank(w) < rank(v.weapons[worst]!) ? i : worst));
      const full = v.weapons.length >= weaponSlotsWith(v.perks);
      const low = v.weapons[worst];
      if (b.weapon && b.weapon !== 'siren' && full && low && rank(low) >= 0 && base(b.weapon) <= base(low.id)) continue;
      return { key: 'cache-take', ...this.spot(site), reach: 0.6, it: site, doors: [], hold: full && b.weapon !== 'siren' ? worst : undefined };
    }
    for (const d of v.drops) {
      const key = `drop:${d.x}:${d.z}`;
      if ((this.blocked.get(key) ?? 0) > v.time || Math.hypot(d.x - v.x, d.z - v.z) > 25) continue;
      if (this.map.zoneAt(d.x, d.y, d.z) === zone) return { key, x: d.x, y: d.y, z: d.z, reach: 0.3, doors: [] };
    }
    if (zone) {
      for (const w of listWants(v, this.things, this.guns, this.all.length)) {
        if ((this.blocked.get(w.key) ?? 0) > v.time) continue;
        const s = this.spot(w.it);
        // Not into a room full of them: it will still be there when they have come to us.
        let hot = 0;
        for (const zb of this.all) if (gap(zb, s) < HOT_RANGE) hot++;
        if (hot >= HOT && Math.hypot(s.x - v.x, s.z - v.z) > HOT_RANGE) continue;
        const way = this.doorsTo(zone, this.map.zoneAt(s.x, s.y, s.z) ?? '', v);
        if (!way) continue;
        if (way.cost + w.cost > v.points) {
          // The lights and a thicker skin are worth saving for: nothing lesser is bought meanwhile.
          if (SAVE_FOR.has(w.key)) break;
          continue;
        }
        return { key: w.key, x: s.x, y: s.y, z: s.z, reach: 0.6, it: w.it, doors: way.doors, hold: w.hold };
      }
    }
    if (this.roam && zone) {
      if (this.goal?.key.startsWith('roam')) return this.goal;
      const room = this.rng.pick(this.map.def.rooms);
      const x = room.x + this.rng.range(0, room.w);
      const z = room.z + this.rng.range(0, room.d);
      const y = this.map.floorOn(room.level, x, z);
      const way = this.doorsTo(zone, room.zone, v);
      if (way?.cost === 0 && !Number.isNaN(y) && circleFits(this.map, 'all', x, y, z, PLAYER_RADIUS)) return { key: `roam:${++this.roams}`, x, y, z, reach: 1.5, doors: [] };
      return null;
    }
    // Nothing to do: keep near the others.
    if (up > 0 && Math.hypot(cx / up - v.x, cz / up - v.z) > 8) {
      const x = cx / up;
      const z = cz / up;
      // The floor of whoever stands nearest the middle of them.
      let y = v.y;
      let nearest = Infinity;
      for (const m of standing) {
        const d = Math.hypot(m.x - x, m.z - z);
        if (d < nearest) {
          nearest = d;
          y = m.y;
        }
      }
      return { key: `regroup:${Math.round(x / 4)}:${Math.round(z / 4)}`, x, y, z, reach: 4, doors: [] };
    }
    return null;
  }

  // ------------------------------------------------------------ movement

  /** The way out: the direction that leaves us furthest from the bodies near us, with room to keep going. */
  private flee(v: BotView, towardX: number, towardZ: number): void {
    if (v.time < this.fleeAt) return;
    this.fleeAt = v.time + 0.15;
    let best = -Infinity;
    const start = this.rng.range(0, Math.PI * 2);
    for (let i = 0; i < FLEE_DIRS; i++) {
      const a = start + (i * Math.PI * 2) / FLEE_DIRS;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      const p = moveCircle(this.map, v.open, v.x, v.y, v.z, dx * 1.5, dz * 1.5, PLAYER_RADIUS);
      const went = Math.hypot(p.x - v.x, p.z - v.z);
      if (went < 0.8) continue;
      const q = moveCircle(this.map, v.open, p.x, p.y, p.z, dx * 3, dz * 3, PLAYER_RADIUS);
      let nearest = Infinity;
      let barred = false;
      for (const zb of this.near) {
        nearest = Math.min(nearest, Math.hypot(zb.x - p.x, zb.z - p.z), Math.hypot(zb.x - q.x, zb.z - q.z) + 1);
        // A body on the first stride is a wall: we would only push against it.
        const along = (zb.x - v.x) * dx + (zb.z - v.z) * dz;
        barred ||= along > 0 && along < 1.6 && Math.abs((zb.x - v.x) * dz - (zb.z - v.z) * dx) < BODY_WIDTH;
      }
      if (barred) continue;
      const score = nearest + 0.25 * Math.hypot(q.x - v.x, q.z - v.z) + 0.5 * (dx * this.fleeX + dz * this.fleeZ) + 0.3 * (dx * towardX + dz * towardZ);
      if (score > best) {
        best = score;
        step.x = dx;
        step.z = dz;
      }
    }
    if (best > -Infinity) {
      this.fleeX = step.x;
      this.fleeZ = step.z;
    }
  }

  // ------------------------------------------------------------ the decision

  think(v: BotView): BotIntent {
    const o = this.out;
    o.moveX = o.moveZ = 0;
    o.sprint = o.fire = o.reload = o.fleeing = false;
    o.aim = o.look = o.use = null;
    o.melee = o.revive = 0;
    o.swap = -1;
    o.goal = '';
    if (v.life === 'dead') {
      this.goal = null;
      return o;
    }

    // Who is close, and who to shoot.
    this.near.length = 0;
    let nearD = Infinity;
    /** Range to the target when it is on another floor (`nearD` stays for those on ours). */
    let far = 0;
    let crowd = 0;
    // `v.zombies` may be a one-shot iterator: keep the list for everything that asks later.
    this.all.length = 0;
    for (const zb of v.zombies) {
      this.all.push(zb);
      const d = Math.hypot(zb.x - v.x, zb.z - v.z);
      if (d > SIGHT || !lineOfSight(this.map, v.x, v.y, v.z, zb.x, zb.y, zb.z, v.open)) continue;
      // One on another floor can be shot at, but it is not close: it has the stairs to find first.
      // (On a flight of stairs a body a few steps off is already half a storey up or down: if the
      // straight line to it can be walked, it is here.)
      const here = level(zb, v) || (d < NEAR && lineWalkable(this.map, v.x, v.y, v.z, zb.x, zb.y, zb.z, v.open));
      if (here && d < NEAR) this.near.push(zb);
      if (here && d < CROWD_RANGE) crowd++;
      if (here ? d < nearD : !o.aim) {
        if (here) nearD = d;
        else far = d;
        // (How far the shot goes is measured through the air, as the server measures it.)
        o.aim = { id: zb.id, x: zb.x, y: zb.y, z: zb.z, dist: Math.hypot(d, zb.y - v.y) };
      }
    }

    // The gun in hand.
    const goal = this.goal;
    let bestSlot = v.slot;
    let bestRank = -1;
    v.weapons.forEach((w, i) => {
      if (w.mag + w.reserve > 0 && rank(w) > bestRank) {
        bestRank = rank(w);
        bestSlot = i;
      }
    });
    const atGoal = goal ? Math.hypot(goal.x - v.x, goal.z - v.z) : Infinity;
    const wantSlot = goal?.hold !== undefined && atGoal < 4 && goal.hold < v.weapons.length ? goal.hold : bestSlot;
    if (v.life === 'alive' && wantSlot !== v.slot) o.swap = wantSlot;
    const w = v.weapons[v.slot];
    const stats = w && weaponStats(w.id, w.upgraded);
    const loaded = !!w && w.mag > 0 && !v.reloading;
    if (w && stats && !v.reloading && w.reserve > 0 && (w.mag === 0 || (w.mag < stats.magSize * 0.35 && nearD > NEAR) || (w.mag < stats.magSize * 0.7 && !o.aim))) o.reload = true;
    if (o.aim && stats && (level(o.aim, v) ? nearD : far) > stats.range) o.aim = null;
    o.fire = !!o.aim && loaded && o.swap < 0;
    if (v.life === 'downed') return o;
    if (o.aim && nearD < KNIFE_REACH && !loaded) o.melee = o.aim.id;

    // What we are after.
    if (v.time >= this.replanAt) {
      this.replanAt = v.time + REPLAN_SECONDS;
      const next = this.pickGoal(v);
      if (next?.key !== this.goal?.key) this.routed = false;
      this.goal = next;
    }
    const g = this.goal;
    let towardX = 0;
    let towardZ = 0;
    let arrived = true;
    let swamped = false;
    if (g) {
      o.goal = g.key;
      if (!this.routed) {
        const through = new Set(v.open);
        for (const d of g.doors) through.add(d.id);
        this.routed = true;
        if (!this.route.compute(through, g.x, g.y, g.z) || this.route.costAt(v.x, v.y, v.z) >= UNREACHABLE) {
          this.blocked.set(g.key, v.time + 10);
          this.goal = null;
          this.replanAt = 0;
          return o;
        }
      }
      const d = gap(g, v);
      arrived = d <= g.reach;
      if (arrived && g.key.startsWith('roam')) this.goal = null;
      if (!arrived) {
        if (this.route.dir(v.x, v.y, v.z, step)) {
          towardX = step.x;
          towardZ = step.z;
        } else if (d > 0.05 && d < Infinity) {
          towardX = (g.x - v.x) / d;
          towardZ = (g.z - v.z) / d;
        }
      }
      // A door of ours in the way, the thing itself, or the teammate on the floor.
      for (const door of g.doors) {
        if (!v.open.has(door.id) && openingDistance(door, v.x, v.z) < 1.2 && Math.abs(this.map.openingHeight(door) - v.y) < FLOOR_GAP) {
          o.use = door.id;
          o.look = { x: door.x + door.w / 2, z: door.z + door.d / 2 };
        }
      }
      if (!o.use && g.it && level(g, v) && Math.hypot(g.it.x - v.x, g.it.z - v.z) < INTERACT_RANGE - 0.2 && (arrived || d < 0.9)) {
        const ready = g.hold === undefined || g.hold === v.slot || g.hold >= v.weapons.length;
        let waiting = g.key === 'forge-take' && v.forge.phase !== 'offering';
        if (g.key === 'cache-take') for (const b of v.cache.boxes) waiting ||= b.site === g.it.id && b.phase !== 'offering';
        if (ready && !waiting) o.use = g.it.id;
        o.look = { x: g.it.x, z: g.it.z };
      }
      if (g.revive) {
        // Not into a crowd standing over them: hang back and thin it out first.
        let over = 0;
        for (const zb of this.all) if (gap(zb, g) < 4) over++;
        swamped = over >= 3 && d > 2;
        if (swamped && d < 10) arrived = true;
        else if (d < INTERACT_RANGE - 0.3) o.revive = g.revive;
      }
      // Pressing and nothing happens (someone else is at it, the price changed): leave it for now.
      const key = o.use ? `${g.key}>${o.use}` : '';
      if (key !== this.usingKey) {
        this.usingKey = key;
        this.usingSince = v.time;
      } else if (key && v.time - this.usingSince > 3) {
        this.blocked.set(g.key, v.time + 20);
        this.goal = null;
        this.replanAt = 0;
      }
    }

    // Walk there, unless something is too close for that.
    const helpless = !loaded || v.hp < v.maxHp * 0.45;
    // On the way to someone on the floor we give less ground: shoot and keep coming.
    const range = g?.revive && loaded && !swamped ? RESCUE_RANGE : helpless || crowd >= CROWD ? PANIC_RANGE : FLEE_RANGE;
    const holdFast = o.revive !== 0 && v.hp > 55;
    if (nearD < range && !holdFast) {
      this.flee(v, towardX, towardZ);
      o.fleeing = true;
      o.moveX = this.fleeX;
      o.moveZ = this.fleeZ;
      o.revive = 0;
      if (helpless && nearD > 2.5) {
        // Run for it, eyes front.
        o.sprint = true;
        o.fire = false;
        o.aim = null;
      }
      if (nearD < 2) o.use = null;
    } else if (!arrived && !o.revive) {
      o.moveX = towardX;
      o.moveZ = towardZ;
      o.sprint = !o.aim && this.route.costAt(v.x, v.y, v.z) > 160;
    }
    if (o.use) o.fire = false; // we are looking at what we are buying
    else if (o.aim) o.look = null;
    return o;
  }
}
