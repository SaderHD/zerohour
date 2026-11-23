import { PROTOCOL_VERSION, decodeServer, encode, type ClientMsg, type ServerMsg } from '@zh/shared';

type Handler<T extends ServerMsg['t']> = (msg: Extract<ServerMsg, { t: T }>) => void;

/** Thin typed wrapper over the game WebSocket. Performs the `hello` handshake on open. */
export class Socket {
  private ws: WebSocket | null = null;
  private readonly handlers = new Map<string, Set<(msg: ServerMsg) => void>>();
  onClose: (() => void) | null = null;

  constructor(private readonly name: string, private readonly token?: string) {}

  connect(): void {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => this.send({ t: 'hello', v: PROTOCOL_VERSION, name: this.name, token: this.token });
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return;
      const msg = decodeServer(ev.data);
      if (!msg) return;
      for (const h of this.handlers.get(msg.t) ?? []) h(msg);
    };
    ws.onclose = () => this.onClose?.();
  }

  on<T extends ServerMsg['t']>(type: T, handler: Handler<T>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    const h = handler as (msg: ServerMsg) => void;
    set.add(h);
    return () => set.delete(h);
  }

  send(msg: ClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(encode(msg));
  }

  close(): void {
    this.ws?.close();
  }
}
