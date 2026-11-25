// Screenshot tour: boots the built server and saves one or more views per zone to
// test-results/tour-*.png so visual changes can be reviewed. Usage: npm run build && npm run tour
// `npm run tour -- --stacks [view...]` tours the Stacks (the height proving ground) instead, with its
// doors open, to test-results/tour-stacks-*.png; `--corner` the Corner (one block of a city) likewise;
// `--night` The Longest Night (to tour-night-*.png; a view called `air-*` is the free camera at that height).
const { spawn } = require('node:child_process');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const port = 19080 + Math.floor(Math.random() * 900);

// [name, x, z, yaw (0 = north, + = turn left), pitch, height of the floor to stand on (default 0)].
// The station is terraced: N is the laboratory's and the cold store's floor, S the low yard's,
// the motor pool's and the bunker's; the gallery is at 3 and the vault at -4.5.
const N = 1.5;
const S = -1.5;
const VAULT = -4.5;
const BASE = [
  ['mess', 35, 28, 0.9, -0.05],
  ['mess-kitchen', 30.5, 27, -2.3, -0.08],
  ['mess-servery', 34.6, 30.2, -1.57, -0.05],
  ['mess-door', 29, 28.5, Math.PI, -0.05],
  ['bunk', 20.5, 27, 1.5, -0.05],
  ['bunk-stove', 12.2, 25.6, 2.2, -0.12],
  ['washroom', 11, 22.2, 0, 0],
  ['lab-stairs', 11, 17.8, 0, 0.25, 0.2],
  ['lab', 20, 16, 0.9, -0.03, N],
  ['lab-tanks', 13, 9.5, -0.95, 0, N],
  ['lab-computers', 17.5, 15.8, -1.21, 0, N],
  ['lab-well', 14.5, 13, 2.5, -0.3, N],
  ['cold', 36.8, 10.2, 1.8, -0.05, N],
  ['cold-aisle', 27.6, 14.3, 0.1, 0, N],
  ['cold-ice', 36.6, 11.2, -0.95, 0, N],
  ['tunnel', 43, 13, -1.57, 0.08, N],
  ['tunnel-leg', 52, 14.6, 3.14, 0.05, N + 0.75],
  ['tunnel-foot', 52, 22.4, 0, -0.12, 3],
  ['gen', 64, 34.8, 0.8, 0.14],
  ['gen-sets', 55.5, 34.6, 0, 0.12],
  ['gen-stairs', 53, 33.6, 0.75, 0.2],
  ['gen-under', 59, 25, 1.57, 0],
  ['gen-tanks', 63.5, 24.8, -1.57, 0],
  ['gen-gallery', 48.8, 24.8, -1.57, -0.12, 3],
  ['gen-switch', 59.4, 25.3, 1.2, -0.05, 3],
  ['gen-below', 55, 25.5, 3.14, -0.55, 3],
  ['motor', 47.2, 39.6, -2.1, 0.05, S],
  ['motor-truck', 55.2, 39.2, -2.4, 0, S],
  ['motor-dock', 61.5, 37, 1.57, -0.1],
  ['motor-ramp', 51, 44.2, 0, 0.12, S],
  ['motor-down', 55, 37.4, 3.14, -0.3],
  ['motor-stores', 55.5, 46.6, 1.35, 0, S],
  ['yard', 44.5, 51.5, 0.95, 0.1, S],
  ['yard-north', 30, 50.5, 0, 0.16, S],
  ['yard-mast', 31, 46.5, 2.45, 0.42, S],
  ['yard-truck', 27.5, 38.5, -0.95, 0.05],
  ['yard-east', 23, 37, -1.57, 0.08],
  ['yard-bluff', 33, 40.4, 3.14, -0.3],
  ['yard-slope', 23.5, 46.5, 0, 0.12, S],
  ['yard-down', 42.5, 38.6, 2.6, -0.15],
  ['yard-breach', 26.5, 50.3, 1.1, 0, S],
  ['yard-cat', 29.5, 48.5, -0.75, 0.08, S],
  ['comms', 34.5, 61.2, 0.85, -0.03, S],
  ['comms-ops', 29.6, 56.2, 0.95, -0.1, S],
  ['comms-plot', 27.4, 61, -0.75, -0.12, S],
  ['comms-east', 28.5, 58.8, -1.57, 0, S],
  ['comms-office', 25.6, 61, 1.45, -0.05, S],
  ['vault-head', 37, 58, -1.57, -0.35, S],
  ['vault-turn', 42.6, 56, 1.57, -0.35, (S + VAULT) / 2],
  ['vault', 35.5, 57.5, 1.57, 0, VAULT],
  ['vault-side', 29.5, 60, 0.75, 0, VAULT],
  ['mount-wall', 24.6, 24.4, 1.45, -0.02],
  ['mount-tonic', 25.4, 31, 1.45, 0],
  ['mount-cache', 50.4, 13.6, 0.25, -0.2, N + 0.75],
  ['sign-power', 43.2, 38.2, -1.2, 0.1],
  ['window', 27.7, 24.2, 0.05, 0],
];
// Views named *-on are taken after the power has been switched on (it stays on, so they come last).
const ON = [
  'mess', 'mess-kitchen', 'bunk', 'washroom', 'lab', 'lab-tanks', 'lab-well', 'cold', 'cold-ice', 'tunnel', 'gen', 'gen-sets', 'gen-gallery',
  'gen-switch', 'gen-below', 'motor', 'motor-truck', 'motor-dock', 'yard', 'yard-north', 'yard-truck', 'yard-bluff', 'yard-slope', 'comms',
  'comms-ops', 'vault', 'vault-side', 'mount-tonic',
];
const VIEWS = [...BASE, ...ON.map((name) => { const v = BASE.find((b) => b[0] === name); return [`${name}-on`, ...v.slice(1)]; })];

