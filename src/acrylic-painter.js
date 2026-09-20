// The room's painter, backed by the acrylic engine. It has the same surface as the old gouache Painter in paint.js
// (down / move / up / clear / composite, .canvas, .dirty), so main.js only swaps the class.
import { PaintEngine, DEFAULTS, hexToLinear, linearToSrgb } from './brush/engine.js';
import { Tray, TRAY_W, TRAY_H } from './brush/tray.js';
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
  setMixedColour(rgb, paint) { this.paint = paint; this.color = rgb; this.tool = 'brush'; }   // a colour mixed on the palette, standing in for a tube
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
export function initAcrylicUI(painter, { onBack, view, isPainting = () => true }) {
  const paper = document.getElementById('paper');
  const cursor = document.getElementById('cursor');
  const swatches = document.getElementById('swatches');
  const size = document.getElementById('size');

  let chipEl = null;   // the palette's "brush colour" chip
  const cssColour = (rgb) => '#' + rgb.map((v) => Math.round(Math.min(1, linearToSrgb(Math.max(0, v))) * 255).toString(16).padStart(2, '0')).join('');
  const sync = () => {
    swatches.querySelectorAll('.sw').forEach((b) => b.classList.toggle('sel', b.dataset.id === painter.paint.id));
    if (chipEl) chipEl.style.background = cssColour(painter.color);
  };
  BOX.forEach((p, i) => {
    const b = document.createElement('button');
    const name = `${i + 1} · ${p.brand} · ${p.name}${p.code ? ' · ' + p.code : ''}`;   // the number is the key that picks it
    b.className = 'sw'; b.title = name; b.setAttribute('aria-label', name); b.dataset.id = p.id; b.style.background = p.hex;
    b.onclick = () => choose(p);
    swatches.appendChild(b);
  });
  size.min = 10; size.max = 140; size.value = painter.size;
  size.oninput = () => { painter.size = +size.value; updateCursor(); };
  document.getElementById('undo').onclick = () => painter.undo();
  document.getElementById('dry').onclick = () => painter.dryNow();
  document.getElementById('clear').onclick = () => painter.clear();
  document.getElementById('back').onclick = onBack;

  // The card, top to bottom: paints, size, brush shape, lay flat / stand up, a secondary toolbar, hang it up. The classes
  // (card-tools, ruled, block) and the layout are the design session's (docs/design/DESIGN.md, "Paint card layout").

  // brush shape: flat, filbert (oval), round (also gives single dabs) or knife (flat planes, raised edges)
  const shapes = document.createElement('div');
  shapes.className = 'card-tools four';
  const shapeBtns = {};
  const syncShape = () => { for (const k in shapeBtns) shapeBtns[k].classList.toggle('sel', painter.engine.params.shape === k); };
  for (const k of ['flat', 'filbert', 'round', 'knife']) {
    const b = document.createElement('button');
    b.className = 'btn'; b.textContent = k;
    b.title = { flat: 'flat brush: a row of bristles', filbert: 'filbert: an oval tip, width follows pressure', round: 'round brush: click for a dab', knife: 'palette knife: drags paint into flat planes with a raised edge' }[k];
    b.onclick = () => { painter.engine.params.shape = k; saveParams(painter.engine.params); syncShape(); };
    shapeBtns[k] = b; shapes.appendChild(b);
  }
  syncShape();
  size.parentNode.after(shapes);

  // easel or desk: put the canvas down flat for a bird's-eye view, and stand it back up
  let viewBtn = null;
  if (view) {
    viewBtn = document.createElement('button');
    viewBtn.className = 'btn block';
    const syncView = () => { viewBtn.textContent = view.down ? 'stand it up' : 'lay it flat'; };
    viewBtn.onclick = () => view.set(!view.down);
    view.onChange = syncView; syncView();
    shapes.after(viewBtn);
  }

  // secondary toolbar: undo, clear and dry now already exist in index.html, so they are moved here, not recreated
  const toolbar = document.createElement('div');
  toolbar.className = 'card-tools ruled';
  (viewBtn || shapes).after(toolbar);
  const mk = (label, onclick) => { const b = document.createElement('button'); b.className = 'btn'; b.textContent = label; b.onclick = onclick; toolbar.appendChild(b); return b; };
  toolbar.append(document.getElementById('undo'), document.getElementById('clear'), document.getElementById('dry'));
  const panel = buildTunePanel(painter.engine.params, DEFAULTS, { onChange: () => { size.value = painter.size; updateCursor(); } });
  document.getElementById('paint').appendChild(panel);
  let wet = false;
  const wetBtn = mk('wetness', () => { wet = !wet; painter.setWetnessView(wet); wetBtn.classList.toggle('sel', wet); wetHint.style.display = wet ? 'block' : 'none'; });
  mk('save png', () => painter.savePng());
  const settingsBtn = mk('settings', () => { const on = panel.style.display === 'none'; panel.style.display = on ? 'block' : 'none'; settingsBtn.classList.toggle('sel', on); if (on) { panel.refresh(); setPalette(false); } });
  const wetHint = document.createElement('p');
  wetHint.textContent = 'blue = still workable · orange = getting tacky · no tint = dry';
  wetHint.style.cssText = 'display:none;margin:0 0 12px;font-size:var(--text-xs);color:var(--ink-soft);text-align:center;';
  const back = document.getElementById('back');
  back.parentNode.insertBefore(wetHint, back);

  // ── mixing palette: a tray to squeeze paints onto and mix on. Tap a colour to load your brush with it. ──────────────
  // (the tray is a second engine, see src/brush/tray.js; it is created the first time the palette opens)
  let tray = null, trayCtx = null, trayImg = null, paletteOpen = false, trayFrame = 0;
  const trayCanvas = document.createElement('canvas');
  trayCanvas.width = TRAY_W; trayCanvas.height = TRAY_H;
  trayCanvas.style.cssText = 'display:block;width:100%;height:auto;border-radius:var(--radius-card);touch-action:none;cursor:crosshair;box-shadow:inset 0 0 0 1.5px var(--line);';
  const palettePanel = document.createElement('div');
  palettePanel.className = 'note';
  palettePanel.style.cssText = 'display:none;position:absolute;left:16px;bottom:16px;width:288px;padding:20px 12px 12px;';
  const paletteHead = document.createElement('h2');
  paletteHead.textContent = 'PALETTE'; paletteHead.style.cssText = 'margin:0 0 8px 4px;color:var(--ultramarine);font-size:var(--text-lg);letter-spacing:.08em;';
  const paletteRow = document.createElement('div');
  paletteRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:8px;';
  chipEl = document.createElement('span');
  chipEl.style.cssText = 'flex:none;width:24px;height:24px;border-radius:50%;box-shadow:0 0 0 2px var(--ink);';
  const chipLabel = document.createElement('span');
  chipLabel.textContent = 'your brush colour'; chipLabel.style.cssText = 'flex:1;font-size:var(--text-xs);color:var(--ink-soft);';
  const wipeBtn = document.createElement('button');
  wipeBtn.className = 'btn'; wipeBtn.textContent = 'wipe tray'; wipeBtn.style.cssText = 'width:auto;margin:0;padding:6px 10px;font-size:var(--text-xs);';
  paletteRow.append(chipEl, chipLabel, wipeBtn);
  const paletteHint = document.createElement('p');
  paletteHint.textContent = 'click a paint to squeeze it out · drag to mix · tap a colour to load your brush';
  paletteHint.style.cssText = 'margin:8px 4px 0;font-size:var(--text-xs);color:var(--ink-soft);line-height:1.4;';
  palettePanel.append(paletteHead, trayCanvas, paletteRow, paletteHint);
  document.getElementById('paint').appendChild(palettePanel);

  const blitTray = (all) => { const r = all ? tray.engine.renderAll() : tray.tick(performance.now() / 1000); if (r) trayCtx.putImageData(trayImg, 0, 0, r.x, r.y, r.w, r.h); };
  const ensureTray = () => {
    if (tray) return;
    tray = new Tray(); trayCtx = trayCanvas.getContext('2d'); trayImg = new ImageData(tray.engine.rgba, TRAY_W, TRAY_H);
    blitTray(true);
  };
  const trayLoop = () => { if (!paletteOpen) return; blitTray(false); trayFrame = requestAnimationFrame(trayLoop); };   // keeps drying and redrawing while it is open
  function setPalette(on) {
    paletteOpen = on;
    palettePanel.style.display = on ? 'block' : 'none';
    paletteBtn.classList.toggle('sel', on);
    if (on) { ensureTray(); panel.style.display = 'none'; settingsBtn.classList.remove('sel'); cancelAnimationFrame(trayFrame); trayLoop(); }
    else cancelAnimationFrame(trayFrame);
  }
  // choosing a paint: it becomes the brush colour, and with the palette open it is also squeezed onto the tray
  function choose(p) {
    painter.setPaint(p); sync();
    if (paletteOpen) tray.squeeze(p);   // (the open palette redraws itself every frame)
  }
  const paletteBtn = document.createElement('button');
  paletteBtn.className = 'btn block'; paletteBtn.textContent = 'mixing palette';
  paletteBtn.title = 'mix your own colours on a tray (key: p)';
  paletteBtn.onclick = () => setPalette(!paletteOpen);
  (viewBtn || shapes).after(paletteBtn);
  wipeBtn.onclick = () => tray.clear();

  const toTray = (e) => { const r = trayCanvas.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * TRAY_W, ((e.clientY - r.top) / r.height) * TRAY_H]; };
  let trayDrag = null;
  trayCanvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' && performance.now() - penSeen < 8000) return;   // palm rejection, as on the canvas
    if (trayDrag || !tray) return;
    trayCanvas.setPointerCapture(e.pointerId);
    const [x, y] = toTray(e);
    trayDrag = { id: e.pointerId, x0: x, y0: y, far: 0 };
    tray.beginMix(x, y, e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.8);
  });
  trayCanvas.addEventListener('pointermove', (e) => {
    if (!trayDrag || e.pointerId !== trayDrag.id) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs.length ? evs : [e]) {
      const [x, y] = toTray(ev);
      trayDrag.far = Math.max(trayDrag.far, Math.hypot(x - trayDrag.x0, y - trayDrag.y0));
      tray.mixTo(x, y, ev.pointerType === 'pen' && ev.pressure > 0 ? ev.pressure : 0.8);
    }
  });
  const trayEnd = (e) => {
    if (!trayDrag || e.pointerId !== trayDrag.id) return;
    tray.endMix();
    if (trayDrag.far < 6) {   // a tap, not a drag: load the brush with the colour under the finger
      const c = tray.sample(trayDrag.x0, trayDrag.y0);
      if (c) { painter.setMixedColour(c, tray.paint); sync(); }
    }
    trayDrag = null;
  };
  trayCanvas.addEventListener('pointerup', trayEnd);
  trayCanvas.addEventListener('pointercancel', trayEnd);

  const esc = document.getElementById('esc'); if (esc) esc.textContent = 'esc: back to the room, painting stays on the easel';
  sync();

  // keyboard: 1-9 pick a paint (card order), [ ] brush size, z undo, w wetness. Only while painting, and never while typing.
  addEventListener('keydown', (e) => {
    if (!isPainting() || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && t.type !== 'range' && t.type !== 'checkbox'))) return;
    const k = e.key;
    if (k >= '1' && k <= '9') {
      const p = BOX[+k - 1]; if (p) choose(p);
    } else if (k === '[' || k === ']') {
      painter.size = Math.round(Math.min(+size.max, Math.max(+size.min, painter.size * (k === ']' ? 1.15 : 1 / 1.15))));
      size.value = painter.size; updateCursor(); if (panel.style.display !== 'none') panel.refresh();
    } else if (!e.repeat && (k === 'z' || k === 'Z')) painter.undo();
    else if (!e.repeat && (k === 'w' || k === 'W')) wetBtn.click();
    else if (!e.repeat && (k === 'p' || k === 'P')) setPalette(!paletteOpen);
    else return;
    e.preventDefault();
  });

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
