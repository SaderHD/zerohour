import type { ErrorCode, ServerMsg } from '@zh/shared';
import { Socket } from './socket';

export type NetPhase = 'connecting' | 'menu' | 'lobby' | 'playing' | 'lost';
export type RoomInfo = Extract<ServerMsg, { t: 'room' }>;

const TOKEN_KEY = 'zh_token';
const RETRY_MS = 1000;
const FATAL: ErrorCode[] = ['kicked', 'version'];

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
  private fatal: ErrorCode | null = null;
  private pingTimer = 0;

  onPhase: ((phase: NetPhase) => void) | null = null;
  onRoom: ((room: RoomInfo | null) => void) | null = null;
  onError: ((code: ErrorCode) => void) | null = null;
  /** Fired on every successful handshake; `resumed` is true when our seat was restored. */
  onWelcome: ((resumed: boolean) => void) | null = null;

  constructor() {
    const s = this.socket;
    s.on('welcome', (m) => {
      this.id = m.id;
      store.set(m.token);
      if (!m.resumed) {
        this.room = null;
        this.onRoom?.(null);
        this.setPhase('menu');
      }
      this.onWelcome?.(m.resumed);
      s.send({ t: 'ping', c: performance.now() });
    });
    s.on('pong', (m) => {
      this.pingMs = Math.round(performance.now() - m.c);
    });
    s.on('room', (m) => {
      this.room = m;
      this.onRoom?.(m);
      if (m.phase === 'lobby') this.setPhase('lobby');
    });
    s.on('sync', () => this.setPhase('playing'));
    s.on('left', () => {
      this.room = null;
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
      this.setPhase('connecting');
      setTimeout(() => this.open(), RETRY_MS);
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

  /** After a game over: take the room back to the lobby. */
  again(): void {
    this.socket.send({ t: 'again' });
  }

  startGame(): void {
    this.socket.send({ t: 'start' });
  }
}
