import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { buildRoom } from './room.js';
import { AcrylicPainter, initAcrylicUI } from './acrylic-painter.js';
import { addPaintProps, TABLE } from './props.js';
import { addTray3D } from './tray3d.js';
import { ChairPhysics } from './chair.js';
import { typeIn } from './typing.js';
import { startAutosave, saveWall, loadWall } from './persist.js';

const BG = 0x1c1915;
const app = document.getElementById('app');

// Touch devices (the iPad) get a cheaper picture: fewer pixels, less MSAA, a smaller shadow map.
const coarse = matchMedia('(pointer: coarse)').matches;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.autoUpdate = false;   // the shadow map is big; it is redrawn only when something that casts a shadow moves (shadowWake)
renderer.shadowMap.type = THREE.PCFShadowMap; // r18x folds PCFSoft into PCF; softness comes from light.shadow.radius
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
scene.fog = new THREE.Fog(BG, 24, 52);

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 120);
// The room view is close on the desk corner (the easel, the window, the wall collage), like the reference photos, rather than the whole
// cutaway room from far away. The camera orbits a fixed point: `az` is the bearing (0 = straight in front of the desk, positive swings
// towards the bed), `el` the elevation and `dist` the distance. You can drag to change az and el, and scroll or pinch to change dist
// (see "look around" below); `cur` is what the camera shows and eases towards `goal`.
const HOME = { target: new THREE.Vector3(-0.15, 1.7, -2.7), fov: 30 };
const HOME_VIEW = { az: THREE.MathUtils.degToRad(30), el: THREE.MathUtils.degToRad(27), dist: 11.0 };
const LIMITS = { az: [THREE.MathUtils.degToRad(-14), THREE.MathUtils.degToRad(82)], el: [THREE.MathUtils.degToRad(8), THREE.MathUtils.degToRad(76)], dist: [4.5, 16] };
const orbit = { cur: { ...HOME_VIEW }, goal: { ...HOME_VIEW } };
const orbitPos = (o) => HOME.target.clone().add(new THREE.Vector3(Math.sin(o.az) * Math.cos(o.el), Math.sin(o.el), Math.cos(o.az) * Math.cos(o.el)).multiplyScalar(o.dist));
HOME.pos = orbitPos(orbit.cur);
camera.position.copy(HOME.pos); camera.lookAt(HOME.target);

