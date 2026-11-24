// Session 14 acceptance: a fresh clone, `npm ci && npm run build && npm start` (a production
// server: no debug commands), then four browser players - the autopilot at the controls of each,
// pressing the same keys a person would - must clear ten rounds with nothing in the browser
// consoles or the server's log that looks like an error.
// Usage: npm run ship [-- --here] [--rounds=10]
//   --here   skip the clone and the install: use this checkout (run `npm run build` first)
// Writes test-results/ship-*.png. The clone is of the last commit: commit before you run it.
const { spawn, execFileSync } = require('node:child_process');
const { mkdirSync, mkdtempSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const here = args.includes('--here');
const rounds = Number(args.find((a) => a.startsWith('--rounds='))?.split('=')[1] ?? 10);
const port = 21080 + Math.floor(Math.random() * 900);
const base = `http://localhost:${port}`;
const PLAYERS = 4;
const TIMEOUT_MIN = 45;
const DRAW_CALL_BUDGET = 150;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = (page) => page.evaluate(() => window.__zh.state());
const mmss = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
const BAD = /error|uncaught|unhandled|failed|exception/i;

(async () => {
  let dir = root;
  let server;
  let browser;
  let failed = false;
  try {
    if (!here) {
      dir = mkdtempSync(path.join(os.tmpdir(), 'zerohour-ship-'));
      const run = (cmd, a) => execFileSync(cmd, a, { cwd: dir, stdio: 'inherit' });
      console.log(`[ship] fresh clone into ${dir}`);
      execFileSync('git', ['clone', '--quiet', '--depth', '1', `file://${root}`, dir], { stdio: 'inherit' });
      run('npm', ['ci', '--no-audit', '--no-fund']);
      run('npm', ['run', 'build']);
    }
    const serverLog = [];
    const env = { ...process.env, PORT: String(port) };
    delete env.ZH_DEBUG;
    server = spawn('npm', ['start'], { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const keep = (stream, err) => stream.on('data', (d) => {
      for (const line of String(d).split('\n')) if (line.trim()) serverLog.push({ line, err });
    });
    keep(server.stdout, false);
    keep(server.stderr, true);
    for (let i = 0; ; i++) {
      try { if ((await fetch(`${base}/healthz`)).ok) break; } catch {}
      if (i > 100) throw new Error('the server did not come up');
      await sleep(100);
    }

    browser = await chromium.launch();
    const problems = [];
    const pages = [];
    const open = async (query, name) => {
      const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => problems.push(`${name}: ${e}`));
      page.on('console', (m) => {
        // The software GL driver grumbles when a screenshot reads the frame back; that is ours, not the game's.
        if ((m.type() === 'error' || m.type() === 'warning') && !/GL Driver Message.*ReadPixels/.test(m.text())) problems.push(`${name} console ${m.type()}: ${m.text()}`);
      });
      await page.goto(`${base}/?${query}`);
      pages.push(page);
      return page;
    };
    const host = await open('name=P1&auto=1', 'P1');
    await host.waitForFunction(() => window.__zh?.state().phase === 'menu');
    await host.click('#create');
    await host.waitForFunction(() => window.__zh.state().phase === 'lobby');
    const code = (await state(host)).room;
    for (let i = 2; i <= PLAYERS; i++) {
      const p = await open(`room=${code}&name=P${i}&auto=1`, `P${i}`);
      await p.waitForFunction(() => window.__zh?.state().phase === 'lobby');
      await p.click('#ready');
    }
    await host.waitForFunction((n) => document.querySelectorAll('#lobby-players .mark.ok').length === n, PLAYERS);
    await host.click('#start');
    for (const p of pages) await p.waitForFunction(() => window.__zh.state().phase === 'playing');
    console.log(`[ship] room ${code}: ${PLAYERS} players in, the autopilot at the controls; going for ${rounds} rounds`);

    mkdirSync(path.join(root, 'test-results'), { recursive: true });
    const began = Date.now();
    let seen = 0;
    let maxCalls = 0;
    let minFps = Infinity;
    const shots = new Set();
    for (;;) {
      await sleep(2000);
      const all = await Promise.all(pages.map(state));
      const s = all[0];
      for (const a of all) {
        maxCalls = Math.max(maxCalls, a.drawCalls);
        if (a.fps > 0) minFps = Math.min(minFps, a.fps);
      }
      if (s.round !== seen) {
        seen = s.round;
        console.log(
          `[ship] ${mmss(Date.now() - began)} round ${s.round}: ` +
          all.map((a) => `${a.life === 'alive' ? '' : `${a.life} `}${a.points} ${a.weapons.map((w, i) => w + (a.upgraded[i] ? '+' : '')).join('/')}${a.perks.length ? ` +${a.perks.length}` : ''}`).join(' | ') +
          ` (${all.map((a) => a.fps).join('/')} fps, ${maxCalls} calls at most)`,
        );
      }
      // A picture from the thick of a few rounds.
      if ([1, Math.ceil(rounds / 2), rounds].includes(s.round) && !shots.has(s.round) && s.entities.length >= 6) {
        shots.add(s.round);
        const who = all.findIndex((a) => a.life === 'alive');
        await pages[Math.max(0, who)].screenshot({ path: path.join(root, `test-results/ship-round-${s.round}.png`) });
      }
      if (all.some((a) => a.over)) throw new Error(`the team went down in round ${s.round}, after ${mmss(Date.now() - began)}`);
      if (all.some((a) => a.phase !== 'playing' || a.net !== 'ok')) throw new Error(`a player fell out of the game: ${all.map((a) => `${a.phase}/${a.net}`).join(' ')}`);
      if (s.round > rounds) break;
      if (Date.now() - began > TIMEOUT_MIN * 60000) throw new Error(`still in round ${s.round} after ${TIMEOUT_MIN} minutes`);
    }
    await pages[0].screenshot({ path: path.join(root, 'test-results/ship-done.png') });
    const roster = (await state(host)).roster;
    console.log(`[ship] ${rounds} rounds cleared in ${mmss(Date.now() - began)}: ${roster.map((r) => `${r.name} ${r.kills} kills, ${r.downs} downs, ${r.revives} revives`).join('; ')}`);
    console.log(`[ship] most draw calls in a frame ${maxCalls}; lowest frame rate ${minFps} fps (headless, software rendering)`);

    const serverBad = serverLog.filter((l) => l.err || BAD.test(l.line));
    for (const p of problems) console.error(`[ship] browser: ${p}`);
    for (const l of serverBad) console.error(`[ship] server: ${l.line}`);
    if (problems.length) throw new Error(`${problems.length} error(s) in the browser consoles`);
    if (serverBad.length) throw new Error(`${serverBad.length} error line(s) in the server log`);
    if (maxCalls >= DRAW_CALL_BUDGET) throw new Error(`${maxCalls} draw calls in a frame (the budget is ${DRAW_CALL_BUDGET})`);
    console.log(`[ship] OK: nothing in ${PLAYERS} browser consoles, ${serverLog.length} server log line(s) and none of them an error`);
  } catch (err) {
    failed = true;
    console.error(`[ship] FAILED: ${err.message}`);
  } finally {
    await browser?.close();
    server?.kill('SIGTERM');
    if (!here && dir !== root) rmSync(dir, { recursive: true, force: true });
  }
  process.exit(failed ? 1 : 0);
})();
