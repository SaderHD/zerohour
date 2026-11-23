import { RECONNECT_GRACE_MS, type ErrorCode, type ServerMsg } from '@zh/shared';
import { Socket } from './socket';

export type NetPhase = 'connecting' | 'menu' | 'lobby' | 'playing' | 'lost';
export type RoomInfo = Extract<ServerMsg, { t: 'room' }>;
/** Things the player should be told that are not errors from a request. */
export type Notice = 'seat_lost' | 'seat_back';

const TOKEN_KEY = 'zh_token';
const SEAT_KEY = 'zh_seat';
const RETRY_MS = [1000, 1000, 2000, 3000, 5000];
const STALE_MS = 4500;
const FATAL: ErrorCode[] = ['kicked', 'version'];

/** The seat this tab holds: its token lives in sessionStorage, so two tabs are two players. */
const store = {
  get: (): string | undefined => {
    try {
      return sessionStorage.getItem(TOKEN_KEY) ?? undefined;
    } catch {
      return undefined;
    }
  },
  set: (v: string) => {
    try {
      sessionStorage.setItem(TOKEN_KEY, v);
    } catch {}
  },
};

interface Seat {
  token: string;
  code: string;
  at: number;
}

/**
 * The last room this browser sat in, kept in localStorage so that a tab that died (crash, closed
 * by mistake) can be replaced by a new one that asks for the same seat while the server holds it.
 */
const seat = {
  get: (): Seat | null => {
    try {
      const s = JSON.parse(localStorage.getItem(SEAT_KEY) ?? 'null') as Seat | null;
      const ok = s && typeof s.token === 'string' && typeof s.code === 'string' && Date.now() - s.at < RECONNECT_GRACE_MS;
      return ok ? s : null;
    } catch {
      return null;
    }
  },
  set: (s: Seat | null) => {
    try {
      if (s) localStorage.setItem(SEAT_KEY, JSON.stringify(s));
      else localStorage.removeItem(SEAT_KEY);
    } catch {}
  },
};

/**
 * Connection + lobby state machine. Reconnects automatically with the session token, which
 * restores the player's seat if the server still holds it.
 */
export class Net {
  readonly socket = new Socket();
  phase: NetPhase = 'connecting';
  id = 0;
  room: RoomInfo | null = null;
  pingMs: number | null = null;
  name = 'Survivor';
  /** Why the connection is gone for good ('lost' phase). */
  fatal: ErrorCode | null = null;
  /** Failed or dropped connections in a row (0 while connected). */
  attempts = 0;
  /** We had a connection at some point (so "connecting" now means "reconnecting"). */
  wasConnected = false;
  private token = '';
  private pingTimer = 0;
  /** In a room when the connection dropped: the room's code. */
  private heldRoom: string | null = null;
  /** A rejoin was asked for: the welcome will say whether the seat was still there. */
  private rejoining = false;

  onPhase: ((phase: NetPhase) => void) | null = null;
  onRoom: ((room: RoomInfo | null) => void) | null = null;
  onError: ((code: ErrorCode) => void) | null = null;
  onNotice: ((what: Notice) => void) | null = null;
  /** Fired on every successful handshake; `resumed` is true when our seat was restored. */
  onWelcome: ((resumed: boolean) => void) | null = null;
  /** The connection dropped or a retry failed (`attempts` says how many times now). */
  onDown: (() => void) | null = null;

  constructor() {
    const s = this.socket;
    s.on('welcome', (m) => {
      this.id = m.id;
      this.token = m.token;
      this.attempts = 0;
      this.wasConnected = true;
      store.set(m.token);
      const held = this.heldRoom;
      const asked = this.rejoining;
      this.heldRoom = null;
      this.rejoining = false;
      if (!m.resumed) {
        this.room = null;
        this.onRoom?.(null);
        this.setPhase('menu');
        if (held || asked) {
          seat.set(null);
          this.onNotice?.('seat_lost');
        }
      } else if (held || asked) this.onNotice?.('seat_back');
      this.onWelcome?.(m.resumed);
      s.send({ t: 'ping', c: performance.now() });
    });
    s.on('pong', (m) => {
      this.pingMs = Math.round(performance.now() - m.c);
      if (this.room) seat.set({ token: this.token, code: this.room.code, at: Date.now() });
    });
    s.on('room', (m) => {
      this.room = m;
      seat.set({ token: this.token, code: m.code, at: Date.now() });
      this.onRoom?.(m);
      if (m.phase === 'lobby') this.setPhase('lobby');
    });
    s.on('sync', () => this.setPhase('playing'));
    s.on('left', () => {
      this.room = null;
      seat.set(null);
      this.onRoom?.(null);
      this.setPhase('menu');
    });
    s.on('error', (m) => {
      if (FATAL.includes(m.code)) this.fatal = m.code;
      this.onError?.(m.code);
    });
    s.onClose = () => {
      clearInterval(this.pingTimer);
      if (this.fatal) return this.setPhase('lost');
      if (this.room) this.heldRoom = this.room.code;
      const wait = RETRY_MS[Math.min(this.attempts, RETRY_MS.length - 1)]!;
      this.attempts++;
      this.setPhase('connecting');
      this.onDown?.();
      setTimeout(() => this.open(), wait);
    };
  }

  start(name: string): void {
    if (name) this.name = name;
    this.open();
  }

  private open(): void {
    this.socket.connect(this.name, store.get());
    clearInterval(this.pingTimer);
    this.pingTimer = window.setInterval(() => this.socket.send({ t: 'ping', c: performance.now() }), 2000);
  }

  private setPhase(p: NetPhase): void {
    if (p === this.phase) return;
    this.phase = p;
    this.onPhase?.(p);
  }

  get isHost(): boolean {
    return !!this.room?.players.find((p) => p.id === this.id)?.host;
  }

  /** A room this browser was in a moment ago under another tab's seat, if the server may still be holding it. */
  lostSeat(): string | null {
    const s = seat.get();
    // A tab that is alive stamps its seat every couple of seconds; a stale stamp means it is gone.
    return s && !this.room && s.token !== this.token && Date.now() - s.at > STALE_MS ? s.code : null;
  }

  /** Ask for that seat back: shake hands again with its token. */
  rejoin(): void {
    const s = seat.get();
    if (!s) return void this.onNotice?.('seat_lost');
    store.set(s.token);
    this.rejoining = true;
    this.open();
  }

  create(code?: string): void {
    this.socket.send({ t: 'create', name: this.name, code });
  }

  join(code: string): void {
    this.socket.send({ t: 'join', code, name: this.name });
  }

  leave(): void {
    this.socket.send({ t: 'leave' });
  }

  ready(ready: boolean): void {
    this.socket.send({ t: 'ready', ready });
  }

  chat(text: string): void {
    this.socket.send({ t: 'chat', text });
  }

  /** After a game over: take the room back to the lobby. */
  again(): void {
    this.socket.send({ t: 'again' });
  }

  startGame(): void {
    this.socket.send({ t: 'start' });
  }
}
