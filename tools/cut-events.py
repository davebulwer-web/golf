# Cuts the tournament stands and buildings out of assets/events/source-sheet.png,
# and the boards, signs, banners, barriers and flags out of source-sheet-2.png
# (Dave's sheets, on see-through backgrounds), and shrinks them to game size,
# into assets/events/<name>.png. Each is drawn from up to four sides, named
# <thing>-front, -right, -back and -left like the props (see tools/cut-props.py);
# a missing side is drawn with the front or back.
# Run with: python3 tools/cut-events.py (needs Pillow and numpy), then
# node tools/pack-assets.mjs and node tools/build.mjs.

from PIL import Image
import numpy as np

STAND = 3.0   # sheet pixels per game pixel for the stands and towers
BIG = 3.4     # and for the big tents and the stage, so they don't swamp a hole
# The second sheet's things are drawn larger, so shrink them more, to stand
# beside a golfer about 10 pixels tall:
BOARD = 6.2   # leaderboards
SIGN = 7.0    # signposts and banners
FENCE = 8.0   # ropes, barriers and fences
FLAG = 5.2    # flags and feather flags
EVENTS = {
    'stand-small-front': ((43, 54, 206, 230), STAND), 'stand-small-back': ((206, 54, 392, 230), STAND),
    'stand-medium-front': ((395, 54, 592, 230), STAND), 'stand-medium-back': ((585, 78, 770, 230), STAND),
    'stand-large-front': ((786, 40, 1022, 238), STAND), 'stand-large-back': ((1024, 40, 1212, 238), STAND),
    'stand-large-right': ((1212, 40, 1500, 238), STAND),
    'covered-stand-front': ((65, 232, 376, 418), BIG), 'covered-stand-back': ((395, 232, 698, 420), BIG),
    'long-stand-front': ((788, 234, 1124, 432), BIG), 'long-stand-back': ((1143, 236, 1471, 427), BIG),
    'tv-tower-front': ((43, 410, 205, 614), STAND), 'tv-tower-right': ((205, 420, 358, 616), STAND),
    'tv-tower-left': ((358, 420, 505, 616), STAND), 'tv-tower-back': ((517, 418, 660, 616), STAND),
    'tent-front': ((684, 428, 885, 610), STAND), 'tent-right': ((888, 435, 1092, 619), STAND),
    'tent-back': ((1102, 435, 1297, 621), STAND), 'tent-left': ((1298, 435, 1498, 615), STAND),
    'stage-front': ((63, 628, 388, 794), BIG), 'stage-back': ((802, 623, 1088, 780), BIG),
    'truss-front': ((389, 630, 500, 796), STAND), 'truss-back': ((1350, 623, 1463, 782), STAND),
    'scoreboard-front': ((523, 632, 742, 799), STAND), 'scoreboard-back': ((1152, 650, 1338, 794), STAND),
    'marquee-front': ((33, 789, 416, 1001), BIG), 'marquee-back': ((418, 792, 764, 993), BIG),
    'arch-front': ((836, 790, 1048, 980), STAND), 'arch-right': ((1064, 791, 1145, 982), STAND),
    'arch-back': ((1153, 790, 1314, 980), STAND), 'arch-left': ((1330, 789, 1515, 979), STAND),
}
# The second sheet: (box, shrink) as above.
EVENTS_2 = {
    'leaderboard-front': ((22, 20, 258, 255), BOARD), 'leaderboard-right': ((251, 40, 310, 233), BOARD),
    'leaderboard-back': ((312, 48, 463, 237), BOARD), 'leaderboard-left': ((477, 40, 549, 241), BOARD),
    'trophy-board-front': ((1011, 35, 1215, 249), BOARD), 'trophy-board-right': ((1215, 39, 1285, 241), BOARD),
    'trophy-board-back': ((1285, 36, 1441, 234), BOARD), 'trophy-board-left': ((1442, 24, 1522, 241), BOARD),
    **{f'signpost-{n}-front': (box, SIGN) for n, box in zip(['clubhouse', 'first-tee', 'range', 'practice', 'parking'],
        [(32, 445, 184, 594), (333, 445, 478, 589), (638, 445, 790, 593), (946, 445, 1098, 590), (1236, 446, 1376, 591)])},
    **{f'banner-{n}-{v}': (box, SIGN) for n, boxes in [
        ('championship', [(23, 614, 189, 742), (199, 636, 253, 746), (253, 613, 317, 742)]),
        ('golfer', [(334, 616, 496, 743), (504, 638, 554, 744), (556, 612, 616, 741)]),
        ('freedom', [(631, 613, 799, 743), (808, 634, 860, 746), (860, 613, 921, 743)]),
        ('golf', [(934, 615, 1100, 743), (1110, 637, 1162, 744), (1163, 613, 1223, 743)]),
        ('healthier', [(1236, 613, 1402, 743), (1410, 632, 1459, 744), (1456, 610, 1516, 743)]),
    ] for v, box in zip(['front', 'right', 'back'], boxes)},
    'rope-front': ((332, 757, 477, 856), FENCE), 'rope-right': ((478, 754, 597, 849), FENCE),
    **{f'barrier-{n}-{v}': (box, FENCE) for n, boxes in [
        ('blue', [(611, 749, 773, 852), (778, 765, 811, 855), (814, 756, 923, 848)]),
        ('white', [(935, 749, 1105, 848), (1106, 765, 1135, 850), (1137, 758, 1228, 844)]),
        ('green', [(1238, 747, 1408, 857), (1408, 765, 1438, 858), (1437, 760, 1522, 852)]),
    ] for v, box in zip(['front', 'right', 'back'], boxes)},
    'picket-front': ((25, 759, 166, 844), FENCE), 'picket-right': ((179, 767, 212, 847), FENCE),
    'flag-trophy': ((30, 861, 115, 1003), FLAG), 'flag-sponsor': ((282, 861, 365, 1003), FLAG),
    'flag-clubs': ((601, 861, 681, 1003), FLAG),
    'feather-trophy-front': ((848, 855, 912, 1003), FLAG), 'feather-trophy-back': ((917, 855, 975, 1001), FLAG),
    'feather-sponsor-front': ((1012, 854, 1074, 1001), FLAG), 'feather-sponsor-back': ((1082, 854, 1140, 997), FLAG),
    'feather-clubs-front': ((1180, 855, 1243, 1003), FLAG), 'feather-clubs-back': ((1250, 855, 1309, 996), FLAG),
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


sheets = [np.array(Image.open(f).convert('RGBA')).astype(int) for f in ['assets/events/source-sheet.png', 'assets/events/source-sheet-2.png']]
for k, (name, ((x0, y0, x1, y1), shrink)) in [*[(0, e) for e in EVENTS.items()], *[(1, e) for e in EVENTS_2.items()]]:
    c = sheets[k][y0:y1, x0:x1]
    solid = c[:, :, 3] > 100
    # Just this thing: its biggest piece and any big ones beside it (flags,
    # pot plants), not the edge of a neighbour reaching into the box.
    lab, sizes = components(solid)
    solid = np.isin(lab, [n for n, size in enumerate(sizes) if n and size >= max(sizes) * 0.03])
    w, h = max(1, round(c.shape[1] / shrink)), max(1, round(c.shape[0] / shrink))
    pre = np.dstack([c[:, :, k] * solid for k in range(3)] + [solid * 255])
    small = np.array(Image.fromarray(pre.clip(0, 255).astype('uint8'), 'RGBA').resize((w, h), Image.BOX)).astype(float)
    al = small[:, :, 3] / 255
    rgb = (small[:, :, :3] / np.maximum(al, 1e-3)[..., None]).clip(0, 255)
    keep = al > 0.45
    flat = np.array(Image.fromarray(rgb.astype('uint8'), 'RGB').quantize(colors=24, method=Image.Quantize.MAXCOVERAGE).convert('RGB'))
    out = np.zeros((h, w, 4), 'uint8')
    out[keep, :3] = flat[keep]
    out[keep, 3] = 255
    ys, xs = np.nonzero(out[:, :, 3])
    out = out[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    Image.fromarray(out, 'RGBA').save(f'assets/events/{name}.png')
    print(name, out.shape[1], out.shape[0])
