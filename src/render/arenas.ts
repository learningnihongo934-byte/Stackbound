// Battle playsets. Each arena dresses the space around the board (props, lighting, fog, floor,
// board colours, ambient particles) and can animate itself every frame.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { ArenaId } from '../game/arena-info';
import { voxelMesh } from './mesh';
import { clothTexture, letterTexture, plankTexture, woodTexture } from './tex';

export type MoteMode = 'dust' | 'rain' | 'notes' | 'embers' | 'sparkle';
export interface ArenaLook {
  hemi: [number, number, number]; sun: [number, number, [number, number, number]]; lamp: [number, number, [number, number, number]]; fill: [number, number];
  fog: [number, number]; bg: number; exposure: number; floor: 'planks' | 'felt' | 'velvet' | 'checker' | 'shelf' | 'trunk' | 'sill';
  tiles: [number, number]; frame: number; motes: [MoteMode, number];
}
export interface Arena { id: ArenaId; group: THREE.Group; look: ArenaLook; update?: (dt: number, t: number) => void }

const Y0 = -0.42; // floor height
const shadow = (o: THREE.Object3D) => { o.traverse(c => { const m = c as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; };
const mat = (color: number, rough = 0.7, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
const glowMat = (r: number, g: number, b: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), toneMapped: false });
function box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, round = 0.04) {
  const b = new THREE.Mesh(round ? new RoundedBoxGeometry(w, h, d, 2, round) : new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  return b;
}
function toy(id: string, scale: number, x: number, z: number, rotY = 0, y = Y0) {
  const { mesh } = voxelMesh(id);
  mesh.scale.setScalar(scale);
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  return shadow(mesh);
}
function wall(tex: THREE.Texture, z = -11, h = 16) {
  const w = new THREE.Mesh(new THREE.PlaneGeometry(60, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  w.position.set(0, h / 2 + Y0, z);
  w.receiveShadow = true;
  return w;
}
function canvasTex(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void, repeat: [number, number] = [1, 1]) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  return t;
}

// ---------------------------------------------------------------- the attic (default)
function attic(): Arena {
  const g = new THREE.Group();
  const rug = new THREE.Mesh(new THREE.CircleGeometry(5.9, 96), new THREE.MeshStandardMaterial({ map: rugTexture(), roughness: 0.95, color: 0xb8a890 }));
  rug.rotation.x = -Math.PI / 2; rug.position.y = Y0 + 0.015; rug.receiveShadow = true;
  g.add(rug);
  const wallTex = plankTexture(5, [70, 44, 28], 9, true); wallTex.repeat.set(4, 1);
  g.add(wall(wallTex));
  g.add(windowFrame(-4.2, 4.6, -10.95, new THREE.Color(2.2, 1.9, 1.4)));
  g.add(lightShaft(-2.4, 3.2, -4.6, new THREE.Vector3(0.6, -0.4, 0.6), 0x1, [1, 0.86, 0.62]));
  // books, letter blocks, trunk, lamp, marbles
  const books = new THREE.Group();
  const bookCols: [number, number, number][] = [[120, 40, 36], [44, 78, 96], [86, 104, 58], [150, 110, 52], [70, 44, 80]];
  let by = Y0;
  bookCols.forEach((c, i) => {
    const h = 0.34 + (i % 2) * 0.1;
    const m = new THREE.MeshStandardMaterial({ map: clothTexture(i + 3, c, 'rgba(214,170,80,0.9)'), roughness: 0.8 });
    const b = new THREE.Mesh(new RoundedBoxGeometry(2.3 - i * 0.12, h, 1.6 - (i % 3) * 0.1, 2, 0.04), [m, m, m, m, mat(0xe8dcc0, 0.9), m]);
    b.position.y = by + h / 2; by += h; b.rotation.y = (i - 2) * 0.12;
    books.add(b);
  });
  books.position.set(-5.9, 0, -3.4);
  g.add(shadow(books));
  g.add(letterBlocks(['S', 'T', 'A', 'C', 'K'], 5.6, -3.8));
  g.add(trunkProp(0.6, -7.2, -0.08));
  g.add(deskLamp(6.6, -1.4));
  [0x3a7ad0, 0xd05a4a, 0x6ac06a, 0xe8c040].forEach((c, i) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 14), new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.05, clearcoat: 1 }));
    m.position.set(-4.1 + i * 0.45, Y0 + 0.16, 3.6 - (i % 2) * 0.5);
    g.add(shadow(m));
  });
  return { id: 'attic', group: g, look: { hemi: [0xffe4c0, 0x2a1810, 0.75], sun: [0xffd6a0, 2.7, [-7, 11, -6]], lamp: [0xffa456, 16, [5.5, 2.9, -1.6]], fill: [0xa8b8ff, 0.42], fog: [0x1a100a, 0.035], bg: 0x140c08, exposure: 1.08, floor: 'planks', tiles: [0xffffff, 0xffffff], frame: 0x523018, motes: ['dust', 0xffe2b0] } };
}

