// The city's heights in the browser: one player walks every change of height of The Longest Night
// (as `npm run site` does for the station). The kerb, the tenement's two flights and its roof, the
// plank bridge and the walk to Abelard's roof, the hut and its stairs, both dead escalators, the
// gallery's edge, the Lyric's stairs and balcony, the fire escape, the subway from the square to
// the mezzanine, through the turnstiles to the platform, through the train, up the head house to
// the avenue, and the service tunnel's two flights to the hatch in the lane: all walked smoothly
// with no corrections. Then shots and prompts by floor, and zombies following over five storeys.
// Writes test-results/city-*.png. Usage: npm run build && npm run city
const { spawn } = require('node:child_process');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const port = 25000 + Math.floor(Math.random() * 900);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (ok, what) => {
  if (!ok) throw new Error(`[city] FAILED: ${what}`);
  console.log(`[city] ok: ${what}`);
};
/** The storeys: upstairs, the roofs, the mezzanine, the platform; and the kerb. */
const UP = 4;
const ROOF = 8;
const MEZZ = -4;
const PLAT = -8;
const KERB = 0.15;
const near = (a, b) => Math.abs(a - b) < 0.01;
/** How fast the view may rise or sink on stairs, m/s (4 m in 7 at 4.5 m/s, and a little). */
const CLIMB = 3.2;

