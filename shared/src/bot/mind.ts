// What a computer-run player wants to do next, with no networking and no rendering: the server's
// bots (server/src/bot.ts), the fake-clock campaign and the browser autopilot all ask this.
// It plays the whole loop - shoot, back away, reload, buy guns and ammunition, open doors, throw
// the master switch, drink tonics, use the Forge, pick up drops, get teammates up.
import { CACHE_COST, FORGE_COST, INTERACT_RANGE, MAX_PERKS, PLAYER_RADIUS } from '../constants';
import { perkCost, perkDef, perkNeedsPower, weaponSlotsWith } from '../data/perks';
import { ammoCost, weaponDef, weaponStats } from '../data/weapons';
import { DIR_VEC, type CompiledMap } from '../map/compile';
import type { Interactable, Opening } from '../map/types';
import { openingDistance } from '../map/windows';
import type { Rng } from '../math/rng';
import { circleFits, moveCircle } from '../nav/collide';
import { FlowField, UNREACHABLE } from '../nav/flowfield';
import { lineOfSight } from '../nav/los';
import type { CacheState, ForgeState, WeaponState } from '../protocol';

export interface BotTarget {
  id: number;
  x: number;
  z: number;
}

/** The world as one player knows it. */
export interface BotView {
  time: number;
  id: number;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  life: 'alive' | 'downed' | 'dead';
  points: number;
  weapons: readonly WeaponState[];
  slot: number;
  perks: readonly string[];
  reloading: boolean;
  zombies: Iterable<BotTarget>;
  /** The other players still in the game (not dead). */
  mates: Iterable<{ id: number; x: number; z: number; downed: boolean }>;
  drops: Iterable<{ x: number; z: number }>;
  open: ReadonlySet<string>;
  power: boolean;
  solo: boolean;
  forge: ForgeState;
  /** Where the Cache stands, and what is going on at its sites. */
  cache: { home: string; boxes: Iterable<CacheState> };
}

export interface BotIntent {
  /** Unit direction to walk in (0, 0 to stand). */
  moveX: number;
  moveZ: number;
  sprint: boolean;
  /** The zombie to shoot. */
  aim: (BotTarget & { dist: number }) | null;
  /** A point to face when not aiming at a zombie (the thing being bought), else null: face the way we walk. */
  look: { x: number; z: number } | null;
  fire: boolean;
  /** Knife this zombie (0 = no). */
  melee: number;
  reload: boolean;
  /** Slot to change to, or -1. */
  swap: number;
  /** Door or interactable to press F at. */
  use: string | null;
  /** Downed teammate to hold F on (0 = none). */
  revive: number;
  /** Backing away from something close (rather than walking somewhere). */
  fleeing: boolean;
  /** For logs. */
  goal: string;
}

