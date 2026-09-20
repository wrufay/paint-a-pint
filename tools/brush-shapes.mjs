// Renders each brush shape (flat, filbert, round) as strokes at light and firm pressure plus single dabs, and times them.
//   node tools/brush-shapes.mjs [out.png]
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { PaintEngine, hexToLinear } from '../src/brush/engine.js';
import { paintByName } from '../src/brush/paints.js';

const out = process.argv[2] || 'brush-shapes.png';
const W = 900, H = 560;
const eng = new PaintEngine({ width: W, height: H, seed: 5 });
const p = paintByName("king's blue"), red = paintByName('naphthol red medium');
const shapes = ['flat', 'filbert', 'round'];
const timing = [];
shapes.forEach((shape, row) => {
  eng.setParams({ shape });
  const y0 = 50 + row * 175;
  const t0 = performance.now(); let px = 0;
  for (const [i, pressure] of [0.35, 0.6, 0.9].entries()) {          // three strokes: light, medium, firm
    const y = y0 + i * 42;
    eng.beginStroke(50, y, pressure, hexToLinear(p.hex), p);
    for (let k = 1; k <= 40; k++) eng.strokeTo(50 + k * 9, y + Math.sin(k / 5) * 6, pressure);
    eng.endStroke(); px += 360;
  }
  const dt = performance.now() - t0;
  timing.push(`${shape}: ${(dt / px * 1000).toFixed(0)}µs per px of travel`);
  for (let d = 0; d < 5; d++) {                                      // dabs, pressure 0.3 .. 0.9
    const pr = 0.3 + d * 0.15;
    eng.beginStroke(480 + d * 75, y0 + 45, pr, hexToLinear(red.hex), red); eng.endStroke();
  }
  // a dab followed by a short drag, like touching down and pulling
  eng.beginStroke(480, y0 + 100, 0.7, hexToLinear(red.hex), red);
  for (let k = 1; k <= 8; k++) eng.strokeTo(480 + k * 9, y0 + 100 - k * 2, 0.7);
  eng.endStroke();
});
eng.renderAll();
console.log(timing.join('   '));

const { rgba } = eng;
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) { raw[y * (W * 4 + 1)] = 0; Buffer.from(rgba.buffer, y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(`wrote ${out}`);
