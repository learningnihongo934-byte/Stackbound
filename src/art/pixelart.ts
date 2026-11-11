// Renders a voxel model into a 32x32 pixel-art portrait (RGBA). Pure TS so it runs in the
// browser and in node (tools/preview.ts). 3/4 view, lit from the top-left, hue-shifted ramps,
// selective outlines and a painted backdrop per element.
import type { Elem } from '../engine/types';
import { N, ramp, vget, type VoxelModel } from './voxel';

export const ART = 32;
type RGB = [number, number, number];

const norm = (v: number[]) => { const l = Math.hypot(v[0], v[1], v[2]); return v.map(c => c / l); };
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export interface RenderOpts { size?: number; yaw?: number; pitch?: number; backdrop?: Backdrop | null; pad?: number; outline?: boolean }

export function renderPortrait(m: VoxelModel, opts: RenderOpts = {}): Uint8ClampedArray {
  const S = opts.size ?? ART;
  const yaw = opts.yaw ?? 0.52, pitch = opts.pitch ?? 0.42;
  const f = norm([-Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)]);
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  // fit: project bounding box corners
  const c = [(m.min[0] + m.max[0] + 1) / 2, (m.min[1] + m.max[1] + 1) / 2, (m.min[2] + m.max[2] + 1) / 2];
  let ru = 0, rr = 0, umin = 1e9, umax = -1e9;
  for (const x of [m.min[0], m.max[0] + 1]) for (const y of [m.min[1], m.max[1] + 1]) for (const z of [m.min[2], m.max[2] + 1]) {
    const d = [x - c[0], y - c[1], z - c[2]];
    rr = Math.max(rr, Math.abs(d[0] * r[0] + d[1] * r[1] + d[2] * r[2]));
    const uu = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
    ru = Math.max(ru, Math.abs(uu)); umin = Math.min(umin, uu); umax = Math.max(umax, uu);
  }
  const pad = opts.pad ?? 2;
  const scale = Math.max((rr * 2) / (S - pad * 2), (umax - umin) / (S - pad * 2 - 1));
  const ucenter = (umin + umax) / 2 - 0.4 * scale; // sit slightly low so there's head-room
  const L = norm([-0.55, 0.85, 0.45]);
  const out = new Uint8ClampedArray(S * S * 4);
  const depth = new Float32Array(S * S).fill(1e9);
  const matAt = new Int16Array(S * S).fill(-1);
  const ramps = m.mats.map(mt => ramp(mt.color));
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const px = (i + 0.5 - S / 2) * scale, py = (S / 2 - j - 0.5) * scale + ucenter;
    const o = [c[0] + r[0] * px + u[0] * py - f[0] * 60, c[1] + r[1] * px + u[1] * py - f[1] * 60, c[2] + r[2] * px + u[2] * py - f[2] * 60];
    const hit = march(m, o, f);
    if (!hit) continue;
    const k = j * S + i;
    let col = shadeHit(m, ramps, hit, L);
    if (hit.tint) col = mix(col, hit.tint, 0.35);
    out[k * 4] = col[0]; out[k * 4 + 1] = col[1]; out[k * 4 + 2] = col[2]; out[k * 4 + 3] = 255;
    depth[k] = hit.t; matAt[k] = hit.mat;
  }
  // internal edges: darken pixels sitting in front of a big depth step
  const edge = new Uint8Array(S * S);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const k = j * S + i;
    if (matAt[k] < 0) continue;
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const x = i + dx, y = j + dy;
      if (x < 0 || y < 0 || x >= S || y >= S) continue;
      const q = y * S + x;
      if (matAt[q] >= 0 && depth[q] - depth[k] > 3.2 / scale * 0.9) { edge[q] = 1; }
    }
  }
  for (let k = 0; k < S * S; k++) if (edge[k] && matAt[k] > 0 && m.mats[matAt[k]].cls !== 'glow') {
    const rp = ramps[matAt[k]];
    out[k * 4] = rp[1][0]; out[k * 4 + 1] = rp[1][1]; out[k * 4 + 2] = rp[1][2];
  }
  // selective outline around the silhouette
  if (opts.outline !== false) {
    const sil = new Int16Array(S * S).fill(-1);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const k = j * S + i;
      if (matAt[k] >= 0) continue;
      let best = -1, bd = -1;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = i + dx, y = j + dy;
        if (x < 0 || y < 0 || x >= S || y >= S) continue;
        const q = y * S + x;
        if (matAt[q] >= 0 && (best < 0 || depth[q] < bd)) { best = matAt[q]; bd = depth[q]; }
      }
      sil[k] = best;
    }
    for (let k = 0; k < S * S; k++) if (sil[k] >= 0) {
      const o = ramps[sil[k]][0];
      const dark: RGB = mix(o, [26, 17, 12], 0.45);
      out[k * 4] = dark[0]; out[k * 4 + 1] = dark[1]; out[k * 4 + 2] = dark[2]; out[k * 4 + 3] = 255;
      matAt[k] = -2;
    }
  }
  if (opts.backdrop) {
    const bg = backdrop(opts.backdrop, S);
    // ground shadow ellipse under the model
    const groundY = S - pad - 1.2;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const k = j * S + i;
      if (out[k * 4 + 3]) continue;
      let col: RGB = [bg[k * 4], bg[k * 4 + 1], bg[k * 4 + 2]];
      const dx = (i + 0.5 - S / 2) / (S * 0.36), dy = (j + 0.5 - groundY) / 2.1;
      if (dx * dx + dy * dy < 1) col = mix(col, [20, 12, 10], 0.38);
      out[k * 4] = col[0]; out[k * 4 + 1] = col[1]; out[k * 4 + 2] = col[2]; out[k * 4 + 3] = 255;
    }
  }
  return out;
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t].map(Math.round) as RGB;

