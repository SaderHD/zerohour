// The station's heights in the browser: one player walks Harrow Ridge's slopes and stairs. Checks
// that the yard's snow slope, the bluff's edge, the stairs to the laboratory, the tunnel's ramp, the
// generator hall's gallery and the two flights down to the vault are all walked smoothly with no
// corrections, that shots and prompts go by floor, and that zombies come up and down after the
// player. Writes test-results/site-*.png. Usage: npm run build && npm run site
const { spawn } = require('node:child_process');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const port = 22000 + Math.floor(Math.random() * 900);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (ok, what) => {
  if (!ok) throw new Error(`[site] FAILED: ${what}`);
  console.log(`[site] ok: ${what}`);
};
/** The terraces: the laboratory's floor, the low yard's, the gallery's and the vault's. */
const N = 1.5;
const S = -1.5;
const GALLERY = 3;
const VAULT = -4.5;
/** The floor at the tunnel's bend, and at the turn of the vault stairs. */
const BEND = (N + GALLERY) / 2;
const TURN = (S + VAULT) / 2;
const near = (a, b) => Math.abs(a - b) < 0.01;

(async () => {
  const server = spawn('node', ['server/dist/index.js'], { cwd: root, env: { ...process.env, PORT: String(port), ZH_DEBUG: '1' }, stdio: 'ignore' });
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
    const shot = (name) => page.screenshot({ path: path.join(root, `test-results/site-${name}.png`) });
    mkdirSync(path.join(root, 'test-results'), { recursive: true });

    await page.goto(`http://localhost:${port}/?debug=1&autostart=1`);
    await page.waitForFunction(() => window.__zh?.state().phase === 'playing', null, { timeout: 20000 });
    await page.evaluate(() => { window.__zh.rounds(false); window.__zh.god(true); window.__zh.openAllDoors(); });
    let s = await state();
    check(s.zone === 'mess' && s.y === 0, `spawned in the mess hall, on the middle terrace (${s.zone}, y ${s.y})`);

    /** Corrections the server sent while we walked (a teleport is answered with one, so they are counted per walk). */
    let refused = 0;
    /** Stand at (x, z) on the floor at `y` facing `yaw`, hold W for a while and return every sample of the camera's height. */
    const walk = async (x, z, yaw, y, ms, pitch = 0) => {
      await page.evaluate(([x, z, yaw, y, pitch]) => { window.__zh.teleport(x, z, yaw, y); window.__zh.look(yaw, pitch); }, [x, z, yaw, y, pitch]);
      await sleep(400);
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
      return Math.max(...eyes.slice(1).map((e, i) => Math.abs(e - eyes[i])));
    };
    const NORTH = 0;
    const SOUTH = Math.PI;
    const EAST = -Math.PI / 2;
    const WEST = Math.PI / 2;

    // The yard: down the west snow slope from the terrace by the mess hall to the low yard.
    let step = await walk(24, 38.6, SOUTH, 0, 3200);
    s = await state();
    check(near(s.y, S) && s.z > 44 && s.zone === 'yard', `walked down the snow slope to the low yard (z ${s.z.toFixed(1)}, y ${s.y.toFixed(2)})`);
    check(step < 0.2, `the view sank smoothly down the slope (largest change between samples ${step.toFixed(3)} m)`);
    await page.evaluate(() => window.__zh.look(0, 0.12));
    await sleep(300);
    await shot('slope');

    // The bluff: its south edge is a wall's height over the low yard, and there is no walking off it.
    await walk(36, 40.2, SOUTH, 0, 1500, -0.3);
    s = await state();
    check(s.y === 0 && s.z > 41.5 && s.z < 41.7, `stopped at the edge of the bluff (z ${s.z.toFixed(2)}, y ${s.y})`);
    await shot('bluff');
    // Shooting down from it.
    await page.evaluate(() => window.__zh.spawnZombies(1, { x: 36, z: 46.5, y: -1.5, speed: 0.01, hp: 60 }));
    await page.waitForFunction(() => window.__zh.state().entities.length === 1, null, { timeout: 5000 });
    await sleep(400);
    s = await state();
    check(near(s.entities[0].y, S), 'a zombie in the low yard stands a terrace below us');
    const kills = s.kills;
    for (let i = 0; i < 12 && (await state()).kills === kills; i++) {
      await page.evaluate(() => { const e = window.__zh.state().entities[0]; if (e) window.__zh.lookAt(e.x, e.y + 1.25, e.z); });
      await sleep(80);
      await page.evaluate(() => window.__zh.press('Mouse0'));
      await sleep(320);
    }
    check((await state()).kills === kills + 1, 'shot it from the bluff');

    // The laboratory: through the washroom door and up the stair well onto the north terrace.
    step = await walk(11, 20.6, NORTH, 0, 2600, 0.15);
    s = await state();
    check(near(s.y, N) && s.zone === 'lab', `climbed from the washroom into the laboratory (${s.zone}, y ${s.y.toFixed(2)})`);
    check(step < 0.25, `the view rose smoothly up the stairs (largest change between samples ${step.toFixed(3)} m)`);
    await page.evaluate(() => { window.__zh.teleport(14.5, 13, 2.5, 1.5); window.__zh.look(2.5, -0.3); });
    await sleep(500);
    await shot('lab-well');

    // The tunnel: up its two ramps from the cold store to the door on the generator hall's gallery.
    await walk(43, 13, EAST, N, 3000, 0.08);
    s = await state();
    check(near(s.y, BEND) && s.x > 49, `walked up the tunnel's first ramp (x ${s.x.toFixed(1)}, y ${s.y.toFixed(2)})`);
    await walk(52, 15, SOUTH, BEND, 3600);
    s = await state();
    check(near(s.y, GALLERY) && s.zone === 'gen', `and down its leg, out onto the gallery (${s.zone}, y ${s.y.toFixed(2)})`);
    await page.evaluate(() => window.__zh.look(Math.PI, -0.5));
    await sleep(400);
    await shot('gallery');

    // The gallery: the hall floor is three metres down; the master switch is up here and only here.
    await page.evaluate(() => { window.__zh.teleport(56.5, 25.4, 0, 0); window.__zh.lookAt(56.5, 1, 24); });
    await sleep(500);
    check((await state()).prompt === '', 'nothing to press on the hall floor under the switch');
    await page.evaluate(() => { window.__zh.teleport(56.5, 25.4, 0, 3); window.__zh.lookAt(56.5, 4, 24); });
    await sleep(500);
    s = await state();
    check(/power/.test(s.prompt), `the master switch is offered on the gallery ("${s.prompt}")`);
    // Down the west flight to the hall floor, and back up the east one.
    step = await walk(49, 25, SOUTH, GALLERY, 3200, -0.3);
    s = await state();
    check(s.y === 0 && s.z > 31.5, `walked down the west flight to the hall floor (z ${s.z.toFixed(1)}, y ${s.y})`);
    check(step < 0.25, `the view sank smoothly down the flight (largest change between samples ${step.toFixed(3)} m)`);
    await walk(64, 33, NORTH, 0, 3400, 0.3);
    s = await state();
    check(near(s.y, GALLERY) && s.z < 26, `and up the east flight to the gallery again (z ${s.z.toFixed(1)}, y ${s.y})`);

    // The motor pool: off the loading dock by the ramp.
    await walk(51, 37, SOUTH, 0, 2600);
    s = await state();
    check(near(s.y, S) && s.zone === 'motor' && s.z > 41.5, `walked down the dock's ramp to the motor pool floor (z ${s.z.toFixed(1)}, y ${s.y.toFixed(2)})`);
    await page.evaluate(() => { window.__zh.teleport(61.5, 37, 1.57, 0); window.__zh.look(1.57, -0.1); });
    await sleep(500);
    await shot('dock');

    // The vault: through the power door, down two flights that double back, in under the bunker.
    await walk(37.2, 58, EAST, S, 2200, -0.3);
    s = await state();
    check(near(s.y, TURN) && s.x > 41.5, `down the first flight to the turn (x ${s.x.toFixed(1)}, y ${s.y.toFixed(2)})`);
    step = await walk(42.4, 56, WEST, TURN, 4200, -0.2);
    s = await state();
    check(near(s.y, VAULT) && s.zone === 'vault' && s.x < 36, `down the second into the vault, under the bunker (x ${s.x.toFixed(1)}, y ${s.y.toFixed(2)})`);
    check(step < 0.25, `the view sank smoothly down the flight (largest change between samples ${step.toFixed(3)} m)`);
    await shot('vault');
    check(refused === 0, `the server accepted every step of all of it (${refused} corrections)`);

    // A dummy in the bunker cannot be shot from the vault under it.
    await page.evaluate(() => { window.__zh.teleport(30, 59.6, 0, -1.5); window.__zh.dummy(30, 56); });
    await page.waitForFunction(() => window.__zh.state().entities.some((e) => e.kind === 'dummy'), null, { timeout: 5000 });
    await sleep(300);
    const dummy = (await state()).entities.find((e) => e.kind === 'dummy');
    check(near(dummy.y, S), 'a dummy stands on the bunker floor');
    await page.evaluate(() => window.__zh.teleport(30, 59.6, 0, -4.5));
    await sleep(400);
    s = await state();
    check(s.zone === 'vault', `the same spot a storey down is the vault (${s.zone})`);
    const hits = s.hits.length;
    await page.evaluate(([x, y, z]) => { window.__zh.lookAt(x, y + 1.2, z); window.__zh.press('Mouse0'); }, [dummy.x, dummy.y, dummy.z]);
    await sleep(500);
    check((await state()).hits.length === hits, 'a shot from the vault stops at its ceiling');

    // Zombies follow: one let loose in the low yard comes up to the gallery, one from the hall down to the vault.
    const chase = async (from, to, what) => {
      await page.evaluate(([from, to]) => { window.__zh.killZombies(); window.__zh.teleport(to[0], to[1], 0, to[2]); window.__zh.spawnZombies(1, { x: from[0], z: from[1], y: from[2], speed: 4.8, hp: 5000 }); }, [from, to]);
      await page.waitForFunction(() => window.__zh.state().entities.some((e) => e.kind === 'zombie'), null, { timeout: 5000 });
      let reached = false;
      for (let i = 0; i < 450 && !reached; i++) {
        const z = (await state()).entities.find((e) => e.kind === 'zombie');
        if (!z) break;
        reached = Math.abs(z.y - to[2]) < 0.3 && Math.hypot(z.x - to[0], z.z - to[1]) < 2.5;
        await sleep(100);
      }
      check(reached, what);
    };
    await chase([44, 46, S], [55, 25, GALLERY], 'a zombie from the low yard came through the motor pool, up the dock and the stairs to the gallery');
    await shot('zombie-gallery');
    await chase([55, 33, 0], [30, 57.5, VAULT], 'a zombie from the generator hall came down through the yard and the bunker into the vault');

    s = await state();
    check(errors.length === 0, `no page errors (${errors.join('; ') || 'none'})`);
    console.log(`[site] done: ${s.drawCalls} draw calls, ${s.worldTriangles} world triangles, ${s.fps} fps`);
  } finally {
    await browser?.close();
    server.kill('SIGTERM');
  }
})().catch((err) => {
  console.error(String(err.message ?? err));
  process.exitCode = 1;
});
