// Stroke-play events: a field of golfers, a leaderboard and prize money, and
// the season around them: an order of merit and promotion at the end.
// You play your round shot by shot with one playing partner drawn on the
// course; everyone else's scores are worked out from their skills up front,
// hole by hole, and shown as you reach each hole, so a big field costs nothing.

import { makeRng } from './course-generator.js';
import { MEMBERS, memberGolfer, WEEKS, VETERAN_SHIRT } from './career.js';
import { COURSE_LIST } from './course-list.js';

// What's on each weekend, tier by tier. Every week has an event you can enter
// or skip; the last week has the tier's big one, which counts double on the
// order of merit and can win you promotion on its own.
export const EVENTS = {
  rollup: { kind: 'rollup', name: 'SATURDAY ROLL-UP', holes: 9, fee: 2, prizes: [12, 6, 3] },
  medal: { kind: 'medal', name: 'MONTHLY MEDAL', holes: 9, fee: 5, prizes: [40, 20, 10] },
  championship: { kind: 'championship', name: 'CLUB CHAMPIONSHIP', holes: 18, fee: 10, prizes: [100, 50, 25], title: 'CLUB CHAMPION', big: true },
  open: { kind: 'open', name: 'OPEN', holes: 18, fee: 20, prizes: [150, 80, 40] },
  county: { kind: 'county', name: 'COUNTY CHAMPIONSHIP', holes: 18, fee: 30, prizes: [400, 200, 100], title: 'COUNTY CHAMPION', big: true },
};
// The tiers you can play so far, and where winning one takes you.
export const NEXT_TIER = { club: 'county', county: 'challenge' };
export const PLAYABLE_TIERS = ['club', 'county'];

// Where a county event is played: a different county course each week, the
// hardest for the championship.
const countyVenue = (week) => (week === WEEKS ? COURSE_LIST.county.at(-1) : COURSE_LIST.county[(week - 1) % (COURSE_LIST.county.length - 1)]);
const placeName = (course) => course.name.replace(/ GOLF.*$/, '');

