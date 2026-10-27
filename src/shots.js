// The five shots, how far each can go, and what actually happens when one is hit.
// Distances are yards. The player aims where the ball should land; skills and
// luck decide how close it gets, then it rolls out.

import { surfaceAt, dist } from './course-generator.js';
import { rise, slopeAt } from './terrain.js';

// reach: share of a full shot's carry. curve: +1 bends right, -1 bends left.
// apex: how high it flies. roll: share of the carry it rolls on firm grass.
// wind: how much the wind moves it. spread: how wide it scatters.
export const SHOT_TYPES = [
  { key: 'straight', name: 'Normal', reach: 1, curve: 0, apex: 1, roll: 0.12, wind: 1, spread: 1 },
  { key: 'fade', name: 'Fade', reach: 0.95, curve: 1, apex: 1.1, roll: 0.07, wind: 1, spread: 0.85 },
  { key: 'draw', name: 'Draw', reach: 1.02, curve: -1, apex: 0.9, roll: 0.18, wind: 1, spread: 1.1 },
  { key: 'lob', name: 'Lob', reach: 0.45, curve: 0, apex: 2.2, roll: 0.03, wind: 1.3, spread: 1 },
  { key: 'runner', name: 'Runner', reach: 0.8, curve: 0, apex: 0.35, roll: 0.35, wind: 0.5, spread: 0.9 },
];
export const shotType = (key) => SHOT_TYPES.find((t) => t.key === key);

// How a lie cuts distance and widens the scatter, before the recovery skill helps.
const LIE_REACH = { tee: 1, fairway: 0.97, fringe: 0.9, green: 0.6, rough: 0.82, waste: 0.82, bunker: 0.55, trees: 0.45 };
const LIE_SPREAD = { tee: 1, fairway: 1, fringe: 1.05, green: 1.2, rough: 1.35, waste: 1.3, bunker: 1.6, trees: 2 };
// How far the ball rolls on landing, as a share of the shot's normal roll.
const ROLL = { green: 1, fairway: 1, tee: 0.9, fringe: 0.8, waste: 0.4, rough: 0.25, trees: 0.1, bunker: 0, water: 0 };
const HARD_LIES = new Set(['rough', 'waste', 'bunker', 'trees']);

const fullCarry = (golfer) => 190 + 0.9 * golfer.skills.power;

function lieReach(golfer, type, lie) {
  // A low runner is the way out of the trees.
  const base = lie === 'trees' && type.key === 'runner' ? 0.7 : LIE_REACH[lie] ?? 1;
  return base + (1 - base) * 0.3 * golfer.skills.recovery / 100;
}

// Furthest the golfer can carry this shot from this lie.
export const maxCarry = (golfer, type, lie, hole) => fullCarry(golfer) * type.reach * lieReach(golfer, type, lie) * (hole.altitude ?? 1);

// How long a shot plays: uphill plays longer, downhill shorter, a yard for each
// yard of rise or fall. The golfer allows for it when picking a club.
export const playsAs = (hole, from, to) => dist(from, to) + rise(hole, from, to);

// The furthest point towards `aim` that this shot can carry to, allowing for the slope.
export function clampToReach(golfer, type, lie, hole, from, aim) {
  const max = maxCarry(golfer, type, lie, hole);
  if (playsAs(hole, from, aim) <= max) return aim;
  let lo = 0, hi = 1;
  const at = (f) => ({ x: from.x + (aim.x - from.x) * f, y: from.y + (aim.y - from.y) * f });
  for (let k = 0; k < 20; k++) {
    const mid = (lo + hi) / 2;
    if (playsAs(hole, from, at(mid)) <= max) lo = mid; else hi = mid;
  }
  return at(lo);
}

// Clubs and their carry for an average golfer; scaled by each golfer's power.
const CLUBS = [
  ['Driver', 235], ['3 Wood', 215], ['5 Wood', 200], ['4 Iron', 185], ['5 Iron', 175], ['6 Iron', 165],
  ['7 Iron', 155], ['8 Iron', 145], ['9 Iron', 133], ['Pitching Wedge', 120], ['Gap Wedge', 105], ['Sand Wedge', 90], ['Lob Wedge', 70],
];

