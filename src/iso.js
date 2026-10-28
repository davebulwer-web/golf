// Isometric projection for a hole grid from holeToGrid.
// Each grid square is drawn as a diamond TW x TH pixels. Unturned, rows are
// flipped so the tee sits towards the bottom left of the screen and the green
// towards the top right; the view can turn round the hole a quarter at a time.

export const TW = 8, TH = 4;

// Yards of height to pixels up the screen, on a grid of `cell`-yard tiles.
export const liftPx = (h, cell) => h / cell * TH * 1.5;

// Screen axes (u, v) for a tile (col, row), and back, for each quarter turn.
// u runs down to the right on screen and v down to the left, so tiles with a
// bigger u + v are nearer the viewer.
const QUARTER_TURNS = [
  [(c, r, C, R) => [c, R - r], (u, v, C, R) => [u, R - v]],
  [(c, r, C, R) => [R - r, C - c], (u, v, C, R) => [C - v, R - u]],
  [(c, r, C, R) => [C - c, r], (u, v, C, R) => [C - u, v]],
  [(c, r) => [r, c], (u, v) => [v, u]],
];

// A view places a grid on the screen, turned `turn` quarter turns (0 to 3).
// (ox, oy) is where the centre of the tile at u = v = 0 lands, in screen pixels.
// `ground(p)` is the height of the ground in yards at world point p (flat if left out).
export function makeView(grid, ox, oy, ground = () => 0, turn = 0) {
  const { rows, cols, cell, originX, originY } = grid;
  const [uv, cr] = QUARTER_TURNS[turn & 3];
  const toUV = (col, row) => uv(col, row, cols - 1, rows - 1);
  const fromUV = (u, v) => { const [col, row] = cr(u, v, cols - 1, rows - 1); return { col, row }; };

  // Fractional tile position to screen pixels (tile centres are whole numbers).
  const uvToScreen = (u, v) => ({ x: ox + (u - v) * TW / 2, y: oy + (u + v) * TH / 2 });
  const tileToScreen = (col, row) => uvToScreen(...toUV(col, row));
  // Screen pixels to fractional tile position; round both to get the tile under a pixel.
  const screenToUV = (x, y) => {
    const a = (x - ox) / (TW / 2), b = (y - oy) / (TH / 2);
    return [(a + b) / 2, (b - a) / 2];
  };
  const screenToTile = (x, y) => fromUV(...screenToUV(x, y));
  // World yards (as used by the generator) to screen pixels, on the ground or
  // at height z yards.
  const flatToScreen = (p) => tileToScreen((p.x - originX) / cell - 0.5, (p.y - originY) / cell - 0.5);
  const worldToScreen = (p, z = ground(p)) => {
    const s = flatToScreen(p);
    s.y -= liftPx(z, cell);
    return s;
  };
  // Screen pixels to world yards, on the ground: look a little further down the
  // screen for ground that's raised up to this pixel.
  const flatToWorld = (x, y) => {
    const t = screenToTile(x, y);
    return { x: originX + (t.col + 0.5) * cell, y: originY + (t.row + 0.5) * cell };
  };
  const screenToWorld = (x, y) => {
    let p = flatToWorld(x, y);
    for (let k = 0; k < 6; k++) p = flatToWorld(x, y + liftPx(ground(p), cell));
    return p;
  };
  // A direction in world yards to a screen direction, in pixels per yard.
  const worldDirToScreen = (dx, dy) => {
    const a = tileToScreen(0, 0), b = tileToScreen(dx / cell, dy / cell);
    return { x: b.x - a.x, y: b.y - a.y };
  };

  return { grid, ox, oy, ground, turn: turn & 3, toUV, fromUV, uvToScreen, screenToUV, tileToScreen, screenToTile, worldToScreen, screenToWorld, worldDirToScreen };
}

// Place a grid so its playable part (everything that isn't the tree margin) is
// centred in the box { x, y, w, h }, with the ground raised by `ground`.
// Returns the view and whether it fitted.
export function fitView(grid, box, ground = () => 0, turn = 0) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const probe = makeView(grid, 0, 0, ground, turn);
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      if (grid.tiles[row][col] === 'trees') continue;
      const s = probe.tileToScreen(col, row);
      s.y -= liftPx(ground(grid.toWorld(col, row)), grid.cell);
      minX = Math.min(minX, s.x - TW / 2); maxX = Math.max(maxX, s.x + TW / 2);
      minY = Math.min(minY, s.y - TH / 2); maxY = Math.max(maxY, s.y + TH / 2);
    }
  }
  const ox = Math.round(box.x + box.w / 2 - (minX + maxX) / 2);
  const oy = Math.round(box.y + box.h / 2 - (minY + maxY) / 2);
  return { view: makeView(grid, ox, oy, ground, turn), fits: maxX - minX <= box.w && maxY - minY <= box.h };
}
