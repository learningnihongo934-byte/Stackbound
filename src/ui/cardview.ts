// Card faces (DOM) and the 3D turntable used by the inspect view.
import * as THREE from 'three';
import { card, ELEM_NAME, familyOf, rulesText, SHAPE_TEXT } from '../engine/cards';
import { getModel } from '../art/models';
import { renderPortrait } from '../art/pixelart';
import { backdropFor } from '../art/portraits';
import { voxelMesh } from '../render/mesh';
import { h } from './dom';
import { ELEM_ICON, ICON, shapeIcon } from './icons';

const artCache = new Map<string, string>();
export function cardArt(id: string, size = 32, bg = true): string {
  const key = id + ':' + size + ':' + bg;
  let url = artCache.get(key);
  if (url) return url;
  const px = renderPortrait(getModel(id), { size, backdrop: bg ? backdropFor(id) : null });
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  img.data.set(px);
  ctx.putImageData(img, 0, 0);
  url = c.toDataURL();
  artCache.set(key, url);
  return url;
}

export interface CardOpts { foil?: boolean; count?: number; unowned?: boolean; mini?: boolean; isNew?: boolean; w?: number; onClick?: (e: MouseEvent) => void; cls?: string; title?: string }

export function renderCard(id: string, o: CardOpts = {}): HTMLElement {
  const c = card(id);
  const cls = ['card', 'k-' + c.kind, c.elem ? 'e-' + c.elem : '', 'r-' + c.rarity, o.foil ? 'foil' : '', o.unowned ? 'unowned' : '', o.mini ? 'mini' : '', o.cls || ''].join(' ');
  const typeLine = c.kind === 'creature'
    ? `<span>${c.family ? `Stage ${c.stage}` : 'Solo'} · ${ELEM_NAME[c.elem!]}</span><span>${c.kind}</span>`
    : `<span>${c.kind}${c.elem ? ' · ' + ELEM_NAME[c.elem] : ''}</span><span>${c.kind === 'trap' ? (c.trigger === 'enter' ? 'snare' : 'counter') : ''}</span>`;
  const text = rulesText(c).map(t => t.startsWith('Under: ') ? `<p class="u"><b>Under:</b> ${t.slice(7)}</p>` : `<p>${t}</p>`).join('') + (c.kind !== 'creature' || !c.supportText ? `<p class="fl">${c.flavor}</p>` : '');
  const stage = c.family ? `<div class="c-stage">${[1, 2, 3].map(s => `<i class="${s <= (c.stage || 1) ? '' : 'off'}"></i>`).join('')}</div>` : '';
  const shape = c.kind === 'creature' ? `<div class="c-shape" title="${SHAPE_TEXT[c.shape!]}">${shapeIcon(c.shape!, c.range!)}<span>R${c.range}</span></div>` : '';
  const foot = c.kind === 'creature'
    ? `<span class="c-stat pow">${ICON.sword}${c.power}</span><span class="c-rar"></span><span class="c-stat hp">${ICON.heart}${c.hp}</span>`
    : `<span></span><span class="c-rar"></span><span></span>`;
  const el = h('div', { class: cls, style: o.w ? { '--w': o.w + 'px' } : undefined, title: o.title, html: `
    <div class="c-in">
      <div class="c-head"><span class="c-cost">${c.cost}</span><span class="c-name">${c.name}</span>${c.elem ? `<span class="c-elem">${ELEM_ICON[c.elem]}</span>` : ''}</div>
      <div class="c-art"><img class="px" src="${cardArt(id)}" alt="">${stage}</div>
      <div class="c-type">${typeLine}</div>
      <div class="c-body">${shape}<div class="c-text">${text}</div></div>
      <div class="c-foot">${foot}</div>
    </div>` });
  if (o.w) el.style.setProperty('--w', o.w + 'px');
  if (o.count !== undefined) el.appendChild(h('span', { class: 'count' }, '×' + o.count));
  if (o.isNew) el.appendChild(h('span', { class: 'newtag' }, 'NEW'));
  if (o.onClick) el.addEventListener('click', o.onClick);
  el.dataset.id = id;
  return el;
}

export function cardBack(w?: number): HTMLElement {
  const el = h('div', { class: 'card back', html: '<div class="cb"><span>S</span></div>' });
  if (w) el.style.setProperty('--w', w + 'px');
  return el;
}

export function familyStrip(id: string): HTMLElement | null {
  const c = card(id);
  if (!c.family) return null;
  return h('div', { class: 'fam' }, familyOf(c.family).map(f => renderCard(f.id, { mini: true, w: 92 })));
}

// ---------------------------------------------------------------- turntable
let tt: { r: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.PerspectiveCamera; holder: THREE.Group; raf: number; host: HTMLElement | null } | null = null;
export function turntable(host: HTMLElement, id: string) {
  if (!tt) {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.shadowMap.enabled = true;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffe8c8, 0x302018, 1.2));
    const key = new THREE.DirectionalLight(0xffe0b0, 2.4);
    key.position.set(-2, 4, 3);
    key.castShadow = true;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x9ab8ff, 1.2);
    rim.position.set(3, 2, -3);
    scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.2, 48), new THREE.MeshStandardMaterial({ color: 0x6a4428, roughness: 0.8 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    const holder = new THREE.Group();
    scene.add(holder);
    tt = { r, scene, cam, holder, raf: 0, host: null };
  }
  const T = tt;
  cancelAnimationFrame(T.raf);
  T.holder.clear();
  const { mesh, height } = voxelMesh(id);
  T.holder.add(mesh);
  const w = host.clientWidth || 260, hh = host.clientHeight || 220;
  T.r.setPixelRatio(Math.min(2, devicePixelRatio));
  T.r.setSize(w, hh);
  T.cam.aspect = w / hh;
  const d = Math.max(1.6, height * 2.4);
  T.cam.position.set(0, height * 0.8 + 0.4, d);
  T.cam.lookAt(0, height * 0.45, 0);
  T.cam.updateProjectionMatrix();
  host.innerHTML = '';
  host.appendChild(T.r.domElement);
  T.host = host;
  let a = 0.6;
  const loop = () => {
    if (!host.isConnected) return;
    a += 0.012;
    T.holder.rotation.y = a;
    T.r.render(T.scene, T.cam);
    T.raf = requestAnimationFrame(loop);
  };
  loop();
}
