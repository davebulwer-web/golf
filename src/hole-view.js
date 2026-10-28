// Draws a whole hole as isometric pixel art into a packed pixel buffer.

import { holeToGrid, holeBounds, pointAt, surfaceAt, TEE_SETS } from './course-generator.js';
import { neighbours, courseMap, coastAt, toMap, fromMap } from './course-map.js';
import { fitView, makeView, liftPx } from './iso.js';
import { heightAt } from './terrain.js';
import { groundPalette, groundTextures, STYLE_ART, SPRITES, blit, recolor, hex } from './art.js';

// Yards per tile, most detailed first. The first one that fits the screen is used.
const CELLS = [3, 4, 5, 6, 8];

// Surfaces that sit below the grass (drawn with a lip on their far edge) and
// above it (drawn with a bank on their near edge).
const SUNKEN = new Set(['bunker', 'water', 'sea']);
const RAISED = new Set(['green', 'tee']);

// Steady noise from integer coordinates, in [0, 1).
export const hash = (a, b, k = 0) => {
  let h = Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(k, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// Pick the most detailed grid whose playable area fits in `box`, seen from `turn`
// quarter turns round.
export function layoutHole(hole, box, turn = 0) {
  let best;
  for (const cell of CELLS) {
    best = fitView(holeToGrid(hole, { cell }), box, (p) => heightAt(hole, p), turn);
    if (best.fits) break;
  }
  const { rows, cols, tiles } = best.view.grid;
  best.view.own = thinTrees({ c0: 0, r0: 0, rows, cols, tiles }, best.view.grid.cell);
  best.view.look = best.view.own;
  best.view.others = [];
  return best.view;
}

// The same view moved by (dx, dy) pixels, e.g. to draw into a bigger image with a margin.
export function shiftView(view, dx, dy) {
  return { ...makeView(view.grid, view.ox + dx, view.oy + dy, view.ground, view.turn), own: view.own, look: view.look, others: view.others, heights: view.heights };
}

// Every hole on the course in hole `index`'s yards: { hole, number, toHere }
// for each (this one included), and the corners of the ground they cover.
export function courseHoles(course, index) {
  const all = [{ hole: course.holes[index], number: index + 1, toHere: (p) => p }, ...neighbours(course, index, 1e6)];
  const corners = [];
  for (const o of all) {
    const b = holeBounds(o.hole, 0);
    for (const [x, y] of [[b.minX, b.minY], [b.maxX, b.minY], [b.minX, b.maxY], [b.maxX, b.maxY]]) corners.push(o.toHere({ x, y }));
  }
  return { all, corners };
}

// Yards per tile tried for the whole-course map, most detailed first.
const MAP_CELLS = [6, 8, 10, 12, 14, 16, 20, 24, 30, 36, 44];

// A view of the whole course, seen round hole `index` turned `turn` quarter
// turns, as big as fits in `box`. Returns the view, with addSurroundings done
// for a W x H picture.
export function courseView(course, index, box, W, H, turn = 0) {
  const hole = course.holes[index];
  const ground = (p) => heightAt(hole, p);
  const { corners } = courseHoles(course, index);
  let view, fit;
  for (const cell of MAP_CELLS) {
    view = makeView(holeToGrid(hole, { cell }), 0, 0, ground, turn);
    const pts = corners.map((p) => view.worldToScreen(p, 0));
    const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
    fit = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    if (fit.x1 - fit.x0 <= box.w && fit.y1 - fit.y0 <= box.h) break;
  }
  const ox = Math.round(box.x + box.w / 2 - (fit.x0 + fit.x1) / 2), oy = Math.round(box.y + box.h / 2 - (fit.y0 + fit.y1) / 2);
  const out = makeView(view.grid, ox, oy, ground, turn);
  const { rows, cols, tiles } = out.grid;
  out.own = thinTrees({ c0: 0, r0: 0, rows, cols, tiles }, out.grid.cell);
  out.look = out.own;
  out.others = [];
  addSurroundings(out, course, index, W, H, 1e6, piecePad(out.grid.cell));
  out.sparse = true;
  return out;
}

// What to draw at tile (col, row): a surface, or 'land' for open grass.
const lookAt = (look, c, r) => look.tiles[r - look.r0]?.[c - look.c0] ?? 'land';

// Beyond this hole's own band of woods is out of bounds, other holes included.
export function isOutOfBounds(view, p) {
  const t = view.grid.toTile(p);
  return lookAt(view.own, t.col, t.row) === 'land';
}

// Fill in everything around the hole that shows in a W x H image: the other
// holes of the course within `reach` yards (from the course map) and, on links,
// the open sea. `pad` is how many pixels past the edges to look: enough to see
// how far a tree is from open ground, so pieces of a bigger picture drawn
// one at a time thin their woods the same way and meet without a seam.
export function addSurroundings(view, course, index, W, H, reach = 400, pad = TILE_PAD) {
  const { grid } = view;
  const hole = course.holes[index];
  const others = neighbours(course, index, reach);
  const { places, coast } = courseMap(course);
  const ownBounds = holeBounds(hole, 0);
  // Raised ground further down can still show, so look past the bottom edge.
  const corners = [[-pad, -pad], [W + pad, -pad], [-pad, H + LOW + pad], [W + pad, H + LOW + pad]].map(([x, y]) => view.screenToTile(x, y));
  const c0 = Math.floor(Math.min(...corners.map((t) => t.col))) - 1, c1 = Math.ceil(Math.max(...corners.map((t) => t.col))) + 1;
  const r0 = Math.floor(Math.min(...corners.map((t) => t.row))) - 1, r1 = Math.ceil(Math.max(...corners.map((t) => t.row))) + 1;
  const tiles = [];
  const h = new Float32Array((r1 - r0 + 1) * (c1 - c0 + 1));
  const own = { ...view.own, tiles: view.own.tiles.map((row) => row.slice()) };
  for (let r = r0; r <= r1; r++) {
    const row = new Array(c1 - c0 + 1);
    for (let c = c0; c <= c1; c++) {
      const s = view.tileToScreen(c, r);
      let t = 'trees';
      const p = grid.toWorld(c, r);
      let z = null; // height, if it isn't this hole's own ground
      const shore = coastAt(coast, toMap(places[index], p)), seaward = shore === 'sea';
      if (s.x < -pad || s.x > W + pad || s.y < -pad || s.y > H + LOW + pad) t = 'land';
      else {
        const mine = grid.tiles[r]?.[c];
        if (mine && mine !== 'trees') t = mine;
        else if (!mine && hole.sea && p.x > ownBounds.minX && p.x < ownBounds.maxX && p.y > ownBounds.minY && p.y < ownBounds.maxY) {
          const here = surfaceAt(hole, p, true);
          if (here === 'sea' || here === 'beach') t = here;
        }
        if (t === 'trees') {
          for (const o of others) {
            const q = o.toThere(p), b = o.bounds;
            if (q.x < b.minX || q.x > b.maxX || q.y < b.minY || q.y > b.maxY) continue;
            const there = surfaceAt(o.hole, q, true);
            if (there !== 'trees') {
              t = there;
              z = heightAt(o.hole, q);
              break;
            }
          }
        }
        if (t === 'trees') {
          t = shore ?? 'trees';
          if (t === 'sea') z = 0;
          if (t === 'beach') z = 0.6;
        }
        // A hole's own beach runs along its own idea of the shore, which can
        // stick out across the course's coastline as a thin sand bar: out
        // there it's open sea.
        if (t === 'beach' && seaward) { t = 'sea'; z = 0; }
        // Other holes and the open sea are out of bounds.
        if (t !== 'trees' && (!mine || mine === 'trees') && own.tiles[r - own.r0]?.[c - own.c0]) own.tiles[r - own.r0][c - own.c0] = 'land';
      }
      row[c - c0] = t;
      h[(r - r0) * (c1 - c0 + 1) + c - c0] = z ?? heightAt(hole, p);
    }
    tiles.push(row);
  }
  const area = { c0, r0, rows: tiles.length, cols: c1 - c0 + 1 };
  view.look = thinTrees({ ...area, tiles }, grid.cell);
  view.others = others;
  view.events = course.tournament ? eventsFor(course, index, others) : [];
  view.own = own;
  view.heights = { ...area, h };
  // On this hole the ground is smooth; elsewhere it's the height of the tile drawn there.
  const ground = (p) => {
    const tl = grid.toTile(p);
    return lookAt(own, tl.col, tl.row) === 'land' ? tileHeight(view, Math.floor((p.x - grid.originX) / grid.cell), Math.floor((p.y - grid.originY) / grid.cell)) : heightAt(hole, p);
  };
  view.baseGround = (p) => heightAt(hole, p);
  Object.assign(view, makeView(grid, view.ox, view.oy, ground, view.turn));
}
const TILE_PAD = 24;
// Enough padding for addSurroundings to thin the woods the same way in every piece.
export const piecePad = (cell) => TILE_PAD + Math.ceil(WOODS_YARDS * 1.4 / cell + 2) * 8;
const LOW = 72; // pixels below the picture that raised ground could reach up from

// Height in yards of the tile drawn at (col, row).
function tileHeight(view, c, r) {
  const a = view.heights;
  if (a && r >= a.r0 && r < a.r0 + a.rows && c >= a.c0 && c < a.c0 + a.cols) return a.h[(r - a.r0) * a.cols + c - a.c0];
  return (view.baseGround ?? view.ground)(view.grid.toWorld(c, r));
}

// The generator fills everything outside the rough with trees. For drawing, keep
// a ragged band of woods along the hole and open grass beyond it (still trees for play).
const WOODS_YARDS = 22;
// `area` is { c0, r0, rows, cols, tiles } with tiles[r - r0][c - c0].
function thinTrees(area, cell) {
  const { c0, r0, rows, cols, tiles } = area;
  const far = new Int16Array(rows * cols).fill(-1);
  const queue = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (tiles[r][c] !== 'trees' && tiles[r][c] !== 'land') { far[r * cols + c] = 0; queue.push(r * cols + c); }
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const k = queue[q], r = Math.floor(k / cols), c = k % cols;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const rr = r + dr, cc = c + dc, kk = rr * cols + cc;
      if (rr < 0 || rr >= rows || cc < 0 || cc >= cols || far[kk] >= 0) continue;
      far[kk] = far[k] + 1;
      queue.push(kk);
    }
  }
  const out = tiles.map((row, r) => row.map((t, c) => {
    const depth = (WOODS_YARDS * (0.6 + 0.8 * hash((c + c0) >> 1, (r + r0) >> 1, 21))) / cell;
    return t === 'trees' && (far[r * cols + c] < 0 || far[r * cols + c] > depth) ? 'land' : t;
  }));
  return { c0, r0, rows, cols, tiles: out };
}

