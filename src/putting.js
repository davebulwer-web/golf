// Putting is a little game of its own: aim, then stop a swinging power bar.
// The ball then really rolls: the green's slope pulls it downhill as it slows,
// and it drops if it reaches the hole slowly enough. The golfer's putting skill
// adds a small wobble to the line and the pace. Distances here are yards; the
// game shows putts in feet.

import { dist, surfaceAt } from './course-generator.js';
import { slopeAt, rise } from './terrain.js';

export const feet = (yards) => Math.max(1, Math.round(yards * 3));

const FRICTION = { green: 0.8, fringe: 2.2 }; // how fast the ball slows, yards per second per second
const ROUGH_FRICTION = 4.5;                    // anywhere else
const GRAVITY = 7.6;                           // a rolling ball's pull down a slope, yards per second per second
export const CUP = 0.1;                       // the hole's radius, generous so a putt on line drops
const DROP_SPEED = 1.4;                        // fastest a ball can be going and still drop, straight in
const PUTT_STEP = 1 / 60;

const friction = (surface) => FRICTION[surface] ?? ROUGH_FRICTION;

// How hard to hit a putt so it would roll `yards` on flat green.
export const speedFor = (yards) => Math.sqrt(2 * FRICTION.green * Math.max(0, yards));

// Roll a putt from `from` heading `angle` (radians) at `speed` yards per second.
// Returns { path: [{ x, y }] one point per PUTT_STEP, rest, holed, surface, miss }, where
// miss is how far from the middle of the hole a holed putt dropped in.
export function rollPutt(hole, from, angle, speed) {
  let x = from.x, y = from.y;
  let vx = Math.cos(angle) * speed, vy = Math.sin(angle) * speed;
  const pin = hole.pin;
  const path = [{ x, y }];
  let surface = 'green', holed = false, entry = 0, over = false;
  for (let k = 0; k < 20 / PUTT_STEP; k++) {
    const g = slopeAt(hole, { x, y });
    const f = friction(surface);
    const v = Math.hypot(vx, vy);
    // Stopped, and the slope isn't steep enough to start it again.
    if (v < 0.03 && GRAVITY * Math.hypot(g.x, g.y) < f) break;
    const ax = -GRAVITY * g.x - (v > 0 ? f * vx / v : 0);
    const ay = -GRAVITY * g.y - (v > 0 ? f * vy / v : 0);
    let nx = vx + ax * PUTT_STEP, ny = vy + ay * PUTT_STEP;
    // Friction stops a ball; it doesn't send it backwards.
    if (nx * vx + ny * vy < 0 && GRAVITY * Math.hypot(g.x, g.y) < f) { nx = 0; ny = 0; }
    const x2 = x + nx * PUTT_STEP, y2 = y + ny * PUTT_STEP;
    // Closest it comes to the middle of the hole on this step.
    const sx = x2 - x, sy = y2 - y, len2 = sx * sx + sy * sy;
    const t = len2 ? Math.max(0, Math.min(1, ((pin.x - x) * sx + (pin.y - y) * sy) / len2)) : 0;
    const cx = x + sx * t, cy = y + sy * t;
    const miss = Math.hypot(pin.x - cx, pin.y - cy);
    if (miss >= CUP) over = false;
    else if (!over) {
      const fast = Math.hypot(nx, ny);
      // Straight in it can be going quite quickly; over the edge it must be dying.
      if (fast < DROP_SPEED * (0.55 + 0.45 * Math.sqrt(1 - (miss / CUP) ** 2))) {
        path.push({ x: pin.x, y: pin.y });
        holed = true;
        entry = miss;
        x = pin.x; y = pin.y;
        break;
      }
      // Too quick: it hits the back of the cup and jumps out, slowed and
      // kicked off line (a little even when it was dead centre). It can't drop
      // while it's still passing over the hole.
      over = true;
      if (!path.lipped) {
        path.lipped = true;
        path.lipAt = path.length;
        const side = Math.sign((pin.x - cx) * ny - (pin.y - cy) * nx) || 1;
        const a = Math.atan2(ny, nx) - side * (0.1 + 0.3 * (1 - miss / CUP)), s = fast * 0.7;
        nx = Math.cos(a) * s; ny = Math.sin(a) * s;
      }
    }
    vx = nx; vy = ny; x = x2; y = y2;
    path.push({ x, y });
    if (k % 6 === 0) surface = surfaceAt(hole, { x, y });
    if (surface === 'water' || surface === 'bunker') break;
  }
  return { path, rest: { x, y }, holed, surface, miss: entry };
}

