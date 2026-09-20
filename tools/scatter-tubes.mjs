// Scatters the nine tubes over the empty desk at angles, with the primaries grouped, and checks nothing overlaps (oriented
// rectangles, separating-axis test). Prints the TABLE.tubes array for src/props.js.   node tools/scatter-tubes.mjs [seed]
// Coordinates are room units (x right, z towards the viewer). A tube's angle is a rotation about the vertical: 0 points its
// far end at the back wall.
const seed0 = +process.argv[2] || 7;
function rng(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const LEN = 0.34, WID = 0.1;                        // a tube's footprint, with a little air
const rect = (cx, cz, a, l = LEN, w = WID) => {       // corners of an oriented rectangle
  const dx = -Math.sin(a), dz = -Math.cos(a), px = Math.cos(a), pz = -Math.sin(a);   // along the tube, and across it (perpendicular)
  const c = [];
  for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) c.push([cx + dx * u * l / 2 + px * v * w / 2, cz + dz * u * l / 2 + pz * v * w / 2]);
  return c;
};
const axes = (c) => [[c[1][0] - c[0][0], c[1][1] - c[0][1]], [c[2][0] - c[1][0], c[2][1] - c[1][1]]].map(([x, y]) => { const n = Math.hypot(x, y); return [-y / n, x / n]; });
const proj = (c, ax) => { const d = c.map(([x, y]) => x * ax[0] + y * ax[1]); return [Math.min(...d), Math.max(...d)]; };
const hit = (A, B) => { for (const ax of [...axes(A), ...axes(B)]) { const [a0, a1] = proj(A, ax), [b0, b1] = proj(B, ax); if (a1 < b0 || b1 < a0) return false; } return true; };
const box = (x0, x1, z0, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

const keepOut = [
  box(-0.16, 1.18, -3.86, -2.86),      // the canvas and its frame
  box(1.2, 1.76, -3.1, -2.6),          // the palette, on the right where the sun falls
  box(1.15, 1.8, -3.95, -3.5),         // the water jar and glass, top right
  box(-0.73, -0.22, -3.46, -2.4),      // the card's default place, bottom left
  box(-1.2, -0.7, -3.8, -3.5),         // the pink book
];
const inView = (c) => c.every(([x, z]) => x > -0.71 && x < 1.75 && z > -3.84 && z < -2.46);

// the nine paints in card order: 0 white, 1 lemon, 2 azo, 3 naples, 4 naphthol red, 5 magenta, 6 sienna, 7 king's blue, 8 prussian.
// The two primary triads are kept together: warm (azo, naphthol red, king's blue) on the left, cool (lemon, magenta, prussian) below the canvas.
const groups = [
  { ids: [2, 4, 7], x: [-0.53, -0.37], z: [-3.76, -3.56], a: [1.05, 1.5] },        // top left, above the card: the warm primaries, lying almost sideways
  { ids: [1, 5, 8, 6], x: [0.05, 1.0], z: [-2.74, -2.6], a: [0.55, 1.05] },         // under the canvas: the cool primaries and sienna, zig-zagging
  { ids: [0, 3], x: [1.3, 1.55], z: [-3.42, -3.3], a: [1.2, 1.55] },                // white and naples, between the cups and the palette
];

for (let seed = seed0; seed < seed0 + 40000; seed++) {
  const r = rng(seed), out = Array(9).fill(null), placed = [], lean = r() < 0.5 ? -1 : 1;
  let ok = true;
  for (const g of groups) {
    for (const id of g.ids) {
      let done = false;
      for (let t = 0; t < 400 && !done; t++) {
        const cx = g.x[0] + r() * (g.x[1] - g.x[0]), cz = g.z[0] + r() * (g.z[1] - g.z[0]);
        let a = g.a[0] + r() * (g.a[1] - g.a[0]);
        if (g.a[0] > 0.3) a *= lean;                               // gutter tubes all lean the same way (they pack far tighter), chosen per attempt
        const c = rect(cx, cz, a);
        if (!inView(c) || keepOut.some((k) => hit(c, k)) || placed.some((p) => hit(c, p))) continue;
        placed.push(c); out[id] = [+cx.toFixed(3), +cz.toFixed(3), +a.toFixed(3)]; done = true;
      }
      if (!done) { ok = false; break; }
    }
    if (!ok) break;
  }
  if (ok) { console.log('seed', seed, '\nTABLE.tubes = [\n' + out.map((o, i) => `  [${o.join(', ')}],   // ${i}`).join('\n') + '\n];'); process.exit(0); }
}
console.log('no arrangement found'); process.exit(1);
