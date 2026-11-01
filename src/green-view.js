// The green seen from above for putting, like the 16-bit golf games: the putt
// runs up the screen. The ground uses the same textures as the course, with the
// same faint mowing stripes and darker banks round the green, shaded lighter
// where it's higher, and arrows drift downhill to show the slope.

import { surfaceAt, dist } from './course-generator.js';
import { heightAt, slopeAt } from './terrain.js';
import { groundTextures, groundPalette } from './art.js';
import { CUP } from './putting.js';

const GREEN_STRIPE = 2.5;   // yards per mowing stripe, as on the course
const GREEN_MOWN = 0.95;    // how much darker the alternate stripes are (the course's own)
const ARROW_GAP = 44; // pixels between slope arrows
const FLAT_SLOPE = 0.004;  // slopes gentler than this get no arrow

// Lay the green out in the screen box { x, y, w, h } for a putt from `ball`:
// the hole straight up the screen from the ball, the two of them centred and as
// close up as fits. Draws the ground into a canvas of the whole screen, W x H,
// with the course's ground textures blown up `tex` times so they look the size
// they do on the course close up.
export function makeGreenView(hole, ball, box, W, H, tex = 2) {
  const pin = hole.pin;
  const d = Math.max(0.5, dist(ball, pin));
  const up = { x: (pin.x - ball.x) / d, y: (pin.y - ball.y) / d };
  // Turned, never mirrored, so it matches the course view.
  const right = { x: up.y, y: -up.x };
  const scale = Math.max(5, Math.min(24, box.h * 0.62 / d)); // pixels per yard
  const mid = { x: (ball.x + pin.x) / 2, y: (ball.y + pin.y) / 2 };
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const toScreen = (p) => {
    const dx = p.x - mid.x, dy = p.y - mid.y;
    return { x: cx + (dx * right.x + dy * right.y) * scale, y: cy - (dx * up.x + dy * up.y) * scale };
  };
  const toWorld = (x, y) => {
    const a = (x - cx) / scale, b = -(y - cy) / scale;
    return { x: mid.x + right.x * a + up.x * b, y: mid.y + right.y * a + up.y * b };
  };
  // A direction on the green as a screen direction.
  const dirToScreen = (v) => ({ x: v.x * right.x + v.y * right.y, y: -(v.x * up.x + v.y * up.y) });

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const img = g.createImageData(W, H);
  const buf = new Uint32Array(img.data.buffer);
  const textures = groundTextures(hole.style);
  const palette = groundPalette(hole.style);
  const h0 = heightAt(hole, pin);
  // Find the ground every few pixels, and pixel by pixel only where it changes.
  const B = 4, gw = Math.ceil(W / B) + 1, gh = Math.ceil(H / B) + 1;
  const coarse = [], lift = [];
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const p = toWorld(i * B + 0.5, j * B + 0.5);
      coarse.push(surfaceAt(hole, p));
      lift.push(heightAt(hole, p) - h0);
    }
  }
  const liftAt = (x, y) => {
    const i = Math.floor(x / B), j = Math.floor(y / B), k = j * gw + i, u = (x % B) / B, v = (y % B) / B;
    return lift[k] * (1 - u) * (1 - v) + lift[k + 1] * u * (1 - v) + lift[k + gw] * (1 - u) * v + lift[k + gw + 1] * u * v;
  };
  const groundAt = (x, y, p) => {
    const i = Math.floor(x / B), j = Math.floor(y / B), k = j * gw + i;
    const a = coarse[k];
    return a === coarse[k + 1] && a === coarse[k + gw] && a === coarse[k + gw + 1] ? a : surfaceAt(hole, p);
  };
  const names = [], ids = new Map();
  const id = (s) => { if (!ids.has(s)) { ids.set(s, names.length); names.push(s); } return ids.get(s); };
  const surf = new Uint8Array(W * H);
  const stripe = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = toWorld(x + 0.5, y + 0.5);
      surf[y * W + x] = id(groundAt(x, y, p));
      stripe[y * W + x] = Math.floor((p.x + p.y) / GREEN_STRIPE) & 1;
    }
  }
  const RAISED = new Set(['green', 'tee']), SUNKEN = new Set(['bunker', 'water', 'sea']);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = y * W + x;
      const s = names[surf[k]];
      const t = textures[s] ?? textures.land;
      let c = t.px[(Math.floor(y / tex) % t.h) * t.w + (Math.floor(x / tex) % t.w)];
      if ((s === 'green' || s === 'fairway') && stripe[k]) c = greenDimmed(c, GREEN_MOWN);
      // A bank round the green and tees, and a lip round bunkers and water, as on the course.
      const edge = (palette[s] ?? palette.land)[2];
      const near = (dx, dy) => { const xx = x + dx, yy = y + dy; return xx < 0 || yy < 0 || xx >= W || yy >= H ? surf[k] : surf[yy * W + xx]; };
      if ((RAISED.has(s) || SUNKEN.has(s)) && (near(1, 0) !== surf[k] || near(-1, 0) !== surf[k] || near(0, 1) !== surf[k] || near(0, -1) !== surf[k])) {
        if (!SUNKEN.has(s) || !SUNKEN.has(names[near(0, -1)])) c = edge;
      }
      // Higher ground a touch lighter, lower ground darker.
      if (s === 'green' || s === 'fringe') c = greenDimmed(c, 1 + Math.max(-0.16, Math.min(0.16, liftAt(x, y) * 0.5)));
      buf[k] = c;
    }
  }
  g.putImageData(img, 0, 0);
  // The slope arrows sit on a grid over the green, pointing downhill.
  const arrows = [];
  for (let y = ARROW_GAP >> 1; y < H; y += ARROW_GAP) {
    for (let x = ARROW_GAP >> 1; x < W; x += ARROW_GAP) {
      if (names[surf[y * W + x]] !== 'green') continue;
      const sl = slopeAt(hole, toWorld(x + 0.5, y + 0.5));
      const steep = Math.hypot(sl.x, sl.y);
      if (steep <= FLAT_SLOPE) continue;
      const down = dirToScreen({ x: -sl.x / steep, y: -sl.y / steep });
      arrows.push({ x, y, dx: down.x, dy: down.y, steep });
    }
  }
  return { hole, ball, pin, scale, canvas, toScreen, toWorld, arrows };
}

