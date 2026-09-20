// Settings shared by the lab and the room: saved params, the full list of raw sliders, and a panel that puts a few
// plain-language controls on top with everything else folded under "advanced".
// The lab and the room read and write the same saved values, so tuning in one shows up in the other.

export const KEY = 'paint-a-pint:lab-params:v1';
export const loadParams = (params) => { try { Object.assign(params, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {} };
export const saveParams = (params) => { try { localStorage.setItem(KEY, JSON.stringify(params)); } catch {} };

// [param, label, min, max, step]
export const SLIDERS = [
  ['size', 'brush size', 8, 140, 1],
  ['bristles', 'bristles', 8, 90, 1],
  ['load', 'paint load', 0.2, 2, 0.05],
  ['consumption', 'runs dry', 0.00005, 0.003, 0.00005],
  ['dry', 'dry brush', 0, 1.5, 0.05],
  ['opacity', 'opacity', 0.3, 1, 0.02],
  ['pickup', 'wet pickup', 0, 0.6, 0.01],
  ['wetSeconds', 'open time (s)', 5, 300, 5],
  ['waterMix', 'paint water', 0.1, 0.85, 0.01],
  ['thickDry', 'thick dries slow', 0, 2, 0.05],
  ['skin', 'skin', 0, 4, 0.1],
  ['tack', 'tack drag', 0, 1.5, 0.05],
  ['dryDarken', 'dry darkening', 0, 0.3, 0.01],
  ['timeScale', 'time warp', 1, 120, 1],
  ['push', 'ridges', 0, 0.8, 0.02],
  ['heightGain', 'thickness', 0.01, 0.2, 0.005],
  ['relief', 'relief', 0, 14, 0.25],
  ['weave', 'canvas weave', 0, 0.4, 0.01],
  ['gloss', 'gloss', 0, 0.8, 0.02],
  ['lightAngle', 'light angle', 0, 360, 5],
  ['follow', 'follow stroke', 0, 1, 0.05],
  ['fixedAngle', 'brush angle', -90, 90, 5],
  ['smooth', 'smoothing', 0, 0.9, 0.05],
  ['hueJitter', 'colour drift', 0, 0.3, 0.01],
  ['bristleTint', 'bristle tint', 0, 0.2, 0.01],
];

export const fmt = (v) => (Math.abs(v) < 0.01 && v !== 0 ? v.toFixed(5) : Number.isInteger(v) ? String(v) : String(+v.toFixed(3)));

// The few things a painter actually thinks about. Each is a 0..1 slider mapped onto one or more engine params.
const lerp = (a, b, t) => a + (b - a) * t;
const inv = (a, b, v) => Math.min(1, Math.max(0, (v - a) / (b - a)));
const SIMPLE = [
  { label: 'how runny', lo: 'buttery', hi: 'runny', tip: 'water in the paint: runny paint is thin and see-through',
    get: (p) => inv(0.25, 0.75, p.waterMix), set: (p, v) => { p.waterMix = lerp(0.25, 0.75, v); } },
  { label: 'how much paint', lo: 'a little', hi: 'a lot', tip: 'how thick each stroke lays down',
    get: (p) => inv(0.02, 0.14, p.heightGain), set: (p, v) => { p.heightGain = lerp(0.02, 0.14, v); } },
  { label: 'drying speed', lo: 'slow', hi: 'fast', tip: 'how long paint stays blendable before it goes tacky',
    get: (p) => Math.log(300 / p.wetSeconds) / Math.log(300 / 15), set: (p, v) => { p.wetSeconds = Math.round(300 * Math.pow(15 / 300, v)); } },
  { label: 'bristle ridges', lo: 'smooth', hi: 'ridged', tip: 'how much the brush pushes wet paint into ridges',
    get: (p) => inv(0, 0.8, p.push), set: (p, v) => { p.push = lerp(0, 0.8, v); } },
  { label: 'canvas texture', lo: 'smooth', hi: 'rough', tip: 'how much the canvas weave shows',
    get: (p) => inv(0, 0.3, p.weave), set: (p, v) => { p.weave = lerp(0, 0.3, v); } },
  { label: 'fast-forward time', lo: 'real time', hi: 'x60', tip: 'makes paint dry faster so you are not waiting',
    get: (p) => inv(1, 60, p.timeScale), set: (p, v) => { p.timeScale = Math.round(lerp(1, 60, v)); } },
];

// Builds the panel element (not attached anywhere). `defaults` is what "reset" restores.
export function buildTunePanel(params, defaults, { onChange = () => {} } = {}) {
  const el = document.createElement('div');
  el.className = 'note';
  el.style.cssText = 'display:none;position:absolute;left:26px;top:50%;transform:translateY(-50%);width:264px;max-height:82vh;overflow:auto;padding:20px 16px 14px;font-size:var(--text-sm);';
  const h = document.createElement('h2');
  h.textContent = 'SETTINGS'; h.style.cssText = 'margin:0 0 12px;color:var(--ultramarine);font-size:var(--text-lg);letter-spacing:.08em;';
  el.appendChild(h);

  const change = () => { saveParams(params); onChange(); };
  const syncs = [];
  const row = (label, hint, input, out, tip) => {
    const r = document.createElement('div');
    r.style.cssText = 'margin:0 0 11px;';
    if (tip) r.title = tip;
    const top = document.createElement('div');
    top.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:3px;';
    const l = document.createElement('label'); l.textContent = label;
    top.appendChild(l); if (out) top.appendChild(out);
    r.appendChild(top); r.appendChild(input);
    if (hint) { const s = document.createElement('div'); s.style.cssText = 'display:flex;justify-content:space-between;color:var(--ink-soft);font-size:var(--text-xs);'; s.innerHTML = `<span>${hint[0]}</span><span>${hint[1]}</span>`; r.appendChild(s); }
    return r;
  };
  const range = (min, max, step) => { const i = document.createElement('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.style.cssText = 'width:100%;accent-color:var(--green);'; return i; };

  for (const c of SIMPLE) {
    const i = range(0, 1, 0.01);
    const sync = () => { i.value = c.get(params); };
    i.addEventListener('input', () => { c.set(params, +i.value); change(); syncs.forEach((f) => f()); });
    syncs.push(sync);
    el.appendChild(row(c.label, [c.lo, c.hi], i, null, c.tip));
  }

  const adv = document.createElement('details');
  adv.style.cssText = 'margin-top:6px;';
  const sum = document.createElement('summary'); sum.textContent = 'advanced (every setting)'; sum.style.cssText = 'cursor:pointer;margin-bottom:10px;color:var(--ink-soft);';
  adv.appendChild(sum);
  for (const [k, label, min, max, step] of SLIDERS) {
    const i = range(min, max, step), out = document.createElement('output'); out.style.color = 'var(--ink-soft)';
    const sync = () => { i.value = params[k]; out.textContent = fmt(+params[k]); };
    i.addEventListener('input', () => { params[k] = +i.value; out.textContent = fmt(params[k]); change(); syncs.forEach((f) => f()); });
    syncs.push(sync);
    adv.appendChild(row(label, null, i, out));
  }
  el.appendChild(adv);

  const reset = document.createElement('button');
  reset.className = 'btn'; reset.textContent = 'reset to defaults';
  reset.onclick = () => { Object.assign(params, defaults); change(); syncs.forEach((f) => f()); };
  el.appendChild(reset);
  syncs.forEach((f) => f());
  el.refresh = () => syncs.forEach((f) => f());
  return el;
}
