// Lays the 18 holes of a course out on one shared map, like Sim Golf: each tee
// a short walk from the green before, holes kept apart by a strip of woods, and
// the whole course kept compact round the first tee. The generator
// builds every hole on its own (tee at 0,0, playing up +y); this only decides
// where each one sits and which way it faces, using its own random stream.

import { makeRng, surfaceAt, holeBounds } from './course-generator.js';

const STEP = 10;      // yards per cell of the layout map
const GAP = 4;        // cells of woods kept between neighbouring holes
const SEA_REACH = 120; // yards of open sea a links hole keeps clear beside it
const TURNS = 24;      // headings tried for each hole
const WALKS = [[25, 40, 60, 80], [110, 150, 200], [260, 330, 400], [550, 700, 900]]; // tee distances from the last green, then further if nothing fits
const COAST = 60;     // how far the coastline runs from the first tee, on courses by the sea

// Where a hole sits: a hole point p maps to the map at (x, y) + p turned by `rot`.
export const toMap = (place, p) => {
  const c = Math.cos(place.rot), s = Math.sin(place.rot);
  return { x: place.x + p.x * c - p.y * s, y: place.y + p.x * s + p.y * c };
};
export const fromMap = (place, q) => {
  const c = Math.cos(place.rot), s = Math.sin(place.rot), dx = q.x - place.x, dy = q.y - place.y;
  return { x: dx * c + dy * s, y: -dx * s + dy * c };
};

// The ground a hole takes up, sampled every STEP yards: playable ground and sea.
function footprint(hole) {
  const b = holeBounds(hole, 0);
  const extra = hole.sea ? SEA_REACH : 0;
  const land = [], sea = [], beach = [];
  for (let y = b.minY - extra; y <= b.maxY + extra; y += STEP) {
    for (let x = b.minX - extra; x <= b.maxX + extra; x += STEP) {
      const s = surfaceAt(hole, { x, y }, true);
      if (s === 'sea') { if ((x + y) % (2 * STEP) === 0) sea.push({ x, y }); } // open sea needs less detail
      else if (s !== 'trees') land.push({ x, y });
      if (s === 'beach') beach.push({ x, y });
    }
  }
  // Which way the sea lies, from the tee to green line.
  let toSea = null;
  if (hole.sea) {
    const d = Math.hypot(hole.green.x, hole.green.y);
    toSea = { x: (-hole.green.y / d) * hole.sea.side, y: (hole.green.x / d) * hole.sea.side };
  }
  return { land, sea, beach, toSea };
}

const key = (i, j) => (i + 32768) * 65536 + (j + 32768);
const cellOf = (p) => [Math.round(p.x / STEP), Math.round(p.y / STEP)];

const cache = new Map();

