// Gouache-style stamp brush on a transparent "paint" layer. Paper tooth is a separate
// multiply layer so the same look can be composited into a texture for the 3D room.

export const PAPER = '#f6efdd';
export const PALETTE = [
  { name: 'white', hex: '#f7f2e4' },
  { name: 'cobalt', hex: '#3d5aa8' },
  { name: 'sap green', hex: '#5b8a4a' },
  { name: 'ochre', hex: '#d9a441' },
  { name: 'vermilion', hex: '#d4552f' },
  { name: 'umber', hex: '#3a2a24' },
];

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function makeGrain(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 226 + Math.random() * 29;
    img.data[i] = img.data[i + 1] = v; img.data[i + 2] = v - 3; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // low-frequency clumps so the tooth isn't pure static
  g.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 1400; i++) {
    const r = rand(1.5, 5);
    g.fillStyle = `rgba(214,206,190,${rand(0.05, 0.16)})`;
    g.beginPath(); g.arc(Math.random() * w, Math.random() * h, r, 0, 6.283); g.fill();
  }
  return c;
}

function makeBristleMask(count, coverage) {
  const S = 96, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  // soft core keeps the stroke from having holes, bristles add streak texture
  const core = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  core.addColorStop(0, `rgba(0,0,0,${coverage})`);
  core.addColorStop(0.75, `rgba(0,0,0,${coverage * 0.8})`);
  core.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = core;
  g.beginPath(); g.ellipse(S / 2, S / 2, S * 0.48, S * 0.42, 0, 0, 6.283); g.fill();
  for (let i = 0; i < count; i++) {
    const a = rand(0, 6.283), rr = Math.sqrt(Math.random()) * S * 0.42;
    g.fillStyle = `rgba(0,0,0,${rand(0.55, 1)})`;
    g.beginPath(); g.ellipse(S / 2 + Math.cos(a) * rr, S / 2 + Math.sin(a) * rr * 0.95, rand(2, 4.2), rand(3, 6), 0, 0, 6.283); g.fill();
  }
  return c;
}

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

export class Painter {
  constructor(canvas, grainCanvas, w = 1300, h = 950) {
    this.canvas = canvas;
    canvas.width = w; canvas.height = h;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });
    this.grain = grainCanvas;
    grainCanvas.width = w; grainCanvas.height = h;
    grainCanvas.getContext('2d').drawImage(makeGrain(w, h), 0, 0);

    this.masks = { dense: makeBristleMask(38, 0.42), sparse: makeBristleMask(14, 0.12) };
    this.tint = document.createElement('canvas'); this.tint.width = this.tint.height = 96;
    this.tintKey = '';

    this.tool = 'brush';
    this.size = 26;
    this.baseColor = hexToRgb(PALETTE[1].hex);
    this.color = [...this.baseColor];
    this.dirty = false;
    this.drawing = false;
  }

  setColor(hex) { this.baseColor = hexToRgb(hex); this.color = [...this.baseColor]; this.tool = 'brush'; }

  clear() { this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); this.dirty = false; }

  _retint(mask) {
    const key = mask === this.masks.dense ? 'd' : 's';
    const k = key + this.color.map((v) => Math.round(v / 4)).join(',');
    if (k === this.tintKey) return;
    this.tintKey = k;
    const g = this.tint.getContext('2d');
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, 96, 96);
    g.drawImage(mask, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = `rgb(${this.color.map(Math.round).join(',')})`;
    g.fillRect(0, 0, 96, 96);
  }

  _stamp(x, y, angle, size, alpha) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    if (this.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = 1;
      ctx.drawImage(this.masks.dense, -size * 0.5, -size * 0.5, size, size);
    } else {
      ctx.globalAlpha = alpha;
      // flat-ish brush: narrower along the stroke, full width across it
      ctx.drawImage(this.tint, -size * 0.36, -size * 0.5, size * 0.72, size);
    }
    ctx.restore();
  }

  _pickup(x, y) {
    // wet-in-wet: brush slowly takes on whatever paint is already under it
    const d = this.ctx.getImageData(clamp(x | 0, 0, this.canvas.width - 1), clamp(y | 0, 0, this.canvas.height - 1), 1, 1).data;
    if (d[3] < 60) return;
    const k = 0.05 * (d[3] / 255);
    for (let i = 0; i < 3; i++) this.color[i] += (d[i] - this.color[i]) * k;
  }

  down(x, y, pressure = 0.5, isPen = false) {
    this.drawing = true; this.dirty = true;
    this.lx = x; this.ly = y; this.angle = 0; this.hasAngle = false;
    this.load = 1; this.speed = 0; this.lastT = performance.now(); this.lastSize = this.size;
    this.color = [...this.baseColor];
    this.isPen = isPen; this.pressure = pressure;
    this.n = 0;
    this._draw(x, y, x, y, 0);
  }

  move(x, y, pressure = 0.5) {
    if (!this.drawing) return;
    const now = performance.now();
    const dt = Math.max(1, now - this.lastT);
    const dist = Math.hypot(x - this.lx, y - this.ly);
    if (dist < 0.5) return;
    this.speed += (dist / dt - this.speed) * 0.35; // canvas px per ms, smoothed
    this.lastT = now; this.pressure = pressure;
    this._draw(this.lx, this.ly, x, y, dist);
    this.lx = x; this.ly = y;
  }

  up() { this.drawing = false; }

  _draw(x0, y0, x1, y1, dist) {
    const fast = clamp(this.speed / 2.2, 0, 1);
    const pen = this.isPen ? 0.35 + 1.1 * this.pressure : 1;
    const target = this.size * pen * (1 - 0.38 * fast) * (this.tool === 'eraser' ? 1.4 : 1);
    if (dist > 0.5) {
      const a = Math.atan2(y1 - y0, x1 - x0);
      if (!this.hasAngle) { this.angle = a; this.hasAngle = true; }
      else { let d = a - this.angle; d = Math.atan2(Math.sin(d), Math.cos(d)); this.angle += d * 0.35; }
    }
    const step = Math.max(1.4, target * 0.13);
    const count = Math.max(1, Math.ceil(dist / step));
    const startSize = this.lastSize;
    for (let i = 1; i <= count; i++) {
      const t = dist === 0 ? 1 : i / count;
      const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      const size = startSize + (target - startSize) * t;
      this.load = Math.max(0.3, this.load - (dist / count) * 0.0005);
      const alpha = (0.93 - 0.24 * fast) * (0.5 + 0.5 * this.load);
      if (this.tool === 'brush') {
        this._retint(this.load < 0.5 ? this.masks.sparse : this.masks.dense);
        if (++this.n % 4 === 0) this._pickup(x, y);
      }
      // a touch of jitter across the stroke breaks up perfect streak lines
      const j = (Math.random() - 0.5) * size * 0.05;
      this._stamp(x + Math.cos(this.angle + 1.57) * j, y + Math.sin(this.angle + 1.57) * j, this.angle, size, alpha);
    }
    this.lastSize = target;
  }

  // paper + paint + tooth, as a plain canvas (used for the easel and wall frames)
  composite() {
    const c = document.createElement('canvas');
    c.width = this.canvas.width; c.height = this.canvas.height;
    const g = c.getContext('2d');
    g.fillStyle = PAPER; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(this.canvas, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = 0.9;
    g.drawImage(this.grain, 0, 0);
    return c;
  }
}

