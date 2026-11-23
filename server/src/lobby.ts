import { randomBytes } from 'node:crypto';
import {
  MAX_CHAT_LENGTH, MAX_NAME_LENGTH, MAX_PLAYERS, RECONNECT_GRACE_MS, ROOM_CODE_LENGTH, ROOM_IDLE_MS, sanitizeText,
  type ClientMsg, type ErrorCode, type PlayerId, type RoomPhase, type ServerMsg,
} from '@zh/shared';
import { Game } from './game/Game';
import type { Peer } from './peer';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O

/** A player's seat. Survives a dropped connection for RECONNECT_GRACE_MS via its token. */
export interface Session {
  id: PlayerId;
  name: string;
  token: string;
  peer: Peer | null;
  room: Room | null;
  ready: boolean;
  lostAt: number | null;
}

export class Room {
  phase: RoomPhase = 'lobby';
  readonly members = new Map<PlayerId, Session>();
  hostId: PlayerId = 0;
  game: Game | null = null;
  emptySince: number | null = null;

  constructor(readonly code: string) {}

  broadcast(msg: ServerMsg): void {
    for (const m of this.members.values()) m.peer?.send(msg);
  }

  sendState(): void {
    const players = [...this.members.values()].map((m) => ({
      id: m.id, name: m.name, ready: m.ready, host: m.id === this.hostId, connected: m.peer !== null,
    }));
    for (const m of this.members.values()) m.peer?.send({ t: 'room', code: this.code, phase: this.phase, players, you: m.id });
  }
}

export interface LobbyOpts {
  debug: boolean;
  now?: () => number;
  /** Tests pass false so games are stepped by hand instead of on a timer. */
  autoTick?: boolean;
}

/** Rooms, room codes, joining/leaving and reconnects. Transport-agnostic (see Peer). */
export class Lobby {
  readonly rooms = new Map<string, Room>();
  private readonly byToken = new Map<string, Session>();
  private nextId: PlayerId = 1;
  private readonly now: () => number;

  constructor(private readonly opts: LobbyOpts) {
    this.now = opts.now ?? Date.now;
  }

  /** Handshake. A known token resumes that seat (taking it over if it is still connected). */
  connect(peer: Peer, name: unknown, token?: unknown): { session: Session; resumed: boolean } {
    const old = typeof token === 'string' ? this.byToken.get(token) : undefined;
    if (old?.room) {
      old.peer?.kick('kicked');
      old.peer = peer;
      old.lostAt = null;
      return { session: old, resumed: true };
    }
    const id = this.nextId++;
    const session: Session = {
      id, name: sanitizeText(name, MAX_NAME_LENGTH) || `Survivor${id}`, token: randomBytes(12).toString('hex'),
      peer, room: null, ready: false, lostAt: null,
    };
    this.byToken.set(session.token, session);
    return { session, resumed: false };
  }

  /** Called after `welcome` has been sent for a resumed session: bring the client up to date. */
  resume(s: Session): void {
    const room = s.room;
    if (!room) return;
    room.emptySince = null;
    room.sendState();
    if (room.game) {
      room.game.setConnected(s.id, true);
      s.peer?.send(room.game.syncFor(s.id));
    }
  }

  disconnect(s: Session, peer: Peer): void {
    if (s.peer !== peer) return; // already replaced by a newer connection
    s.peer = null;
    if (!s.room) {
      this.byToken.delete(s.token);
      return;
    }
    s.lostAt = this.now();
    s.room.game?.setConnected(s.id, false);
    s.room.sendState();
  }

