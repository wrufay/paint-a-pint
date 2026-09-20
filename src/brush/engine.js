// Impressionistic acrylic brush engine. Pure JS, no DOM, so it runs in the browser and in Node.
//
// Model (iteration 2):
//   • Canvas = colour (linear RGB) + a wet paint layer (solids + water) on a dried film + a fixed linen-weave height.
//   • A brush is a row of individual bristles. Each bristle carries its own paint (colour + load),
//     lays it down along its own path, and runs dry on its own -> streaks, broken edges, dry-brush.
//   • Dry brush: as a bristle empties, the weave peaks catch paint and the valleys are skipped.
//   • Drying: the water in the wet layer evaporates on a clock (thick paint far slower than thin, a skin slowing
//     the last of it). As it goes the paint stiffens: open (blends, gets picked up) -> tacky (drags, breaks up under
//     a brush) -> locked, when the wet layer freezes into film. Later paint covers film instead of mixing with it.
//   • Wet-on-wet: a bristle dragged through open paint picks it up and mixes, and shoves some of it
//     aside, leaving a groove where it went and a ridge beside it (locked paint doesn't move).
//   • Colour mixes as pigment (Kubelka-Munk over a 38-band spectrum), so blue + yellow leans green and white tints.
//   • Everything is lit from paint height (normal map + a touch of gloss), so thick paint reads as thick.

import { mixPigment, PIGMENT } from './pigment.js';
import { OPACITY } from './paints.js';

export const DEFAULTS = {
  size: 46,            // brush width in canvas px
  bristles: 34,        // bristles across the brush
  load: 1.0,           // paint on each bristle at the start of a stroke
  consumption: 0.00035, // load used per pixel touched (higher = runs dry sooner)
  opacity: 0.94,       // how opaque a full bristle lays paint (acrylic ~ opaque)
  dry: 0.75,           // dry-brush strength: how much the weave blocks an emptying bristle
  pickup: 0.14,        // how much wet paint under a bristle mixes into its colour
  wetSeconds: 90,      // open time: how long one stroke's worth of paint stays blendable
  waterMix: 0.4,       // water share of paint as it leaves the brush (thinned paint = higher, and more see-through)
  thickDry: 0.8,       // thick paint dries slower (0 = thickness doesn't matter)
  skin: 1.5,           // surface skin slows the last of the water (0 = constant rate)
  tack: 0.5,           // how much half-dry paint drags and breaks up under the brush
  dryDarken: 0.08,     // acrylic dries a touch darker
  timeScale: 1,        // simulated seconds per real second (time warp)
  push: 0.4,           // how much open paint the bristles shove aside into ridges (0 = none)
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

// Drying. f = water / (solids + water) of the wet layer. Above F_OPEN paint blends freely; below F_LOCK it is a film.
const F_OPEN = 0.3, F_LOCK = 0.12, F_FRESH = 0.4;
const DAB = 0.08;                                               // thickness of one typical stroke (measured)
// water one DAB must lose to go from fresh to F_OPEN, per unit of wetSeconds
const E0 = DAB * (1 - F_FRESH) * (F_FRESH / (1 - F_FRESH) - F_OPEN / (1 - F_OPEN));
const PUSH_MAX = 65536, pushIdx = new Int32Array(PUSH_MAX), pushS = new Float32Array(PUSH_MAX), pushW = new Float32Array(PUSH_MAX), pushC = new Float32Array(PUSH_MAX * 3);
const TILE = 32;                                                // drying and shading work on tiles, only where paint is wet
const smooth01 = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

export const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
// linear 0..1 -> sRGB 0..255 through a table: the shader calls this three times per pixel, so it must not pow()
const SRGB_N = 4096, SRGB_LUT = new Float32Array(SRGB_N + 1);
for (let i = 0; i <= SRGB_N; i++) SRGB_LUT[i] = linearToSrgb(i / SRGB_N) * 255;
const toSrgb8 = (v) => SRGB_LUT[(v <= 0 ? 0 : v >= 1 ? SRGB_N : v * SRGB_N + 0.5) | 0];

export function hexToLinear(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)];
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pigment mix of linear RGB (Kubelka-Munk over a 38-band spectrum, see pigment.js). t = weight of b.
const mix3 = mixPigment;

