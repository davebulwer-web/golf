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
# sheet pixels make a game pixel, chosen to suit the course: the flag a little
# shorter than a golfer, small things smaller still. The views of one prop
# share a scale. Props drawn from four sides are named <prop>-front, -right,
# -back and -left: seen from the front, from its right side and so on.
VIEWS = ['front', 'right', 'back', 'left']
PROPS = {
    **{f'flag-{i + 1}': (box, 4.8) for i, box in enumerate([(28, 44, 116, 176), (140, 44, 228, 176), (252, 44, 340, 176), (364, 44, 456, 176)])},
    **{f'ball-{i + 1}': (box, 8) for i, box in enumerate([(620, 116, 652, 148), (692, 96, 748, 148), (780, 76, 860, 152)])},
    **{f'tee-{c}': (box, 7.5) for c, box in zip(['red', 'blue', 'white', 'yellow', 'black'],
                                                [(1056, 56, 1100, 108), (1152, 56, 1196, 108), (1244, 56, 1288, 108), (1340, 56, 1384, 108), (1432, 56, 1476, 108)])},
    **{f'cactus-{i + 1}': (box, 8) for i, box in enumerate([(40, 228, 144, 356), (184, 248, 280, 356), (316, 236, 428, 356)])},
    **{f'gorse-{i + 1}': (box, 8) for i, box in enumerate([(504, 248, 645, 360), (648, 262, 800, 360), (804, 228, 956, 360)])},
    **{f'heather-{i + 1}': (box, 9) for i, box in enumerate([(1036, 248, 1186, 360), (1188, 270, 1340, 360), (1348, 248, 1492, 360)])},
    **{f'post-{n}': (box, 9) for n, box in zip([100, 150, 200], [(40, 420, 132, 544), (152, 420, 244, 548), (268, 420, 360, 548)])},
    **{f'hole-sign-{v}': (box, 7.5) for v, box in zip(VIEWS, [(440, 416, 588, 548), (600, 416, 668, 548), (680, 416, 808, 548), (816, 416, 888, 548)])},
    **{f'bench-{v}': (box, 7) for v, box in zip(VIEWS, [(920, 424, 1092, 536), (1108, 428, 1192, 532), (1208, 428, 1392, 528), (1412, 428, 1500, 532)])},
    **{f'ball-washer-{v}': (box, 6.5) for v, box in zip(VIEWS, [(36, 616, 116, 732), (144, 616, 232, 732), (270, 616, 356, 736), (388, 616, 472, 732)])},
    **{f'bin-{v}': (box, 8) for v, box in zip(VIEWS, [(528, 636, 624, 724), (652, 636, 732, 724), (768, 632, 876, 724), (916, 632, 1012, 724)])},
    **{f'rake-{v}': (box, 8) for v, box in zip(VIEWS, [(1056, 616, 1148, 732), (1188, 620, 1272, 732), (1304, 620, 1388, 732), (1416, 620, 1492, 732)])},
    **{f'clubhouse-{v}': (box, 4.1) for v, box in zip(VIEWS, [(24, 802, 372, 980), (392, 800, 636, 976), (648, 804, 916, 976), (924, 800, 1164, 976)])},
}


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
    # Just the prop: its biggest piece and any big ones beside it, not the edge
    # of a neighbour or a label reaching into the box.
    lab, sizes = components(solid)
    solid = np.isin(lab, [n for n, size in enumerate(sizes) if n and size >= max(sizes) * 0.15])
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

# The flag's frames are cut one by one, so their poles and holes don't quite
# line up and the pole's dark edge comes and goes. Keep the first frame's pole
# and hole for all four and take only the waving cloth from each frame, moved
# so its pole lines up. Also make each frame without the bright green ring
# round the hole, for the flags on the other holes.
frames = [np.array(Image.open(f'assets/props/flag-{i}.png')) for i in range(1, 5)]
pole_x = lambda f: min(np.nonzero(f[y, :, 3])[0][0] for y in range(12, 18))
base = frames[0]
bx = pole_x(base)
CLOTH_ROWS = 12  # the cloth hangs in the top rows, beside the pole
red = lambda p: p[0] > p[1] + 60  # the cloth itself, not its dark edge
for i, f in enumerate(frames):
    out = base.copy()
    out[:CLOTH_ROWS, bx + 2:] = 0
    dx = bx - pole_x(f)
    for y in range(min(CLOTH_ROWS, f.shape[0])):
        for x in range(f.shape[1]):
            if f[y, x, 3] and bx + 2 + (0 if red(f[y, x]) else 1) <= x + dx < out.shape[1] and x > pole_x(f):
                out[y, x + dx] = f[y, x]
    Image.fromarray(out, 'RGBA').save(f'assets/props/flag-{i + 1}.png')
    r, g, b, a = (out[:, :, k].astype(int) for k in range(4))
    plain = out.copy()
    plain[((g > r + 30) & (g > b + 30)) | ((a > 0) & (a < 255))] = 0
    # Below the cloth, keep only the pole and the dark hole.
    low = np.zeros(a.shape, bool)
    low[CLOTH_ROWS:] = True
    low[:, bx:bx + 2] = False
    plain[low & (r + g + b >= 150)] = 0
    Image.fromarray(plain, 'RGBA').save(f'assets/props/flag-plain-{i + 1}.png')
