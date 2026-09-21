// Checks that a painting survives export -> import: every pixel comes back exactly, wet paint is still wet (and still dries), and a
// state for a canvas of another size is refused.   node tools/save-test.mjs
import { PaintEngine, hexToLinear } from '../src/brush/engine.js';
import { paintByName } from '../src/brush/paints.js';

let ok = true;
const check = (label, cond) => { console.log((cond ? 'ok   ' : 'FAIL ') + label); if (!cond) ok = false; };
const same = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return a.length === b.length; };
const paint = paintByName("king's blue");
const stroke = (e, y, shape) => {
  e.setParams({ shape }); e.snapshot();
  e.beginStroke(40, y, 0.7, hexToLinear(paint.hex), paint);
  for (let i = 1; i <= 40; i++) e.strokeTo(40 + i * 12, y + Math.sin(i / 5) * 10, 0.7);
  e.endStroke();
};

const a = new PaintEngine({ width: 600, height: 300, seed: 3 });
const rev0 = a.rev;
['flat', 'round', 'knife'].forEach((sh, k) => stroke(a, 40 + k * 60, sh));
check('strokes bump rev', a.rev === rev0 + 3);
a.advance(20);                                            // some of it dried, some still wet
const wetTiles = a.tileActive.reduce((n, v) => n + v, 0);
check('some tiles are still wet', wetTiles > 0);

const s = a.exportState();
const b = new PaintEngine({ width: 600, height: 300, seed: 3 });
check('import accepts the state', b.importState(s));
check('colour, wet layer and film come back exactly', same(a.color, b.color) && same(a.height, b.height) && same(a.water, b.water) && same(a.film, b.film));
check('the clock comes back', b.now === a.now);
check('the wet tiles are active again', same(a.tileActive, b.tileActive));
check('import leaves no undo history', b.restore() === false);

// the copy carries on drying exactly like the original
a.advance(40); b.advance(40);
check('after another 40 s both dry identically', same(a.film, b.film) && same(a.water, b.water));
a.advance(86400); b.advance(86400);
check('a day later, nothing is wet in the copy', b.water.every((v) => v === 0) && b.height.every((v) => v === 0));

// the export is a copy, not a view
const c = new PaintEngine({ width: 600, height: 300, seed: 3 }); stroke(c, 100, 'flat');
const s2 = c.exportState(), snap = s2.data.slice(); stroke(c, 200, 'flat');
check('the exported state does not change when painting carries on', same(s2.data, snap));

check('a state for another size is refused', !new PaintEngine({ width: 300, height: 300, seed: 3 }).importState(s));
check('garbage is refused', !b.importState(null) && !b.importState({ W: 600, H: 300, data: new Float32Array(5) }));

process.exit(ok ? 0 : 1);
