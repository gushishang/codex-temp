import './style.css';

const canvas = document.getElementById('app');
const ctx = canvas.getContext('2d');

const NOTE = { TAP: 'tap', HOLD: 'hold', FLICK: 'flick', DRAG: 'drag' };

const songs = [
  { title: 'Pulse Matrix', artist: 'Offline Chart', level: 'IN 12', bpm: 150, accent: '#78dbff', chart: '/charts/pulse-matrix.json' },
  { title: 'Neon Fracture', artist: 'Offline Chart', level: 'AT 13', bpm: 170, accent: '#ff9ac7', chart: '/charts/neon-fracture.json' },
  { title: 'Aether Bloom', artist: 'Offline Chart', level: 'HD 10', bpm: 136, accent: '#99ffc6', chart: '/charts/aether-bloom.json' },
  { title: 'Skyline Drift', artist: 'Offline Chart', level: 'EZ 7', bpm: 120, accent: '#ffd29a', chart: '/charts/skyline-drift.json' },
];

const state = { scene: 'list', w: 0, h: 0, dpr: 1, listScroll: 0, pointer: null, game: null, flash: 0 };

const clamp = (n, a, b) => Math.max(a, Math.min(n, b));
const lerp = (a, b, t) => a + (b - a) * t;

function resize() {
  state.dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  state.w = window.innerWidth;
  state.h = window.innerHeight;
  canvas.width = Math.floor(state.w * state.dpr);
  canvas.height = Math.floor(state.h * state.dpr);
  canvas.style.width = `${state.w}px`;
  canvas.style.height = `${state.h}px`;
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
}

function trackRect() {
  const m = Math.max(12, state.w * 0.06);
  const top = Math.max(86, state.h * 0.15);
  const bottom = Math.max(118, state.h * 0.2);
  return { x: m, y: top, w: state.w - m * 2, h: state.h - top - bottom };
}

async function startSong(song) {
  const chartData = await fetch(song.chart).then((r) => r.json());
  const chart = chartData.notes.map((n) => ({ ...n, hit: false, holdStarted: false, judgedAt: 0 }));
  const lengthMs = Math.max(...chart.map((n) => n.time + (n.duration || 0)), 30000) + 1500;

  state.game = {
    song,
    chart,
    lengthMs,
    startTs: performance.now(),
    elapsed: 0,
    score: 0,
    combo: 0,
    maxCombo: 0,
    perfect: 0,
    good: 0,
    miss: 0,
    acc: 100,
    hitFx: [],
    sparks: [],
    ringBursts: [],
    ended: false,
    resultAlpha: 0,
    lanes: 6,
    laneW: 0,
    judgeY: 0,
    linePhase: 0,
    energy: 0,
  };
  state.scene = 'game';
}

function endGame() {
  state.game = null;
  state.scene = 'list';
}

function noteY(noteTime, now, rect, judgeY) {
  const travel = 1700;
  return lerp(rect.y - 30, judgeY, clamp(1 - (noteTime - now) / travel, -0.2, 1.5));
}

function judge(note, kind, x, y) {
  const g = state.game;
  note.hit = true;
  note.judgedAt = g.elapsed;
  if (kind === 'perfect') {
    g.perfect += 1; g.combo += 1; g.score += 1_000_000 / g.chart.length;
  } else if (kind === 'good') {
    g.good += 1; g.combo += 1; g.score += 700_000 / g.chart.length;
  } else {
    g.miss += 1; g.combo = 0;
  }
  g.maxCombo = Math.max(g.maxCombo, g.combo);
  const total = g.perfect + g.good + g.miss;
  g.acc = total ? ((g.perfect + g.good * 0.65) / total) * 100 : 100;

  const color = kind === 'perfect' ? '#ffffff' : kind === 'good' ? '#ffd59a' : '#ff7a90';
  for (let i = 0; i < 24; i += 1) {
    const a = (Math.PI * 2 * i) / 24;
    const v = 1.5 + Math.random() * 5;
    g.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, size: 1 + Math.random() * 2.5, color });
  }
  g.ringBursts.push({ x, y, t: 0, color });
  g.hitFx.push({ x, y, t: 0, color });
  g.energy = clamp(g.energy + (kind === 'perfect' ? 0.35 : 0.2), 0, 1);
  state.flash = 0.32;
}

