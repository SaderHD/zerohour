// Session 13 walk-through: menus, settings, lobby, chat, ping markers, pause, and what happens
// when things go wrong. Four browser players in one room. Acceptance: the session survives one
// client being killed and restarted mid-round (while junk is thrown at the server over raw
// sockets), and a server that dies is reported and recovered from.
// Run `npm run build` first. Usage: npm run ux. Writes test-results/ux-*.png.
const { spawn } = require('node:child_process');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { WebSocket } = require('ws');

const root = path.resolve(__dirname, '..');
const port = 21080 + Math.floor(Math.random() * 900);
const base = `http://localhost:${port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = (page) => page.evaluate(() => window.__zh.state());
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const until = async (what, fn, timeout = 15000) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error(`timed out waiting for ${what}`);
    await sleep(100);
  }
};

function startServer() {
  const env = { ...process.env, PORT: String(port), ZH_DEBUG: '1' };
  return spawn('node', ['server/dist/index.js'], { cwd: root, env, stdio: 'inherit' });
}
async function serverUp() {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${base}/healthz`)).ok) return; } catch {}
    await sleep(100);
  }
  throw new Error('server did not come up');
}

/** Throw rubbish at the server over raw sockets for `ms`. Returns how many sockets it got through. */
async function socketFuzz(ms, code) {
  const junk = [
    '', '{', 'null', '[]', '{"t":"start"}', '{"t":"move","x":1e999,"z":0,"seq":1,"yaw":0,"pitch":0,"state":0}', '{"t":"hello","v":"8"}',
    `{"t":"chat","text":"${'x'.repeat(9000)}"}`, '{"t":"__proto__"}', Buffer.from([0, 255, 1, 2]), '{"t":"debug","cmd":"give","points":1e9}',
  ];
  const valid = [
    { t: 'join', code }, { t: 'start' }, { t: 'again' }, { t: 'leave' }, { t: 'fire', seq: 1, slot: 0, yaw: 0, pitch: 0, aim: false, hits: [{ id: 1, zone: 'head', dist: 2 }] },
    { t: 'move', seq: 1, x: -5, z: 900, yaw: 0, pitch: 0, state: 2 }, { t: 'interact', id: 'd_mess_bunk', hold: true }, { t: 'revive', target: 1, hold: true },
    { t: 'chat', text: 'spam' }, { t: 'mark', x: 30, z: 30 }, { t: 'throw', kind: 'frag', yaw: 0, pitch: 0 }, { t: 'debug', cmd: 'killZombies' },
  ];
  const t0 = Date.now();
  let sockets = 0;
  const one = (polite) => new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    sockets++;
    const timer = setTimeout(() => ws.terminate(), 1500);
    ws.on('open', () => {
      if (polite) ws.send(JSON.stringify({ t: 'hello', v: 8, name: 'Fuzz' }));
      for (let i = 0; i < 400; i++) {
        if (ws.readyState !== WebSocket.OPEN) break;
        const m = polite ? valid[Math.floor(Math.random() * valid.length)] : junk[Math.floor(Math.random() * junk.length)];
        ws.send(typeof m === 'string' || Buffer.isBuffer(m) ? m : JSON.stringify(m));
      }
      if (!polite && Math.random() < 0.5) ws.terminate();
    });
    ws.on('close', () => { clearTimeout(timer); resolve(); });
    ws.on('error', () => {});
  });
  while (Date.now() - t0 < ms) await Promise.all([one(false), one(true), one(Math.random() < 0.5)]);
  return sockets;
}

