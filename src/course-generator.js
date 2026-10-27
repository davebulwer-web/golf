// Course generator, extracted from the Golf manager game (golf-poc/golf.js).
// One seed always builds the same 18-hole course. No dependencies; runs in
// Node and in the browser as an ES module.
//
// The section between the "COPIED VERBATIM" markers is unchanged from golf.js
// so courses match the original game exactly. Don't edit it unless you're happy
// for every existing seed to change shape. New features should use their own
// random stream (see r2 and r3 in generateHole) so old holes keep their shape.
// Units are yards.

// ===== COPIED VERBATIM from golf-poc/golf.js (2026-10-27) =====

// ---------- Random numbers ----------

export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor((hi - lo + 1) * next()),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    gauss: () => {
      let u = 0;
      while (u === 0) u = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
    },
    shuffle: (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };
  return rng;
}

// ---------- Geometry ----------

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// A hole's centre line is a polyline from tee to green. These helpers convert
// between world points and (s = yards along the line, lat = yards off it).
function buildLine(points) {
  const segs = [];
  let s = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const len = dist(a, b);
    segs.push({ a, b, len, s0: s, ux: (b.x - a.x) / len, uy: (b.y - a.y) / len });
    s += len;
  }
  return { points, segs, length: s };
}

function project(line, p) {
  let best = null;
  for (const g of line.segs) {
    let t = (p.x - g.a.x) * g.ux + (p.y - g.a.y) * g.uy;
    const before = t < 0, after = t > g.len;
    // Let the first and last segments extend past the ends of the line.
    if (before && g !== line.segs[0]) t = 0;
    if (after && g !== line.segs[line.segs.length - 1]) t = g.len;
    const cx = g.a.x + g.ux * t, cy = g.a.y + g.uy * t;
    const lat = (p.x - g.a.x) * -g.uy + (p.y - g.a.y) * g.ux;
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (!best || d < best.d) best = { s: g.s0 + t, lat, d };
  }
  return best;
}

function pointAt(line, s, lat = 0) {
  let g = line.segs[line.segs.length - 1];
  for (const seg of line.segs) {
    if (s <= seg.s0 + seg.len) { g = seg; break; }
  }
  const t = s - g.s0;
  return { x: g.a.x + g.ux * t - g.uy * lat, y: g.a.y + g.uy * t + g.ux * lat };
}

// Organic shapes: a circle whose radius wobbles with angle, optionally
// stretched and rotated. Used for greens, bunkers and water.
function makeBlob(r, x, y, R, amp = 0.25, stretch = [1, 1.4], rot = null) {
  const h = [];
  let left = amp;
  for (let k = 2; k <= 5 && left > 0.01; k++) {
    const a = k === 5 ? left : r.range(0.3, 0.7) * left;
    h.push([k, a, r.range(0, Math.PI * 2)]);
    left -= a;
  }
  return { x, y, r: R, rot: rot ?? r.range(0, Math.PI), sx: r.range(...stretch), h };
}

// Yards from a point to the blob's edge: negative inside, positive outside.
function blobGap(b, p) {
  const dx = p.x - b.x, dy = p.y - b.y;
  const c = Math.cos(-b.rot), s = Math.sin(-b.rot);
  const u = (dx * c - dy * s) / b.sx, v = dx * s + dy * c;
  const d = Math.hypot(u, v);
  if (d > b.r * 1.6 + 15) return d - b.r * 1.5; // far away, skip the trig
  const th = Math.atan2(v, u);
  let f = 1;
  for (const [k, a, ph] of b.h) f += a * Math.sin(k * th + ph);
  return d - b.r * f;
}

// A point inside a blob, `frac` of the way from centre to edge at angle `th`.
function blobPoint(b, th, frac) {
  let f = 1;
  for (const [k, a, ph] of b.h) f += a * Math.sin(k * th + ph);
  const u = Math.cos(th) * b.r * f * frac * b.sx, v = Math.sin(th) * b.r * f * frac;
  return { x: b.x + u * Math.cos(b.rot) - v * Math.sin(b.rot), y: b.y + u * Math.sin(b.rot) + v * Math.cos(b.rot) };
}

