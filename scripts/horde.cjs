// Zombie check in a real browser: boots the built server, plays a solo debug game and walks
// through the session 5 features — window tear-down, vault, chase, damage and regen, rebuild,
// shooting zombies, a crawler, then a 32-strong horde with three bots for the frame-rate numbers.
// Screenshots go to test-results/horde-*.png. Usage: npm run build && npm run horde
const { spawn } = require('node:child_process');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const port = 22080 + Math.floor(Math.random() * 900);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
// ZombieState values (shared/src/protocol.ts)
const S = { Approach: 0, Tear: 1, Vault: 2, Chase: 3, Attack: 4, Crawl: 5, CrawlAttack: 8 };

(async () => {
  const env = { ...process.env, PORT: String(port), ZH_DEBUG: '1' };
  const server = spawn('node', ['server/dist/index.js'], { cwd: root, env, stdio: 'inherit' });
  let browser;
  let bots;
  try {
    for (let i = 0; i < 50; i++) {
      try { if ((await fetch(`http://localhost:${port}/healthz`)).ok) break; } catch {}
      await sleep(100);
    }
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`http://localhost:${port}/?name=Ada&debug=1&room=HRDE&autostart=1`);
    await page.waitForFunction(() => window.__zh?.state().phase === 'playing', null, { timeout: 15000 });
    mkdirSync(path.join(root, 'test-results'), { recursive: true });
    const state = () => page.evaluate(() => window.__zh.state());
    const shot = (name) => page.screenshot({ path: path.join(root, `test-results/horde-${name}.png`) });
    const zombies = async () => (await state()).entities.filter((e) => e.kind === 'zombie');
    // Inside standing spots for the mess hall's windows, and a point outside each to look at.
    const WINDOWS = { w_mess_n1: [28.2, 24.6, 26.75, 21.2], w_mess_n2: [31.3, 24.6, 32.75, 21.2], w_mess_e: [33.6, 27.4, 37.3, 26.75] };
    const watch = async (id) => {
      await page.evaluate(([x, z, lx, lz]) => { window.__zh.teleport(x, z, 0); window.__zh.lookAt(lx, 1.45, lz); }, WINDOWS[id]);
      await sleep(250);
    };
    const until = async (what, fn, timeout = 30000) => {
      const t0 = Date.now();
      for (;;) {
        const v = await fn();
        if (v) return v;
        if (Date.now() - t0 > timeout) throw new Error(`timed out waiting for ${what}`);
        await sleep(100);
      }
    };

    // 1. Zombies arrive at the mess hall's windows and tear the planks off.
    await page.evaluate(() => { window.__zh.rounds(false); window.__zh.god(true); window.__zh.spawnZombies(6, { interval: 0.4, speed: 2.2 }); });
    await until('a zombie tearing planks', async () => (await zombies()).some((z) => z.state === S.Tear));
    const first = await until('planks torn', async () => (await state()).barricades.find((b) => b.planks <= 3));
    await watch(first.id);
    await shot('tear');

    // 2. They climb in and come for us.
    await until('a zombie vaulting', async () => (await zombies()).some((z) => z.state === S.Vault), 20000);
    await sleep(450);
    await shot('vault');
    await until('zombies attacking', async () => (await zombies()).filter((z) => z.state === S.Attack).length >= 2, 30000);
    await page.evaluate(() => { const z = window.__zh.state().entities.find((e) => e.state === 4); window.__zh.lookAt(z.x, 1.3, z.z); });
    await sleep(300);
    await shot('attack');
    const safe = await state();
    assert(safe.hp === 100 && safe.hurts === 0, 'god mode should take no damage');
    assert(safe.barricades.some((b) => b.planks === 0), 'no barricade was fully torn down');

    // 3. Mortal now: they hurt us, the screen reddens, and we cannot walk through them.
    //    (One zombie only: three hits in a row would put a solo player down and end the game.)
    await page.evaluate(() => { const s = window.__zh.state(); window.__zh.killZombies(); window.__zh.spawnZombies(1, { x: s.x, z: s.z + 2.5, speed: 2.2 }); window.__zh.lookAt(s.x, 1.3, s.z + 2.5); });
    await until('the lone zombie', async () => (await zombies()).length === 1);
    await page.evaluate(() => window.__zh.god(false));
    await until('getting hurt', async () => (await state()).hurts > 0, 10000);
    await sleep(120);
    await shot('hurt');
    const hurt = await state();
    assert(hurt.hp < 100, `expected damage, hp ${hurt.hp}`);
    await page.evaluate(() => { window.__zh.god(true); window.__zh.killZombies(); });
    await until('zombies cleared', async () => (await zombies()).length === 0);
    await until('health back to full', async () => (await state()).hp === 100, 12000);

    // 4. Rebuild the barricade by holding F at the window.
    const broken = (await state()).barricades.find((b) => b.planks === 0);
    const at = { w_mess_n1: [26.75, 22.7], w_mess_n2: [32.75, 22.7], w_mess_e: [35.8, 26.75] }[broken.id];
    assert(at, `unexpected window ${broken.id}`);
    await page.evaluate(([x, z]) => { window.__zh.teleport(x, z + 0.8, 0); window.__zh.lookAt(x, 1.5, z - 1); }, at);
    await until('the rebuild prompt', async () => (await state()).prompt.includes('rebuild'), 3000);
    await shot('rebuild-prompt');
    await page.evaluate(() => window.__zh.key('KeyF', true));
    await until('two planks back', async () => (await state()).barricades.find((b) => b.id === broken.id).planks >= 2, 5000);
    await page.evaluate(() => window.__zh.key('KeyF', false));
    await sleep(1500);
    const held = (await state()).barricades.find((b) => b.id === broken.id).planks;
    assert(held < 6, 'rebuilding should stop when F is released');
    await page.evaluate(() => window.__zh.key('KeyF', true));
    await until('the barricade whole again', async () => (await state()).barricades.find((b) => b.id === broken.id).planks === 6, 8000);
    await page.evaluate(() => window.__zh.key('KeyF', false));
    assert((await state()).prompt === '', 'prompt should clear once the barricade is whole');
    await shot('rebuilt');

    // 5. Shoot one: body shots, then a headshot kill. Hit zones come from the zombie's own boxes.
    await page.evaluate(() => { window.__zh.teleport(29, 29, 0); window.__zh.spawnZombies(1, { x: 29, z: 24.5, speed: 0.4, hp: 150 }); });
    const target = await until('the target zombie', async () => (await zombies())[0]);
    const aimAt = async (y) => {
      await page.evaluate(([id, y]) => { const e = window.__zh.state().entities.find((e) => e.id === id); window.__zh.key('Mouse2', true); window.__zh.lookAt(e.x, y, e.z); }, [target.id, y]);
      await sleep(420);
    };
    const before = (await state()).hits.length;
    await aimAt(1.2);
    await page.evaluate(() => window.__zh.press('Mouse0'));
    await until('a body hit', async () => (await state()).hits.length > before, 3000);
    await shot('shot');
    await aimAt(1.66);
    await page.evaluate(() => window.__zh.press('Mouse0'));
    await until('a head hit', async () => (await state()).hits.some((h) => h.zone === 'head'), 3000);
    const hits = (await state()).hits.slice(before);
    assert(hits[0].zone === 'torso' && hits[0].dmg === 30, `body shot: ${JSON.stringify(hits[0])}`);
    assert(hits.at(-1).zone === 'head' && hits.at(-1).dmg === 75, `head shot: ${JSON.stringify(hits.at(-1))}`);
    const killsBefore = (await state()).kills;
    await aimAt(1.2);
    await page.evaluate(() => window.__zh.key('Mouse0', true));
    for (let i = 0; i < 6 && (await state()).kills === killsBefore; i++) { await page.evaluate(() => window.__zh.press('Mouse0')); await sleep(260); }
    await page.evaluate(() => { window.__zh.key('Mouse0', false); window.__zh.key('Mouse2', false); });
    assert((await state()).kills > killsBefore, 'the zombie should have died');
    await sleep(500);
    await shot('death');

    // 6. A grenade that does not kill leaves a crawler.
    await page.evaluate(() => { window.__zh.killZombies(); window.__zh.teleport(29, 30, 0); window.__zh.spawnZombies(2, { x: 29, z: 24, speed: 0.05, hp: 1500 }); });
    await until('two tough zombies', async () => (await zombies()).length === 2);
    await page.evaluate(() => { window.__zh.look(0, 0.12); window.__zh.press('KeyG'); });
    await until('a crawler', async () => (await zombies()).some((z) => z.state === S.Crawl || z.state === S.CrawlAttack), 8000);
    await page.evaluate(() => { const z = window.__zh.state().entities.find((e) => e.state === 5 || e.state === 8); window.__zh.teleport(z.x + 3, z.z + 1.2, 0); window.__zh.lookAt(z.x, 0.5, z.z); });
    await sleep(700);
    await shot('crawler');

    // 7. Full horde: three bots join, every door opens, 32 zombies (the 4-player cap).
    await page.evaluate(() => { window.__zh.killZombies(); window.__zh.openAllDoors(); });
    bots = spawn('npx', ['tsx', 'server/src/bot.ts', 'HRDE', '3', `ws://localhost:${port}/ws`], { cwd: root, env, stdio: 'inherit' });
    await until('three bots', async () => (await state()).remotes.length === 3, 20000);
    await page.evaluate(() => { window.__zh.teleport(29, 44, 0); window.__zh.spawnZombies(64, { interval: 0.25 }); });
    await until('32 zombies', async () => (await zombies()).length >= 32, 90000);
    await until('most of them inside', async () => (await zombies()).filter((z) => z.state >= S.Chase).length >= 20, 90000);
    await sleep(2500);
    const full = await state();
    // Step back to the far corner of the yard for a wide look at them coming.
    await page.evaluate(() => { window.__zh.teleport(44.5, 51, 0); window.__zh.lookAt(33, 0, 43); });
    await sleep(1600);
    await shot('32');
    // Look straight at whichever zombies are nearest for a close-up of the pack.
    await page.evaluate(() => { const s = window.__zh.state(); const z = s.entities.filter((e) => e.state >= 3).sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z))[0]; window.__zh.lookAt(z.x, z.y + 1.3, z.z); });
    await sleep(400);
    await shot('pack');
    console.log(`[horde] 32 zombies + 4 players: ${full.fps} fps, ${full.drawCalls} draw calls, ${full.triangles} triangles (headless software rendering)`);
    assert(full.drawCalls < 150, `draw calls ${full.drawCalls} >= 150`);
    assert(errors.length === 0, `page errors:\n${errors.join('\n')}`);
    console.log('[horde] ok');
  } catch (e) {
    console.error('[horde] FAILED:', e.message);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    bots?.kill('SIGINT');
    server.kill('SIGTERM');
  }
})();
