// Plays a hole by aiming every shot at the pin, printing what happened and
// saving screenshots of the aim, a ball in flight and the finish.
// Run with: node tools/build.mjs && node tools/playtest.cjs [style:seed:hole]

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const [style, seed, hole] = (process.argv[2] ?? 'stadium:12:7').split(':');

(async () => {
  fs.mkdirSync('screenshots', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1903, height: 937 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`file://${path.resolve('golf.html')}?style=${style}&seed=${seed}&hole=${hole}`);
  await page.waitForTimeout(300);
  const name = `screenshots/play-${style}-${seed}-hole${hole}`;

  for (let n = 1; n <= 12; n++) {
    const state = await page.evaluate((n) => {
      const g = window.golf;
      const { game, ui } = g;
      if (ui.phase === 'done') return { done: true };
      const me = game.play.players[0];
      const pin = game.hole.pin;
      const d = Math.hypot(pin.x - me.at.x, pin.y - me.at.y);
      ui.shot = d < 90 ? 'lob' : n === 1 ? 'fade' : 'straight';
      ui.aim = g.clampAim(pin);
      return { d: Math.round(d), shot: ui.shot, lie: me.lie };
    }, n);
    if (state.done) break;
    if (n === 1) await page.screenshot({ path: `${name}-aim.png` });
    await page.evaluate(() => window.golf.shoot());
    if (n === 1) {
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${name}-flight.png` });
    }
    await page.waitForFunction(() => window.golf.ui.phase === 'aim' || window.golf.ui.phase === 'done', null, { timeout: 15000 });
    const after = await page.evaluate(() => {
      const me = window.golf.game.play.players[0];
      return { lie: me.lie, strokes: me.strokes, banner: window.golf.ui.banner?.text ?? '' };
    });
    console.log(`shot ${n}: ${state.shot} from ${state.lie}, ${state.d} yds to pin -> ${after.lie}, strokes ${after.strokes} ${after.banner}`);
  }
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${name}-end.png` });
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
})();
