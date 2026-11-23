import type { WebSocket } from 'ws';
import { HELLO_TIMEOUT_MS, encode, type ErrorCode, type ServerMsg } from '@zh/shared';
import { Link } from './link';
import type { Lobby } from './lobby';
import type { Peer } from './peer';

/** One WebSocket client: the socket end of a `Link`, with the timeouts that keep dead sockets from piling up. */
export class Connection implements Peer {
  private readonly link: Link;
  /** Set when the server pings; cleared by the pong. Still set at the next ping: the socket is dead. */
  private waiting = false;

  constructor(private readonly socket: WebSocket, lobby: Lobby) {
    this.link = new Link(this, lobby);
    const hello = setTimeout(() => {
      if (!this.link.session) this.kick('bad_message');
    }, HELLO_TIMEOUT_MS);
    socket.on('message', (data, isBinary) => {
      if (isBinary) return this.kick('bad_message');
      this.link.receive(data.toString());
    });
    socket.on('pong', () => (this.waiting = false));
    socket.on('close', () => {
      clearTimeout(hello);
      this.link.close();
    });
    socket.on('error', () => socket.terminate());
  }

  /** Called on a timer: drop the socket if the last ping went unanswered, else ping again. */
  heartbeat(): void {
    if (this.waiting) return this.socket.terminate();
    if (this.socket.readyState !== this.socket.OPEN) return;
    this.waiting = true;
    this.socket.ping();
  }

  send(msg: ServerMsg): void {
    if (this.socket.readyState === this.socket.OPEN) this.socket.send(encode(msg));
  }

  kick(code: ErrorCode): void {
    this.send({ t: 'error', code });
    this.socket.close(1008, code);
  }
}
