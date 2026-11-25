// Choosing the map: two browser players and a bot in one room on a debug server (which offers the
// proving ground as well as the maps people play). The host picks another map in the lobby; both
// pages load it and keep their seats; the game starts on it and the bot, which was started knowing
// only the station, plays there. Then a server without debug: one map on offer, nothing to choose.
// Run `npm run build` first. Usage: npm run maps. Writes test-results/maps-*.png.
const { spawn } = require('node:child_process');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const port = 22080 + Math.floor(Math.random() * 900);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = (page) => page.evaluate(() => window.__zh.state());
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const shot = (page, name) => page.screenshot({ path: path.join(root, `test-results/maps-${name}.png`) });

async function serve(p, extra) {
  const server = spawn('node', ['server/dist/index.js'], { cwd: root, env: { ...process.env, PORT: String(p), ...extra }, stdio: 'inherit' });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`http://localhost:${p}/healthz`)).ok) break; } catch {}
    await sleep(100);
  }
  return server;
}

(async () => {
  mkdirSync(path.join(root, 'test-results'), { recursive: true });
  const env = { ...process.env };
  delete env.ZH_MAP;
  const debugServer = await serve(port, { ZH_DEBUG: '1', ZH_MAP: '' });
  const plainServer = await serve(port + 1, { ZH_DEBUG: '', ZH_MAP: '' });
  let browser;
  let bot;
  try {
    browser = await chromium.launch();
    const errors = [];
    const open = async (base, query) => {
      const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      await page.goto(`${base}/?${query}`);
      await page.waitForFunction(() => window.__zh?.state().phase === 'menu');
      return page;
    };
    const picker = (page) => page.evaluate(() => {
      const s = document.getElementById('lobby-map');
      return { value: s.value, disabled: s.disabled, options: [...s.options].map((o) => `${o.value}=${o.text}`) };
    });
    const inLobbyOn = (page, map) => page.waitForFunction((id) => {
      const s = window.__zh?.state();
      return s && s.phase === 'lobby' && s.map === id && document.getElementById('lobby-map').value === id;
    }, map);

    // 1. A lobby on the station: the host may choose, the guest may only look.
    const base = `http://localhost:${port}`;
    const a = await open(base, 'name=Ada&debug=1');
    await a.click('#create');
    await inLobbyOn(a, 'harrow_ridge');
    const code = (await state(a)).room;
    const b = await open(base, 'name=Bea&debug=1');
    await b.fill('#code', code);
    await b.click('#join');
    await inLobbyOn(b, 'harrow_ridge');
    const pa = await picker(a);
    const pb = await picker(b);
    assert(pa.options.join() === 'harrow_ridge=Harrow Ridge Station,stacks=The Stacks', `host is offered ${pa.options}`);
    assert(!pa.disabled && pb.disabled, `the host's picker should be live and the guest's not: ${pa.disabled} ${pb.disabled}`);
    await b.click('#ready');
    await a.waitForFunction(() => !document.getElementById('start').disabled);
    const ids = [(await state(a)).playerId, (await state(b)).playerId];
    await shot(a, 'lobby-station');

    // 2. The host picks the Stacks: both pages load it, in the same seats of the same room, and
    //    whoever was ready is asked again.
    await a.selectOption('#lobby-map', 'stacks');
    for (const p of [a, b]) await inLobbyOn(p, 'stacks');
    const [sa, sb] = [await state(a), await state(b)];
    assert(sa.room === code && sb.room === code, `rooms after the change: ${sa.room} ${sb.room}, was ${code}`);
    assert(sa.playerId === ids[0] && sb.playerId === ids[1], `seats after the change: ${sa.playerId} ${sb.playerId}, were ${ids}`);
    assert(sa.isHost && !sb.isHost, 'the host should still be the host');
    assert(/[?&]map=stacks(&|$)/.test(a.url()), `the address should name the map: ${a.url()}`);
    await a.waitForFunction(() => document.querySelectorAll('#lobby-players li').length === 2 && document.getElementById('start').disabled);
    assert((await b.textContent('#ready')) === 'Ready', 'the guest should be asked to ready up again');
    await sleep(600);
    await shot(a, 'lobby-stacks');

    // 3. A bot that knows only the station joins; the game starts on the Stacks and everyone is there.
    bot = spawn('npx', ['tsx', 'server/src/bot.ts', code, '1', `ws://localhost:${port}/ws`], { cwd: root, env, stdio: 'inherit' });
    await a.waitForFunction(() => document.querySelectorAll('#lobby-players li').length === 3);
    await b.click('#ready');
    await a.waitForFunction(() => !document.getElementById('start').disabled);
    await a.click('#start');
    for (const p of [a, b]) await p.waitForFunction(() => window.__zh.state().phase === 'playing' && window.__zh.state().life === 'alive');
    for (const p of [a, b]) {
      const s = await state(p);
      assert(s.map === 'stacks' && s.zone === 'hall', `in the game on ${s.map}, in ${s.zone}`);
      assert(s.mapErrors.length === 0, `map errors: ${s.mapErrors}`);
    }
    // The bot plays the Stacks: once the first round's zombies are in, it moves about that floor and shoots.
    await a.waitForFunction(() => window.__zh.state().remotes.filter((r) => r.visible).length === 2);
    const where = async () => (await state(a)).remotes.find((r) => r.name.startsWith('Bot'));
    const from = await where();
    let moved = 0;
    for (let i = 0; i < 240 && moved < 1.5; i++) {
      await sleep(250);
      const now = await where();
      moved = Math.max(moved, Math.hypot(now.x - from.x, now.z - from.z));
    }
    assert(moved >= 1.5, `the bot should be fighting on the Stacks: it moved ${moved.toFixed(2)} m`);
    await sleep(500);
    await shot(a, 'game-stacks');

    // 4. A server without debug offers the one map: nothing to choose, and a hand-made request changes nothing.
    const c = await open(`http://localhost:${port + 1}`, 'name=Cy');
    await c.click('#create');
    await inLobbyOn(c, 'harrow_ridge');
    const pc = await picker(c);
    assert(pc.options.length === 1 && pc.disabled, `a plain server offers ${pc.options} (disabled ${pc.disabled})`);
    await c.evaluate(() => {
      const s = document.getElementById('lobby-map');
      s.add(Object.assign(document.createElement('option'), { value: 'stacks', text: 'x' }));
      s.value = 'stacks';
      s.onchange();
    });
    await sleep(500);
    assert((await state(c)).map === 'harrow_ridge' && (await picker(c)).value === 'harrow_ridge', 'a plain server must not be talked onto the proving ground');
    await c.click('#start');
    await c.waitForFunction(() => window.__zh.state().phase === 'playing');
    assert((await state(c)).map === 'harrow_ridge', 'the plain server plays the station');

    assert(errors.length === 0, `page errors:\n${errors.join('\n')}`);
    console.log('[maps] ok: host picks the map, pages and seats follow, the bot plays it; a plain server offers one');
  } catch (err) {
    console.error(`[maps] FAILED: ${err.message}`);
    process.exitCode = 1;
  } finally {
    bot?.kill();
    await browser?.close();
    debugServer.kill();
    plainServer.kill();
  }
})();
