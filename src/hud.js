// On-screen panels: hole details and the wind, drawn over the hole.

import { drawText, textWidth } from './art.js';
import { STYLES, teeYards } from './course-generator.js';
import { windWords } from './weather.js';

const PANEL = 'rgba(40, 28, 70, 0.82)', EDGE = '#9a86d8';
export const GOLD = '#f2c93a';

export function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PANEL;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = EDGE;
  ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
}

// `wind` is from holeWind; `windScreen` is the same wind as a screen direction.
// `standing` is the round so far, e.g. '+2 THRU 3'.
export function drawHud(ctx, W, H, { course, hole, tee, weather, wind, windScreen, standing, keys: keyLine }) {
  // Hole card, top left.
  const title = `HOLE ${hole.number}`;
  const line2 = `PAR ${hole.par}  ${teeYards(hole, tee)} YDS`;
  const line3 = `${course.name}  ${STYLES[course.style].name}`;
  const keys = keyLine ?? 'N/P HOLE  R COURSE  S STYLE  +/- ZOOM  Q/E TURN  M MAP  RIGHT-DRAG SCROLLS';
  const w = Math.max(textWidth(title, 2) + (standing ? textWidth(standing) + 8 : 0), textWidth(line2), textWidth(line3), textWidth(keys)) + 12;
  panel(ctx, 6, 6, w, 42);
  drawText(ctx, title, 12, 11, GOLD, 2);
  if (standing) drawText(ctx, standing, 12 + textWidth(title, 2) + 8, 15, '#ffffff');
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

// Buttons under the wind panel that turn the view round the hole, a quarter turn each way.
export const viewButtons = (W) => ({
  left: { x: W - 62, y: 44, w: 27, h: 22 }, right: { x: W - 33, y: 44, w: 27, h: 22 },
  golfer: { x: W - 62, y: 69, w: 56, h: 13 }, // changes which golfer you play as
  map: { x: W - 62, y: 85, w: 56, h: 13 },    // the whole course, and back
  event: { x: W - 62, y: 101, w: 56, h: 13 }, // tournament stands and tents on or off
});

// In a career the golfer and event buttons are hidden: you are who you are,
// and the event dressing comes with the event.
export function drawViewButtons(ctx, W, onMap = false, event = false, showAll = true) {
  const { left, right, golfer, map, event: eventButton } = viewButtons(W);
  for (const [b, dir, key] of [[left, -1, 'Q'], [right, 1, 'E']]) {
    panel(ctx, b.x, b.y, b.w, b.h);
    // A curved arrow round the top of a circle, pointing the way the view turns.
    const cx = b.x + b.w / 2, cy = b.y + 10;
    ctx.fillStyle = '#f4f4f4';
    for (let a = 0.15; a <= Math.PI - 0.15; a += 0.08) ctx.fillRect(Math.round(cx + Math.cos(a) * 7), Math.round(cy - Math.sin(a) * 5), 1, 1);
    const tipX = Math.round(cx + dir * 7), tipY = cy;
    for (let k = 0; k <= 2; k++) { ctx.fillRect(tipX - k, tipY - k, 1, 1); ctx.fillRect(tipX + k, tipY - k, 1, 1); }
    drawText(ctx, key, b.x + Math.round((b.w - textWidth(key)) / 2), b.y + 14, '#c8c0e8', 1, null);
  }
  if (showAll) {
    panel(ctx, golfer.x, golfer.y, golfer.w, golfer.h);
    const label = 'GOLFER  G';
    drawText(ctx, label, golfer.x + Math.round((golfer.w - textWidth(label)) / 2), golfer.y + 4, '#f4f4f4', 1, null);
  }
  panel(ctx, map.x, map.y, map.w, map.h);
  const mapLabel = onMap ? 'BACK  M' : 'MAP  M';
  drawText(ctx, mapLabel, map.x + Math.round((map.w - textWidth(mapLabel)) / 2), map.y + 4, onMap ? GOLD : '#f4f4f4', 1, null);
  if (!showAll) return;
  panel(ctx, eventButton.x, eventButton.y, eventButton.w, eventButton.h);
  const eventLabel = event ? 'EVENT ON  T' : 'EVENT  T';
  drawText(ctx, eventLabel, eventButton.x + Math.round((eventButton.w - textWidth(eventLabel)) / 2), eventButton.y + 4, event ? GOLD : '#f4f4f4', 1, null);
}

// A hole number on a little plate, centred at (x, y): gold for the hole being played.
export function drawHoleNumber(ctx, x, y, n, current) {
  const s = String(n), w = textWidth(s) + 5;
  x = Math.round(x - w / 2); y = Math.round(y);
  ctx.fillStyle = current ? GOLD : 'rgba(40, 28, 70, 0.88)';
  ctx.fillRect(x, y, w, 9);
  ctx.fillStyle = current ? '#ffffff' : EDGE;
  ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + 8, w, 1); ctx.fillRect(x, y, 1, 9); ctx.fillRect(x + w - 1, y, 1, 9);
  drawText(ctx, s, x + 3, y + 2, current ? '#1a1a2a' : '#ffffff', 1, null);
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
    const t = info.types[i], on = t.key === info.selected, ok = !info.allowed || info.allowed.includes(t.key);
    ctx.globalAlpha = ok ? 1 : 0.35; // shots the lie won't allow are greyed out
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
    ctx.globalAlpha = 1;
  });

  const x = 12 + info.types.length * 46 + 10;
  drawText(ctx, `CLUB: ${info.club}`, x, top + 8, GOLD);
  // Uphill shots play longer, downhill shorter.
  const slope = info.slope ? `  ${info.slope > 0 ? 'UP' : 'DOWN'} ${Math.abs(info.slope)}` : '';
  drawText(ctx, info.aim ? `AIM: ${info.aim} YDS${slope}  (MAX ${info.max})` : `MAX: ${info.max} YDS`, x, top + 17);
  drawText(ctx, `LIE: ${info.lie}`, x, top + 26);
  drawText(ctx, `TO PIN: ${info.toPin} YDS   STROKE ${info.stroke}`, x, top + 35);
  const act = actionButtons(W, H);
  button(ctx, act.cancel, 'CANCEL', 'ESC', info.canHit, '#7a3a4a');
  button(ctx, act.hit, 'HIT', 'SPACE', info.canHit, '#3a8a3a');
  if (info.hint) drawText(ctx, info.hint, act.cancel.x - 10 - textWidth(info.hint), top + 35, '#c8c0e8');
}

