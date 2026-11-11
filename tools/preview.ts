// Renders every creature model to a contact sheet PNG for checking the art.
//   npx vite-node tools/preview.ts [filter]   -> tools/out/sheet.png
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { MODELS, getModel } from '../src/art/models';
import { renderPortrait } from '../src/art/pixelart';
import { backdropFor } from '../src/art/portraits';

function png(w: number, h: number, rgba: Uint8ClampedArray): Buffer {
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (b: Buffer) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const filter = process.argv[2];
const ids = Object.keys(MODELS).filter(id => !filter || filter.split(',').some(f => id.includes(f)));
const SC = 5, CELL = 32 * SC + 8, COLS = Math.min(8, ids.length);
const rows = Math.ceil(ids.length / COLS);
const W = COLS * CELL * 2, H = rows * CELL;
const img = new Uint8ClampedArray(W * H * 4).fill(40);
ids.forEach((id, n) => {
  const m = getModel(id);
  const views = [renderPortrait(m, { backdrop: backdropFor(id) }), renderPortrait(m, { size: 32, yaw: -0.9, pitch: 0.3, backdrop: null })];
  views.forEach((px, v) => {
    const ox = (n % COLS) * CELL * 2 + v * CELL + 4, oy = Math.floor(n / COLS) * CELL + 4;
    for (let y = 0; y < 32 * SC; y++) for (let x = 0; x < 32 * SC; x++) {
      const s = ((y / SC) | 0) * 32 + ((x / SC) | 0), d = (oy + y) * W + ox + x;
      if (px[s * 4 + 3]) for (let c = 0; c < 4; c++) img[d * 4 + c] = px[s * 4 + c];
    }
  });
});
mkdirSync('tools/out', { recursive: true });
writeFileSync('tools/out/sheet.png', png(W, H, img));
console.log(`wrote tools/out/sheet.png (${ids.length} models)`);
