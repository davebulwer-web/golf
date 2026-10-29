// Play a round on a generated course against a computer golfer. Pick a shot,
// drag out where it should land, then hit it. On the green, putting is a little
// game of its own, seen from above: aim, then stop the power bar.
// It opens on a title screen: carry on a career, start a new one, or free play.
// The URL can pick a course for free play: ?style=tropical&seed=1989&hole=1

import { makeRng, dist, surfaceAt, pointAt, STYLES } from './course-generator.js';
import { buildCourse } from './course.js';
import { layoutHole, shiftView, addSurroundings, drawHole, isOutOfBounds, courseHoles, courseView, piecePad, tournamentSites, sceneryItems } from './hole-view.js';
import { drawSprite, blit } from './art.js';
import { drawHud, drawShotBar, drawPuttBar, drawBanner, drawFormNote, drawScorecard, shotButtons, actionButtons, viewButtons, drawViewButtons, drawHoleNumber, BAR_TOP } from './hud.js';
import { roundWeather, holeWind } from './weather.js';
import { SHOT_TYPES, shotType, maxCarry, chooseClub, shotSpread, flightPoint, clampToReach, playsAs, lieAt, lieReach, canPlay } from './shots.js';
import { PLAYER, RIVAL } from './golfers.js';
import { startHole, current, toPin, hit, settle, settlePutt, newRound, standing, matchPlay, matchWords, nextTurn, allHoled, pickUp, PICK_UP } from './play.js';
import { planShot } from './ai.js';
import { feet, puttRange, puttRise, readPutt, strike } from './putting.js';
import { makeGreenView, drawGreenView } from './green-view.js';
import { drawDinky, dinkySize, golferFrame, ballFrame, flagFrame, GOLFER_LOOKS, LIE_BANNERS, WATER_BANNER, OB_BANNER, scoreBanner } from './dinky.js';
import { LOOKS, SHIRT_COLOURS, SKILL_NAMES, newCareer, clubCourses, careerGolfer, clubOpponent, memberGolfer, MEMBERS, STAKES, finishRound, canPractise, recordPractice, buyKit, saveCareer, loadCareer } from './career.js';
import { BALLS, DRILLS, drill, drillHole, drillSpot, drillResult, drillGain } from './practice.js';
import { newForm, judgeShot, judgePutt, tally, applyForm } from './form.js';
import { titleLayout, drawTitle, newCareerLayout, drawNewCareer, hubLayout, drawHub, coursesLayout, drawCourses, membersLayout, drawMembers, drillsLayout, drawDrills, shopLayout, drawShop, drawLeaderboard, resultsLayout, drawResults, resultsShown, drawMenuNote, recordLayout, drawRecord, meritLayout, drawMerit, drawSeason, ordinal } from './menus.js';
import { eventFor, newEvent, skippedEvent, leaderboard, prizeFor, fieldGolfer, addMerit, meritTable, endWeek, simRound, finishEventRound, finalBoard, DRESSING, eventTier, eventStory, recordEvent, challengeFor, challengeMet } from './events.js';
import { SLOTS, shopItem } from './shop.js';

const STYLE_KEYS = Object.keys(STYLES);
const TEE = 'white';
// Who's playing: you and Bertie in free play; in a career, your golfer and a club member.
let golfers = [PLAYER, RIVAL];
// Where the whole-hole view sits in the picture of the course.
const MARGIN = 200;
// The course is drawn in square pieces this many pixels across, as they come into view.
const PIECE = 384;
const COURSE_EDGE = 60; // pixels of woods shown past the outermost holes
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
  // A tournament round: grandstands, TV towers and tents round the course.
  event: params.get('event') === '1',
  // The course's name, par and tees, and how many holes make the round.
  name: null, par: 72, length: 'standard', holes: 18,
  tour: null, // a career tier's course: club and county ones have no signature doglegs
  career: false, // playing a round of the career
  match: null,   // a money match: { member, stake }
  practice: null, // a practice session: { key, ball, hits }
};

// Which screen is up: 'title', 'new' (starting a career), 'hub' (the
// clubhouse between rounds), 'courses' (picking where to play) or 'play'. A
// course in the address goes straight to play.
const app = {
  mode: ['style', 'seed', 'hole'].some((k) => params.has(k)) ? 'play' : 'title',
  hover: null, career: loadCareer(), draft: null,
  pick: null, // the money match being set up: { member, stake }
};

// fitScale: screen pixels per game pixel when the whole hole is shown. W x H: the
// game's size in pixels at that scale (the panels are laid out on this).
// zoom is the player's choice; onGreen zooms right in while putting. turn is
// how many quarter turns the view has been turned round the hole. map shows
// the whole course instead.
const display = { fitScale: 1, W: 0, H: 0, zoom: 0, onGreen: false, turn: 0, map: false };
const cam = { x: MARGIN, y: MARGIN, manual: false };
let game, world, round;
// phase: 'aim' (waiting for a shot), 'flight', 'roll', 'putting' (on the green,
// seen from above: see `putt`), 'done'. aiAt/aiPlanned pace the computer golfer's turn.
const ui = {
  shot: 'straight', humanShot: 'straight', dragging: false, aim: null, phase: 'aim', anim: null, banner: null,
  card: false, aiAt: 0, aiPlanned: false,
  // The putt being played: { view, stage, aim, range, power, ... }. stage is
  // 'wait', 'aim', 'power' (the bar is swinging) or 'roll'.
  putt: null,
  pop: null,  // a picture banner, e.g. BIRDIE: { names, start, until }
  moods: [],  // golfers celebrating or sulking after holing out: { kind, at, until } by player
};

const SWING = 750; // ms for the swing before the ball leaves
const POWER_SWEEP = 1100; // ms for the power bar to fill

const zoomNow = () => (display.onGreen ? MAX_ZOOM : display.zoom);
const scale = () => display.fitScale + (display.map ? 0 : zoomNow());

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

// Lay the hole out for the whole-hole view. The picture of the course round it
// is drawn a piece at a time as it comes into view (see `piece`), out to the
// edge of the course.
function buildWorld() {
  const { W, H } = display;
  const index = game.hole.number - 1;
  const fit = layoutHole(game.hole, { x: 8, y: 54, w: W - 16, h: BAR_TOP(H) - 60 }, display.turn);
  const view = shiftView(fit, MARGIN, MARGIN);
  // For play: the ground and what's out of bounds round this hole.
  addSurroundings(view, game.course, index, W + 2 * MARGIN, H + 2 * MARGIN);
  const { all, corners } = courseHoles(game.course, index);
  const pts = corners.map((p) => view.worldToScreen(p, 0));
  const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
  const bounds = {
    x0: Math.min(MARGIN, Math.min(...xs) - COURSE_EDGE), x1: Math.max(MARGIN + W, Math.max(...xs) + COURSE_EDGE),
    y0: Math.min(MARGIN, Math.min(...ys) - COURSE_EDGE - 30), y1: Math.max(MARGIN + H, Math.max(...ys) + COURSE_EDGE),
  };
  world = { view, bounds, holes: all, pieces: new Map(), map: null, fresh: true };
  aimCamera(true);
}

// One piece of the picture of the course, drawn the first time it's needed.
function piece(i, j) {
  const key = `${i},${j}`;
  let c = world.pieces.get(key);
  if (c) return c;
  const v = shiftView(world.view, -i * PIECE, -j * PIECE);
  addSurroundings(v, game.course, game.hole.number - 1, PIECE, PIECE, 1e6, piecePad(v.grid.cell));
  const img = new ImageData(PIECE, PIECE);
  drawHole(new Uint32Array(img.data.buffer), PIECE, PIECE, game.hole, v, [], { x: i * PIECE, y: j * PIECE });
  c = document.createElement('canvas');
  c.width = PIECE; c.height = PIECE;
  c.getContext('2d').putImageData(img, 0, 0);
  world.pieces.set(key, c);
  return c;
}

