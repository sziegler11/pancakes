'use strict';

// ---------------------------------------------------------------- setup
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');
const W = 320, H = 180;
ctx.imageSmoothingEnabled = false;

// ---------------------------------------------------------------- pixel font (3x5)
const FONT = {
  A:[2,5,7,5,5],B:[6,5,6,5,6],C:[3,4,4,4,3],D:[6,5,5,5,6],E:[7,4,6,4,7],
  F:[7,4,6,4,4],G:[3,4,5,5,3],H:[5,5,7,5,5],I:[7,2,2,2,7],J:[1,1,1,5,2],
  K:[5,5,6,5,5],L:[4,4,4,4,7],M:[5,7,5,5,5],N:[6,5,5,5,5],O:[2,5,5,5,2],
  P:[6,5,6,4,4],Q:[2,5,5,6,3],R:[6,5,6,5,5],S:[3,4,2,1,6],T:[7,2,2,2,2],
  U:[5,5,5,5,7],V:[5,5,5,5,2],W:[5,5,5,7,5],X:[5,5,2,5,5],Y:[5,5,2,2,2],
  Z:[7,1,2,4,7],
  '0':[2,5,5,5,2],'1':[2,6,2,2,7],'2':[6,1,2,4,7],'3':[6,1,2,1,6],
  '4':[5,5,7,1,1],'5':[7,4,6,1,6],'6':[3,4,6,5,2],'7':[7,1,2,2,2],
  '8':[2,5,2,5,2],'9':[2,5,3,1,6],
  '!':[2,2,2,0,2],'.':[0,0,0,0,2],':':[0,2,0,2,0],'-':[0,0,7,0,0],
  '/':[1,1,2,4,4],'?':[6,1,2,0,2],',':[0,0,0,2,4],' ':[0,0,0,0,0],
};

function drawText(s, x, y, color, scale = 1) {
  ctx.fillStyle = color;
  s = s.toUpperCase();
  for (let i = 0; i < s.length; i++) {
    const g = FONT[s[i]] || FONT['?'];
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 3; c++)
        if (g[r] & (4 >> c))
          ctx.fillRect(x + i * 4 * scale + c * scale, y + r * scale, scale, scale);
  }
}
const textW = (s, scale = 1) => s.length * 4 * scale - scale;
const drawTextC = (s, y, color, scale = 1) => drawText(s, (W - textW(s, scale)) / 2 | 0, y, color, scale);

// ---------------------------------------------------------------- audio
let actx = null;
function beep(freq, dur, type = 'square', slide = 0, vol = 0.08) {
  if (!actx) return;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, actx.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), actx.currentTime + dur);
  g.gain.setValueAtTime(vol, actx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
  o.connect(g); g.connect(actx.destination);
  o.start(); o.stop(actx.currentTime + dur);
}
const sfx = {
  flip:   () => beep(440, 0.15, 'square', 440),
  nope:   () => beep(120, 0.12, 'sawtooth', -40),
  pickup: () => { beep(520, 0.08); setTimeout(() => beep(780, 0.1), 60); },
  plate:  () => { beep(660, 0.08); setTimeout(() => beep(880, 0.12), 70); },
  burn:   () => beep(300, 0.5, 'sawtooth', -260, 0.1),
  win:    () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.18), i * 120)),
  lose:   () => [400, 350, 300, 200].forEach((f, i) => setTimeout(() => beep(f, 0.2, 'sawtooth'), i * 150)),
};

// ---------------------------------------------------------------- game state
const KEYS = {};
let state = 'title';   // title | play | won | lost | between
let level = 1;
let stateT = 0;        // time in current state
let time = 0;

const chef = { x: 160, dir: 1, walk: 0, carrying: false };
let pans = [];         // {x, state:'empty'|'cooking'|'done'|'burnt', cookT, flips, refillT, flipAnim, shake}
let plated = 0, burns = 0;
let particles = [];    // smoke/steam {x,y,vx,vy,t,life,color,r}
let floaters = [];     // floating text {x,y,t,text,color}
const PLATE_X = 294;
const MAX_BURNS = 3;

