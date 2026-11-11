// Turns engine state + events into the 3D board: stack towers, facing tokens, labels, highlights,
// terrain, traps and all the event animations.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { card } from '../engine/cards';
import { lead, maxHp, mods } from '../engine/rules';
import type { Elem, Ev, GameState, PlayerId, Stack } from '../engine/types';
import { angleLerp, animCfg, ease, lerp, onTick, tween, wait } from './anim';
import { assemble, Debris, projectile, ring, sparkle } from './fx';
import { voxelMesh, voxelPoints, VOX } from './mesh';
import { DIR_ROT, Stage, tileWorld, TILE_TOP } from './stage';
import { sfx } from '../game/audio';
import { ICON } from '../ui/icons';

export const ELEM_COLOR: Record<Elem, number> = { ember: 0xff7a3a, tide: 0x4ab8e8, moss: 0x7ac85a, volt: 0xffd84a, stone: 0xb8b0a4, gleam: 0xe8a0ff };
const OWNER_COL = [0x2f5f8a, 0x9a3a2a];
const SUPPORT_SCALE = 0.8;

interface UnitView { uid: number; card: string; mesh: THREE.Mesh; h: number; scale: number; flash: number }
interface StackView {
  id: number; owner: PlayerId; group: THREE.Group; body: THREE.Group; token: THREE.Group; units: UnitView[];
  label: HTMLDivElement; phase: number; glue?: THREE.Mesh; gear?: THREE.Object3D; gearId?: string | null; busy: boolean; dir: number;
}

export type HlKind = 'move' | 'attack' | 'summon' | 'target' | 'select' | 'hover' | 'area';
const HL_COL: Record<HlKind, number> = { move: 0xf4e2b8, attack: 0xe84a32, summon: 0xf2b640, target: 0x48c8b0, select: 0xffd060, hover: 0xffffff, area: 0xe84a32 };

