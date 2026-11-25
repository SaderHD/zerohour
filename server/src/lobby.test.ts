import { describe, expect, it } from 'vitest';
import { MoveState, RECONNECT_GRACE_MS, TICK_DT, type ClientMsg, type ErrorCode, type ServerMsg } from '@zh/shared';
import { Lobby, type Session } from './lobby';
import { damagePlayer } from './game/players';
import type { Peer } from './peer';

class FakePeer implements Peer {
  sent: ServerMsg[] = [];
  kicked: ErrorCode | null = null;
  send(msg: ServerMsg): void {
    this.sent.push(msg);
  }
  kick(code: ErrorCode): void {
    this.kicked = code;
  }
  last<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }> | undefined {
    return this.sent.filter((m) => m.t === t).pop() as Extract<ServerMsg, { t: T }> | undefined;
  }
}

function setup() {
  let now = 1_000_000;
  const lobby = new Lobby({ debug: true, now: () => now, autoTick: false });
  const join = (name: string, token?: string) => {
    const peer = new FakePeer();
    const { session, resumed } = lobby.connect(peer, name, token);
    if (resumed) lobby.resume(session);
    const send = (msg: ClientMsg) => lobby.handle(session, msg);
    return { peer, session, send, resumed };
  };
  return { lobby, join, advance: (ms: number) => (now += ms) };
}

/** Host creates a room, n-1 others join and ready up, host starts. */
function startedRoom(n: number) {
  const ctx = setup();
  const host = ctx.join('Host');
  host.send({ t: 'create' });
  const code = host.peer.last('room')!.code;
  const others = Array.from({ length: n - 1 }, (_, i) => {
    const p = ctx.join(`P${i + 2}`);
    p.send({ t: 'join', code });
    p.send({ t: 'ready', ready: true });
    return p;
  });
  host.send({ t: 'start' });
  const room = ctx.lobby.rooms.get(code)!;
  const game = room.game!;
  const step = (ticks = 2) => {
    for (let i = 0; i < ticks; i++) game.step(TICK_DT);
  };
  return { ...ctx, host, others, code, room, game, step };
}

const move = (s: Session, seq: number, x: number, z: number): ClientMsg => ({ t: 'move', seq, x, y: 0, z, yaw: 0, pitch: 0, state: MoveState.Walk });

