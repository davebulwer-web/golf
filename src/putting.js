// Putting is automatic, as in Sim Golf: the golfer's putting skill and the
// distance decide whether it drops, and if not, how far away it finishes.
// Distances here are yards; the game shows putts in feet.

import { dist } from './course-generator.js';

export const feet = (yards) => Math.max(1, Math.round(yards * 3));

// Chance of holing a putt of `ft` feet: about 80% from 3 ft, 45% from 10 ft and
// 5% from 40 ft for an average putter; better putters hold on to it for longer.
export function holeChance(golfer, ft) {
  if (ft <= 1.5) return 0.99;
  const reach = 8 + 8 * golfer.skills.putting / 100;
  return Math.min(0.99, Math.exp(-(ft - 1.5) / reach) * (0.9 + 0.1 * golfer.skills.putting / 100));
}

// Roll one putt from `from` at the hole. Returns { holed, rest, feet }.
export function putt(rng, golfer, from, pin) {
  const d = dist(from, pin);
  const ft = d * 3;
  if (rng.chance(holeChance(golfer, ft))) return { holed: true, rest: { ...pin }, feet: feet(d) };
  // A miss finishes a few feet away: further on long putts, closer for good putters.
  const leaveFt = 0.8 + Math.abs(rng.gauss()) * ft * (0.07 + 0.1 * (1 - golfer.skills.putting / 100));
  const ux = (pin.x - from.x) / (d || 1), uy = (pin.y - from.y) / (d || 1);
  const past = rng.chance(0.6) ? 1 : -1; // a bold putt goes by
  const a = rng.gauss() * 0.5;
  const ca = Math.cos(a) * past, sa = Math.sin(a);
  const leave = leaveFt / 3;
  return { holed: false, rest: { x: pin.x + (ux * ca - uy * sa) * leave, y: pin.y + (uy * ca + ux * sa) * leave }, feet: feet(d) };
}