export class PaintEngine {
  constructor({ width = 1200, height = 900, seed = 7 } = {}) {
    this.W = width; this.H = height;
    this.params = { ...DEFAULTS };
    this.rand = mulberry32(seed);
    const n = width * height;
    this.color = new Float32Array(n * 3);
    this.height = new Float32Array(n);   // solids in the wet layer
    this.water = new Float32Array(n);    // water in the wet layer
    this.film = new Float32Array(n);     // dried paint underneath
    this.ground = new Float32Array(n);
    this.scratchH = new Float32Array(n);
    this.rgba = new Uint8ClampedArray(n * 4);
    this.TX = Math.ceil(width / TILE); this.TY = Math.ceil(height / TILE);
    this.tileActive = new Uint8Array(this.TX * this.TY);   // has wet paint, so it needs drying
    this.tileDirty = new Uint8Array(this.TX * this.TY);    // needs re-shading
    this.tileProg = new Float32Array(this.TX * this.TY);   // mean dryness when last shaded
    this.gesso = [srgbToLinear(0.93), srgbToLinear(0.9), srgbToLinear(0.83)];   // bare ground colour
    this.debugWet = false;               // tint paint by how workable it is: blue open, orange tacky, none locked
    this.now = 0;                        // simulated seconds
    this._t = undefined; this._pend = 0;
    this.stroke = null;
    this._makeGround(seed);
    this.clear();
  }

  setParams(p) { Object.assign(this.params, p); }

  // Real seconds in; drying runs on simulated seconds (real * timeScale), in batches so idle frames stay cheap.
  setTime(t) {
    const dt = this._t === undefined ? 0 : Math.max(0, t - this._t);
    this._t = t;
    this._pend += dt * this.params.timeScale;
    if (this._pend >= 0.25) { const s = this._pend; this._pend = 0; this.advance(s); }
  }

  // Let `seconds` of simulated time pass. Big jumps are sub-stepped, so a long wait dries the paint the same way.
  advance(seconds) {
    if (!(seconds > 0)) return;
    this.now += seconds;
    const steps = Math.min(20, Math.ceil(seconds / 2));
    for (let k = 0; k < steps; k++) this._dry(seconds / steps);
  }

