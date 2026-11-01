// Hills and slopes. Each course gets rolling ground from smooth noise over the
// whole course map, so neighbouring holes meet at the same height. On each hole
// the ground is then shaped for golf: tees are flat, greens tilt gently one way,
// fairways are smoothed, bunkers are dug in and lakes lie flat in hollows.
// Heights are yards above the sea.

import { surfaceAt, holeBounds, blobGap, pointAt } from './course-generator.js';
import { toMap } from './course-map.js';

// How hilly each style is: yards from the bottom of a dip to the top of a rise,
// roughly, and how much small bumpiness there is on top (links have dunes).
const HILLS = {
  parkland: [13, 0.15], links: [9, 0.4], desert: [14, 0.25], heathland: [12, 0.2],
  alpine: [30, 0.15], tropical: [11, 0.15], woodland: [16, 0.15], stadium: [13, 0.3],
};
// Wavelengths in yards of the big rolls, the smaller rises, and the bumps.
const WAVES = [240, 90, 34];
const GROUND_STEP = 3; // yards between samples of a hole's shaped ground
const GREEN_TILT = [0.012, 0.035]; // how steep a green may be, rise over run
const BLEND = 3;       // samples over which shaped ground blends into the hills
// Behind a green the ground may only fall away gently, so a shot that runs
// through isn't sent tumbling down a bank into the woods or out of bounds. Out
// to BACKSTOP[0] yards past the green's edge it falls at most BACK_FALL yards
// per yard (well short of what sets a ball rolling, or speeds it up), then
// blends back into the hills by BACKSTOP[1]. Behind means within about 75
// degrees of the line the green is played along, as in course-map.js.
const BACKSTOP = [22, 34];
const BACK_FALL = 0.03;
const BACK_CONE = [0.1, 0.45]; // from no backstop to all of it, by how straight behind

