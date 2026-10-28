// Sprites from the Dinky Tiny Golf pack by Mike Moore (www.pixelbitsnbytes.com):
// the ball in flight, the flag and a few result banners. Also the golfer and
// the score and hazard pop-ups, from Dave's sheets. Until the images have
// loaded, callers fall back to the placeholder art.

import { DINKY_PNGS } from './dinky-assets.js';
import { GOLFER_PNGS } from './golfer-assets.js';
import { POPUP_PNGS } from './popup-assets.js';

// Every golfer frame is cut the same size, with the middle of the feet here.
const GOLFER_FEET = { x: 20, y: 36 };

const images = {};
for (const [name, url] of Object.entries({ ...DINKY_PNGS, ...GOLFER_PNGS, ...POPUP_PNGS })) {
  const img = new Image();
  img.src = url;
  images[name] = img;
}

const ready = (name) => images[name]?.complete && images[name].naturalWidth > 0;

// How to find each look's shirt in its frames (its colour as drawn on the
// sheet), and how light each shirt pixel is, to keep the shading when it's
// recoloured, and optionally the row it stops at; null for a look whose shirt
// can't be recoloured.
const SHIRTS = {
  club: { is: (r, g, b) => b >= r + 25 && b >= g + 15, light: (r, g, b) => (r + g + b) / 3 / 120 }, // blue
  heavy: { is: (r, g, b) => r >= g + 90 && Math.abs(g - b) < 35, light: (r) => r / 190 },          // red
  athletic: { is: (r, g, b) => r >= g + 70 && b >= g + 30, light: (r) => r / 190 },                // pink
  casual: { is: (r, g, b) => b >= r + 15 && b >= g + 50, light: (r, g, b) => b / 230, above: 33 }, // lilac (her shoes too, so only above row 33)
  veteran: null, // a beige jumper, too like the trousers and skin to pick out: keeps his own colours
};
// Every golfer look there are sprites for.
export const GOLFER_LOOKS = Object.keys(SHIRTS);

// A sprite as a canvas, with a golfer's shirt recoloured to `shirt` (a
// '#rrggbb' colour, or null to keep it), and its anchor: the middle of its
// feet (or the foot of the flag pole).
const preparedCache = new Map();
function prepared(name, shirt = null) {
  const key = `${name}|${shirt}`;
  if (preparedCache.has(key)) return preparedCache.get(key);
  if (!ready(name)) return null;
  const img = images[name];
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  const look = SHIRTS[name.split('/')[0]];
  if (shirt && look) {
    const n = parseInt(shirt.slice(1), 16), sr = n >> 16, sg = (n >> 8) & 255, sb = n & 255;
    for (let i = 0; i < px.length; i += 4) {
      const [r, gg, b] = [px[i], px[i + 1], px[i + 2]];
      if (px[i + 3] === 0 || !look.is(r, gg, b) || i / 4 / c.width >= (look.above ?? Infinity)) continue;
      const light = look.light(r, gg, b);
      px[i] = Math.min(255, sr * light); px[i + 1] = Math.min(255, sg * light); px[i + 2] = Math.min(255, sb * light);
    }
    g.putImageData(data, 0, 0);
  }
  // Anchor at the middle of the lowest row that has anything in it.
  let ax = 0, ay = c.height;
  if (GOLFER_PNGS[name]) ({ x: ax, y: ay } = GOLFER_FEET);
  else for (let y = c.height - 1; y >= 0; y--) {
    const xs = [];
    for (let x = 0; x < c.width; x++) if (px[(y * c.width + x) * 4 + 3] > 0) xs.push(x);
    if (xs.length) { ax = name.startsWith('flag') ? xs[0] : Math.round((xs[0] + xs[xs.length - 1]) / 2); ay = y; break; }
  }
  const out = { canvas: c, ax, ay, w: c.width, h: c.height };
  preparedCache.set(key, out);
  return out;
}

