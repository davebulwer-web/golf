// Form: in a career, your good and bad shots in a round nudge the skill each
// shot tested, a little either way and capped per round. Each shot is judged
// for one skill at most:
//   recovery   any shot from rough, sand, waste or trees
//   shortGame  shots inside 100 yards
//   power      tee shots on par 4s and 5s (one into the trees counts against accuracy)
//   accuracy   other full shots
//   putting    putts
// Shots that are neither good nor bad don't count.

import { dist } from './course-generator.js';
import { shotType, maxCarry } from './shots.js';
import { feet } from './putting.js';

const TROUBLE = ['rough', 'bunker', 'waste', 'trees'];
const SAFE = ['fairway', 'fringe', 'green'];
const FORM_STEP = 0.25;  // skill points per good (or bad) shot, before the cap
const FORM_CAP = 1;      // most a skill can move in one round, either way

export const newForm = () => ({ power: [0, 0], accuracy: [0, 0], shortGame: [0, 0], recovery: [0, 0], putting: [0, 0] });

// What to say about a judged shot, good and bad, by skill.
const WORDS = {
  power: ['BIG DRIVE', 'POOR DRIVE'],
  accuracy: ['ON TARGET', 'WAYWARD'],
  shortGame: ['NICE TOUCH', 'FLUFFED IT'],
  recovery: ['GREAT ESCAPE', 'STILL IN TROUBLE'],
  putting: ['GREAT PUTT', 'POOR PUTT'],
};
const verdict = (skill, good) => ({ skill, good, words: WORDS[skill][good ? 0 : 1] });

// A full shot, from `lie`, as returned by hit(). Null if it wasn't telling.
export function judgeShot(shot, lie, hole, golfer) {
  const to = shot.next.lie, trouble = shot.mishit || shot.penalty > 0;
  const d = dist(shot.from, shot.aim), miss = dist(shot.landing, shot.aim), left = dist(shot.rest, hole.pin);
  // Out of the rough it takes finding the green, close; from anywhere worse,
  // getting back on the short grass.
  if (TROUBLE.includes(lie)) {
    const escaped = lie === 'rough' ? to === 'green' && left <= Math.max(6, d * 0.08) : SAFE.includes(to);
    if (!trouble && escaped) return verdict('recovery', true);
    if (trouble || ['trees', 'bunker', 'waste'].includes(to)) return verdict('recovery', false);
    return null;
  }
  if (d < 100) {
    if (shot.holed || (to === 'green' && left <= 3)) return verdict('shortGame', true);
    if (trouble || !SAFE.includes(to) || left > Math.max(12, d * 0.4)) return verdict('shortGame', false);
    return null;
  }
  if (lie === 'tee' && hole.par >= 4) {
    const max = maxCarry(golfer, shotType(shot.type), lie, hole);
    if (!trouble && shot.carry >= 0.85 * max && SAFE.includes(to)) return verdict('power', true);
    if (trouble) return verdict('power', false);
    if (to === 'trees') return verdict('accuracy', false); // long enough, but not straight
    return null;
  }
  if (!trouble && miss <= Math.max(6, d * 0.05) && to !== 'bunker') return verdict('accuracy', true);
  if (trouble || miss > d * 0.15) return verdict('accuracy', false);
  return null;
}

// A putt of `yards`, the `nth` on the hole (1 for the first).
export function judgePutt(yards, holed, nth) {
  const ft = feet(yards);
  if (holed && ft >= 8) return verdict('putting', true);
  if ((!holed && ft <= 4) || nth >= 3) return verdict('putting', false);
  return null;
}

// Count a judged shot into the round's form.
export function tally(form, v) {
  if (v) form[v.skill][v.good ? 0 : 1] += 1;
}

// Move the skills by a round's form. Gains come slower near the top and losses
// slower near the bottom. Returns each skill's change.
export function applyForm(skills, form) {
  const change = {};
  for (const [k, [good, bad]] of Object.entries(form)) {
    let d = Math.max(-FORM_CAP, Math.min(FORM_CAP, (good - bad) * FORM_STEP));
    d *= d > 0 ? (100 - skills[k]) / 55 : skills[k] / 55;
    d = Math.round(d * 10) / 10;
    skills[k] = Math.max(20, Math.min(99, Math.round((skills[k] + d) * 10) / 10));
    change[k] = d;
  }
  return change;
}
