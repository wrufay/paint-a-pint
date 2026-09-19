import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

// Units: 1 ≈ 0.5m. Room interior is x∈[-3.85, 4], z∈[-3.85, 4]; the left wall (x) has the
// window, the back wall (z) has the collage/shelves/desk. The camera looks in from +x/+z.

const rnd = (a, b) => a + Math.random() * (b - a);
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0, ...extra });

function box(parent, w, h, d, mat, x, y, z, { r = 0.035, rx = 0, ry = 0, rz = 0, cast = true, receive = true } = {}) {
  const rad = Math.max(0.001, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, rad), mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  m.castShadow = cast; m.receiveShadow = receive;
  parent.add(m);
  return m;
}
function cyl(parent, rt, rb, h, mat, x, y, z, { seg = 28, rx = 0, rz = 0, cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z); m.rotation.set(rx, 0, rz);
  m.castShadow = cast; m.receiveShadow = receive;
  parent.add(m);
  return m;
}
function sph(parent, r, mat, x, y, z, [sx, sy, sz] = [1, 1, 1], { cast = true } = {}) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz);
  m.castShadow = cast; m.receiveShadow = true;
  parent.add(m);
  return m;
}

function canvasTex(w, h, draw, { srgb = true, aniso = 8 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

const floorTexture = () => canvasTex(1024, 1024, (g, w, h) => {
  const planks = 7, ph = h / planks;
  for (let i = 0; i < planks; i++) {
    g.fillStyle = `hsl(${rnd(34, 40)},${rnd(38, 48)}%,${rnd(56, 64)}%)`;
    g.fillRect(0, i * ph, w, ph);
    for (let n = 0; n < 70; n++) { // grain
      const y = i * ph + rnd(4, ph - 4);
      g.strokeStyle = `rgba(90,60,25,${rnd(0.03, 0.11)})`; g.lineWidth = rnd(1, 2.5);
      g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= w; x += 64) g.lineTo(x, y + Math.sin(x * 0.02 + n) * rnd(1, 4));
      g.stroke();
    }
    const seam = rnd(0.2, 0.85) * w; // butt joint
    g.fillStyle = 'rgba(60,40,20,.28)'; g.fillRect(seam, i * ph, 2, ph);
    g.fillStyle = 'rgba(50,34,16,.4)'; g.fillRect(0, i * ph, w, 2);
  }
});

const backdropTexture = () => canvasTex(160, 96, (g, w, h) => {
  // drawn tiny and scaled up: the GPU's bilinear filtering is the blur (no ctx.filter, works in Safari)
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#fff3c0'); sky.addColorStop(1, '#fffbe4');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 46; i++) {
    const x = rnd(0, w), y = rnd(h * 0.35, h * 1.05), r = rnd(9, 22);
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `hsla(${rnd(88, 118)},${rnd(35, 50)}%,${rnd(38, 56)}%,.85)`);
    rg.addColorStop(1, 'rgba(160,190,110,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
  }
}, { aniso: 1 });

const gradientTex = (stops) => canvasTex(4, 128, (g, w, h) => {
  const gr = g.createLinearGradient(0, h, 0, 0);
  stops.forEach(([o, c]) => gr.addColorStop(o, c));
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}, { aniso: 1 });

function monsteraGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 0.05);
  s.bezierCurveTo(0.15, -0.05, 0.6, -0.05, 0.75, 0.35);
  s.bezierCurveTo(0.92, 0.78, 0.55, 1.15, 0, 1.32);
  s.bezierCurveTo(-0.55, 1.15, -0.92, 0.78, -0.75, 0.35);
  s.bezierCurveTo(-0.6, -0.05, -0.15, -0.05, 0, 0.05);
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k++) { // the splits that make it read as a monstera
      const y = 0.28 + k * 0.24, len = 0.52 - k * 0.05;
      const p = new THREE.Path();
      p.moveTo(side * 0.16, y);
      p.lineTo(side * len, y + 0.1);
      p.lineTo(side * (len + 0.06), y + 0.14);
      p.lineTo(side * len, y + 0.17);
      p.lineTo(side * 0.16, y + 0.07);
      p.closePath();
      s.holes.push(p);
    }
  }
  return new THREE.ShapeGeometry(s, 6);
}

