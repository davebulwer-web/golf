// Stroke-play events: a field of club golfers, a leaderboard and prize money.
// You play your round shot by shot with one playing partner drawn on the
// course; everyone else's scores are worked out from their skills up front,
// hole by hole, and shown as you reach each hole, so a big field costs nothing.

import { makeRng } from './course-generator.js';
import { MEMBERS, memberGolfer } from './career.js';

// What's on at the club, by week of the season.
export const CLUB_EVENTS = {
  medal: { kind: 'medal', name: 'MONTHLY MEDAL', holes: 9, fee: 5, prizes: [40, 20, 10] },
  championship: { kind: 'championship', name: 'CLUB CHAMPIONSHIP', holes: 18, fee: 10, prizes: [100, 50, 25], title: 'CLUB CHAMPION' },
};
const SCHEDULE = { 3: 'medal', 6: 'medal', 9: 'medal', 12: 'championship' };

// The event in a week (or null), and the next one from a week on.
export const eventFor = (week) => (SCHEDULE[week] ? { ...CLUB_EVENTS[SCHEDULE[week]], week } : null);
export function nextEvent(week) {
  const w = Object.keys(SCHEDULE).map(Number).find((x) => x >= week);
  return w ? eventFor(w) : null;
}

// The rest of the club: they turn up to events but don't play money matches.
const REGULARS = [
  { id: 'hank', name: 'Hacker Hank', nerve: 0.8, skills: { power: 48, accuracy: 36, shortGame: 38, recovery: 44, putting: 40 } },
  { id: 'polly', name: 'Polly Putts', nerve: 0.3, skills: { power: 36, accuracy: 44, shortGame: 46, recovery: 40, putting: 56 } },
  { id: 'crumb', name: 'Captain Crumb', nerve: 0.4, skills: { power: 42, accuracy: 46, shortGame: 44, recovery: 42, putting: 44 } },
  { id: 'wendy', name: 'Wobbly Wendy', nerve: 0.6, skills: { power: 40, accuracy: 40, shortGame: 42, recovery: 38, putting: 42 } },
  { id: 'nigel', name: 'Nigel Niblick', nerve: 0.5, skills: { power: 44, accuracy: 48, shortGame: 50, recovery: 46, putting: 46 } },
  { id: 'doris', name: 'Doris Divot', nerve: 0.2, skills: { power: 34, accuracy: 50, shortGame: 48, recovery: 42, putting: 50 } },
];

// How many shots over par per hole a golfer averages, from the course's rating
// (shots over par per nine for a skill-50 golfer; see tools/curate-courses.mjs)
// and their skills: each skill point is worth about a sixth of a shot per nine
// (measured by playing the computer golfer at skills 35, 50 and 65).
const PER_POINT = 1 / 6;
function holeMean(rating, skills) {
  const avg = Object.values(skills).reduce((t, v) => t + v, 0) / 5;
  return (rating + PER_POINT * (50 - avg)) / 9;
}

const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r.next())) * Math.cos(2 * Math.PI * r.next());

// One golfer's scores on the holes (pars), worked out from their skills. Bold
// golfers have more birdies and more blow-ups.
function simScores(r, golfer, pars, rating) {
  const mean = holeMean(rating, golfer.skills), sd = 0.6 + 0.4 * (golfer.nerve ?? 0.5);
  return pars.map((par) => Math.max(par - 2, Math.min(par + 4, par + Math.round(mean + gauss(r) * sd))));
}

// Set up an event: your playing partner (one of the members, drawn) and the
// rest of the field's scores. `pars` are the holes' pars, `seed` makes it repeatable.
export function newEvent(c, ev, course, pars, seed) {
  const r = makeRng(seed);
  const partner = MEMBERS[r.int(0, MEMBERS.length - 1)].id;
  const field = [...MEMBERS.map((m) => ({ id: m.id, ...memberGolfer(c, m.id) })), ...REGULARS]
    .filter((g) => g.id !== partner)
    .map((g) => ({ id: g.id, name: g.name, scores: simScores(r, g, pars.slice(0, ev.holes), course.rating) }));
  return { ...ev, partner, field };
}

// The leaderboard after `thru` holes: everyone's total and score to par, best
// first, ties split on the last three holes then the last one (countback).
// `you` and `partner` are your group's scores.
export function leaderboard(ev, pars, thru, you, partner) {
  const sum = (a, from, to) => a.slice(from, to).reduce((t, v) => t + (v ?? 0), 0);
  const par = sum(pars, 0, thru);
  const rows = [
    { id: 'you', name: you.name, scores: you.scores, you: true },
    { id: ev.partner, name: partner.name, scores: partner.scores },
    ...ev.field,
  ].map((p) => ({ ...p, total: sum(p.scores, 0, thru), last3: sum(p.scores, Math.max(0, thru - 3), thru), last: p.scores[thru - 1] ?? 0 }));
  rows.forEach((p) => { p.toPar = p.total - par; });
  rows.sort((a, b) => a.total - b.total || a.last3 - b.last3 || a.last - b.last || (b.you ? 1 : 0) - (a.you ? 1 : 0));
  rows.forEach((p, i) => { p.pos = i + 1; });
  return rows;
}

// What a finishing position wins.
export const prizeFor = (ev, pos) => ev.prizes[pos - 1] ?? 0;
