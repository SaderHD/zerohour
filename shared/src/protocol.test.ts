import { describe, expect, it } from 'vitest';
import { MAX_MSG_BYTES, PROTOCOL_VERSION } from './constants';
import { decodeClient, decodeServer, encode, sanitizeText } from './protocol';

describe('protocol', () => {
  it('round-trips a client message', () => {
    const raw = encode({ t: 'hello', v: PROTOCOL_VERSION, name: 'Ada' });
    expect(decodeClient(raw)).toEqual({ t: 'hello', v: PROTOCOL_VERSION, name: 'Ada' });
  });

  it('rejects junk from clients', () => {
    for (const bad of ['', 'nope', '[]', 'null', '42', '{}', '{"t":5}', '{"t":"welcome"}', '{"t":"__proto__"}']) {
      expect(decodeClient(bad)).toBeNull();
    }
    expect(decodeClient(`{"t":"chat","text":"${'x'.repeat(MAX_MSG_BYTES)}"}`)).toBeNull();
  });

  it('rejects client messages whose fields are missing, mistyped or out of range', () => {
    const ok = { t: 'move', seq: 1, x: 3, y: 0, z: 4, yaw: 0, pitch: 0, state: 1 };
    expect(decodeClient(JSON.stringify(ok))).toEqual(ok);
    for (const bad of [{ x: '3' }, { x: null }, { seq: -1 }, { seq: 1.5 }, { state: 9 }, { yaw: 1e9 }, { z: 5000 }]) {
      expect(decodeClient(JSON.stringify({ ...ok, ...bad }))).toBeNull();
    }
    expect(decodeClient('{"t":"move","seq":1,"x":1e999,"z":4,"yaw":0,"pitch":0,"state":1}')).toBeNull(); // Infinity
    expect(decodeClient('{"t":"move","seq":1}')).toBeNull();
    const fire = { t: 'fire', seq: 1, slot: 0, yaw: 0, pitch: 0, aim: true, hits: [{ id: 2, zone: 'head', dist: 3 }] };
    expect(decodeClient(JSON.stringify(fire))).toEqual(fire);
    expect(decodeClient(JSON.stringify({ ...fire, hits: [{ id: 2, zone: 'hat', dist: 3 }] }))).toBeNull();
    expect(decodeClient(JSON.stringify({ ...fire, hits: Array.from({ length: 65 }, () => fire.hits[0]) }))).toBeNull();
    expect(decodeClient(JSON.stringify({ ...fire, hits: 'all of them' }))).toBeNull();
    expect(decodeClient('{"t":"ready"}')).toBeNull();
    expect(decodeClient('{"t":"interact","id":7,"hold":true}')).toBeNull();
    expect(decodeClient('{"t":"throw","kind":"anvil","yaw":0,"pitch":0}')).toBeNull();
    expect(decodeClient('{"t":"hello","v":8,"token":{"a":1}}')).toBeNull();
    expect(decodeClient('{"t":"reload","extra":"ignored"}')).toEqual({ t: 'reload', extra: 'ignored' });
  });

  it('decodes server frames without throwing', () => {
    expect(decodeServer('{"t":"pong","c":1,"time":2}')).toEqual({ t: 'pong', c: 1, time: 2 });
    expect(decodeServer('{bad')).toBeNull();
    expect(decodeServer('null')).toBeNull();
  });

  it('sanitizes text', () => {
    expect(sanitizeText('  a\n\tb\u0000  c ', 16)).toBe('a b c');
    expect(sanitizeText('abcdef', 3)).toBe('abc');
    expect(sanitizeText(42, 3)).toBe('');
  });
});
