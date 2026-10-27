// Step 1: show a generated hole as isometric pixel art, with the wind.
// The URL can pick the course: ?style=tropical&seed=1989&hole=1

import { generateCourse, pointAt, STYLES } from './course-generator.js';
import { layoutHole, drawHole } from './hole-view.js';
import { drawHud } from './hud.js';
import { roundWeather, holeWind } from './weather.js';

// The game draws at this size and is scaled up to fill the window, keeping pixels square.
const W = 960, H = 540;
const STYLE_KEYS = Object.keys(STYLES);
const TEE = 'white';

const canvas = document.getElementById('game');
canvas.width = W; canvas.height = H;
const ctx = canvas.getContext('2d');
const image = ctx.createImageData(W, H);
const buf = new Uint32Array(image.data.buffer);

const params = new URLSearchParams(location.search);
const state = {
  style: STYLE_KEYS.includes(params.get('style')) ? params.get('style') : 'tropical',
  seed: Number(params.get('seed')) || 1989,
  hole: Math.min(18, Math.max(1, Number(params.get('hole')) || 1)),
};

function render() {
  const course = generateCourse({ name: `Course ${state.seed}`, style: state.style, par: 72, length: 'standard', seed: state.seed });
  const hole = course.holes[state.hole - 1];
  const weather = roundWeather(course);
  const wind = holeWind(weather, hole);
  // Leave room for the panels at the top and the help line at the bottom.
  const view = layoutHole(hole, { x: 8, y: 44, w: W - 16, h: H - 60 });

  const teeAt = pointAt(hole.line, hole.tees[TEE]);
  drawHole(buf, W, H, hole, view, [{ at: teeAt, golfer: true, ball: true, shirt: '#d03a2a' }]);
  ctx.putImageData(image, 0, 0);
  drawHud(ctx, W, H, { course, hole, tee: TEE, weather, wind, windScreen: view.worldDirToScreen(wind.across, wind.along) });

  history.replaceState(null, '', `?style=${state.style}&seed=${state.seed}&hole=${state.hole}`);
}

// Scale the canvas to the window: whole-number steps when there's room, so pixels stay crisp.
function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  const scale = s >= 1 ? Math.floor(s) : s;
  canvas.style.width = `${W * scale}px`;
  canvas.style.height = `${H * scale}px`;
}

addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'n') state.hole = state.hole % 18 + 1;
  else if (k === 'p') state.hole = (state.hole + 16) % 18 + 1;
  else if (k === 'r') { state.seed = Math.floor(Math.random() * 1e6); state.hole = 1; }
  else if (k === 's') state.style = STYLE_KEYS[(STYLE_KEYS.indexOf(state.style) + 1) % STYLE_KEYS.length];
  else return;
  render();
});
addEventListener('resize', fit);

fit();
render();