(async () => {
  let server = startServer();
  let browser;
  try {
    await serverUp();
    browser = await chromium.launch();
    const errors = [];
    const context = () => browser.newContext({ viewport: { width: 960, height: 540 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const pageIn = async (ctx, query) => {
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(`${base}/?${query}`);
      return page;
    };
    mkdirSync(path.join(root, 'test-results'), { recursive: true });
    const shot = (page, name) => page.screenshot({ path: path.join(root, `test-results/ux-${name}.png`) });
    const text = (page, sel) => page.evaluate((s) => document.querySelector(s).textContent, sel);
    const shown = (page, sel) => page.evaluate((s) => getComputedStyle(document.querySelector(s)).display !== 'none', sel);

    // ------------------------------------------------------------ 1. menu, how to play, settings
    const ctxA = await context();
    let a = await pageIn(ctxA, 'name=Ada&debug=1');
    await a.waitForFunction(() => window.__zh?.state().phase === 'menu');
    await sleep(300);
    await shot(a, 'menu');
    await a.click('#menu-help');
    assert(await shown(a, '#help') && !(await shown(a, '#menu')), 'how to play should replace the menu');
    assert((await text(a, '#help')).includes('Going down'), 'how to play should explain going down');
    await shot(a, 'help');
    await a.keyboard.press('Escape');
    assert(await shown(a, '#menu') && !(await shown(a, '#help')), 'Esc should close how to play');

    await a.click('#menu-settings');
    const setRange = (id, v) => a.evaluate(([id, v]) => { const e = document.getElementById(id); e.value = String(v); e.dispatchEvent(new Event('input')); }, [id, v]);
    await setRange('set-sensitivity', 1.5);
    await setRange('set-fov', 90);
    await setRange('set-shake', 0.5);
    await setRange('vol-music', 40);
    await a.selectOption('#set-renderScale', '2');
    await a.uncheck('#set-dither');
    // Rebind "use" from F to E with a real key press; E's old job (decoy) takes F.
    await a.click('#key-use');
    assert((await text(a, '#key-use')).includes('press a key'), 'the key button should wait for a key');
    await a.keyboard.press('KeyE');
    assert(await text(a, '#key-use') === 'E' && await text(a, '#key-decoy') === 'F', 'use and decoy should have swapped keys');
    // Escape cancels a rebind and is never bound.
    await a.click('#key-reload');
    await a.keyboard.press('Escape');
    assert(await text(a, '#key-reload') === 'R', 'Escape should cancel a rebind');
    assert(await shown(a, '#settings'), 'cancelling a rebind should not close the settings');
    await shot(a, 'settings');
    let sa = await state(a);
    assert(sa.resolution[1] === 540, `render scale 2 should give 540 lines, got ${sa.resolution}`);
    assert(Math.abs(sa.sensitivity - 0.0033) < 1e-6, `sensitivity should be 1.5x, got ${sa.sensitivity}`);
    await a.click('#settings-back');

    // They survive a reload.
    await a.reload();
    await a.waitForFunction(() => window.__zh?.state().phase === 'menu');
    sa = await state(a);
    const kept = await a.evaluate(() => window.__zh.settings.data);
    assert(kept.fov === 90 && kept.renderScale === 2 && kept.dither === false && kept.sensitivity === 1.5 && kept.shake === 0.5 && kept.keys.use === 'KeyE',
      `settings should survive a reload: ${JSON.stringify(kept)}`);
    assert(sa.resolution[1] === 540 && sa.audio.volumes.music === 0.4, 'render scale and music volume should be applied after a reload');
    await a.evaluate(() => window.__zh.settings.set({ renderScale: 1, dither: true })); // the rest of the run in the stock picture

    // ------------------------------------------------------------ 2. lobby: invite link, chat, errors
    await a.click('#create');
    await a.waitForFunction(() => window.__zh.state().phase === 'lobby');
    const code = (await state(a)).room;
    await a.click('#copy-link');
    await until('the invite link', async () => (await text(a, '#lobby-note')).includes('copied') || (await text(a, '#lobby-note')).includes('?room='));
    const link = await a.evaluate(() => navigator.clipboard.readText().catch(() => '')) || `${base}/?room=${code}`;
    assert(link.endsWith(`?room=${code}`), `invite link should end in ?room=${code}: ${link}`);
    assert(await text(a, '#start') === 'Start solo', 'alone in the lobby the button should say Start solo');

    const ctxs = [ctxA];
    const others = [];
    for (const name of ['Bea', 'Cy', 'Dee']) {
      const ctx = await context();
      ctxs.push(ctx);
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errors.push(String(e)));
      await p.goto(`${link}&name=${name}&debug=1`); // the invite link, straight into the lobby
      await p.waitForFunction(() => window.__zh?.state().phase === 'lobby', null, { timeout: 10000 });
      others.push(p);
    }
    let [b, c, d] = others;
    const ctxD = ctxs[3];
    // A fifth is told the room is full and stays in the menu with the code filled in.
    const e5 = await pageIn(await context(), `room=${code}&name=Eve`);
    await e5.waitForFunction(() => document.getElementById('menu-error').textContent.includes('full'));
    assert(await e5.inputValue('#code') === code, 'the code from the link should be filled in');
    await shot(e5, 'room-full');
    await e5.close();

    await a.fill('#lobby-say', 'ready when you are');
    await a.press('#lobby-say', 'Enter');
    await b.waitForFunction(() => window.__zh.state().chat.some((l) => l.who === 'Ada' && l.text === 'ready when you are'));
    await b.fill('#lobby-say', '<b>two secs</b>');
    await b.press('#lobby-say', 'Enter');
    await a.waitForFunction(() => document.getElementById('lobby-chat').textContent.includes('Bea: <b>two secs</b>'));
    assert(await a.evaluate(() => document.querySelectorAll('#lobby-chat b').length) === 2, 'chat text must be shown as text, not markup');
    assert((await text(a, '#lobby-chat')).includes('Dee joined'), 'the lobby should say who joined');
    assert((await text(a, '#lobby-note')).includes('Waiting for 3'), `host note: ${await text(a, '#lobby-note')}`);
    // Chat is rate limited: a burst gets a polite refusal, not a kick.
    await c.evaluate(() => { for (let i = 0; i < 10; i++) window.__zh.chat(`spam ${i}`); });
    await c.waitForFunction(() => document.getElementById('lobby-chat').textContent.includes('Slow down'));
    assert((await state(c)).phase === 'lobby', 'a chat burst should not cost the seat');
    await shot(a, 'lobby');
    for (const p of [b, c, d]) await p.click('#ready');
    await a.waitForFunction(() => !document.getElementById('start').disabled);
    await a.click('#start');
    for (const p of [a, b, c, d]) await p.waitForFunction(() => window.__zh.state().phase === 'playing');
    await a.evaluate(() => { window.__zh.rounds(false); window.__zh.give(5000); });
    for (const p of [a, b, c, d]) await p.waitForFunction(() => window.__zh.state().remotes.filter((r) => r.visible).length === 3);

    // ------------------------------------------------------------ 3. in game: rebound key, pause, chat, ping
    assert((await text(a, '#hint')).includes('E buy'), `the hint should show the rebound key: ${await text(a, '#hint')}`);
    assert((await text(b, '#hint')).includes('F buy'), 'another player still has the default key');
    await a.evaluate(() => { window.__zh.teleport(29, 31.2); window.__zh.lookAt(29, 1.2, 32.5); });
    await until('a door prompt', async () => (await state(a)).prompt.startsWith('Press E'));
    const doorsBefore = (await state(a)).openDoors.length;
    await a.keyboard.press('KeyF'); // F is the decoy now: no door
    await sleep(300);
    assert((await state(a)).openDoors.length === doorsBefore && (await state(a)).points === 5500, 'the old key should no longer buy');
    await a.keyboard.press('KeyE');
    await until('the door bought with the rebound key', async () => (await state(a)).points < 5500);

    // Pause: Esc with the mouse free. The game goes on, the keys stop reaching it.
    await a.keyboard.press('Escape');
    assert((await state(a)).paused && await shown(a, '#pause'), 'Esc should open the pause screen');
    const before = await state(a);
    await a.keyboard.down('KeyW');
    await sleep(500);
    await a.keyboard.up('KeyW');
    const after = await state(a);
    assert(Math.hypot(after.x - before.x, after.z - before.z) < 0.01, 'a paused player should not walk');
    await shot(a, 'pause');
    await a.click('#pause-settings');
    assert(await shown(a, '#settings') && !(await shown(a, '#pause')), 'settings should open from the pause screen');
    await a.keyboard.press('Escape');
    assert(await shown(a, '#pause'), 'Esc should go back to the pause screen');
    await a.click('#resume');
    await until('resume', async () => !(await state(a)).paused);
    // With a real mouse lock (if this browser gives one), losing it is what pauses.
    await a.mouse.click(480, 270);
    await sleep(300);
    const locked = (await state(a)).locked;
    if (locked) {
      await a.evaluate(() => document.exitPointerLock());
      await until('pause on losing the mouse', async () => (await state(a)).paused);
      await a.click('#resume');
      await until('the mouse back', async () => { const s = await state(a); return s.locked && !s.paused; });
    }
    await a.keyboard.down('KeyW');
    await sleep(400);
    await a.keyboard.up('KeyW');
    assert(Math.hypot((await state(a)).x - after.x, (await state(a)).z - after.z) > 0.5, 'after resuming the keys should work again');

    // Chat: the chat key opens the box; typing does not move or shoot; Enter sends and closes.
    const shots = (await state(a)).shots;
    const at = await state(a);
    await a.keyboard.press('Enter');
    await until('the chat box', async () => (await state(a)).chatOpen);
    await a.keyboard.type('wasd door is open, come through', { delay: 5 });
    await sleep(200);
    const typed = await state(a);
    assert(Math.hypot(typed.x - at.x, typed.z - at.z) < 0.05 && typed.shots === shots, 'typing in chat should not move the player');
    await a.keyboard.press('Enter');
    await until('the chat box closed', async () => !(await state(a)).chatOpen);
    for (const p of [b, c, d]) await p.waitForFunction(() => window.__zh.state().chat.some((l) => l.text === 'wasd door is open, come through'));

    // Ping: A marks a spot with the real key; everyone sees it there, then it goes.
    await a.evaluate(() => { window.__zh.teleport(30, 28, 0); window.__zh.lookAt(33, 0.2, 24); });
    await b.evaluate(() => { window.__zh.teleport(28, 30, 0); window.__zh.lookAt(33, 1.4, 24); });
    await sleep(400);
    await a.keyboard.press('KeyZ');
    const idA = (await state(a)).playerId;
    for (const p of [a, b, c, d]) {
      const m = await until('the marker', async () => (await state(p)).marks.find((k) => k.id === idA));
      // On A's line of sight from (30, 28) towards (33, 24): at the floor there, or on whatever stands in the way.
      const along = ((m.x - 30) * 3 + (m.z - 28) * -4) / 5;
      const off = Math.abs((m.x - 30) * 4 + (m.z - 28) * 3) / 5;
      assert(off < 0.3 && along > 1.5 && along < 5.6, `the marker should be where A looked: ${JSON.stringify(m)}`);
    }
    await sleep(300);
    assert((await text(b, '#marks')).startsWith('Ada'), `the marker's tag should carry the name: ${await text(b, '#marks')}`);
    await shot(b, 'ping-and-chat');
    await until('the marker gone', async () => (await state(b)).marks.length === 0, 9000);

    // ------------------------------------------------------------ 4. a client killed and restarted mid-round, under fire
    for (const p of [a, b, c, d]) await p.evaluate(() => window.__zh.god(true));
    const idD = (await state(d)).playerId;
    await d.evaluate(() => window.__zh.teleport(31, 27));
    await a.evaluate(() => { window.__zh.rounds(true); window.__zh.setRound(4); });
    await until('round 4 under way', async () => { const s = await state(a); return s.round === 4 && s.roundPhase === 'active' && s.entities.length >= 3; }, 30000);
    const fuzzing = socketFuzz(9000, code);
    const roundAt = (await state(a)).zombiesLeft;
    await d.close(); // killed: no goodbye, the socket just goes
    for (const p of [a, b, c]) await p.waitForFunction(() => window.__zh.state().remotes.some((r) => r.name === 'Dee' && !r.connected), null, { timeout: 8000 });
    assert((await state(a)).chat.some((l) => l.text === 'Dee lost connection'), 'the others should be told Dee dropped');
    // The game does not wait: the round goes on and the zombies keep moving.
    const tick0 = (await state(a)).entities.map((z) => `${z.x},${z.z}`).join();
    await sleep(2500);
    const mid = await state(a);
    assert(mid.round === 4 && mid.roundPhase === 'active' && mid.zombiesLeft === roundAt, `the round should go on without Dee: round ${mid.round}, ${mid.zombiesLeft} of ${roundAt} left`);
    assert(mid.entities.length >= 3 && mid.entities.map((z) => `${z.x},${z.z}`).join() !== tick0, 'the world should still be moving');

    // Restarted: a brand-new tab in the same browser. Its old seat is offered back, and taking it
    // puts Dee where she was, as the same player.
    d = await pageIn(ctxD, 'name=Dee&debug=1');
    await d.waitForFunction(() => window.__zh?.state().phase === 'menu');
    await d.waitForFunction(() => !document.getElementById('rejoin').hidden, null, { timeout: 10000 });
    assert(await text(d, '#rejoin') === `Rejoin room ${code}`, `rejoin button: ${await text(d, '#rejoin')}`);
    await shot(d, 'rejoin');
    await d.click('#rejoin');
    await d.waitForFunction(() => window.__zh.state().phase === 'playing', null, { timeout: 8000 });
    const back = await state(d);
    assert(back.playerId === idD, `Dee should have her seat back (${idD}), got ${back.playerId}`);
    assert(Math.hypot(back.x - 31, back.z - 27) < 0.5, `Dee should be where she was, is at ${back.x},${back.z}`);
    assert(back.round === 4 && back.life === 'alive', `Dee should be in round 4 and alive: round ${back.round}, ${back.life}`);
    await d.waitForFunction(() => window.__zh.state().remotes.filter((r) => r.connected).length === 3);
    for (const p of [a, b, c]) await p.waitForFunction(() => window.__zh.state().remotes.some((r) => r.name === 'Dee' && r.connected));
    assert((await state(b)).chat.some((l) => l.text === 'Dee is back'), 'the others should be told Dee is back');
    // And once more the quick way: a reload of the same tab.
    await d.reload();
    await d.waitForFunction(() => window.__zh?.state().phase === 'playing', null, { timeout: 20000 }).catch(async (e) => {
      console.error('[ux] after reload:', JSON.stringify(await d.evaluate(() => ({ phase: window.__zh?.state().phase, net: window.__zh?.state().net, id: window.__zh?.state().playerId, err: document.getElementById('menu-error').textContent, tok: sessionStorage.getItem('zh_token'), seat: localStorage.getItem('zh_seat') }))));
      throw e;
    });
    assert((await state(d)).playerId === idD, 'a reload should resume the seat');

    // The junk at the door did not get in, and did not hurt.
    const sockets = await fuzzing;
    assert((await fetch(`${base}/healthz`)).ok, 'the server should still answer');
    for (const p of [a, b, c, d]) {
      const s = await state(p);
      assert(s.phase === 'playing' && s.connected && s.roster.length === 4, `${s.roster.length} players, phase ${s.phase} after the fuzz`);
    }
    assert(!(await state(a)).chat.some((l) => l.text === 'spam' && l.who === 'Fuzz'), 'a stranger should not be able to chat into the room');

    // All four finish the round together and the next one starts.
    await d.evaluate(() => window.__zh.god(true));
    await until('round 5 for everyone', async () => {
      await a.evaluate(() => window.__zh.killZombies());
      const rounds = await Promise.all([a, b, c, d].map(async (p) => (await state(p)).round));
      return rounds.every((r) => r === 5);
    }, 60000);
    await d.evaluate(() => { window.__zh.teleport(30.5, 27.5, 0); });
    await a.evaluate(() => { window.__zh.teleport(30.5, 31, 0); window.__zh.lookAt(30.5, 1.3, 27.5); });
    await sleep(600);
    await shot(a, 'four-after-restart');

    // ------------------------------------------------------------ 5. the server dies, and comes back
    server.kill('SIGKILL');
    await until('the connection notice', async () => (await state(a)).net === 'down', 8000);
    await sleep(1200);
    assert((await text(a, '#netlost-title')) === 'CONNECTION LOST' && (await text(a, '#netlost-text')).includes(code), `notice: ${await text(a, '#netlost-text')}`);
    await shot(a, 'connection-lost');
    server = startServer();
    await serverUp();
    // The new server knows nothing of the old game: back to the menu, and told why.
    await a.waitForFunction(() => window.__zh.state().phase === 'menu' && window.__zh.state().net === 'ok', null, { timeout: 15000 });
    assert((await text(a, '#menu-error')).includes('seat was given up'), `menu notice: ${await text(a, '#menu-error')}`);
    await shot(a, 'after-restart');
    await a.click('#create');
    await a.waitForFunction(() => window.__zh.state().phase === 'lobby');

    // ------------------------------------------------------------ 6. the same seat opened in a second tab
    const a2 = await ctxA.newPage();
    await a2.addInitScript((token) => sessionStorage.setItem('zh_token', token), await a.evaluate(() => sessionStorage.getItem('zh_token')));
    await a2.goto(`${base}/?name=Ada`);
    await a2.waitForFunction(() => window.__zh?.state().phase === 'lobby', null, { timeout: 8000 });
    await until('the first tab told its seat is taken', async () => (await state(a)).net === 'fatal');
    assert((await text(a, '#netlost-title')) === 'SEAT TAKEN', 'the first tab should say its seat was taken');
    await shot(a, 'seat-taken');

    assert(errors.length === 0, `page errors:\n${errors.join('\n')}`);
    console.log(`[ux] ok — room ${code}; 4 players through a kill and restart while ${sockets} hostile sockets hammered the server; pointer lock ${locked ? 'tested' : 'not available here'}`);
  } catch (e) {
    console.error('[ux] FAILED:', e.message, (e.stack.match(/ux\.cjs:\d+/) || [''])[0]);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    server.kill('SIGTERM');
  }
})();
