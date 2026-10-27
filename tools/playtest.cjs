// Plays holes by aiming every shot at the pin (putts play themselves), printing
// what happened and saving screenshots of the aim, a ball in flight, putting and
// the scorecard. Run with: node tools/build.mjs && node tools/playtest.cjs [style:seed:hole] [holes]

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const [style, seed, hole] = (process.argv[2] ?? 'stadium:12:7').split(':');
const holes = Number(process.argv[3] ?? 1);

(async () => {
  fs.mkdirSync('screenshots', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1903, height: 937 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`file://${path.resolve('golf.html')}?style=${style}&seed=${seed}&hole=${hole}`);
  await page.waitForTimeout(300);
  const name = `screenshots/play-${style}-${seed}-hole${hole}`;

  for (let h = 0; h < holes; h++) {
    for (let n = 1; n <= 12; n++) {
      const state = await page.evaluate((n) => {
        const g = window.golf;
        const { game, ui } = g;
        if (ui.phase === 'done') return { done: true };
        const me = game.play.players[0];
        const pin = game.hole.pin;
        const d = Math.hypot(pin.x - me.at.x, pin.y - me.at.y);
        ui.shot = d < 90 ? 'lob' : n === 1 && game.hole.par > 3 ? 'fade' : 'straight';
        ui.aim = g.clampAim(pin);
        return { d: Math.round(d), shot: ui.shot, lie: me.lie, hole: game.hole.number };
      }, n);
      if (state.done) break;
      if (h === 0 && n === 1) await page.screenshot({ path: `${name}-aim.png` });
      await page.evaluate(() => window.golf.shoot());
      if (h === 0 && n === 1) {
        await page.waitForTimeout(600);
        await page.screenshot({ path: `${name}-flight.png` });
      }
      await page.waitForFunction(() => ['aim', 'putting', 'done'].includes(window.golf.ui.phase), null, { timeout: 15000 });
      if (h === 0 && await page.evaluate(() => window.golf.ui.phase === 'putting')) {
        await page.waitForTimeout(1300);
        await page.screenshot({ path: `${name}-putting.png` });
      }
      await page.waitForFunction(() => ['aim', 'done'].includes(window.golf.ui.phase), null, { timeout: 30000 });
      const after = await page.evaluate(() => {
        const me = window.golf.game.play.players[0];
        return { lie: me.holed ? 'holed' : me.lie, strokes: me.strokes, putts: me.putts };
      });
      console.log(`hole ${state.hole} shot ${n}: ${state.shot} from ${state.lie}, ${state.d} yds -> ${after.lie}, strokes ${after.strokes}${after.putts ? `, putts ${after.putts}` : ''}`);
    }
    await page.waitForTimeout(200);
    if (h === holes - 1) await page.screenshot({ path: `${name}-card.png` });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
  }
  const card = await page.evaluate(() => window.golf.round);
  console.log('scores', JSON.stringify(card.scores.slice(0, 18)), 'pars', JSON.stringify(card.pars));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
})();