// ---------------------------------------------------------------- zone 1: inside the toy chest
function toychest(): Arena {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ map: woodTexture(91, [120, 74, 42], 512), roughness: 0.75 });
  for (const [w, x, z, ry] of [[16, 0, -7.5, 0], [16, -8, 0, Math.PI / 2], [16, 8, 0, -Math.PI / 2]] as const) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(w, 6, 0.6), wood);
    p.position.set(x, Y0 + 3, z); p.rotation.y = ry;
    g.add(shadow(p));
  }
  const lid = new THREE.Mesh(new THREE.BoxGeometry(16, 0.5, 9), wood);
  lid.position.set(0, Y0 + 9.6, -11.4); lid.rotation.x = -1.15;
  g.add(shadow(lid));
  const brass = mat(0xd0a048, 0.3, 0.85);
  for (const x of [-7.6, 7.6]) g.add(shadow(box(0.6, 6.2, 0.7, brass, x, Y0 + 3.1, -7.4)));
  g.add(toy('matchpup', 3.4, -5.2, -5.2, 0.5));
  g.add(toy('marblet', 3.0, 5.4, -5.4, -0.5));
  g.add(toy('dominoknight', 2.6, -6.2, 1.6, 1.3));
  g.add(toy('sparkjack', 2.4, 6.4, 1.2, -1.2));
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1.1, 32, 24), new THREE.MeshStandardMaterial({ map: canvasTex(256, 128, x => { const cs = ['#c0442e', '#f0d050', '#2f6a9a', '#f4ead8']; for (let i = 0; i < 8; i++) { x.fillStyle = cs[i % 4]; x.fillRect(i * 32, 0, 32, 128); } }), roughness: 0.35 }));
  ball.position.set(4.6, Y0 + 1.1, -4.2);
  g.add(shadow(ball));
  g.add(letterBlocks(['A', 'B', 'C'], -4.4, 3.8));
  return { id: 'toychest', group: g, look: { hemi: [0xffe8c8, 0x3a2414, 0.8], sun: [0xfff0d0, 2.6, [-2, 12, 2]], lamp: [0xffb060, 8, [0, 5, -4]], fill: [0xb0c0ff, 0.35], fog: [0x24160c, 0.03], bg: 0x1a0f08, exposure: 1.1, floor: 'trunk', tiles: [0xfff2e0, 0xf0d8c0], frame: 0x6a3c1c, motes: ['dust', 0xffe8c0] } };
}

// ---------------------------------------------------------------- zone 2: bookshelf
function bookshelf(): Arena {
  const g = new THREE.Group();
  const spines = new THREE.Group();
  const cols: [number, number, number][] = [[120, 40, 36], [44, 78, 96], [86, 104, 58], [150, 110, 52], [70, 44, 80], [40, 60, 50], [160, 130, 90], [90, 40, 30]];
  let x = -14;
  let i = 0;
  while (x < 14) {
    const w = 0.6 + ((i * 37) % 5) * 0.18, h = 5 + ((i * 53) % 7) * 0.45;
    const m = new THREE.MeshStandardMaterial({ map: clothTexture(i + 20, cols[i % cols.length], i % 3 ? 'rgba(214,170,80,0.9)' : null), roughness: 0.8 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 3), m);
    b.position.set(x + w / 2, Y0 + h / 2, -7);
    b.rotation.z = i % 9 === 4 ? 0.12 : 0;
    spines.add(b);
    x += w + 0.04; i++;
  }
  g.add(shadow(spines));
  g.add(wall(plankTexture(9, [60, 40, 28], 6, true), -9));
  // an open book lying flat, a bookend and paper cranes (kites)
  const page = mat(0xf0e6cc, 0.9);
  const ob = new THREE.Group();
  ob.add(box(2.2, 0.2, 3, mat(0x7a2a24, 0.7), 0, 0.1, 0), box(1.05, 0.12, 2.8, page, -0.55, 0.25, 0), box(1.05, 0.12, 2.8, page, 0.55, 0.25, 0));
  ob.position.set(-5.2, Y0, 2.4); ob.rotation.y = 0.4;
  g.add(shadow(ob));
  g.add(toy('feltfrog', 3.0, 5.6, -3.6, -0.6));
  g.add(toy('prismkite', 1.6, -5.4, -3.2, 0.5, 2.6));
  g.add(toy('prismkite', 1.2, 3.4, -4.6, -0.4, 4.2));
  g.add(toy('sproutpot', 2.4, 6.2, 2.6, -1.1));
  return { id: 'bookshelf', group: g, look: { hemi: [0xffe2c0, 0x261a12, 0.7], sun: [0xffe0b8, 2.4, [-6, 10, 4]], lamp: [0xffc080, 6, [-4, 3, -3]], fill: [0x9ab0ff, 0.4], fog: [0x18120c, 0.04], bg: 0x120c08, exposure: 1.05, floor: 'shelf', tiles: [0xf6efe0, 0xd8c8a8], frame: 0x4a2a1a, motes: ['dust', 0xffe8c8] } };
}