// The weekend event in a week: what it is and where (`venue`, a course).
export function eventFor(c, week = c.week) {
  if (c.tier === 'county') {
    const venue = countyVenue(week);
    return week === WEEKS ? { ...EVENTS.county, week, venue } : { ...EVENTS.open, name: `${placeName(venue)} OPEN`, week, venue };
  }
  const kind = week === WEEKS ? 'championship' : week % 3 === 0 ? 'medal' : 'rollup';
  return { ...EVENTS[kind], week, venue: c.home };
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

// The county's best amateurs. Your rival moves up with you and joins them.
const COUNTY = [
  { id: 'lofty', name: 'Lofty Lewis', look: 'tall', shirt: '#2f6fd6', nerve: 0.7, skills: { power: 66, accuracy: 50, shortGame: 50, recovery: 52, putting: 52 } },
  { id: 'sandy', name: 'Sandy Banks', look: 'casual', shirt: '#e0a020', nerve: 0.4, skills: { power: 50, accuracy: 54, shortGame: 60, recovery: 62, putting: 54 } },
  { id: 'rory', name: 'Rory Rough', look: 'athletic', shirt: '#d03a2a', nerve: 0.8, skills: { power: 60, accuracy: 48, shortGame: 54, recovery: 60, putting: 50 } },
  { id: 'max', name: 'Max Yardage', look: 'heavy', shirt: '#8a4ad0', nerve: 0.6, skills: { power: 68, accuracy: 50, shortGame: 48, recovery: 50, putting: 50 } },
  { id: 'penny', name: 'Penny Pitchmark', look: 'club', shirt: '#2f9a4a', nerve: 0.3, skills: { power: 48, accuracy: 60, shortGame: 58, recovery: 52, putting: 60 } },
  { id: 'barry', name: 'Barry Bunker', look: 'heavy', shirt: '#e8e8f0', nerve: 0.5, skills: { power: 54, accuracy: 50, shortGame: 58, recovery: 58, putting: 50 } },
  { id: 'ivy', name: 'Ivy Irons', look: 'athletic', shirt: '#e8e8f0', nerve: 0.4, skills: { power: 52, accuracy: 64, shortGame: 54, recovery: 50, putting: 54 } },
  { id: 'cleek', name: 'Colonel Cleek', look: 'veteran', shirt: null, nerve: 0.2, skills: { power: 44, accuracy: 60, shortGame: 58, recovery: 50, putting: 64 } },
  { id: 'ron', name: 'Big Ron Rollins', look: 'heavy', shirt: '#d03a2a', nerve: 0.9, skills: { power: 70, accuracy: 44, shortGame: 46, recovery: 54, putting: 48 } },
  { id: 'fran', name: 'Fairway Fran', look: 'club', shirt: '#e0a020', nerve: 0.3, skills: { power: 50, accuracy: 62, shortGame: 52, recovery: 48, putting: 56 } },
  { id: 'kenny', name: 'Kenny Kickback', look: 'casual', shirt: '#2f6fd6', nerve: 0.6, skills: { power: 54, accuracy: 52, shortGame: 62, recovery: 54, putting: 58 } },
  { id: 'hattie', name: 'Hattie Hazard', look: 'tall', shirt: '#2f9a4a', nerve: 0.7, skills: { power: 58, accuracy: 54, shortGame: 54, recovery: 56, putting: 56 } },
];

// Everyone who plays a tier's events (but you), as golfers. Club members and
// county players have a look so they can be drawn as your playing partner;
// the club regulars only ever appear on the leaderboard.
export function fieldFor(c, tier = c.tier) {
  const vince = { id: 'vince', ...memberGolfer(c, 'vince') };
  if (tier === 'county') return [...COUNTY.map((g) => ({ ...g, shirt: g.shirt ?? VETERAN_SHIRT })), vince];
  return [...MEMBERS.map((m) => ({ id: m.id, ...memberGolfer(c, m.id) })), ...REGULARS];
}
// One of them as a golfer to play alongside.
export function fieldGolfer(c, id) {
  const g = [...fieldFor(c, 'club'), ...fieldFor(c, 'county')].find((x) => x.id === id);
  return { name: g.name, look: g.look, shirt: g.shirt, ai: true, nerve: g.nerve, skills: g.skills };
}
const nameOf = (c, id) => (id === 'you' ? c.name : [...fieldFor(c, 'club'), ...fieldFor(c, 'county')].find((x) => x.id === id)?.name ?? id);

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

// Set up an event: your playing partner (drawn from those who can be drawn)
// and the rest of the field's scores. `pars` are the holes' pars, `seed`
// makes it repeatable.
export function newEvent(c, ev, course, pars, seed) {
  const r = makeRng(seed), all = fieldFor(c);
  const drawable = all.filter((g) => g.look);
  const partner = drawable[r.int(0, drawable.length - 1)].id;
  const field = all.filter((g) => g.id !== partner)
    .map((g) => ({ id: g.id, name: g.name, scores: simScores(r, g, pars.slice(0, ev.holes), course.rating) }));
  return { ...ev, partner, field };
}

// An event you skipped: everyone's round worked out, best first.
export function skippedEvent(c, ev, pars, seed) {
  const r = makeRng(seed), holes = pars.slice(0, ev.holes), par = holes.reduce((t, v) => t + v, 0);
  const rows = fieldFor(c).map((g) => ({ id: g.id, name: g.name, scores: simScores(r, g, holes, ev.venue.rating) }))
    .map((p) => ({ ...p, total: p.scores.reduce((t, v) => t + v, 0), toPar: 0, tie: r.next() }));
  rows.forEach((p) => { p.toPar = p.total - par; });
  rows.sort((a, b) => a.total - b.total || a.tie - b.tie);
  rows.forEach((p, i) => { p.pos = i + 1; });
  return rows;
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

// ---------- The season ----------

// Order of merit points by finishing position; the big event counts double.
const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
export function addMerit(c, ev, rows) {
  c.merit ??= {};
  for (const p of rows) {
    const pts = (POINTS[p.pos - 1] ?? 0) * (ev.big ? 2 : 1);
    if (pts) c.merit[p.you ? 'you' : p.id] = (c.merit[p.you ? 'you' : p.id] ?? 0) + pts;
  }
}

// The order of merit: everyone in the tier, most points first (you ahead on a tie).
export function meritTable(c) {
  const ids = ['you', ...fieldFor(c).map((g) => g.id)];
  const rows = ids.map((id) => ({ id, name: nameOf(c, id), pts: c.merit?.[id] ?? 0, you: id === 'you' }));
  rows.sort((a, b) => b.pts - a.pts || (b.you ? 1 : 0) - (a.you ? 1 : 0));
  rows.forEach((p, i) => { p.pos = i + 1; });
  return rows;
}
export const PROMOTED = 3; // the top of the order of merit go up

// The weekend's over: on to next week. After the last week the season ends:
// the top of the order of merit, or the winner of the big event, moves up a
// tier (your rival comes too), and a new season starts. What happened is kept
// in `c.lastSeason` for the clubhouse to show.
export function endWeek(c) {
  c.week += 1;
  c.midweek = null;
  if (c.week <= WEEKS) return;
  const table = meritTable(c), pos = table.find((p) => p.you).pos;
  const big = eventFor({ ...c, week: WEEKS }, WEEKS);
  const champion = (c.titles ?? []).some((t) => t.season === c.season && t.title === big.title);
  const up = NEXT_TIER[c.tier], earned = !!up && (pos <= PROMOTED || champion);
  const promoted = earned && PLAYABLE_TIERS.includes(up);
  c.lastSeason = { season: c.season, tier: c.tier, pos, of: table.length, champion, earned, promoted, to: up, table: table.map(({ name, pts, pos: n, you }) => ({ name, pts, pos: n, you })), seen: false };
  if (promoted) c.tier = up;
  c.season += 1;
  c.week = 1;
  c.merit = {};
}
