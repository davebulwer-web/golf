// The practice ground: a short drill for each skill, five balls each, played
// on a hole of your home course. A session trains its skill a little more the
// better it goes, and never costs any.

import { pointAt, surfaceAt, dist } from './course-generator.js';
import { shotType, maxCarry } from './shots.js';
import { feet } from './putting.js';

export const BALLS = 5;

export const DRILLS = [
  { key: 'drive', skill: 'power', name: 'LONG DRIVE', about: 'FIVE DRIVES. KEEP THEM IN PLAY, AND HIT THEM A LONG WAY.' },
  { key: 'target', skill: 'accuracy', name: 'TARGET GREENS', about: 'FIVE APPROACHES FROM 140 TO 170 YARDS. HIT THE GREEN.' },
  { key: 'chip', skill: 'shortGame', name: 'CHIP TO THE CIRCLE', about: 'FIVE PITCHES FROM 30 TO 70 YARDS. FINISH WITHIN 3 YARDS.' },
  { key: 'escape', skill: 'recovery', name: 'ESCAPE ARTIST', about: 'FIVE BALLS IN SAND AND ROUGH. GET THEM ON THE GREEN.' },
  { key: 'putt', skill: 'putting', name: 'PUTTING CHALLENGE', about: 'FIVE PUTTS FROM 6 TO 30 FEET. HOLE THEM.' },
];
export const drill = (key) => DRILLS.find((d) => d.key === key);

// The hole a drill is played on: for driving, the longest of the first nine
// that runs straight from the tee for 250 yards; otherwise the first par 4
// (one with a greenside bunker for escapes).
export function drillHole(course, key) {
  const nine = course.holes.slice(0, 9);
  if (key === 'drive') {
    const straight = nine.filter((h) => h.par > 3 && h.line.segs[0].len >= 250);
    return (straight.length ? straight : nine).reduce((a, b) => (b.length > a.length ? b : a)).number;
  }
  const fours = nine.filter((h) => h.par === 4);
  if (key === 'escape') return (fours.find((h) => h.bunkers.some((b) => b.greenside)) ?? fours[0] ?? nine[0]).number;
  return (fours[0] ?? nine[0]).number;
}

// Where ball `i` (0 to 4) of a drill is played from: { at, lie }.
export function drillSpot(key, hole, i, tee) {
  const line = hole.line, len = line.length;
  const spot = (p) => ({ at: p, lie: surfaceAt(hole, p) });
  if (key === 'drive') return { at: pointAt(line, hole.tees[tee]), lie: 'tee' };
  // Nearest the distance and line asked for that's on one of `lies` (never water).
  const near = (d, lat, lies) => {
    for (let k = 0; k < 40; k++) {
      const p = pointAt(line, len - d - (k >> 1) * 4 * (k % 2 ? -1 : 1), lat * (1 - k / 40));
      if (lies.includes(surfaceAt(hole, p))) return spot(p);
    }
    return spot(pointAt(line, len - d, 0));
  };
  if (key === 'target') return near([140, 155, 170, 150, 160][i], [0, -4, 3, 5, -2][i], ['fairway']);
  if (key === 'chip') return near([30, 45, 60, 40, 70][i], [-6, 5, -2, 9, 0][i], ['fairway', 'rough', 'fringe']);
  if (key === 'escape') {
    // Sand on alternate balls if the green has a bunker, else rough off the side.
    const sand = hole.bunkers.filter((b) => b.greenside);
    if (i % 2 === 0 && sand.length) {
      const b = sand[(i / 2) % sand.length];
      return { at: { x: b.x, y: b.y }, lie: 'bunker' };
    }
    const side = i % 2 ? 1 : -1, d = [100, 80, 120, 90, 110][i];
    for (let out = 1; out < 4; out += 0.25) {
      const p = pointAt(line, len - d, side * (hole.fwHalf + hole.roughW * out * 0.5));
      if (['rough', 'trees'].includes(surfaceAt(hole, p))) return spot(p);
    }
    return spot(pointAt(line, len - d, side * (hole.fwHalf + 4)));
  }
  // Putts: round the hole at each distance, wherever there's green.
  const yards = [6, 10, 15, 20, 30][i] / 3;
  for (let k = 0; k < 24; k++) {
    const a = i * 1.3 + k * 0.26;
    const p = { x: hole.pin.x + Math.cos(a) * yards, y: hole.pin.y + Math.sin(a) * yards };
    if (surfaceAt(hole, p) === 'green') return { at: p, lie: 'green' };
  }
  return { at: { x: hole.pin.x + yards * 0.5, y: hole.pin.y }, lie: 'green' };
}

// How a ball went. `end` is where it finished and `holed` whether it dropped;
// `from` where it was played from. Returns { hit, text }.
export function drillResult(key, hole, golfer, from, end, holed) {
  const left = dist(end, hole.pin), on = surfaceAt(hole, end);
  const ft = `${feet(left)} FT FROM THE HOLE`;
  if (holed) return { hit: true, text: key === 'putt' ? 'HOLED IT!' : 'IN THE HOLE!' };
  if (key === 'drive') {
    const yds = Math.round(dist(from, end)), max = maxCarry(golfer, shotType('straight'), 'tee', hole);
    const fair = ['fairway', 'fringe', 'green'].includes(on), inPlay = fair || on === 'rough';
    const text = `${yds} YARDS, ${fair ? 'ON THE FAIRWAY' : inPlay ? 'IN THE ROUGH' : 'IN TROUBLE'}`;
    return { hit: inPlay && yds >= 0.85 * max, text: inPlay && yds < 0.85 * max ? `${text}, TOO SHORT` : text };
  }
  if (key === 'target') return { hit: on === 'green' || left <= 10, text: on === 'green' ? ft : `MISSED THE GREEN, ${Math.round(left)} YARDS AWAY` };
  if (key === 'chip') return { hit: left <= 3, text: ft };
  if (key === 'escape') return { hit: on === 'green', text: on === 'green' ? `ON THE GREEN, ${ft}` : 'STILL IN TROUBLE' };
  return { hit: false, text: `MISSED, ${feet(left)} FT LEFT` };
}

// What a session of `hits` out of five does for a skill at `value`.
export function drillGain(hits, value) {
  const base = [0.2, 0.3, 0.5, 0.7, 0.9, 1.2][hits];
  return Math.round(base * (100 - value) / 55 * 10) / 10;
}
