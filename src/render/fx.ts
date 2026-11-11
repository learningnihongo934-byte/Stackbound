// Particle and effect helpers built on instanced voxel cubes.
import * as THREE from 'three';
import { onTick, tween, ease, animCfg } from './anim';
import { TILE_TOP } from './stage';

const CUBE = new THREE.BoxGeometry(1, 1, 1);
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpE = new THREE.Euler();

/** Physics debris: cubes that fly, spin, bounce on the board and shrink away. */
export class Debris {
  mesh: THREE.InstancedMesh;
  private n = 0;
  private p: Float32Array; private v: Float32Array; private r: Float32Array; private life: Float32Array; private size: Float32Array;
  constructor(scene: THREE.Object3D, private cap = 4000) {
    this.mesh = new THREE.InstancedMesh(CUBE, new THREE.MeshStandardMaterial({ roughness: 0.65 }), cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.p = new Float32Array(cap * 3); this.v = new Float32Array(cap * 3); this.r = new Float32Array(cap * 3);
    this.life = new Float32Array(cap); this.size = new Float32Array(cap);
    scene.add(this.mesh);
    onTick(dt => { this.step(dt); });
  }
  spawn(pos: THREE.Vector3, vel: THREE.Vector3, color: THREE.Color, size: number, life = 1.4) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.p.set([pos.x, pos.y, pos.z], i * 3);
    this.v.set([vel.x, vel.y, vel.z], i * 3);
    this.r.set([Math.random() * 6, Math.random() * 6, Math.random() * 6], i * 3);
    this.life[i] = life * (0.7 + Math.random() * 0.6);
    this.size[i] = size;
    this.mesh.setColorAt(i, color);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  burst(center: THREE.Vector3, color: THREE.Color, count: number, speed = 2.4, size = 0.045) {
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, up = 0.5 + Math.random();
      c.copy(color).multiplyScalar(0.75 + Math.random() * 0.5);
      this.spawn(center, new THREE.Vector3(Math.cos(a) * speed * Math.random(), up * speed, Math.sin(a) * speed * Math.random()), c, size * (0.6 + Math.random() * 0.8));
    }
  }
  private step(dt: number) {
    let w = 0;
    const g = -9.8;
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      const k = i * 3;
      this.v[k + 1] += g * dt;
      this.p[k] += this.v[k] * dt; this.p[k + 1] += this.v[k + 1] * dt; this.p[k + 2] += this.v[k + 2] * dt;
      const floor = Math.abs(this.p[k]) < 2.6 && Math.abs(this.p[k + 2]) < 2.6 ? TILE_TOP : -0.42;
      if (this.p[k + 1] < floor + this.size[i] / 2) {
        this.p[k + 1] = floor + this.size[i] / 2;
        this.v[k + 1] *= -0.35; this.v[k] *= 0.6; this.v[k + 2] *= 0.6;
      }
      this.r[k] += dt * 5; this.r[k + 1] += dt * 4;
      const s = this.size[i] * Math.min(1, this.life[i] * 2.5);
      if (w !== i) { // compact
        this.p.copyWithin(w * 3, k, k + 3); this.v.copyWithin(w * 3, k, k + 3); this.r.copyWithin(w * 3, k, k + 3);
        this.life[w] = this.life[i]; this.size[w] = this.size[i];
        const col = new THREE.Color(); this.mesh.getColorAt(i, col); this.mesh.setColorAt(w, col);
      }
      tmpE.set(this.r[w * 3], this.r[w * 3 + 1], 0);
      tmpQ.setFromEuler(tmpE);
      tmpM.compose(tmpP.set(this.p[w * 3], this.p[w * 3 + 1], this.p[w * 3 + 2]), tmpQ, tmpS.set(s, s, s));
      this.mesh.setMatrixAt(w, tmpM);
      w++;
    }
    this.n = w;
    this.mesh.count = w;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/** Fly a set of voxel points from `from` positions into `to` positions (both local to `parent`). */
export function assemble(parent: THREE.Object3D, to: Float32Array, colors: Float32Array, n: number, from: (i: number, out: THREE.Vector3) => void, voxSize: number, ms = 700): Promise<void> {
  const mesh = new THREE.InstancedMesh(CUBE, new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: 0x3a2a10 }), n);
  mesh.frustumCulled = false;
  const starts = new Float32Array(n * 3);
  const delay = new Float32Array(n);
  let maxY = 0;
  for (let i = 0; i < n; i++) maxY = Math.max(maxY, to[i * 3 + 1]);
  for (let i = 0; i < n; i++) {
    from(i, tmpP);
    starts.set([tmpP.x, tmpP.y, tmpP.z], i * 3);
    delay[i] = (to[i * 3 + 1] / (maxY || 1)) * 0.45 + Math.random() * 0.12;
    mesh.setColorAt(i, new THREE.Color(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]));
  }
  parent.add(mesh);
  return tween(animCfg.reduceMotion ? 120 : ms, k => {
    for (let i = 0; i < n; i++) {
      const kk = Math.max(0, Math.min(1, (k - delay[i] * 0.6) / 0.55));
      const e = ease.outCubic(kk);
      const arc = Math.sin(kk * Math.PI) * 0.25;
      tmpP.set(
        starts[i * 3] + (to[i * 3] - starts[i * 3]) * e,
        starts[i * 3 + 1] + (to[i * 3 + 1] - starts[i * 3 + 1]) * e + arc,
        starts[i * 3 + 2] + (to[i * 3 + 2] - starts[i * 3 + 2]) * e,
      );
      const s = voxSize * (0.4 + 0.6 * e);
      tmpE.set((1 - e) * 4, (1 - e) * 3, 0);
      tmpM.compose(tmpP, tmpQ.setFromEuler(tmpE), tmpS.set(s, s, s));
      mesh.setMatrixAt(i, tmpM);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, ease.linear).then(() => { parent.remove(mesh); mesh.dispose(); (mesh.material as THREE.Material).dispose(); });
}

/** A glowing pellet that travels from a to b (with an optional arc), leaving sparks. */
export function projectile(scene: THREE.Object3D, debris: Debris, a: THREE.Vector3, b: THREE.Vector3, color: THREE.Color, arc: number, ms: number): Promise<void> {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(2.2), toneMapped: false }));
  const shell = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, toneMapped: false }));
  g.add(core, shell);
  scene.add(g);
  let last = 0;
  return tween(ms, k => {
    g.position.lerpVectors(a, b, k);
    g.position.y += Math.sin(k * Math.PI) * arc;
    g.rotation.set(k * 9, k * 7, 0);
    if (k - last > 0.04) {
      last = k;
      debris.spawn(g.position, new THREE.Vector3((Math.random() - 0.5) * 0.4, Math.random() * 0.4, (Math.random() - 0.5) * 0.4), color, 0.035, 0.5);
    }
  }, ease.linear).then(() => {
    scene.remove(g);
    for (const m of [core, shell]) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
  });
}

/** Expanding flat ring on the board. */
export function ring(scene: THREE.Object3D, at: THREE.Vector3, color: THREE.Color, radius = 1.2, ms = 450) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.copy(at).setY(TILE_TOP + 0.02);
  scene.add(m);
  return tween(ms, k => { m.scale.setScalar(0.1 + k * radius); (m.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k); }, ease.outCubic).then(() => { scene.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose(); });
}

/** Sparkles that drift upward (heals, buffs). */
export function sparkle(debris: Debris, at: THREE.Vector3, color: THREE.Color, n = 18) {
  for (let i = 0; i < n; i++) {
    const p = at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, Math.random() * 0.6, (Math.random() - 0.5) * 0.6));
    debris.spawn(p, new THREE.Vector3((Math.random() - 0.5) * 0.3, 2 + Math.random() * 1.5, (Math.random() - 0.5) * 0.3), color, 0.04, 0.45);
  }
}
