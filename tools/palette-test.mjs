// Squeezes tubes onto the mixing tray, mixes them with the knife, and renders the tray. Prints the colours sampled from it.
//   node tools/palette-test.mjs [out.png]
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { Tray, TRAY_W as W, TRAY_H as H } from '../src/brush/tray.js';
import { paintByName } from '../src/brush/paints.js';
import { linearToSrgb } from '../src/brush/engine.js';

const out = process.argv[2] || 'tray.png';
const tray = new Tray();
const hex = (c) => c ? '#' + c.map((v) => Math.round(Math.min(1, linearToSrgb(Math.max(0, v))) * 255).toString(16).padStart(2, '0')).join('') : 'none';

const names = ['lemon yellow', "king's blue", 'permanent magenta', 'naphthol red medium', 'titanium white', 'azo yellow medium', 'prussian blue hue'];
const spots = names.map((n) => tray.squeeze(paintByName(n)));
tray.tick(0);
console.log('squeezed', names.length, 'blobs; blob colours:', names.map((n, i) => hex(tray.sample(...spots[i]))).join(' '));

// mix: drag from yellow into blue (green), magenta into blue (purple), red into yellow (orange), white into blue (tint)
const drag = (from, to, toY) => {
  const [x0, y0] = spots[from], [x1, y1] = spots[to];
  tray.tick(1);
  if (!tray.beginMix(x0, y0)) { console.log('no paint at start', from); return; }
  const n = 70; for (let k = 1; k <= n; k++) tray.mixTo(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n + (toY ?? 0) * Math.sin((k / n) * Math.PI));   // fine steps, like real pointer events
  // and on past the second blob, so the mix is not only in the overlap
  for (let k = 1; k <= 20; k++) tray.mixTo(x1 + k * 1.6, y1 + k * 0.7);
  tray.endMix();
  return [x1 + 32, y1 + 14];
};
const ends = [drag(0, 1, 60), drag(2, 1, -50), drag(3, 5, 55), drag(4, 6, 40)];   // yellow>blue, magenta>blue, red>azo, white>prussian
tray.tick(2);
const mid = (a, b, t = 0.5) => [spots[a][0] + (spots[b][0] - spots[a][0]) * t, spots[a][1] + (spots[b][1] - spots[a][1]) * t];
console.log('colour dragged out past the 2nd blob: yellow>blue', hex(tray.sample(...ends[0])), ' magenta>blue', hex(tray.sample(...ends[1])), ' red>azo', hex(tray.sample(...ends[2])), ' white>prussian', hex(tray.sample(...ends[3])));
console.log('bare tray sample:', hex(tray.sample(320, 400)));

tray.engine.renderAll();
const { rgba } = tray.engine;
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) { raw[y * (W * 4 + 1)] = 0; Buffer.from(rgba.buffer, y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log('wrote', out);
