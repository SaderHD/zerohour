// End-to-end smoke test: boots the built server, loads the client in headless Chromium and
// checks the handshake + rendering. Run `npm run build` first. Usage: npm run smoke
const { spawn } = require('node:child_process');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const port = 18080 + Math.floor(Math.random() * 1000);
const url = `http://localhost:${port}/?name=Smoke`;

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
    await page.waitForFunction(() => window.__zh?.state().connected && window.__zh.state().pingMs !== null, null, { timeout: 10000 });
    await page.waitForFunction(() => window.__zh.state().frames > 5, null, { timeout: 10000 });
    const state = await page.evaluate(() => window.__zh.state());
    const status = await page.textContent('#status');
    if (!/connected · player \d+/.test(status)) throw new Error(`unexpected status: ${status}`);
    if (errors.length) throw new Error(`page errors:\n${errors.join('\n')}`);
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
