// Session 12 in a real browser. Three parts:
//  1. every sound in the catalogue is rendered offline, checked (it is there, it does not clip)
//     and written to test-results/audio/<name>.wav;
//  2. the three volume sliders are moved and what comes out is measured;
//  3. a solo debug game is played through everything that makes a noise while the output is
//     recorded to test-results/audio-session.webm, with the voice limit and the feel hooks
//     (shake, damage direction) checked on the way.
// Usage: npm run build && npm run audio
const { spawn } = require('node:child_process');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const port = 24080 + Math.floor(Math.random() * 900);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const GUNS = ['warden', 'dockhand', 'farrow', 'pike', 'stitch', 'coachman', 'kestrel', 'brakeman', 'halberd', 'longwatch', 'ferrier', 'thumper', 'arclight', 'gravewell'];
const POWERUPS = ['resupply', 'reaper', 'double', 'firestorm', 'rebuild', 'clearance'];

/** 16-bit mono PCM (base64) to a .wav file. */
function writeWav(file, b64, rate) {
  const pcm = Buffer.from(b64, 'base64');
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + pcm.length, 4); head.write('WAVEfmt ', 8); head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22); head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * 2, 28);
  head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(pcm.length, 40);
  writeFileSync(file, Buffer.concat([head, pcm]));
}

