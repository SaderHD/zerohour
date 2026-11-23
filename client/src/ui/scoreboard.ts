import { MoveState, type PlayerId, type PlayerPublic } from '@zh/shared';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Text colours by seat, matching the jackets in models/player.ts. */
const COLOURS = ['#a9d06a', '#7fb0f0', '#f08a7a', '#f0c860'];
const POPUPS_MAX = 8;

/**
 * Everyone's scores: the points list on the HUD (with popups for our own), the Tab scoreboard
 * and the table on the game-over screen. Fed from `player` / `points` events and snapshots.
 */
export class Scoreboard {
  readonly players = new Map<PlayerId, PlayerPublic>();
  private readonly life = new Map<PlayerId, MoveState>();
  private readonly pointsEl = el('points');
  private readonly pops = el('points-pop');
  private readonly board = el('scoreboard');
  private dirty = true;
  private shown = false;
  selfId: PlayerId = 0;
  round = 0;

  reset(players: PlayerPublic[]): void {
    this.players.clear();
    this.life.clear();
    this.pops.replaceChildren();
    for (const p of players) this.players.set(p.id, p);
    this.dirty = true;
  }

  upsert(p: PlayerPublic): void {
    this.players.set(p.id, p);
    this.dirty = true;
  }

  remove(id: PlayerId): void {
    this.players.delete(id);
    this.life.delete(id);
    this.dirty = true;
  }

  /** A points change; our own float away from the total as "+60" / "-110". */
  points(id: PlayerId, total: number, delta: number): void {
    const p = this.players.get(id);
    if (!p) return;
    p.points = total;
    this.dirty = true;
    if (id !== this.selfId || delta === 0) return;
    const pop = document.createElement('span');
    pop.textContent = delta > 0 ? `+${delta}` : String(delta);
    if (delta < 0) pop.className = 'neg';
    pop.style.setProperty('--dx', `${-30 - Math.random() * 50}px`);
    pop.style.setProperty('--dy', `${-34 + Math.random() * 60}px`);
    pop.onanimationend = () => pop.remove();
    this.pops.appendChild(pop);
    while (this.pops.childElementCount > POPUPS_MAX) this.pops.firstElementChild!.remove();
  }

  /** Standing, downed or dead, as snapshots report it. */
  setLife(id: PlayerId, state: MoveState): void {
    const s = state === MoveState.Downed || state === MoveState.Dead ? state : MoveState.Idle;
    if ((this.life.get(id) ?? MoveState.Idle) === s) return;
    this.life.set(id, s);
    this.dirty = true;
  }

  private stateOf(p: PlayerPublic): '' | 'lost' | 'downed' | 'dead' {
    const s = this.life.get(p.id);
    return !p.connected ? 'lost' : s === MoveState.Downed ? 'downed' : s === MoveState.Dead ? 'dead' : '';
  }

  /** `states` adds the downed / dead / lost column (pointless once the game is over). */
  private fillTable(table: HTMLTableElement, states: boolean): void {
    const rows = [...this.players.values()].sort((a, b) => b.points - a.points);
    const cell = (tag: string, text: string | number, cls = '') => {
      const c = document.createElement(tag);
      c.textContent = String(text);
      if (cls) c.className = cls;
      return c;
    };
    const head = document.createElement('tr');
    head.append(...['Survivor', '', 'Points', 'Kills', 'Headshots', 'Downs', 'Revives'].map((h) => cell('th', h)));
    table.replaceChildren(head, ...rows.map((p) => {
      const tr = document.createElement('tr');
      if (p.id === this.selfId) tr.className = 'self';
      const name = cell('td', p.name);
      name.style.color = COLOURS[p.id % COLOURS.length]!;
      tr.append(name, cell('td', states ? this.stateOf(p) : '', 'state'), cell('td', p.points), cell('td', p.kills), cell('td', p.headshots), cell('td', p.downs), cell('td', p.revives));
      return tr;
    }));
  }

  /** Call every frame; `tab` is whether the scoreboard key is held. */
  update(tab: boolean): void {
    if (tab !== this.shown) {
      this.shown = tab;
      this.board.style.display = tab ? 'block' : 'none';
      this.dirty = true;
    }
    if (!this.dirty) return;
    this.dirty = false;
    // Points list: teammates above, our own total largest at the bottom.
    const order = [...this.players.values()].sort((a, b) => Number(a.id === this.selfId) - Number(b.id === this.selfId) || a.id - b.id);
    this.pointsEl.replaceChildren(...order.map((p) => {
      const row = document.createElement('span');
      const state = this.stateOf(p);
      row.className = `row${p.id === this.selfId ? ' self' : ''}${state ? ` ${state}` : ''}`;
      row.style.setProperty('--c', COLOURS[p.id % COLOURS.length]!);
      if (state === 'downed' || state === 'dead') {
        const mark = document.createElement('span');
        mark.className = 'mark';
        mark.textContent = state === 'downed' ? '\u271a' : '\u2715';
        row.append(mark);
      }
      if (p.id !== this.selfId) {
        const who = document.createElement('span');
        who.className = 'who';
        who.textContent = p.name;
        row.append(who);
      }
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = String(p.points);
      row.append(n);
      return row;
    }));
    if (this.shown) {
      el('scoreboard-title').textContent = `Round ${this.round}`;
      this.fillTable(this.board.querySelector('table')!, true);
    }
  }

  /** Fill the game-over screen. */
  results(round: number): void {
    el('results-sub').textContent = round > 1 ? `Overrun in round ${round} \u2014 ${round - 1} survived` : 'Overrun in round 1';
    this.fillTable(el('results').querySelector('table')!, false);
  }

  /** For tests/debug. */
  list(): { id: PlayerId; name: string; points: number; kills: number; headshots: number; downs: number; revives: number; state: string }[] {
    return [...this.players.values()].map((p) => ({
      id: p.id, name: p.name, points: p.points, kills: p.kills, headshots: p.headshots, downs: p.downs, revives: p.revives, state: this.stateOf(p) || 'alive',
    }));
  }
}
