// A whole game played by bots on a fake clock, as fast as the machine will step it.
// Usage: npm run campaign -- [rounds=25] [--god] [--players=4] [--seed=1] [--runs=1] [--accuracy=0.75]
//   --god   nothing hurts the bots: the endurance run (fails on a stuck zombie or a slow tick)
//   without it the bots are mortal and the run is a balance report: how far a team gets.
import { SNAPSHOT_BUDGET_BYTES, TICK_BUDGET_MS } from '@zh/shared';
import { runCampaign } from '../server/src/game/campaign';

const args = process.argv.slice(2);
const flag = (name: string, fallback: number): number => Number(args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback);
const rounds = Number(args.find((a) => /^\d+$/.test(a)) ?? 25);
const god = args.includes('--god');
const players = flag('players', 4);
const runs = flag('runs', 1);
const accuracy = flag('accuracy', 0.75);
const IDLE_LIMIT = 10;
const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const failures: string[] = [];
const reached: number[] = [];
for (let run = 0; run < runs; run++) {
  const seed = flag('seed', 1) + run;
  const quiet = runs > 1;
  console.log(`[campaign] seed ${seed}: ${players} bot(s), to round ${rounds}${god ? ', god mode' : ''}, accuracy ${accuracy}`);
  const began = Date.now();
  const r = runCampaign({
    seed, players, rounds, god, skill: { accuracy, head: 0.2 },
    onRound: (o) => {
      if (quiet) return;
      console.log(
        `  round ${String(o.round).padStart(2)}${o.special ? ' (howlers)' : ''}: ${String(o.zombies).padStart(3)} in ${mmss(o.seconds).padStart(5)}, at ${mmss(o.endedAt).padStart(6)}; ` +
        `downs ${o.downs}; points ${o.points.join(' ')}; ${o.loadouts.join(' | ')}`,
      );
    },
  });
  reached.push(r.cleared);
  console.log(
    `[campaign] seed ${seed}: cleared ${r.cleared} round(s) in ${mmss(r.seconds)} of game time (${((Date.now() - began) / 1000).toFixed(0)} s real)${r.over ? ', then the team went down' : ''}; ` +
    `downs ${r.downs}, revives ${r.revives}, deaths ${r.deaths}; bought ${Object.entries(r.purchases).map(([k, n]) => `${k} ${n}`).join(', ') || 'nothing'}`,
  );
  console.log(
    `[campaign]   tick ${r.tickMs.toFixed(2)} ms avg, ${r.tickMsMax.toFixed(1)} ms max, ${r.overBudget}/${r.ticks} over ${TICK_BUDGET_MS} ms; peak ${r.peakAlive} alive; ` +
    `largest snapshot ${r.snapBytes} bytes (${r.snapZombies} zombies), events ${Math.round(r.evBytesPerSecond)} bytes/s; ` +
    `worst idle ${r.worstIdle.toFixed(1)} s (${r.worstIdleWhat || 'none'}); ${r.shots} shots, ${r.corrections} corrections, ${r.refused} refused`,
  );
  if (r.worstIdle >= IDLE_LIMIT) failures.push(`seed ${seed}: a zombie was idle for ${r.worstIdle.toFixed(1)} s: ${r.worstIdleWhat}`);
  if (r.tickMs >= TICK_BUDGET_MS) failures.push(`seed ${seed}: average tick ${r.tickMs.toFixed(2)} ms`);
  if (r.overBudget > r.ticks * 0.01) failures.push(`seed ${seed}: ${r.overBudget} ticks over ${TICK_BUDGET_MS} ms`);
  if (r.snapBytes > SNAPSHOT_BUDGET_BYTES) failures.push(`seed ${seed}: a snapshot of ${r.snapBytes} bytes`);
  if (r.refused > 0) failures.push(`seed ${seed}: ${r.refused} bot messages failed the wire checks`);
  if (god && r.cleared < rounds) failures.push(`seed ${seed}: only reached round ${r.cleared}`);
}
if (runs > 1) console.log(`[campaign] rounds cleared: ${reached.join(' ')} (median ${[...reached].sort((a, b) => a - b)[Math.floor(runs / 2)]})`);
for (const f of failures) console.error(`[campaign] FAILED: ${f}`);
process.exit(failures.length ? 1 : 0);