// ---------------------------------------------------------------- zone 3: dollhouse parlour
function dollhouse(): Arena {
  const g = new THREE.Group();
  const paper = canvasTex(256, 256, x => {
    x.fillStyle = '#c8a0a8'; x.fillRect(0, 0, 256, 256);
    x.fillStyle = '#b48890'; for (let i = 0; i < 8; i++) x.fillRect(i * 32, 0, 12, 256);
    x.fillStyle = '#f0d8c8'; for (let i = 0; i < 16; i++) { x.beginPath(); x.arc((i % 4) * 64 + 38, Math.floor(i / 4) * 64 + 32, 6, 0, 7); x.fill(); }
  }, [10, 3]);
  g.add(wall(paper, -9, 12));
  const side = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), new THREE.MeshStandardMaterial({ map: paper, roughness: 0.9 }));
  side.position.set(-9, Y0 + 6, 0); side.rotation.y = Math.PI / 2; side.receiveShadow = true;
  g.add(side);
  const trim = mat(0xf4ecdc, 0.6);
  g.add(box(30, 1.2, 0.2, trim, 0, Y0 + 0.6, -8.9, 0), box(0.2, 1.2, 30, trim, -8.9, Y0 + 0.6, 0, 0));
  // tiny furniture
  const wood = mat(0x7a4a2a, 0.6);
  const table = new THREE.Group();
  table.add(box(2.4, 0.15, 1.6, wood, 0, 1.4, 0), ...[[-1, -0.6], [1, -0.6], [-1, 0.6], [1, 0.6]].map(([a, b]) => box(0.12, 1.4, 0.12, wood, a, 0.7, b, 0)));
  table.position.set(-5.4, Y0, -4.6);
  g.add(shadow(table));
  g.add(toy('twirla', 1.6, -5.4, -4.6, 0.4, Y0 + 1.48));
  g.add(toy('prismelle', 2.8, 5.8, -5.4, -0.6));
  // chandelier
  const ch = toy('chandelord', 2.8, 0, -3.2, 0, 6.2);
  g.add(ch);
  const frame = new THREE.Group();
  frame.add(box(2.6, 2, 0.12, mat(0xc8a048, 0.3, 0.8), 0, 0, 0), new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.6), new THREE.MeshStandardMaterial({ map: canvasTex(64, 48, x => { x.fillStyle = '#5a7a9a'; x.fillRect(0, 0, 64, 48); x.fillStyle = '#7a9a5a'; x.fillRect(0, 30, 64, 18); x.fillStyle = '#f0d070'; x.beginPath(); x.arc(46, 14, 6, 0, 7); x.fill(); }) })));
  (frame.children[1] as THREE.Mesh).position.z = 0.07;
  frame.position.set(4.2, 4.6, -8.8);
  g.add(frame);
  return { id: 'dollhouse', group: g, look: { hemi: [0xffe0e8, 0x3a2028, 0.8], sun: [0xffe8d8, 2.2, [-5, 11, 5]], lamp: [0xffc890, 12, [0, 5, -3]], fill: [0xc0b0ff, 0.45], fog: [0x2a1a20, 0.03], bg: 0x1a1014, exposure: 1.1, floor: 'checker', tiles: [0xffffff, 0xe8d0d8], frame: 0xf0e4d4, motes: ['sparkle', 0xffd8e8] }, update: (_dt, t) => { ch.rotation.y = Math.sin(t * 0.4) * 0.15; } };
}

