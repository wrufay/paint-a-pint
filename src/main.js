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
const HOME = { target: new THREE.Vector3(-0.3, 1.25, -0.4), fov: 30 };
HOME.pos = new THREE.Vector3(12.3, 9.3, 12.8).add(HOME.target).sub(new THREE.Vector3(-0.3, 1.9, -0.6)).multiplyScalar(1.0);
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
}

function applyPose(p) { camera.position.copy(p.pos); camera.quaternion.copy(p.quat); camera.fov = p.fov; camera.updateProjectionMatrix(); }

function homePose() {
  const c = new THREE.PerspectiveCamera(); c.position.copy(HOME.pos); c.lookAt(HOME.target);
  return { pos: HOME.pos.clone(), quat: c.quaternion.clone(), fov: HOME.fov };
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

function paintPose() {
  if (deskMode) return deskPose();
  world.easel.updateMatrixWorld(true);
  const q = new THREE.Quaternion(); world.canvasFace.getWorldQuaternion(q);
  const c = world.canvasFace.getWorldPosition(new THREE.Vector3());
  const n = new THREE.Vector3(0, 0, 1).applyQuaternion(q), right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
  const fov = 30, half = Math.tan(THREE.MathUtils.degToRad(fov / 2)), aspect = camera.aspect;
  const wide = aspect > 1.25;
  const distH = world.CH / 0.68 / (2 * half);
  const distW = world.CW / (wide ? 0.68 : 0.86) / (2 * half * aspect);
  const dist = Math.max(distH, distW);
  const shift = 0; // centred on the page; on wide screens the card sits to the right of it
  const lift = wide ? 0 : -0.16 * 2 * half * dist; // narrow screens: canvas sits high, card below
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const pos = c.clone().addScaledVector(n, dist).addScaledVector(right, shift).addScaledVector(up, lift);
  return { pos, quat: q, fov };
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
  mode = 'travelling';
  hover(false);
  // paint mode opens on the desk: the canvas lies flat and the camera goes overhead (the card's button stands it back up)
  deskMode = true; ui.setDesk(true); view.onChange();
  travel(withEasel(easelFlat, paintPose), () => {
    mode = 'paint';
    document.body.classList.remove('travelling'); document.body.classList.add('painting');
    layoutPaper();
    paintEl.classList.add('on');
    poke(6);
  }, { from: easelUp, to: easelFlat, legs: false });
}

// The two ways to paint: at the standing easel, or with the canvas put down flat on the desk (bird's-eye view).
// Switching happens inside paint mode: the paper fades out, the easel and camera move, the paper fades back in.
let deskMode = true;   // paint mode opens on the desk, with the canvas flat and the tubes and tray around it
const view = {
  get down() { return deskMode; },
  onChange: () => {},
  set(down) {
    if (mode !== 'paint' || down === deskMode) return;
    mode = 'travelling'; painter.up(); paintEl.classList.remove('on');
    document.getElementById('cursor').style.opacity = 0;
    const from = down ? easelUp : easelFlat, to = down ? easelFlat : easelUp;
    deskMode = down; view.onChange(); ui.setDesk(down);
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
  const wasDown = deskMode; deskMode = true; view.onChange(); ui.setDesk(true);   // the next visit starts on the desk again
  travel(homePose(), () => {
    mode = 'room';
    document.body.classList.remove('travelling');
    if (hung) {
      const slot = world.hang(hung);
      slot.popT = performance.now();
      painter.clear();
      uploadPaint();
    }
  }, wasDown ? { from: easelFlat, to: easelUp, legs: true } : undefined);   // lift the easel back up if it was lying flat
}

const ui = initAcrylicUI(painter, { onBack: () => leavePaint(true), view, isPainting: () => mode === 'paint' });
addEventListener('keydown', (e) => { if (e.key === 'Escape') leavePaint(false); });

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
  if (!world.props) return null;
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

// ── hover tooltip: what a tube or brush is ──────────────────────────────────────────────────────────────────────────
const OPACITY_NAME = { opaque: 'opaque', semi: 'semi-opaque', transparent: 'transparent' };
const OPACITY_NOTE = { opaque: 'covers what is under it', semi: 'partly covers, partly lets through', transparent: 'glazes: lets what is under it show' };
const SHAPE_TIP = {
  flat: ['Flat brush', 'A row of bristles. Broad strokes, and edges when you turn it on its side.'],
  filbert: ['Filbert brush', 'An oval tip. Soft, rounded marks, and the width follows your pressure.'],
  round: ['Round brush', 'A round tip. Click for a dab, drag for a soft-edged line.'],
};
const tip = document.createElement('div');
tip.className = 'note';
tip.style.cssText = 'position:fixed;left:0;top:0;z-index:30;display:none;max-width:250px;padding:16px 14px 12px;pointer-events:none;font-size:var(--text-sm);line-height:1.4;color:var(--ink);';
document.body.appendChild(tip);
const tipLine = (text, css) => { const d = document.createElement('div'); d.textContent = text; d.style.cssText = css || ''; tip.appendChild(d); return d; };
function showTip(o) {
  if (!o) { tip.style.display = 'none'; return; }
  tip.replaceChildren();
  const paint = o.userData.paint;
  if (paint) {
    const head = document.createElement('div'); head.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:4px;';
    const dot = document.createElement('span'); dot.style.cssText = `flex:none;width:18px;height:18px;border-radius:50%;background:${paint.hex};box-shadow:0 0 0 1.5px var(--ink);`;
    const name = document.createElement('strong'); name.textContent = paint.name[0].toUpperCase() + paint.name.slice(1); name.style.cssText = 'font-weight:var(--weight-bold);';
    head.append(dot, name); tip.appendChild(head);
    tipLine([paint.brand.replace('Winsor & Newton ', 'W&N '), paint.code, paint.num ? 'No. ' + paint.num : ''].filter(Boolean).join(' · '), 'font-size:var(--text-xs);color:var(--ink-soft);margin-bottom:6px;');
    tipLine(`${OPACITY_NAME[paint.opacity] || paint.opacity}: ${OPACITY_NOTE[paint.opacity] || ''}`, 'margin-bottom:6px;');
    if (paint.blurb) tipLine(paint.blurb);
  } else {
    const [title, line] = SHAPE_TIP[o.userData.shape] || [o.userData.shape, ''];
    tipLine(title, 'font-weight:var(--weight-bold);margin-bottom:4px;'); tipLine(line);
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
renderer.domElement.addEventListener('pointermove', (e) => {
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  if (trayDrag) { trayMove(e); return; }
  if (mode === 'room') hover(pick(e));
  if (mode === 'room' || mode === 'paint') setHoverProp(pickProp(e));
  moveTip(e);
  renderer.domElement.style.cursor = hoverProp || hovering ? 'pointer' : trayPixel(e) ? 'crosshair' : '';
});
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; if (mode === 'paint' && !pickProp(e)) trayDown(e); });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (trayUp(e)) { downAt = null; return; }
  if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 6 && (mode === 'room' || mode === 'paint')) {
    const prop = pickProp(e);
    if (prop) {
      if (prop.userData.paint) ui.choose(prop.userData.paint);
      if (prop.userData.shape) ui.setShape(prop.userData.shape);
      if (mode === 'room') enterPaint();
    } else if (mode === 'room' && pick(e)) enterPaint();
  }
  downAt = null;
});
renderer.domElement.addEventListener('pointercancel', (e) => { trayUp(e); downAt = null; });

