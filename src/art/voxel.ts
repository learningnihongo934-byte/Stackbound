// Voxel models from a tiny CSG language. One model per creature feeds both the 3D battle mesh
// and the 32x32 pixel-art card portrait, so cards and battle always match.
//
// Model source: commands separated by newlines or ';'. Numbers are voxel units in a 24^3 grid
// (x right, y up, z toward the viewer; center x=12, z=12). The last token is a palette key;
// '.' carves. A trailing 'm' also draws the primitive mirrored across x=12.
//   E cx cy cz rx ry rz k        ellipsoid
//   B x0 y0 z0 x1 y1 z1 k        box
//   R x0 y0 z0 x1 y1 z1 r k      rounded box
//   C cx cz y0 y1 r k            cylinder (y axis)    X cy cz x0 x1 r k   (x axis)    Z cx cy z0 z1 r k   (z axis)
//   K cx cz y0 y1 r0 r1 k        cone / frustum (y axis)
//   L ax ay az bx by bz r k      capsule between two points
//   T cx cy cz R r k             torus around y        TZ cx cy cz R r k   torus around z
//   DI cx cy cz rx ry rz k       diamond (octahedron)
//   EYE cx cy cz r               eye (k + w highlight)
// Prefix any op with @ to only repaint voxels that already exist.
// Palette: 'a:#hex b:*#hex g:~#hex m:^#hex'  * = glows, ~ = glass, ^ = metal.

export const N = 24;
export type MatClass = 'solid' | 'glow' | 'glass' | 'metal';
export interface Mat { key: string; color: [number, number, number]; cls: MatClass }
export interface VoxelModel { id: string; grid: Uint8Array; mats: Mat[]; min: [number, number, number]; max: [number, number, number] }

type Prim = { f: (x: number, y: number, z: number) => boolean; mat: string; bb: [number, number, number, number, number, number]; paint?: boolean };