// The surface under every screen pixel, plus its tile and how much light it
// catches, for texturing. Tiles are drawn back to front, each raised to its
// height, with a bank of earth below it down to the tiles in front.
const LIT = 100;          // shade[] value for ground in full light
const SIDE = [70, 82];    // banks facing left and right
function sampleGround(view, W, H) {
  const names = [];
  const ids = new Map();
  const id = (s) => {
    if (!ids.has(s)) { ids.set(s, names.length); names.push(s); }
    return ids.get(s);
  };
  const surf = new Uint8Array(W * H).fill(id('land'));
  const tc = new Int16Array(W * H), tr = new Int16Array(W * H);
  const shade = new Uint8Array(W * H).fill(LIT);
  const { grid } = view;
  // The pixels of one tile, from its centre, and how far down each column reaches.
  const mask = [], bottom = new Map();
  const o = view.tileToScreen(0, 0);
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -5; dx <= 5; dx++) {
      const t = view.screenToTile(o.x + dx + 0.5, o.y + dy + 0.5);
      if (Math.round(t.col) !== 0 || Math.round(t.row) !== 0) continue;
      mask.push([dx, dy]);
      bottom.set(dx, Math.max(bottom.get(dx) ?? -9, dy));
    }
  }
  // Every tile that could show, back to front: in rows of equal u + v down the
  // screen, each tile at u - v across it.
  const [ua, va] = view.screenToUV(0, 0), [ub, vb] = view.screenToUV(W, H + LOW);
  const [uc, vc] = view.screenToUV(W, 0), [ud, vd] = view.screenToUV(0, H + LOW);
  const d0 = Math.floor(ua + va) - 2, d1 = Math.ceil(ub + vb) + 2;
  const e0 = Math.floor(ud - vd) - 2, e1 = Math.ceil(uc - vc) + 2;
  const at = (u, v) => view.fromUV(u, v);
  const heightUV = (u, v) => { const t = at(u, v); return tileHeight(view, t.col, t.row); };
  const lift = (u, v) => Math.round(liftPx(heightUV(u, v), grid.cell));
  for (let d = d0; d <= d1; d++) {
    for (let e = e0 + ((e0 + d) & 1); e <= e1; e += 2) {
      const u = (d + e) / 2, v = (d - e) / 2;
      const { col: c, row: r } = at(u, v);
      const s = lookAt(view.look, c, r), sid = id(s);
      const p = view.uvToScreen(u, v);
      const lp = lift(u, v);
      if (p.y - lp > H + 4 || p.x < -6 || p.x > W + 6) continue;
      // Light from the top left of the screen: ground rising down to the right
      // (along u) or down to the left (along v) faces it.
      let light = LIT;
      if (s !== 'water' && s !== 'sea') {
        const gu = (heightUV(u + 1, v) - heightUV(u - 1, v)) / (2 * grid.cell);
        const gv = (heightUV(u, v + 1) - heightUV(u, v - 1)) / (2 * grid.cell);
        const k = s === 'green' ? 7 : 3.5; // greens tilt gently, so show them more strongly
        const lit = Math.max(-0.3, Math.min(0.22, k * gu + 0.4 * k * gv));
        light = LIT + Math.round(lit / 0.05) * 5;
      }
      for (const [dx, dy] of mask) {
        const x = p.x + dx, y = p.y + dy - lp;
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        const k = y * W + x;
        surf[k] = sid; tc[k] = c; tr[k] = r; shade[k] = light;
      }
      // Banks down to the tiles in front, on the left and on the right.
      const dropL = lp - lift(u, v + 1), dropR = lp - lift(u + 1, v);
      for (const [dx, b] of bottom) {
        const drop = dx < 0 ? dropL : dropR;
        const x = p.x + dx;
        if (drop <= 0 || x < 0 || x >= W) continue;
        for (let y = p.y + b - lp + 1; y <= p.y + b - lp + drop; y++) {
          if (y < 0 || y >= H) continue;
          const k = y * W + x;
          surf[k] = sid; tc[k] = c; tr[k] = r; shade[k] = SIDE[dx < 0 ? 0 : 1];
        }
      }
    }
  }
  return { names, surf, tc, tr, shade };
}