function monstera(parent, x, y, z, seed = 1) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  const geo = monsteraGeometry();
  const stemMat = std(0x5b8a3c);
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.283 * 1.7 + seed;
    const r = 0.45 + (i % 3) * 0.28, h = 0.85 + ((i * 37) % 10) * 0.11;
    const tip = new THREE.Vector3(Math.cos(a) * r, h, Math.sin(a) * r);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(Math.cos(a) * r * 0.15, h * 0.55, Math.sin(a) * r * 0.15),
      tip,
    ]);
    const stem = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.025, 6), stemMat);
    stem.castShadow = true; g.add(stem);
    const leaf = new THREE.Mesh(geo, std(new THREE.Color().setHSL(rnd(0.27, 0.33), rnd(0.5, 0.62), rnd(0.2, 0.29)), { side: THREE.DoubleSide, roughness: 0.55 }));
    const sc = rnd(0.62, 0.9);
    leaf.scale.setScalar(sc);
    leaf.position.copy(tip);
    leaf.rotation.order = 'YXZ';
    leaf.rotation.y = -a + Math.PI / 2;
    leaf.rotation.x = -Math.PI / 2 + rnd(0.55, 1.0);
    leaf.castShadow = true; leaf.receiveShadow = true;
    g.add(leaf);
  }
  return g;
}

function smallPlant(parent, x, y, z, potColor, leafHue, scale = 1) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(scale); parent.add(g);
  cyl(g, 0.16, 0.12, 0.22, std(potColor), 0, 0.11, 0);
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05;
    const m = std(new THREE.Color().setHSL(leafHue + rnd(-0.02, 0.02), 0.45, rnd(0.32, 0.42)));
    sph(g, 0.1, m, Math.cos(a) * 0.1, 0.36 + (i % 3) * 0.06, Math.sin(a) * 0.1, [0.7, 1.5, 0.35]).rotation.set(Math.sin(a) * 0.5, a, Math.cos(a) * 0.5);
  }
  return g;
}

