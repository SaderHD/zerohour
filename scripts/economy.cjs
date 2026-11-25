// The economy in a real browser: boots the built server and plays through the session 10
// features alone — a wall gun and its ammo, a door, Second Wind without power, the master
// switch, a tonic, the Forge and the upgraded weapon, then a down that Second Wind undoes.
// Screenshots go to test-results/economy-*.png. Usage: npm run build && npm run economy
// `npm run economy -- --night` plays the same purchases on The Longest Night, where they stand on
// four storeys (the diner, the roof of Abelard's, the signal room): economy-night-*.png.
const { spawn } = require('node:child_process');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const port = 24080 + Math.floor(Math.random() * 900);
const base = `http://localhost:${port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

// Where each thing is, by map: [stand x, z, look x, height over the floor, z] and, where storeys
// lie over each other, the floor to stand on.
const STATION = {
  map: null, tag: 'economy',
  farrow: [23.7, 24, 22.5, 1.45, 24],
  door: { at: [29, 31.2, 29, 1.2, 32.5], id: 'd_mess_yard' },
  secondWind: [24.4, 31.5, 23, 1.4, 31.5],
  tonic: [56, 39.8, 56, 1.4, 38.5],
  // The master switch, up on the generator hall's gallery; from the hall floor under it there is nothing to press.
  power: { at: [56.5, 25.5, 56.5, 1.0, 24], y: 3, under: 0, opens: 'd_vault' },
  // The Forge, in the vault under the bunker.
  forge: { at: [26.6, 57.5, 24.75, 1.1, 57.5], y: -4.5 },
  range: { from: [33, 59.4], dummy: [33, 56.2], y: -4.5, horde: [34.5, 57.4] },
};
const NIGHT = {
  map: 'longest_night', tag: 'economy-night',
  // The Starlight: the Farrow by the kitchen arch, the door to the square, Second Wind at the end of the booths.
  farrow: [53.5, 95.3, 53.5, 1.45, 96.5],
  door: { at: [54, 87.6, 54, 1.2, 86.2], id: 'd_diner_square' },
  secondWind: [53.9, 93.5, 55.5, 1.4, 93.5],
  // Quickhands, in Tallow Lane.
  tonic: [80.5, 93.8, 80.5, 1.4, 92.5],
  // The master switch, on the plant room on Abelard's roof; on the store's upper floor under it there is nothing to press.
  power: { at: [100.75, 66.3, 100.75, 1.0, 65], y: 8, under: 4, opens: 'd_service' },
  // The Forge, in the signal room off the service tunnel, two storeys under the square.
  forge: { at: [60.3, 61.5, 58.25, 1.1, 61.5], y: -8 },
  range: { from: [68.3, 51.6], dummy: [68.3, 48.4], y: -8, horde: [68, 55] },
};
const P = process.argv.includes('--night') ? NIGHT : STATION;

(async () => {
  const env = { ...process.env, PORT: String(port), ZH_DEBUG: '1', ZH_MAP: P.map ?? '' };
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
    await page.goto(`${base}/?name=Ada&debug=1&autostart=1${P.map ? `&map=${P.map}` : ''}`);
    mkdirSync(path.join(root, 'test-results'), { recursive: true });
    const shot = (name) => page.screenshot({ path: path.join(root, `test-results/${P.tag}-${name}.png`) });
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
    /**
     * Stand at (x, z) looking at a point `ly` above the floor there, and wait for the prompt to say
     * something. `y` picks the floor where one lies over another (the gallery, the vault).
     */
    const face = async (x, z, lx, ly, lz, expect, y = null) => {
      await zh(([x, z, lx, ly, lz, y]) => { window.__zh.teleport(x, z, undefined, y ?? undefined); window.__zh.lookAt(lx, window.__zh.state().y + ly, lz); }, [x, z, lx, ly, lz, y]);
      return until(`prompt "${expect}"`, async () => { const p = (await state()).prompt; return p.includes(expect) && p; });
    };
    const pressF = () => zh(() => window.__zh.press('KeyF'));

    await page.waitForFunction(() => window.__zh?.state().phase === 'playing', null, { timeout: 30000 });
    if (P.map) assert((await state()).map === P.map, `the game should be on ${P.map}: it is on ${(await state()).map}`);
    await zh(() => { window.__zh.rounds(false); window.__zh.give(20000); });
    await until('points', async () => (await state()).points === 20500);

    // 1. A wall gun: 500 for the Farrow, then nothing to sell until rounds have been used.
    let prompt = await face(...P.farrow, 'Farrow');
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
    prompt = await face(...P.farrow, 'ammo [250]');
    await pressF();
    await until('ammo bought', async () => { const t = await state(); return t.points === 19750 && t.reserve === 64; });

    // 2. A door.
    prompt = await face(...P.door.at, 'open door [750]');
    await pressF();
    await until('the door', async () => (await state()).openDoors.includes(P.door.id));
    assert((await state()).points === 19000, 'the door costs 750');

    // 3. Alone, Second Wind is 500 and needs no power; the others wait for the mains.
    prompt = await face(...P.secondWind, 'Second Wind');
    assert(prompt.includes('[500]'), `solo Second Wind prompt: ${prompt}`);
    await pressF();
    await until('Second Wind', async () => (await state()).perks.includes('second_wind'));
    await sleep(450);
    await shot('tonic-drink');
    await face(...P.tonic, 'needs power');
    await shot('tonic-no-power');

    // 4. The master switch, a storey or two up: lights, the power's doors, the dispensers.
    // (From the floor under it there is nothing to press.)
    await zh(([x, z, lx, ly, lz, y]) => { window.__zh.teleport(x, z, undefined, y); window.__zh.lookAt(lx, y + ly, lz); }, [...P.power.at, P.power.under]);
    await sleep(400);
    assert((await state()).y === P.power.under && (await state()).prompt === '', `under the switch: ${(await state()).prompt}`);
    await face(...P.power.at, 'turn on the power', P.power.y);
    await shot('switch');
    await pressF();
    await until('power', async () => { const t = await state(); return t.power && t.openDoors.includes(P.power.opens); });
    await sleep(600);
    await shot('power-on');
    assert((await state()).prompt === '', 'the switch has nothing more to offer');

    // 5. A tonic.
    prompt = await face(...P.tonic, 'Quickhands');
    assert(prompt.includes('[3000]'), `tonic prompt: ${prompt}`);
    await shot('tonic');
    await pressF();
    await until('Quickhands', async () => (await state()).perks.join() === 'second_wind,quickhands');
    s = await state();
    assert(s.points === 15500, `after two tonics: ${s.points}`);
    assert(await zh(() => document.querySelectorAll('#perks .perk').length) === 2, 'two tonics in the HUD tray');
    await sleep(1500);

    // 6. The Forge.
    prompt = await face(...P.forge.at, 'forge the', P.forge.y);
    assert(prompt.includes('Farrow') && prompt.includes('[4000]'), `forge prompt: ${prompt}`);
    await shot('forge');
    await pressF();
    await until('the Forge at work', async () => (await state()).forge === 'working');
    s = await state();
    assert(s.points === 11500 && s.weapons.join() === 'warden', `in the Forge: ${s.points}, ${s.weapons}`);
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
    await zh((r) => { window.__zh.teleport(r.from[0], r.from[1], 0, r.y); window.__zh.dummy(r.dummy[0], r.dummy[1]); }, P.range);
    const dummy = await until('a dummy', async () => (await state()).entities.find((e) => e.kind === 'dummy'));
    await zh((d) => { window.__zh.key('Mouse2', true); window.__zh.lookAt(d.x, d.y + 1.2, d.z); }, dummy);
    await sleep(500);
    await shot('upgraded');
    await zh(() => window.__zh.press('Mouse0'));
    const hit = await until('a hit', async () => (await state()).hits.at(-1));
    assert(hit.dmg === 225, `upgraded Farrow body shot: ${hit.dmg}`);
    await zh(() => window.__zh.key('Mouse2', false));

    // 8. Down, alone, with Second Wind: back up without anyone's help, tonics gone.
    await zh((r) => window.__zh.spawnZombies(2, { x: r.horde[0], z: r.horde[1], y: r.y, speed: 4.8 }), P.range);
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
    console.log(`economy${P.map ? ` (${P.map})` : ''}: ok — wall gun, ammo, door, Second Wind, power, tonic, Forge, upgraded damage, self-revive`);
  } catch (e) {
    console.error(`economy: FAILED — ${e.message}`);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    server.kill();
  }
})();