const hlMat = (col: number) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, toneMapped: false,
  uniforms: { col: { value: new THREE.Color(col) }, time: { value: 0 }, fill: { value: 0.18 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform vec3 col; uniform float time, fill; varying vec2 vUv;
    float sdRound(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q,0.0)) + min(max(q.x,q.y),0.0) - r; }
    void main(){
      vec2 p = vUv - 0.5;
      float d = sdRound(p, vec2(0.46), 0.08);
      float border = smoothstep(0.035, 0.0, abs(d + 0.025));
      float ang = atan(p.y, p.x);
      float dash = step(0.5, fract(ang * 3.0 + time * 0.6));
      float a = border * (0.55 + 0.45 * dash) + step(d, 0.0) * fill * (0.75 + 0.25 * sin(time * 3.0));
      gl_FragColor = vec4(col * 1.25, a);
    }`,
});

export class BattleView {
  stacks = new Map<number, StackView>();
  debris: Debris;
  private hl = new THREE.Group();
  private hlPool: THREE.Mesh[] = [];
  private terrain = new Map<number, THREE.Object3D>();
  private traps = new Map<number, THREE.Object3D>();
  private group = new THREE.Group();
  private off: () => void;
  private lastState: GameState | null = null;
  selected: number | null = null;

  constructor(private stage: Stage, private labels: HTMLElement, public me: PlayerId) {
    stage.root.add(this.group);
    this.group.add(this.hl);
    this.debris = new Debris(this.group);
    let t = 0;
    this.off = onTick(dt => {
      t += dt;
      this.frame(dt, t);
    });
  }

  dispose() {
    this.off();
    this.stage.root.remove(this.group);
    this.labels.innerHTML = '';
    this.stacks.clear();
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
    const v: StackView = { id: st.id, owner: st.owner, group, body, token, units: [], label, phase: Math.random() * 6, busy: false, dir: st.dir };
    for (const u of st.units) this.addUnit(v, u.uid, u.card, visible);
    this.layout(v, false);
    this.stacks.set(st.id, v);
    return v;
  }

  private addUnit(v: StackView, uid: number, cardId: string, visible: boolean): UnitView {
    const { mesh, height } = voxelMesh(cardId);
    mesh.visible = visible;
    v.body.add(mesh);
    const u: UnitView = { uid, card: cardId, mesh, h: height, scale: 1, flash: 0 };
    v.units.push(u);
    return u;
  }

  /** Stack the unit meshes on top of each other. Returns the top height. */
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

  private removeStack(id: number) {
    const v = this.stacks.get(id);
    if (!v) return;
    this.group.remove(v.group);
    v.label.remove();
    this.stacks.delete(id);
  }

  // ---------------------------------------------------------------- sync (authoritative)
  sync(s: GameState) {
    this.lastState = s;
    const seen = new Set<number>();
    for (const st of s.stacks) {
      seen.add(st.id);
      let v = this.stacks.get(st.id);
      if (!v) v = this.createStack(st);
      // units
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
      // glue (frozen)
      const frozen = st.frozen > 0;
      if (frozen && !v.glue) {
        v.glue = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0xe8b860, roughness: 0.15, transmission: 0.5, transparent: true, opacity: 0.7, thickness: 0.4 }));
        v.glue.scale.set(1, 0.55, 1);
        v.group.add(v.glue);
      } else if (!frozen && v.glue) { v.group.remove(v.glue); v.glue = undefined; }
      // gear prop
      const gearId = lead(st).gear;
      if (gearId !== v.gearId) {
        if (v.gear) v.group.remove(v.gear);
        v.gear = undefined;
        if (gearId) {
          const { mesh } = voxelMesh(gearId);
          mesh.scale.setScalar(0.38);
          v.gear = mesh;
          v.group.add(mesh);
        }
        v.gearId = gearId;
      }
      this.updateLabel(v, st, s);
    }
    for (const id of [...this.stacks.keys()]) if (!seen.has(id)) this.removeStack(id);
    // terrain
    s.tiles.forEach((t, i) => {
      const cur = this.terrain.get(i);
      const key = t.terrain || '';
      if ((cur?.userData.elem || '') === key) return;
      if (cur) this.group.remove(cur);
      this.terrain.delete(i);
      if (t.terrain) { const d = terrainDecor(t.terrain); tileWorld(i % 5, Math.floor(i / 5), d.position); d.userData.elem = t.terrain; this.group.add(d); this.terrain.set(i, d); }
    });
    // own traps (face-down cards)
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
  }

  private updateLabel(v: StackView, st: Stack, s: GameState) {
    const m = mods(s, st);
    const L = lead(st);
    const lc = card(L.card);
    const rows = st.units.slice().reverse().map((u, i) => {
      const c = card(u.card);
      const pct = Math.max(0, u.hp / maxHp(u)) * 100;
      return i === 0
        ? `<div class="sl-lead"><span class="sl-pow">${ICON.sword}${m.power}</span><span class="sl-hp">${ICON.heart}${u.hp}</span>${m.armor ? `<span class="sl-arm">${ICON.shield}${m.armor}</span>` : ''}</div><div class="sl-bar"><i style="width:${pct}%"></i></div>`
        : `<div class="sl-bar sub" title="${c.name}"><i style="width:${pct}%"></i></div>`;
    }).join('');
    const ap = st.owner === s.active && st.owner === this.me ? `<div class="sl-ap">${Array.from({ length: Math.max(0, st.ap) }, () => '<b></b>').join('')}</div>` : '';
    const frozen = st.frozen > 0 ? `<div class="sl-tag">${ICON.glue}</div>` : '';
    v.label.innerHTML = `<div class="sl-name" style="--e:#${ELEM_COLOR[lc.elem!].toString(16).padStart(6, '0')}">${lc.name}</div>${rows}${ap}${frozen}`;
    v.label.dataset.id = String(st.id);
  }

  // ---------------------------------------------------------------- per-frame
  private frame(dt: number, t: number) {
    for (const h of this.hlPool) if (h.visible) (h.material as THREE.ShaderMaterial).uniforms.time.value = t;
    for (const v of this.stacks.values()) {
      v.units.forEach((u, i) => {
        const isLead = i === v.units.length - 1;
        const breathe = isLead ? 1 + Math.sin(t * 2.6 + v.phase) * 0.028 : 1;
        u.mesh.scale.set(u.scale / Math.sqrt(breathe), u.scale * breathe, u.scale / Math.sqrt(breathe));
        u.mesh.rotation.y = isLead ? Math.sin(t * 0.9 + v.phase) * 0.06 : 0;
        if (u.flash > 0) {
          u.flash = Math.max(0, u.flash - dt * 4);
          for (const m of u.mesh.material as THREE.Material[]) if ((m as THREE.MeshStandardMaterial).emissive) (m as THREE.MeshStandardMaterial).emissive.setScalar(u.flash * 0.9);
        }
      });
      if (v.gear) {
        const top = this.topY(v);
        v.gear.position.set(Math.cos(t * 1.4 + v.phase) * 0.42, top * 0.6 + Math.sin(t * 2) * 0.05, Math.sin(t * 1.4 + v.phase) * 0.42);
        v.gear.rotation.y = t * 1.6;
      }
      // label above the tower
      const p = v.group.position.clone();
      p.y += this.topY(v) + 0.18;
      const sp = this.stage.toScreen(p);
      v.label.style.transform = `translate(${sp.x.toFixed(1)}px, ${sp.y.toFixed(1)}px) translate(-50%, -100%)`;
      v.label.classList.toggle('sel', this.selected === v.id);
    }
  }

  // ---------------------------------------------------------------- highlights
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

  // ---------------------------------------------------------------- event playback
  private pos(x: number, y: number) { return tileWorld(x, y); }
  private elemOf(v: StackView) { return card(v.units[v.units.length - 1].card).elem as Elem; }
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
    setTimeout(() => d.remove(), 1400 / animCfg.speed);
  }

  async play(ev: Ev, after: GameState): Promise<void> {
    const S = this.stage;
    switch (ev.e) {
      case 'summon': {
        const st = after.stacks.find(s => s.id === ev.stack) || { id: ev.stack, owner: ev.p, x: ev.x, y: ev.y, dir: ev.dir, units: [{ uid: ev.uid, card: ev.card, hp: 1, gear: null }], ap: 0, moved: false, frozen: 0, attacked: false } as Stack;
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
        break;
      }
      case 'fuse': {
        const v = this.stacks.get(ev.stack);
        if (!v) break;
        v.busy = true;
        const center = v.group.position.clone();
        center.y += 0.6;
        const cin = S.cinematicTo(center, { dist: 4.2, el: 0.42, hold: 1300, dur: 500 });
        sfx.fuse();
        // the two top units collapse into a swirling core
        const gone = v.units.filter(u => ev.from.includes(u.uid));
        const col = new THREE.Color(ELEM_COLOR[card(ev.card).elem!]);
        for (const u of gone) {
          const wp = new THREE.Vector3();
          u.mesh.getWorldPosition(wp);
          tween(500, k => { u.mesh.scale.setScalar(u.scale * (1 - k)); u.mesh.rotation.y = k * 8; }, ease.inCubic);
        }
        await wait(380);
        for (let i = 0; i < 70; i++) this.debris.spawn(center, new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3), col, 0.05, 0.8);
        S.flash(1, 0.95, 0.8, 0.45, 400);
        for (const u of gone) v.body.remove(u.mesh);
        v.units = v.units.filter(u => !ev.from.includes(u.uid));
        const nu = this.addUnit(v, ev.uid, ev.card, false);
        this.layout(v, true);
        await this.materialize(v, nu, 900, true);
        ring(this.group, v.group.position, col, 1.6, 700);
        await cin;
        v.busy = false;
        break;
      }
      case 'move': case 'push': {
        const v = this.stacks.get(ev.stack);
        if (!v) break;
        v.busy = true;
        const from = this.pos(ev.fx, ev.fy), to = this.pos(ev.x, ev.y);
        if (ev.e === 'push' && ev.blocked) {
          sfx.bump();
          const o = v.group.position.clone();
          await tween(260, k => { v.group.position.x = o.x + Math.sin(k * Math.PI * 6) * 0.06 * (1 - k); }, ease.linear);
          v.group.position.copy(o);
        } else if (ev.e === 'push') {
          sfx.slide();
          await tween(320, k => { v.group.position.lerpVectors(from, to, k); }, ease.outCubic);
          for (let i = 0; i < 10; i++) this.debris.spawn(v.group.position, new THREE.Vector3((Math.random() - 0.5), 0.6, (Math.random() - 0.5)), new THREE.Color(0xc8a070), 0.03, 0.5);
        } else {
          sfx.hop();
          await tween(340, k => {
            v.group.position.lerpVectors(from, to, k);
            v.group.position.y = TILE_TOP + Math.sin(k * Math.PI) * 0.38;
            const sq = 1 + Math.sin(k * Math.PI) * 0.08;
            v.body.scale.set(1 / sq, sq, 1 / sq);
          }, ease.inOutCubic);
          sfx.land();
          await tween(160, k => { const sq = 1 - Math.sin(k * Math.PI) * 0.1; v.body.scale.set(1 / sq, sq, 1 / sq); }, ease.linear);
          v.body.scale.set(1, 1, 1);
        }
        v.group.position.copy(to);
        v.busy = false;
        break;
      }
      case 'turnTo': {
        const v = this.stacks.get(ev.stack);
        if (!v) break;
        v.busy = true;
        sfx.turn();
        const a0 = v.group.rotation.y, a1 = DIR_ROT[ev.dir];
        await tween(260, k => { v.group.rotation.y = angleLerp(a0, a1, k); }, ease.outBack);
        v.group.rotation.y = a1;
        v.busy = false;
        break;
      }
      case 'attack': {
        const v = this.stacks.get(ev.stack);
        if (!v) break;
        v.busy = true;
        const e = this.elemOf(v);
        const col = this.col(e);
        const origin = this.leadTop(v);
        // anticipation (body-local +z is always the facing direction)
        await tween(140, k => { v.body.position.set(0, 0, -0.12 * k); }, ease.outQuad);
        if (ev.player !== undefined) {
          sfx.attack('line');
          const target = origin.clone();
          target.z += ev.player === 0 ? 3.4 : -3.4;
          target.y = 0.6;
          v.body.position.set(0, 0, 0);
          await projectile(this.group, this.debris, origin, target, col, 1.2, 420);
          this.debris.burst(target, col, 40, 3);
          S.shake(0.22);
          if (ev.player === this.me) S.flash(0.8, 0.1, 0.05, 0.35);
        } else if (ev.shape === 'jab' || ev.shape === 'cone' || ev.shape === 'sweep') {
          sfx.attack(ev.shape);
          if (ev.shape === 'sweep') tween(320, k => { v.body.rotation.y = k * Math.PI * 2; }, ease.inOutCubic).then(() => (v.body.rotation.y = 0));
          await tween(150, k => { v.body.position.set(0, 0.05 * Math.sin(k * Math.PI), -0.12 + 0.5 * k); }, ease.inQuad);
          for (const [tx, ty] of ev.tiles) ring(this.group, this.pos(tx, ty), col, 0.7, 320);
          tween(220, k => { v.body.position.set(0, 0, 0.38 * (1 - k)); }, ease.outCubic);
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
          if (ev.shape === 'splash') { ring(this.group, target, col, 2.4, 500); S.shake(0.08); }
        }
        v.body.position.set(0, 0, 0);
        v.busy = false;
        break;
      }
      case 'hit': {
        const v = this.stacks.get(ev.stack);
        if (!v) break;
        const u = v.units.find(q => q.uid === ev.uid) || v.units[v.units.length - 1];
        if (!u) break;
        u.flash = 1;
        const p = v.group.position.clone();
        p.y += u.mesh.position.y + u.h * u.scale * 0.6;
        const big = ev.facing === 'back' || ev.adv;
        if (ev.n > 0) {
          (big ? sfx.crit : sfx.hit)();
          this.debris.burst(p, this.col(card(u.card).elem!), Math.min(40, 8 + ev.n * 4), 2.2 + ev.n * 0.15);
          if (big) S.shake(0.12);
          const tag = ev.spill ? 'SPILL' : ev.facing === 'back' ? 'BACK ×2' : ev.facing === 'side' ? 'SIDE ×1.5' : '';
          const adv = ev.adv ? '<em>TYPE ×1.5</em>' : '';
          this.popup(p, `<b>-${ev.n}</b>${tag ? `<small>${tag}</small>` : ''}${adv}`, big ? 'dmg big' : 'dmg');
        } else {
          sfx.block();
          this.popup(p, '<b>0</b><small>BLOCKED</small>', 'dmg block');
        }
        const o = v.body.position.clone();
        await tween(220, k => { v.body.position.x = o.x + Math.sin(k * Math.PI * 5) * 0.05 * (1 - k); }, ease.linear);
        v.body.position.copy(o);
        break;
      }
      case 'ko': {
        const v = this.stacks.get(ev.stack);
        if (!v) break;
        const u = v.units.find(q => q.uid === ev.uid);
        if (!u) break;
        sfx.ko();
        const pts = voxelPoints(u.card, 500);
        const wp = new THREE.Vector3();
        u.mesh.getWorldPosition(wp);
        const rot = v.group.rotation.y;
        const cs = Math.cos(rot), sn = Math.sin(rot);
        const c = new THREE.Color();
        for (let i = 0; i < pts.n; i++) {
          const lx = pts.p[i * 3] * u.scale, ly = pts.p[i * 3 + 1] * u.scale, lz = pts.p[i * 3 + 2] * u.scale;
          const p = new THREE.Vector3(wp.x + lx * cs + lz * sn, wp.y + ly, wp.z - lx * sn + lz * cs);
          const vel = new THREE.Vector3(lx * 6 + (Math.random() - 0.5) * 1.5, 1 + Math.random() * 2.5, lz * 6 + (Math.random() - 0.5) * 1.5);
          c.setRGB(pts.c[i * 3], pts.c[i * 3 + 1], pts.c[i * 3 + 2]);
          this.debris.spawn(p, vel, c, VOX * u.scale * 1.05, 1.6);
        }
        v.body.remove(u.mesh);
        v.units = v.units.filter(q => q !== u);
        S.shake(0.1);
        if (v.units.length) { this.layout(v, true, 320); await wait(200); }
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
        await wait(160);
        break;
      }
      case 'playerHit': {
        if (ev.p === this.me) { S.flash(0.85, 0.12, 0.05, 0.3); S.shake(0.2); }
        break;
      }
      case 'trap': {
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
        await wait(250);
        tween(300, k => mesh.scale.setScalar(0.9 * (1 - k)), ease.inCubic).then(() => { this.group.remove(mesh); disposeMats(mesh); });
        break;
      }
      case 'trapSet': {
        if (ev.p === this.me) sfx.card();
        break;
      }
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
        if (v) { sfx.gear(); sparkle(this.debris, this.leadTop(v), new THREE.Color(0xd8c8a0), 14); }
        await wait(200);
        break;
      }
      case 'freeze': {
        const v = this.stacks.get(ev.stack);
        if (v) { sfx.freeze(); sparkle(this.debris, this.leadTop(v), new THREE.Color(0xe8b860), 14); }
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
        await tween(600, k => { mesh.rotation.z = k * Math.PI * 4; mesh.position.y = p.y + 0.4 + k * 0.3; mesh.scale.setScalar(0.4 * (1 - k * k)); }, ease.linear);
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

  /** Pixels rise off the card and snap into the voxel model. */
  private async materialize(v: StackView, u: UnitView, ms = 650, swirl = false) {
    const pts = voxelPoints(u.card, 700);
    // target positions in body-local space, scaled + offset like the mesh
    u.mesh.updateMatrix();
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
        // a flat 32x32 "card" of pixels hovering above the tile
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
  // a few 3D bits
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