// ---------------------------------------------------------------- zone 4: train set table
function trainset(): Arena {
  const g = new THREE.Group();
  const rail = mat(0x8a8a92, 0.35, 0.8), tie = mat(0x5a3a24, 0.8);
  const R = 4.7;
  for (const r of [R - 0.16, R + 0.16]) { const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 6, 120), rail); t.rotation.x = Math.PI / 2; t.position.y = Y0 + 0.08; g.add(t); }
  for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2; const b = box(0.12, 0.05, 0.6, tie, Math.cos(a) * R, Y0 + 0.03, Math.sin(a) * R, 0); b.rotation.y = -a; g.add(b); }
  const train = new THREE.Group();
  const engine = toy('prop_train', 1.1, 0, 0, 0, 0);
  train.add(engine);
  const cars: THREE.Object3D[] = [];
  for (let i = 0; i < 2; i++) { const c = new THREE.Group(); c.add(box(0.9, 0.45, 0.6, mat([0x3a6ac8, 0xe0a83a][i], 0.6), 0, 0.42, 0), box(0.95, 0.12, 0.65, mat(0x2a2a30), 0, 0.15, 0)); g.add(shadow(c)); cars.push(c); }
  g.add(train);
  const trees = [[-6.4, -3.4], [6.6, -2.6], [-6.8, 2.4], [6.2, 3.6], [-3, -6.4], [3.4, -6.2], [0, -7.2]];
  for (const [x, z] of trees) {
    const t = new THREE.Group();
    t.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.6, 8), mat(0x6a4428)));
    const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 8), mat(0x3a7a3a, 0.8)); c1.position.y = 0.8;
    const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 8), mat(0x4a8a44, 0.8)); c2.position.y = 1.3;
    t.add(c1, c2);
    t.position.set(x, Y0 + 0.3, z);
    t.scale.setScalar(1 + ((x * 7) % 3) * 0.15);
    g.add(shadow(t));
  }
  const station = new THREE.Group();
  station.add(box(2.4, 1.2, 1.4, mat(0xc89a6a), 0, 0.6, 0), box(2.8, 0.2, 1.8, mat(0x8a3a2a), 0, 1.3, 0), box(0.5, 0.8, 0.05, mat(0x3a2a1a), 0, 0.4, 0.71, 0));
  station.position.set(-6.4, Y0, -0.4); station.rotation.y = Math.PI / 2;
  g.add(shadow(station));
  return {
    id: 'trainset', group: g,
    look: { hemi: [0xf0f4ff, 0x203820, 0.9], sun: [0xfff4e0, 3, [-6, 12, 5]], lamp: [0xffffff, 0, [0, 5, 0]], fill: [0xc0d8ff, 0.5], fog: [0x1a2418, 0.025], bg: 0x121a10, exposure: 1.12, floor: 'felt', tiles: [0xf8f4e8, 0xd8ccb0], frame: 0x3a2a1a, motes: ['dust', 0xffffff] },
    update: (_dt, t) => {
      const a = t * 0.35;
      const place = (o: THREE.Object3D, ang: number) => { o.position.set(Math.cos(ang) * R, Y0 + 0.08, Math.sin(ang) * R); o.rotation.y = -ang; };
      place(train, a); train.rotation.y = -a - Math.PI / 2 + Math.PI;
      cars.forEach((c, i) => place(c, a - 0.26 * (i + 1)));
    },
  };
}

