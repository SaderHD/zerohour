// Field-level checks on what a client sends. `decodeClient` runs every frame through `checkClient`,
// so a handler only ever sees a message of the shape `ClientMsg` promises: numbers are finite and
// in a sane range, strings and lists are short, enums are one of their values. What the values
// *mean* (is that zombie alive, is that door for sale) is still each handler's business.
import type { ClientMsg } from './protocol';

/** Nothing in the world is further out than this (the map is 70 m across). */
const MAX_COORD = 1000;
const MAX_ANGLE = 1000;
const MAX_SEQ = 2 ** 31;
const MAX_ID_LENGTH = 48;
/** Raw text before it is sanitised and cut to its real limit. */
const MAX_TEXT = 512;
const MAX_HITS = 64;

type Rec = Record<string, unknown>;

const num = (v: unknown, lim: number): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim;
const int = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const bool = (v: unknown): v is boolean => typeof v === 'boolean';
const opt = <T>(v: unknown, ok: (v: unknown) => v is T): boolean => v === undefined || ok(v);
const text = (v: unknown): v is string => str(v, MAX_TEXT);
const id = (v: unknown): v is string => str(v, MAX_ID_LENGTH);
const entity = (v: unknown): v is number => int(v, 0, MAX_SEQ);
const ZONES: ReadonlySet<unknown> = new Set(['head', 'torso', 'limb']);

function hits(v: unknown): boolean {
  if (!Array.isArray(v) || v.length > MAX_HITS) return false;
  for (const h of v as unknown[]) {
    if (typeof h !== 'object' || h === null) return false;
    const r = h as Rec;
    if (!entity(r.id) || !ZONES.has(r.zone) || !num(r.dist, MAX_COORD)) return false;
  }
  return true;
}

const CHECKS: { [T in ClientMsg['t']]: (m: Rec) => boolean } = {
  hello: (m) => int(m.v, 0, 1e6) && opt(m.name, text) && opt(m.token, id),
  create: (m) => opt(m.name, text) && opt(m.code, id),
  join: (m) => id(m.code) && opt(m.name, text),
  leave: () => true,
  ready: (m) => bool(m.ready),
  start: () => true,
  again: () => true,
  move: (m) => int(m.seq, 0, MAX_SEQ) && num(m.x, MAX_COORD) && num(m.z, MAX_COORD) && num(m.yaw, MAX_ANGLE) && num(m.pitch, MAX_ANGLE) && int(m.state, 0, 4),
  fire: (m) => int(m.seq, 0, MAX_SEQ) && int(m.slot, 0, 7) && num(m.yaw, MAX_ANGLE) && num(m.pitch, MAX_ANGLE) && opt(m.aim, bool) && hits(m.hits),
  reload: () => true,
  swap: (m) => int(m.slot, 0, 7),
  melee: (m) => opt(m.hit, entity),
  throw: (m) => (m.kind === 'frag' || m.kind === 'tactical') && num(m.yaw, MAX_ANGLE) && num(m.pitch, MAX_ANGLE),
  interact: (m) => id(m.id) && bool(m.hold),
  revive: (m) => entity(m.target) && bool(m.hold),
  chat: (m) => text(m.text),
  mark: (m) => num(m.x, MAX_COORD) && num(m.z, MAX_COORD),
  ping: (m) => num(m.c, Number.MAX_VALUE),
  // Debug commands are only honoured by a debug server, and each checks its own arguments.
  debug: (m) => id(m.cmd),
};

/** Is this parsed JSON a well-formed client message? */
export function checkClient(v: unknown): v is ClientMsg {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const t = (v as Rec).t;
  if (typeof t !== 'string' || !Object.hasOwn(CHECKS, t)) return false;
  return CHECKS[t as ClientMsg['t']](v as Rec);
}
