// Saves screenshots of a few holes into screenshots/. Needs Playwright.
// Run with: node tools/build.mjs && node tools/screenshots.cjs

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SHOTS = process.argv.slice(2).length ? process.argv.slice(2) : [
  'tropical:1989:1', 'parkland:4242:3', 'links:7:2', 'desert:31:5', 'heathland:88:4', 'stadium:12:7',
];

(async () => {
  fs.mkdirSync('screenshots', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const shot of SHOTS) {
    const [style, seed, hole] = shot.split(':');
    await page.goto(`file://${path.resolve('golf.html')}?style=${style}&seed=${seed}&hole=${hole}`);
    await page.waitForTimeout(300);
    const file = `screenshots/${style}-${seed}-hole${hole}.png`;
    await page.locator('#game').screenshot({ path: file });
    console.log(file);
  }
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
})();