// Mowing stripes across the hole, as how much darker the alternate stripes are.
const MOWN = { fairway: [1, 0.93], green: [0, 0.95] };

function paintGround(buf, W, H, style, g, origin) {
  const pal = groundPalette(style);
  const tex = groundTextures(style);
  const { names, surf, tr, shade } = g;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = y * W + x;
      const s = names[surf[k]];
      const edge = (pal[s] ?? pal.land)[2];
      // Each surface's texture repeats across the picture.
      const t = tex[s] ?? tex.land;
      const tx = (((x + origin.x) % t.w) + t.w) % t.w, ty = (((y + origin.y) % t.h) + t.h) % t.h;
      let c = t.px[ty * t.w + tx];
      const mown = MOWN[s];
      if (mown && (tr[k] >> mown[0]) & 1) c = dimmed(c, mown[1]);
      // Lips on the far side of bunkers and water, banks on the near side of greens and tees.
      if (SUNKEN.has(s) && y > 0 && surf[k - W] !== surf[k] && !SUNKEN.has(names[surf[k - W]])) c = edge;
      if (RAISED.has(s) && y < H - 1 && names[surf[k + W]] !== s) c = edge;
      if (shade[k] !== LIT) c = dimmed(c, shade[k] / LIT);
      buf[k] = c;
    }
  }
}

