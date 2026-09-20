// The room's painter, backed by the acrylic engine. It has the same surface as the old gouache Painter in paint.js
// (down / move / up / clear / composite, .canvas, .dirty), so main.js only swaps the class.
import { PaintEngine, DEFAULTS, hexToLinear } from './brush/engine.js';
import { PAINTS, PALETTES } from './brush/paints.js';
import { buildTunePanel, loadParams, saveParams } from './brush/tune.js';

export const BOX = PALETTES['my box'].map((id) => PAINTS.find((p) => p.id === id));

export class AcrylicPainter {
  constructor(canvas, grainCanvas, w = 1300, h = 950) {
    this.canvas = canvas;
    canvas.width = w; canvas.height = h;
    this.ctx = canvas.getContext('2d');
    grainCanvas.style.display = 'none'; // the engine paints its own canvas weave
    this.engine = new PaintEngine({ width: w, height: h });
    loadParams(this.engine.params);   // whatever was tuned in the lab or in the settings panel
    this.img = new ImageData(this.engine.rgba, w, h);
    // 3D easel maps: unlit colour + normals, so the room's lights shade the paint. They lag the canvas and are only
    // copied out (syncMaps) when the room is actually on screen.
    this.engine.enableMaps();
    this.albedoCanvas = document.createElement('canvas'); this.albedoCanvas.width = w; this.albedoCanvas.height = h;
    this.normalCanvas = document.createElement('canvas'); this.normalCanvas.width = w; this.normalCanvas.height = h;
    this.albedoImg = new ImageData(this.engine.albedo, w, h);
    this.normalImg = new ImageData(this.engine.normals, w, h);
    this.mapRect = null;
    this.engine.renderAll();
    this.ctx.putImageData(this.img, 0, 0);
    this.mapRect = { x: 0, y: 0, w, h };
    this.syncMaps();
    this.changed = false; // canvas has new pixels since the room texture was last refreshed

    this.tool = 'brush';
    this.paint = BOX[1];
    this.color = hexToLinear(this.paint.hex);
    this.dirty = false;
    this.drawing = false;
    this.last = null;
  }

  get size() { return this.engine.params.size; }
  set size(v) { this.engine.params.size = v; }

  setPaint(paint) { this.paint = paint; this.color = hexToLinear(paint.hex); this.tool = 'brush'; }
  clear() { this.engine.snapshot(); this.engine.clear(); this.dirty = false; this._blit(true); }
  undo() { if (this.engine.restore()) this._blit(true); }
  dryNow() { this.engine.snapshot(); this.engine.dryAll(); this._blit(true); }
  setWetnessView(on) { this.engine.setDebugWet(on); this._blit(true); }   // blue = still workable, orange = tacky, none = dry
  savePng() {
    this.composite().toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a'); a.download = 'paint-a-pint.png'; a.href = URL.createObjectURL(blob); a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/png');
  }

  _pressure(x, y, pressure, isPen) {
    if (isPen && pressure > 0) return pressure;
    // mouse and trackpad have no pressure: lighter when moving fast, like a hand skimming
    const sp = this.last ? Math.hypot(x - this.last[0], y - this.last[1]) : 0;
    return Math.max(0.4, Math.min(0.85, 0.85 - sp * 0.012));
  }

  down(x, y, pressure = 0.5, isPen = false) {
    this.drawing = true; this.dirty = true; this.isPen = isPen;
    this.engine.snapshot();
    this.engine.setTime(performance.now() / 1000);
    this.last = null;
    this.engine.beginStroke(x, y, this._pressure(x, y, pressure, isPen), this.color, this.paint);
    this.last = [x, y];
  }

  move(x, y, pressure = 0.5) {
    if (!this.drawing) return;
    this.engine.setTime(performance.now() / 1000);
    this.engine.strokeTo(x, y, this._pressure(x, y, pressure, this.isPen));
    this.last = [x, y];
  }

  up() { if (this.drawing) this.engine.endStroke(); this.drawing = false; }

  // Called every frame by the room, in any mode: paint keeps drying while you look around the room.
  tick(nowMs) {
    this.engine.setTime(nowMs / 1000);
    this._blit(false);
  }

  _blit(all) {
    const r = all ? this.engine.renderAll() : this.engine.render();
    if (!r) return;
    this.ctx.putImageData(this.img, 0, 0, r.x, r.y, r.w, r.h);
    this.changed = true;
    const m = this.mapRect;
    if (!m) this.mapRect = { ...r };
    else { const x1 = Math.max(m.x + m.w, r.x + r.w), y1 = Math.max(m.y + m.h, r.y + r.h); m.x = Math.min(m.x, r.x); m.y = Math.min(m.y, r.y); m.w = x1 - m.x; m.h = y1 - m.y; }
  }

  // copy the changed part of the 3D maps into their canvases; returns whether anything moved
  syncMaps() {
    const m = this.mapRect; if (!m) return false;
    this.albedoCanvas.getContext('2d').putImageData(this.albedoImg, 0, 0, m.x, m.y, m.w, m.h);
    this.normalCanvas.getContext('2d').putImageData(this.normalImg, 0, 0, m.x, m.y, m.w, m.h);
    this.mapRect = null;
    return true;
  }

  // finished painting as a plain canvas (used for the wall frames)
  composite() {
    this._blit(true);
    const c = document.createElement('canvas');
    c.width = this.canvas.width; c.height = this.canvas.height;
    c.getContext('2d').drawImage(this.canvas, 0, 0);
    return c;
  }
}

