import type { ErrorCode, ServerMsg } from '@zh/shared';

/** Something we can send server messages to: a WebSocket connection, or a fake in tests. */
export interface Peer {
  send(msg: ServerMsg): void;
  /** Send an error and drop the connection. */
  kick(code: ErrorCode): void;
}
