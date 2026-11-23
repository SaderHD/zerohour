import { randomBytes } from 'node:crypto';
import type { WebSocket } from 'ws';
import {
  MAX_NAME_LENGTH,
  PROTOCOL_VERSION,
  decodeClient,
  encode,
  sanitizeText,
  type ClientMsg,
  type PlayerId,
  type ServerMsg,
} from '@zh/shared';

let nextPlayerId: PlayerId = 1;

/**
 * One WebSocket client. Owns the handshake; after `hello` it will hand messages to the lobby
 * (session 3). Nothing but `hello` and `ping` is accepted before the handshake completes.
 */
export class Connection {
  id: PlayerId = 0;
  name = '';
  token = '';
  private greeted = false;

  constructor(private readonly socket: WebSocket) {
    socket.on('message', (data, isBinary) => {
      if (isBinary) return this.fail('bad_message');
      const msg = decodeClient(data.toString());
      if (!msg) return this.fail('bad_message');
      this.handle(msg);
    });
    socket.on('error', () => socket.terminate());
  }

  send(msg: ServerMsg): void {
    if (this.socket.readyState === this.socket.OPEN) this.socket.send(encode(msg));
  }

  private fail(code: Extract<ServerMsg, { t: 'error' }>['code']): void {
    this.send({ t: 'error', code });
    this.socket.close(1008, code);
  }

  private handle(msg: ClientMsg): void {
    if (msg.t === 'ping') {
      if (typeof msg.c === 'number') this.send({ t: 'pong', c: msg.c, time: performance.now() / 1000 });
      return;
    }
    if (!this.greeted) {
      if (msg.t !== 'hello') return this.fail('bad_message');
      if (msg.v !== PROTOCOL_VERSION) return this.fail('version');
      this.greeted = true;
      this.id = nextPlayerId++;
      this.name = sanitizeText(msg.name, MAX_NAME_LENGTH) || `Survivor${this.id}`;
      this.token = randomBytes(12).toString('hex');
      this.send({ t: 'welcome', v: PROTOCOL_VERSION, id: this.id, token: this.token, time: performance.now() / 1000 });
      return;
    }
    // Lobby and game messages are routed from here starting in session 3.
  }
}