// The Stacks: a sixth number is the height of the floor to stand on (the loft is over the hall, the cellar under it).
const STACKS_VIEWS = [
  ['hall', 18, 16.8, 0.85, -0.02, 0],
  ['hall-ramp', 15, 10.5, -1.45, 0.05, 0],
  ['hall-ledge', 16.5, 15, -1.57, 0.05, 0],
  ['ramp-foot', 19.2, 9, -1.57, 0.1, 0],
  ['ramp-top', 25, 9, 1.57, -0.2, 1],
  ['terrace', 25, 16.5, 1.2, -0.12, 1],
  ['lobby-stairs', 4.6, 17, 0.12, 0.3, 0],
  ['stairs-mid', 4, 13, 0, 0.35, 1.25],
  ['stairs-top', 4, 8.2, 3.14, -0.55, 3],
  ['loft', 15, 17, 0.85, -0.03, 3],
  ['loft-window', 12, 13, -1.57, 0, 3],
  ['loft-east', 7, 9.5, -2.2, -0.03, 3],
  ['cellar-door', 11, 16, 3.14, -0.35, 0],
  ['cellar-stairs', 11, 25.3, 0, 0.35, -3],
  ['cellar', 18.5, 16.5, 0.9, -0.02, -3],
  ['cellar-window', 17, 15, 3.14, 0, -3],
];

// The Corner: the street, the shop and the flat over it (4), its roof (8), the underpass (-4).
const CORNER_VIEWS = [
  ['street', 8, 21, -1.57, 0.12, 0],
  ['street-west', 38, 21, 1.57, 0.2, 0],
  ['street-up', 24, 22, 0, 0.75, 0],
  ['street-south', 24, 19.5, 3.14, 0.5, 0],
  ['street-tall', 30, 24.5, 2.3, 0.9, 0.15],
  ['pavement', 13, 17.4, -1.3, 0.02, 0.15],
  ['kerb', 30, 19.5, 0.9, -0.5, 0],
  ['barricade', 9, 20.75, 1.57, 0, 0],
  ['shop', 22.5, 13.5, 0.9, -0.03, 0],
  ['flat', 20, 14, 0.8, -0.03, 4],
  ['roof-street', 14, 14.8, -2.5, -0.3, 8],
  ['roof-down', 17, 15.3, 3.14, -0.9, 8],
  ['roof-east', 23.5, 15.3, -1.57, -0.12, 8],
  ['roof-north', 12, 12, -0.5, 0.35, 8],
  ['roof-hut', 14, 11, -1.57, 0.05, 8],
  ['roof-well', 15.7, 5.4, 0, -1.1, 8],
  ['roof-sky', 19, 7, 2.6, 0.45, 8],
  ['roof-south', 16, 9, 3.14, 0.15, 8],
  ['under-stairs', 11, 25, 3.14, -0.45, 0.15],
  ['under', 8, 35.5, -1.57, 0, -4],
];

