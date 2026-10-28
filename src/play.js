// Playing a hole: whose turn it is, where each ball lies, strokes and penalties.

import { pointAt, surfaceAt, dist } from './course-generator.js';
import { playShot, waterDrop } from './shots.js';

// Start a hole with every golfer's ball on the given tee.
export function startHole(hole, golfers, tee = 'white') {
  const at = pointAt(hole.line, hole.tees[tee]);
  return {
    hole,
    players: golfers.map((golfer) => ({ golfer, at: { ...at }, lie: 'tee', strokes: 0, putts: 0, onGreen: false, holed: false })),
    turn: 0,
  };
}

export const current = (state) => state.players[state.turn];
export const toPin = (state) => dist(current(state).at, state.hole.pin);

// Hit the current player's shot. Returns the shot plus what it cost, without
// moving the ball yet, so the caller can animate it first and then call `settle`.
export function hit(state, rng, aim, typeKey, weather, wind, outOfBounds) {
  const p = current(state);
  const shot = playShot(rng, p.golfer, { at: p.at, lie: p.lie }, aim, typeKey, state.hole, weather, wind);
  shot.penalty = 0;
  shot.next = { at: shot.rest, lie: shot.surface };
  if (shot.surface === 'water') {
    shot.penalty = 1;
    shot.note = 'IN THE WATER. ONE SHOT PENALTY';
    const drop = waterDrop(state.hole, shot.rest, p.at);
    shot.next = { at: drop, lie: surfaceAt(state.hole, drop) };
  } else if (outOfBounds(shot.rest)) {
    shot.penalty = 1;
    shot.note = 'OUT OF BOUNDS. STROKE AND DISTANCE';
    shot.next = { at: { ...p.at }, lie: p.lie };
  } else if (shot.holed) {
    shot.note = 'HOLED IT!';
  } else if (shot.surface === 'green') {
    shot.note = 'ON THE GREEN';
  } else if (shot.mishit) {
    shot.note = 'MISHIT!';
  }
  return shot;
}

// Move the ball to where the shot finished and count the strokes.
export function settle(state, shot) {
  const p = current(state);
  p.strokes += 1 + shot.penalty;
  p.at = shot.next.at;
  p.lie = shot.next.lie;
  p.holed = shot.holed;
  p.onGreen = p.lie === 'green';
}

// Count a putt and move the ball to where it stopped (it may run off the green;
// into water, it costs a shot and is played again).
export function settlePutt(state, roll) {
  const me = current(state);
  me.strokes += 1;
  if (!roll.holed && surfaceAt(state.hole, roll.rest) === 'water') {
    me.strokes += 1;
    me.putts += 1;
    return;
  }
  me.putts += 1;
  me.at = roll.rest;
  me.holed = roll.holed;
  me.lie = roll.holed ? 'green' : surfaceAt(state.hole, roll.rest);
  me.onGreen = me.lie === 'green';
}

// A round's scores for each golfer, hole by hole (null until played).
export const newRound = (course, key, golfers) => ({
  key, pars: course.holes.map((h) => h.par),
  players: golfers.map((g) => ({ name: g.name, shirt: g.shirt, scores: Array(18).fill(null), putts: Array(18).fill(null) })),
});

// Score against par so far, and how many holes that covers.
export function standing(round, i) {
  const done = round.players[i].scores.map((sc, h) => (sc == null ? null : sc - round.pars[h])).filter((d) => d != null);
  return { toPar: done.reduce((t, d) => t + d, 0), holes: done.length };
}

// Match play between the first two golfers over a round of `holes`: each hole
// goes to the lower score. `lead` is holes up for the first golfer (negative if
// down); the match is over once one side is up by more than there are holes left.
export function matchPlay(round, holes) {
  const [a, b] = round.players;
  let lead = 0, played = 0;
  for (let h = 0; h < holes; h++) {
    if (a.scores[h] == null || b.scores[h] == null) continue;
    played += 1;
    lead += Math.sign(b.scores[h] - a.scores[h]);
  }
  const left = holes - played;
  return { lead, played, left, over: left === 0 || Math.abs(lead) > left };
}

// How the match stands in words, e.g. 'DAVE 2 UP', 'ALL SQUARE', 'VINCE WINS 3&2'.
export function matchWords(m, names) {
  const leader = names[m.lead > 0 ? 0 : 1], up = Math.abs(m.lead);
  if (m.over) return m.lead === 0 ? 'MATCH HALVED' : `${leader} WINS ${m.left ? `${up}&${m.left}` : `${up} UP`}`;
  if (m.lead === 0) return 'ALL SQUARE';
  return `${leader} ${up} UP${up === m.left ? ', DORMIE' : ''}`;
}

// Golf's order of play: whoever is furthest from the hole goes next. On the tee,
// everyone is level, so the order the golfers were listed in decides.
export function nextTurn(state) {
  let best = -1, far = -1;
  state.players.forEach((p, i) => {
    if (p.holed) return;
    const d = dist(p.at, state.hole.pin);
    if (d > far + 0.01) { far = d; best = i; }
  });
  return best;
}

export const allHoled = (state) => state.players.every((p) => p.holed);

// A golfer who reaches this many strokes picks up and takes it as their score.
export const PICK_UP = 10;
export function pickUp(state) {
  const me = current(state);
  me.strokes = PICK_UP;
  me.holed = true;
}
