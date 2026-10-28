// The screens around a round, drawn over the course: the title, starting a
// new career and the clubhouse (the hub between rounds). Each screen has a
// layout function giving its buttons, so clicks can be matched to them, and a
// draw function.

import { drawText, textWidth } from './art.js';
import { panel, GOLD } from './hud.js';
import { drawDinky, golferFrame } from './dinky.js';
import { STYLES } from './course-generator.js';
import { LOOKS, SHIRT_COLOURS, SKILL_NAMES, WEEKS, MEMBERS, STAKES, startingSkills, courseStars, memberGolfer, record } from './career.js';

const DIM = '#c8c0e8', QUIET = '#8a80b0';
const mid = (W, w) => Math.round((W - w) / 2);

// A button: { x, y, w, h, label }. Lit when the mouse is over it; greyed when off.
function menuButton(ctx, b, hot, on = true) {
  ctx.fillStyle = !on ? '#241a40' : hot ? '#4a3a8a' : '#2c2050';
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.fillStyle = !on ? '#3a2e60' : hot ? GOLD : '#7a68c0';
  ctx.fillRect(b.x, b.y, b.w, 1); ctx.fillRect(b.x, b.y + b.h - 1, b.w, 1);
  ctx.fillRect(b.x, b.y, 1, b.h); ctx.fillRect(b.x + b.w - 1, b.y, 1, b.h);
  const scale = textWidth(b.label, 2) <= b.w - 8 && b.h >= 16 ? 2 : 1;
  const color = !on ? '#5a4a80' : hot ? GOLD : '#ffffff';
  drawText(ctx, b.label, b.x + Math.round((b.w - textWidth(b.label, scale)) / 2), b.y + Math.round((b.h - 5 * scale) / 2), color, scale, on ? '#1a1a2a' : null);
}

// A skill as a labelled bar, 0 to 100.
function skillBar(ctx, x, y, name, value) {
  drawText(ctx, name, x, y, DIM, 1, null);
  const bx = x + 46, bw = 80;
  ctx.fillStyle = '#1a1430';
  ctx.fillRect(bx, y, bw, 5);
  ctx.fillStyle = value >= 60 ? '#5ac85a' : value >= 45 ? GOLD : '#e07a4a';
  ctx.fillRect(bx, y, Math.round(bw * value / 100), 5);
  drawText(ctx, `${Math.round(value)}`, bx + bw + 5, y, '#ffffff', 1, null);
}

// The golfer at twice size, feet at (x, y).
function golferAt(ctx, look, shirt, x, y, now) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(2, 2);
  drawDinky(ctx, `${look}/${golferFrame('stand', 0, now)}`, 0, 0, look === 'veteran' ? null : shirt);
  ctx.restore();
}

// ---------- Title ----------

export function titleLayout(W, H, hasSave) {
  const w = 150, h = 18, x = mid(W, w);
  let y = Math.round(H * 0.5);
  const next = (key, label) => { const b = { key, label, x, y, w, h }; y += 26; return b; };
  return [
    ...(hasSave ? [next('continue', 'CONTINUE CAREER')] : []),
    next('new', 'NEW CAREER'),
    next('free', 'FREE PLAY'),
  ];
}

export function drawTitle(ctx, W, H, { buttons, hover, save }) {
  const logo = 'PIXEL GOLF';
  drawText(ctx, logo, mid(W, textWidth(logo, 6)), Math.round(H * 0.2), GOLD, 6);
  const tag = 'A RETRO GOLF CAREER';
  drawText(ctx, tag, mid(W, textWidth(tag, 2)), Math.round(H * 0.2) + 42, '#ffffff', 2);
  buttons.forEach((b) => menuButton(ctx, b, hover === b.key));
  if (save) {
    const line = `${save.name}, SEASON ${save.season} WEEK ${save.week}, £${save.money}`;
    drawText(ctx, line, mid(W, textWidth(line)), buttons[0].y + buttons[0].h + 3, QUIET, 1, null);
  }
  const help = 'CLICK A BUTTON, OR UP/DOWN AND ENTER';
  drawText(ctx, help, mid(W, textWidth(help)), H - 16, QUIET, 1, null);
}

