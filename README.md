# Golf

A retro, pixel-art, isometric golf game in the style of Sid Meier's Sim Golf, built on the course generator from the Golf Manager game.

## Playing

Download `golf.html` and open it in a browser. It's a single self-contained file, so there's nothing to install.

Keys for now: `N` / `P` next and previous hole, `R` a new random course, `S` change course style. You can also pick a hole in the address bar, e.g. `golf.html?style=links&seed=7&hole=2`.

## Working on it

The game is plain JavaScript and a canvas, with no engine or libraries.

- `src/course-generator.js`: the course generator (see `src/COURSE-GENERATOR.md`).
- `src/iso.js`: the isometric projection between grid tiles, yards and screen pixels.
- `src/hole-view.js`: draws a whole hole as pixel art (ground, trees, tees, flag, golfers).
- `src/art.js`: placeholder pixel art, colours per course style and a small bitmap font.
- `src/weather.js`: the wind for a round and how it blows across each hole.
- `src/hud.js`, `src/main.js`: the on-screen panels and the page itself.

`index.html` loads the source files directly, which needs a local web server (for example `npx serve`). After changing anything in `src/`, rebuild the single-file version with `node tools/build.mjs`. `node tools/screenshots.cjs` saves screenshots of a few holes to `screenshots/` (it needs Playwright).
