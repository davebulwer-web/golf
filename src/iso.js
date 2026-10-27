// Isometric projection for a hole grid from holeToGrid.
// Each grid square is drawn as a diamond TW x TH pixels. Rows are flipped so the
// tee sits towards the bottom left of the screen and the green towards the top right.

export const TW = 8, TH = 4;

// A view places a grid on the screen. (ox, oy) is where the centre of tile
// col 0, flipped row 0 lands, in screen pixels.
export function makeView(grid, ox, oy) {
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
  // World yards (as used by the generator) to screen pixels.
  const worldToScreen = (p) => tileToScreen((p.x - originX) / cell - 0.5, (p.y - originY) / cell - 0.5);
  // A direction in world yards to a screen direction, in pixels per yard.
  const worldDirToScreen = (dx, dy) => ({ x: (dx + dy) / cell * TW / 2, y: (dx - dy) / cell * TH / 2 });

  return { grid, ox, oy, tileToScreen, screenToTile, worldToScreen, worldDirToScreen };
}

// Place a grid so its playable part (everything that isn't the tree margin) is
// centred in the box { x, y, w, h }. Returns the view and whether it fitted.
export function fitView(grid, box) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const probe = makeView(grid, 0, 0);
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      if (grid.tiles[row][col] === 'trees') continue;
      const s = probe.tileToScreen(col, row);
      minX = Math.min(minX, s.x - TW / 2); maxX = Math.max(maxX, s.x + TW / 2);
      minY = Math.min(minY, s.y - TH / 2); maxY = Math.max(maxY, s.y + TH / 2);
    }
  }
  const ox = Math.round(box.x + box.w / 2 - (minX + maxX) / 2);
  const oy = Math.round(box.y + box.h / 2 - (minY + maxY) / 2);
  return { view: makeView(grid, ox, oy), fits: maxX - minX <= box.w && maxY - minY <= box.h };
}