// ---------------------------------------------------------------- zone 5: music box stage
function musicbox(): Arena {
  const g = new THREE.Group();
  const brass = mat(0xd8a848, 0.25, 0.9), steel = mat(0xc8ccd4, 0.2, 0.9);
  const drum = new THREE.Group();
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 12, 48), brass);
  cyl.rotation.z = Math.PI / 2;
  drum.add(cyl);
  for (let i = 0; i < 160; i++) { const pin = box(0.08, 0.2, 0.08, steel, -5.8 + ((i * 41) % 116) / 10, 0, 0, 0); const a = (i * 2.399) % (Math.PI * 2); pin.position.y = Math.cos(a) * 1.48; pin.position.z = Math.sin(a) * 1.48; pin.rotation.x = a; drum.add(pin); }
  drum.position.set(0, Y0 + 1.6, -6.4);
  g.add(shadow(drum));
  const comb = new THREE.Group();
  for (let i = 0; i < 40; i++) comb.add(box(0.12, 0.05, 1.6 + (i % 5) * 0.12, steel, -5.8 + i * 0.3, 0, 0, 0));
  comb.position.set(0, Y0 + 0.5, -4.6);
  g.add(shadow(comb));
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(30, 10), new THREE.MeshStandardMaterial({ color: 0x8a90a8, roughness: 0.08, metalness: 1 }));
  mirror.position.set(0, Y0 + 5, -9.5);
  g.add(mirror);
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 0.5, 32), mat(0x5a2040, 0.4));
  ped.position.set(5.6, Y0 + 0.25, -3.6);
  g.add(shadow(ped));
  const diva = toy('celestelle', 3.2, 5.6, -3.6, 0, Y0 + 0.5);
  g.add(diva);
  g.add(toy('twirla', 2.4, -5.6, -3.4, 0.6));
  return {
    id: 'musicbox', group: g,
    look: { hemi: [0xffe0f0, 0x301020, 0.65], sun: [0xfff0e0, 2.8, [0, 12, 4]], lamp: [0xff90c0, 10, [-4, 4, -2]], fill: [0xb090ff, 0.55], fog: [0x200c18, 0.035], bg: 0x160810, exposure: 1.1, floor: 'velvet', tiles: [0xfff0f4, 0xe0c0d0], frame: 0x3a1028, motes: ['notes', 0xfff0c0] },
    update: (dt, t) => { drum.rotation.x += dt * 0.35; diva.rotation.y = t * 0.6; },
  };
}

// ---------------------------------------------------------------- zone 6: lamp corner at night
function lampcorner(): Arena {
  const g = new THREE.Group();
  g.add(wall(plankTexture(13, [44, 34, 40], 9, true), -10));
  const lamp = deskLamp(0, 0);
  lamp.scale.setScalar(2.6);
  lamp.position.set(3.8, 0, -5.6);
  lamp.rotation.y = -0.4;
  g.add(lamp);
  const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(3.8, Y0 + 0.05, -5.6), new THREE.Vector3(1, Y0 + 0.05, -7), new THREE.Vector3(-4, Y0 + 0.05, -6), new THREE.Vector3(-7, Y0 + 0.05, -2)]), 40, 0.06, 6), mat(0x1a1a1e, 0.6));
  g.add(cable);
  g.add(toy('arclight', 2.6, -4.8, -4.4, 0.6, 0.6));
  g.add(toy('battbug', 2.2, -6.2, 2.4, 1.2));
  g.add(toy('candlewick', 2.6, 6.2, 2.2, -1.0));
  const fuse = new THREE.Group();
  fuse.add(box(1.6, 2.2, 0.5, mat(0x5a5e66, 0.5, 0.6), 0, 1.1, 0), box(0.3, 0.5, 0.1, glowMat(2.4, 0.6, 0.2), -0.3, 1.6, 0.28, 0), box(0.3, 0.5, 0.1, glowMat(0.4, 2, 0.6), 0.3, 1.6, 0.28, 0));
  fuse.position.set(-5, Y0, -8.8);
  g.add(shadow(fuse));
  let flick = 0;
  return {
    id: 'lampcorner', group: g,
    look: { hemi: [0x5060a0, 0x080810, 0.35], sun: [0x8090c0, 0.9, [-6, 10, -6]], lamp: [0xffb060, 34, [2.6, 4.6, -3.4]], fill: [0x5070c0, 0.35], fog: [0x080a14, 0.045], bg: 0x05060c, exposure: 1.05, floor: 'planks', tiles: [0xd8d8f0, 0xb0a8c8], frame: 0x2a2030, motes: ['embers', 0xffc070] },
    update: (dt, t) => { flick += dt; (g.userData.lampLight as THREE.PointLight | undefined) && ((g.userData.lampLight as THREE.PointLight).intensity = 34 * (0.85 + Math.sin(t * 13) * 0.05 + (Math.sin(t * 2.3) > 0.97 ? -0.4 : 0))); },
  };
}

