// Procedural canvas textures for the attic: planks, wood grain, book cloth, block letters.
import * as THREE from 'three';

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}
function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}
function toTex(c: HTMLCanvasElement, repeat = 1, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const hex = (r: number, g: number, b: number) => `rgb(${r | 0},${g | 0},${b | 0})`;

function grain(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, base: [number, number, number], r: () => number, vertical = false) {
  ctx.fillStyle = hex(...base);
  ctx.fillRect(x, y, w, h);
  const lines = Math.floor((vertical ? w : h) / 3);
  for (let i = 0; i < lines; i++) {
    const t = r();
    const d = (r() - 0.5) * 26;
    ctx.strokeStyle = hex(base[0] + d, base[1] + d * 0.8, base[2] + d * 0.6);
    ctx.globalAlpha = 0.35 + r() * 0.4;
    ctx.lineWidth = 0.6 + r() * 1.6;
    ctx.beginPath();
    const amp = 2 + r() * 6, freq = 0.005 + r() * 0.02, ph = r() * 9;
    if (!vertical) {
      const yy = y + t * h;
      for (let xx = x; xx <= x + w; xx += 6) ctx.lineTo(xx, yy + Math.sin(xx * freq + ph) * amp);
    } else {
      const xx0 = x + t * w;
      for (let yy = y; yy <= y + h; yy += 6) ctx.lineTo(xx0 + Math.sin(yy * freq + ph) * amp, yy);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // knots
  if (r() < 0.6) {
    const kx = x + r() * w, ky = y + r() * h;
    for (let k = 6; k > 0; k--) {
      ctx.strokeStyle = hex(base[0] - 30, base[1] - 26, base[2] - 20);
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.ellipse(kx, ky, k * 3, k * 1.4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

export function plankTexture(seed: number, base: [number, number, number], rows = 6, vertical = false): THREE.CanvasTexture {
  const [c, ctx] = canvas(1024, 1024);
  const r = rng(seed);
  const n = rows, sz = 1024 / n;
  for (let i = 0; i < n; i++) {
    let pos = 0;
    while (pos < 1024) {
      const len = 300 + r() * 500;
      const tone = (r() - 0.5) * 34;
      const b: [number, number, number] = [base[0] + tone, base[1] + tone * 0.85, base[2] + tone * 0.7];
      if (vertical) grain(ctx, i * sz, pos, sz, len, b, r, true); else grain(ctx, pos, i * sz, len, sz, b, r);
      ctx.fillStyle = 'rgba(20,10,5,0.75)';
      if (vertical) ctx.fillRect(i * sz, pos, sz, 3); else ctx.fillRect(pos, i * sz, 3, sz);
      // nails
      ctx.fillStyle = 'rgba(30,22,18,0.8)';
      for (const off of [0.25, 0.75]) {
        if (vertical) { ctx.beginPath(); ctx.arc(i * sz + sz * off, pos + 14, 3, 0, 7); ctx.fill(); }
        else { ctx.beginPath(); ctx.arc(pos + 14, i * sz + sz * off, 3, 0, 7); ctx.fill(); }
      }
      pos += len;
    }
    ctx.fillStyle = 'rgba(15,8,4,0.85)';
    if (vertical) ctx.fillRect(i * sz, 0, 4, 1024); else ctx.fillRect(0, i * sz, 1024, 4);
  }
  return toTex(c);
}

export function woodTexture(seed: number, base: [number, number, number], size = 256): THREE.CanvasTexture {
  const [c, ctx] = canvas(size, size);
  grain(ctx, 0, 0, size, size, base, rng(seed));
  return toTex(c);
}

export function clothTexture(seed: number, base: [number, number, number], band: string | null): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 256);
  const r = rng(seed);
  ctx.fillStyle = hex(...base);
  ctx.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 1400; i++) {
    const d = (r() - 0.5) * 30;
    ctx.fillStyle = hex(base[0] + d, base[1] + d, base[2] + d);
    ctx.globalAlpha = 0.25;
    ctx.fillRect(r() * 128, r() * 256, 2, 1);
  }
  ctx.globalAlpha = 1;
  if (band) {
    ctx.fillStyle = band;
    ctx.fillRect(0, 30, 128, 8); ctx.fillRect(0, 218, 128, 8);
    ctx.fillRect(30, 110, 68, 30);
  }
  return toTex(c);
}

export function letterTexture(ch: string, bg: string, fg: string): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, 108, 108);
  ctx.fillStyle = fg;
  ctx.font = '900 84px Fraunces, Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ch, 64, 70);
  return toTex(c);
}

/** Soft radial sprite for dust motes and glows. */
export function softDot(): THREE.CanvasTexture {
  const [c, ctx] = canvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return toTex(c, 1, false);
}
