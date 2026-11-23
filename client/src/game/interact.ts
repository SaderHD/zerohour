import {
  DIR_VEC, FORGE_COST, cacheItemName, INTERACT_RANGE, MAX_PERKS, ammoCost, openingDistance, perkCost, perkDef, perkNeedsPower, reviveSecondsWith,
  weaponDef, weaponStats,
  type CacheState, type ClientMsg, type CompiledMap, type ForgeState, type Interactable, type Opening, type PerkId, type WeaponId,
} from '@zh/shared';
import type { Input } from '../input/input';
import type { Barricades } from './barricades';
import type { RemotePlayers } from './remotePlayers';

/** Seconds between repeats of a held interaction, so the server picks it back up after it stopped. */
const RESEND = 0.5;

/** What the prompts need to know about us and the world; read fresh every frame. */
export interface BuyerState {
  id: number;
  points: number;
  perks: readonly PerkId[];
  weapons: readonly { id: WeaponId; upgraded: boolean; reserve: number }[];
  slot: number;
  power: boolean;
  /** Alone in the room (Second Wind's own rules). */
  solo: boolean;
  forge: ForgeState;
  /** The Cache at a site: whether one stands there, what it is doing, what a roll costs. */
  cache(site: string): { present: boolean; state: CacheState | null; cost: number };
}

const REFUSALS: Record<string, string> = {
  points: 'Not enough points', power: 'Needs power', limit: 'You cannot hold another', busy: 'In use',
  full: 'Ammo is full', owned: 'You already have it', upgraded: 'Already upgraded',
};

/**
 * F interactions (PLAN 6.5): reviving a downed teammate and rebuilding the barricade you are
 * standing at (both held); and, with one press, the door in front of you or the nearest thing on
 * the map's list - a wall buy, a tonic dispenser, the master switch, the Forge, the Cache.
 */
export class Interact {
  /** Text for the HUD prompt, or '' when there is nothing in reach. */
  prompt = '';
  /** 0..1 through a held revive (a local estimate; the server decides), else 0. */
  progress = 0;
  /** The name of the key bound to "use", for the prompts. */
  useKey = 'F';
  /** What F is held on: a window id, or `p:<player id>` for a revive. */
  private holding: string | null = null;
  private resend = 0;
  private held = 0;
  /** Why the server refused the last purchase, shown for a moment. */
  private refusal = '';
  private refusalFor = 0;

  constructor(
    private readonly barricades: Barricades, private readonly remotes: RemotePlayers, private readonly map: CompiledMap,
    private readonly soldDoors: ReadonlySet<string>, private readonly buyer: () => BuyerState, private readonly send: (msg: ClientMsg) => void,
  ) {}

