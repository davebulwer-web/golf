# Golf

A retro, pixel-art, isometric golf game in the style of Sid Meier's Sim Golf, built on the course generator from the Golf Manager game.

## Playing

Download `golf.html` and open it in a browser. It's a single self-contained file, so there's nothing to install.

Pick a shot from the bar at the bottom (or press `1` to `5`): normal, fade, draw, lob or runner. Then press on the course and drag to where you want the ball to land, and let go to set the aim. The dotted line shows the shot's flight and the oval shows where it's likely to land: it grows and turns red as you push for more distance. You can still change the shot type or drag again; press **HIT** (or space) to play it, or **CANCEL** (`Esc` or right-click) to clear it. Clubs are picked for you. Wind isn't in the preview, so aim off for it.

The game fills the window and shows the whole hole. Zoom in with the mouse wheel or `+` / `-`; zoomed in, the view follows the ball and the arrow keys pan (`C` re-centres). The two buttons under the wind panel (or `Q` / `E`) turn the view a quarter turn round the hole, as in Sim Golf, so you can see past trees and hills from another side.

The whole course is laid out on one map, as in Sim Golf: each tee is a short walk from the green before, and the neighbouring holes show around the one you're playing, a little darker. On links and tropical courses the seaside holes run along one coastline, with open sea beyond.

The ground rises and falls. Hillsides are shaded (lit from the top left), with banks where the ground steps down, and tees and greens sit up on their own level. Uphill shots play longer and downhill ones shorter, a yard for each yard of rise or fall; the shot bar shows it next to the aim (e.g. `UP 6`) and the reach allows for it. The ball runs on downhill, checks up uphill, falls away across a slope and can trickle back off a steep bank. Greens tilt gently one way: putts across the slope are harder to hole and tend to miss on the low side, and downhill putts run further past. Alpine courses are the hilliest, links the flattest, and lakes lie flat in hollows.

Water costs a shot and you drop back on dry land. Past the woods is out of bounds (stroke and distance), and that includes the other holes and the open sea. Once you're on the green the view zooms in and the putting plays itself: each putt is decided by the golfer's putting skill and the distance.

You play against Bertie, a computer golfer. Whoever is farthest from the pin plays next, as in a real game. Bertie picks a shot by trying each shot type and a spread of landing spots in his head, using the same shot model and wind as you, and takes the one that should leave the fewest strokes; his nerve decides how much a risky shot puts him off. You'll see his aim line for a moment before he hits.

Scoring is medal play. After each hole the scorecard shows the round so far for both of you (front nine, back nine, total against par); `Enter` goes on to the next hole and `Tab` shows or hides the card. The hole card at the top left keeps the running score.

Other keys: `N` / `P` jump to the next or previous hole (for testing; skipped holes stay blank on the card), `R` a new random course, `S` change course style. You can also pick a hole in the address bar, e.g. `golf.html?style=links&seed=7&hole=2`.

## Working on it

The game is plain JavaScript and a canvas, with no engine or libraries.

- `src/course-generator.js`: the course generator (see `src/COURSE-GENERATOR.md`).
- `src/course.js`: the game's tweaks to the generator: more doglegs and extra hazards, on their own random stream.
- `src/course-map.js`: lays the 18 holes out on one map (where each hole sits and which way it faces) and the coastline for seaside courses.
- `src/terrain.js`: hills and slopes: rolling ground over the whole course map, shaped on each hole (flat tees, tilted greens, smooth fairways, lakes in hollows).
- `src/shots.js`: the five shot types, reach (allowing for uphill and downhill), club choice, scatter, wind, roll down slopes and water drops.
- `src/golfers.js`: golfers and their skills.
- `src/ai.js`: how the computer golfer chooses its shot.
- `src/putting.js`: automatic putting from skill, distance and the slope of the green.
- `src/play.js`: playing a hole and a round: strokes, putts, penalties and whose turn it is.
- `src/iso.js`: the isometric projection between grid tiles, yards (with the height of the ground) and screen pixels.
- `src/hole-view.js`: draws a whole hole as pixel art (ground, trees, tees, flag, golfers) with its neighbours around it.
- `src/art.js`: ground colours and textures and which trees grow for each course style, the sprites (trees from `src/tree-assets.js`, plus a few placeholders drawn in code) and a small bitmap font.
- `src/dinky.js`: the Dinky Tiny Golf sprites: golfer poses (recoloured per player), the ball in flight, the waving flag and result banners.
- `src/weather.js`: the wind for a round and how it blows across each hole.
- `src/hud.js`, `src/main.js`: the on-screen panels and the page itself.

`index.html` loads the source files directly, which needs a local web server (for example `npx serve`). After changing anything in `src/`, rebuild the single-file version with `node tools/build.mjs`. `node tools/screenshots.cjs` saves screenshots of a few holes to `screenshots/`, and `node tools/playtest.cjs` plays holes for you aiming at the pin while Bertie plays his own shots (both need Playwright). `node tools/check-shots.mjs` prints tables of shot distances, scatter and hazard counts.

## Credits

The golfer, ball, flag and result banner sprites are from **Dinky Tiny Golf** by Mike Moore ([www.pixelbitsnbytes.com](https://www.pixelbitsnbytes.com)), free to use with credit. The original files and their licence are in `assets/dinky/`; `node tools/pack-assets.mjs` packs them into `src/dinky-assets.js` so the game stays a single file. The trees come from Dave's tree sheet, `assets/trees/source-sheet.png`. `python3 tools/cut-trees.py` cuts them out and shrinks them to game size (into `assets/trees/`), and `node tools/pack-assets.mjs` packs them into `src/tree-assets.js`. The ground textures come from Dave's texture sheet, `assets/ground/source-sheet.png`: `python3 tools/cut-ground.py` turns each swatch into a seamless 32 x 16 texture in `assets/ground/`, packed into `src/ground-assets.js`. Styles with their own ground colours (links, desert, heathland...) keep each texture's light and dark in their own colour. The cacti, gorse, heather and font are still placeholder pixel art drawn from code.