function attemptHit(x, y, release = false) {
  const g = state.game;
  if (!g || g.ended) return;
  const rect = trackRect();
  const lane = clamp(Math.floor((x - rect.x) / g.laneW), 0, 5);
  const now = g.elapsed;
  const cands = g.chart.filter((n) => !n.hit && n.lane === lane && Math.abs(n.time - now) < 190);
  if (!cands.length) return;

  cands.sort((a, b) => Math.abs(a.time - now) - Math.abs(b.time - now));
  const note = cands[0];
  const d = Math.abs(note.time - now);

  if (note.type === NOTE.HOLD && !release) {
    if (d < 120) note.holdStarted = true;
    return;
  }
  if (note.type === NOTE.FLICK && !release) return;

  judge(note, d < 70 ? 'perfect' : 'good', x, g.judgeY);
}

function roundedRect(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawBG() {
  const gradient = ctx.createLinearGradient(0, 0, 0, state.h);
  gradient.addColorStop(0, '#25306a');
  gradient.addColorStop(0.45, '#0a1022');
  gradient.addColorStop(1, '#04060d');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, state.w, state.h);
}

function drawList() {
  const pad = Math.max(16, state.w * 0.04);
  const cw = Math.min(760, state.w - pad * 2);
  const ch = Math.max(86, state.h * 0.125);
  const baseY = 116 - state.listScroll;

  ctx.fillStyle = '#edf2ff';
  ctx.font = `700 ${Math.max(27, state.w * 0.05)}px sans-serif`;
  ctx.fillText('Phygros Feel · 选曲（无音频版）', pad, 56);
  ctx.fillStyle = 'rgba(238,244,255,.7)';
  ctx.font = `500 ${Math.max(13, state.w * 0.019)}px sans-serif`;
  ctx.fillText('离线谱面驱动 · 炫酷打击特效 · 移动判定线 · Tap Hold Flick Drag', pad, 84);

  songs.forEach((s, i) => {
    const x = (state.w - cw) / 2;
    const y = baseY + i * (ch + 14);
    const g = ctx.createLinearGradient(x, y, x + cw, y + ch);
    g.addColorStop(0, `${s.accent}66`);
    g.addColorStop(1, 'rgba(255,255,255,.08)');
    roundedRect(x, y, cw, ch, 14); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = s.accent; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.max(22, state.h * 0.038)}px sans-serif`; ctx.fillText(s.title, x + 18, y + ch * 0.42);
    ctx.font = `500 ${Math.max(14, state.h * 0.022)}px sans-serif`; ctx.fillStyle = 'rgba(245,250,255,.87)'; ctx.fillText(`${s.artist} · ${s.bpm} BPM`, x + 18, y + ch * 0.72);
    ctx.textAlign = 'right'; ctx.fillStyle = s.accent; ctx.font = `700 ${Math.max(19, state.h * 0.03)}px sans-serif`; ctx.fillText(s.level, x + cw - 18, y + ch * 0.6); ctx.textAlign = 'left';
  });
}

function updateGame(ts) {
  const g = state.game;
  if (!g) return;
  g.elapsed = ts - g.startTs;
  if (g.elapsed >= g.lengthMs || g.chart.every((n) => n.hit)) g.ended = true;

  const rect = trackRect();
  g.laneW = rect.w / g.lanes;

  const ahead = g.chart.filter((n) => !n.hit && n.time > g.elapsed && n.time - g.elapsed < 1000).length;
  const pulse = clamp(ahead / 22 + g.energy, 0, 1);
  g.linePhase += 0.06 + pulse * 0.08;
  g.energy = Math.max(0, g.energy - 0.013);
  g.judgeY = rect.y + rect.h - 8 + Math.sin(g.linePhase) * (8 + pulse * 12);

  for (const n of g.chart) {
    if (n.hit) continue;
    if (n.type === NOTE.HOLD && n.holdStarted && g.elapsed > n.time + n.duration - 40) {
      const x = rect.x + n.lane * g.laneW + g.laneW / 2;
      judge(n, 'perfect', x, g.judgeY);
      continue;
    }
    if (g.elapsed - n.time > 180) {
      const x = rect.x + n.lane * g.laneW + g.laneW / 2;
      judge(n, 'miss', x, g.judgeY);
    }
  }

  g.hitFx.forEach((f) => { f.t += 0.08; });
  g.hitFx = g.hitFx.filter((f) => f.t < 1);
  g.ringBursts.forEach((r) => { r.t += 0.06; });
  g.ringBursts = g.ringBursts.filter((r) => r.t < 1);
  g.sparks.forEach((p) => {
    p.x += p.vx; p.y += p.vy;
    p.vx *= 0.985; p.vy = p.vy * 0.985 + 0.12;
    p.life -= 0.026;
  });
  g.sparks = g.sparks.filter((p) => p.life > 0);

  const aura = ctx.createRadialGradient(state.w * 0.5, state.h * 0.26, 40, state.w * 0.5, state.h * 0.26, state.w * 0.7);
  aura.addColorStop(0, `${g.song.accent}${Math.floor(120 + pulse * 100).toString(16)}`);
  aura.addColorStop(1, 'rgba(8,10,17,0)');
  ctx.fillStyle = aura;
  ctx.fillRect(0, 0, state.w, state.h);
}

function drawGame() {
  const g = state.game;
  const rect = trackRect();
  g.laneW = rect.w / g.lanes;

  roundedRect(rect.x, rect.y, rect.w, rect.h, 10);
  ctx.fillStyle = 'rgba(5,9,18,0.56)'; ctx.fill();

  for (let i = 0; i <= g.lanes; i += 1) {
    const x = rect.x + i * g.laneW;
    ctx.strokeStyle = `rgba(255,255,255,${i % 2 ? 0.08 : 0.15})`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, rect.y); ctx.lineTo(x, rect.y + rect.h); ctx.stroke();
  }

  ctx.strokeStyle = g.song.accent;
  ctx.shadowBlur = 20 + g.energy * 45;
  ctx.shadowColor = g.song.accent;
  ctx.lineWidth = Math.max(3, state.h * 0.006);
  ctx.beginPath(); ctx.moveTo(rect.x, g.judgeY); ctx.lineTo(rect.x + rect.w, g.judgeY); ctx.stroke();
  ctx.shadowBlur = 0;

  for (const n of g.chart) {
    if (n.hit) continue;
    const y = noteY(n.time, g.elapsed, rect, g.judgeY);
    if (y < rect.y - 70 || y > rect.y + rect.h + 80) continue;
    const x = rect.x + n.lane * g.laneW + g.laneW / 2;
    let c = '#9fd6ff';
    if (n.type === NOTE.FLICK) c = '#ffaad7';
    if (n.type === NOTE.DRAG) c = '#b8ffd7';
    if (n.type === NOTE.HOLD) c = '#ffe8a7';
    if (n.type === NOTE.HOLD) {
      const ey = noteY(n.time + n.duration, g.elapsed, rect, g.judgeY);
      ctx.strokeStyle = `${c}d0`; ctx.lineWidth = Math.min(18, g.laneW * 0.45);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, ey); ctx.stroke();
    }
    const sz = clamp(g.laneW * 0.27, 12, 28);
    roundedRect(x - sz, y - sz * 0.42, sz * 2, sz * 0.84, sz * 0.22);
    ctx.fillStyle = c; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.stroke();
  }

  g.ringBursts.forEach((r) => {
    const radius = 20 + r.t * 120;
    const alpha = 1 - r.t;
    ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.9})`;
    ctx.lineWidth = 3 - r.t * 2;
    ctx.beginPath(); ctx.arc(r.x, r.y, radius, 0, Math.PI * 2); ctx.stroke();
  });

  g.hitFx.forEach((f) => {
    const r = 14 + f.t * 58;
    ctx.strokeStyle = `rgba(255,255,255,${1 - f.t})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, Math.PI * 2); ctx.stroke();
  });

  g.sparks.forEach((p) => {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
    ctx.globalAlpha = 1;
  });

  ctx.fillStyle = '#fff';
  ctx.font = `700 ${Math.max(18, state.h * 0.029)}px sans-serif`;
  ctx.fillText(g.song.title, rect.x, 38);
  ctx.font = `600 ${Math.max(14, state.h * 0.022)}px sans-serif`;
  ctx.fillText(`Score ${Math.floor(g.score).toString().padStart(7, '0')}`, rect.x, 62);
  ctx.textAlign = 'right';
  ctx.fillText(`COMBO ${g.combo}`, rect.x + rect.w, 38);
  ctx.fillText(`ACC ${g.acc.toFixed(2)}%`, rect.x + rect.w, 62);
  ctx.fillText(`TIME ${Math.max(0, ((g.lengthMs - g.elapsed) / 1000)).toFixed(1)}s`, rect.x + rect.w, 86);
  ctx.textAlign = 'left';

  if (g.ended) {
    g.resultAlpha = clamp(g.resultAlpha + 0.04, 0, 1);
    ctx.save(); ctx.globalAlpha = g.resultAlpha;
    roundedRect(state.w * 0.12, state.h * 0.23, state.w * 0.76, state.h * 0.5, 14);
    ctx.fillStyle = 'rgba(6,9,18,.92)'; ctx.fill();
    ctx.strokeStyle = g.song.accent; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${Math.max(28, state.w * 0.048)}px sans-serif`; ctx.fillText('RESULT', state.w * 0.38, state.h * 0.33);
    ctx.font = `600 ${Math.max(16, state.w * 0.028)}px sans-serif`;
    ctx.fillText(`Perfect ${g.perfect} / Good ${g.good} / Miss ${g.miss}`, state.w * 0.2, state.h * 0.42);
    ctx.fillText(`Max Combo ${g.maxCombo}`, state.w * 0.2, state.h * 0.49);
    ctx.fillText(`Final Score ${Math.floor(g.score)}`, state.w * 0.2, state.h * 0.56);
    const b = { x: state.w * 0.34, y: state.h * 0.62, w: state.w * 0.32, h: Math.max(46, state.h * 0.07) };
    roundedRect(b.x, b.y, b.w, b.h, 10);
    ctx.fillStyle = `${g.song.accent}44`; ctx.fill();
    ctx.strokeStyle = g.song.accent; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillText('返回选曲', b.x + b.w * 0.27, b.y + b.h * 0.62);
    ctx.restore();
  }
}