// A packed pixel made lighter or darker by factor f.
const greenDimmed = (c, f) => (c & 0xff000000) | (Math.min(255, ((c >>> 16) & 255) * f) << 16) | (Math.min(255, ((c >>> 8) & 255) * f) << 8) | Math.min(255, (c & 255) * f);

// Slope arrows, drawn once for each of 32 directions and three sizes: a pale
// arrow with a dark outline, so it reads on any grass.
const ARROW_DIRS = 32;
const arrowCache = new Map();
function arrowSprite(dir, size, color) {
  const key = `${dir}:${size}:${color}`;
  if (arrowCache.has(key)) return arrowCache.get(key);
  const a = (dir / ARROW_DIRS) * Math.PI * 2, ux = Math.cos(a), uy = Math.sin(a);
  const len = [7, 9, 12][size], half = len / 2, head = [3, 4, 5][size], R = 8, N = R * 2 + 1;
  const inside = (x, y) => {
    const u = x * ux + y * uy, v = -x * uy + y * ux;
    if (u > half || u < -half) return false;
    if (u >= half - head) return Math.abs(v) <= (half - u) * 0.95 + 0.4;
    return Math.abs(v) <= 0.6;
  };
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const outline = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => inside(x + ox, y + oy));
  for (let y = -R; y <= R; y++) {
    for (let x = -R; x <= R; x++) {
      if (inside(x, y)) g.fillStyle = color;
      else if (outline(x, y)) g.fillStyle = 'rgba(16, 40, 16, 0.75)';
      else continue;
      g.fillRect(x + R, y + R, 1, 1);
    }
  }
  const out = { canvas: c, R };
  arrowCache.set(key, out);
  return out;
}

const dotAt = (ctx, x, y, color, w = 1, h = 1) => { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), w, h); };

