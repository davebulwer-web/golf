// Pixel art drawn from code: ground colours, sprites and a tiny bitmap font,
// plus the trees, course props and ground textures from assets/trees,
// assets/props and assets/ground (packed into tree-assets.js, prop-assets.js
// and ground-assets.js).

import { TREE_PIXELS } from './tree-assets.js';
import { PROP_PIXELS } from './prop-assets.js';
import { EVENT_PIXELS } from './event-assets.js';
import { GROUND_PIXELS } from './ground-assets.js';

const hex = (s) => {
  const n = parseInt(s.slice(1), 16);
  // ImageData is little-endian RGBA, so pack as ABGR.
  return (0xff << 24 | (n & 0xff) << 16 | (n & 0xff00) | n >> 16) >>> 0;
};

// Ground colours. Each surface has a base and an alternate (stripes or speckles),
// and some have an edge colour for lips and banks.
const BASE_GROUND = {
  land: ['#5aa236', '#559c33'],
  trees: ['#2f6a22', '#2b6320'],
  copse: ['#285e1d', '#24561a'],
  rough: ['#468c2c', '#4c932f'],
  fairway: ['#78c848', '#6aba40'],
  fringe: ['#7acc4c', '#76c84a'],
  green: ['#8cdc5a', '#84d454'],
  tee: ['#80d250', '#76c64a'],
  bunker: ['#ecdca4', '#d9c68a', '#b39e64'],
  water: ['#3a7fd0', '#79b4f0', '#2a5c9c'],
  sea: ['#2f6bb8', '#5d97dc', '#24548f'],
  beach: ['#f0e2b0', '#e2cf96', '#c8b47a'],
  waste: ['#d8b878', '#b89a5c', '#a88a4c'],
};

// Style tweaks: what grows off the fairway and which trees line the hole.
// A name listed more than once turns up more often. `density` is the chance of
// a tree on each tile of woods.
const LEAFY = ['oak-1', 'oak-2', 'oak-3', 'oak-4', 'oak-5', 'oak-6', 'oak-7', 'bushy-1', 'bushy-2'];
const PINES = ['pine-1', 'pine-2', 'pine-3', 'pine-4', 'pine-5', 'pine-6', 'pine-7', 'pine-8', 'pine-9', 'pine-10'];
export const STYLE_ART = {
  parkland: { trees: [...LEAFY, ...LEAFY, ...LEAFY, ...LEAFY, ...LEAFY, ...LEAFY, 'willow', 'willow', 'cypress-1', 'cypress-1', 'blossom', 'berry-bush'], density: 0.2 },
  stadium: { trees: [...LEAFY, 'cypress-1', 'cypress-2', 'cypress-2', 'bush-1'], density: 0.18 },
  woodland: { trees: [...LEAFY, ...LEAFY, ...PINES, ...PINES, 'autumn-1', 'autumn-2', 'autumn-3', 'bare-1', 'bare-2', 'willow'], density: 0.26 },
  alpine: { trees: PINES, density: 0.24, ground: { land: ['#4c9638', '#479034'] } },
  heathland: {
    trees: [...PINES, 'bushy-1', 'heather-1', 'heather-2', 'heather-3', 'heather-1', 'heather-2'], density: 0.25,
    ground: { trees: ['#6b5a72', '#5d4f66'], land: ['#5e8a38', '#587f34'], rough: ['#5a7f30', '#638a36'] },
  },
  tropical: { trees: ['palm-1', 'palm-2', 'palm-3', 'palm-1', 'palm-2', 'palm-3', 'bush-1', 'berry-bush'], density: 0.2, ground: { land: ['#60aa3a', '#5ba436'], trees: ['#2f7424', '#2b6c22'] } },
  links: {
    trees: ['gorse-1', 'gorse-2', 'gorse-3', 'gorse-1', 'bush-1', 'bush-2'], density: 0.22,
    ground: { trees: ['#8a9448', '#7f8a40'], land: ['#93a050', '#8a984a'], rough: ['#76933c', '#7e9a42'] },
  },
  desert: {
    trees: ['cactus-1', 'cactus-2', 'cactus-3', 'acacia'], density: 0.1,
    ground: { trees: ['#d4a868', '#c99c5c'], land: ['#dbb070', '#d0a464'], rough: ['#8f9a48', '#9aa250'] },
  },
};