// A packed pixel made lighter or darker by factor f.
const dimmed = (c, f) => (c & 0xff000000) | (Math.min(255, ((c >>> 16) & 255) * f) << 16) | (Math.min(255, ((c >>> 8) & 255) * f) << 8) | Math.min(255, (c & 255) * f);

// The furniture round the hole, as { at (yards), name, clear (yards kept free
// of trees), face (the way it faces, for props drawn from four sides) }: a
// sign, bench, ball washer and bin by the back tees, behind the white tees
// played from so they don't crowd the golfers, all facing the tee; yardage
// posts at the edge of the fairway, a rake by some bunkers, and the clubhouse
// behind the 1st tee, facing down the hole.
function holeProps(hole) {
  const tee = Math.min(hole.tees.black + 4, hole.tees.white - 45);
  const side = (s, lat, name, clear = 7) => {
    const at = pointAt(hole.line, s, lat), mid = pointAt(hole.line, s, 0);
    return { at, name, clear, face: { x: mid.x - at.x, y: mid.y - at.y } };
  };
  const out = [
    side(tee, 12, 'hole-sign'), side(tee + 12, 13, 'bench'),
    side(tee + 2, -12, 'ball-washer'), side(tee + 9, -13, 'bin'),
  ];
  const dry = (q) => !['bunker', 'water', 'sea', 'beach'].includes(surfaceAt(hole, q.at));
  for (const d of [100, 150, 200]) {
    const s = hole.line.length - d;
    if (s > hole.tees.white + 60) out.push({ ...side(s, -(hole.fwHalf + 4), `post-${d}`, 2), face: null });
  }
  // A rake by about one bunker in three, lying in the rough just outside it,
  // never on the green or fairway.
  for (const b of hole.bunkers) {
    const bx = Math.round(b.x), by = Math.round(b.y);
    if (hash(bx, by, 40) > 0.35) continue;
    const a = Math.floor(hash(bx, by, 41) * 4) * Math.PI / 2;
    for (let k = 0; k < 8; k++) {
      const turn = hash(bx, by, 42) * Math.PI * 2 + (k * Math.PI) / 4;
      const at = { x: b.x + Math.cos(turn) * b.r * 1.2, y: b.y + Math.sin(turn) * b.r * 1.2 };
      if (surfaceAt(hole, at) !== 'rough') continue;
      out.push({ at, name: 'rake', clear: 2, face: { x: Math.cos(a), y: Math.sin(a) } });
      break;
    }
  }
  if (hole.number === 1) {
    const at = pointAt(hole.line, hole.tees.black - 38, 0), ahead = pointAt(hole.line, hole.tees.black, 0);
    out.push({ at, name: 'clubhouse', clear: 26, face: { x: ahead.x - at.x, y: ahead.y - at.y } });
  }
  return out.filter(dry);
}