export function hexToRgb(h: string): [number, number, number] {
  const v = parseInt(h.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

const DEFAULT_PAL = 'k:#1f1611 w:#fffdf4 p:#f2a0a8';

function parsePal(src: string): Mat[] {
  const mats: Mat[] = [{ key: '', color: [0, 0, 0], cls: 'solid' }];
  const seen = new Set<string>();
  for (const tok of (src + ' ' + DEFAULT_PAL).trim().split(/\s+/)) {
    const [key, val] = tok.split(':');
    if (!key || !val || seen.has(key)) continue;
    seen.add(key);
    let cls: MatClass = 'solid', hex = val;
    if (val[0] === '*') { cls = 'glow'; hex = val.slice(1); }
    else if (val[0] === '~') { cls = 'glass'; hex = val.slice(1); }
    else if (val[0] === '^') { cls = 'metal'; hex = val.slice(1); }
    mats.push({ key, color: hexToRgb(hex), cls });
  }
  return mats;
}

function prims(src: string): Prim[] {
  const out: Prim[] = [];
  const cmds = src.split(/[\n;]/).map(s => s.trim()).filter(s => s && !s.startsWith('//'));
  for (const cmd of cmds) {
    const t = cmd.split(/\s+/);
    let op = t[0];
    const paint = op.startsWith('@');
    if (paint) op = op.slice(1);
    let mirror = false;
    if (t[t.length - 1] === 'm') { mirror = true; t.pop(); }
    const isEye = op === 'EYE';
    const mat = isEye ? 'k' : t[t.length - 1];
    const n = t.slice(1, isEye ? t.length : t.length - 1).map(Number);
    const build = (mx: boolean): Prim[] => {
      const X = (v: number) => (mx ? N - v : v);
      switch (op) {
        case 'E': { const [cx, cy, cz, rx, ry, rz] = n; const c = X(cx);
          return [{ mat, bb: [c - rx, cy - ry, cz - rz, c + rx, cy + ry, cz + rz], f: (x, y, z) => ((x - c) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2 <= 1 }]; }
        case 'B': { let [x0, y0, z0, x1, y1, z1] = n; if (mx) [x0, x1] = [N - x1, N - x0];
          return [{ mat, bb: [x0, y0, z0, x1, y1, z1], f: (x, y, z) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && z >= z0 && z <= z1 }]; }
        case 'R': { let [x0, y0, z0, x1, y1, z1, r] = n; if (mx) [x0, x1] = [N - x1, N - x0];
          return [{ mat, bb: [x0, y0, z0, x1, y1, z1], f: (x, y, z) => {
            const dx = Math.max(x0 + r - x, 0, x - (x1 - r)), dy = Math.max(y0 + r - y, 0, y - (y1 - r)), dz = Math.max(z0 + r - z, 0, z - (z1 - r));
            return x >= x0 && x <= x1 && y >= y0 && y <= y1 && z >= z0 && z <= z1 && dx * dx + dy * dy + dz * dz <= r * r; } }]; }
        case 'C': { const [cx, cz, y0, y1, r] = n; const c = X(cx);
          return [{ mat, bb: [c - r, y0, cz - r, c + r, y1, cz + r], f: (x, y, z) => y >= y0 && y <= y1 && (x - c) ** 2 + (z - cz) ** 2 <= r * r }]; }
        case 'X': { const [cy, cz, x0, x1, r] = n; const a = mx ? N - x1 : x0, b = mx ? N - x0 : x1;
          return [{ mat, bb: [a, cy - r, cz - r, b, cy + r, cz + r], f: (x, y, z) => x >= a && x <= b && (y - cy) ** 2 + (z - cz) ** 2 <= r * r }]; }
        case 'Z': { const [cx, cy, z0, z1, r] = n; const c = X(cx);
          return [{ mat, bb: [c - r, cy - r, z0, c + r, cy + r, z1], f: (x, y, z) => z >= z0 && z <= z1 && (x - c) ** 2 + (y - cy) ** 2 <= r * r }]; }
        case 'K': { const [cx, cz, y0, y1, r0, r1] = n; const c = X(cx); const rm = Math.max(r0, r1);
          return [{ mat, bb: [c - rm, y0, cz - rm, c + rm, y1, cz + rm], f: (x, y, z) => { if (y < y0 || y > y1) return false; const r = r0 + (r1 - r0) * ((y - y0) / (y1 - y0 || 1)); return (x - c) ** 2 + (z - cz) ** 2 <= r * r; } }]; }
        case 'L': { const [ax0, ay, az, bx0, by, bz, r] = n; const ax = X(ax0), bx = X(bx0);
          const vx = bx - ax, vy = by - ay, vz = bz - az, vv = vx * vx + vy * vy + vz * vz || 1;
          return [{ mat, bb: [Math.min(ax, bx) - r, Math.min(ay, by) - r, Math.min(az, bz) - r, Math.max(ax, bx) + r, Math.max(ay, by) + r, Math.max(az, bz) + r],
            f: (x, y, z) => { const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy + (z - az) * vz) / vv)); const px = ax + vx * t - x, py = ay + vy * t - y, pz = az + vz * t - z; return px * px + py * py + pz * pz <= r * r; } }]; }
        case 'DI': { const [cx, cy, cz, rx, ry, rz] = n; const c = X(cx);
          return [{ mat, bb: [c - rx, cy - ry, cz - rz, c + rx, cy + ry, cz + rz], f: (x, y, z) => Math.abs(x - c) / rx + Math.abs(y - cy) / ry + Math.abs(z - cz) / rz <= 1 }]; }
        case 'T': { const [cx, cy, cz, R, r] = n; const c = X(cx);
          return [{ mat, bb: [c - R - r, cy - r, cz - R - r, c + R + r, cy + r, cz + R + r], f: (x, y, z) => { const q = Math.hypot(x - c, z - cz) - R; return q * q + (y - cy) ** 2 <= r * r; } }]; }
        case 'TZ': { const [cx, cy, cz, R, r] = n; const c = X(cx);
          return [{ mat, bb: [c - R - r, cy - R - r, cz - r, c + R + r, cy + R + r, cz + r], f: (x, y, z) => { const q = Math.hypot(x - c, y - cy) - R; return q * q + (z - cz) ** 2 <= r * r; } }]; }
        case 'EYE': { const [cx, cy, cz, r] = n; const c = X(cx);
          const hx = c - r * 0.45, hy = cy + r * 0.45, hz = cz + r * 0.55, hr = Math.max(0.55, r * 0.42);
          return [
            { mat: 'k', bb: [c - r, cy - r, cz - r, c + r, cy + r, cz + r], f: (x, y, z) => (x - c) ** 2 + (y - cy) ** 2 + (z - cz) ** 2 <= r * r },
            { mat: 'w', bb: [hx - hr, hy - hr, hz - hr, hx + hr, hy + hr, hz + hr], f: (x, y, z) => (x - hx) ** 2 + (y - hy) ** 2 + (z - hz) ** 2 <= hr * hr && (x - c) ** 2 + (y - cy) ** 2 + (z - cz) ** 2 <= (r + 0.6) ** 2 },
          ];
        }
      }
      throw new Error('bad voxel op ' + op);
    };
    const ps = [...build(false), ...(mirror ? build(true) : [])];
    if (paint) ps.forEach(p => (p.paint = true));
    out.push(...ps);
  }
  return out;
}

