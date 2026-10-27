// Sprites from the Dinky Tiny Golf pack by Mike Moore (www.pixelbitsnbytes.com):
// the golfer, the ball in flight, the flag and the result banners. Until the
// images have loaded, callers fall back to the placeholder art.

import { DINKY_PNGS } from './dinky-assets.js';

const images = {};
for (const [name, url] of Object.entries(DINKY_PNGS)) {
  const img = new Image();
  img.src = url;
  images[name] = img;
}

const ready = (name) => images[name]?.complete && images[name].naturalWidth > 0;

// A sprite as a canvas, with the golfer's blue shirt recoloured to `shirt`
// (a '#rrggbb' colour, or null to keep it), and its anchor: the middle of its
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
  if (shirt) {
    const n = parseInt(shirt.slice(1), 16), sr = n >> 16, sg = (n >> 8) & 255, sb = n & 255;
    for (let i = 0; i < px.length; i += 4) {
      const [r, gg, b] = [px[i], px[i + 1], px[i + 2]];
      if (px[i + 3] === 0 || b < r + 60 || b < gg + 30) continue; // only the strong blues of the shirt
      const light = (r + gg + b) / 3 / 120; // keep its shading
      px[i] = Math.min(255, sr * light); px[i + 1] = Math.min(255, sg * light); px[i + 2] = Math.min(255, sb * light);
    }
    g.putImageData(data, 0, 0);
  }
  // Anchor at the middle of the lowest row that has anything in it.
  let ax = 0, ay = c.height;
  for (let y = c.height - 1; y >= 0; y--) {
    const xs = [];
    for (let x = 0; x < c.width; x++) if (px[(y * c.width + x) * 4 + 3] > 0) xs.push(x);
    if (xs.length) { ax = name.startsWith('flag') ? xs[0] : Math.round((xs[0] + xs[xs.length - 1]) / 2); ay = y; break; }
  }
  const out = { canvas: c, ax, ay, w: c.width, h: c.height };
  preparedCache.set(key, out);
  return out;
}

// Draw sprite `name` with its anchor at (x, y), or with `topLeft` its top left
// corner. Returns false if it isn't loaded yet.
export function drawDinky(ctx, name, x, y, shirt = null, topLeft = false) {
  const s = prepared(name, shirt);
  if (!s) return false;
  ctx.drawImage(s.canvas, Math.round(topLeft ? x : x - s.ax), Math.round(topLeft ? y : y - s.ay));
  return true;
}

// Size of a sprite (for centring banners), or null if not loaded.
export function dinkySize(name) {
  const s = prepared(name);
  return s && { w: s.w, h: s.h };
}

// The golfer's frame for a pose: 'stand', 'swing' (with t from 0 to 1 through
// the swing), 'joy' or 'cry' (with now in ms, to flick between frames).
export function golferFrame(pose, t = 0, now = 0) {
  if (pose === 'swing') return `swing${Math.min(5, 1 + Math.floor(t * 5))}`;
  if (pose === 'joy' || pose === 'cry') return `${pose}${1 + (Math.floor(now / 260) % 2)}`;
  return 'swing1';
}

// The ball gets bigger the higher it is, from 'ball0' on the ground.
export const ballFrame = (h) => `ball${Math.max(0, Math.min(4, Math.round(h / 9)))}`;

// The flag's frame, waving.
export const flagFrame = (now) => `flag${1 + (Math.floor(now / 160) % 4)}`;

// Result banners: which picture goes with a lie after a shot, or a score on a hole.
export const LIE_BANNERS = { fairway: 'txt-fairway', rough: 'txt-intherough', bunker: 'txt-bunker', green: 'txt-onthegreen' };
export function scoreBanner(strokes, par) {
  if (strokes === 1) return ['txt-holeinone'];
  const d = strokes - par;
  return d <= -2 ? ['txt-eagle'] : d === -1 ? ['txt-birdie'] : d === 0 ? ['txt-par'] : d === 1 ? ['txt-bogey'] : d === 2 ? ['txt-double', 'txt-bogey'] : [];
}