// The putting bar: the putt's length and slope, the power bar, and PUTT.
// `info`: { feet, rise, range, power (0 to 1, or null), target (0 to 1), stage, canPutt, canCancel, hint, stroke }
export const powerBar = (W, H) => ({ x: Math.round(W / 2 - 120), y: BAR_TOP(H) + 18, w: 240, h: 12 });

export function drawPuttBar(ctx, W, H, info) {
  const top = BAR_TOP(H);
  panel(ctx, 6, top, W - 12, BAR_H);
  drawText(ctx, `PUTT: ${info.feet} FT`, 14, top + 8, GOLD);
  const lie = info.rise === 0 ? 'LEVEL' : `${info.rise > 0 ? 'UPHILL' : 'DOWNHILL'} ${Math.abs(info.rise)} IN`;
  drawText(ctx, lie, 14, top + 17);
  drawText(ctx, `STROKE ${info.stroke}`, 14, top + 26);
  drawText(ctx, 'ARROWS RUN DOWNHILL', 14, top + 35, '#c8c0e8');

  // The bar: weak to strong, red through green to blue, like the old games.
  const b = powerBar(W, H);
  drawText(ctx, 'POWER', b.x, b.y - 9, GOLD);
  drawText(ctx, `MAX ${info.range} FT`, b.x + b.w - textWidth(`MAX ${info.range} FT`), b.y - 9);
  ctx.fillStyle = '#10101c';
  ctx.fillRect(b.x - 1, b.y - 1, b.w + 2, b.h + 2);
  for (let x = 0; x < b.w; x++) {
    const t = x / (b.w - 1);
    const lit = info.power != null && t <= info.power;
    const [r, g, bl] = t < 0.5 ? [230 - 160 * t * 2, 60 + 150 * t * 2, 50] : [70 - 40 * (t - 0.5) * 2, 210 - 90 * (t - 0.5) * 2, 50 + 190 * (t - 0.5) * 2];
    const k = lit ? 1 : 0.35;
    ctx.fillStyle = `rgb(${Math.round(r * k)}, ${Math.round(g * k)}, ${Math.round(bl * k)})`;
    ctx.fillRect(b.x + x, b.y + 1, 1, b.h - 2);
  }
  // Every 5 feet a notch.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  for (let f = 5; f < info.range; f += 5) ctx.fillRect(b.x + Math.round(f / info.range * (b.w - 1)), b.y + b.h - 4, 1, 3);
  // A red marker over the hole's distance, on the flat.
  const tx = b.x + Math.round(Math.min(1, info.target) * (b.w - 1));
  ctx.fillStyle = '#ff4040';
  for (let k = 0; k < 3; k++) ctx.fillRect(tx - 2 + k, b.y - 4 + k, 5 - 2 * k, 1);
  if (info.power != null) {
    const nx = b.x + Math.round(info.power * (b.w - 1));
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(nx, b.y - 1, 1, b.h + 2);
  }

  const act = actionButtons(W, H);
  button(ctx, act.cancel, 'CANCEL', 'ESC', info.canCancel, '#7a3a4a');
  button(ctx, act.hit, info.stage === 'power' ? 'STOP' : 'PUTT', 'SPACE', info.canPutt, '#3a8a3a');
  if (info.hint) drawText(ctx, info.hint, b.x + Math.round((b.w - textWidth(info.hint)) / 2), b.y + b.h + 4, '#c8c0e8');
}

