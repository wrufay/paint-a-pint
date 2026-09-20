// Impressionistic acrylic brush engine. Pure JS, no DOM, so it runs in the browser and in Node.
//
// Model (iteration 1):
//   • Canvas = colour (linear RGB) + paint height + wetness + a fixed linen-weave height.
//   • A brush is a row of individual bristles. Each bristle carries its own paint (colour + load),
//     lays it down along its own path, and runs dry on its own -> streaks, broken edges, dry-brush.
//   • Dry brush: as a bristle empties, the weave peaks catch paint and the valleys are skipped.
//   • Wet-on-wet: fresh paint stays wet for a while; a bristle dragged through wet paint picks it up.
//   • Colour mixes subtractively (geometric mean in linear RGB), so blue + yellow leans green.
//   • Everything is lit from paint height (normal map + a touch of gloss), so thick paint reads as thick.

export const DEFAULTS = {
  size: 46,            // brush width in canvas px
  bristles: 34,        // bristles across the brush
  load: 1.0,           // paint on each bristle at the start of a stroke
  consumption: 0.00035, // load used per pixel touched (higher = runs dry sooner)
  opacity: 0.94,       // how opaque a full bristle lays paint (acrylic ~ opaque)
  dry: 0.75,           // dry-brush strength: how much the weave blocks an emptying bristle
  pickup: 0.14,        // how much wet paint under a bristle mixes into its colour
  wetSeconds: 90,      // acrylic stays workable for a short while
  heightGain: 0.055,   // paint thickness laid per sample
  relief: 5.0,         // how strongly thickness shows in the lighting
  weave: 0.10,         // canvas texture strength
  gloss: 0.22,         // acrylic satin sheen
  lightAngle: 135,     // degrees; light comes from this direction (135 = top-left)
  follow: 0.65,        // 0 = brush keeps a fixed angle, 1 = row turns to stay across the stroke
  fixedAngle: -35,     // degrees, brush row angle when it isn't following
  smooth: 0.3,         // stroke smoothing 0..0.9
  hueJitter: 0.05,     // per-stroke colour variation (impressionist broken colour)
  bristleTint: 0.04,   // per-bristle colour variation
};

const TAU = Math.PI * 2;

export const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
export function hexToLinear(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)];
}

// Tube-colour palette in the spirit of an impressionist's limited box (no black).
export const PALETTE = [
  { name: 'titanium white', hex: '#f4f1ea' },
  { name: 'cadmium yellow', hex: '#f2c21b' },
  { name: 'yellow ochre', hex: '#c98f2b' },
  { name: 'cadmium red', hex: '#d93a2b' },
  { name: 'alizarin crimson', hex: '#8f1f38' },
  { name: 'burnt sienna', hex: '#8a4326' },
  { name: 'ultramarine', hex: '#2a3f9e' },
  { name: 'cerulean', hex: '#3d8fc6' },
  { name: 'viridian', hex: '#1f7a62' },
  { name: 'sap green', hex: '#5b8a2b' },
];

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Subtractive-ish mix of linear RGB: geometric mean blended slightly with the linear mean
// so mixes don't collapse to mud. t = weight of b.
const EPS = 0.004;
function mix3(out, a0, a1, a2, b0, b1, b2, t) {
  const g0 = Math.exp(Math.log(a0 + EPS) * (1 - t) + Math.log(b0 + EPS) * t) - EPS;
  const g1 = Math.exp(Math.log(a1 + EPS) * (1 - t) + Math.log(b1 + EPS) * t) - EPS;
  const g2 = Math.exp(Math.log(a2 + EPS) * (1 - t) + Math.log(b2 + EPS) * t) - EPS;
  const L = 0.25; // share of plain linear mixing
  out[0] = g0 * (1 - L) + (a0 * (1 - t) + b0 * t) * L;
  out[1] = g1 * (1 - L) + (a1 * (1 - t) + b1 * t) * L;
  out[2] = g2 * (1 - L) + (a2 * (1 - t) + b2 * t) * L;
}

export class PaintEngine {
  constructor({ width = 1200, height = 900, seed = 7 } = {}) {
    this.W = width; this.H = height;
    this.params = { ...DEFAULTS };
    this.rand = mulberry32(seed);
    const n = width * height;
    this.color = new Float32Array(n * 3);
    this.height = new Float32Array(n);
    this.wetUntil = new Float32Array(n);
    this.ground = new Float32Array(n);
    this.scratchH = new Float32Array(n);
    this.rgba = new Uint8ClampedArray(n * 4);
    this.now = 0;
    this.stroke = null;
    this.dirty = null;
    this._makeGround(seed);
    this.clear();
  }

