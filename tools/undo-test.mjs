// Checks multi-step undo: every undo must put the canvas back exactly as it was before that step, including clear and
// dry-now, and reports how much memory the steps use at the room's canvas size.   node tools/undo-test.mjs
import { PaintEngine, hexToLinear } from '../src/brush/engine.js';
import { paintByName } from '../src/brush/paints.js';

const copy = (e) => ({ c: e.color.slice(), h: e.height.slice(), w: e.water.slice(), f: e.film.slice() });
const same = (a, b) => ['c', 'h', 'w', 'f'].every((k) => { const x = a[k], y = b[k]; for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false; return true; });
const paint = paintByName("king's blue");
const stroke = (e, y, shape) => {
  e.setParams({ shape });
  e.snapshot();
  e.beginStroke(40, y, 0.7, hexToLinear(paint.hex), paint);
  for (let i = 1; i <= 40; i++) e.strokeTo(40 + i * 12, y + Math.sin(i / 5) * 10, 0.7);
  e.endStroke();
};

let ok = true;
const check = (label, cond) => { console.log((cond ? 'ok   ' : 'FAIL ') + label); if (!cond) ok = false; };

{
  const e = new PaintEngine({ width: 600, height: 300, seed: 3 });
  const states = [copy(e)];
  const shapes = ['flat', 'round', 'filbert', 'knife', 'flat'];
  shapes.forEach((sh, k) => { stroke(e, 40 + k * 45, sh); states.push(copy(e)); });
  // wet-on-wet through earlier strokes, so a step also changes paint that was already there
  e.snapshot(); e.beginStroke(300, 20, 0.7, hexToLinear('#ead848')); for (let i = 1; i <= 40; i++) e.strokeTo(300 + Math.sin(i / 8) * 20, 20 + i * 6, 0.7); e.endStroke(); states.push(copy(e));
  e.snapshot(); e.clear(); states.push(copy(e));
  e.snapshot(); e.dryAll(); states.push(copy(e));
  let allBack = true;
  for (let n = states.length - 2; n >= 0; n--) { if (!e.restore() || !same(copy(e), states[n])) { allBack = false; console.log('  mismatch going back to state', n); } }
  check(`undo walks back through ${states.length - 1} steps (5 strokes, a wet-on-wet stroke, clear, dry now) exactly`, allBack);
  check('undo with nothing left returns false', e.restore() === false);
}

{
  const e = new PaintEngine({ width: 600, height: 300, seed: 3 });
  e.snapshot();                                   // a step that changes nothing (a knife tap, say)
  e.snapshot(); stroke(e, 100, 'flat');
  const after = copy(e);
  e.snapshot(); e.snapshot();                     // two empty steps stacked on top
  check('empty steps are skipped: one undo still undoes the stroke', e.restore() && !same(copy(e), after));
}

{
  const e = new PaintEngine({ width: 1300, height: 950, seed: 3 });
  let t = performance.now();
  for (let k = 0; k < 25; k++) stroke(e, 40 + k * 30, ['flat', 'round', 'filbert'][k % 3]);
  const ms = performance.now() - t;
  console.log(`     25 strokes at 1300x950 held ${e._undo.length} steps, ${(e._undoBytes / 1048576).toFixed(1)} MB (a full copy of the canvas is ${((1300 * 950 * 6 * 4) / 1048576).toFixed(0)} MB); painting took ${ms.toFixed(0)} ms`);
  t = performance.now(); let n = 0; while (e.restore()) n++;
  console.log(`     undid ${n} steps in ${(performance.now() - t).toFixed(0)} ms`);
  check('all 25 strokes are undoable (limit is 40)', n === 25);
  for (let k = 0; k < 60; k++) stroke(e, 40 + (k % 25) * 30, 'flat');
  check('the step limit holds (60 strokes -> at most 40 kept)', e._undo.length <= 40);
}
console.log(ok ? '\nall undo checks passed' : '\nSOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