interface Hit { t: number; mat: number; x: number; y: number; z: number; n: [number, number, number]; tint?: RGB }

function march(m: VoxelModel, o: number[], d: number[]): Hit | null {
  // slab-intersect the grid box, then 3D DDA
  let t0 = 0, t1 = 1e9;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) { if (o[a] < 0 || o[a] > N) return null; continue; }
    let ta = (0 - o[a]) / d[a], tb = (N - o[a]) / d[a];
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
  }
  if (t0 > t1) return null;
  const p = [o[0] + d[0] * (t0 + 1e-4), o[1] + d[1] * (t0 + 1e-4), o[2] + d[2] * (t0 + 1e-4)];
  let x = Math.min(N - 1, Math.max(0, Math.floor(p[0]))), y = Math.min(N - 1, Math.max(0, Math.floor(p[1]))), z = Math.min(N - 1, Math.max(0, Math.floor(p[2])));
  const step = d.map(v => (v > 0 ? 1 : -1));
  const tDelta = d.map(v => Math.abs(1 / (v || 1e-9)));
  const tMax = [0, 1, 2].map(a => { const b = [x, y, z][a] + (step[a] > 0 ? 1 : 0); return t0 + (b - p[a]) / (d[a] || 1e-9); });
  let n: [number, number, number] = [0, 0, 0];
  // entry normal = largest entry axis
  { let a = 0, bt = -1e9; for (let ax = 0; ax < 3; ax++) { const tt = (step[ax] > 0 ? 0 - o[ax] : N - o[ax]) / (d[ax] || 1e-9); if (tt > bt) { bt = tt; a = ax; } } n = [0, 0, 0]; n[a] = -step[a]; }
  let tint: RGB | undefined;
  let glassHit: Hit | null = null;
  let t = t0;
  for (let i = 0; i < N * 3 + 3; i++) {
    const v = vget(m, x, y, z);
    if (v) {
      const mt = m.mats[v];
      if (mt.cls === 'glass') { if (!tint) { tint = mt.color; glassHit = { t, mat: v, x, y, z, n: [n[0], n[1], n[2]] }; } }
      else return { t, mat: v, x, y, z, n, tint };
    }
    const a = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2);
    t = tMax[a];
    tMax[a] += tDelta[a];
    if (a === 0) x += step[0]; else if (a === 1) y += step[1]; else z += step[2];
    n = [0, 0, 0]; n[a] = -step[a];
    if (x < 0 || y < 0 || z < 0 || x >= N || y >= N || z >= N) break;
  }
  return glassHit;
}

const normCache = new WeakMap<VoxelModel, Float32Array>();
/** Smoothed surface normal per voxel: negative gradient of occupancy in a radius-2 neighbourhood. */
export function smoothNormals(m: VoxelModel): Float32Array {
  let nm = normCache.get(m);
  if (nm) return nm;
  nm = new Float32Array(N * N * N * 3);
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!vget(m, x, y, z)) continue;
    let gx = 0, gy = 0, gz = 0;
    for (let dz = -2; dz <= 2; dz++) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (!dx && !dy && !dz) continue;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > 6) continue;
      if (vget(m, x + dx, y + dy, z + dz) && m.mats[vget(m, x + dx, y + dy, z + dz)].cls !== 'glass') { const w = 1 / d2; gx += dx * w; gy += dy * w; gz += dz * w; }
    }
    const l = Math.hypot(gx, gy, gz) || 1;
    const k = (x + N * (y + N * z)) * 3;
    nm[k] = -gx / l; nm[k + 1] = -gy / l; nm[k + 2] = -gz / l;
  }
  normCache.set(m, nm);
  return nm;
}