  handle(s: Session, msg: ClientMsg): void {
    const fail = (code: ErrorCode) => s.peer?.send({ t: 'error', code });
    if ((msg.t === 'create' || msg.t === 'join') && msg.name !== undefined) {
      s.name = sanitizeText(msg.name, MAX_NAME_LENGTH) || s.name;
    }
    switch (msg.t) {
      case 'create': {
        if (s.room) this.leave(s);
        const wanted = this.opts.debug && typeof msg.code === 'string' ? msg.code.toUpperCase() : '';
        const code = /^[A-Z]{4}$/.test(wanted) && !this.rooms.has(wanted) ? wanted : this.newCode();
        const room = new Room(code);
        this.rooms.set(code, room);
        this.enter(s, room);
        return;
      }
      case 'join': {
        const code = typeof msg.code === 'string' ? msg.code.trim().toUpperCase() : '';
        const room = this.rooms.get(code);
        if (!room) return fail('room_not_found');
        if (s.room === room) return room.sendState();
        if (room.members.size >= MAX_PLAYERS) return fail('room_full');
        if (s.room) this.leave(s);
        this.enter(s, room);
        return;
      }
      case 'leave':
        if (s.room) this.leave(s);
        s.peer?.send({ t: 'left' });
        return;
      case 'ready':
        if (!s.room) return fail('not_in_room');
        s.ready = msg.ready === true;
        s.room.sendState();
        return;
      case 'start': {
        const room = s.room;
        if (!room) return fail('not_in_room');
        if (room.hostId !== s.id) return fail('not_host');
        if (room.phase !== 'lobby') return;
        for (const m of room.members.values()) if (m.id !== room.hostId && m.peer && !m.ready) return fail('not_ready');
        this.startGame(room);
        return;
      }
      case 'again':
        if (s.room?.phase === 'gameover') this.backToLobby(s.room);
        return;
      case 'chat': {
        const text = sanitizeText(msg.text, MAX_CHAT_LENGTH);
        if (s.room && text) s.room.broadcast({ t: 'chat', from: s.id, name: s.name, text });
        return;
      }
      default:
        if (s.room?.game) s.room.game.onMessage(s.id, msg);
        else if (!s.room) fail('not_in_room');
    }
  }

  /** Drop seats whose grace period expired and delete rooms nobody is connected to. */
  sweep(): void {
    const now = this.now();
    for (const room of [...this.rooms.values()]) {
      for (const m of [...room.members.values()]) {
        if (m.lostAt !== null && now - m.lostAt >= RECONNECT_GRACE_MS) {
          this.leave(m);
          this.byToken.delete(m.token);
        }
      }
      const anyone = [...room.members.values()].some((m) => m.peer);
      if (anyone) room.emptySince = null;
      else room.emptySince ??= now;
      if (room.members.size === 0 || now - (room.emptySince ?? now) >= ROOM_IDLE_MS) this.closeRoom(room);
    }
  }

  private newCode(): string {
    for (;;) {
      const bytes = randomBytes(ROOM_CODE_LENGTH);
      let code = '';
      for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
      if (!this.rooms.has(code)) return code;
    }
  }

  private enter(s: Session, room: Room): void {
    s.room = room;
    s.ready = false;
    room.members.set(s.id, s);
    if (!room.hostId) room.hostId = s.id;
    room.emptySince = null;
    if (room.phase === 'gameover') return this.backToLobby(room);
    room.sendState();
    // Late join: into the running game, to spawn when the next round starts.
    if (room.game) {
      room.game.addPlayer(s.id, s.name);
      s.peer?.send(room.game.syncFor(s.id));
    }
  }

  private leave(s: Session): void {
    const room = s.room;
    if (!room) return;
    s.room = null;
    s.ready = false;
    s.lostAt = null;
    room.members.delete(s.id);
    room.game?.removePlayer(s.id);
    if (room.hostId === s.id) room.hostId = [...room.members.values()].find((m) => m.peer)?.id ?? [...room.members.keys()][0] ?? 0;
    if (room.members.size === 0) this.closeRoom(room);
    else room.sendState();
  }

  private closeRoom(room: Room): void {
    room.game?.stop();
    for (const m of room.members.values()) {
      m.room = null;
      if (!m.peer) this.byToken.delete(m.token);
      else m.peer.send({ t: 'left' });
    }
    room.members.clear();
    this.rooms.delete(room.code);
  }

  /** After a game over: drop the finished game and gather in the lobby again. */
  private backToLobby(room: Room): void {
    room.game?.stop();
    room.game = null;
    room.phase = 'lobby';
    for (const m of room.members.values()) m.ready = false;
    room.sendState();
  }

  private startGame(room: Room): void {
    room.phase = 'playing';
    const game = new Game(
      {
        send: (id, msg) => room.members.get(id)?.peer?.send(msg),
        broadcast: (msg) => room.broadcast(msg),
      },
      {
        debug: this.opts.debug, seed: randomBytes(4).readUInt32LE(0),
        onOver: () => {
          game.stop();
          room.phase = 'gameover';
          room.sendState();
        },
      },
    );
    room.game = game;
    for (const m of room.members.values()) {
      game.addPlayer(m.id, m.name);
      if (!m.peer) game.setConnected(m.id, false);
    }
    room.sendState();
    for (const m of room.members.values()) m.peer?.send(game.syncFor(m.id));
    if (this.opts.autoTick !== false) game.start();
  }
}