const latticeHash = (i, j, k) => {
  let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const smooth = (t) => t * t * (3 - 2 * t);

// Smooth value noise in [-1, 1].
function noise(x, y, k) {
  const i = Math.floor(x), j = Math.floor(y), fx = smooth(x - i), fy = smooth(y - j);
  const a = latticeHash(i, j, k), b = latticeHash(i + 1, j, k), c = latticeHash(i, j + 1, k), d = latticeHash(i + 1, j + 1, k);
  return 2 * (a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy) - 1;
}

// The course's terrain settings, kept on each hole: where the hole sits on the
// map, the coastline (if any) and how hilly the style is.
export function terrainFor(course, place, coast) {
  const [amp, bumps] = HILLS[course.style] ?? HILLS.parkland;
  return { place, coast, amp, bumps, seed: (course.seed ?? 1) ^ 0x51ab7e };
}

// The rolling ground at map point q, before any shaping for golf. `smoothOnly`
// leaves out the small bumps (for fairways).
export function hillsAt(t, q, smoothOnly = false) {
  const { amp, bumps, seed } = t;
  let h = amp * (0.5 * noise(q.x / WAVES[0], q.y / WAVES[0], seed) + 0.22 * noise(q.x / WAVES[1], q.y / WAVES[1], seed + 1));
  if (!smoothOnly) h += amp * bumps * 0.12 * noise(q.x / WAVES[2], q.y / WAVES[2], seed + 2);
  h += amp * 0.75; // mostly above the sea
  if (t.coast) {
    // Down to the beach towards the coast.
    const out = q.x * t.coast.u.x + q.y * t.coast.u.y - t.coast.c;
    const f = smooth(Math.max(0, Math.min(1, (-out - 15) / 180)));
    h = 0.8 + (h - 0.8) * f;
  }
  return Math.max(0.8, h);
}

// The shaped ground for one hole, sampled every GROUND_STEP yards; built the
// first time it's needed and kept for a while, as the same course gets built
// again for each hole.
const grids = new Map();
function groundGrid(hole) {
  const t = hole.terrain;
  const id = `${hole.style}:${hole.seed}:${hole.number}:${t.seed}:${t.place.x}:${t.place.y}:${t.place.rot}:${!!hole.sea}`;
  if (hole.groundGrid?.id === id) return hole.groundGrid;
  if (grids.has(id)) return (hole.groundGrid = grids.get(id));
  const b = holeBounds(hole, 12);
  const x0 = b.minX, y0 = b.minY;
  const nx = Math.ceil((b.maxX - x0) / GROUND_STEP) + 1, ny = Math.ceil((b.maxY - y0) / GROUND_STEP) + 1;
  const n = nx * ny;
  const hills = new Float32Array(n), target = new Float32Array(n), weight = new Float32Array(n);
  const surf = new Array(n);
  const at = (i, j) => ({ x: x0 + i * GROUND_STEP, y: y0 + j * GROUND_STEP });
  const map = (p) => toMap(t.place, p);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i, p = at(i, j);
      hills[k] = hillsAt(t, map(p));
      surf[k] = surfaceAt(hole, p, true);
    }
  }

  // A green tilts one way, the way the hills fall, but gently.
  const gc = { x: hole.green.x, y: hole.green.y };
  const g0 = hillsAt(t, map(gc));
  let gx = (hillsAt(t, map({ x: gc.x + 4, y: gc.y })) - hillsAt(t, map({ x: gc.x - 4, y: gc.y }))) / 8;
  let gy = (hillsAt(t, map({ x: gc.x, y: gc.y + 4 })) - hillsAt(t, map({ x: gc.x, y: gc.y - 4 }))) / 8;
  const tilt = Math.hypot(gx, gy) || 1, want = Math.max(GREEN_TILT[0], Math.min(GREEN_TILT[1], tilt));
  if (tilt < 1e-6) gx = 1;
  gx *= want / tilt; gy *= want / tilt;
  const greenAt = (p) => g0 + 0.4 + gx * (p.x - gc.x) + gy * (p.y - gc.y);
  // Which way the green is played: along the last leg of the hole.
  const pts = hole.line.points, from = pts[pts.length - 2] ?? { x: 0, y: 0 };
  const playLen = Math.hypot(gc.x - from.x, gc.y - from.y) || 1;
  const play = { x: (gc.x - from.x) / playLen, y: (gc.y - from.y) / playLen };
  // How much of the backstop applies at p (0 to 1), and the lowest the ground may be there.
  const backstop = (p) => {
    const dx = p.x - gc.x, dy = p.y - gc.y, d = Math.hypot(dx, dy) || 1;
    const cone = smooth(Math.max(0, Math.min(1, ((dx * play.x + dy * play.y) / d - BACK_CONE[0]) / (BACK_CONE[1] - BACK_CONE[0]))));
    if (cone <= 0) return null;
    const out = Math.max(0, blobGap(hole.green, p));
    if (out >= BACKSTOP[1]) return null;
    const edge = { x: p.x - (dx / d) * out, y: p.y - (dy / d) * out };
    const w = cone * (out <= BACKSTOP[0] ? 1 : 1 - smooth((out - BACKSTOP[0]) / (BACKSTOP[1] - BACKSTOP[0])));
    return { w, floor: greenAt(edge) - 0.4 - BACK_FALL * out };
  };
  // Tees are flat at the height of the ground where they are.
  const teeAt = (p) => {
    let best = Infinity, h = 0;
    for (const s of Object.values(hole.tees ?? {})) {
      const q = pointAt(hole.line, s), d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < best) { best = d; h = hillsAt(t, map(q)); }
    }
    return h;
  };
  // A lake lies flat at the lowest ground it covers, so the land banks up round it.
  const lakes = hole.water.map(() => Infinity);
  for (let k = 0; k < n; k++) {
    if (surf[k] !== 'water') continue;
    const p = at(k % nx, Math.floor(k / nx));
    hole.water.forEach((w, wi) => { if (blobGap(w, p) <= 0) lakes[wi] = Math.min(lakes[wi], hills[k]); });
  }

  const hard = new Uint8Array(n); // ground that keeps its own height right to its edge
  for (let k = 0; k < n; k++) {
    const p = at(k % nx, Math.floor(k / nx)), s = surf[k];
    if (s === 'green' || s === 'fringe') { target[k] = greenAt(p); weight[k] = 1; }
    else if (s === 'tee') { target[k] = teeAt(p) + 0.4; weight[k] = 1; }
    else if (s === 'fairway') { target[k] = hillsAt(t, map(p), true); weight[k] = 0.8; }
    else if (s === 'water') {
      const wi = hole.water.findIndex((w) => blobGap(w, p) <= 0);
      target[k] = (wi >= 0 ? lakes[wi] : hills[k]) - 1; weight[k] = 1; hard[k] = 1; // creeks run in a cut
    } else if (s === 'sea') { target[k] = 0; weight[k] = 1; hard[k] = 1; }
    else if (s === 'beach') { target[k] = 0.6; weight[k] = 1; }
    else if (s === 'bunker') hard[k] = 1;
    // Behind the green, raise ground that falls away too steeply.
    if (s !== 'green' && s !== 'fringe' && !hard[k]) {
      const b = backstop(p);
      if (b && b.w > 0) {
        if (weight[k] > 0) {
          if (target[k] < b.floor) { target[k] += (b.floor - target[k]) * b.w; weight[k] = Math.max(weight[k], b.w); }
        } else if (hills[k] < b.floor) { target[k] = b.floor; weight[k] = b.w; }
      }
    }
  }

  // Blend the shaping into the hills round it.
  const tw = boxBlur(target.map((v, k) => v * weight[k]), nx, ny, BLEND);
  const wb = boxBlur(weight, nx, ny, BLEND);
  const h = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const w = Math.min(1, wb[k]);
    h[k] = wb[k] > 1e-4 ? hills[k] * (1 - w) + (tw[k] / wb[k]) * w : hills[k];
    if (hard[k] || surf[k] === 'green' || surf[k] === 'tee') h[k] = surf[k] === 'bunker' ? h[k] - 0.5 : target[k]; // bunkers are dug in
  }
  const grid = { id, x0, y0, nx, ny, h };
  if (grids.size > 60) grids.delete(grids.keys().next().value);
  grids.set(id, grid);
  return (hole.groundGrid = grid);
}

