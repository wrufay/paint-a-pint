// Brush lab: just the acrylic engine, a palette, and live sliders. Tune on the iPad, copy the numbers back.
import { PaintEngine, DEFAULTS, hexToLinear } from './brush/engine.js';
import { PAINTS, PALETTES } from './brush/paints.js';
import { SLIDERS, fmt, loadParams, saveParams } from './brush/tune.js';

const W = 1200, H = 900;
const canvas = document.getElementById('paper');
canvas.width = W; canvas.height = H;
const ctx = canvas.getContext('2d');
const engine = new PaintEngine({ width: W, height: H });
const img = new ImageData(engine.rgba, W, H);

// ── params (persisted so a refresh doesn't lose your tuning) ────────────────
loadParams(engine.params);
const save = () => saveParams(engine.params);

const sliders = document.getElementById('sliders');
const inputs = {};
for (const [k, label, min, max, step] of SLIDERS) {
  const row = document.createElement('div'); row.className = 'row';
  row.innerHTML = `<label for="s_${k}">${label}</label><input id="s_${k}" type="range" min="${min}" max="${max}" step="${step}"><output></output>`;
  const input = row.querySelector('input'), out = row.querySelector('output');
  input.value = engine.params[k]; out.textContent = fmt(+input.value);
  input.addEventListener('input', () => { engine.params[k] = +input.value; out.textContent = fmt(+input.value); save(); });
  inputs[k] = { input, out };
  sliders.appendChild(row);
}

// ── palette ─────────────────────────────────────────────────────────────────
const box = PALETTES['my box'].map((id) => PAINTS.find((p) => p.id === id));
let paint = box[1], color = hexToLinear(paint.hex);
const pal = document.getElementById('palette');
box.forEach((p) => {
  const b = document.createElement('button');
  const name = `${p.brand} · ${p.name}${p.code ? ' · ' + p.code : ''}`;
  b.className = 'sw' + (p === paint ? ' on' : ''); b.style.background = p.hex; b.title = name; b.setAttribute('aria-label', name);
  b.addEventListener('click', () => { paint = p; color = hexToLinear(p.hex); pal.querySelectorAll('.sw').forEach((s) => s.classList.remove('on')); b.classList.add('on'); });
  pal.appendChild(b);
});

// ── layout: fit the canvas in the window, keep the aspect ───────────────────
function fit() {
  const s = Math.min(innerWidth / W, (innerHeight - 90) / H, 1.6);
  canvas.style.width = `${W * s}px`; canvas.style.height = `${H * s}px`;
}
addEventListener('resize', fit); fit();

// ── input ───────────────────────────────────────────────────────────────────
let penSeen = 0, active = null, last = null;
const toCanvas = (e) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height)]; };
const nowS = () => performance.now() / 1000;

function pressureOf(e, x, y) {
  if (e.pointerType === 'pen' && e.pressure > 0) return e.pressure;
  // mouse / finger have no real pressure: lighter when moving fast, like a hand skimming
  const sp = last ? Math.hypot(x - last[0], y - last[1]) : 0;
  return Math.max(0.4, Math.min(0.85, 0.85 - sp * 0.012));
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'pen') penSeen = performance.now();
  else if (e.pointerType === 'touch' && performance.now() - penSeen < 8000) return; // palm rejection once the Pencil is in use
  if (active !== null) return;
  active = e.pointerId; canvas.setPointerCapture(e.pointerId);
  const [x, y] = toCanvas(e);
  engine.snapshot(); engine.setTime(nowS());
  last = null;
  engine.beginStroke(x, y, pressureOf(e, x, y), color, paint);
  last = [x, y];
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== active) return;
  engine.setTime(nowS());
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of evs.length ? evs : [e]) {
    const [x, y] = toCanvas(ev);
    engine.strokeTo(x, y, pressureOf(ev, x, y));
    last = [x, y];
  }
});
const end = (e) => { if (e.pointerId !== active) return; active = null; engine.endStroke(); };
canvas.addEventListener('pointerup', end);
canvas.addEventListener('pointercancel', end);

// ── buttons ─────────────────────────────────────────────────────────────────
document.getElementById('undo').onclick = () => engine.restore();
document.getElementById('clear').onclick = () => { engine.snapshot(); engine.clear(); };
let wetOn = false;
document.getElementById('wetview').onclick = (e) => {
  wetOn = !wetOn; engine.setDebugWet(wetOn);
  e.currentTarget.style.background = wetOn ? '#cfe3ff' : ''; // blue = still workable, orange = getting tacky, no tint = dry
  document.getElementById('stat').dataset.hint = wetOn ? 'blue = open · orange = tacky · no tint = dry' : '';
};
document.getElementById('dry').onclick = () => { engine.snapshot(); engine.dryAll(); }; // as if left overnight
document.getElementById('tuneBtn').onclick = () => document.getElementById('tune').classList.toggle('open');
document.getElementById('save').onclick = () => {
  const a = document.createElement('a'); a.download = 'paint-a-pint.png'; a.href = canvas.toDataURL('image/png'); a.click();
};
document.getElementById('reset').onclick = () => {
  Object.assign(engine.params, DEFAULTS); save();
  for (const [k] of SLIDERS) { inputs[k].input.value = engine.params[k]; inputs[k].out.textContent = fmt(engine.params[k]); }
};
document.getElementById('copy').onclick = async () => {
  const text = JSON.stringify(engine.params, null, 1);
  const box = document.getElementById('out');
  box.value = text; box.style.display = 'block';
  try { await navigator.clipboard.writeText(text); box.value = 'copied ✓\n' + text; }
  catch { box.focus(); box.select(); } // fallback: long-press → copy
};

// ── frame loop: blit only what changed ──────────────────────────────────────
const stat = document.getElementById('stat');
let frames = 0, t0 = performance.now(), worst = 0;
function frame() {
  const t = performance.now();
  engine.setTime(nowS()); // paint keeps drying while nobody is painting
  const r = engine.render();
  if (r) { ctx.putImageData(img, 0, 0, r.x, r.y, r.w, r.h); worst = Math.max(worst, performance.now() - t); }
  frames++;
  if (t - t0 > 1000) { stat.textContent = `${frames} fps · worst paint ${worst.toFixed(1)}ms` + (stat.dataset.hint ? ' · ' + stat.dataset.hint : ''); frames = 0; worst = 0; t0 = t; }
  requestAnimationFrame(frame);
}
engine.renderAll(); ctx.putImageData(img, 0, 0);
requestAnimationFrame(frame);

window.__lab = { engine }; // debugging hook
