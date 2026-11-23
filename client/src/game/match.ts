import { BLEEDOUT_SECONDS, DOOR_OPEN_SECONDS, MoveState, PLAYER_MAX_HP, type CompiledMap, type ForgeState, type PerkId, type PowerupId } from '@zh/shared';
import type { World } from '../render/worldBuilder';
import type { Scoreboard } from '../ui/scoreboard';
import type { Fx } from './fx';

export type Life = 'alive' | 'downed' | 'dead';
export const lifeOf = (state: MoveState): Life => (state === MoveState.Downed ? 'downed' : state === MoveState.Dead ? 'dead' : 'alive');

/** The match as the server reports it: our own life, the round, doors, power and what is running. */
export class Match {
  hp = PLAYER_MAX_HP;
  life: Life = 'alive';
  round = 0;
  roundPhase = 'intermission';
  zombiesLeft = 0;
  over = false;
  /** Seconds of bleed-out left (a local estimate) and who is reviving us (0 = nobody). */
  bleed = 0;
  revivedBy = 0;
  power = false;
  /** Our tonics, and what the Forge is doing. */
  perks: readonly PerkId[] = [];
  forge: ForgeState = { phase: 'idle' };
  /** Doors the server has opened. Also used for local collision. */
  readonly openDoors = new Set<string>();
  /** Doors that are open or on their way: nothing left to buy. */
  readonly soldDoors = new Set<string>();
  /** Timed power-ups that are running: the game time each one ends. */
  readonly effects = new Map<PowerupId, number>();

  constructor(private readonly map: CompiledMap, private readonly world: World, private readonly fx: Fx, private readonly scores: Scoreboard) {}

  setLife(next: Life): void {
    if (next === this.life) return;
    if (next === 'downed') this.bleed = BLEEDOUT_SECONDS;
    this.life = next;
    this.revivedBy = 0;
    document.body.dataset.life = next;
  }

  setOver(on: boolean): void {
    this.over = on;
    if (on) {
      document.body.dataset.over = '1';
      this.scores.results(this.round);
      if (document.pointerLockElement) document.exitPointerLock();
    } else delete document.body.dataset.over;
  }

  setDoors(ids: Iterable<string>): void {
    const want = new Set(ids);
    this.world.setDoors(want);
    this.openDoors.clear();
    this.soldDoors.clear();
    for (const id of want) {
      this.openDoors.add(id);
      this.soldDoors.add(id);
    }
  }

  /** A door was just bought: play it opening; it stops blocking us once it is out of the way. */
  openDoor(id: string): void {
    if (this.soldDoors.has(id)) return;
    this.soldDoors.add(id);
    this.world.openDoor(id);
    const o = this.map.openingById(id);
    if (o) for (let i = 0; i < 3; i++) this.fx.puff(o.x + o.w * Math.random(), o.style === 'debris' ? 0.8 : 0.1, o.z + o.d * Math.random(), 0x8a8478, 6, 1.2, 0.05, 0.7);
    setTimeout(() => {
      if (this.soldDoors.has(id)) this.openDoors.add(id);
    }, DOOR_OPEN_SECONDS * 800);
  }
}
