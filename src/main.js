// Play a round on a generated course. Pick a shot, drag out where it should
// land, then hit it; putting on the green plays itself. The URL can pick the course: ?style=tropical&seed=1989&hole=1

import { makeRng, dist, STYLES } from './course-generator.js';
import { buildCourse } from './course.js';
import { layoutHole, shiftView, drawHole, isOutOfBounds } from './hole-view.js';
import { TH } from './iso.js';
import { drawSprite } from './art.js';
import { drawHud, drawShotBar, drawBanner, drawScorecard, shotButtons, actionButtons, BAR_TOP } from './hud.js';
import { roundWeather, holeWind } from './weather.js';
import { SHOT_TYPES, shotType, maxCarry, chooseClub, shotSpread, flightPoint } from './shots.js';
import { PLAYER } from './golfers.js';
import { startHole, current, toPin, hit, settle, nextPutt, settlePutt, newRound } from './play.js';
import { feet } from './putting.js';

const STYLE_KEYS = Object.keys(STYLES);
const TEE = 'white';
// Spare picture round the whole-hole view, so there's somewhere to pan when zoomed in.
const MARGIN = 200;
const MAX_ZOOM = 2;

// Two canvases fill the window: the hole, scaled up by `fitScale + zoom`, and the
// panels on top, always at `fitScale`. Both keep their pixels square and crisp.
const canvas = document.getElementById('game');
const hudCanvas = document.getElementById('hud');
const ctx = canvas.getContext('2d');
const hud = hudCanvas.getContext('2d');
const rng = makeRng(Math.floor(Math.random() * 2 ** 31));

const params = new URLSearchParams(location.search);
const settings = {
  style: STYLE_KEYS.includes(params.get('style')) ? params.get('style') : 'tropical',
  seed: Number(params.get('seed')) || 1989,
  hole: Math.min(18, Math.max(1, Number(params.get('hole')) || 1)),
};

// fitScale: screen pixels per game pixel when the whole hole is shown. W x H: the
// game's size in pixels at that scale (the panels are laid out on this).
// zoom is the player's choice; onGreen zooms right in while putting.
const display = { fitScale: 1, W: 0, H: 0, zoom: 0, onGreen: false };
const cam = { x: MARGIN, y: MARGIN, manual: false };
let game, world, round;
// phase: 'aim' (waiting for a shot), 'flight', 'roll', 'done'
// phase also 'putting' while the putts play out on the green.
const ui = { shot: 'straight', dragging: false, aim: null, phase: 'aim', anim: null, banner: null, card: false, nextPuttAt: 0 };

const zoomNow = () => (display.onGreen ? MAX_ZOOM : display.zoom);
const scale = () => display.fitScale + zoomNow();

function sizeCanvas(c, k) {
  c.width = Math.ceil(innerWidth / k);
  c.height = Math.ceil(innerHeight / k);
  c.style.width = `${c.width * k}px`;
  c.style.height = `${c.height * k}px`;
}

// Fit the game to the window: the biggest whole-number scale that leaves at least 800 x 450 game pixels.
function measure() {
  display.fitScale = Math.max(1, Math.floor(Math.min(innerWidth / 800, innerHeight / 450)));
  sizeCanvas(hudCanvas, display.fitScale);
  sizeCanvas(canvas, scale());
  display.W = hudCanvas.width;
  display.H = hudCanvas.height;
}

// Draw the hole once into a picture big enough for the whole-hole view plus a margin.
function buildWorld() {
  const { W, H } = display;
  const fit = layoutHole(game.hole, { x: 8, y: 54, w: W - 16, h: BAR_TOP(H) - 60 });
  const view = shiftView(fit, MARGIN, MARGIN);
  const w = W + 2 * MARGIN, h = H + 2 * MARGIN;
  const img = new ImageData(w, h);
  drawHole(new Uint32Array(img.data.buffer), w, h, game.hole, view);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').putImageData(img, 0, 0);
  world = { canvas: c, view, w, h };
  aimCamera(true);
}