  /** The shut door in reach that the player is facing, if any. */
  private door(x: number, z: number, yaw: number): Opening | null {
    let best: Opening | null = null;
    let bestD = INTERACT_RANGE;
    for (const o of this.map.def.openings) {
      if (o.kind !== 'door' || this.soldDoors.has(o.id)) continue;
      const d = openingDistance(o, x, z);
      const dx = o.x + o.w / 2 - x;
      const dz = o.z + o.d / 2 - z;
      const facing = (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / (Math.hypot(dx, dz) || 1);
      if (d < bestD && facing > 0.3) {
        best = o;
        bestD = d;
      }
    }
    return best;
  }

  /** The nearest interactable in reach that the player is in front of and looking towards. */
  private thing(x: number, z: number, yaw: number): Interactable | null {
    let best: Interactable | null = null;
    let bestD = INTERACT_RANGE;
    for (const it of this.map.def.interactables) {
      const dx = it.x - x;
      const dz = it.z - z;
      const d = Math.hypot(dx, dz);
      const v = DIR_VEC[it.facing];
      if (d >= bestD || -dx * v.x - dz * v.z < 0) continue;
      if (it.kind === 'cacheSite' && !this.buyer().cache(it.id).present) continue;
      if ((-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / (d || 1) < 0.3) continue;
      best = it;
      bestD = d;
    }
    return best;
  }

  /** What F would do at this interactable: the prompt, and whether pressing is worth sending. */
  private offer(it: Interactable): { text: string; go: boolean } {
    const b = this.buyer();
    const no = (text = ''): { text: string; go: boolean } => ({ text, go: false });
    const yes = (text: string): { text: string; go: boolean } => ({ text: `Press ${this.useKey} — ${text}`, go: true });
    switch (it.kind) {
      case 'wallbuy': {
        const def = weaponDef(it.ref ?? '');
        if (!def) return no();
        const held = b.weapons.find((w) => w.id === def.id);
        if (!held) return yes(`${def.name} [${def.cost ?? 0}]`);
        const stats = weaponStats(held.id, held.upgraded)!;
        return held.reserve >= stats.reserve ? no(`${stats.name} — ammo is full`) : yes(`${stats.name} ammo [${ammoCost(def, held.upgraded)}]`);
      }
      case 'tonic': {
        const def = perkDef(it.ref ?? '');
        if (!def || b.perks.includes(def.id)) return no();
        if (perkNeedsPower(def, b.solo) && !b.power) return no(`${def.name} — needs power`);
        if (b.perks.length >= MAX_PERKS) return no('You cannot hold another tonic');
        return yes(`${def.name}: ${def.blurb} [${perkCost(def, b.solo)}]`);
      }
      case 'powerSwitch':
        return b.power ? no() : yes('turn on the power');
      case 'forge': {
        const f = b.forge;
        if (!b.power) return no('The Forge needs power');
        if (f.phase === 'offering' && f.by === b.id) return yes(`take the ${weaponStats(f.weapon ?? '', true)?.name ?? 'weapon'}`);
        if (f.phase !== 'idle') return no(f.by === b.id ? 'The Forge is at work' : 'The Forge is in use');
        const held = b.weapons[b.slot];
        const def = held && weaponDef(held.id);
        if (!held || !def) return no();
        return held.upgraded ? no('This weapon is already upgraded') : yes(`forge the ${def.name} [${FORGE_COST}]`);
      }
      case 'cacheSite': {
        const c = b.cache(it.id);
        const s = c.state;
        if (!c.present || !s) return no();
        if (s.phase === 'offering') return s.by === b.id ? yes(`take the ${cacheItemName(s.weapon ?? '')}`) : no('The Cache is in use');
        if (s.phase === 'rolling') return no(s.by === b.id ? '' : 'The Cache is in use');
        return s.phase === 'idle' ? yes(`open the Cache [${c.cost}]`) : no();
      }
      default:
        return no();
    }
  }

  /** The server turned a purchase down. */
  deny(reason: string): void {
    this.refusal = REFUSALS[reason] ?? '';
    this.refusalFor = 1.5;
  }

  private msg(key: string, hold: boolean): ClientMsg {
    return key.startsWith('p:') ? { t: 'revive', target: Number(key.slice(2)), hold } : { t: 'interact', id: key, hold };
  }

  update(dt: number, input: Input, x: number, z: number, yaw: number, active: boolean): void {
    const mate = active ? this.remotes.revivable(x, z) : null;
    const win = active && !mate ? this.barricades.rebuildable(x, z) : null;
    const door = active && !mate && !win ? this.door(x, z, yaw) : null;
    const thing = active && !mate && !win && !door ? this.thing(x, z, yaw) : null;
    this.refusalFor -= dt;
    const refused = this.refusalFor > 0 ? this.refusal : '';
    this.prompt = mate ? `Hold ${this.useKey} — revive ${mate.name}` : win ? `Hold ${this.useKey} — rebuild barricade` : '';
    if (door) {
      const what = door.style === 'debris' ? 'clear debris' : 'open door';
      this.prompt = refused || (door.needsPower ? 'This door needs power' : `Press ${this.useKey} — ${what} [${door.cost ?? 0}]`);
      if (!door.needsPower && input.pressed('KeyF')) this.send({ t: 'interact', id: door.id, hold: true });
    } else if (thing) {
      const offer = this.offer(thing);
      this.prompt = refused || offer.text;
      if (offer.go && input.pressed('KeyF')) this.send({ t: 'interact', id: thing.id, hold: true });
    }
    const want = !input.down('KeyF') ? null : mate ? `p:${mate.id}` : win ? win.id : null;
    if (want !== this.holding) {
      if (this.holding) this.send(this.msg(this.holding, false));
      this.holding = want;
      this.resend = 0;
      this.held = 0;
    }
    if (want) {
      this.held += dt;
      if ((this.resend -= dt) <= 0) {
        this.resend = RESEND;
        this.send(this.msg(want, true));
      }
    }
    this.progress = want && mate ? Math.min(1, this.held / reviveSecondsWith(this.buyer().perks)) : 0;
  }
}