interface Goal {
  key: string;
  x: number;
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

interface Want {
  key: string;
  it: Interactable;
  cost: number;
  hold?: number;
}

const SIGHT = 20;
const NEAR = 9;
/** Back away from anything this close; further out when we cannot shoot or are hurt. */
const FLEE_RANGE = 4.5;
const PANIC_RANGE = 6.5;
const RESCUE_RANGE = 1.8;
const BODY_WIDTH = 0.75;
const QUIET = 12;
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
/** How much a bot likes each gun. The Thumper is at the bottom: it would blow itself up. */
const RANK: Readonly<Record<string, number>> = {
  thumper: -0.5, warden: 0, pike: 1, farrow: 2, stitch: 3, coachman: 3, dockhand: 3, brakeman: 4, longwatch: 4, kestrel: 5, ferrier: 6, halberd: 7, gravewell: 9, arclight: 10,
};
const CACHE_GUN = 6;
/** Points to have in hand before gambling on the Cache: the roll, and something left for ammunition. */
const CACHE_SPARE = 3000;
const base = (id: string): number => RANK[id] ?? 0;
/** An empty gun is worth nothing, whatever it is. */
const rank = (w: WeaponState): number => (w.mag + w.reserve <= 0 ? -1 : base(w.id) + (w.upgraded ? 10 : 0));
const TONICS = ['ironhide', 'second_wind', 'hair_trigger', 'quickhands'];
const step = { x: 0, z: 0 };

export class BotMind {
  private readonly out: BotIntent = { moveX: 0, moveZ: 0, sprint: false, aim: null, look: null, fire: false, melee: 0, reload: false, swap: -1, use: null, revive: 0, fleeing: false, goal: '' };
  private readonly route: FlowField;
  private readonly things = new Map<string, Interactable>();
  private readonly spots = new Map<string, { x: number; z: number }>();
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
  private spot(it: Interactable): { x: number; z: number } {
    let s = this.spots.get(it.id);
    if (s) return s;
    const v = DIR_VEC[it.facing];
    s = { x: it.x + v.x, z: it.z + v.z };
    for (const [f, side] of [[0.75, 0], [1.25, 0], [0.75, 0.5], [0.75, -0.5], [1.25, 0.5], [1.25, -0.5], [0.4, 0]] as const) {
      const x = it.x + v.x * f - v.z * side;
      const z = it.z + v.z * f + v.x * side;
      if (circleFits(this.map, 'all', x, z, PLAYER_RADIUS) && this.map.zoneAt(x, z)) {
        s = { x, z };
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

  private wants(v: BotView): Want[] {
    const list: Want[] = [];
    const thing = (id: string): Interactable | undefined => this.things.get(id);
    const slots = weaponSlotsWith(v.perks);
    let worst = 0;
    v.weapons.forEach((w, i) => (worst = rank(w) < rank(v.weapons[worst]!) ? i : worst));
    // Ammunition for what we carry.
    for (const w of v.weapons) {
      const def = weaponDef(w.id);
      const it = thing(`wb_${w.id}`);
      const stats = weaponStats(w.id, w.upgraded);
      if (def && stats && it && def.cost !== undefined && w.reserve < stats.reserve * 0.3) list.push({ key: `ammo:${w.id}`, it, cost: ammoCost(def, w.upgraded) });
    }
    // The next gun worth having.
    let later: Want | null = null;
    for (const id of this.guns) {
      const it = thing(`wb_${id}`);
      const def = weaponDef(id);
      if (!it || !def || v.weapons.some((w) => w.id === id) || v.forge.weapon === id) continue;
      const full = v.weapons.length >= slots;
      if (full && (RANK[id] ?? 0) <= rank(v.weapons[worst]!)) continue;
      later = { key: `gun:${id}`, it, cost: def.cost ?? 0, hold: full ? worst : undefined };
      break;
    }
    // With something automatic in hand, the lights and a thicker skin come before a better gun.
    const armed = v.weapons.some((w) => base(w.id) >= 3);
    if (later && !armed) {
      list.push(later);
      later = null;
    }
    const power = thing('power');
    if (!v.power && power) list.push({ key: 'power', it: power, cost: 0 });
    if (v.perks.length < MAX_PERKS) {
      for (const id of TONICS) {
        const def = perkDef(id);
        const it = thing(`tonic_${id}`);
        if (!def || !it || v.perks.includes(id) || (perkNeedsPower(def, v.solo) && !v.power)) continue;
        if (id === 'second_wind' && v.solo && v.perks.length === 0) list.unshift({ key: `tonic:${id}`, it, cost: perkCost(def, true) });
        else list.push({ key: `tonic:${id}`, it, cost: perkCost(def, v.solo) });
      }
    }
    if (later) {
      const after = Math.max(list.findIndex((w) => w.key === 'tonic:ironhide'), list.findIndex((w) => w.key === 'power'));
      list.splice(after < 0 ? list.length : after + 1, 0, later);
    }
    // A roll of the Cache, once the wall guns are behind us (or one of ours has run dry for good).
    const site = thing(v.cache.home);
    let busy = false;
    for (const b of v.cache.boxes) busy ||= b.site === v.cache.home;
    const low = v.weapons[worst]!;
    if (site && !busy && v.weapons.length >= slots && v.points >= CACHE_COST + CACHE_SPARE && (rank(low) < 0 || base(low.id) < CACHE_GUN)) {
      list.push({ key: 'cache', it: site, cost: CACHE_COST });
    }
    const forge = thing('forge');
    // The Forge is down a dead end: a trip for a quiet moment, not for the middle of a horde.
    const about = this.all.length;
    if (v.power && forge && v.forge.phase === 'idle' && about <= QUIET) {
      let pick = -1;
      v.weapons.forEach((w, i) => {
        if (!w.upgraded && w.id !== 'warden' && (pick < 0 || rank(w) > rank(v.weapons[pick]!))) pick = i;
      });
      // After the first tonic, so a team does not queue at the Forge with nothing else.
      if (pick >= 0) list.splice(Math.min(list.length, v.perks.length ? 0 : list.length), 0, { key: 'forge', it: forge, cost: FORGE_COST, hold: pick });
    }
    return list;
  }

  private pickGoal(v: BotView): Goal | null {
    const zone = this.map.zoneAt(v.x, v.z);
    // A teammate is down: nothing matters more.
    let mate: { id: number; x: number; z: number } | null = null;
    let mateD = Infinity;
    let cx = 0;
    let cz = 0;
    let up = 0;
    for (const m of v.mates) {
      const d = Math.hypot(m.x - v.x, m.z - v.z);
      if (m.downed && d < mateD) {
        // Leave them while a crowd stands over them: it soon turns on someone else, and three down help nobody.
        let over = 0;
        for (const zb of this.all) if (Math.hypot(zb.x - m.x, zb.z - m.z) < RESCUE_CLEAR) over++;
        if (over < 2 || d < 3) {
          mate = m;
          mateD = d;
        }
      }
      if (!m.downed) {
        cx += m.x;
        cz += m.z;
        up++;
      }
    }
    if (mate) return { key: `revive:${mate.id}`, x: mate.x, z: mate.z, reach: 1.1, revive: mate.id, doors: [] };
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
      if (this.map.zoneAt(d.x, d.z) === zone) return { key, x: d.x, z: d.z, reach: 0.3, doors: [] };
    }
    if (zone) {
      for (const w of this.wants(v)) {
        if ((this.blocked.get(w.key) ?? 0) > v.time) continue;
        const s = this.spot(w.it);
        // Not into a room full of them: it will still be there when they have come to us.
        let hot = 0;
        for (const zb of this.all) if (Math.hypot(zb.x - s.x, zb.z - s.z) < HOT_RANGE) hot++;
        if (hot >= HOT && Math.hypot(s.x - v.x, s.z - v.z) > HOT_RANGE) continue;
        const way = this.doorsTo(zone, this.map.zoneAt(s.x, s.z) ?? '', v);
        if (!way) continue;
        if (way.cost + w.cost > v.points) {
          // The lights and a thicker skin are worth saving for: nothing lesser is bought meanwhile.
          if (SAVE_FOR.has(w.key)) break;
          continue;
        }
        return { key: w.key, x: s.x, z: s.z, reach: 0.6, it: w.it, doors: way.doors, hold: w.hold };
      }
    }
    if (this.roam && zone) {
      if (this.goal?.key.startsWith('roam')) return this.goal;
      const room = this.rng.pick(this.map.def.rooms);
      const x = room.x + this.rng.range(0, room.w);
      const z = room.z + this.rng.range(0, room.d);
      const way = this.doorsTo(zone, room.zone, v);
      if (way?.cost === 0 && circleFits(this.map, 'all', x, z, PLAYER_RADIUS)) return { key: `roam:${++this.roams}`, x, z, reach: 1.5, doors: [] };
      return null;
    }
    // Nothing to do: keep near the others.
    if (up > 0 && Math.hypot(cx / up - v.x, cz / up - v.z) > 8) {
      const x = cx / up;
      const z = cz / up;
      return { key: `regroup:${Math.round(x / 4)}:${Math.round(z / 4)}`, x, z, reach: 4, doors: [] };
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
      const p = moveCircle(this.map, v.open, v.x, v.z, dx * 1.5, dz * 1.5, PLAYER_RADIUS);
      const went = Math.hypot(p.x - v.x, p.z - v.z);
      if (went < 0.8) continue;
      const q = moveCircle(this.map, v.open, p.x, p.z, dx * 3, dz * 3, PLAYER_RADIUS);
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
    let crowd = 0;
    // `v.zombies` may be a one-shot iterator: keep the list for everything that asks later.
    this.all.length = 0;
    for (const zb of v.zombies) {
      this.all.push(zb);
      const d = Math.hypot(zb.x - v.x, zb.z - v.z);
      if (d > SIGHT || !lineOfSight(this.map, v.x, v.z, zb.x, zb.z, v.open)) continue;
      if (d < NEAR) this.near.push(zb);
      if (d < CROWD_RANGE) crowd++;
      if (d < nearD) {
        nearD = d;
        o.aim = { id: zb.id, x: zb.x, z: zb.z, dist: d };
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
    if (o.aim && stats && nearD > stats.range) o.aim = null;
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
        if (!this.route.compute(through, g.x, g.z) || this.route.costAt(v.x, v.z) >= UNREACHABLE) {
          this.blocked.set(g.key, v.time + 10);
          this.goal = null;
          this.replanAt = 0;
          return o;
        }
      }
      const d = Math.hypot(g.x - v.x, g.z - v.z);
      arrived = d <= g.reach;
      if (arrived && g.key.startsWith('roam')) this.goal = null;
      if (!arrived) {
        if (this.route.dir(v.x, v.z, step)) {
          towardX = step.x;
          towardZ = step.z;
        } else if (d > 0.05) {
          towardX = (g.x - v.x) / d;
          towardZ = (g.z - v.z) / d;
        }
      }
      // A door of ours in the way, the thing itself, or the teammate on the floor.
      for (const door of g.doors) {
        if (!v.open.has(door.id) && openingDistance(door, v.x, v.z) < 1.2) {
          o.use = door.id;
          o.look = { x: door.x + door.w / 2, z: door.z + door.d / 2 };
        }
      }
      if (!o.use && g.it && Math.hypot(g.it.x - v.x, g.it.z - v.z) < INTERACT_RANGE - 0.2 && (arrived || d < 0.9)) {
        const ready = g.hold === undefined || g.hold === v.slot || g.hold >= v.weapons.length;
        let waiting = g.key === 'forge-take' && v.forge.phase !== 'offering';
        if (g.key === 'cache-take') for (const b of v.cache.boxes) waiting ||= b.site === g.it.id && b.phase !== 'offering';
        if (ready && !waiting) o.use = g.it.id;
        o.look = { x: g.it.x, z: g.it.z };
      }
      if (g.revive) {
        // Not into a crowd standing over them: hang back and thin it out first.
        let over = 0;
        for (const zb of this.all) if (Math.hypot(zb.x - g.x, zb.z - g.z) < 4) over++;
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
      o.sprint = !o.aim && this.route.costAt(v.x, v.z) > 160;
    }
    if (o.use) o.fire = false; // we are looking at what we are buying
    else if (o.aim) o.look = null;
    return o;
  }
}
