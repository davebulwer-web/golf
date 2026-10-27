// Bundles the game into one self-contained golf.html that opens straight from
// disk with a double-click (browsers won't load ES modules from file:// pages).
// Run with: node tools/build.mjs

import { readFileSync, writeFileSync } from 'node:fs';

// Dependencies first. Top-level names must be unique across these files.
const ORDER = ['course-generator', 'course', 'art', 'iso', 'weather', 'hole-view', 'hud', 'golfers', 'shots', 'play', 'main'];

const code = ORDER.map((name) => {
  const src = readFileSync(`src/${name}.js`, 'utf8')
    .replace(/^import [\s\S]*? from .*;\n/gm, '')
    .replace(/^export \{[^}]*\};\n/gm, '')
    .replace(/^export /gm, '');
  return `// ---- ${name}.js ----\n${src}`;
}).join('\n');

const html = readFileSync('index.html', 'utf8')
  .replace('<script type="module" src="src/main.js"></script>', () => `<script>\n(() => {\n${code}\n})();\n</script>`);
writeFileSync('golf.html', html);
console.log(`golf.html: ${(html.length / 1024).toFixed(0)} KB`);
