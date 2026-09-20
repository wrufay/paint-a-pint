// 3D props for the desk: the nine paint tubes (labelled like the real ones), long-handled brushes standing in a jar of
// water, and a clean glass. Built from plain Three.js geometry and canvas label textures, so nothing is loaded from files.
// Scale: 1 unit is about 26 cm (the laptop is 1.25 wide), and the tubes are drawn a little short and fat so they read from far away.
import * as THREE from 'three';
import { PAINTS, PALETTES } from './brush/paints.js';

const DESK_TOP = 1.5;   // desk surface height in room.js

// Where everything sits on the desk for the bird's-eye view (x, z in room units). The canvas lies flat in the middle, the tray
// of paint to mix on is in front of it, the tubes are to its left and the water jar to its right. main.js and tray3d.js read this.
export const TABLE = {
  canvas: { x: 0.45, z: -3.35 },
  tray: { x: 0.45, z: -2.63 },
  tubes: { x: -0.49, z: -2.53, dx: 0.118, dz: 0.42 },     // x is the middle column; z is the front end of the front row
  jar: { x: 1.06, z: -2.74 },
  glass: { x: 0.9, z: -2.47 },
  view: { x: 0.35, z: -3.15, width: 2.9, height: 1.65 },  // what the overhead camera has to fit
};

// The names as printed on the tubes and swatch cards (paints/), in the order they appear there.
const NAMES = {
  'naphthol-red': ['Naphthol red medium', 'Naftolrood middel', 'Rouge naphtol moyen', 'Naphtholrot mittel', 'Rojo naftol medio', 'Rosso medio naftolo'],
  'azo-yellow': ['Azo yellow medium', 'Azogeel middel', 'Jaune azo moyen', 'Azogelb mittel', 'Amarillo azo medio', 'Giallo medio azo'],
  'naples-yellow': ['Naples yellow light', 'Napelsgeel licht', 'Jaune de naples clair', 'Neapelgelb hell', 'Amarillo nápoles claro', 'Giallo di napoli chiaro'],
  'kings-blue': ["King's blue", 'Koningsblauw', 'Bleu royal', 'Königsblau', 'Azul real', 'Blu reale'],
  'burnt-sienna': ['Burnt sienna', 'Sienna gebrand', 'Terre de sienne brûlée', 'Siena gebrannt', 'Tierra de siena tostada', 'Terra di siena bruciata'],
  'permanent-magenta': ['Permanent Magenta', 'Magenta Permanent', 'Magenta Permanente', 'Permanentmagenta'],
  'prussian-blue-hue': ['Prussian Blue Hue', 'Nuance de bleu de Prusse', 'Tono azul de Prusia', 'Blu di Prussia imitazione', 'Preussischblau Farbton'],
  'lemon-yellow': ['Lemon Yellow', 'Jaune citron', 'Amarillo limón', 'Giallo limone', 'Zitronengelb'],
  'titanium-white': ['Titanium White', 'Blanc de titane', 'Blanco de titanio', 'Bianco di titanio', 'Titanweiss'],
};
const LIGHTFAST = { 'naphthol-red': '++', 'azo-yellow': '++', 'naples-yellow': '+++', 'kings-blue': '+++', 'burnt-sienna': '+++' };   // the +/++/+++ on the Amsterdam cards

const SANS = '"DM Sans", system-ui, sans-serif';
// mix a colour towards white: 0 = the colour, 1 = white
const lighten = (hex, t) => { const n = parseInt(hex.slice(1), 16); const m = (v) => Math.round(v + (255 - v) * t); return `rgb(${m((n >> 16) & 255)},${m((n >> 8) & 255)},${m(n & 255)})`; };
const luminance = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };

