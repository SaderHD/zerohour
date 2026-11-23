// Round loop in real browsers: boots the built server and plays through the session 6 features —
// round 1 on the HUD, points for hits and kills, the next round, a late joiner sitting out, a
// down and a two-player revive, the scoreboard, game over and the way back to the lobby.
// Screenshots go to test-results/rounds-*.png. Usage: npm run build && npm run rounds
const { spawn } = require('node:child_process');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const port = 23080 + Math.floor(Math.random() * 900);
const base = `http://localhost:${port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const state = (page) => page.evaluate(() => window.__zh.state());
const S = { Chase: 3, Attack: 4 };
const DOWNED = 3; // MoveState

(async () => {
  const env = { ...process.env, PORT: String(port), ZH_DEBUG: '1' };
  const server = spawn('node', ['server/dist/index.js'], { cwd: root, env, stdio: 'inherit' });
  let browser;
  try {
    for (let i = 0; i < 50; i++) {
      try { if ((await fetch(`${base}/healthz`)).ok) break; } catch {}
      await sleep(100);
    }
    browser = await chromium.launch();
    const errors = [];
    const open = async (query) => {
      const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(`${base}/?${query}`);
      return page;
    };
    mkdirSync(path.join(root, 'test-results'), { recursive: true });
    const shot = (page, name) => page.screenshot({ path: path.join(root, `test-results/rounds-${name}.png`) });
    const until = async (what, fn, timeout = 30000) => {
      const t0 = Date.now();
      for (;;) {
        const v = await fn();
        if (v) return v;
        if (Date.now() - t0 > timeout) throw new Error(`timed out waiting for ${what}`);
        await sleep(100);
      }
    };

    // 1. Solo: round 1 starts by itself; 6 zombies, 500 points.
    const a = await open('name=Ada&debug=1&room=RNDS&autostart=1');
    await a.waitForFunction(() => window.__zh?.state().phase === 'playing', null, { timeout: 15000 });
    await a.evaluate(() => window.__zh.god(true));
    await until('round 1', async () => (await state(a)).round === 1, 15000);
    await sleep(400);
    await shot(a, 'start');
    let sa = await state(a);
    assert(sa.zombiesLeft === 6 && sa.points === 500 && sa.roundPhase === 'active', `round 1: ${sa.zombiesLeft} zombies, ${sa.points} points`);
    assert(await a.evaluate(() => document.getElementById('round').textContent) === '1', 'the HUD should show round 1');

    // 2. Points: wait for one to climb in, then a body shot (+10) and shots until it dies (+60 or +100).
    await a.evaluate(() => window.__zh.teleport(30, 29.5, 0));
    const target = await until('a zombie inside', async () => (await state(a)).entities.find((e) => e.kind === 'zombie' && e.state >= S.Chase), 60000);
    const aimAt = async (y) => {
      await a.evaluate(([id, y]) => { const e = window.__zh.state().entities.find((e) => e.id === id); if (e) { window.__zh.key('Mouse2', true); window.__zh.lookAt(e.x, y, e.z); } }, [target.id, y]);
      await sleep(380);
    };
    await aimAt(1.2);
    await a.evaluate(() => window.__zh.press('Mouse0'));
    await until('+10 for a hit', async () => (await state(a)).points === 510, 4000);
    await shot(a, 'points');
    const killsBefore = (await state(a)).kills;
    for (let i = 0; i < 10 && (await state(a)).kills === killsBefore; i++) {
      await aimAt(1.2);
      await a.evaluate(() => window.__zh.press('Mouse0'));
      await sleep(250);
    }
    await a.evaluate(() => window.__zh.key('Mouse2', false));
    sa = await state(a);
    const mine = sa.hits.filter((h) => h.id === target.id && h.by === sa.playerId);
    const lastZone = mine.at(-1).zone;
    const expected = 500 + 10 * (mine.length - 1) + (lastZone === 'head' ? 100 : 60);
    assert(sa.kills > killsBefore, 'the zombie should have died');
    assert(sa.points === expected, `after ${mine.length} hits (last to the ${lastZone}) expected ${expected} points, got ${sa.points}`);
    assert(sa.roster[0].kills === 1 && sa.zombiesLeft === 5, `scoreboard: ${JSON.stringify(sa.roster[0])}, ${sa.zombiesLeft} left`);

    // 3. Bea joins mid-round: she watches until the next round starts.
    const b = await open('name=Bea&debug=1&room=RNDS&autostart=1');
    await b.waitForFunction(() => window.__zh?.state().phase === 'playing', null, { timeout: 15000 });
    await until('Bea sitting out', async () => (await state(b)).life === 'dead', 5000);
    await sleep(600);
    await shot(b, 'spectate');
    assert((await state(a)).remotes.find((r) => r.name === 'Bea').visible === false, 'a player sitting out should not be drawn');

    // 4. Round 1 ends when the last zombie falls; round 2 follows the intermission with Bea in it.
    await a.evaluate(() => window.__zh.killZombies());
    await until('round 1 over', async () => (await state(a)).roundPhase === 'intermission', 5000);
    const t0 = Date.now();
    await until('round 2', async () => (await state(a)).round === 2, 15000);
    assert(Date.now() - t0 > 8000, `intermission was only ${Date.now() - t0} ms`);
    await sleep(300);
    await shot(a, 'round2');
    const sb = await until('Bea in the game', async () => { const s = await state(b); return s.life === 'alive' && s; }, 3000);
    assert(sb.points === 1500 && sb.zone === 'mess', `Bea should spawn in the mess hall with 1500, got ${sb.points} in ${sb.zone}`);
    assert((await state(a)).zombiesLeft === 12, `round 2 for two players is 12 zombies, got ${(await state(a)).zombiesLeft}`);
    assert((await state(a)).grenades === 3, 'a new round refills one grenade');

    // 5. A down and a revive. The round loop is stopped so nothing else interferes.
    await a.evaluate(() => window.__zh.rounds(false));
    await until('an empty map', async () => (await state(a)).entities.length === 0, 5000);
    await b.evaluate(() => { window.__zh.give('stitch'); window.__zh.give(600); window.__zh.teleport(31, 28, 0); });
    await a.evaluate(() => window.__zh.teleport(26, 29, 0));
    await sleep(400);
    await b.evaluate(() => window.__zh.spawnZombies(2, { x: 31, z: 25.5, speed: 4.8 }));
    await until('Bea down', async () => (await state(b)).life === 'downed', 15000);
    await a.evaluate(() => window.__zh.killZombies());
    const down = await state(b);
    assert(down.points === 2100 - 110 && down.weapons.join() === 'warden', `downed: ${down.points} points, holding ${down.weapons}`);
    await b.evaluate(() => { window.__zh.key('KeyW', true); });
    await sleep(600);
    await b.evaluate(() => window.__zh.key('KeyW', false));
    const still = await state(b);
    assert(Math.hypot(still.x - down.x, still.z - down.z) < 0.05, 'a downed player should not be able to move');
    await shot(b, 'downed');
    await until('Ada seeing Bea down', async () => (await state(a)).remotes.find((r) => r.name === 'Bea').state === DOWNED, 3000);
    await a.evaluate(() => window.__zh.lookAt(31, 0.4, 28));
    await sleep(500);
    await shot(a, 'teammate-down');
    await a.evaluate(() => { window.__zh.teleport(30, 29.2, 0); window.__zh.lookAt(31, 0.3, 28); });
    await until('the revive prompt', async () => (await state(a)).prompt.includes('revive Bea'), 3000);
    await a.evaluate(() => window.__zh.key('KeyF', true));
    await sleep(1500);
    await shot(a, 'reviving');
    await shot(b, 'being-revived');
    assert((await state(b)).life === 'downed', 'a revive takes 3 s');
    await until('Bea back up', async () => (await state(b)).life === 'alive', 4000);
    await a.evaluate(() => window.__zh.key('KeyF', false));
    await sleep(300);
    sa = await state(a);
    const up = await state(b);
    const adaRow = sa.roster.find((r) => r.name === 'Ada');
    assert(adaRow.revives === 1 && sa.points === expected + 100, `Ada should have a revive and +100: ${JSON.stringify(adaRow)}`);
    assert(up.weapons.join() === 'warden,stitch' && up.hp === 100, `revived with ${up.weapons} at ${up.hp} hp`);
    assert(up.roster.find((r) => r.name === 'Bea').downs === 1, 'the down should be on the scoreboard');
    await a.evaluate(() => window.__zh.key('Tab', true));
    await sleep(200);
    await shot(a, 'scoreboard');
    assert(await a.evaluate(() => window.getComputedStyle(document.getElementById('scoreboard')).display === 'block' && document.querySelectorAll('#scoreboard tr').length === 3), 'Tab should show both players');
    await a.evaluate(() => window.__zh.key('Tab', false));

    // 6. Everyone down: game over, results, back to the lobby.
    await a.evaluate(() => { window.__zh.god(false); window.__zh.teleport(30, 28, 0); });
    await sleep(300);
    await a.evaluate(() => window.__zh.spawnZombies(6, { x: 30.5, z: 25.5, speed: 4.8 }));
    for (const p of [a, b]) await until('game over', async () => (await state(p)).over, 30000);
    await sleep(300);
    await shot(a, 'gameover');
    assert(await a.evaluate(() => window.getComputedStyle(document.getElementById('results')).display === 'flex'), 'the results screen should be up');
    assert((await a.textContent('#results-sub')).includes('round 2'), `results: ${await a.textContent('#results-sub')}`);
    await b.click('#again');
    // (Both pages run with ?autostart, so the lobby starts a fresh game at once.)
    for (const p of [a, b]) await p.waitForFunction(() => { const s = window.__zh.state(); return !s.over && (s.phase === 'lobby' || (s.phase === 'playing' && s.round < 2 && s.points === 500 && s.life === 'alive')); }, null, { timeout: 8000 });
    assert(await a.evaluate(() => window.getComputedStyle(document.getElementById('results')).display === 'none'), 'the results screen should close');

    assert(errors.length === 0, `page errors:\n${errors.join('\n')}`);
    console.log('[rounds] ok');
  } catch (e) {
    console.error('[rounds] FAILED:', e.message);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    server.kill('SIGTERM');
  }
})();
