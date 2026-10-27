// Putting is automatic, as in Sim Golf: the golfer's putting skill, the
// distance and the slope of the green decide whether it drops, and if not, how
// far away it finishes. Putts across a slope break, and downhill ones run on.
// Distances here are yards; the game shows putts in feet.

import { dist } from './course-generator.js';
import { slopeAt } from './terrain.js';

export const feet = (yards) => Math.max(1, Math.round(yards * 3));

// Chance of holing a putt of `ft` feet: about 80% from 3 ft, 45% from 10 ft and
// 5% from 40 ft for an average putter; better putters hold on to it for longer.
export function holeChance(golfer, ft) {
  if (ft <= 1.5) return 0.99;
  const reach = 8 + 8 * golfer.skills.putting / 100;
  return Math.min(0.99, Math.exp(-(ft - 1.5) / reach) * (0.9 + 0.1 * golfer.skills.putting / 100));
}

// How the green slopes along a putt (+ uphill) and across it (+ falls to the
// golfer's right), rise over run.
export function puttSlope(hole, from, pin) {
  const d = dist(from, pin) || 1;
  const ux = (pin.x - from.x) / d, uy = (pin.y - from.y) / d;
  const g = hole ? slopeAt(hole, { x: (from.x + pin.x) / 2, y: (from.y + pin.y) / 2 }, 2) : { x: 0, y: 0 };
  return { up: g.x * ux + g.y * uy, falls: g.x * -uy + g.y * ux, ux, uy };
}

// Roll one putt from `from` at the hole on `hole`'s green. Returns { holed, rest,
// feet, path }, with the path curving as the putt breaks.
export function putt(rng, golfer, from, pin, hole = null) {
  const d = dist(from, pin);
  const ft = d * 3;
  const { up, falls, ux, uy } = puttSlope(hole, from, pin);
  // Break and pace are harder to judge from further away; downhill putts are quick.
  const read = 1 + ft * (1.3 * Math.abs(falls) + 0.8 * Math.max(0, -up));
  const holed = rng.chance(holeChance(golfer, ft) / read);
  let rest = { ...pin };
  if (!holed) {
    // A miss finishes a few feet away: further on long putts and downhill, closer for good putters.
    const leaveFt = 0.8 + Math.abs(rng.gauss()) * ft * (0.07 + 0.1 * (1 - golfer.skills.putting / 100)) * (1 + 10 * Math.max(0, -up));
    const past = rng.chance(0.6) ? 1 : -1; // a bold putt goes by
    // It tends to miss on the low side.
    const a = rng.gauss() * 0.5 - Math.sign(falls) * Math.min(0.6, Math.abs(falls) * 15);
    const ca = Math.cos(a) * past, sa = Math.sin(a);
    const leave = leaveFt / 3;
    rest = { x: pin.x + (ux * ca - uy * sa) * leave, y: pin.y + (uy * ca + ux * sa) * leave };
  }
  // The ball starts out on the high side and curls down to where it stops.
  const curl = Math.max(-0.4, Math.min(0.4, falls * 6)) * dist(from, rest);
  const via = { x: (from.x + rest.x) / 2 - uy * curl, y: (from.y + rest.y) / 2 + ux * curl };
  const path = [];
  for (let k = 0; k <= 16; k++) {
    const t = k / 16, a = (1 - t) ** 2, b = 2 * t * (1 - t), c = t * t;
    path.push({ x: a * from.x + b * via.x + c * rest.x, y: a * from.y + b * via.y + c * rest.y });
  }
  return { holed, rest, feet: feet(d), path };
}