// ---------------------------------------------------------------- zone 7: rainy window sill
function windowsill(): Arena {
  const g = new THREE.Group();
  g.add(wall(plankTexture(17, [180, 170, 156], 9, true), -9));
  const rainMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, flash: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float time, flash; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
      void main(){
        vec3 sky = mix(vec3(0.05,0.08,0.16), vec3(0.14,0.2,0.32), vUv.y) + flash * vec3(0.9,0.95,1.0);
        vec2 g = vec2(vUv.x * 60.0, vUv.y * 6.0 + time * 4.0);
        vec2 id = floor(g);
        float drop = step(0.92, h(id)) * smoothstep(0.0, 0.9, fract(g.y)) * (1.0 - smoothstep(0.0, 0.1, abs(fract(g.x) - 0.5)));
        vec3 c = sky + drop * vec3(0.5,0.6,0.7);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), rainMat);
  pane.position.set(0, Y0 + 4.8, -8.9);
  g.add(pane);
  const frame = mat(0xf0ece4, 0.6);
  for (const [w, h, x, y] of [[12.6, 0.3, 0, 1.8], [12.6, 0.3, 0, 7.8], [0.3, 6.3, -6.2, 4.8], [0.3, 6.3, 6.2, 4.8], [0.2, 6, 0, 4.8], [12, 0.2, 0, 4.8]] as const) g.add(box(w, h, 0.3, frame, x, Y0 + y, -8.8, 0));
  g.add(box(14, 0.4, 2.4, frame, 0, Y0 + 1.6, -8.2, 0.05));
  g.add(toy('sproutpot', 2.2, -4.8, -7.9, 0.3, Y0 + 1.8), toy('thornpot', 2.2, -2.2, -8.0, -0.2, Y0 + 1.8), toy('arborpot', 1.8, 3.2, -7.9, 0.2, Y0 + 1.8), toy('glimmersnail', 2.0, 5.4, -7.6, -0.6, Y0 + 1.8));
  const puddle = new THREE.Mesh(new THREE.CircleGeometry(1.4, 32), new THREE.MeshStandardMaterial({ color: 0x6a90b0, roughness: 0.02, metalness: 0.4 }));
  puddle.rotation.x = -Math.PI / 2; puddle.position.set(-5.2, Y0 + 0.01, 3.2);
  g.add(puddle);
  g.add(toy('bathduck', 2.2, -5.2, 3.2, 0.8));
  let next = 4;
  return {
    id: 'windowsill', group: g,
    look: { hemi: [0x9ab0d0, 0x1a2028, 0.7], sun: [0xb8c8e8, 1.8, [0, 9, -10]], lamp: [0xffc890, 10, [5, 3, 2]], fill: [0x90a8d0, 0.5], fog: [0x0e141c, 0.035], bg: 0x0a0e14, exposure: 1.08, floor: 'sill', tiles: [0xf0f4f8, 0xc8d0d8], frame: 0x8a9098, motes: ['rain', 0xb8d8ff] },
    update: (dt, t) => {
      rainMat.uniforms.time.value = t;
      rainMat.uniforms.flash.value = Math.max(0, rainMat.uniforms.flash.value - dt * 3);
      if (t > next) { next = t + 5 + Math.random() * 8; rainMat.uniforms.flash.value = 1; }
    },
  };
}

// ---------------------------------------------------------------- zone 8: inside the old trunk
function oldtrunk(): Arena {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ map: woodTexture(201, [58, 36, 30], 512), roughness: 0.85 });
  for (const [w, x, z, ry] of [[18, 0, -8, 0], [18, -9, 0, Math.PI / 2], [18, 9, 0, -Math.PI / 2]] as const) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(w, 8, 0.6), wood);
    p.position.set(x, Y0 + 4, z); p.rotation.y = ry; p.receiveShadow = true;
    g.add(p);
  }
  g.add(toy('monolith', 5, 0, -6.4, 0));
  g.add(toy('leviathub', 3, -6.4, -4.4, 0.7));
  g.add(toy('gigascarab', 3, 6.4, -4.6, -0.7));
  // cobwebs
  const web = new THREE.LineBasicMaterial({ color: 0xc8c0d0, transparent: true, opacity: 0.35 });
  for (const [cx, cz, s] of [[-8.6, -7.6, 1], [8.6, -7.6, -1]] as const) {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k < 7; k++) { const a = (k / 6) * Math.PI / 2; pts.push(new THREE.Vector3(cx, Y0 + 7.6, cz), new THREE.Vector3(cx + Math.cos(a) * 2.4 * s, Y0 + 7.6 - Math.sin(a) * 2.4, cz)); }
    for (let r = 0.6; r < 2.4; r += 0.5) for (let k = 0; k < 6; k++) { const a0 = (k / 6) * Math.PI / 2, a1 = ((k + 1) / 6) * Math.PI / 2; pts.push(new THREE.Vector3(cx + Math.cos(a0) * r * s, Y0 + 7.6 - Math.sin(a0) * r, cz), new THREE.Vector3(cx + Math.cos(a1) * r * s, Y0 + 7.6 - Math.sin(a1) * r, cz)); }
    g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), web));
  }
  // eyes in the dark
  const eyes: THREE.Mesh[] = [];
  const eyeMat = glowMat(2.6, 2.2, 0.6);
  for (const [x, y, z] of [[-5, 3.4, -7.4], [4.6, 2.4, -7.5], [-7.6, 1.6, -3], [7.8, 3, 1]] as const) {
    for (const dx of [-0.18, 0.18]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), eyeMat); e.position.set(x + dx, Y0 + y, z); g.add(e); eyes.push(e); }
  }
  const lantern = new THREE.Group();
  lantern.add(box(0.5, 0.7, 0.5, mat(0x2a2a2e, 0.5, 0.6), 0, 0, 0), new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), glowMat(3, 1.8, 0.8)));
  lantern.position.set(-3.6, Y0 + 5.2, -4);
  g.add(lantern);
  return {
    id: 'oldtrunk', group: g,
    look: { hemi: [0x6a5a90, 0x0c0814, 0.45], sun: [0xa090c0, 1.2, [-4, 12, 2]], lamp: [0xffa060, 18, [-3.6, 4.6, -4]], fill: [0x7060c0, 0.4], fog: [0x0c0814, 0.05], bg: 0x06040a, exposure: 1.05, floor: 'trunk', tiles: [0xe0d8f0, 0xb8a8c8], frame: 0x2a1820, motes: ['sparkle', 0xc8a0ff] },
    update: (_dt, t) => { eyes.forEach((e, i) => { const blink = (Math.sin(t * 0.7 + Math.floor(i / 2) * 2.1) > 0.96); e.scale.y = blink ? 0.1 : 1; }); lantern.rotation.z = Math.sin(t * 0.8) * 0.08; },
  };
}

