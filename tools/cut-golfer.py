# Cuts the golfer's frames out of assets/golfer/source-sheet.png and shrinks
# them to game size. Every frame gets the same size of cell, placed so the
# middle of the golfer's shadow (between the feet) lands on the same pixel, so
# the frames line up when they play one after another. The shadow is kept as a
# see-through dark patch, so it works on any ground. The ball, drawn in a few
# frames, is left out (the game draws its own). Writes assets/golfer/<name>.png.
# Run with: python3 tools/cut-golfer.py (needs Pillow and numpy), then
# node tools/pack-assets.mjs and node tools/build.mjs.

from PIL import Image
import numpy as np

SHRINK = 4.5            # sheet pixels per game pixel
CELL = (180, 180)       # sheet pixels: the cell cut round each frame
FEET = (90, 160)        # where the middle of the shadow sits in the cell
SHADOW_ALPHA = 90       # how dark the shadow is, out of 255
BANDS = [(60, 240), (340, 478), (560, 722), (815, 952)]  # the sheet's rows of frames
# Names in reading order: left to right along each row of the sheet.
NAMES = [
    ['address', 'takeaway', 'backswing-1', 'backswing-2', 'downswing-1', 'downswing-2', 'impact',
     'follow-1', 'follow-2', 'finish'],
    ['idle-1', 'idle-2', 'idle-3', 'idle-4', 'walk-1', 'walk-2', 'walk-3', 'walk-4',
     'run-1', 'run-2', 'run-3', 'run-4'],
    ['reach', 'pick-up', 'stand-1', 'stand-2', 'happy-1', 'happy-2', 'happy-3', 'happy-4',
     'cross-1', 'cross-2', 'cross-3', 'cross-4'],
    ['putt-address', 'putt-back', 'putt-forward', 'putt-follow', 'look-around', 'shade-eyes',
     'point', 'club-shoulder'],
]


def runs(on, gap, least):
    """Stretches where `on` is true, allowing gaps of up to `gap`, at least `least` long."""
    out, start, last = [], None, None
    for i, x in enumerate(on):
        if x:
            start = i if start is None else start
            last = i
        elif start is not None and i - last > gap:
            if last - start >= least:
                out.append((start, last + 1))
            start = None
    if start is not None and last - start >= least:
        out.append((start, last + 1))
    return out


def components(mask):
    """Label 8-connected areas of a mask: (labels, sizes)."""
    lab = np.zeros(mask.shape, int)
    sizes = [0]
    for y, x in zip(*np.nonzero(mask)):
        if lab[y, x]:
            continue
        n = len(sizes)
        lab[y, x] = n
        stack, size = [(y, x)], 0
        while stack:
            cy, cx = stack.pop()
            size += 1
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < mask.shape[0] and 0 <= nx < mask.shape[1] and mask[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = n
                        stack.append((ny, nx))
        sizes.append(size)
    return lab, sizes


sheet = np.array(Image.open('assets/golfer/source-sheet.png').convert('RGB')).astype(int)
r, g, b = sheet[:, :, 0], sheet[:, :, 1], sheet[:, :, 2]
bright = sheet.max(axis=2)
lit = bright > 28
# The shadow under each golfer is dark green; nothing on the golfer is. Its
# core finds where the feet are; its soft edge, which fades to black, is
# shadow too.
core = lit & (g > r + 8) & (g > b + 4) & (bright < 120)
shadow = lit & (g >= r + 2) & (g >= b + 2) & (bright < 120)
# The golfer: anything clearly lit that isn't shadow.
body = (bright > 45) & ~shadow

# Pad the sheet so cells near its edge can be cut whole.
PAD = max(CELL)
pad = lambda m: np.pad(m, [(PAD, PAD), (PAD, PAD)] + [(0, 0)] * (m.ndim - 2))

for band, names in zip(BANDS, NAMES):
    y0, y1 = band
    cols = runs(lit[y0:y1].sum(0) > 0, 6, 30)
    assert len(cols) == len(names), f'band {band}: found {len(cols)} frames, expected {len(names)}'
    # Only this row of frames, not the labels or headings round it.
    rows = np.zeros(lit.shape, bool)
    rows[y0:y1] = True
    sheet_p, body_p, shadow_p = pad(sheet), pad(body & rows), pad(shadow & rows)
    for name, (x0, x1) in zip(names, cols):
        ys, xs = np.nonzero(core[y0:y1, x0:x1])
        cx, cy = x0 + (xs.min() + xs.max()) / 2, y0 + (ys.min() + ys.max()) / 2
        left, top = round(cx - FEET[0]) + PAD, round(cy - FEET[1]) + PAD
        cell = (slice(top, top + CELL[1]), slice(left, left + CELL[0]))
        cut = sheet_p[cell]
        # Keep only the golfer: the biggest lit area, plus any big pieces near
        # it (a club head drawn apart from its shaft). Small specks, like the
        # ball, and neighbouring frames poking into the cell are dropped.
        lab, sizes = components(body_p[cell])
        main = int(np.argmax(sizes))
        solid = lab == main
        mx = np.nonzero(solid)[1].mean()
        for n, s in enumerate(sizes):
            if n and n != main and s > 150 and abs(np.nonzero(lab == n)[1].mean() - mx) < 70:
                solid |= lab == n
        # The shadow round the feet, without any other frame's.
        slab, ssizes = components(shadow_p[cell])
        flat = slab == int(np.argmax(ssizes))
        w, h = round(CELL[0] / SHRINK), round(CELL[1] / SHRINK)
        rgb = np.where(solid[..., None], cut, 0).astype(float)
        al = np.array(Image.fromarray((solid * 255).astype('uint8')).resize((w, h), Image.BOX)) / 255
        colour = np.array(Image.fromarray(rgb.clip(0, 255).astype('uint8'), 'RGB').resize((w, h), Image.BOX)).astype(float)
        dark = np.array(Image.fromarray((flat * 255).astype('uint8')).resize((w, h), Image.BOX)) / 255
        px = colour / np.maximum(al, 1e-3)[..., None]
        keep = al > 0.45
        q = Image.fromarray(px.clip(0, 255).astype('uint8'), 'RGB').quantize(colors=14, method=Image.Quantize.MEDIANCUT).convert('RGB')
        out = np.zeros((h, w, 4), 'uint8')
        out[keep, :3] = np.array(q)[keep]
        out[keep, 3] = 255
        out[~keep & (dark > 0.4), 3] = SHADOW_ALPHA
        Image.fromarray(out, 'RGBA').save(f'assets/golfer/{name}.png')
    print(band, len(names), 'frames', w, 'x', h)
print('feet at', round(FEET[0] / SHRINK), round(FEET[1] / SHRINK))