describe('lobby', () => {
  it('creates a room with a 4-letter code and makes the creator host', () => {
    const { join } = setup();
    const a = join('Ada');
    a.send({ t: 'create' });
    const room = a.peer.last('room')!;
    expect(room.code).toMatch(/^[A-Z]{4}$/);
    expect(room.players).toEqual([{ id: a.session.id, name: 'Ada', ready: false, host: true, connected: true }]);
  });

  it('joins by code (case-insensitive), rejects unknown and full rooms', () => {
    const { join } = setup();
    const a = join('A');
    a.send({ t: 'create', code: 'TEST' });
    expect(a.peer.last('room')!.code).toBe('TEST');
    const b = join('B');
    b.send({ t: 'join', code: 'nope' });
    expect(b.peer.last('error')!.code).toBe('room_not_found');
    b.send({ t: 'join', code: 'test' });
    expect(a.peer.last('room')!.players).toHaveLength(2);
    join('C').send({ t: 'join', code: 'TEST' });
    join('D').send({ t: 'join', code: 'TEST' });
    const e = join('E');
    e.send({ t: 'join', code: 'TEST' });
    expect(e.peer.last('error')!.code).toBe('room_full');
  });

  it('only the host can start, and only when everyone else is ready', () => {
    const { join, lobby } = setup();
    const a = join('A');
    a.send({ t: 'create' });
    const code = a.peer.last('room')!.code;
    const b = join('B');
    b.send({ t: 'join', code });
    b.send({ t: 'start' });
    expect(b.peer.last('error')!.code).toBe('not_host');
    a.send({ t: 'start' });
    expect(a.peer.last('error')!.code).toBe('not_ready');
    b.send({ t: 'ready', ready: true });
    a.send({ t: 'start' });
    expect(lobby.rooms.get(code)!.phase).toBe('playing');
    expect(b.peer.last('sync')!.players).toHaveLength(2);
    expect(b.peer.last('sync')!.self.x).not.toBe(a.peer.last('sync')!.self.x);
  });

  it('passes the host role on when the host leaves and deletes empty rooms', () => {
    const { join, lobby } = setup();
    const a = join('A');
    a.send({ t: 'create' });
    const code = a.peer.last('room')!.code;
    const b = join('B');
    b.send({ t: 'join', code });
    a.send({ t: 'leave' });
    expect(b.peer.last('room')!.players[0]).toMatchObject({ id: b.session.id, host: true });
    b.send({ t: 'leave' });
    expect(lobby.rooms.has(code)).toBe(false);
  });

  it('the host picks the map in the lobby; the game is played on it', () => {
    const { join, lobby } = setup();
    const host = join('Host');
    host.send({ t: 'create' });
    const first = host.peer.last('room')!;
    expect(first.map).toBe('harrow_ridge');
    // A debug server offers the proving grounds as well as the maps people play.
    expect(first.maps).toEqual(['harrow_ridge', 'longest_night', 'stacks', 'corner']);
    const mate = join('Mate');
    mate.send({ t: 'join', code: first.code });
    mate.send({ t: 'ready', ready: true });

    mate.send({ t: 'map', id: 'stacks' });
    expect(mate.peer.last('error')?.code).toBe('not_host');
    host.send({ t: 'map', id: 'nowhere' });
    expect(host.peer.last('room')!.map).toBe('harrow_ridge');
    expect(host.peer.last('room')!.players.find((p) => !p.host)!.ready).toBe(true);

    host.send({ t: 'map', id: 'stacks' });
    const room = mate.peer.last('room')!;
    expect(room.map).toBe('stacks');
    // A different map is a different game: whoever had said yes is asked again.
    expect(room.players.find((p) => !p.host)!.ready).toBe(false);
    mate.send({ t: 'ready', ready: true });
    host.send({ t: 'start' });
    const game = lobby.rooms.get(first.code)!.game!;
    expect(game.map.def.id).toBe('stacks');
    expect(host.peer.last('sync')!.map).toBe('stacks');
    // Not once the game is on.
    host.send({ t: 'map', id: 'harrow_ridge' });
    expect(host.peer.last('room')!.map).toBe('stacks');
  });

  it('offers only the maps people play unless it is a debug server, and starts rooms on the one it was set up for', () => {
    const open = (opts: { debug: boolean; map?: string }) => {
      const lobby = new Lobby({ ...opts, autoTick: false });
      const peer = new FakePeer();
      const { session } = lobby.connect(peer, 'A');
      lobby.handle(session, { t: 'create' });
      lobby.handle(session, { t: 'map', id: 'stacks' });
      return peer.last('room')!;
    };
    expect(open({ debug: false })).toMatchObject({ map: 'harrow_ridge', maps: ['harrow_ridge', 'longest_night'] });
    expect(open({ debug: false, map: 'stacks' })).toMatchObject({ map: 'stacks', maps: ['harrow_ridge', 'longest_night', 'stacks'] });
    expect(open({ debug: false, map: 'nowhere' })).toMatchObject({ map: 'harrow_ridge', maps: ['harrow_ridge', 'longest_night'] });
  });

  it('sanitises names', () => {
    const { join } = setup();
    expect(join('  <b>very\nlong name indeed</b>  ').session.name).toBe('<b>very long nam');
    expect(join('').session.name).toMatch(/^Survivor\d+$/);
  });
});

describe('game sync', () => {
  it('broadcasts snapshots containing every player', () => {
    const g = startedRoom(3);
    g.step(2);
    const snap = g.others[0]!.peer.last('snap')!;
    expect(snap.players.map((p) => p[0]).sort()).toEqual([g.host.session.id, ...g.others.map((o) => o.session.id)].sort());
  });

  it('accepts legal movement and acks it', () => {
    const g = startedRoom(1);
    const p = g.game.players.get(g.host.session.id)!;
    g.host.send(move(g.host.session, 1, p.x + 0.3, p.z));
    g.step(2);
    const snap = g.host.peer.last('snap')!;
    expect(snap.ack).toBe(1);
    expect(snap.players[0]![1]).toBeCloseTo(28.3);
    expect(g.host.peer.last('correct')).toBeUndefined();
  });

  it('rejects teleports, wall clipping and closed doors with a correction', () => {
    const g = startedRoom(1);
    const id = g.host.session.id;
    const p = g.game.players.get(id)!;
    const start = { x: p.x, z: p.z };
    g.host.send(move(g.host.session, 1, start.x + 20, start.z)); // too far
    expect(g.host.peer.last('correct')).toMatchObject({ x: start.x, z: start.z, seq: 1 });
    g.host.send(move(g.host.session, 2, start.x, 21.8)); // inside the north wall (also too far)
    expect(g.host.peer.last('correct')!.seq).toBe(2);
    expect(p.x).toBe(start.x);
    // Walk legally to the closed yard door, then try to step into it.
    let seq = 3;
    for (let z = start.z; z < 31.6; z += 0.2) {
      g.host.send(move(g.host.session, seq++, 29, z));
      g.step(1);
    }
    expect(p.z).toBeGreaterThan(31.3);
    g.host.send(move(g.host.session, seq++, 29, 32.2));
    expect(g.host.peer.last('correct')!.seq).toBe(seq - 1);
    g.host.send({ t: 'debug', cmd: 'openDoor', id: 'd_mess_yard' });
    g.step(1);
    g.host.send(move(g.host.session, seq, 29, 32.0));
    expect(p.z).toBe(32.0);
  });

  it('sustained speed hacking is corrected but sprinting is not', () => {
    const g = startedRoom(1);
    g.host.send({ t: 'debug', cmd: 'teleport', x: 22, z: 39 }); // west edge of the yard
    const p = g.game.players.get(g.host.session.id)!;
    g.host.peer.sent.length = 0;
    let seq = 1;
    let x = 22;
    for (let i = 0; i < 60; i++) { // 2 s at 6.5 m/s
      x += 6.5 * TICK_DT;
      g.host.send(move(g.host.session, seq++, x, 39));
      g.step(1);
    }
    expect(g.host.peer.last('correct')).toBeUndefined();
    for (let i = 0; i < 60; i++) { // 2 s at 13 m/s
      x += 13 * TICK_DT;
      g.host.send(move(g.host.session, seq++, x, 39));
      g.step(1);
    }
    expect(g.host.peer.last('correct')).toBeDefined();
    expect(p.x).toBeLessThan(x - 3);
  });

  it('late joiners drop into the running game', () => {
    const g = startedRoom(1);
    const late = g.join('Late');
    late.send({ t: 'join', code: g.code });
    expect(late.peer.last('room')!.phase).toBe('playing');
    expect(late.peer.last('sync')!.players).toHaveLength(2);
    g.step(2);
    expect(g.host.peer.last('snap')!.players).toHaveLength(2);
  });
});

