// Sanity checks for the shot model and the extra hazards, printed as tables.
// Run with: node tools/check-shots.mjs

import { makeRng, holeSummary, STYLES } from '../src/course-generator.js';
import { buildCourse } from '../src/course.js';
import { SHOT_TYPES, maxCarry, chooseClub, playShot } from '../src/shots.js';
import { PLAYER } from '../src/golfers.js';
import { putt, holeChance } from '../src/putting.js';

const course = buildCourse({ name: 'Check', style: 'parkland', par: 72, length: 'standard', seed: 1989 });
const hole = course.holes.find((h) => h.par === 4);
const calm = { windMph: 0, windDir: 0, firm: 0 };
const still = { along: 0, across: 0 };
const rng = makeRng(42);

console.log('Max carry and scatter for the player from the fairway (1000 shots each, aimed at 70% and 100% of max)');
for (const t of SHOT_TYPES) {
  const max = maxCarry(PLAYER, t, 'fairway', hole);
  const row = [t.name.padEnd(7), `max ${max.toFixed(0)}`.padEnd(9)];
  for (const f of [0.7, 1]) {
    const aim = { x: 0, y: max * f };
    let miss = 0, mishits = 0;
    for (let i = 0; i < 1000; i++) {
      const s = playShot(rng, PLAYER, { at: { x: 0, y: 0 }, lie: 'fairway' }, aim, t.key, hole, calm, still);
      miss += Math.hypot(s.landing.x - aim.x, s.landing.y - aim.y);
      mishits += s.mishit;
    }
    row.push(`${(f * 100).toFixed(0)}%: ${chooseClub(PLAYER, t, max * f, 'fairway').padEnd(14)} avg miss ${(miss / 1000).toFixed(1)} yds, mishits ${(mishits / 10).toFixed(1)}%`);
  }
  console.log(row.join('  '));
}

console.log('\nLie effect on a full normal shot');
for (const lie of ['tee', 'fairway', 'rough', 'bunker', 'trees']) {
  console.log(lie.padEnd(8), maxCarry(PLAYER, SHOT_TYPES[0], lie, hole).toFixed(0), 'yds max,', 'runner', maxCarry(PLAYER, SHOT_TYPES[4], lie, hole).toFixed(0));
}

console.log('\nAverage per course (seeds 1 to 20)');
for (const style of Object.keys(STYLES)) {
  const tally = (build) => {
    let doglegs = 0, bunkers = 0, water = 0;
    for (let seed = 1; seed <= 20; seed++) {
      for (const h of build({ name: 'x', style, par: 72, length: 'standard', seed }).holes) {
        const s = holeSummary(h);
        doglegs += s.dogleg || s.signature; bunkers += s.bunkers; water += s.water;
      }
    }
    return `${(doglegs / 20).toFixed(1)} doglegs, ${(bunkers / 20).toFixed(0)} bunkers, ${(water / 20).toFixed(1)} water`;
  };
  console.log(style.padEnd(10), tally(buildCourse));
}

console.log('\nPutting for the player: average putts and three-putt rate (2000 tries each)');
for (const ft of [3, 6, 10, 20, 40, 60]) {
  let total = 0, threes = 0;
  for (let i = 0; i < 2000; i++) {
    let at = { x: 0, y: -ft / 3 }, n = 0;
    while (n < 8) { n++; const p = putt(rng, PLAYER, at, { x: 0, y: 0 }); if (p.holed) break; at = p.rest; }
    total += n; threes += n >= 3;
  }
  console.log(`${String(ft).padStart(2)} ft: ${(total / 2000).toFixed(2)} putts, ${(threes / 20).toFixed(1)}% three-putts, holed first time ${(holeChance(PLAYER, ft) * 100).toFixed(0)}%`);
}
