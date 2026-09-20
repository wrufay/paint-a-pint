// Checks the drying model without a browser: prints how a stroke moves through open -> tacky -> locked,
// and how thick paint, wet-on-wet and wet-on-dry behave.   node tools/dry-test.mjs
import { PaintEngine, hexToLinear, linearToSrgb } from '../src/brush/engine.js';
import { paintByName } from '../src/brush/paints.js';

const col = (name) => hexToLinear(paintByName(name).hex);
// mean colour of a 9x9 patch, so a bristle gap under one pixel doesn't decide the answer
const px = (eng, x, y) => [0, 1, 2].map((k) => {
  let s = 0;
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) s += eng.color[((y + dy) * eng.W + x + dx) * 3 + k];
  return Math.round(linearToSrgb(s / 81) * 255);
});
const line = (x0, y0, x1, y1, n = 30) => Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);
function stroke(eng, color, pts, pressure = 0.7) {
  eng.beginStroke(pts[0][0], pts[0][1], pressure, color);
  for (const [x, y] of pts.slice(1)) eng.strokeTo(x, y, pressure);
  eng.endStroke();
}

// solvent share -> open (blends) / tacky / locked; same thresholds as the engine
function census(eng) {
  let open = 0, tacky = 0, film = 0, n = 0;
  for (let i = 0; i < eng.height.length; i++) {
    const tw = eng.height[i] + eng.water[i];
    if (tw > 1e-5) { const f = eng.water[i] / tw; n++; if (f > 0.3) open++; else tacky++; }
    else if (eng.film[i] > 0) film++;
  }
  return { wet: n, open, tacky, film };
}

console.log('— 1. one stroke drying (wetSeconds = 90, timeScale 1) —');
{
  const eng = new PaintEngine({ width: 600, height: 200, seed: 3 });
  stroke(eng, col("king's blue"), line(40, 100, 560, 100));
  let t = 0;
  for (const target of [0, 30, 60, 90, 120, 180, 240, 360, 600, 1200]) {
    eng.advance(target - t); t = target;
    const c = census(eng);
    console.log(`t=${String(t).padStart(5)}s  open ${String(c.open).padStart(6)}  tacky ${String(c.tacky).padStart(6)}  film ${String(c.film).padStart(6)}`);
  }
}

console.log('\n— 2. thick vs thin: time until the paint stops being open —');
for (const [label, passes] of [['1 pass', 1], ['3 passes', 3]]) {
  const eng = new PaintEngine({ width: 600, height: 200, seed: 3 });
  for (let p = 0; p < passes; p++) stroke(eng, col("king's blue"), line(40, 100, 560, 100));
  let t = 0;
  while (census(eng).open > 0 && t < 20000) { eng.advance(10); t += 10; }
  console.log(`${label}: open until ~${t}s`);
}

console.log('\n— 3. wet-on-wet vs wet-on-dry (yellow stroke, then blue across it) —');
for (const [label, wait] of [['wet-on-wet (blue right after)', 0], ['wet-on-dry (blue after drying)', 'dry']]) {
  const eng = new PaintEngine({ width: 300, height: 200, seed: 5 });
  stroke(eng, col('lemon yellow'), line(40, 100, 260, 100));
  if (wait === 'dry') eng.dryAll();
  stroke(eng, col('prussian blue hue'), line(150, 40, 150, 160));
  const c = px(eng, 150, 100), rest = px(eng, 150, 60);
  console.log(`${label.padEnd(34)} crossing rgb(${c})   blue alone rgb(${rest})`);
}

console.log('\n— 4. dries darker —');
{
  const eng = new PaintEngine({ width: 300, height: 200, seed: 5 });
  stroke(eng, col('lemon yellow'), line(40, 100, 260, 100));
  eng.renderAll();
  const i = (100 * 300 + 150) * 4, wet = [...eng.rgba.slice(i, i + 3)];
  eng.dryAll(); eng.renderAll();
  console.log(`wet rgb(${wet})  dry rgb(${[...eng.rgba.slice(i, i + 3)]})`);
}

console.log('\n— 5. ridges: a stroke through wet paint —');
{
  const volume = (e) => { let v = 0; for (let i = 0; i < e.height.length; i++) v += e.height[i] + e.water[i]; return v; };
  for (const push of [0, 0.25, 0.6]) {
    const eng = new PaintEngine({ width: 300, height: 200, seed: 5 });
    eng.setParams({ push });
    stroke(eng, col('lemon yellow'), line(30, 100, 270, 100));
    stroke(eng, col('lemon yellow'), line(30, 96, 270, 96));       // build a wet slab
    const before = volume(eng);
    stroke(eng, col("king's blue"), line(150, 30, 150, 170));      // cross it, downward
    // thickness across the crossing stroke, at y = 60 (through the fresh stroke only) and y = 100 (through the slab)
    const prof = (y) => Array.from({ length: 41 }, (_, k) => { const i = y * 300 + 130 + k; return eng.film[i] + eng.height[i] + eng.water[i]; });
    const fmt = (a) => a.map((v) => Math.round(v * 100)).join(' ');
    const slab = prof(100);
    console.log(`push ${String(push).padEnd(4)} volume change ${((volume(eng) - before) / before * 100).toFixed(0)}%  slab profile x=130..170 (x100): ${fmt(slab)}`);
    console.log(`          groove min ${Math.min(...slab.slice(8, 32)).toFixed(3)}  ridge max ${Math.max(...slab).toFixed(3)}`);
  }
}

console.log('\n— 6. cost —');
{
  const eng = new PaintEngine({ width: 1200, height: 900, seed: 3 });
  for (let k = 0; k < 40; k++) stroke(eng, col(k % 2 ? "king's blue" : 'lemon yellow'), line(40, 40 + k * 20, 1160, 60 + k * 20, 90));
  const a = performance.now(); eng.advance(1); const b = performance.now();
  console.log(`painted 40 long strokes; one drying pass over ${census(eng).wet} wet px: ${(b - a).toFixed(1)}ms`);
  eng.renderAll();
  eng.advance(30);
  let calls = 0, worst = 0, total = 0;
  for (let r = eng.render(); r || eng.anyDirty; r = eng.render()) { const c = performance.now(); calls++; } // warm loop guard
  eng.advance(30);
  for (;;) { const c = performance.now(); const r = eng.render(); const d = performance.now() - c; if (!r && !eng.anyDirty) break; calls++; total += d; worst = Math.max(worst, d); }
  console.log(`re-shade after 30s: spread over ${calls} frames, worst frame ${worst.toFixed(1)}ms, total ${total.toFixed(0)}ms`);
}
