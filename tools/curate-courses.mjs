// Picks and names the courses for each tier of the career, and writes them to
// src/course-list.js. Each candidate is built from a seed, style, par and
// length, then rated by playing it: a club-standard computer golfer plays the
// holes a round there uses (nine at the club, eighteen above) a few times, and
// the rating is the average score against par, per nine holes. The easiest
// candidates go to the club and the hardest to the majors, so every step up
// really is harder.
// Run with: node tools/curate-courses.mjs   (takes several minutes)

import { writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeRng, drawWeather, teeYards } from '../src/course-generator.js';
import { buildCourse } from '../src/course.js';
import { holeWind } from '../src/weather.js';
import { playHole } from './sim-round.mjs';

const RUNS = 4;
const TESTER = { name: 'Tester', look: 'club', ai: true, nerve: 0.5, skills: { power: 50, accuracy: 50, shortGame: 50, recovery: 50, putting: 50 } };

// What each tier looks for. `pool` candidates are rated; `pick` are kept.
const TIERS = [
  { key: 'club', holes: 9, pool: 18, pick: 6, pars: [68, 69, 70], lengths: ['forward'], styles: ['parkland', 'heathland', 'woodland'], suffix: ['GOLF CLUB'] },
  { key: 'county', holes: 18, pool: 12, pick: 6, pars: [70, 71, 72], lengths: ['short', 'standard'], styles: ['parkland', 'heathland', 'links', 'woodland', 'desert'], suffix: ['GOLF CLUB', 'GOLF & COUNTRY CLUB'] },
  { key: 'challenge', holes: 18, pool: 12, pick: 6, pars: [71, 72], lengths: ['standard'], styles: ['parkland', 'heathland', 'links', 'woodland', 'desert', 'alpine', 'tropical'], suffix: ['GOLF CLUB', 'GOLF RESORT', 'LINKS'] },
  { key: 'tour', holes: 18, pool: 12, pick: 6, pars: [72], lengths: ['standard', 'long'], styles: ['links', 'stadium', 'tropical', 'alpine', 'desert', 'parkland'], suffix: ['NATIONAL', 'GOLF RESORT', 'LINKS', 'COUNTRY CLUB'] },
  { key: 'majors', holes: 18, pool: 10, pick: 4, pars: [72], lengths: ['long'], styles: ['links', 'stadium', 'parkland', 'heathland'], suffix: ['NATIONAL', 'ROYAL', 'LINKS'] },
];

// Invented place names, by style.
const PLACES = {
  parkland: ['MUDFORD', 'PUDDLEBY', 'LITTLE WIGGLEY', 'OAKENDEN', 'BRAMBLE BOTTOM', 'CHUMLEY PARK', 'ASHWORTHY', 'MEADOWBROOK', 'HOLLYFIELD', 'DUCKWORTH'],
  heathland: ['NETHER SLOUCH', 'GORSEMOOR', 'HEATHERCOTE', 'BRACKENFOLD', 'FERNLEIGH', 'WHINBURY', 'LINGHOLT', 'BROOMHILL'],
  woodland: ['PINEWHISTLE', 'BIRCHWOOD END', 'OWLCOMBE', 'SQUIRREL HOLLOW', 'TALLTIMBER', 'ELMSTEAD'],
  links: ['SALTMARSH', 'GULLSTONE', 'DUNEHAVEN', 'SHINGLEBAY', 'WINDY POINT', 'KITTIWAKE', 'MARRAMSIDE'],
  desert: ['DRY GULCH', 'CACTUS FLATS', 'MESA ROJA', 'SUNBAKE', 'COYOTE WELLS', 'DUSTY SPRINGS'],
  alpine: ['EDELWEISS', 'HIGH PASTURE', 'GLACIER VIEW', 'PINE SUMMIT', 'SNOWCAP'],
  tropical: ['COCONUT KEY', 'PALM LAGOON', 'MANGO BAY', 'CORAL SANDS', 'PARROT CAY'],
  stadium: ['THUNDER BOWL', 'GRAND ARENA', 'IRONGATE', 'COLOSSEUM CREEK', 'BIG TOP'],
};