// The power bar's range in feet: the next step up that comfortably covers the putt.
const RANGES = [8, 15, 25, 40, 60, 90, 120];
export const puttRange = (yards) => RANGES.find((r) => r >= Math.max(yards * 3 * 1.3, yards * 3 + 4)) ?? RANGES[RANGES.length - 1];

// The bar's range for a putt from `from` aimed at `aim`: it covers both the
// hole and the aim, so aiming long gives a longer bar.
export const aimRange = (hole, from, aim) => puttRange(Math.max(dist(from, hole.pin), dist(from, aim)));

// The wobble a golfer's stroke puts on the line (radians) and the pace (a fraction).
const strokeWobble = (golfer) => 1.6 - golfer.skills.putting / 100;

// Strike a putt: aim at `aim` (a point on the green), with the bar stopped at
// `power` (0 to 1) of `range` feet. Stopping the bar at the aim's distance rolls
// the ball to the aim on a flat green; the slope does the rest.
export function strike(rng, golfer, hole, from, aim, power, range) {
  const w = strokeWobble(golfer);
  const angle = Math.atan2(aim.y - from.y, aim.x - from.x) + rng.gauss() * 0.01 * w;
  const yards = power * range / 3 * (1 + rng.gauss() * 0.025 * w);
  return rollPutt(hole, from, angle, speedFor(yards));
}

// How the green rises from the ball to the hole, in inches (+ uphill).
export const puttRise = (hole, from) => Math.round(rise(hole, from, hole.pin) * 36);

// Chance of holing a putt of `ft` feet, for the computer golfer's planning: about
// 80% from 3 ft, 45% from 10 ft and 5% from 40 ft for an average putter.
export function holeChance(golfer, ft) {
  if (ft <= 1.5) return 0.99;
  const reach = 8 + 8 * golfer.skills.putting / 100;
  return Math.min(0.99, Math.exp(-(ft - 1.5) / reach) * (0.9 + 0.1 * golfer.skills.putting / 100));
}

// The computer golfer reads the putt: it tries lines and paces with the real
// roll and picks the one that finishes in the hole, or nearest it, preferring
// putts that would only just reach. Its read gets vaguer from further away.
// Returns { aim, power, range }.
export function readPutt(rng, golfer, hole, from) {
  const pin = hole.pin;
  const d = dist(from, pin);
  // Coarse to fine: a fan of lines and paces, then closer in round the best.
  let best = { angle: Math.atan2(pin.y - from.y, pin.x - from.x), yards: d * 1.3 };
  for (const [da, n, dy] of [[0.04, 8, 0.15], [0.01, 4, 0.03], [0.003, 3, 0.01]]) {
    const around = best;
    best = null;
    for (let i = -n; i <= n; i++) {
      for (let j = -4; j <= 4; j++) {
        const angle = around.angle + i * da, yards = Math.max(0.3, around.yards * (1 + j * dy));
        const r = rollPutt(hole, from, angle, speedFor(yards));
        const score = r.holed ? (r.miss + Math.abs(yards - d - 0.1) * 0.05) * 0.01 : dist(r.rest, pin);
        if (!best || score < best.score) best = { score, angle, yards };
      }
    }
  }
  // A misread: a little off on line and pace, more so on long putts.
  const blur = (1 - golfer.skills.putting / 200) * Math.min(1.5, d / 8);
  const angle = best.angle + rng.gauss() * 0.04 * blur;
  const yards = best.yards * (1 + rng.gauss() * 0.08 * blur);
  const aimAt = Math.max(1, yards);
  const aim = { x: from.x + Math.cos(angle) * aimAt, y: from.y + Math.sin(angle) * aimAt };
  const range = aimRange(hole, from, aim);
  return { aim, power: Math.min(1, yards * 3 / range), range };
}
