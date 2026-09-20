import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

// A desk-corner diorama modelled on the two photos in room-refs/ (same desk, day + night).
// Units: 1 ≈ 0.5m. Interior is x∈[-3.85, 4], z∈[-3.85, 4]. The camera looks in from +x/+z.
//   back wall (z=-4):  wall collage on the left, sliding window on the right, dark desk running under both
//   left wall (x=-4):  plain, with a sticky note and handwritten sheets (as at the left of the night photo)
// NOT visible in the photos, so kept neutral on purpose: floor, chair, the other walls, ceiling, room size.

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
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
function plane(parent, w, h, mat, x, y, z, { ry = 0, rz = 0 } = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z); m.rotation.set(0, ry, rz); m.receiveShadow = true;
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

// floor: a neutral placeholder (the real floor isn't visible in any photo)
const floorTexture = () => canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#cdbfa6'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(${rnd(110, 150) | 0},${rnd(95, 130) | 0},${rnd(70, 105) | 0},${rnd(0.03, 0.09)})`; g.fillRect(rnd(0, w), rnd(0, h), rnd(1, 3), rnd(1, 3)); }
});

// what the window looks at: evergreens, a lawn, a glass tower and a brick building (drawn tiny; GPU filtering blurs it)
const backdropTexture = () => canvasTex(320, 192, (g, w, h) => {
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#cfe4f0'); sky.addColorStop(0.6, '#eaf3ef'); sky.addColorStop(1, '#f6f3dc');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  g.fillStyle = '#8fa9bd'; g.fillRect(w * 0.8, 0, w * 0.14, h * 0.62);           // glass tower
  g.fillStyle = 'rgba(255,255,255,.35)'; for (let y = 4; y < h * 0.6; y += 9) g.fillRect(w * 0.8, y, w * 0.14, 2);
  g.fillStyle = '#a5563f'; g.fillRect(w * 0.66, h * 0.52, w * 0.3, h * 0.22);    // brick building
  g.fillStyle = '#9fc46a'; g.fillRect(0, h * 0.72, w, h * 0.3);                  // lawn
  for (let i = 0; i < 10; i++) {                                                  // evergreens
    const x = rnd(0.02, 0.78) * w, base = h * rnd(0.74, 0.96), th = h * rnd(0.5, 0.85), tw = th * 0.42;
    g.fillStyle = '#4a3527'; g.fillRect(x - 1, base, 2, h * 0.05);
    for (let k = 0; k < 5; k++) {
      const y0 = base - th + (th / 5) * k, ww = tw * (0.35 + (0.65 * (k + 1)) / 5);
      g.fillStyle = `hsl(${rnd(118, 140)},${rnd(30, 42)}%,${rnd(20, 30)}%)`;
      g.beginPath(); g.moveTo(x, y0 - (th / 5) * 0.2); g.lineTo(x - ww / 2, y0 + (th / 5) * 1.1); g.lineTo(x + ww / 2, y0 + (th / 5) * 1.1); g.closePath(); g.fill();
    }
  }
}, { aniso: 1 });

// stand-in for one of my landscape prints on the collage wall, until a real painting takes the slot
const landscapeTex = () => canvasTex(96, 72, (g, w, h) => {
  const mode = pick(['hills', 'sea', 'sunset', 'road']);
  const sky = g.createLinearGradient(0, 0, 0, h);
  if (mode === 'sunset') { sky.addColorStop(0, '#6d7fb8'); sky.addColorStop(0.7, '#f2b69a'); sky.addColorStop(1, '#f6d9a0'); }
  else { sky.addColorStop(0, pick(['#5f9fd6', '#7db2dc', '#8ab8c9'])); sky.addColorStop(1, '#e8f0e2'); }
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  if (mode === 'sea') { g.fillStyle = pick(['#4c86b8', '#5b9ab5']); g.fillRect(0, h * 0.55, w, h * 0.45); g.fillStyle = '#e8d8a8'; g.fillRect(0, h * 0.85, w, h * 0.15); return; }
  for (let i = 0; i < 2; i++) {
    g.fillStyle = i ? pick(['#5f8f3c', '#6aa04a']) : pick(['#8fb562', '#a6b86a']);
    g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) g.lineTo(x, h * (0.5 + 0.1 * i) - Math.sin(x * 0.06 + i * 2 + Math.random()) * h * 0.1);
    g.lineTo(w, h); g.fill();
  }
  if (mode === 'road') { g.fillStyle = '#6a6470'; g.beginPath(); g.moveTo(w * 0.42, h); g.lineTo(w * 0.58, h); g.lineTo(w * 0.52, h * 0.55); g.lineTo(w * 0.48, h * 0.55); g.fill(); }
  else { g.fillStyle = 'rgba(240,210,80,.85)'; for (let i = 0; i < 26; i++) g.fillRect(rnd(0, w), rnd(h * 0.7, h), 2, 2); }
});