function rate(def, holes, seed) {
  const course = buildCourse(def);
  const rng = makeRng(seed);
  const play = course.holes.slice(0, holes);
  let over = 0;
  for (let k = 0; k < RUNS; k++) {
    const weather = drawWeather(course, rng);
    for (const h of play) over += playHole(TESTER, h, weather, holeWind(weather, h), rng) - h.par;
  }
  return {
    rating: Math.round((over / RUNS) * (9 / holes) * 10) / 10,
    roundPar: play.reduce((t, h) => t + h.par, 0),
    yards: play.reduce((t, h) => t + teeYards(h, 'white'), 0),
  };
}

const pick = (r, list) => list[Math.floor(r.next() * list.length)];

// A tier's candidates, the same every run.
function candidates(tier) {
  const r = makeRng([...tier.key].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), 0x5eed));
  return Array.from({ length: tier.pool }, (_, i) => ({
    style: tier.styles[i % tier.styles.length], seed: Math.floor(r.next() * 1e6), par: pick(r, tier.pars), length: pick(r, tier.lengths), tour: tier.key,
  }));
}

// Child process: rate one tier's candidates and print them as JSON.
if (process.argv[2] === '--rate') {
  const tier = TIERS.find((t) => t.key === process.argv[3]);
  const rated = candidates(tier).map((def) => {
    const t = Date.now();
    const got = rate(def, tier.holes, def.seed ^ 0x1234);
    console.error(tier.key.padEnd(10), def.style.padEnd(10), String(def.seed).padEnd(7), def.length.padEnd(9), `par ${got.roundPar}`, `${got.yards} yds`, `rating ${got.rating}`, `${Date.now() - t} ms`);
    return { ...def, ...got };
  });
  console.log(JSON.stringify(rated));
  process.exit(0);
}

// Rate every tier at once, one process each.
const run = (tier) => new Promise((done, fail) => {
  execFile(process.execPath, [fileURLToPath(import.meta.url), '--rate', tier.key], { maxBuffer: 1 << 24 }, (err, stdout, stderr) => {
    process.stderr.write(stderr);
    if (err) fail(err); else done(JSON.parse(stdout));
  });
});
const ratings = await Promise.all(TIERS.map(run));

const names = makeRng(0xc0475e);
const used = new Set();
const out = {};
let floor = -Infinity;
TIERS.forEach((tier, n) => {
  // The easiest at the club; above that, only courses harder than the tier
  // below's average, easiest first, with the hardest of the pool kept for the top.
  const rated = ratings[n].sort((a, b) => a.rating - b.rating);
  let keep = rated.filter((c) => c.rating > floor);
  if (keep.length < tier.pick) keep = rated.slice(-tier.pick);
  keep = tier.key === 'majors' ? keep.slice(-tier.pick) : keep.slice(0, tier.pick);
  floor = keep.reduce((t, c) => t + c.rating, 0) / keep.length;
  out[tier.key] = keep.map((c, i) => {
    let place;
    do place = pick(names, PLACES[c.style]); while (used.has(place));
    used.add(place);
    // Only links courses are called links.
    const suffix = pick(names, tier.suffix.filter((x) => x !== 'LINKS' || c.style === 'links'));
    const name = suffix === 'ROYAL' ? `ROYAL ${place}` : `${place} ${suffix}`;
    return { id: `${tier.key}-${i + 1}`, name, style: c.style, seed: c.seed, par: c.par, length: c.length, tour: tier.key, holes: tier.holes, roundPar: c.roundPar, yards: c.yards, rating: c.rating };
  });
  console.log(`${tier.key}: kept ratings ${keep.map((c) => c.rating).join(', ')}`);
});

const lines = Object.entries(out).map(([k, list]) => `  ${k}: [\n${list.map((c) => `    ${JSON.stringify(c)},`).join('\n')}\n  ],`);
writeFileSync('src/course-list.js', `// The career's courses, tier by tier, easiest first. Written by
// tools/curate-courses.mjs: \`rating\` is how many shots over par a club-standard
// golfer averages per nine holes there. \`par\` is for all eighteen holes (it
// shapes the course); \`roundPar\` and \`yards\` are for the holes a round there
// plays, from the white tees.

export const COURSE_LIST = {
${lines.join('\n')}
};
`);
console.log('wrote src/course-list.js');