// A banner across the middle top, for things like "IN THE WATER".
export function drawBanner(ctx, W, text, sub) {
  const w = Math.max(textWidth(text, 2), sub ? textWidth(sub) : 0) + 20;
  const x = Math.round((W - w) / 2);
  panel(ctx, x, 54, w, sub ? 30 : 20);
  drawText(ctx, text, Math.round((W - textWidth(text, 2)) / 2), 59, GOLD, 2);
  if (sub) drawText(ctx, sub, Math.round((W - textWidth(sub)) / 2), 74);
}

// A small note under the banner on how a shot went for your form, green for
// good and red for bad.
export function drawFormNote(ctx, W, text, good, y) {
  const w = textWidth(text) + 12, x = Math.round((W - w) / 2);
  panel(ctx, x, y, w, 13);
  drawText(ctx, text, x + 6, y + 4, good ? '#7ee07e' : '#f08a8a', 1, null);
}

// ---------- Scorecard ----------

const sum = (a) => a.reduce((t, v) => t + (v ?? 0), 0);
export const toParText = (d) => (d === 0 ? 'E' : d > 0 ? `+${d}` : `${d}`);

// Medal play card: each golfer's score on each hole against par, front nine,
// back nine and total. The name column is as wide as the longest name, so a
// long name never runs into the hole-1 scores.
const CARD_NAME_MAX = 14;
const cardName = (s) => (s.length > CARD_NAME_MAX ? `${s.slice(0, CARD_NAME_MAX - 1)}.` : s);
export function drawScorecard(ctx, W, H, round, holeNumber, title) {
  const n = round.players.length;
  const names = round.players.map((p) => cardName(p.name));
  const COL = 14, SUM = 22, ROW = 10, PAD = 8, blockH = (2 + n) * ROW + 6;
  const LABEL = Math.max(textWidth('HOLE'), ...names.map((s) => textWidth(s))) + 8;
  const inner = LABEL + 9 * COL + 4 + 2 * SUM;
  const credit = 'SPRITES: MIKE MOORE, PIXELBITSNBYTES.COM';
  const w = Math.max(inner, textWidth(title) + 8, textWidth(credit)) + 2 * PAD;
  const h = 18 + 2 * blockH + 8 + n * 10 + 22;
  const x0 = Math.round((W - w) / 2), y0 = Math.round((H - h) / 2) - 10;
  const left = x0 + Math.round((w - inner) / 2);
  panel(ctx, x0, y0, w, h);
  drawText(ctx, title, x0 + Math.round((w - textWidth(title)) / 2), y0 + 6, GOLD);

  const block = (from, label, y, total) => {
    const xs = (i) => left + LABEL + i * COL;
    const sx = (k) => xs(9) + 4 + k * SUM;
    const centre = (s, cx, cw) => cx + Math.round((cw - textWidth(s)) / 2);
    // Header band, then a faint stripe on every other golfer's row.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.fillRect(left - 3, y - 2, inner + 6, 9);
    round.players.forEach((p, r) => {
      if (r % 2) return;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.fillRect(left - 3, y + (2 + r) * ROW - 2, inner + 6, 9);
    });
    // Rules between the names and the holes, and before the totals.
    ctx.fillStyle = 'rgba(200, 192, 232, 0.25)';
    ctx.fillRect(xs(0) - 3, y - 2, 1, (2 + n) * ROW - 1);
    ctx.fillRect(sx(0) - 3, y - 2, 1, (2 + n) * ROW - 1);
    drawText(ctx, 'HOLE', left, y, '#c8c0e8', 1, null);
    drawText(ctx, 'PAR', left, y + ROW, '#c8c0e8', 1, null);
    round.players.forEach((p, r) => drawText(ctx, names[r], left, y + (2 + r) * ROW, p.label ?? p.shirt, 1, null));
    for (let i = 0; i < 9; i++) {
      const hn = from + i, cx = xs(i), mid = (s) => centre(s, cx, COL - 1);
      if (hn + 1 === holeNumber) { ctx.fillStyle = 'rgba(242, 201, 58, 0.25)'; ctx.fillRect(cx, y - 2, COL - 1, (2 + n) * ROW - 1); }
      drawText(ctx, `${hn + 1}`, mid(`${hn + 1}`), y, '#ffffff', 1, null);
      drawText(ctx, `${round.pars[hn]}`, mid(`${round.pars[hn]}`), y + ROW, '#c8c0e8', 1, null);
      round.players.forEach((p, r) => {
        const sc = p.scores[hn];
        if (sc == null) return;
        const d = sc - round.pars[hn];
        drawText(ctx, `${sc}`, mid(`${sc}`), y + (2 + r) * ROW, d < 0 ? GOLD : d > 0 ? '#f08a8a' : '#ffffff', 1, null);
      });
    }
    // Totals: OUT on the front nine; IN and TOT on the back nine.
    const sums = [[label, from, 9]];
    if (total) sums.push(['TOT', 0, 18]);
    sums.forEach(([lab, start, len], k) => {
      const cx = sx(k), put = (s, yy, col) => drawText(ctx, s, centre(s, cx, SUM - 4), yy, col, 1, null);
      put(lab, y, '#ffffff');
      put(`${sum(round.pars.slice(start, start + len))}`, y + ROW, '#c8c0e8');
      round.players.forEach((p, r) => {
        const part = p.scores.slice(start, start + len);
        if (part.some((sc) => sc != null)) put(`${sum(part)}`, y + (2 + r) * ROW, '#ffffff');
      });
    });
  };
  block(0, 'OUT', y0 + 18, false);
  block(9, 'IN', y0 + 18 + blockH, true);

  let ty = y0 + 18 + 2 * blockH + 2;
  ctx.fillStyle = 'rgba(200, 192, 232, 0.25)';
  ctx.fillRect(left - 3, ty - 3, inner + 6, 1);
  ty += 2;
  round.players.forEach((p) => {
    const played = p.scores.map((sc, i) => (sc == null ? null : sc - round.pars[i])).filter((d) => d != null);
    const line = played.length ? `${p.name}: ${sum(p.scores)}  (${toParText(sum(played))} THRU ${played.length})` : `${p.name}: NO HOLES YET`;
    drawText(ctx, line, x0 + Math.round((w - textWidth(line)) / 2), ty, GOLD);
    ty += 10;
  });
  const y1 = ty;
  const help = 'TAB: SHOW OR HIDE CARD';
  drawText(ctx, help, x0 + Math.round((w - textWidth(help)) / 2), y1 + 2, '#8a80b0', 1, null);
  drawText(ctx, credit, x0 + Math.round((w - textWidth(credit)) / 2), y1 + 10, '#6a6090', 1, null);
}