// Draw sprite `name` with its anchor at (x, y), or with `topLeft` its top left
// corner; `flip` mirrors it left to right. Returns false if it isn't loaded yet.
export function drawDinky(ctx, name, x, y, shirt = null, topLeft = false, flip = false) {
  const s = prepared(name, shirt);
  if (!s) return false;
  const left = Math.round(topLeft ? x : flip ? x - (s.w - 1 - s.ax) : x - s.ax), top = Math.round(topLeft ? y : y - s.ay);
  if (!flip) ctx.drawImage(s.canvas, left, top);
  else {
    ctx.save();
    ctx.translate(left + s.w, top);
    ctx.scale(-1, 1);
    ctx.drawImage(s.canvas, 0, 0);
    ctx.restore();
  }
  return true;
}

// Size of a sprite (for centring banners), or null if not loaded.
export function dinkySize(name) {
  const s = prepared(name);
  return s && { w: s.w, h: s.h };
}

// The golfer's frame for a pose. `t` is how far through the stroke they are,
// counting the swing up to the moment of impact as 1 (it goes on past 1 while
// the ball flies), and `now` (in ms) moves the idle and mood frames along.
//   'swing': the full swing, then the follow through, holding the finish and
//            shading the eyes to watch the ball;
//   'putt':  the putting stroke;
//   'address': over the ball, about to play;
//   'joy', 'cry': after holing out, with `now` counted from when they holed;
//   'stand': waiting a turn, shifting about.
// Each swing frame with when it ends: a slow take back, a pause at the top, and
// a quick strike.
const SWING_FRAMES = [['address', 0.16], ['takeaway', 0.34], ['backswing-1', 0.52], ['backswing-2', 0.76], ['downswing-1', 0.86], ['downswing-2', 0.94], ['impact', 1]];
const FOLLOW_FRAMES = ['follow-1', 'follow-2', 'finish'];
const IDLE_FRAMES = ['idle-1', 'idle-2', 'idle-3', 'idle-4', 'idle-3', 'idle-2'];
export function golferFrame(pose, t = 0, now = 0) {
  if (pose === 'swing') {
    if (t < 1) return SWING_FRAMES.find(([, end]) => t < end)[0];
    if (t < 1.6) return FOLLOW_FRAMES[Math.floor((t - 1) / 0.2)];
    return t < 4 ? 'finish' : 'shade-eyes';
  }
  if (pose === 'putt') return t < 0.35 ? 'putt-address' : t < 0.85 ? 'putt-back' : t < 1.15 ? 'putt-forward' : 'putt-follow';
  if (pose === 'address') return 'address';
  if (pose === 'joy') return `happy-${1 + (Math.floor(now / 240) % 4)}`;
  if (pose === 'cry') return `cross-${1 + Math.min(3, Math.floor(now / 350) % 6)}`;
  return IDLE_FRAMES[Math.floor(now / 450) % IDLE_FRAMES.length];
}

// The ball gets bigger the higher it is, from 'ball0' on the ground.
export const ballFrame = (h) => `ball${Math.max(0, Math.min(4, Math.round(h / 9)))}`;

// The flag's frame, waving.
export const flagFrame = (now) => `flag${1 + (Math.floor(now / 160) % 4)}`;

// Result banners: which picture goes with a lie after a shot, or a score on a hole.
export const LIE_BANNERS = { fairway: 'txt-fairway', rough: 'txt-intherough', bunker: 'pop-bunker', green: 'txt-onthegreen' };
export const WATER_BANNER = 'pop-water', OB_BANNER = 'pop-ob';
export function scoreBanner(strokes, par) {
  if (strokes === 1) return ['pop-holeinone'];
  const d = strokes - par;
  return d <= -3 ? ['pop-albatross'] : d === -2 ? ['pop-eagle'] : d === -1 ? ['pop-birdie'] : d === 0 ? ['pop-par']
    : d === 1 ? ['pop-bogey'] : d === 2 ? ['pop-double'] : d === 3 ? ['pop-triple'] : [];
}
