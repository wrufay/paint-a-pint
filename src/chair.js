// Drag the office chair around the floor. It is a point mass (x, z) with a yaw, moved by a spring to the pointer while you hold it, and
// by momentum and rolling friction once you let go. It bumps off the walls, the desk and the bed, and, like a caster chair, it swivels
// to line up with the way it is travelling. No DOM in here: main.js feeds it pointer rays and calls step() every frame.
import * as THREE from 'three';

const K = 42;            // spring stiffness pulling the chair to the pointer (1/s^2)
const C = 9.5;           // spring damping (1/s): a little under critical, so it lags and overshoots slightly
const MAX_SPEED = 14;    // units per second
const FRICTION = 1.15;   // rolling friction once released: velocity decays like exp(-FRICTION t)
const RESTITUTION = 0.38;
const SWIVEL = 2.4;      // how strongly the chair turns to follow its travel direction
const SPIN_DAMP = 3.2;

export class ChairPhysics {
  // rects: obstacles as [x0, x1, z0, z1]; bounds: { minX, maxX, minZ, maxZ } for the chair's centre; radius: the base's collision circle
  constructor(chair, { rects, bounds, radius }) {
    this.chair = chair; this.rects = rects; this.b = bounds; this.R = radius;
    this.vx = 0; this.vz = 0; this.w = 0;           // velocity and yaw rate
    this.drag = null;                                // while held: { tx, tz, dx, dz, plane }
    this.home = { x: chair.position.x, z: chair.position.z, yaw: chair.rotation.y };
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.pt = new THREE.Vector3();
  }

  get held() { return !!this.drag; }
  get speed() { return Math.hypot(this.vx, this.vz); }
  get active() { return this.held || this.speed > 0.02 || Math.abs(this.w) > 0.02; }

  // the first hit of a raycaster on the chair, or null
  hit(raycaster) { return raycaster.intersectObject(this.chair, true)[0] || null; }

  // pick the chair up at `hit`. It keeps its offset from the pointer, so it does not jump to the cursor.
  grab(raycaster, hit) {
    this.plane.constant = -hit.point.y;              // drag on the horizontal plane through the grabbed point
    const p = this.chair.position;
    this.drag = { tx: p.x, tz: p.z, dx: p.x - hit.point.x, dz: p.z - hit.point.z };
  }

  // move the target under the pointer (the ray from the camera through it)
  dragTo(raycaster) {
    if (!this.drag || !raycaster.ray.intersectPlane(this.plane, this.pt)) return;
    this.drag.tx = this.pt.x + this.drag.dx; this.drag.tz = this.pt.z + this.drag.dz;
  }

  release() { this.drag = null; }

  reset() { this.vx = this.vz = this.w = 0; this.drag = null; const h = this.home; this.chair.position.x = h.x; this.chair.position.z = h.z; this.chair.rotation.y = h.yaw; }

  step(dt) {
    dt = Math.min(dt, 1 / 30);
    const c = this.chair, p = c.position;
    if (this.drag) {
      this.vx += (K * (this.drag.tx - p.x) - C * this.vx) * dt;
      this.vz += (K * (this.drag.tz - p.z) - C * this.vz) * dt;
    } else {
      const f = Math.exp(-FRICTION * dt);
      this.vx *= f; this.vz *= f;
      if (Math.hypot(this.vx, this.vz) < 0.04) this.vx = this.vz = 0;
    }
    const sp = Math.hypot(this.vx, this.vz);
    if (sp > MAX_SPEED) { this.vx *= MAX_SPEED / sp; this.vz *= MAX_SPEED / sp; }

    // integrate in two half steps so a fast chair does not tunnel through a wall
    for (let i = 0; i < 2; i++) { p.x += this.vx * dt / 2; p.z += this.vz * dt / 2; this.collide(); }

    // swivel: turn so the chair's axis lines up with the direction of travel (either end leading, whichever is nearer)
    const speed = Math.hypot(this.vx, this.vz);
    if (speed > 0.05) {
      const yaw = c.rotation.y, fx = -Math.sin(yaw), fz = -Math.cos(yaw);    // where the seat faces
      const ux = this.vx / speed, uz = this.vz / speed;
      const cross = fx * uz - fz * ux, dot = fx * ux + fz * uz;
      this.w += cross * Math.sign(dot || 1) * SWIVEL * Math.min(speed, 6) * dt;
    }
    this.w *= Math.exp(-SPIN_DAMP * dt);
    if (Math.abs(this.w) < 0.01 && speed < 0.05) this.w = 0;
    c.rotation.y += this.w * dt;
  }

  collide() {
    const p = this.chair.position, R = this.R, b = this.b;
    // the room's edges: the walls on the left and back, the edge of the floor in front and on the right
    if (p.x < b.minX) { p.x = b.minX; this.bounce(1, 0); } else if (p.x > b.maxX) { p.x = b.maxX; this.bounce(-1, 0); }
    if (p.z < b.minZ) { p.z = b.minZ; this.bounce(0, 1); } else if (p.z > b.maxZ) { p.z = b.maxZ; this.bounce(0, -1); }
    for (const [x0, x1, z0, z1] of this.rects) {
      const cx = Math.min(Math.max(p.x, x0), x1), cz = Math.min(Math.max(p.z, z0), z1);
      let dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
      if (d >= R) continue;
      let nx, nz, pen;
      if (d > 1e-6) { nx = dx / d; nz = dz / d; pen = R - d; }
      else {                                            // the centre is inside the rectangle: push out the shortest way
        const l = p.x - x0, r = x1 - p.x, t = p.z - z0, bo = z1 - p.z, m = Math.min(l, r, t, bo);
        if (m === l) { nx = -1; nz = 0; } else if (m === r) { nx = 1; nz = 0; } else if (m === t) { nx = 0; nz = -1; } else { nx = 0; nz = 1; }
        pen = m + R;
      }
      p.x += nx * pen; p.z += nz * pen;
      this.bounce(nx, nz);
    }
  }

  // reflect the velocity off a surface with unit normal (nx, nz), losing some energy, and kick the spin from the sliding part
  bounce(nx, nz) {
    const vn = this.vx * nx + this.vz * nz;
    if (vn >= 0) return;
    this.vx -= (1 + RESTITUTION) * vn * nx; this.vz -= (1 + RESTITUTION) * vn * nz;
    const vt = this.vx * -nz + this.vz * nx;
    this.w += vt * 0.35 - vn * 0.05 * Math.sign(vt || 1);
  }
}
