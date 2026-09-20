// The mixing tray on the desk: a white styrofoam-style tray whose surface IS the tray engine (src/brush/tray.js). You squeeze
// paint onto it and mix it right there in the bird's-eye view. Like the easel canvas, it shows an unlit colour map plus a
// normal map, so the room's own lights shade the paint's thickness.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Tray, TRAY_W, TRAY_H } from './brush/tray.js';
import { TABLE } from './props.js';

const DESK_TOP = 1.5;
const W = 0.6, H = W * (TRAY_H / TRAY_W);            // the paint surface, in room units (same aspect as the engine's canvas)
const RIM = 0.024;                                    // the tray's raised edge

export function addTray3D(room) {
  const tray = new Tray();
  const e = tray.engine;
  e.enableMaps();
  const mk = () => { const c = document.createElement('canvas'); c.width = TRAY_W; c.height = TRAY_H; return c; };
  const albedoCanvas = mk(), normalCanvas = mk();
  const albedoCtx = albedoCanvas.getContext('2d'), normalCtx = normalCanvas.getContext('2d');
  const albedoImg = new ImageData(e.albedo, TRAY_W, TRAY_H), normalImg = new ImageData(e.normals, TRAY_W, TRAY_H);
  let dirty = { x: 0, y: 0, w: TRAY_W, h: TRAY_H };
  e.renderAll();

  const group = new THREE.Group();
  group.position.set(TABLE.tray.x, DESK_TOP, TABLE.tray.z);
  room.add(group);

  // the tray itself: a shallow white box, and a rim round the paint surface
  const styro = new THREE.MeshStandardMaterial({ color: 0xf1efe8, roughness: 0.85 });
  const base = new THREE.Mesh(new RoundedBoxGeometry(W + RIM * 2 + 0.02, 0.028, H + RIM * 2 + 0.02, 3, 0.012), styro);
  base.position.y = 0.014; base.castShadow = base.receiveShadow = true; group.add(base);
  const rim = new THREE.Mesh(new RoundedBoxGeometry(W + RIM * 2 + 0.02, 0.02, H + RIM * 2 + 0.02, 3, 0.012), styro);
  rim.position.y = 0.036; rim.castShadow = rim.receiveShadow = true; group.add(rim);

  // the paint surface, sitting in the rim
  const albedoTex = new THREE.CanvasTexture(albedoCanvas); albedoTex.colorSpace = THREE.SRGBColorSpace; albedoTex.anisotropy = 8;
  const normalTex = new THREE.CanvasTexture(normalCanvas); normalTex.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({ map: albedoTex, normalMap: normalTex, normalScale: new THREE.Vector2(1.4, 1.4), roughness: 0.6 });
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
  surface.rotation.x = -Math.PI / 2; surface.position.y = 0.0465; surface.receiveShadow = true;
  group.add(surface);

  const api = {
    tray, group, surface,
    // hide the old wooden palette prop from room.js (an array of meshes), since this replaces it
    replace(oldMeshes) { for (const m of oldMeshes || []) m.visible = false; },
    // tray pixel under a ray, or null if it misses the paint surface
    pixelAt(raycaster) {
      const hit = raycaster.intersectObject(surface, false)[0];
      return hit && hit.uv ? [hit.uv.x * TRAY_W, (1 - hit.uv.y) * TRAY_H] : null;
    },
    // advance the tray's drying clock, and re-shade and upload whatever changed. Returns true if anything changed.
    update(seconds) {
      const r = e.setTime(seconds), rect = e.render();
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