// Draw the green: the ground, the slope arrows (moving faster on steeper
// slopes), the hole, any other balls, the aim and the ball. `aim` and `ball`
// are world points; `others` are other golfers' balls. `pace`, while the power
// bar swings, is how far the putt would roll on the flat, in yards: a marker
// slides along the line to show it.
export function drawGreenView(ctx, v, now, { ball, aim, pace = null, others = [], dropped = false }) {
  ctx.drawImage(v.canvas, 0, 0);
  for (const a of v.arrows) {
    // Each arrow drifts downhill and fades, then starts again: bigger, brighter
    // and quicker on steeper ground.
    const size = a.steep < 0.02 ? 0 : a.steep < 0.04 ? 1 : 2;
    const color = ['#f0ffe4', '#fff2a0', '#ffc460'][size];
    const dir = Math.round(Math.atan2(a.dy, a.dx) / (Math.PI * 2) * ARROW_DIRS + ARROW_DIRS) % ARROW_DIRS;
    const spr = arrowSprite(dir, size, color);
    const t = ((now / 1000) * (0.35 + a.steep * 14) + (a.x * 0.37 + a.y * 0.11) / ARROW_GAP) % 1;
    const drift = (t - 0.5) * 8;
    ctx.globalAlpha = Math.min(1, Math.sin(t * Math.PI) * 1.6) * (0.75 + size * 0.1);
    ctx.drawImage(spr.canvas, Math.round(a.x + a.dx * drift) - spr.R, Math.round(a.y + a.dy * drift) - spr.R);
  }
  ctx.globalAlpha = 1;
  // The hole: a dark disc with a lighter lip on the far side.
  const c = v.toScreen(v.pin);
  const r = Math.max(3.2, CUP * v.scale);
  for (let y = -Math.ceil(r); y <= Math.ceil(r); y++) {
    for (let x = -Math.ceil(r); x <= Math.ceil(r); x++) {
      const d = Math.hypot(x, y);
      if (d <= r) dotAt(ctx, c.x + x, c.y + y, d > r - 1 && y < 0 ? '#2a3a24' : '#0a0c08');
      else if (d <= r + 1) dotAt(ctx, c.x + x, c.y + y, 'rgba(255, 255, 255, 0.55)');
    }
  }
  // The flagstick's shadow, falling down to the right.
  for (let k = 2; k < 14; k++) dotAt(ctx, c.x + k * 0.7 + r - 1, c.y + k * 0.35, 'rgba(0, 0, 0, 0.25)');
  for (const o of others) greenBall(ctx, v.toScreen(o), v.scale, '#e8e8f0');
  if (aim) greenAim(ctx, v, ball, aim, now, pace);
  if (!dropped) greenBall(ctx, v.toScreen(ball), v.scale, '#ffffff');
}

function greenBall(ctx, s, scale, color) {
  const x = Math.round(s.x), y = Math.round(s.y);
  if (scale >= 10) {
    dotAt(ctx, x - 1, y + 1, 'rgba(0, 0, 0, 0.35)', 3, 2);
    dotAt(ctx, x - 1, y - 1, color, 3, 3);
    dotAt(ctx, x + 1, y + 1, '#b8b8c8');
  } else {
    dotAt(ctx, x, y + 1, 'rgba(0, 0, 0, 0.35)', 2, 1);
    dotAt(ctx, x - 1, y - 1, color, 2, 2);
  }
}

// A dotted line from the ball to the aim, with a crosshair on the aim: where the
// ball would stop on the flat. While the bar swings, a ring slides out along the
// line to where the putt is set to roll.
function greenAim(ctx, v, ball, aim, now, pace) {
  const a = v.toScreen(ball), b = v.toScreen(aim);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
  const crawl = (now / 120) % 4;
  for (let k = 4 + crawl; k < len - 5; k += 4) {
    dotAt(ctx, a.x + ux * k + 1, a.y + uy * k + 1, 'rgba(0, 0, 0, 0.35)');
    dotAt(ctx, a.x + ux * k, a.y + uy * k, 'rgba(255, 255, 255, 0.9)');
  }
  const x = Math.round(b.x), y = Math.round(b.y);
  for (const [col, o] of [['rgba(0, 0, 0, 0.4)', 1], ['#ffffff', 0]]) {
    for (let k = 3; k <= 6; k++) {
      dotAt(ctx, x - k + o, y + o, col); dotAt(ctx, x + k + o, y + o, col);
      dotAt(ctx, x + o, y - k + o, col); dotAt(ctx, x + o, y + k + o, col);
    }
  }
  if (pace == null) return;
  const r = pace * v.scale;
  const px = Math.round(a.x + ux * r), py = Math.round(a.y + uy * r);
  const close = Math.abs(r - len) < 3;
  for (let k = 0; k < 16; k++) {
    const t = (k / 16) * Math.PI * 2;
    const qx = Math.round(px + Math.cos(t) * 3.5), qy = Math.round(py + Math.sin(t) * 3.5);
    dotAt(ctx, qx + 1, qy + 1, 'rgba(0, 0, 0, 0.4)');
    dotAt(ctx, qx, qy, close ? '#ff6060' : '#ffe070');
  }
}