  setParams(p) { Object.assign(this.params, p); }
  setTime(t) { this.now = t; }

  _makeGround(seed) {
    const { W, H } = this, r = mulberry32(seed * 31 + 5);
    // low-frequency thread irregularity on a 16px grid, bilinearly sampled
    const gw = Math.ceil(W / 16) + 2, gh = Math.ceil(H / 16) + 2;
    const gx = new Float32Array(gw * gh), gy = new Float32Array(gw * gh);
    for (let i = 0; i < gx.length; i++) { gx[i] = r() * TAU; gy[i] = r() * TAU; }
    const smp = (g, x, y) => {
      const fx = x / 16, fy = y / 16, ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy;
      const a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
      return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    };
    const k = TAU / 4.2; // thread period ~4.2 px
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const wx = Math.sin(x * k + smp(gx, x, y) * 0.6);
        const wy = Math.sin(y * k + smp(gy, x, y) * 0.6);
        const weave = 0.5 + 0.25 * (wx + wy) * 0.5 + 0.25 * wx * wy;
        this.ground[y * W + x] = Math.min(1, Math.max(0, weave * 0.7 + r() * 0.3));
      }
    }
  }

  clear() {
    const n = this.W * this.H;
    const g = [srgbToLinear(0.93), srgbToLinear(0.9), srgbToLinear(0.83)]; // warm gesso
    for (let i = 0; i < n; i++) { this.color[i * 3] = g[0]; this.color[i * 3 + 1] = g[1]; this.color[i * 3 + 2] = g[2]; }
    this.height.fill(0); this.wetUntil.fill(0);
    this.dirty = { x0: 0, y0: 0, x1: this.W, y1: this.H };
  }

  // one-level undo (buffers are reused, so no allocation per stroke)
  snapshot() {
    const s = this._snap || (this._snap = { c: new Float32Array(this.color.length), h: new Float32Array(this.height.length), w: new Float32Array(this.wetUntil.length) });
    s.c.set(this.color); s.h.set(this.height); s.w.set(this.wetUntil);
    this._hasSnap = true;
  }
  restore() {
    if (!this._hasSnap) return false;
    const s = this._snap;
    this.color.set(s.c); this.height.set(s.h); this.wetUntil.set(s.w);
    this._hasSnap = false;
    this.dirty = { x0: 0, y0: 0, x1: this.W, y1: this.H };
    return true;
  }

  // ── stroke ────────────────────────────────────────────────────────────────
  beginStroke(x, y, pressure, colorLinear) {
    const P = this.params, r = this.rand;
    // per-stroke colour drift: nudge lightness and one channel a little
    const j = P.hueJitter, l = 1 + (r() - 0.5) * j * 2;
    const base = [
      Math.max(0, colorLinear[0] * l * (1 + (r() - 0.5) * j)),
      Math.max(0, colorLinear[1] * l * (1 + (r() - 0.5) * j)),
      Math.max(0, colorLinear[2] * l * (1 + (r() - 0.5) * j)),
    ];
    const N = Math.max(4, P.bristles | 0), bristles = [];
    const rad = Math.min(3.2, Math.max(0.9, (P.size / N) * 0.95));
    for (let i = 0; i < N; i++) {
      const u = (i + 0.5) / N - 0.5;                                  // -0.5 .. 0.5 across the row
      const edge = Math.pow(Math.abs(u) * 2, 3);                      // outer bristles are shorter
      const t = P.bristleTint, load0 = P.load * (0.7 + r() * 0.6);
      bristles.push({
        ox: (u + (r() - 0.5) * (0.6 / N)) * P.size,
        oy: (r() - 0.5) * P.size * 0.1 + edge * P.size * 0.06,
        rad: rad * (0.85 + r() * 0.3),
        stiff: 0.72 + r() * 0.28,
        ctc: Math.min(1, r() * 0.55 + edge * 0.5),                    // how much pressure it needs to touch
        load0, load: load0,
        c0: base[0] * (1 + (r() - 0.5) * t), c1: base[1] * (1 + (r() - 0.5) * t), c2: base[2] * (1 + (r() - 0.5) * t),
      });
    }
    this.stroke = {
      bristles, px: x, py: y, sx: x, sy: y, moved: 0, pressure,
      axis: [Math.cos(2 * (P.fixedAngle * Math.PI / 180)), Math.sin(2 * (P.fixedAngle * Math.PI / 180))], // doubled-angle state
      started: false,
    };
    this._deposit(x, y, pressure, this.stroke.axis);
  }

  strokeTo(x, y, pressure) {
    const s = this.stroke; if (!s) return;
    const P = this.params, sm = Math.min(0.9, Math.max(0, P.smooth));
    const tx = s.sx + (x - s.sx) * (1 - sm), ty = s.sy + (y - s.sy) * (1 - sm);
    const dx = tx - s.px, dy = ty - s.py, dist = Math.hypot(dx, dy);
    if (dist < 0.5) return;

    // brush-row orientation: blend "across the travel direction" with a fixed hand angle (doubled-angle space
    // because a row has 180° symmetry), then low-pass it so the brush turns like a wrist, not instantly.
    const across = Math.atan2(dy, dx) + Math.PI / 2;
    const fx = Math.cos(2 * (P.fixedAngle * Math.PI / 180)), fy = Math.sin(2 * (P.fixedAngle * Math.PI / 180));
    const vx = P.follow * Math.cos(2 * across) + (1 - P.follow) * fx;
    const vy = P.follow * Math.sin(2 * across) + (1 - P.follow) * fy;
    const k = s.started ? 1 - Math.exp(-dist / 14) : 1;
    s.started = true;
    s.axis[0] += (vx - s.axis[0]) * k; s.axis[1] += (vy - s.axis[1]) * k;

    const steps = Math.max(1, Math.ceil(dist)); // one deposit per pixel of travel
    for (let i = 1; i <= steps; i++) {
      const f = i / steps;
      this._deposit(s.px + dx * f, s.py + dy * f, s.pressure + (pressure - s.pressure) * f, s.axis);
    }
    s.px = tx; s.py = ty; s.sx = x; s.sy = y; s.pressure = pressure; s.moved += dist;
  }

  endStroke() { this.stroke = null; }

  _deposit(cx, cy, pressure, axis) {
    const { W, H, color, height, wetUntil, ground } = this, P = this.params, s = this.stroke;
    const a = Math.atan2(axis[1], axis[0]) / 2, ca = Math.cos(a), sa = Math.sin(a);
    const press = Math.min(1, Math.max(0.05, pressure));
    const spread = 0.55 + 0.6 * press;               // harder press splays the row wider
    const tmp = [0, 0, 0];
    let x0 = W, y0 = H, x1 = 0, y1 = 0;

    for (const b of s.bristles) {
      const contact = Math.min(1, Math.max(0, (press - b.ctc * 0.55) * 1.7)) * b.stiff;
      if (contact <= 0 || b.load <= 0) continue;
      const bx = cx + (ca * b.ox - sa * b.oy) * spread;
      const by = cy + (sa * b.ox + ca * b.oy) * spread;
      const r = b.rad * (0.8 + 0.5 * press), R = Math.ceil(r);
      const loadFrac = b.load / b.load0;
      const dryT = Math.min(1, Math.max(0, P.dry * (1.15 - loadFrac)));   // 0 fresh .. 1 dry
      const ix = Math.round(bx), iy = Math.round(by);

      for (let yy = iy - R; yy <= iy + R; yy++) {
        if (yy < 0 || yy >= H) continue;
        for (let xx = ix - R; xx <= ix + R; xx++) {
          if (xx < 0 || xx >= W) continue;
          const d2 = (xx - bx) * (xx - bx) + (yy - by) * (yy - by);
          if (d2 > r * r) continue;
          const i = yy * W + xx, fall = 1 - d2 / (r * r);
          // dry brush: weave peaks catch paint, valleys are skipped as the bristle empties
          const reach = contact - dryT * (1 - ground[i]) * 1.3 - dryT * 0.15;
          if (reach <= 0) continue;
          const amt = Math.min(1, reach * 1.4) * fall;

          const c = i * 3, wet = Math.min(1, Math.max(0, (wetUntil[i] - this.now) / P.wetSeconds));
          // bristle drags wet paint from the canvas into its own colour
          // (only from pixels that actually hold paint, not bare wet gesso, or the bristle bleaches itself)
          const present = Math.min(1, height[i] * 8);
          if (wet > 0.02 && present > 0.05 && P.pickup > 0) {
            const t = Math.min(0.5, P.pickup * wet * present * amt * (1.4 - loadFrac));
            mix3(tmp, b.c0, b.c1, b.c2, color[c], color[c + 1], color[c + 2], t);
            b.c0 = tmp[0]; b.c1 = tmp[1]; b.c2 = tmp[2];
          }
          // lay paint down: opaque, less so as the bristle runs empty
          const alpha = Math.min(1, amt * P.opacity * (0.6 + 0.4 * Math.min(1, loadFrac * 3)));
          mix3(tmp, color[c], color[c + 1], color[c + 2], b.c0, b.c1, b.c2, alpha);
          color[c] = tmp[0]; color[c + 1] = tmp[1]; color[c + 2] = tmp[2];

          height[i] = Math.min(1.6, height[i] + amt * P.heightGain * (0.35 + 0.65 * Math.min(1, loadFrac)));
          wetUntil[i] = this.now + P.wetSeconds;
          b.load -= P.consumption * amt;

          if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy;
        }
      }
    }
    if (x1 >= x0) this._markDirty(x0, y0, x1 + 1, y1 + 1);
  }

  _markDirty(x0, y0, x1, y1) {
    const d = this.dirty;
    if (!d) this.dirty = { x0, y0, x1, y1 };
    else { d.x0 = Math.min(d.x0, x0); d.y0 = Math.min(d.y0, y0); d.x1 = Math.max(d.x1, x1); d.y1 = Math.max(d.y1, y1); }
  }

  // ── lighting ──────────────────────────────────────────────────────────────
  // Re-shades only the dirty region. Returns {x,y,w,h} to blit, or null.
  render() {
    if (!this.dirty) return null;
    const { W, H, color, height, ground, scratchH, rgba } = this, P = this.params;
    const x0 = Math.max(0, this.dirty.x0 - 2), y0 = Math.max(0, this.dirty.y0 - 2);
    const x1 = Math.min(W, this.dirty.x1 + 2), y1 = Math.min(H, this.dirty.y1 + 2);
    this.dirty = null;

    // combined surface height: thin paint keeps the weave, thick paint buries it
    for (let y = Math.max(0, y0 - 1); y < Math.min(H, y1 + 1); y++) {
      for (let x = Math.max(0, x0 - 1); x < Math.min(W, x1 + 1); x++) {
        const i = y * W + x, p = height[i];
        scratchH[i] = p + ground[i] * P.weave * Math.max(0, 1 - p * 4);
      }
    }
    const la = P.lightAngle * Math.PI / 180;
    let lx = Math.cos(la), ly = -Math.sin(la), lz = 0.62;
    const ln = Math.hypot(lx, ly, lz); lx /= ln; ly /= ln; lz /= ln;
    let hx = lx, hy = ly, hz = lz + 1; const hn = Math.hypot(hx, hy, hz); hx /= hn; hy /= hn; hz /= hn;
    const ambient = 0.5, flat = ambient + (1 - ambient) * lz;

    for (let y = y0; y < y1; y++) {
      const ym = Math.max(0, y - 1), yp = Math.min(H - 1, y + 1);
      for (let x = x0; x < x1; x++) {
        const xm = Math.max(0, x - 1), xp = Math.min(W - 1, x + 1), i = y * W + x;
        const gx = (scratchH[y * W + xp] - scratchH[y * W + xm]) * 0.5 * P.relief * 4;
        const gy = (scratchH[yp * W + x] - scratchH[ym * W + x]) * 0.5 * P.relief * 4;
        let nx = -gx, ny = -gy, nz = 1; const nn = Math.hypot(nx, ny, nz); nx /= nn; ny /= nn; nz /= nn;
        const diff = Math.max(0, nx * lx + ny * ly + nz * lz);
        const lit = (ambient + (1 - ambient) * diff) / flat;
        const spec = Math.pow(Math.max(0, nx * hx + ny * hy + nz * hz), 36) * P.gloss * (0.25 + Math.min(1, height[i] * 3));
        const o = i * 4, c = i * 3;
        rgba[o] = linearToSrgb(Math.min(1, color[c] * lit + spec)) * 255;
        rgba[o + 1] = linearToSrgb(Math.min(1, color[c + 1] * lit + spec)) * 255;
        rgba[o + 2] = linearToSrgb(Math.min(1, color[c + 2] * lit + spec)) * 255;
        rgba[o + 3] = 255;
      }
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  renderAll() {
    this.dirty = { x0: 0, y0: 0, x1: this.W, y1: this.H };
    return this.render();
  }
}
