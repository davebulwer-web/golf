// Step 2: play shots on a generated hole. Pick a shot, drag out where it should
// land, let go to hit it. The URL can pick the course: ?style=tropical&seed=1989&hole=1

import { makeRng, dist, STYLES } from './course-generator.js';
import { buildCourse } from './course.js';
import { layoutHole, drawHole, isOutOfBounds } from './hole-view.js';
import { TH } from './iso.js';
import { drawSprite } from './art.js';
import { drawHud, drawShotBar, drawBanner, shotButtons, BAR_TOP } from './hud.js';
import { roundWeather, holeWind } from './weather.js';
import { SHOT_TYPES, shotType, maxCarry, chooseClub, shotSpread, flightPoint } from './shots.js';
import { PLAYER } from './golfers.js';
import { startHole, current, toPin, hit, settle } from './play.js';

// The game draws at this size and is scaled up to fill the window, keeping pixels square.
const W = 960, H = 540;
const STYLE_KEYS = Object.keys(STYLES);
const TEE = 'white';

const canvas = document.getElementById('game');
canvas.width = W; canvas.height = H;
const ctx = canvas.getContext('2d');
const base = ctx.createImageData(W, H);
const buf = new Uint32Array(base.data.buffer);
const rng = makeRng(Math.floor(Math.random() * 2 ** 31));

const params = new URLSearchParams(location.search);
const settings = {
  style: STYLE_KEYS.includes(params.get('style')) ? params.get('style') : 'tropical',
  seed: Number(params.get('seed')) || 1989,
  hole: Math.min(18, Math.max(1, Number(params.get('hole')) || 1)),
};

// Everything about the hole being played.
let game;
// phase: 'aim' (waiting for a shot), 'flight', 'roll', 'done'
const ui = { shot: 'straight', dragging: false, aim: null, phase: 'aim', anim: null, banner: null };

function loadHole() {
  const course = buildCourse({ name: `Course ${settings.seed}`, style: settings.style, par: 72, length: 'standard', seed: settings.seed });
  const hole = course.holes[settings.hole - 1];
  const weather = roundWeather(course);
  const view = layoutHole(hole, { x: 8, y: 44, w: W - 16, h: BAR_TOP(H) - 50 });
  drawHole(buf, W, H, hole, view);
  game = { course, hole, weather, wind: holeWind(weather, hole), view, play: startHole(hole, [PLAYER], TEE) };
  Object.assign(ui, { dragging: false, aim: null, phase: 'aim', anim: null, banner: null });
  history.replaceState(null, '', `?style=${settings.style}&seed=${settings.seed}&hole=${settings.hole}`);
}

// ---------- Shots ----------

// The aim clamped to what the current shot can reach.
function clampAim(p) {
  const me = current(game.play);
  const max = maxCarry(me.golfer, shotType(ui.shot), me.lie, game.hole);
  const d = dist(me.at, p);
  return d <= max ? p : { x: me.at.x + (p.x - me.at.x) * max / d, y: me.at.y + (p.y - me.at.y) * max / d };
}

function shoot() {
  const shot = hit(game.play, rng, ui.aim, ui.shot, game.weather, game.wind, (p) => isOutOfBounds(game.view, p));
  const rollLen = dist(shot.landing, shot.rest);
  ui.anim = { shot, start: performance.now(), flight: 700 + shot.carry * 4, roll: rollLen > 0.5 ? 250 + rollLen * 25 : 0 };
  ui.phase = 'flight';
  ui.aim = null;
}

// Where the ball is right now, in yards, with its height.
function ballNow(now) {
  const me = current(game.play);
  const a = ui.anim;
  if (!a) return { ...me.at, h: 0 };
  const t = (now - a.start) / a.flight;
  if (t < 1) return flightPoint(a.shot.from, a.shot.landing, shotType(a.shot.type), t);
  const r = a.roll ? Math.min(1, (now - a.start - a.flight) / a.roll) : 1;
  const e = 1 - (1 - r) ** 2; // slows as it rolls out
  return { x: a.shot.landing.x + (a.shot.rest.x - a.shot.landing.x) * e, y: a.shot.landing.y + (a.shot.rest.y - a.shot.landing.y) * e, h: 0 };
}

