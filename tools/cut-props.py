# Cuts the course props (flag, balls, tee markers, cacti, gorse, heather, posts,
# bench...) out of assets/props/source-sheet.png and shrinks them to game size.
# The sheet's background is plain grass green, so a prop is whatever differs
# from it, plus anything its dark outline encloses (gorse leaves are as green
# as the grass). The soft dark green shadow under a prop is kept as a
# see-through dark patch, so it works on any ground. Writes assets/props/<name>.png.
# Run with: python3 tools/cut-props.py (needs Pillow and numpy), then
# node tools/pack-assets.mjs and node tools/build.mjs.

from PIL import Image
import numpy as np

BACKGROUND = (59, 121, 41)
SHADOW_ALPHA = 90
# Each prop: its box on the sheet (left, top, right, bottom) and how many
# sheet pixels make a game pixel. 5.7 puts props at the scale of the sheet's
# reference golfer; small things are shrunk further so they don't crowd the course.
PROPS = {
    **{f'flag-{i + 1}': (box, 5.7) for i, box in enumerate([(25, 60, 130, 222), (148, 65, 250, 222), (270, 68, 375, 222), (395, 68, 505, 222)])},
    **{f'ball-{i + 1}': (box, 8) for i, box in enumerate([(615, 148, 665, 185), (700, 128, 765, 187), (795, 110, 885, 192)])},
    **{f'tee-{c}': (box, 10) for c, box in zip(['red', 'blue', 'white', 'yellow', 'black'],
                                               [(1012, 115, 1072, 185), (1108, 115, 1168, 185), (1203, 115, 1263, 185), (1300, 115, 1360, 185), (1395, 115, 1455, 185)])},
    **{f'cactus-{i + 1}': (box, 8) for i, box in enumerate([(45, 290, 150, 420), (185, 290, 285, 420), (350, 290, 460, 420)])},
    **{f'gorse-{i + 1}': (box, 8) for i, box in enumerate([(540, 295, 680, 415), (700, 305, 820, 415), (840, 275, 980, 420)])},
    **{f'heather-{i + 1}': (box, 9) for i, box in enumerate([(1052, 305, 1200, 415), (1218, 318, 1340, 415), (1362, 300, 1495, 415)])},
    **{f'post-{n}': (box, 11) for n, box in zip([100, 150, 200], [(35, 510, 140, 665), (165, 510, 275, 665), (310, 510, 420, 665)])},
    'hole-sign': ((462, 490, 655, 700), 9),
    'bench': ((690, 535, 925, 700), 9),
    'ball-washer': ((990, 505, 1120, 700), 9),
    'bin': ((1180, 545, 1305, 690), 9),
    'rake': ((1350, 488, 1510, 685), 9),
    'clubhouse': ((28, 755, 515, 975), 5.7),
}


def fill_holes(mask):
    """The mask plus every gap in it that doesn't reach the edge."""
    outside = np.zeros(mask.shape, bool)
    stack = [(y, x) for y in range(mask.shape[0]) for x in (0, mask.shape[1] - 1)] + \
            [(y, x) for x in range(mask.shape[1]) for y in (0, mask.shape[0] - 1)]
    while stack:
        y, x = stack.pop()
        if outside[y, x] or mask[y, x]:
            continue
        outside[y, x] = True
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < mask.shape[0] and 0 <= nx < mask.shape[1] and not outside[ny, nx] and not mask[ny, nx]:
                stack.append((ny, nx))
    return ~outside


sheet = np.array(Image.open('assets/props/source-sheet.png').convert('RGB')).astype(int)
for name, ((x0, y0, x1, y1), shrink) in PROPS.items():
    c = sheet[y0:y1, x0:x1]
    r, g, b = c[:, :, 0], c[:, :, 1], c[:, :, 2]
    away = np.abs(c - BACKGROUND).sum(2) > 40
    # Shadow: a darker shade of the grass.
    dark = away & (g > r + 25) & (g > b + 25) & (c.max(2) < 112) & (c.max(2) > 45)
    solid = fill_holes(away & ~dark)
    shadow = dark & ~solid
    w, h = max(1, round(c.shape[1] / shrink)), max(1, round(c.shape[0] / shrink))
    pre = np.dstack([c[:, :, k] * solid for k in range(3)] + [solid * 255])
    small = np.array(Image.fromarray(pre.clip(0, 255).astype('uint8'), 'RGBA').resize((w, h), Image.BOX)).astype(float)
    al = small[:, :, 3] / 255
    rgb = (small[:, :, :3] / np.maximum(al, 1e-3)[..., None]).clip(0, 255)
    keep = al > 0.45
    dk = np.array(Image.fromarray((shadow * 255).astype('uint8')).resize((w, h), Image.BOX)) / 255
    flat = np.array(Image.fromarray(rgb.astype('uint8'), 'RGB').quantize(colors=16, method=Image.Quantize.MAXCOVERAGE).convert('RGB'))
    out = np.zeros((h, w, 4), 'uint8')
    out[keep, :3] = flat[keep]
    out[keep, 3] = 255
    out[~keep & (dk > 0.4), 3] = SHADOW_ALPHA
    # Trim empty edges.
    ys, xs = np.nonzero(out[:, :, 3])
    out = out[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    Image.fromarray(out, 'RGBA').save(f'assets/props/{name}.png')
    print(name, out.shape[1], out.shape[0])