// ---------- Tournaments ----------

// How many yards round each tournament building are kept clear of trees, and
// must be open ground (rough or woods, not a fairway, green, hazard or sea).
const EVENT_SIZE = {
  'stand-small': 10, 'stand-medium': 11, 'stand-large': 13, 'covered-stand': 13, 'long-stand': 15,
  'tv-tower': 7, tent: 9, scoreboard: 9, stage: 14, truss: 4, marquee: 18, arch: 7,
  leaderboard: 6, 'trophy-board': 6, banner: 4, rope: 4, barrier: 4, picket: 4, signpost: 3, flag: 2, feather: 2,
};
const eventSize = (name) => EVENT_SIZE[name] ?? EVENT_SIZE[name.split('-')[0]];
const OPEN_GROUND = new Set(['trees', 'rough']);

// The odds and ends a tournament spreads over the course, and how many holes
// get each on 18 holes: so a hole has a thing or two, not all of them. The 9th
// and 18th get some of their own besides (see eventPlan).
const EXTRAS = [['tv-tower', 2], ['tent', 2], ['leaderboard', 2], ['barrier', 4], ['banner', 8], ['flags', 4], ['feathers', 4]];

// Which extras each hole of a course gets: { [number]: Set }. Each kind goes to
// the holes with least on them so far, the course's own shuffle breaking ties.
function eventExtras(course) {
  const seed = (course.seed >>> 0) % 9973;
  const load = new Map(course.holes.map((h) => [h.number, new Set()]));
  const scale = course.holes.length / 18;
  EXTRAS.forEach(([kind, count], k) => {
    const order = course.holes.map((h) => h.number).filter((n) => n !== 1 && n % 9 !== 0)
      .sort((a, b) => load.get(a).size - load.get(b).size || hash(a, seed, 60 + k) - hash(b, seed, 60 + k));
    for (const n of order.slice(0, Math.round(count * scale))) load.get(n).add(kind);
  });
  return load;
}

