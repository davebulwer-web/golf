# Cuts the pop-up pictures (BIRDIE, BUNKER, OUT OF BOUNDS...) out of
# assets/popups/source-sheet.png and shrinks them to game size: every picture
# by the same amount, colours trimmed to a small palette, edges made hard and a
# dark outline added so they read over any ground. Writes assets/popups/pop-<name>.png.
# Run with: python3 tools/cut-popups.py (needs Pillow and numpy), then
# node tools/pack-assets.mjs and node tools/build.mjs.

from PIL import Image
import numpy as np

SHRINK = 3.4             # sheet pixels per game pixel
OUTLINE = (24, 14, 20)   # the dark edge round each picture
# The sheet's rows of pictures: where each row is, how far apart its pictures
# are at least, and their names from left to right.
ROWS = [
    ((95, 320), 25, ['holeinone', 'albatross', 'eagle']),
    ((355, 525), 25, ['birdie', 'par', 'bogey']),
    ((556, 690), 25, ['double', 'triple']),
    ((741, 880), 12, ['bunker', 'water', 'ob']),
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


sheet = np.array(Image.open('assets/popups/source-sheet.png').convert('RGB')).astype(float)
lit = sheet.max(axis=2)
for (y0, y1), gap, names in ROWS:
    cols = runs((lit[y0:y1] > 40).sum(0) > 0, gap, 40)
    assert len(cols) == len(names), f'rows {y0}-{y1}: found {len(cols)} pictures, expected {len(names)}'
    for name, (x0, x1) in zip(names, cols):
        ys = np.nonzero((lit[y0:y1, x0:x1] > 40).any(1))[0]
        top, bottom = y0 + ys[0], y0 + ys[-1] + 1
        c = sheet[top - 2:bottom + 2, x0 - 2:x1 + 2]
        # How solid each pixel is, from how far it stands out from the black page.
        alpha = ((c.max(axis=2) - 30) / 50).clip(0, 1)
        w, h = round(c.shape[1] / SHRINK), round(c.shape[0] / SHRINK)
        pre = np.dstack([c[:, :, k] * alpha for k in range(3)] + [alpha * 255])
        small = np.array(Image.fromarray(pre.clip(0, 255).astype('uint8'), 'RGBA').resize((w, h), Image.BOX)).astype(float)
        al = small[:, :, 3] / 255
        rgb = (small[:, :, :3] / np.maximum(al, 1e-3)[..., None]).clip(0, 255)
        keep = al > 0.4
        flat = np.array(Image.fromarray(rgb.astype('uint8'), 'RGB').quantize(colors=24, method=Image.Quantize.MEDIANCUT).convert('RGB'))
        out = np.zeros((h + 2, w + 2, 4), 'uint8')
        solid = np.zeros((h + 2, w + 2), bool)
        solid[1:-1, 1:-1] = keep
        out[1:-1, 1:-1, :3] = flat
        out[solid, 3] = 255
        # A one pixel dark edge all round.
        edge = np.zeros_like(solid)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                edge |= np.roll(np.roll(solid, dy, 0), dx, 1)
        edge &= ~solid
        out[edge, :3] = OUTLINE
        out[edge, 3] = 255
        Image.fromarray(out, 'RGBA').save(f'assets/popups/pop-{name}.png')
        print(name, w + 2, h + 2)