// The trees and furniture standing in front of a golfer whose feet are at
// (x, y) on the course picture and who stands `h` pixels tall: what has to be
// drawn again over them, so they're hidden behind it as the view turns.
// Worked out once per spot.
const FRONT_BOX = 48;
function sceneryInFront(x, y, h) {
  const key = `${Math.round(x)},${Math.round(y)}`;
  world.front ??= new Map();
  if (world.front.has(key)) return world.front.get(key);
  const ox = Math.round(x) - FRONT_BOX / 2, oy = Math.round(y) - h;
  const v = shiftView(world.view, -ox, -oy);
  addSurroundings(v, game.course, game.hole.number - 1, FRONT_BOX, h, 1e6, piecePad(v.grid.cell));
  const left = x - 12, right = x + 12, top = y - h;
  const front = sceneryItems(FRONT_BOX, h, v, game.hole)
    .map((it) => ({ ...it, x: it.x + ox, y: it.y + oy }))
    .filter((it) => it.y > y && it.x - it.sprite.ax < right && it.x - it.sprite.ax + it.sprite.w > left && it.y - it.sprite.ay < y);
  if (world.front.size > 200) world.front.clear();
  world.front.set(key, front);
  return front;
}

// A scenery sprite as a canvas, made the first time it's drawn this way.
const spriteCanvases = new WeakMap();
function spriteCanvas(sprite) {
  let c = spriteCanvases.get(sprite);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = sprite.w; c.height = sprite.h;
  const img = new ImageData(sprite.w, sprite.h);
  blit(new Uint32Array(img.data.buffer), sprite.w, sprite.h, sprite, sprite.ax, sprite.ay);
  c.getContext('2d').putImageData(img, 0, 0);
  spriteCanvases.set(sprite, c);
  return c;
}

// Draw the pieces of the course in view. Missing ones are drawn a couple a
// frame while scrolling, so it never stalls for long; all at once for a new view.
function drawCourse() {
  let budget = world.fresh ? Infinity : 2;
  world.fresh = false;
  const x0 = Math.floor(cam.x / PIECE), x1 = Math.floor((cam.x + canvas.width) / PIECE);
  const y0 = Math.floor(cam.y / PIECE), y1 = Math.floor((cam.y + canvas.height) / PIECE);
  for (let j = y0; j <= y1; j++) {
    for (let i = x0; i <= x1; i++) {
      if (!world.pieces.has(`${i},${j}`)) {
        if (budget <= 0) { ctx.fillStyle = '#1e4a22'; ctx.fillRect(i * PIECE, j * PIECE, PIECE, PIECE); continue; }
        budget--;
      }
      ctx.drawImage(piece(i, j), i * PIECE, j * PIECE);
    }
  }
}

// The whole course on one screen, drawn the first time it's asked for.
function courseMapPicture() {
  if (world.map) return world.map;
  const { W, H } = display;
  const view = courseView(game.course, game.hole.number - 1, { x: 8, y: 54, w: W - 16, h: BAR_TOP(H) - 60 }, W, H, display.turn);
  const img = new ImageData(W, H);
  drawHole(new Uint32Array(img.data.buffer), W, H, game.hole, view);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  c.getContext('2d').putImageData(img, 0, 0);
  world.map = { canvas: c, view };
  return world.map;
}

function showMap(on) {
  if (on === display.map || (on && ui.phase === 'putting')) return;
  display.map = on;
  rescale();
}

function loadHole() {
  const course = buildCourse({ name: settings.name ?? `Course ${settings.seed}`, style: settings.style, par: settings.par, length: settings.length, seed: settings.seed, tour: settings.tour });
  const hole = course.holes[settings.hole - 1];
  const weather = roundWeather(course);
  course.tournament = settings.event;
  game = { course, hole, weather, wind: holeWind(weather, hole), play: startHole(hole, golfers, TEE) };
  // Scores carry on from hole to hole on the same course.
  const key = `${settings.style}:${settings.seed}:${settings.par}:${settings.length}:${settings.tour}:${settings.career}`;
  if (round?.key !== key) round = newRound(course, key, golfers);
  Object.assign(ui, { dragging: false, aim: null, phase: 'aim', anim: null, banner: null, card: false, cardAt: 0, pop: null, moods: [], putt: null, formNote: null });
  greenZoom(false);
  cam.manual = false;
  buildWorld();
  startTurn(performance.now());
  // Keep a free play address shareable where the page is allowed to change it.
  if (app.mode === 'play' && !settings.career) shareAddress();
}

function shareAddress() {
  try { history.replaceState(null, '', `?style=${settings.style}&seed=${settings.seed}&hole=${settings.hole}${settings.event ? '&event=1' : ''}`); } catch { /* sandboxed */ }
}

// ---------- Camera ----------

// Whole hole: fixed. Zoomed in: follow the ball. Either way the player can
// scroll off round the course, until the next shot.
function aimCamera(snap) {
  if (display.map) return;
  if (cam.manual) return clampCamera();
  if (zoomNow() === 0) { cam.x = MARGIN; cam.y = MARGIN; return; }
  // While aiming, keep both the ball and the aim in view.
  const ball = ballNow(performance.now());
  const focus = ui.aim && ui.phase === 'aim' ? { x: (ball.x + ui.aim.x) / 2, y: (ball.y + ui.aim.y) / 2 } : ball;
  const b = world.view.worldToScreen(focus);
  const tx = b.x - canvas.width / 2, ty = b.y - canvas.height / 2;
  cam.x = snap ? tx : cam.x + (tx - cam.x) * 0.12;
  cam.y = snap ? ty : cam.y + (ty - cam.y) * 0.12;
  clampCamera();
}

// Keep the view on the course: a course smaller than the screen stays centred.
function clampCamera() {
  const b = world.bounds;
  const keep = (v, lo, hi, size) => (hi - lo <= size ? (lo + hi - size) / 2 : Math.max(lo, Math.min(hi - size, v)));
  cam.x = keep(cam.x, b.x0, b.x1, canvas.width);
  cam.y = keep(cam.y, b.y0, b.y1, canvas.height);
}

// Zooming out past the whole hole shows the whole course; zooming in comes back.
function setZoom(z) {
  if (display.map) { if (z > display.zoom) showMap(false); return; }
  if (z < 0) { showMap(true); return; }
  z = Math.min(MAX_ZOOM, z);
  if (z === display.zoom) return;
  display.zoom = z;
  rescale();
}

// Dress the course for a tournament, or take it all down again.
function toggleEvent() {
  if (settings.career) return;
  settings.event = !settings.event;
  game.course.tournament = settings.event;
  buildWorld();
  shareAddress();
}

// Full screen and back. A page shown inside another (as a shared link is) may
// not be allowed to: then say to use the browser's own full screen key.
function toggleFullscreen() {
  const d = document;
  const failed = () => { ui.banner = { text: 'FULL SCREEN ISN\'T ALLOWED HERE', sub: 'PRESS F11 FOR THE BROWSER\'S OWN FULL SCREEN', until: performance.now() + 3000 }; app.note = { text: 'FULL SCREEN ISN\'T ALLOWED HERE. PRESS F11 INSTEAD.', until: performance.now() + 3000 }; };
  try {
    if (d.fullscreenElement) d.exitFullscreen();
    else if (!d.fullscreenEnabled || !d.documentElement.requestFullscreen) failed();
    else d.documentElement.requestFullscreen().catch(failed);
  } catch { failed(); }
}

// Play as the next golfer look (until there's a proper character picker).
function changeGolfer() {
  if (settings.career) return;
  PLAYER.look = GOLFER_LOOKS[(GOLFER_LOOKS.indexOf(PLAYER.look) + 1) % GOLFER_LOOKS.length];
}

// Turn the view a quarter turn round the hole: -1 one way, +1 the other.
function turnView(dir) {
  display.turn = (display.turn + dir + 4) % 4;
  cam.manual = false;
  buildWorld();
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
  return clampToReach(me.golfer, shotType(ui.shot), myLie(me), game.hole, me.at, p);
}

const humanTurn = () => !current(game.play).golfer.ai;

