// The economy in a real browser: boots the built server and plays through the session 10
// features alone — a wall gun and its ammo, a door, Second Wind without power, the master
// switch, a tonic, the Forge and the upgraded weapon, then a down that Second Wind undoes.
// Screenshots go to test-results/economy-*.png. Usage: npm run build && npm run economy
const { spawn } = require('node:child_process');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const port = 24080 + Math.floor(Math.random() * 900);
const base = `http://localhost:${port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

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
    const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${base}/?name=Ada&debug=1&autostart=1`);
    mkdirSync(path.join(root, 'test-results'), { recursive: true });
    const shot = (name) => page.screenshot({ path: path.join(root, `test-results/economy-${name}.png`) });
    const state = () => page.evaluate(() => window.__zh.state());
    const zh = (fn, arg) => page.evaluate(fn, arg);
    const until = async (what, fn, timeout = 15000) => {
      const t0 = Date.now();
      for (;;) {
        const v = await fn();
        if (v) return v;
        if (Date.now() - t0 > timeout) throw new Error(`timed out waiting for ${what} (prompt: "${(await state()).prompt}")`);
        await sleep(100);
      }
    };
    /** Stand at (x, z) looking at a point, and wait for the prompt to say something. */
    const face = async (x, z, lx, ly, lz, expect) => {
      await zh(([x, z, lx, ly, lz]) => { window.__zh.teleport(x, z); window.__zh.lookAt(lx, ly, lz); }, [x, z, lx, ly, lz]);
      return until(`prompt "${expect}"`, async () => { const p = (await state()).prompt; return p.includes(expect) && p; });
    };
    const pressF = () => zh(() => window.__zh.press('KeyF'));

    await page.waitForFunction(() => window.__zh?.state().phase === 'playing', null, { timeout: 15000 });
    await zh(() => { window.__zh.rounds(false); window.__zh.give(20000); });
    await until('points', async () => (await state()).points === 20500);

    // 1. A wall gun: 500 for the Farrow, then nothing to sell until rounds have been used.
    let prompt = await face(23.7, 24, 22.5, 1.45, 24, 'Farrow');
    assert(prompt.includes('[500]'), `wall buy prompt: ${prompt}`);
    await shot('wallbuy');
    await pressF();
    await until('the Farrow', async () => (await state()).weapon === 'farrow');
    let s = await state();
    assert(s.points === 20000, `after the Farrow: ${s.points}`);
    await until('ammo is full', async () => (await state()).prompt.includes('ammo is full'));
    await zh(() => window.__zh.look(Math.PI, 0));
    for (let i = 0; i < 8; i++) { await zh(() => window.__zh.press('Mouse0')); await sleep(260); }
    await zh(() => window.__zh.press('KeyR'));
    await until('a reload', async () => { const t = await state(); return !t.reloading && t.mag === 8 && t.reserve === 56; });
    prompt = await face(23.7, 24, 22.5, 1.45, 24, 'ammo [250]');
    await pressF();
    await until('ammo bought', async () => { const t = await state(); return t.points === 19750 && t.reserve === 64; });

    // 2. A door.
    prompt = await face(29, 31.2, 29, 1.2, 32.5, 'open door [750]');
    await pressF();
    await until('the door', async () => (await state()).openDoors.includes('d_mess_yard'));
    assert((await state()).points === 19000, 'the door costs 750');

    // 3. Alone, Second Wind is 500 and needs no power; the others wait for the mains.
    prompt = await face(24.4, 31.5, 23, 1.4, 31.5, 'Second Wind');
    assert(prompt.includes('[500]'), `solo Second Wind prompt: ${prompt}`);
    await pressF();
    await until('Second Wind', async () => (await state()).perks.includes('second_wind'));
    await sleep(450);
    await shot('tonic-drink');
    await face(60.7, 38.5, 62, 1.4, 38.5, 'needs power');
    await shot('tonic-no-power');

    // 4. The master switch: lights, the vault door, the dispensers.
    await face(60.2, 32.5, 61.5, 1.0, 32.5, 'turn on the power');
    await shot('switch');
    await pressF();
    await until('power', async () => { const t = await state(); return t.power && t.openDoors.includes('d_vault'); });
    await sleep(600);
    await shot('power-on');
    assert((await state()).prompt === '', 'the switch has nothing more to offer');

    // 5. A tonic.
    prompt = await face(60.7, 38.5, 62, 1.4, 38.5, 'Quickhands');
    assert(prompt.includes('[3000]'), `tonic prompt: ${prompt}`);
    await shot('tonic');
    await pressF();
    await until('Quickhands', async () => (await state()).perks.join() === 'second_wind,quickhands');
    s = await state();
    assert(s.points === 15500, `after two tonics: ${s.points}`);
    assert(await zh(() => document.querySelectorAll('#perks .perk').length) === 2, 'two tonics in the HUD tray');
    await sleep(1500);

    // 6. The Forge.
    prompt = await face(40.2, 58, 41.75, 1.1, 58, 'forge the');
    assert(prompt.includes('Farrow') && prompt.includes('[5000]'), `forge prompt: ${prompt}`);
    await shot('forge');
    await pressF();
    await until('the Forge at work', async () => (await state()).forge === 'working');
    s = await state();
    assert(s.points === 10500 && s.weapons.join() === 'warden', `in the Forge: ${s.points}, ${s.weapons}`);
    await sleep(900);
    await shot('forge-working');
    await until('the Forge to finish', async () => (await state()).forge === 'offering');
    await until('the offer', async () => (await state()).prompt.includes('take the "Farrowgate"'));
    await sleep(300);
    await shot('forge-offering');
    await pressF();
    await until('the upgraded Farrow', async () => { const t = await state(); return t.weapon === 'farrow' && t.upgraded[t.slot] === true; });
    s = await state();
    assert(s.forge === 'idle' && s.mag === 12 && s.reserve === 120, `upgraded: ${s.forge} ${s.mag}/${s.reserve}`);
    assert(await zh(() => document.getElementById('ammo-name').textContent) === '"Farrowgate"', 'the HUD names the upgraded weapon');

    // 7. It hits like it says: 225 to the body of a dummy.
    await zh(() => { window.__zh.teleport(38.5, 59.4, 0); window.__zh.dummy(38.5, 56.6); });
    const dummy = await until('a dummy', async () => (await state()).entities.find((e) => e.kind === 'dummy'));
    await zh((d) => { window.__zh.key('Mouse2', true); window.__zh.lookAt(d.x, 1.2, d.z); }, dummy);
    await sleep(500);
    await shot('upgraded');
    await zh(() => window.__zh.press('Mouse0'));
    const hit = await until('a hit', async () => (await state()).hits.at(-1));
    assert(hit.dmg === 225, `upgraded Farrow body shot: ${hit.dmg}`);
    await zh(() => window.__zh.key('Mouse2', false));

    // 8. Down, alone, with Second Wind: back up without anyone's help, tonics gone.
    await zh(() => window.__zh.spawnZombies(2, { x: 39.6, z: 57.4, speed: 4.8 }));
    await until('going down', async () => (await state()).life === 'downed', 20000);
    await zh(() => window.__zh.killZombies());
    await sleep(600);
    await shot('second-wind');
    s = await state();
    assert(!s.over && s.perks.length === 0, `downed with Second Wind: over=${s.over}, perks=${s.perks}`);
    await until('getting back up', async () => (await state()).life === 'alive', 15000);
    s = await state();
    assert(!s.over && s.weapon === 'farrow' && s.upgraded[s.slot], 'back up with the upgraded Farrow');
    assert(await zh(() => document.querySelectorAll('#perks .perk').length) === 0, 'the tray is empty again');

    assert(errors.length === 0, `page errors: ${errors.join('; ')}`);
    console.log('economy: ok — wall gun, ammo, door, Second Wind, power, tonic, Forge, upgraded damage, self-revive');
  } catch (e) {
    console.error(`economy: FAILED — ${e.message}`);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    server.kill();
  }
})();