// ── the label, drawn as if the tube stood upright with its cap at the top ─────────────────────────────────────────
function labelTexture(paint) {
  const W = 1024, H = 832, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#f3f2ee'; g.fillRect(0, 0, W, H);                       // the white tube
  const grad = g.createLinearGradient(0, 0, W, 0);                       // a faint sheen down the sides
  grad.addColorStop(0, 'rgba(0,0,0,.05)'); grad.addColorStop(.5, 'rgba(255,255,255,0)'); grad.addColorStop(1, 'rgba(0,0,0,.05)');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  const names = NAMES[paint.id] || [paint.name];
  const cx = W / 2, lw = 480, x0 = cx - lw / 2;
  g.textBaseline = 'alphabetic';

  if (paint.brand === 'Amsterdam') {
    // The real Standard Series tube, crimp at the top: a red seal with a hang hole, a red band with the name and the "all
    // acrylics" mark, a pale "Standard Series" band, then the tube in the paint's own colour with a black "ACRYLIC" block, and
    // near the cap a lighter panel with the names in six languages, the number, the transparency square, the +++ and a barcode.
    const body = lighten(paint.hex, 0.06), pale = lighten(paint.hex, 0.86), panel = lighten(paint.hex, 0.62), RED = '#d5262d';
    g.fillStyle = body; g.fillRect(0, 0, W, H);
    g.fillStyle = RED; g.fillRect(0, 0, W, 258);
    g.strokeStyle = 'rgba(90,0,0,.28)'; g.lineWidth = 2;                                  // the ridged seal
    for (let y = 8; y < 118; y += 9) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    g.fillStyle = '#fff'; g.beginPath();                                                  // the hang hole
    if (g.roundRect) g.roundRect(cx - 118, 30, 236, 56, 28); else g.rect(cx - 118, 30, 236, 56);
    g.fill();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = `700 58px ${SANS}`;   // (sized to sit on the front half of the tube: the label wraps round the curve)
    g.fillText('AMSTERDAM', cx, 190);
    g.font = `700 24px ${SANS}`; g.fillStyle = '#fff'; g.fillRect(cx - 78, 212, 156, 40);
    g.fillStyle = RED; g.font = `700 13px ${SANS}`; g.fillText('ALL', cx, 226); g.font = `700 17px ${SANS}`; g.fillText('ACRYLICS', cx, 244);
    g.fillStyle = pale; g.fillRect(0, 258, W, 66);                                        // the "Standard Series" band
    g.fillStyle = '#1b1b1b'; g.font = `700 42px ${SANS}`; g.fillText('Standard Series', cx, 306);
    // the black block with ACRYLIC running up it, and the small three-language line beside it
    g.fillStyle = '#121212'; g.fillRect(cx - 132, 350, 150, 290);
    // (rotated a quarter turn, so glyphs grow leftwards from the baseline; stretched taller so the word fills the block like the real one)
    g.save(); g.translate(cx - 19, 626); g.rotate(-Math.PI / 2); g.scale(1, 1.7); g.fillStyle = '#fff'; g.textAlign = 'left'; g.font = `700 62px ${SANS}`; g.fillText('ACRYLIC', 0, 0); g.restore();
    g.save(); g.translate(cx + 54, 640); g.rotate(-Math.PI / 2); g.fillStyle = '#1b1b1b'; g.textAlign = 'left'; g.font = `500 18px ${SANS}`; g.fillText('ACRYL / ACRYLIQUE / ACRÍLICO', 0, 0); g.restore();
    // the names panel, number, transparency square and +++
    g.fillStyle = panel; g.fillRect(x0, 664, lw, 158);
    g.fillStyle = '#1b1b1b'; g.textAlign = 'left'; g.font = `500 17px ${SANS}`;
    names.forEach((n, i) => g.fillText(n.toUpperCase(), x0 + 10, 686 + i * 20));
    g.font = `700 36px ${SANS}`; g.fillText(String(paint.num || ''), x0 + 10, 812);
    const sx = x0 + 96, sy = 786;
    g.fillStyle = '#fff'; g.fillRect(sx, sy, 28, 28);
    g.fillStyle = '#111';
    if (paint.opacity === 'opaque') g.fillRect(sx, sy, 28, 28);
    else if (paint.opacity === 'semi') { g.beginPath(); g.moveTo(sx + 28, sy); g.lineTo(sx + 28, sy + 28); g.lineTo(sx, sy + 28); g.closePath(); g.fill(); }
    else { g.strokeStyle = '#111'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(sx, sy + 28); g.lineTo(sx + 28, sy); g.stroke(); }
    g.strokeStyle = '#111'; g.lineWidth = 2.5; g.strokeRect(sx, sy, 28, 28);
    g.fillStyle = '#1b1b1b'; g.font = `700 32px ${SANS}`; g.fillText(LIGHTFAST[paint.id] || '', x0 + 136, 812);
    g.fillStyle = '#fff'; g.fillRect(x0 + lw - 58, 690, 48, 120);                        // the barcode strip
    g.fillStyle = '#111'; for (let i = 0, x = x0 + lw - 54; i < 16; i++) { const w = 1 + ((i * 7) % 3); g.fillRect(x, 696, w, 108); x += w + 1.6; }
  } else {
    // Galeria: maker's name, a yellow band, then a band in the paint's colour with the names in white or ink
    g.fillStyle = '#1b1b1b'; g.textAlign = 'center'; g.font = `700 60px Georgia, "Times New Roman", serif`;
    g.fillText('WINSOR', cx, 92); g.font = `700 34px Georgia, serif`; g.fillText('&', cx, 132); g.font = `700 60px Georgia, "Times New Roman", serif`; g.fillText('NEWTON', cx, 196);
    g.fillStyle = '#f2c230'; g.fillRect(0, 226, W, 116);
    g.fillStyle = '#1b1b1b'; g.font = `700 54px ${SANS}`; g.fillText('GALERIA', cx, 288);
    g.font = `700 30px ${SANS}`; g.fillText('ACRYLIC™', cx, 328);
    g.fillStyle = paint.hex; g.fillRect(0, 342, W, 316);
    g.fillStyle = luminance(paint.hex) < 0.55 ? '#f7f2e6' : '#1b1b1b';
    g.font = `700 32px ${SANS}`; g.fillText(names[0].toUpperCase(), cx, 392);
    g.font = `500 22px ${SANS}`;
    names.slice(1).forEach((n, i) => g.fillText(n.toUpperCase(), cx, 428 + i * 30));
    g.font = `500 20px ${SANS}`; g.fillText('Series / Série / Serie 1', cx, 596);
    g.font = `500 22px ${SANS}`; g.fillText('60 ml  ⊕  2.0 US fl oz', cx, 638);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

// ── one tube, built upright (crimp at y = 0, cap at the top) and then laid down ──────────────────────────────────
const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const R = 0.046, BODY = 0.235;                                            // tube radius and the length of its body

// The Amsterdam tube stands on a wide black cap, with the red crimped seal at the top. Built upright, cap at y = 0.
function makeAmsterdamTube(paint) {
  const g = new THREE.Group();
  const CAP = 0.04, SH = 0.035, L = 0.235, top = CAP + SH + L;             // cap, shoulder and body heights; y of the crimp
  const body = new THREE.CylinderGeometry(R, R, L, 40, 24, true);
  body.translate(0, CAP + SH + L / 2, 0);
  body.rotateY(Math.PI);                                                  // so the middle of the label faces +z
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {                                     // flatten the top into the flat crimped seal
    const t = smooth((top - p.getY(i)) / 0.075);
    p.setZ(i, p.getZ(i) * (0.11 + 0.89 * t));
  }
  body.computeVertexNormals();
  const label = labelTexture(paint);
  const mat = new THREE.MeshPhysicalMaterial({ map: label, roughness: 0.3, metalness: 0.02, clearcoat: 0.5, clearcoatRoughness: 0.35, side: THREE.DoubleSide });
  const bodyMesh = new THREE.Mesh(body, mat); bodyMesh.castShadow = bodyMesh.receiveShadow = true; g.add(bodyMesh);
  // the short shoulder, in the tube's own colour, and the wide black cap it stands on
  const shoulder = new THREE.Mesh(new THREE.LatheGeometry([[0.040, CAP], [0.041, CAP + 0.01], [R * 0.86, CAP + 0.022], [R, CAP + SH]].map(([r, y]) => new THREE.Vector2(r, y)), 32), new THREE.MeshPhysicalMaterial({ color: new THREE.Color(lighten(paint.hex, 0.06)), roughness: 0.3, clearcoat: 0.5 }));
  shoulder.castShadow = true; g.add(shoulder);
  const capMat = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.42, metalness: 0.04 });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.044, CAP, 28), capMat); cap.position.y = CAP / 2; cap.castShadow = true; g.add(cap);
  for (let i = 0; i < 20; i++) {                                          // the grip ribs round the cap
    const a = (i / 20) * Math.PI * 2, rib = new THREE.Mesh(new THREE.BoxGeometry(0.004, CAP * 0.9, 0.004), capMat);
    rib.position.set(Math.sin(a) * 0.0435, CAP / 2, Math.cos(a) * 0.0435); rib.rotation.y = a; g.add(rib);
  }
  g.userData.paint = paint;
  return g;
}

