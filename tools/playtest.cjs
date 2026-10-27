// Plays holes for you by aiming every shot at the pin while the computer golfer
// plays its own shots (putts play themselves), printing each stroke and saving
// screenshots of the aim, a ball in flight, putting and the scorecard.
// Run with: node tools/build.mjs && node tools/playtest.cjs [style:seed:hole] [holes]

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
  const shots = new Set();
  const snap = async (key, wait = 0) => {
    if (shots.has(key)) return;
    shots.add(key);
    if (wait) await page.waitForTimeout(wait);
    await page.screenshot({ path: `${name}-${key}.png` });
  };

  for (let h = 0; h < holes; h++) {
    let lastStrokes = '';
    for (let step = 0; step < 400; step++) {
      const s = await page.evaluate(() => {
        const { game, ui } = window.golf;
        const p = game.play.players[game.play.turn];
        return { phase: ui.phase, ai: !!p.golfer.ai, aim: !!ui.aim,
          strokes: game.play.players.map((q) => `${q.golfer.name} ${q.strokes}${q.holed ? ' holed' : ` (${q.lie})`}`).join(', ') };
      });
      if (s.strokes !== lastStrokes) { console.log(`  ${s.strokes}`); lastStrokes = s.strokes; }
      if (s.phase === 'done') break;
      if (s.phase === 'aim' && s.ai && s.aim) await snap('ai-aim');
      if (s.phase === 'putting') await snap('putting', 600);
      if (s.phase === 'aim' && !s.ai) {
        await page.evaluate(() => {
          const g = window.golf;
          const { game, ui } = g;
          const me = game.play.players[game.play.turn];
          const pin = game.hole.pin;
          const d = Math.hypot(pin.x - me.at.x, pin.y - me.at.y);
          ui.shot = d < 90 ? 'lob' : me.strokes === 0 && game.hole.par > 3 ? 'fade' : 'straight';
          ui.aim = g.clampAim(pin);
        });
        await snap('aim');
        await page.evaluate(() => window.golf.shoot());
        if (!shots.has('flight')) await snap('flight', 600);
      }
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(300);
    if (h === holes - 1) await page.screenshot({ path: `${name}-card.png` });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
  }
  const round = await page.evaluate(() => window.golf.round);
  for (const p of round.players) console.log(p.name.padEnd(7), JSON.stringify(p.scores.slice(0, 18)));
  console.log('pars   ', JSON.stringify(round.pars));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
})();