function loadHole() {
  const course = buildCourse({ name: `Course ${settings.seed}`, style: settings.style, par: 72, length: 'standard', seed: settings.seed });
  const hole = course.holes[settings.hole - 1];
  const weather = roundWeather(course);
  game = { course, hole, weather, wind: holeWind(weather, hole), play: startHole(hole, [PLAYER], TEE) };
  // Scores carry on from hole to hole on the same course.
  const key = `${settings.style}:${settings.seed}`;
  if (round?.key !== key) round = newRound(course, key);
  Object.assign(ui, { dragging: false, aim: null, phase: 'aim', anim: null, banner: null, card: false });
  greenZoom(false);
  cam.manual = false;
  buildWorld();
  history.replaceState(null, '', `?style=${settings.style}&seed=${settings.seed}&hole=${settings.hole}`);
}

// ---------- Camera ----------

// Whole hole: fixed. Zoomed in: follow the ball (unless the player has panned).
function aimCamera(snap) {
  if (zoomNow() === 0) { cam.x = MARGIN; cam.y = MARGIN; cam.manual = false; return; }
  if (cam.manual) return;
  // While aiming, keep both the ball and the aim in view.
  const ball = ballNow(performance.now());
  const focus = ui.aim && ui.phase === 'aim' ? { x: (ball.x + ui.aim.x) / 2, y: (ball.y + ui.aim.y) / 2 } : ball;
  const b = world.view.worldToScreen(focus);
  const tx = b.x - canvas.width / 2, ty = b.y - canvas.height / 2;
  cam.x = snap ? tx : cam.x + (tx - cam.x) * 0.12;
  cam.y = snap ? ty : cam.y + (ty - cam.y) * 0.12;
  clampCamera();
}

function clampCamera() {
  cam.x = Math.max(0, Math.min(world.w - canvas.width, cam.x));
  cam.y = Math.max(0, Math.min(world.h - canvas.height, cam.y));
}

function setZoom(z) {
  z = Math.max(0, Math.min(MAX_ZOOM, z));
  if (z === display.zoom) return;
  display.zoom = z;
  rescale();
}

function greenZoom(on) {
  if (on === display.onGreen) return;
  display.onGreen = on;
  if (world) rescale();
}

function rescale() {
  sizeCanvas(canvas, scale());
  cam.manual = false;
  aimCamera(true);
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
  if (ui.phase !== 'aim' || !ui.aim) return;
  const shot = hit(game.play, rng, ui.aim, ui.shot, game.weather, game.wind, (p) => isOutOfBounds(world.view, p));
  const rollLen = dist(shot.landing, shot.rest);
  ui.anim = { shot, start: performance.now(), flight: 700 + shot.carry * 4, roll: rollLen > 0.5 ? 250 + rollLen * 25 : 0 };
  ui.phase = 'flight';
  ui.aim = null;
  ui.dragging = false;
  cam.manual = false;
}

function cancelAim() {
  ui.dragging = false;
  ui.aim = null;
}

function pickShot(key) {
  ui.shot = key;
  if (ui.aim) ui.aim = clampAim(ui.aim);
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
  if (ui.phase === 'putting') return updatePutting(now);
  const a = ui.anim;
  if (!a) return;
  if (ui.phase === 'flight' && now - a.start >= a.flight) ui.phase = 'roll';
  if (ui.phase === 'roll' && now - a.start >= a.flight + a.roll) {
    settle(game.play, a.shot);
    const me = current(game.play);
    ui.anim = null;
    if (me.holed) {
      holeFinished();
    } else if (me.onGreen) {
      ui.phase = 'putting';
      ui.nextPuttAt = now + 900;
      ui.banner = { text: `ON THE GREEN IN ${me.strokes}`, until: now + 900 };
      greenZoom(true);
    } else {
      ui.phase = 'aim';
      if (a.shot.note) ui.banner = { text: a.shot.note, until: now + 2500 };
    }
  }
}

