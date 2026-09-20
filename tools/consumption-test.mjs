// How far does a loaded brush paint before it runs dry? Draws one long straight stroke per brush shape / pressure on
// a fresh canvas and reports, every 100 px of travel, the mean bristle load and how much of the brush's track still
// holds paint. Ordinary strokes should stay loaded for roughly 600-800 px before the dry-brush tail begins.
//   node tools/consumption-test.mjs [consumption]     (optional override, to try a value without editing the engine)
import { PaintEngine, hexToLinear } from '../src/brush/engine.js';
import { paintByName } from '../src/brush/paints.js';

const override = process.argv[2] ? Number(process.argv[2]) : undefined;
const W = 1500, H = 200, SIZE = 46;
const paint = paintByName("king's blue");
const results = [];

for (const shape of ['flat', 'filbert', 'round']) {
  for (const pressure of [0.45, 0.7, 0.95]) {
    const eng = new PaintEngine({ width: W, height: H, seed: 5 });
    eng.setParams({ shape, size: SIZE, ...(override ? { consumption: override } : {}) });
    const y = H / 2, rows = [];
    eng.beginStroke(20, y, pressure, hexToLinear(paint.hex), paint);
    for (let k = 1; k <= 140; k++) {
      eng.strokeTo(20 + k * 10, y, pressure);
      if (k % 10 === 0) {
        const bs = eng.stroke.bristles;
        const load = bs.reduce((a, b) => a + Math.max(0, b.load) / b.load0, 0) / bs.length;
        // share of the track (a band across the brush's middle, 100 px of travel) that holds paint
        let held = 0, n = 0;
        for (let yy = y - SIZE / 3; yy <= y + SIZE / 3; yy++) for (let xx = 20 + k * 10 - 100; xx < 20 + k * 10; xx++) { n++; if (eng.height[(yy | 0) * W + xx] + eng.water[(yy | 0) * W + xx] > 0.02) held++; }
        rows.push({ px: k * 10, load, cover: held / n });
      }
    }
    eng.endStroke();
    // "tail begins" where mean load falls under 0.5; "empty" where coverage falls under 50%
    const tail = rows.find((r) => r.load < 0.5)?.px ?? '>1400';
    const empty = rows.find((r) => r.cover < 0.5)?.px ?? '>1400';
    results.push({ shape, pressure, tail, empty, profile: rows.filter((_, i) => i % 2 === 1).map((r) => `${r.px}:${r.load.toFixed(2)}/${(r.cover * 100) | 0}%`).join(' ') });
  }
}
console.log(`consumption = ${override ?? 'default'}   (tail = mean load < 0.5, empty = <50% of track covered; px of travel)`);
for (const r of results) console.log(`${r.shape.padEnd(8)} p=${r.pressure.toFixed(2)}  tail ${String(r.tail).padStart(5)}  empty ${String(r.empty).padStart(5)}   ${r.profile}`);