// ---------------------------------------------------------------- shared props
function windowFrame(x: number, y: number, z: number, light: THREE.Color) {
  const winFrame = mat(0x4a3020, 0.8);
  const win = new THREE.Group();
  win.add(new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.6), new THREE.MeshBasicMaterial({ color: light, toneMapped: false })));
  for (const [w, h, bx, by] of [[3.6, 0.22, 0, 1.4], [3.6, 0.22, 0, -1.4], [0.22, 3, 1.7, 0], [0.22, 3, -1.7, 0], [0.12, 2.6, 0, 0], [3.2, 0.12, 0, 0]] as const) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.2), winFrame);
    b.position.set(bx, by, 0.1);
    win.add(b);
  }
  win.position.set(x, y, z);
  return win;
}
function lightShaft(x: number, y: number, z: number, at: THREE.Vector3, _k: number, col: [number, number, number]) {
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.6, 15, 24, 1, true), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec2 vUv; varying vec3 vN; void main(){ float edge = pow(abs(vN.z), 1.6); float a = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.7, vUv.y) * edge * 0.075; gl_FragColor = vec4(vec3(${col.join(',')}) * a, a); }`,
  }));
  beam.position.set(x, y, z);
  beam.lookAt(at);
  beam.rotateX(Math.PI / 2);
  return beam;
}
function letterBlocks(letters: string[], x: number, z: number) {
  const blocks = new THREE.Group();
  const bcols = ['#c0442e', '#2f6a9a', '#e0a83a', '#5f8a3a', '#7a4a9a'];
  const place: [number, number, number, number][] = [[0, 0, 0, 0.1], [0.78, 0, 0.1, -0.15], [0.4, 0.74, 0.05, 0.3], [-0.9, 0, 0.9, 0.7], [0.3, 1.48, 0, -0.2]];
  letters.forEach((ch, i) => {
    const b = new THREE.Mesh(new RoundedBoxGeometry(0.72, 0.72, 0.72, 2, 0.06), new THREE.MeshStandardMaterial({ map: letterTexture(ch, bcols[i % 5], '#f6ead2'), roughness: 0.6 }));
    const [bx, by, bz, r] = place[i % place.length];
    b.position.set(bx, Y0 + 0.36 + by, bz);
    b.rotation.y = r;
    blocks.add(b);
  });
  blocks.position.set(x, 0, z);
  return shadow(blocks);
}
function trunkProp(x: number, z: number, ry: number) {
  const wood = new THREE.MeshStandardMaterial({ map: woodTexture(77, [92, 54, 32], 512), roughness: 0.7 });
  const brass = mat(0xc8983e, 0.35, 0.85);
  const t = new THREE.Group();
  t.add(box(4.4, 1.8, 2.2, wood, 0, Y0 + 0.9, 0, 0.1));
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 4.4, 24, 1, false, 0, Math.PI), wood);
  lid.rotation.z = Math.PI / 2; lid.position.y = Y0 + 1.8;
  t.add(lid);
  for (const bx of [-1.6, 1.6]) t.add(box(0.18, 1.84, 2.26, brass, bx, Y0 + 0.9, 0, 0));
  t.add(box(0.4, 0.5, 0.1, brass, 0, Y0 + 1.4, 1.12, 0));
  t.position.set(x, 0, z); t.rotation.y = ry;
  return shadow(t);
}
function deskLamp(x: number, z: number) {
  const brass = mat(0xc8983e, 0.35, 0.85);
  const g = new THREE.Group();
  const lb = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.16, 32), brass); lb.position.y = -0.34;
  const arm1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 12), brass); arm1.position.set(0, 0.8, 0); arm1.rotation.z = 0.25;
  const arm2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 12), brass); arm2.position.set(-0.55, 2.2, 0); arm2.rotation.z = 1.2;
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.8, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0x2f5a46, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide })); shade.position.set(-1.2, 2.55, 0); shade.rotation.z = 0.7;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), glowMat(3, 2.4, 1.6)); bulb.position.set(-1.05, 2.3, 0);
  g.add(lb, arm1, arm2, shade, bulb);
  g.traverse(o => { if (o !== bulb) (o as THREE.Mesh).castShadow = true; });
  g.position.set(x, 0, z);
  return g;
}
export function rugTexture(): THREE.CanvasTexture {
  return canvasTex(1024, 1024, ctx => {
    const cols = ['#5a2a22', '#8a6a3a', '#2e4446', '#a8987a', '#4a3240', '#6a3e26', '#34462e', '#8a7a5a'];
    for (let r = 512, i = 0; r > 0; r -= 18, i++) {
      ctx.fillStyle = cols[(i * 3 + (i >> 2)) % cols.length];
      ctx.beginPath(); ctx.arc(512, 512, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 2;
      for (let a = 0; a < Math.PI * 2; a += 12 / r) { ctx.beginPath(); ctx.moveTo(512 + Math.cos(a) * (r - 2), 512 + Math.sin(a) * (r - 2)); ctx.lineTo(512 + Math.cos(a + 6 / r) * (r - 16), 512 + Math.sin(a + 6 / r) * (r - 16)); ctx.stroke(); }
    }
  });
}

const floorCache = new Map<string, THREE.Texture>();
export function floorTexture(kind: ArenaLook['floor']): THREE.Texture {
  let t = floorCache.get(kind);
  if (!t) { t = makeFloor(kind); floorCache.set(kind, t); }
  return t;
}
function makeFloor(kind: ArenaLook['floor']): THREE.Texture {
  switch (kind) {
    case 'felt': return canvasTex(256, 256, x => { x.fillStyle = '#3a6a3a'; x.fillRect(0, 0, 256, 256); for (let i = 0; i < 4000; i++) { x.fillStyle = Math.random() < 0.5 ? 'rgba(20,50,20,.25)' : 'rgba(120,170,100,.15)'; x.fillRect(Math.random() * 256, Math.random() * 256, 2, 1); } }, [16, 16]);
    case 'velvet': return canvasTex(256, 256, x => { const gr = x.createLinearGradient(0, 0, 256, 256); gr.addColorStop(0, '#5a1430'); gr.addColorStop(1, '#3a0a20'); x.fillStyle = gr; x.fillRect(0, 0, 256, 256); for (let i = 0; i < 3000; i++) { x.fillStyle = 'rgba(255,180,210,.05)'; x.fillRect(Math.random() * 256, Math.random() * 256, 1, 3); } }, [12, 12]);
    case 'checker': return canvasTex(128, 128, x => { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#2a2026' : '#e8e0d8'; x.fillRect(i * 32, j * 32, 32, 32); } }, [14, 14]);
    case 'shelf': { const t = plankTexture(23, [140, 96, 60], 3); t.repeat.set(3, 6); return t; }
    case 'trunk': { const t = plankTexture(29, [74, 46, 30], 6); t.repeat.set(4, 4); return t; }
    case 'sill': { const t = plankTexture(31, [196, 186, 170], 6); t.repeat.set(4, 4); return t; }
    default: { const t = plankTexture(11, [104, 66, 40], 7); t.repeat.set(5, 5); return t; }
  }
}

const BUILDERS: Record<ArenaId, () => Arena> = { attic, toychest, bookshelf, dollhouse, trainset, musicbox, lampcorner, windowsill, oldtrunk };
export function buildArena(id: ArenaId): Arena { return BUILDERS[id](); }
