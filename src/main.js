// Play a round on a generated course against a computer golfer. Pick a shot,
// drag out where it should land, then hit it; putting on the green plays itself.
// The URL can pick the course: ?style=tropical&seed=1989&hole=1

import { makeRng, dist, STYLES } from './course-generator.js';
import { buildCourse } from './course.js';
import { layoutHole, shiftView, addSurroundings, drawHole, isOutOfBounds } from './hole-view.js';
import { TH } from './iso.js';
import { drawSprite } from './art.js';
import { drawHud, drawShotBar, drawBanner, drawScorecard, shotButtons, actionButtons, BAR_TOP } from './hud.js';
import { roundWeather, holeWind } from './weather.js';
import { SHOT_TYPES, shotType, maxCarry, chooseClub, shotSpread, flightPoint } from './shots.js';
import { PLAYER, RIVAL } from './golfers.js';
import { startHole, current, toPin, hit, settle, nextPutt, settlePutt, newRound, standing, nextTurn, allHoled, pickUp, PICK_UP } from './play.js';
import { planShot } from './ai.js';
import { feet } from './putting.js';
import { drawDinky, dinkySize, golferFrame, ballFrame, flagFrame, LIE_BANNERS, scoreBanner } from './dinky.js';

const STYLE_KEYS = Object.keys(STYLES);
const TEE = 'white';
const GOLFERS = [PLAYER, RIVAL];
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
// phase: 'aim' (waiting for a shot), 'flight', 'roll', 'putting' (putts playing
// out on the green), 'done'. aiAt/aiPlanned pace the computer golfer's turn.
const ui = {
  shot: 'straight', humanShot: 'straight', dragging: false, aim: null, phase: 'aim', anim: null, banner: null,
  card: false, nextPuttAt: 0, aiAt: 0, aiPlanned: false,
  pop: null,  // a picture banner, e.g. BIRDIE: { names, start, until }
  moods: [],  // golfers celebrating or sulking after holing out: { kind, until } by player
};

const SWING = 450; // ms for the swing before the ball leaves

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
  // Scale up as far as the window allows while keeping at least 640 x 360 game pixels.
  display.fitScale = Math.max(1, Math.floor(Math.min(innerWidth / 640, innerHeight / 360)));
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
  addSurroundings(view, game.course, game.hole.number - 1, w, h);
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
  game = { course, hole, weather, wind: holeWind(weather, hole), play: startHole(hole, GOLFERS, TEE) };
  // Scores carry on from hole to hole on the same course.
  const key = `${settings.style}:${settings.seed}`;
  if (round?.key !== key) round = newRound(course, key, GOLFERS);
  Object.assign(ui, { dragging: false, aim: null, phase: 'aim', anim: null, banner: null, card: false, cardAt: 0, pop: null, moods: [] });
  greenZoom(false);
  cam.manual = false;
  buildWorld();
  startTurn(performance.now());
  // Keep the address shareable where the page is allowed to change it.
  try { history.replaceState(null, '', `?style=${settings.style}&seed=${settings.seed}&hole=${settings.hole}`); } catch { /* sandboxed */ }
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

const humanTurn = () => !current(game.play).golfer.ai;

function shoot() {
  if (ui.phase !== 'aim' || !ui.aim) return;
  const shot = hit(game.play, rng, ui.aim, ui.shot, game.weather, game.wind, (p) => isOutOfBounds(world.view, p));
  const rollLen = dist(shot.landing, shot.rest);
  const swingAt = performance.now();
  ui.anim = { shot, swingAt, start: swingAt + SWING, flight: 700 + shot.carry * 4, roll: rollLen > 0.5 ? 250 + rollLen * 25 : 0 };
  ui.phase = 'flight';
  ui.aim = null;
  ui.dragging = false;
  cam.manual = false;
}

function cancelAim() {
  if (!humanTurn()) return;
  ui.dragging = false;
  ui.aim = null;
}

function pickShot(key) {
  if (!humanTurn()) return;
  ui.shot = ui.humanShot = key;
  if (ui.aim) ui.aim = clampAim(ui.aim);
}

// Where the ball is right now, in yards, with its height.
function ballNow(now) {
  const me = current(game.play);
  const a = ui.anim;
  if (!a) return { ...me.at, h: 0 };
  const t = (now - a.start) / a.flight;
  if (t < 0) return { ...a.shot.from, h: 0 }; // still swinging
  if (t < 1) return flightPoint(a.shot.from, a.shot.landing, shotType(a.shot.type), t);
  const r = a.roll ? Math.min(1, (now - a.start - a.flight) / a.roll) : 1;
  const e = 1 - (1 - r) ** 2; // slows as it rolls out
  return { x: a.shot.landing.x + (a.shot.rest.x - a.shot.landing.x) * e, y: a.shot.landing.y + (a.shot.rest.y - a.shot.landing.y) * e, h: 0 };
}