// The club for a shot, picked automatically from the distance.
export function chooseClub(golfer, type, carry, lie) {
  const scale = fullCarry(golfer) / 235;
  if (type.key === 'lob') return carry > 70 * scale || lie === 'bunker' ? 'Sand Wedge' : 'Lob Wedge';
  if (lie === 'bunker' && carry < 90 * scale) return 'Sand Wedge';
  // A runner is played with less loft, so a longer club for the same carry.
  const need = carry * (type.key === 'runner' ? 1.25 : 1);
  const usable = CLUBS.filter(([name]) => name !== 'Driver' || lie === 'tee');
  let pick = usable[0][0];
  for (const [name, yards] of usable) if (yards * scale >= need) pick = name;
  return pick;
}

// How widely a shot scatters around the aim: standard deviations in yards along
// and across the line, and the chance of a mishit. Pushing for the maximum
// distance is where it gets risky.
export function shotSpread(golfer, type, lie, carry, max, weather) {
  const s = golfer.skills;
  const skill = type.key === 'lob' || carry < 100 ? s.shortGame : s.accuracy;
  const effort = Math.min(1, carry / max);
  let pct = (0.025 + 0.055 * (1 - skill / 100)) * type.spread;
  const lieSpread = LIE_SPREAD[lie] ?? 1;
  pct *= HARD_LIES.has(lie) ? 1 + (lieSpread - 1) * (1 - 0.5 * s.recovery / 100) : lieSpread;
  pct *= 0.7 + 0.9 * effort ** 3;
  const gust = (weather?.windMph ?? 0) * 0.08 * type.wind;
  let mishit = 0.01 + 0.08 * effort ** 4 * (1 - skill / 150);
  if (lie === 'trees') mishit += 0.1 * (1 - s.recovery / 120);
  if (lie === 'bunker') mishit += 0.06 * (1 - s.recovery / 100);
  return {
    long: Math.max(1.5, carry * pct * 0.8 + gust),
    lat: Math.max(1.5, carry * pct + gust),
    mishit,
  };
}

// Where a point sits on a shot's flight at t from 0 (struck) to 1 (landing):
// ground position in yards plus height `h` in yards. Fades and draws start off
// line and bend back to the landing spot.
export function flightPoint(from, to, type, t) {
  const d = dist(from, to) || 1;
  const ux = (to.x - from.x) / d, uy = (to.y - from.y) / d;
  const bend = -type.curve * d * 0.07 * Math.sin(Math.PI * t); // fades start left, draws start right
  const h = type.apex * Math.min(d, 220) * 0.11 * Math.sin(Math.PI * t);
  return { x: from.x + (to.x - from.x) * t + uy * bend, y: from.y + (to.y - from.y) * t - ux * bend, h };
}

// Hit a shot. `ball` is { at, lie }; `aim` is where the golfer wants it to land.
// `wind` is from holeWind (mph along and across the hole). Returns the whole story
// of the shot for animating and scoring.
export function playShot(rng, golfer, ball, aim, typeKey, hole, weather, wind) {
  const type = shotType(typeKey);
  const from = ball.at;
  const max = maxCarry(golfer, type, ball.lie, hole);
  aim = clampToReach(golfer, type, ball.lie, hole, from, aim);
  const d = dist(from, aim);
  const plays = Math.max(1, playsAs(hole, from, aim));
  const ux = (aim.x - from.x) / (d || 1), uy = (aim.y - from.y) / (d || 1);
  const rx = uy, ry = -ux; // to the golfer's right

  const spread = shotSpread(golfer, type, ball.lie, plays, max, weather);
  let along = rng.gauss() * spread.long, across = rng.gauss() * spread.lat;
  const mishit = rng.chance(spread.mishit);
  if (mishit) {
    along -= d * rng.range(0.2, 0.45);
    across += (rng.chance(0.5) ? 1 : -1) * d * rng.range(0.1, 0.22);
  }
  // Wind in the hole's frame: `across` is +x and `along` is +y.
  const drift = d * 0.0045 * type.wind;
  const landing = {
    x: aim.x + ux * along + rx * across + wind.across * drift,
    y: aim.y + uy * along + ry * across + wind.along * drift,
  };

  const landedOn = surfaceAt(hole, landing);
  const result = {
    type: typeKey, club: chooseClub(golfer, type, plays, ball.lie), from, aim, landing, mishit,
    carry: dist(from, landing), landedOn, rest: landing, surface: landedOn, holed: false, path: [landing],
  };
  if (landedOn === 'water') return result;

  // Roll on along the line of flight, stopping in sand, water or trees, slowing in rough.
  let roll = result.carry * type.roll * (ROLL[landedOn] ?? 0.5) * (1 + 5 * (weather?.firm ?? 0));
  if (type.key === 'lob' && landedOn === 'green') roll *= 0.5;
  const c = result.carry || 1;
  const r = rollOut(hole, landing, { x: (landing.x - from.x) / c, y: (landing.y - from.y) / c }, roll, landedOn);
  Object.assign(result, r);
  return result;
}