(async () => {
  const env = { ...process.env, PORT: String(port), ZH_DEBUG: '1' };
  const server = spawn('node', ['server/dist/index.js'], { cwd: root, env, stdio: 'inherit' });
  let browser;
  try {
    for (let i = 0; i < 50; i++) {
      try { if ((await fetch(`http://localhost:${port}/healthz`)).ok) break; } catch {}
      await sleep(100);
    }
    browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
    const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const url = `http://localhost:${port}/?name=Ada&debug=1&autostart=1`;
    await page.goto(url);
    await page.waitForFunction(() => window.__zh?.state().phase === 'playing', null, { timeout: 15000 });
    const out = path.join(root, 'test-results');
    mkdirSync(path.join(out, 'audio'), { recursive: true });
    const state = () => page.evaluate(() => window.__zh.state());
    const shot = (name) => page.screenshot({ path: path.join(out, `audio-${name}.png`) });
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
    const press = (code) => zh((c) => window.__zh.press(c), code);
    /** Record for `ms` while `during` runs; returns the level of what was heard, in half-second windows. */
    const listen = async (ms, during = async () => {}, save = null) => {
      await zh(() => window.__zh.audio.record(true));
      const t0 = Date.now();
      await during();
      await sleep(Math.max(0, ms - (Date.now() - t0)));
      const b64 = await zh(() => window.__zh.audio.record(false));
      if (save) writeFileSync(save, Buffer.from(b64, 'base64'));
      return zh(async (b64) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const buf = await window.__zh.audio.ctx.decodeAudioData(bytes.buffer);
        const d = buf.getChannelData(0);
        const win = Math.floor(buf.sampleRate / 2);
        const windows = [];
        let peak = 0;
        let total = 0;
        for (let i = 0; i + win <= d.length; i += win) {
          let sum = 0;
          for (let j = i; j < i + win; j++) { sum += d[j] * d[j]; peak = Math.max(peak, Math.abs(d[j])); }
          total += sum;
          windows.push(Math.sqrt(sum / win));
        }
        return { seconds: buf.duration, peak, rms: Math.sqrt(total / Math.max(1, windows.length * win)), windows };
      }, b64);
    };

    await zh(() => window.__zh.audio.unlock());
    await until('the audio context', async () => (await state()).audio?.state === 'running', 5000);

    // ---------------------------------------------------------------- 1. the library, offline
    const names = await zh(() => window.__zh.audio.names());
    let quietest = ['', 1];
    let loudest = ['', 0];
    for (const name of names) {
      const r = await zh((n) => window.__zh.audio.render(n, true), name);
      assert(r, `no such sound: ${name}`);
      writeWav(path.join(out, 'audio', `${name}.wav`), r.pcm, r.rate);
      assert(r.peak > 0.03, `${name} is all but silent (peak ${r.peak.toFixed(4)})`);
      assert(r.peak <= 1, `${name} clips (peak ${r.peak.toFixed(2)})`);
      if (process.env.AUDIO_LEVELS) console.log(`${name.padEnd(26)} peak ${r.peak.toFixed(2)}  rms ${r.rms.toFixed(3)}`);
      if (r.peak < quietest[1]) quietest = [name, r.peak];
      if (r.peak > loudest[1]) loudest = [name, r.peak];
    }
    console.log(`[audio] ${names.length} sounds rendered to test-results/audio/*.wav; peaks from ${quietest[1].toFixed(2)} (${quietest[0]}) to ${loudest[1].toFixed(2)} (${loudest[0]})`);
    for (const need of [...GUNS.map((g) => `shot-${g}`), ...POWERUPS.map((p) => `powerup-${p}`), 'tonic-ironhide', 'tonic-packmule', 'step-snow', 'step-metal', 'cache-roll', 'round-start', 'round-end', 'heartbeat', 'groan']) {
      assert(names.includes(need), `the catalogue lacks ${need}`);
    }

    if (process.env.AUDIO_LEVELS) return;

    // ---------------------------------------------------------------- 2. the sliders
    await zh(() => { window.__zh.rounds(false); window.__zh.god(true); });
    await sleep(500);
    const slide = (key, v) => zh(([key, v]) => {
      const el = document.getElementById(`vol-${key}`);
      el.value = String(v);
      el.dispatchEvent(new Event('input'));
    }, [key, v]);
    const gun = () => zh(() => window.__zh.audio.play('shot-pike'));
    const sting = () => zh(() => window.__zh.audio.play('round-end'));
    await slide('master', 100); await slide('sfx', 100); await slide('music', 0);
    const shotLoud = await listen(1000, gun);
    const stingMuted = await listen(1500, sting);
    await slide('sfx', 0);
    const shotMuted = await listen(1000, gun);
    await slide('music', 100);
    const stingLoud = await listen(1500, sting);
    await slide('sfx', 100); await slide('master', 0);
    const allMuted = await listen(1000, async () => { await gun(); await sting(); });
    await slide('master', 50); await slide('music', 0);
    const half = await listen(1000, gun);
    await slide('master', 80); await slide('sfx', 0); await slide('music', 70);
    await sleep(4000); // the sting rings on for a while
    const air = await listen(1500);
    await slide('sfx', 100);
    console.log(`[audio] sliders: shot ${shotLoud.rms.toFixed(4)} (sfx 0: ${shotMuted.rms.toFixed(4)}, master 50%: ${half.rms.toFixed(4)}), sting ${stingLoud.rms.toFixed(4)} (music 0: ${stingMuted.rms.toFixed(4)}), master 0: ${allMuted.rms.toFixed(5)}`);
    console.log(`[audio] the air of the ${(await state()).zone} alone: rms ${air.rms.toFixed(4)}`);
    assert(air.rms > 0.004 && air.rms < 0.06, 'the drone should be there, and stay under everything else');
    assert(shotLoud.rms > 0.02, 'a shot should be heard');
    assert(shotMuted.rms < shotLoud.rms * 0.25, 'the effects slider at 0 should silence a shot');
    assert(stingLoud.rms > 0.01 && stingMuted.rms < stingLoud.rms * 0.1, 'the music slider at 0 should silence a sting');
    assert(allMuted.rms < 0.0005, 'the master slider at 0 should silence everything');
    assert(half.rms < shotLoud.rms * 0.8 && half.rms > shotLoud.rms * 0.2, 'the master slider at 50% should be about half as loud');
    await slide('master', 70); await slide('music', 60);
    await page.goto(url);
    await page.waitForFunction(() => window.__zh?.state().phase === 'playing', null, { timeout: 15000 });
    await zh(() => window.__zh.audio.unlock());
    const kept = (await until('audio after a reload', async () => { const a = (await state()).audio; return a?.state === 'running' && a; }, 5000)).volumes;
    assert(kept.master === 0.7 && kept.music === 0.6 && kept.sfx === 1, `volumes should survive a reload: ${JSON.stringify(kept)}`);
    assert(await zh(() => document.getElementById('vol-master').value) === '70', 'the slider should show the saved volume');
    await shot('sliders');
    await slide('master', 80); await slide('music', 70);

    // ---------------------------------------------------------------- 3. a play session, recorded
    const session = await listen(0, async () => {
      // Round 1 begins by itself: the warning, and the first groans at the windows.
      await zh(() => window.__zh.god(true));
      await until('round 1', async () => (await state()).round === 1, 12000);
      await sleep(4500);
      await zh(() => { window.__zh.rounds(false); window.__zh.give(40000); });
      await sleep(400);

      // A door bought, then every floor underfoot.
      await zh(() => { window.__zh.teleport(29, 31.2); window.__zh.lookAt(29, 1.2, 32.5); });
      await until('the door prompt', async () => (await state()).prompt.includes('open door'), 3000);
      await press('KeyF');
      await sleep(1300);
      await zh(() => window.__zh.openAllDoors());
      for (const zone of ['mess', 'lab', 'bunk', 'cold', 'motor', 'yard']) {
        await zh((z) => { window.__zh.gotoZone(z, 0); window.__zh.key('KeyW', true); }, zone);
        await sleep(1100);
        await zh(() => window.__zh.key('KeyW', false));
      }

      // Every gun: a few rounds each, a reload, an empty click, the knife, a grenade.
      await zh(() => { window.__zh.teleport(30, 48, 0); window.__zh.look(0, 0); });
      for (const g of GUNS) {
        await zh((g) => window.__zh.give(g), g);
        await until(`the ${g}`, async () => (await state()).weapon === g, 3000);
        await sleep(450);
        await zh(() => window.__zh.key('Mouse0', true));
        await sleep(320);
        await zh(() => window.__zh.key('Mouse0', false));
        await sleep(350);
      }
      await zh(() => window.__zh.give('warden'));
      await sleep(500);
      for (let i = 0; i < 3; i++) { await press('Mouse0'); await sleep(170); }
      await press('KeyR');
      await sleep(1700);
      await zh(() => window.__zh.dummy(30, 46.9));
      await until('a dummy', async () => (await state()).entities.some((e) => e.kind === 'dummy'), 3000);
      await sleep(600); // the last shots' shake dies away
      assert((await state()).shake === 0, 'the view should be still before the knife');
      await press('KeyV');
      await until('the jolt of a knife that lands', async () => (await state()).shake > 0, 600);
      await sleep(700);
      await press('KeyG');
      await sleep(3300);

      // A horde: their voices, their swings; then no god for a moment: hurt, shake, direction.
      await zh(() => { window.__zh.killZombies(); window.__zh.teleport(22, 49, 0); window.__zh.lookAt(26, 1.2, 49); window.__zh.spawnZombies(10, { x: 26, z: 49, speed: 2.4 }); });
      await sleep(2500);
      await zh(() => window.__zh.god(false));
      const hurt = await until('a hit taken', async () => { const s = await state(); return s.hurts > 0 && s; }, 8000);
      await zh(() => window.__zh.god(true));
      assert(hurt.damageArcs.length > 0, 'a hit should raise a damage arc');
      assert(hurt.shake > 0, 'a hit should shake the view');
      await shot('hurt');
      const front = hurt.damageArcs.some((a) => Math.abs(a) < 1.2);
      assert(front, `the zombies are in front; the arc should be too (${hurt.damageArcs.map((a) => a.toFixed(2))})`);
      await zh(() => { window.__zh.give('halberd'); });
      await sleep(600);
      await zh(() => window.__zh.key('Mouse0', true));
      await sleep(2500);
      await zh(() => { window.__zh.key('Mouse0', false); window.__zh.killZombies(); });
      await sleep(600);

      // The power, a tonic, the Cache, the Forge.
      await zh(() => { window.__zh.teleport(60.2, 32.5); window.__zh.lookAt(61.5, 1.0, 32.5); });
      await until('the switch', async () => (await state()).prompt.includes('power'), 3000);
      await press('KeyF');
      await until('power', async () => (await state()).power, 3000);
      await sleep(600);
      assert((await state()).audio.played > 100, 'sounds should have been playing');
      await sleep(2600);
      await zh(() => { window.__zh.teleport(60.7, 38.5); window.__zh.lookAt(62, 1.4, 38.5); });
      await until('the dispenser', async () => (await state()).prompt.includes('Quickhands'), 3000);
      await press('KeyF');
      await sleep(3200);
      await zh(() => { window.__zh.teleport(22.3, 37, 0); window.__zh.lookAt(20.5, 0.9, 37); });
      await sleep(300);
      if ((await state()).prompt.includes('open the Cache')) {
        await zh(() => { window.__zh.cacheNext('kestrel'); window.__zh.press('KeyF'); });
        await sleep(5200);
        await press('KeyF');
        await sleep(600);
        await zh(() => { window.__zh.cacheNext('jinx'); window.__zh.press('KeyF'); });
        await sleep(9500);
      }
      await zh(() => { window.__zh.teleport(40.2, 58); window.__zh.lookAt(41.75, 1.1, 58); });
      await until('the Forge', async () => (await state()).prompt.includes('forge the'), 3000);
      await press('KeyF');
      await sleep(4200);
      await press('KeyF');
      await sleep(900);
      for (let i = 0; i < 3; i++) { await press('Mouse0'); await sleep(250); }

      // Power-ups, the wonder weapons on a crowd, a decoy.
      await zh((kinds) => { window.__zh.teleport(30, 50.5, 0); kinds.forEach((k, i) => window.__zh.powerup(k, 26.5 + i * 1.4, 46)); }, POWERUPS);
      await sleep(900);
      for (let i = 0; i < POWERUPS.length; i++) {
        await zh((x) => window.__zh.teleport(x, 46, 0), 26.5 + i * 1.4);
        await until(`taking ${POWERUPS[i]}`, async () => (await state()).powerupsTaken.includes(POWERUPS[i]), 3000);
        await sleep(1500);
      }
      const crowd = async () => {
        await zh(() => { window.__zh.killZombies(); window.__zh.teleport(22, 49, 0); for (let i = 0; i < 24; i++) window.__zh.spawnZombies(1, { x: 28 + (i % 6) * 0.9, z: 49 + Math.floor(i / 6) * 0.9 - 1.4, speed: 0.6, hp: 7000 }); });
        await until('24 zombies', async () => (await state()).entities.filter((e) => e.kind === 'zombie').length === 24, 5000);
        await sleep(600);
        await zh(() => window.__zh.lookAt(28, 1.2, 48.5));
        await sleep(200);
      };
      await zh(() => window.__zh.give('arclight'));
      await crowd();
      await press('Mouse0');
      await sleep(1500);
      // The limit under the worst of it: 24 bodies, an automatic held down, everything else still running.
      await zh(() => window.__zh.give('brakeman'));
      await sleep(600);
      await zh(() => window.__zh.key('Mouse0', true));
      let most = 0;
      for (let i = 0; i < 25; i++) { most = Math.max(most, (await state()).audio.voices); await sleep(100); }
      await zh(() => window.__zh.key('Mouse0', false));
      console.log(`[audio] 24 zombies and a held trigger: up to ${most} voices at once`);
      await zh(() => window.__zh.give('gravewell'));
      await crowd();
      await press('Mouse0');
      await sleep(5500);
      await zh(() => { window.__zh.killZombies(); window.__zh.give('siren'); window.__zh.look(0, 0.2); });
      await sleep(400);
      await press('KeyE');
      await sleep(7500);

      // A howler round: thunder, howls. Then down alone with Second Wind, up again, and down for good.
      await zh(() => { window.__zh.rounds(true); window.__zh.setRound(6, true); });
      await until('a strike', async () => (await state()).strikes > 0, 20000);
      await sleep(5000);
      await zh(() => { window.__zh.rounds(false); window.__zh.give('second_wind'); window.__zh.teleport(22, 49, 0); });
      await sleep(500);
      await zh(() => { window.__zh.god(false); window.__zh.spawnZombies(4, { x: 25, z: 49, speed: 4.8 }); });
      await until('going down', async () => (await state()).life === 'downed', 15000);
      await sleep(2500);
      await shot('downed');
      await zh(() => window.__zh.killZombies());
      await until('Second Wind', async () => (await state()).life === 'alive', 15000);
      await sleep(2500);
      await zh(() => window.__zh.spawnZombies(4, { x: 25, z: 49, speed: 4.8 }));
      await until('game over', async () => (await state()).over, 20000);
      await sleep(10000);
    }, path.join(out, 'audio-session.webm'));

    const a = (await state()).audio;
    const loud = session.windows.filter((w) => w > 0.002).length / session.windows.length;
    console.log(`[audio] session: ${session.seconds.toFixed(0)} s recorded to test-results/audio-session.webm; rms ${session.rms.toFixed(3)}, peak ${session.peak.toFixed(2)}, ${(loud * 100).toFixed(0)}% of half-seconds have sound`);
    console.log(`[audio] voices: ${a.played} sounds played, most at once ${a.peak} (limit ${a.max}); ${a.stolen} cut short, ${a.dropped} not started (out of earshot or no room)`);
    assert(a.peak <= a.max, `never more than ${a.max} voices at once (saw ${a.peak})`);
    assert(loud > 0.95, 'the session should never fall silent');
    assert(session.rms > 0.01, 'the session should be audible');
    assert(session.peak <= 1.05, `the session should not clip (peak ${session.peak.toFixed(2)})`);
    assert(errors.length === 0, `page errors: ${errors.join('; ')}`);
    console.log('[audio] ok');
  } finally {
    await browser?.close();
    server.kill();
  }
})().catch((e) => {
  console.error(`[audio] FAILED: ${e.message}`);
  process.exit(1);
});