// The layout for a course: { places: [{ x, y, rot }], coast, inland }, with a place per
// hole in yards on the map. On a course with holes by the sea, `coast` is a
// straight coastline: the sea lies where a map point q has
// q.x * u.x + q.y * u.y > c, and every hole stays on the land side of it, the
// seaside holes facing it with their beach along it. `inland` lists seaside
// holes that found no room on the coast; buildCourse moves them inland.
export function courseMap(course) {
  const id = `${course.style}:${course.seed}:${course.par}:${course.length}`;
  if (cache.has(id)) return cache.get(id);
  const r = makeRng((course.seed ?? 1) ^ 0x3c0a5e);
  const blocked = new Map(); // land plus the woods round it (cell -> hole number): nothing else goes here
  const wet = new Set();     // open sea: other sea may share it, land may not
  const places = [], inland = [], clashes = [];
  let lastGreen = null;
  let coast = null;
  if (course.holes.some((h) => h.sea)) {
    const a = r.range(0, Math.PI * 2);
    coast = { u: { x: Math.cos(a), y: Math.sin(a) }, c: COAST };
  }
  const seaward = (q) => (coast ? q.x * coast.u.x + q.y * coast.u.y - coast.c : -Infinity);

  course.holes.forEach((hole, n) => {
    const fp = footprint(hole);
    const greenAt = { x: hole.green.x, y: hole.green.y };
    let best = null;
    const tryPlace = (place, walk) => {
      const ok = best && best.clash === 0; // once something fits, anything that clashes is out
      let clash = 0, sx = 0, sy = 0;
      for (const p of fp.land) {
        const q = toMap(place, p);
        const k = key(...cellOf(q));
        const by = blocked.get(k);
        // The tee may sit in the woods round the green just played. Land stays
        // off the coast, except a seaside hole's, which may jut out as a headland.
        if ((by !== undefined && !(by === n - 1 && Math.hypot(p.x, p.y) < 45)) || wet.has(k) || seaward(q) > (fp.toSea ? 150 : -15)) {
          clash++;
          if (ok) return;
        }
        sx += q.x; sy += q.y;
      }
      for (const p of fp.sea) {
        if (blocked.has(key(...cellOf(toMap(place, p))))) { clash++; if (ok) return; }
      }
      // A seaside hole faces the sea with its beach on the coastline.
      let shore = 0;
      if (coast && !fp.toSea) {
        // Inland holes leave the coastline free for the seaside ones.
        for (const p of fp.land) if (seaward(toMap(place, p)) > -80) shore += 0.1;
      }
      if (coast && fp.toSea) {
        const c = Math.cos(place.rot), sn = Math.sin(place.rot);
        const facing = (fp.toSea.x * c - fp.toSea.y * sn) * coast.u.x + (fp.toSea.x * sn + fp.toSea.y * c) * coast.u.y;
        if (facing < 0.85) { clash += 50; if (ok) return; }
        if (fp.beach.length) {
          shore = Math.abs(fp.beach.reduce((t, p) => t + seaward(toMap(place, p)), 0) / fp.beach.length);
          if (shore > 50) { clash += 20; if (ok) return; }
        }
      }
      // Keep the course compact round the first tee, with short walks between holes.
      const mid = Math.hypot(sx / fp.land.length, sy / fp.land.length);
      const score = clash * 1e6 + mid + walk + 3 * shore + r.range(0, 40);
      if (!best || score < best.score) best = { place, score, clash };
    };
    const from = lastGreen ?? { x: 0, y: 0 };
    // The first tee is at (0, 0), facing whichever way fits best (inland, by the sea).
    if (!lastGreen) for (let t = 0; t < TURNS; t++) tryPlace({ x: 0, y: 0, rot: (t / TURNS) * Math.PI * 2 }, 0);
    if (coast && fp.toSea) {
      // Seaside holes also try spots along the coast, facing straight out to sea.
      const { u } = coast;
      const base = Math.atan2(u.y, u.x) - Math.atan2(fp.toSea.y, fp.toSea.x);
      const along0 = -from.x * u.y + from.y * u.x;
      for (const turn of [-0.15, 0, 0.15]) {
        const rot = base + turn, c = Math.cos(rot), sn = Math.sin(rot);
        const inward = fp.beach.reduce((t, p) => t + (p.x * c - p.y * sn) * u.x + (p.x * sn + p.y * c) * u.y, 0) / Math.max(1, fp.beach.length);
        const out = coast.c - inward;
        for (let k = -20; k <= 20; k++) {
          const along = along0 + k * 50;
          const tee = { x: u.x * out - u.y * along, y: u.y * out + u.x * along };
          tryPlace({ ...tee, rot }, Math.hypot(tee.x - from.x, tee.y - from.y));
        }
      }
    }
    if (lastGreen) {
      for (const walks of WALKS) {
        if (best?.clash === 0) break;
        for (const d of walks) {
          for (let a = 0; a < 12; a++) {
            const ang = (a / 12) * Math.PI * 2 + r.range(-0.2, 0.2);
            const tee = { x: lastGreen.x + Math.cos(ang) * d, y: lastGreen.y + Math.sin(ang) * d };
            for (let t = 0; t < TURNS; t++) tryPlace({ ...tee, rot: (t / TURNS) * Math.PI * 2 }, d);
          }
        }
      }
    }
    places.push(best.place);
    if (fp.toSea && best.clash > 0) inland.push(n); // no room on the coast: it plays inland instead
    if (best.clash > 0) clashes.push(n);
    lastGreen = toMap(best.place, greenAt);
    // Mark this hole's ground, with a strip of woods round its land.
    for (const p of fp.land) {
      const [i, j] = cellOf(toMap(best.place, p));
      for (let di = -GAP; di <= GAP; di++) {
        for (let dj = -GAP; dj <= GAP; dj++) {
          const k = key(i + di, j + dj);
          if (di * di + dj * dj <= GAP * GAP && !blocked.has(k)) blocked.set(k, n);
        }
      }
    }
    for (const p of fp.sea) wet.add(key(...cellOf(toMap(best.place, p))));
  });

  const map = { places, coast, inland, clashes };
  cache.set(id, map);
  return map;
}

// For drawing hole `index`: the other holes that come within `reach` yards of
// it, each with a function from this hole's yards to that hole's yards.
export function neighbours(course, index, reach = 400) {
  const { places } = courseMap(course);
  const here = places[index];
  const hb = holeBounds(course.holes[index], reach);
  const out = [];
  course.holes.forEach((hole, n) => {
    if (n === index) return;
    const there = places[n];
    const toThere = (p) => fromMap(there, toMap(here, p));
    const toHere = (p) => fromMap(here, toMap(there, p));
    // Rough overlap test: any corner of that hole's area inside this hole's reach.
    const b = holeBounds(hole, 0);
    const corners = [[b.minX, b.minY], [b.maxX, b.minY], [b.minX, b.maxY], [b.maxX, b.maxY], [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2]]
      .map(([x, y]) => toHere({ x, y }));
    const xs = corners.map((c) => c.x), ys = corners.map((c) => c.y);
    if (Math.max(...xs) < hb.minX || Math.min(...xs) > hb.maxX || Math.max(...ys) < hb.minY || Math.min(...ys) > hb.maxY) return;
    out.push({ hole, number: n + 1, bounds: b, toThere, toHere });
  });
  return out;
}

// The open sea beyond the coastline, for drawing: 'sea', 'beach' or null at a map point.
export function coastAt(coast, q) {
  if (!coast) return null;
  const { u, c } = coast;
  const along = -q.x * u.y + q.y * u.x;
  const out = q.x * u.x + q.y * u.y - c - 9 * Math.sin(along / 61) - 5 * Math.sin(along / 23 + 1.3);
  return out > 0 ? 'sea' : out > -9 ? 'beach' : null;
}