function shadeHit(m: VoxelModel, ramps: RGB[][], h: Hit, L: number[]): RGB {
  const mt = m.mats[h.mat];
  const rp = ramps[h.mat];
  if (mt.cls === 'glow') return h.n[1] > 0 ? rp[4] : rp[3];
  if (mt.cls === 'glass') return rp[4];
  const nm = smoothNormals(m);
  const k = (h.x + N * (h.y + N * h.z)) * 3;
  let sn = [nm[k], nm[k + 1], nm[k + 2]];
  if (!sn[0] && !sn[1] && !sn[2]) sn = h.n;
  // blend the smooth normal with the face normal a little so voxel steps still read
  const bn = norm([sn[0] * 0.8 + h.n[0] * 0.2, sn[1] * 0.8 + h.n[1] * 0.2, sn[2] * 0.8 + h.n[2] * 0.2]);
  const lam = bn[0] * L[0] + bn[1] * L[1] + bn[2] * L[2];
  // ambient occlusion: count solid voxels around the face
  const [nx, ny, nz] = h.n;
  const ox = h.x + nx, oy = h.y + ny, oz = h.z + nz;
  let occ = 0;
  const axes = nx ? [[0, 1, 0], [0, 0, 1]] : ny ? [[1, 0, 0], [0, 0, 1]] : [[1, 0, 0], [0, 1, 0]];
  for (const s1 of [-1, 1]) for (const ax of axes) if (vget(m, ox + ax[0] * s1, oy + ax[1] * s1, oz + ax[2] * s1)) occ++;
  let level = lam > 0.72 ? 4 : lam > 0.25 ? 3 : lam > -0.2 ? 2 : 1;
  if (occ >= 3) level = Math.max(1, level - 1);
  if (mt.cls === 'metal' && h.n[1] > 0 && ((h.x + h.z) & 3) === 0) level = 4;
  return rp[level];
}

// ---------------------------------------------------------------- backdrops
export type Backdrop = Elem | 'spell' | 'trap' | 'gear';
const BG: Record<Backdrop, { top: RGB; bot: RGB; dot: RGB }> = {
  spell: { top: [64, 104, 98], bot: [32, 58, 56], dot: [110, 150, 136] },
  trap: { top: [96, 52, 72], bot: [50, 26, 40], dot: [140, 86, 108] },
  gear: { top: [84, 88, 96], bot: [42, 44, 50], dot: [120, 126, 134] },
  ember: { top: [116, 52, 38], bot: [62, 26, 24], dot: [158, 80, 48] },
  tide: { top: [52, 98, 120], bot: [28, 52, 72], dot: [92, 146, 160] },
  moss: { top: [72, 98, 52], bot: [38, 54, 32], dot: [112, 136, 70] },
  volt: { top: [118, 96, 44], bot: [56, 44, 30], dot: [176, 146, 66] },
  stone: { top: [96, 90, 84], bot: [52, 48, 46], dot: [128, 122, 112] },
  gleam: { top: [98, 64, 112], bot: [48, 32, 66], dot: [160, 120, 172] },
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export function backdrop(e: Backdrop, S = ART): Uint8ClampedArray {
  const p = BG[e];
  const out = new Uint8ClampedArray(S * S * 4);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const k = j * S + i;
    const t = j / (S - 1);
    const th = (BAYER[(j & 3) * 4 + (i & 3)] + 0.5) / 16;
    const band = Math.min(3, Math.floor(t * 4 + th - 0.5 + 0.5));
    let col = mix(p.top, p.bot, band / 3);
    // element motif: wallpaper dots, tiles, stripes, stars...
    const motif =
      e === 'ember' ? ((i + (j >> 2) * 2) % 6 === 0 && j % 4 === 1) :
      e === 'tide' ? (i % 8 === 0 || j % 8 === 0) :
      e === 'moss' ? ((i + j) % 7 === 0 && (i * 3 + j) % 5 < 2) :
      e === 'volt' ? (j % 6 === 0 && (i + j) % 3 !== 0) :
      e === 'stone' ? (j % 6 === 0 || (i + ((j / 6) | 0) * 4) % 8 === 0) :
      e === 'gleam' ? ((i * 7 + j * 13) % 29 === 0 || (i * 11 + j * 5) % 37 === 0) :
      e === 'spell' ? ((i + j) % 9 === 0 || (i - j + 64) % 9 === 0) && j % 2 === 0 :
      e === 'trap' ? ((i + j * 2) % 10 < 1) :
      (i % 5 === 0 && j % 5 === 0);
    if (motif && j < S * 0.78) col = mix(col, p.dot, e === 'tide' || e === 'stone' ? 0.35 : 0.6);
    // vignette
    const vx = (i + 0.5) / S - 0.5, vy = (j + 0.5) / S - 0.45;
    if (vx * vx + vy * vy > 0.2) col = mix(col, [16, 10, 8], 0.25);
    out[k * 4] = col[0]; out[k * 4 + 1] = col[1]; out[k * 4 + 2] = col[2]; out[k * 4 + 3] = 255;
  }
  return out;
}
