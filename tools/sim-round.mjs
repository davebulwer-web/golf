// Plays holes in node with the computer golfer's own shot planning and putting,
// for rating how hard a course is. Nothing is drawn.

import { makeRng, surfaceAt, CALM } from '../src/course-generator.js';
import { layoutHole, isOutOfBounds } from '../src/hole-view.js';
import { planShot } from '../src/ai.js';
import { startHole, current, hit, settle, settlePutt, PICK_UP } from '../src/play.js';
import { readPutt, strike } from '../src/putting.js';

const BOX = { x: 0, y: 0, w: 900, h: 420 };

// Strokes for one golfer on one hole (picking up at PICK_UP, as in the game).
export function playHole(golfer, hole, weather, wind, rng, tee = 'white', view = layoutHole(hole, BOX)) {
  const state = startHole(hole, [golfer], tee);
  const me = current(state);
  const out = (p) => isOutOfBounds(view, p);
  while (!me.holed && me.strokes < PICK_UP) {
    if (me.onGreen) {
      const plan = readPutt(rng, golfer, hole, me.at);
      settlePutt(state, strike(rng, golfer, hole, me.at, plan.aim, plan.power, plan.range));
    } else {
      const plan = planShot(golfer, { at: me.at, lie: me.lie }, hole, weather, wind, out, rng.int(0, 2 ** 30));
      settle(state, hit(state, rng, plan.aim, plan.type, weather, wind, out));
    }
  }
  return Math.min(me.strokes, PICK_UP);
}

export const still = { along: 0, across: 0 };
export { CALM, makeRng, surfaceAt };