function tick(ts) {
  if (state.flash > 0) state.flash -= 0.02;
  drawBG();
  if (state.scene === 'game') updateGame(ts);
  if (state.scene === 'list') drawList(); else drawGame();
  if (state.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${state.flash * 0.22})`;
    ctx.fillRect(0, 0, state.w, state.h);
  }
  requestAnimationFrame(tick);
}

canvas.addEventListener('pointerdown', (e) => {
  const p = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY };
  state.pointer = p;
  if (state.scene === 'list') {
    const pad = Math.max(16, state.w * 0.04);
    const cw = Math.min(760, state.w - pad * 2);
    const ch = Math.max(86, state.h * 0.125);
    const baseY = 116 - state.listScroll;
    songs.forEach((song, i) => {
      const x = (state.w - cw) / 2;
      const y = baseY + i * (ch + 14);
      if (p.x > x && p.x < x + cw && p.y > y && p.y < y + ch) startSong(song);
    });
  } else {
    const g = state.game;
    if (g.ended) {
      const b = { x: state.w * 0.34, y: state.h * 0.62, w: state.w * 0.32, h: Math.max(46, state.h * 0.07) };
      if (p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h) endGame();
    } else attemptHit(p.x, p.y, false);
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (!state.pointer) return;
  if (state.scene === 'list') {
    const dy = e.clientY - state.pointer.y;
    state.listScroll = clamp(state.listScroll - dy, 0, 220);
  }
  if (state.scene === 'game') {
    state.pointer.x = e.clientX;
    state.pointer.y = e.clientY;
    const g = state.game;
    if (!g?.ended) {
      const speed = Math.hypot(e.clientX - state.pointer.sx, e.clientY - state.pointer.sy);
      if (speed > 42) {
        const rect = trackRect();
        const lane = clamp(Math.floor((e.clientX - rect.x) / g.laneW), 0, 5);
        const n = g.chart.find((it) => !it.hit && it.type === NOTE.FLICK && it.lane === lane && Math.abs(it.time - g.elapsed) < 140);
        if (n) {
          const x = rect.x + n.lane * g.laneW + g.laneW / 2;
          judge(n, 'perfect', x, g.judgeY);
        }
      }
      const rect = trackRect();
      const lane = clamp(Math.floor((e.clientX - rect.x) / g.laneW), 0, 5);
      const drag = g.chart.find((it) => !it.hit && it.type === NOTE.DRAG && it.lane === lane && Math.abs(it.time - g.elapsed) < 120);
      if (drag) {
        const x = rect.x + drag.lane * g.laneW + g.laneW / 2;
        judge(drag, 'perfect', x, g.judgeY);
      }
      attemptHit(e.clientX, e.clientY, false);
    }
  }
  state.pointer.y = e.clientY;
});

canvas.addEventListener('pointerup', (e) => {
  if (state.scene === 'game' && state.game && !state.game.ended) attemptHit(e.clientX, e.clientY, true);
  state.pointer = null;
});

window.addEventListener('resize', resize);
resize();
requestAnimationFrame(tick);
