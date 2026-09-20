// Renders scripted test strokes with the brush engine and writes a PNG, so the look can be checked without a browser.
//   node tools/render-test.mjs [out.png] [key=value ...]     e.g. node tools/render-test.mjs out.png size=60 dry=0.9
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { PaintEngine, PALETTE, hexToLinear } from '../src/brush/engine.js';

const out = process.argv[2] || 'brush-test.png';
const overrides = {};
for (const a of process.argv.slice(3)) { const [k, v] = a.split('='); overrides[k] = parseFloat(v); }

const W = 900, H = 600;
const eng = new PaintEngine({ width: W, height: H, seed: 11 });
eng.setParams(overrides);
const col = (name) => hexToLinear(PALETTE.find((p) => p.name === name).hex);

let t = 0;
function stroke(color, pts, pressure = 0.7) {
  eng.setTime(t); t += 4;
  eng.beginStroke(pts[0][0], pts[0][1], pressure, color);
  for (const [x, y] of pts.slice(1)) eng.strokeTo(x, y, pressure);
  eng.endStroke();
}
const line = (x0, y0, x1, y1, n = 24) => Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);

// 1) a row of swatch strokes (fresh load -> dry-out over a long drag)
PALETTE.slice(0, 5).forEach((p, i) => stroke(hexToLinear(p.hex), line(40, 40 + i * 44, 860, 40 + i * 44 + 6, 60)));
// 2) impressionist dabs: sky, then a wet-on-wet green from blue + yellow
for (let i = 0; i < 9; i++) stroke(col(i % 2 ? 'cerulean' : 'ultramarine'), line(60 + i * 46, 300, 100 + i * 46, 268 + (i % 3) * 8, 8), 0.65);
for (let i = 0; i < 6; i++) stroke(col('cadmium yellow'), line(120 + i * 30, 330, 150 + i * 30, 380, 8), 0.7);
for (let i = 0; i < 6; i++) stroke(col('ultramarine'), line(135 + i * 30, 335, 120 + i * 30, 385, 8), 0.7);
// 3) short warm dabs next to cool ones (broken colour)
for (let i = 0; i < 14; i++) stroke(col(i % 2 ? 'cadmium red' : 'yellow ochre'), line(500 + (i % 7) * 44, 330 + Math.floor(i / 7) * 40, 530 + (i % 7) * 44, 350 + Math.floor(i / 7) * 40, 5), 0.75);
// 4) a curved stroke with a light touch, then heavy
stroke(col('viridian'), Array.from({ length: 40 }, (_, i) => [80 + i * 8, 480 + Math.sin(i / 5) * 30]), 0.4);
stroke(col('titanium white'), Array.from({ length: 40 }, (_, i) => [420 + i * 10, 490 + Math.sin(i / 6) * 26]), 0.9);

const r = eng.renderAll();
const { rgba } = eng;

// minimal PNG encoder
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) { raw[y * (W * 4 + 1)] = 0; Buffer.from(rgba.buffer, y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(`wrote ${out} (${W}x${H}), dirty ${r.w}x${r.h}`);