// ---------- New career ----------

export function newCareerLayout(W, H) {
  const pw = 300, ph = 220, px = mid(W, pw), py = mid(H, ph);
  const look = { x: px + 16, y: py + 66, w: 130, h: 96 };
  return {
    panel: { x: px, y: py, w: pw, h: ph }, look,
    name: { key: 'name', x: px + 16, y: py + 40, w: 130, h: 14 },
    prev: { key: 'prev', label: '<', x: look.x, y: look.y + 30, w: 16, h: 16 },
    next: { key: 'next', label: '>', x: look.x + look.w - 16, y: look.y + 30, w: 16, h: 16 },
    shirts: SHIRT_COLOURS.map((c, i) => ({ key: `shirt-${i}`, colour: c, x: look.x + 4 + i * 21, y: look.y + look.h - 4, w: 16, h: 10 })),
    start: { key: 'start', label: 'START CAREER', x: px + pw - 146, y: py + ph - 30, w: 130, h: 18 },
    back: { key: 'back', label: 'BACK', x: px + 16, y: py + ph - 30, w: 70, h: 18 },
  };
}

export function drawNewCareer(ctx, W, H, L, { draft, hover, now, replaces }) {
  const p = L.panel;
  panel(ctx, p.x, p.y, p.w, p.h);
  drawText(ctx, 'NEW CAREER', p.x + 16, p.y + 12, GOLD, 2);
  drawText(ctx, 'YOUR NAME', L.name.x, L.name.y - 9, DIM, 1, null);
  ctx.fillStyle = '#1a1430';
  ctx.fillRect(L.name.x, L.name.y, L.name.w, L.name.h);
  const cursor = Math.floor(now / 450) % 2 ? '_' : '';
  drawText(ctx, `${draft.name}${cursor}`, L.name.x + 4, L.name.y + 5, '#ffffff', 1, null);
  if (!draft.name) drawText(ctx, 'TYPE A NAME', L.name.x + 8, L.name.y + 5, QUIET, 1, null);

  // The golfer: their look, with arrows to change it and shirt colours under.
  const look = LOOKS.find((l) => l.look === draft.look);
  drawText(ctx, 'PLAYER TYPE', L.look.x, L.look.y - 2, DIM, 1, null);
  golferAt(ctx, draft.look, draft.shirt, L.look.x + L.look.w / 2, L.look.y + 66, now);
  menuButton(ctx, L.prev, hover === 'prev');
  menuButton(ctx, L.next, hover === 'next');
  drawText(ctx, look.name, L.look.x + Math.round((L.look.w - textWidth(look.name)) / 2), L.look.y + 72, '#ffffff', 1, null);
  const recolours = draft.look !== 'veteran';
  for (const s of L.shirts) {
    ctx.fillStyle = s.colour;
    ctx.globalAlpha = recolours ? 1 : 0.25;
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.globalAlpha = 1;
    if (recolours && s.colour === draft.shirt) {
      ctx.fillStyle = GOLD;
      ctx.fillRect(s.x - 1, s.y - 2, s.w + 2, 1); ctx.fillRect(s.x - 1, s.y + s.h + 1, s.w + 2, 1);
    }
  }
  if (!recolours) drawText(ctx, 'KEEPS HIS OWN JUMPER', L.look.x + 4, L.shirts[0].y + 14, QUIET, 1, null);

  // What they start with.
  const sx = p.x + 160, sy = p.y + 40;
  drawText(ctx, 'STARTING SKILLS', sx, sy - 9, DIM, 1, null);
  const skills = startingSkills(draft.look);
  Object.entries(SKILL_NAMES).forEach(([k, name], i) => skillBar(ctx, sx - 6, sy + 4 + i * 12, name, skills[k]));
  const notes = ['YOU START AT A SMALL CLUB', 'WITH £100, PLAYING NINE', 'HOLES ON SHORT COURSES.'];
  notes.forEach((n, i) => drawText(ctx, n, sx - 6, sy + 74 + i * 9, QUIET, 1, null));

  if (replaces) drawText(ctx, 'THIS REPLACES YOUR SAVED CAREER', L.back.x + L.back.w + 8, L.back.y - 10, '#e07a4a', 1, null);
  menuButton(ctx, L.back, hover === 'back');
  menuButton(ctx, L.start, hover === 'start', !!draft.name.trim());
}

