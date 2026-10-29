// How a computer golfer picks its shot: it tries a spread of shot types and
// landing spots, plays each one a few times in its head with the real shot
// model (wind and all), and takes the one that leaves the fewest strokes,
// counting the risk of a bad outcome according to its nerve.

import { makeRng, surfaceAt, pointAt, project, dist } from './course-generator.js';
import { SHOT_TYPES, shotType, maxCarry, playShot, waterDrop, lieAt, canPlay } from './shots.js';
import { holeChance } from './putting.js';

const LIE_COST = { tee: 0, fairway: 0, fringe: -0.05, green: 0, rough: 0.3, waste: 0.3, bunker: 0.45, trees: 0.8 };

// A rough guess at the strokes still needed to hole out from a spot.
export function strokesLeft(golfer, hole, p, lie) {
  const d = dist(p, hole.pin);
  if (lie === 'green') {
    const ft = d * 3;
    return 1 + (1 - holeChance(golfer, ft)) * (ft > 30 ? 1.25 : 1.05);
  }
  const reach = maxCarry(golfer, SHOT_TYPES[0], 'fairway', hole);
  return 1.9 + 0.95 * d / reach + (LIE_COST[lie] ?? 0.3);
}

// Landing spots worth trying: a fan of lines either side of the pin at several
// lengths, the pin itself, and points down the middle of the hole (for doglegs).
function candidateAims(golfer, ball, hole, type) {
  const max = maxCarry(golfer, type, lieAt(hole, ball.at, ball.lie), hole);
  const toPin = dist(ball.at, hole.pin);
  const aims = [];
  const base = Math.atan2(hole.pin.y - ball.at.y, hole.pin.x - ball.at.x);
  for (const turn of [-0.6, -0.35, -0.18, -0.08, 0, 0.08, 0.18, 0.35, 0.6]) {
    for (const f of [0.55, 0.7, 0.85, 1]) {
      const d = Math.min(toPin * 1.02, max) * f;
      aims.push({ x: ball.at.x + Math.cos(base + turn) * d, y: ball.at.y + Math.sin(base + turn) * d });
    }
  }
  if (toPin <= max) aims.push({ ...hole.pin });
  const s0 = Math.max(0, project(hole.line, ball.at).s);
  for (let s = s0 + 60; s < hole.line.length; s += 25) {
    const p = pointAt(hole.line, s);
    if (dist(ball.at, p) <= max) aims.push(p);
  }
  return aims;
}

// Which shots are worth considering from here (of those the lie allows).
function typesToTry(golfer, ball, hole) {
  const toPin = dist(ball.at, hole.pin), lie = lieAt(hole, ball.at, ball.lie);
  const lob = maxCarry(golfer, shotType('lob'), lie, hole);
  const want = toPin < lob * 0.9 ? ['lob', 'runner', 'straight'] : ['straight', 'fade', 'draw', 'runner', 'lob'];
  const ok = want.filter((k) => canPlay(lie, k));
  return ok.length ? ok : lie.shots;
}

// Pick a shot: returns { type, aim, expected } where `expected` is the strokes it
// expects to need from here, including this one.
export function planShot(golfer, ball, hole, weather, wind, outOfBounds, seed, tries = 16) {
  const rng = makeRng(seed);
  const caution = 0.15 + 0.7 * (1 - (golfer.nerve ?? 0.5)); // how much a spread of outcomes puts it off
  let best = null;
  for (const typeKey of typesToTry(golfer, ball, hole)) {
    for (const aim of candidateAims(golfer, ball, hole, shotType(typeKey))) {
      const costs = [];
      for (let i = 0; i < tries; i++) {
        const s = playShot(rng, golfer, ball, aim, typeKey, hole, weather, wind);
        let cost;
        if (s.holed) cost = 1;
        else if (s.surface === 'water') {
          const drop = waterDrop(hole, s.rest, ball.at);
          cost = 2 + strokesLeft(golfer, hole, drop, surfaceAt(hole, drop));
        } else if (outOfBounds(s.rest)) cost = 2 + strokesLeft(golfer, hole, ball.at, ball.lie);
        else cost = 1 + strokesLeft(golfer, hole, s.rest, s.surface);
        costs.push(cost);
      }
      const mean = costs.reduce((a, b) => a + b, 0) / tries;
      const sd = Math.sqrt(costs.reduce((a, b) => a + (b - mean) ** 2, 0) / tries);
      const score = mean + caution * sd + rng.range(0, 0.04); // a touch of variety
      if (!best || score < best.score) best = { type: typeKey, aim, expected: mean, score };
    }
  }
  return best;
}