(async () => {
  const server = spawn('node', ['server/dist/index.js'], { cwd: root, env: { ...process.env, PORT: String(port), ZH_DEBUG: '1', ZH_MAP: 'longest_night' }, stdio: 'ignore' });
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
    const shot = (name) => page.screenshot({ path: path.join(root, `test-results/city-${name}.png`) });
    mkdirSync(path.join(root, 'test-results'), { recursive: true });

    await page.goto(`http://localhost:${port}/?debug=1&autostart=1`);
    await page.waitForFunction(() => window.__zh?.state().phase === 'playing', null, { timeout: 30000 });
    check(/[?&]map=longest_night(&|$)/.test(page.url()), 'the client follows the server onto its map');
    await page.evaluate(() => { window.__zh.rounds(false); window.__zh.god(true); window.__zh.openAllDoors(); });
    let s = await state();
    check(s.map === 'longest_night' && s.zone === 'diner' && s.y === 0, `spawned in the diner, on the street's storey (${s.zone}, y ${s.y})`);
    check(s.mapErrors.length === 0, `the map compiles clean (${s.mapErrors.join('; ') || 'no errors'})`);

    /** Corrections the server sent while we walked. */
    let refused = 0;
    /** The largest change of the camera's height between two samples of any walk (each is also held to a climb's pace). */
    let roughest = 0;
    /**
     * Stand at (x, z) on the floor at `y` facing `yaw` and hold W until `done(state)` or `ms` have passed.
     * Returns the state it ended in.
     */
    const walk = async (x, z, yaw, y, done, ms = 9000, pitch = 0) => {
      await page.evaluate(([x, z, yaw, y, pitch]) => { window.__zh.teleport(x, z, yaw, y); window.__zh.look(yaw, pitch); }, [x, z, yaw, y, pitch]);
      // The server answers a teleport with a correction: wait until it has come (the first, from the far side of the map, takes longest).
      let start = (await state()).corrections;
      for (let quiet = 0; quiet < 2; ) {
        await sleep(200);
        const now = (await state()).corrections;
        quiet = now === start ? quiet + 1 : 0;
        start = now;
      }
      await page.evaluate(() => window.__zh.key('KeyW', true));
      let last = (await state()).eyeY;
      let lastAt = Date.now();
      let step = 0;
      let jolt = 0;
      const until = lastAt + ms;
      let st;
      do {
        await sleep(30);
        st = await state();
        const now = Date.now();
        const moved = Math.abs(st.eyeY - last);
        step = Math.max(step, moved);
        // A flight climbs a storey in seven metres: at a walk that is 2.6 m of height a second, and
        // a frame here can be a tenth of one. Anything over that pace is a jump, not a climb.
        jolt = Math.max(jolt, moved - CLIMB * ((now - lastAt) / 1000));
        last = st.eyeY;
        lastAt = now;
      } while (Date.now() < until && !done(st));
      await page.evaluate(() => window.__zh.key('KeyW', false));
      await sleep(250);
      st = await state();
      refused += st.corrections - start;
      if (st.corrections !== start) console.log(`[city] !! ${st.corrections - start} correction(s) on the walk from ${x}, ${z} (y ${y}), ended ${st.x.toFixed(2)}, ${st.z.toFixed(2)}, y ${st.y.toFixed(2)}`);
      roughest = Math.max(roughest, step);
      if (jolt > 0.3) check(false, `the view moved smoothly (it jumped ${jolt.toFixed(3)} m more than a climb accounts for)`);
      return st;
    };
    const at = (st) => `${st.zone}, x ${st.x.toFixed(1)}, z ${st.z.toFixed(1)}, y ${st.y.toFixed(2)}`;
    const view = async (yaw, pitch, name) => {
      await page.evaluate(([yaw, pitch]) => window.__zh.look(yaw, pitch), [yaw, pitch]);
      await sleep(400);
      await shot(name);
    };
    /** What is offered to someone standing at (x, z) on the floor at `y`, looking at (lx, lz) on the wall. */
    const prompt = async (x, z, y, lx, lz) => {
      await page.evaluate(([x, z, y, lx, lz]) => { window.__zh.teleport(x, z, 0, y); window.__zh.lookAt(lx, y + 1.3, lz); }, [x, z, y, lx, lz]);
      await sleep(600);
      const st = await state();
      if (!near(st.y, y)) check(false, `standing at ${x}, ${z} on the floor at ${y} (it is ${st.y}: something solid is there)`);
      return st.prompt;
    };
    const NORTH = 0;
    const SOUTH = Math.PI;
    const EAST = -Math.PI / 2;
    const WEST = Math.PI / 2;

    // The avenue: off the road and up the kerb onto the pavement.
    s = await walk(67, 37, NORTH, 0, (t) => t.z < 31.5, 3000);
    check(near(s.y, KERB) && s.zone === 'avenue', `stepped up the kerb onto the avenue's pavement (${at(s)})`);

    // The tenement: the first flight to the flat's landing, the second to the hut on the roof, out of its door.
    s = await walk(68, 99.5, SOUTH, 0, (t) => t.z > 108.3);
    check(near(s.y, UP) && s.zone === 'tenement', `climbed the tenement's first flight to the flat's floor (${at(s)})`);
    s = await walk(70.5, 108.5, NORTH, UP, (t) => t.z < 99.8);
    check(near(s.y, ROOF) && s.zone === 'tenement', `and the second to the hut on the roof (${at(s)})`);
    s = await walk(70.5, 99.5, WEST, ROOF, (t) => t.x < 66, 3000);
    check(near(s.y, ROOF) && s.zone === 'ten_roof', `out of the hut onto the tenement's roof (${at(s)})`);
    await view(-0.9, -0.05, 'ten-roof');
    // The parapet: a metre of wall, and no walking off the roof.
    s = await walk(62, 101, NORTH, ROOF, () => false, 1500);
    check(near(s.y, ROOF) && s.z > 98.5 && s.zone === 'ten_roof', `stopped at the roof's parapet (${at(s)})`);

    // The plank bridge over Tallow Lane, the walk along its north side, Abelard's roof at the end.
    s = await walk(68.25, 99.5, NORTH, ROOF, (t) => t.z < 90.8);
    check(near(s.y, ROOF) && s.zone === 'abelard_roof' && s.z < 91.5, `crossed the plank bridge, eight metres over the lane (${at(s)})`);
    await page.evaluate(() => window.__zh.teleport(68.25, 95, Math.PI, 8));
    await view(-1.2, -0.6, 'bridge');
    s = await walk(68.25, 90.5, EAST, ROOF, (t) => t.x > 99, 12000);
    check(near(s.y, ROOF) && s.zone === 'abelard_roof' && s.x > 99, `along the walk, over the passage's planks, onto Abelard's roof (${at(s)})`);
    await view(1.2, -0.1, 'abelard-roof');
    // The master switch is on the plant room up here, and nowhere under it.
    let offer = await prompt(100.75, 66.3, ROOF, 100.75, 65);
    check(/power/.test(offer), `the master switch is offered on Abelard's roof ("${offer}")`);
    await shot('switch');
    offer = await prompt(100.75, 66.3, UP, 100.75, 65);
    check(offer === '', `and not on the floor under it ("${offer}")`);

    // Abelard's: into the hut, down its stairs to the upper floor, down one dead escalator and up the other.
    s = await walk(122, 63, EAST, ROOF, (t) => t.x > 125.2, 3000);
    check(near(s.y, ROOF) && s.zone === 'abelard_up', `into the hut on Abelard's roof (${at(s)})`);
    s = await walk(125.5, 63, SOUTH, ROOF, (t) => t.z > 72);
    check(near(s.y, UP) && s.zone === 'abelard_up', `down the stairs to the upper floor (${at(s)})`);
    s = await walk(107.5, 67.5, SOUTH, UP, (t) => t.z > 77, 9000, -0.3);
    check(s.y === 0 && s.zone === 'abelard', `down the north escalator to the shop floor (${at(s)})`);
    await view(0, 0.35, 'escalator');
    s = await walk(115.5, 70.5, SOUTH, 0, (t) => t.z > 80.5);
    check(near(s.y, UP) && s.zone === 'abelard_up', `and up the south one to the gallery (${at(s)})`);
    // The gallery's edge over the atrium: a rail, and the shop floor four metres down.
    s = await walk(103, 77.5, EAST, UP, () => false, 1500, -0.3);
    check(near(s.y, UP) && s.x < 106.5, `stopped at the gallery's rail over the atrium (${at(s)})`);
    await shot('gallery');

    // The Lyric: up the lobby's stairs and round onto the balcony.
    s = await walk(50.5, 55, WEST, 0, (t) => t.x < 36.5);
    check(near(s.y, UP) && s.zone === 'lyric' && s.x < 39, `climbed the Lyric's stairs to the balcony (${at(s)})`);
    await view(WEST, -0.25, 'balcony');
    s = await walk(36.5, 54, WEST, UP, () => false, 1500);
    check(near(s.y, UP) && s.x > 34, `stopped at the balcony's rail (${at(s)})`);

    // The fire escape: iron stairs up the tenement's wall from the lane, and in at the flat's door.
    s = await walk(68.5, 97, WEST, 0, (t) => t.x < 59.2);
    check(near(s.y, UP) && s.zone === 'lane', `up the fire escape to its landing (${at(s)})`);
    await view(-1.3, -0.4, 'fire-escape');
    s = await walk(59.25, 97, SOUTH, UP, (t) => t.z > 99.5, 3000);
    check(near(s.y, UP) && s.zone === 'tenement', `and in at the flat's door (${at(s)})`);

    // The subway: from the square down to the mezzanine, through the turnstiles and down to the platform.
    s = await walk(94.5, 53, EAST, 0, (t) => t.x > 104.5);
    check(near(s.y, MEZZ) && s.zone === 'mezz', `down from the square to the mezzanine (${at(s)})`);
    s = await walk(89.25, 58, NORTH, MEZZ, (t) => t.z < 39);
    check(near(s.y, PLAT) && s.zone === 'platform', `through a turnstile and down to the platform (${at(s)})`);
    await view(1.2, 0, 'platform');
    // Through the train: in at one door, down the carriages, out at another onto the far half.
    s = await walk(84.75, 33.5, NORTH, PLAT, (t) => t.z < 30.3, 3000);
    check(near(s.y, PLAT) && s.z < 31.5, `into the train (${at(s)})`);
    s = await walk(84.75, 30, EAST, PLAT, (t) => t.x > 100.6, 9000);
    check(near(s.y, PLAT) && s.x > 100, `down the carriages (${at(s)})`);
    await shot('train');
    s = await walk(100.75, 30, SOUTH, PLAT, (t) => t.z > 33.5, 3000);
    check(near(s.y, PLAT) && s.zone === 'platform' && s.z > 32, `and out onto the platform's far half (${at(s)})`);
    // The head house: two flights and a landing up to the avenue's pavement.
    s = await walk(113, 31, NORTH, PLAT, (t) => t.z < 21.5);
    check(near(s.y, MEZZ), `up the head house's first flight (${at(s)})`);
    s = await walk(109, 21.25, SOUTH, MEZZ, (t) => t.z > 30.8);
    check(near(s.y, KERB) && s.zone === 'avenue', `and its second, out onto the avenue's pavement (${at(s)})`);

    // The service tunnel (the power's doors are open): south under the square, two flights up to the hatch in the lane.
    await page.evaluate(() => window.__zh.powerOn());
    await page.waitForFunction(() => window.__zh.state().power, null, { timeout: 5000 });
    s = await walk(68, 38.5, SOUTH, PLAT, (t) => t.z > 50, 5000);
    check(near(s.y, PLAT) && s.zone === 'service', `off the platform into the service tunnel (${at(s)})`);
    await shot('service');
    s = await walk(68, 74, SOUTH, PLAT, (t) => t.z > 84);
    check(near(s.y, MEZZ) && s.zone === 'service', `up the tunnel's first flight (${at(s)})`);
    s = await walk(69, 90.5, EAST, MEZZ, (t) => t.x > 78);
    check(s.y === 0 && s.zone === 'service', `and its second, to the hatch (${at(s)})`);
    s = await walk(78.5, 90.5, SOUTH, 0, (t) => t.z > 93.5, 3000);
    check(s.y === 0 && s.zone === 'lane', `out of the hatch into Tallow Lane (${at(s)})`);
    check(refused === 0, `the server accepted every step of all of it (${refused} corrections; roughest step of the view ${roughest.toFixed(3)} m)`);

    // Prompts go by floor.
    let p = await prompt(97.8, 63.6, UP, 97, 62.5);
    check(/Hair Trigger/.test(p), `Hair Trigger is offered upstairs in Abelard's ("${p}")`);
    p = await prompt(97.8, 63.6, 0, 97, 62.5);
    check(p === '', `and not on the shop floor under it ("${p}")`);
    p = await prompt(36.5, 47.8, UP, 36.5, 46.5);
    check(/Packmule/.test(p), `Packmule is offered at the back of the balcony ("${p}")`);
    await shot('packmule');
    p = await prompt(36.5, 47.8, 0, 36.5, 46.5);
    check(p === '', `and not from the stalls under it ("${p}")`);
    p = await prompt(104, 38.8, PLAT, 104, 40);
    check(/Stitch/.test(p), `the second Stitch is offered on the platform ("${p}")`);
    p = await prompt(104, 39.7, KERB, 104, 40.6);
    check(p === '', `and not on the avenue's pavement over it ("${p}")`);

    // Shots go by floor. A dummy in the stalls cannot be shot through the balcony's floor.
    await page.evaluate(() => { window.__zh.teleport(37.5, 54.5, 0, 0); window.__zh.dummy(37.5, 51.5); });
    await page.waitForFunction(() => window.__zh.state().entities.some((e) => e.kind === 'dummy'), null, { timeout: 5000 });
    await sleep(300);
    const dummy = (await state()).entities.find((e) => e.kind === 'dummy');
    check(dummy.y === 0, 'a dummy stands in the stalls');
    await page.evaluate(() => window.__zh.teleport(37.5, 54.5, 0, 4));
    await sleep(400);
    s = await state();
    check(near(s.y, UP) && s.zone === 'lyric', `the same spot a storey up is the balcony (${at(s)})`);
    let hits = s.hits.length;
    await page.evaluate(([x, y, z]) => { window.__zh.lookAt(x, y + 1.2, z); window.__zh.press('Mouse0'); }, [dummy.x, dummy.y, dummy.z]);
    await sleep(500);
    check((await state()).hits.length === hits, 'a shot from the balcony stops at its floor');
    // From the plank bridge a zombie in the lane is in plain sight, eight metres down.
    const shoot = async (from, zombie, what) => {
      await page.evaluate(([from, zombie]) => { window.__zh.killZombies(); window.__zh.teleport(from[0], from[1], 0, from[2]); window.__zh.spawnZombies(1, { x: zombie[0], z: zombie[1], y: zombie[2], speed: 0.01, hp: 60 }); }, [from, zombie]);
      await page.waitForFunction(() => window.__zh.state().entities.some((e) => e.kind === 'zombie'), null, { timeout: 5000 });
      // A full magazine, and down the sights: one of these is 25 m off.
      await page.evaluate(() => window.__zh.press('KeyR'));
      await page.waitForFunction(() => !window.__zh.state().reloading && window.__zh.state().mag >= 8, null, { timeout: 6000 });
      await page.evaluate(() => window.__zh.key('Mouse2', true));
      await sleep(500);
      const before = await state();
      check(near(before.entities.find((e) => e.kind === 'zombie').y, zombie[2]), `  (a zombie stands ${(from[2] - zombie[2]).toFixed(0)} m below us)`);
      for (let i = 0; i < 8 && (await state()).kills === before.kills; i++) {
        await page.evaluate(() => { const e = window.__zh.state().entities.find((e) => e.kind === 'zombie'); if (e) window.__zh.lookAt(e.x, e.y + 1.25, e.z); });
        await sleep(80);
        if (i === 0) await shot(what.split(':')[0]);
        await page.evaluate(() => window.__zh.press('Mouse0'));
        await sleep(320);
      }
      await page.evaluate(() => window.__zh.key('Mouse2', false));
      check((await state()).kills === before.kills + 1, what);
    };
    await shoot([68.25, 95, ROOF], [74, 95, 0], 'shot-bridge: shot a zombie in the lane from the plank bridge');
    await shoot([105.5, 77.5, UP], [111, 78, 0], 'shot-gallery: shot a zombie on the shop floor from the gallery');
    // Over a parapet: from Abelard's roof, one a long way off in the square.
    await shoot([97.3, 79, ROOF], [72, 79, 0], 'shot-roof: shot a zombie in the square over the roof\'s parapet');
    // And not through a roof: from the square, a dummy on Abelard's roof is behind the building.
    await page.evaluate(() => { window.__zh.killZombies(); window.__zh.teleport(110, 82, 0, 8); window.__zh.dummy(110, 80); });
    await sleep(600);
    const high = (await state()).entities.filter((e) => e.kind === 'dummy').find((e) => near(e.y, ROOF));
    check(!!high, 'a dummy stands on Abelard\'s roof');
    await page.evaluate(() => window.__zh.teleport(110, 80, 0, 0));
    await sleep(400);
    hits = (await state()).hits.length;
    await page.evaluate(([x, y, z]) => { window.__zh.lookAt(x, y + 1.2, z); window.__zh.press('Mouse0'); }, [high.x + 0.01, high.y, high.z]);
    await sleep(500);
    check((await state()).hits.length === hits, 'a shot from the shop floor does not reach the roof two storeys up');

    // Zombies follow, over all five storeys.
    const chase = async (from, to, what) => {
      await page.evaluate(([from, to]) => { window.__zh.killZombies(); window.__zh.teleport(to[0], to[1], 0, to[2]); window.__zh.spawnZombies(1, { x: from[0], z: from[1], y: from[2], speed: 4.8, hp: 5000 }); }, [from, to]);
      await page.waitForFunction(() => window.__zh.state().entities.some((e) => e.kind === 'zombie'), null, { timeout: 5000 });
      let reached = false;
      const began = Date.now();
      let z;
      while (Date.now() - began < 120000 && !reached) {
        z = (await state()).entities.find((e) => e.kind === 'zombie');
        if (!z) break;
        reached = Math.abs(z.y - to[2]) < 0.3 && Math.hypot(z.x - to[0], z.z - to[1]) < 2.5;
        await sleep(100);
      }
      check(reached, `${what} (${((Date.now() - began) / 1000).toFixed(0)} s${reached || !z ? '' : `; it is at ${z.x.toFixed(1)}, ${z.z.toFixed(1)}, y ${z.y.toFixed(1)}`})`);
    };
    await chase([80, 36, PLAT], [63, 106, ROOF], 'a zombie from the platform came up through the mezzanine, the square, the diner and the tenement to its roof');
    await page.evaluate(() => { const e = window.__zh.state().entities.find((e) => e.kind === 'zombie'); window.__zh.lookAt(e.x, e.y + 1.2, e.z); });
    await sleep(300);
    await shot('zombie-roof');
    await chase([110, 82, ROOF], [61, 60, PLAT], 'a zombie from Abelard\'s roof came down through the store and the subway to the signal room');
    await chase([36.5, 50, UP], [47, 20, 0], 'a zombie from the Lyric\'s balcony came down and across the avenue into the chapel');

    s = await state();
    check(errors.length === 0, `no page errors (${errors.join('; ') || 'none'})`);
    console.log(`[city] done: ${s.drawCalls} draw calls, ${s.worldTriangles} world triangles, ${s.fps} fps`);
  } finally {
    await browser?.close();
    server.kill('SIGTERM');
  }
})().catch((err) => {
  console.error(String(err.message ?? err));
  process.exitCode = 1;
});