// Where a tournament puts its stands and buildings on a hole: a list of
// { name, spots, face } with the places to try, best first, and which way
// it should face from a spot. Stands are the main thing: behind or beside most
// greens and always the 9th and 18th, and beside the tee on the par 3s and the
// 1st and 10th. The 9th and 18th have a TV tower and a leaderboard (a scoreboard
// on the 18th) and the 18th the presentation stage; the clubhouse by the 1st tee
// has the entrance arch, a marquee, tents, a trophy board and signposts; and
// `extras` says which of the odds and ends spread over the course go here.
function eventPlan(hole, extras, seed = 0) {
  const n = hole.number, g = hole.green, L = hole.line.length;
  const back = pointAt(hole.line, L - 30, 0);
  const d = Math.hypot(g.x - back.x, g.y - back.y) || 1;
  const ux = (g.x - back.x) / d, uy = (g.y - back.y) / d; // the way the hole plays into the green
  const r = g.r;
  const byGreen = (along, side) => ({ x: g.x + ux * along - uy * side, y: g.y + uy * along + ux * side });
  const toGreen = (p) => ({ x: g.x - p.x, y: g.y - p.y });
  const toTee = () => ({ x: -ux, y: -uy });
  const pick = (k, list) => list[Math.floor(hash(n, seed + k, 51) * list.length)];
  const plan = [];
  const add = (name, spots, face) => plan.push({ name, spots, face });
  // Beside the tee, `side` of the line (1 or -1), so many yards back from the front tee.
  const tee = hole.tees.black, teeMid = pointAt(hole.line, (tee + hole.tees.white) / 2, 0);
  const byTee = (back, side, out = 12) => pointAt(hole.line, tee - back, side * out);
  const toTeeMid = (p) => ({ x: teeMid.x - p.x, y: teeMid.y - p.y });
  if (n % 9 === 0 || hash(n, seed + 1, 50) < 0.75) {
    add(n % 9 === 0 ? pick(2, ['long-stand', 'covered-stand']) : pick(3, ['stand-small', 'stand-medium', 'stand-large', 'covered-stand']),
      [byGreen(r + 17, 0), byGreen(r + 12, r + 12), byGreen(r + 12, -r - 12), byGreen(0, r + 22), byGreen(0, -r - 22)], toGreen);
  }
  if (hole.par === 3 || n === 1 || n === 10) {
    const s = hole.tees.white + 8;
    const mid = pointAt(hole.line, s, 0);
    const toMid = (p) => ({ x: mid.x - p.x, y: mid.y - p.y });
    add(pick(4, ['stand-small', 'stand-medium']), [pointAt(hole.line, s, hole.fwHalf + 18), pointAt(hole.line, s, -hole.fwHalf - 18), pointAt(hole.line, s + 20, hole.fwHalf + 20)], toMid);
  }
  if (n % 9 === 0 || extras.has('tv-tower')) add('tv-tower', [byGreen(-r - 8, r + 20), byGreen(-r - 8, -r - 20), byGreen(r + 6, r + 18)], toGreen);
  if (n === 18) add('scoreboard', [byGreen(-r - 30, -r - 22), byGreen(-r - 30, r + 22), byGreen(-r - 45, r + 25)], toTee);
  if (n === 9 || extras.has('leaderboard')) add('leaderboard', [byGreen(-r - 24, -r - 16), byGreen(-r - 24, r + 16), byGreen(-r - 40, r + 18)], toTee);
  if (extras.has('tent')) add('tent', [byGreen(-r - 28, r + 24), byGreen(-r - 28, -r - 24)], toGreen);
  // A short line of crowd barriers along the back of the green.
  if (n === 18 || extras.has('barrier')) {
    const colour = pick(6, ['blue', 'white', 'green', 'picket']);
    const name = colour === 'picket' ? 'picket' : `barrier-${colour}`;
    for (const side of [-7, 7]) add(name, [byGreen(r + 6, side), byGreen(r + 9, side)], toGreen);
  }
  // A sponsor's banner by the tee or the green.
  if (extras.has('banner')) {
    const name = `banner-${pick(7, ['championship', 'golfer', 'freedom', 'golf', 'healthier'])}`;
    const s = hash(n, seed + 8, 51) < 0.5 ? 1 : -1;
    add(name, hash(n, seed + 9, 51) < 0.5
      ? [byTee(6, s), byTee(6, -s), byTee(14, s, 16)]
      : [byGreen(-r - 6, s * (r + 8)), byGreen(-r - 6, -s * (r + 8)), byGreen(r + 8, s * 10)], hash(n, seed + 9, 51) < 0.5 ? toTeeMid : toGreen);
  }
  // A row of flags, or of feather flags, beside the tee.
  for (const [kind, name, gap] of [['flags', 'flag', 6], ['feathers', 'feather', 5]]) {
    if (!extras.has(kind)) continue;
    const look = `${name}-${pick(10 + name.length, ['trophy', 'sponsor', 'clubs'])}`;
    const s = hash(n, seed + 12 + name.length, 51) < 0.5 ? 1 : -1;
    for (let k = 0; k < 3; k++) add(look, [byTee(2 + k * gap, s, 14), byTee(2 + k * gap, -s, 14)], toTeeMid);
  }
  if (n === 1 || n === 10) for (const s of [1, -1]) add('rope', [byTee(0, s, 13), byTee(3, s, 16), byTee(-3, s, 16)], toTeeMid);
  if (n === 1) {
    const club = pointAt(hole.line, tee - 38, 0);
    const toClub = (p) => ({ x: club.x - p.x, y: club.y - p.y });
    add('arch', [pointAt(hole.line, tee - 16, 0), pointAt(hole.line, tee - 14, 12)], toClub);
    add('marquee', [pointAt(hole.line, tee - 40, 50), pointAt(hole.line, tee - 40, -50), pointAt(hole.line, tee - 80, 30), pointAt(hole.line, tee - 80, -30)], toClub);
    add('tent', [pointAt(hole.line, tee - 15, 34), pointAt(hole.line, tee - 15, -34)], toClub);
    add('trophy-board', [pointAt(hole.line, tee - 24, -22), pointAt(hole.line, tee - 24, 22), pointAt(hole.line, tee - 30, -30)], toTeeMid);
    add('signpost-first-tee', [pointAt(hole.line, tee - 10, 9), pointAt(hole.line, tee - 10, -9)], toTeeMid);
    add('signpost-clubhouse', [pointAt(hole.line, tee - 22, 10), pointAt(hole.line, tee - 22, -10)], toTeeMid);
    add(pick(14, ['signpost-range', 'signpost-practice', 'signpost-parking']), [pointAt(hole.line, tee - 50, 14), pointAt(hole.line, tee - 50, -14)], toClub);
  }
  return plan;
}

