import { sfx } from '../game/audio';
import { ICON } from './icons';

type Kid = Node | string | number | null | undefined | false;
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, unknown> = {}, ...kids: (Kid | Kid[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v as Record<string, string>)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else (el.style as unknown as Record<string, string>)[sk] = sv; } }
    else if (k.startsWith('on') && typeof v === 'function') {
      const ev = k.slice(2).toLowerCase();
      el.addEventListener(ev, ev === 'click' ? (e: Event) => { sfx.click(); (v as (e: Event) => void)(e); } : (v as EventListener));
    } else el.setAttribute(k, String(v));
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
export const $ = (sel: string) => document.querySelector(sel) as HTMLElement;

export function modal(content: Node, opts: { onClose?: () => void; closable?: boolean; cls?: string } = {}) {
  const box = h('div', { class: 'modal panel ' + (opts.cls || '') }, content);
  const bg = h('div', { class: 'modal-bg' }, box);
  const close = () => { bg.remove(); opts.onClose?.(); };
  if (opts.closable !== false) {
    bg.addEventListener('pointerdown', e => { if (e.target === bg) close(); });
    const x = h('button', { class: 'btn small paper', style: { position: 'absolute', top: '12px', right: '12px', zIndex: '2' }, html: ICON.close, onclick: close, 'aria-label': 'Close' });
    box.prepend(x);
  }
  $('#overlay').appendChild(bg);
  return { close, box };
}

export function toast(msg: string) {
  let t = document.querySelector('.toasts') as HTMLElement | null;
  if (!t) { t = h('div', { class: 'toasts' }); document.body.appendChild(t); }
  const el = h('div', { class: 'toast paper' }, msg);
  t.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

export function confirmBox(title: string, text: string, ok = 'Yes', danger = false): Promise<boolean> {
  return new Promise(res => {
    let done = false;
    const finish = (v: boolean) => { if (done) return; done = true; m.close(); res(v); };
    const m = modal(h('div', {},
      h('h2', {}, title), h('p', { style: { fontSize: '17px', maxWidth: '440px' } }, text),
      h('div', { class: 'actions' },
        h('button', { class: 'btn paper', onclick: () => finish(false) }, 'Cancel'),
        h('button', { class: 'btn ' + (danger ? 'red' : 'green'), onclick: () => finish(true) }, ok))), { onClose: () => { if (!done) { done = true; res(false); } } });
  });
}

export function coin(kind: 'buttons' | 'stuffing', n: number) {
  return h('span', { class: 'coin' + (kind === 'stuffing' ? ' st' : ''), title: kind === 'buttons' ? 'Buttons: spend on packs' : 'Stuffing: craft any card' },
    h('span', { html: kind === 'buttons' ? ICON.button : ICON.stuffing }), String(n));
}

/** replaceChildren that skips null/false entries. */
export function fill(el: Element, ...kids: (Kid | Kid[])[]) {
  el.replaceChildren(...(kids.flat().filter(k => k !== null && k !== undefined && k !== false).map(k => (k instanceof Node ? k : String(k)))));
}
