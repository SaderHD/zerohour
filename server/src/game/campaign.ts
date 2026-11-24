import { MoveState, TICK_BUDGET_MS, TICK_DT, decodeClient, encode, type ClientMsg, type GameEvent, type ServerMsg } from '@zh/shared';
import { BotPlayer, type BotSkill } from '../bot';
import { Game } from './Game';
import { zombieCount } from './spawner';
import { idleFor } from './zombies';

// A whole game on a fake clock: bots play the real round loop (and the real economy) as fast as
// the machine can step it. `npm run campaign` reports on one; a short one runs in `npm test`.

export interface CampaignOpts {
  seed: number;
  players: number;
  /** Stop once this round has been cleared. */
  rounds: number;
  /** Nothing hurts the bots: for going far (performance, stuck zombies) rather than for balance. */
  god?: boolean;
  skill?: BotSkill;
  /** Give up after this much game time. */
  maxSeconds?: number;
  onRound?: (r: RoundReport) => void;
  /** Told what each bot was doing when it went down (for tuning the bots). */
  onDown?: (what: string) => void;
}

export interface RoundReport {
  round: number;
  special: boolean;
  zombies: number;
  /** How long the round took, and the game time it ended at. */
  seconds: number;
  endedAt: number;
  /** Each player's points when it ended, and what they carried. */
  points: number[];
  loadouts: string[];
  downs: number;
}

export interface CampaignResult {
  /** Last round cleared, and whether the team was wiped out after it. */
  cleared: number;
  over: boolean;
  seconds: number;
  rounds: RoundReport[];
  ticks: number;
  tickMs: number;
  tickMsMax: number;
  overBudget: number;
  peakAlive: number;
  /** Largest snapshot on the wire, in bytes, and how many zombies it carried. */
  snapBytes: number;
  snapZombies: number;
  evBytesPerSecond: number;
  worstIdle: number;
  worstIdleWhat: string;
  purchases: Record<string, number>;
  downs: number;
  revives: number;
  deaths: number;
  shots: number;
  corrections: number;
  /** Messages a bot sent that the wire checks refused (there should be none). */
  refused: number;
  game: Game;
}

export function runCampaign(opts: CampaignOpts): CampaignResult {
  let now = 100;
  const bots = new Map<number, BotPlayer>();
  const res: CampaignResult = {
    cleared: 0, over: false, seconds: 0, rounds: [], ticks: 0, tickMs: 0, tickMsMax: 0, overBudget: 0, peakAlive: 0, snapBytes: 0, snapZombies: 0,
    evBytesPerSecond: 0, worstIdle: 0, worstIdleWhat: '', purchases: {}, downs: 0, revives: 0, deaths: 0, shots: 0, corrections: 0, refused: 0,
    game: null as unknown as Game,
  };
  let roundBegan = 0;
  let roundDowns = 0;
  let special = false;
  let total = 0;
  let evBytes = 0;
  const onEvent = (ev: GameEvent): void => {
    if (ev.e === 'roundStart') {
      roundBegan = game.time;
      roundDowns = 0;
      special = ev.special;
      total = ev.total;
    } else if (ev.e === 'roundEnd') {
      const ps = [...game.players.values()];
      const report: RoundReport = {
        round: ev.round, special, zombies: total, seconds: game.time - roundBegan, endedAt: game.time, downs: roundDowns,
        points: ps.map((p) => p.pub.points),
        loadouts: ps.map((p) => (p.state === MoveState.Dead ? 'dead' : [...p.pub.weapons.map((w) => w.id + (w.upgraded ? '+' : '')), ...p.pub.perks.map((k) => k.slice(0, 4))].join(' '))),
      };
      res.rounds.push(report);
      res.cleared = ev.round;
      opts.onRound?.(report);
    } else if (ev.e === 'purchase') res.purchases[ev.what] = (res.purchases[ev.what] ?? 0) + 1;
    else if (ev.e === 'powerOn') res.purchases.power = 1;
    else if (ev.e === 'playerDowned') {
      const b = bots.get(ev.id);
      const p = game.players.get(ev.id);
      if (b && p && opts.onDown) {
        let close = 0;
        for (const z of game.zombies.values()) if (Math.hypot(z.x - p.x, z.z - p.z) < 3) close++;
        const w = p.stash?.weapons[p.stash.slot];
        opts.onDown(`${(b.intent?.goal ?? '').split(':')[0] || 'idle'} ${game.map.zoneAt(p.x, p.y, p.z)} ${w && w.mag > 0 ? 'loaded' : 'empty'} close${Math.min(close, 5)}`);
      }
      res.downs++;
      roundDowns++;
    } else if (ev.e === 'playerRevived') res.revives++;
    else if (ev.e === 'playerDied') res.deaths++;
  };
  const game = new Game(
    {
      send: (id: number, m: ServerMsg) => {
        if (m.t === 'snap' && id === 1) {
          const bytes = encode(m).length;
          if (bytes > res.snapBytes) {
            res.snapBytes = bytes;
            res.snapZombies = m.zombies.length;
          }
        }
        bots.get(id)?.onMessage(m);
      },
      broadcast: (m: ServerMsg) => {
        if (m.t === 'ev') {
          evBytes += encode(m).length;
          for (const ev of m.events) onEvent(ev);
        }
        for (const b of bots.values()) b.onMessage(m);
      },
    },
    { debug: false, seed: opts.seed, now: () => now },
  );
  res.game = game;
  for (let id = 1; id <= opts.players; id++) {
    // Everything a bot says goes through the same checks as a frame off a socket.
    const send = (m: ClientMsg): void => {
      const checked = decodeClient(encode(m));
      if (checked) game.onMessage(id, checked);
      else res.refused++;
    };
    const bot = new BotPlayer(id, opts.seed * 31 + id, send, opts.skill);
    bots.set(id, bot);
    const p = game.addPlayer(id, `Bot${id}`);
    p.god = opts.god === true;
  }
  for (const id of bots.keys()) bots.get(id)!.onMessage(game.syncFor(id));

  const limit = opts.maxSeconds ?? 6 * 3600;
  let tickMsTotal = 0;
  while (res.cleared < opts.rounds && !game.over && game.time < limit) {
    now += TICK_DT;
    for (const b of bots.values()) b.step(TICK_DT);
    const began = performance.now();
    game.step(TICK_DT);
    const ms = performance.now() - began;
    tickMsTotal += ms;
    res.tickMsMax = Math.max(res.tickMsMax, ms);
    if (ms > TICK_BUDGET_MS) res.overBudget++;
    res.ticks++;
    if (res.ticks % 15 !== 0) continue;
    res.peakAlive = Math.max(res.peakAlive, zombieCount(game));
    for (const z of game.zombies.values()) {
      const idle = idleFor(game, z);
      if (idle > res.worstIdle) {
        res.worstIdle = idle;
        res.worstIdleWhat = `zombie ${z.id} (${z.kind}) in state ${z.state} at (${z.x.toFixed(1)}, ${z.z.toFixed(1)}), round ${game.rounds.round}`;
      }
    }
  }
  res.over = game.over;
  res.seconds = game.time;
  res.tickMs = tickMsTotal / Math.max(1, res.ticks);
  res.evBytesPerSecond = evBytes / Math.max(1, game.time);
  for (const b of bots.values()) {
    res.shots += b.shots;
    res.corrections += b.corrections;
  }
  return res;
}
