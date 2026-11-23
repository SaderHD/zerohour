// Screenshot tour: boots the built server and saves one or more views per zone to
// test-results/tour-*.png so visual changes can be reviewed. Usage: npm run build && npm run tour
const { spawn } = require('node:child_process');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const port = 19080 + Math.floor(Math.random() * 900);

// [name, x, z, yaw (0 = north, + = turn left), pitch]. Views named *-on are taken after the
// power has been switched on (it stays on, so they come last).
const VIEWS = [
  ['mess', 35, 28, 0.9, -0.05],
  ['mess-kitchen', 30.5, 27, -2.3, -0.08],
  ['mess-door', 29, 28.5, Math.PI, -0.05],
  ['bunk', 20.5, 27, 1.5, -0.05],
  ['bunk-stove', 12.2, 25.6, 2.2, -0.12],
  ['washroom', 11, 22.2, 0, 0],
  ['lab', 20, 16, 0.9, -0.03],
  ['lab-tanks', 12, 11.5, -0.74, 0],
  ['lab-computers', 17.5, 15.8, -1.21, 0],
  ['cold', 36.8, 10.2, 1.8, -0.05],
  ['cold-aisle', 27.6, 14.3, 0.1, 0],
  ['cold-ice', 36.6, 11.2, -0.95, 0],
  ['tunnel', 44, 13, -1.57, 0],
  ['tunnel-leg', 52, 15.6, 3.14, -0.03],
  ['gen', 61, 34.8, 0.8, 0.14],
  ['gen-sets', 55.5, 34.6, 0, 0.12],
  ['gen-tanks', 56.2, 25.2, 1.95, 0.02],
  ['gen-switch', 57.6, 33.6, -1.4, 0],
  ['motor', 47.2, 38.6, -2.1, 0.03],
  ['motor-truck', 55.2, 39.2, -2.4, 0],
  ['motor-bench', 52, 40, 0.95, 0.02],
  ['motor-stores', 55.5, 46.6, 1.35, 0],
  ['yard', 44, 51, 0.9, 0.12],
  ['yard-north', 33, 50, 0, 0.15],
  ['comms', 34.5, 61.5, 0.85, 0],
  ['vault', 41.5, 60, 0.8, 0],
  ['window', 27.7, 24.2, 0.05, 0],
  ['mess-on', 35, 28, 0.9, -0.05],
  ['mess-kitchen-on', 30.5, 27, -2.3, -0.08],
  ['bunk-on', 20.5, 27, 1.5, -0.05],
  ['washroom-on', 11, 22.2, 0, 0],
  ['lab-on', 20, 16, 0.9, -0.03],
  ['lab-tanks-on', 12, 11.5, -0.74, 0],
  ['cold-on', 36.8, 10.2, 1.8, -0.05],
  ['cold-ice-on', 36.6, 11.2, -0.95, 0],
  ['gen-on', 61, 34.8, 0.8, 0.14],
  ['gen-sets-on', 55.5, 34.6, 0, 0.12],
  ['gen-switch-on', 57.6, 33.6, -1.4, 0],
  ['motor-on', 47.2, 38.6, -2.1, 0.03],
  ['motor-truck-on', 55.2, 39.2, -2.4, 0],
  ['motor-bench-on', 52, 40, 0.95, 0.02],
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
    await page.evaluate(() => window.__zh.rounds(false));
    mkdirSync(path.join(root, 'test-results'), { recursive: true });
    const only = process.argv.slice(2);
    for (const [name, x, z, yaw, pitch] of VIEWS) {
      if (only.length && !only.includes(name)) continue;
      if (name.endsWith('-on') && !(await page.evaluate(() => window.__zh.state().power))) {
        await page.evaluate(() => window.__zh.powerOn());
        await page.waitForTimeout(2200); // the lights stutter up
      }
      await page.evaluate(([x, z, yaw, pitch]) => { window.__zh.teleport(x, z, yaw); window.__zh.look(yaw, pitch); }, [x, z, yaw, pitch]);
      await page.waitForTimeout(900); // server round-trip for the teleport, a few frames, the air settling
      await page.screenshot({ path: path.join(root, `test-results/tour-${name}.png`) });
    }
    console.log('[tour]', JSON.stringify(await page.evaluate(() => window.__zh.state())));
  } finally {
    await browser?.close();
    server.kill('SIGTERM');
  }
})();