function shoot() {
  if (ui.phase !== 'aim' || !ui.aim) return;
  const shot = hit(game.play, rng, ui.aim, ui.shot, game.weather, game.wind, (p) => isOutOfBounds(world.view, p));
  const rollLen = pathLength(shot.path);
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

// The lie of the golfer whose turn it is, worked out once per spot.
function myLie(me) {
  if (ui.lie?.x !== me.at.x || ui.lie.y !== me.at.y || ui.lie.surface !== me.lie || ui.lie.hole !== game.hole) ui.lie = { x: me.at.x, y: me.at.y, hole: game.hole, surface: me.lie, lie: lieAt(game.hole, me.at, me.lie) };
  return ui.lie.lie;
}

function pickShot(key) {
  if (!humanTurn() || !canPlay(myLie(current(game.play)), key)) return;
  ui.shot = ui.humanShot = key;
  if (ui.aim) ui.aim = clampAim(ui.aim);
}

const pathLength = (path) => path.slice(1).reduce((t, p, i) => t + dist(p, path[i]), 0);

// The point a share `e` of the way along a path of points.
function alongPath(path, e) {
  let left = e * pathLength(path);
  for (let i = 1; i < path.length; i++) {
    const d = dist(path[i - 1], path[i]);
    if (left <= d && d > 0) return { x: path[i - 1].x + (path[i].x - path[i - 1].x) * left / d, y: path[i - 1].y + (path[i].y - path[i - 1].y) * left / d };
    left -= d;
  }
  return { ...path[path.length - 1] };
}

// Where the ball is in the air between two points: `z` is its height in yards
// (above the sea, like the ground) and `h` how high it is off the ground.
function inFlight(from, to, type, t) {
  const p = flightPoint(from, to, type, t);
  const ground = world.view.ground;
  const z = ground(from) + (ground(to) - ground(from)) * t + p.h;
  return { x: p.x, y: p.y, z, h: Math.max(0, z - ground(p)) };
}
const onGround = (p) => ({ x: p.x, y: p.y, z: world.view.ground(p), h: 0 });

// Where the ball is right now, in yards, with its height.
function ballNow(now) {
  const me = current(game.play);
  const a = ui.anim;
  if (!a) return onGround(me.at);
  const t = (now - a.start) / a.flight;
  if (t < 0) return onGround(a.shot.from); // still swinging
  if (t < 1) return inFlight(a.shot.from, a.shot.landing, shotType(a.shot.type), t);
  const r = a.roll ? Math.min(1, (now - a.start - a.flight) / a.roll) : 1;
  const e = 1 - (1 - r) ** 2; // slows as it rolls out
  return onGround(a.shot.path ? alongPath(a.shot.path, e) : a.shot.rest);
}

function update(now) {
  if (ui.phase === 'drill') { if (now >= ui.nextBall) practiceBall(now); return; }
  if (ui.phase === 'putting') return updatePutting(now);
  if (ui.phase === 'aim' && !humanTurn()) return updateComputer(now);
  const a = ui.anim;
  if (!a) return;
  if (ui.phase === 'flight' && now - a.start >= a.flight) ui.phase = 'roll';
  if (ui.phase === 'roll' && now - a.start >= a.flight + a.roll) {
    const me = current(game.play), lie = me.lie;
    settle(game.play, a.shot);
    ui.anim = null;
    if (settings.practice) return practiceDone(a.shot.from, a.shot.rest, a.shot.holed, now);
    if (form && !me.golfer.ai) noteForm(judgeShot(a.shot, lie, game.hole, me.golfer), now);
    let note = a.shot.note;
    const pic = note?.startsWith('OUT OF BOUNDS') ? OB_BANNER : note?.startsWith('IN THE WATER') ? WATER_BANNER : !me.holed && LIE_BANNERS[me.lie];
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

// Your form this career round (null outside one): good and bad shots by skill.
let form = null;

// Count a judged shot and say so for a moment, e.g. 'GREAT ESCAPE: RECOVERY +'.
function noteForm(v, now) {
  if (!v) return;
  tally(form, v);
  ui.formNote = { text: `${v.words}: ${SKILL_NAMES[v.skill]} ${v.good ? '+' : '-'}`, good: v.good, until: now + 2400 };
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
    ui.moods[game.play.turn] = { kind: me.strokes <= game.hole.par ? 'joy' : 'cry', at: now, until: now + 2800 };
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
    showMap(false);
    ui.phase = 'putting';
    ui.putt = newPutt(me, me.golfer.ai ? now + (note ? 2000 : 1100) : now);
    greenZoom(true);
  } else {
    ui.phase = 'aim';
    greenZoom(false);
    if (me.golfer.ai) ui.aiAt = now + (note ? 2000 : 1000);
    else {
      // The shot you last chose, if this lie allows it.
      const lie = myLie(me);
      ui.shot = canPlay(lie, ui.humanShot) ? ui.humanShot : lie.shots[0];
    }
  }
  cam.manual = false;
}

// ---------- Putting ----------

// The green from above, laid out between the panels, for a putt from `at`.
const greenFor = (at) => makeGreenView(game.hole, at, { x: 0, y: 50, w: display.W, h: BAR_TOP(display.H) - 54 }, display.W, display.H);

function newPutt(me, until) {
  const range = puttRange(dist(me.at, game.hole.pin));
  return { view: greenFor(me.at), stage: 'wait', until, aim: { ...game.hole.pin }, range, power: null, meterAt: 0, roll: null, rollAt: 0, plan: null };
}

// The power bar runs up and back down again until it's stopped.
const meter = (ms) => { const t = (ms / POWER_SWEEP) % 2; return t <= 1 ? t : 2 - t; };

function startPower(now) {
  const pt = ui.putt;
  if (pt?.stage !== 'aim') return;
  Object.assign(pt, { stage: 'power', meterAt: now, power: 0 });
  ui.dragging = false;
}

function stopPower(now) {
  const pt = ui.putt;
  if (pt?.stage !== 'power') return;
  const me = current(game.play);
  pt.power = meter(now - pt.meterAt);
  pt.roll = strike(rng, me.golfer, game.hole, me.at, pt.aim, pt.power, pt.range);
  Object.assign(pt, { stage: 'roll', rollAt: now });
  ui.banner = null;
}

function cancelPower() {
  const pt = ui.putt;
  if (pt?.stage !== 'power' || !humanTurn()) return;
  Object.assign(pt, { stage: 'aim', power: null });
}

function aimPutt(p) {
  const pt = ui.putt;
  const at = pt.view.toWorld(p.x, p.y);
  if (dist(at, current(game.play).at) > 0.2) pt.aim = at;
}

// Where the ball is on its roll: { at, done } (done once it's stopped or dropped).
function puttBall(now) {
  const pt = ui.putt, path = pt.roll.path;
  const k = Math.max(0, Math.floor((now - pt.rollAt) * 60 / 1000));
  return { at: path[Math.min(path.length - 1, k)], done: k >= path.length - 1 };
}

function updatePutting(now) {
  const pt = ui.putt;
  const me = current(game.play);
  if (pt.stage === 'wait') {
    if (now < pt.until) return;
    pt.stage = 'aim';
    if (me.golfer.ai) {
      // The computer reads the putt, then slides its aim across to its line.
      pt.plan = readPutt(rng, me.golfer, game.hole, me.at);
      Object.assign(pt, { aimFrom: { ...pt.aim }, aimAt: now, until: now + 1000 });
    }
    return;
  }
  if (pt.stage === 'aim' && me.golfer.ai) {
    const t = Math.min(1, (now - pt.aimAt) / 700), e = 1 - (1 - t) ** 2;
    pt.aim = { x: pt.aimFrom.x + (pt.plan.aim.x - pt.aimFrom.x) * e, y: pt.aimFrom.y + (pt.plan.aim.y - pt.aimFrom.y) * e };
    if (now >= pt.until) startPower(now);
    return;
  }
  if (pt.stage === 'power') {
    pt.power = meter(now - pt.meterAt);
    // The computer stops the bar on its way up, where it meant to.
    if (me.golfer.ai && now - pt.meterAt >= pt.plan.power * POWER_SWEEP) {
      pt.meterAt = now - pt.plan.power * POWER_SWEEP;
      stopPower(now);
    }
    return;
  }
  if (pt.stage !== 'roll' || !puttBall(now).done) return;
  // A moment to watch it drop, or to see where it finished.
  if (now - pt.rollAt < pt.roll.path.length * 1000 / 60 + 600) return;
  const roll = pt.roll, from = me.at, nth = me.putts + 1;
  settlePutt(game.play, roll);
  if (settings.practice) { ui.putt = null; return practiceDone(from, roll.rest, roll.holed, now); }
  if (form && !me.golfer.ai) noteForm(judgePutt(dist(from, game.hole.pin), me.holed, nth), now);
  ui.putt = null;
  if (me.holed) return afterStroke(now, null);
  const left = `${feet(dist(me.at, game.hole.pin))} FT LEFT`;
  let note = roll.path.lipped ? `LIPPED OUT! ${left}` : `MISSED. ${left}`;
  if (surfaceAt(game.hole, roll.rest) === 'water') note = 'IN THE WATER. ONE SHOT PENALTY';
  else if (!me.onGreen) {
    note = 'OFF THE GREEN';
    if (LIE_BANNERS[me.lie]) showPop([LIE_BANNERS[me.lie]], now);
  }
  afterStroke(now, note);
}

// Everyone's round so far against par, e.g. 'YOU +2  BERTIE E'.
function standings() {
  if (settings.practice) { const pr = settings.practice; return `BALL ${Math.min(pr.ball + 1, BALLS)} OF ${BALLS}, ${pr.hits} GOOD`; }
  if (settings.match) return matchWords(matchPlay(round, settings.holes), round.players.map((p) => p.name.toUpperCase()));
  if (settings.comp) {
    const rows = compBoard(), me = rows?.find((x) => x.you);
    if (!me) return '';
    const top = rows[0], tp = (d) => (d === 0 ? 'E' : d > 0 ? `+${d}` : `${d}`);
    return me.pos === 1 ? `LEADING THE ${settings.comp.name} AT ${tp(me.toPar)}` : `${me.pos} OF ${rows.length} AT ${tp(me.toPar)}. ${top.name.toUpperCase()} LEADS AT ${tp(top.toPar)}`;
  }
  const ch = settings.challenge ? `CHALLENGE: ${settings.challenge.text}  ` : '';
  return ch + round.players.map((p, i) => {
    const st = standing(round, i);
    return st.holes ? `${p.name.toUpperCase()} ${st.toPar === 0 ? 'E' : st.toPar > 0 ? `+${st.toPar}` : st.toPar}` : '';
  }).filter(Boolean).join('  ');
}

// An event's leaderboard as far as you've played (null before the first hole's done).
function compBoard() {
  const thru = round.players[0].scores.filter((v) => v != null).length;
  if (!thru) return null;
  const [you, partner] = round.players;
  return leaderboard(settings.comp, round.pars, thru, { name: you.name, scores: you.scores }, { name: partner.name, scores: partner.scores });
}

// The scorecard's title in an event: where you stand.
function compTitle() {
  const me = compBoard()?.find((x) => x.you);
  return me ? `${settings.comp.name}: ${ordinal(me.pos)} OF ${compBoard().length}` : settings.comp.name;
}

// The last hole of the round, or a match already decided.
const roundOver = () => game.hole.number === settings.holes || (!!settings.match && matchPlay(round, settings.holes).over);

// Everyone's holed out: show the hole's result and the card.
function holeFinished() {
  ui.phase = 'done';
  ui.cardAt = ui.pop ? ui.pop.until : 1; // let the last BIRDIE (or BOGEY) show before the card covers it
  ui.anim = null;
  const last = roundOver();
  const result = game.play.players.map((p) => `${who(p.golfer)} ${p.strokes}`).join(', ');
  const over = settings.career ? `${settings.match ? 'MATCH' : 'ROUND'} OVER. ENTER TO GO TO THE CLUBHOUSE` : 'ROUND OVER. ENTER FOR A NEW ROUND';
  const sub = last ? over : 'ENTER FOR THE NEXT HOLE';
  ui.banner = { text: result, sub: settings.match ? `${standings()}. ${sub}` : sub, until: Infinity };
  // A career round is saved hole by hole, so it can be picked up again later.
  if (settings.career) {
    saveRound(last ? settings.holes + 1 : game.hole.number + 1);
  }
}

// Keep the career round in progress, `hole` being the next to play.
function saveRound(hole) {
  app.career.round = { course: playing, match: settings.match, comp: settings.comp, challenge: settings.challenge, form, vs: golfers[1].name, hole, scores: round.players.map((p) => p.scores.slice()), putts: round.players.map((p) => p.putts.slice()) };
  saveCareer(app.career);
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

// The planned shot: its flight as a dotted arc, and an oval where it's likely to land.
function drawAim() {
  const me = current(game.play);
  const type = shotType(ui.shot);
  const v = world.view;
  const d = dist(me.at, ui.aim);
  const steps = Math.max(12, Math.round(d / 2));
  for (let k = 1; k < steps; k += 2) {
    const p = inFlight(me.at, ui.aim, type, k / steps);
    const s = v.worldToScreen(p), up = v.worldToScreen(p, p.z);
    dot(s.x, s.y, 'rgba(0, 0, 0, 0.25)');
    dot(up.x, up.y, '#ffffff');
  }
  const max = maxCarry(me.golfer, type, myLie(me), game.hole);
  const sp = shotSpread(me.golfer, type, myLie(me), d, max, game.weather);
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

// The course round the hole being played, with the golfers, balls and flags.
function drawPlay(now) {
  const v = world.view;
  ctx.setTransform(1, 0, 0, 1, -Math.round(cam.x), -Math.round(cam.y));
  drawCourse();

  if (ui.phase === 'aim' && ui.aim) drawAim();

  // Each golfer stands beside their ball (or where they played from while it's
  // moving); whoever isn't playing steps to the other side so they don't overlap.
  // Someone who's just holed out stays by the hole for a moment to celebrate or sulk.
  // Flags and golfers are drawn back to front.
  const items = [];
  // The other holes' flags have no bright ring round the hole: that marks the
  // one being played.
  const pins = world.holes.map((o) => o.toHere(o.hole.pin));
  pins.forEach((pin, i) => {
    const at = v.worldToScreen(pin);
    items.push({ y: at.y, draw: () => drawSprite(ctx, flagFrame(now, i > 0), at.x, at.y) });
  });
  game.play.players.forEach((p, i) => {
    const playing = i === game.play.turn;
    const mood = ui.moods[i] && now < ui.moods[i].until ? ui.moods[i] : null;
    if (p.holed && !mood) return;
    const a = playing ? ui.anim : null;
    const from = a ? a.shot.from : p.at;
    const stand = v.worldToScreen(from);
    const ball = playing ? ballNow(now) : onGround(p.at);
    const onGreen = ui.phase === 'putting';
    const pose = mood ? mood.kind : a?.swingAt ? 'swing' : playing ? (onGreen ? 'putt' : 'address') : 'stand';
    const t = a?.swingAt ? (now - a.swingAt) / SWING : 0;
    const frame = golferFrame(pose, t, mood ? now - mood.at : now + i * 900);
    // The golfer stands side on to where the ball's going, with the ball just
    // in front of them; the sprite faces right, so mirror it to face left.
    const target = a ? a.shot.landing : (playing && ui.aim) || game.hole.pin;
    // After holing, they stand clear of the flag, on the side away from anyone still
    // playing. Whoever's waiting stands back behind their ball.
    const side = (q) => (v.worldToScreen(q).x < stand.x ? -1 : 1);
    const still = game.play.players.find((o) => !o.holed);
    const dir = mood ? (still ? -side(still.at) : 1) : side(target);
    const x = stand.x + (mood ? 10 : playing ? (onGreen ? -2 : -5) : -18) * dir;
    items.push({ y: stand.y, draw: () => {
      drawDinky(ctx, `${p.golfer.look ?? 'club'}/${frame}`, x, stand.y, p.golfer.shirt, false, dir < 0) || drawSprite(ctx, 'golfer', x, stand.y, { c: p.golfer.shirt });
      // Trees and furniture in front of them hide them.
      for (const it of sceneryInFront(x, stand.y, 34)) ctx.drawImage(spriteCanvas(it.sprite), it.x - it.sprite.ax, it.y - it.sprite.ay);
    } });
    if (p.holed) return;
    const s = v.worldToScreen(ball), up = v.worldToScreen(ball, ball.z);
    items.push({ y: s.y + 0.5, draw: () => {
      const y = Math.round(up.y), bx = Math.round(s.x);
      if (ball.h > 0.3) { ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'; ctx.fillRect(bx - 1, Math.round(s.y), 2, 1); }
      if (ball.h > 4) return drawSprite(ctx, ballFrame(ball.h), bx, y + 1);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bx - 1, y - 1, 2, 2);
    } });
  });
  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();
  drawHoleNumbers(v, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// Every hole's number, over its flag and by its back tee.
function drawHoleNumbers(v, flagHeight) {
  for (const [i, o] of world.holes.entries()) {
    const pin = v.worldToScreen(o.toHere(o.hole.pin));
    const tee = v.worldToScreen(o.toHere(pointAt(o.hole.line, o.hole.tees.black)));
    drawHoleNumber(ctx, pin.x + 1, pin.y - 32 + flagHeight, o.number, i === 0);
    drawHoleNumber(ctx, tee.x, tee.y + 4, o.number, i === 0);
  }
}

// The whole course on one screen: every hole's flag and number, and where the balls are.
function drawMap(now) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const { canvas: pic, view: v } = courseMapPicture();
  ctx.drawImage(pic, 0, 0);
  for (const [i, o] of world.holes.entries()) {
    const at = v.worldToScreen(o.toHere(o.hole.pin));
    drawSprite(ctx, flagFrame(now, i > 0), at.x, at.y);
  }
  game.play.players.forEach((p) => {
    if (p.holed) return;
    const s = v.worldToScreen(p.at);
    ctx.fillStyle = '#1a1a2a';
    ctx.fillRect(Math.round(s.x) - 2, Math.round(s.y) - 2, 4, 4);
    ctx.fillStyle = p.golfer.shirt;
    ctx.fillRect(Math.round(s.x) - 1, Math.round(s.y) - 1, 2, 2);
  });
  drawHoleNumbers(v, 0);
}

function render(now) {
  const me = current(game.play);
  if (display.map) drawMap(now);
  else drawPlay(now);

  const { W, H } = display;
  hud.clearRect(0, 0, W, H);
  const pt = ui.phase === 'putting' ? ui.putt : null;
  if (pt) {
    // Putting: the green from above covers the course.
    const rolling = pt.roll ? puttBall(now) : null;
    const others = game.play.players.filter((p, i) => i !== game.play.turn && !p.holed && p.onGreen).map((p) => p.at);
    drawGreenView(hud, pt.view, now, {
      ball: rolling ? rolling.at : me.at, aim: pt.stage === 'aim' || pt.stage === 'power' ? pt.aim : null,
      others, dropped: rolling?.done && pt.roll.holed,
    });
  }
  drawHud(hud, W, H, {
    course: game.course, hole: game.hole, tee: TEE, weather: game.weather, wind: game.wind, windScreen: world.view.worldDirToScreen(game.wind.across, game.wind.along), standing: standings(),
    keys: settings.career ? '+/- ZOOM  Q/E TURN  M MAP  RIGHT-DRAG SCROLLS  H CLUBHOUSE  F FULL SCREEN' : 'N/P HOLE  R COURSE  S STYLE  +/- ZOOM  Q/E TURN  M MAP  RIGHT-DRAG SCROLLS  H MENU',
  });
  if (pt) {
    const d = dist(me.at, game.hole.pin);
    const human = humanTurn();
    drawPuttBar(hud, W, H, {
      feet: feet(d), rise: puttRise(game.hole, me.at), range: pt.range, power: pt.power, target: d * 3 / pt.range,
      stage: pt.stage, canPutt: human && (pt.stage === 'aim' || pt.stage === 'power'), canCancel: human && pt.stage === 'power', stroke: me.strokes + 1,
      hint: !human ? `${who(me.golfer)} IS PUTTING` : pt.stage === 'aim' ? 'CLICK THE GREEN TO AIM, THEN PUTT' : pt.stage === 'power' ? 'CLICK TO STOP THE BAR' : '',
    });
  }
  const type = shotType(ui.shot);
  const lie = myLie(me);
  const max = Math.round(maxCarry(me.golfer, type, lie, game.hole));
  const aimYds = ui.aim ? Math.round(dist(me.at, ui.aim)) : 0;
  const slope = ui.aim ? Math.round(playsAs(game.hole, me.at, ui.aim)) - aimYds : 0; // + uphill
  const canHit = ui.phase === 'aim' && !!ui.aim && !ui.dragging && humanTurn();
  if (!pt) drawShotBar(hud, W, H, {
    types: SHOT_TYPES, allowed: lie.shots, selected: ui.shot, max, aim: aimYds, slope, canHit,
    club: chooseClub(me.golfer, type, aimYds + slope || max, lie).toUpperCase(),
    // How much of a full shot the lie gives (recovery skill included; a runner
    // gets more out of the trees).
    lie: lie.hard ? `${lie.name} ${Math.round(lieReach(me.golfer, SHOT_TYPES[0], lie) * 100)}%` : LIE_NAMES[me.lie] ?? me.lie.toUpperCase(), toPin: Math.round(toPin(game.play)), stroke: me.holed ? me.strokes : me.strokes + 1,
    hint: display.map ? 'CLICK THE MAP OR PRESS M TO GO BACK' : !humanTurn() && ui.phase !== 'done' ? `${who(me.golfer)} IS PLAYING` : ui.phase !== 'aim' ? '' : !ui.aim ? 'DRAG ON THE COURSE TO AIM' : ui.dragging ? 'LET GO TO SET THE AIM' : 'CHANGE SHOT OR DRAG AGAIN',
  });
  drawViewButtons(hud, W, display.map, settings.event, !settings.career);
  // An event's leaderboard, top five and you.
  const board = settings.comp && !ui.card && !display.map && compBoard();
  if (board) drawLeaderboard(hud, W - 136, 104, 130, board, { title: settings.comp.rounds > 1 ? `LEADERBOARD R${settings.comp.round + 1}` : 'LEADERBOARD', max: 5, thru: round.players[0].scores.filter((v) => v != null).length });
  if (ui.banner && now < ui.banner.until) drawBanner(hud, W, ui.banner.text, ui.banner.sub);
  if (ui.formNote && now < ui.formNote.until) drawFormNote(hud, W, ui.formNote.text, ui.formNote.good, ui.banner && now < ui.banner.until && ui.banner.sub ? 88 : 78);
  if (ui.pop && now < ui.pop.until) drawPop(hud, W, H, now);
  if (ui.cardAt && now >= ui.cardAt) { ui.card = true; ui.cardAt = 0; }
  if (ui.card) {
    const played = round.players[0].scores.filter((s) => s != null).length;
    drawScorecard(hud, W, H, round, game.hole.number, settings.match ? `MATCH PLAY: ${standings()}` : settings.comp && played < settings.holes ? compTitle() : played === settings.holes ? 'ROUND COMPLETE' : `${game.course.name.toUpperCase()}  SCORECARD`);
  }
}

function frame(now) {
  if (app.mode === 'play') {
    update(now);
    aimCamera(false);
    render(now);
  } else renderMenu(now);
  requestAnimationFrame(frame);
}

// ---------- Career and menus ----------

// The menus are drawn over a course, dimmed: the title over whatever was last
// played, the clubhouse over the first hole of your home course.
function renderMenu(now) {
  aimCamera(false);
  drawPlay(now);
  const { W, H } = display;
  hud.clearRect(0, 0, W, H);
  hud.fillStyle = 'rgba(12, 8, 24, 0.6)';
  hud.fillRect(0, 0, W, H);
  const hover = app.hover;
  if (app.mode === 'title') drawTitle(hud, W, H, { buttons: titleLayout(W, H, !!app.career), hover, save: app.career, full: !!document.fullscreenElement });
  if (app.note && now < app.note.until) drawMenuNote(hud, W, H, app.note.text);
  if (app.mode === 'new') drawNewCareer(hud, W, H, newCareerLayout(W, H), { draft: app.draft, hover, now, replaces: !!app.career });
  if (app.mode === 'hub') drawHub(hud, W, H, hubLayout(W, H, app.career), { career: app.career, hover, now });
  if (app.mode === 'drills') drawDrills(hud, W, H, drillsLayout(W, H), { career: app.career, hover });
  if (app.mode === 'results') drawResults(hud, W, H, resultsLayout(W, H, resultsShown(app.results.rows).length), { results: app.results, rows: resultsShown(app.results.rows), hover });
  if (app.mode === 'record') drawRecord(hud, W, H, recordLayout(W, H), { career: app.career, hover });
  if (app.mode === 'merit') drawMerit(hud, W, H, meritLayout(W, H, resultsShown(meritRows()).length), { title: `ORDER OF MERIT, SEASON ${app.career.season}`, rows: meritRows(), career: app.career, hover });
  if (app.mode === 'season') drawSeason(hud, W, H, meritLayout(W, H, resultsShown(app.career.lastSeason.table).length, 'carry-on'), { season: app.career.lastSeason, career: app.career, hover });
  if (app.mode === 'shop') drawShop(hud, W, H, shopLayout(W, H), { career: app.career, hover, note: app.shopNote });
  if (app.mode === 'members') drawMembers(hud, W, H, membersLayout(W, H), { career: app.career, pick: app.pick, hover, now });
  if (app.mode === 'courses') drawCourses(hud, W, H, coursesLayout(W, H, clubCourses(app.career)), { courses: clubCourses(app.career), hover });
}

// This season's order of merit.
const meritRows = () => meritTable(app.career);

// The buttons on the screen that's up, as { key, x, y, w, h }.
function menuButtons() {
  const { W, H } = display;
  if (app.mode === 'title') return titleLayout(W, H, !!app.career);
  if (app.mode === 'new') { const L = newCareerLayout(W, H); return [L.prev, L.next, ...L.shirts, L.back, L.start]; }
  if (app.mode === 'hub') {
    const c = app.career, L = hubLayout(W, H, c);
    if (c.round) return [L.play, L.menu];
    if (c.event) return [L.shop, L.menu, L.event, L.skip, L.record];
    return [...(c.midweek ? [] : [L.play, L.match, L.practice, L.tryChallenge]), L.shop, L.menu, ...(c.money >= eventFor(c).fee ? [L.event] : []), L.skip, L.merit, L.record];
  }
  if (app.mode === 'record') return [recordLayout(W, H).back];
  if (app.mode === 'merit') return [meritLayout(W, H, resultsShown(meritRows()).length).back];
  if (app.mode === 'season') return [meritLayout(W, H, resultsShown(app.career.lastSeason.table).length, 'carry-on').back];
  if (app.mode === 'results') return [resultsLayout(W, H, resultsShown(app.results.rows).length).done];
  if (app.mode === 'shop') { const L = shopLayout(W, H); return [...L.buys, L.back]; }
  if (app.mode === 'drills') { const L = drillsLayout(W, H); return [...(canPractise(app.career) ? L.drills : []), L.back]; }
  if (app.mode === 'members') { const L = membersLayout(W, H); return [...L.members, ...L.stakes, L.challenge, L.back]; }
  if (app.mode === 'courses') { const L = coursesLayout(W, H, clubCourses(app.career)); return [...L.cards, L.back]; }
  return [];
}

function menuClick(p) {
  const b = menuButtons().find((r) => inside(p, r));
  if (b) menuAction(b.key);
}

function menuAction(key) {
  const d = app.draft;
  if (key === 'continue') return goHub();
  if (key === 'fullscreen') return toggleFullscreen();
  if (key === 'new') { app.draft = { name: '', look: 'club', shirt: SHIRT_COLOURS[0] }; app.mode = 'new'; app.hover = 'start'; return; }
  if (key === 'free') return startFreePlay();
  if (key === 'prev' || key === 'next') {
    const i = LOOKS.findIndex((l) => l.look === d.look);
    d.look = LOOKS[(i + (key === 'next' ? 1 : LOOKS.length - 1)) % LOOKS.length].look;
    return;
  }
  if (key.startsWith('shirt-')) { d.shirt = SHIRT_COLOURS[Number(key.slice(6))]; return; }
  if (key === 'back' && ['courses', 'members', 'drills', 'shop', 'merit', 'record'].includes(app.mode)) return goHub();
  if (key === 'practice') { app.mode = 'drills'; app.hover = canPractise(app.career) ? 'drill-0' : 'back'; return; }
  if (key === 'event') return startEvent();
  if (key === 'skip') return skipEvent();
  if (key === 'event-play') return playEventRound();
  if (key === 'event-sim') return simEventRound();
  if (key === 'merit') { app.mode = 'merit'; app.hover = 'back'; return; }
  if (key === 'record') { app.mode = 'record'; app.hover = 'back'; return; }
  if (key === 'try-challenge') {
    const c = app.career;
    if (c.midweek || c.event || c.round) return;
    const ch = challengeFor(c);
    return playCareerRound(ch.course, null, null, ch);
  }
  if (key === 'carry-on') { app.career.lastSeason.seen = true; saveCareer(app.career); return goHub(); }
  if (key === 'done') return goHub();
  if (key === 'shop') { app.mode = 'shop'; app.shopNote = null; app.hover = 'back'; return; }
  if (key.startsWith('buy-')) {
    const c = app.career, item = shopItem(SLOTS[Number(key.slice(4))].key, c.tier);
    if (!buyKit(c, item.id)) { app.shopNote = { text: `NOT ENOUGH MONEY FOR ${item.name}. WIN SOME MATCHES FIRST.`, good: false }; return; }
    saveCareer(c);
    app.shopNote = { text: `${item.name} IS IN YOUR BAG. -£${item.price}`, good: true };
    return;
  }
  if (key.startsWith('drill-')) return startPractice(DRILLS[Number(key.slice(6))].key);
  if (key === 'back' || key === 'menu') return showTitle();
  if (key === 'start' && d.name.trim()) {
    app.career = newCareer({ name: d.name.trim(), look: d.look, shirt: d.shirt });
    saveCareer(app.career);
    return goHub();
  }
  if (key === 'play') {
    if (app.career.round) return playCareerRound();
    if (app.career.midweek || app.career.event) return;
    app.mode = 'courses';
    app.hover = 'course-0';
    return;
  }
  if (key === 'match') {
    if (app.career.midweek || app.career.event) return;
    app.mode = 'members';
    const stake = STAKES.filter((v) => v <= app.career.money).at(-1) ?? null;
    app.pick = { member: app.pick?.member ?? MEMBERS[0].id, stake: stake && Math.min(stake, app.pick?.stake ?? STAKES[0]) };
    app.hover = 'challenge';
    return;
  }
  if (key.startsWith('member-')) { app.pick.member = MEMBERS[Number(key.slice(7))].id; return; }
  if (key.startsWith('stake-')) { const v = STAKES[Number(key.slice(6))]; if (v <= app.career.money) app.pick.stake = v; return; }
  if (key === 'challenge' && app.pick.stake) return playCareerRound(app.career.home, { ...app.pick });
  if (key.startsWith('course-')) return playCareerRound(clubCourses(app.career)[Number(key.slice(7))]);
}

function menuKey(e) {
  const k = e.key;
  if (app.mode === 'new') {
    const d = app.draft;
    if (k === 'Backspace') { e.preventDefault(); d.name = d.name.slice(0, -1); return; }
    if (/^[a-zA-Z0-9 '.-]$/.test(k) && d.name.length < 14) { e.preventDefault(); d.name += k.toUpperCase(); return; }
    if (k === 'ArrowLeft') return menuAction('prev');
    if (k === 'ArrowRight') return menuAction('next');
    if (k === 'Enter') return menuAction('start');
    if (k === 'Escape') return menuAction('back');
    return;
  }
  if (['courses', 'members', 'drills', 'shop', 'merit', 'record'].includes(app.mode) && k === 'Escape') return menuAction('back');
  if (app.mode === 'hub') {
    if (k === 'Enter') return menuAction('play');
    if (k === 'Escape') return menuAction('menu');
    return;
  }
  // The title and the course list: up and down pick a button, Enter presses it.
  const keys = menuButtons().map((b) => b.key);
  const i = keys.indexOf(app.hover);
  if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); app.hover = keys.at(((i < 0 ? 0 : i + (k === 'ArrowDown' ? 1 : -1)) + keys.length) % keys.length); }
  if (k === 'Enter') menuAction(keys.includes(app.hover) ? app.hover : keys[0]);
}

function showTitle() {
  app.mode = 'title';
  app.hover = app.career ? 'continue' : 'new';
}

// The course being shown or played, as its definition.
let playing = null;

// Show a course behind the menus (or play it): settings for the course, hole and round.
function useCourse(course, hole, career, match = null, practice = null, comp = null) {
  playing = course;
  form = null;
  settings.match = match;
  settings.comp = comp;
  settings.practice = practice;
  settings.challenge = null;
  Object.assign(settings, { style: course.style, seed: course.seed, name: course.name ?? null, par: course.par ?? 72, length: course.length ?? 'standard', tour: course.tour ?? null, holes: course.holes ?? 18, hole, career, event: comp ? DRESSING[eventTier(comp)] : 0 });
  golfers = !career ? [PLAYER, RIVAL] : practice ? [careerGolfer(app.career)] : [careerGolfer(app.career), match ? memberGolfer(app.career, match.member) : comp ? fieldGolfer(app.career, comp.partner) : clubOpponent()];
  showMap(false);
  loadHole();
}

// The clubhouse: your career between rounds, over your home course.
function goHub() {
  const c = app.career;
  if (!c) return showTitle();
  // A round whose last hole was played but not handed in yet.
  if (c.round && c.round.hole > c.round.course.holes) return endCareerRound();
  // A season just ended: how it went, before the new one starts.
  app.mode = c.lastSeason && !c.lastSeason.seen ? 'season' : 'hub';
  app.hover = app.mode === 'season' ? 'carry-on' : 'play';
  // Back to your own zoom after a drill zoomed in.
  if (settings.practice) setZoom(settings.practice.zoom);
  useCourse(c.home, 1, true);
}

// Play a round on one of your club's courses, or carry on the one in progress.
// A money match (`match`) is played at home.
function playCareerRound(course, match = null, comp = null, challenge = null) {
  const c = app.career;
  app.mode = 'play';
  round = null;
  useCourse(c.round?.course ?? course, c.round?.hole ?? 1, true, c.round ? c.round.match ?? null : match, null, c.round ? c.round.comp ?? null : comp);
  settings.challenge = c.round ? c.round.challenge ?? null : challenge;
  form = c.round?.form ?? newForm();
  if (c.round) round.players.forEach((p, i) => { p.scores = c.round.scores[i].slice(); p.putts = c.round.putts[i].slice(); });
}

// Hand in a finished career round: note it, move the week on, back to the clubhouse.
function endCareerRound() {
  const c = app.career, saved = c.round;
  const course = saved.course, holes = course.holes, total = (a) => a.slice(0, holes).reduce((t, v) => t + (v ?? 0), 0);
  const pars = round?.key?.endsWith(':true') ? round.pars : buildCourse({ ...course }, { layout: false }).holes.map((h) => h.par);
  const match = saved.match && { ...saved.match, lead: matchPlay({ players: saved.scores.map((scores) => ({ scores })) }, holes).lead };
  const good = Object.values(saved.form ?? {}).reduce((t, [g]) => t + g, 0), bad = Object.values(saved.form ?? {}).reduce((t, [, b]) => t + b, 0);
  c.report = { change: applyForm(c.skills, saved.form ?? newForm()), good, bad };
  // An event: on to the next round, or the final leaderboard and what you won.
  let comp = null, rows = null, eventRound = null;
  if (saved.comp) {
    if (!saved.comp.rounds) saved.comp.partnerName = saved.vs;
    const done = eventRoundIn(c, saved.comp, pars, saved.scores[0], saved.scores[1]);
    if (done) ({ comp, rows } = done); else eventRound = { name: saved.comp.name, round: saved.comp.round };
  }
  // A midweek challenge: did you do it?
  const challenge = saved.challenge && { text: saved.challenge.text, where: saved.challenge.where, prize: saved.challenge.prize, met: challengeMet(saved.challenge, saved.scores[0], pars) };
  finishRound(c, { course: course.name, holes, score: total(saved.scores[0]), par: total(pars), vs: (saved.vs ?? clubOpponent().name).toUpperCase(), vsScore: total(saved.scores[1]), match, comp, eventRound, challenge });
  // The weekend event's done: points on the order of merit, and on to next week.
  if (comp) eventOver(c, saved.comp, comp, rows);
  saveCareer(c);
  if (!saved.comp) return goHub();
  app.mode = 'results';
  app.hover = 'done';
  useCourse(c.home, 1, true);
}

// A round of an event is in, played or worked out: move the event on, then
// either keep it for the next round with the standings so far, or finish it
// with the final results. Returns what you won and the final board, or null.
function eventRoundIn(c, ev, pars, mine, partnerScores) {
  if (finishEventRound(ev, pars, c.name, mine, partnerScores)) {
    c.event = ev;
    const rows = leaderboard(ev, pars, 0, { name: c.name, scores: [] }, { name: '', scores: [] }), me = rows.find((x) => x.you);
    Object.assign(ev, { lastPos: me.pos, lastToPar: me.toPar });
    app.results = { name: ev.name, after: ev.round, rounds: ev.rounds, cutMade: ev.cutMade, cutLine: ev.cutLine, rows, prizes: [] };
    return null;
  }
  c.event = null;
  const rows = finalBoard(ev, pars, c.name), me = rows.find((x) => x.you), prize = prizeFor(ev, me.pos);
  app.results = { name: ev.name, title: ev.title, prize, prizes: ev.prizes, rows, rounds: ev.rounds, final: true };
  const comp = { name: ev.name, pos: me.pos, mc: !!me.mc, toPar: me.toPar, of: rows.length, prize, winner: rows[0].name, title: me.pos === 1 ? ev.title ?? null : null };
  return { comp, rows };
}

// An event of yours is over: the record, the rivals, the order of merit, and
// on to next week.
function eventOver(c, ev, comp, rows) {
  recordEvent(c, ev, comp);
  news(c, eventStory(c, ev, rows));
  addMerit(c, ev, rows);
  endWeek(c);
}

// Lines of news at the top of the clubhouse's recent rounds.
function news(c, lines) {
  for (const text of lines) c.history.unshift({ season: c.season, week: c.week, news: text });
  c.history = c.history.slice(0, 40);
}

// Work out your next round of an event instead of playing it.
function simEventRound() {
  const c = app.career, ev = c.event;
  if (!ev || c.round) return;
  const pars = eventPars(ev), mine = simRound(ev, { ...careerGolfer(c), nerve: 0.5 }, pars);
  const done = eventRoundIn(c, ev, pars, mine, null);
  const sum = (a) => a.reduce((t, v) => t + v, 0);
  finishRound(c, { course: ev.venue.name, holes: ev.holes, score: sum(mine), par: sum(pars), sim: true, comp: done?.comp ?? null, eventRound: done ? null : { name: ev.name, round: ev.round } });
  if (done) eventOver(c, ev, done.comp, done.rows);
  c.report = null;
  saveCareer(c);
  app.mode = 'results';
  app.hover = 'done';
}

// Play your next round of an event.
function playEventRound() {
  const c = app.career, ev = c.event;
  if (!ev || c.round) return;
  playCareerRound({ ...ev.venue, holes: ev.holes }, null, ev);
  saveRound(1);
}

// The pars of an event's holes, and the seed that settles everyone else's scores.
const eventPars = (ev) => buildCourse({ ...ev.venue }, { layout: false }).holes.map((h) => h.par).slice(0, ev.holes);
const eventSeed = (c, ev) => (c.season * 100 + c.week) * 7919 + ev.venue.seed;

// Enter this week's event: pay the entry and tee off with your partner.
function startEvent() {
  const c = app.career, ev = eventFor(c);
  if (c.round || c.money < ev.fee) return;
  c.money -= ev.fee;
  const course = { ...ev.venue, holes: ev.holes };
  const pars = eventPars(ev);
  const comp = newEvent(c, ev, course, pars, eventSeed(c, ev));
  // A one-round event tees off straight away; a longer one waits in the
  // clubhouse, where each round can be played or worked out.
  if (comp.rounds > 1) { c.event = comp; saveCareer(c); return; }
  playCareerRound(course, null, comp);
  saveRound(1); // the entry's paid: the round is yours to finish
}

// Skip this weekend's event: it's played without you, and the week moves on.
function skipEvent() {
  const c = app.career, ev = eventFor(c);
  if (c.round || c.event) return;
  const rows = skippedEvent(c, ev, eventPars(ev), eventSeed(c, ev));
  addMerit(c, ev, rows);
  c.history.unshift({ season: c.season, week: c.week, skipped: { name: ev.name, winner: rows[0].name } });
  news(c, eventStory(c, ev, rows));
  endWeek(c);
  saveCareer(c);
  goHub();
}

// ---------- Practice ground ----------

// A drill on its hole of your home course, on your own.
function startPractice(key) {
  const c = app.career;
  if (!canPractise(c)) return;
  app.mode = 'play';
  round = null;
  const home = buildCourse({ ...c.home }, { layout: false });
  useCourse(c.home, drillHole(home, key), true, null, { key, ball: 0, hits: 0, zoom: display.zoom });
  practiceBall(performance.now());
}

// Put the next ball down where the drill plays from.
function practiceBall(now) {
  const pr = settings.practice, me = current(game.play);
  const { at, lie } = drillSpot(pr.key, game.hole, pr.ball, TEE);
  Object.assign(me, { at, lie, strokes: 0, putts: 0, holed: false, onGreen: lie === 'green' });
  // Closer in for the short shots, so the ball and the green read well.
  if (pr.ball === 0) setZoom(pr.key === 'chip' ? 2 : pr.key === 'escape' ? 1 : 0);
  startTurn(now, `${drill(pr.key).name}: BALL ${pr.ball + 1} OF ${BALLS}`);
  aimCamera(true);
}

// A drill ball has finished: say how it went, then the next ball, or the end.
function practiceDone(from, end, holed, now) {
  const pr = settings.practice, me = current(game.play), d = drill(pr.key);
  const res = drillResult(pr.key, game.hole, me.golfer, from, end, holed);
  if (res.hit) pr.hits += 1;
  pr.ball += 1;
  ui.anim = null;
  ui.aim = null;
  if (pr.ball < BALLS) {
    ui.banner = { text: res.hit ? `GOOD! ${res.text}` : res.text, sub: `${pr.hits} GOOD OF ${pr.ball}`, until: now + 2000 };
    ui.phase = 'drill';
    ui.nextBall = now + 2000;
    return;
  }
  const c = app.career, gain = drillGain(pr.hits, c.skills[d.skill]);
  recordPractice(c, { name: d.name, skill: d.skill, hits: pr.hits, balls: BALLS, gain });
  saveCareer(c);
  ui.phase = 'done';
  ui.banner = { text: `${res.text}. ${pr.hits} OF ${BALLS} GOOD`, sub: `${SKILL_NAMES[d.skill]} +${gain.toFixed(1)}. ENTER FOR THE CLUBHOUSE`, until: Infinity };
}

function startFreePlay() {
  app.mode = 'play';
  round = null;
  useCourse({ style: 'tropical', seed: 1989 }, 1, false);
}

// ---------- Input ----------

// Mouse position in panel pixels, and on the hole in yards.
const toHud = (e) => ({ x: e.clientX / display.fitScale, y: e.clientY / display.fitScale });
const toYards = (e) => world.view.screenToWorld(e.clientX / scale() + Math.round(cam.x), e.clientY / scale() + Math.round(cam.y));
const inside = (p, b) => p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h;

// Dragging with the right (or middle) button scrolls round the course; a right
// click that doesn't move cancels the aim.
let scroll = null;

canvas.addEventListener('mousedown', (e) => {
  if (app.mode !== 'play') { if (e.button === 0) menuClick(toHud(e)); return; }
  if (e.button === 2 || e.button === 1) {
    e.preventDefault();
    scroll = { x: e.clientX, y: e.clientY, camX: cam.x, camY: cam.y, moved: false, button: e.button };
    return;
  }
  if (e.button !== 0) return;
  const p = toHud(e);
  const turn = viewButtons(display.W);
  if (inside(p, turn.left)) return turnView(-1);
  if (inside(p, turn.right)) return turnView(1);
  if (!settings.career && inside(p, turn.golfer)) return changeGolfer();
  if (inside(p, turn.map)) return showMap(!display.map);
  if (!settings.career && inside(p, turn.event)) return toggleEvent();
  if (ui.phase === 'putting') return puttClick(p);
  // A click on the map goes back to the hole.
  if (display.map && p.y < BAR_TOP(display.H)) return showMap(false);
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
// On the green: click or drag to aim, PUTT starts the power bar, and any click stops it.
function puttClick(p) {
  const pt = ui.putt;
  if (!pt || !humanTurn()) return;
  const now = performance.now();
  const act = actionButtons(display.W, display.H);
  if (inside(p, act.cancel)) return cancelPower();
  if (pt.stage === 'power') return stopPower(now);
  if (inside(p, act.hit)) return startPower(now);
  if (pt.stage === 'aim' && p.y < BAR_TOP(display.H)) {
    ui.dragging = true;
    aimPutt(p);
  }
}

addEventListener('mousemove', (e) => {
  if (app.mode !== 'play') { app.hover = menuButtons().find((b) => inside(toHud(e), b))?.key ?? app.hover; return; }
  if (scroll && !display.map && ui.phase !== 'putting') {
    const dx = e.clientX - scroll.x, dy = e.clientY - scroll.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) scroll.moved = true;
    if (scroll.moved) {
      cam.manual = true;
      cam.x = scroll.camX - dx / scale();
      cam.y = scroll.camY - dy / scale();
      clampCamera();
    }
  }
  if (!ui.dragging) return;
  if (ui.phase === 'putting') { if (ui.putt?.stage === 'aim') aimPutt(toHud(e)); return; }
  ui.aim = clampAim(toYards(e));
});
addEventListener('mouseup', (e) => {
  if (scroll && e.button === scroll.button) {
    if (!scroll.moved && e.button === 2) { cancelAim(); cancelPower(); }
    scroll = null;
    return;
  }
  if (!ui.dragging || e.button !== 0) return;
  ui.dragging = false;
  if (ui.phase === 'putting') return;
  // Letting go sets the aim; it's hit with the HIT button or space.
  if (ui.aim && dist(current(game.play).at, ui.aim) < 5) ui.aim = null;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(display.zoom + (e.deltaY < 0 ? 1 : -1)); }, { passive: false });

const PAN = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };

addEventListener('keydown', (e) => {
  // F goes full screen and back, anywhere but while typing a name.
  if (e.key.toLowerCase() === 'f' && app.mode !== 'new' && !e.ctrlKey && !e.metaKey) return toggleFullscreen();
  if (app.mode !== 'play') return menuKey(e);
  const k = e.key.toLowerCase();
  if (k >= '1' && k <= '5') return pickShot(SHOT_TYPES[Number(k) - 1].key);
  if (k === ' ') {
    e.preventDefault();
    if (!humanTurn()) return;
    if (ui.phase === 'putting') return ui.putt?.stage === 'power' ? stopPower(performance.now()) : startPower(performance.now());
    return shoot();
  }
  if (k === 'escape') { cancelPower(); return cancelAim(); }
  if (k === '+' || k === '=') return setZoom(display.zoom + 1);
  if (k === '-' || k === '_') return setZoom(display.zoom - 1);
  if (PAN[k] && !display.map) {
    e.preventDefault();
    cam.manual = true;
    cam.x += PAN[k][0] * 24; cam.y += PAN[k][1] * 24;
    return clampCamera();
  }
  if (k === 'c') { cam.manual = false; return; }
  if (k === 'm') return showMap(!display.map);
  if (k === 't') return toggleEvent();
  if (k === 'q') return turnView(-1);
  if (k === 'e') return turnView(1);
  if (k === 'g') return changeGolfer();
  if (k === 'h') return settings.career ? goHub() : showTitle();
  if (k === 'tab') { e.preventDefault(); ui.card = !ui.card; ui.cardAt = 0; return; }
  if (k === 'enter' && ui.phase === 'done') {
    if (settings.practice) return goHub();
    const last = roundOver();
    if (settings.career && last) return endCareerRound();
    // On to the next hole, or a fresh round after the last.
    if (last) { settings.hole = 1; round = null; } else settings.hole += 1;
    return loadHole();
  }
  if (settings.career) return; // the course is the career's: no changing hole or course
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
  resizing = setTimeout(() => {
    measure();
    buildWorld();
    if (ui.putt) ui.putt.view = greenFor(current(game.play).at);
  }, 150);
});

// Lets the test tools play shots without a mouse.
// autoPutt lines up and strikes the current putt as the computer golfer would.
function autoPutt() {
  const pt = ui.putt;
  if (pt?.stage !== 'aim') return;
  const me = current(game.play);
  const plan = readPutt(rng, me.golfer, game.hole, me.at);
  pt.aim = plan.aim;
  const now = performance.now();
  startPower(now);
  pt.meterAt = now - plan.power * POWER_SWEEP;
  stopPower(now);
}
window.golf = { get game() { return game; }, get world() { return world; }, get round() { return round; }, ui, cam, display, app, settings, shoot, clampAim, setZoom, turnView, changeGolfer, autoPutt, greenFor, toggleEvent, menuAction, menuButtonsForTest: () => menuButtons(), sceneryInFront, surfaceAt, pointAt, tournamentSites: () => tournamentSites(game.course) };

measure();
if (app.mode === 'title') {
  showTitle();
  // Behind the title: your home course if you have a career, else a sunny one.
  if (app.career) useCourse(app.career.home, 1, true); else loadHole();
} else loadHole();
requestAnimationFrame(frame);