// ---------- Clubhouse ----------

export function hubLayout(W, H, career) {
  const pw = 380, ph = 232, px = mid(W, pw), py = mid(H, ph);
  const play = career.round ? `CONTINUE ${career.round.match ? 'MATCH' : 'ROUND'}, HOLE ${career.round.hole}` : 'PRACTICE ROUND';
  return {
    panel: { x: px, y: py, w: pw, h: ph },
    play: { key: 'play', label: play, x: px + pw - 156, y: py + ph - 30, w: 140, h: 18 },
    match: { key: 'match', label: 'MONEY MATCH', x: px + pw - 282, y: py + ph - 30, w: 118, h: 18 },
    menu: { key: 'menu', label: 'MENU', x: px + 16, y: py + ph - 30, w: 64, h: 18 },
  };
}

const toPar = (d) => (d === 0 ? 'E' : d > 0 ? `+${d}` : `${d}`);

export function drawHub(ctx, W, H, L, { career: c, hover, now }) {
  const p = L.panel;
  panel(ctx, p.x, p.y, p.w, p.h);
  drawText(ctx, c.home.name, p.x + 16, p.y + 12, GOLD, 2);
  drawText(ctx, `SEASON ${c.season}   WEEK ${c.week} OF ${WEEKS}   CLUB LEVEL`, p.x + 16, p.y + 28, DIM, 1, null);

  // You, your money and your skills.
  golferAt(ctx, c.look, c.shirt, p.x + 46, p.y + 112, now);
  drawText(ctx, c.name, p.x + 16, p.y + 120, '#ffffff', 1, null);
  drawText(ctx, `£${c.money}`, p.x + 16, p.y + 130, GOLD, 2);
  const sx = p.x + 112, sy = p.y + 48;
  drawText(ctx, 'SKILLS', sx, sy - 6, DIM, 1, null);
  Object.entries(SKILL_NAMES).forEach(([k, name], i) => {
    skillBar(ctx, sx, sy + 6 + i * 12, name, c.skills[k]);
    // How the last round's form moved it.
    const d = c.report?.change[k];
    if (d) drawText(ctx, `${d > 0 ? '+' : ''}${d.toFixed(1)}`, sx + 148, sy + 6 + i * 12, d > 0 ? '#7ee07e' : '#f08a8a', 1, null);
  });
  if (c.report) drawText(ctx, `LAST ROUND: ${c.report.good} GOOD SHOTS, ${c.report.bad} BAD`, sx, sy + 66, QUIET, 1, null);

  // Recent rounds.
  const ry = p.y + 128;
  drawText(ctx, 'RECENT ROUNDS', sx, ry, DIM, 1, null);
  if (!c.history.length) drawText(ctx, 'NONE YET. PLAY NINE HOLES AT YOUR CLUB.', sx, ry + 11, QUIET, 1, null);
  c.history.slice(0, 5).forEach((r, i) => {
    if (r.match) {
      const m = r.match, money = m.money > 0 ? `+£${m.money}` : m.money < 0 ? `-£${-m.money}` : '£0';
      const how = m.lead > 0 ? `BEAT ${r.vs}` : m.lead < 0 ? `LOST TO ${r.vs}` : `HALVED WITH ${r.vs}`;
      drawText(ctx, `WK ${r.week}  MATCH: ${how}  ${money}`, sx, ry + 11 + i * 9, m.money > 0 ? GOLD : m.money < 0 ? '#f08a8a' : '#ffffff', 1, null);
      return;
    }
    const vs = r.vsScore == null ? '' : r.score < r.vsScore ? `  BEAT ${r.vs} ${r.vsScore}` : r.score > r.vsScore ? `  LOST TO ${r.vs} ${r.vsScore}` : `  TIED ${r.vs}`;
    drawText(ctx, `WK ${r.week}  ${r.score} (${toPar(r.score - r.par)})${vs}`, sx, ry + 11 + i * 9, '#ffffff', 1, null);
  });
  if (c.round?.match) drawText(ctx, `MATCH IN PROGRESS: ${c.round.vs.toUpperCase()} FOR £${c.round.match.stake}`, p.x + 16, p.y + p.h - 44, GOLD, 1, null);
  else if (c.round) drawText(ctx, `ROUND IN PROGRESS AT ${c.round.course.name}: ${c.round.hole - 1} PLAYED`, p.x + 16, p.y + p.h - 44, GOLD, 1, null);

  menuButton(ctx, L.menu, hover === 'menu');
  menuButton(ctx, L.play, hover === 'play');
  if (!c.round) menuButton(ctx, L.match, hover === 'match');
}

