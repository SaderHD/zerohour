import { describe, expect, it } from 'vitest';
import {
  MAX_MSG_BYTES, PROTOCOL_VERSION, RATE_STRIKES, Rng, TICK_DT, decodeClient, encode,
  type ClientMsg, type ErrorCode, type ServerMsg,
} from '@zh/shared';
import { Link } from './link';
import { Lobby } from './lobby';
import type { Peer } from './peer';

// Acceptance for session 13: whatever a client sends, in whatever order, the server neither
// throws nor ends up with nonsense in its state, and honest players next to it keep playing.

class FakePeer implements Peer {
  sent: ServerMsg[] = [];
  kicked: ErrorCode | null = null;
  send(msg: ServerMsg): void {
    this.sent.push(msg);
    if (this.sent.length > 400) this.sent.splice(0, 200);
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
  const lobby = new Lobby({ debug: false, now: () => now, autoTick: false });
  const thrown: string[] = [];
  const connect = () => {
    const peer = new FakePeer();
    const link = new Link(peer, lobby, (err, msg) => thrown.push(`${msg.t}: ${String(err)}`));
    return { peer, link, say: (m: ClientMsg) => link.receive(encode(m)) };
  };
  return { lobby, connect, thrown, advance: (ms: number) => (now += ms) };
}

const TYPES: ClientMsg['t'][] = [
  'hello', 'create', 'join', 'leave', 'ready', 'start', 'again', 'move', 'fire', 'reload', 'swap', 'melee', 'throw',
  'interact', 'revive', 'chat', 'mark', 'ping', 'debug',
];
const GAME_TYPES: ClientMsg['t'][] = ['move', 'fire', 'reload', 'swap', 'melee', 'throw', 'interact', 'revive', 'chat', 'mark', 'debug'];
const FIELDS = ['v', 'name', 'token', 'code', 'ready', 'seq', 'x', 'z', 'yaw', 'pitch', 'state', 'slot', 'aim', 'hits', 'hit', 'kind', 'id', 'hold', 'target', 'text', 'c', 'cmd', 'weapon', 'points', 'round', 'count'];

/** Values of every awkward kind. Some survive JSON as they are; the raw frames below cover the rest (1e999 parses to Infinity). */
function nasty(rng: Rng, depth = 0): unknown {
  const pick = rng.int(0, 19);
  switch (pick) {
    case 0: return null;
    case 1: return true;
    case 2: return -1;
    case 3: return 0;
    case 4: return 2 ** 53;
    case 5: return -(2 ** 31);
    case 6: return 1e308;
    case 7: return 0.5;
    case 8: return rng.int(0, 70);
    case 9: return '';
    case 10: return 'x'.repeat(rng.int(1, 600));
    case 11: return '__proto__';
    case 12: return 'constructor';
    case 13: return '\u0000￿\ud83d';
    case 14: return depth < 3 ? Array.from({ length: rng.int(0, 80) }, () => nasty(rng, depth + 1)) : [];
    case 15: return depth < 3 ? { id: nasty(rng, depth + 1), zone: rng.pick(['head', 'torso', 'limb', 'hat']), dist: nasty(rng, depth + 1) } : {};
    case 16: return rng.pick(['frag', 'tactical', 'head', 'd_mess_bunk', 'warden', 'ZZZZ', 'toString']);
    case 17: return rng.int(1, 12);
    case 18: return { length: 1e9 };
    default: return undefined;
  }
}

function fuzzFrame(rng: Rng, roomCode: string): string {
  const kind = rng.int(0, 9);
  if (kind === 0) return rng.pick(['', '{', 'null', '[]', '42', '"hello"', '{"t":"move","x":1e999,"z":-1e999,"seq":1,"yaw":0,"pitch":0,"state":0}',
    '{"t":"fire","seq":1e999,"slot":0,"yaw":0,"pitch":0,"hits":[{"id":1,"zone":"head","dist":1e999}]}', '{"t":"__proto__"}', '{"t":"hasOwnProperty"}',
    `{"t":"chat","text":"${'y'.repeat(MAX_MSG_BYTES)}"}`, '{"__proto__":{"t":"start"}}', '{"t":"join","code":{"toUpperCase":1}}']);
  return JSON.stringify(fuzzObject(rng, roomCode, kind === 1));
}

/** A message of a real type (unless `anyType`) with a random helping of fields of every awkward kind. */
function fuzzObject(rng: Rng, roomCode: string, anyType = false): Record<string, unknown> {
  const msg: Record<string, unknown> = { t: rng.pick(TYPES) };
  if (anyType) msg.t = nasty(rng);
  for (const f of FIELDS) if (rng.next() < 0.35) msg[f] = nasty(rng);
  if (msg.t === 'join' && rng.next() < 0.7) msg.code = roomCode;
  if (msg.t === 'hello' && rng.next() < 0.7) msg.v = PROTOCOL_VERSION;
  return msg;
}

/** Messages of the right shape (they pass the decoder) with values chosen to hurt. */
function hostile(rng: Rng, roomCode: string): ClientMsg {
  const n = (): number => rng.pick([0, -1, 1, 35, 999.999, -999, 0.001, 1e-9, 70, 34.5, 30.5, rng.next() * 70]);
  const i = (): number => rng.pick([0, 1, 2, 3, 4, 7, 2 ** 31, rng.int(0, 200)]);
  const s = (): string => rng.pick(['', ' ', 'ZZZZ', roomCode, '__proto__', 'constructor', 'd_mess_bunk', 'x'.repeat(48), '<b>hi</b>', '\u0007\u0000']);
  switch (rng.int(0, 17)) {
    case 0: return { t: 'create', name: s(), code: s() };
    case 1: return { t: 'join', code: rng.next() < 0.8 ? roomCode : s(), name: s() };
    case 2: return { t: 'leave' };
    case 3: return { t: 'ready', ready: rng.next() < 0.5 };
    case 4: return { t: 'start' };
    case 5: return { t: 'again' };
    case 6: case 7: return { t: 'move', seq: i(), x: n(), y: n(), z: n(), yaw: n(), pitch: n(), state: rng.int(0, 4) };
    case 8: return { t: 'fire', seq: i(), slot: rng.int(0, 7), yaw: n(), pitch: n(), aim: true, hits: Array.from({ length: rng.int(0, 64) }, () => ({ id: i(), zone: rng.pick(['head', 'torso', 'limb'] as const), dist: n() })) };
    case 9: return { t: 'reload' };
    case 10: return { t: 'swap', slot: rng.int(0, 7) };
    case 11: return { t: 'melee', hit: rng.next() < 0.5 ? i() : undefined };
    case 12: return { t: 'throw', kind: rng.pick(['frag', 'tactical'] as const), yaw: n(), pitch: n() };
    case 13: return { t: 'interact', id: s(), hold: rng.next() < 0.7 };
    case 14: return { t: 'revive', target: i(), hold: rng.next() < 0.7 };
    case 15: return { t: 'chat', text: s() };
    case 16: return { t: 'mark', x: n(), y: 0, z: n() };
    default: return { t: 'debug', cmd: 'give', points: 1e9 } as ClientMsg;
  }
}

describe('fuzz', () => {
  it('the decoder turns away every malformed frame and never throws', () => {
    const rng = new Rng(99);
    let passed = 0;
    for (let k = 0; k < 20_000; k++) {
      const m = decodeClient(fuzzFrame(rng, 'ABCD'));
      if (!m) continue;
      passed++;
      // Whatever got through has only finite numbers at the top level.
      for (const v of Object.values(m)) if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
    }
    expect(passed).toBeGreaterThan(100); // the fuzzer does produce some valid messages
    expect(decodeClient('{"t":"move","x":1e999,"z":0,"seq":1,"yaw":0,"pitch":0,"state":0}')).toBeNull();
    expect(decodeClient('{"t":"fire","seq":1,"slot":0,"yaw":0,"pitch":0,"hits":{"length":5}}')).toBeNull();
    expect(decodeClient('{"t":"toString"}')).toBeNull();
  });

  it('survives a storm of malformed, hostile and out-of-order messages while a game runs', () => {
    const ctx = setup();
    const rng = new Rng(1234);
    // Two honest players in a running game.
    const host = ctx.connect();
    host.say({ t: 'hello', v: PROTOCOL_VERSION, name: 'Host' });
    host.say({ t: 'create' });
    const code = host.peer.last('room')!.code;
    const mate = ctx.connect();
    mate.say({ t: 'hello', v: PROTOCOL_VERSION, name: 'Mate' });
    mate.say({ t: 'join', code });
    mate.say({ t: 'ready', ready: true });
    host.say({ t: 'start' });
    const room = ctx.lobby.rooms.get(code)!;
    expect(room.game).toBeTruthy();

    // One fuzzer sends rubbish and is thrown out over and over; two more say hello properly and
    // then send well-formed messages with hostile values, in and out of the honest players' room.
    let fuzzer = ctx.connect();
    const insiders = [ctx.connect(), ctx.connect()];
    for (const f of insiders) f.say({ t: 'hello', v: PROTOCOL_VERSION, name: 'Fuzz' });
    let kicks = 0;
    let inGame = 0;
    let games = 1;
    let seq = 0;
    for (let round = 0; round < 4000; round++) {
      ctx.advance(TICK_DT * 1000);
      for (let k = 0; k < 4; k++) {
        if (rng.next() < 0.8) fuzzer.link.receive(fuzzFrame(rng, code));
        else fuzzer.say({ t: 'hello', v: rng.next() < 0.9 ? PROTOCOL_VERSION : 3, name: 'Fuzz', token: rng.next() < 0.3 ? 'nope' : undefined });
        if (fuzzer.peer.kicked) {
          kicks++;
          fuzzer.link.close();
          fuzzer = ctx.connect();
        }
      }
      for (const f of insiders) {
        // Mostly game messages; now and then they walk out, open a room of their own, come back.
        let m = hostile(rng, code);
        while ((m.t === 'create' || m.t === 'leave') && rng.next() < 0.9) m = hostile(rng, code);
        f.say(m);
        // Past the decoder too: the handlers must hold on their own.
        if (rng.next() < 0.3) ctx.lobby.handle(f.link.session!, { ...fuzzObject(rng, code), ...(rng.next() < 0.9 ? { t: rng.pick(GAME_TYPES) } : {}) } as unknown as ClientMsg);
        expect(f.peer.kicked).toBeNull();
        if (room.game?.players.has(f.link.session!.id)) inGame++;
      }
      // The honest pair: stand still, and start again whenever the room is back in its lobby
      // (they do get eaten, and anyone may send `again`).
      const game = room.game;
      if (room.phase === 'lobby') {
        for (const f of insiders) if (f.link.session!.room === room) f.say({ t: 'ready', ready: true });
        mate.say({ t: 'ready', ready: true });
        host.say({ t: 'start' });
        if (room.game) games++;
        seq = 0;
      } else if (game && !game.over) {
        const me = game.players.get(host.link.session!.id)!;
        host.say({ t: 'move', seq: ++seq, x: me.x, y: me.y, z: me.z, yaw: 0, pitch: 0, state: 0 });
        game.step(TICK_DT);
      } else if (rng.next() < 0.01) host.say({ t: 'again' });
      if (round % 150 === 0) ctx.lobby.sweep();
    }

    expect(ctx.thrown).toEqual([]);
    expect(kicks).toBeGreaterThan(50);
    expect(inGame).toBeGreaterThan(500); // the hostile clients really were in the game
    expect(games).toBeGreaterThanOrEqual(1);
    expect(host.peer.kicked).toBeNull();
    expect(mate.peer.kicked).toBeNull();
    // The honest players are still in their room and still hearing from the game.
    expect(ctx.lobby.rooms.get(code)).toBe(room);
    expect(room.hostId).toBe(host.link.session!.id);
    expect(room.members.has(mate.link.session!.id)).toBe(true);
    expect(room.members.size).toBeLessThanOrEqual(4);
    expect(host.peer.last('snap')).toBeTruthy();
    // Nothing in the world went non-finite, and a non-debug server gave nothing away.
    for (const p of room.game?.players.values() ?? []) {
      for (const v of [p.x, p.z, p.yaw, p.pitch, p.hp, p.pub.points, p.budget]) expect(Number.isFinite(v)).toBe(true);
      expect(p.pub.points).toBeLessThan(1e6);
      expect(p.pub.name.length).toBeLessThanOrEqual(16);
    }
    for (const z of room.game?.zombies.values() ?? []) for (const v of [z.x, z.z, z.hp]) expect(Number.isFinite(v)).toBe(true);
    for (const f of insiders) f.link.close();
    fuzzer.link.close();
    // Rooms the fuzzer opened and abandoned are swept once their grace has run out.
    ctx.advance(120_000);
    ctx.lobby.sweep();
    ctx.lobby.sweep();
    expect(ctx.lobby.rooms.size).toBe(1);
  });

  it('rate limits: chat is refused politely, a flood gets the client dropped', () => {
    const ctx = setup();
    const a = ctx.connect();
    a.say({ t: 'hello', v: PROTOCOL_VERSION, name: 'A' });
    a.say({ t: 'create' });
    for (let k = 0; k < 10; k++) a.say({ t: 'chat', text: `line ${k}` });
    expect(a.peer.sent.filter((m) => m.t === 'chat')).toHaveLength(4);
    expect(a.peer.sent.filter((m) => m.t === 'error' && m.code === 'rate_limited')).toHaveLength(6);
    ctx.advance(3000);
    a.say({ t: 'chat', text: 'later' });
    expect(a.peer.last('chat')!.text).toBe('later');
    expect(a.peer.kicked).toBeNull();
    // 240 in the burst, then RATE_STRIKES more dropped, all in the same millisecond.
    for (let k = 0; k < 240 + RATE_STRIKES + 5 && !a.peer.kicked; k++) a.say({ t: 'reload' });
    expect(a.peer.kicked).toBe('rate_limited');
  });

  it('messages before hello, a wrong version and a second hello', () => {
    const ctx = setup();
    const early = ctx.connect();
    early.say({ t: 'start' });
    expect(early.peer.kicked).toBe('bad_message');
    const old = ctx.connect();
    old.say({ t: 'hello', v: PROTOCOL_VERSION - 1, name: 'Old' });
    expect(old.peer.kicked).toBe('version');
    const twice = ctx.connect();
    twice.say({ t: 'hello', v: PROTOCOL_VERSION, name: 'One' });
    const id = twice.link.session!.id;
    twice.say({ t: 'hello', v: PROTOCOL_VERSION, name: 'Two' });
    expect(twice.link.session!.id).toBe(id);
    expect(twice.peer.kicked).toBeNull();
    // In no room: game messages are refused, not crashed on.
    twice.say({ t: 'reload' });
    expect(twice.peer.last('error')!.code).toBe('not_in_room');
  });

  it('closes a lobby nobody has touched for half an hour, and tells its members why', () => {
    const ctx = setup();
    const a = ctx.connect();
    a.say({ t: 'hello', v: PROTOCOL_VERSION, name: 'A' });
    a.say({ t: 'create' });
    ctx.advance(29 * 60_000);
    ctx.lobby.sweep();
    expect(ctx.lobby.rooms.size).toBe(1);
    a.say({ t: 'ready', ready: true }); // any sign of life counts
    ctx.advance(29 * 60_000);
    ctx.lobby.sweep();
    expect(ctx.lobby.rooms.size).toBe(1);
    ctx.advance(2 * 60_000);
    ctx.lobby.sweep();
    expect(ctx.lobby.rooms.size).toBe(0);
    expect(a.peer.last('error')!.code).toBe('idle');
    expect(a.peer.last('left')).toBeTruthy();
    a.say({ t: 'create' }); // and they can open another
    expect(ctx.lobby.rooms.size).toBe(1);
  });
});
