import type { ErrorCode } from '@zh/shared';
import type { Net, RoomInfo } from '../net/net';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const ERRORS: Partial<Record<ErrorCode, string>> = {
  room_not_found: 'No room with that code.',
  room_full: 'That room is full.',
  not_ready: 'Everyone must be ready first.',
  not_host: 'Only the host can start.',
  kicked: 'This seat was taken over by another tab.',
  version: 'The game was updated — reload the page.',
};

const NAME_KEY = 'zh_name';

/** Main menu (name, create, join) and lobby (code, roster, ready, start). */
export class Menu {
  private readonly name = el<HTMLInputElement>('name');
  private readonly code = el<HTMLInputElement>('code');
  private readonly menuError = el('menu-error');
  private readonly lobbyError = el('lobby-error');
  private readonly lobbyCode = el('lobby-code');
  private readonly roster = el('lobby-players');
  private readonly readyBtn = el<HTMLButtonElement>('ready');
  private readonly startBtn = el<HTMLButtonElement>('start');

  constructor(private readonly net: Net, initialName: string | null) {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(NAME_KEY);
    } catch {}
    this.name.value = initialName ?? saved ?? '';
    net.name = this.name.value || net.name;

    const applyName = () => {
      net.name = this.name.value.trim() || 'Survivor';
      try {
        localStorage.setItem(NAME_KEY, this.name.value.trim());
      } catch {}
    };
    el('create').onclick = () => {
      applyName();
      this.setError('');
      net.create();
    };
    const join = () => {
      applyName();
      this.setError('');
      if (this.code.value.trim().length === 4) net.join(this.code.value);
      else this.setError('Enter the 4-letter room code.');
    };
    el('join').onclick = join;
    this.code.onkeydown = (e) => e.key === 'Enter' && join();
    this.readyBtn.onclick = () => net.ready(!this.me()?.ready);
    this.startBtn.onclick = () => net.startGame();
    el('leave').onclick = () => net.leave();
  }

  private me() {
    return this.net.room?.players.find((p) => p.id === this.net.id);
  }

  setError(text: string): void {
    this.menuError.textContent = text;
    this.lobbyError.textContent = text;
  }

  showError(code: ErrorCode): void {
    this.setError(ERRORS[code] ?? `Error: ${code}`);
  }

  setRoom(room: RoomInfo | null): void {
    if (!room) return;
    this.setError('');
    this.lobbyCode.textContent = room.code;
    this.roster.replaceChildren(
      ...room.players.map((p) => {
        const li = document.createElement('li');
        if (!p.connected) li.className = 'lost';
        const name = document.createElement('span');
        name.textContent = p.name + (p.id === room.you ? ' (you)' : '');
        const mark = document.createElement('span');
        mark.className = `mark${p.host || p.ready ? ' ok' : ''}`;
        mark.textContent = !p.connected ? 'lost' : p.host ? 'host' : p.ready ? 'ready' : 'not ready';
        li.append(name, mark);
        return li;
      }),
    );
    const me = this.me();
    const host = !!me?.host;
    this.readyBtn.style.display = host ? 'none' : '';
    this.startBtn.style.display = host ? '' : 'none';
    this.readyBtn.textContent = me?.ready ? 'Not ready' : 'Ready';
    this.readyBtn.classList.toggle('on', !!me?.ready);
    this.startBtn.disabled = room.players.some((p) => !p.host && p.connected && !p.ready);
  }
}
