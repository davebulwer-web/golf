// A career: your golfer, money, skills and where you are in the season, kept
// between visits in the browser's storage. You start at a small club, playing
// nine holes at a time on short courses.

import { RIVAL } from './golfers.js';
import { COURSE_LIST } from './course-list.js';

const SAVE_KEY = 'pixel-golf.career';
export const WEEKS = 12; // weeks in a season

// The looks you can start as, with a name for each and how they tilt the
// starting skills (all start as a club hacker, around 45).
export const LOOKS = [
  { look: 'club', name: 'ALL-ROUNDER', tilt: {} },
  { look: 'heavy', name: 'BIG HITTER', tilt: { power: 8, accuracy: -4, shortGame: -2 } },
  { look: 'athletic', name: 'ATHLETE', tilt: { power: 4, recovery: 4, putting: -4 } },
  { look: 'casual', name: 'WEEKENDER', tilt: { shortGame: 6, power: -4 } },
  { look: 'tall', name: 'BEANPOLE', tilt: { power: 6, shortGame: -4, putting: -2 } },
  { look: 'veteran', name: 'OLD HAND', tilt: { accuracy: 4, putting: 6, power: -8 } },
];
export const SHIRT_COLOURS = ['#d03a2a', '#2f6fd6', '#2f9a4a', '#e0a020', '#8a4ad0', '#e8e8f0'];
// The old hand keeps his own beige jumper (his sprites can't be recoloured).
export const VETERAN_SHIRT = '#c8b48a';
export const SKILL_NAMES = { power: 'POWER', accuracy: 'ACCURACY', shortGame: 'SHORT GAME', recovery: 'RECOVERY', putting: 'PUTTING' };

const BASE_SKILLS = { power: 45, accuracy: 45, shortGame: 45, recovery: 42, putting: 45 };
export function startingSkills(look) {
  const tilt = LOOKS.find((l) => l.look === look)?.tilt ?? {};
  return Object.fromEntries(Object.entries(BASE_SKILLS).map(([k, v]) => [k, v + (tilt[k] ?? 0)]));
}

// How hard a course is, as 1 to 5 stars, from its rating (shots over par per
// nine holes for a club golfer; see tools/curate-courses.mjs).
export const courseStars = (rating) => Math.max(1, Math.min(5, Math.round(1 + (rating + 2) / 1.75)));

export function newCareer({ name, look, shirt }, rand = Math.random) {
  const club = COURSE_LIST.club.slice();
  const styles = new Set();
  // A random course, of a style not picked yet if there is one.
  const take = () => {
    const fresh = club.filter((x) => !styles.has(x.style));
    const pool = fresh.length ? fresh : club;
    const c = pool[Math.floor(rand() * pool.length)];
    club.splice(club.indexOf(c), 1);
    styles.add(c.style);
    return c;
  };
  const home = take();
  return {
    version: 1, name, look, shirt: look === 'veteran' ? VETERAN_SHIRT : shirt, tier: 'club', season: 1, week: 1, money: 100,
    skills: startingSkills(look),
    // Your home club's course, and two other club courses you can play away.
    home, away: [take(), take()],
    round: null,   // a round in progress: { course, hole: next hole to play, scores, putts }
    history: [],   // rounds played, newest first
  };
}

// The courses you can play a round on: home first, then the away courses.
export const clubCourses = (c) => [c.home, ...(c.away ?? [])];

// Your golfer for a round, from the career.
export const careerGolfer = (c) => ({ name: c.name, look: c.look, shirt: c.shirt, skills: { ...c.skills } });

// Who you play a practice round with: Bertie, at club level.
export const clubOpponent = () => ({ ...RIVAL, skills: { power: 50, accuracy: 46, shortGame: 47, recovery: 45, putting: 46 } });

