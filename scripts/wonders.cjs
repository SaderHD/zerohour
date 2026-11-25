// Session 11 in a real browser: boots the built server, plays a solo debug game and walks through
// the Cache (roll, take, Jinx, move), all six power-ups, every Cache weapon in the hand, the
// Arclight and the Gravewell against a 24-zombie horde, the Siren decoy and a howler round.
// Screenshots go to test-results/wonders-*.png. Usage: npm run build && npm run wonders
// `npm run wonders -- --night` does it on The Longest Night: the Cache under the square's south
// wall, the rest out in Wexler Square (wonders-night-*.png).
const { spawn } = require('node:child_process');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const port = 23080 + Math.floor(Math.random() * 900);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const GUNS = ['coachman', 'kestrel', 'brakeman', 'halberd', 'longwatch', 'ferrier', 'thumper', 'arclight', 'gravewell'];
const POWERUPS = ['resupply', 'reaper', 'double', 'firestorm', 'rebuild', 'clearance'];

// Where it happens, by map. `cache`: the site the Cache starts on, where to stand to use it, where
// its beam and its leaving are seen from; `hands`: indoors, for the guns in the hand; `drops`: a
// row of six power-ups and where it is looked at from; `stand`: where the wonder weapons are fired
// from, the packs east of it; `siren`: the pack, and where the decoy is thrown; `howl`: where the
// howler round is met.
const STATION = {
  map: null, tag: 'wonders',
  cache: { site: 'cache_yard', at: [20.5, 37], use: [22.3, 37], beam: [26.5, 40.5], leaving: [24, 38.5] },
  hands: [28, 27, 0.4],
  drops: { x: 26.5, z: 46, from: [30, 50.5] },
  stand: [22, 49], arclight: [28, 49], gravewell: [29, 49],
  siren: { pack: [36, 48], aim: [30, 44.5] },
  howl: [36.5, 47, 0.6],
};
const NIGHT = {
  map: 'longest_night', tag: 'wonders-night',
  cache: { site: 'cache_square', at: [67, 85.5], use: [67, 83.6], beam: [62, 82.5], leaving: [64.5, 83] },
  hands: [47.5, 92, 0.4],
  // Wexler Square: the south-west of it, between the rink and the stalls.
  drops: { x: 54, z: 77, from: [57.5, 81.5] },
  stand: [53.3, 83.8], arclight: [58.5, 83.8], gravewell: [59, 83.8],
  siren: { pack: [68.3, 83], aim: [61, 79.5] },
  howl: [60, 83, -0.9],
};
const P = process.argv.includes('--night') ? NIGHT : STATION;
const SITE = P.cache.site;

