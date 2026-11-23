import * as THREE from 'three';

// One shared texture for everything written or drawn on the world: door signs, stencils, chalk.
// Tiles are drawn on demand with canvas text and packed in rows.

const SIZE = 512;
export type UVRect = [number, number, number, number]; // u0, v0 (bottom-left), u1, v1

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D;
let texture: THREE.CanvasTexture;
let penX = 0;
let penY = 0;
let rowH = 0;
const tiles = new Map<string, UVRect>();

function ensure(): void {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  ctx = canvas.getContext('2d')!;
  texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
}

export function signTexture(): THREE.Texture {
  ensure();
  return texture;
}

/** A tile of w x h pixels, drawn once per key. */
export function signTile(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void): UVRect {
  ensure();
  const hit = tiles.get(key);
  if (hit) return hit;
  if (penX + w > SIZE) {
    penX = 0;
    penY += rowH + 2;
    rowH = 0;
  }
  ctx.save();
  ctx.translate(penX, penY);
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  draw(ctx, w, h);
  ctx.restore();
  const uv: UVRect = [penX / SIZE, 1 - (penY + h) / SIZE, (penX + w) / SIZE, 1 - penY / SIZE];
  penX += w + 2;
  rowH = Math.max(rowH, h);
  tiles.set(key, uv);
  texture.needsUpdate = true;
  return uv;
}

export type SignStyle = 'plate' | 'stencil' | 'hazard' | 'chalk';

/** Lettering: a painted plate, a wall stencil (transparent around the letters), a hazard plate or chalk. */
export function textTile(text: string, style: SignStyle): { uv: UVRect; aspect: number } {
  const h = 28;
  const w = Math.max(40, Math.min(SIZE, Math.round(text.length * 15 + 16)));
  const uv = signTile(`${style}:${text}`, w, h, (c) => {
    if (style === 'plate' || style === 'hazard') {
      c.fillStyle = style === 'plate' ? '#d8d2bc' : '#d8a020';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#2a2620';
      c.lineWidth = 2;
      c.strokeRect(2, 2, w - 4, h - 4);
    }
    c.fillStyle = style === 'stencil' ? '#e8e2d0' : style === 'chalk' ? '#e4ecdc' : '#2a2620';
    c.font = 'bold 22px "Courier New", monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, w / 2, h / 2 + 1, w - 10);
  });
  return { uv, aspect: w / h };
}

const CHALK = ['λ = 4.2 m', 'dB/dt → 0 ?', 'f₀ = 71.4 MHz', 'SAMPLE 7: NO', 'r² + k = ?', 'Δt  −  0.3 s', 'DO NOT WAKE', 'see tank 3', 'n = 12, 13, ...'];

/** A board's worth of chalk: a few lines of working, a sketch, some rubbed-out patches. */
export function chalkTile(seed: number): UVRect {
  return signTile(`chalkboard:${seed}`, 160, 80, (c, w, h) => {
    let s = seed * 7919 + 13;
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    c.fillStyle = '#24382c';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 5; i++) {
      c.fillStyle = `rgba(200,215,200,${0.04 + rnd() * 0.06})`;
      c.fillRect(rnd() * w, rnd() * h, 20 + rnd() * 50, 6 + rnd() * 14);
    }
    c.fillStyle = '#dfe8d8';
    c.font = '11px "Courier New", monospace';
    c.textBaseline = 'top';
    for (let row = 0; row < 5; row++) {
      if (rnd() < 0.2) continue;
      c.fillText(CHALK[Math.floor(rnd() * CHALK.length)]!, 6 + rnd() * 10, 5 + row * 14);
    }
    c.strokeStyle = '#dfe8d8';
    c.lineWidth = 1;
    c.beginPath();
    const cx = 122 + rnd() * 10;
    const cy = 28 + rnd() * 16;
    c.arc(cx, cy, 14, 0, Math.PI * 2);
    c.moveTo(cx - 20, cy + 22);
    c.lineTo(cx + 22, cy - 20);
    c.moveTo(cx - 14, cy);
    c.lineTo(cx + 14, cy);
    c.stroke();
  });
}