function makeTube(paint) {
  if (paint.brand === 'Amsterdam') return makeAmsterdamTube(paint);
  const g = new THREE.Group();
  const label = labelTexture(paint);
  const body = new THREE.CylinderGeometry(R, R, BODY, 40, 24, true);
  body.translate(0, BODY / 2, 0);
  body.rotateY(Math.PI);                                                  // so the middle of the label faces +z
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {                                     // flatten the crimped end into the flat seal
    const y = p.getY(i), t = smooth(y / 0.075);
    p.setZ(i, p.getZ(i) * (0.11 + 0.89 * t));
    p.setX(i, p.getX(i) * (0.93 + 0.07 * t));
  }
  body.computeVertexNormals();
  const tubeMat = new THREE.MeshStandardMaterial({ map: label, roughness: 0.42, metalness: 0.08, side: THREE.DoubleSide });
  const bodyMesh = new THREE.Mesh(body, tubeMat);
  bodyMesh.castShadow = bodyMesh.receiveShadow = true;
  g.add(bodyMesh);

  const plain = new THREE.MeshStandardMaterial({ color: 0xf1f0ec, roughness: 0.42, metalness: 0.08 });
  // the shoulder and neck
  const shoulder = new THREE.LatheGeometry([[R, 0], [R * 0.93, 0.02], [R * 0.66, 0.04], [0.026, 0.056], [0.019, 0.066], [0.019, 0.086]].map(([r, y]) => new THREE.Vector2(r, y)), 32);
  const sh = new THREE.Mesh(shoulder, plain); sh.position.y = BODY; sh.castShadow = true; g.add(sh);
  // the seal at the crimp: a thin serrated strip
  const seal = new THREE.Mesh(new THREE.BoxGeometry(R * 1.86, 0.02, 0.012), new THREE.MeshStandardMaterial({ color: 0xe6e5e0, roughness: 0.6, metalness: 0.15 }));
  seal.position.y = 0.01; seal.castShadow = true; g.add(seal);
  for (let i = 0; i < 9; i++) {                                           // the crimp ridges
    const r = new THREE.Mesh(new THREE.BoxGeometry(R * 1.8, 0.0025, 0.014), new THREE.MeshStandardMaterial({ color: 0xcfcec9, roughness: 0.7 }));
    r.position.y = 0.006 + i * 0.0021; g.add(r);
  }
  // the cap
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.05, 24), new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.45, metalness: 0.05 }));
  cap.position.y = BODY + 0.086 + 0.02; cap.castShadow = true; g.add(cap);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0255, 0.003, 8, 24), new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.5 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = BODY + 0.086 + 0.043; g.add(ring);
  g.userData.paint = paint;
  return g;
}

