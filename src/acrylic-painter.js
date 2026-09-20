// The room's painter, backed by the acrylic engine. It has the same surface as the old gouache Painter in paint.js
// (down / move / up / clear / composite, .canvas, .dirty), so main.js only swaps the class.
import { PaintEngine, DEFAULTS, hexToLinear, linearToSrgb } from './brush/engine.js';
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
  undo() { if (this.engine.restore()) this._blit(false); }
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

  const ui = { choose: null, setShape: null, onSelect: null, onShape: null };   // what the 3D props in the room use to drive the card
  let chipEl = null, brushName = null;   // the brush-colour chip and its label
  let choose = (p) => { painter.setPaint(p); sync(); };   // replaced below once the tray tools exist
  const cssColour = (rgb) => '#' + rgb.map((v) => Math.round(Math.min(1, linearToSrgb(Math.max(0, v))) * 255).toString(16).padStart(2, '0')).join('');
  const sync = () => {
    swatches.querySelectorAll('.sw').forEach((b) => b.classList.toggle('sel', b.dataset.id === painter.paint.id));
    if (chipEl) chipEl.style.background = cssColour(painter.color);
    if (brushName) brushName.textContent = painter.paint.id === 'mixed' ? 'your own mix' : painter.paint.name;
    if (ui.onSelect) ui.onSelect(painter.paint);
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
  const syncShape = () => { for (const k in shapeBtns) shapeBtns[k].classList.toggle('sel', painter.engine.params.shape === k); if (ui.onShape) ui.onShape(painter.engine.params.shape); };
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
  const settingsBtn = mk('settings', () => { const on = panel.style.display === 'none'; panel.style.display = on ? 'block' : 'none'; settingsBtn.classList.toggle('sel', on); if (on) panel.refresh(); });
  const wetHint = document.createElement('p');
  wetHint.textContent = 'blue = still workable · orange = getting tacky · no tint = dry';
  wetHint.style.cssText = 'display:none;margin:0 0 12px;font-size:var(--text-xs);color:var(--ink-soft);text-align:center;';
  const back = document.getElementById('back');
  back.parentNode.insertBefore(wetHint, back);

  // ── the brush colour, and the tray's two tools ─────────────────────────────────────────────────────────────────────
  // With the canvas flat on the desk you pick paints by clicking the 3D tubes, so the swatch circles are only shown for the
  // standing-easel view. In their place: what the brush is loaded with, and which tool the tray under the canvas uses.
  const brushRow = document.createElement('div');
  brushRow.style.cssText = 'display:flex;align-items:center;gap:10px;margin:0 0 12px;';
  chipEl = document.createElement('span');
  chipEl.style.cssText = 'flex:none;width:28px;height:28px;border-radius:50%;box-shadow:0 0 0 2px var(--ink);';
  brushName = document.createElement('div');
  brushName.style.cssText = 'font-size:var(--text-sm);line-height:1.25;color:var(--ink);';
  brushRow.append(chipEl, brushName);
  swatches.before(brushRow);

  let trayMode = 'squeeze', squeezePaint = painter.paint;
  const trayBox = document.createElement('div');
  trayBox.style.cssText = 'margin:0 0 12px;';
  const trayLabel = document.createElement('div');
  trayLabel.textContent = 'palette tray'; trayLabel.style.cssText = 'font-size:var(--text-xs);letter-spacing:var(--tracking-caps);text-transform:uppercase;color:var(--ink-soft);margin:0 0 6px;';
  const trayRow = document.createElement('div');
  trayRow.className = 'card-tools'; trayRow.style.cssText = 'margin:0 0 6px;';
  const trayBtns = {};
  const trayHint = document.createElement('p');
  trayHint.style.cssText = 'margin:0;font-size:var(--text-xs);line-height:1.4;color:var(--ink-soft);';
  const syncTray = () => {
    for (const k in trayBtns) trayBtns[k].classList.toggle('sel', k === trayMode);
    trayHint.textContent = trayMode === 'squeeze'
      ? `tap or drag on the tray to squeeze out ${squeezePaint ? squeezePaint.name : 'paint'}. Click another tube to switch.`
      : 'drag on the tray to mix with a knife. Tap a colour to load your brush with it.';
  };
  for (const [k, label] of [['squeeze', 'squeeze'], ['mix', 'mix & pick']]) {
    const b = document.createElement('button');
    b.className = 'btn'; b.textContent = label; b.onclick = () => { trayMode = k; syncTray(); };
    trayBtns[k] = b; trayRow.appendChild(b);
  }
  const wipeBtn = document.createElement('button');
  wipeBtn.className = 'btn'; wipeBtn.textContent = 'wipe'; wipeBtn.title = 'scrape the tray clean';
  wipeBtn.onclick = () => ui.wipeTray && ui.wipeTray();
  trayRow.appendChild(wipeBtn);
  trayBox.append(trayLabel, trayRow, trayHint);
  brushRow.after(trayBox);
  syncTray();

  // the swatches only in the easel view, the tray tools only in the desk view
  ui.setDesk = (down) => { swatches.style.display = down ? 'none' : ''; trayBox.style.display = down ? '' : 'none'; };
  ui.setDesk(view ? view.down : false);
  ui.trayMode = () => trayMode;
  ui.squeezePaint = () => squeezePaint;
  ui.loadMixed = (rgb, paint) => { painter.setMixedColour(rgb, paint); sync(); };
  // picking a tube also makes it the paint the tray squeezes, and switches the tray to squeeze
  choose = (p) => { painter.setPaint(p); squeezePaint = p; trayMode = 'squeeze'; syncTray(); sync(); };
  ui.choose = choose;
  ui.setShape = (k) => { painter.engine.params.shape = k; saveParams(painter.engine.params); syncShape(); };

  // ── drag the card by its heading (double-click the heading to put it back) ────────────────────────────────────────────
  const card = document.getElementById('card'), handle = card.querySelector('h2'), POS_KEY = 'paint-a-pint:card-pos';
  handle.title = 'drag to move; double-click to put it back';
  handle.style.cssText += ';cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;';
  const place = (x, y) => {   // keep the card on screen
    const r = card.getBoundingClientRect();
    x = Math.min(Math.max(0, x), Math.max(0, innerWidth - r.width)); y = Math.min(Math.max(0, y), Math.max(0, innerHeight - r.height));
    Object.assign(card.style, { left: x + 'px', top: y + 'px', right: 'auto', bottom: 'auto', transform: 'none' });
    return [x, y];
  };
  const home = () => { for (const k of ['left', 'top', 'right', 'bottom', 'transform']) card.style[k] = ''; try { localStorage.removeItem(POS_KEY); } catch {} };
  let cardDrag = null;
  handle.addEventListener('pointerdown', (e) => {
    const r = card.getBoundingClientRect();
    cardDrag = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top };
    handle.setPointerCapture(e.pointerId); handle.style.cursor = 'grabbing';
    place(r.left, r.top);
  });
  handle.addEventListener('pointermove', (e) => { if (cardDrag && e.pointerId === cardDrag.id) place(e.clientX - cardDrag.dx, e.clientY - cardDrag.dy); });
  const cardDrop = (e) => {
    if (!cardDrag || e.pointerId !== cardDrag.id) return;
    cardDrag = null; handle.style.cursor = 'grab';
    const r = card.getBoundingClientRect();
    try { localStorage.setItem(POS_KEY, JSON.stringify({ x: r.left / innerWidth, y: r.top / innerHeight })); } catch {}
  };
  handle.addEventListener('pointerup', cardDrop);
  handle.addEventListener('pointercancel', cardDrop);
  handle.addEventListener('dblclick', home);
  try { const saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null'); if (saved) place(saved.x * innerWidth, saved.y * innerHeight); } catch {}
  addEventListener('resize', () => { if (card.style.left) { const r = card.getBoundingClientRect(); place(r.left, r.top); } });

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
  return ui;
}
