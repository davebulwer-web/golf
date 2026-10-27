// The game's take on the generator: more doglegs and more hazards than the
// management game, so shaping a shot round a corner or away from trouble pays.
// The generator itself is untouched. The tweaks below only change probabilities
// and sizes, never how many random numbers it draws, so every hole keeps its
// overall shape; the extra hazards come from their own random stream.

import { generateCourse, STYLES, makeRng, pointAt, blobGap, dist } from './course-generator.js';

for (const st of Object.values(STYLES)) {
  st.dogleg = Math.min(0.95, st.dogleg + 0.2);
  st.bend = Math.round(st.bend * 1.2);
  st.sharpDogleg = Math.min(0.5, (st.sharpDogleg ?? 0) * 2.5);
}

// Like the generator's blobs: a circle with a wobbly edge, stretched and turned.
function blob(r, x, y, R, amp = 0.22, stretch = [1, 1.5]) {
  const h = [];
  let left = amp;
  for (let k = 2; k <= 4 && left > 0.01; k++) {
    const a = k === 4 ? left : r.range(0.3, 0.7) * left;
    h.push([k, a, r.range(0, Math.PI * 2)]);
    left -= a;
  }
  return { x, y, r: R, rot: r.range(0, Math.PI), sx: r.range(...stretch), h };
}

export function buildCourse(def) {
  const course = generateCourse(def);
  for (const hole of course.holes) addHazards(hole);
  return course;
}

function addHazards(hole) {
  const st = STYLES[hole.style];
  const r = makeRng(hole.seed ^ 0x4a7a2d);
  const wet = st.water[1] + 0.15; // how often a style picks water over sand
  const clearOfGreen = (p, rad) => blobGap(hole.green, p) > rad + 3;
  const add = (p, rad, water) => {
    if (!clearOfGreen(p, rad)) return;
    if (water) hole.water.push(blob(r, p.x, p.y, rad, 0.28, [1, 1.7]));
    else hole.bunkers.push({ ...blob(r, p.x, p.y, rad, st.potBunkers ? 0.08 : 0.24, st.potBunkers ? [1, 1.15] : [1, 1.6]), greenside: false });
  };
  const bunkerR = () => r.range(...st.fwBunkerR) * 1.1;

  if (hole.par === 3) {
    // A second guard on the other side of the green, so the shape of the shot in matters.
    if (r.chance(0.6)) {
      const a = r.range(0, Math.PI * 2), rad = r.range(...st.gsBunkerR);
      const d = hole.green.r + rad * 0.7;
      add({ x: hole.green.x + Math.cos(a) * d, y: hole.green.y + Math.sin(a) * d }, rad, false);
    }
    return;
  }

  const pts = hole.line.points;
  const seg0 = hole.line.segs[0], seg1 = hole.line.segs[1];
  const turn = seg1 ? seg0.ux * seg1.uy - seg0.uy * seg1.ux : 0; // > 0 turns left
  if (Math.abs(turn) > 0.12) {
    // Dogleg: trouble on the inside to punish cutting the corner, and a bunker
    // straight through the corner to catch a shot that doesn't turn.
    const inside = turn > 0 ? 1 : -1; // pointAt's positive offset is to the left
    const bendS = seg0.len;
    const rad = r.range(12, 20);
    add(pointAt(hole.line, bendS - rad * 0.8, inside * (hole.fwHalf + rad * 0.5)), rad, r.chance(wet));
    const through = r.range(18, 32), rad2 = bunkerR();
    add({ x: pts[1].x + seg0.ux * through, y: pts[1].y + seg0.uy * through }, rad2, false);
  } else {
    // Straight hole: hazards either side of the driving zone, staggered, so the
    // safe line favours one shape over the other.
    const side = r.chance(0.5) ? 1 : -1;
    const s1 = Math.min(r.range(215, 250), hole.line.length * 0.6);
    const rad = r.range(10, 18);
    add(pointAt(hole.line, s1, side * (hole.fwHalf + rad * 0.4)), rad, r.chance(wet));
    add(pointAt(hole.line, s1 + r.range(20, 40), -side * (hole.fwHalf + 2)), bunkerR(), false);
  }
  // Par 5s get something to think about on the lay-up too.
  if (hole.par === 5) {
    const s = hole.line.length - r.range(90, 130);
    const p = pointAt(hole.line, s, (r.chance(0.5) ? 1 : -1) * hole.fwHalf * r.range(0.2, 0.9));
    if (dist(p, hole.green) > hole.green.r + 25) add(p, bunkerR(), r.chance(wet * 0.6));
  }
}