// ── a brush: bristle head, ferrule, long wooden handle with a painted end. Built along +y with the tip at y = 0 ─────
function makeBrush(shape, handleColour) {
  const g = new THREE.Group();
  const flat = shape === 'flat' || shape === 'filbert', headLen = shape === 'round' ? 0.11 : 0.1, rHead = shape === 'round' ? 0.017 : 0.032;
  const zs = flat ? 0.3 : 1;                                              // flat brushes are a thin oval in cross-section
  const profile = shape === 'flat'
    ? [[0, 0], [rHead, 0], [rHead, headLen]]                              // a square-ended flat
    : shape === 'filbert'
      ? [[0, 0], [rHead * 0.55, 0.008], [rHead * 0.9, 0.03], [rHead, 0.06], [rHead, headLen]]   // an oval tip
      : [[0, 0], [rHead * 0.45, 0.03], [rHead * 0.9, 0.075], [rHead, headLen]];                  // a pointed round
  const head = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 28), new THREE.MeshStandardMaterial({ color: 0xc9a56c, roughness: 0.92, side: THREE.DoubleSide }));
  head.scale.z = zs; head.castShadow = true; g.add(head);
  // a little paint on the tip
  const stain = new THREE.Mesh(new THREE.LatheGeometry(profile.slice(0, 3).map(([r, y]) => new THREE.Vector2(r * 1.01, y)), 28), new THREE.MeshStandardMaterial({ color: 0x3c79b4, roughness: 0.7, side: THREE.DoubleSide }));
  stain.scale.z = zs * 1.01; g.add(stain);
  const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(rHead * 0.95, rHead * 0.78, 0.09, 24), new THREE.MeshStandardMaterial({ color: 0xc9cdd1, metalness: 0.92, roughness: 0.28 }));
  ferrule.position.y = headLen + 0.045; ferrule.scale.z = flat ? 0.42 : 1; ferrule.castShadow = true; g.add(ferrule);
  const hy = headLen + 0.09, HL = 0.72;                                   // handle: long and slim, fatter in the middle
  const handle = [[0.0125, 0], [0.017, 0.06], [0.02, 0.22], [0.0195, 0.42], [0.0155, 0.62], [0.012, HL]];
  const wood = new THREE.Mesh(new THREE.LatheGeometry(handle.map(([r, y]) => new THREE.Vector2(r, y)), 20), new THREE.MeshStandardMaterial({ color: 0xd6b380, roughness: 0.55 }));
  wood.position.y = hy; wood.castShadow = true; g.add(wood);
  const tipEnd = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0155, 0.12, 20), new THREE.MeshStandardMaterial({ color: handleColour, roughness: 0.4 }));   // the painted end
  tipEnd.position.y = hy + HL - 0.06; g.add(tipEnd);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.0125, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), tipEnd.material);
  dome.position.y = hy + HL; g.add(dome);
  return g;
}

