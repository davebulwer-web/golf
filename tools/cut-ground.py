# Cuts the ground textures out of assets/ground/source-sheet.png (Dave's sheet of
# swatches) and turns each into a small seamless pixel texture, 32 x 16 game
# pixels: the middle of the swatch is shrunk 3.5x, its edges blended into the
# opposite side so it repeats without seams, and its colours trimmed.
# Writes assets/ground/<surface>.png.
# Run with: python3 tools/cut-ground.py (needs Pillow and numpy), then
# node tools/pack-assets.mjs and node tools/build.mjs.

from PIL import Image
import numpy as np

TW, TH, SHRINK, FEATHER = 32, 16, 3.5, 3
# The swatches in reading order, row by row, with the top edge of each row.
ROWS = [
    (181, ['land', 'rough', 'fairway', 'fringe', 'green', 'tee', 'trees']),
    (604, ['copse', 'bunker', 'waste', 'water', 'sea', 'beach']),
]

sheet = Image.open('assets/ground/source-sheet.png').convert('RGB')
a = np.array(sheet).astype(int)
ink = a.sum(2) < 700  # anything that isn't the white page
for top, names in ROWS:
    band = ink[top:top + 80]
    on = band.sum(0) > 40
    edges = np.flatnonzero(np.diff(np.r_[0, on.astype(int), 0]))
    spans = [(s, e) for s, e in zip(edges[::2], edges[1::2]) if e - s > 50]
    assert len(spans) == len(names), f'row at {top}: found {len(spans)} swatches'
    for name, (x0, x1) in zip(names, spans):
        ys = np.flatnonzero(ink[top - 10:top + 100, (x0 + x1) // 2]) + top - 10
        cx, cy = (x0 + x1) // 2, (ys[0] + ys[-1]) // 2
        # A little bigger than the texture, so the overlap can be blended away.
        w, h = round((TW + FEATHER) * SHRINK), round((TH + FEATHER) * SHRINK)
        big = sheet.crop((cx - w // 2, cy - h // 2, cx - w // 2 + w, cy - h // 2 + h))
        small = np.array(big.resize((TW + FEATHER, TH + FEATHER), Image.BOX)).astype(float)
        tex = small[:TH, :TW].copy()
        # Blend the strip past the right and bottom edges into the left and top.
        for k in range(FEATHER):
            f = (k + 0.5) / FEATHER
            tex[:, k] = small[:TH, TW + k] * (1 - f) + tex[:, k] * f
        for k in range(FEATHER):
            f = (k + 0.5) / FEATHER
            tex[k, :] = np.r_[small[TH + k, :TW]] * (1 - f) + tex[k, :] * f
        img = Image.fromarray(tex.clip(0, 255).astype('uint8'), 'RGB')
        img = img.quantize(colors=6, method=Image.Quantize.MEDIANCUT).convert('RGB')
        img.save(f'assets/ground/{name}.png')
        print(name, (cx, cy))