// Wires the taped-note toolbar to a Painter and the pointer events on the paper element.
export function initPaintUI(painter, { onBack }) {
  const paper = document.getElementById('paper');
  const cursor = document.getElementById('cursor');
  const swatches = document.getElementById('swatches');
  const brushBtn = document.getElementById('brush');
  const eraserBtn = document.getElementById('eraser');
  const size = document.getElementById('size');

  const syncTool = () => {
    brushBtn.classList.toggle('sel', painter.tool === 'brush');
    eraserBtn.classList.toggle('sel', painter.tool === 'eraser');
    swatches.querySelectorAll('.sw').forEach((b, i) => b.classList.toggle('sel', painter.tool === 'brush' && b.dataset.hex === painter.currentHex));
  };
  painter.currentHex = PALETTE[1].hex;

  PALETTE.forEach((p) => {
    const b = document.createElement('button');
    b.className = 'sw'; b.title = p.name; b.dataset.hex = p.hex; b.style.background = p.hex;
    b.onclick = () => { painter.currentHex = p.hex; painter.setColor(p.hex); syncTool(); };
    swatches.appendChild(b);
  });
  brushBtn.onclick = () => { painter.tool = 'brush'; syncTool(); };
  eraserBtn.onclick = () => { painter.tool = 'eraser'; syncTool(); };
  size.oninput = () => { painter.size = +size.value; updateCursor(); };
  document.getElementById('clear').onclick = () => painter.clear();
  document.getElementById('back').onclick = onBack;
  syncTool();

  const toCanvas = (e) => {
    const r = paper.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * painter.canvas.width, ((e.clientY - r.top) / r.height) * painter.canvas.height, r.width / painter.canvas.width];
  };
  let cursorScale = 0.5;
  const updateCursor = () => {
    const d = Math.max(6, painter.size * (painter.tool === 'eraser' ? 1.4 : 1) * cursorScale);
    cursor.style.width = cursor.style.height = d + 'px';
    cursor.style.margin = `${-d / 2}px 0 0 ${-d / 2}px`;
  };
  const moveCursor = (e) => { cursor.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; };

  paper.addEventListener('pointerdown', (e) => {
    paper.setPointerCapture(e.pointerId);
    const [x, y, s] = toCanvas(e); cursorScale = s; updateCursor();
    painter.down(x, y, e.pressure || 0.5, e.pointerType === 'pen');
    moveCursor(e);
  });
  paper.addEventListener('pointermove', (e) => {
    const [, , s] = toCanvas(e); if (s !== cursorScale) { cursorScale = s; updateCursor(); }
    moveCursor(e);
    cursor.style.opacity = 1;
    if (!painter.drawing) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs.length ? evs : [e]) { const [x, y] = toCanvas(ev); painter.move(x, y, ev.pressure || 0.5); }
  });
  const end = () => painter.up();
  paper.addEventListener('pointerup', end);
  paper.addEventListener('pointercancel', end);
  paper.addEventListener('pointerleave', () => { cursor.style.opacity = 0; });
  paper.addEventListener('pointerenter', () => { cursor.style.opacity = 1; updateCursor(); });
  document.getElementById('brush').addEventListener('click', updateCursor);
  document.getElementById('eraser').addEventListener('click', updateCursor);
}
