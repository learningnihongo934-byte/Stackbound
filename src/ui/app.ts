// App shell: screen router, the live 3D menu showcase, shared top bar.
import { STARTERS } from '../engine/decks';
import type { GameState } from '../engine/types';
import { BattleView } from '../render/battleview';
import type { Stage } from '../render/stage';
import { setMusic } from '../game/audio';
import { P, onProfile } from '../game/profile';
import { coin, h, $ } from './dom';
import { ICON } from './icons';

export let stage: Stage;
let showcase: BattleView | null = null;
let current: (() => void) | null = null;
export const setStage = (s: Stage) => { stage = s; };

export function go(render: () => HTMLElement, opts: { mode?: 'menu' | 'board'; music?: 'menu' | 'battle' | 'boss' | 'off'; keepShowcase?: boolean } = {}) {
  current?.();
  current = null;
  const ui = $('#ui');
  ui.innerHTML = '';
  stage.setMode(opts.mode || 'menu');
  stage.setViewShift(0);
  if (opts.mode !== 'board') showMenuShowcase(); else hideShowcase();
  setMusic(opts.music || 'menu');
  const el = render();
  ui.appendChild(el);
}
export function onLeave(fn: () => void) { const prev = current; current = () => { prev?.(); fn(); }; }

function hideShowcase() { showcase?.dispose(); showcase = null; }
function showMenuShowcase() {
  if (showcase) return;
  showcase = new BattleView(stage, $('#labels'), 0);
  const hero = P.starter ? STARTERS.find(s => s.id === P.starter)!.hero : 'matchpup';
  const fake = {
    rng: 1, turn: 1, first: 0, active: 0, winner: null, nextId: 100,
    players: [null, null],
    tiles: Array.from({ length: 25 }, (_, i) => ({ terrain: i === 12 ? 'gleam' : i === 6 ? 'ember' : i === 18 ? 'tide' : null, trap: null })),
    stacks: [
      { id: 1, owner: 0, x: 1, y: 1, dir: 0, units: [{ uid: 1, card: 'marblet', hp: 4, gear: null }, { uid: 2, card: 'battbug', hp: 2, gear: null }, { uid: 3, card: hero, hp: 3, gear: null }], ap: 0, moved: false, frozen: 0, attacked: false },
      { id: 2, owner: 0, x: 3, y: 1, dir: 0, units: [{ uid: 4, card: 'kilnhound', hp: 7, gear: null }], ap: 0, moved: false, frozen: 0, attacked: false },
      { id: 3, owner: 1, x: 2, y: 3, dir: 2, units: [{ uid: 5, card: 'piggyvault', hp: 6, gear: null }, { uid: 6, card: 'chandelord', hp: 11, gear: null }], ap: 0, moved: false, frozen: 0, attacked: false },
      { id: 4, owner: 1, x: 0, y: 3, dir: 1, units: [{ uid: 7, card: 'bathduck', hp: 4, gear: null }], ap: 0, moved: false, frozen: 0, attacked: false },
      { id: 5, owner: 1, x: 4, y: 4, dir: 3, units: [{ uid: 8, card: 'celestelle', hp: 11, gear: null }], ap: 0, moved: false, frozen: 0, attacked: false },
    ],
  } as unknown as GameState;
  showcase.sync(fake);
  document.querySelectorAll('.stack-label').forEach(e => ((e as HTMLElement).style.display = 'none'));
}

export function topbar(title: string, back?: () => void, extra?: HTMLElement[]): HTMLElement {
  const wallet = h('div', { class: 'wallet' }, coin('buttons', P.buttons), coin('stuffing', P.stuffing));
  const off = onProfile(() => { wallet.replaceChildren(coin('buttons', P.buttons), coin('stuffing', P.stuffing)); });
  onLeave(() => off());
  return h('div', { class: 'topbar' },
    back ? h('button', { class: 'btn icon paper', html: ICON.back, onclick: back, 'aria-label': 'Back' }) : null,
    h('div', { class: 'label' }, title),
    h('div', { class: 'grow' }),
    ...(extra || []),
    wallet);
}