// The Longest Night: the streets, the ground floors, the mezzanine (-4) and the platform (-8), upstairs and the roofs.
const NIGHT_VIEWS = [
  ['diner', 54.5, 95.5, 0.95, -0.03, 0],
  ['diner-kitchen', 55, 102, 1.0, -0.03, 0],
  ['tenement', 65.5, 103.8, 1.0, -0.03, 0],
  ['square', 54, 84, -0.9, 0.1, 0],
  ['square-south', 94, 52, 2.3, 0.1, 0],
  ['square-up', 74, 63.5, 3.14, 0.9, 0],
  ['square-east', 60, 72, -1.57, 0.15, 0],
  ['square-subway', 90, 53, -1.57, 0.05, 0],
  ['cut', 74, 49.5, 0, 0.1, 0],
  ['pass', 83.5, 86.5, 3.14, 0, 0],
  ['avenue', 21.5, 36, -1.57, 0.1, 0],
  ['avenue-west', 118.5, 36, 1.57, 0.1, 0],
  ['avenue-mid', 74, 38, -1.3, 0.3, 0],
  ['avenue-up', 60, 36, 1.57, 0.8, 0],
  ['avenue-pavement', 90, 31.2, 1.5, 0, 0.15],
  ['lane', 59.5, 95, -1.57, 0.08, 0],
  ['lane-west', 120.5, 95, 1.57, 0.08, 0],
  ['lane-hatch', 78.5, 96, 0, 0, 0],
  ['lyric-lobby', 41, 57.5, -2.2, -0.03, 0],
  ['lyric-hall', 38, 61, 0.85, 0.1, 0],
  ['lyric-exit', 25, 47, 0, 0, 0],
  ['chapel', 47, 28.5, 0, 0.15, 0],
  ['abelard', 98, 84.5, -0.85, -0.03, 0],
  ['abelard-bay', 116, 90.5, 0, 0, 0],
  ['mezz-stairs', 97.5, 53, -1.57, -0.45, -0.3],
  ['mezz', 105, 65.5, 1.05, -0.03, -4],
  ['turnstiles', 88.5, 54, 0, 0, -4],
  ['platform-stairs', 88.5, 46, 0, -0.45, -4.3],
  ['platform-west', 93, 38.5, 1.45, 0, -8],
  ['platform-east', 99, 38.5, -1.45, 0, -8],
  ['train', 71, 30, -1.57, 0, -8],
  ['avenue-stairs', 113, 31, 0, 0.45, -8],
  ['avenue-landing', 113.5, 21.2, 1.57, 0, -4],
  ['service', 68, 41.5, 3.14, 0, -8],
  ['signal-room', 64.5, 63, 1.0, 0, -8],
  ['service-landing', 68, 84, 3.14, 0, -4],
  // Upstairs (+4) and the roofs (+8).
  ['tenement-stairs', 68, 99.5, 3.14, 0.4, 0],
  ['flat', 65.5, 109, 0.9, -0.03, 4],
  ['escape', 72, 95, 1.57, 0.25, 0],
  ['escape-landing', 59, 97, -1.57, -0.3, 4],
  ['ten-roof', 58, 110, -0.75, 0, 8],
  ['ten-roof-bridge', 68.2, 100.5, 0, -0.1, 8],
  ['bridge', 68.2, 96, 0, -0.5, 8],
  ['lane-up', 64, 94, -1.2, 0.9, 0],
  ['roofwalk', 66.5, 90.5, -1.57, 0, 8],
  ['roofwalk-pass', 80, 90.5, -1.57, -0.25, 8],
  ['abelard-atrium', 111.5, 78, 0, 0.45, 0],
  ['abelard-up', 98, 84.5, -0.85, -0.03, 4],
  ['abelard-gallery', 106, 68, -2.3, -0.4, 4],
  ['abelard-flight', 125.5, 72, 0, 0.4, 4],
  ['abelard-roof', 97.5, 90.5, -0.8, 0, 8],
  ['abelard-roof-square', 100, 78, 1.3, -0.2, 8],
  ['abelard-roof-hut', 110, 75, -0.9, 0, 8],
  ['square-awning', 80, 72, -1.57, 0.25, 0],
  ['lyric-stairs', 50, 55, 1.57, 0.3, 0],
  ['lyric-balcony', 38, 61, 0.85, -0.2, 4],
  ['platform-tunnel', 70, 36, 1.57, 0, -8],
  ['mezz-tunnel', 95.7, 62, 3.14, 0, -4],
  // Dressed (M5): the square's tree, rink and market; the avenue's traffic; the lane.
  ['tree', 64, 77, -0.85, 0.42, 0],
  ['rink', 67.5, 63.5, -2.0, 0.05, 0],
  ['market', 61, 56.5, -1.35, 0.02, 0],
  ['market-east', 86, 71, -2.6, 0.05, 0],
  ['bandstand', 62.5, 68, 0.85, 0.12, 0],
  ['abelard-front', 86, 76, -1.2, 0.2, 0],
  ['bus', 81, 31.5, -1.95, 0.02, 0.15],
  ['traffic', 56, 36, 1.57, 0.02, 0],
  ['police-line', 76, 36.2, -1.57, 0.02, 0],
  ['kiosk', 66, 38.5, -2.3, 0.05, 0],
  ['steam', 49, 36, 1.3, 0.1, 0],
  ['avenue-east', 94, 36, -1.57, 0.05, 0],
  ['lane-van', 108, 95.5, 1.45, 0.02, 0],
  ['lane-brazier', 80, 94.5, 2.2, 0, 0],
  // Dressed (M6): Abelard's, the Lyric, St Audra's.
  ['abelard-door', 97.6, 73.5, -1.57, 0.05, 0],
  ['abelard-toys', 97.5, 67.6, -1.25, 0, 0],
  ['abelard-railway', 109.2, 71.6, -2.3, -0.3, 0],
  ['abelard-grotto', 118.5, 82.5, -1.57, 0.02, 0],
  ['abelard-dummies', 100.5, 79.5, 1.2, 0, 0],
  ['abelard-escalator', 107.5, 77.5, 0, 0.3, 0],
  ['abelard-racks', 97.5, 67.4, -1.3, -0.03, 4],
  ['abelard-wrap', 111, 81.6, 3.14, -0.12, 4],
  ['abelard-over', 107.5, 68.2, -2.5, -0.5, 4],
  ['lyric-screen', 37.6, 54, 1.57, 0.12, 0],
  ['lyric-seats', 22.6, 47, -2.2, 0, 0],
  ['lyric-projector', 36.9, 55.3, -0.75, -0.1, 4],
  ['lyric-rail', 34.6, 54, 1.57, -0.15, 4],
  ['lyric-front', 62, 61, 1.37, 0.2, 0],
  ['chapel-altar', 47, 14, 0, 0.12, 0],
  ['chapel-nativity', 42.6, 12.6, 0.6, -0.15, 0],
  ['chapel-nave', 47, 12, 3.14, 0.05, 0],
  ['chapel-front', 47, 37.5, 0, 0.32, 0],
  // Dressed (M7): the diner, the tenement, the roofs, the subway.
  ['diner-booths', 50, 93, 0.5, -0.05, 0],
  ['diner-counter', 50.5, 90, 2.3, -0.1, 0],
  ['diner-jukebox', 44.5, 91.5, 0.95, -0.05, 0],
  ['diner-front', 58, 79.5, 2.55, 0.22, 0],
  ['tenement-hall', 58, 103, -0.9, -0.03, 0],
  ['flat-table', 65.5, 105.5, 0.75, -0.12, 4],
  ['flat-tv', 62.5, 104.6, 2.9, -0.12, 4],
  ['flat-bed', 60, 100.3, -2.0, -0.1, 4],
  ['ten-roof-tank', 67, 100.5, 2.4, 0.15, 8],
  ['ten-roof-reindeer', 61, 102.5, -0.25, -0.05, 8],
  ['ten-roof-coop', 63, 107, -1.2, 0, 8],
  ['abelard-roof-sign', 105, 69, 1.75, 0.05, 8],
  ['abelard-roof-skylight', 104, 81, -0.85, -0.15, 8],
  ['abelard-roof-plant', 107, 69.5, 0.55, 0.05, 8],
  ['escape-iron', 66, 93.5, 2.3, 0.3, 0],
  ['ledge-iron', 88, 60, -1.2, 0.5, 0],
  ['mezz-turnstiles', 89.5, 60.5, 0.2, -0.05, -4],
  ['mezz-booth', 97, 60.5, 0.6, -0.03, -4],
  ['platform-train', 79, 38.5, -0.35, 0, -8],
  ['platform-benches', 78, 34, -2.2, -0.05, -8],
  ['train-mid', 93, 30, 1.57, -0.03, -8],
  ['train-door', 84.75, 33.5, 0, 0, -8],
  ['service-cabinets', 68, 56, 0, 0, -8],
  ['signal-levers', 62.5, 62.3, 0.2, -0.05, -8],
  ['air-tree', 58, 84, -0.85, -0.42, 16],
  ['air-abelard-roof', 96, 92, -0.75, -0.6, 20],
  ['air-ten-roof', 72, 114, 0.75, -0.7, 17],
  ['air-roofs', 58, 116, -0.75, -0.5, 22],
  ['air-square', 74, 100, 0, -0.75, 40],
  ['air-avenue', 20, 36, -1.57, -0.35, 30],
  ['air-plan', 75, 66, 0, -1.5, 60],
];
const TOURS = { stacks: ['stacks', STACKS_VIEWS], corner: ['corner', CORNER_VIEWS], night: ['longest_night', NIGHT_VIEWS] };