export function buildModel(id: string, pal: string, src: string): VoxelModel {
  const mats = parsePal(pal);
  const idx: Record<string, number> = {};
  mats.forEach((m, i) => { if (i) idx[m.key] = i; });
  const grid = new Uint8Array(N * N * N);
  for (const p of prims(src)) {
    const v = p.mat === '.' ? 0 : idx[p.mat];
    if (v === undefined) throw new Error(`model ${id}: unknown material ${p.mat}`);
    const [x0, y0, z0, x1, y1, z1] = p.bb.map((b, i) => (i < 3 ? Math.max(0, Math.floor(b - 0.5)) : Math.min(N - 1, Math.ceil(b))));
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++)
      if (p.f(x + 0.5, y + 0.5, z + 0.5) && (!p.paint || grid[x + N * (y + N * z)])) grid[x + N * (y + N * z)] = v;
  }
  const min: [number, number, number] = [N, N, N], max: [number, number, number] = [-1, -1, -1];
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (grid[x + N * (y + N * z)]) {
    min[0] = Math.min(min[0], x); min[1] = Math.min(min[1], y); min[2] = Math.min(min[2], z);
    max[0] = Math.max(max[0], x); max[1] = Math.max(max[1], y); max[2] = Math.max(max[2], z);
  }
  return { id, grid, mats, min, max };
}

export const vget = (m: VoxelModel, x: number, y: number, z: number) =>
  x < 0 || y < 0 || z < 0 || x >= N || y >= N || z >= N ? 0 : m.grid[x + N * (y + N * z)];

// ---------------------------------------------------------------- colour helpers (pixel-art ramps)
function rgb2hsl([r, g, b]: [number, number, number]): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function hsl2rgb([h, s, l]: [number, number, number]): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
function towards(h: number, target: number, amt: number) {
  let d = ((target - h + 540) % 360) - 180;
  return h + Math.sign(d) * Math.min(Math.abs(d), amt);
}
/** 5-step ramp: [outline, shadow, mid, base, light] with hue shifting (shadows cool, lights warm). */
export function ramp(c: [number, number, number]): [number, number, number][] {
  const [h, s, l] = rgb2hsl(c);
  const lowSat = s < 0.12;
  const mk = (dl: number, dh: number, ds: number, target: number) =>
    hsl2rgb([lowSat ? h : towards(h, target, dh), Math.max(0, Math.min(1, s + ds)), Math.max(0.03, Math.min(0.97, l + dl))]);
  return [
    mk(-l * 0.72, 28, 0.12, 250),
    mk(-0.2, 16, 0.08, 250),
    mk(-0.09, 7, 0.04, 250),
    c,
    mk(Math.min(0.16, (1 - l) * 0.55), 10, -0.06, 55),
  ];
}