// Ground colours for a style, as packed pixels: { surface: [base, alt, edge] }.
export function groundPalette(style) {
  const g = { ...BASE_GROUND, ...(STYLE_ART[style]?.ground ?? {}) };
  const out = {};
  for (const k in g) {
    const [a, b, e] = g[k];
    out[k] = [hex(a), hex(b), hex(e ?? darken(a))];
  }
  return out;
}

// Ground textures for a style, as packed pixels: { surface: { w, h, px } }.
// The textures are drawn in parkland colours. A style with its own colour for a
// surface keeps the texture's light and dark but takes its colour from the style.
const textureCache = new Map();
export function groundTextures(style) {
  if (textureCache.has(style)) return textureCache.get(style);
  const own = { ...BASE_GROUND, ...(STYLE_ART[style]?.ground ?? {}) };
  const out = {};
  for (const [name, [w, h, b64]] of Object.entries(GROUND_PIXELS)) {
    const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    const n = w * h;
    const lum = (k) => 0.3 * bytes[k * 4] + 0.59 * bytes[k * 4 + 1] + 0.11 * bytes[k * 4 + 2];
    let mean = 0;
    for (let k = 0; k < n; k++) mean += lum(k) / n;
    const recolour = own[name][0] !== BASE_GROUND[name][0];
    const to = parseInt(own[name][0].slice(1), 16), base = [to >> 16, (to >> 8) & 255, to & 255];
    const px = new Uint32Array(n);
    for (let k = 0; k < n; k++) {
      const f = lum(k) / mean;
      const [r, g, b] = recolour ? base.map((v) => Math.min(255, Math.round(v * f))) : [0, 1, 2].map((i) => bytes[k * 4 + i]);
      px[k] = (0xff << 24 | b << 16 | g << 8 | r) >>> 0;
    }
    out[name] = { w, h, px };
  }
  textureCache.set(style, out);
  return out;
}

function darken(c) {
  const n = parseInt(c.slice(1), 16);
  const f = (v) => Math.round(v * 0.72).toString(16).padStart(2, '0');
  return '#' + f(n >> 16) + f((n >> 8) & 0xff) + f(n & 0xff);
}

// ---------- Sprites ----------
// Each sprite is rows of characters; '.' is transparent and other letters index
// its colours. (ax, ay) is the pixel that sits on the ground point.

export const SPRITES = {
  golfer: {
    ax: 2, ay: 9, colors: { h: '#f4f4f4', s: '#e8b88a', c: '#d03a2a', p: '#2a2a3a', k: '#1a3a12' },
    rows: [
      '.hhh.',
      '.hhh.',
      '..s..',
      '.ccc.',
      'c.c.c',
      's.c.s',
      '.p.p.',
      '.p.p.',
      '.p.p.',
      'kk.kk',
    ],
  },
};

// Turn sprite rows into packed pixels once, with colours resolved.
for (const s of Object.values(SPRITES)) {
  s.w = s.rows[0].length;
  s.h = s.rows.length;
  s.px = s.rows.map((r) => [...r].map((ch) => (ch === '.' ? 0 : hex(s.colors[ch]))));
}

