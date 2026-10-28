# Cuts each golfer's frames out of their sheet, assets/golfers/<look>/source-sheet.png,
# and shrinks them to game size. Every frame gets the same size of cell, placed so
# the middle of the golfer's shadow (between the feet) lands on the same pixel,
# so the frames line up when they play one after another, and every look comes
# out the same height whatever the scale of its sheet. The shadow is kept as a
# see-through dark patch, so it works on any ground. The ball, drawn in a few
# frames, is left out (the game draws its own). Writes assets/golfers/<look>/<name>.png.
# Run with: python3 tools/cut-golfer.py [look...] (needs Pillow and numpy), then
# node tools/pack-assets.mjs and node tools/build.mjs.

import sys
from PIL import Image
import numpy as np

OUT = (40, 40)          # game pixels: the cell for every frame
FEET = (20, 36)         # where the middle of the shadow sits in the cell
SHADOW_ALPHA = 90       # how dark the shadow is, out of 255
SWING = ['address', 'takeaway', 'backswing-1', 'backswing-2', 'downswing-1', 'downswing-2', 'impact',
         'follow-1', 'follow-2', 'finish']
PUTT = ['putt-address', 'putt-back', 'putt-forward', 'putt-follow']
IDLE = ['idle-1', 'idle-2', 'idle-3', 'idle-4']
HAPPY = ['happy-1', 'happy-2', 'happy-3', 'happy-4']
CROSS = ['cross-1', 'cross-2', 'cross-3', 'cross-4']
# Each look's sheet: how many sheet pixels make a game pixel (so the golfers
# come out the same height), its rows of frames (top and bottom, and the names
# from left to right), and any headings to blank out first.
SHEETS = {
    'club': {
        'shrink': 4.5,
        'rows': [
            ((60, 240), SWING),
            ((340, 478), IDLE + ['walk-1', 'walk-2', 'walk-3', 'walk-4', 'run-1', 'run-2', 'run-3', 'run-4']),
            ((560, 722), ['reach', 'pick-up', 'stand-1', 'stand-2'] + HAPPY + CROSS),
            ((815, 952), PUTT + ['look-around', 'shade-eyes', 'point', 'club-shoulder']),
        ],
        'blank': [],
    },
    'heavy': {
        'shrink': 6.8,
        'rows': [
            ((50, 293), SWING),
            ((415, 605), PUTT + IDLE),
            ((672, 938), HAPPY + CROSS + ['shade-eyes']),
        ],
        'blank': [(20, 672, 390, 706), (690, 672, 1075, 706), (1315, 672, 1500, 706)],
    },
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


def cut(look, spec):
    shrink = spec['shrink']
    cell_w, cell_h = round(OUT[0] * shrink), round(OUT[1] * shrink)
    feet_x, feet_y = FEET[0] * shrink, FEET[1] * shrink
    sheet = np.array(Image.open(f'assets/golfers/{look}/source-sheet.png').convert('RGB')).astype(int)
    for x0, y0, x1, y1 in spec['blank']:
        sheet[y0:y1, x0:x1] = 0
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
    pad_by = max(cell_w, cell_h)
    pad = lambda m: np.pad(m, [(pad_by, pad_by), (pad_by, pad_by)] + [(0, 0)] * (m.ndim - 2))
    big = (shrink / 4.5) ** 2  # how much bigger areas are than on the club golfer's sheet

    for (y0, y1), names in spec['rows']:
        # Each frame stands on its own shadow: find the shadows, left to right.
        # A club head or a leg can split a shadow, so pieces with hardly a gap
        # between them belong together.
        clab, csizes = components(core[y0:y1])
        pieces = []
        for n, size in enumerate(csizes):
            if n and size > 50 * big:
                ys, xs = np.nonzero(clab == n)
                pieces.append([xs.min(), xs.max(), y0 + ys.min(), y0 + ys.max()])
        pieces.sort()
        shadows = []
        for p in pieces:
            if shadows and p[0] - shadows[-1][1] < 4 * shrink:
                q = shadows[-1]
                shadows[-1] = [q[0], max(q[1], p[1]), min(q[2], p[2]), max(q[3], p[3])]
            else:
                shadows.append(p)
        feet = [((x0 + x1) / 2, (top + bottom) / 2) for x0, x1, top, bottom in shadows]
        assert len(feet) == len(names), f'{look} rows {y0}-{y1}: found {len(feet)} frames, expected {len(names)}'
        # Only this row of frames, not the labels or headings round it.
        rows = np.zeros(lit.shape, bool)
        rows[y0:y1] = True
        sheet_p, body_p, shadow_p = pad(sheet), pad(body & rows), pad(shadow & rows)
        for name, (cx, cy) in zip(names, feet):
            left, top = round(cx - feet_x) + pad_by, round(cy - feet_y) + pad_by
            cell = (slice(top, top + cell_h), slice(left, left + cell_w))
            # Keep only the golfer, plus any big pieces near it up in the air (a
            # club head drawn apart from its shaft). Small specks, like the
            # ball, and neighbouring frames poking into the cell are dropped.
            lab, sizes = components(body_p[cell])
            # The golfer is whatever stands just above the middle of the shadow.
            above = lab[round(feet_y - 22 * shrink):round(feet_y), round(feet_x - 6 * shrink):round(feet_x + 6 * shrink)]
            main = int(np.argmax(np.bincount(above[above > 0], minlength=len(sizes))))
            solid = lab == main
            mx = np.nonzero(solid)[1].mean()
            for n, s in enumerate(sizes):
                if not n or n == main or s < 150 * big:
                    continue
                ys, xs = np.nonzero(lab == n)
                # Up in the air, not a neighbour's club head resting on the ground.
                if abs(xs.mean() - mx) < 70 / 4.5 * shrink and ys.max() < feet_y - 8 * shrink:
                    solid |= lab == n
            # The shadow round the feet, without any other frame's.
            slab, ssizes = components(shadow_p[cell])
            flat = slab == int(np.argmax(ssizes))
            w, h = OUT
            rgb = np.where(solid[..., None], sheet_p[cell], 0).astype(float)
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
            Image.fromarray(out, 'RGBA').save(f'assets/golfers/{look}/{name}.png')
        print(look, f'rows {y0}-{y1}:', len(names), 'frames')


for look in sys.argv[1:] or SHEETS:
    cut(look, SHEETS[look])
