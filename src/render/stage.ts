// The 3D stage: renderer, attic diorama, lights, camera rig, post-processing and picking.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { runTicks, tween, ease, lerp, animCfg } from './anim';
import { clothTexture, letterTexture, plankTexture, softDot, woodTexture } from './tex';

export const TILE = 1;
export const TILE_TOP = 0.075;
export type Quality = 'low' | 'medium' | 'high';

/** Grid (x,y) -> world position of the tile centre. Player 0's home row is nearest the default camera. */
export function tileWorld(x: number, y: number, out = new THREE.Vector3()) {
  return out.set((x - 2) * TILE, TILE_TOP, (2 - y) * TILE);
}
/** Model faces +z; facing dir 0 (N) points to world -z. */
export const DIR_ROT = [Math.PI, Math.PI / 2, 0, -Math.PI / 2];

const FINAL_SHADER = {
  uniforms: {
    tDiffuse: { value: null }, resolution: { value: new THREE.Vector2(1, 1) }, time: { value: 0 },
    focus: { value: 0.5 }, blurAmt: { value: 1 }, vignette: { value: 0.9 }, grainAmt: { value: 0.035 }, flash: { value: new THREE.Vector4(0, 0, 0, 0) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 resolution; uniform float time, focus, blurAmt, vignette, grainAmt; uniform vec4 flash;
    varying vec2 vUv;
    float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      float d = abs(uv.y - focus);
      float b = smoothstep(0.16, 0.62, d) * blurAmt;
      vec4 col = texture2D(tDiffuse, uv);
      if (b > 0.002) {
        vec4 acc = col; float w = 1.0;
        for (int i = 0; i < 16; i++) {
          float a = float(i) * 2.39996; float r = sqrt(float(i) + 0.5) / 4.0;
          vec2 off = vec2(cos(a), sin(a)) * r * b * 9.0 / resolution;
          acc += texture2D(tDiffuse, uv + off); w += 1.0;
        }
        col = acc / w;
      }
      vec3 c = col.rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(c, c * vec3(1.04, 0.99, 0.92), smoothstep(0.6, 0.0, l));   // warm the shadows
      c = mix(vec3(l), c, 1.07);
      vec2 q = (uv - 0.5) * vec2(1.0, 1.2);
      c *= clamp(1.0 - dot(q, q) * vignette, 0.0, 1.0);
      c = mix(c, flash.rgb, flash.a);
      c += (rand(uv * resolution + fract(time)) - 0.5) * grainAmt;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export class Stage {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  composer!: EffectComposer;
  bloom!: UnrealBloomPass;
  final!: ShaderPass;
  quality: Quality = 'high';
  board = new THREE.Group();
  tiles: THREE.Mesh[] = [];
  root = new THREE.Group(); // everything that belongs to a match
  sun!: THREE.DirectionalLight;
  dust!: THREE.Points;
  private dustVel!: Float32Array;
  private raycaster = new THREE.Raycaster();
  // camera rig
  rig = { az: 0, el: 0.92, dist: 12, tx: 0, ty: 0, tz: 0.3, fov: 30 };
  private rigTarget = { ...this.rig };
  azStep = 0;
  private shakeAmt = 0;
  private lastT = performance.now();
  private cinematic = false;
  mode: 'menu' | 'board' = 'menu';
  viewShift = 0;
  viewShiftX = 0;
  private vs = { y: 0, x: 0 };
  private menuT = 0;
  onFrame: ((dt: number) => void)[] = [];

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 120);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    (this.scene as unknown as { environmentIntensity: number }).environmentIntensity = 0.28;
    this.scene.background = new THREE.Color(0x140c08);
    this.scene.fog = new THREE.FogExp2(0x1a100a, 0.035);
    this.buildAttic();
    this.buildBoard();
    this.scene.add(this.root);
    this.setupPost();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    const loop = () => {
      requestAnimationFrame(loop);
      const t = performance.now();
      const dt = Math.min(0.12, (t - this.lastT) / 1000);
      this.lastT = t;
      if (document.hidden) return;
      runTicks(dt);
      this.update(dt, t / 1000);
      for (const f of this.onFrame) f(dt);
      this.composer.render(dt);
    };
    requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------- environment
  private buildAttic() {
    const s = this.scene;
    const hemi = new THREE.HemisphereLight(0xffe4c0, 0x2a1810, 0.75);
    s.add(hemi);
    const sun = new THREE.DirectionalLight(0xffd6a0, 2.7);
    sun.position.set(-7, 11, -6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -7; sc.right = 7; sc.top = 7; sc.bottom = -7; sc.near = 2; sc.far = 32;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.025;
    s.add(sun, sun.target);
    this.sun = sun;
    const fill = new THREE.DirectionalLight(0xa8b8ff, 0.42);
    fill.position.set(5, 7, 10);
    s.add(fill);
    const lamp = new THREE.PointLight(0xffa456, 16, 13, 2);
    lamp.position.set(5.5, 2.9, -1.6);
    s.add(lamp);

    // floor + rag rug
    const floorTex = plankTexture(11, [104, 66, 40], 7);
    floorTex.repeat.set(5, 5);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.86 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.42;
    floor.receiveShadow = true;
    s.add(floor);
    const rug = new THREE.Mesh(new THREE.CircleGeometry(5.9, 96), new THREE.MeshStandardMaterial({ map: rugTexture(), roughness: 0.95, color: 0xb8a890 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.y = -0.405;
    rug.receiveShadow = true;
    s.add(rug);

    // back wall with a window
    const wallTex = plankTexture(5, [70, 44, 28], 9, true);
    wallTex.repeat.set(4, 1);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 16), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 }));
    wall.position.set(0, 7.5, -11);
    wall.receiveShadow = true;
    s.add(wall);
    const winFrame = new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.8 });
    const win = new THREE.Group();
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.9, 1.4), toneMapped: false }));
    win.add(pane);
    for (const [w, h, x, y] of [[3.6, 0.22, 0, 1.4], [3.6, 0.22, 0, -1.4], [0.22, 3, 1.7, 0], [0.22, 3, -1.7, 0], [0.12, 2.6, 0, 0], [3.2, 0.12, 0, 0]] as const) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.2), winFrame);
      b.position.set(x, y, 0.1);
      win.add(b);
    }
    win.position.set(-4.2, 4.6, -10.95);
    s.add(win);
    // god-ray shaft from the window toward the board
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.6, 15, 24, 1, true), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { time: { value: 0 } },
      vertexShader: 'varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec2 vUv; varying vec3 vN; void main(){ float edge = pow(abs(vN.z), 1.6); float a = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.7, vUv.y) * edge * 0.075; gl_FragColor = vec4(vec3(1.0, 0.86, 0.62) * a, a); }',
    }));
    beam.position.set(-2.4, 3.2, -4.6);
    beam.lookAt(new THREE.Vector3(0.6, -0.4, 0.6));
    beam.rotateX(Math.PI / 2);
    s.add(beam);
    // dust motes in the beam
    const n = 500;
    const pos = new Float32Array(n * 3);
    this.dustVel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = -6 + Math.random() * 10; pos[i * 3 + 1] = Math.random() * 7; pos[i * 3 + 2] = -9 + Math.random() * 11;
      this.dustVel[i * 3] = (Math.random() - 0.5) * 0.05; this.dustVel[i * 3 + 1] = (Math.random() - 0.4) * 0.03; this.dustVel[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ size: 0.05, map: softDot(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffe2b0, opacity: 0.8 }));
    s.add(this.dust);

    // props: books (back left), letter blocks (back right), trunk (far back), brass lamp (right)
    const books = new THREE.Group();
    const bookCols: [number, number, number][] = [[120, 40, 36], [44, 78, 96], [86, 104, 58], [150, 110, 52], [70, 44, 80]];
    let by = -0.42;
    bookCols.forEach((c, i) => {
      const h = 0.34 + (i % 2) * 0.1;
      const geo = new RoundedBoxGeometry(2.3 - i * 0.12, h, 1.6 - (i % 3) * 0.1, 2, 0.04);
      const mats = [clothTexture(i + 3, c, 'rgba(214,170,80,0.9)')].map(t => new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }));
      const pages = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.9 });
      const b = new THREE.Mesh(geo, [mats[0], mats[0], mats[0], mats[0], pages, mats[0]]);
      b.position.y = by + h / 2;
      by += h;
      b.rotation.y = (i - 2) * 0.12;
      b.castShadow = b.receiveShadow = true;
      books.add(b);
    });
    books.position.set(-5.9, 0, -3.4);
    s.add(books);
    const blocks = new THREE.Group();
    const letters = ['S', 'T', 'A', 'C', 'K'];
    const bcols = ['#c0442e', '#2f6a9a', '#e0a83a', '#5f8a3a', '#7a4a9a'];
    const place: [number, number, number, number][] = [[0, 0, 0, 0.1], [0.78, 0, 0.1, -0.15], [0.4, 0.74, 0.05, 0.3], [-0.9, 0, 0.9, 0.7], [0.3, 1.48, 0, -0.2]];
    letters.forEach((ch, i) => {
      const t = letterTexture(ch, bcols[i], '#f6ead2');
      const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
      const b = new THREE.Mesh(new RoundedBoxGeometry(0.72, 0.72, 0.72, 2, 0.06), m);
      const [x, y, z, r] = place[i];
      b.position.set(x, -0.42 + 0.36 + y, z);
      b.rotation.y = r;
      b.castShadow = b.receiveShadow = true;
      blocks.add(b);
    });
    blocks.position.set(5.6, 0, -3.8);
    s.add(blocks);
    const trunkWood = new THREE.MeshStandardMaterial({ map: woodTexture(77, [92, 54, 32], 512), roughness: 0.7 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xc8983e, metalness: 0.85, roughness: 0.35 });
    const trunk = new THREE.Group();
    const tb = new THREE.Mesh(new RoundedBoxGeometry(4.4, 1.8, 2.2, 3, 0.1), trunkWood);
    tb.position.y = 0.9 - 0.42;
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 4.4, 24, 1, false, 0, Math.PI), trunkWood);
    lid.rotation.z = Math.PI / 2;
    lid.position.y = 1.8 - 0.42;
    trunk.add(tb, lid);
    for (const x of [-1.6, 1.6]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.84, 2.26), brass);
      band.position.set(x, 0.9 - 0.42, 0);
      trunk.add(band);
    }
    const latch = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.1), brass);
    latch.position.set(0, 1.4 - 0.42, 1.12);
    trunk.add(latch);
    trunk.traverse(o => { (o as THREE.Mesh).castShadow = (o as THREE.Mesh).receiveShadow = true; });
    trunk.position.set(0.6, 0, -7.2);
    trunk.rotation.y = -0.08;
    s.add(trunk);
    const lampG = new THREE.Group();
    const lb = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.16, 32), brass);
    lb.position.y = -0.34;
    const arm1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 12), brass);
    arm1.position.set(0, 0.8, 0); arm1.rotation.z = 0.25;
    const arm2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 12), brass);
    arm2.position.set(-0.55, 2.2, 0); arm2.rotation.z = 1.2;
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.8, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0x2f5a46, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide }));
    shade.position.set(-1.2, 2.55, 0); shade.rotation.z = 0.7;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.4, 1.6), toneMapped: false }));
    bulb.position.set(-1.05, 2.3, 0);
    lampG.add(lb, arm1, arm2, shade, bulb);
    lampG.traverse(o => { if (o !== bulb) (o as THREE.Mesh).castShadow = true; });
    lampG.position.set(6.6, 0, -1.4);
    s.add(lampG);
    // scattered marbles and a spool by the board
    const marbleCols = [0x3a7ad0, 0xd05a4a, 0x6ac06a, 0xe8c040];
    marbleCols.forEach((c, i) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 14), new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.05, clearcoat: 1, transmission: 0.2 }));
      m.position.set(-4.1 + i * 0.45, -0.42 + 0.16, 3.6 - (i % 2) * 0.5);
      m.castShadow = true;
      s.add(m);
    });
    const spool = new THREE.Group();
    const sw = new THREE.MeshStandardMaterial({ map: woodTexture(5, [180, 140, 90]), roughness: 0.7 });
    const thread = new THREE.MeshStandardMaterial({ color: 0xb0364a, roughness: 0.9 });
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.5, 24), thread);
    const e1 = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.08, 24), sw); e1.position.y = 0.29;
    const e2 = e1.clone(); e2.position.y = -0.29;
    spool.add(sp, e1, e2);
    spool.traverse(o => { (o as THREE.Mesh).castShadow = true; });
    spool.position.set(4.6, -0.42 + 0.33, 3.3);
    s.add(spool);
  }

  private buildBoard() {
    const walnut = new THREE.MeshStandardMaterial({ map: woodTexture(31, [82, 48, 28], 512), roughness: 0.55 });
    const frame = new THREE.Mesh(new RoundedBoxGeometry(6.1, 0.42, 6.1, 4, 0.1), walnut);
    frame.position.y = -0.21;
    frame.castShadow = frame.receiveShadow = true;
    this.board.add(frame);
    // player edge felts
    for (const [z, col] of [[2.88, 0x2f5f8a], [-2.88, 0x9a3a2a]] as const) {
      const felt = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.03, 0.16), new THREE.MeshStandardMaterial({ color: col, roughness: 1 }));
      felt.position.set(0, 0.005, z);
      felt.receiveShadow = true;
      this.board.add(felt);
    }
    const brass = new THREE.MeshStandardMaterial({ color: 0xcf9f48, metalness: 0.9, roughness: 0.3 });
    for (const x of [-2.86, 2.86]) for (const z of [-2.86, 2.86]) {
      const cap = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.08, 0.42, 2, 0.03), brass);
      cap.position.set(x, 0.01, z);
      this.board.add(cap);
    }
    const tA = woodTexture(41, [196, 156, 104]), tB = woodTexture(43, [150, 100, 62]);
    const geo = new RoundedBoxGeometry(0.94, 0.12, 0.94, 2, 0.035);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
      const light = (x + y) % 2 === 0;
      const mat = new THREE.MeshStandardMaterial({ map: light ? tA : tB, roughness: 0.6, color: y <= 1 ? 0xf0f4ff : y >= 3 ? 0xfff0ea : 0xffffff });
      const t = new THREE.Mesh(geo, mat);
      tileWorld(x, y, t.position);
      t.position.y = TILE_TOP - 0.06;
      t.receiveShadow = true;
      t.userData = { x, y };
      this.tiles.push(t);
      this.board.add(t);
    }
    this.scene.add(this.board);
  }

  private setupPost() {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.42, 0.55, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.final = new ShaderPass(FINAL_SHADER);
    this.composer.addPass(this.final);
  }

  setQuality(q: Quality) {
    this.quality = q;
    this.bloom.enabled = q === 'high';
    this.final.uniforms.blurAmt.value = q === 'low' ? 0 : 1;
    this.renderer.shadowMap.enabled = true;
    this.sun.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
    this.sun.shadow.map?.dispose();
    (this.sun.shadow as unknown as { map: null }).map = null;
    this.resize();
  }

  resize() {
    const w = this.host.clientWidth || window.innerWidth, h = this.host.clientHeight || window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, this.quality === 'high' ? 2 : this.quality === 'medium' ? 1.5 : 1);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.final.uniforms.resolution.value.set(w * pr, h * pr);
    this.camera.aspect = w / h;
    this.fitBoard();
  }

  /** Pick a camera distance that fits the board for the current aspect, leaving room for the HUD. */
  fitBoard() {
    const w = this.host.clientWidth || window.innerWidth, h = this.host.clientHeight || window.innerHeight;
    const aspect = w / h;
    const vf = (this.rig.fov * Math.PI) / 180;
    const hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
    const portrait = aspect < 0.9;
    const needW = portrait ? 3.3 : 3.7, needH = portrait ? 3.15 : 3.4;
    const d = Math.max(needW / Math.tan(hf / 2), needH / Math.tan(vf / 2)) + 1.2;
    this.boardDist = Math.min(30, d);
    if (this.mode === 'board' && !this.cinematic) this.rigTarget.dist = this.boardDist;
    this.camera.updateProjectionMatrix();
  }
  boardDist = 12;

  setViewShift(px: number, pxX = 0) { this.viewShift = px; this.viewShiftX = pxX; }

  setMode(mode: 'menu' | 'board') {
    this.mode = mode;
    if (mode === 'board') Object.assign(this.rigTarget, { el: 0.95, dist: this.boardDist, tx: 0, ty: 0, tz: 0.2, az: this.azStep * Math.PI / 2 });
  }

  rotateView(step: number) {
    this.azStep = (this.azStep + step + 4) % 4;
    let target = this.azStep * Math.PI / 2;
    // shortest path from the current angle
    while (target - this.rigTarget.az > Math.PI) target -= Math.PI * 2;
    while (target - this.rigTarget.az < -Math.PI) target += Math.PI * 2;
    this.rigTarget.az = target;
  }

  /** Swoop the camera to a world point, hold, then return. */
  async cinematicTo(p: THREE.Vector3, opts: { dist?: number; el?: number; hold?: number; dur?: number } = {}) {
    if (animCfg.reduceMotion) return;
    this.cinematic = true;
    const from = { ...this.rigTarget };
    Object.assign(this.rigTarget, { tx: p.x, ty: p.y + 0.5, tz: p.z, dist: opts.dist ?? 5, el: opts.el ?? 0.5 });
    await tween(opts.dur ?? 600, () => {}, ease.linear);
    await tween(opts.hold ?? 500, () => {}, ease.linear);
    Object.assign(this.rigTarget, { ...from, dist: this.mode === 'board' ? this.boardDist : from.dist });
    this.cinematic = false;
  }

  shake(amount = 0.15) { if (!animCfg.reduceMotion) this.shakeAmt = Math.max(this.shakeAmt, amount); }

  flash(r: number, g: number, b: number, a = 0.35, ms = 260) {
    const f = this.final.uniforms.flash.value as THREE.Vector4;
    tween(ms, k => f.set(r, g, b, a * (1 - k)), ease.outQuad);
  }

  private update(dt: number, t: number) {
    // camera rig smoothing
    const R = this.rig, T = this.rigTarget;
    if (this.mode === 'menu' && !this.cinematic) {
      this.menuT += dt;
      T.az = Math.sin(this.menuT * 0.06) * 0.35 - 0.35;
      T.el = 0.46 + Math.sin(this.menuT * 0.09) * 0.04;
      T.dist = this.boardDist * 0.68;
      T.tx = 0; T.ty = 0.6; T.tz = 0.2;
    }
    const k = 1 - Math.exp(-dt * (this.cinematic ? 4.5 : 3.2));
    R.az = lerp(R.az, T.az, k); R.el = lerp(R.el, T.el, k); R.dist = lerp(R.dist, T.dist, k);
    R.tx = lerp(R.tx, T.tx, k); R.ty = lerp(R.ty, T.ty, k); R.tz = lerp(R.tz, T.tz, k);
    const cx = R.tx + Math.sin(R.az) * Math.cos(R.el) * R.dist;
    const cy = R.ty + Math.sin(R.el) * R.dist;
    const cz = R.tz + Math.cos(R.az) * Math.cos(R.el) * R.dist;
    this.camera.position.set(cx, cy, cz);
    if (this.shakeAmt > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeAmt;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt *= Math.exp(-dt * 9);
    }
    this.camera.lookAt(R.tx, R.ty, R.tz);
    const w = this.host.clientWidth || window.innerWidth, h = this.host.clientHeight || window.innerHeight;
    this.vs.y = lerp(this.vs.y, this.viewShift, k); this.vs.x = lerp(this.vs.x, this.viewShiftX, k);
    if (Math.abs(this.vs.y) > 0.5 || Math.abs(this.vs.x) > 0.5) this.camera.setViewOffset(w, h, this.vs.x, this.vs.y, w, h); else this.camera.clearViewOffset();
    // tilt-shift focus follows the board centre on screen
    const c = new THREE.Vector3(R.tx, R.ty, R.tz).project(this.camera);
    this.final.uniforms.focus.value = (c.y + 1) / 2;
    this.final.uniforms.time.value = t;
    // dust
    const pos = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
    const a = pos.array as Float32Array, v = this.dustVel;
    for (let i = 0; i < a.length; i += 3) {
      a[i] += (v[i] + Math.sin(t * 0.3 + i) * 0.02) * dt;
      a[i + 1] += v[i + 1] * dt;
      a[i + 2] += v[i + 2] * dt;
      if (a[i + 1] > 7 || a[i + 1] < -0.3) a[i + 1] = a[i + 1] > 7 ? 0 : 6.9;
      if (a[i] > 4) a[i] = -6; else if (a[i] < -6) a[i] = 4;
      if (a[i + 2] > 2) a[i + 2] = -9; else if (a[i + 2] < -9) a[i + 2] = 2;
    }
    pos.needsUpdate = true;
  }

  /** Grid tile under a screen point, or null. */
  pick(clientX: number, clientY: number): { x: number; y: number } | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    // stacks are tall: also test a vertical slab per tile by intersecting the board plane at a few heights
    const hits = this.raycaster.intersectObjects(this.tiles, false);
    if (hits.length) return hits[0].object.userData as { x: number; y: number };
    for (const hgt of [0.4, 0.8, 1.2, 1.6]) {
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -hgt);
      const p = new THREE.Vector3();
      if (!this.raycaster.ray.intersectPlane(plane, p)) continue;
      const gx = Math.round(p.x / TILE + 2), gy = Math.round(2 - p.z / TILE);
      if (gx >= 0 && gx < 5 && gy >= 0 && gy < 5 && Math.abs(p.x - (gx - 2)) < 0.35 && Math.abs(p.z - (2 - gy)) < 0.35) return { x: gx, y: gy };
    }
    return null;
  }

  /** World -> CSS pixel position within the host. */
  toScreen(p: THREE.Vector3): { x: number; y: number; behind: boolean } {
    const v = p.clone().project(this.camera);
    const w = this.host.clientWidth || window.innerWidth, h = this.host.clientHeight || window.innerHeight;
    return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, behind: v.z > 1 };
  }
}

function rugTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const ctx = c.getContext('2d')!;
  const cols = ['#5a2a22', '#8a6a3a', '#2e4446', '#a8987a', '#4a3240', '#6a3e26', '#34462e', '#8a7a5a'];
  for (let r = 512, i = 0; r > 0; r -= 18, i++) {
    ctx.fillStyle = cols[(i * 3 + (i >> 2)) % cols.length];
    ctx.beginPath(); ctx.arc(512, 512, r, 0, Math.PI * 2); ctx.fill();
    // braid texture
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 2;
    for (let a = 0; a < Math.PI * 2; a += 12 / r) {
      ctx.beginPath();
      ctx.moveTo(512 + Math.cos(a) * (r - 2), 512 + Math.sin(a) * (r - 2));
      ctx.lineTo(512 + Math.cos(a + 6 / r) * (r - 16), 512 + Math.sin(a + 6 / r) * (r - 16));
      ctx.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
