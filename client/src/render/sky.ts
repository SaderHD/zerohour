import * as THREE from 'three';
import { Rng } from '@zh/shared';
import { PALETTE } from './materials';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** Night sky cylinder: gradient, stars, aurora and a mountain silhouette. Follows the camera. */
export function buildSky(): THREE.Mesh {
  const W = 512;
  const H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const rng = new Rng(1977);
  const horizon = Math.round(H * 0.8); // canvas y of the horizon line

  const grad = ctx.createLinearGradient(0, 0, 0, horizon);
  grad.addColorStop(0, hex(PALETTE.skyTop));
  grad.addColorStop(1, hex(PALETTE.skyHorizon));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, horizon);

  for (let i = 0; i < 260; i++) {
    const b = rng.int(110, 255);
    ctx.fillStyle = `rgb(${b},${b},${Math.min(255, b + 20)})`;
    ctx.fillRect(rng.int(0, W - 1), rng.int(0, horizon - 28), 1, 1);
  }

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
  ctx.fillStyle = hex(PALETTE.fog);
  ctx.fillRect(0, horizon, W, H - horizon);

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