// Smooth wobble along the hole, used to bend fairway and rough edges.
const wobble = (ph, s) => 0.22 * Math.sin(s / 41 + ph[0]) + 0.12 * Math.sin(s / 19 + ph[1]) + 0.06 * Math.sin(s / 8 + ph[2]);

// ---------- Course styles ----------

// Each style changes how holes are laid out, how the course plays in the
// weather, and (in the viewer) how it looks. Ranges are [min, max].
export const STYLES = {
  parkland: {
    name: 'Parkland', fwHalf: [13, 22], roughW: [14, 28], wasteW: [0, 0], greenR: [12, 17],
    dogleg: 0.65, bend: 45, fwBunkers: [0, 2], fwBunkerR: [8, 13], potBunkers: false,
    gsBunkers: [1, 3], gsBunkerR: [5, 9], water: [0.4, 0.3], greenWater: [0.3, 0.2], sea: 0, carry: false,
    sharpDogleg: 0.08, wind: [0, 10], firm: [0, 0.03],
  },
  links: {
    name: 'Links', fwHalf: [17, 27], roughW: [8, 16], wasteW: [0, 0], greenR: [14, 20],
    dogleg: 0.4, bend: 30, fwBunkers: [1, 4], fwBunkerR: [4, 7], potBunkers: true,
    gsBunkers: [2, 4], gsBunkerR: [3.5, 6], water: [0.1, 0.1], greenWater: [0, 0], sea: 0.4, carry: false,
    sharpDogleg: 0.04, wind: [8, 25], firm: [0.08, 0.15],
  },
  desert: {
    name: 'Desert', fwHalf: [14, 21], roughW: [16, 28], wasteW: [15, 30], greenR: [12, 16],
    dogleg: 0.6, bend: 40, fwBunkers: [0, 2], fwBunkerR: [7, 11], potBunkers: false,
    gsBunkers: [1, 3], gsBunkerR: [5, 8], water: [0.3, 0.2], greenWater: [0.3, 0.2], sea: 0, carry: true,
    sharpDogleg: 0.07, wind: [2, 12], firm: [0.05, 0.1],
  },
  heathland: {
    name: 'Heathland', fwHalf: [15, 24], roughW: [8, 16], wasteW: [0, 0], greenR: [13, 18],
    dogleg: 0.55, bend: 40, fwBunkers: [1, 3], fwBunkerR: [9, 15], potBunkers: false, raggedBunkers: true,
    gsBunkers: [1, 3], gsBunkerR: [6, 10], water: [0.15, 0.1], greenWater: [0.1, 0.05], sea: 0, carry: false,
    sharpDogleg: 0.07, wind: [4, 16], firm: [0.05, 0.1],
  },
  alpine: {
    name: 'Alpine', fwHalf: [13, 22], roughW: [10, 20], wasteW: [0, 0], greenR: [12, 16],
    dogleg: 0.7, bend: 50, fwBunkers: [0, 2], fwBunkerR: [7, 11], potBunkers: false,
    gsBunkers: [1, 2], gsBunkerR: [5, 8], water: [0.3, 0.4], creekBias: true, greenWater: [0.15, 0.1], sea: 0, carry: false,
    sharpDogleg: 0.1, wind: [2, 14], firm: [0.02, 0.06], altitude: 1.1, yardage: 1.08, // thin air: the ball flies ~10% further
  },
  tropical: {
    name: 'Tropical', fwHalf: [15, 24], roughW: [12, 22], wasteW: [0, 0], greenR: [13, 18],
    dogleg: 0.55, bend: 40, fwBunkers: [1, 2], fwBunkerR: [8, 13], potBunkers: false,
    gsBunkers: [1, 3], gsBunkerR: [5, 9], water: [0.5, 0.45], greenWater: [0.4, 0.3], sea: 0.2, carry: false,
    sharpDogleg: 0.08, wind: [5, 15], firm: [0, 0.02],
  },
  woodland: {
    name: 'Woodland', fwHalf: [10, 16], roughW: [5, 10], wasteW: [0, 0], greenR: [11, 15],
    dogleg: 0.85, bend: 55, fwBunkers: [0, 1], fwBunkerR: [6, 10], potBunkers: false,
    gsBunkers: [1, 2], gsBunkerR: [5, 8], water: [0.25, 0.2], greenWater: [0.15, 0.1], sea: 0, carry: false,
    sharpDogleg: 0.12, wind: [0, 6], firm: [0, 0.03],
  },
  stadium: {
    name: 'Stadium', fwHalf: [14, 22], roughW: [10, 18], wasteW: [0, 0], greenR: [12, 17],
    dogleg: 0.6, bend: 45, fwBunkers: [1, 3], fwBunkerR: [8, 13], potBunkers: false,
    gsBunkers: [1, 3], gsBunkerR: [5, 9], water: [0.45, 0.35], greenWater: [0.45, 0.35], island: 0.4, sea: 0, carry: false,
    sharpDogleg: 0.25, wind: [3, 12], firm: [0.03, 0.08],
  },
};

