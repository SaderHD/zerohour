import {
  PROTOCOL_VERSION, RATE_ALL, RATE_CHAT, RATE_MARK, RATE_PING, RATE_ROOM, RATE_STRIKES, decodeClient,
  type ClientMsg,
} from '@zh/shared';
import type { Lobby, Session } from './lobby';
import type { Peer } from './peer';
import { Bucket } from './rateLimit';

type Limit = 'chat' | 'mark' | 'room' | 'ping';
const LIMIT_OF: Partial<Record<ClientMsg['t'], Limit>> = {
  chat: 'chat', mark: 'mark', ping: 'ping', create: 'room', join: 'room', leave: 'room', ready: 'room', map: 'room', start: 'room', again: 'room',
};
/** Limits whose refusals the client is told about (the rest are dropped quietly). */
const TOLD: ReadonlySet<Limit> = new Set<Limit>(['chat', 'room']);

/**
 * One client, whatever carries its frames (a WebSocket in `Connection`, a fake in tests). Every
 * frame comes through `receive`: decoded and checked, rate limited, then the handshake, then the
 * lobby. Nothing a client sends may throw out of here.
 */
export class Link {
  session: Session | null = null;
  /** Handler exceptions caught (there should never be any; tests assert on it). */
  errors = 0;
  private dead = false;
  private strikes = 0;
  private readonly all: Bucket;
  private readonly limits: Record<Limit, Bucket>;

  constructor(private readonly peer: Peer, private readonly lobby: Lobby, private readonly onError?: (err: unknown, msg: ClientMsg) => void) {
    const now = lobby.now();
    this.all = new Bucket(...RATE_ALL, now);
    this.limits = {
      chat: new Bucket(...RATE_CHAT, now), mark: new Bucket(...RATE_MARK, now),
      room: new Bucket(...RATE_ROOM, now), ping: new Bucket(...RATE_PING, now),
    };
  }

  receive(raw: string): void {
    if (this.dead) return;
    const now = this.lobby.now();
    if (!this.all.take(now)) {
      // A flood: drop it, and after enough of that drop the client.
      if (++this.strikes >= RATE_STRIKES) this.kick('rate_limited');
      return;
    }
    const msg = decodeClient(raw);
    if (!msg) return this.kick('bad_message');
    const limit = LIMIT_OF[msg.t];
    if (limit && !this.limits[limit].take(now)) {
      if (TOLD.has(limit)) this.peer.send({ t: 'error', code: 'rate_limited' });
      return;
    }
    try {
      this.handle(msg);
    } catch (err) {
      this.errors++;
      if (this.onError) this.onError(err, msg);
      else console.error('[zerohour] error handling message', msg.t, err);
    }
  }

  /** The transport has gone. */
  close(): void {
    this.dead = true;
    if (this.session) this.lobby.disconnect(this.session, this.peer);
  }

  private kick(code: 'bad_message' | 'rate_limited' | 'version'): void {
    this.dead = true;
    this.peer.kick(code);
  }

  private handle(msg: ClientMsg): void {
    if (msg.t === 'ping') return this.peer.send({ t: 'pong', c: msg.c, time: performance.now() / 1000 });
    if (!this.session) {
      if (msg.t !== 'hello') return this.kick('bad_message');
      if (msg.v !== PROTOCOL_VERSION) return this.kick('version');
      const { session, resumed } = this.lobby.connect(this.peer, msg.name, msg.token);
      this.session = session;
      this.peer.send({ t: 'welcome', v: PROTOCOL_VERSION, id: session.id, token: session.token, time: performance.now() / 1000, resumed });
      if (resumed) this.lobby.resume(session);
      return;
    }
    if (msg.t === 'hello') return;
    this.lobby.handle(this.session, msg);
  }
}