// How steep the ground must be for a ball to start rolling down it by itself.
const STEEP = { green: 0.05, fringe: 0.06, tee: 0.08, fairway: 0.08, waste: 0.12, rough: 0.18 }; // greens tilt less than this
const ROLL_STEP = 0.5;

// A ball rolling from `p` in direction `dir` with `roll` yards of run on flat
// ground. Slopes speed it up or slow it down, bend it downhill, and a ball that
// stops on a steep slope trickles on down it. Returns where it stops, on what,
// whether it dropped, and the path it took.
export function rollOut(hole, p, dir, roll, surface) {
  let left = roll, s = surface, dx = dir.x, dy = dir.y;
  const most = roll + 40;
  const path = [p];
  for (let k = 0; k < 800; k++) {
    const g = slopeAt(hole, p);
    if (left <= 0) {
      // Stopped: unless the slope is steep enough to start it off again.
      const steep = Math.hypot(g.x, g.y);
      if (steep <= (STEEP[s] ?? 0.2)) break;
      dx = -g.x / steep; dy = -g.y / steep;
      left = Math.min(3, (steep - (STEEP[s] ?? 0.2)) * 40);
    }
    // Downhill it runs on, uphill it slows; across a slope it falls away, more when slow.
    const up = g.x * dx + g.y * dy;
    const bend = 1.5 / (1 + left);
    dx -= (g.x - up * dx) * bend; dy -= (g.y - up * dy) * bend;
    const n = Math.hypot(dx, dy) || 1;
    dx /= n; dy /= n;
    const q = { x: p.x + dx * Math.min(ROLL_STEP, left), y: p.y + dy * Math.min(ROLL_STEP, left) };
    left = Math.min(most, left - ROLL_STEP * (1 + 12 * up));
    const t = surfaceAt(hole, q);
    if (t === 'rough' && s !== 'rough') left *= 0.3;
    p = q; s = t;
    if (k % 4 === 3) path.push(p);
    if (dist(p, hole.pin) < 0.35 && left < 4) { p = { ...hole.pin }; break; }
    if (t === 'water' || t === 'bunker' || t === 'trees') break;
  }
  path.push(p);
  const holed = dist(p, hole.pin) < 0.35;
  return { rest: holed ? { ...hole.pin } : p, surface: s, holed, path };
}

// Where to drop after going in the water: back along the line towards where the
// shot was played from, onto dry land.
export function waterDrop(hole, wet, from) {
  const d = dist(wet, from) || 1;
  const ux = (from.x - wet.x) / d, uy = (from.y - wet.y) / d;
  for (let k = 1; k <= d; k++) {
    const p = { x: wet.x + ux * k, y: wet.y + uy * k };
    if (surfaceAt(hole, p) !== 'water') {
      const q = { x: p.x + ux * 2, y: p.y + uy * 2 };
      return surfaceAt(hole, q) === 'water' ? p : q;
    }
  }
  return { ...from };
}
