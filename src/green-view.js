// The green seen from above for putting, like the 16-bit golf games: the putt
// runs up the screen, the green is mown in stripes and shaded lighter where it's
// higher, and little arrows drift downhill to show the slope.

import { surfaceAt, dist } from './course-generator.js';
import { heightAt, slopeAt } from './terrain.js';
import { CUP } from './putting.js';

const STRIPE = 10; // pixels per mowing stripe
const ARROW_GAP = 32;
const GROUND_RGB = {
  green: [[88, 176, 72], [78, 160, 64]], fringe: [[62, 136, 52]], rough: [[46, 108, 42], [42, 100, 38]],
  bunker: [[226, 204, 146], [214, 190, 132]], water: [[58, 120, 200], [52, 110, 188]], trees: [[30, 78, 32], [26, 70, 28]],
};

// Lay the green out in the screen box { x, y, w, h } for a putt from `ball`:
// the hole straight up the screen from the ball, the two of them centred and as
// close up as fits. Draws the ground into a canvas of the whole screen, W x H.
export function makeGreenView(hole, ball, box, W, H) {
  const pin = hole.pin;
  const d = Math.max(0.5, dist(ball, pin));
  const up = { x: (pin.x - ball.x) / d, y: (pin.y - ball.y) / d };
  // Turned, never mirrored, so it matches the course view.
  const right = { x: up.y, y: -up.x };
  const scale = Math.max(5, Math.min(24, box.h * 0.62 / d)); // pixels per yard
  const mid = { x: (ball.x + pin.x) / 2, y: (ball.y + pin.y) / 2 };
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const toScreen = (p) => {
    const dx = p.x - mid.x, dy = p.y - mid.y;
    return { x: cx + (dx * right.x + dy * right.y) * scale, y: cy - (dx * up.x + dy * up.y) * scale };
  };
  const toWorld = (x, y) => {
    const a = (x - cx) / scale, b = -(y - cy) / scale;
    return { x: mid.x + right.x * a + up.x * b, y: mid.y + right.y * a + up.y * b };
  };
  // A direction on the green as a screen direction.
  const dirToScreen = (v) => ({ x: v.x * right.x + v.y * right.y, y: -(v.x * up.x + v.y * up.y) });

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const img = g.createImageData(W, H);
  const arrows = [];
  const h0 = heightAt(hole, pin);
  // Find the ground every few pixels, and pixel by pixel only where it changes.
  const B = 4, gw = Math.ceil(W / B) + 1, gh = Math.ceil(H / B) + 1;
  const coarse = [], lift = [];
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const p = toWorld(i * B + 0.5, j * B + 0.5);
      coarse.push(surfaceAt(hole, p));
      lift.push(heightAt(hole, p) - h0);
    }
  }
  const liftAt = (x, y) => {
    const i = Math.floor(x / B), j = Math.floor(y / B), k = j * gw + i, u = (x % B) / B, v = (y % B) / B;
    return lift[k] * (1 - u) * (1 - v) + lift[k + 1] * u * (1 - v) + lift[k + gw] * (1 - u) * v + lift[k + gw + 1] * u * v;
  };
  const groundAt = (x, y, p) => {
    const i = Math.floor(x / B), j = Math.floor(y / B), k = j * gw + i;
    const a = coarse[k];
    return a === coarse[k + 1] && a === coarse[k + gw] && a === coarse[k + gw + 1] ? a : surfaceAt(hole, p);
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = toWorld(x + 0.5, y + 0.5);
      let s = groundAt(x, y, p);
      if (s === 'waste' || s === 'tee' || s === 'fairway') s = 'rough';
      const tones = GROUND_RGB[s] ?? GROUND_RGB.rough;
      let rgb = s === 'green' ? tones[Math.floor(x / STRIPE) % 2] : tones[(x * 7 + y * 13 + ((x * y) >> 3)) % 5 === 0 ? 1 % tones.length : 0];
      // Higher ground a touch lighter, lower ground darker.
      if (s === 'green' || s === 'fringe') {
        const k = 1 + Math.max(-0.16, Math.min(0.16, liftAt(x, y) * 0.5));
        rgb = rgb.map((c) => Math.min(255, Math.round(c * k)));
      }
      const i = (y * W + x) * 4;
      img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; img.data[i + 3] = 255;
      if (s === 'green' && x % ARROW_GAP === ARROW_GAP >> 1 && y % ARROW_GAP === ARROW_GAP >> 1) {
        const sl = slopeAt(hole, p);
        const steep = Math.hypot(sl.x, sl.y);
        if (steep > 0.004) {
          const down = dirToScreen({ x: -sl.x / steep, y: -sl.y / steep });
          arrows.push({ x, y, dx: down.x, dy: down.y, steep });
        }
      }
    }
  }
  g.putImageData(img, 0, 0);
  return { hole, ball, pin, scale, canvas, toScreen, toWorld, arrows };
}