// ── a glass jar or tumbler with water in it ───────────────────────────────────────────────────────────────────
function makeGlass({ radius, height, water, waterColour, waterOpacity }) {
  const g = new THREE.Group();
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xe4eee9, transparent: true, opacity: 0.32, roughness: 0.06, metalness: 0, side: THREE.DoubleSide, depthWrite: false });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.94, height, 40, 1, true), glassMat); wall.position.y = height / 2; wall.renderOrder = 2; g.add(wall);
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.94, radius * 0.94, 0.012, 40), new THREE.MeshPhysicalMaterial({ color: 0xdfe9e4, transparent: true, opacity: 0.5, roughness: 0.1, depthWrite: false })); floor.position.y = 0.006; g.add(floor);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.005, 8, 40), new THREE.MeshStandardMaterial({ color: 0xeef4f0, roughness: 0.2, transparent: true, opacity: 0.7 })); rim.rotation.x = Math.PI / 2; rim.position.y = height; g.add(rim);
  const w = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.965, radius * 0.92, water, 40), new THREE.MeshStandardMaterial({ color: waterColour, transparent: true, opacity: waterOpacity, roughness: 0.15, depthWrite: false }));
  w.position.y = 0.012 + water / 2; w.renderOrder = 1; g.add(w);
  return g;
}

