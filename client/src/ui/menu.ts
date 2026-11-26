import { MAPS, type ErrorCode } from '@zh/shared';
import type { Net, Notice, RoomInfo } from '../net/net';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const ERRORS: Partial<Record<ErrorCode, string>> = {
  room_not_found: 'No room with that code.',
  room_full: 'That room is full.',
  not_ready: 'Everyone must be ready first.',
  not_host: 'Only the host can start.',
  not_in_room: 'You are not in a room.',
  kicked: 'This seat was taken over by another tab.',
  version: 'The game was updated — reload the page.',
  rate_limited: 'Slow down a little.',
  idle: 'The room was closed: nobody had touched it for half an hour.',
  room_closed: 'The room was closed by the server.',
  server_full: 'The server has no room for another game right now.',
  bad_message: 'The server did not understand this page — reload it.',
};
const NOTICES: Record<Notice, string> = {
  seat_lost: 'Your seat was given up — the game went on without you.',
  seat_back: '',
};

const NAME_KEY = 'zh_name';

/** Main menu (name, create, join, rejoin) and lobby (code, invite link, map, roster, ready, start). */
export class Menu {
  private readonly name = el<HTMLInputElement>('name');
  private readonly code = el<HTMLInputElement>('code');
  private readonly menuError = el('menu-error');
  private readonly lobbyError = el('lobby-error');
  private readonly lobbyCode = el('lobby-code');
  private readonly lobbyNote = el('lobby-note');
  private readonly roster = el('lobby-players');
  private readonly readyBtn = el<HTMLButtonElement>('ready');
  private readonly startBtn = el<HTMLButtonElement>('start');
  private readonly rejoinBtn = el<HTMLButtonElement>('rejoin');
  private readonly mapPick = el<HTMLSelectElement>('lobby-map');

  constructor(private readonly net: Net, initialName: string | null, initialCode: string | null) {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(NAME_KEY);
    } catch {}
    this.name.value = initialName ?? saved ?? '';
    this.code.value = initialCode ?? '';
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
      if (/^[a-zA-Z]{4}$/.test(this.code.value.trim())) net.join(this.code.value);
      else this.setError('Enter the 4-letter room code.');
    };
    el('join').onclick = join;
    this.code.onkeydown = (e) => e.key === 'Enter' && join();
    this.name.onkeydown = (e) => e.key === 'Enter' && (this.code.value.trim() ? join() : el('create').click());
    this.readyBtn.onclick = () => net.ready(!this.me()?.ready);
    this.startBtn.onclick = () => net.startGame();
    this.mapPick.onchange = () => net.setMap(this.mapPick.value);
    el('leave').onclick = () => net.leave();
    this.rejoinBtn.onclick = () => {
      this.setError('');
      net.rejoin();
    };
    el('copy-link').onclick = () => {
      const link = this.inviteLink();
      const done = (ok: boolean) => (this.lobbyNote.textContent = ok ? 'Invite link copied.' : link);
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(link).then(() => done(true), () => done(false));
      else done(false);
    };
    // A seat this browser held under a tab that has since gone: offer it back while the server keeps it.
    const offer = () => {
      const code = net.phase === 'menu' ? net.lostSeat() : null;
      this.rejoinBtn.hidden = !code;
      if (code) this.rejoinBtn.textContent = `Rejoin room ${code}`;
    };
    setInterval(offer, 1000);
  }

  inviteLink(): string {
    return `${location.origin}${location.pathname}?room=${this.net.room?.code ?? ''}`;
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

  showNotice(what: Notice): void {
    if (NOTICES[what]) this.setError(NOTICES[what]);
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
    // The map: the host's to choose where the server offers more than one, everyone's to see.
    if (this.mapPick.dataset.maps !== room.maps.join()) {
      this.mapPick.dataset.maps = room.maps.join();
      this.mapPick.replaceChildren(...room.maps.map((id) => new Option(MAPS[id]?.name ?? id, id)));
    }
    this.mapPick.value = room.map;
    this.mapPick.disabled = !host || room.maps.length < 2;
    const waiting = room.players.filter((p) => !p.host && p.connected && !p.ready).length;
    this.readyBtn.style.display = host ? 'none' : '';
    this.startBtn.style.display = host ? '' : 'none';
    this.readyBtn.textContent = me?.ready ? 'Not ready' : 'Ready';
    this.readyBtn.classList.toggle('on', !!me?.ready);
    this.startBtn.disabled = waiting > 0;
    this.startBtn.textContent = room.players.length > 1 ? 'Start' : 'Start solo';
    this.lobbyNote.textContent = host
      ? waiting ? `Waiting for ${waiting} to ready up` : room.players.length > 1 ? 'Everyone is ready' : 'Share the code or the link, or go in alone'
      : me?.ready ? 'Waiting for the host to start' : 'Ready up when you are set';
  }
}