// The trees and props, anchored at the foot: the middle of the bottom row.
// Props have a soft shadow below them, which isn't drawn, so theirs is the
// lowest solid row; a flag's is the hole, under its pole.
for (const [name, [w, h, b64]] of Object.entries({ ...TREE_PIXELS, ...PROP_PIXELS, ...EVENT_PIXELS })) {
  const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  const px = [];
  for (let j = 0; j < h; j++) {
    const row = [];
    for (let i = 0; i < w; i++) {
      const k = (j * w + i) * 4;
      row.push(bytes[k + 3] < 128 ? 0 : (0xff << 24 | bytes[k + 2] << 16 | bytes[k + 1] << 8 | bytes[k]) >>> 0);
    }
    px.push(row);
  }
  let ay = h - 1;
  while (ay > 0 && !px[ay].some((c) => c)) ay--;
  const foot = px[ay].map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
  let ax = foot.length ? Math.round((foot[0] + foot[foot.length - 1]) / 2) : w >> 1;
  if (name.startsWith('flag-')) {
    ax = Math.min(...px.slice(0, h >> 1).map((row) => row.findIndex((c) => c)).filter((i) => i >= 0));
    ay = h - 3; // the hole: every flag frame is cut the same height
  }
  SPRITES[name] = { w, h, px, ax, ay };
}

// Draw a sprite into a packed pixel buffer with its anchor at (x, y).
export function blit(buf, W, H, sprite, x, y, tint = null) {
  const x0 = Math.round(x) - sprite.ax, y0 = Math.round(y) - sprite.ay;
  for (let j = 0; j < sprite.h; j++) {
    const yy = y0 + j;
    if (yy < 0 || yy >= H) continue;
    for (let i = 0; i < sprite.w; i++) {
      const xx = x0 + i;
      const c = sprite.px[j][i];
      if (!c || xx < 0 || xx >= W) continue;
      buf[yy * W + xx] = tint?.[c] ?? c;
    }
  }
}

// Swap colours on a sprite, e.g. a different shirt for each golfer.
export const recolor = (sprite, map) => {
  const out = {};
  for (const k in map) out[hex(sprite.colors[k])] = hex(map[k]);
  return out;
};

export { hex };

// A sprite as a small canvas, for drawing things that move over the hole.
const spriteCache = new Map();
export function spriteImage(name, recolors = {}) {
  const key = name + JSON.stringify(recolors);
  if (!spriteCache.has(key)) {
    const s = SPRITES[name];
    const c = document.createElement('canvas');
    c.width = s.w; c.height = s.h;
    const g = c.getContext('2d');
    const img = g.createImageData(s.w, s.h);
    const tint = recolor(s, recolors);
    blit(new Uint32Array(img.data.buffer), s.w, s.h, s, s.ax, s.ay, tint);
    g.putImageData(img, 0, 0);
    spriteCache.set(key, c);
  }
  return spriteCache.get(key);
}

export function drawSprite(ctx, name, x, y, recolors) {
  const s = SPRITES[name];
  ctx.drawImage(spriteImage(name, recolors), Math.round(x) - s.ax, Math.round(y) - s.ay);
}

// ---------- Font ----------
// 3x5 pixel font. Each glyph is 15 bits, read left to right, top to bottom.

const GLYPHS = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
  Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
  0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010',
  8: '111101111101111', 9: '111101111001110',
  ':': '000010000010000', '.': '000000000000010', '-': '000000111000000', '/': '001001010100100',
  '(': '010100100100010', ')': '010001001001010', "'": '010010000000000', '%': '101001010100101',
  '<': '001010100010001', '>': '100010001010100', '_': '000000000000111', '£': '011010111010111',
  '+': '000010111010000', '!': '010010010000010', '?': '110001010000010', ',': '000000000010100', ' ': '000000000000000',
};

export const textWidth = (s, scale = 1) => (s.length * 4 - 1) * scale;

// Draw text on a 2D canvas context, with a one-pixel shadow so it reads on any ground.
export function drawText(ctx, s, x, y, color = '#f4f4f4', scale = 1, shadow = '#1a1a2a') {
  const pass = (dx, dy, col) => {
    ctx.fillStyle = col;
    let cx = x;
    for (const ch of s.toUpperCase()) {
      const g = GLYPHS[ch] ?? GLYPHS['?'];
      for (let k = 0; k < 15; k++) {
        if (g[k] === '1') ctx.fillRect(cx + (k % 3) * scale + dx, y + Math.floor(k / 3) * scale + dy, scale, scale);
      }
      cx += 4 * scale;
    }
  };
  if (shadow) pass(scale, scale, shadow);
  pass(0, 0, color);
}
