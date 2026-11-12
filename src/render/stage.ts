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
import { softDot, woodTexture } from './tex';
import { buildArena, floorTexture, type Arena, type MoteMode } from './arenas';
import type { ArenaId } from '../game/arena-info';

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
    this.setArena('attic');
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
  private hemi!: THREE.HemisphereLight;
  private fillLight!: THREE.DirectionalLight;
  private lampLight!: THREE.PointLight;
  private floor!: THREE.Mesh;
  private frameMat!: THREE.MeshStandardMaterial;
  private arena: Arena | null = null;
  private arenaCache = new Map<ArenaId, Arena>();
  arenaId: ArenaId = 'attic';
  private moteMode: MoteMode = 'dust';

  private buildAttic() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(0xffe4c0, 0x2a1810, 0.75);
    s.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xffd6a0, 2.7);
    sun.position.set(-7, 11, -6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -8; sc.right = 8; sc.top = 8; sc.bottom = -8; sc.near = 2; sc.far = 34;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.025;
    s.add(sun, sun.target);
    this.sun = sun;
    this.fillLight = new THREE.DirectionalLight(0xa8b8ff, 0.42);
    this.fillLight.position.set(5, 7, 10);
    s.add(this.fillLight);
    this.lampLight = new THREE.PointLight(0xffa456, 16, 13, 2);
    this.lampLight.position.set(5.5, 2.9, -1.6);
    s.add(this.lampLight);
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ map: floorTexture('planks'), roughness: 0.86 }));
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -0.42;
    this.floor.receiveShadow = true;
    s.add(this.floor);
    const n = 500;
    const pos = new Float32Array(n * 3);
    this.dustVel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = -6 + Math.random() * 10; pos[i * 3 + 1] = Math.random() * 7; pos[i * 3 + 2] = -9 + Math.random() * 11; }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ size: 0.05, map: softDot(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffe2b0, opacity: 0.8 }));
    s.add(this.dust);
  }

  /** Swap the playset around the board: props, lighting, fog, floor, board colours, motes. */
  setArena(id: ArenaId) {
    if (this.arena?.id === id) return;
    if (this.arena) this.scene.remove(this.arena.group);
    let a = this.arenaCache.get(id);
    if (!a) { a = buildArena(id); this.arenaCache.set(id, a); }
    this.arena = a;
    this.arenaId = id;
    a.group.userData.lampLight = this.lampLight;
    this.scene.add(a.group);
    const L = a.look;
    this.hemi.color.setHex(L.hemi[0]); this.hemi.groundColor.setHex(L.hemi[1]); this.hemi.intensity = L.hemi[2];
    this.sun.color.setHex(L.sun[0]); this.sun.intensity = L.sun[1]; this.sun.position.set(...L.sun[2]);
    this.lampLight.color.setHex(L.lamp[0]); this.lampLight.intensity = L.lamp[1]; this.lampLight.position.set(...L.lamp[2]);
    this.fillLight.color.setHex(L.fill[0]); this.fillLight.intensity = L.fill[1];
    (this.scene.fog as THREE.FogExp2).color.setHex(L.fog[0]); (this.scene.fog as THREE.FogExp2).density = L.fog[1];
    (this.scene.background as THREE.Color).setHex(L.bg);
    this.renderer.toneMappingExposure = L.exposure;
    const fm = this.floor.material as THREE.MeshStandardMaterial;
    fm.map = floorTexture(L.floor); fm.roughness = L.floor === 'velvet' || L.floor === 'felt' ? 1 : 0.85; fm.needsUpdate = true;
    this.frameMat.color.setHex(L.frame);
    this.tiles.forEach(t => {
      const { x, y } = t.userData as { x: number; y: number };
      const tint = new THREE.Color((x + y) % 2 === 0 ? L.tiles[0] : L.tiles[1]);
      const side = new THREE.Color(y <= 1 ? 0xf0f4ff : y >= 3 ? 0xfff0ea : 0xffffff);
      (t.material as THREE.MeshStandardMaterial).color.copy(tint.multiply(side));
    });
    this.moteMode = L.motes[0];
    (this.dust.material as THREE.PointsMaterial).color.setHex(L.motes[1]);
    (this.dust.material as THREE.PointsMaterial).size = this.moteMode === 'rain' ? 0.035 : this.moteMode === 'notes' ? 0.09 : this.moteMode === 'embers' ? 0.06 : 0.05;
    const v = this.dustVel;
    for (let i = 0; i < v.length; i += 3) {
      const m = this.moteMode;
      v[i] = (Math.random() - 0.5) * (m === 'rain' ? 0.2 : 0.05);
      v[i + 1] = m === 'rain' ? -5 - Math.random() * 2 : m === 'notes' || m === 'embers' ? 0.15 + Math.random() * 0.25 : (Math.random() - 0.4) * 0.03;
      v[i + 2] = (Math.random() - 0.5) * 0.05;
    }
  }

  private buildBoard() {
    const walnut = new THREE.MeshStandardMaterial({ map: woodTexture(31, [82, 48, 28], 512), roughness: 0.55 });
    this.frameMat = walnut;
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
    const d = Math.max(needW / Math.tan(hf / 2), needH / Math.tan(vf / 2)) + 1.8;
    this.boardDist = Math.min(30, d);
    if (this.mode === 'board' && !this.cinematic) this.rigTarget.dist = this.boardDist;
    this.camera.updateProjectionMatrix();
  }
  boardDist = 12;

  setViewShift(px: number, pxX = 0) { this.viewShift = px; this.viewShiftX = pxX; }

  setMode(mode: 'menu' | 'board') {
    this.mode = mode;
    if (mode === 'board') Object.assign(this.rigTarget, { el: 0.86, dist: this.boardDist, tx: 0, ty: 0, tz: 0.2, az: this.azStep * Math.PI / 2 });
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
  async cinematicTo(p: THREE.Vector3, opts: { dist?: number; el?: number; hold?: number; dur?: number; orbit?: number } = {}) {
    if (animCfg.reduceMotion) return;
    this.cinematic = true;
    const from = { ...this.rigTarget };
    Object.assign(this.rigTarget, { tx: p.x, ty: p.y + 0.5, tz: p.z, dist: opts.dist ?? 5, el: opts.el ?? 0.5 });
    await tween(opts.dur ?? 600, () => {}, ease.linear);
    const az0 = this.rigTarget.az;
    await tween(opts.hold ?? 500, k => { if (opts.orbit) this.rigTarget.az = az0 + opts.orbit * k; }, ease.inOutCubic);
    Object.assign(this.rigTarget, { ...from, dist: this.mode === 'board' ? this.boardDist : from.dist });
    this.cinematic = false;
  }

  private punchAmt = 0;
  private punchAt = new THREE.Vector3();
  /** Quick dolly toward a point (decays on its own). */
  punch(p: THREE.Vector3, amt = 0.6) { if (animCfg.reduceMotion) return; this.punchAt.copy(p); this.punchAmt = Math.max(this.punchAmt, amt); }

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
    if (this.punchAmt > 0.001) {
      this.camera.position.lerp(this.punchAt, Math.min(0.25, this.punchAmt * 0.12));
      this.punchAmt *= Math.exp(-dt * 7);
    }
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
      if (this.moteMode === 'rain' && a[i + 2] > -6) a[i + 2] = -9 + Math.random() * 3;
      if (a[i + 1] > 7 || a[i + 1] < -0.3) a[i + 1] = a[i + 1] > 7 ? 0 : 6.9;
      if (a[i] > 4) a[i] = -6; else if (a[i] < -6) a[i] = 4;
      if (a[i + 2] > 2) a[i + 2] = -9; else if (a[i + 2] < -9) a[i + 2] = 2;
    }
    pos.needsUpdate = true;
    this.arena?.update?.(dt, t);
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