const eventCache = new Map();

// The tournament stands and buildings for every hole of a course, each in its
// own hole's yards like holeProps: { at, name, clear, face }. A building only
// goes where all the ground it covers is open on every hole of the course, and
// clear of the other buildings and each hole's own furniture.
export function tournamentSites(course) {
  const id = `${course.style}:${course.seed}:${course.par}:${course.length}`;
  if (eventCache.has(id)) return eventCache.get(id);
  const { places, coast } = courseMap(course);
  const boxes = course.holes.map((h) => holeBounds(h, 0));
  const open = (m) => {
    if (coastAt(coast, m)) return false;
    return course.holes.every((h, j) => {
      const q = fromMap(places[j], m), b = boxes[j];
      if (q.x < b.minX || q.x > b.maxX || q.y < b.minY || q.y > b.maxY) return true;
      return OPEN_GROUND.has(surfaceAt(h, q));
    });
  };
  // Everything already standing, on the map: { m, size }.
  const taken = [];
  course.holes.forEach((h, i) => { for (const q of holeProps(h)) taken.push({ m: toMap(places[i], q.at), size: q.clear }); });
  const extras = eventExtras(course), seed = (course.seed >>> 0) % 9973;
  const out = course.holes.map((h, i) => {
    const sites = [];
    for (const want of eventPlan(h, extras.get(h.number), seed)) {
      const size = eventSize(want.name);
      for (const at of want.spots) {
        const m = toMap(places[i], at);
        if (taken.some((t) => Math.hypot(t.m.x - m.x, t.m.y - m.y) < (t.size + size) * 0.6)) continue;
        const ring = [[0, 0]];
        for (let k = 0; k < 8; k++) for (const f of [0.45, 0.85]) ring.push([Math.cos(k * Math.PI / 4) * size * f, Math.sin(k * Math.PI / 4) * size * f]);
        if (!ring.every(([dx, dy]) => open({ x: m.x + dx, y: m.y + dy }))) continue;
        taken.push({ m, size });
        sites.push({ at, name: want.name, clear: size, face: want.face(at) });
        break;
      }
    }
    return sites;
  });
  eventCache.set(id, out);
  return out;
}

// The tournament buildings that show on this view, in its hole's yards: its own
// and its neighbours'.
function eventsFor(course, index, others) {
  const sites = tournamentSites(course);
  const mine = sites[index];
  const theirs = others.flatMap((o) => sites[o.number - 1].map((q) => {
    const at = o.toHere(q.at), ahead = o.toHere({ x: q.at.x + q.face.x, y: q.at.y + q.face.y });
    return { ...q, at, face: { x: ahead.x - at.x, y: ahead.y - at.y } };
  }));
  return [...mine, ...theirs];
}

// Trees, bushes and cacti, and the hole's furniture, sorted back to front.
function paintScenery(buf, W, H, view, hole) {
  const art = STYLE_ART[hole.style] ?? STYLE_ART.parkland;
  // On the whole-course map the woods are thinned and the furniture and
  // tournament buildings left out (they'd be far too big), so the holes show up.
  const props = view.sparse ? [] : [...holeProps(hole), ...(view.events ?? [])];
  const thin = view.sparse ? 0.4 : 1;
  const clear = (p) => props.some((q) => Math.hypot(p.x - q.at.x, p.y - q.at.y) < q.clear);
  // Range of tiles that can show on screen, with room for wide sprites past the
  // sides and tall ones below the edge.
  const corners = [[-40, 0], [W + 40, 0], [-40, H + LOW + 20], [W + 40, H + LOW + 20]].map(([x, y]) => view.screenToTile(x, y));
  const c0 = Math.floor(Math.min(...corners.map((t) => t.col))), c1 = Math.ceil(Math.max(...corners.map((t) => t.col)));
  const r0 = Math.floor(Math.min(...corners.map((t) => t.row))), r1 = Math.ceil(Math.max(...corners.map((t) => t.row)));

  const items = [];
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const s = lookAt(view.look, c, r);
      const density = thin * (s === 'trees' ? art.density : s === 'copse' ? 0.35 : s === 'land' ? landDensity(art, c, r) : 0);
      if (!density || hash(c, r, 11) >= density || clear(view.grid.toWorld(c, r))) continue;
      const p = view.tileToScreen(c, r);
      p.y -= Math.round(liftPx(tileHeight(view, c, r), view.grid.cell));
      const kind = art.trees[Math.floor(hash(c, r, 12) * art.trees.length)];
      const x = p.x + Math.round((hash(c, r, 13) - 0.5) * 4), y = p.y + Math.round((hash(c, r, 14) - 0.5) * 2);
      if (x < -40 || x > W + 40 || y < -2 || y > H + 90) continue;
      items.push({ sprite: SPRITES[kind], x, y });
    }
  }
  for (const q of props) {
    const p = view.worldToScreen(q.at);
    if (p.x > -90 && p.x < W + 90 && p.y > -2 && p.y < H + 120) items.push({ sprite: SPRITES[propView(view, q)], x: Math.round(p.x), y: Math.round(p.y) });
  }
  items.sort((a, b) => a.y - b.y || a.x - b.x);
  for (const it of items) blit(buf, W, H, it.sprite, it.x, it.y);
}