function update(now) {
  const a = ui.anim;
  if (!a) return;
  if (ui.phase === 'flight' && now - a.start >= a.flight) ui.phase = 'roll';
  if (ui.phase === 'roll' && now - a.start >= a.flight + a.roll) {
    settle(game.play, a.shot);
    const me = current(game.play);
    ui.anim = null;
    if (me.holed) {
      ui.phase = 'done';
      ui.banner = { text: `HOLED IN ${me.strokes}!`, sub: `${scoreName(me.strokes - game.hole.par)}. ENTER TO PLAY AGAIN`, until: Infinity };
    } else if (me.onGreen) {
      ui.phase = 'done';
      ui.banner = { text: `ON THE GREEN IN ${me.strokes}`, sub: 'PUTTING COMES IN STEP 3. ENTER TO PLAY AGAIN', until: Infinity };
    } else {
      ui.phase = 'aim';
      if (a.shot.note) ui.banner = { text: a.shot.note, until: now + 2500 };
    }
  }
}

const scoreName = (d) => ({ '-3': 'ALBATROSS', '-2': 'EAGLE', '-1': 'BIRDIE', 0: 'PAR', 1: 'BOGEY', 2: 'DOUBLE BOGEY' })[d] ?? (d < 0 ? `${-d} UNDER` : `${d} OVER`);

// ---------- Drawing ----------

const LIE_NAMES = { tee: 'TEE', fairway: 'FAIRWAY', fringe: 'FRINGE', green: 'GREEN', rough: 'ROUGH', waste: 'WASTE GROUND', bunker: 'BUNKER', trees: 'TREES' };

function dot(x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
}

// Yards of height to pixels on screen.
const heightPx = (h) => h / game.view.grid.cell * TH * 1.5;

// The planned shot: its flight as a dotted arc, and an oval where it's likely to land.
function drawAim() {
  const me = current(game.play);
  const type = shotType(ui.shot);
  const v = game.view;
  const d = dist(me.at, ui.aim);
  const steps = Math.max(12, Math.round(d / 2));
  for (let k = 1; k < steps; k += 2) {
    const p = flightPoint(me.at, ui.aim, type, k / steps);
    const s = v.worldToScreen(p);
    dot(s.x, s.y, 'rgba(0, 0, 0, 0.25)');
    dot(s.x, s.y - heightPx(p.h), '#ffffff');
  }
  const max = maxCarry(me.golfer, type, me.lie, game.hole);
  const sp = shotSpread(me.golfer, type, me.lie, d, max, game.weather);
  const ux = (ui.aim.x - me.at.x) / (d || 1), uy = (ui.aim.y - me.at.y) / (d || 1);
  // Redder as the shot gets riskier.
  const risk = Math.min(1, (d / max) ** 3 + sp.mishit * 3);
  const col = `rgb(255, ${Math.round(240 - 170 * risk)}, ${Math.round(120 - 100 * risk)})`;
  for (let k = 0; k < 48; k++) {
    const a = k / 48 * Math.PI * 2;
    const along = Math.cos(a) * sp.long * 1.5, across = Math.sin(a) * sp.lat * 1.5;
    const s = v.worldToScreen({ x: ui.aim.x + ux * along + uy * across, y: ui.aim.y + uy * along - ux * across });
    dot(s.x, s.y, col);
  }
  const c = v.worldToScreen(ui.aim);
  for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) dot(c.x + dx, c.y + dy, col);
}