  // "Dry now": everything wet becomes film, as if left for a day.
  dryAll() { this.advance(86400); this.tileDirty.fill(2); this.anyDirty = true; }

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
    const g = this.gesso; // warm gesso
    for (let i = 0; i < n; i++) { this.color[i * 3] = g[0]; this.color[i * 3 + 1] = g[1]; this.color[i * 3 + 2] = g[2]; }
    this.height.fill(0); this.water.fill(0); this.film.fill(0);
    this.tileActive.fill(0); this.tileProg.fill(0); this.tileDirty.fill(2); this.anyDirty = true;
  }

  // one-level undo (buffers are reused, so no allocation per stroke)
  snapshot() {
    const n = this.height.length;
    const s = this._snap || (this._snap = { c: new Float32Array(n * 3), h: new Float32Array(n), w: new Float32Array(n), f: new Float32Array(n), a: new Uint8Array(this.tileActive.length) });
    s.c.set(this.color); s.h.set(this.height); s.w.set(this.water); s.f.set(this.film); s.a.set(this.tileActive);
    this._hasSnap = true;
  }
  restore() {
    if (!this._hasSnap) return false;
    const s = this._snap;
    this.color.set(s.c); this.height.set(s.h); this.water.set(s.w); this.film.set(s.f); this.tileActive.set(s.a);
    this._hasSnap = false;
    this.tileDirty.fill(2); this.anyDirty = true;
    return true;
  }

  // ── stroke ────────────────────────────────────────────────────────────────
  // `paint` (an entry from paints.js) is optional: it sets how solidly the paint covers and how strongly it tints a mix.
  beginStroke(x, y, pressure, colorLinear, paint) {
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
      opacity: paint ? OPACITY[paint.opacity] ?? 1 : 1, strength: paint?.strength ?? 1,
      axis: [Math.cos(2 * (P.fixedAngle * Math.PI / 180)), Math.sin(2 * (P.fixedAngle * Math.PI / 180))], // doubled-angle state
      started: false,
    };
    this._deposit(x, y, pressure, this.stroke.axis, 0, 0);
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
      this._deposit(s.px + dx * f, s.py + dy * f, s.pressure + (pressure - s.pressure) * f, s.axis, dx / dist, dy / dist);
    }
    s.px = tx; s.py = ty; s.sx = x; s.sy = y; s.pressure = pressure; s.moved += dist;
  }

  endStroke() { this.stroke = null; }

  // (ux, uy) is the unit direction of travel; (0, 0) means no travel yet, so nothing is pushed.
  _deposit(cx, cy, pressure, axis, ux, uy) {
    const { W, H, color, height, water, film, ground } = this, P = this.params, s = this.stroke;
    const wm = P.waterMix, transp = Math.pow(Math.min(1, (1 - wm) / (1 - F_FRESH)), 0.8); // thinned paint is see-through
    const a = Math.atan2(axis[1], axis[0]) / 2, ca = Math.cos(a), sa = Math.sin(a);
    const press = Math.min(1, Math.max(0.05, pressure));
    const spread = 0.55 + 0.6 * press;               // harder press splays the row wider
    const tmp = [0, 0, 0];
    const sx = -uy, sy = ux;                          // across the direction of travel: paint is shoved this way
    const pushing = P.push > 0 && (ux !== 0 || uy !== 0);
    let np = 0;                                       // queued shoves, applied after every bristle has been through
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

          // how workable the wet paint already here is: 1 open (blends), 0 locked or bare canvas
          let s0 = height[i], w0 = water[i], tw = s0 + w0;
          const wk = tw > 1e-5 ? smooth01((w0 / tw - F_LOCK) / (F_OPEN - F_LOCK)) : 0;
          const tacky = 4 * wk * (1 - wk);   // peaks halfway between open and locked

          // dry brush: weave peaks catch paint, valleys are skipped as the bristle empties.
          // Half-dry paint drags: the same skipping, so it breaks up instead of blending.
          const reach = contact - dryT * (1 - ground[i]) * 1.3 - dryT * 0.15 - tacky * P.tack * (0.25 + 0.75 * (1 - ground[i]));
          if (reach <= 0) continue;
          const amt = Math.min(1, reach * 1.4) * fall;

          // shove: open paint under the bristle is pushed sideways to just outside it (a groove here, a ridge there)
          if (pushing && wk > 0.05 && tw > 1e-4 && np < PUSH_MAX) {
            const across = (xx - bx) * sx + (yy - by) * sy;
            const f = Math.min(0.5, P.push * wk * contact * fall);
            const d = (across >= 0 ? 1 : -1) * (r + 0.9);
            const fx = bx + sx * d, fy = by + sy * d, tx = Math.floor(fx), ty = Math.floor(fy), ax = fx - tx, ay = fy - ty;
            if (tx >= 0 && tx < W - 1 && ty >= 0 && ty < H - 1 && f > 0.002 && np + 4 <= PUSH_MAX) {
              // land it across the four pixels around the target, so ridges are smooth and not one rounded pixel
              const j = ty * W + tx, ms = s0 * f, mw = w0 * f, ci = i * 3, c0 = color[ci], c1 = color[ci + 1], c2 = color[ci + 2];
              const w00 = (1 - ax) * (1 - ay), w10 = ax * (1 - ay), w01 = (1 - ax) * ay, w11 = ax * ay;
              pushIdx[np] = j; pushS[np] = ms * w00; pushW[np] = mw * w00; pushC[np * 3] = c0; pushC[np * 3 + 1] = c1; pushC[np * 3 + 2] = c2; np++;
              pushIdx[np] = j + 1; pushS[np] = ms * w10; pushW[np] = mw * w10; pushC[np * 3] = c0; pushC[np * 3 + 1] = c1; pushC[np * 3 + 2] = c2; np++;
              pushIdx[np] = j + W; pushS[np] = ms * w01; pushW[np] = mw * w01; pushC[np * 3] = c0; pushC[np * 3 + 1] = c1; pushC[np * 3 + 2] = c2; np++;
              pushIdx[np] = j + W + 1; pushS[np] = ms * w11; pushW[np] = mw * w11; pushC[np * 3] = c0; pushC[np * 3 + 1] = c1; pushC[np * 3 + 2] = c2; np++;
              s0 -= s0 * f; w0 -= w0 * f; tw = s0 + w0;
            }
          }

          const c = i * 3;
          // bristle drags open paint from the canvas into its own colour
          // (only from pixels that actually hold wet paint, not bare gesso, or the bristle bleaches itself)
          const present = Math.min(1, tw * 8);
          if (wk > 0.02 && present > 0.05 && P.pickup > 0) {
            let t = Math.min(0.5, P.pickup * wk * present * amt * (1.4 - loadFrac));
            // a pixel that still looks like bare canvas holds no pigment worth dragging: without this the bristles
            // bleach themselves on thin, gesso-tinted paint and go on laying gesso-coloured ridges
            const g = this.gesso, looks = Math.abs(color[c] - g[0]) + Math.abs(color[c + 1] - g[1]) + Math.abs(color[c + 2] - g[2]);
            t *= Math.min(1, looks * 4);
            t /= t + (1 - t) * s.strength;   // a strong pigment on the bristle wins over what it drags through
            mix3(tmp, b.c0, b.c1, b.c2, color[c], color[c + 1], color[c + 2], t);
            b.c0 = tmp[0]; b.c1 = tmp[1]; b.c2 = tmp[2];
          }
          // lay paint down: opaque, less so as the bristle runs empty or the paint is thinned
          const alpha = Math.min(1, amt * P.opacity * s.opacity * transp * (0.6 + 0.4 * Math.min(1, loadFrac * 3)));
          const mixT = alpha * s.strength / (alpha * s.strength + (1 - alpha));   // strong pigments take over a mix faster
          // over bare canvas or dried paint the old colour is a ground, not a paint: don't let it weigh in like white paint
          mix3(tmp, color[c], color[c + 1], color[c + 2], b.c0, b.c1, b.c2, mixT, PIGMENT.lumPow * Math.min(1, tw / 0.05));
          // over dried paint there is nothing to mix with: the new paint just covers it
          const cover = Math.min(1, film[i] * 10) * (1 - wk);
          for (let k = 0; k < 3; k++) {
            const old = color[c + k], fresh = k === 0 ? b.c0 : k === 1 ? b.c1 : b.c2;
            color[c + k] = tmp[k] * (1 - cover) + (old * (1 - alpha) + fresh * alpha) * cover;
          }

          // new paint arrives as solids + water, so its thickness is the same as before but it now has to dry
          const room = Math.max(0, 1.6 - film[i] - tw);
          const laid = Math.min(room, amt * P.heightGain * (0.35 + 0.65 * Math.min(1, loadFrac)));
          height[i] = s0 + laid * (1 - wm);
          water[i] = w0 + laid * wm;
          b.load -= P.consumption * amt;

          if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy;
        }
      }
    }
    for (let k = 0; k < np; k++) {
      const j = pushIdx[k], room = Math.max(0, 1.6 - film[j] - height[j] - water[j]), m = pushS[k] + pushW[k];
      const keep = m > room ? room / m : 1, moved = m * keep, here = height[j] + water[j];
      height[j] += pushS[k] * keep; water[j] += pushW[k] * keep;
      // the pushed paint brings its colour: it takes over a bare pixel, and only tints one that already holds paint
      const t = moved / (moved + here + 0.004), q = j * 3;
      color[q] += (pushC[k * 3] - color[q]) * t; color[q + 1] += (pushC[k * 3 + 1] - color[q + 1]) * t; color[q + 2] += (pushC[k * 3 + 2] - color[q + 2]) * t;
    }
    const pad = pushing ? 8 : 2;   // shoved paint lands a few pixels outside the bristles
    if (x1 >= x0) { this._markActive(x0 - pad, y0 - pad, x1 + 1 + pad, y1 + 1 + pad); this._markDirty(x0 - pad, y0 - pad, x1 + 1 + pad, y1 + 1 + pad); }
  }

  _tiles(x0, y0, x1, y1, fn) {
    const { TX, TY } = this;
    const tx0 = Math.max(0, Math.floor(x0 / TILE)), tx1 = Math.min(TX - 1, Math.floor((x1 - 1) / TILE));
    const ty0 = Math.max(0, Math.floor(y0 / TILE)), ty1 = Math.min(TY - 1, Math.floor((y1 - 1) / TILE));
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) fn(ty * TX + tx);
  }
  _markActive(x0, y0, x1, y1) { this._tiles(x0, y0, x1, y1, (t) => { this.tileActive[t] = 1; }); }
  // level 2 = a brush just touched it (shade now), 1 = drying changed it (shade when there's time)
  _markDirty(x0, y0, x1, y1, level = 2) { this._tiles(x0, y0, x1, y1, (t) => { if (this.tileDirty[t] < level) this.tileDirty[t] = level; }); this.anyDirty = true; }

  // ── drying ────────────────────────────────────────────────────────────────
  // Water leaves the wet layer. Thick paint dries slowly (roughly with thickness squared, since water has to
  // diffuse out) and a skin slows the last of it. When the solvent share drops under F_LOCK the layer freezes
  // into the dried film.
  _dry(dt) {
    const { W, H, TX, TY, height, water, film, tileActive, tileProg } = this, P = this.params;
    const E = E0 / Math.max(1, P.wetSeconds);
    for (let ty = 0; ty < TY; ty++) {
      for (let tx = 0; tx < TX; tx++) {
        const t = ty * TX + tx;
        if (!tileActive[t]) continue;
        const xa = tx * TILE, ya = ty * TILE, xb = Math.min(W, xa + TILE), yb = Math.min(H, ya + TILE);
        let wet = 0, prog = 0, locked = false;
        for (let y = ya; y < yb; y++) {
          for (let x = xa, i = y * W + xa; x < xb; x++, i++) {
            let s = height[i], w = water[i];
            if (s <= 0 && w <= 0) continue;
            const tot = s + w;
            const thick = 1 / Math.max(0.5, 1 + P.thickDry * (tot / DAB - 1));
            const done = Math.min(1, Math.max(0, 1 - w / tot / F_FRESH));
            w = Math.max(0, w - E * thick * dt / (1 + P.skin * done));
            if (w / (s + w) <= F_LOCK) { film[i] += s; height[i] = 0; water[i] = 0; locked = true; continue; }
            water[i] = w; wet++; prog += done;
          }
        }
        if (!wet) tileActive[t] = 0;
        // re-shade the tile once it has visibly changed (colour and relief shift as it dries)
        const mean = wet ? prog / wet : 1;
        if (!wet || locked || Math.abs(mean - tileProg[t]) > 0.03) {
          tileProg[t] = mean;
          this._markDirty(xa - 1, ya - 1, xb + 1, yb + 1, 1);
        }
      }
    }
  }

  // ── lighting ──────────────────────────────────────────────────────────────
  // Re-shades the dirty tiles and returns the {x,y,w,h} box to blit (pixels of clean tiles inside it are unchanged), or null.
  // Tiles a brush just touched are always shaded. Tiles that only changed because paint dried share `lazy` tiles per
  // call, so a big wet canvas drying doesn't stall one frame.
  render(lazy = 48) {
    if (!this.anyDirty) return null;
    const { W, TX, TY, tileDirty } = this, P = this.params;

    const la = P.lightAngle * Math.PI / 180;
    let lx = Math.cos(la), ly = -Math.sin(la), lz = 0.62;
    const ln = Math.hypot(lx, ly, lz); lx /= ln; ly /= ln; lz /= ln;
    let hx = lx, hy = ly, hz = lz + 1; const hn = Math.hypot(hx, hy, hz); hx /= hn; hy /= hn; hz /= hn;
    const light = { lx, ly, lz, hx, hy, hz, ambient: 0.5, flat: 0.5 + 0.5 * lz };

    let bx0 = W, by0 = this.H, bx1 = 0, by1 = 0, left = 0;
    for (let ty = 0; ty < TY; ty++) {
      for (let tx = 0; tx < TX; tx++) {
        const t = ty * TX + tx, level = tileDirty[t];
        if (!level) continue;
        if (level === 1 && lazy-- <= 0) { left++; continue; }
        tileDirty[t] = 0;
        const x0 = tx * TILE, y0 = ty * TILE, x1 = Math.min(W, x0 + TILE), y1 = Math.min(this.H, y0 + TILE);
        this._shade(x0, y0, x1, y1, light);
        if (x0 < bx0) bx0 = x0; if (y0 < by0) by0 = y0; if (x1 > bx1) bx1 = x1; if (y1 > by1) by1 = y1;
      }
    }
    this.anyDirty = left > 0;
    return bx1 > bx0 ? { x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 } : null;
  }

  _shade(x0, y0, x1, y1, L) {
    const { W, H, color, height, water, film, ground, scratchH, rgba, albedo, normals } = this, P = this.params;
    const { lx, ly, lz, hx, hy, hz, ambient, flat } = L;

    // combined surface height: dried film + wet layer. Thin paint keeps the weave, thick paint buries it
    for (let y = Math.max(0, y0 - 1); y < Math.min(H, y1 + 1); y++) {
      for (let x = Math.max(0, x0 - 1); x < Math.min(W, x1 + 1); x++) {
        const i = y * W + x, p = film[i] + height[i] + water[i];
        scratchH[i] = p + ground[i] * P.weave * Math.max(0, 1 - p * 4);
      }
    }

    for (let y = y0; y < y1; y++) {
      const ym = Math.max(0, y - 1), yp = Math.min(H - 1, y + 1);
      for (let x = x0; x < x1; x++) {
        const xm = Math.max(0, x - 1), xp = Math.min(W - 1, x + 1), i = y * W + x;
        const gx = (scratchH[y * W + xp] - scratchH[y * W + xm]) * 0.5 * P.relief * 4;
        const gy = (scratchH[yp * W + x] - scratchH[ym * W + x]) * 0.5 * P.relief * 4;
        let nx = -gx, ny = -gy, nz = 1; const nn = Math.hypot(nx, ny, nz); nx /= nn; ny /= nn; nz /= nn;
        const diff = Math.max(0, nx * lx + ny * ly + nz * lz);
        let lit = (ambient + (1 - ambient) * diff) / flat;

        // how dry the paint here is: wet paint is a little lighter and glossier, dried paint sits darker and satin
        const p = film[i] + height[i] + water[i], tw = height[i] + water[i];
        const dry = tw > 1e-5 ? Math.min(1, Math.max(0, 1 - water[i] / tw / F_FRESH)) : 1;
        const darken = 1 - P.dryDarken * dry * Math.min(1, p * 8);
        lit *= darken;

        const spec = Math.pow(Math.max(0, nx * hx + ny * hy + nz * hz), 36) * P.gloss * (0.25 + Math.min(1, p * 3)) * (1.5 - 0.5 * dry);
        const o = i * 4, c = i * 3;
        if (albedo) {
          albedo[o] = toSrgb8(color[c] * darken); albedo[o + 1] = toSrgb8(color[c + 1] * darken); albedo[o + 2] = toSrgb8(color[c + 2] * darken); albedo[o + 3] = 255;
          // tangent space is y-up and the canvas is y-down, so the y slope flips sign
          normals[o] = (-gx / nn * 0.5 + 0.5) * 255; normals[o + 1] = (gy / nn * 0.5 + 0.5) * 255; normals[o + 2] = (nz * 0.5 + 0.5) * 255; normals[o + 3] = 255;
        }
        let R = toSrgb8(Math.min(1, color[c] * lit + spec)), G = toSrgb8(Math.min(1, color[c + 1] * lit + spec)), B = toSrgb8(Math.min(1, color[c + 2] * lit + spec));
        if (this.debugWet && tw > 1e-5) {
          const wk = smooth01((water[i] / tw - F_LOCK) / (F_OPEN - F_LOCK));
          const a = wk >= 0.999 ? 0.55 : 0.6 * Math.min(1, wk * 4 + 0.15), r2 = wk >= 0.999 ? 40 : 255, g2 = wk >= 0.999 ? 110 : 140, b2 = wk >= 0.999 ? 255 : 0;
          R += (r2 - R) * a; G += (g2 - G) * a; B += (b2 - B) * a;
        }
        rgba[o] = R; rgba[o + 1] = G; rgba[o + 2] = B; rgba[o + 3] = 255;
      }
    }
  }

  // Extra outputs for a 3D surface: an unlit colour map and a tangent-space normal map (both RGBA8, same size as the
  // canvas), refreshed by render() wherever it re-shades. The 3D easel uses these so the room's own lights shade the paint.
  enableMaps() {
    const n = this.W * this.H;
    this.albedo = new Uint8ClampedArray(n * 4);
    this.normals = new Uint8ClampedArray(n * 4);
    this.tileDirty.fill(2); this.anyDirty = true;
  }

  setDebugWet(on) { this.debugWet = !!on; this.tileDirty.fill(2); this.anyDirty = true; }

  renderAll() {
    this.tileDirty.fill(2); this.anyDirty = true;
    return this.render();
  }
}