function levelCfg(n) {
  return {
    pans: Math.min(2 + Math.floor((n - 1) / 2), 6),
    target: Math.min(3 + n, 12),
    flipsNeeded: Math.min(2 + Math.floor((n - 1) / 3), 4),
    readyAt: Math.max(5.5 - n * 0.35, 2.8),                 // sec until flippable
    window:  Math.max(4.0 - n * 0.3, 1.7),                  // flippable window before burning
    refill:  1.2,
  };
}
let cfg = levelCfg(1);

function startLevel(n) {
  level = n;
  cfg = levelCfg(n);
  plated = 0; burns = 0;
  chef.x = 160; chef.carrying = false;
  particles = []; floaters = [];
  pans = [];
  const span = cfg.pans > 1 ? 215 / (cfg.pans - 1) : 0;
  for (let i = 0; i < cfg.pans; i++) {
    pans.push({
      x: 32 + i * span | 0,
      state: 'empty', cookT: 0, flips: 0,
      refillT: 0.5 + i * 0.9,     // stagger the start
      flipAnim: 0, shake: 0,
    });
  }
  state = 'play'; stateT = 0;
}

// ---------------------------------------------------------------- input
addEventListener('keydown', e => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {} }
  if (e.repeat) return;
  KEYS[e.code] = true;
  if (e.code === 'Space' || e.code === 'Enter') {
    if (state === 'title') startLevel(1);
    else if (state === 'play') interact();
    else if (state === 'won' && stateT > 0.8) startLevel(level + 1);
    else if (state === 'lost' && stateT > 0.8) startLevel(level);
  }
});
addEventListener('keyup', e => { KEYS[e.code] = false; });
addEventListener('blur', () => { for (const k in KEYS) KEYS[k] = false; });

function interact() {
  // nearest pan in reach
  let best = null, bd = 15;
  for (const p of pans) {
    const d = Math.abs(chef.x - p.x);
    if (d < bd) { bd = d; best = p; }
  }
  if (best) return usePan(best);
  if (Math.abs(chef.x - PLATE_X) < 18 && chef.carrying) {
    chef.carrying = false; plated++;
    sfx.plate();
    floaters.push({ x: PLATE_X, y: 118, t: 0, text: 'PLATED!', color: '#7be36b' });
    if (plated >= cfg.target) { state = 'won'; stateT = 0; sfx.win(); }
    return;
  }
  if (Math.abs(chef.x - PLATE_X) < 18 && !chef.carrying) sfx.nope();
}

function usePan(p) {
  if (p.state === 'burnt') {          // scrape it out
    p.state = 'empty'; p.refillT = cfg.refill; p.cookT = 0; p.flips = 0;
    floaters.push({ x: p.x, y: 96, t: 0, text: 'SCRAPED', color: '#999' });
    beep(200, 0.15, 'sawtooth', -100);
  } else if (p.state === 'done') {
    if (chef.carrying) { p.shake = 0.3; sfx.nope(); return; }
    chef.carrying = true;
    p.state = 'empty'; p.refillT = cfg.refill; p.cookT = 0; p.flips = 0;
    sfx.pickup();
  } else if (p.state === 'cooking') {
    if (p.cookT >= cfg.readyAt) {     // good flip
      p.flips++;
      p.flipAnim = 0.45;
      p.cookT = 0;
      sfx.flip();
      if (p.flips >= cfg.flipsNeeded) {
        p.state = 'done';
        floaters.push({ x: p.x, y: 96, t: 0, text: 'DONE!', color: '#ffd24a' });
      } else {
        floaters.push({ x: p.x, y: 96, t: 0, text: 'FLIP!', color: '#8ecdf7' });
      }
    } else {                          // too early
      p.shake = 0.3;
      sfx.nope();
      floaters.push({ x: p.x, y: 96, t: 0, text: 'TOO SOON!', color: '#f77' });
    }
  }
}

