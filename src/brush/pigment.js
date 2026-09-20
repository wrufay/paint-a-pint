// Pigment mixing: linear RGB -> a 38-band reflectance spectrum -> Kubelka-Munk mix -> back to linear RGB.
// Same model and data as spectral.js (MIT, Ronald van Wijnen), rewritten over typed arrays with no allocation
// so it can run once per bristle per pixel. Blue + yellow leans green, red + blue goes purple, and mixing
// with white tints instead of averaging.
import { SPECTRAL } from './spectral-data.js';

const N = 38, EPS = 1e-6;
const [BW, BC, BM, BY, BR, BG, BB] = SPECTRAL.base.map((a) => Float64Array.from(a));
const [CX, CY, CZ] = SPECTRAL.cmf.map((a) => Float64Array.from(a));
const [M0, M1, M2] = SPECTRAL.xyzToRgb;

// K/S of a reflectance: how strongly the surface absorbs relative to how strongly it scatters
const ks = (R) => { R = R < EPS ? EPS : R; return ((1 - R) * (1 - R)) / (2 * R); };

// linear RGB -> KS spectrum (spectral.js's decomposition into white / cyan / magenta / yellow / red / green / blue)
function toKS(out, r, g, b) {
  const w = Math.min(r, g, b);
  r -= w; g -= w; b -= w;
  const c = Math.min(g, b), m = Math.min(r, b), y = Math.min(r, g);
  const R = Math.max(0, Math.min(r - b, r - g)), G = Math.max(0, Math.min(g - b, g - r)), B = Math.max(0, Math.min(b - g, b - r));
  for (let i = 0; i < N; i++) out[i] = ks(w * BW[i] + c * BC[i] + m * BM[i] + y * BY[i] + R * BR[i] + G * BG[i] + B * BB[i]);
}

const lum = (r, g, b) => Math.max(1e-4, 0.2126 * r + 0.7152 * g + 0.0722 * b);

const ksA = new Float64Array(N), ksB = new Float64Array(N);
let cacheB0 = -1, cacheB1 = -1, cacheB2 = -1;   // the brush side is the same colour for many pixels in a row

// How much light colours dominate a mix. 0 = pure KS average, 1 = spectral.js's weighting. Lower keeps a little
// dark pigment from vanishing into a lot of white, and it is the main "feel" knob for tints.
export const PIGMENT = { lumPow: 0.5 };

// out = mix of a and b, t = weight of b. All linear RGB.
// lumPow overrides PIGMENT.lumPow: pass 0 when `a` is a ground (bare canvas or dried paint) and not a paint, so thin
// paint over it reads as a clear glaze and not as paint cut with white.
export function mixPigment(out, a0, a1, a2, b0, b1, b2, t, lumPow = PIGMENT.lumPow) {
  if (t <= 0) { out[0] = a0; out[1] = a1; out[2] = a2; return; }
  if (t >= 1) { out[0] = b0; out[1] = b1; out[2] = b2; return; }
  toKS(ksA, a0, a1, a2);
  if (b0 !== cacheB0 || b1 !== cacheB1 || b2 !== cacheB2) { toKS(ksB, b0, b1, b2); cacheB0 = b0; cacheB1 = b1; cacheB2 = b2; }
  const p = lumPow;
  const wa = (1 - t) * Math.pow(lum(a0, a1, a2), p), wb = t * Math.pow(lum(b0, b1, b2), p), inv = 1 / (wa + wb);
  let X = 0, Y = 0, Z = 0;
  for (let i = 0; i < N; i++) {
    const k = (ksA[i] * wa + ksB[i] * wb) * inv;
    const R = 1 + k - Math.sqrt(k * k + 2 * k);   // back from K/S to reflectance
    X += CX[i] * R; Y += CY[i] * R; Z += CZ[i] * R;
  }
  const r = M0[0] * X + M0[1] * Y + M0[2] * Z, g = M1[0] * X + M1[1] * Y + M1[2] * Z, b = M2[0] * X + M2[1] * Y + M2[2] * Z;
  out[0] = r > 0 ? r : 0; out[1] = g > 0 ? g : 0; out[2] = b > 0 ? b : 0;
}
