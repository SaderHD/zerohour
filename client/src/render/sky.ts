import * as THREE from 'three';
import { Rng, type MapScene } from '@zh/shared';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

const W = 512;
const H = 128;
/** Canvas y of the horizon line. */
const HORIZON = Math.round(H * 0.8);

/** 'ridge': a night gradient, stars, a moon, an aurora and a mountain silhouette. */
function paintRidge(ctx: CanvasRenderingContext2D, scene: MapScene): void {
  const rng = new Rng(1977);
  const horizon = HORIZON;

  const grad = ctx.createLinearGradient(0, 0, 0, horizon);
  grad.addColorStop(0, hex(scene.skyTop));
  grad.addColorStop(1, hex(scene.skyHorizon));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, horizon);

  for (let i = 0; i < 260; i++) {
    const b = rng.int(110, 255);
    ctx.fillStyle = `rgb(${b},${b},${Math.min(255, b + 20)})`;
    ctx.fillRect(rng.int(0, W - 1), rng.int(0, horizon - 28), 1, 1);
  }

  // A gibbous moon low in the south-west, with a halo of ice.
  const [mx, my] = [Math.round(W * 0.62), 40];
  const halo = ctx.createRadialGradient(mx, my, 3, mx, my, 22);
  halo.addColorStop(0, 'rgba(190,210,255,0.35)');
  halo.addColorStop(1, 'rgba(190,210,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(mx - 22, my - 22, 44, 44);
  ctx.fillStyle = '#e4ecf8';
  ctx.beginPath();
  ctx.arc(mx, my, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hex(scene.skyHorizon);
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(mx + 3, my - 2, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Aurora: stacked translucent wavy bands
  for (let band = 0; band < 3; band++) {
    const y0 = 22 + band * 9;
    const phase = rng.range(0, 6.28);
    for (let x = 0; x < W; x++) {
      const t = (x / W) * Math.PI * 2;
      const y = y0 + Math.sin(t * 2 + phase) * 7 + Math.sin(t * 5 + phase * 2) * 3;
      const strength = 0.1 + 0.1 * Math.sin(t * 3 + band);
      const g = ctx.createLinearGradient(0, y - 16, 0, y + 4);
      g.addColorStop(0, 'rgba(60,255,170,0)');
      g.addColorStop(1, `rgba(${band === 1 ? 120 : 60},255,${band === 2 ? 230 : 170},${Math.max(0.03, strength)})`);
      ctx.fillStyle = g;
      ctx.fillRect(x, y - 16, 1, 20);
    }
  }

  // Mountains: two ridges; t wraps so the seam matches.
  const ridge = (base: number, amp: number, colour: string, cap: string | null, seed: number) => {
    const r = new Rng(seed);
    const ph = [r.range(0, 6.28), r.range(0, 6.28), r.range(0, 6.28)];
    for (let x = 0; x < W; x++) {
      const t = (x / W) * Math.PI * 2;
      const h = base + amp * (0.5 + 0.5 * Math.sin(t * 3 + ph[0]!)) + amp * 0.5 * Math.abs(Math.sin(t * 7 + ph[1]!)) + amp * 0.2 * Math.sin(t * 19 + ph[2]!);
      const top = Math.round(horizon - h);
      ctx.fillStyle = colour;
      ctx.fillRect(x, top, 1, H - top);
      if (cap && h > base + amp * 0.9) {
        ctx.fillStyle = cap;
        ctx.fillRect(x, top, 1, Math.max(1, Math.round((h - base - amp * 0.9) * 0.5)));
      }
    }
  };
  ridge(6, 16, '#121c2e', '#3a4c66', 11);
  ridge(2, 9, '#0b1220', null, 23);
  ctx.fillStyle = hex(scene.haze);
  ctx.fillRect(0, horizon, W, H - horizon);

}

const mix = (a: number, b: number, t: number): string => {
  const ch = (s: number): number => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
};

/**
 * 'city': no stars. Low cloud lit from underneath by a city's worth of sodium lamps, brightest
 * along the horizon, and against it the far skyline, two ranks of it, with its windows on.
 */
function paintCity(ctx: CanvasRenderingContext2D, scene: MapScene): void {
  const rng = new Rng(1991);
  const grad = ctx.createLinearGradient(0, 0, 0, HORIZON);
  grad.addColorStop(0, hex(scene.skyTop));
  grad.addColorStop(0.45, mix(scene.skyTop, scene.skyHorizon, 0.35));
  grad.addColorStop(0.85, mix(scene.skyTop, scene.skyHorizon, 0.8));
  grad.addColorStop(1, hex(scene.skyHorizon));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, HORIZON);

  // The cloud's underside: long smears, lighter where the lamps are thick below.
  for (let i = 0; i < 90; i++) {
    const [x, y, rx, ry] = [rng.range(0, W), rng.range(8, HORIZON - 6), rng.range(18, 60), rng.range(3, 9)];
    const dark = rng.chance(0.4);
    const a = rng.range(0.05, 0.13) * (0.4 + (0.6 * y) / HORIZON);
    // (Each is drawn three times so that the smears meet across the seam.)
    for (const dx of [-W, 0, W]) {
      const g = ctx.createRadialGradient(x + dx, y, 0, x + dx, y, rx);
      g.addColorStop(0, dark ? `rgba(0,0,0,${a * 1.6})` : mix(scene.skyHorizon, 0xffc890, 0.35).replace('rgb', 'rgba').replace(')', `,${a})`));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save();
      ctx.translate(0, y);
      ctx.scale(1, ry / rx);
      ctx.translate(0, -y);
      ctx.fillStyle = g;
      ctx.fillRect(x + dx - rx, y - rx, rx * 2, rx * 2);
      ctx.restore();
    }
  }

  // The far skyline: the farther rank paler and taller, the nearer darker; a scatter of lit windows on both.
  for (const [tall, low, shade, lit] of [[30, 9, 0.5, 0.05], [17, 4, 0.78, 0.08]] as const) {
    for (let x = 0; x < W; ) {
      const wide = Math.min(W - x, rng.int(5, 15));
      const h = rng.chance(0.15) ? rng.int(low + 6, tall) : rng.int(low, Math.round((low + tall) / 2));
      const step = rng.chance(0.4) ? rng.int(1, 3) : 0;
      ctx.fillStyle = mix(scene.skyHorizon, 0x000000, shade);
      ctx.fillRect(x, HORIZON - h, wide, h);
      if (step && wide > 6) ctx.fillRect(x + step, HORIZON - h - rng.int(2, 5), wide - step * 2, 6);
      if (rng.chance(0.12)) ctx.fillRect(x + (wide >> 1), HORIZON - h - rng.int(4, 9), 1, 9);
      for (let wy = HORIZON - h + 1; wy < HORIZON - 1; wy += 2) {
        for (let wx = x + 1; wx < x + wide - 1; wx += 2) {
          if (!rng.chance(lit)) continue;
          ctx.fillStyle = rng.chance(0.7) ? 'rgba(255,200,130,0.75)' : 'rgba(205,225,215,0.6)';
          ctx.fillRect(wx, wy, 1, 1);
        }
      }
      x += wide + (rng.chance(0.25) ? rng.int(1, 3) : 0);
    }
  }
  ctx.fillStyle = hex(scene.haze);
  ctx.fillRect(0, HORIZON, W, H - HORIZON);
}

/** The sky cylinder for a map's scene; it follows the camera. */
export function buildSky(scene: MapScene): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  (scene.sky === 'city' ? paintCity : paintRidge)(ctx, scene);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.RepeatWrapping;

  // Horizon sits 0.2 of the way up the cylinder, matching the texture.
  const height = 200;
  const geo = new THREE.CylinderGeometry(180, 180, height, 24, 1, true);
  geo.translate(0, height * 0.3, 0);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }));
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return mesh;
}