(async () => {
  const tour = Object.keys(TOURS).find((id) => process.argv.includes(`--${id}`));
  const which = tour && TOURS[tour][0];
  const stacks = !!which;
  const server = spawn('node', ['server/dist/index.js'], { cwd: root, env: { ...process.env, PORT: String(port), ZH_DEBUG: '1', ...(which ? { ZH_MAP: which } : {}) }, stdio: 'ignore' });
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
    await page.goto(`http://localhost:${port}/?debug=1&autostart=1${which ? `&map=${which}` : ''}`);
    await page.waitForFunction(() => window.__zh?.state().phase === 'playing', null, { timeout: 15000 });
    await page.evaluate(() => window.__zh.rounds(false));
    mkdirSync(path.join(root, 'test-results'), { recursive: true });
    const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
    if (stacks) await page.evaluate(() => window.__zh.openAllDoors());
    for (const [name, x, z, yaw, pitch, y] of tour ? TOURS[tour][1] : VIEWS) {
      if (only.length && !only.includes(name)) continue;
      if (name.endsWith('-on') && !(await page.evaluate(() => window.__zh.state().power))) {
        await page.evaluate(() => window.__zh.powerOn());
        await page.waitForTimeout(2200); // the lights stutter up
      }
      if (name.startsWith('air-')) await page.evaluate(([x, z, yaw, pitch, y]) => window.__zh.fly(x, y, z, yaw, pitch), [x, z, yaw, pitch, y]);
      else await page.evaluate(([x, z, yaw, pitch, y]) => { window.__zh.teleport(x, z, yaw, y ?? undefined); window.__zh.look(yaw, pitch); }, [x, z, yaw, pitch, y ?? null]);
      await page.waitForTimeout(900); // server round-trip for the teleport, a few frames, the air settling
      await page.screenshot({ path: path.join(root, `test-results/tour-${tour ? `${tour}-` : ''}${name}.png`) });
    }
    console.log('[tour]', JSON.stringify(await page.evaluate(() => window.__zh.state())));
  } finally {
    await browser?.close();
    server.kill('SIGTERM');
  }
})();
