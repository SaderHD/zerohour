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
