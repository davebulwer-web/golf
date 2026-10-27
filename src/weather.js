// Weather for a round, and the wind as it blows across a particular hole.

import { drawWeather, makeRng } from './course-generator.js';

// Same course and round number always give the same weather.
export const roundWeather = (course, round = 1) => drawWeather(course, makeRng((course.seed ^ 0x77e1a5) + round));

// Wind in the hole's own frame, in mph: `along` is towards the green (negative is
// into the golfer's face) and `across` is left to right as the golfer looks down the hole.
export function holeWind(weather, hole) {
  const a = weather.windDir - hole.bearing;
  return { along: weather.windMph * Math.cos(a), across: weather.windMph * Math.sin(a) };
}

// Plain words for the HUD, e.g. "HELPING, LEFT TO RIGHT".
export function windWords(w) {
  if (Math.hypot(w.along, w.across) < 1) return 'CALM';
  const parts = [];
  if (Math.abs(w.along) >= 2) parts.push(w.along > 0 ? 'HELPING' : 'AGAINST');
  if (Math.abs(w.across) >= 2) parts.push(w.across > 0 ? 'LEFT TO RIGHT' : 'RIGHT TO LEFT');
  return parts.join(', ') || 'LIGHT';
}