// ── loop ─────────────────────────────────────────────────────────────────────
let texT = 0;
const sph = new THREE.Spherical(), off = new THREE.Vector3(), tmp = new THREE.Vector3();
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
    // gentle limited parallax orbit around the diorama
    mouseSm.lerp(mouse, 0.05);
    const drifting = mouseSm.distanceToSquared(mouse) > 2e-6;   // still catching up with the pointer
    if (drifting || wake > 0) {
      off.subVectors(HOME.pos, HOME.target); sph.setFromVector3(off);
      sph.theta += -mouseSm.x * 0.12; sph.phi += mouseSm.y * 0.05;
      tmp.setFromSpherical(sph).add(HOME.target);
      camera.position.copy(tmp); camera.lookAt(HOME.target);
      camera.fov = HOME.fov; camera.updateProjectionMatrix();
      if (drifting) poke(2);
    }
  }

  painter.tick(now);
  if (world.tray && world.tray.update(now / 1000)) poke(2);   // the tray dries too
  // the 3D easel only needs the new pixels when it can be seen (the paint overlay hides it), and not every frame
  if (mode !== 'paint' && painter.changed && now - texT > 100) { uploadPaint(); painter.changed = false; texT = now; poke(2); }

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

// tiny hook for automated screenshots / debugging
window.__paint = { enterPaint, leavePaint, painter, world, camera, renderer, uploadPaint, ui, get mode() { return mode; }, get deskMode() { return deskMode; } };