// ---------- Where to play ----------

// A card for each course you can play (home first), and a way back.
export function coursesLayout(W, H, courses) {
  const pw = 340, ch = 40, ph = 52 + courses.length * (ch + 6) + 28, px = mid(W, pw), py = mid(H, ph);
  return {
    panel: { x: px, y: py, w: pw, h: ph },
    cards: courses.map((c, i) => ({ key: `course-${i}`, x: px + 16, y: py + 40 + i * (ch + 6), w: pw - 32, h: ch })),
    back: { key: 'back', label: 'BACK', x: px + 16, y: py + ph - 28, w: 70, h: 18 },
  };
}

// Difficulty as five little diamonds, the first `n` lit.
function stars(ctx, x, y, n) {
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < n ? GOLD : '#3a2e60';
    const cx = x + i * 8 + 3;
    ctx.fillRect(cx - 1, y, 3, 1); ctx.fillRect(cx - 3, y + 1, 7, 3); ctx.fillRect(cx - 1, y + 4, 3, 1);
    ctx.fillRect(cx, y - 1, 1, 1); ctx.fillRect(cx, y + 5, 1, 1);
  }
}

export function drawCourses(ctx, W, H, L, { courses, hover }) {
  const p = L.panel;
  panel(ctx, p.x, p.y, p.w, p.h);
  drawText(ctx, 'WHERE TO PLAY', p.x + 16, p.y + 12, GOLD, 2);
  drawText(ctx, 'NINE HOLES AGAINST BERTIE, AT HOME OR AWAY', p.x + 16, p.y + 28, DIM, 1, null);
  L.cards.forEach((b, i) => {
    const c = courses[i], hot = hover === b.key;
    ctx.fillStyle = hot ? '#4a3a8a' : '#2c2050';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = hot ? GOLD : '#7a68c0';
    ctx.fillRect(b.x, b.y, b.w, 1); ctx.fillRect(b.x, b.y + b.h - 1, b.w, 1);
    ctx.fillRect(b.x, b.y, 1, b.h); ctx.fillRect(b.x + b.w - 1, b.y, 1, b.h);
    drawText(ctx, c.name, b.x + 8, b.y + 7, hot ? GOLD : '#ffffff', 1, null);
    const where = i === 0 ? 'HOME' : 'AWAY';
    drawText(ctx, where, b.x + b.w - 8 - textWidth(where), b.y + 7, i === 0 ? GOLD : QUIET, 1, null);
    drawText(ctx, `${STYLES[c.style].name.toUpperCase()}   PAR ${c.roundPar}   ${c.yards} YDS`, b.x + 8, b.y + 19, DIM, 1, null);
    drawText(ctx, 'DIFFICULTY', b.x + 8, b.y + 29, QUIET, 1, null);
    stars(ctx, b.x + 8 + textWidth('DIFFICULTY') + 6, b.y + 29, courseStars(c.rating));
  });
  menuButton(ctx, L.back, hover === 'back');
}

// ---------- Money matches ----------

