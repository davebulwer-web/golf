// On-screen panels: hole details and the wind, drawn over the hole.

import { drawText, textWidth } from './art.js';
import { STYLES, teeYards } from './course-generator.js';
import { windWords } from './weather.js';

const PANEL = 'rgba(40, 28, 70, 0.82)', EDGE = '#9a86d8', GOLD = '#f2c93a';

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PANEL;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = EDGE;
  ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
}

// `wind` is from holeWind; `windScreen` is the same wind as a screen direction.
export function drawHud(ctx, W, H, { course, hole, tee, weather, wind, windScreen }) {
  // Hole card, top left.
  const title = `HOLE ${hole.number}`;
  const line2 = `PAR ${hole.par}  ${teeYards(hole, tee)} YDS`;
  const line3 = `${course.name}  ${STYLES[course.style].name}`;
  const keys = 'N/P HOLE  R COURSE  S STYLE  +/- ZOOM';
  const w = Math.max(textWidth(title, 2), textWidth(line2), textWidth(line3), textWidth(keys)) + 12;
  panel(ctx, 6, 6, w, 42);
  drawText(ctx, title, 12, 11, GOLD, 2);
  drawText(ctx, line2, 12, 24);
  drawText(ctx, line3, 12, 31, '#c8c0e8');
  drawText(ctx, keys, 12, 39, '#8a80b0', 1, null);

  // Wind, top right: an arrow showing where it blows on screen, and its strength.
  const words = windWords(wind);
  const ww = Math.max(textWidth(words), 56) + 12, wx = W - ww - 6;
  panel(ctx, wx, 6, ww, 34);
  drawText(ctx, 'WIND', wx + 6, 11, GOLD);
  drawText(ctx, `${weather.windMph} MPH`, wx + 6, 18);
  drawText(ctx, words, wx + 6, 31, '#c8c0e8');
  const cx = wx + ww - 14, cy = 18;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  for (let a = 0; a < 32; a++) ctx.fillRect(Math.round(cx + Math.cos(a / 5.1) * 8), Math.round(cy + Math.sin(a / 5.1) * 4), 1, 1);
  if (weather.windMph >= 1) arrow(ctx, cx, cy, windScreen, 8, '#f4f4f4');

}

// A pixel arrow from (x, y) along screen direction `d`, `len` pixels long.
function arrow(ctx, x, y, d, len, color) {
  const n = Math.hypot(d.x, d.y) || 1, ux = d.x / n, uy = d.y / n;
  ctx.fillStyle = color;
  const dot = (px, py) => ctx.fillRect(Math.round(px), Math.round(py), 1, 1);
  for (let t = -len / 2; t <= len / 2; t += 0.5) dot(x + ux * t, y + uy * t);
  const tx = x + ux * len / 2, ty = y + uy * len / 2;
  for (const side of [-1, 1]) {
    for (let t = 0; t <= 3; t += 0.5) dot(tx - ux * t + -uy * side * t * 0.8, ty - uy * t + ux * side * t * 0.8);
  }
}

// ---------- Shot bar ----------

const BAR_H = 46;
export const BAR_TOP = (H) => H - BAR_H - 4;

// Where each shot button sits, for drawing and for clicks.
export const shotButtons = (H, count) => Array.from({ length: count }, (_, i) => ({ x: 12 + i * 46, y: BAR_TOP(H) + 6, w: 42, h: 34 }));

// Little side-on pictures of each shot's flight, like Sim Golf's shot buttons.
const ICONS = {
  straight: (t) => ({ x: t * 28, y: 10 * Math.sin(Math.PI * t) }),
  fade: (t) => ({ x: t * 28, y: 10 * Math.sin(Math.PI * t ** 1.5) }),
  draw: (t) => ({ x: t * 30, y: 8 * Math.sin(Math.PI * t ** 0.65) }),
  lob: (t) => ({ x: 6 + t * 16, y: 13 * Math.sin(Math.PI * t) }),
  runner: (t) => ({ x: t * 30, y: t < 0.6 ? 4 * Math.sin(Math.PI * t / 0.6) : 0 }),
};

