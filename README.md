# Golf

A retro, pixel-art, isometric golf game in the style of Sid Meier's Sim Golf, built on the course generator from the Golf Manager game.

## Playing

Download `golf.html` and open it in a browser. It's a single self-contained file, so there's nothing to install.

Pick a shot from the bar at the bottom (or press `1` to `5`): normal, fade, draw, lob or runner. Then press on the course and drag to where you want the ball to land, and let go to set the aim. The dotted line shows the shot's flight and the oval shows where it's likely to land: it grows and turns red as you push for more distance. You can still change the shot type or drag again; press **HIT** (or space) to play it, or **CANCEL** (`Esc` or right-click) to clear it. Clubs are picked for you. Wind isn't in the preview, so aim off for it.

The game fills the window and shows the whole hole. Zoom in with the mouse wheel or `+` / `-`; zoomed in, the view follows the ball and the arrow keys pan (`C` re-centres).

Water costs a shot and you drop back on dry land; past the woods is out of bounds (stroke and distance). Putting arrives in the next step, so the hole stops when you reach the green. `Enter` replays the hole.

Other keys: `N` / `P` next and previous hole, `R` a new random course, `S` change course style. You can also pick a hole in the address bar, e.g. `golf.html?style=links&seed=7&hole=2`.

## Working on it

The game is plain JavaScript and a canvas, with no engine or libraries.

- `src/course-generator.js`: the course generator (see `src/COURSE-GENERATOR.md`).
- `src/course.js`: the game's tweaks to the generator: more doglegs and extra hazards, on their own random stream.
- `src/shots.js`: the five shot types, reach, club choice, scatter, wind, roll and water drops.
- `src/golfers.js`: golfers and their skills.
- `src/play.js`: playing a hole: strokes, penalties and whose turn it is.
- `src/iso.js`: the isometric projection between grid tiles, yards and screen pixels.
- `src/hole-view.js`: draws a whole hole as pixel art (ground, trees, tees, flag, golfers).
- `src/art.js`: placeholder pixel art, colours per course style and a small bitmap font.
- `src/weather.js`: the wind for a round and how it blows across each hole.
- `src/hud.js`, `src/main.js`: the on-screen panels and the page itself.

`index.html` loads the source files directly, which needs a local web server (for example `npx serve`). After changing anything in `src/`, rebuild the single-file version with `node tools/build.mjs`. `node tools/screenshots.cjs` saves screenshots of a few holes to `screenshots/`, and `node tools/playtest.cjs` plays a hole aiming at the pin (both need Playwright). `node tools/check-shots.mjs` prints tables of shot distances, scatter and hazard counts.