function boxBlur(src, nx, ny, r) {
  const a = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let j = 0; j < ny; j++) {
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += src[j * nx + Math.max(0, Math.min(nx - 1, i))];
    for (let i = 0; i < nx; i++) {
      a[j * nx + i] = sum / (2 * r + 1);
      sum += src[j * nx + Math.min(nx - 1, i + r + 1)] - src[j * nx + Math.max(0, i - r)];
    }
  }
  for (let i = 0; i < nx; i++) {
    let sum = 0;
    for (let j = -r; j <= r; j++) sum += a[Math.max(0, Math.min(ny - 1, j)) * nx + i];
    for (let j = 0; j < ny; j++) {
      out[j * nx + i] = sum / (2 * r + 1);
      sum += a[Math.min(ny - 1, j + r + 1) * nx + i] - a[Math.max(0, j - r) * nx + i];
    }
  }
  return out;
}

// Height of the ground at point p on a hole, in yards. Flat if the hole has no terrain.
export function heightAt(hole, p) {
  const t = hole.terrain;
  if (!t) return 0;
  const g = groundGrid(hole);
  const fx = (p.x - g.x0) / GROUND_STEP, fy = (p.y - g.y0) / GROUND_STEP;
  if (fx < 0 || fy < 0 || fx > g.nx - 1 || fy > g.ny - 1) return hillsAt(t, toMap(t.place, p));
  const i = Math.min(g.nx - 2, Math.floor(fx)), j = Math.min(g.ny - 2, Math.floor(fy));
  const u = fx - i, v = fy - j, k = j * g.nx + i;
  const { h } = g;
  return h[k] * (1 - u) * (1 - v) + h[k + 1] * u * (1 - v) + h[k + g.nx] * (1 - u) * v + h[k + g.nx + 1] * u * v;
}

// Which way and how steeply the ground rises at p: { x, y } in yards up per yard across.
export function slopeAt(hole, p, d = 1) {
  return {
    x: (heightAt(hole, { x: p.x + d, y: p.y }) - heightAt(hole, { x: p.x - d, y: p.y })) / (2 * d),
    y: (heightAt(hole, { x: p.x, y: p.y + d }) - heightAt(hole, { x: p.x, y: p.y - d })) / (2 * d),
  };
}

// How much higher (+) or lower (-) `to` is than `from`, in yards.
export const rise = (hole, from, to) => heightAt(hole, to) - heightAt(hole, from);
