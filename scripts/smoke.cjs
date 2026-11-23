// End-to-end smoke test: boots the built server, loads the client in headless Chromium and
// checks the handshake + rendering. Run `npm run build` first. Usage: npm run smoke
const { spawn } = require('node:child_process');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const port = 18080 + Math.floor(Math.random() * 1000);
const url = `http://localhost:${port}/?name=Smoke&debug=1&autostart=1`;

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`http://localhost:${port}/healthz`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
}

(async () => {
  const server = spawn('node', ['server/dist/index.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), ZH_DEBUG: '1' },
    stdio: 'inherit',
  });
  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(url);
    await page.waitForFunction(() => window.__zh?.state().phase === 'playing' && window.__zh.state().pingMs !== null, null, { timeout: 10000 });
    await page.waitForFunction(() => window.__zh.state().frames > 5, null, { timeout: 10000 });
    // Round loop: round 1 starts by itself and the HUD shows it. (God mode from here: the zombies are real.)
    await page.waitForFunction(() => window.__zh.state().round === 1 && document.getElementById('round').textContent === '1', null, { timeout: 15000 });
    await page.evaluate(() => window.__zh.god(true));
    const state = await page.evaluate(() => window.__zh.state());
    if (state.zombiesLeft !== 6 || state.points !== 500) throw new Error(`round 1 should have 6 zombies and 500 points, got ${state.zombiesLeft} / ${state.points}`);
    if (errors.length) throw new Error(`page errors:\n${errors.join('\n')}`);
    // World: map valid, standing in the spawn zone, cheap to draw.
    if (state.mapErrors.length) throw new Error(`map errors: ${state.mapErrors.join('; ')}`);
    if (state.zone !== 'mess') throw new Error(`expected to spawn in mess, got ${state.zone}`);
    if (state.drawCalls < 3 || state.drawCalls > 150) throw new Error(`draw calls out of range: ${state.drawCalls}`);
    // Movement: walk north into the wall; must stop one player radius short of it (wall at z=22).
    await page.evaluate(() => { window.__zh.look(0, 0); window.__zh.key('KeyW', true); });
    await page.waitForTimeout(2500);
    const walked = await page.evaluate(() => { window.__zh.key('KeyW', false); return window.__zh.state(); });
    if (Math.abs(walked.z - 22.35) > 0.03) throw new Error(`expected to stop at the north wall (z=22.35), got z=${walked.z}`);
    // Doors: closed door blocks, opened door lets us through into the courtyard.
    await page.evaluate(() => { window.__zh.teleport(29, 30, Math.PI); window.__zh.look(Math.PI, 0); window.__zh.key('KeyW', true); window.__zh.key('ShiftLeft', true); });
    await page.waitForTimeout(1200);
    const blocked = await page.evaluate(() => window.__zh.state());
    if (blocked.zone !== 'mess' || blocked.z > 31.7) throw new Error(`closed door did not block: z=${blocked.z}`);
    await page.evaluate(() => window.__zh.openDoor('d_mess_yard'));
    await page.waitForTimeout(1500);
    const through = await page.evaluate(() => { window.__zh.key('KeyW', false); window.__zh.key('ShiftLeft', false); return window.__zh.state(); });
    if (through.zone !== 'yard') throw new Error(`expected to walk into the yard, in ${through.zone} at z=${through.z}`);
    if (through.stamina >= 4) throw new Error('sprinting did not drain stamina');
    mkdirSync(path.join(root, 'test-results'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'test-results/smoke.png') });
    console.log('[smoke] ok', JSON.stringify(state));
  } catch (e) {
    console.error('[smoke] FAILED:', e.message);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    server.kill('SIGTERM');
  }
})();
