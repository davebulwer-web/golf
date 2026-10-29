// Stroke-play events: a field of golfers, a leaderboard and prize money, and
// the season around them: an order of merit and promotion at the end.
// You play your round shot by shot with one playing partner drawn on the
// course; everyone else's scores are worked out from their skills up front,
// hole by hole, and shown as you reach each hole, so a big field costs nothing.
// Tour events run over several rounds, one a day, with a cut halfway: only the
// top of the field plays the weekend.

import { makeRng } from './course-generator.js';
import { MEMBERS, memberGolfer, WEEKS, VETERAN_SHIRT, clubCourses, playingSkills } from './career.js';
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
  challenge: { kind: 'challenge', name: 'CHALLENGE', holes: 18, rounds: 3, cut: 12, fee: 50,
    prizes: [1000, 600, 400, 300, 250, 200, 160, 130, 110, 100] },
  final: { kind: 'final', name: 'CHALLENGE TOUR FINAL', holes: 18, rounds: 4, cut: 12, fee: 80, title: 'CHALLENGE TOUR CHAMPION', big: true,
    prizes: [3000, 1800, 1200, 900, 700, 600, 500, 400, 350, 300] },
  tour: { kind: 'tour', name: 'CLASSIC', holes: 18, rounds: 4, cut: 16, fee: 200,
    prizes: [10000, 6000, 4000, 3000, 2400, 2000, 1700, 1500, 1300, 1100, 1000, 900, 800, 700, 600] },
  tourChamp: { kind: 'tourChamp', name: 'TOUR CHAMPIONSHIP', holes: 18, rounds: 4, cut: 16, fee: 300, title: 'TOUR CHAMPION', big: true,
    prizes: [30000, 16000, 10000, 7000, 5500, 4500, 3800, 3200, 2800, 2400, 2100, 1900, 1700, 1500, 1300] },
};
// The four majors, one a quarter at the top level, on the majors' own courses.
// Between them the best players keep playing the tour's classics.
export const MAJORS = [
  { kind: 'major', name: 'THE AZALEA INVITATIONAL', short: 'AZALEA' },
  { kind: 'major', name: 'THE NATIONAL OPEN', short: 'NATIONAL OPEN' },
  { kind: 'major', name: 'THE LINKS CHAMPIONSHIP', short: 'LINKS' },
  { kind: 'major', name: 'THE PLAYERS CROWN', short: 'PLAYERS CROWN' },
].map((m) => ({ ...m, holes: 18, rounds: 4, cut: 16, fee: 500, big: true, major: true, title: `${m.short} CHAMPION`,
  prizes: [50000, 28000, 18000, 13000, 10000, 8500, 7300, 6200, 5300, 4600, 4000, 3500, 3100, 2700, 2400] }));
// The tiers, and where winning one takes you; the majors are the top.
export const NEXT_TIER = { club: 'county', county: 'challenge', challenge: 'tour', tour: 'majors' };
export const PLAYABLE_TIERS = ['club', 'county', 'challenge', 'tour', 'majors'];
// How much tournament dressing a tier's events get (see tournamentSites):
// county banners and flags, stands at the closing holes on the challenge tour,
// everything, TV and all, on the main tour, and the presentation stage too
// at a major.
export const DRESSING = { club: 0, county: 1, challenge: 2, tour: 3, majors: 4 };
const TIER_OF = { rollup: 'club', medal: 'club', championship: 'club', open: 'county', county: 'county', challenge: 'challenge', final: 'challenge', tour: 'tour', tourChamp: 'tour', major: 'majors' };
export const eventTier = (ev) => TIER_OF[ev.kind] ?? 'club';

// Where a county or tour event is played: a different course of the tier each
// week, the hardest for the big one at the end.
const venueFor = (tier, week) => {
  const list = COURSE_LIST[tier];
  return week === WEEKS ? list.at(-1) : list[(week - 1) % (list.length - 1)];
};
const placeName = (course) => course.name.replace(/ (GOLF|NATIONAL).*$/, '');
const WEEKLY = { county: ['open', 'county', 'OPEN'], challenge: ['challenge', 'final', 'CHALLENGE'], tour: ['tour', 'tourChamp', 'CLASSIC'] };