// Wires the taped-note card to an AcrylicPainter and the pointer events on the paper element.
export function initAcrylicUI(painter, { onBack }) {
  const paper = document.getElementById('paper');
  const cursor = document.getElementById('cursor');
  const swatches = document.getElementById('swatches');
  const size = document.getElementById('size');

  const sync = () => swatches.querySelectorAll('.sw').forEach((b) => b.classList.toggle('sel', b.dataset.id === painter.paint.id));
  BOX.forEach((p) => {
    const b = document.createElement('button');
    const name = `${p.brand} · ${p.name}${p.code ? ' · ' + p.code : ''}`;
    b.className = 'sw'; b.title = name; b.setAttribute('aria-label', name); b.dataset.id = p.id; b.style.background = p.hex;
    b.onclick = () => { painter.setPaint(p); sync(); };
    swatches.appendChild(b);
  });
  size.min = 10; size.max = 140; size.value = painter.size;
  size.oninput = () => { painter.size = +size.value; updateCursor(); };
  document.getElementById('undo').onclick = () => painter.undo();
  document.getElementById('dry').onclick = () => painter.dryNow();
  document.getElementById('clear').onclick = () => painter.clear();
  document.getElementById('back').onclick = onBack;

  // brush shape: flat, filbert (oval) or round (also gives single dabs)
  const shapes = document.createElement('div');
  shapes.className = 'tools'; shapes.style.cssText = 'margin-top:8px;';
  const shapeBtns = {};
  const syncShape = () => { for (const k in shapeBtns) shapeBtns[k].classList.toggle('sel', painter.engine.params.shape === k); };
  for (const k of ['flat', 'filbert', 'round']) {
    const b = document.createElement('button');
    b.className = 'btn'; b.textContent = k; b.style.cssText = 'padding-left:2px;padding-right:2px;font-size:11px;letter-spacing:0;';
    b.title = { flat: 'flat brush: a row of bristles', filbert: 'filbert: an oval tip, width follows pressure', round: 'round brush: click for a dab' }[k];
    b.onclick = () => { painter.engine.params.shape = k; saveParams(painter.engine.params); syncShape(); };
    shapeBtns[k] = b; shapes.appendChild(b);
  }
  syncShape();
  size.parentNode.after(shapes);

  // settings / wetness / save: built here (not in index.html) so the card layout stays the design session's call
  const extra = document.createElement('div');
  extra.className = 'tools'; extra.style.cssText = 'margin-top:8px;flex-wrap:wrap;';   // two rows: settings + wetness, then save png
  const mk = (label, onclick, wide) => { const b = document.createElement('button'); b.className = 'btn'; b.textContent = label; b.onclick = onclick; b.style.flex = wide ? '1 1 100%' : '1 1 calc(50% - 4px)'; extra.appendChild(b); return b; };
  const panel = buildTunePanel(painter.engine.params, DEFAULTS, { onChange: () => { size.value = painter.size; updateCursor(); } });
  document.getElementById('paint').appendChild(panel);
  const settingsBtn = mk('settings', () => { const on = panel.style.display === 'none'; panel.style.display = on ? 'block' : 'none'; settingsBtn.classList.toggle('sel', on); if (on) panel.refresh(); });
  let wet = false;
  const wetBtn = mk('wetness', () => { wet = !wet; painter.setWetnessView(wet); wetBtn.classList.toggle('sel', wet); wetHint.style.display = wet ? 'block' : 'none'; });
  mk('save png', () => painter.savePng(), true);
  const wetHint = document.createElement('p');
  wetHint.textContent = 'blue = still workable · orange = getting tacky · no tint = dry';
  wetHint.style.cssText = 'display:none;margin:8px 0 0;font-size:11px;color:var(--ink-soft);text-align:center;';
  const back = document.getElementById('back');
  back.parentNode.insertBefore(extra, back); back.parentNode.insertBefore(wetHint, back);

  const esc = document.getElementById('esc'); if (esc) esc.textContent = 'esc: back to the room, painting stays on the easel';
  sync();

  const toCanvas = (e) => {
    const r = paper.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * painter.canvas.width, ((e.clientY - r.top) / r.height) * painter.canvas.height, r.width / painter.canvas.width];
  };
  let cursorScale = 0.5;
  const updateCursor = () => {
    const d = Math.max(6, painter.size * cursorScale);
    cursor.style.width = cursor.style.height = d + 'px';
    cursor.style.margin = `${-d / 2}px 0 0 ${-d / 2}px`;
  };
  const moveCursor = (e) => { cursor.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; };

  let penSeen = 0, active = null;
  paper.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'pen') penSeen = performance.now();
    else if (e.pointerType === 'touch' && performance.now() - penSeen < 8000) return; // palm rejection once the Pencil is in use
    if (active !== null) return;
    active = e.pointerId; paper.setPointerCapture(e.pointerId);
    const [x, y, s] = toCanvas(e); cursorScale = s; updateCursor();
    painter.down(x, y, e.pressure || 0.5, e.pointerType === 'pen');
    moveCursor(e);
  });
  paper.addEventListener('pointermove', (e) => {
    const [, , s] = toCanvas(e); if (s !== cursorScale) { cursorScale = s; updateCursor(); }
    moveCursor(e);
    cursor.style.opacity = 1;
    if (e.pointerId !== active) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs.length ? evs : [e]) { const [x, y] = toCanvas(ev); painter.move(x, y, ev.pressure || 0.5); }
  });
  const end = (e) => { if (e.pointerId !== active) return; active = null; painter.up(); };
  paper.addEventListener('pointerup', end);
  paper.addEventListener('pointercancel', end);
  paper.addEventListener('pointerleave', () => { cursor.style.opacity = 0; });
  paper.addEventListener('pointerenter', () => { cursor.style.opacity = 1; updateCursor(); });
}
