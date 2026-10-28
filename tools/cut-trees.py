# Cuts the trees out of assets/trees/source-sheet.png and shrinks them to game
# size: every tree by the same amount, colours trimmed to a small palette and
# edges made hard, so they come out as crisp pixel art. Writes assets/trees/<name>.png.
# Run with: python3 tools/cut-trees.py (needs Pillow and numpy), then
# node tools/pack-assets.mjs and node tools/build.mjs.

from PIL import Image
import numpy as np

SHRINK = 5.5  # sheet pixels per game pixel
# Names in reading order: left to right along each row of the sheet.
NAMES = [f'pine-{i}' for i in range(1, 11)] + [
    'bushy-1', 'oak-1', 'oak-2', 'oak-3', 'bushy-2', 'oak-4', 'willow', 'oak-5', 'oak-6',
    'oak-7', 'autumn-1', 'autumn-2', 'autumn-3', 'blossom', 'snowy', 'bare-1', 'bare-2',
    'palm-1', 'palm-2', 'palm-3', 'acacia', 'cypress-1', 'cypress-2', 'berry-bush', 'bush-1', 'bush-2',
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


sheet = Image.open('assets/trees/source-sheet.png').convert('RGBA')
a = np.array(sheet).astype(int)
# The trees themselves, without their soft shadows.
solid = (a[:, :, 3] > 160) & (a[:, :, :3].max(axis=2) > 45)
boxes = []
for y0, y1 in runs(solid.sum(1) > 2, 6, 20):
    for x0, x1 in runs(solid[y0:y1].sum(0) > 0, 4, 10):
        ys = np.where(solid[y0:y1, x0:x1].any(1))[0]
        boxes.append((x0, y0 + ys[0], x1, y0 + ys[-1] + 1))
assert len(boxes) == len(NAMES), f'found {len(boxes)} trees'

for name, (x0, y0, x1, y1) in zip(NAMES, boxes):
    c = np.array(sheet.crop((x0 - 2, y0 - 2, x1 + 2, y1 + 2))).astype(float)
    alpha = c[:, :, 3] / 255
    alpha[c[:, :, :3].max(axis=2) < 30] = 0
    w, h = max(1, round(c.shape[1] / SHRINK)), max(1, round(c.shape[0] / SHRINK))
    pre = np.dstack([c[:, :, k] * alpha for k in range(3)] + [alpha * 255])
    small = np.array(Image.fromarray(pre.clip(0, 255).astype('uint8'), 'RGBA').resize((w, h), Image.BOX)).astype(float)
    al = small[:, :, 3] / 255
    rgb = np.where(al[..., None] > 0, small[:, :, :3] / np.maximum(al, 1e-3)[..., None], 0).clip(0, 255)
    keep = al > 0.5
    flat = Image.fromarray(rgb.astype('uint8'), 'RGB').quantize(colors=10, method=Image.Quantize.MEDIANCUT).convert('RGB')
    Image.fromarray(np.dstack([np.array(flat), keep * 255]).astype('uint8'), 'RGBA').save(f'assets/trees/{name}.png')
    print(name, w, h)