// ---------------------------------------------------------------- update
function update(dt) {
  time += dt; stateT += dt;
  if (state !== 'play') return;

  // chef movement
  const l = KEYS['ArrowLeft'] || KEYS['KeyA'], r = KEYS['ArrowRight'] || KEYS['KeyD'];
  if (l && !r) { chef.x -= 95 * dt; chef.dir = -1; chef.walk += dt * 10; }
  else if (r && !l) { chef.x += 95 * dt; chef.dir = 1; chef.walk += dt * 10; }
  else chef.walk = 0;
  chef.x = Math.max(12, Math.min(W - 12, chef.x));

  // pans
  for (const p of pans) {
    p.flipAnim = Math.max(0, p.flipAnim - dt);
    p.shake = Math.max(0, p.shake - dt);
    if (p.state === 'empty') {
      if (plated + (chef.carrying ? 1 : 0) < cfg.target) {
        p.refillT -= dt;
        if (p.refillT <= 0) { p.state = 'cooking'; p.cookT = 0; p.flips = 0; }
      }
    } else if (p.state === 'cooking' || p.state === 'done') {
      p.cookT += dt;
      const burnAt = cfg.readyAt + cfg.window;
      // smoke when getting close
      if (p.cookT > burnAt - 1.5 && Math.random() < dt * 12)
        particles.push({ x: p.x + (Math.random() * 12 - 6), y: 104, vx: (Math.random() - 0.5) * 6, vy: -18 - Math.random() * 8, t: 0, life: 0.9, color: '#777', r: 1 });
      if (p.cookT >= burnAt) {
        p.state = 'burnt';
        burns++;
        sfx.burn();
        floaters.push({ x: p.x, y: 96, t: 0, text: 'BURNT!', color: '#f55' });
        for (let i = 0; i < 8; i++)
          particles.push({ x: p.x + (Math.random() * 14 - 7), y: 104, vx: (Math.random() - 0.5) * 14, vy: -22 - Math.random() * 14, t: 0, life: 1.2, color: '#444', r: 2 });
        if (burns >= MAX_BURNS) { state = 'lost'; stateT = 0; sfx.lose(); }
      }
    } else if (p.state === 'burnt') {
      if (Math.random() < dt * 8)
        particles.push({ x: p.x + (Math.random() * 12 - 6), y: 104, vx: (Math.random() - 0.5) * 6, vy: -16, t: 0, life: 1, color: '#333', r: 2 });
    }
  }

  // particles / floaters
  for (const pt of particles) { pt.t += dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; }
  particles = particles.filter(pt => pt.t < pt.life);
  for (const f of floaters) f.t += dt;
  floaters = floaters.filter(f => f.t < 1);
}

// ---------------------------------------------------------------- drawing helpers
function px(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w, h); }