// Putts play out one at a time, with a pause between them.
function updatePutting(now) {
  const a = ui.anim;
  if (!a) {
    if (now < ui.nextPuttAt) return;
    const me = current(game.play);
    const p = nextPutt(game.play, rng);
    ui.anim = { putt: p, shot: { from: me.at, landing: me.at, rest: p.rest }, start: now, flight: 0, roll: Math.min(2500, 500 + p.feet * 30) };
    ui.banner = { text: `PUTT FROM ${p.feet} FT`, until: Infinity };
    return;
  }
  if (now - a.start < a.roll) return;
  settlePutt(game.play, a.putt);
  ui.anim = null;
  const me = current(game.play);
  if (me.holed) return holeFinished();
  ui.banner = { text: `MISSED. ${feet(dist(me.at, game.hole.pin))} FT LEFT`, until: now + 900 };
  ui.nextPuttAt = now + 900;
}

// The round so far against par, e.g. '+2 THRU 3'.
function standing() {
  const done = round.scores.map((sc, i) => (sc == null ? null : sc - round.pars[i])).filter((d) => d != null);
  if (!done.length) return '';
  const d = done.reduce((t, v) => t + v, 0);
  return `${d === 0 ? 'E' : d > 0 ? `+${d}` : d} THRU ${done.length}`;
}

// Record the score and show the card.
function holeFinished() {
  const me = current(game.play);
  round.scores[game.hole.number - 1] = me.strokes;
  round.putts[game.hole.number - 1] = me.putts;
  ui.phase = 'done';
  ui.card = true;
  const last = game.hole.number === 18;
  const putts = me.putts === 0 ? 'NO PUTTS' : me.putts === 1 ? '1 PUTT' : `${me.putts} PUTTS`;
  const name = me.strokes === 1 ? 'HOLE IN ONE' : scoreName(me.strokes - game.hole.par);
  ui.banner = { text: `${name}! ${me.strokes} SHOTS, ${putts}`, sub: last ? 'ROUND OVER. ENTER FOR A NEW ROUND' : 'ENTER FOR THE NEXT HOLE', until: Infinity };
}

const scoreName = (d) => ({ '-3': 'ALBATROSS', '-2': 'EAGLE', '-1': 'BIRDIE', 0: 'PAR', 1: 'BOGEY', 2: 'DOUBLE BOGEY' })[d] ?? (d < 0 ? `${-d} UNDER` : `${d} OVER`);

// ---------- Drawing ----------

const LIE_NAMES = { tee: 'TEE', fairway: 'FAIRWAY', fringe: 'FRINGE', green: 'GREEN', rough: 'ROUGH', waste: 'WASTE GROUND', bunker: 'BUNKER', trees: 'TREES' };

function dot(x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
}

// Yards of height to pixels on display.
const heightPx = (h) => h / world.view.grid.cell * TH * 1.5;

// The planned shot: its flight as a dotted arc, and an oval where it's likely to land.
function drawAim() {
  const me = current(game.play);
  const type = shotType(ui.shot);
  const v = world.view;
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
  const v = world.view;
  const me = current(game.play);
  ctx.setTransform(1, 0, 0, 1, -Math.round(cam.x), -Math.round(cam.y));
  ctx.drawImage(world.canvas, 0, 0);

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
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const { W, H } = display;
  hud.clearRect(0, 0, W, H);
  drawHud(hud, W, H, { course: game.course, hole: game.hole, tee: TEE, weather: game.weather, wind: game.wind, windScreen: v.worldDirToScreen(game.wind.across, game.wind.along), standing: standing() });
  const type = shotType(ui.shot);
  const max = Math.round(maxCarry(me.golfer, type, me.lie, game.hole));
  const aimYds = ui.aim ? Math.round(dist(me.at, ui.aim)) : 0;
  const canHit = ui.phase === 'aim' && !!ui.aim && !ui.dragging;
  drawShotBar(hud, W, H, {
    types: SHOT_TYPES, selected: ui.shot, max, aim: aimYds, canHit,
    club: chooseClub(me.golfer, type, aimYds || max, me.lie).toUpperCase(),
    lie: LIE_NAMES[me.lie] ?? me.lie.toUpperCase(), toPin: Math.round(toPin(game.play)), stroke: me.holed ? me.strokes : me.strokes + 1,
    hint: ui.phase === 'putting' ? 'PUTTING...' : ui.phase !== 'aim' ? '' : !ui.aim ? 'DRAG ON THE COURSE TO AIM' : ui.dragging ? 'LET GO TO SET THE AIM' : 'CHANGE SHOT OR DRAG AGAIN',
  });
  if (ui.banner && now < ui.banner.until) drawBanner(hud, W, ui.banner.text, ui.banner.sub);
  if (ui.card) {
    const played = round.scores.filter((s) => s != null).length;
    drawScorecard(hud, W, H, round, game.hole.number, played === 18 ? 'ROUND COMPLETE' : `${game.course.name.toUpperCase()}  SCORECARD`);
  }
}

