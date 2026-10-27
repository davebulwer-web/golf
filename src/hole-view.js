// Draws a whole hole as isometric pixel art into a packed pixel buffer.

import { holeToGrid, holeBounds, pointAt, surfaceAt, TEE_SETS } from './course-generator.js';
import { neighbours, courseMap, coastAt, toMap } from './course-map.js';
import { fitView, makeView } from './iso.js';
import { groundPalette, STYLE_ART, SPRITES, blit, recolor, hex } from './art.js';

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

// Pick the most detailed grid whose playable area fits in `box`.
export function layoutHole(hole, box) {
  let best;
  for (const cell of CELLS) {
    best = fitView(holeToGrid(hole, { cell }), box);
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
  return { ...makeView(view.grid, view.ox + dx, view.oy + dy), own: view.own, look: view.look, others: view.others };
}

// What to draw at tile (col, row): a surface, or 'land' for open grass.
const lookAt = (look, c, r) => look.tiles[r - look.r0]?.[c - look.c0] ?? 'land';

// Beyond this hole's own band of woods is out of bounds, other holes included.
export function isOutOfBounds(view, p) {
  const t = view.grid.toTile(p);
  return lookAt(view.own, t.col, t.row) === 'land';
}

// Fill in everything around the hole that shows in a W x H image: the other
// holes of the course nearby (from the course map) and, on links, the open sea.
export function addSurroundings(view, course, index, W, H) {
  const { grid } = view;
  const hole = course.holes[index];
  const others = neighbours(course, index);
  const { places, coast } = courseMap(course);
  const ownBounds = holeBounds(hole, 0);
  const corners = [[0, 0], [W, 0], [0, H + 16], [W, H + 16]].map(([x, y]) => view.screenToTile(x, y));
  const c0 = Math.floor(Math.min(...corners.map((t) => t.col))) - 1, c1 = Math.ceil(Math.max(...corners.map((t) => t.col))) + 1;
  const r0 = Math.floor(Math.min(...corners.map((t) => t.row))) - 1, r1 = Math.ceil(Math.max(...corners.map((t) => t.row))) + 1;
  const tiles = [];
  const own = { ...view.own, tiles: view.own.tiles.map((row) => row.slice()) };
  for (let r = r0; r <= r1; r++) {
    const row = new Array(c1 - c0 + 1);
    for (let c = c0; c <= c1; c++) {
      const s = view.tileToScreen(c, r);
      let t = 'trees';
      if (s.x < -TILE_PAD || s.x > W + TILE_PAD || s.y < -TILE_PAD || s.y > H + 3 * TILE_PAD) t = 'land';
      else {
        const mine = grid.tiles[r]?.[c];
        const p = grid.toWorld(c, r);
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
              break;
            }
          }
        }
        if (t === 'trees') t = coastAt(coast, toMap(places[index], p)) ?? 'trees';
        // Other holes and the open sea are out of bounds.
        if (t !== 'trees' && (!mine || mine === 'trees') && own.tiles[r - own.r0]?.[c - own.c0]) own.tiles[r - own.r0][c - own.c0] = 'land';
      }
      row[c - c0] = t;
    }
    tiles.push(row);
  }
  view.look = thinTrees({ c0, r0, rows: tiles.length, cols: c1 - c0 + 1, tiles }, grid.cell);
  view.others = others;
  view.own = own;
}
const TILE_PAD = 24;

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

// The surface under every screen pixel, plus its tile, for texturing.
function sampleGround(view, W, H) {
  const names = [];
  const ids = new Map();
  const id = (s) => {
    if (!ids.has(s)) { ids.set(s, names.length); names.push(s); }
    return ids.get(s);
  };
  const surf = new Uint8Array(W * H);
  const tc = new Int16Array(W * H), tr = new Int16Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = view.screenToTile(x + 0.5, y + 0.5);
      const c = Math.round(t.col), r = Math.round(t.row);
      const k = y * W + x;
      surf[k] = id(lookAt(view.look, c, r));
      tc[k] = c; tr[k] = r;
    }
  }
  return { names, surf, tc, tr };
}

