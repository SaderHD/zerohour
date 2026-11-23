import { PROTOCOL_VERSION, decodeServer, encode, type ClientMsg, type ServerMsg } from '@zh/shared';

type Handler<T extends ServerMsg['t']> = (msg: Extract<ServerMsg, { t: T }>) => void;

/** Thin typed wrapper over the game WebSocket. `connect` may be called again to reconnect. */
export class Socket {
  private ws: WebSocket | null = null;
  private readonly handlers = new Map<string, Set<(msg: ServerMsg) => void>>();
  onClose: (() => void) | null = null;

  connect(name: string, token?: string): void {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const old = this.ws;
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    old?.close(); // replaced on purpose: its close is not a lost connection
    ws.onopen = () => this.send({ t: 'hello', v: PROTOCOL_VERSION, name, token });
    ws.onmessage = (ev) => {
      if (ws !== this.ws || typeof ev.data !== 'string') return;
      const msg = decodeServer(ev.data);
      if (!msg) return;
      for (const h of this.handlers.get(msg.t) ?? []) h(msg);
    };
    ws.onclose = () => {
      if (ws === this.ws) this.onClose?.();
    };
  }

  on<T extends ServerMsg['t']>(type: T, handler: Handler<T>): void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(handler as (msg: ServerMsg) => void);
  }

  send(msg: ClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(encode(msg));
  }

  /** Drop the connection as if the network failed (used by tests for reconnects). */
  drop(): void {
    this.ws?.close();
  }
}