function frame(now) {
  update(now);
  aimCamera(false);
  render(now);
  requestAnimationFrame(frame);
}

// ---------- Input ----------

// Mouse position in panel pixels, and on the hole in yards.
const toHud = (e) => ({ x: e.clientX / display.fitScale, y: e.clientY / display.fitScale });
const toYards = (e) => world.view.screenToWorld(e.clientX / scale() + Math.round(cam.x), e.clientY / scale() + Math.round(cam.y));
const inside = (p, b) => p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h;

canvas.addEventListener('mousedown', (e) => {
  if (e.button === 2) { cancelAim(); return; }
  if (e.button !== 0) return;
  const p = toHud(e);
  if (p.y >= BAR_TOP(display.H)) {
    const b = shotButtons(display.H, SHOT_TYPES.length).findIndex((r) => inside(p, r));
    if (b >= 0) pickShot(SHOT_TYPES[b].key);
    const act = actionButtons(display.W, display.H);
    if (inside(p, act.hit)) shoot();
    if (inside(p, act.cancel)) cancelAim();
    return;
  }
  if (ui.phase !== 'aim') return;
  ui.dragging = true;
  ui.aim = clampAim(toYards(e));
});
addEventListener('mousemove', (e) => {
  if (ui.dragging) ui.aim = clampAim(toYards(e));
});
addEventListener('mouseup', (e) => {
  if (!ui.dragging || e.button !== 0) return;
  ui.dragging = false;
  // Letting go sets the aim; it's hit with the HIT button or space.
  if (ui.aim && dist(current(game.play).at, ui.aim) < 5) ui.aim = null;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(display.zoom + (e.deltaY < 0 ? 1 : -1)); }, { passive: false });

const PAN = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };

addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k >= '1' && k <= '5') return pickShot(SHOT_TYPES[Number(k) - 1].key);
  if (k === ' ') { e.preventDefault(); return shoot(); }
  if (k === 'escape') return cancelAim();
  if (k === '+' || k === '=') return setZoom(display.zoom + 1);
  if (k === '-' || k === '_') return setZoom(display.zoom - 1);
  if (PAN[k] && display.zoom > 0) {
    e.preventDefault();
    cam.manual = true;
    cam.x += PAN[k][0] * 24; cam.y += PAN[k][1] * 24;
    return clampCamera();
  }
  if (k === 'c') { cam.manual = false; return; }
  if (k === 'tab') { e.preventDefault(); ui.card = !ui.card; return; }
  if (k === 'enter' && ui.phase === 'done') {
    // On to the next hole, or a fresh round after the 18th.
    if (game.hole.number === 18) { settings.hole = 1; round = null; } else settings.hole += 1;
    return loadHole();
  }
  if (k === 'n') settings.hole = settings.hole % 18 + 1;
  else if (k === 'p') settings.hole = (settings.hole + 16) % 18 + 1;
  else if (k === 'r') { settings.seed = Math.floor(Math.random() * 1e6); settings.hole = 1; }
  else if (k === 's') settings.style = STYLE_KEYS[(STYLE_KEYS.indexOf(settings.style) + 1) % STYLE_KEYS.length];
  else if (k !== 'enter') return;
  loadHole();
});

// Redraw the hole for the new window size once resizing settles.
let resizing;
addEventListener('resize', () => {
  clearTimeout(resizing);
  resizing = setTimeout(() => { measure(); buildWorld(); }, 150);
});

// Lets the test tools play shots without a mouse.
window.golf = { get game() { return game; }, get world() { return world; }, get round() { return round; }, ui, cam, display, shoot, clampAim, setZoom };

measure();
loadHole();
requestAnimationFrame(frame);