(async () => {
  const env = { ...process.env, PORT: String(port), ZH_DEBUG: '1', ZH_MAP: P.map ?? '' };
  const server = spawn('node', ['server/dist/index.js'], { cwd: root, env, stdio: 'inherit' });
  let browser;
  try {
    for (let i = 0; i < 50; i++) {
      try { if ((await fetch(`http://localhost:${port}/healthz`)).ok) break; } catch {}
      await sleep(100);
    }
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`http://localhost:${port}/?name=Ada&debug=1&autostart=1${P.map ? `&map=${P.map}` : ''}`);
    await page.waitForFunction(() => window.__zh?.state().phase === 'playing', null, { timeout: 30000 });
    mkdirSync(path.join(root, 'test-results'), { recursive: true });
    const state = () => page.evaluate(() => window.__zh.state());
    const shot = (name) => page.screenshot({ path: path.join(root, `test-results/${P.tag}-${name}.png`) });
    const zh = (fn, arg) => page.evaluate(fn, arg);
    const until = async (what, fn, timeout = 20000) => {
      const t0 = Date.now();
      for (;;) {
        const v = await fn();
        if (v) return v;
        if (Date.now() - t0 > timeout) throw new Error(`timed out waiting for ${what}`);
        await sleep(80);
      }
    };
    const box = async (site) => (await state()).cache.boxes.find((b) => b.site === site);
    await zh(() => { window.__zh.rounds(false); window.__zh.god(true); window.__zh.openAllDoors(); window.__zh.give(30000); });
    await sleep(600);

    // 1. The Cache stands on its first site under its beam. A roll: the lid lifts, weapons flicker past, one hangs there.
    /** Stand at `from` and look at the Cache's site, `h` metres up. */
    const atCache = (from, h) => zh(([x, z, cx, cz, h]) => { window.__zh.teleport(x, z, 0); window.__zh.lookAt(cx, h, cz); }, [...from, ...P.cache.at, h]);
    await atCache(P.cache.beam, 3.2);
    await sleep(500);
    assert((await state()).cache.home === SITE, `the Cache should start on ${SITE}: it is on ${(await state()).cache.home}`);
    await shot('cache-beam');
    await atCache(P.cache.use, 0.9);
    await until('the Cache prompt', async () => (await state()).prompt.includes('open the Cache [950]'), 3000);
    await shot('cache-prompt');
    const before = (await state()).points;
    await zh(() => { window.__zh.cacheNext('halberd'); window.__zh.press('KeyF'); });
    await until('the roll', async () => (await box(SITE)).phase === 'rolling', 3000);
    assert((await state()).points === before - 950, 'a roll costs 950');
    await sleep(1500);
    await shot('cache-rolling');
    await until('the offer', async () => (await box(SITE)).phase === 'offering', 6000);
    await sleep(300);
    assert((await box(SITE)).shown === 'halberd', 'the crate should show the Halberd');
    await until('the take prompt', async () => (await state()).prompt.includes('take the "Halberd"'), 2000);
    await shot('cache-offer');
    await zh(() => window.__zh.press('KeyF'));
    await until('the Halberd in hand', async () => (await state()).weapon === 'halberd', 3000);
    await sleep(500);

    // 2. The Jinx: a skull, the points back, and the crate leaves for another site.
    const paid = (await state()).points;
    await zh(() => { window.__zh.cacheNext('jinx'); window.__zh.press('KeyF'); });
    await until('the Jinx', async () => (await box(SITE)).phase === 'jinx', 8000);
    await sleep(700);
    await shot('cache-jinx');
    assert((await state()).points === paid, 'a Jinx refunds the roll');
    await until('the Cache leaving', async () => (await box(SITE)).phase === 'moving', 5000);
    await atCache(P.cache.leaving, 6);
    await sleep(900);
    await shot('cache-leaving');
    const home = await until('a new home', async () => { const c = (await state()).cache; return c.home !== SITE && c.home; }, 6000);
    await sleep(800);
    assert(!(await box(SITE)).visible, 'the old site should be empty');
    assert((await box(home)).visible, 'the new site should have the Cache');
    console.log(`[wonders] the Cache moved to ${home}`);
    await shot('cache-gone');

    // 3. Every gun the Cache can give, in the hand (the seven that were placeholders, and the two wonder weapons).
    await zh(([x, z, yaw]) => { window.__zh.powerOn(); window.__zh.teleport(x, z, 0); window.__zh.look(yaw, 0); }, P.hands);
    for (const gun of GUNS) {
      await zh((g) => window.__zh.give(g), gun);
      await until(`the ${gun}`, async () => (await state()).weapon === gun, 3000);
      await sleep(650);
      await shot(`gun-${gun}`);
    }

    // 4. Power-ups: all six in a row on the snow, then walked through one by one.
    await zh(([kinds, d]) => { window.__zh.teleport(d.from[0], d.from[1], 0); kinds.forEach((k, i) => window.__zh.powerup(k, d.x + i * 1.4, d.z)); window.__zh.lookAt(d.from[0], -0.6, d.z); }, [POWERUPS, P.drops]);
    await until('six drops', async () => (await state()).powerups.length === 6, 3000);
    await sleep(700);
    await shot('powerups');
    for (let i = 0; i < POWERUPS.length; i++) {
      await zh(([x, z]) => window.__zh.teleport(x, z, 0), [P.drops.x + i * 1.4, P.drops.z]);
      await until(`taking ${POWERUPS[i]}`, async () => (await state()).powerupsTaken.includes(POWERUPS[i]), 3000);
    }
    await zh(() => window.__zh.look(0, 0));
    await sleep(500);
    const fx = await state();
    assert(fx.powerups.length === 0, 'every drop should be gone');
    assert(['reaper', 'double', 'clearance'].every((k) => fx.effects.includes(k)), `timed effects running: ${fx.effects}`);
    assert(fx.grenades === 4, 'Resupply should fill the grenades');
    assert(fx.cache.boxes.every((b) => b.visible), 'during Clearance the Cache is at every site');
    await shot('powerup-timers');
    await atCache(P.cache.use, 0.9);
    await until('the Clearance price', async () => (await state()).prompt.includes('open the Cache [10]'), 3000);
    await shot('clearance');

    // 5. The Arclight against 24 zombies with round-30 health: one bolt, eight bodies.
    //    (Reaper is still running from step 4; it makes no difference to a wonder weapon.)
    const horde = async (n, x, z) => {
      await zh(([n, x, z]) => { window.__zh.killZombies(); for (let i = 0; i < n; i++) window.__zh.spawnZombies(1, { x: x + (i % 6) * 0.9, z: z + Math.floor(i / 6) * 0.9 - 1.4, speed: 0.6, hp: 7000 }); }, [n, x, z]);
      await until(`${n} zombies`, async () => (await state()).entities.filter((e) => e.kind === 'zombie').length === n, 5000);
    };
    const aimAtNearest = () => zh(() => {
      const s = window.__zh.state();
      const z = s.entities.filter((e) => e.kind !== 'dummy').sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z))[0];
      window.__zh.lookAt(z.x, z.y + 1.2, z.z);
    });
    await zh(([x, z]) => { window.__zh.teleport(x, z, 0); window.__zh.give('arclight'); }, P.stand);
    await until('the Arclight', async () => (await state()).weapon === 'arclight', 3000);
    await horde(24, ...P.arclight);
    await sleep(900);
    await aimAtNearest();
    await sleep(200);
    await shot('arclight-horde');
    const k0 = (await state()).kills;
    await zh(() => window.__zh.press('Mouse0'));
    await until('the chain', async () => (await state()).chains.length > 0, 3000);
    await sleep(60);
    await shot('arclight-chain');
    const arc = await state();
    console.log(`[wonders] Arclight: one bolt struck ${arc.chains.at(-1)} of 24, ${arc.kills - k0} killed`);
    assert(arc.chains.at(-1) === 8, `the bolt should chain through 8, got ${arc.chains.at(-1)}`);
    assert(arc.kills - k0 >= 8, 'eight should be dead');
    await sleep(700);
    await shot('arclight-after');
    // Forged, it reaches further: fourteen.
    await zh(() => window.__zh.give('arclight', true));
    await until('the forged Arclight', async () => { const s = await state(); return s.upgraded[s.slot]; }, 3000);
    await horde(24, ...P.arclight);
    await sleep(900);
    await aimAtNearest();
    await sleep(250);
    await shot('gun-arclight-forged');
    await zh(() => window.__zh.press('Mouse0'));
    await until('the longer chain', async () => (await state()).chains.length > 1, 3000);
    await sleep(60);
    await shot('arclight-forged-chain');
    assert((await state()).chains.at(-1) === 14, `forged, the bolt should chain through 14, got ${(await state()).chains.at(-1)}`);

    // 6. The Gravewell against 24: the orb, the singularity dragging them in, the implosion.
    await zh(() => window.__zh.give('gravewell'));
    await until('the Gravewell', async () => (await state()).weapon === 'gravewell', 3000);
    await horde(24, ...P.gravewell);
    await sleep(700);
    await aimAtNearest();
    await sleep(200);
    const k1 = (await state()).kills;
    await zh(() => window.__zh.press('Mouse0'));
    await until('the orb', async () => (await state()).fx.kinds.includes('orb'), 3000);
    await shot('gravewell-orb');
    await until('the singularity', async () => (await state()).fx.kinds.includes('well'), 5000);
    await sleep(1600);
    await shot('gravewell-pull');
    const boom = (await state()).explosions;
    await until('the implosion', async () => (await state()).explosions > boom, 6000);
    await sleep(80);
    await shot('gravewell-implode');
    await sleep(500);
    const well = await state();
    console.log(`[wonders] Gravewell: one orb killed ${well.kills - k1} of 24`);
    assert(well.kills - k1 >= 20, `the implosion should take nearly all of them, got ${well.kills - k1}`);
    assert(well.hp === 100, 'the Gravewell should not hurt its owner');

    // 7. The Siren: thrown past a pack, they turn and go to it; then it blows.
    await zh(([x, z]) => { window.__zh.killZombies(); window.__zh.god(false); window.__zh.give('siren'); window.__zh.teleport(x, z, 0); }, P.stand);
    await until('three Sirens', async () => (await state()).tacticals === 3, 3000);
    await zh((sn) => { for (let i = 0; i < 8; i++) window.__zh.spawnZombies(1, { x: sn.pack[0] + (i % 4) * 0.9, z: sn.pack[1] + Math.floor(i / 4) * 0.9, speed: 2.2, hp: 400 }); window.__zh.lookAt(sn.aim[0], 1.6, sn.aim[1]); }, P.siren);
    await sleep(300);
    await zh(() => window.__zh.press('KeyE'));
    await until('the Siren in the air', async () => (await state()).fx.kinds.includes('siren'), 3000);
    await sleep(3800);
    await zh(() => { const s = window.__zh.state(); const z = s.entities[0]; window.__zh.lookAt(z.x, z.y + 1, z.z); });
    await sleep(300);
    await shot('siren');
    const lured = await state();
    assert(lured.hurts === 0 && lured.hp === 100, 'the pack should be at the Siren, not at us');
    assert(lured.tacticals === 2, 'one Siren spent');
    await until('the Siren going off', async () => !(await state()).fx.kinds.includes('siren'), 6000);
    await zh(() => { window.__zh.god(true); window.__zh.killZombies(); });

    // 8. A howler round: lightning, then the pack.
    await zh(([x, z, yaw]) => { window.__zh.teleport(x, z, 0); window.__zh.look(yaw, 0.05); window.__zh.give('halberd'); window.__zh.setRound(6, true); }, P.howl);
    await until('lightning', async () => (await state()).strikes > 0, 8000);
    await zh(() => { const s = window.__zh.state(); window.__zh.lookAt(s.lastStrike.x, 3, s.lastStrike.z); });
    const seen = (await state()).strikes;
    await until('the next strike', async () => (await state()).strikes > seen, 8000);
    await zh(() => { const s = window.__zh.state(); window.__zh.lookAt(s.lastStrike.x, 3, s.lastStrike.z); });
    await shot('howler-strike');
    await until('howlers', async () => (await state()).entities.filter((e) => e.kind === 'howler').length >= 4, 15000);
    const special = await state();
    assert(special.roundPhase === 'special', `round phase ${special.roundPhase}`);
    await zh(() => { const s = window.__zh.state(); const h = s.entities.filter((e) => e.kind === 'howler').sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z))[0]; window.__zh.lookAt(h.x, h.y + 0.6, h.z); });
    await sleep(250);
    await shot('howlers');
    await until('howlers at our heels', async () => { const s = await state(); return s.entities.filter((e) => e.kind === 'howler' && Math.hypot(e.x - s.x, e.z - s.z) < 2.5).length >= 3; }, 20000);
    await zh(() => { const s = window.__zh.state(); const h = s.entities.filter((e) => e.kind === 'howler').sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z))[0]; window.__zh.lookAt(h.x, h.y + 0.5, h.z); });
    await sleep(250);
    await shot('howlers-close');
    const end = await state();
    console.log(`[wonders] howler round: ${end.entities.filter((e) => e.kind === 'howler').length} howlers in, ${end.zombiesLeft} to go; ${end.fps} fps, ${end.drawCalls} draw calls`);
    assert(end.drawCalls < 150, `draw calls ${end.drawCalls} >= 150`);
    assert(errors.length === 0, `page errors:\n${errors.join('\n')}`);
    console.log(`[wonders] ok${P.map ? ` (${P.map})` : ''}`);
  } catch (e) {
    console.error('[wonders] FAILED:', e.message);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    server.kill('SIGTERM');
  }
})();