// ---------- The club's members ----------
// The same faces every season. `nerve` is how much risk they take (0 to 1);
// `rival` keeps pace with you, a couple of points ahead in every skill.
export const MEMBERS = [
  { id: 'bertie', name: 'Bertie', look: 'heavy', shirt: '#2f6fd6', nerve: 0.5, about: 'CLUB STALWART. NEVER MISSES A MONDAY.',
    skills: { power: 50, accuracy: 46, shortGame: 47, recovery: 45, putting: 46 } },
  { id: 'larry', name: 'Long Larry', look: 'tall', shirt: '#e0a020', nerve: 0.8, about: 'HITS IT A MILE. NOT ALWAYS STRAIGHT.',
    skills: { power: 62, accuracy: 38, shortGame: 40, recovery: 46, putting: 42 } },
  { id: 'major', name: 'The Major', look: 'veteran', shirt: null, nerve: 0.2, about: 'SHORT, STRAIGHT AND A DEADLY PUTTER.',
    skills: { power: 36, accuracy: 54, shortGame: 50, recovery: 44, putting: 58 } },
  { id: 'sal', name: 'Swift Sal', look: 'athletic', shirt: '#2f9a4a', nerve: 0.6, about: 'CLUB CHAMPION TWO YEARS RUNNING.',
    skills: { power: 52, accuracy: 52, shortGame: 50, recovery: 50, putting: 48 } },
  { id: 'chip', name: 'Chippy Pete', look: 'casual', shirt: '#e8e8f0', nerve: 0.4, about: 'MISSES GREENS, THEN CHIPS IN.',
    skills: { power: 40, accuracy: 42, shortGame: 60, recovery: 52, putting: 50 } },
  { id: 'vince', name: 'Vince Vallance', look: 'club', shirt: '#8a4ad0', nerve: 0.7, rival: true, about: 'YOUR RIVAL. ALWAYS ONE STEP AHEAD.',
    skills: { power: 47, accuracy: 47, shortGame: 47, recovery: 44, putting: 47 } },
];
export const STAKES = [10, 25, 50];

// A member as a golfer for a round. The rival matches your skills, plus two.
export function memberGolfer(c, id) {
  const m = MEMBERS.find((x) => x.id === id);
  const skills = { ...m.skills };
  if (m.rival) for (const k in skills) skills[k] = Math.max(skills[k], Math.round(c.skills[k]) + 2);
  return { name: m.name, look: m.look, shirt: m.shirt ?? VETERAN_SHIRT, ai: true, nerve: m.nerve, skills };
}

// Your matches against each member: { won, lost, halved }.
export const record = (c, id) => c.members?.[id] ?? { won: 0, lost: 0, halved: 0 };

// Record a finished round and move the week on. A money match (`result.match`,
// with `lead` from your side) pays out its stake and goes on your record.
export function finishRound(c, result) {
  const m = result.match;
  if (m) {
    const r = { ...record(c, m.member) };
    r[m.lead > 0 ? 'won' : m.lead < 0 ? 'lost' : 'halved'] += 1;
    c.members = { ...c.members, [m.member]: r };
    m.money = Math.sign(m.lead) * m.stake;
    c.money += m.money;
  }
  c.history.unshift({ season: c.season, week: c.week, ...result });
  c.history = c.history.slice(0, 40);
  c.round = null;
  c.week += 1;
  if (c.week > WEEKS) { c.week = 1; c.season += 1; }
}

// ---------- Practice ----------
// One practice session a week (the week's midweek slot); it's free.

const weekKey = (c) => `${c.season}:${c.week}`;
export const canPractise = (c) => c.practised !== weekKey(c);

// Note a practice session: the skill goes up by `gain`, and it goes in the history.
export function recordPractice(c, { name, skill, hits, balls, gain }) {
  c.skills[skill] = Math.min(99, Math.round((c.skills[skill] + gain) * 10) / 10);
  c.practised = weekKey(c);
  c.history.unshift({ season: c.season, week: c.week, practice: { name, skill, hits, balls, gain } });
  c.history = c.history.slice(0, 40);
}

// ---------- Saving ----------
// Storage can be missing or refuse (private windows, sandboxed pages): then the
// career just lasts until the page is closed.

// Careers saved before the curated courses had a made-up home course: move them
// to a club course, finishing any round in progress where it was started.
function upgrade(c) {
  if (c.round && !c.round.course) c.round.course = c.home;
  if (!c.home.id) {
    const club = COURSE_LIST.club;
    c.home = club[0];
    c.away = [club[1], club[2]];
  }
  return c;
}

export function saveCareer(c) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(c)); return true; } catch { return false; }
}

export function loadCareer() {
  try {
    const c = JSON.parse(localStorage.getItem(SAVE_KEY));
    return c?.version === 1 ? upgrade(c) : null;
  } catch { return null; }
}
