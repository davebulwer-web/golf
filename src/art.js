// Placeholder pixel art: ground colours, sprites and a tiny bitmap font.
// Everything is drawn from code so there are no image files to load.

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
export const STYLE_ART = {
  parkland: { trees: ['oak'], density: 0.5 },
  stadium: { trees: ['oak'], density: 0.45 },
  woodland: { trees: ['oak', 'pine'], density: 0.6 },
  alpine: { trees: ['pine'], density: 0.55, ground: { land: ['#4c9638', '#479034'] } },
  heathland: {
    trees: ['pine', 'heather'], density: 0.45,
    ground: { trees: ['#6b5a72', '#5d4f66'], land: ['#5e8a38', '#587f34'], rough: ['#5a7f30', '#638a36'] },
  },
  tropical: { trees: ['palm'], density: 0.45, ground: { land: ['#60aa3a', '#5ba436'], trees: ['#2f7424', '#2b6c22'] } },
  links: {
    trees: ['gorse'], density: 0.35,
    ground: { trees: ['#8a9448', '#7f8a40'], land: ['#93a050', '#8a984a'], rough: ['#76933c', '#7e9a42'] },
  },
  desert: {
    trees: ['cactus'], density: 0.12,
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

function darken(c) {
  const n = parseInt(c.slice(1), 16);
  const f = (v) => Math.round(v * 0.72).toString(16).padStart(2, '0');
  return '#' + f(n >> 16) + f((n >> 8) & 0xff) + f(n & 0xff);
}

// ---------- Sprites ----------
// Each sprite is rows of characters; '.' is transparent and other letters index
// its colours. (ax, ay) is the pixel that sits on the ground point.

export const SPRITES = {
  oak: {
    ax: 3, ay: 8, colors: { a: '#1f4d18', b: '#2f7a26', c: '#4f9e3a', d: '#5a3a1e' },
    rows: [
      '..aaa..',
      '.abcca.',
      'abbccba',
      'abbbbba',
      'abbbbba',
      '.abbba.',
      '..aaa..',
      '...d...',
      '...d...',
    ],
  },
  pine: {
    ax: 3, ay: 10, colors: { a: '#173f1c', b: '#24602a', c: '#3a7f3a', d: '#4a2f18' },
    rows: [
      '...a...',
      '..aca..',
      '..aba..',
      '.abcba.',
      '.abbba.',
      'abcbbba',
      '.abbba.',
      'abbbbba',
      'aaaaaaa',
      '...d...',
      '...d...',
    ],
  },
  palm: {
    ax: 4, ay: 10, colors: { a: '#2b6a1e', b: '#4fa02e', d: '#8a6a3a' },
    rows: [
      '.aa...aa.',
      'abba.abba',
      '...abba..',
      '..ab.dba.',
      '.ab..d.ba',
      '.....d...',
      '.....d...',
      '....d....',
      '....d....',
      '....d....',
      '...ddd...',
    ],
  },
  cactus: {
    ax: 2, ay: 7, colors: { a: '#3f7a32', b: '#5a9a44' },
    rows: [
      '..a..',
      'a.b..',
      'a.a.a',
      'aba.b',
      '..aba',
      '..a..',
      '..a..',
      '..a..',
    ],
  },
  gorse: {
    ax: 2, ay: 2, colors: { a: '#3d5a1e', b: '#567a2a', c: '#e8c83a' },
    rows: [
      '.aca.',
      'abcba',
      '.aaa.',
    ],
  },
  heather: {
    ax: 2, ay: 2, colors: { a: '#4a3a52', b: '#8a5a96', c: '#b07ac0' },
    rows: [
      '.bcb.',
      'abbba',
      '.aaa.',
    ],
  },
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
  flag: {
    ax: 0, ay: 9, colors: { f: '#e8302a', g: '#b01e1a', p: '#f4f4f4', k: '#1a1a1a' },
    rows: [
      'pff.',
      'pfff',
      'pgg.',
      'p...',
      'p...',
      'p...',
      'p...',
      'p...',
      'p...',
      'k...',
    ],
  },
};

// Turn sprite rows into packed pixels once, with colours resolved.
for (const s of Object.values(SPRITES)) {
  s.w = s.rows[0].length;
  s.h = s.rows.length;
  s.px = s.rows.map((r) => [...r].map((ch) => (ch === '.' ? 0 : hex(s.colors[ch]))));
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
