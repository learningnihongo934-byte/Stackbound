// Voxel model -> Three.js mesh: exposed faces only, per-vertex ambient occlusion, vertex colours,
// one draw group per material class (solid / metal / glow / glass).
import * as THREE from 'three';
import { getModel } from '../art/models';
import { N, vget, type MatClass, type VoxelModel } from '../art/voxel';

export const VOX = 1.0 / 24; // world size of one voxel for a lead creature

const FACES: { n: [number, number, number]; c: [number, number, number][] }[] = [
  { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
  { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
];
const CLASSES: MatClass[] = ['solid', 'metal', 'glow', 'glass'];
const AO = [0.5, 0.68, 0.84, 1];

function hash(x: number, y: number, z: number) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export interface VoxelGeo { geo: THREE.BufferGeometry; height: number; width: number; classes: MatClass[] }
const geoCache = new Map<string, VoxelGeo>();

export function voxelGeometry(id: string): VoxelGeo {
  const hit = geoCache.get(id);
  if (hit) return hit;
  const m = getModel(id);
  const buckets: Record<MatClass, { pos: number[]; nor: number[]; col: number[]; idx: number[] }> = {
    solid: { pos: [], nor: [], col: [], idx: [] }, metal: { pos: [], nor: [], col: [], idx: [] },
    glow: { pos: [], nor: [], col: [], idx: [] }, glass: { pos: [], nor: [], col: [], idx: [] },
  };
  const solidAt = (x: number, y: number, z: number) => { const v = vget(m, x, y, z); return v > 0 && m.mats[v].cls !== 'glass'; };
  const ox = 12, oy = m.min[1], oz = 12;
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = vget(m, x, y, z);
    if (!v) continue;
    const mat = m.mats[v];
    const glass = mat.cls === 'glass';
    const b = buckets[mat.cls];
    const jitter = 0.93 + hash(x, y, z) * 0.12;
    const base = mat.color.map(c => (c / 255) ** 2.2 * jitter); // to linear
    for (const f of FACES) {
      const nx = x + f.n[0], ny = y + f.n[1], nz = z + f.n[2];
      const nv = vget(m, nx, ny, nz);
      if (nv && (glass ? true : m.mats[nv].cls !== 'glass')) continue;
      const start = b.pos.length / 3;
      const aos: number[] = [];
      for (const c of f.c) {
        // AO from the three neighbours around this corner in the face's plane
        const cx = x + c[0], cy = y + c[1], cz = z + c[2];
        const a = f.n[0] ? 0 : f.n[1] ? 1 : 2;
        const ua = (a + 1) % 3, va = (a + 2) % 3;
        const du = [0, 0, 0], dv = [0, 0, 0];
        du[ua] = c[ua] ? 1 : -1;
        dv[va] = c[va] ? 1 : -1;
        const px = x + f.n[0], py = y + f.n[1], pz = z + f.n[2];
        const s1 = solidAt(px + du[0], py + du[1], pz + du[2]) ? 1 : 0;
        const s2 = solidAt(px + dv[0], py + dv[1], pz + dv[2]) ? 1 : 0;
        const cr = solidAt(px + du[0] + dv[0], py + du[1] + dv[1], pz + du[2] + dv[2]) ? 1 : 0;
        const ao = mat.cls === 'glow' ? 1 : AO[s1 && s2 ? 0 : 3 - (s1 + s2 + cr)];
        aos.push(ao);
        b.pos.push((cx - ox) * VOX, (cy - oy) * VOX, (cz - oz) * VOX);
        b.nor.push(...f.n);
        b.col.push(base[0] * ao, base[1] * ao, base[2] * ao);
      }
      if (aos[0] + aos[2] > aos[1] + aos[3]) b.idx.push(start, start + 1, start + 2, start, start + 2, start + 3);
      else b.idx.push(start + 1, start + 2, start + 3, start + 1, start + 3, start);
    }
  }
  const pos: number[] = [], nor: number[] = [], col: number[] = [], idx: number[] = [];
  const geo = new THREE.BufferGeometry();
  const classes: MatClass[] = [];
  for (const cls of CLASSES) {
    const b = buckets[cls];
    if (!b.idx.length) continue;
    const off = pos.length / 3;
    const startIdx = idx.length;
    pos.push(...b.pos); nor.push(...b.nor); col.push(...b.col);
    for (const i of b.idx) idx.push(i + off);
    geo.addGroup(startIdx, b.idx.length, classes.length);
    classes.push(cls);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const out = { geo, height: (m.max[1] - m.min[1] + 1) * VOX, width: (m.max[0] - m.min[0] + 1) * VOX, classes };
  geoCache.set(id, out);
  return out;
}

export function makeMaterials(classes: MatClass[]): THREE.Material[] {
  return classes.map(c => {
    switch (c) {
      case 'metal': return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.8 });
      case 'glow': return new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new THREE.Color(1.6, 1.6, 1.6) });
      case 'glass': return new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.38, depthWrite: false });
      default: return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 });
    }
  });
}

export function voxelMesh(id: string): { mesh: THREE.Mesh; height: number; width: number } {
  const g = voxelGeometry(id);
  const mesh = new THREE.Mesh(g.geo, makeMaterials(g.classes));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return { mesh, height: g.height, width: g.width };
}

/** Voxel centres (local, same frame as the mesh) and colours, for particle effects. */
export function voxelPoints(id: string, maxPts = 900): { p: Float32Array; c: Float32Array; n: number } {
  const m: VoxelModel = getModel(id);
  const pts: number[] = [], cols: number[] = [];
  const oy = m.min[1];
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = vget(m, x, y, z);
    if (!v) continue;
    // surface voxels only
    if (vget(m, x + 1, y, z) && vget(m, x - 1, y, z) && vget(m, x, y + 1, z) && vget(m, x, y - 1, z) && vget(m, x, y, z + 1) && vget(m, x, y, z - 1)) continue;
    pts.push((x + 0.5 - 12) * VOX, (y + 0.5 - oy) * VOX, (z + 0.5 - 12) * VOX);
    const c = m.mats[v].color;
    cols.push((c[0] / 255) ** 2.2, (c[1] / 255) ** 2.2, (c[2] / 255) ** 2.2);
  }
  let n = pts.length / 3;
  if (n > maxPts) { // thin out evenly
    const step = n / maxPts;
    const p2: number[] = [], c2: number[] = [];
    for (let i = 0; i < maxPts; i++) { const k = Math.floor(i * step); p2.push(pts[k * 3], pts[k * 3 + 1], pts[k * 3 + 2]); c2.push(cols[k * 3], cols[k * 3 + 1], cols[k * 3 + 2]); }
    return { p: new Float32Array(p2), c: new Float32Array(c2), n: maxPts };
  }
  return { p: new Float32Array(pts), c: new Float32Array(cols), n };
}
