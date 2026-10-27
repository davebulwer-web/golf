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
  const w = Math.max(textWidth(title, 2), textWidth(line2), textWidth(line3)) + 12;
  panel(ctx, 6, 6, w, 34);
  drawText(ctx, title, 12, 11, GOLD, 2);
  drawText(ctx, line2, 12, 24);
  drawText(ctx, line3, 12, 31, '#c8c0e8');

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

  // Controls, bottom.
  const help = 'N/P: HOLE   R: NEW COURSE   S: STYLE';
  drawText(ctx, help, Math.round((W - textWidth(help)) / 2), H - 10, '#e8e4f8');
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
