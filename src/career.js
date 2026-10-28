// A career: your golfer, money, skills and where you are in the season, kept
// between visits in the browser's storage. You start at a small club, playing
// nine holes at a time on short courses.

import { RIVAL } from './golfers.js';

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

// Small clubs to start at; one is picked for each new career.
const CLUB_NAMES = ['MUDFORD GOLF CLUB', 'PUDDLEBY GOLF CLUB', 'LITTLE WIGGLEY GOLF CLUB', 'BRAMBLE BOTTOM GOLF CLUB', 'NETHER SLOUCH GOLF CLUB'];
const HOME_STYLES = ['parkland', 'heathland'];

export function newCareer({ name, look, shirt }, rand = Math.random) {
  const pick = (list) => list[Math.floor(rand() * list.length)];
  return {
    version: 1, name, look, shirt: look === 'veteran' ? VETERAN_SHIRT : shirt, tier: 'club', season: 1, week: 1, money: 100,
    skills: startingSkills(look),
    // The home course: short, from the forward tees, nine holes a round.
    home: { name: pick(CLUB_NAMES), style: pick(HOME_STYLES), seed: Math.floor(rand() * 1e6), par: 70, length: 'forward', holes: 9 },
    round: null,   // a round in progress: { hole: next hole to play, scores, putts }
    history: [],   // rounds played, newest first
  };
}

// Your golfer for a round, from the career.
export const careerGolfer = (c) => ({ name: c.name, look: c.look, shirt: c.shirt, skills: { ...c.skills } });

// Who you play at the club, for now: Bertie, at club level.
export const clubOpponent = () => ({ ...RIVAL, skills: { power: 50, accuracy: 46, shortGame: 47, recovery: 45, putting: 46 } });

// Record a finished round and move the week on.
export function finishRound(c, result) {
  c.history.unshift({ season: c.season, week: c.week, ...result });
  c.history = c.history.slice(0, 40);
  c.round = null;
  c.week += 1;
  if (c.week > WEEKS) { c.week = 1; c.season += 1; }
}

// ---------- Saving ----------
// Storage can be missing or refuse (private windows, sandboxed pages): then the
// career just lasts until the page is closed.

export function saveCareer(c) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(c)); return true; } catch { return false; }
}

export function loadCareer() {
  try {
    const c = JSON.parse(localStorage.getItem(SAVE_KEY));
    return c?.version === 1 ? c : null;
  } catch { return null; }
}