// The weekend event in a week: what it is and where (`venue`, a course).
export const MAJOR_WEEKS = [3, 6, 9, 12];
export function eventFor(c, week = c.week) {
  if (c.tier === 'majors') {
    const m = MAJOR_WEEKS.indexOf(week);
    if (m >= 0) return { ...MAJORS[m], week, venue: COURSE_LIST.majors[m] };
    const venue = venueFor('tour', week);
    return { ...EVENTS.tour, name: `${placeName(venue)} CLASSIC`, week, venue };
  }
  if (WEEKLY[c.tier]) {
    const [weekly, big, word] = WEEKLY[c.tier], venue = venueFor(c.tier, week);
    return week === WEEKS ? { ...EVENTS[big], week, venue } : { ...EVENTS[weekly], name: `${placeName(venue)} ${word}`, week, venue };
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

// The tours: young pros on the challenge tour, the best in the game on the
// main tour. Their skills are worked out from their names, around the tour's
// standard, each with a strength; they wear the sharper looks and tour colours.
const CHALLENGE_NAMES = ['Benny Backspin', 'Lars Lagputt', 'Tommy Twoputt', 'Gus Gimme', 'Dot Dogleg', 'Archie Albatross', 'Wes Waggle',
  'Mo Mulligan', 'Freddie Flagstick', 'Lulu Lipout', 'Ricky Range', 'Skip Shankley', 'Kiki Carry', 'Bobby Bounce', 'Holly Hosel',
  'Percy Pinhigh', 'Tess Topspin', 'Dicky Draw', 'Fiona Fade', 'Zak Zinger'];
const TOUR_NAMES = ['Duke Driveway', 'Ace Archer', 'Sunny Sweetspot', 'Brooks Birdie', 'Ollie Overlap', 'Grace Greenside', 'Hank Hardpan',
  'Rex Redzone', 'Ingrid Inswing', 'Clint Clubface', 'Pip Pinseeker', 'Monty Mallet', 'Jet Jansen', 'Nico Niblett', 'Bea Bogeyfree',
  'Cal Cartpath', 'Rio Rollout', 'Stella Stinger', 'Hugo Hangtime', 'Dale Downhill', 'Mika Mashie', 'Lance Loft', 'Ruby Reload',
  'Frankie Flop', 'Wally Wedgeworth', 'Suzy Spin', 'Theo Tapin', 'Nina Nineiron', 'Gil Greenreader', 'Kingsley Crown'];
const PRO_LOOKS = ['athletic', 'tall', 'club'];
const PRO_SHIRTS = ['#1e2a5a', '#e8e8f0', '#d85a9a', '#2fb0a0', '#2a2a30', '#c8a040', '#d03a2a', '#2f6fd6'];
const SKILL_KEYS = ['power', 'accuracy', 'shortGame', 'recovery', 'putting'];
function pros(names, tier, level) {
  return names.map((name, i) => {
    const r = makeRng(9001 + i * 131 + level * 7), best = SKILL_KEYS[i % 5];
    // The last few names are the tour's stars, a little better than the rest.
    const star = Math.max(0, i - names.length + 5);
    const skills = Object.fromEntries(SKILL_KEYS.map((k) => [k, Math.round(level + star + (r.next() - 0.5) * 10 + (k === best ? 7 : 0))]));
    return { id: `${tier}-${i}`, name, look: PRO_LOOKS[i % 3], shirt: PRO_SHIRTS[(i * 3) % PRO_SHIRTS.length], nerve: Math.round((0.2 + r.next() * 0.7) * 10) / 10, skills };
  });
}
const CHALLENGE = pros(CHALLENGE_NAMES, 'challenge', 58);
const TOUR = pros(TOUR_NAMES, 'tour', 66);
// At the top the same faces, a few years on and a few points better.
const ELITE = pros(TOUR_NAMES, 'tour', 70);

// Your second rival turns up on the challenge tour, and like Vince keeps
// ahead of you, by a bit more.
function dexGolfer(c) {
  const skills = Object.fromEntries(SKILL_KEYS.map((k) => [k, Math.max(60, Math.round(c.skills[k]) + 3)]));
  return { id: 'dex', name: 'Dex Dashwood', look: 'athletic', shirt: '#2a2a30', ai: true, nerve: 0.8, rival: true, skills };
}

// Everyone who plays a tier's events (but you), as golfers. Club members and
// county players have a look so they can be drawn as your playing partner;
// the club regulars only ever appear on the leaderboard.
export function fieldFor(c, tier = c.tier) {
  const vince = { id: 'vince', ...memberGolfer(c, 'vince') };
  if (tier === 'county') return [...COUNTY.map((g) => ({ ...g, shirt: g.shirt ?? VETERAN_SHIRT })), vince];
  if (tier === 'challenge') return [...CHALLENGE, vince, dexGolfer(c)];
  if (tier === 'tour') return [...TOUR, vince, dexGolfer(c)];
  if (tier === 'majors') return [...ELITE, vince, dexGolfer(c)];
  return [...MEMBERS.map((m) => ({ id: m.id, ...memberGolfer(c, m.id) })), ...REGULARS];
}
// One of them as a golfer to play alongside.
export function fieldGolfer(c, id) {
  const g = everyone(c).find((x) => x.id === id);
  return { name: g.name, look: g.look, shirt: g.shirt, ai: true, nerve: g.nerve, skills: g.skills };
}
const everyone = (c) => ['club', 'county', 'challenge', c.tier === 'majors' ? 'majors' : 'tour'].flatMap((t) => fieldFor(c, t));
const nameOf = (c, id) => (id === 'you' ? c.name : everyone(c).find((x) => x.id === id)?.name ?? id);

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

const sumOf = (a, from = 0, to = a.length) => a.slice(from, to).reduce((t, v) => t + (v ?? 0), 0);

// Set up an event: everyone else's scores for every round, worked out up
// front, and your playing partner for the first round (drawn from those who
// can be drawn). `pars` are the holes' pars, `seed` makes it repeatable.
// `round` is the round being played (from 0) and `mine` your finished rounds.
export function newEvent(c, ev, course, pars, seed) {
  const r = makeRng(seed), rounds = ev.rounds ?? 1, holes = pars.slice(0, ev.holes);
  const field = fieldFor(c).map((g) => ({ id: g.id, name: g.name, drawable: !!g.look,
    rounds: Array.from({ length: rounds }, () => simScores(r, g, holes, course.rating)) }));
  const out = { ...ev, rounds, round: 0, mine: [], field, seed };
  out.partner = drawPartner(out);
  return out;
}

// Who you play with this round: one of those still in it.
function drawPartner(ev) {
  const r = makeRng(ev.seed + 977 * (ev.round + 1)), pool = ev.field.filter((p) => p.drawable && !p.cut);
  return pool[r.int(0, pool.length - 1)].id;
}

// Your round worked out instead of played, from your skills.
export function simRound(ev, golfer, pars) {
  return simScores(makeRng(ev.seed + 31 * (ev.round + 1) + 7), golfer, pars.slice(0, ev.holes), ev.venue.rating);
}

// Events saved before tours had one round, with the partner kept out of the field.
function rounds(p) { return p.rounds ?? [p.scores]; }

// The leaderboard after `thru` holes of the round being played: everyone still
// in it, their total and score to par over the rounds so far, best first, ties
// split on the last three holes then the last one (countback). `you` and
// `partner` are your group's scores this round.
export function leaderboard(ev, pars, thru, you, partner) {
  const R = ev.round ?? 0, P = sumOf(pars, 0, ev.holes);
  const prior = (rs) => rs.slice(0, R).reduce((t, x) => t + sumOf(x), 0);
  const field = ev.field.filter((p) => !p.cut);
  const rows = [
    { id: 'you', name: you.name, prior: (ev.mine ?? []).reduce((t, x) => t + sumOf(x), 0), cur: you.scores, you: true },
    ...(ev.field.some((p) => p.id === ev.partner) ? [] : [{ id: ev.partner, name: partner.name, prior: 0, cur: partner.scores }]),
    ...field.map((p) => ({ id: p.id, name: p.name, prior: prior(rounds(p)), cur: p.id === ev.partner ? partner.scores : rounds(p)[R] })),
  ].map((p) => ({ ...p, total: p.prior + sumOf(p.cur, 0, thru), last3: sumOf(p.cur, Math.max(0, thru - 3), thru), last: p.cur[thru - 1] ?? 0 }));
  const par = R * P + sumOf(pars, 0, thru);
  rows.forEach((p) => { p.toPar = p.total - par; });
  rows.sort((a, b) => a.total - b.total || a.last3 - b.last3 || a.last - b.last || (b.you ? 1 : 0) - (a.you ? 1 : 0));
  rows.forEach((p, i) => { p.pos = i + 1; });
  return rows;
}

// Everyone's totals after `n` rounds (you too, if `mine` is given), best first.
function standingsAfter(ev, n, mine) {
  const row = (rs) => {
    const last = rs[n - 1] ?? [];
    return { total: rs.slice(0, n).reduce((t, x) => t + sumOf(x), 0), last: sumOf(last), last3: sumOf(last, Math.max(0, last.length - 3)), last1: last.at(-1) ?? 0 };
  };
  const rows = ev.field.filter((p) => !p.cut).map((p) => ({ id: p.id, name: p.name, ...row(rounds(p)) }));
  if (mine) rows.push({ id: 'you', name: mine.name, you: true, ...row(mine.rounds) });
  rows.sort((a, b) => a.total - b.total || a.last - b.last || a.last3 - b.last3 || a.last1 - b.last1 || (b.you ? 1 : 0) - (a.you ? 1 : 0));
  return rows;
}

// Halfway through a longer event, the cut: the top `ev.cut` and anyone tied
// with the last of them play on; the rest are marked `cut`. Returns whether you
// made it (when you're in it).
function makeCut(ev, mine) {
  const rows = standingsAfter(ev, 2, mine), line = rows[Math.min(ev.cut, rows.length) - 1].total;
  for (const p of ev.field) if (!p.cut && rows.find((x) => x.id === p.id).total > line) p.cut = true;
  ev.cutLine = line - 2 * ev.parTotal;
  return mine ? rows.find((x) => x.you).total <= line : true;
}

// A round of yours is in (`partnerScores` is your partner's, if they played it
// on the course with you). Moves the event on a round, making the cut when
// it's due, and says whether you have another round to play.
export function finishEventRound(ev, pars, name, myScores, partnerScores) {
  const holes = pars.slice(0, ev.holes);
  ev.parTotal = sumOf(holes);
  ev.mine = [...(ev.mine ?? []), myScores.slice(0, ev.holes)];
  if (!ev.rounds) { ev.rounds = 1; ev.round = 0; ev.field = ev.field.map((p) => ({ ...p, rounds: rounds(p) })); ev.field.push({ id: ev.partner, name: ev.partnerName ?? '', rounds: [] }); }
  const partner = ev.field.find((p) => p.id === ev.partner);
  if (partner && partnerScores) partner.rounds[ev.round] = partnerScores.slice(0, ev.holes);
  ev.round += 1;
  if (ev.cut && ev.rounds > 2 && ev.round === 2) {
    ev.cutMade = makeCut(ev, { name, rounds: ev.mine });
    if (!ev.cutMade) return false;
  }
  if (ev.round >= ev.rounds) return false;
  ev.partner = drawPartner(ev);
  return true;
}

// The final results: those who played all the rounds by total (countback on
// the last round), then those who missed the cut, with no position. You're in
// it unless `name` is null (an event you skipped).
export function finalBoard(ev, pars, name) {
  const P = sumOf(pars, 0, ev.holes), mine = name ? { name, rounds: ev.mine } : null;
  const made = standingsAfter(ev, ev.rounds, mine && ev.cutMade !== false ? mine : null);
  made.forEach((p, i) => { p.pos = i + 1; p.toPar = p.total - ev.rounds * P; });
  const missed = ev.field.filter((p) => p.cut).map((p) => ({ id: p.id, name: p.name, total: sumOf(p.rounds[0]) + sumOf(p.rounds[1]) }));
  if (mine && ev.cutMade === false) missed.push({ id: 'you', name, you: true, total: sumOf(ev.mine[0]) + sumOf(ev.mine[1]) });
  missed.sort((a, b) => a.total - b.total);
  missed.forEach((p) => { p.pos = null; p.mc = true; p.toPar = p.total - 2 * P; });
  return [...made, ...missed];
}

// An event you skipped: everyone's rounds worked out, cut and all.
export function skippedEvent(c, ev, pars, seed) {
  const out = newEvent(c, ev, ev.venue, pars, seed);
  out.parTotal = sumOf(pars, 0, ev.holes);
  if (out.cut && out.rounds > 2) makeCut(out, null);
  return finalBoard(out, pars, null);
}

// What a finishing position wins.
export const prizeFor = (ev, pos) => (pos ? ev.prizes[pos - 1] ?? 0 : 0);

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
  // At the top there's nowhere to go: the best of the year is player of the year.
  const best = !up && pos === 1;
  if (best) c.titles = [...(c.titles ?? []), { season: c.season, title: 'PLAYER OF THE YEAR' }];
  const rivals = table.filter((p) => RIVALS[p.id]).map((p) => ({ name: p.name, pos: p.pos }));
  c.lastSeason = { season: c.season, tier: c.tier, pos, of: table.length, champion, earned, promoted, best, to: up, rivals, table: table.map(({ name, pts, pos: n, you }) => ({ name, pts, pos: n, you })), seen: false };
  c.seasons = [...(c.seasons ?? []), { season: c.season, tier: c.tier, pos, promoted }];
  if (promoted) c.tier = up;
  c.season += 1;
  c.week = 1;
  c.merit = {};
}

// ---------- Rivals and the record ----------

// Your rivals: Vince from the start, Dex from the challenge tour.
export const RIVALS = { vince: 'VINCE', dex: 'DEX' };

// What an event's final board means for the rivalry: who finished ahead of
// whom (when you both played), and news when a rival wins one, above all one
// you missed. Returns the news lines.
export function eventStory(c, ev, rows) {
  const me = rows.find((r) => r.you), news = [];
  c.rivals ??= {};
  for (const id of Object.keys(RIVALS)) {
    const r = rows.find((x) => x.id === id);
    if (!r) continue;
    if (r.pos === 1) news.push(`${r.name.toUpperCase()} WON ${ev.name.startsWith('THE ') ? '' : 'THE '}${ev.name}${me ? '' : ' WITHOUT YOU THERE'}`);
    if (!me) continue;
    const h = (c.rivals[id] ??= { ahead: 0, behind: 0 });
    const place = (x) => x.pos ?? 999 + x.total; // a missed cut is behind anyone who made it
    if (place(me) < place(r)) h.ahead += 1; else h.behind += 1;
  }
  return news;
}

// Note a finished event of yours in the career record.
export function recordEvent(c, ev, comp) {
  const s = (c.stats ??= {});
  const add = (k, n = 1) => { s[k] = (s[k] ?? 0) + n; };
  add('events');
  if (comp.pos === 1) add('wins');
  if (comp.pos && comp.pos <= 3) add('top3');
  if (comp.mc) add('missed');
  add('prizeMoney', comp.prize);
  if (comp.pos === 1 && ev.major) add('majors');
}

// ---------- Midweek challenges ----------

// A one-off challenge for the week's midweek slot: nine holes on one of your
// courses, playing with Bertie as your marker, for a prize that grows with
// the tier. Beat a score, make some birdies, or keep a clean card.
const CHALLENGE_PRIZE = { club: 15, county: 40, challenge: 150, tour: 600, majors: 1500 };
const toParWords = (d) => (d === 0 ? 'LEVEL PAR' : d > 0 ? `${d} OVER` : `${-d} UNDER`);
export function challengeFor(c) {
  const r = makeRng(c.season * 1009 + c.week * 37 + 11);
  const courses = clubCourses(c), course = courses[r.int(0, courses.length - 1)];
  const where = course.id === c.home.id ? 'AT HOME' : `AT ${placeName(course)}`;
  const kind = ['break', 'birdies', 'clean'][r.int(0, 2)];
  const prize = CHALLENGE_PRIZE[c.tier] ?? 15;
  const ch = { kind, prize, where, course: { ...course, holes: 9 } };
  if (kind === 'break') {
    // A little better than you'd expect to manage there.
    ch.target = Math.round(holeMean(course.rating, playingSkills(c)) * 9 - 0.6);
    ch.text = `${toParWords(ch.target)} OR BETTER`;
  } else if (kind === 'birdies') {
    ch.target = { club: 1, county: 1, challenge: 2, tour: 2, majors: 3 }[c.tier] ?? 1;
    ch.text = ch.target === 1 ? 'MAKE A BIRDIE' : `MAKE ${ch.target} BIRDIES`;
  } else {
    ch.text = 'NO DOUBLE BOGEYS';
  }
  return ch;
}

// Whether a card (`scores` on `pars`) meets a challenge.
export function challengeMet(ch, scores, pars) {
  const holes = pars.slice(0, 9).map((par, i) => scores[i] - par);
  if (ch.kind === 'break') return holes.reduce((t, d) => t + d, 0) <= ch.target;
  if (ch.kind === 'birdies') return holes.filter((d) => d < 0).length >= ch.target;
  return holes.every((d) => d < 2);
}
