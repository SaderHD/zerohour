import type { WebSocket } from 'ws';
import { PROTOCOL_VERSION, decodeClient, encode, type ClientMsg, type ErrorCode, type ServerMsg } from '@zh/shared';
import type { Lobby, Session } from './lobby';
import type { Peer } from './peer';

/** One WebSocket client. Owns the handshake, then forwards messages to the lobby. */
export class Connection implements Peer {
  private session: Session | null = null;

  constructor(private readonly socket: WebSocket, private readonly lobby: Lobby) {
    socket.on('message', (data, isBinary) => {
      if (isBinary) return this.kick('bad_message');
      const msg = decodeClient(data.toString());
      if (!msg) return this.kick('bad_message');
      try {
        this.handle(msg);
      } catch (err) {
        console.error('[zerohour] error handling message', msg.t, err);
      }
    });
    socket.on('close', () => {
      if (this.session) this.lobby.disconnect(this.session, this);
    });
    socket.on('error', () => socket.terminate());
  }

  send(msg: ServerMsg): void {
    if (this.socket.readyState === this.socket.OPEN) this.socket.send(encode(msg));
  }

  kick(code: ErrorCode): void {
    this.send({ t: 'error', code });
    this.socket.close(1008, code);
  }

  private handle(msg: ClientMsg): void {
    if (msg.t === 'ping') {
      if (typeof msg.c === 'number') this.send({ t: 'pong', c: msg.c, time: performance.now() / 1000 });
      return;
    }
    if (!this.session) {
      if (msg.t !== 'hello') return this.kick('bad_message');
      if (msg.v !== PROTOCOL_VERSION) return this.kick('version');
      const { session, resumed } = this.lobby.connect(this, msg.name, msg.token);
      this.session = session;
      this.send({ t: 'welcome', v: PROTOCOL_VERSION, id: session.id, token: session.token, time: performance.now() / 1000, resumed });
      if (resumed) this.lobby.resume(session);
      return;
    }
    if (msg.t === 'hello') return;
    this.lobby.handle(this.session, msg);
  }
}
