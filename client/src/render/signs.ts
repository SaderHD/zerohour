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

export type SignStyle = 'plate' | 'stencil' | 'hazard' | 'chalk' | 'ink';

const ARROW_W = 26;

/**
 * Lettering: a painted plate, a wall stencil (transparent around the letters), a hazard plate,
 * chalk, or ink (dark letters with nothing round them, for a board that is lit from behind). A text that starts with "< " or ends with " >" gets an arrow painted at that end.
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
    c.fillStyle = style === 'stencil' ? '#e8e2d0' : style === 'chalk' ? '#e4ecdc' : style === 'ink' ? '#14100e' : '#2a2620';
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

/**
 * One big letter, for a name spelt out a letter to a tube or a can (a diner's neon, the sign on a
 * store's roof): dark for the face of a lit box, light for a painted one. Nothing round it.
 */
export function letterTile(ch: string, ink: boolean): { uv: UVRect; aspect: number } {
  const [w, h] = [40, 52];
  const uv = signTile(`letter:${ink ? 'ink' : 'light'}:${ch}`, w, h, (c) => {
    c.fillStyle = ink ? '#14100e' : '#f0e8d0';
    c.font = 'bold 50px "Courier New", monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(ch, w / 2, h / 2 + 3, w - 2);
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

interface Outline {
  /** Barrel length, 0..1 of the room on the board. */
  barrel: number;
  stock: 'solid' | 'wire' | 'none';
  mag: 'none' | 'stick' | 'curved';
  pump?: boolean;
  twin?: boolean;
}

/** What each wall weapon looks like in chalk; anything else gets the plain long gun. */
const OUTLINES: Record<string, Outline> = {
  farrow: { barrel: 1, stock: 'solid', mag: 'none' },
  pike: { barrel: 0.95, stock: 'solid', mag: 'none', pump: true },
  stitch: { barrel: 0.45, stock: 'wire', mag: 'stick' },
  coachman: { barrel: 0.8, stock: 'solid', mag: 'none', twin: true },
  kestrel: { barrel: 0.75, stock: 'solid', mag: 'curved' },
  brakeman: { barrel: 0.3, stock: 'wire', mag: 'stick' },
};

/** The chalk outline of a weapon on its wall-buy board: stock to the left, muzzle to the right. */
export function outlineTile(weapon: string): UVRect {
  const o = OUTLINES[weapon] ?? OUTLINES.farrow!;
  return signTile(`outline:${weapon in OUTLINES ? weapon : 'farrow'}`, 112, 40, (c) => {
    c.strokeStyle = '#e4ecdc';
    c.lineWidth = 2;
    c.lineJoin = 'round';
    const poly = (...pts: number[]): void => {
      c.beginPath();
      for (let i = 0; i < pts.length; i += 2) c[i ? 'lineTo' : 'moveTo'](pts[i]!, pts[i + 1]!);
      c.closePath();
      c.stroke();
    };
    const end = 62 + o.barrel * 44;
    if (o.stock === 'solid') poly(4, 13, 30, 11, 30, 22, 6, 30);
    if (o.stock === 'wire') poly(6, 13, 30, 13, 30, 16, 9, 16, 9, 28, 6, 28);
    poly(30, 10, 62, 10, 62, 22, 30, 22); // receiver
    poly(37, 22, 44, 22, 41, 34, 33, 34); // grip
    poly(62, 11, end, 11, end, 15, 62, 15); // barrel
    if (o.twin) poly(62, 15, end, 15, end, 19, 62, 19);
    if (o.pump) {
      poly(62, 17, end - 6, 17, end - 6, 20, 62, 20);
      poly(70, 16, 88, 16, 88, 23, 70, 23);
    } else if (!o.twin) poly(62, 15, 62 + o.barrel * 22, 15, 62 + o.barrel * 20, 20, 62, 21); // fore-end
    if (o.mag === 'stick') poly(49, 22, 56, 22, 56, 38, 49, 38);
    if (o.mag === 'curved') poly(49, 22, 57, 22, 63, 35, 55, 38);
    poly(end - 3, 8, end - 1, 8, end - 1, 11, end - 3, 11); // front sight
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
