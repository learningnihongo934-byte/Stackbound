// Turns engine state + events into the 3D board: living voxel toys (animated, with idles and reaction
// bubbles), facing tokens, labels, highlights, terrain, traps, control points, hazard warnings and all
// the event animations, with hit-stop, camera punches, slow-mo and letterboxed cinematics.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { card, SKILLS } from '../engine/cards';
import { DIRV, lead, maxHp, mods, POINTS } from '../engine/rules';
import type { Elem, Ev, GameState, PlayerId, Stack } from '../engine/types';
import { angleLerp, animCfg, ease, hitStop, lerp, onTick, slowmo, tween, wait } from './anim';
import { assemble, Debris, projectile, ring, sparkle } from './fx';
import { voxelMesh, voxelPoints, VOX, type ToyUniforms } from './mesh';
import { DIR_ROT, Stage, tileWorld, TILE_TOP } from './stage';
import { sfx } from '../game/audio';
import { ICON } from '../ui/icons';
import { cardArt } from '../ui/cardview';

export const ELEM_COLOR: Record<Elem, number> = { ember: 0xff7a3a, tide: 0x4ab8e8, moss: 0x7ac85a, volt: 0xffd84a, stone: 0xb8b0a4, gleam: 0xe8a0ff };
const OWNER_COL = [0x2f5f8a, 0x9a3a2a];
const SUPPORT_SCALE = 0.72;

type BubbleKind = 'alert' | 'anger' | 'zzz' | 'heart' | 'sweat' | 'note' | 'star' | 'what';
const BUBBLE_SVG: Record<BubbleKind, string> = {
  alert: '<path d="M10 3h4l-1 11h-2zM10 17h4v4h-4z" fill="#c0442e"/>',
  anger: '<path d="M5 9l4 1-1-4M19 9l-4 1 1-4M5 15l4-1-1 4M19 15l-4-1 1 4" stroke="#c0442e" stroke-width="2.6" fill="none" stroke-linecap="round"/>',
  zzz: '<path d="M4 6h6l-6 7h6M13 12h5l-5 6h5" stroke="#3a6ac8" stroke-width="2.2" fill="none" stroke-linejoin="round"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" fill="#e05a7a"/>',
  sweat: '<path d="M14 3c3 5 5 8 5 11a5 5 0 01-10 0c0-3 2-6 5-11z" fill="#5ab0e8"/>',
  note: '<path d="M9 17V5l10-2v12" stroke="#2b1d14" stroke-width="2" fill="none"/><circle cx="7" cy="17" r="3" fill="#2b1d14"/><circle cx="17" cy="15" r="3" fill="#2b1d14"/>',
  star: '<path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 21l1.6-7L2 9.2l7.1-.6z" fill="#e8b830"/>',
  what: '<path d="M8 8a4 4 0 118 0c0 3-4 3-4 6M12 18v2" stroke="#2b1d14" stroke-width="2.6" fill="none" stroke-linecap="round"/>',
};

interface UnitView { uid: number; card: string; mesh: THREE.Mesh; h: number; scale: number; flash: number; U?: ToyUniforms; yaw: number; yawT: number; lean: number; walk: number }
interface StackView {
  id: number; owner: PlayerId; group: THREE.Group; body: THREE.Group; token: THREE.Group; units: UnitView[];
  label: HTMLDivElement; phase: number; glue?: THREE.Mesh; gear?: THREE.Object3D; gearId?: string | null; busy: boolean; dir: number;
  nextIdle: number; lastActive: number; sleeping: boolean; hop: number; shield: number; shieldMesh?: THREE.Mesh;
}
interface Bubble { el: HTMLDivElement; stack: number; until: number }

export type HlKind = 'move' | 'attack' | 'summon' | 'target' | 'select' | 'hover' | 'area' | 'danger';
const HL_COL: Record<HlKind, number> = { move: 0xf4e2b8, attack: 0xe84a32, summon: 0xf2b640, target: 0x48c8b0, select: 0xffd060, hover: 0xffffff, area: 0xe84a32, danger: 0xff3a1a };