function paintGround(buf, W, H, style, g) {
  const pal = groundPalette(style);
  const { names, surf, tc, tr } = g;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = y * W + x;
      const s = names[surf[k]];
      const [base, alt, edge] = pal[s] ?? pal.land;
      let c = base;
      switch (s) {
        case 'fairway': c = (tr[k] >> 1) & 1 ? alt : base; break; // mowing stripes across the hole
        case 'green': case 'tee': c = tr[k] & 1 ? alt : base; break;
        case 'water': case 'sea': c = hash(x >> 2, y, 7) < 0.05 ? alt : base; break; // ripples
        case 'bunker': case 'beach': case 'waste': c = hash(x, y, 3) < 0.14 ? alt : base; break;
        case 'fringe': break;
        default: c = hash(x, y, 1) < 0.28 ? alt : base; // grassy speckle
      }
      // Lips on the far side of bunkers and water, banks on the near side of greens and tees.
      if (SUNKEN.has(s) && y > 0 && surf[k - W] !== surf[k] && !SUNKEN.has(names[surf[k - W]])) c = edge;
      if (RAISED.has(s) && y < H - 1 && names[surf[k + W]] !== s) c = edge;
      buf[k] = c;
    }
  }
}

// Trees, bushes and cacti, sorted back to front.
function paintScenery(buf, W, H, view, style) {
  const art = STYLE_ART[style] ?? STYLE_ART.parkland;
  // Range of tiles that can show on screen, with room for tall sprites below the edge.
  const corners = [[0, 0], [W, 0], [0, H + 16], [W, H + 16]].map(([x, y]) => view.screenToTile(x, y));
  const c0 = Math.floor(Math.min(...corners.map((t) => t.col))), c1 = Math.ceil(Math.max(...corners.map((t) => t.col)));
  const r0 = Math.floor(Math.min(...corners.map((t) => t.row))), r1 = Math.ceil(Math.max(...corners.map((t) => t.row)));

  const items = [];
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const s = lookAt(view.look, c, r);
      const density = s === 'trees' ? art.density : s === 'copse' ? 0.85 : s === 'land' ? landDensity(art, c, r) : 0;
      if (!density || hash(c, r, 11) >= density) continue;
      const p = view.tileToScreen(c, r);
      const kind = art.trees[Math.floor(hash(c, r, 12) * art.trees.length)];
      const x = p.x + Math.round((hash(c, r, 13) - 0.5) * 4), y = p.y + Math.round((hash(c, r, 14) - 0.5) * 2);
      if (x < -10 || x > W + 10 || y < -2 || y > H + 16) continue;
      items.push({ sprite: SPRITES[kind], x, y });
    }
  }
  items.sort((a, b) => a.y - b.y || a.x - b.x);
  for (const it of items) blit(buf, W, H, it.sprite, it.x, it.y);
}

// Out on the open grass, trees grow in scattered clumps.
const landDensity = (art, c, r) => art.density * (hash(c >> 3, r >> 3, 31) < 0.3 ? 0.45 : 0.015);

// Tee markers and anything standing on the hole, e.g. golfers and balls.
function paintMarkers(buf, W, H, view, hole, actors) {
  const items = [];
  for (const t of TEE_SETS) {
    const at = view.worldToScreen(pointAt(hole.line, hole.tees[t.key]));
    const col = hex(t.color), dark = hex('#1a1a1a');
    for (const dx of [-3, 3]) items.push({ y: at.y, draw: () => { put(buf, W, H, at.x + dx, at.y, col); put(buf, W, H, at.x + dx, at.y + 1, dark); } });
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
export function drawHole(buf, W, H, hole, view, actors = []) {
  const ground = sampleGround(view, W, H);
  paintGround(buf, W, H, hole.style, ground);
  paintScenery(buf, W, H, view, hole.style);
  if (view.others.length) shadeOutOfBounds(buf, W, H, view, ground);
  paintMarkers(buf, W, H, view, hole, actors);
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
