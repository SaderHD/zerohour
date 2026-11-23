// Screenshot tour: boots the built server and saves one or more views per zone to
// test-results/tour-*.png so visual changes can be reviewed. Usage: npm run build && npm run tour
const { spawn } = require('node:child_process');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const port = 19080 + Math.floor(Math.random() * 900);

// [name, x, z, yaw (0 = north, + = turn left), pitch]
const VIEWS = [
  ['mess', 34.5, 30.5, 0.9, -0.05],
  ['mess-door', 29, 25, Math.PI, -0.05],
  ['bunk', 20.5, 29.5, 1.2, -0.05],
  ['washroom', 11, 22, 0, 0],
  ['lab', 20, 16.5, 0.9, 0],
  ['cold', 41, 13.5, 1.45, 0],
  ['tunnel', 44, 13, -1.57, 0],
  ['gen', 60, 34, 0.75, 0.12],
  ['motor', 61, 46.5, 0.9, 0.1],
  ['yard', 44, 51, 0.9, 0.12],
  ['yard-north', 33, 50, 0, 0.15],
  ['comms', 34.5, 61.5, 0.85, 0],
  ['vault', 41.5, 60, 0.8, 0],
  ['window', 27, 24.5, 0.05, 0],
];

(async () => {
  const server = spawn('node', ['server/dist/index.js'], { cwd: root, env: { ...process.env, PORT: String(port), ZH_DEBUG: '1' }, stdio: 'ignore' });
  let browser;
  try {
    for (let i = 0; i < 50; i++) {
      try {
        if ((await fetch(`http://localhost:${port}/healthz`)).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    page.on('pageerror', (e) => console.error('[page]', String(e)));
    await page.goto(`http://localhost:${port}/?debug=1&autostart=1`);
    await page.waitForFunction(() => window.__zh?.state().phase === 'playing', null, { timeout: 15000 });
    mkdirSync(path.join(root, 'test-results'), { recursive: true });
    const only = process.argv.slice(2);
    for (const [name, x, z, yaw, pitch] of VIEWS) {
      if (only.length && !only.includes(name)) continue;
      await page.evaluate(([x, z, yaw, pitch]) => { window.__zh.teleport(x, z, yaw); window.__zh.look(yaw, pitch); }, [x, z, yaw, pitch]);
      await page.waitForTimeout(250); // server round-trip for the teleport, then a few frames
      await page.screenshot({ path: path.join(root, `test-results/tour-${name}.png`) });
    }
    console.log('[tour]', JSON.stringify(await page.evaluate(() => window.__zh.state())));
  } finally {
    await browser?.close();
    server.kill('SIGTERM');
  }
})();