// Adds everything to `room` (the diorama group from buildRoom). Returns handles for later (selecting tubes, and so on).
export function addPaintProps(room) {
  const box = PALETTES['my box'].map((id) => PAINTS.find((p) => p.id === id));
  const out = { tubes: [], jar: null, brushes: [] };

  // The tubes lie in a 3 x 3 grid on the desk to the left of the canvas, cap end towards you and the crimp towards the back wall,
  // label up, so from above each label reads upright (see TABLE for where everything sits). Each tube's origin is its front end.
  const grid = new THREE.Group(); grid.position.set(TABLE.tubes.x, DESK_TOP, TABLE.tubes.z); room.add(grid);
  box.forEach((paint, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const tube = makeTube(paint);
    const wobble = Math.sin((i + 1) * 12.9898);                           // a little untidiness, deterministic
    tube.rotation.set(-Math.PI / 2, 0, wobble * 0.05);                    // lay it down: +y (the far end) goes to -z
    tube.position.set((col - 1) * TABLE.tubes.dx + wobble * 0.008, R * 0.98, -row * TABLE.tubes.dz);
    tube.userData.baseY = tube.position.y;
    grid.add(tube); out.tubes.push(tube);
  });

  // a jar of water with three brushes standing in it, and a clean glass beside it
  const jar = new THREE.Group(); jar.position.set(TABLE.jar.x, DESK_TOP, TABLE.jar.z); room.add(jar);
  jar.add(makeGlass({ radius: 0.085, height: 0.23, water: 0.16, waterColour: 0xb9c8b8, waterOpacity: 0.62 }));
  [['flat', 0xc7402d, -0.32, 0.13], ['filbert', 0x3b7d6b, 0.18, -0.22], ['round', 0xe0b23a, 0.34, 0.16]].forEach(([shape, colour, tiltZ, tiltX], i) => {
    const b = makeBrush(shape, colour);
    b.position.set(-0.03 + i * 0.03, 0.03, -0.01 + (i - 1) * 0.012);
    b.rotation.set(tiltX, i * 1.1, -tiltZ);                               // lean them against the rim
    b.userData.shape = shape; b.userData.baseY = b.position.y;
    jar.add(b); out.brushes.push(b);
  });
  out.jar = jar;
  const glass = makeGlass({ radius: 0.07, height: 0.19, water: 0.12, waterColour: 0xcfe0e6, waterOpacity: 0.4 });
  glass.position.set(TABLE.glass.x, DESK_TOP, TABLE.glass.z); room.add(glass);
  out.glass = glass;

  // What the props do: clicking a tube picks that paint and clicking a brush picks that shape (main.js does the picking).
  // The chosen paint's tube lifts a little off the pile, and whatever the pointer is over glows.
  out.select = (paintId) => {
    for (const t of out.tubes) t.position.y = t.userData.baseY + (t.userData.paint.id === paintId ? 0.035 : 0);
  };
  out.selectShape = (shape) => { for (const b of out.brushes) b.position.y = b.userData.baseY + (b.userData.shape === shape ? 0.07 : 0); };   // the chosen brush sits higher in the jar
  const glow = (obj, on) => obj.traverse((m) => { if (m.material && m.material.emissive) m.material.emissive.setRGB(on ? 0.16 : 0, on ? 0.12 : 0, on ? 0.05 : 0); });
  let lit = null;
  out.hover = (obj) => { if (obj === lit) return; if (lit) glow(lit, false); lit = obj; if (lit) glow(lit, true); };
  // the tube or brush at the top of a ray hit's parent chain, as { paint } or { shape }
  out.owner = (object) => { for (let o = object; o; o = o.parent) if (o.userData && (o.userData.paint || o.userData.shape)) return o; return null; };
  return out;
}
