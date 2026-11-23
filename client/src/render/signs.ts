import * as THREE from 'three';

// One shared texture for everything written or drawn on the world: door signs, stencils, chalk.
// Tiles are drawn on demand with canvas text and packed in rows.

const SIZE = 1024;
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
  if (penY + h > SIZE) console.error(`[signs] the atlas is full: no room for ${key}`);
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

const ARROW_W = 26;

/**
 * Lettering: a painted plate, a wall stencil (transparent around the letters), a hazard plate or
 * chalk. A text that starts with "< " or ends with " >" gets an arrow painted at that end.
 */
export function textTile(text: string, style: SignStyle): { uv: UVRect; aspect: number } {
  const left = text.startsWith('< ');
  const right = text.endsWith(' >');
  const words = text.slice(left ? 2 : 0, right ? -2 : undefined);
  const arrows = (left ? ARROW_W : 0) + (right ? ARROW_W : 0);
  const h = 28;
  const w = Math.max(40, Math.min(SIZE, Math.round(words.length * 15 + 16 + arrows)));
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
    const x0 = left ? ARROW_W : 0;
    const x1 = w - (right ? ARROW_W : 0);
    c.fillText(words, (x0 + x1) / 2, h / 2 + 1, x1 - x0 - 10);
    // An arrow: a shaft and a head, pointing out of the tile.
    const head = (tip: number, dir: number): void => {
      c.beginPath();
      c.moveTo(tip, h / 2);
      c.lineTo(tip + dir * 11, 6);
      c.lineTo(tip + dir * 11, 11);
      c.lineTo(tip + dir * 20, 11);
      c.lineTo(tip + dir * 20, h - 11);
      c.lineTo(tip + dir * 11, h - 11);
      c.lineTo(tip + dir * 11, h - 6);
      c.closePath();
      c.fill();
    };
    if (left) head(7, 1);
    if (right) head(w - 7, -1);
  });
  return { uv, aspect: w / h };
}

/** A survey sheet of the ridge: contours, a grid, the station, grease-pencil marks. */
export function mapTile(seed: number): UVRect {
  return signTile(`map:${seed}`, 160, 112, (c, w, h) => {
    let s = seed * 9973 + 7;
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    c.fillStyle = '#cfc6a4';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(70,90,110,0.35)';
    c.lineWidth = 1;
    for (let x = 16; x < w; x += 24) c.strokeRect(x + 0.5, -1, 0, h + 2);
    for (let y = 14; y < h; y += 24) c.strokeRect(-1, y + 0.5, w + 2, 0);
    // Two hills of contour rings and a valley line between them.
    c.strokeStyle = '#7a5a36';
    for (let hill = 0; hill < 2; hill++) {
      const cx = hill ? 108 + rnd() * 20 : 36 + rnd() * 20;
      const cy = 30 + rnd() * 50;
      for (let r = 8; r < 46; r += 7 + rnd() * 3) {
        c.beginPath();
        c.ellipse(cx + rnd() * 4, cy + rnd() * 4, r * (1.1 + rnd() * 0.3), r * (0.7 + rnd() * 0.2), rnd() * 3, 0, Math.PI * 2);
        c.stroke();
      }
    }
    c.strokeStyle = '#3a5a80';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(70 + rnd() * 10, 0);
    c.quadraticCurveTo(60 + rnd() * 30, h / 2, 76 + rnd() * 14, h);
    c.stroke();
    // The station, range rings round it, and somebody's red marks.
    const sx = 72 + rnd() * 16;
    const sy = 46 + rnd() * 20;
    c.fillStyle = '#2a2620';
    c.fillRect(sx - 3, sy - 3, 7, 7);
    c.strokeStyle = '#2a2620';
    c.lineWidth = 1;
    c.setLineDash([3, 3]);
    for (const r of [20, 38]) {
      c.beginPath();
      c.arc(sx, sy, r, 0, Math.PI * 2);
      c.stroke();
    }
    c.setLineDash([]);
    c.strokeStyle = '#b3241c';
    c.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const x = 12 + rnd() * (w - 24);
      const y = 10 + rnd() * (h - 20);
      c.beginPath();
      c.moveTo(x - 4, y - 4);
      c.lineTo(x + 4, y + 4);
      c.moveTo(x + 4, y - 4);
      c.lineTo(x - 4, y + 4);
      c.stroke();
    }
    c.beginPath();
    c.arc(sx + 2, sy - 1, 11, 0.4, Math.PI * 1.8);
    c.stroke();
  });
}

/** The chalk outline of a long gun (or, `short`, a hand gun) on a wall-buy board. */
export function outlineTile(short: boolean): UVRect {
  return signTile(`outline:${short}`, 112, 40, (c, w, h) => {
    c.strokeStyle = '#e4ecdc';
    c.lineWidth = 2;
    c.lineJoin = 'round';
    c.beginPath();
    if (short) {
      c.moveTo(38, 12);
      c.lineTo(80, 12);
      c.lineTo(80, 20);
      c.lineTo(56, 20);
      c.lineTo(52, 36);
      c.lineTo(42, 36);
      c.lineTo(44, 20);
      c.lineTo(38, 20);
    } else {
      c.moveTo(4, 14);
      c.lineTo(30, 12);
      c.lineTo(106, 12);
      c.lineTo(106, 17);
      c.lineTo(66, 18);
      c.lineTo(62, 22);
      c.lineTo(48, 22);
      c.lineTo(44, 34);
      c.lineTo(36, 34);
      c.lineTo(38, 22);
      c.lineTo(26, 22);
      c.lineTo(6, 30);
    }
    c.closePath();
    c.stroke();
    void w;
    void h;
  });
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