// The members down the left; the one picked, the stake and the challenge on the right.
export function membersLayout(W, H) {
  const pw = 400, ph = 252, px = mid(W, pw), py = mid(H, ph);
  const rx = px + 196;
  return {
    panel: { x: px, y: py, w: pw, h: ph },
    members: MEMBERS.map((m, i) => ({ key: `member-${i}`, x: px + 12, y: py + 40 + i * 30, w: 172, h: 27 })),
    right: { x: rx, y: py + 40 },
    stakes: STAKES.map((v, i) => ({ key: `stake-${i}`, label: `£${v}`, x: rx + i * 46, y: py + ph - 56, w: 42, h: 16 })),
    challenge: { key: 'challenge', label: 'PLAY MATCH', x: px + pw - 126, y: py + ph - 30, w: 114, h: 18 },
    back: { key: 'back', label: 'BACK', x: px + 12, y: py + ph - 30, w: 70, h: 18 },
  };
}

const NERVE = (n) => (n >= 0.7 ? 'BOLD' : n <= 0.3 ? 'CAUTIOUS' : 'STEADY');

export function drawMembers(ctx, W, H, L, { career: c, pick, hover, now }) {
  const p = L.panel;
  panel(ctx, p.x, p.y, p.w, p.h);
  drawText(ctx, 'MONEY MATCH', p.x + 12, p.y + 12, GOLD, 2);
  drawText(ctx, `NINE HOLES MATCH PLAY AT ${c.home.name}`, p.x + 12, p.y + 28, DIM, 1, null);

  L.members.forEach((b, i) => {
    const m = MEMBERS[i], on = pick.member === m.id, hot = hover === b.key;
    ctx.fillStyle = on ? '#4a3a8a' : hot ? '#3a2c6a' : '#2c2050';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    if (on) { ctx.fillStyle = GOLD; ctx.fillRect(b.x, b.y, 2, b.h); }
    const r = record(c, m.id);
    drawText(ctx, m.name.toUpperCase(), b.x + 8, b.y + 5, on ? GOLD : '#ffffff', 1, null);
    if (m.rival) drawText(ctx, 'RIVAL', b.x + b.w - 6 - textWidth('RIVAL'), b.y + 5, '#f08a8a', 1, null);
    const played = r.won + r.lost + r.halved;
    drawText(ctx, played ? `WON ${r.won}  LOST ${r.lost}  HALVED ${r.halved}` : 'NOT PLAYED YET', b.x + 8, b.y + 16, QUIET, 1, null);
  });

  // The member picked: their golfer, their game and how bold they play.
  const m = MEMBERS.find((x) => x.id === pick.member), g = memberGolfer(c, m.id);
  const { x, y } = L.right;
  golferAt(ctx, g.look, g.shirt, x + 22, y + 62, now);
  drawText(ctx, m.name.toUpperCase(), x + 54, y + 2, GOLD, 1, null);
  drawText(ctx, m.about, x + 54, y + 12, DIM, 1, null);
  Object.entries(SKILL_NAMES).forEach(([k, name], i) => skillBar(ctx, x + 54, y + 26 + i * 10, name, g.skills[k]));
  drawText(ctx, `PLAYS ${NERVE(m.nerve)}`, x + 54, y + 78, QUIET, 1, null);

  drawText(ctx, 'STAKE', L.stakes[0].x, L.stakes[0].y - 10, DIM, 1, null);
  L.stakes.forEach((b, i) => {
    const v = STAKES[i], ok = v <= c.money;
    menuButton(ctx, b, hover === b.key || pick.stake === v, ok);
  });
  if (!pick.stake) drawText(ctx, 'NOT ENOUGH MONEY. PLAY PRACTICE ROUNDS FOR NOW.', p.x + 12, p.y + p.h - 44, '#f08a8a', 1, null);
  else drawText(ctx, `WIN £${pick.stake} OR LOSE IT. YOU HAVE £${c.money}.`, L.stakes[0].x + 32, L.stakes[0].y - 10, QUIET, 1, null);
  menuButton(ctx, L.back, hover === 'back');
  menuButton(ctx, L.challenge, hover === 'challenge', !!pick.stake);
}