const dotAt = (ctx, x, y, color, w = 1, h = 1) => { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), w, h); };

// Draw the green: the ground, the slope arrows (moving faster on steeper
// slopes), the hole, any other balls, the aim and the ball. `aim` and `ball`
// are world points; `others` are other golfers' balls.
export function drawGreenView(ctx, v, now, { ball, aim, others = [], dropped = false }) {
  ctx.drawImage(v.canvas, 0, 0);
  for (const a of v.arrows) {
    // An arrow pointing downhill, bolder on steeper ground, with a bright
    // pulse running down it: faster where it's steeper.
    const len = 4 + Math.min(5, a.steep * 150);
    const alpha = Math.min(0.75, 0.3 + a.steep * 12);
    const pulse = ((now / 1000) * (0.5 + a.steep * 30) + (a.x * 0.37 + a.y * 0.11)) % 1;
    const tipX = a.x + a.dx * len / 2, tipY = a.y + a.dy * len / 2;
    for (let k = 0; k <= len; k++) {
      const lit = Math.abs(k / len - (1 - pulse)) < 0.2;
      ctx.fillStyle = `rgba(240, 255, 224, ${(lit ? Math.min(1, alpha + 0.35) : alpha).toFixed(2)})`;
      ctx.fillRect(Math.round(tipX - a.dx * k), Math.round(tipY - a.dy * k), 1, 1);
    }
    ctx.fillStyle = `rgba(240, 255, 224, ${alpha.toFixed(2)})`;
    for (const side of [-1, 1]) {
      for (let k = 1; k <= 2; k++) {
        ctx.fillRect(Math.round(tipX - (a.dx + side * a.dy * 0.9) * k), Math.round(tipY - (a.dy - side * a.dx * 0.9) * k), 1, 1);
      }
    }
  }
  // The hole: a dark disc with a lighter lip on the far side.
  const c = v.toScreen(v.pin);
  const r = Math.max(3.2, CUP * v.scale);
  for (let y = -Math.ceil(r); y <= Math.ceil(r); y++) {
    for (let x = -Math.ceil(r); x <= Math.ceil(r); x++) {
      const d = Math.hypot(x, y);
      if (d <= r) dotAt(ctx, c.x + x, c.y + y, d > r - 1 && y < 0 ? '#2a3a24' : '#0a0c08');
      else if (d <= r + 1) dotAt(ctx, c.x + x, c.y + y, 'rgba(255, 255, 255, 0.55)');
    }
  }
  // The flagstick's shadow, falling down to the right.
  for (let k = 2; k < 14; k++) dotAt(ctx, c.x + k * 0.7 + r - 1, c.y + k * 0.35, 'rgba(0, 0, 0, 0.25)');
  for (const o of others) greenBall(ctx, v.toScreen(o), v.scale, '#e8e8f0');
  if (aim) greenAim(ctx, v, ball, aim, now);
  if (!dropped) greenBall(ctx, v.toScreen(ball), v.scale, '#ffffff');
}

function greenBall(ctx, s, scale, color) {
  const x = Math.round(s.x), y = Math.round(s.y);
  if (scale >= 10) {
    dotAt(ctx, x - 1, y + 1, 'rgba(0, 0, 0, 0.35)', 3, 2);
    dotAt(ctx, x - 1, y - 1, color, 3, 3);
    dotAt(ctx, x + 1, y + 1, '#b8b8c8');
  } else {
    dotAt(ctx, x, y + 1, 'rgba(0, 0, 0, 0.35)', 2, 1);
    dotAt(ctx, x - 1, y - 1, color, 2, 2);
  }
}

// A dotted line from the ball to the aim, and a crosshair on the aim.
function greenAim(ctx, v, ball, aim, now) {
  const a = v.toScreen(ball), b = v.toScreen(aim);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const crawl = (now / 120) % 4;
  for (let k = 4 + crawl; k < len - 5; k += 4) dotAt(ctx, a.x + (b.x - a.x) * k / len, a.y + (b.y - a.y) * k / len, 'rgba(255, 255, 255, 0.8)');
  const x = Math.round(b.x), y = Math.round(b.y);
  for (let k = 3; k <= 6; k++) {
    dotAt(ctx, x - k, y, '#ffffff'); dotAt(ctx, x + k, y, '#ffffff');
    dotAt(ctx, x, y - k, '#ffffff'); dotAt(ctx, x, y + k, '#ffffff');
  }
}