function pancakeColor(p) {
  const burnAt = cfg.readyAt + cfg.window;
  const t = Math.min(p.cookT / burnAt, 1);
  if (p.state === 'burnt') return '#26190f';
  // pale batter -> golden -> dark brown
  const stops = [[242, 227, 184], [222, 165, 82], [160, 96, 38], [90, 52, 22]];
  const f = t * (stops.length - 1);
  const i = Math.min(f | 0, stops.length - 2), k = f - i;
  const c = stops[i].map((v, j) => v + (stops[i + 1][j] - v) * k | 0);
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function drawPancake(x, y, color, w = 14) {
  px(x - w / 2 + 1, y, w - 2, 1, color);
  px(x - w / 2, y + 1, w, 2, color);
  px(x - w / 2 + 1, y + 3, w - 2, 1, color);
  // highlight
  px(x - w / 2 + 2, y + 1, 3, 1, 'rgba(255,255,255,0.25)');
}

function drawPan(p) {
  const sx = p.shake > 0 ? Math.sin(p.shake * 60) * 1.5 : 0;
  const x = p.x + sx, y = 106;
  // burner flame glow
  if (p.state === 'cooking' || p.state === 'done' || p.state === 'burnt') {
    const fl = Math.sin(time * 12 + p.x) > 0 ? 1 : 0;
    px(x - 6, y + 6, 12, 2, fl ? '#f8a53d' : '#e06428');
  }
  // pan body
  px(x - 10, y, 20, 4, '#23232e');
  px(x - 9, y + 1, 18, 2, '#3a3a4a');
  // handle
  px(x + 10, y + 1, 7, 2, '#141419');

  // contents
  if (p.state === 'empty') {
    if (p.refillT < 0.5 && plated + (chef.carrying ? 1 : 0) < cfg.target)
      drawPancake(x, y - 2, '#f5ecca', 8 + (0.5 - p.refillT) * 12);
  } else if (p.state === 'burnt') {
    drawPancake(x, y - 3, '#1d130a');
  } else {
    let py = y - 3, squash = 1;
    if (p.flipAnim > 0) {
      const t = 1 - p.flipAnim / 0.45;          // 0..1
      py = y - 3 - Math.sin(t * Math.PI) * 16;
      squash = Math.abs(Math.cos(t * Math.PI * 2)) * 0.7 + 0.3;
    }
    drawPancake(x, py, pancakeColor(p), 14 * squash + 2);
  }

  // status indicator
  if (p.state === 'cooking' && p.cookT >= cfg.readyAt && p.flipAnim <= 0) {
    const bob = Math.sin(time * 8) > 0 ? 0 : 1;
    drawText('!', x - 1, 86 + bob, '#ffd24a', 2);
  } else if (p.state === 'done') {
    const bob = Math.sin(time * 8) > 0 ? 0 : 1;
    px(x - 1, 90 + bob, 2, 4, '#7be36b'); px(x - 3, 92 + bob, 6, 2, '#7be36b'); // up arrow-ish
    px(x - 2, 91 + bob, 4, 1, '#7be36b');
  }
  // cook meter under pan
  if (p.state === 'cooking' || p.state === 'done') {
    const burnAt = cfg.readyAt + cfg.window;
    const t = Math.min(p.cookT / burnAt, 1);
    px(x - 9, y + 9, 18, 2, '#1a1a24');
    px(x - 9, y + 9, 18 * t, 2, t < cfg.readyAt / burnAt ? '#8ecdf7' : (t < 0.85 ? '#ffd24a' : '#f55'));
    // flips left dots
    for (let i = 0; i < cfg.flipsNeeded; i++)
      px(x - 9 + i * 4, y + 13, 2, 2, i < p.flips ? '#7be36b' : '#3a3a4a');
  }
}

function drawChef() {
  const x = chef.x | 0, y = 138;  // top of sprite; feet at y+26
  const step = (Math.sin(chef.walk * 2) > 0 && chef.walk > 0) ? 1 : 0;
  const d = chef.dir;
  // legs
  px(x - 4, y + 20, 3, 6 - step, '#2b3a67'); px(x + 1, y + 20, 3, 6 - (1 - step) * (chef.walk > 0 ? 1 : 0), '#2b3a67');
  px(x - 4, y + 25, 3, 1, '#1a1a24'); px(x + 1, y + 25, 3, 1, '#1a1a24');
  // apron / body
  px(x - 5, y + 10, 10, 10, '#e8e8ee');
  px(x - 5, y + 10, 10, 2, '#cf3b3b');   // neckerchief
  // arms
  px(x - 7, y + 12, 2, 5, '#e8e8ee'); px(x + 5, y + 12, 2, 5, '#e8e8ee');
  px(x - 7, y + 17, 2, 2, '#f0c8a0'); px(x + 5, y + 17, 2, 2, '#f0c8a0');
  // head
  px(x - 4, y + 3, 8, 7, '#f0c8a0');
  px(x + d * 2 - 1, y + 5, 2, 2, '#222');            // eye
  px(x - 4 + (d > 0 ? 6 : 0), y + 8, 2, 1, '#c98965'); // nose-ish shading
  // chef hat
  px(x - 4, y, 8, 3, '#fff');
  px(x - 5, y - 3, 10, 4, '#fff');
  px(x - 3, y - 5, 6, 2, '#fff');
  // carried pancake on a spatula above head
  if (chef.carrying) {
    px(x - 1, y - 9, 2, 4, '#888');
    drawPancake(x, y - 12, '#c98937');
  }
}

function drawKitchen() {
  // wall
  px(0, 0, W, 100, '#354a63');
  for (let ty = 0; ty < 100; ty += 20)
    for (let tx = (ty / 20 % 2) * 20; tx < W; tx += 40)
      px(tx, ty, 20, 20, '#3b526e');
  px(0, 96, W, 4, '#26374a');
  // window
  px(18, 14, 44, 34, '#1a2433'); px(20, 16, 40, 30, '#7fb2e5');
  px(38, 16, 3, 30, '#1a2433'); px(20, 29, 40, 3, '#1a2433');
  px(26, 20, 8, 4, '#e8f2fb'); px(44, 34, 10, 4, '#dcebf8'); // clouds
  // hanging sign
  px(232, 10, 70, 16, '#5d3a22'); px(234, 12, 66, 12, '#7a4c2b');
  drawText('PANCAKES', 240, 15, '#ffd24a');
  // stove
  px(0, 100, W, 14, '#8a8a99');       // stovetop
  px(0, 100, W, 2, '#b9b9c9');
  px(0, 114, W, 40, '#5c5c6e');       // stove body
  px(0, 114, W, 2, '#44445a');
  for (const p of pans) { px(p.x - 8, 112, 16, 2, '#333340'); } // burner grates
  // oven door details
  px(8, 124, 60, 22, '#4a4a5e'); px(10, 126, 56, 2, '#6c6c80');
  // floor
  px(0, 154, W, 26, '#332b33');
  for (let tx = 0; tx < W; tx += 16)
    px(tx + (tx / 16 % 2) * 0, 154 + (tx / 16 % 2) * 0, 8, 26, '#3a313a');
  px(0, 154, W, 2, '#221c22');

  // plate table
  px(PLATE_X - 16, 128, 32, 4, '#5d3a22');
  px(PLATE_X - 14, 132, 4, 22, '#4a2e1b'); px(PLATE_X + 10, 132, 4, 22, '#4a2e1b');
  // plate
  px(PLATE_X - 11, 125, 22, 3, '#dfe6ef'); px(PLATE_X - 8, 124, 16, 1, '#c3ccd9');
  // stack
  for (let i = 0; i < plated; i++)
    drawPancake(PLATE_X, 121 - i * 4, i % 2 ? '#cf9040' : '#c2823a', 15);
  if (plated > 0 && state === 'play') { // butter on top
    px(PLATE_X - 2, 118 - plated * 4, 4, 2, '#ffe98a');
  }
}

function drawHUD() {
  drawText(`LV ${level}`, 4, 4, '#fff');
  const ps = `PLATE ${plated}/${cfg.target}`;
  drawText(ps, W - textW(ps) - 4, 4, '#ffd24a');
  drawText('BURNS', 44, 4, '#f88');
  for (let i = 0; i < MAX_BURNS; i++) {
    const c = i < burns ? '#1d130a' : '#54424f';
    px(68 + i * 8, 4, 6, 3, c);
    if (i < burns) px(69 + i * 8, 3, 4, 1, '#666'); // smoke line
  }
}

function drawFloaters() {
  for (const f of floaters) {
    const y = f.y - f.t * 14;
    drawText(f.text, f.x - textW(f.text) / 2 | 0, y | 0, f.color);
  }
}

function drawParticles() {
  for (const pt of particles) {
    ctx.globalAlpha = 1 - pt.t / pt.life;
    px(pt.x, pt.y, pt.r, pt.r, pt.color);
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- screens
function drawTitle() {
  px(0, 0, W, H, '#0d0d1a');
  // big pancake stack decoration
  for (let i = 0; i < 5; i++) drawPancake(160, 118 - i * 5, i % 2 ? '#cf9040' : '#c2823a', 34 - i * 2);
  px(154, 92, 12, 4, '#ffe98a');
  px(140, 124, 40, 3, '#dfe6ef');
  drawTextC('PANCAKE', 26, '#ffd24a', 3);
  drawTextC('PANIC!', 46, '#ff9840', 3);
  drawTextC('ARROWS/AD TO MOVE', 138, '#8ecdf7');
  drawTextC('SPACE TO FLIP, GRAB, PLATE', 148, '#8ecdf7');
  if (Math.sin(time * 4) > -0.3) drawTextC('PRESS SPACE TO START', 164, '#fff');
}

function drawEnd(title, color, sub) {
  ctx.fillStyle = 'rgba(10,10,20,0.75)'; ctx.fillRect(0, 0, W, H);
  drawTextC(title, 60, color, 3);
  drawTextC(sub, 92, '#ddd');
  if (stateT > 0.8 && Math.sin(time * 4) > -0.3) drawTextC('PRESS SPACE', 120, '#fff');
}

// ---------------------------------------------------------------- main loop
function render() {
  if (state === 'title') { drawTitle(); return; }
  drawKitchen();
  for (const p of pans) drawPan(p);
  drawChef();
  drawParticles();
  drawFloaters();
  drawHUD();
  if (state === 'won') drawEnd('ORDER UP!', '#7be36b', `LEVEL ${level} CLEAR!`);
  if (state === 'lost') drawEnd('KITCHEN RUINED', '#f55', 'TOO MANY BURNT PANCAKES');
}

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