function update(now) {
  if (ui.phase === 'putting') return updatePutting(now);
  if (ui.phase === 'aim' && !humanTurn()) return updateComputer(now);
  const a = ui.anim;
  if (!a) return;
  if (ui.phase === 'flight' && now - a.start >= a.flight) ui.phase = 'roll';
  if (ui.phase === 'roll' && now - a.start >= a.flight + a.roll) {
    settle(game.play, a.shot);
    ui.anim = null;
    const me = current(game.play);
    let note = a.shot.note;
    const pic = note?.startsWith('OUT OF BOUNDS') ? 'txt-ob' : !me.holed && !note?.startsWith('IN THE WATER') && LIE_BANNERS[me.lie];
    if (pic) {
      showPop([pic], now);
      if (note === 'ON THE GREEN') note = null; // the picture says it
    }
    afterStroke(now, note);
  }
}

// The computer golfer thinks, shows where it's aiming, then hits.
function updateComputer(now) {
  if (now < ui.aiAt) return;
  if (!ui.aiPlanned) {
    const me = current(game.play);
    const plan = planShot(me.golfer, { at: me.at, lie: me.lie }, game.hole, game.weather, game.wind, (p) => isOutOfBounds(world.view, p), rng.int(0, 2 ** 30));
    ui.shot = plan.type;
    ui.aim = plan.aim;
    ui.aiPlanned = true;
    ui.aiAt = now + 1200;
    return;
  }
  ui.aiPlanned = false;
  shoot();
}

const who = (golfer) => golfer.name.toUpperCase();
const showPop = (names, now) => { ui.pop = { names, start: now, until: now + 1900 }; };
const yourTurn = (golfer) => (golfer.ai ? `${who(golfer)} TO PLAY` : 'YOUR SHOT');

// After any stroke: note a holed ball, then hand over to whoever is furthest away.
function afterStroke(now, note) {
  const me = current(game.play);
  if (!me.holed && me.strokes >= PICK_UP) {
    pickUp(game.play);
    note = `${who(me.golfer)} PICKS UP`;
  }
  if (me.holed) {
    round.players[game.play.turn].scores[game.hole.number - 1] = me.strokes;
    round.players[game.play.turn].putts[game.hole.number - 1] = me.putts;
    const name = me.strokes === 1 ? 'HOLE IN ONE' : scoreName(me.strokes - game.hole.par);
    if (me.strokes < PICK_UP) note = `${who(me.golfer)}: ${name}! ${me.strokes} SHOTS`;
    const pics = scoreBanner(me.strokes, game.hole.par);
    if (pics.length) showPop(pics, now);
    ui.moods[game.play.turn] = { kind: me.strokes <= game.hole.par ? 'joy' : 'cry', until: now + 2800 };
  }
  if (allHoled(game.play)) return holeFinished();
  startTurn(now, note);
}

function startTurn(now, note) {
  game.play.turn = nextTurn(game.play);
  const me = current(game.play);
  Object.assign(ui, { anim: null, aim: null, dragging: false, aiPlanned: false });
  const turn = me.onGreen ? (me.golfer.ai ? `${who(me.golfer)} TO PUTT` : 'YOUR PUTT') : yourTurn(me.golfer);
  ui.banner = note ? { text: note, sub: turn, until: now + 2200 } : { text: turn, until: now + 1200 };
  if (me.onGreen) {
    ui.phase = 'putting';
    ui.nextPuttAt = now + (note ? 2000 : 1100);
    greenZoom(true);
  } else {
    ui.phase = 'aim';
    greenZoom(false);
    if (me.golfer.ai) ui.aiAt = now + (note ? 2000 : 1000);
    else ui.shot = ui.humanShot;
  }
  cam.manual = false;
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
  afterStroke(now, me.holed ? null : `MISSED. ${feet(dist(me.at, game.hole.pin))} FT LEFT`);
}

// Everyone's round so far against par, e.g. 'YOU +2  BERTIE E'.
function standings() {
  return round.players.map((p, i) => {
    const st = standing(round, i);
    return st.holes ? `${p.name.toUpperCase()} ${st.toPar === 0 ? 'E' : st.toPar > 0 ? `+${st.toPar}` : st.toPar}` : '';
  }).filter(Boolean).join('  ');
}

// Everyone's holed out: show the hole's result and the card.
function holeFinished() {
  ui.phase = 'done';
  ui.cardAt = ui.pop ? ui.pop.until : 1; // let the last BIRDIE (or BOGEY) show before the card covers it
  ui.anim = null;
  const last = game.hole.number === 18;
  const result = game.play.players.map((p) => `${who(p.golfer)} ${p.strokes}`).join(', ');
  ui.banner = { text: result, sub: last ? 'ROUND OVER. ENTER FOR A NEW ROUND' : 'ENTER FOR THE NEXT HOLE', until: Infinity };
}

const scoreName = (d) => ({ '-3': 'ALBATROSS', '-2': 'EAGLE', '-1': 'BIRDIE', 0: 'PAR', 1: 'BOGEY', 2: 'DOUBLE BOGEY' })[d] ?? (d < 0 ? `${-d} UNDER` : `${d} OVER`);