describe('reconnect', () => {
  it('restores the same seat, id and position', () => {
    const g = startedRoom(2);
    const b = g.others[0]!;
    const p = g.game.players.get(b.session.id)!;
    b.send(move(b.session, 1, p.x + 0.4, p.z + 0.2));
    const pos = { x: p.x, z: p.z };
    g.lobby.disconnect(b.session, b.peer);
    expect(g.host.peer.last('room')!.players.find((x) => x.id === b.session.id)!.connected).toBe(false);
    g.advance(RECONNECT_GRACE_MS - 1000);
    g.lobby.sweep();
    const again = g.join('ignored', b.session.token);
    expect(again.resumed).toBe(true);
    expect(again.session.id).toBe(b.session.id);
    expect(again.peer.last('room')!.code).toBe(g.code);
    expect(again.peer.last('sync')!.self).toMatchObject(pos);
    expect(g.host.peer.last('room')!.players.find((x) => x.id === b.session.id)!.connected).toBe(true);
  });

  it('drops the seat after the grace period', () => {
    const g = startedRoom(2);
    const b = g.others[0]!;
    g.lobby.disconnect(b.session, b.peer);
    g.advance(RECONNECT_GRACE_MS + 1);
    g.lobby.sweep();
    expect(g.game.players.has(b.session.id)).toBe(false);
    expect(g.join('x', b.session.token).resumed).toBe(false);
  });

  it('a second connection with the same token takes the seat over', () => {
    const g = startedRoom(1);
    const dup = g.join('dup', g.host.session.token);
    expect(dup.resumed).toBe(true);
    expect(g.host.peer.kicked).toBe('kicked');
    g.lobby.disconnect(g.host.session, g.host.peer); // the old socket closing must not unseat the new one
    expect(g.host.session.peer).toBe(dup.peer);
  });

  it('deletes rooms once everyone has been gone for a while', () => {
    const g = startedRoom(1);
    g.lobby.disconnect(g.host.session, g.host.peer);
    g.advance(RECONNECT_GRACE_MS + 1);
    g.lobby.sweep();
    expect(g.lobby.rooms.size).toBe(0);
  });
});

describe('game over', () => {
  it('moves the room to the results, then back to the lobby when anyone asks', () => {
    const { host, others, room, game, step } = startedRoom(2);
    for (const p of game.players.values()) p.hp = 1;
    step(1);
    expect(room.phase).toBe('playing');
    host.send({ t: 'again' }); // not over yet: ignored
    expect(room.game).toBe(game);
    for (const p of game.players.values()) damagePlayer(game, p, 50, 0, 0);
    step(1);
    expect(game.over).toBe(true);
    expect(room.phase).toBe('gameover');
    expect(host.peer.last('room')!.phase).toBe('gameover');
    const ev = host.peer.sent.filter((m) => m.t === 'ev').flatMap((m) => m.events);
    expect(ev.some((e) => e.e === 'gameOver')).toBe(true);
    others[0]!.send({ t: 'again' });
    expect(room.phase).toBe('lobby');
    expect(room.game).toBeNull();
    expect(host.peer.last('room')).toMatchObject({ phase: 'lobby' });
    expect(host.peer.last('room')!.players.every((p) => !p.ready)).toBe(true);
    others[0]!.send({ t: 'ready', ready: true });
    host.send({ t: 'start' });
    expect(room.phase).toBe('playing');
    expect(room.game).not.toBe(game);
  });
});