export function buildRoom(scene) {
  const room = new THREE.Group();
  scene.add(room);

  const M = {
    wall: std(0xf0dfa4), floorSlab: std(0xb99a62), trim: std(0x5a3d27), base: std(0x2a2621),
    desk: std(0xb08f5c), deskLeg: std(0xe8dcc0), sage: std(0x8fb8a8), sageDark: std(0x59635f),
    cream: std(0xf0dcb0), olive: std(0x8f8560), cabinet: std(0xdccfae), drawer: std(0xb8a780),
  };

  // ── base + floor ────────────────────────────────────────────────────────────
  box(room, 8.3, 0.3, 8.3, M.floorSlab, 0, -0.15, 0, { r: 0.05 });
  box(room, 8.05, 0.55, 8.05, M.base, 0, -0.55, 0, { r: 0.05, cast: false });
  const floorTex = floorTexture();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8.3, 8.3), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.75 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.003; floor.receiveShadow = true;
  room.add(floor);

  // reflective ground under the diorama, faded out with a radial dark overlay
  let reflector = null;
  try {
    reflector = new Reflector(new THREE.PlaneGeometry(60, 60), { color: 0x777268, textureWidth: 1024, textureHeight: 1024, clipBias: 0.003 });
    reflector.rotation.x = -Math.PI / 2; reflector.position.y = -0.83;
    room.add(reflector);
    const fade = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({
      map: canvasTex(256, 256, (g, w, h) => {
        const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        r.addColorStop(0, 'rgba(28,25,21,0.66)'); r.addColorStop(0.28, 'rgba(28,25,21,0.85)'); r.addColorStop(0.55, 'rgba(28,25,21,1)');
        g.fillStyle = r; g.fillRect(0, 0, w, h);
      }, { aniso: 1 }), transparent: true, depthWrite: false, toneMapped: false,
    }));
    fade.rotation.x = -Math.PI / 2; fade.position.y = -0.82; fade.renderOrder = 1;
    room.add(fade);
  } catch (e) { console.warn('reflector disabled', e); }

  // ── walls (window cut out of the left wall) ─────────────────────────────────
  const T = 0.3, H = 5, wr = 0.02;
  box(room, 8.3, H, T, M.wall, 0, H / 2, -4.0, { r: wr });
  const wy0 = 1.5, wy1 = 4.0, wz0 = -3.0, wz1 = 0.4, zc = (wz0 + wz1) / 2, yc = (wy0 + wy1) / 2;
  box(room, T, wy0, 8.3, M.wall, -4.0, wy0 / 2, 0, { r: wr });
  box(room, T, H - wy1, 8.3, M.wall, -4.0, wy1 + (H - wy1) / 2, 0, { r: wr });
  box(room, T, wy1 - wy0 + 0.2, wz0 + 4.15, M.wall, -4.0, yc, (-4.15 + wz0) / 2, { r: wr });
  box(room, T, wy1 - wy0 + 0.2, 4.15 - wz1, M.wall, -4.0, yc, (wz1 + 4.15) / 2, { r: wr });
  box(room, 0.44, 0.15, 8.6, M.trim, -4.0, H + 0.02, 0, { r: 0.03 });
  box(room, 8.6, 0.15, 0.44, M.trim, 0, H + 0.02, -4.0, { r: 0.03 });
  box(room, 0.09, H, 0.09, M.trim, -3.84, H / 2, -3.84, { r: 0.02, cast: false }); // corner trim

  // window frame + panes
  const fx = -3.99, fw = 0.12;
  const frame = (w, h, d, y, z) => box(room, 0.26, h, w, M.trim, fx, y, z, { r: 0.02 });
  frame(wz1 - wz0 + 0.2, fw, 0, wy1, zc); frame(wz1 - wz0 + 0.2, fw, 0, wy0, zc);
  box(room, 0.26, wy1 - wy0, fw, M.trim, fx, yc, wz0, { r: 0.02 }); box(room, 0.26, wy1 - wy0, fw, M.trim, fx, yc, wz1, { r: 0.02 });
  box(room, 0.24, 1.9, 0.09, M.trim, fx, 2.45, zc, { r: 0.015 });               // centre mullion
  box(room, 0.24, 0.09, wz1 - wz0, M.trim, fx, 2.5, zc, { r: 0.015 });          // mid rail
  box(room, 0.24, 0.09, wz1 - wz0, M.trim, fx, 3.4, zc, { r: 0.015 });          // transom rail
  for (let i = 1; i < 5; i++) box(room, 0.24, 0.6, 0.08, M.trim, fx, 3.7, wz0 + ((wz1 - wz0) / 5) * i, { r: 0.015 });
  box(room, 0.55, 0.1, wz1 - wz0 + 0.5, M.trim, -3.72, wy0 + 0.02, zc, { r: 0.03 }); // sill

  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.9), new THREE.MeshBasicMaterial({ map: backdropTexture(), toneMapped: false }));
  backdrop.material.color.setScalar(1.7);
  backdrop.rotation.y = Math.PI / 2; backdrop.position.set(-4.95, 2.5, -1.6);
  room.add(backdrop);

  // fake contact-shadow strips where walls meet the floor
  const ao = gradientTex([[0, 'rgba(40,28,10,0.42)'], [1, 'rgba(40,28,10,0)']]);
  const aoMat = new THREE.MeshBasicMaterial({ map: ao, transparent: true, depthWrite: false, toneMapped: false });
  const aoBack = new THREE.Mesh(new THREE.PlaneGeometry(7.7, 0.9), aoMat); aoBack.position.set(0.075, 0.45, -3.84); room.add(aoBack);
  const aoLeft = new THREE.Mesh(new THREE.PlaneGeometry(7.7, 0.9), aoMat); aoLeft.rotation.y = Math.PI / 2; aoLeft.position.set(-3.84, 0.45, 0.075); room.add(aoLeft);

  // ── bed, cat, rug ───────────────────────────────────────────────────────────
  box(room, 1.7, 0.02, 3.9, std(0xbcd9c6), -1.95, 0.011, -2.05, { r: 0.008, cast: false });
  box(room, 2.1, 0.55, 3.4, M.olive, -2.8, 0.275, -2.15, { r: 0.05 });
  box(room, 2.0, 0.42, 3.3, M.cream, -2.8, 0.76, -2.15, { r: 0.12 });
  box(room, 2.04, 0.1, 2.1, std(0xe6ca94), -2.8, 0.985, -1.25, { r: 0.05 });
  box(room, 1.35, 0.3, 0.72, std(0xf6e5bc), -2.8, 1.15, -3.42, { r: 0.13 });
  box(room, 2.1, 1.0, 0.12, M.olive, -2.8, 0.95, -3.78, { r: 0.03 });

  const cat = new THREE.Group(); cat.position.set(-2.7, 1.05, -1.75); cat.rotation.y = 0.35; room.add(cat);
  const fur = std(0x6a5142, { roughness: 0.95 });
  sph(cat, 0.32, fur, 0, 0.2, 0, [1, 0.72, 1.55]);
  sph(cat, 0.2, fur, 0, 0.36, 0.55);
  for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.16, 4), fur); ear.position.set(s * 0.11, 0.56, 0.55); ear.castShadow = true; cat.add(ear); }
  const tail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.1, 0.12, -0.5), new THREE.Vector3(0.4, 0.06, -0.55), new THREE.Vector3(0.55, 0.08, -0.15)]), 10, 0.055, 8), fur);
  tail.castShadow = true; cat.add(tail);

  // ── cabinet + monstera ──────────────────────────────────────────────────────
  box(room, 1.1, 1.3, 1.1, M.cabinet, -3.3, 0.65, 0.9, { r: 0.04 });
  for (let i = 0; i < 3; i++) {
    box(room, 0.03, 0.36, 0.95, M.drawer, -2.74, 0.28 + i * 0.4, 0.9, { r: 0.015 });
    box(room, 0.03, 0.04, 0.3, std(0x3a3128), -2.72, 0.36 + i * 0.4, 0.9, { r: 0.01 });
  }
  cyl(room, 0.36, 0.26, 0.52, std(0xb5643a), -3.3, 1.56, 0.9);
  cyl(room, 0.34, 0.34, 0.02, std(0x3a2c20), -3.3, 1.82, 0.9);
  monstera(room, -3.3, 1.82, 0.9, 1.3);

  // ── desk + chair ────────────────────────────────────────────────────────────
  box(room, 3.2, 0.14, 1.4, M.desk, 2.35, 1.43, -3.15, { r: 0.04 });
  box(room, 0.1, 1.38, 1.3, M.deskLeg, 0.85, 0.69, -3.15, { r: 0.03 });
  box(room, 0.1, 1.38, 1.3, M.deskLeg, 3.85, 0.69, -3.15, { r: 0.03 });
  box(room, 3.0, 0.5, 0.05, M.deskLeg, 2.35, 1.1, -3.75, { r: 0.02 });

  const chair = new THREE.Group(); chair.position.set(2.2, 0, -1.85); chair.rotation.y = 0.35; room.add(chair);
  box(chair, 0.95, 0.24, 0.9, M.sage, 0, 1.0, 0, { r: 0.11 });
  box(chair, 0.9, 0.85, 0.2, M.sage, 0, 1.6, 0.45, { r: 0.1, rx: -0.08 });
  cyl(chair, 0.06, 0.06, 0.62, M.sageDark, 0, 0.66, 0);
  for (let i = 0; i < 5; i++) {
    const arm = new THREE.Group(); arm.rotation.y = (i / 5) * 6.283; chair.add(arm);
    box(arm, 0.6, 0.06, 0.09, M.sageDark, 0.3, 0.2, 0, { r: 0.02 });
    sph(arm, 0.075, M.sageDark, 0.6, 0.075, 0);
  }

  // ── easel + canvas (the paintable thing) ────────────────────────────────────
  const tilt = 0.14, easel = new THREE.Group();
  easel.position.set(2.45, 2.45, -3.3); easel.rotation.x = -tilt; room.add(easel);
  const CW = 1.3, CH = 0.95;
  const board = box(easel, CW + 0.05, CH + 0.05, 0.06, std(0xe9e0c8), 0, 0, 0, { r: 0.01 });
  const canvasMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
  const canvasFace = new THREE.Mesh(new THREE.PlaneGeometry(CW, CH), canvasMat);
  canvasFace.position.z = 0.032; canvasFace.receiveShadow = true;
  easel.add(canvasFace);
  for (const s of [-1, 1]) box(easel, 0.05, 1.5, 0.05, M.trim, s * (CW / 2 + 0.08), -0.28, -0.02, { r: 0.015 });
  box(easel, CW + 0.3, 0.06, 0.16, M.trim, 0, -CH / 2 - 0.04, 0.05, { r: 0.02 });
  box(easel, 0.05, 1.5, 0.05, M.trim, 0, -0.05, -0.38, { r: 0.015, rx: 0.42 });
  const easelHit = [board, canvasFace];

  // desk supplies
  const palette = cyl(room, 0.3, 0.3, 0.03, std(0xd9bc8c), 1.5, 1.515, -2.85, { seg: 32 });
  palette.scale.z = 0.72; palette.rotation.y = 0.5;
  [0xd4552f, 0x3d5aa8, 0xd9a441, 0x5b8a4a, 0xf7f2e4].forEach((c, i) => {
    const a = 0.5 + i * 0.75;
    sph(room, 0.045, std(c, { roughness: 0.5 }), 1.5 + Math.cos(a) * 0.19, 1.54, -2.85 - Math.sin(a) * 0.12, [1, 0.5, 1], { cast: false });
  });
  cyl(room, 0.17, 0.15, 0.42, std(0xf0e6d0), 3.6, 1.71, -3.45);
  ['#c0503a', '#4f74b8', '#6e9a58', '#d9a441', '#3a2a24'].forEach((c, i) => {
    const b = cyl(room, 0.012, 0.012, 0.6, std(0x8a6a44), 3.6 + (i - 2) * 0.05, 2.0, -3.45 + ((i * 7) % 3 - 1) * 0.04, { seg: 6 });
    b.rotation.set(((i * 5) % 3 - 1) * 0.12, 0, (i - 2) * 0.12);
    const tip = sph(room, 0.02, std(c), 0, 0.31, 0, [1, 1.7, 1], { cast: false }); b.add(tip);
  });
  cyl(room, 0.14, 0.12, 0.25, std(0x5ba6c9), 3.55, 1.63, -2.8);
  box(room, 0.05, 0.16, 0.06, std(0x5ba6c9), 3.72, 1.63, -2.8, { r: 0.02 });
  for (let i = 0; i < 3; i++) box(room, 0.32, 0.09, 0.09, std([0xd4552f, 0x3d5aa8, 0x5b8a4a][i]), 1.05 + i * 0.03, 1.52 + i * 0.09, -3.55 + i * 0.02, { r: 0.03, ry: 0.15 * i });

  // ── shelves + props ─────────────────────────────────────────────────────────
  box(room, 3.15, 0.1, 0.5, M.desk, 2.4, 3.45, -3.6, { r: 0.03 });
  box(room, 3.15, 0.1, 0.5, M.desk, 2.4, 4.2, -3.6, { r: 0.03 });
  const bookCols = [0x8fb8a8, 0xd9805f, 0xf0e3c4, 0x4a6488, 0xc9a24a, 0x6b8f5a, 0xb85c5c];
  bookCols.forEach((c, i) => {
    const bh = rnd(0.5, 0.72);
    box(room, rnd(0.11, 0.18), bh, 0.4, std(c), 0.98 + i * 0.16, 3.5 + bh / 2, -3.58, { r: 0.015, rz: i === 6 ? -0.22 : 0 });
  });
  cyl(room, 0.12, 0.1, 0.22, std(0xd9805f), 2.35, 3.61, -3.6);
  smallPlant(room, 3.2, 3.5, -3.6, 0xf0e6d0, 0.3, 1);
  box(room, 0.6, 0.72, 0.05, std(0x5a3d27), 1.35, 4.61, -3.78, { r: 0.015 });
  box(room, 0.5, 0.62, 0.02, std(0xdbe6d6), 1.35, 4.61, -3.75, { r: 0.005, cast: false });
  cyl(room, 0.13, 0.08, 0.28, std(0xd8b24a, { metalness: 0.6, roughness: 0.35 }), 2.15, 4.39, -3.6);
  cyl(room, 0.09, 0.09, 0.05, std(0xd8b24a, { metalness: 0.6, roughness: 0.35 }), 2.15, 4.27, -3.6);
  smallPlant(room, 3.05, 4.25, -3.6, 0xd9805f, 0.27, 0.9);
  box(room, 0.55, 0.04, 0.35, std(0x2c3550), 2.7, 4.27, -3.62, { r: 0.01, ry: 0.4, rz: 0.15 }); // grad cap-ish

  // ── wall collage: 8 slots that fill up with saved paintings ─────────────────
  const slotDefs = [
    [-3.3, 3.95, 0.95, 0.72, 0.02], [-2.2, 3.9, 0.7, 0.9, -0.015], [-1.35, 3.95, 0.9, 0.7, 0.01], [-0.45, 3.88, 0.7, 0.86, -0.02],
    [-3.25, 2.9, 0.72, 0.94, -0.01], [-2.35, 2.95, 0.95, 0.74, 0.015], [-1.42, 2.9, 0.7, 0.9, -0.02], [-0.5, 2.96, 0.9, 0.7, 0.01],
  ];
  const pastel = [0xa9c9b4, 0xd9b8a0, 0xa9b9d6, 0xd8c48c, 0xd2aeb8, 0xb6cf9c, 0xb9aedb, 0xe0c38a];
  const frames = slotDefs.map(([x, y, w, h, rot], i) => {
    const g = new THREE.Group(); g.position.set(x, y, -3.83); g.rotation.z = rot; room.add(g);
    box(g, w + 0.15, h + 0.15, 0.05, std(0xe6d9b8), 0, 0, 0, { r: 0.008 });
    const art = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color: pastel[i], roughness: 0.9 }));
    art.position.z = 0.022; art.receiveShadow = true; g.add(art);
    return { group: g, art, w, h, filled: false, popT: -1 };
  });
  let nextSlot = 0;
  function hang(canvas) {
    const slot = frames.find((f) => !f.filled) || frames[nextSlot++ % frames.length];
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    // cover-crop the painting into the frame's aspect
    const fa = slot.w / slot.h, ta = canvas.width / canvas.height;
    if (ta > fa) { tex.repeat.set(fa / ta, 1); tex.offset.set((1 - fa / ta) / 2, 0); }
    else { tex.repeat.set(1, ta / fa); tex.offset.set(0, (1 - ta / fa) / 2); }
    slot.art.material.map = tex; slot.art.material.color.set(0xffffff); slot.art.material.needsUpdate = true;
    slot.filled = true;
    return slot;
  }

  // ── string lights: over the window, then across the back wall ───────────────
  const path = new THREE.CatmullRomCurve3([
    [-3.72, 4.78, 3.6], [-3.72, 4.45, 2.4], [-3.72, 4.74, 1.1], [-3.72, 4.42, -0.2], [-3.72, 4.72, -1.4], [-3.72, 4.42, -2.6], [-3.72, 4.7, -3.72],
    [-3.0, 4.52, -3.72], [-2.1, 4.78, -3.72], [-1.2, 4.44, -3.72], [-0.3, 4.76, -3.72], [0.5, 4.5, -3.72],
  ].map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.3);
  const wire = new THREE.Mesh(new THREE.TubeGeometry(path, 160, 0.012, 5), std(0x3a2c20));
  room.add(wire);
  const bulbMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  bulbMat.color.setRGB(1, 0.86, 0.5).multiplyScalar(4.2);
  const bulbs = 26;
  const glowLights = [];
  for (let i = 0; i < bulbs; i++) {
    const p = path.getPointAt((i + 0.5) / bulbs);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), bulbMat);
    b.position.copy(p).add(new THREE.Vector3(0, -0.07, 0)); room.add(b);
    if (i % 5 === 2) {
      const l = new THREE.PointLight(0xffd58a, 1.1, 5, 2); l.position.copy(b.position).add(new THREE.Vector3(0.25, -0.1, 0.25)); room.add(l); glowLights.push(l);
    }
  }

  // ── lighting ────────────────────────────────────────────────────────────────
  const hemi = new THREE.HemisphereLight(0xfff1c4, 0x6a5a3c, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe2a6, 3.6);
  sun.position.set(-9, 7.2, -0.8); sun.target.position.set(0, 0.5, -1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 26 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 5; sun.shadow.blurSamples = 16;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xbfd0ff, 0.25); fill.position.set(8, 6, 8); scene.add(fill);

  // little pool of cool moonlight-ish bounce so the shadow side isn't mud
  return { room, easel, canvasFace, canvasMat, easelHit, CW, CH, frames, hang, sun, hemi, fill, glowLights, reflector };
}