// ---------- Drawing ----------

// A picture banner (BIRDIE, IN THE ROUGH...) that drops in under the text banner.
function drawPop(g, W, H, now) {
  const drop = Math.max(0, 1 - (now - ui.pop.start) / 220);
  let y = Math.round(H * 0.28 - 14 * drop * drop);
  for (const name of ui.pop.names) {
    const size = dinkySize(name);
    if (!size) return;
    drawDinky(g, name, Math.round(W / 2 - size.w / 2), y, null, true);
    y += size.h + 2;
  }
}

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

  // Each golfer stands beside their ball (or where they played from while it's
  // moving); whoever isn't playing steps to the other side so they don't overlap.
  // Someone who's just holed out stays by the hole for a moment to celebrate or sulk.
  // Flags and golfers are drawn back to front.
  const items = [];
  const pins = [game.hole.pin, ...v.others.map((o) => o.toHere(o.hole.pin))];
  for (const pin of pins) {
    const at = v.worldToScreen(pin);
    items.push({ y: at.y, draw: () => drawDinky(ctx, flagFrame(now), at.x, at.y) || drawSprite(ctx, 'flag', at.x, at.y) });
  }
  game.play.players.forEach((p, i) => {
    const playing = i === game.play.turn;
    const mood = ui.moods[i] && now < ui.moods[i].until ? ui.moods[i] : null;
    if (p.holed && !mood) return;
    const a = playing ? ui.anim : null;
    const from = a ? a.shot.from : p.at;
    const stand = v.worldToScreen(from);
    const ball = playing ? ballNow(now) : { ...p.at, h: 0 };
    const pose = mood ? mood.kind : a?.swingAt ? 'swing' : 'stand';
    const frame = golferFrame(pose, a?.swingAt ? (now - a.swingAt) / SWING : 0, now);
    const x = stand.x + (mood ? 9 : playing ? -5 : 6); // after holing, stand clear of the flag
    items.push({ y: stand.y, draw: () => drawDinky(ctx, frame, x, stand.y + 1, p.golfer.shirt) || drawSprite(ctx, 'golfer', x, stand.y, { c: p.golfer.shirt }) });
    if (p.holed) return;
    const s = v.worldToScreen(ball);
    items.push({ y: s.y + 0.5, draw: () => {
      const y = Math.round(s.y - heightPx(ball.h)), bx = Math.round(s.x);
      if (ball.h > 0.3) { ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'; ctx.fillRect(bx - 1, Math.round(s.y), 2, 1); }
      if (ball.h > 4 && drawDinky(ctx, ballFrame(ball.h), bx, y + 1)) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bx - 1, y - 1, 2, 2);
    } });
  });
  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const { W, H } = display;
  hud.clearRect(0, 0, W, H);
  drawHud(hud, W, H, { course: game.course, hole: game.hole, tee: TEE, weather: game.weather, wind: game.wind, windScreen: v.worldDirToScreen(game.wind.across, game.wind.along), standing: standings() });
  const type = shotType(ui.shot);
  const max = Math.round(maxCarry(me.golfer, type, me.lie, game.hole));
  const aimYds = ui.aim ? Math.round(dist(me.at, ui.aim)) : 0;
  const canHit = ui.phase === 'aim' && !!ui.aim && !ui.dragging && humanTurn();
  drawShotBar(hud, W, H, {
    types: SHOT_TYPES, selected: ui.shot, max, aim: aimYds, canHit,
    club: chooseClub(me.golfer, type, aimYds || max, me.lie).toUpperCase(),
    lie: LIE_NAMES[me.lie] ?? me.lie.toUpperCase(), toPin: Math.round(toPin(game.play)), stroke: me.holed ? me.strokes : me.strokes + 1,
    hint: !humanTurn() && ui.phase !== 'done' ? `${who(me.golfer)} IS PLAYING` : ui.phase === 'putting' ? 'PUTTING...' : ui.phase !== 'aim' ? '' : !ui.aim ? 'DRAG ON THE COURSE TO AIM' : ui.dragging ? 'LET GO TO SET THE AIM' : 'CHANGE SHOT OR DRAG AGAIN',
  });
  if (ui.banner && now < ui.banner.until) drawBanner(hud, W, ui.banner.text, ui.banner.sub);
  if (ui.pop && now < ui.pop.until) drawPop(hud, W, H, now);
  if (ui.cardAt && now >= ui.cardAt) { ui.card = true; ui.cardAt = 0; }
  if (ui.card) {
    const played = round.players[0].scores.filter((s) => s != null).length;
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
    if (inside(p, act.hit) && humanTurn()) shoot();
    if (inside(p, act.cancel)) cancelAim();
    return;
  }
  if (ui.phase !== 'aim' || !humanTurn()) return;
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
  if (k === ' ') { e.preventDefault(); return humanTurn() && shoot(); }
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
  if (k === 'tab') { e.preventDefault(); ui.card = !ui.card; ui.cardAt = 0; return; }
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
