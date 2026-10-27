// Isometric projection for a hole grid from holeToGrid.
// Each grid square is drawn as a diamond TW x TH pixels. Rows are flipped so the
// tee sits towards the bottom left of the screen and the green towards the top right.

export const TW = 8, TH = 4;

// Yards of height to pixels up the screen, on a grid of `cell`-yard tiles.
export const liftPx = (h, cell) => h / cell * TH * 1.5;

// A view places a grid on the screen. (ox, oy) is where the centre of tile
// col 0, flipped row 0 lands, in screen pixels. `ground(p)` is the height of
// the ground in yards at world point p (flat if left out).
export function makeView(grid, ox, oy, ground = () => 0) {
  const { rows, cell, originX, originY } = grid;
  const flip = (row) => rows - 1 - row;

  // Fractional tile position to screen pixels (tile centres are whole numbers).
  const tileToScreen = (col, row) => {
    const rp = flip(row);
    return { x: ox + (col - rp) * TW / 2, y: oy + (col + rp) * TH / 2 };
  };
  // Screen pixels to fractional tile position; round both to get the tile under a pixel.
  const screenToTile = (x, y) => {
    const u = (x - ox) / (TW / 2), v = (y - oy) / (TH / 2);
    return { col: (u + v) / 2, row: flip((v - u) / 2) };
  };
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
  const worldDirToScreen = (dx, dy) => ({ x: (dx + dy) / cell * TW / 2, y: (dx - dy) / cell * TH / 2 });

  return { grid, ox, oy, ground, tileToScreen, screenToTile, worldToScreen, screenToWorld, worldDirToScreen };
}

// Place a grid so its playable part (everything that isn't the tree margin) is
// centred in the box { x, y, w, h }, with the ground raised by `ground`.
// Returns the view and whether it fitted.
export function fitView(grid, box, ground = () => 0) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const probe = makeView(grid, 0, 0);
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
  return { view: makeView(grid, ox, oy, ground), fits: maxX - minX <= box.w && maxY - minY <= box.h };
}