// ── post: bloom → vignette/grade → tone map ──────────────────────────────────
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: coarse ? 2 : 4 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.38, 0.5, 1.0);
composer.addPass(bloom);
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null }, strength: { value: 0.5 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float strength; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 p = vUv - 0.5;
      float v = smoothstep(0.32, 0.92, length(p * vec2(1.0, 0.92)));
      c.rgb *= 1.0 - v * strength;
      c.rgb *= vec3(1.03, 1.0, 0.96); // slight warm grade
      gl_FragColor = c;
    }`,
}));
composer.addPass(new OutputPass());

// ── world ────────────────────────────────────────────────────────────────────
const world = buildRoom(scene);
// the mixing tray on the desk (it replaces the old wooden palette prop), then the paint tubes and brushes
// the office chair can be grabbed and shoved around the floor (room view only); it bumps off the walls, the desk and the bed
const CHAIR_R = 0.8;
const chairPhys = new ChairPhysics(world.chair, { rects: world.chairRects, radius: CHAIR_R, bounds: { minX: -3.85 + CHAIR_R, maxX: 4.1 - CHAIR_R, minZ: -3.85 + CHAIR_R, maxZ: 4.1 - CHAIR_R } });
world.tray = addTray3D(world.room);
world.tray.replace(world.oldPalette);
// the paint tubes and brushes on the desk; their labels are drawn on a canvas in DM Sans, so wait for the font first
Promise.all([document.fonts.load('500 20px "DM Sans"'), document.fonts.load('700 20px "DM Sans"')]).catch(() => {})
  .then(() => {
    world.props = addPaintProps(world.room);
    ui.onSelect = (p) => { world.props.select(p.id); poke(4); shadowWake = 3; };   // the chosen paint's tube lifts off the pile
    ui.onShape = (sh) => { world.props.selectShape(sh); poke(4); shadowWake = 3; };
    world.props.select(painter.paint.id); world.props.selectShape(painter.engine.params.shape);
    poke(6); shadowWake = 6;
  });
if (coarse) world.sun.shadow.mapSize.set(2048, 2048);
const painter = new AcrylicPainter(document.getElementById('paint-canvas'), document.getElementById('grain'));
// the easel shows the live painting canvas, so paint keeps drying (and showing it) while you look around the room
// (unlit colour + a normal map from the paint's height, so ridges catch the room's light)
const paintTex = new THREE.CanvasTexture(painter.albedoCanvas); paintTex.colorSpace = THREE.SRGBColorSpace; paintTex.anisotropy = 8;
const paintNormal = new THREE.CanvasTexture(painter.normalCanvas); paintNormal.anisotropy = 8;
world.canvasMat.map = paintTex;
world.canvasMat.normalMap = paintNormal;
world.canvasMat.normalScale.set(1.6, 1.6); // 1 is subtle, 3 makes the weave blotchy
world.canvasMat.roughness = 0.8;
const uploadPaint = () => { if (painter.syncMaps()) { paintTex.needsUpdate = true; paintNormal.needsUpdate = true; } };

// ── view a hung painting on the easel (view only) ───────────────────────────────────────────────────────────────────────────────────
// Click a painting on the wall and it goes up on the easel while the camera flies in to look at it. Only a flat picture of a hung painting
// is kept (not its paint state), so this is view-only: click anywhere or press Esc to go back out. Your painting in progress is untouched
// underneath, and the easel shows it again as soon as you are back in the room.
let onEasel = null;   // the wall frame whose painting is on the easel, or null when the easel shows the live canvas
const hintEl = document.getElementById('hint'), HINT = hintEl ? hintEl.textContent : '';
if (hintEl) typeIn(hintEl, HINT.trim(), { delay: 700 });   // types itself in once the room is up
function showOnEasel(slot) {
  if (!slot.easelTex) { const t = new THREE.CanvasTexture(slot.canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; slot.easelTex = t; }
  world.canvasMat.map = slot.easelTex; world.canvasMat.normalMap = null; world.canvasMat.needsUpdate = true;
  onEasel = slot;
  poke(4); shadowWake = 3;
}
function showLive() {
  if (!onEasel) return;
  world.canvasMat.map = paintTex; world.canvasMat.normalMap = paintNormal; world.canvasMat.needsUpdate = true;
  onEasel = null;
  poke(4); shadowWake = 3;
}
let viewSlot = null;   // the wall frame being viewed
function viewPainting(slot) {
  if (mode !== 'room') return;
  mode = 'travelling'; hover(false); setHoverFrame(null);
  showOnEasel(slot); viewSlot = slot;
  travel(easelViewPose(), () => {
    mode = 'view'; document.body.classList.remove('travelling'); poke(6);
    if (hintEl) {   // the bottom text, with a delete button in it (the text itself ignores the pointer, the button does not)
      const msg = document.createElement('span'); msg.textContent = '✦ viewing a painting · click anywhere or press Esc to go back';
      const del = document.createElement('button');
      del.className = 'btn'; del.textContent = 'delete'; del.title = 'take this painting off the wall';
      del.style.cssText = 'width:auto;margin:0;padding:4px 12px;font-size:var(--text-xs);color:var(--terracotta);border-color:var(--terracotta);pointer-events:auto;';
      del.onclick = () => confirmDelete(slot);
      hintEl.replaceChildren(msg, del); hintEl.style.cssText = 'display:flex;align-items:center;gap:12px;';
      typeIn(msg, null, { speed: 22 });
    }
  });
}
function leaveView(after) {
  if (mode !== 'view') return;
  mode = 'travelling';
  if (hintEl) { hintEl.textContent = HINT; hintEl.style.cssText = ''; }
  travel(homePose(), () => {
    mode = 'room'; viewSlot = null; document.body.classList.remove('travelling'); showLive(); poke(6);
    if (hintEl) typeIn(hintEl, HINT.trim(), { delay: 250 });   // the hint comes back typing, once it is visible again
    if (after) after();
  });
}

// ── deleting a hung painting: "are you sure?" first ─────────────────────────────────────────────────────────────────────
// Built from the card's own look (cream, dashed pink border, washi tape, ultramarine heading, the terracotta primary button). It shows the
// painting it is about to delete, and the safe button ("keep it") has the focus, so a stray Enter does not delete anything.
let confirmEl = null;
function closeConfirm() { if (confirmEl) confirmEl.style.display = 'none'; }
function confirmDelete(slot) {
  if (!confirmEl) {
    confirmEl = document.createElement('div');
    confirmEl.style.cssText = 'position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;background:rgba(28,25,21,.55);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);';
    confirmEl.addEventListener('pointerdown', (e) => { if (e.target === confirmEl) closeConfirm(); });   // a click on the dim area means "keep it"
    document.body.appendChild(confirmEl);
  }
  const box = document.createElement('div');
  box.className = 'note'; box.setAttribute('role', 'alertdialog'); box.setAttribute('aria-label', 'Delete this painting?');
  box.style.cssText = 'width:min(340px,90vw);padding:26px 22px 18px;border:5px dashed var(--pink);background:var(--cream);color:var(--ink);';
  const h = document.createElement('h2');
  h.textContent = 'DELETE THIS PAINTING?'; h.style.cssText = 'margin:0 0 12px;color:var(--ultramarine);font-size:var(--text-lg);letter-spacing:.08em;';
  const thumb = document.createElement('canvas');   // a small look at what is about to go
  thumb.width = 260; thumb.height = Math.round(260 * slot.canvas.height / slot.canvas.width);
  thumb.getContext('2d').drawImage(slot.canvas, 0, 0, thumb.width, thumb.height);
  thumb.style.cssText = 'display:block;width:100%;height:auto;margin:0 0 12px;border-radius:var(--radius-chip);box-shadow:0 0 0 1.5px var(--line);';
  const p = document.createElement('p');
  p.textContent = "It comes off the wall for good. This can't be undone."; p.style.cssText = 'margin:0 0 14px;font-size:var(--text-sm);line-height:1.5;color:var(--ink-soft);';
  const row = document.createElement('div'); row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;';
  const keep = document.createElement('button'); keep.className = 'btn'; keep.textContent = 'keep it'; keep.style.marginTop = '0'; keep.onclick = closeConfirm;
  const del = document.createElement('button'); del.className = 'btn primary'; del.textContent = 'delete'; del.style.marginTop = '0';
  del.onclick = () => {
    closeConfirm();
    leaveView(() => { setHoverFrame(null); world.unhang(slot); saveWall(world.frames); slot.popT = performance.now(); poke(4); shadowWake = 3; });   // fly back, then the frame empties with a little pop
  };
  row.append(keep, del);
  box.append(h, thumb, p, row);
  confirmEl.replaceChildren(box); confirmEl.style.display = 'flex';
  keep.focus();
}

// ── the easel lies flat on the desk while you paint (bird's-eye view), and stands up again in the room ──
const DESK_TOP = 1.5; // desk surface height in room.js
const easelUp = { pos: world.easel.position.clone(), rotX: world.easel.rotation.x };
const easelFlat = { pos: new THREE.Vector3(TABLE.canvas.x, DESK_TOP + 0.034, TABLE.canvas.z), rotX: -Math.PI / 2 }; // canvas face up, top edge towards the back wall
const easelParts = world.easel.children.filter((c) => !world.easelHit.includes(c)); // legs and prop: hidden while it lies flat
function poseEasel(p, lift = 0) { world.easel.position.copy(p.pos); world.easel.position.y += lift; world.easel.rotation.x = p.rotX; world.easel.updateMatrixWorld(true); }
function withEasel(p, fn) { const keep = { pos: world.easel.position.clone(), rotX: world.easel.rotation.x }; poseEasel(p); const r = fn(); poseEasel(keep); return r; }

// ── state machine: room → travelling → paint → travelling → room ─────────────
let mode = 'room';
const mouse = new THREE.Vector2(0, 0), mouseSm = new THREE.Vector2(0, 0);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
let tween = null;

// The 3D room is drawn on demand. While you paint, the scene behind the paper is static and hidden by it, so drawing it
// every frame is wasted GPU (heat on the laptop, slowness on the iPad). A frame is drawn only while `wake` > 0, and
// anything that changes what you see pokes it. `shadowWake` does the same for the shadow map.
let wake = 6, shadowWake = 6;
const poke = (n = 3) => { if (n > wake) wake = n; };

function resize() {
  const w = innerWidth, h = innerHeight;
  poke(6);
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.resolution.set(w, h);
  camera.aspect = w / h;
  // on tall/narrow screens pull back so the whole diorama still fits
  HOME.fov = camera.aspect < 1.3 ? 30 + (1.3 - camera.aspect) * 34 : 30;
  if (mode === 'room') { camera.fov = HOME.fov; }
  camera.updateProjectionMatrix();
  if (mode === 'paint') { applyPose(paintPose()); layoutPaper(); }
  else if (mode === 'view') applyPose(easelViewPose());
}

function applyPose(p) { camera.position.copy(p.pos); camera.quaternion.copy(p.quat); camera.fov = p.fov; camera.updateProjectionMatrix(); }

function homePose() {   // the room view as you last left it (the orbit, not always the starting view)
  const pos = orbitPos(orbit.cur), c = new THREE.PerspectiveCamera(); c.position.copy(pos); c.lookAt(HOME.target);
  return { pos, quat: c.quaternion.clone(), fov: HOME.fov };
}

// camera square-on to the canvas, centred, with the note card to the right on wide screens
// The overhead camera for the desk view: it looks straight down at the middle of the table (TABLE.view) and pulls back until
// the whole layout fits, so the tubes, the canvas, the tray in front of it and the jar are all in shot.
function deskPose() {
  const fov = 30, half = Math.tan(THREE.MathUtils.degToRad(fov / 2)), aspect = camera.aspect, V = TABLE.view;
  const dist = Math.max(V.width / (2 * half * aspect), V.height / (2 * half));
  const pos = new THREE.Vector3(V.x, DESK_TOP + dist, V.z);
  const holder = new THREE.PerspectiveCamera(); holder.position.copy(pos); holder.up.set(0, 0, -1); holder.lookAt(V.x, DESK_TOP, V.z);   // (a camera, so it looks down -z)
  return { pos, quat: holder.quaternion.clone(), fov };
}

// The camera square-on to the standing easel, with the canvas filling most of the screen (for viewing a hung painting).
function easelViewPose() {
  world.easel.updateMatrixWorld(true);
  const q = new THREE.Quaternion(); world.canvasFace.getWorldQuaternion(q);
  const c = world.canvasFace.getWorldPosition(new THREE.Vector3());
  const n = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  const fov = 30, half = Math.tan(THREE.MathUtils.degToRad(fov / 2)), aspect = camera.aspect;
  const dist = Math.max(world.CH / 0.8 / (2 * half), world.CW / 0.86 / (2 * half * aspect));
  return { pos: c.clone().addScaledVector(n, dist), quat: q, fov };
}

function paintPose() {   // the desk view for painting; the easel view is view-only, so it is the same close pose as viewing a hung painting
  return deskMode ? deskPose() : easelViewPose();
}

const paintEl = document.getElementById('paint');
const paper = document.getElementById('paper');
function layoutPaper() {
  const p = paintPose();
  const cam = new THREE.PerspectiveCamera(p.fov, camera.aspect, 0.1, 100);
  cam.position.copy(p.pos); cam.quaternion.copy(p.quat); cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  const xs = [], ys = [];
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const v = new THREE.Vector3(sx * world.CW / 2, sy * world.CH / 2, 0);
    world.canvasFace.localToWorld(v); v.project(cam);
    xs.push((v.x * 0.5 + 0.5) * innerWidth); ys.push((-v.y * 0.5 + 0.5) * innerHeight);
  }
  Object.assign(paper.style, {
    left: Math.min(...xs) + 'px', top: Math.min(...ys) + 'px',
    width: Math.max(...xs) - Math.min(...xs) + 'px', height: Math.max(...ys) - Math.min(...ys) + 'px',
  });
}

function travel(to, done, easel) {
  tween = {
    t0: performance.now(), dur: 1150, done, to, easel,
    from: { pos: camera.position.clone(), quat: camera.quaternion.clone(), fov: camera.fov },
  };
  document.body.classList.add('travelling');
}

function enterPaint() {
  if (mode !== 'room') return;
  showLive();   // you paint on the live canvas, so a hung painting on the easel goes back on the wall (it never left it)
  mode = 'travelling';
  hover(false);
  // paint mode opens on the desk: the canvas lies flat and the camera goes overhead (the card's button stands it back up)
  deskMode = true; ui.setDesk(true); view.onChange(); showStringLights(false);
  travel(withEasel(easelFlat, paintPose), () => {
    mode = 'paint';
    document.body.classList.remove('travelling'); document.body.classList.add('painting');
    layoutPaper();
    paintEl.classList.add('on');
    const escEl = document.getElementById('esc');   // the "esc" line types in the first time the card opens
    if (escEl && !escEl.dataset.typed) { escEl.dataset.typed = '1'; typeIn(escEl, null, { delay: 500, speed: 22 }); }
    poke(6);
  }, { from: easelUp, to: easelFlat, legs: false });
}

// The two ways to paint: at the standing easel, or with the canvas put down flat on the desk (bird's-eye view).
// Switching happens inside paint mode: the paper fades out, the easel and camera move, the paper fades back in.
// The fairy lights sit at the back edge of the desk and, seen from directly above, their glow washes out the canvas, jars and tubes,
// so the bulbs and wire are hidden in the overhead view (their light stays on) and shown again everywhere else.
const showStringLights = (on) => { for (const o of world.stringLights) o.visible = on; poke(4); };
let deskMode = true;   // paint mode opens on the desk, with the canvas flat and the tubes and tray around it
const view = {
  get down() { return deskMode; },
  onChange: () => {},
  set(down) {
    if (mode !== 'paint' || down === deskMode) return;
    mode = 'travelling'; painter.up(); paintEl.classList.remove('on');
    document.getElementById('cursor').style.opacity = 0;
    const from = down ? easelUp : easelFlat, to = down ? easelFlat : easelUp;
    deskMode = down; view.onChange(); ui.setDesk(down); showStringLights(!down);
    travel(withEasel(to, paintPose), () => {
      mode = 'paint';
      document.body.classList.remove('travelling');
      layoutPaper();
      paintEl.classList.add('on');
      poke(6);
    }, { from, to, legs: !down });
  },
};

// hang = true finishes the painting (it goes on the wall and the easel is cleared); false just steps back and leaves it drying on the easel
function leavePaint(hang = true) {
  if (mode !== 'paint') return;
  mode = 'travelling';
  painter.up();
  paintEl.classList.remove('on');
  document.getElementById('cursor').style.opacity = 0;
  const hung = hang && painter.dirty ? painter.composite() : null;
  document.body.classList.remove('painting');
  showStringLights(true);
  const wasDown = deskMode; deskMode = true; view.onChange(); ui.setDesk(true);   // the next visit starts on the desk again
  travel(homePose(), () => {
    mode = 'room';
    document.body.classList.remove('travelling');
    if (hung) {
      const slot = world.hang(hung);
      slot.popT = performance.now();
      painter.clear();
      uploadPaint();
      saveWall(world.frames);
    }
  }, wasDown ? { from: easelFlat, to: easelUp, legs: true } : undefined);   // lift the easel back up if it was lying flat
}

const ui = initAcrylicUI(painter, { onBack: () => leavePaint(true), view, isPainting: () => mode === 'paint' });
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (confirmEl && confirmEl.style.display !== 'none') { closeConfirm(); return; }   // Esc on the dialog means "keep it", and stays in the view
  leavePaint(false); leaveView();
});

// ── picking ──────────────────────────────────────────────────────────────────
const ray = new THREE.Raycaster();
let hovering = false, downAt = null;
function hover(on) {
  if (on === hovering) return;
  hovering = on; poke();
  renderer.domElement.style.cursor = on ? 'pointer' : '';
  world.canvasMat.emissive.setRGB(on ? 0.16 : 0, on ? 0.12 : 0, on ? 0.05 : 0);
  document.getElementById('hint').style.transform = on ? 'translateX(-50%) scale(1.06)' : 'translateX(-50%)';
}
function pick(e) {
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  return ray.intersectObjects(world.easelHit, false).length > 0;
}
// The tubes and brushes on the desk: they glow under the pointer, a tube picks that paint and a brush picks that shape.
// This works in the room and in paint mode (outside the paper and the card, which sit on top of the 3D view).
function pickProp(e) {
  if (!world.props || (mode === 'paint' && !deskMode)) return null;   // (nothing to pick from the view-only easel view)
  ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
  const hit = ray.intersectObjects([...world.props.tubes, ...world.props.brushes], true)[0];
  return hit ? world.props.owner(hit.object) : null;
}
let hoverProp = null;
function setHoverProp(o) {
  if (o === hoverProp || !world.props) return;
  hoverProp = o; world.props.hover(o); poke();
  showTip(o);
}

// ── hover tooltip: a spec sheet for a tube or brush ─────────────────────────────────────────────────────────────────
const OPACITY_NAME = { opaque: 'Opaque', semi: 'Semi-opaque', transparent: 'Transparent' };
const BRAND_LINE = { 'Amsterdam': 'Amsterdam · Standard Series · Acrylic', 'Winsor & Newton Galeria': 'Winsor & Newton · Galeria · Series 1 · Acrylic' };
const SHAPE_TIP = {
  flat: ['Flat', 'Bristles in a straight row. Broad strokes; chisel edge on its side.'],
  filbert: ['Filbert', 'Oval tip. Soft rounded marks; stroke width follows pressure.'],
  round: ['Round', 'Round tip. Dabs by clicking; soft-edged lines by dragging.'],
};
const officialName = (name) => name.replace(/(^|[\s-])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase());   // "king's blue" -> "King's Blue"
// the small square printed on the tubes: solid = opaque, half = semi-opaque, empty with a slash = transparent
function opacitySquare(kind) {
  const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 14 14'); svg.setAttribute('width', '14'); svg.setAttribute('height', '14'); svg.style.cssText = 'flex:none;display:block;';
  const add = (tag, attrs) => { const el = document.createElementNS(NS, tag); for (const k in attrs) el.setAttribute(k, attrs[k]); svg.appendChild(el); };
  add('rect', { x: 0.75, y: 0.75, width: 12.5, height: 12.5, fill: '#fff' });
  if (kind === 'opaque') add('rect', { x: 0.75, y: 0.75, width: 12.5, height: 12.5, fill: '#1b1b1b' });
  else if (kind === 'semi') add('path', { d: 'M13.25 0.75 V13.25 H0.75 Z', fill: '#1b1b1b' });
  else add('path', { d: 'M0.75 13.25 L13.25 0.75', stroke: '#1b1b1b', 'stroke-width': 1.4, fill: 'none' });
  add('rect', { x: 0.75, y: 0.75, width: 12.5, height: 12.5, fill: 'none', stroke: '#1b1b1b', 'stroke-width': 1.5 });
  return svg;
}
const tip = document.createElement('div');
tip.style.cssText = 'position:fixed;left:0;top:0;z-index:30;display:none;width:250px;padding:12px 14px 12px;pointer-events:none;font-size:var(--text-xs);line-height:1.35;color:var(--ink);'
  + 'background:color-mix(in srgb, var(--cream) 82%, transparent);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);'
  + 'border:1.5px solid var(--line);border-radius:var(--radius-card);box-shadow:0 8px 22px rgba(0,0,0,.28);';
document.body.appendChild(tip);
const LABEL = 'font-size:10px;letter-spacing:var(--tracking-caps);text-transform:uppercase;color:var(--ink-soft);';
function tipRow(label, value) {   // a labelled row: small caps label, then the value (text, or a node)
  const row = document.createElement('div'); row.style.cssText = 'display:grid;grid-template-columns:86px 1fr;align-items:center;gap:8px;padding:3px 0;border-top:1px solid var(--line);';
  const l = document.createElement('span'); l.style.cssText = LABEL; l.textContent = label;
  const v = document.createElement('span'); v.style.cssText = 'display:flex;align-items:center;gap:7px;';
  if (typeof value === 'string') v.textContent = value; else v.appendChild(value);
  row.append(l, v); tip.appendChild(row);
}
function showTip(o) {
  if (!o) { tip.style.display = 'none'; return; }
  tip.replaceChildren();
  const paint = o.userData.paint;
  const head = document.createElement('div'); head.style.cssText = 'display:flex;align-items:center;gap:9px;';
  const title = document.createElement('div'); title.style.cssText = 'font-size:var(--text-base);font-weight:var(--weight-bold);line-height:1.2;';
  const sub = document.createElement('div'); sub.style.cssText = 'font-size:10.5px;color:var(--ink-soft);margin:2px 0 8px;';
  if (paint) {
    const dot = document.createElement('span'); dot.style.cssText = `flex:none;width:22px;height:22px;border-radius:3px;background:${paint.hex};box-shadow:0 0 0 1.5px var(--ink);`;
    title.textContent = officialName(paint.name); head.append(dot, title);
    sub.textContent = BRAND_LINE[paint.brand] || paint.brand;
    tip.append(head, sub);
    if (paint.code) tipRow('Pigment', paint.code);
    if (paint.num) tipRow('Colour no.', String(paint.num));
    const op = document.createElement('span'); op.style.cssText = 'display:flex;align-items:center;gap:7px;'; op.append(opacitySquare(paint.opacity), document.createTextNode(OPACITY_NAME[paint.opacity] || paint.opacity));
    tipRow('Opacity', op);
    if (paint.light) tipRow('Lightfast', paint.light);
    if (paint.blurb) tipRow('Use', paint.blurb);
  } else {
    const [name, use] = SHAPE_TIP[o.userData.shape] || [o.userData.shape, ''];
    title.textContent = name + ' brush'; sub.textContent = 'Long-handled artist brush';
    tip.append(title, sub); tipRow('Use', use);
  }
  tip.style.display = 'block';
}
function moveTip(e) {
  if (tip.style.display === 'none') return;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.transform = `translate(${Math.min(e.clientX + 18, innerWidth - w - 8)}px, ${Math.min(e.clientY + 18, innerHeight - h - 8)}px)`;
}

// ── the mixing tray on the desk: with the canvas flat, squeeze paint onto it and mix on it right there ─────────────
function trayPixel(e) {
  if (!world.tray || mode !== 'paint' || !deskMode) return null;
  ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
  return world.tray.pixelAt(ray);
}
ui.wipeTray = () => { world.tray.tray.clear(); poke(3); };
let trayDrag = null;
function trayDown(e) {
  const px = trayPixel(e);
  if (!px || trayDrag) return false;
  const T = world.tray.tray, pressure = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.8;
  if (ui.trayMode() === 'squeeze') { T.beginSqueeze(ui.squeezePaint(), px[0], px[1]); trayDrag = { id: e.pointerId, mode: 'squeeze' }; }
  else { T.beginMix(px[0], px[1], pressure); trayDrag = { id: e.pointerId, mode: 'mix', x0: px[0], y0: px[1], far: 0 }; }
  renderer.domElement.setPointerCapture(e.pointerId);
  poke(3);
  return true;
}
function trayMove(e) {
  if (!trayDrag || e.pointerId !== trayDrag.id) return;
  const T = world.tray.tray;
  for (const ev of (e.getCoalescedEvents ? e.getCoalescedEvents() : [e])) {
    const px = trayPixel(ev.clientX === undefined ? e : ev);
    if (!px) continue;   // the pointer slid off the tray: keep the stroke, skip this sample
    if (trayDrag.mode === 'squeeze') T.squeezeTo(px[0], px[1]);
    else { trayDrag.far = Math.max(trayDrag.far, Math.hypot(px[0] - trayDrag.x0, px[1] - trayDrag.y0)); T.mixTo(px[0], px[1], 0.8); }
  }
  poke(3);
}
function trayUp(e) {
  if (!trayDrag || e.pointerId !== trayDrag.id) return false;
  const T = world.tray.tray;
  if (trayDrag.mode === 'squeeze') T.endSqueeze();
  else {
    T.endMix();
    if (trayDrag.far < 6) { const c = T.sample(trayDrag.x0, trayDrag.y0); if (c) ui.loadMixed(c, T.paint); }   // a tap: load the brush with that colour
  }
  trayDrag = null; poke(3);
  return true;
}
// ── the chair: grab it in the room view and drag it about; let go and it keeps rolling ──────────────────────────────────
let chairDrag = null;
const chairRay = (e) => { ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera); return ray; };
function chairDown(e) {
  if (mode !== 'room' || chairDrag) return false;
  const h = chairPhys.hit(chairRay(e));
  if (!h) return false;
  chairPhys.grab(ray, h); chairDrag = { id: e.pointerId };
  renderer.domElement.setPointerCapture(e.pointerId); renderer.domElement.style.cursor = 'grabbing'; poke(3);
  return true;
}
function chairUp(e) {
  if (!chairDrag || e.pointerId !== chairDrag.id) return false;
  chairPhys.release(); chairDrag = null; renderer.domElement.style.cursor = ''; poke(3);
  return true;
}
// The paintings hung on the wall. Hovering one (checked against the frames only, which is cheap) lights it up; a click is checked against
// the whole room, so something standing in front of a frame is what gets clicked, not the frame behind it.
const filledFrames = () => world.frames.filter((f) => f.filled);
let hoverFrame = null;
function frameAt(e) {
  const fs = filledFrames();
  if (!fs.length) return null;
  ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
  const hit = ray.intersectObjects(fs.map((f) => f.art), false)[0];
  return hit ? fs.find((f) => f.art === hit.object) : null;
}
function pickFrame(e) {
  const f = frameAt(e);
  if (!f) return null;
  const first = ray.intersectObject(world.room, true)[0];   // (frameAt left the ray pointing where the click was)
  return first && first.object === f.art ? f : null;
}
function setHoverFrame(f) {
  if (f === hoverFrame) return;
  if (hoverFrame) hoverFrame.art.material.emissive.setRGB(0, 0, 0);
  hoverFrame = f;
  if (f) f.art.material.emissive.setRGB(0.12, 0.1, 0.05);
  poke();
}

// ── look around (room view): drag to turn the room, scroll or pinch to zoom, double-click to go back to the starting view ──────────
const look = { ptrs: new Map(), moved: false, pinch: null };   // active pointers, whether this gesture became a drag, and a pinch's start
const clampTo = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));
function lookDown(e) {
  if (mode !== 'room') return;
  if (look.ptrs.size === 0) look.moved = false;
  look.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
  renderer.domElement.setPointerCapture(e.pointerId);
  if (look.ptrs.size === 2) { const [a, b] = [...look.ptrs.values()]; look.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, dist0: orbit.goal.dist }; look.moved = true; }
}
function lookMove(e) {   // returns true if this move belongs to a look-around gesture
  const p = look.ptrs.get(e.pointerId);
  if (!p || mode !== 'room') return false;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (look.ptrs.size >= 2 && look.pinch) {
    const [a, b] = [...look.ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    orbit.goal.dist = clampTo(look.pinch.dist0 * look.pinch.d0 / d, LIMITS.dist); poke(3);
    return true;
  }
  if (!look.moved && Math.hypot(p.x - p.x0, p.y - p.y0) < 6) return false;   // still a click, not a drag
  look.moved = true;
  orbit.goal.az = clampTo(orbit.goal.az - dx * 0.0032, LIMITS.az);
  orbit.goal.el = clampTo(orbit.goal.el + dy * 0.0028, LIMITS.el);
  renderer.domElement.style.cursor = 'grabbing'; poke(3);
  return true;
}
function lookUp(e) { look.ptrs.delete(e.pointerId); if (look.ptrs.size < 2) look.pinch = null; if (look.ptrs.size === 0) renderer.domElement.style.cursor = ''; }
renderer.domElement.addEventListener('wheel', (e) => {
  if (mode !== 'room') return;
  e.preventDefault();
  orbit.goal.dist = clampTo(orbit.goal.dist * Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0014)), LIMITS.dist); poke(3);   // (a trackpad pinch arrives as a ctrl-wheel)
}, { passive: false });
// A double tap on empty space goes back to the starting view. (Detected here: the browser's own dblclick is not delivered while the
// pointer is captured for dragging, and it would not fire reliably on a touch screen either.)
let lastTap = null;
function tapEmpty(e) {
  const t = performance.now();
  if (lastTap && t - lastTap.t < 380 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 24) { Object.assign(orbit.goal, HOME_VIEW); poke(3); lastTap = null; }
  else lastTap = { t, x: e.clientX, y: e.clientY };
}

renderer.domElement.addEventListener('pointermove', (e) => {
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  if (chairDrag) { if (e.pointerId === chairDrag.id) chairPhys.dragTo(chairRay(e)); return; }
  if (lookMove(e)) return;
  if (trayDrag) { trayMove(e); return; }
  if (mode === 'room') hover(pick(e));
  if (mode === 'room' || mode === 'paint') setHoverProp(pickProp(e));
  const overFrame = mode === 'room' ? frameAt(e) : null;
  setHoverFrame(overFrame);
  moveTip(e);
  renderer.domElement.style.cursor = hoverProp || hovering || overFrame ? 'pointer' : trayPixel(e) ? 'crosshair' : mode === 'room' && chairPhys.hit(chairRay(e)) ? 'grab' : '';
});
renderer.domElement.addEventListener('pointerdown', (e) => {
  downAt = [e.clientX, e.clientY];
  if (mode === 'room' && !pickProp(e) && !pick(e) && chairDown(e)) { downAt = null; return; }   // the easel and the tubes win over the chair if they are in front
  lookDown(e);
  if (mode === 'paint' && !pickProp(e)) trayDown(e);
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (chairUp(e)) { downAt = null; return; }
  const wasLook = look.moved; lookUp(e);
  if (trayUp(e)) { downAt = null; return; }
  if (mode === 'view') { if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 6) leaveView(); downAt = null; return; }
  if (downAt && !wasLook && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 6 && (mode === 'room' || mode === 'paint')) {
    const prop = pickProp(e);
    if (prop) {
      if (prop.userData.paint) ui.choose(prop.userData.paint);
      if (prop.userData.shape) ui.setShape(prop.userData.shape);
      if (mode === 'room') enterPaint();
    } else if (mode === 'room' && pick(e)) enterPaint();
    else if (mode === 'room') {
      const f = pickFrame(e);
      if (f) viewPainting(f); else tapEmpty(e);
    }
  }
  downAt = null;
});
renderer.domElement.addEventListener('pointercancel', (e) => { chairUp(e); lookUp(e); trayUp(e); downAt = null; });

// ── loop ─────────────────────────────────────────────────────────────────────
let texT = 0;
let lastNow = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let moving = false;   // the camera, the easel or a hung frame is moving, so shadows need redrawing too

  if (tween) {
    moving = true;
    const k = ease(Math.min(1, (now - tween.t0) / tween.dur));
    camera.position.lerpVectors(tween.from.pos, tween.to.pos, k);
    camera.quaternion.slerpQuaternions(tween.from.quat, tween.to.quat, k);
    camera.fov = tween.from.fov + (tween.to.fov - tween.from.fov) * k;
    camera.updateProjectionMatrix();
    const e = tween.easel;
    if (e) { // the easel lifts, turns and settles as the camera goes; its legs are only there while it stands
      const t = k >= 1 ? 1 : k;
      poseEasel({ pos: new THREE.Vector3().lerpVectors(e.from.pos, e.to.pos, t), rotX: e.from.rotX + (e.to.rotX - e.from.rotX) * t }, Math.sin(Math.PI * t) * 0.3);
      for (const c of easelParts) c.visible = e.legs ? t > 0.6 : t < 0.4;
    }
    if (k >= 1) { const d = tween.done; tween = null; d(); }
  } else if (mode === 'room') {
    // look around: ease the shown view towards the one you asked for
    const kk = 1 - Math.exp(-Math.min(0.05, (now - lastNow) / 1000) * 14);
    let settling = false;
    for (const key of ['az', 'el', 'dist']) {
      const d = orbit.goal[key] - orbit.cur[key];
      if (Math.abs(d) > (key === 'dist' ? 0.002 : 0.0002)) { orbit.cur[key] += d * kk; settling = true; } else orbit.cur[key] = orbit.goal[key];
    }
    if (settling || wake > 0) {
      camera.position.copy(orbitPos(orbit.cur)); camera.lookAt(HOME.target);
      camera.fov = HOME.fov; camera.updateProjectionMatrix();
      if (settling) { poke(2); shadowWake = 2; }
    }
  }

  if (chairPhys.active) { chairPhys.step((now - lastNow) / 1000); moving = true; }
  lastNow = now;
  painter.tick(now);
  if (world.tray && world.tray.update(now / 1000)) poke(2);   // the tray dries too
  // the 3D easel only needs the new pixels when it can be seen (the paint overlay hides it), and not every frame
  if ((mode !== 'paint' || !deskMode) && painter.changed && now - texT > 100) { uploadPaint(); painter.changed = false; texT = now; poke(2); }

  for (const f of world.frames) { // little pop when a painting lands on the wall
    if (f.popT < 0) continue;
    moving = true;
    const t = Math.min(1, (now - f.popT) / 600);
    const s = t < 1 ? 1 + Math.sin(t * Math.PI) * 0.16 * (1 - t) : 1;
    f.group.scale.setScalar(s);
    if (t >= 1) f.popT = -1;
  }

  if (moving) { poke(2); shadowWake = 2; }
  if (wake > 0) {
    if (shadowWake > 0) { renderer.shadowMap.needsUpdate = true; shadowWake--; }
    composer.render();
    wake--;
  }
}

addEventListener('resize', resize);
resize();
requestAnimationFrame(frame);

// ── autosave: the painting on the easel, the palette and the paintings on the wall come back after a reload ────────────────────
// (see persist.js). The canvas and palette are restored before the first save, so a fresh tab never overwrites what was kept.
loadWall((canvas, i) => { world.hang(canvas, i); poke(4); shadowWake = 3; });
startAutosave([
  { key: 'canvas', engine: painter.engine, extra: () => ({ dirty: painter.dirty }),
    restored: (x) => { painter.dirty = !!x.dirty; painter._blit(true); poke(4); shadowWake = 3; } },
  { key: 'tray', engine: world.tray.tray.engine, extra: () => ({ slot: world.tray.tray.slot }),
    restored: (x) => { world.tray.tray.slot = x.slot | 0; world.tray.upload(); poke(4); } },
]);

// tiny hook for automated screenshots / debugging
window.__paint = { confirmDelete, viewPainting, leaveView, showOnEasel, showLive, get onEasel() { return onEasel; }, orbit, chairPhys, enterPaint, leavePaint, painter, world, camera, renderer, uploadPaint, ui, get mode() { return mode; }, get deskMode() { return deskMode; } };