const hlMat = (col: number) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, toneMapped: false,
  uniforms: { col: { value: new THREE.Color(col) }, time: { value: 0 }, fill: { value: 0.18 }, hatch: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform vec3 col; uniform float time, fill, hatch; varying vec2 vUv;
    float sdRound(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q,0.0)) + min(max(q.x,q.y),0.0) - r; }
    void main(){
      vec2 p = vUv - 0.5;
      float d = sdRound(p, vec2(0.46), 0.08);
      float border = smoothstep(0.035, 0.0, abs(d + 0.025));
      float ang = atan(p.y, p.x);
      float dash = step(0.5, fract(ang * 3.0 + time * 0.6));
      float inside = step(d, 0.0);
      float stripes = hatch * step(0.5, fract((vUv.x + vUv.y) * 6.0 - time * 0.8)) * inside * (0.35 + 0.25 * sin(time * 6.0));
      float a = border * (0.55 + 0.45 * dash) + inside * fill * (0.75 + 0.25 * sin(time * 3.0)) + stripes;
      gl_FragColor = vec4(col * 1.25, a);
    }`,
});

export class BattleView {
  stacks = new Map<number, StackView>();
  debris: Debris;
  private hl = new THREE.Group();
  private hlPool: THREE.Mesh[] = [];
  private warnPool: THREE.Mesh[] = [];
  private terrain = new Map<number, THREE.Object3D>();
  private traps = new Map<number, THREE.Object3D>();
  private gears: THREE.Group[] = [];
  private group = new THREE.Group();
  private bubbles: Bubble[] = [];
  private off: () => void;
  private t = 0;
  private look: { x: number; y: number } | null = null;
  selected: number | null = null;

  constructor(private stage: Stage, private labels: HTMLElement, public me: PlayerId) {
    stage.root.add(this.group);
    this.group.add(this.hl);
    this.debris = new Debris(this.group);
    this.buildGears();
    this.off = onTick(dt => { this.t += dt; this.frame(dt, this.t); });
  }

  dispose() {
    this.off();
    this.stage.root.remove(this.group);
    this.labels.innerHTML = '';
    this.stacks.clear();
    document.querySelectorAll('.letterbox, .titlecard').forEach(e => e.remove());
  }

  // ---------------------------------------------------------------- control-point gears
  private buildGears() {
    const brass = new THREE.MeshStandardMaterial({ color: 0xd8a848, metalness: 0.9, roughness: 0.28 });
    for (const [x, y] of POINTS) {
      const g = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 32), brass);
      g.add(disc);
      for (let i = 0; i < 10; i++) {
        const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.1), brass);
        const a = (i / 10) * Math.PI * 2;
        tooth.position.set(Math.cos(a) * 0.33, 0, Math.sin(a) * 0.33);
        tooth.rotation.y = -a;
        g.add(tooth);
      }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 16), new THREE.MeshStandardMaterial({ color: 0x5a3a1a, metalness: 0.4, roughness: 0.5 }));
      g.add(hub);
      tileWorld(x, y, g.position);
      g.position.y = TILE_TOP + 0.012;
      g.traverse(o => { (o as THREE.Mesh).receiveShadow = true; });
      g.userData = { spin: 0.2 };
      this.group.add(g);
      this.gears.push(g);
    }
  }

  // ---------------------------------------------------------------- stack views
  private makeToken(owner: PlayerId) {
    const g = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.45, 0.06, 40), new THREE.MeshStandardMaterial({ color: OWNER_COL[owner], roughness: 0.9 }));
    disc.position.y = 0.03;
    disc.receiveShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.018, 8, 48), new THREE.MeshStandardMaterial({ color: 0xd8a84a, metalness: 0.85, roughness: 0.3 }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.06;
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 0.2); arrowShape.lineTo(-0.13, 0); arrowShape.lineTo(0.13, 0); arrowShape.lineTo(0, 0.2);
    const arrow = new THREE.Mesh(new THREE.ExtrudeGeometry(arrowShape, { depth: 0.03, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: 0xf4e6c8, roughness: 0.5 }));
    arrow.rotation.x = -Math.PI / 2;
    arrow.position.set(0, 0.062, 0.3);
    g.add(disc, rim, arrow);
    return g;
  }

  private createStack(st: Stack, visible = true): StackView {
    const group = new THREE.Group();
    tileWorld(st.x, st.y, group.position);
    const body = new THREE.Group();
    const token = this.makeToken(st.owner);
    group.add(token, body);
    group.rotation.y = DIR_ROT[st.dir];
    this.group.add(group);
    const label = document.createElement('div');
    label.className = 'stack-label ' + (st.owner === this.me ? 'mine' : 'theirs');
    this.labels.appendChild(label);
    const v: StackView = { id: st.id, owner: st.owner, group, body, token, units: [], label, phase: Math.random() * 6, busy: false, dir: st.dir, nextIdle: this.t + 2 + Math.random() * 4, lastActive: this.t, sleeping: false, hop: 0, shield: 0 };
    for (const u of st.units) this.addUnit(v, u.uid, u.card, visible);
    this.layout(v, false);
    this.stacks.set(st.id, v);
    return v;
  }

  private addUnit(v: StackView, uid: number, cardId: string, visible: boolean): UnitView {
    const { mesh, height, uniforms } = voxelMesh(cardId, true);
    mesh.visible = visible;
    v.body.add(mesh);
    const u: UnitView = { uid, card: cardId, mesh, h: height, scale: 1, flash: 0, U: uniforms, yaw: 0, yawT: 0, lean: 0, walk: 0 };
    v.units.push(u);
    return u;
  }

  private layout(v: StackView, animate: boolean, ms = 260): number {
    let y = 0.065;
    const targets: { u: UnitView; y: number; s: number }[] = [];
    v.units.forEach((u, i) => {
      const s = i === v.units.length - 1 ? 1 : SUPPORT_SCALE;
      targets.push({ u, y, s });
      y += u.h * s * 0.94;
    });
    for (const t of targets) {
      if (!animate || !t.u.mesh.visible) { t.u.mesh.position.y = t.y; t.u.mesh.scale.setScalar(t.s); t.u.scale = t.s; continue; }
      const y0 = t.u.mesh.position.y, s0 = t.u.scale;
      tween(ms, k => { t.u.mesh.position.y = lerp(y0, t.y, k); t.u.scale = lerp(s0, t.s, k); }, ease.outBack);
    }
    return y;
  }
  private topY(v: StackView) {
    let y = 0.065;
    v.units.forEach((u, i) => { y += u.h * (i === v.units.length - 1 ? 1 : SUPPORT_SCALE) * 0.94; });
    return y;
  }
  private leadOf(v: StackView) { return v.units[v.units.length - 1]; }
  private wake(v: StackView) { v.lastActive = this.t; if (v.sleeping) { v.sleeping = false; } }

  private removeStack(id: number) {
    const v = this.stacks.get(id);
    if (!v) return;
    this.group.remove(v.group);
    v.label.remove();
    this.stacks.delete(id);
    this.bubbles = this.bubbles.filter(b => { if (b.stack === id) { b.el.remove(); return false; } return true; });
  }

  // ---------------------------------------------------------------- sync (authoritative)
  sync(s: GameState) {
    const seen = new Set<number>();
    for (const st of s.stacks) {
      seen.add(st.id);
      let v = this.stacks.get(st.id);
      if (!v) v = this.createStack(st);
      const want = st.units.map(u => u.uid).join(',');
      const have = v.units.map(u => u.uid).join(',');
      if (want !== have) {
        for (const u of v.units) v.body.remove(u.mesh);
        v.units = [];
        for (const u of st.units) this.addUnit(v, u.uid, u.card, true);
        this.layout(v, false);
      }
      for (const u of v.units) u.mesh.visible = true;
      if (!v.busy) {
        tileWorld(st.x, st.y, v.group.position);
        v.group.rotation.y = DIR_ROT[st.dir];
      }
      v.dir = st.dir;
      const frozen = st.frozen > 0;
      if (frozen && !v.glue) {
        v.glue = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0xe8b860, roughness: 0.15, transmission: 0.5, transparent: true, opacity: 0.7, thickness: 0.4 }));
        v.glue.scale.set(1, 0.55, 1);
        v.group.add(v.glue);
      } else if (!frozen && v.glue) { v.group.remove(v.glue); v.glue = undefined; }
      v.shield = st.guard || 0;
      const gearId = lead(st).gear;
      if (gearId !== v.gearId) {
        if (v.gear) v.group.remove(v.gear);
        v.gear = undefined;
        if (gearId) { const { mesh } = voxelMesh(gearId); mesh.scale.setScalar(0.38); v.gear = mesh; v.group.add(mesh); }
        v.gearId = gearId;
      }
      this.updateLabel(v, st, s);
    }
    for (const id of [...this.stacks.keys()]) if (!seen.has(id)) this.removeStack(id);
    s.tiles.forEach((t, i) => {
      const cur = this.terrain.get(i);
      const key = t.terrain || '';
      if ((cur?.userData.elem || '') === key) return;
      if (cur) this.group.remove(cur);
      this.terrain.delete(i);
      if (t.terrain) { const d = terrainDecor(t.terrain); tileWorld(i % 5, Math.floor(i / 5), d.position); d.userData.elem = t.terrain; this.group.add(d); this.terrain.set(i, d); }
    });
    s.tiles.forEach((t, i) => {
      const mine = t.trap && t.trap.owner === this.me;
      const cur = this.traps.get(i);
      if (mine && !cur) {
        const m = trapToken();
        tileWorld(i % 5, Math.floor(i / 5), m.position);
        const st = s.stacks.find(q => q.x === i % 5 && q.y === Math.floor(i / 5));
        m.position.x += st ? 0.32 : 0; m.position.z += st ? 0.32 : 0;
        this.group.add(m);
        this.traps.set(i, m);
      } else if (!mine && cur) { this.group.remove(cur); this.traps.delete(i); }
    });
    // gears glow for whoever stands on them
    POINTS.forEach(([x, y], i) => {
      const st = s.stacks.find(q => q.x === x && q.y === y);
      this.gears[i].userData.owner = st ? st.owner : -1;
    });
  }

  private updateLabel(v: StackView, st: Stack, s: GameState) {
    const m = mods(s, st);
    const lc = card(lead(st).card);
    const rows = st.units.slice().reverse().map((u, i) => {
      const pct = Math.max(0, u.hp / maxHp(u)) * 100;
      return i === 0
        ? `<div class="sl-lead"><span class="sl-pow">${ICON.sword}${m.power}</span><span class="sl-hp">${ICON.heart}${u.hp}</span>${m.armor ? `<span class="sl-arm">${ICON.shield}${m.armor}</span>` : ''}</div><div class="sl-bar"><i style="width:${pct}%"></i></div>`
        : `<div class="sl-bar sub" title="${card(u.card).name}"><i style="width:${pct}%"></i></div>`;
    }).join('');
    const ap = st.owner === s.active && st.owner === this.me ? `<div class="sl-ap">${Array.from({ length: Math.max(0, st.ap) }, () => '<b></b>').join('')}${lc.skill && !st.skilled ? '<em title="Skill ready"></em>' : ''}</div>` : '';
    const frozen = st.frozen > 0 ? `<div class="sl-tag">${ICON.glue}</div>` : '';
    v.label.innerHTML = `<div class="sl-name" style="--e:#${ELEM_COLOR[lc.elem!].toString(16).padStart(6, '0')}">${lc.name}</div>${rows}${ap}${frozen}`;
    v.label.dataset.id = String(st.id);
  }

  // ---------------------------------------------------------------- bubbles
  bubble(stackId: number, kind: BubbleKind, ms = 1600) {
    const v = this.stacks.get(stackId);
    if (!v) return;
    this.bubbles = this.bubbles.filter(b => { if (b.stack === stackId) { b.el.remove(); return false; } return true; });
    const el = document.createElement('div');
    el.className = 'emote';
    el.innerHTML = `<svg viewBox="0 0 24 24">${BUBBLE_SVG[kind]}</svg>`;
    this.labels.appendChild(el);
    this.bubbles.push({ el, stack: stackId, until: performance.now() + ms / animCfg.speed });
  }
  private teamBubble(owner: PlayerId, kind: BubbleKind, chance = 0.7) {
    for (const v of this.stacks.values()) if (v.owner === owner && Math.random() < chance) { this.bubble(v.id, kind); v.hop = 1; this.wake(v); }
  }

  // ---------------------------------------------------------------- per-frame
  private frame(dt: number, t: number) {
    for (const h of [...this.hlPool, ...this.warnPool]) if (h.visible) (h.material as THREE.ShaderMaterial).uniforms.time.value = t;
    for (const g of this.gears) {
      const owner = g.userData.owner as number;
      g.userData.spin = Math.max(0, (g.userData.spin || 0) - dt * 4);
      g.rotation.y += dt * ((owner >= 0 ? 1.4 : 0.15) + g.userData.spin) * (owner === 1 ? -1 : 1);
    }
    const lookW = this.look ? tileWorld(this.look.x, this.look.y) : null;
    for (const v of this.stacks.values()) {
      // idles
      if (!v.busy && t > v.nextIdle) {
        v.nextIdle = t + 3 + Math.random() * 5;
        const L = this.leadOf(v);
        const r = Math.random();
        if (t - v.lastActive > 28) { if (!v.sleeping) { v.sleeping = true; } this.bubble(v.id, 'zzz', 2600); }
        else if (L && r < 0.5) L.yawT = (Math.random() - 0.5) * 1.6;
        else if (r < 0.75) v.hop = 0.6;
        else if (L) L.yawT = 0;
      }
      if (v.hop > 0) v.hop = Math.max(0, v.hop - dt * 2.4);
      const hopY = Math.sin((1 - v.hop) * Math.PI) * 0.12 * (v.hop > 0 ? 1 : 0);
      v.body.position.y = v.busy ? v.body.position.y : hopY;
      v.units.forEach((u, i) => {
        const isLead = i === v.units.length - 1;
        const rate = v.sleeping ? 1.1 : 2.6;
        const amp = v.sleeping ? 0.045 : 0.028;
        const breathe = isLead ? 1 + Math.sin(t * rate + v.phase) * amp : 1;
        u.mesh.scale.set(u.scale / Math.sqrt(breathe), u.scale * breathe, u.scale / Math.sqrt(breathe));
        if (isLead && lookW && v.owner === this.me && !v.sleeping) {
          // turn the head toward the hovered tile, in body space
          const dx = lookW.x - v.group.position.x, dz = lookW.z - v.group.position.z;
          if (Math.hypot(dx, dz) > 0.3) { const a = Math.atan2(dx, dz) - v.group.rotation.y; u.yawT = Math.max(-1.1, Math.min(1.1, angleLerp(0, a, 1))); }
        }
        if (v.sleeping && isLead) u.yawT = 0;
        u.yaw = lerp(u.yaw, u.yawT, 1 - Math.exp(-dt * 6));
        u.walk = lerp(u.walk, 0, 1 - Math.exp(-dt * 4));
        u.lean = lerp(u.lean, v.sleeping && isLead ? 0.12 : 0, 1 - Math.exp(-dt * 5));
        if (u.U) {
          u.U.uTime.value = t; u.U.uYaw.value = isLead ? u.yaw : 0; u.U.uWalk.value = u.walk; u.U.uLean.value = u.lean;
        }
        if (u.flash > 0) {
          u.flash = Math.max(0, u.flash - dt * 4);
          for (const m of u.mesh.material as THREE.Material[]) if ((m as THREE.MeshStandardMaterial).emissive) (m as THREE.MeshStandardMaterial).emissive.setScalar(u.flash * 0.9);
        }
      });
      if (v.gear) {
        const top = this.topY(v);
        v.gear.position.set(Math.cos(t * 1.4 + v.phase) * 0.46, top * 0.6 + Math.sin(t * 2) * 0.05, Math.sin(t * 1.4 + v.phase) * 0.46);
        v.gear.rotation.y = t * 1.6;
      }
      // guard shield shimmer
      if (v.shield > 0 && !v.shieldMesh) {
        v.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 16), new THREE.MeshBasicMaterial({ color: 0x9ad8ff, transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false }));
        v.group.add(v.shieldMesh);
      } else if (v.shield <= 0 && v.shieldMesh) { v.group.remove(v.shieldMesh); v.shieldMesh = undefined; }
      if (v.shieldMesh) {
        const top = this.topY(v);
        v.shieldMesh.position.y = top / 2;
        v.shieldMesh.scale.set(1, Math.max(1, top / 1.1), 1);
        (v.shieldMesh.material as THREE.MeshBasicMaterial).opacity = 0.12 + Math.sin(t * 3) * 0.05;
      }
      const p = v.group.position.clone();
      p.y += this.topY(v) + 0.18;
      const sp = this.stage.toScreen(p);
      v.label.style.transform = `translate(${sp.x.toFixed(1)}px, ${sp.y.toFixed(1)}px) translate(-50%, -100%)`;
      v.label.classList.toggle('sel', this.selected === v.id);
      v.label.classList.toggle('hov', !!this.look && this.stacks.get(v.id) === v && Math.abs(v.group.position.x - (this.look.x - 2)) < 0.1 && Math.abs(v.group.position.z - (2 - this.look.y)) < 0.1);
    }
    const now = performance.now();
    this.bubbles = this.bubbles.filter(b => {
      const v = this.stacks.get(b.stack);
      if (!v || now > b.until) { b.el.remove(); return false; }
      const lbl = v.label.getBoundingClientRect();
      b.el.style.transform = `translate(${(lbl.right - 6).toFixed(0)}px, ${(lbl.top - 30).toFixed(0)}px)`;
      return true;
    });
  }

  // ---------------------------------------------------------------- highlights + warnings
  highlight(tiles: { x: number; y: number; kind: HlKind }[]) {
    this.clearHighlights();
    tiles.forEach((t, i) => {
      let m = this.hlPool[i];
      if (!m) {
        m = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.98), hlMat(0xffffff));
        m.rotation.x = -Math.PI / 2;
        m.renderOrder = 5;
        this.hlPool.push(m);
        this.hl.add(m);
      }
      const mat = m.material as THREE.ShaderMaterial;
      mat.uniforms.col.value.setHex(HL_COL[t.kind]);
      mat.uniforms.fill.value = t.kind === 'area' ? 0.35 : t.kind === 'hover' ? 0.08 : t.kind === 'select' ? 0.1 : 0.2;
      tileWorld(t.x, t.y, m.position);
      m.position.y = TILE_TOP + 0.008 + (t.kind === 'hover' ? 0.002 : 0);
      m.visible = true;
    });
  }
  clearHighlights() { for (const m of this.hlPool) m.visible = false; }

  setWarnings(tiles: { x: number; y: number }[]) {
    tiles.forEach((t, i) => {
      let m = this.warnPool[i];
      if (!m) {
        m = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.98), hlMat(HL_COL.danger));
        m.rotation.x = -Math.PI / 2;
        m.renderOrder = 4;
        (m.material as THREE.ShaderMaterial).uniforms.hatch.value = 1;
        (m.material as THREE.ShaderMaterial).uniforms.fill.value = 0.08;
        this.warnPool.push(m);
        this.hl.add(m);
      }
      tileWorld(t.x, t.y, m.position);
      m.position.y = TILE_TOP + 0.006;
      m.visible = true;
    });
    for (let i = tiles.length; i < this.warnPool.length; i++) this.warnPool[i].visible = false;
  }

  lookAt(t: { x: number; y: number } | null) { this.look = t; if (!t) for (const v of this.stacks.values()) { const L = this.leadOf(v); if (L) L.yawT = 0; } }
  poke(id: number) { const v = this.stacks.get(id); if (!v) return; this.wake(v); v.hop = 1; this.bubble(id, v.owner === this.me ? 'alert' : 'what', 900); sfx.hop(); }

  slamImpact(x: number, y: number) {
    const p = tileWorld(x, y);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      this.debris.spawn(p.clone().setY(TILE_TOP + 0.05), new THREE.Vector3(Math.cos(a) * 1.8, 0.8 + Math.random() * 0.8, Math.sin(a) * 1.8), new THREE.Color(0xd8c09a), 0.035, 0.6);
    }
    ring(this.group, p, new THREE.Color(0xfff0d0), 1.1, 380);
    this.stage.shake(0.07);
    sfx.land();
  }

  celebrate(winner: PlayerId) {
    for (const v of this.stacks.values()) {
      if (v.owner === winner) { v.hop = 1; this.bubble(v.id, Math.random() < 0.5 ? 'note' : 'star', 3000); }
      else { this.bubble(v.id, 'sweat', 3000); const L = this.leadOf(v); if (L) L.lean = 0.25; }
    }
  }

  // ---------------------------------------------------------------- cinematics
  private letterbox(on: boolean) {
    let lb = document.querySelector('.letterbox') as HTMLElement | null;
    if (on && !lb) { lb = document.createElement('div'); lb.className = 'letterbox'; lb.innerHTML = '<i></i><i></i>'; document.body.appendChild(lb); requestAnimationFrame(() => lb!.classList.add('on')); }
    if (!on && lb) { lb.classList.remove('on'); const el = lb; setTimeout(() => el.remove(), 400); }
  }
  private titleCard(title: string, sub: string, art?: string, ms = 1400) {
    const el = document.createElement('div');
    el.className = 'titlecard';
    el.innerHTML = `${art ? `<img class="px" src="${cardArt(art)}">` : ''}<div><small>${sub}</small><b>${title}</b></div>`;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('out'), ms / animCfg.speed);
    setTimeout(() => el.remove(), ms / animCfg.speed + 500);
  }
  async intro(arenaName: string) {
    if (animCfg.reduceMotion) return;
    this.letterbox(true);
    this.titleCard(arenaName, 'Duel at', undefined, 1300);
    await this.stage.cinematicTo(new THREE.Vector3(0, 0, 0), { dist: this.stage.boardDist * 1.6, el: 1.25, hold: 500, dur: 10 });
    this.letterbox(false);
  }

  // ---------------------------------------------------------------- event playback
  private pos(x: number, y: number) { return tileWorld(x, y); }
  private elemOf(v: StackView) { return card(this.leadOf(v).card).elem as Elem; }
  private col(e: Elem) { return new THREE.Color(ELEM_COLOR[e]); }
  private leadTop(v: StackView) { const p = v.group.position.clone(); p.y += this.topY(v) * 0.7; return p; }

  popup(world: THREE.Vector3, text: string, cls: string) {
    const sp = this.stage.toScreen(world);
    const d = document.createElement('div');
    d.className = 'pop ' + cls;
    d.innerHTML = text;
    d.style.left = sp.x + 'px';
    d.style.top = sp.y + 'px';
    this.labels.appendChild(d);
    setTimeout(() => d.remove(), 1500 / animCfg.speed);
  }

  async play(ev: Ev, after: GameState): Promise<void> {
    const S = this.stage;
    switch (ev.e) {
      case 'summon': {
        const st = after.stacks.find(s => s.id === ev.stack) || { id: ev.stack, owner: ev.p, x: ev.x, y: ev.y, dir: ev.dir, units: [], ap: 0, moved: false, frozen: 0, attacked: false, guard: 0, skilled: false, bonusAp: 0 } as Stack;
        if (this.stacks.has(ev.stack)) this.removeStack(ev.stack);
        const v = this.createStack({ ...st, units: [{ uid: ev.uid, card: ev.card, hp: 1, gear: null }] }, false);
        v.busy = true;
        tileWorld(ev.x, ev.y, v.group.position);
        v.group.rotation.y = DIR_ROT[ev.dir];
        v.token.scale.setScalar(0.01);
        tween(300, k => v.token.scale.setScalar(Math.max(0.01, k)), ease.outBack);
        sfx.summon();
        await this.materialize(v, v.units[0]);
        v.busy = false;
        v.hop = 1;
        this.bubble(v.id, ev.p === this.me ? 'note' : 'anger', 1200);
        ring(this.group, v.group.position, this.col(card(ev.card).elem!), 0.8);
        break;
      }
      case 'stackOn': {
        const v = this.stacks.get(ev.stack);
        if (!v) break;
        const u = this.addUnit(v, ev.uid, ev.card, false);
        this.layout(v, true);
        sfx.summon();
        await wait(120);
        await this.materialize(v, u);
        this.wake(v);
        break;
      }
      case 'fuse': {
        const v = this.stacks.get(ev.stack);
        if (!v) break;
        v.busy = true;
        const final = card(ev.card).stage === 3;
        const center = v.group.position.clone();
        center.y += 0.7;
        this.letterbox(true);
        const cin = S.cinematicTo(center, { dist: final ? 3.4 : 4.2, el: 0.38, hold: final ? 1900 : 1300, dur: 500, orbit: final ? 1.2 : 0.5 });
        sfx.fuse();
        const gone = v.units.filter(u => ev.from.includes(u.uid));
        const col = new THREE.Color(ELEM_COLOR[card(ev.card).elem!]);
        for (const u of gone) tween(500, k => { u.mesh.scale.setScalar(u.scale * (1 - k)); u.mesh.rotation.y = k * 8; }, ease.inCubic);
        await wait(380);
        for (let i = 0; i < (final ? 140 : 70); i++) this.debris.spawn(center, new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3), col, 0.05, 0.9);
        S.flash(1, 0.95, 0.8, final ? 0.6 : 0.45, 450);
        for (const u of gone) v.body.remove(u.mesh);
        v.units = v.units.filter(u => !ev.from.includes(u.uid));
        const nu = this.addUnit(v, ev.uid, ev.card, false);
        this.layout(v, true);
        this.titleCard(card(ev.card).name, final ? 'Final form' : 'Fusion', ev.card, final ? 1800 : 1300);
        await this.materialize(v, nu, final ? 1200 : 900, true);
        ring(this.group, v.group.position, col, final ? 2.6 : 1.6, 700);
        if (final) { S.shake(0.25); hitStop(120); }
        v.hop = 1;
        this.bubble(v.id, 'star', 2000);
        await cin;
        this.letterbox(false);
        v.busy = false;
        break;
      }
      case 'move': case 'push': {
        const v = this.stacks.get(ev.stack);
        if (!v) break;
        v.busy = true;
        this.wake(v);
        const from = this.pos(ev.fx, ev.fy), to = this.pos(ev.x, ev.y);
        if (ev.e === 'push' && ev.blocked) {
          sfx.bump();
          this.bubble(v.id, 'anger', 900);
          const o = v.group.position.clone();
          await tween(260, k => { v.group.position.x = o.x + Math.sin(k * Math.PI * 6) * 0.06 * (1 - k); }, ease.linear);
          v.group.position.copy(o);
        } else if (ev.e === 'push') {
          sfx.slide();
          this.bubble(v.id, 'what', 900);
          await tween(320, k => { v.group.position.lerpVectors(from, to, k); }, ease.outCubic);
          for (let i = 0; i < 10; i++) this.debris.spawn(v.group.position, new THREE.Vector3((Math.random() - 0.5), 0.6, (Math.random() - 0.5)), new THREE.Color(0xc8a070), 0.03, 0.5);
        } else {
          sfx.hop();
          const L = this.leadOf(v);
          await tween(380, k => {
            v.group.position.lerpVectors(from, to, k);
            v.group.position.y = TILE_TOP + Math.sin(k * Math.PI) * 0.3;
            const sq = 1 + Math.sin(k * Math.PI) * 0.08;
            v.body.scale.set(1 / sq, sq, 1 / sq);
            for (const u of v.units) u.walk = 1;
            if (L?.U) L.U.uFlap.value = Math.max(L.U.uFlap.value, L.U.uWingX.value < 1 ? 1 : 0);
          }, ease.inOutCubic);
          sfx.land();
          await tween(160, k => { const sq = 1 - Math.sin(k * Math.PI) * 0.1; v.body.scale.set(1 / sq, sq, 1 / sq); }, ease.linear);
          v.body.scale.set(1, 1, 1);
          if (L?.U && L.U.uWingX.value < 1) L.U.uFlap.value = 0.6;
        }
        v.group.position.copy(to);
        v.busy = false;
        break;
      }
      case 'turnTo': {
        const v = this.stacks.get(ev.stack);
        if (!v) break;
        v.busy = true;
        this.wake(v);
        sfx.turn();
        const a0 = v.group.rotation.y, a1 = DIR_ROT[ev.dir];
        await tween(260, k => { v.group.rotation.y = angleLerp(a0, a1, k); }, ease.outBack);
        v.group.rotation.y = a1;
        v.busy = false;
        break;
      }
      case 'skill': {
        const v = this.stacks.get(ev.stack);
        if (!v) break;
        this.wake(v);
        const sk = SKILLS[ev.skill];
        this.popup(this.leadTop(v).add(new THREE.Vector3(0, 0.5, 0)), `<b class="sk">${sk.name}!</b>`, 'skillpop');
        sfx.spell();
        const col = this.col(this.elemOf(v));
        if (ev.skill === 'zap' && ev.x !== undefined) {
          const t = this.pos(ev.x, ev.y!); t.y = 0.5;
          await projectile(this.group, this.debris, this.leadTop(v), t, new THREE.Color(0xffe060), 0.4, 300);
          ring(this.group, t, new THREE.Color(0xffe060), 0.9, 300);
        } else if (ev.skill === 'whirl') {
          await tween(320, k => { v.body.rotation.y = k * Math.PI * 2; }, ease.inOutCubic);
          v.body.rotation.y = 0;
        } else if (ev.skill === 'taunt') {
          ring(this.group, v.group.position, new THREE.Color(0xff5a3a), 2.2, 500);
          for (const o of this.stacks.values()) if (o.owner !== v.owner && Math.abs(o.group.position.x - v.group.position.x) + Math.abs(o.group.position.z - v.group.position.z) < 1.1) this.bubble(o.id, 'anger', 1200);
          await wait(200);
        } else if (ev.skill === 'rally') {
          ring(this.group, v.group.position, col, 2.2, 500);
          this.teamBubble(v.owner, 'note', 0.6);
          await wait(200);
        } else if (ev.skill === 'bump') {
          await tween(140, k => { v.body.position.z = 0.4 * Math.sin(k * Math.PI); }, ease.outQuad);
        } else if (ev.skill === 'dash') {
          for (let i = 0; i < 14; i++) this.debris.spawn(v.group.position, new THREE.Vector3((Math.random() - 0.5) * 2, 0.6, (Math.random() - 0.5) * 2), new THREE.Color(0xd8c09a), 0.035, 0.5);
        }
        break;
      }
      case 'guard': {
        const v = this.stacks.get(ev.stack);
        if (!v) break;
        v.shield = Math.max(v.shield, 1);
        sfx.gear();
        this.popup(this.leadTop(v), `<b>+${ev.n}</b><small>ARMOR</small>`, 'heal');
        sparkle(this.debris, this.leadTop(v), new THREE.Color(0x9ad8ff), 14);
        await wait(140);
        break;
      }
      case 'point': {
        const i = POINTS.findIndex(([x, y]) => after.stacks.some(s => s.owner === ev.p && s.x === x && s.y === y));
        const g = this.gears[Math.max(0, i)];
        if (g) {
          sfx.coin();
          sparkle(this.debris, g.position.clone().setY(0.3), new THREE.Color(0xffd060), 16);
          g.userData.spin = 6;
          this.popup(g.position.clone().setY(0.6), `<b>+${ev.n}</b><small>ENERGY</small>`, 'gearpop');
        }
        await wait(220);
        break;
      }
      case 'boardEvent': await this.boardEvent(ev.ev, after); break;
      case 'attack': {
        const v = this.stacks.get(ev.stack);
        if (!v) break;
        v.busy = true;
        this.wake(v);
        const e = this.elemOf(v);
        const col = this.col(e);
        const origin = this.leadTop(v);
        const L = this.leadOf(v);
        await tween(150, k => { v.body.position.set(0, 0, -0.14 * k); if (L) L.lean = -0.25 * k; }, ease.outQuad);
        if (ev.player !== undefined) {
          sfx.attack('line');
          const target = origin.clone();
          target.z += ev.player === 0 ? 3.4 : -3.4;
          target.y = 0.6;
          v.body.position.set(0, 0, 0);
          if (L) L.lean = 0.2;
          await projectile(this.group, this.debris, origin, target, col, 1.2, 420);
          this.debris.burst(target, col, 50, 3.2);
          S.shake(0.26);
          hitStop(90);
          if (ev.player === this.me) S.flash(0.85, 0.1, 0.05, 0.35);
        } else if (ev.shape === 'jab' || ev.shape === 'cone' || ev.shape === 'sweep') {
          sfx.attack(ev.shape);
          if (ev.shape === 'sweep') tween(320, k => { v.body.rotation.y = k * Math.PI * 2; }, ease.inOutCubic).then(() => (v.body.rotation.y = 0));
          await tween(140, k => { v.body.position.set(0, 0.05 * Math.sin(k * Math.PI), -0.14 + 0.56 * k); if (L) L.lean = 0.3 * k; }, ease.inQuad);
          for (const [tx, ty] of ev.tiles) ring(this.group, this.pos(tx, ty), col, 0.9, 340);
          tween(240, k => { v.body.position.set(0, 0, 0.42 * (1 - k)); }, ease.outCubic);
        } else {
          sfx.attack(ev.shape);
          v.body.position.set(0, 0, 0);
          const [tx, ty] = ev.shape === 'line' ? ev.tiles[ev.tiles.length - 1] : ev.tiles[0];
          const hitStack = after.stacks.find(s => s.x === tx && s.y === ty);
          const target = this.pos(tx, ty);
          const tv = hitStack && this.stacks.get(hitStack.id);
          target.y = tv ? this.topY(tv) * 0.6 : 0.3;
          const arc = ev.shape === 'line' ? 0.05 : 1.6;
          await projectile(this.group, this.debris, origin, target, col, arc, ev.shape === 'line' ? 260 : 520);
          if (ev.shape === 'splash') { ring(this.group, target, col, 2.6, 520); S.shake(0.1); }
        }
        v.body.position.set(0, 0, 0);
        v.busy = false;
        break;
      }
      case 'hit': {
        const v = this.stacks.get(ev.stack);
        if (!v) break;
        this.wake(v);
        const u = v.units.find(q => q.uid === ev.uid) || this.leadOf(v);
        if (!u) break;
        u.flash = 1;
        const p = v.group.position.clone();
        p.y += u.mesh.position.y + u.h * u.scale * 0.6;
        const big = ev.facing === 'back' || ev.adv || ev.n >= 5;
        if (ev.n > 0) {
          (big ? sfx.crit : sfx.hit)();
          this.debris.burst(p, this.col(card(u.card).elem!), Math.min(60, 10 + ev.n * 5), 2.2 + ev.n * 0.2);
          hitStop(big ? 110 : 55);
          S.punch(p, big ? 0.9 : 0.4);
          S.shake(Math.min(0.3, 0.04 + ev.n * 0.025));
          if (big) ring(this.group, p.clone().setY(TILE_TOP), new THREE.Color(0xfff2c0), 1.4, 380);
          const tag = ev.spill ? 'SPILL' : ev.facing === 'back' ? 'BACK ×2' : ev.facing === 'side' ? 'SIDE ×1.5' : '';
          const adv = ev.adv ? '<em>TYPE ×1.5</em>' : '';
          this.popup(p, `<b>-${ev.n}</b>${tag ? `<small>${tag}</small>` : ''}${adv}`, big ? 'dmg big' : 'dmg');
          if (ev.facing === 'back') { this.popup(p.clone().add(new THREE.Vector3(0, 0.55, 0)), '<b class="stampx">BACK ATTACK!</b>', 'flourish'); this.bubble(v.id, 'anger', 1400); }
          else this.bubble(v.id, u.uid === this.leadOf(v).uid ? 'alert' : 'sweat', 900);
          const L = this.leadOf(v);
          if (L) L.lean = -0.35;
        } else {
          sfx.block();
          this.popup(p, '<b>0</b><small>BLOCKED</small>', 'dmg block');
        }
        const o = v.body.position.clone();
        await tween(240, k => { v.body.position.x = o.x + Math.sin(k * Math.PI * 5) * 0.06 * (1 - k); }, ease.linear);
        v.body.position.copy(o);
        break;
      }
      case 'ko': {
        const v = this.stacks.get(ev.stack);
        if (!v) break;
        const u = v.units.find(q => q.uid === ev.uid);
        if (!u) break;
        sfx.ko();
        const pts = voxelPoints(u.card, 600);
        const wp = new THREE.Vector3();
        u.mesh.getWorldPosition(wp);
        slowmo(0.3, 520);
        S.punch(wp, 1.1);
        const rot = v.group.rotation.y;
        const cs = Math.cos(rot), sn = Math.sin(rot);
        const c = new THREE.Color();
        for (let i = 0; i < pts.n; i++) {
          const lx = pts.p[i * 3] * u.scale, ly = pts.p[i * 3 + 1] * u.scale, lz = pts.p[i * 3 + 2] * u.scale;
          const p = new THREE.Vector3(wp.x + lx * cs + lz * sn, wp.y + ly, wp.z - lx * sn + lz * cs);
          const vel = new THREE.Vector3(lx * 7 + (Math.random() - 0.5) * 1.8, 1.2 + Math.random() * 3, lz * 7 + (Math.random() - 0.5) * 1.8);
          c.setRGB(pts.c[i * 3], pts.c[i * 3 + 1], pts.c[i * 3 + 2]);
          this.debris.spawn(p, vel, c, VOX * u.scale * 1.05, 1.8);
        }
        ring(this.group, wp.clone().setY(TILE_TOP), new THREE.Color(0xffffff), 1.8, 500);
        v.body.remove(u.mesh);
        v.units = v.units.filter(q => q !== u);
        S.shake(0.16);
        this.teamBubble(v.owner === 0 ? 1 : 0, 'note', 0.5);
        if (v.units.length) { this.layout(v, true, 320); this.bubble(v.id, 'sweat', 1400); await wait(220); }
        break;
      }
      case 'topple': {
        const v = this.stacks.get(ev.stack);
        if (!v) break;
        sfx.topple();
        await tween(260, k => v.token.scale.setScalar(Math.max(0.01, 1 - k)), ease.inCubic);
        this.removeStack(ev.stack);
        break;
      }
      case 'heal': {
        const v = this.stacks.get(ev.stack);
        if (!v) break;
        sfx.heal();
        const p = this.leadTop(v);
        sparkle(this.debris, p, new THREE.Color(0x8ae870), 16);
        this.popup(p, `<b>+${ev.n}</b>`, 'heal');
        this.bubble(v.id, 'heart', 1200);
        await wait(160);
        break;
      }
      case 'playerHit': {
        if (after.players[ev.p].life <= 0) {
          this.letterbox(true);
          slowmo(0.25, 900);
          this.titleCard('Finishing blow', ev.p === this.me ? 'Ouch' : 'Down goes the champ', undefined, 1500);
          await wait(700);
          this.letterbox(false);
        }
        if (ev.p === this.me) { S.flash(0.85, 0.12, 0.05, 0.3); S.shake(0.22); }
        break;
      }
      case 'trap': {
        if (!ev.card) break;
        const p = this.pos(ev.x, ev.y);
        sfx.trap();
        const own = this.traps.get(ev.y * 5 + ev.x);
        if (own) { this.group.remove(own); this.traps.delete(ev.y * 5 + ev.x); }
        const { mesh } = voxelMesh(ev.card);
        mesh.position.copy(p);
        mesh.scale.setScalar(0.01);
        this.group.add(mesh);
        await tween(320, k => { mesh.scale.setScalar(0.9 * k); mesh.position.y = TILE_TOP + Math.sin(k * Math.PI) * 0.6; mesh.rotation.y = k * Math.PI * 2; }, ease.outBack);
        ring(this.group, p, new THREE.Color(0xc070d0), 1, 400);
        S.shake(0.1);
        hitStop(80);
        const vic = ev.stack >= 0 ? this.stacks.get(ev.stack) : undefined;
        if (vic) this.bubble(vic.id, 'what', 1200);
        await wait(250);
        tween(300, k => mesh.scale.setScalar(0.9 * (1 - k)), ease.inCubic).then(() => { this.group.remove(mesh); disposeMats(mesh); });
        break;
      }
      case 'trapSet': { if (ev.p === this.me) sfx.card(); break; }
      case 'terrain': {
        sfx.terrain();
        const p = this.pos(ev.x, ev.y);
        ring(this.group, p, this.col(ev.elem), 0.9, 500);
        sparkle(this.debris, p, this.col(ev.elem), 14);
        const old = this.terrain.get(ev.y * 5 + ev.x);
        if (old) { this.group.remove(old); this.terrain.delete(ev.y * 5 + ev.x); }
        const d = terrainDecor(ev.elem);
        d.position.copy(p);
        d.userData.elem = ev.elem;
        d.scale.setScalar(0.01);
        this.group.add(d);
        this.terrain.set(ev.y * 5 + ev.x, d);
        await tween(380, k => d.scale.setScalar(Math.max(0.01, k)), ease.outBack);
        break;
      }
      case 'gear': {
        const v = this.stacks.get(ev.stack);
        if (v) { sfx.gear(); sparkle(this.debris, this.leadTop(v), new THREE.Color(0xd8c8a0), 14); this.bubble(v.id, 'star', 1200); }
        await wait(200);
        break;
      }
      case 'freeze': {
        const v = this.stacks.get(ev.stack);
        if (v) { sfx.freeze(); sparkle(this.debris, this.leadTop(v), new THREE.Color(0xe8b860), 14); this.bubble(v.id, 'what', 1400); }
        await wait(200);
        break;
      }
      case 'refresh': {
        const v = this.stacks.get(ev.stack);
        if (!v) break;
        sfx.windup();
        const { mesh } = voxelMesh('windupkey');
        mesh.scale.setScalar(0.4);
        const p = this.leadTop(v);
        mesh.position.copy(p).setY(p.y + 0.4);
        this.group.add(mesh);
        v.hop = 0.8;
        await tween(500, k => { mesh.rotation.z = k * Math.PI * 4; mesh.position.y = p.y + 0.4 + k * 0.3; mesh.scale.setScalar(0.4 * (1 - k * k)); }, ease.linear);
        this.group.remove(mesh);
        disposeMats(mesh);
        break;
      }
      case 'spell': {
        if (ev.x !== undefined && ev.y !== undefined) {
          const p = this.pos(ev.x, ev.y);
          ring(this.group, p, new THREE.Color(0x60d8c0), 1.1, 420);
          sparkle(this.debris, p.clone().setY(0.5), new THREE.Color(0x9af0e0), 12);
        }
        sfx.spell();
        await wait(220);
        break;
      }
    }
  }

  /** Big set-piece for a board event. Follow-up push/hit/terrain events animate the effects. */
  private async boardEvent(e: NonNullable<GameState['event']>, _after: GameState) {
    const S = this.stage;
    const arena = S.arenaId;
    this.letterbox(true);
    if (e.kind === 'paw') {
      const row = e.row ?? 2;
      const a = this.pos(-1.8, row), b = this.pos(5.8, row);
      if (arena === 'windowsill' || arena === 'lampcorner') {
        S.flash(1, 1, 1, 0.8, 500);
        sfx.crit();
        for (let x = 0; x < 5; x++) { const p = this.pos(x, row); ring(this.group, p, new THREE.Color(0xc8e8ff), 1.2, 500); sparkle(this.debris, p.setY(0.4), new THREE.Color(0xe8f6ff), 20); }
        S.shake(0.35);
        hitStop(150);
        await wait(400);
      } else if (arena === 'trainset') {
        const { mesh } = voxelMesh('prop_train');
        mesh.scale.setScalar(1.6);
        this.group.add(mesh);
        sfx.slide();
        await tween(900, k => { mesh.position.lerpVectors(a, b, k); mesh.position.y = TILE_TOP; mesh.rotation.y = Math.PI / 2; S.shake(0.05); }, ease.linear);
        this.group.remove(mesh);
        disposeMats(mesh);
      } else {
        const { mesh } = voxelMesh('prop_paw');
        mesh.scale.setScalar(2.6);
        this.group.add(mesh);
        const mid = this.pos(2, row);
        await tween(500, k => { mesh.position.set(mid.x, 5 - k * 4.6, mid.z); mesh.rotation.set(0, Math.PI, 0); }, ease.inCubic);
        sfx.crit();
        S.shake(0.4);
        hitStop(140);
        for (let x = 0; x < 5; x++) ring(this.group, this.pos(x, row), new THREE.Color(0xfff0d0), 1, 400);
        await tween(500, k => { mesh.position.y = 0.4 + k * 5; }, ease.inCubic);
        this.group.remove(mesh);
        disposeMats(mesh);
      }
    } else if (e.kind === 'draft') {
      const [dx, dy] = DIRV[e.dir ?? 0];
      sfx.slide();
      for (let i = 0; i < 120; i++) {
        const p = new THREE.Vector3((Math.random() - 0.5) * 6, 0.2 + Math.random() * 1.2, (Math.random() - 0.5) * 6);
        this.debris.spawn(p, new THREE.Vector3(dx * 6, 2.5, -dy * 6), new THREE.Color(0xf0e8d8), 0.025, 0.6);
      }
      await wait(350);
    } else if (e.kind === 'glitter') {
      for (let i = 0; i < 160; i++) {
        const p = new THREE.Vector3((Math.random() - 0.5) * 5, 3 + Math.random() * 2, (Math.random() - 0.5) * 5);
        this.debris.spawn(p, new THREE.Vector3(0, -1, 0), new THREE.Color().setHSL(Math.random(), 0.8, 0.75), 0.04, 1.6);
      }
      sfx.rare();
      await wait(500);
    } else if (e.kind === 'windup') {
      sfx.windup();
      for (const v of this.stacks.values()) { v.hop = 1; this.bubble(v.id, 'note', 1300); }
      await wait(300);
    } else if (e.kind === 'cleanup') {
      for (let i = 0; i < 140; i++) {
        const p = new THREE.Vector3(-3, 0.15, (Math.random() - 0.5) * 5);
        this.debris.spawn(p, new THREE.Vector3(7 + Math.random() * 3, 0.8, 0), new THREE.Color(0xc8b08a), 0.04, 0.9);
      }
      sfx.slide();
      await wait(450);
    }
    this.letterbox(false);
  }

  /** Pixels rise off the card and snap into the voxel model. */
  private async materialize(v: StackView, u: UnitView, ms = 650, swirl = false) {
    const pts = voxelPoints(u.card, 700);
    const to = new Float32Array(pts.n * 3);
    for (let i = 0; i < pts.n; i++) {
      to[i * 3] = pts.p[i * 3] * u.scale;
      to[i * 3 + 1] = pts.p[i * 3 + 1] * u.scale + u.mesh.position.y;
      to[i * 3 + 2] = pts.p[i * 3 + 2] * u.scale;
    }
    const y0 = u.mesh.position.y;
    await assemble(v.body, to, pts.c, pts.n, (i, out) => {
      if (swirl) {
        const a = (i / pts.n) * Math.PI * 12;
        out.set(Math.cos(a) * 0.9, y0 + 0.4 + (i / pts.n) * 0.6, Math.sin(a) * 0.9);
      } else {
        const gx = (i % 24) / 24 - 0.5, gy = Math.floor(i / 24) / Math.ceil(pts.n / 24) - 0.5;
        out.set(gx * 0.7, y0 + 1.2 + gy * 0.9, 0.05);
      }
    }, VOX * u.scale, ms);
    u.mesh.visible = true;
    u.flash = 0.8;
  }
}

const disposeMats = (m: THREE.Mesh) => { for (const x of ([] as THREE.Material[]).concat(m.material)) x.dispose(); };

// ---------------------------------------------------------------- tile decorations
function terrainDecor(e: Elem): THREE.Object3D {
  const g = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const glow = e === 'ember' || e === 'volt' || e === 'gleam';
  const base: Record<Elem, string> = { ember: '#3a1a12', tide: '#2a6a9a', moss: '#4a7a32', volt: '#4a3a24', stone: '#7a746c', gleam: '#5a3a7a' };
  x.fillStyle = base[e];
  x.beginPath(); x.roundRect(6, 6, 116, 116, 18); x.fill();
  const r = (n: number) => Math.random() * n;
  if (e === 'ember') { x.strokeStyle = '#ff7a2a'; x.lineWidth = 3; for (let i = 0; i < 9; i++) { x.beginPath(); let px = 20 + r(88), py = 20 + r(88); x.moveTo(px, py); for (let k = 0; k < 4; k++) { px += r(30) - 15; py += r(30) - 15; x.lineTo(px, py); } x.stroke(); } }
  if (e === 'tide') { x.strokeStyle = 'rgba(220,245,255,0.6)'; x.lineWidth = 3; for (let i = 0; i < 6; i++) { x.beginPath(); x.ellipse(64, 64, 10 + i * 9, 6 + i * 7, 0, 0, 6.3); x.stroke(); } }
  if (e === 'moss') { for (let i = 0; i < 60; i++) { x.fillStyle = Math.random() < 0.5 ? '#6aa84a' : '#3a6a2a'; x.fillRect(10 + r(108), 10 + r(108), 6, 6); } }
  if (e === 'volt') { x.strokeStyle = '#c88a3a'; x.lineWidth = 5; for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(10, 20 + i * 28); x.bezierCurveTo(50, r(128), 80, r(128), 118, 20 + i * 26); x.stroke(); } x.strokeStyle = '#8af0ff'; x.lineWidth = 2; x.beginPath(); x.moveTo(30, 30); x.lineTo(54, 60); x.lineTo(44, 66); x.lineTo(80, 100); x.stroke(); }
  if (e === 'stone') { for (let i = 0; i < 40; i++) { x.fillStyle = ['#9a948a', '#5a544c', '#b8b0a4'][i % 3]; x.beginPath(); x.ellipse(10 + r(108), 10 + r(108), 4 + r(5), 3 + r(4), r(3), 0, 6.3); x.fill(); } }
  if (e === 'gleam') { for (let i = 0; i < 70; i++) { x.fillStyle = ['#fff0ff', '#e0b0ff', '#c0e8ff'][i % 3]; x.fillRect(8 + r(112), 8 + r(112), 3, 3); } }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: e === 'tide' ? 0.08 : 0.8, metalness: e === 'tide' ? 0.2 : 0, emissive: glow ? 0xffffff : 0x000000, emissiveMap: glow ? tex : null, emissiveIntensity: glow ? 0.55 : 0 });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), mat);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = TILE_TOP + 0.004;
  plane.receiveShadow = true;
  g.add(plane);
  const bit = (w: number, h: number, col: number, emissive = false) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, w, 1, w * 0.2), new THREE.MeshStandardMaterial({ color: col, roughness: 0.7, emissive: emissive ? col : 0, emissiveIntensity: emissive ? 1.6 : 0 }));
    m.position.set((Math.random() - 0.5) * 0.7, TILE_TOP + h / 2, (Math.random() - 0.5) * 0.7);
    m.castShadow = true;
    g.add(m);
  };
  if (e === 'moss') for (let i = 0; i < 5; i++) bit(0.08, 0.06 + Math.random() * 0.08, 0x5a9a3a);
  if (e === 'stone') for (let i = 0; i < 5; i++) bit(0.09, 0.06, 0x8a847a);
  if (e === 'ember') for (let i = 0; i < 4; i++) bit(0.05, 0.05, 0xff7a2a, true);
  if (e === 'gleam') for (let i = 0; i < 4; i++) bit(0.04, 0.04, 0xf0c8ff, true);
  return g;
}

function trapToken(): THREE.Object3D {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 88;
  const x = c.getContext('2d')!;
  x.fillStyle = '#5a2a4a'; x.fillRect(0, 0, 64, 88);
  x.strokeStyle = '#e0b860'; x.lineWidth = 3; x.strokeRect(5, 5, 54, 78);
  x.fillStyle = '#e0b860'; x.font = 'bold 34px Georgia'; x.textAlign = 'center'; x.fillText('?', 32, 56);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.42), [0, 0, 1, 0, 0, 0].map(i => new THREE.MeshStandardMaterial(i ? { map: t, roughness: 0.6 } : { color: 0x3a1a30 })));
  m.position.y = TILE_TOP + 0.012;
  m.rotation.y = 0.2;
  const g = new THREE.Group();
  g.add(m);
  return g;
}