// Which drawing of a prop to use, from the way it faces on screen: towards
// the viewer, its front; away, its back; facing left, its right side; facing
// right, its left side. Screen heights are squashed by half, hence the 2.
function propView(view, q) {
  if (!q.face || SPRITES[q.name]) return q.name;
  const d = view.worldDirToScreen(q.face.x, q.face.y);
  const side = Math.abs(d.x) > 2 * Math.abs(d.y) ? (d.x < 0 ? 'right' : 'left') : d.y > 0 ? 'front' : 'back';
  // Some are only drawn from some sides: then the nearest one drawn.
  const near = { front: ['front', 'right', 'left', 'back'], back: ['back', 'left', 'right', 'front'], right: ['right', 'front', 'back', 'left'], left: ['left', 'front', 'back', 'right'] }[side];
  return near.map((v) => `${q.name}-${v}`).find((name) => SPRITES[name]);
}

// Out on the open grass, trees grow in scattered clumps.
const landDensity = (art, c, r) => art.density * (hash(c >> 3, r >> 3, 31) < 0.3 ? 0.45 : 0.015);

// Tee markers and anything standing on the hole, e.g. golfers and balls.
function paintMarkers(buf, W, H, view, hole, actors) {
  const items = [];
  for (const t of TEE_SETS) {
    const at = view.worldToScreen(pointAt(hole.line, hole.tees[t.key]));
    for (const dx of [-5, 5]) items.push({ y: at.y, draw: () => blit(buf, W, H, SPRITES[`tee-${t.key}`], at.x + dx, at.y) });
  }
  // The flags are drawn over the top each frame, so they can wave.
  for (const a of actors) {
    const p = view.worldToScreen(a.at);
    if (a.ball) items.push({ y: p.y, draw: () => put(buf, W, H, p.x, p.y, hex('#ffffff')) });
    if (a.golfer) {
      const tint = recolor(SPRITES.golfer, { c: a.shirt });
      items.push({ y: p.y, draw: () => blit(buf, W, H, SPRITES.golfer, p.x - 3, p.y, tint) });
    }
  }
  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();
}

function put(buf, W, H, x, y, c) {
  x = Math.round(x); y = Math.round(y);
  if (x >= 0 && x < W && y >= 0 && y < H) buf[y * W + x] = c;
}

// Draw the hole into ImageData-sized buffer `buf` (Uint32Array of W x H).
// `actors` are things on the hole: { at: {x, y} in yards, golfer, ball, shirt }.
// `origin` is where this picture sits in a bigger one drawn in pieces, so the
// ground textures line up across them.
export function drawHole(buf, W, H, hole, view, actors = [], origin = { x: 0, y: 0 }) {
  const ground = sampleGround(view, W, H);
  paintGround(buf, W, H, hole.style, ground, origin);
  paintScenery(buf, W, H, view, hole);
  if (view.others.length) shadeOutOfBounds(buf, W, H, view, ground);
  if (!view.sparse) paintMarkers(buf, W, H, view, hole, actors);
}

// Darken everything out of bounds a little, so the hole being played stands out
// from its neighbours. The sea is left alone: it has its own edge.
function shadeOutOfBounds(buf, W, H, view, g) {
  const open = new Set(['sea', 'beach'].map((s) => g.names.indexOf(s)));
  for (let k = 0; k < W * H; k++) {
    if (open.has(g.surf[k]) || lookAt(view.own, g.tc[k], g.tr[k]) !== 'land') continue;
    const c = buf[k];
    const r = (c & 255) * 0.8, gr = ((c >>> 8) & 255) * 0.8, b = ((c >>> 16) & 255) * 0.82;
    buf[k] = (c & 0xff000000) | (b << 16) | (gr << 8) | r;
  }
}