const paperTex = () => canvasTex(128, 176, (g, w, h) => {
  g.fillStyle = '#f7f3ea'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(70,60,50,.55)'; g.lineWidth = 1;
  for (let y = 14; y < h - 6; y += 9) { g.beginPath(); g.moveTo(10, y); g.lineTo(10 + rnd(40, w - 20), y + rnd(-1, 1)); g.stroke(); }
}, { aniso: 4 });

const keyboardTex = () => canvasTex(256, 96, (g, w, h) => {
  g.fillStyle = '#f2b8cb'; g.fillRect(0, 0, w, h);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 15; c++) { g.fillStyle = r === 4 && c > 3 && c < 10 ? '#fbe1ea' : '#fbd2df'; g.fillRect(6 + c * 16.3, 8 + r * 16.5, 14, 14); }
}, { aniso: 4 });

const gradientTex = (stops) => canvasTex(4, 128, (g, w, h) => {
  const gr = g.createLinearGradient(0, h, 0, 0);
  stops.forEach(([o, c]) => gr.addColorStop(o, c));
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}, { aniso: 1 });

export function buildRoom(scene) {
  const room = new THREE.Group();
  scene.add(room);

  const M = {
    wall: std(0xf1e6cb), floorSlab: std(0xb9ab92), crown: std(0x5a3d27), base: std(0x2a2621),
    desk: std(0x3e2c26), deskSide: std(0x33241f), white: std(0xf6f2ea), ink: std(0x2b2b2e), lapGrey: std(0x38383c),
    chair: std(0x4a4a4e), chairDark: std(0x2f2f33), mint: std(0x9fd4b0), pink: std(0xf3b0c4), cream: std(0xf3e8d0),
  };

  // ── base + floor ────────────────────────────────────────────────────────────
  box(room, 8.3, 0.3, 8.3, M.floorSlab, 0, -0.15, 0, { r: 0.05 });
  box(room, 8.05, 0.55, 8.05, M.base, 0, -0.55, 0, { r: 0.05, cast: false });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8.3, 8.3), new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.9 }));
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

  // ── walls: back wall has the window cut out; left wall is plain ─────────────
  const T = 0.3, H = 5, wr = 0.02;
  const wx0 = 0.85, wx1 = 3.75, wy0 = 1.95, wy1 = 4.15, xc = (wx0 + wx1) / 2, yc = (wy0 + wy1) / 2;
  box(room, 8.3, wy0, T, M.wall, 0, wy0 / 2, -4.0, { r: wr });
  box(room, 8.3, H - wy1, T, M.wall, 0, wy1 + (H - wy1) / 2, -4.0, { r: wr });
  box(room, wx0 + 4.15, wy1 - wy0, T, M.wall, (-4.15 + wx0) / 2, yc, -4.0, { r: wr });
  box(room, 4.15 - wx1, wy1 - wy0, T, M.wall, (wx1 + 4.15) / 2, yc, -4.0, { r: wr });
  box(room, T, H, 8.3, M.wall, -4.0, H / 2, 0, { r: wr });
  box(room, 0.44, 0.15, 8.6, M.crown, -4.0, H + 0.02, 0, { r: 0.03 });
  box(room, 8.6, 0.15, 0.44, M.crown, 0, H + 0.02, -4.0, { r: 0.03 });
  box(room, 0.09, H, 0.09, M.crown, -3.84, H / 2, -3.84, { r: 0.02, cast: false }); // corner trim

  // window: white frame, sliding centre mullion, sill
  const fz = -3.99;
  box(room, wx1 - wx0 + 0.2, 0.13, 0.26, M.white, xc, wy1, fz, { r: 0.02 });
  box(room, wx1 - wx0 + 0.2, 0.13, 0.26, M.white, xc, wy0, fz, { r: 0.02 });
  box(room, 0.13, wy1 - wy0, 0.26, M.white, wx0, yc, fz, { r: 0.02 });
  box(room, 0.13, wy1 - wy0, 0.26, M.white, wx1, yc, fz, { r: 0.02 });
  box(room, 0.1, wy1 - wy0, 0.24, M.white, xc, yc, fz, { r: 0.015 });
  box(room, wx1 - wx0 + 0.5, 0.1, 0.55, M.white, xc, wy0 + 0.02, -3.72, { r: 0.03 });

  // sized to fill the window from the camera's angle and no wider, or it pokes out past the open side of the diorama
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(3.55, 3.0), new THREE.MeshBasicMaterial({ map: backdropTexture(), toneMapped: false }));
  backdrop.material.color.setScalar(1.15);
  backdrop.position.set(1.775, 2.7, -4.9);
  room.add(backdrop);

  // fake contact-shadow strips where walls meet the floor
  const ao = gradientTex([[0, 'rgba(40,28,10,0.42)'], [1, 'rgba(40,28,10,0)']]);
  const aoMat = new THREE.MeshBasicMaterial({ map: ao, transparent: true, depthWrite: false, toneMapped: false });
  const aoBack = new THREE.Mesh(new THREE.PlaneGeometry(7.7, 0.9), aoMat); aoBack.position.set(0.075, 0.45, -3.84); room.add(aoBack);
  const aoLeft = new THREE.Mesh(new THREE.PlaneGeometry(7.7, 0.9), aoMat); aoLeft.rotation.y = Math.PI / 2; aoLeft.position.set(-3.84, 0.45, 0.075); room.add(aoLeft);

  // ── desk: dark espresso, along the whole back wall ──────────────────────────
  const TOP = 1.5;
  box(room, 7.7, 0.12, 1.5, M.desk, 0, TOP - 0.06, -3.15, { r: 0.03 });
  box(room, 0.1, TOP - 0.12, 1.4, M.deskSide, -3.75, (TOP - 0.12) / 2, -3.15, { r: 0.02 });
  box(room, 0.1, TOP - 0.12, 1.4, M.deskSide, 3.75, (TOP - 0.12) / 2, -3.15, { r: 0.02 });
  box(room, 7.4, 0.5, 0.05, M.deskSide, 0, 1.1, -3.82, { r: 0.02 });

  // chair: neutral placeholder (not visible in the photos)
  const chair = new THREE.Group(); chair.position.set(-1.0, 0, -1.7); chair.rotation.y = 0.3; room.add(chair);
  box(chair, 0.95, 0.24, 0.9, M.chair, 0, 1.0, 0, { r: 0.11 });
  box(chair, 0.9, 0.85, 0.2, M.chair, 0, 1.6, 0.45, { r: 0.1, rx: -0.08 });
  cyl(chair, 0.06, 0.06, 0.62, M.chairDark, 0, 0.66, 0);
  for (let i = 0; i < 5; i++) {
    const arm = new THREE.Group(); arm.rotation.y = (i / 5) * 6.283; chair.add(arm);
    box(arm, 0.6, 0.06, 0.09, M.chairDark, 0.3, 0.2, 0, { r: 0.02 });
    sph(arm, 0.075, M.chairDark, 0.6, 0.075, 0);
  }

  // ── desk things (from the photos) ───────────────────────────────────────────
  // laptop on a riser, screen glowing
  box(room, 1.0, 0.05, 0.6, M.ink, -2.75, TOP + 0.12, -3.2, { r: 0.02, rx: -0.14 });
  box(room, 1.25, 0.04, 0.85, M.lapGrey, -2.75, TOP + 0.24, -3.2, { r: 0.02, rx: -0.14 });
  const lapScreen = box(room, 1.25, 0.78, 0.03, M.lapGrey, -2.75, TOP + 0.66, -3.62, { r: 0.02, rx: -0.2 });
  plane(lapScreen, 1.12, 0.66, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xdde6f4, emissiveIntensity: 0.55, roughness: 0.6 }), 0, 0, 0.02);
  // pink-keycap keyboard with underglow, and the white vertical mouse
  box(room, 1.2, 0.03, 0.44, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.6, 1.2), toneMapped: false }), -1.5, TOP + 0.02, -2.72, { cast: false, ry: 0.08 });
  box(room, 1.15, 0.08, 0.4, M.white, -1.5, TOP + 0.07, -2.72, { r: 0.03, ry: 0.08 });
  plane(room, 1.02, 0.34, new THREE.MeshStandardMaterial({ map: keyboardTex(), roughness: 0.55 }), -1.5, TOP + 0.113, -2.72).rotation.set(-Math.PI / 2, 0, -0.08);
  box(room, 0.14, 0.2, 0.2, M.white, -0.8, TOP + 0.1, -2.66, { r: 0.06, rz: 0.22 });   // (beside the keyboard, clear of the table area the paints use)
  // open notebook with a yellow sticky note, a pink Bible and a dark green book leaning on the wall
  box(room, 1.05, 0.05, 0.55, M.cream, -3.05, TOP + 0.025, -2.55, { r: 0.015, ry: -0.12 });
  box(room, 0.02, 0.055, 0.55, std(0xc9bfa8), -3.05, TOP + 0.03, -2.55, { r: 0.005, ry: -0.12 });
  box(room, 0.24, 0.012, 0.24, std(0xf5e27a), -2.75, TOP + 0.062, -2.52, { r: 0.004, ry: 0.3, cast: false });
  box(room, 0.5, 0.75, 0.22, std(0xe8a9b6), -0.95, TOP + 0.375, -3.66, { r: 0.03, rz: 0.03 });
  box(room, 0.45, 0.7, 0.2, std(0x2f4a3a), -1.36, TOP + 0.35, -3.66, { r: 0.03, rz: -0.03 });

  // the paintable thing: a tabletop easel between the collage and the window
  const tilt = 0.14, easel = new THREE.Group();
  easel.position.set(-0.05, 2.45, -3.3); easel.rotation.x = -tilt; room.add(easel);
  const CW = 1.3, CH = 0.95;
  const board = box(easel, CW + 0.05, CH + 0.05, 0.06, std(0xe9e0c8), 0, 0, 0, { r: 0.01 });
  const canvasMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
  const canvasFace = new THREE.Mesh(new THREE.PlaneGeometry(CW, CH), canvasMat);
  canvasFace.position.z = 0.032; canvasFace.receiveShadow = true;
  easel.add(canvasFace);
  for (const s of [-1, 1]) box(easel, 0.05, 1.5, 0.05, M.crown, s * (CW / 2 + 0.08), -0.28, -0.02, { r: 0.015 });
  box(easel, CW + 0.3, 0.06, 0.16, M.crown, 0, -CH / 2 - 0.04, 0.05, { r: 0.02 });
  box(easel, 0.05, 1.5, 0.05, M.crown, 0, -0.05, -0.38, { r: 0.015, rx: 0.42 });
  const easelHit = [board, canvasFace];

  // paint palette
  const palette = cyl(room, 0.3, 0.3, 0.03, std(0xd9bc8c), 0.95, TOP + 0.015, -2.85, { seg: 32 });
  palette.scale.z = 0.72; palette.rotation.y = 0.5;
  const oldPalette = [palette];   // returned so the interactive mixing tray (src/tray3d.js) can take its place
  [0xd4552f, 0x3d5aa8, 0xd9a441, 0x5b8a4a, 0xf7f2e4].forEach((c, i) => {
    const a = 0.5 + i * 0.75;
    oldPalette.push(sph(room, 0.045, std(c, { roughness: 0.5 }), 0.95 + Math.cos(a) * 0.19, TOP + 0.05, -2.85 - Math.sin(a) * 0.12, [1, 0.5, 1], { cast: false }));
  });

  // pen cup with pastel pens, a pink beaded flower and a yellow plush
  cyl(room, 0.17, 0.15, 0.4, std(0xf3ead8), 1.45, TOP + 0.2, -3.45);
  ['#f6a5b8', '#a8d8c4', '#f8d98a', '#a9c4f0', '#d6b8f0', '#f7b68f', '#9fd9d0', '#f2a0a0'].forEach((c, i) => {
    const p = cyl(room, 0.014, 0.014, 0.62, std(0xf0f0f0), 1.45 + (i - 3.5) * 0.028, TOP + 0.6, -3.45 + ((i * 7) % 3 - 1) * 0.04, { seg: 6 });
    p.rotation.set(((i * 5) % 3 - 1) * 0.1, 0, (i - 3.5) * 0.09);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.22, 6), std(c));
    tip.position.set(0, 0.2, 0); p.add(tip);
  });
  cyl(room, 0.008, 0.008, 0.5, std(0x5b8a4a), 1.7, TOP + 0.75, -3.4, { seg: 5 });
  for (let i = 0; i < 6; i++) sph(room, 0.045, std(0xf07a9a), 1.7 + Math.cos(i * 1.05) * 0.06, TOP + 1.0 + Math.sin(i * 1.05) * 0.06, -3.4, [1, 1, 1], { cast: false });
  sph(room, 0.2, std(0xf6d54a, { roughness: 0.95 }), 1.95, TOP + 0.2, -3.45);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.07, 6), std(0xf0902a)); beak.position.set(2.02, TOP + 0.2, -3.27); beak.rotation.x = Math.PI / 2; room.add(beak);

  // mint crate with sticky notes and stationery
  box(room, 0.95, 0.42, 0.6, M.mint, 2.55, TOP + 0.21, -3.4, { r: 0.04 });
  box(room, 0.85, 0.02, 0.5, std(0x7fb896), 2.55, TOP + 0.43, -3.4, { r: 0.005, cast: false });
  [0xf5e27a, 0xf6a5b8, 0xa9c4f0].forEach((c, i) => box(room, 0.28, 0.14 + i * 0.03, 0.05, std(c), 2.35 + i * 0.24, TOP + 0.5, -3.42 + i * 0.02, { r: 0.008, rz: (i - 1) * 0.12 }));
  // small jars, a pink tumbler, a blue lighthouse mug, a watch
  cyl(room, 0.12, 0.12, 0.16, std(0xf0a8b8), 3.15, TOP + 0.08, -3.6); cyl(room, 0.125, 0.125, 0.05, M.white, 3.15, TOP + 0.185, -3.6);
  cyl(room, 0.14, 0.14, 0.16, std(0x8fcf9a), 3.42, TOP + 0.08, -3.55); cyl(room, 0.145, 0.145, 0.05, M.white, 3.42, TOP + 0.185, -3.55);
  cyl(room, 0.14, 0.12, 0.6, std(0xf4b8c8, { roughness: 0.4 }), 3.68, TOP + 0.3, -3.3);
  cyl(room, 0.16, 0.14, 0.3, std(0x4fa3d9, { roughness: 0.45 }), 3.4, TOP + 0.15, -2.75);
  box(room, 0.05, 0.16, 0.06, std(0x4fa3d9), 3.58, TOP + 0.16, -2.75, { r: 0.02 });
  cyl(room, 0.025, 0.035, 0.12, M.white, 3.4, TOP + 0.17, -2.6); cyl(room, 0.03, 0.03, 0.03, std(0xd9483b), 3.4, TOP + 0.25, -2.6);
  box(room, 0.2, 0.05, 0.2, M.ink, 2.7, TOP + 0.03, -2.6, { r: 0.03, ry: 0.4 });
  box(room, 0.32, 0.03, 0.09, std(0x2f4a80), 2.7, TOP + 0.03, -2.6, { r: 0.015, ry: 0.4 });
  // windowsill: a small yellow plush and a couple of figurines
  sph(room, 0.16, std(0xf6d54a, { roughness: 0.95 }), 3.35, wy0 + 0.23, -3.72);
  sph(room, 0.07, std(0xf4a0c0), 2.2, wy0 + 0.13, -3.72); sph(room, 0.07, std(0xa8d8c4), 2.5, wy0 + 0.13, -3.72);

  // ── wall collage: painting slots among photobooth strips and prints ─────────
  // 8 painting slots (they fill with saved paintings); strips/polaroids are abstract colour blocks, not real faces.
  const cols = [-3.3, -2.6, -1.9, -1.2], rows = [4.2, 3.55, 2.9, 2.25];
  const pastel = [0xf6c6d0, 0xc9dcf0, 0xf3e3b0, 0xcfe6d2, 0xe6d0f0, 0xf7d3b8];
  const frames = [];
  rows.forEach((y, r) => cols.forEach((x, c) => {
    const px = x + rnd(-0.04, 0.04), py = y + rnd(-0.04, 0.04), rot = rnd(-0.035, 0.035);
    const g = new THREE.Group(); g.position.set(px, py, -3.83); g.rotation.z = rot; room.add(g);
    if ((r + c) % 2 === 0) { // painting slot
      const w = rnd(0.5, 0.6), h = rnd(0.4, 0.5);
      box(g, w + 0.1, h + 0.1, 0.03, std(0xf7f2e6), 0, 0, 0, { r: 0.006 });
      const art = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: landscapeTex(), roughness: 0.9 }));
      art.position.z = 0.017; art.receiveShadow = true; g.add(art);
      frames.push({ group: g, art, w, h, filled: false, popT: -1 });
    } else if (c % 2 === 1) { // photobooth strip: four colour blocks
      box(g, 0.2, 0.62, 0.02, M.white, 0, 0, 0, { r: 0.004 });
      for (let k = 0; k < 4; k++) plane(g, 0.15, 0.12, new THREE.MeshStandardMaterial({ color: pick(pastel), roughness: 0.9 }), 0, 0.22 - k * 0.145, 0.0115);
    } else {                   // polaroid
      box(g, 0.34, 0.4, 0.02, M.white, 0, 0, 0, { r: 0.004 });
      plane(g, 0.28, 0.28, new THREE.MeshStandardMaterial({ color: pick(pastel), roughness: 0.9 }), 0, 0.03, 0.0115);
    }
  }));
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

  // sticky note + handwritten sheets on the plain left wall
  plane(room, 0.5, 0.5, new THREE.MeshStandardMaterial({ color: 0xf1ec7a, roughness: 0.9 }), -3.84, 3.35, -2.9, { ry: Math.PI / 2 });
  plane(room, 0.55, 0.75, new THREE.MeshStandardMaterial({ map: paperTex(), roughness: 0.9 }), -3.84, 3.0, -2.15, { ry: Math.PI / 2 });
  plane(room, 0.5, 0.68, new THREE.MeshStandardMaterial({ map: paperTex(), roughness: 0.9 }), -3.84, 2.7, -1.5, { ry: Math.PI / 2 });

  // ── string lights: round the window frame ───────────────────────────────────
  const path = new THREE.CatmullRomCurve3([
    [wx0 - 0.4, 4.3], [wx0 + 0.3, 4.58], [xc - 0.5, 4.34], [xc + 0.5, 4.6], [wx1 - 0.3, 4.4], [wx1 + 0.28, 4.3],
    [wx1 + 0.34, 3.6], [wx1 + 0.28, 2.85], [wx1 + 0.33, 2.15],
  ].map(([x, y]) => new THREE.Vector3(x, y, -3.72)), false, 'catmullrom', 0.3);
  const wire = new THREE.Mesh(new THREE.TubeGeometry(path, 160, 0.012, 5), std(0x3a2c20));
  room.add(wire);
  const bulbMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  bulbMat.color.setRGB(1, 0.86, 0.5).multiplyScalar(4.2);
  const bulbs = 22;
  const glowLights = [];
  for (let i = 0; i < bulbs; i++) {
    const p = path.getPointAt((i + 0.5) / bulbs);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), bulbMat);
    b.position.copy(p).add(new THREE.Vector3(0, -0.07, 0.05)); room.add(b);
    if (i % 5 === 2) {
      const l = new THREE.PointLight(0xffd58a, 1.1, 5, 2); l.position.copy(b.position).add(new THREE.Vector3(0, -0.1, 0.4)); room.add(l); glowLights.push(l);
    }
  }

  // ── lighting: daylight comes through the window in the back wall ────────────
  const hemi = new THREE.HemisphereLight(0xfff1c4, 0x6a5a3c, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe6b0, 3.6);
  sun.position.set(5, 7, -11); sun.target.position.set(0, 0.5, -1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 30 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 5; sun.shadow.blurSamples = 16;
  scene.add(sun, sun.target);
  // the window is behind everything, so light the camera-facing sides with a warm frontal fill
  const fill = new THREE.DirectionalLight(0xfff0d8, 0.85); fill.position.set(7, 6, 9); scene.add(fill);

  return { room, easel, canvasFace, canvasMat, easelHit, CW, CH, frames, hang, sun, hemi, fill, glowLights, reflector, oldPalette };
}
