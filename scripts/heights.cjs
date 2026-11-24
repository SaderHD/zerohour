// Height in the browser, on the Stacks (three storeys, a ramp, a terrace): boots the built server with
// ZH_MAP=stacks and walks one player through it. Checks that the client follows the server onto its
// map, that the view climbs a ramp and stairs smoothly with no corrections, that shots and prompts
// respect the floors, and that zombies arrive by the stairs. Writes test-results/heights-*.png.
// Usage: npm run build && npm run heights
const { spawn } = require('node:child_process');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const port = 21000 + Math.floor(Math.random() * 900);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (ok, what) => {
  if (!ok) throw new Error(`[heights] FAILED: ${what}`);
  console.log(`[heights] ok: ${what}`);
};

(async () => {
  const server = spawn('node', ['server/dist/index.js'], { cwd: root, env: { ...process.env, PORT: String(port), ZH_DEBUG: '1', ZH_MAP: 'stacks' }, stdio: 'ignore' });
  let browser;
  try {
    for (let i = 0; i < 50; i++) {
      try {
        if ((await fetch(`http://localhost:${port}/healthz`)).ok) break;
      } catch {}
      await sleep(100);
    }
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const state = () => page.evaluate(() => window.__zh.state());
    const shot = (name) => page.screenshot({ path: path.join(root, `test-results/heights-${name}.png`) });
    mkdirSync(path.join(root, 'test-results'), { recursive: true });

    // No map in the address: the client builds the station, hears the server is on the Stacks and reloads onto it.
    await page.goto(`http://localhost:${port}/?debug=1&autostart=1`);
    await page.waitForFunction(() => window.__zh?.state().phase === 'playing' && window.__zh.state().map === 'stacks', null, { timeout: 20000 });
    check(/[?&]map=stacks(&|$)/.test(page.url()), 'the client follows the server onto its map');
    await page.evaluate(() => { window.__zh.rounds(false); window.__zh.god(true); window.__zh.openAllDoors(); });
    let s = await state();
    check(s.zone === 'hall' && s.y === 0, `spawned on the ground floor of the hall (${s.zone}, y ${s.y})`);

    /** Corrections the server sent while we walked (a teleport is answered with one, so they are counted per walk). */
    let refused = 0;
    /** Hold W for a while and return every frame's camera height. */
    const walk = async (ms) => {
      const start = (await state()).corrections;
      await page.evaluate(() => window.__zh.key('KeyW', true));
      const eyes = [];
      const until = Date.now() + ms;
      while (Date.now() < until) {
        eyes.push((await state()).eyeY);
        await sleep(30);
      }
      await page.evaluate(() => window.__zh.key('KeyW', false));
      await sleep(250);
      refused += (await state()).corrections - start;
      return eyes;
    };
    const biggestStep = (eyes) => Math.max(...eyes.slice(1).map((y, i) => Math.abs(y - eyes[i])));

    // The ramp: east along the north wall, a metre up to the landing.
    await page.evaluate(() => { window.__zh.teleport(18.5, 9, -Math.PI / 2, 0); window.__zh.look(-Math.PI / 2, 0); });
    await sleep(400);
    let eyes = await walk(2600);
    s = await state();
    check(s.y === 1 && s.x > 23.5, `walked up the ramp to the landing (x ${s.x.toFixed(1)}, y ${s.y})`);
    check(biggestStep(eyes) < 0.2, `the view rose smoothly up the ramp (largest change between samples ${biggestStep(eyes).toFixed(3)} m)`);
    await shot('ramp-top');

    // The ledge: from the terrace's edge the hall is a metre down, and there is no walking off it.
    await page.evaluate(() => { window.__zh.teleport(22, 15, Math.PI / 2, 1); window.__zh.look(Math.PI / 2, -0.25); });
    await sleep(300);
    await walk(1500);
    s = await state();
    check(s.y === 1 && s.x > 20.3 && s.x < 20.5, `stopped at the edge of the terrace (x ${s.x.toFixed(2)}, y ${s.y})`);
    await shot('ledge');

    // Shooting down from it: a zombie on the hall floor is hit, and dies there.
    await page.evaluate(() => window.__zh.spawnZombies(1, { x: 17, z: 15, speed: 0.01, hp: 60 }));
    await page.waitForFunction(() => window.__zh.state().entities.length === 1, null, { timeout: 5000 });
    await sleep(400);
    s = await state();
    check(s.entities[0].y === 0, 'the zombie stands on the hall floor, a metre below us');
    const kills = s.kills;
    for (let i = 0; i < 12 && (await state()).kills === kills; i++) {
      await page.evaluate(() => { const e = window.__zh.state().entities[0]; if (e) window.__zh.lookAt(e.x, e.y + 1.25, e.z); });
      await sleep(80);
      await page.evaluate(() => window.__zh.press('Mouse0'));
      await sleep(320);
    }
    check((await state()).kills === kills + 1, 'shot it from the terrace');

    // The stairs: from the lobby up to the loft, through its door.
    await page.evaluate(() => { window.__zh.teleport(4, 16.8, 0, 0); window.__zh.look(0, 0.15); });
    await sleep(400);
    eyes = await walk(2600);
    s = await state();
    check(s.y === 3 && s.zone === 'loft', `climbed the stairs into the loft (${s.zone}, y ${s.y})`);
    check(biggestStep(eyes) < 0.25, `the view rose smoothly up the stairs (largest change between samples ${biggestStep(eyes).toFixed(3)} m)`);
    check(refused === 0, `the server accepted every step up the ramp, along the terrace and up the stairs (${refused} corrections)`);
    await shot('loft');

    // Floors come between: a dummy in the loft cannot be shot from the hall under it, and can from beside it.
    await page.evaluate(() => { window.__zh.teleport(12, 16, 0, 3); window.__zh.dummy(12, 12); });
    await page.waitForFunction(() => window.__zh.state().entities.some((e) => e.kind === 'dummy'), null, { timeout: 5000 });
    await sleep(300);
    const dummy = (await state()).entities.find((e) => e.kind === 'dummy');
    check(dummy.y === 3, 'the dummy stands on the loft floor');
    await page.evaluate(() => { window.__zh.teleport(12, 16, 0, 0); });
    await sleep(400);
    let hits = (await state()).hits.length;
    await page.evaluate(([x, y, z]) => { window.__zh.lookAt(x, y + 1.2, z); window.__zh.press('Mouse0'); }, [dummy.x, dummy.y, dummy.z]);
    await sleep(500);
    check((await state()).hits.length === hits, 'a shot from the hall stops at the ceiling');
    await page.evaluate(() => { window.__zh.teleport(12, 16, 0, 3); });
    await sleep(400);
    await page.evaluate(([x, y, z]) => { window.__zh.lookAt(x, y + 1.2, z); }, [dummy.x, dummy.y, dummy.z]);
    await sleep(100);
    await page.evaluate(() => window.__zh.press('Mouse0'));
    await sleep(500);
    check((await state()).hits.length === hits + 1, 'the same shot from the loft lands');

    // Prompts: the loft's wall buy hangs over the hall's south wall; only the loft is offered it.
    await page.evaluate(() => { window.__zh.give(5000); window.__zh.teleport(11, 17.2, Math.PI, 0); window.__zh.look(Math.PI, 0); });
    await sleep(500);
    check(!/Farrow/.test((await state()).prompt), 'no prompt for the loft\'s wall buy from the hall below it');
    await page.evaluate(() => { window.__zh.teleport(11, 17.2, Math.PI, 3); window.__zh.look(Math.PI, 0); });
    await sleep(500);
    s = await state();
    check(/Farrow/.test(s.prompt), `the prompt shows in the loft ("${s.prompt}")`);
    await page.evaluate(() => window.__zh.press('KeyF'));
    await sleep(500);
    check((await state()).weapons.includes('farrow'), 'bought it there');

    // Zombies find the stairs: one let in at the cellar window reaches us in the loft.
    await page.evaluate(() => { window.__zh.teleport(12, 14, Math.PI, 3); window.__zh.spawnZombies(1, { x: 17, z: 16, y: -3, speed: 4.8, hp: 5000 }); });
    await page.waitForFunction(() => window.__zh.state().entities.some((e) => e.kind === 'zombie'), null, { timeout: 5000 });
    const heights = new Set();
    let reached = false;
    for (let i = 0; i < 300 && !reached; i++) {
      const z = (await state()).entities.find((e) => e.kind === 'zombie');
      if (!z) break;
      heights.add(Math.round(z.y));
      reached = z.y > 2.9 && Math.hypot(z.x - 12, z.z - 14) < 2.5;
      await sleep(100);
    }
    check(reached, `a zombie from the cellar climbed to the loft (passed heights ${[...heights].sort((a, b) => a - b).join(', ')})`);
    check(heights.has(-3) && heights.has(0) && heights.has(3), 'it was seen on all three storeys on the way');
    await shot('zombie-arrives');

    s = await state();
    check(errors.length === 0, `no page errors (${errors.join('; ') || 'none'})`);
    console.log(`[heights] done: ${s.drawCalls} draw calls, ${s.worldTriangles} world triangles, ${s.fps} fps`);
  } finally {
    await browser?.close();
    server.kill('SIGTERM');
  }
})().catch((err) => {
  console.error(String(err.message ?? err));
  process.exitCode = 1;
});
