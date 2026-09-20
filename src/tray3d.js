// The mixing palette on the desk: a wooden oval palette with a thumb hole and a kidney-shaped dent, like the standard artist's
// palette. Its surface IS the tray engine (src/brush/tray.js): you squeeze paint onto it and mix it right there in the
// bird's-eye view. Like the easel canvas, it shows an unlit colour map plus a normal map, so the room's own lights shade the
// paint's thickness.
import * as THREE from 'three';
import { Tray, TRAY_W, TRAY_H } from './brush/tray.js';
import { TABLE } from './props.js';

const DESK_TOP = 1.5;
const W = 0.52, H = W * (TRAY_H / TRAY_W);            // the palette's bounding box, in room units (same aspect as the engine's canvas)
const THICK = 0.018;                                   // board thickness

// The outline: an ellipse with a smooth concave dent at the front right, and a thumb hole beside it. Coordinates are in room
// units with the origin at the bounding box's corner, so they double as UVs once divided by (W, H).
function paletteShape() {
  const pts = [], N = 160, dentAt = -0.85, dentWidth = 0.26, dentDepth = 0.17;
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2;
    const d = Math.atan2(Math.sin(th - dentAt), Math.cos(th - dentAt));
    const k = 1 - dentDepth * Math.exp(-(d * d) / (2 * dentWidth * dentWidth));
    pts.push(new THREE.Vector2((0.5 + 0.5 * k * Math.cos(th)) * W, (0.5 + 0.5 * k * Math.sin(th)) * H));
  }
  const shape = new THREE.Shape(pts);
  const hole = new THREE.Path();
  hole.absellipse(0.36 * W, 0.24 * H, 0.055 * W, 0.075 * H, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return shape;
}

export function addTray3D(room) {
  const tray = new Tray();
  const e = tray.engine;
  e.enableMaps();
  const mk = () => { const c = document.createElement('canvas'); c.width = TRAY_W; c.height = TRAY_H; return c; };
  const albedoCanvas = mk(), normalCanvas = mk();
  const albedoCtx = albedoCanvas.getContext('2d'), normalCtx = normalCanvas.getContext('2d');
  const albedoImg = new ImageData(e.albedo, TRAY_W, TRAY_H), normalImg = new ImageData(e.normals, TRAY_W, TRAY_H);
  e.renderAll();

  const group = new THREE.Group();
  group.position.set(TABLE.palette.x, DESK_TOP, TABLE.palette.z);
  group.rotation.y = TABLE.palette.turn;
  room.add(group);
  // centre the palette on the group's origin (the shape's origin is its corner)
  const inner = new THREE.Group(); inner.position.set(-W / 2, 0, H / 2); inner.rotation.x = -Math.PI / 2; group.add(inner);

  const shape = paletteShape();
  // the wooden board, with a slightly darker bevelled edge
  const board = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: THICK, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.003, bevelSegments: 2, curveSegments: 40 }),
    new THREE.MeshStandardMaterial({ color: 0xc99a62, roughness: 0.65 }));
  board.castShadow = board.receiveShadow = true; inner.add(board);

  // the paint surface: the same outline, UV-mapped over the engine's canvas
  const geo = new THREE.ShapeGeometry(shape, 40);
  const uv = geo.attributes.uv, pos = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / W, pos.getY(i) / H);
  const albedoTex = new THREE.CanvasTexture(albedoCanvas); albedoTex.colorSpace = THREE.SRGBColorSpace; albedoTex.anisotropy = 8;
  const normalTex = new THREE.CanvasTexture(normalCanvas); normalTex.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({ map: albedoTex, normalMap: normalTex, normalScale: new THREE.Vector2(1.4, 1.4), roughness: 0.55 });
  const surface = new THREE.Mesh(geo, mat);
  surface.position.z = THICK + 0.0035; surface.receiveShadow = true;
  inner.add(surface);

  const api = {
    tray, group, surface,
    // hide the old wooden palette prop from room.js (an array of meshes), since this replaces it
    replace(oldMeshes) { for (const m of oldMeshes || []) m.visible = false; },
    // tray pixel under a ray, or null if it misses the paint surface (the thumb hole and the dent are not paintable)
    pixelAt(raycaster) {
      const hit = raycaster.intersectObject(surface, false)[0];
      return hit && hit.uv ? [hit.uv.x * TRAY_W, (1 - hit.uv.y) * TRAY_H] : null;
    },
    // advance the tray's drying clock, and re-shade and upload whatever changed. Returns true if anything changed.
    update(seconds) {
      e.setTime(seconds);
      const rect = e.render();
      if (rect) {
        albedoCtx.putImageData(albedoImg, 0, 0, rect.x, rect.y, rect.w, rect.h);
        normalCtx.putImageData(normalImg, 0, 0, rect.x, rect.y, rect.w, rect.h);
        albedoTex.needsUpdate = true; normalTex.needsUpdate = true;
        return true;
      }
      return false;
    },
    // put the whole tray on the GPU (first frame)
    upload() {
      e.renderAll();
      albedoCtx.putImageData(albedoImg, 0, 0); normalCtx.putImageData(normalImg, 0, 0);
      albedoTex.needsUpdate = true; normalTex.needsUpdate = true;
    },
  };
  api.upload();
  return api;
}