// The hit and cancel buttons at the right of the bar.
export const actionButtons = (W, H) => ({
  hit: { x: W - 12 - 64, y: BAR_TOP(H) + 6, w: 64, h: 34 },
  cancel: { x: W - 12 - 64 - 6 - 48, y: BAR_TOP(H) + 6, w: 48, h: 34 },
});

function button(ctx, b, label, sub, on, color) {
  ctx.fillStyle = on ? color : '#2c2050';
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.fillStyle = on ? GOLD : '#5a4a90';
  ctx.fillRect(b.x, b.y, b.w, 1); ctx.fillRect(b.x, b.y + b.h - 1, b.w, 1);
  ctx.fillRect(b.x, b.y, 1, b.h); ctx.fillRect(b.x + b.w - 1, b.y, 1, b.h);
  const scale = textWidth(label, 2) <= b.w - 8 ? 2 : 1;
  drawText(ctx, label, b.x + Math.round((b.w - textWidth(label, scale)) / 2), b.y + 8, on ? '#ffffff' : '#6a5a98', scale, on ? '#1a1a2a' : null);
  drawText(ctx, sub, b.x + Math.round((b.w - textWidth(sub)) / 2), b.y + 25, on ? '#e8e4f8' : '#6a5a98', 1, null);
}

// `info`: { types, selected, club, aim, max, lie, toPin, stroke, hint, canHit }
export function drawShotBar(ctx, W, H, info) {
  const top = BAR_TOP(H);
  panel(ctx, 6, top, W - 12, BAR_H);
  shotButtons(H, info.types.length).forEach((b, i) => {
    const t = info.types[i], on = t.key === info.selected;
    ctx.fillStyle = on ? '#6a56b8' : '#2c2050';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = on ? GOLD : '#5a4a90';
    ctx.fillRect(b.x, b.y, b.w, 1); ctx.fillRect(b.x, b.y + b.h - 1, b.w, 1);
    ctx.fillRect(b.x, b.y, 1, b.h); ctx.fillRect(b.x + b.w - 1, b.y, 1, b.h);
    ctx.fillStyle = on ? '#ffffff' : '#c8c0e8';
    for (let k = 0; k <= 40; k++) {
      const p = ICONS[t.key](k / 40);
      ctx.fillRect(Math.round(b.x + 6 + p.x), Math.round(b.y + 20 - p.y), 1, 1);
    }
    ctx.fillStyle = '#7a9a4a';
    ctx.fillRect(b.x + 4, b.y + 21, b.w - 8, 1);
    drawText(ctx, `${i + 1} ${t.name}`, b.x + Math.round((b.w - textWidth(`${i + 1} ${t.name}`)) / 2), b.y + 25, on ? '#ffffff' : '#c8c0e8', 1, null);
  });

  const x = 12 + info.types.length * 46 + 10;
  drawText(ctx, `CLUB: ${info.club}`, x, top + 8, GOLD);
  drawText(ctx, info.aim ? `AIM: ${info.aim} YDS  (MAX ${info.max})` : `MAX: ${info.max} YDS`, x, top + 17);
  drawText(ctx, `LIE: ${info.lie}`, x, top + 26);
  drawText(ctx, `TO PIN: ${info.toPin} YDS   STROKE ${info.stroke}`, x, top + 35);
  const act = actionButtons(W, H);
  button(ctx, act.cancel, 'CANCEL', 'ESC', info.canHit, '#7a3a4a');
  button(ctx, act.hit, 'HIT', 'SPACE', info.canHit, '#3a8a3a');
  if (info.hint) drawText(ctx, info.hint, act.cancel.x - 10 - textWidth(info.hint), top + 35, '#c8c0e8');
}

// A banner across the middle top, for things like "IN THE WATER".
export function drawBanner(ctx, W, text, sub) {
  const w = Math.max(textWidth(text, 2), sub ? textWidth(sub) : 0) + 20;
  const x = Math.round((W - w) / 2);
  panel(ctx, x, 54, w, sub ? 30 : 20);
  drawText(ctx, text, Math.round((W - textWidth(text, 2)) / 2), 59, GOLD, 2);
  if (sub) drawText(ctx, sub, Math.round((W - textWidth(sub)) / 2), 74);
}
