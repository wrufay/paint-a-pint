// The mixing tray: a second paint engine, laid out like the old styrofoam meat tray. Tubes squeeze thick blobs onto it, a
// knife dragged through them smears and mixes (the engine's own wet-on-wet pickup and pigment mixing do the work), and a tap
// picks the colour under your finger for the brush. Paint on the tray dries like any other, only more slowly.
// No DOM in here, so it can be tested in Node.
import { PaintEngine, hexToLinear, srgbToLinear } from './engine.js';

export const TRAY_W = 640, TRAY_H = 440;

// where blobs are squeezed: two rows along the top, so the lower part stays free for mixing
const SLOTS = [];
for (const y of [70, 160]) for (const x of [80, 190, 300, 410, 520]) SLOTS.push([x, y]);

const MIX = { shape: 'knife', size: 46, load: 0.7, push: 0.25, pickup: 0.05, heightGain: 0.07, waterMix: 0.3 };   // the knife that mixes
const BLOB = { shape: 'round', size: 62, load: 3, heightGain: 0.17, waterMix: 0.3, push: 0, consumption: 0.00005, smooth: 0 };
const MIXED = { id: 'mixed', brand: '', name: 'mixed on the palette', opacity: 'semi', strength: 1 };   // stands in for a tube once colours are mixed

export class Tray {
  constructor() {
    this.engine = new PaintEngine({ width: TRAY_W, height: TRAY_H, seed: 21 });
    const e = this.engine;
    e.gesso = [srgbToLinear(0.95), srgbToLinear(0.95), srgbToLinear(0.92)];   // white styrofoam, not warm gesso
    e.setParams({ weave: 0.025, relief: 3, wetSeconds: 300, gloss: 0.3, hueJitter: 0, bristleTint: 0 });   // a tray keeps paint workable for minutes
    e.clear();
    this.slot = 0;
    this.mixing = false; this.squeezing = false;
  }

  // Squeeze `paint` (an entry from paints.js) out at (x, y), or at the next free spot if no position is given. Dragging on after
  // beginSqueeze lays a line of paint, like moving the tube across the tray.
  beginSqueeze(paint, x, y) {
    const e = this.engine;
    e.snapshot();
    if (x === undefined) [x, y] = SLOTS[this.slot++ % SLOTS.length];
    this._keep = { ...e.params }; Object.assign(e.params, BLOB);
    e.beginStroke(x, y, 0.95, hexToLinear(paint.hex), paint);
    for (let k = 1; k <= 28; k++) e.strokeTo(x + Math.cos(k * 0.45) * 7, y + Math.sin(k * 0.45) * 7, 0.95);   // a small swirl builds the blob up thick
    this.squeezing = true;
    return [x, y];
  }
  squeezeTo(x, y) { if (this.squeezing) this.engine.strokeTo(x, y, 0.95); }
  endSqueeze() {
    if (!this.squeezing) return;
    this.engine.endStroke(); Object.assign(this.engine.params, this._keep); this.squeezing = false;
  }
  squeeze(paint, x, y) { const at = this.beginSqueeze(paint, x, y); this.endSqueeze(); return at; }

  // the colour of the paint around (x, y), weighted by how much paint is there; null on bare tray
  sample(x, y) {
    const e = this.engine, { W, H, color, height, water, film } = e;
    let w = 0, r = 0, g = 0, b = 0;
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const px = Math.round(x) + dx, py = Math.round(y) + dy;
        if (px < 0 || py < 0 || px >= W || py >= H) continue;
        const i = py * W + px, t = height[i] + water[i] + film[i];
        if (t < 0.01) continue;
        w += t; r += color[i * 3] * t; g += color[i * 3 + 1] * t; b += color[i * 3 + 2] * t;
      }
    }
    return w > 0.15 ? [r / w, g / w, b / w] : null;
  }

  // a drag with the knife: loads the colour under the start point and drags it, mixing with whatever it passes through
  beginMix(x, y, pressure = 0.8) {
    const c = this.sample(x, y);
    this.mixing = false;
    if (!c) return false;
    this.engine.snapshot();
    this._mixKeep = { ...this.engine.params }; Object.assign(this.engine.params, MIX);
    this.engine.beginStroke(x, y, pressure, c, MIXED);
    this.mixing = true;
    return true;
  }
  mixTo(x, y, pressure = 0.8) { if (this.mixing) this.engine.strokeTo(x, y, pressure); }
  endMix() {
    if (!this.mixing) return;
    this.engine.endStroke(); Object.assign(this.engine.params, this._mixKeep); this.mixing = false;
  }

  clear() { this.engine.snapshot(); this.engine.clear(); this.slot = 0; }
  undo() { return this.engine.restore(); }
  tick(seconds) { this.engine.setTime(seconds); return this.engine.render(); }
  get paint() { return MIXED; }
}