// Tee boxes on every hole, from the back (black) forward. `cut` is roughly how
// much shorter the course plays from that set than from the black tees.
export const TEE_SETS = [
  { key: 'black', name: 'Black', cut: 0, color: '#1c1c1c' },
  { key: 'blue', name: 'Blue', cut: 0.055, color: '#2f6fd6' },
  { key: 'white', name: 'White', cut: 0.12, color: '#f4f4f4' },
  { key: 'yellow', name: 'Yellow', cut: 0.19, color: '#f2c93a' },
];

// Steady pseudo-random number from a seed and an index, without touching any
// random stream (so adding tees didn't change any hole's layout).
const hash01 = (seed, k) => {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(k + 1, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
};

// How far forward of the black tees each set sits on this hole, in yards.
function teeOffsets(par, length, seed) {
  const out = {};
  TEE_SETS.forEach((t, i) => {
    let off = length * t.cut * (0.6 + 0.8 * hash01(seed, i));
    off = Math.min(off, par === 3 ? Math.max(0, length - 100) : 150);
    out[t.key] = Math.round(off);
  });
  // Keep the sets in order: each one at or ahead of the one behind it.
  out.white = Math.max(out.white, out.blue + 5);
  out.yellow = Math.max(out.yellow, out.white + 5);
  return out;
}

export const teeYards = (hole, tee = 'black') => hole.length - (hole.tees?.[tee] ?? 0);
export const courseYards = (course, tee = 'black') => course.holes.reduce((t, h) => t + teeYards(h, tee), 0);

// Tee positions. Forward tees make local courses playable for beginners.
export const LENGTH_SCALES = { forward: 0.82, short: 0.92, standard: 1, long: 1.05 };
export const LENGTH_NAMES = { forward: 'Forward tees', short: 'Short', standard: 'Standard', long: 'Championship' };


// ---------- Hole and course generation ----------

const LENGTHS = { 3: [145, 235], 4: [355, 475], 5: [500, 600] };

export function generateHole(seed, par, number = 1, styleKey = 'parkland', lengthScale = 1, signatures = true) {
  const st = STYLES[styleKey];
  const r = makeRng(seed);
  const rng = r;
  const length = Math.round(r.range(...LENGTHS[par]) * lengthScale);
  const tee = { x: 0, y: 0 };

  // Par 4s and 5s may dogleg at roughly driving distance.
  let pts;
  if (par === 3) {
    const ang = r.range(-0.12, 0.12);
    pts = [tee, { x: Math.sin(ang) * length, y: Math.cos(ang) * length }];
  } else {
    const bendS = Math.min(r.range(230, 285), length * 0.65); // short holes bend earlier
    const bendLat = r.chance(st.dogleg) ? r.range(-st.bend, st.bend) : r.range(-10, 10);
    const bend = { x: bendLat, y: bendS };
    const rest = length - Math.hypot(bendLat, bendS);
    const ang = r.range(-0.5, 0.5) * st.bend / 45;
    pts = [tee, bend, { x: bend.x + Math.sin(ang) * rest, y: bend.y + Math.cos(ang) * rest }];
  }
  // Signature holes: a sharp dogleg with the corner guarded, so the choice is
  // to lay up to the corner or shape a shot round it. Decided from its own
  // random stream, so ordinary holes are unchanged.
  const r3 = makeRng(seed ^ 0xd061e9);
  let corner = null;
  if (signatures && par > 3 && r3.chance(st.sharpDogleg ?? 0)) {
    const bendS = Math.min(r3.range(225, 260), length * 0.6);
    const turn = (r3.chance(0.5) ? 1 : -1) * r3.range(0.85, 1.3); // radians: about 50 to 75 degrees
    const bend = { x: 0, y: bendS };
    const rest = length - bendS;
    pts = [tee, bend, { x: bend.x + Math.sin(turn) * rest, y: bend.y + Math.cos(turn) * rest }];
    corner = { turn, bend, kind: (st.island || styleKey === 'tropical') && r3.chance(0.5) ? 'water' : 'trees', size: r3.range(28, 40) };
  }
  const line = buildLine(pts);
  const gEnd = pts[pts.length - 1];
  const green = makeBlob(r, gEnd.x, gEnd.y, r.range(...st.greenR), 0.16, [1, 1.35]);
  const pin = blobPoint(green, r.range(0, Math.PI * 2), r.range(0, 0.6));
  const phases = () => [r.range(0, 6.3), r.range(0, 6.3), r.range(0, 6.3)];
  const edges = { fl: phases(), fr: phases(), rl: phases(), rr: phases(), c: phases() };

  const fwHalf = r.range(...st.fwHalf);
  const roughW = r.range(...st.roughW);
  const wasteW = r.range(...st.wasteW);
  // Desert holes often need a carry over waste ground before the fairway starts.
  const fwStart = par === 3 ? Infinity : Math.min(st.carry ? r.range(170, 215) : 185, line.length * 0.4);
  const fwEnd = line.length - green.r * 0.5; // fairway runs up into the green

  const bunkers = [];
  const water = [];
  if (par > 3) {
    const n = r.int(...st.fwBunkers);
    for (let i = 0; i < n; i++) {
      const rad = r.range(...st.fwBunkerR);
      const side = r.chance(0.5) ? 1 : -1;
      // Links pot bunkers can sit right in the fairway; others line the edges.
      const lat = st.potBunkers && r.chance(0.5) ? r.range(-fwHalf, fwHalf) * 0.8 : side * (fwHalf + rad * r.range(0, 0.5));
      const c = pointAt(line, r.range(st.potBunkers ? 180 : 235, st.potBunkers ? 330 : 290), lat);
      addBunker(c, rad, false);
    }
  }
  // Bunkers are one to three overlapping lobes; links pot bunkers stay small and round.
  function addBunker(c, rad, greenside, r = rng) {
    const lobes = st.potBunkers ? 1 : r.int(1, st.raggedBunkers ? 4 : 3);
    const amp = st.potBunkers ? 0.08 : st.raggedBunkers ? 0.38 : 0.22;
    bunkers.push({ ...makeBlob(r, c.x, c.y, rad, amp, st.potBunkers ? [1, 1.15] : [1, 1.6]), greenside });
    for (let i = 1; i < lobes; i++) {
      const a = r.range(0, Math.PI * 2), off = rad * r.range(0.6, 0.9);
      bunkers.push({ ...makeBlob(r, c.x + Math.cos(a) * off, c.y + Math.sin(a) * off, rad * r.range(0.45, 0.75), 0.2), greenside });
    }
  }
  const ng = r.int(...st.gsBunkers);
  const back = line.segs[line.segs.length - 1];
  const baseAng = Math.atan2(-back.uy, -back.ux); // pointing from green back to tee
  for (let i = 0; i < ng; i++) {
    const rad = r.range(...st.gsBunkerR);
    const a = baseAng + r.range(-1.9, 1.9);
    const off = green.r + rad * 0.55;
    addBunker({ x: green.x + Math.cos(a) * off, y: green.y + Math.sin(a) * off }, rad, true);
  }

  let creek = null;
  if (r.chance(par === 3 ? st.water[0] : st.water[1])) {
    const kind = styleKey === 'links' ? (par === 3 ? 'front' : 'creek')
      : par === 3 ? 'front' : st.creekBias ? r.pick(['creek', 'creek', 'pond'])
      : r.pick(['pond', 'pond', 'front', par === 5 ? 'creek' : 'pond']);
    if (kind === 'pond') {
      const rad = r.range(18, 32);
      const side = r.chance(0.5) ? 1 : -1;
      const c = pointAt(line, r.range(200, line.length - 90), side * (fwHalf + rad * r.range(0.3, 0.8)));
      water.push(makeBlob(r, c.x, c.y, rad, 0.3, [1, 1.8]));
    } else if (kind === 'front') {
      const rad = r.range(12, 20) * (styleKey === 'links' ? 0.6 : 1);
      const c = pointAt(line, line.length - green.r - rad * 0.8 - r.range(2, 8), r.range(-8, 8));
      // Stretched across the line of play, so it guards the front of the green.
      water.push({ ...makeBlob(r, c.x, c.y, rad, 0.25, [1.3, 2], Math.atan2(back.uy, back.ux) + Math.PI / 2), front: true });
    } else {
      const s = r.range(Math.min(300, line.length - 160), line.length - 150);
      creek = { s: s, half: r.range(3, 6), meander: r.range(4, 10), ph: r.range(0, 6.3) };
    }
  }

  // Extra features use their own random stream, so adding them didn't reshape existing holes.
  const r2 = makeRng(seed ^ 0x5a5a5a);
  const toTee = Math.atan2(-back.uy, -back.ux);
  const guarded = water.length && kindFront(water);
  if (par === 3 && r2.chance(st.island ?? 0)) {
    // Island green: water all round, with the green sitting in the middle.
    water.push({ ...makeBlob(r2, green.x, green.y, green.r * r2.range(1.9, 2.4), 0.15, [1, 1.3]), greenside: true, island: true });
  } else if (!guarded && r2.chance(par === 3 ? st.greenWater[0] : st.greenWater[1])) {
    // A pond hugging part of the green: in front, or wrapping round one side.
    const lobes = r2.chance(0.25) ? 2 : 1;
    const a0 = toTee + r2.range(-1.4, 1.4);
    for (let i = 0; i < lobes; i++) {
      const a = a0 + i * (r2.chance(0.5) ? 1 : -1) * r2.range(0.9, 1.3);
      const rad = green.r * r2.range(0.9, 1.3);
      const d = green.r * 0.85 + rad * 0.7;
      water.push({ ...makeBlob(r2, green.x + Math.cos(a) * d, green.y + Math.sin(a) * d, rad, 0.25, [1, 1.5], a + Math.PI / 2), greenside: true });
    }
  }
  // More fairway bunkers: around the drive landing zone, and the lay-up zone on par 5s.
  if (par > 3) {
    const zones = [[Math.min(215, line.length * 0.6), Math.min(300, line.length * 0.8)], ...(par === 5 ? [[line.length - 170, line.length - 90]] : [])];
    for (const [s0, s1] of zones) {
      const n = r2.int(1, st.potBunkers ? 3 : 2);
      for (let i = 0; i < n; i++) {
        const rad = r2.range(...st.fwBunkerR);
        const side = r2.chance(0.5) ? 1 : -1;
        const lat = st.potBunkers && r2.chance(0.5) ? r2.range(-fwHalf, fwHalf) * 0.8 : side * (fwHalf + rad * r2.range(-0.3, 0.4));
        addBunker(pointAt(line, r2.range(s0, s1), lat), rad, false, r2);
      }
    }
  }
  // Links holes beside the sea: beach then open water down one side.
  const sea = r2.chance(st.sea) ? { side: r2.chance(0.5) ? 1 : -1, beach: r2.range(5, 12), ph: [r2.range(0, 6.3), r2.range(0, 6.3), r2.range(0, 6.3)] } : null;

  // Guard the inside of a sharp dogleg with a stand of tall trees or a lake.
  const copses = [];
  if (corner) {
    // pointAt's positive offset is to the left of the first leg, so a right turn's inside is negative.
    const inward = corner.turn > 0 ? -1 : 1;
    const inside = pointAt(line, corner.bend.y - corner.size * 1.5, inward * (fwHalf * 0.5 + corner.size * 1.25));
    const blob = makeBlob(r3, inside.x, inside.y, corner.size, 0.25, [1, 1.4]);
    if (corner.kind === 'water') water.push(blob); else copses.push(blob);
  }

  const hole = {
    number, par, length, seed, style: styleKey, line, tee, green, pin, fwHalf, roughW, wasteW, fwStart, fwEnd, edges, sea,
    bunkers, water, creek, copses, signature: !!corner,
    bearing: r.range(0, Math.PI * 2), // compass direction the hole plays, for wind
    altitude: st.altitude ?? 1,
  };
  hole.tees = teeOffsets(par, length, seed);
  if (water.some((w) => w.island)) hole.bridge = islandBridge(hole, toTee + (seed % 2 ? 1.1 : -1.1));
  return hole;
}

// A footbridge from an island green to dry land, heading off at angle `a`.
// Worked out from the layout alone (no random numbers), and only drawn: a ball
// landing on it still counts as in the water.
function islandBridge(hole, a) {
  const at = (t) => ({ x: hole.green.x + Math.cos(a) * t, y: hole.green.y + Math.sin(a) * t });
  let t = 0;
  while (t < 60 && blobGap(hole.green, at(t)) <= 0) t += 0.5;
  const from = at(t - 1);
  while (t < 90 && surfaceAt(hole, at(t)) === 'water') t += 0.5;
  return { from, to: at(t + 2), width: 2.5 };
}

const kindFront = (water) => water.some((w) => w.front);

// Pars for 18 holes: always four par 3s; par 5s make up the rest of the total.
// Below par 68, short courses swap par 4s for extra par 3s.
function parList(total) {
  const fives = Math.max(0, Math.min(6, total - 68));
  const threes = 4 + Math.max(0, Math.min(6, 68 - total));
  const fours = 18 - threes - fives;
  return [...Array(threes).fill(3), ...Array(fives).fill(5), ...Array(fours).fill(4)];
}

// `def` is an entry like those in COURSES, or a bare seed for a standard parkland course.
// Signature doglegs are on unless a course says otherwise; club and county courses default to off
// so beginners get simpler layouts.
export const signaturesOn = (def) => def.signature ?? !['club', 'county'].includes(def.tour);

export function generateCourse(def) {
  if (typeof def === 'number') def = { name: `Course ${def}`, style: 'parkland', par: 72, length: 'standard', seed: def };
  const r = makeRng(def.seed);
  const front = [], back = [];
  parList(def.par).forEach((p, i) => (i % 2 ? back : front).push(p));
  const pars = [...r.shuffle(front), ...r.shuffle(back)];
  const scale = (LENGTH_SCALES[def.length] ?? 1) * (STYLES[def.style].yardage ?? 1);
  const holes = pars.map((par, i) => generateHole(Math.floor(r.next() * 2 ** 31), par, i + 1, def.style, scale, signaturesOn(def)));
  return {
    ...def, holes,
    par: holes.reduce((t, h) => t + h.par, 0),
    yards: holes.reduce((t, h) => t + h.length, 0),
  };
}

// Conditions for one round: wind blows towards windDir (radians, compass-style).
export function drawWeather(course, r) {
  const st = STYLES[course.style];
  return { windMph: Math.round(r.range(...st.wind)), windDir: r.range(0, Math.PI * 2), firm: r.range(...st.firm) };
}

export const CALM = { windMph: 0, windDir: 0, firm: 0 };

// What the ground is at a point: tee, fairway, rough, waste, trees, bunker, water, fringe, green.
// With `detail`, the sea and beach come back as 'sea' and 'beach' (for drawing);
// otherwise they play as 'water' and 'waste'.
export function surfaceAt(hole, p, detail = false) {
  const g = blobGap(hole.green, p);
  if (g <= 0) return 'green';
  for (const w of hole.water) if (blobGap(w, p) <= 0) return 'water';
  for (const b of hole.bunkers) if (blobGap(b, p) <= 0) return 'bunker';
  if (hole.copses) for (const c of hole.copses) if (blobGap(c, p) <= 0) return detail ? 'copse' : 'trees';
  const pr = project(hole.line, p);
  const E = hole.edges;
  // Edges of each band either side of the (wandering) fairway centre.
  const lat = pr.lat - hole.fwHalf * 0.35 * wobble(E.c, pr.s);
  const fwL = hole.fwHalf * (1 + wobble(E.fl, pr.s)), fwR = hole.fwHalf * (1 + wobble(E.fr, pr.s));
  // Narrow the rough towards the tee so the hole doesn't start with square corners.
  const toEnd = hole.line.length - pr.s;
  const teeTaper = (pr.s < 70 ? 0.4 + 0.6 * Math.sqrt(Math.max(0, pr.s) / 70) : 1) *
    (toEnd < 60 ? 1 - 0.55 * ((60 - Math.max(0, toEnd)) / 60) ** 2 : 1); // and round it off behind the green
  const roughL = (fwL + hole.roughW * (1 + 1.5 * wobble(E.rl, pr.s))) * teeTaper;
  const roughR = (fwR + hole.roughW * (1 + 1.5 * wobble(E.rr, pr.s))) * teeTaper;
  const edge = lat < 0 ? -lat : lat;
  const fwEdge = lat < 0 ? fwL : fwR, roughEdge = lat < 0 ? roughL : roughR;
  if (hole.sea && Math.sign(lat) === hole.sea.side && edge > roughEdge) {
    const shore = roughEdge + hole.sea.beach * (1 + 2 * wobble(hole.sea.ph, pr.s));
    if (edge > shore) return detail ? 'sea' : 'water';
    return detail ? 'beach' : 'waste';
  }
  const c = hole.creek;
  if (c && Math.abs(pr.s - c.s - c.meander * Math.sin(pr.lat / 11 + c.ph)) <= c.half && edge <= roughEdge + hole.wasteW) return 'water';
  if (g <= 3) return 'fringe';
  if (pr.d < 8 && hole.tees && Object.values(hole.tees).some((o) => pr.s > o - 6 && pr.s < o + 6)) return 'tee';
  // Round off both ends of the hole instead of cutting them square.
  if (pr.s > hole.line.length && dist(p, hole.green) > hole.green.r + 18 + 8 * wobble(E.rl, pr.lat * 3)) return 'trees';
  if (pr.s < 0 && dist(p, hole.tee) > 22 + 6 * wobble(E.rr, pr.lat * 3)) return 'trees';
  // Round off the start of the fairway rather than cutting it square.
  const into = pr.s - hole.fwStart;
  const taper = into < 0 ? 0 : into < 25 ? Math.sqrt(into / 25) : 1;
  if (edge <= fwEdge * taper && pr.s <= hole.fwEnd) return 'fairway';
  if (edge <= roughEdge || g <= 12) {
    return hole.wasteW > 0 && pr.s < hole.fwStart && pr.s > 20 && hole.par > 3 ? 'waste' : 'rough';
  }
  if (edge <= roughEdge + hole.wasteW * teeTaper) return 'waste';
  return 'trees';
}

// ===== END OF VERBATIM COPY =====

// ---------- Extras for renderers ----------

// Geometry helpers, exported so a renderer can work in "along the hole" terms.
export { dist, project, pointAt, blobGap, blobPoint };

// Every surface the generator can produce. `detail` surfaces (copse, sea,
// beach) are only for drawing; for play they count as trees, water and waste.
export const SURFACES = ['trees', 'rough', 'fairway', 'fringe', 'green', 'tee', 'bunker', 'water', 'waste', 'copse', 'sea', 'beach'];

// The rectangle a hole covers, in yards, with a margin of trees round it.
export function holeBounds(hole, margin = 30) {
  const xs = [], ys = [];
  const add = (x, y, r = 0) => { xs.push(x - r, x + r); ys.push(y - r, y + r); };
  for (const p of hole.line.points) add(p.x, p.y);
  const side = hole.fwHalf * 1.5 + hole.roughW * 2.5 + hole.wasteW + (hole.sea ? 40 : 0);
  for (const p of hole.line.points) add(p.x, p.y, side);
  add(hole.green.x, hole.green.y, hole.green.r * 2 + 20);
  for (const b of [...hole.bunkers, ...hole.water, ...(hole.copses ?? [])]) add(b.x, b.y, b.r * 2);
  return {
    minX: Math.floor(Math.min(...xs) - margin), maxX: Math.ceil(Math.max(...xs) + margin),
    minY: Math.floor(Math.min(...ys) - margin), maxY: Math.ceil(Math.max(...ys) + margin),
  };
}

// Turn a hole into a grid of tiles, for a tile-based (e.g. isometric) renderer.
// Each tile is `cell` yards square and holds the surface at its centre.
// Row 0 is the tee end (smallest y); the hole runs "up" the rows towards the green.
// Returns { cols, rows, cell, originX, originY, tiles, toTile, toWorld, tees, pin }.
export function holeToGrid(hole, { cell = 4, detail = true, margin = 30 } = {}) {
  // Sample a generous area, then crop to the playable part plus `margin` yards of trees.
  const b = holeBounds(hole, 0);
  const W = Math.ceil((b.maxX - b.minX) / cell), H = Math.ceil((b.maxY - b.minY) / cell);
  const all = [];
  let c0 = W, c1 = -1, r0 = H, r1 = -1;
  for (let j = 0; j < H; j++) {
    const row = new Array(W);
    for (let i = 0; i < W; i++) {
      const t = surfaceAt(hole, { x: b.minX + (i + 0.5) * cell, y: b.minY + (j + 0.5) * cell }, detail);
      row[i] = t;
      if (t !== 'trees') { c0 = Math.min(c0, i); c1 = Math.max(c1, i); r0 = Math.min(r0, j); r1 = Math.max(r1, j); }
    }
    all.push(row);
  }
  const m = Math.ceil(margin / cell);
  const originX = b.minX + (c0 - m) * cell, originY = b.minY + (r0 - m) * cell;
  const cols = c1 - c0 + 1 + 2 * m, rows = r1 - r0 + 1 + 2 * m;
  const tiles = [];
  for (let j = 0; j < rows; j++) {
    const row = new Array(cols);
    for (let i = 0; i < cols; i++) row[i] = all[r0 - m + j]?.[c0 - m + i] ?? 'trees';
    tiles.push(row);
  }
  const toTile = (p) => ({ col: Math.floor((p.x - originX) / cell), row: Math.floor((p.y - originY) / cell) });
  const toWorld = (col, row) => ({ x: originX + (col + 0.5) * cell, y: originY + (row + 0.5) * cell });
  const tees = {};
  for (const t of TEE_SETS) tees[t.key] = toTile(pointAt(hole.line, hole.tees[t.key]));
  return { cols, rows, cell, originX, originY, tiles, toTile, toWorld, tees, pin: toTile(hole.pin) };
}

// A plain-data summary of a hole (no functions, safe to save as JSON).
export function holeSummary(hole) {
  const yards = {};
  for (const t of TEE_SETS) yards[t.key] = teeYards(hole, t.key);
  return {
    number: hole.number, par: hole.par, yards, style: hole.style, seed: hole.seed,
    signature: hole.signature, bunkers: hole.bunkers.length, water: hole.water.length + (hole.creek ? 1 : 0) + (hole.sea ? 1 : 0),
    island: hole.water.some((w) => w.island), dogleg: hole.line.points.length > 2 && Math.abs(hole.line.points[1].x) > 15,
  };
}

// Stroke Index (1 = hardest hole, 18 = easiest). The original game works this out
// by simulating thousands of shots; this is a quick stand-in from the layout alone:
// long for its par, water and bunkers make a hole harder. Odd numbers go to the
// front nine and even to the back, as on a real card.
export function quickStrokeIndex(course) {
  const base = { 3: 190, 4: 415, 5: 550 };
  const score = course.holes.map((h) => {
    const s = holeSummary(h);
    return { n: h.number, d: h.length / base[h.par] + 0.06 * s.water + 0.015 * s.bunkers + (s.island ? 0.15 : 0) + (s.signature ? 0.08 : 0) };
  });
  const rank = (nine) => score.filter((x) => (x.n <= 9) === nine).sort((a, b) => b.d - a.d);
  const front = rank(true), back = rank(false);
  const si = {};
  front.forEach((x, i) => (si[x.n] = 2 * i + 1));
  back.forEach((x, i) => (si[x.n] = 2 * i + 2));
  // Swap halves if the back nine holds the hardest hole.
  if (back[0] && front[0] && back[0].d > front[0].d) for (const k in si) si[k] += si[k] % 2 ? 1 : -1;
  return course.holes.map((h) => si[h.number]);
}
