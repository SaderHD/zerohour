// Multiplayer end-to-end test: two browser players + two bots in one room.
// Checks: lobby -> game, everyone sees everyone moving smoothly, shooting (exact dummy damage,
// remote shots, ammo), late join, reconnect restores the seat. Run `npm run build` first. Usage: npm run e2e
const { spawn } = require('node:child_process');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const port = 20080 + Math.floor(Math.random() * 900);
const base = `http://localhost:${port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = (page) => page.evaluate(() => window.__zh.state());
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

(async () => {
  const env = { ...process.env, PORT: String(port), ZH_DEBUG: '1' };
  const server = spawn('node', ['server/dist/index.js'], { cwd: root, env, stdio: 'inherit' });
  let browser;
  let bots;
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

    // 1. Menu -> lobby through the real UI.
    const a = await open('name=Ada&debug=1');
    await a.waitForFunction(() => window.__zh?.state().phase === 'menu');
    await a.click('#create');
    await a.waitForFunction(() => window.__zh.state().phase === 'lobby');
    const code = (await state(a)).room;
    assert(/^[A-Z]{4}$/.test(code), `bad room code ${code}`);

    const b = await open('name=Bea&debug=1');
    await b.waitForFunction(() => window.__zh?.state().phase === 'menu');
    await b.fill('#code', 'zzzz');
    await b.click('#join');
    await b.waitForFunction(() => document.getElementById('menu-error').textContent.includes('No room'));
    await b.fill('#code', code.toLowerCase());
    await b.click('#join');
    await b.waitForFunction(() => window.__zh.state().phase === 'lobby');
    assert(await a.isDisabled('#start'), 'start should be disabled until everyone is ready');
    mkdirSync(path.join(root, 'test-results'), { recursive: true });
    await a.screenshot({ path: path.join(root, 'test-results/mp-lobby.png') });
    await b.click('#ready');

    // 2. Two bots join and ready up; host starts.
    bots = spawn('npx', ['tsx', 'server/src/bot.ts', code, '2', `ws://localhost:${port}/ws`], { cwd: root, env, stdio: 'inherit' });
    await a.waitForFunction(() => document.querySelectorAll('#lobby-players li').length === 4);
    await a.waitForFunction(() => !document.getElementById('start').disabled);
    await a.click('#start');
    for (const p of [a, b]) await p.waitForFunction(() => window.__zh.state().phase === 'playing');
    await a.evaluate(() => window.__zh.rounds(false)); // this test is about players; scripts/rounds.cjs covers the round loop

    // 3. Everyone sees the three others.
    for (const p of [a, b]) await p.waitForFunction(() => window.__zh.state().remotes.filter((r) => r.visible).length === 3);

    // 4. Smoothness: sample a bot's drawn position every frame for 2 s. With 15 Hz snapshots
    //    and interpolation the per-frame step must stay small (no 0.3 m snapshot-sized jumps).
    const motion = await a.evaluate(() => new Promise((resolve) => {
      const id = window.__zh.state().remotes.find((r) => r.name.startsWith('Bot')).id;
      const pts = [];
      const t0 = performance.now();
      const tick = () => {
        const r = window.__zh.state().remotes.find((r) => r.id === id);
        pts.push([performance.now(), r.x, r.z]);
        if (performance.now() - t0 < 2000) requestAnimationFrame(tick);
        else resolve(pts);
      };
      // Start on a frame boundary: a first sample taken between frames pairs a stale position with a
      // short interval and reads as a jump.
      requestAnimationFrame(tick);
    }));
    let travelled = 0;
    let worst = 0;
    for (let i = 1; i < motion.length; i++) {
      const dtMs = motion[i][0] - motion[i - 1][0];
      if (dtMs < 4) continue; // two samples in one frame
      const d = Math.hypot(motion[i][1] - motion[i - 1][1], motion[i][2] - motion[i - 1][2]);
      travelled += d;
      worst = Math.max(worst, d / Math.max(dtMs, 1) * 1000); // drawn speed, m/s
    }
    if (process.env.MP_TRACE) console.log(motion.map((m, i) => i ? `${(m[0] - motion[i - 1][0]).toFixed(1)}ms ${Math.hypot(m[1] - motion[i - 1][1], m[2] - motion[i - 1][2]).toFixed(3)}m` : '').join(' | '));
    assert(travelled > 1, `bot barely moved (${travelled.toFixed(2)} m)`);
    assert(worst < 9, `remote motion not smooth: peak drawn speed ${worst.toFixed(1)} m/s (walk is 4.5)`);

    // 5. B walks; A sees B at B's position (within interpolation lag).
    await b.evaluate(() => { window.__zh.look(Math.PI / 2, 0); window.__zh.key('KeyW', true); });
    await sleep(900);
    await b.evaluate(() => window.__zh.key('KeyW', false));
    await sleep(500);
    const bs = await state(b);
    const seen = (await state(a)).remotes.find((r) => r.name === 'Bea');
    assert(Math.hypot(seen.x - bs.x, seen.z - bs.z) < 0.15, `A sees Bea at ${seen.x},${seen.z} but she is at ${bs.x},${bs.z}`);
    assert(bs.corrections === 0, `legit walking was corrected ${bs.corrections} times`);

    // Screenshot: A looks at the group.
    await a.evaluate(() => { window.__zh.teleport(34.5, 30.5, 0.95); window.__zh.look(0.95, -0.08); });
    await b.evaluate(() => { window.__zh.teleport(30, 27.5, 0); window.__zh.look(-2.2, 0); });
    await sleep(600);
    await a.screenshot({ path: path.join(root, 'test-results/mp-players.png') });

    // 5b. Combat: A shoots a target dummy (exact body and head damage), B sees A's shots,
    //     then B sprays an SMG and A sees the weapon change and the shots.
    await a.evaluate(() => window.__zh.dummy(31, 24));
    for (const p of [a, b]) await p.waitForFunction(() => window.__zh.state().entities.length === 1);
    const shootAt = async (page, y, shotsAfter) => {
      await page.evaluate((y) => { const e = window.__zh.state().entities[0]; window.__zh.key('Mouse2', true); window.__zh.lookAt(e.x, y, e.z); }, y);
      await sleep(450); // sights up, spread settled
      await page.evaluate(() => window.__zh.press('Mouse0'));
      await page.waitForFunction((n) => window.__zh.state().hits.length === n, shotsAfter);
    };
    await shootAt(a, 1.1, 1);
    await shootAt(a, 1.6, 2);
    await a.evaluate(() => window.__zh.key('Mouse2', false));
    const sa = await state(a);
    assert(sa.hits[0].zone === 'torso' && sa.hits[0].dmg === 30, `body shot should deal 30, got ${JSON.stringify(sa.hits[0])}`);
    assert(sa.hits[1].zone === 'head' && sa.hits[1].dmg === 75, `head shot should deal 75, got ${JSON.stringify(sa.hits[1])}`);
    assert(sa.mag === 6 && sa.shots === 2, `expected 6 rounds left after 2 shots, got ${sa.mag}`);
    await b.waitForFunction(() => window.__zh.state().remotes.find((r) => r.name === 'Ada').shots === 2);
    await b.waitForFunction(() => Math.abs(window.__zh.state().entities[0].hp - 0.895) < 0.002);
    assert((await state(b)).remotes.find((r) => r.name === 'Ada').weapon === 'warden', 'B should see A holding the pistol');

    await b.evaluate(() => window.__zh.give('stitch'));
    await a.waitForFunction(() => window.__zh.state().remotes.find((r) => r.name === 'Bea').weapon === 'stitch');
    await a.evaluate(() => window.__zh.lookAt(30, 1.2, 27.5));
    await b.evaluate(() => { window.__zh.lookAt(33.5, 1.4, 27); window.__zh.key('Mouse0', true); });
    await a.waitForFunction(() => window.__zh.state().remotes.find((r) => r.name === 'Bea').shots >= 6);
    await a.screenshot({ path: path.join(root, 'test-results/mp-shooting.png') });
    await b.evaluate(() => window.__zh.key('Mouse0', false));
    await sleep(300);
    const sb = await state(b);
    const seenShots = (await state(a)).remotes.find((r) => r.name === 'Bea').shots;
    assert(seenShots === sb.shots, `A saw ${seenShots} of Bea's ${sb.shots} shots`);
    assert(sb.mag === 30 - sb.shots, `Bea's magazine should be ${30 - sb.shots}, is ${sb.mag}`);
    // Reload tops the magazine up from the reserve, and the server agrees once it settles.
    await b.evaluate(() => window.__zh.press('KeyR'));
    await b.waitForFunction(() => window.__zh.state().reloading);
    await b.waitForFunction(() => !window.__zh.state().reloading && window.__zh.state().mag === 30, null, { timeout: 5000 });
    await sleep(900);
    const sr = await state(b);
    assert(sr.mag === 30 && sr.reserve === 150 - sb.shots, `after reload expected 30 / ${150 - sb.shots}, got ${sr.mag} / ${sr.reserve}`);

    // 6. Reconnect: B's connection drops; same seat and position come back.
    const idBefore = bs.playerId;
    const posBefore = await state(b);
    await b.evaluate(() => window.__zh.dropConnection());
    await a.waitForFunction(() => window.__zh.state().remotes.some((r) => r.name === 'Bea' && !r.connected));
    await b.waitForFunction(() => window.__zh.state().phase === 'playing' && window.__zh.state().connected, null, { timeout: 8000 });
    const after = await state(b);
    assert(after.playerId === idBefore, `reconnect changed player id ${idBefore} -> ${after.playerId}`);
    assert(Math.hypot(after.x - posBefore.x, after.z - posBefore.z) < 0.5, 'reconnect moved the player');
    await a.waitForFunction(() => window.__zh.state().remotes.some((r) => r.name === 'Bea' && r.connected));
    assert((await state(b)).remotes.length === 3, 'reconnected client lost the roster');

    // 7. A full page reload also resumes the seat (token is kept per tab).
    await b.reload();
    await b.waitForFunction(() => window.__zh?.state().phase === 'playing', null, { timeout: 8000 });
    assert((await state(b)).playerId === idBefore, 'reload did not resume the seat');

    // 8. A fifth player is turned away.
    const c = await open(`name=Cy&room=${code}`);
    await c.waitForFunction(() => document.getElementById('menu-error').textContent.includes('full'));

    assert(errors.length === 0, `page errors:\n${errors.join('\n')}`);
    console.log(`[e2e] ok — room ${code}, bot travelled ${travelled.toFixed(1)} m, peak drawn speed ${worst.toFixed(1)} m/s over ${motion.length} frames`);
  } catch (e) {
    console.error('[e2e] FAILED:', e.message);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    bots?.kill('SIGINT');
    server.kill('SIGTERM');
  }
})();
