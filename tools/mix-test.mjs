// Prints pigment mixes so the model can be judged by eye, and checks the mixer round-trips colours and stays fast.
//   node tools/mix-test.mjs
import { mixPigment, PIGMENT } from '../src/brush/pigment.js';
import { hexToLinear, linearToSrgb } from '../src/brush/engine.js';
import { PAINTS, PALETTES, paintByName } from '../src/brush/paints.js';

const lin = (name) => hexToLinear(paintByName(name).hex);
const hex = (c) => '#' + c.map((v) => Math.round(Math.min(1, linearToSrgb(Math.max(0, v))) * 255).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const o = [0, 0, 0]; mixPigment(o, ...a, ...b, t); return o; };

console.log('— round trip: mixing a colour with itself should give it back —');
let worst = 0;
for (const p of PAINTS) {
  const c = hexToLinear(p.hex), m = mix(c, c, 0.5);
  const d = Math.max(...c.map((v, i) => Math.abs(linearToSrgb(v) - linearToSrgb(m[i])))) * 255;
  worst = Math.max(worst, d);
}
console.log(`worst channel error over the palette: ${worst.toFixed(1)} / 255`);

const show = (label, a, b, ts = [0.25, 0.5, 0.75]) =>
  console.log(label.padEnd(34), hex(lin(a)), '->', ts.map((t) => hex(mix(lin(a), lin(b), t))).join(' '), '->', hex(lin(b)));
for (const lp of [0.5]) {
  PIGMENT.lumPow = lp;
  console.log(`\n— warm triad: azo yellow, naphthol red, king's blue (lumPow ${lp}) —`);
  show('azo yellow + naphthol red', 'azo yellow medium', 'naphthol red medium');
  show("azo yellow + king's blue", 'azo yellow medium', "king's blue");
  show("naphthol red + king's blue", 'naphthol red medium', "king's blue");
  console.log('\n— cool triad: lemon yellow, permanent magenta, prussian blue hue —');
  show('lemon yellow + permanent magenta', 'lemon yellow', 'permanent magenta');
  show('lemon yellow + prussian blue hue', 'lemon yellow', 'prussian blue hue');
  show('permanent magenta + prussian blue', 'permanent magenta', 'prussian blue hue');
  console.log('\n— across the two boxes, and tints —');
  show("lemon yellow + king's blue", 'lemon yellow', "king's blue");
  show("permanent magenta + king's blue", 'permanent magenta', "king's blue");
  show("king's blue + titanium white", "king's blue", 'titanium white');
  show('prussian blue hue + white', 'prussian blue hue', 'titanium white');
  show('permanent magenta + white', 'permanent magenta', 'titanium white');
  show('naphthol red + white', 'naphthol red medium', 'titanium white');
  show('burnt sienna + white', 'burnt sienna', 'titanium white');
}
PIGMENT.lumPow = 0.5;

console.log('\n— speed —');
const a = lin('lemon yellow'), b = lin("king's blue"), o = [0, 0, 0];
const n = 300000, t0 = performance.now();
for (let i = 0; i < n; i++) mixPigment(o, a[0] * (1 - (i % 100) / 400), a[1], a[2], b[0], b[1], b[2], 0.3);
const dt = performance.now() - t0;
console.log(`${n} mixes in ${dt.toFixed(0)}ms = ${((dt / n) * 1000).toFixed(2)}µs each`);
