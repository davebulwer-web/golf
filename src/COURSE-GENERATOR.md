# Course generator (standalone)

This is the course generator from the Golf manager game, lifted out on its own so a new game can use it. Give it a seed number and a style and it builds a full 18-hole course: hole lengths, pars, doglegs, fairways, rough, bunkers, water, greens, pin positions and four sets of tees. The same seed always gives the same course, and these files build exactly the same courses as the original game (checked on all 51 courses in the database plus 64 test courses).

It doesn't draw anything and has no golf simulation in it. That's deliberate, so the new game can draw holes however it likes, including as isometric pixel-art tiles.

## What's in the folder

| File | What it is |
|---|---|
| `course-generator.js` | The generator. No dependencies; works in a browser or in Node. |
| `courses.js` | Optional: the 51 named courses from the original game (name, country, tour level, style, seed). |
| `check.js` | A quick test that prints a scorecard and draws a hole out of letters. |
| `sample-output.txt` | What `check.js` printed for seed 1989. |

## Trying it

```
node check.js                    # seed 1989, parkland, shows hole 1
node check.js 7 links 3          # seed 7, links style, shows hole 3
```

Styles: parkland, links, desert, heathland, alpine, tropical, woodland, stadium.

## Using it in a new game

```js
import { generateCourse, holeToGrid } from './course-generator.js';

const course = generateCourse({ name: 'Pine Ridge', style: 'heathland', par: 72, length: 'standard', seed: 4242 });
const grid = holeToGrid(course.holes[0], { cell: 4 });   // one tile = 4 x 4 yards

grid.tiles[row][col]   // 'fairway', 'rough', 'green', 'bunker', 'water', 'trees', ...
grid.tees.yellow       // { col, row } of the yellow tee
grid.pin               // { col, row } of the flag
```

`holeToGrid` is the bit made for an isometric game. It chops a hole into a square grid and says what's on each square, so a renderer just picks a tile picture for each one. Row 0 is the tee end and the green is at the far end. Smaller `cell` values give more detail but bigger maps; 3 to 5 yards per tile is a good starting point for pixel art.

Other useful pieces:

- `surfaceAt(hole, {x, y})` says what's at any exact point, in yards. Handy for where a ball lands, without needing the grid.
- `holeSummary(hole)` gives plain facts: par, yardage from each tee, dogleg, water, island green.
- `quickStrokeIndex(course)` gives a Stroke Index for each hole. The original game worked this out by simulating thousands of shots, which needs the whole shot engine, so this is a quick guess from the layout instead. It won't match the original game's numbers.
- `STYLES`, `TEE_SETS` and `LENGTH_SCALES` hold the settings for each style, tee colour and course length.

## Course settings

- `style`: one of the eight styles above.
- `par`: 66 to 73. Below 68, par 4s turn into par 3s.
- `length`: `forward`, `short`, `standard` or `long`.
- `seed`: any whole number.
- `tour`: optional. `club` or `county` turns off the tricky "signature" sharp doglegs; anything else leaves them on. You can also set `signature: true` or `false` directly.

## One rule if you change it

The middle of `course-generator.js` is marked as copied word for word from the original. Changing how it draws random numbers there will reshape every course for every seed. To add new features (say, bridges or cart paths), give them their own random stream, the way the file already does for island greens (`r2`) and signature holes (`r3`). That way existing seeds keep their shape.