function render(now) {
  ctx.putImageData(base, 0, 0);
  const v = game.view;
  const me = current(game.play);

  if (ui.phase === 'aim' && ui.aim) drawAim();

  // Golfer stands beside the ball, or where the shot was played from while it's in the air.
  const stand = v.worldToScreen(ui.anim ? ui.anim.shot.from : me.at);
  drawSprite(ctx, 'golfer', stand.x - 3, stand.y, { c: me.golfer.shirt });
  if (!me.holed) {
    const b = ballNow(now);
    const s = v.worldToScreen(b);
    const y = Math.round(s.y - heightPx(b.h)), x = Math.round(s.x);
    if (b.h > 0.3) { ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'; ctx.fillRect(x - 1, Math.round(s.y), 2, 1); }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }

  drawHud(ctx, W, H, { course: game.course, hole: game.hole, tee: TEE, weather: game.weather, wind: game.wind, windScreen: v.worldDirToScreen(game.wind.across, game.wind.along) });
  const type = shotType(ui.shot);
  const max = Math.round(maxCarry(me.golfer, type, me.lie, game.hole));
  const aimYds = ui.aim ? Math.round(dist(me.at, ui.aim)) : 0;
  drawShotBar(ctx, W, H, {
    types: SHOT_TYPES, selected: ui.shot, max, aim: aimYds,
    club: chooseClub(me.golfer, type, aimYds || max, me.lie).toUpperCase(),
    lie: LIE_NAMES[me.lie] ?? me.lie.toUpperCase(), toPin: Math.round(toPin(game.play)), stroke: me.strokes + 1,
    hint: ui.phase === 'aim' && !ui.aim ? 'DRAG ON THE COURSE TO AIM, LET GO TO HIT' : '',
  });
  if (ui.banner && now < ui.banner.until) drawBanner(ctx, W, ui.banner.text, ui.banner.sub);
}

function frame(now) {
  update(now);
  render(now);
  requestAnimationFrame(frame);
}

// ---------- Input ----------

const toCanvas = (e) => {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
};

canvas.addEventListener('mousedown', (e) => {
  const p = toCanvas(e);
  if (e.button === 2) { ui.dragging = false; ui.aim = null; return; }
  const button = shotButtons(H, SHOT_TYPES.length).findIndex((b) => p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h);
  if (button >= 0) { ui.shot = SHOT_TYPES[button].key; return; }
  if (ui.phase !== 'aim' || p.y >= BAR_TOP(H)) return;
  ui.dragging = true;
  ui.aim = clampAim(game.view.screenToWorld(p.x, p.y));
});
addEventListener('mousemove', (e) => {
  if (!ui.dragging) return;
  const p = toCanvas(e);
  ui.aim = clampAim(game.view.screenToWorld(p.x, p.y));
});
addEventListener('mouseup', (e) => {
  if (!ui.dragging || e.button !== 0) return;
  ui.dragging = false;
  if (ui.aim && dist(current(game.play).at, ui.aim) >= 5) shoot();
  else ui.aim = null;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k >= '1' && k <= '5') {
    ui.shot = SHOT_TYPES[Number(k) - 1].key;
    if (ui.aim) ui.aim = clampAim(ui.aim);
    return;
  }
  if (k === 'escape') { ui.dragging = false; ui.aim = null; return; }
  if (k === 'n') settings.hole = settings.hole % 18 + 1;
  else if (k === 'p') settings.hole = (settings.hole + 16) % 18 + 1;
  else if (k === 'r') { settings.seed = Math.floor(Math.random() * 1e6); settings.hole = 1; }
  else if (k === 's') settings.style = STYLE_KEYS[(STYLE_KEYS.indexOf(settings.style) + 1) % STYLE_KEYS.length];
  else if (k !== 'enter') return;
  loadHole();
});

// Scale the canvas to the window: whole-number steps when there's room, so pixels stay crisp.
function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  const scale = s >= 1 ? Math.floor(s) : s;
  canvas.style.width = `${W * scale}px`;
  canvas.style.height = `${H * scale}px`;
}
addEventListener('resize', fit);

// Lets the screenshot tool play shots without a mouse.
window.golf = { get game() { return game; }, ui, shoot, clampAim };

fit();
loadHole();
requestAnimationFrame(frame);
