// Battle controller: input, HUD, AI turns, event playback, tutorial coach and results.
import * as THREE from 'three';
import { card } from '../engine/cards';
import { STARTERS, themedDeck } from '../engine/decks';
import {
  actionKey, apply, attackDamage, attackOptions, DIRV, fuseTarget, lead, legalActions, mods, moveTiles, newMatch, playCost, stackAt, stackById, viewFor,
} from '../engine/rules';
import type { Action, AttackOption, Dir, Elem, Ev, GameState, PlayerId, Stack } from '../engine/types';
import type { AiOpts } from '../engine/ai';
import { sfx } from '../game/audio';
import { arcadeScore } from '../game/arcade';
import { clearedCount, opponentDeck, winReward, ZONES, type Opponent } from '../game/campaign';
import { activeDeck, addCard, canPlayDeck, deckList, P, save } from '../game/profile';
import { animCfg, wait } from '../render/anim';
import { BattleView, type HlKind } from '../render/battleview';
import { tileWorld } from '../render/stage';
import { go, onLeave, stage } from './app';
import { cardArt, cardBack, renderCard } from './cardview';
import { confirmBox, fill, h, modal, toast, $ } from './dom';
import { ELEM_ICON, ICON } from './icons';
import { campaignScreen, decksScreen, inspectModal, rulesModal, settingsModal, titleScreen } from './screens';

const ME: PlayerId = 0, AI: PlayerId = 1;

interface BattleCfg {
  foeName: string; foeTitle: string; foePortrait: string; foeDeck: ReturnType<typeof themedDeck>; foeLife: number; ai: 0 | 1 | 2 | 3;
  opponent: Opponent | null; quickLevel?: number; tutorial: boolean;
}

export function startCampaignDuel(o: Opponent) {
  const deck = canPlayDeck();
  if (!deck) { toast('Your active deck isn\'t ready. Fix it in Decks.'); decksScreen(); return; }
  runBattle({ foeName: o.name, foeTitle: o.title, foePortrait: o.portrait, foeDeck: opponentDeck(o), foeLife: o.life, ai: o.ai, opponent: o, tutorial: !P.tutorial && o.id === '0-0' });
}
export function startQuickDuel(level: 0 | 1 | 2 | 3) {
  const deck = canPlayDeck();
  if (!deck) { toast('Your active deck isn\'t ready. Fix it in Decks.'); decksScreen(); return; }
  const pairs: Elem[][] = [['ember', 'tide'], ['moss', 'stone'], ['volt', 'gleam'], ['ember', 'stone'], ['tide', 'moss'], ['volt', 'ember'], ['gleam', 'tide']];
  const seed = Math.floor(Math.random() * 1e9);
  const elems = pairs[seed % pairs.length];
  const names = ['Toy Box Tess', 'Sock Puppet Sid', 'Clockwork Clem', 'Pocket Knight', 'Marble Mae', 'Yo-Yo Yuri'];
  const portraits = ['sparkjack', 'mossbear', 'ziprover', 'dominoknight', 'marblet', 'twirla'];
  const k = seed % names.length;
  runBattle({ foeName: names[k], foeTitle: ['Easy', 'Normal', 'Hard', 'Expert'][level] + ' opponent', foePortrait: portraits[k], foeDeck: themedDeck(elems, seed, Math.min(2, level)), foeLife: 20, ai: level, opponent: null, quickLevel: level, tutorial: false });
}

// ---------------------------------------------------------------- AI worker
let worker: Worker | null = null;
let reqId = 0;
function aiChoose(s: GameState, opts: AiOpts): Promise<Action> {
  if (!worker) worker = new Worker(new URL('../engine/ai.worker.ts', import.meta.url), { type: 'module' });
  const id = ++reqId;
  return new Promise(res => {
    const onMsg = (e: MessageEvent) => { if (e.data.id !== id) return; worker!.removeEventListener('message', onMsg); res(e.data.action); };
    worker!.addEventListener('message', onMsg);
    worker!.postMessage({ id, state: s, opts });
  });
}

// ---------------------------------------------------------------- the battle
function runBattle(cfg: BattleCfg) {
  const deck = activeDeck()!;
  const seed = Math.floor(Math.random() * 1e9);
  const first: PlayerId = cfg.tutorial ? 0 : (seed % 2) as PlayerId;
  let { state: S, events: startEvents } = newMatch({ seed, decks: [deckList(deck), cfg.foeDeck], names: ['You', cfg.foeName], first, life: [20, cfg.foeLife] });
  let view: BattleView;
  let busy = false;
  let over = false;
  let sel: { kind: 'card'; uid: number } | { kind: 'stack'; id: number } | null = null;
  let picker: HTMLElement | null = null;
  let hoverTile: { x: number; y: number } | null = null;
  const log: { t: string; p: PlayerId | -1 }[] = [];
  let coachStep = cfg.tutorial ? 0 : -1;
  const coachSeen = new Set<number>();

  // ---------------- HUD skeleton
  const hud = h('div', { class: 'hud' });
  const foePlaque = h('div', { class: 'plaque foe' });
  const mePlaque = h('div', { class: 'plaque me' });
  const handEl = h('div', { class: 'hand' });
  const foeHandEl = h('div', { class: 'foehand' });
  const turnFlag = h('div', { class: 'turnflag label' });
  const hintEl = h('div', { class: 'hint paper', style: { display: 'none' } });
  const actbar = h('div', { class: 'actbar paper', style: { display: 'none' } });
  const infoEl = h('div', { class: 'stackinfo paper', style: { display: 'none' } });
  const logEl = h('div', { class: 'log paper' });
  const coachEl = h('div', { class: 'coach', style: { display: 'none' } });
  const endBtn = h('button', { class: 'btn big endturn red', onclick: () => endTurn() }, 'End Turn') as HTMLButtonElement;
  const side = h('div', { class: 'side' },
    h('button', { class: 'btn icon paper', html: ICON.gear, title: 'Menu', onclick: pauseMenu }),
    h('div', { style: { display: 'flex', gap: '6px' } },
      h('button', { class: 'btn icon paper', html: ICON.rotateL, title: 'Rotate view (Q)', onclick: () => stage.rotateView(-1) }),
      h('button', { class: 'btn icon paper', html: ICON.rotateR, title: 'Rotate view (E)', onclick: () => stage.rotateView(1) })),
    endBtn);
  hud.append(foePlaque, mePlaque, turnFlag, foeHandEl, side, logEl, infoEl, hintEl, actbar, handEl, coachEl);

  go(() => h('div', { class: 'screen battle-screen', style: { animation: 'none' } }, hud), { mode: 'board', music: 'battle' });
  view = new BattleView(stage, $('#labels'), ME);
  const portrait = window.innerWidth < 900;
  stage.setViewShift(portrait ? 60 : Math.round(window.innerHeight * 0.1));
  stage.azStep = 0;
  stage.rotateView(0);

  // ---------------- input on the canvas
  const canvas = stage.renderer.domElement;
  const onDown = (e: PointerEvent) => { downAt = { x: e.clientX, y: e.clientY }; };
  let downAt = { x: 0, y: 0 };
  const onUp = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 10) return;
    const t = stage.pick(e.clientX, e.clientY);
    clickTile(t);
  };
  const onMove = (e: PointerEvent) => {
    const t = stage.pick(e.clientX, e.clientY);
    if (t?.x === hoverTile?.x && t?.y === hoverTile?.y) return;
    hoverTile = t;
    refreshHighlights();
    showStackInfo(t ? stackAt(S, t.x, t.y) : undefined);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'q' || e.key === 'Q') stage.rotateView(-1);
    else if (e.key === 'e' || e.key === 'E') stage.rotateView(1);
    else if (e.key === 'Escape') {
      const open = document.querySelector('.modal-bg');
      if (open) { if (!over) open.remove(); }
      else if (sel || picker) clearSel();
      else if (!over) pauseMenu();
    }
    else if (e.key === ' ' || e.key === 'Enter') { if (document.activeElement === document.body) { e.preventDefault(); endTurn(); } }
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointermove', onMove);
  window.addEventListener('keydown', onKey);
  onLeave(() => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointermove', onMove);
    window.removeEventListener('keydown', onKey);
    view.dispose();
    over = true;
  });

  // ---------------- rendering helpers
  const myTurn = () => S.active === ME && !busy && !over;
  let legalMemo: { s: GameState; acts: Action[] } | null = null;
  const legal = (): Action[] => {
    if (S.active !== ME) return [];
    if (legalMemo?.s !== S) legalMemo = { s: S, acts: legalActions(S) };
    return legalMemo.acts;
  };

  function plaque(el: HTMLElement, p: PlayerId) {
    const P0 = S.players[p];
    const lifeEl = el.querySelector('.life') as HTMLElement | null;
    const prevLife = lifeEl ? +lifeEl.textContent! : P0.life;
    const por = p === ME ? (STARTERS.find(s => s.id === P.starter)?.hero || 'matchpup') : cfg.foePortrait;
    el.replaceChildren(
      h('div', { class: 'por' }, h('img', { class: 'px', src: cardArt(por) })),
      h('div', {},
        h('div', { class: 'nm' }, p === ME ? 'You' : cfg.foeName),
        h('div', { class: 'tt' }, p === ME ? deck.name : cfg.foeTitle),
        h('div', { class: 'row' },
          h('span', { title: 'Cards in hand', html: ICON.hand + ' ' + P0.hand.length }),
          h('span', { title: 'Cards left in deck', html: ICON.deck + ' ' + P0.deck.length }),
          h('span', { title: 'Evolution pile', html: ICON.fuse + ' ' + P0.evo.length, style: p === ME ? 'cursor:pointer' : '', onclick: p === ME ? showEvo : undefined } as Record<string, unknown>)),
        h('div', { class: 'energy', title: `Energy ${P0.energy}/${P0.maxEnergy}` }, Array.from({ length: P0.maxEnergy }, (_, i) => h('i', { class: i < P0.energy ? 'on' : '' })))),
      h('div', { class: 'life' + (P0.life < prevLife ? ' hit' : '') }, P0.life));
  }

  function renderHand(drawnUids: Set<number> = new Set()) {
    const P0 = S.players[ME];
    const L = legal();
    const n = P0.hand.length;
    const cw = window.innerWidth < 900 ? 92 : 128;
    const avail = Math.min(handEl.clientWidth || window.innerWidth * 0.9, window.innerWidth - 16);
    const stepW = n > 1 ? Math.min(cw - 18, (avail - cw) / (n - 1)) : cw;
    const marg = (stepW - cw) / 2;
    handEl.replaceChildren(...P0.hand.map((ref, i) => {
      const playable = myTurn() && L.some(a => 'card' in a && a.card === ref.uid);
      const chosen = sel?.kind === 'card' && sel.uid === ref.uid;
      const el = renderCard(ref.card, { cls: (playable ? 'playable' : '') + (chosen ? ' chosen' : '') + (drawnUids.has(ref.uid) ? ' drawn' : '') });
      const rot = (i - (n - 1) / 2) * Math.min(5, 34 / Math.max(1, n));
      el.style.transform = `rotate(${rot}deg) translateY(${Math.abs(rot) * 1.6}px)`;
      el.style.marginLeft = el.style.marginRight = marg + 'px';
      el.addEventListener('click', () => clickCard(ref.uid));
      el.addEventListener('contextmenu', e => { e.preventDefault(); inspectModal(ref.card); });
      el.addEventListener('mouseenter', () => sfx.hover());
      return el;
    }));
    foeHandEl.replaceChildren(...S.players[AI].hand.map(() => cardBack(46)));
  }

  function renderHud(drawn?: Set<number>) {
    plaque(foePlaque, AI);
    plaque(mePlaque, ME);
    renderHand(drawn);
    turnFlag.textContent = over ? '' : S.active === ME ? `Your turn · ${S.players[ME].energy} energy` : `${cfg.foeName} is thinking…`;
    turnFlag.className = 'turnflag label' + (S.active === ME ? '' : ' theirs');
    endBtn.disabled = !myTurn();
    const anything = legal().some(a => a.k !== 'end' && a.k !== 'turn');
    endBtn.classList.toggle('ready', myTurn() && !anything);
    logEl.replaceChildren(...log.slice(-40).map(l => h('div', { class: l.p === 0 ? 'p0' : l.p === 1 ? 'p1' : '' }, l.t)));
    logEl.scrollTop = 1e6;
    refreshHighlights();
    renderActbar();
    coach();
  }

  function showStackInfo(st?: Stack) {
    if (!st || window.innerWidth < 900) { infoEl.style.display = 'none'; return; }
    const m = mods(S, st);
    const L = card(lead(st).card);
    infoEl.style.display = '';
    fill(infoEl, 
      h('h3', {}, (st.owner === ME ? '' : 'Enemy · ') + L.name),
      h('div', { class: 'units' }, st.units.slice().reverse().map(u => renderCard(u.card, { mini: true, w: 66, onClick: () => inspectModal(u.card) }))),
      h('div', { class: 'line' }, h('span', {}, 'Power'), h('span', {}, m.power)),
      h('div', { class: 'line' }, h('span', {}, 'Health'), h('span', {}, st.units.map(u => u.hp).join(' / '))),
      h('div', { class: 'line' }, h('span', {}, 'Attack'), h('span', {}, `${m.shape} · range ${m.range}${m.pierce ? ' · pierce' : ''}`)),
      m.armor ? h('div', { class: 'line' }, h('span', {}, 'Armor'), h('span', {}, m.armor)) : null,
      m.thorns ? h('div', { class: 'line' }, h('span', {}, 'Thorns'), h('span', {}, m.thorns)) : null,
      m.regen ? h('div', { class: 'line' }, h('span', {}, 'Regen'), h('span', {}, m.regen)) : null,
      m.cushion ? h('div', { class: 'line' }, h('span', {}, 'Cushion'), h('span', {}, m.cushion)) : null,
      m.backGuard ? h('div', { class: 'line' }, h('span', {}, 'Back guard'), h('span', {}, 'yes')) : null,
      h('div', { class: 'line' }, h('span', {}, 'Actions'), h('span', {}, st.owner === S.active ? `${st.ap} left` : `${m.actions} per turn`)),
      st.frozen ? h('div', { class: 'line' }, h('span', {}, 'Frozen'), h('span', {}, 'skips next turn')) : null);
  }

  // ---------------- highlights
  function refreshHighlights() {
    const tiles: { x: number; y: number; kind: HlKind }[] = [];
    const L = legal();
    if (myTurn() && sel?.kind === 'card') {
      const uid = sel.uid;
      const c = card(S.players[ME].hand.find(r => r.uid === uid)!.card);
      const acts = L.filter(a => 'card' in a && a.card === uid);
      const seen = new Set<string>();
      for (const a of acts) {
        let x = -1, y = -1;
        if (a.k === 'summon' || a.k === 'trap' || a.k === 'terrain') { x = a.x; y = a.y; }
        else if (a.k === 'stack' || a.k === 'gear') { const st = stackById(S, a.stack)!; x = st.x; y = st.y; }
        else if (a.k === 'spell' && a.x !== undefined) {
          if (c.target === 'column') { for (let yy = 0; yy < 5; yy++) if (!seen.has(a.x + ',' + yy)) { seen.add(a.x + ',' + yy); tiles.push({ x: a.x, y: yy, kind: hoverTile?.x === a.x ? 'area' : 'target' }); } continue; }
          x = a.x; y = a.y!;
        }
        if (x < 0 || seen.has(x + ',' + y)) continue;
        seen.add(x + ',' + y);
        tiles.push({ x, y, kind: a.k === 'summon' || a.k === 'stack' ? 'summon' : 'target' });
      }
    } else if (myTurn() && sel?.kind === 'stack') {
      const st = stackById(S, sel.id);
      if (st) {
        tiles.push({ x: st.x, y: st.y, kind: 'select' });
        if (st.ap > 0) {
          for (const [x, y] of moveTiles(S, st)) tiles.push({ x, y, kind: 'move' });
          const opts = attackOptions(S, st);
          const hov = hoverTile && opts.find(o => !o.player && (o.x === hoverTile!.x && o.y === hoverTile!.y || o.tiles.some(([tx, ty]) => tx === hoverTile!.x && ty === hoverTile!.y)));
          for (const o of opts) if (!o.player) for (const hh of o.hits) { const t = stackById(S, hh.stack); if (t) tiles.push({ x: t.x, y: t.y, kind: 'attack' }); }
          if (hov) for (const [x, y] of hov.tiles) tiles.push({ x, y, kind: 'area' });
          showAttackPreview(st, hov || null);
        }
      }
    }
    if (hoverTile && myTurn()) tiles.push({ ...hoverTile, kind: 'hover' });
    view.highlight(tiles);
    view.selected = sel?.kind === 'stack' ? sel.id : null;
  }

  function showAttackPreview(st: Stack, o: AttackOption | null) {
    if (!o) { if (sel?.kind === 'stack') hint(st.ap > 0 ? 'Pale tiles: move. Red tiles: attack. Use Turn to face a new way.' : 'This stack is done for the turn.'); return; }
    const parts = o.hits.map(hh => { const t = stackById(S, hh.stack)!; const d = attackDamage(S, st, t, hh.half); return `${card(lead(t).card).name} ${d.final}${d.facing !== 'front' ? ` (${d.facing} ×${d.facing === 'back' ? 2 : 1.5})` : ''}${d.adv ? ' +type' : ''}`; });
    hint('Attack: ' + parts.join(', '));
  }

  function hint(t: string | null) { hintEl.style.display = t ? '' : 'none'; if (t) hintEl.textContent = t; }

  // ---------------- action bar for a selected stack
  function renderActbar() {
    if (!(myTurn() && sel?.kind === 'stack')) { actbar.style.display = 'none'; return; }
    const st = stackById(S, sel.id);
    if (!st) { actbar.style.display = 'none'; return; }
    const L = legal();
    const canTurn = L.some(a => a.k === 'turn' && a.stack === st.id);
    const direct = L.find(a => a.k === 'attack' && a.stack === st.id && a.player);
    const fuse = L.find(a => a.k === 'fuse' && a.stack === st.id);
    const f = fuseTarget(S, st);
    actbar.style.display = '';
    fill(actbar, 
      h('span', { class: 'apinfo' }, `${card(lead(st).card).name} · ${st.ap} action${st.ap === 1 ? '' : 's'}`),
      h('button', { class: 'btn small', disabled: !canTurn, onclick: () => openPicker(st.x, st.y, d => act({ k: 'turn', stack: st.id, dir: d }), st.dir) }, h('span', { html: ICON.turn }), 'Turn'),
      direct ? h('button', { class: 'btn small red', onclick: () => act(direct) }, h('span', { html: ICON.sword }), `Hit ${cfg.foeName.split(' ')[0]} for ${mods(S, st).power}`) : null,
      f ? h('button', { class: 'btn small plum', disabled: !fuse, title: fuse ? '' : `Needs ${f.cost} energy`, onclick: () => fuse && act(fuse) }, h('span', { html: ICON.fuse }), `Fuse → ${card(f.card.card).name} (${f.cost})`) : null,
      h('button', { class: 'btn small paper', onclick: clearSel, html: ICON.close }));
  }

  // ---------------- facing picker (DOM arrows around a tile)
  function openPicker(x: number, y: number, done: (d: Dir) => void, exclude?: Dir) {
    closePicker();
    const c = stage.toScreen(tileWorld(x, y).setY(0.2));
    picker = h('div', { class: 'facing-pick', style: { left: c.x + 'px', top: c.y + 'px' } });
    for (const d of [0, 1, 2, 3] as Dir[]) {
      if (d === exclude) continue;
      const [dx, dy] = DIRV[d];
      const n = stage.toScreen(tileWorld(x + dx * 0.62, y + dy * 0.62).setY(0.2));
      const ang = Math.atan2(n.y - c.y, n.x - c.x);
      const b = h('button', { style: { left: (n.x - c.x) * 1.25 + 'px', top: (n.y - c.y) * 1.25 + 'px' }, title: ['North', 'East', 'South', 'West'][d], html: `<svg class="ic" viewBox="0 0 24 24" style="transform:rotate(${ang}rad)"><path d="M4 12h12M12 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>` });
      b.addEventListener('click', e => { e.stopPropagation(); sfx.click(); closePicker(); done(d); });
      picker.appendChild(b);
    }
    const cancel = h('button', { class: 'cancel', style: { left: '0px', top: '0px' }, html: ICON.close });
    cancel.addEventListener('click', e => { e.stopPropagation(); closePicker(); });
    picker.appendChild(cancel);
    hud.appendChild(picker);
  }
  function closePicker() { picker?.remove(); picker = null; }
  function clearSel() { sel = null; closePicker(); hint(null); renderHud(); }

  // ---------------- clicks
  function clickCard(uid: number) {
    if (!myTurn()) return;
    closePicker();
    const ref = S.players[ME].hand.find(r => r.uid === uid);
    if (!ref) return;
    const c = card(ref.card);
    const acts = legal().filter(a => 'card' in a && a.card === uid);
    if (sel?.kind === 'card' && sel.uid === uid) {
      if (c.kind === 'spell' && c.target === 'none' && acts.length) { act(acts[0]); return; }
      clearSel(); return;
    }
    if (!acts.length) {
      sfx.error();
      const cost = c.kind === 'creature' ? Math.min(c.cost, playCost(c.id, true)) : c.cost;
      toast(cost > S.players[ME].energy ? `Needs ${cost} energy.` : c.kind === 'gear' ? 'You need a stack to equip.' : c.kind === 'trap' ? 'No room for traps.' : 'No valid targets.');
      return;
    }
    sel = { kind: 'card', uid };
    sfx.card();
    hint(c.kind === 'creature' ? 'Gold tiles: summon here, or play it onto one of your stacks for 1 less.' :
      c.kind === 'spell' ? (c.target === 'none' ? 'Click the card again to play it.' : c.target === 'column' ? 'Pick a column.' : 'Pick a target.') :
      c.kind === 'trap' ? (c.trigger === 'enter' ? 'Hide it on an empty tile. The enemy can\'t see it.' : 'Hide it under one of your stacks.') :
      c.kind === 'terrain' ? 'Pick a tile to change.' : 'Pick one of your stacks to equip.');
    renderHud();
  }

  function clickTile(t: { x: number; y: number } | null) {
    if (!myTurn()) return;
    closePicker();
    if (!t) { if (sel) clearSel(); return; }
    const L = legal();
    if (sel?.kind === 'card') {
      const uid = sel.uid;
      const c = card(S.players[ME].hand.find(r => r.uid === uid)!.card);
      const here = stackAt(S, t.x, t.y);
      const acts = L.filter(a => 'card' in a && a.card === uid);
      if (c.kind === 'creature') {
        const stackAct = here && acts.find(a => a.k === 'stack' && a.stack === here.id);
        if (stackAct) { act(stackAct); return; }
        const sums = acts.filter(a => a.k === 'summon' && a.x === t.x && a.y === t.y);
        if (sums.length) { openPicker(t.x, t.y, d => act({ k: 'summon', card: uid, x: t.x, y: t.y, dir: d })); hint('Which way should it face?'); return; }
      } else if (c.kind === 'spell') {
        const matches = acts.filter(a => a.k === 'spell' && a.x === t.x && (c.target === 'column' || a.y === t.y));
        if (matches.length === 1) { act(matches[0]); return; }
        if (matches.length > 1) { const valid = new Set(matches.map(m => (m as { dir?: Dir }).dir)); openPicker(t.x, t.y, d => { if (valid.has(d)) act({ k: 'spell', card: uid, x: t.x, y: t.y, dir: d }); }); hint(c.fx?.t === 'push' ? 'Push it which way?' : 'Turn it to face…'); return; }
      } else {
        const m = acts.find(a => (a.k === 'trap' || a.k === 'terrain') ? a.x === t.x && a.y === t.y : a.k === 'gear' && here && a.stack === here.id);
        if (m) { act(m); return; }
      }
      // clicked something else: maybe select a stack
      sel = null;
    }
    if (sel?.kind === 'stack') {
      const st = stackById(S, sel.id);
      if (st) {
        const mv = L.find(a => a.k === 'move' && a.stack === st.id && a.x === t.x && a.y === t.y);
        if (mv) { act(mv); return; }
        const opts = attackOptions(S, st);
        const o = opts.find(o => !o.player && o.x === t.x && o.y === t.y) || opts.find(o => !o.player && o.tiles.some(([tx, ty]) => tx === t.x && ty === t.y) && o.hits.length);
        const atk = o && L.find(a => a.k === 'attack' && a.stack === st.id && a.x === o.x && a.y === o.y);
        if (atk) { act(atk); return; }
      }
    }
    const here = stackAt(S, t.x, t.y);
    if (here && here.owner === ME) { sel = { kind: 'stack', id: here.id }; sfx.click(); renderHud(); return; }
    if (sel) clearSel();
    if (here) showStackInfo(here);
  }

  function showEvo() {
    const P0 = S.players[ME];
    modal(h('div', {}, h('h2', {}, 'Your Evolution pile'), h('p', { class: 'muted' }, 'Fuse the top two creatures of a stack (same family and stage) to call one of these.'),
      h('div', { class: 'grid', style: { '--cw': '150px' } }, P0.evo.map(r => renderCard(r.card, { w: 150, onClick: () => inspectModal(r.card) })))));
  }

  // ---------------- applying actions + playback
  async function act(a: Action) {
    if (!myTurn()) return;
    closePicker();
    hint(null);
    const keepStack = sel?.kind === 'stack' && (a.k === 'move' || a.k === 'turn' || a.k === 'fuse') ? sel.id : null;
    sel = null;
    try { await perform(a); } catch (e) { console.error(e); sfx.error(); toast('That move isn\'t allowed.'); }
    if (keepStack && stackById(S, keepStack) && stackById(S, keepStack)!.ap > 0 && !over) sel = { kind: 'stack', id: keepStack };
    if (!over) renderHud();
  }

  async function perform(a: Action) {
    busy = true;
    renderHud();
    const r = apply(S, a);
    await playEvents(r.events, r.state);
    S = r.state;
    view.sync(S);
    busy = false;
    if (S.winner !== null) return finish();
  }

  async function playEvents(evs: Ev[], after: GameState) {
    const drawn = new Set<number>();
    for (const ev of evs) {
      logEvent(ev, after);
      if (ev.e === 'draw' && ev.p === ME) { drawn.add(ev.uid); sfx.draw(); }
      if (ev.e === 'turn') {
        S = { ...S, active: ev.p };
        banner(ev.p === ME ? 'Your Turn' : `${cfg.foeName}'s Turn`);
        if (ev.p === ME) sfx.turnStart();
        await wait(500);
      }
      if (ev.e === 'playerHit' || ev.e === 'fatigue' || ev.e === 'storm') {
        const P0 = S.players[ev.p];
        S = { ...S, players: S.players.map((pp, i) => i === ev.p ? { ...pp, life: P0.life - ev.n } : pp) as GameState['players'] };
        plaque(ev.p === ME ? mePlaque : foePlaque, ev.p);
      }
      if (ev.e === 'spell' && ev.p === AI) castShow(ev.card);
      if (ev.e === 'trapSet' && ev.p === AI) toast(`${cfg.foeName} hid a trap somewhere…`);
      if (ev.e === 'trap') toast(`Trap! ${card(ev.card).name}`);
      await view.play(ev, after);
    }
    if (drawn.size) { S = after; renderHand(drawn); }
  }

  function castShow(id: string) {
    const el = renderCard(id, { w: 200 });
    el.style.cssText += ';position:absolute;left:50%;top:40%;transform:translate(-50%,-50%) scale(.6);opacity:0;transition:all .35s cubic-bezier(.3,1.4,.5,1);pointer-events:none;z-index:9';
    hud.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translate(-50%,-50%) scale(1)'; });
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translate(-50%,-80%) scale(.8)'; }, 1100 / animCfg.speed);
    setTimeout(() => el.remove(), 1600 / animCfg.speed);
  }

  function banner(t: string) {
    const b = h('div', { class: 'banner' }, h('div', { class: 'label' }, t));
    hud.appendChild(b);
    setTimeout(() => b.remove(), 1600);
  }

  function logEvent(ev: Ev, after: GameState) {
    const who = (p: PlayerId) => (p === ME ? 'You' : cfg.foeName);
    const nm = (id: number) => { const st = stackById(after, id) || stackById(S, id); return st ? card(lead(st).card).name : 'a stack'; };
    const push = (t: string, p: PlayerId | -1) => log.push({ t, p });
    switch (ev.e) {
      case 'turn': push(`— Turn ${ev.turn}: ${who(ev.p)} —`, -1); break;
      case 'summon': push(`${who(ev.p)} summoned ${card(ev.card).name}`, ev.p); break;
      case 'stackOn': push(`${who(ev.p)} stacked ${card(ev.card).name}`, ev.p); break;
      case 'fuse': push(`${who(ev.p)} fused ${card(ev.card).name}!`, ev.p); break;
      case 'spell': push(`${who(ev.p)} cast ${card(ev.card).name}`, ev.p); break;
      case 'trapSet': if (ev.p === ME) push(`You hid ${card(ev.card).name}`, ME); else push(`${who(ev.p)} hid a trap`, AI); break;
      case 'trap': push(`Trap sprung: ${card(ev.card).name}`, ev.p); break;
      case 'terrain': push(`Tile became ${ev.elem}`, -1); break;
      case 'hit': if (!ev.spill) push(`${nm(ev.stack)} took ${ev.n}${ev.facing && ev.facing !== 'front' ? ` (${ev.facing})` : ''}`, -1); else push(`…${ev.n} spilled down`, -1); break;
      case 'ko': push(`${card(ev.card).name} fell`, -1); break;
      case 'topple': push(`A stack toppled`, ev.owner); break;
      case 'playerHit': push(`${who(ev.p)} lost ${ev.n} Life`, ev.p); break;
      case 'fatigue': push(`${who(ev.p)} is out of cards: -${ev.n} Life`, ev.p); break;
      case 'storm': push(`Dust storm! ${who(ev.p)} lose${ev.p === ME ? '' : 's'} ${ev.n} Life`, ev.p); break;
      case 'freeze': push(`${nm(ev.stack)} is stuck in glue`, -1); break;
      case 'burn': push(`${who(ev.p)}'s hand is full: ${card(ev.card).name} burned`, ev.p); break;
    }
  }

  // ---------------- turns
  async function endTurn() {
    if (!myTurn()) return;
    sel = null; closePicker(); hint(null);
    await perform({ k: 'end' });
    if (!over) await aiTurn();
  }

  async function aiTurn() {
    let guard = 0;
    const banned: string[] = [];
    renderHud();
    while (!over && S.winner === null && S.active === AI) {
      busy = true;
      renderHud();
      const [a] = await Promise.all([aiChoose(viewFor(S, AI), { level: cfg.ai, seed: S.rng ^ 0x5eed, banned }), wait(cfg.ai === 0 ? 450 : 300)]);
      if (over) return;
      let action = a;
      if (++guard > 40) action = { k: 'end' };
      const ok = legalActions(S).some(l => actionKey(l) === actionKey(action));
      if (!ok) { banned.push(actionKey(action)); if (banned.length > 5) action = { k: 'end' }; else continue; }
      busy = false;
      busy = true;
      const r = apply(S, action);
      if (action.k !== 'end') {
        const focus = 'stack' in action ? stackById(S, action.stack) : undefined;
        void focus;
      }
      await playEvents(r.events, r.state);
      S = r.state;
      view.sync(S);
      busy = false;
      if (S.winner !== null) return finish();
      if (action.k !== 'end') await wait(160);
    }
    busy = false;
    renderHud();
  }

  // ---------------- tutorial coach
  const COACH: { when: () => boolean; text: string; done?: () => boolean }[] = [
    { when: () => true, done: () => S.stacks.some(s => s.owner === ME), text: '<b>Hi, I\'m Tock!</b> Your cards are at the bottom. Click a <b>creature</b>, then a <b>gold tile</b> to summon it. You pick which way it faces.' },
    { when: () => S.stacks.some(s => s.owner === ME), done: () => S.players[ME].turns >= 2, text: 'New toys rest for a turn. Spend your energy, then press <b>End Turn</b>.' },
    { when: () => S.players[ME].turns >= 2 && S.stacks.some(s => s.owner === ME && s.ap > 0), done: () => S.stacks.some(s => s.owner === ME && s.ap < mods(S, s).actions && s.ap >= 0 && s.y > 1), text: 'Click one of your stacks. <b>Pale</b> tiles are moves, <b>red</b> tiles are attacks. Each stack gets 2 actions.' },
    { when: () => S.stacks.some(s => s.owner === AI) && S.players[ME].turns >= 2, text: 'See the arrow on each base? Hit from the <b>side for ×1.5</b> or from <b>behind for ×2</b>. Use <b>Turn</b> to face a new way.' },
    { when: () => S.players[ME].turns >= 3 && S.stacks.some(s => s.owner === ME && s.units.length < 3) && S.players[ME].hand.some(r => card(r.card).kind === 'creature'), text: 'Play a creature <b>onto your own stack</b>: it costs 1 less, and the toy underneath powers it up.' },
    { when: () => S.stacks.some(s => s.owner === ME && !!fuseTarget(S, s)), text: 'Two of a family on top? Hit <b>Fuse</b> to evolve them into something bigger!' },
    { when: () => S.stacks.some(s => s.owner === ME && s.y === 4), text: 'You\'re on their back row! Attack their <b>Life</b> directly from here.' },
  ];
  function coach() {
    if (coachStep < 0 || over || S.active !== ME) { coachEl.style.display = 'none'; return; }
    COACH.forEach((c, k) => { if (c.done?.()) coachSeen.add(k); });
    const i = COACH.findIndex((c, k) => !coachSeen.has(k) && c.when());
    if (i < 0) { coachEl.style.display = 'none'; return; }
    coachEl.style.display = '';
    coachEl.replaceChildren(
      h('div', { class: 'owl' }, h('img', { class: 'px', src: cardArt('kaleidowl') })),
      h('div', { class: 'bubble paper' }, h('div', { html: COACH[i].text }), h('div', { class: 'next' }, h('button', { class: 'btn small', onclick: () => { coachSeen.add(i); coach(); } }, 'Got it'))));
  }

  // ---------------- pause / finish
  function pauseMenu() {
    const m = modal(h('div', { style: { display: 'grid', gap: '12px', minWidth: '280px' } },
      h('h2', {}, 'Paused'),
      h('button', { class: 'btn green', onclick: () => m.close() }, 'Resume'),
      h('button', { class: 'btn paper', onclick: () => { m.close(); rulesModal(); } }, 'How to Play'),
      h('button', { class: 'btn paper', onclick: () => { m.close(); settingsModal(); } }, 'Settings'),
      h('button', { class: 'btn red', onclick: async () => { m.close(); if (await confirmBox('Give up?', 'This counts as a loss.', 'Give up', true)) { S = { ...S, winner: AI }; finish(true); } } }, 'Give up')));
  }

  async function finish(forfeit = false) {
    if (over) return;
    over = true;
    busy = false;
    view.clearHighlights();
    hint(null); actbar.style.display = 'none'; coachEl.style.display = 'none';
    turnFlag.style.display = 'none'; endBtn.disabled = true; endBtn.classList.remove('ready'); closePicker();
    const won = S.winner === ME;
    const o = cfg.opponent;
    const first = !!o && won && !P.cleared[o.id];
    let reward = won ? winReward(o, first, cfg.quickLevel) : 10;
    const cards: string[] = [];
    if (won) {
      P.stats.wins++;
      if (o) {
        P.cleared[o.id] = (P.cleared[o.id] || 0) + 1;
        if (first) for (const c of o.rewardCards) { addCard(c); cards.push(c); }
        arcadeScore(clearedCount(), { zone: o.zone, duel: o.index, boss: o.boss });
      }
    } else P.stats.losses++;
    P.stats.duels++;
    if (cfg.tutorial) P.tutorial = true;
    P.buttons += reward;
    save();
    await wait(forfeit ? 0 : 700);
    won ? sfx.win() : sfx.lose();
    if (!forfeit && won) stage.flash(1, 0.95, 0.8, 0.3, 600);
    const nextZoneUnlocked = o?.boss && first && o.zone < 7;
    modal(h('div', { class: 'result' },
      h('div', { class: 'stamp' + (won ? ' win' : '') }, won ? 'VICTORY' : S.winner === 'draw' ? 'DRAW' : 'DEFEAT'),
      h('p', { style: { fontSize: '18px', margin: '6px 0' } }, won ? (o ? `${o.name} is beaten.` : 'Nicely played.') : forfeit ? 'You gave up this one.' : `${cfg.foeName} wins this time.`),
      h('div', { class: 'coin' }, h('span', { html: ICON.button }), `+${reward} Buttons`),
      cards.length ? h('div', {}, h('p', { style: { fontWeight: '800' } }, 'Boss reward'), h('div', { class: 'rewards' }, cards.map(c => renderCard(c, { w: 120, isNew: true })))) : null,
      nextZoneUnlocked ? h('p', { style: { fontWeight: '800', color: 'var(--green2)' } }, `New zone unlocked: ${ZONES[o!.zone + 1].name}!`) : null,
      h('div', { class: 'actions', style: { justifyContent: 'center' } },
        h('button', { class: 'btn paper', onclick: () => { document.querySelector('.modal-bg')?.remove(); o ? startCampaignDuel(o) : startQuickDuel((cfg.quickLevel ?? 1) as 0 | 1 | 2 | 3); } }, 'Rematch'),
        h('button', { class: 'btn green', onclick: () => { document.querySelector('.modal-bg')?.remove(); o ? campaignScreen() : titleScreen(); } }, 'Continue'))), { closable: false });
  }

  const autoTurn = async () => {
    const { chooseAction } = await import('../engine/ai');
    let n = 0;
    while (S.active === ME && !over && n++ < 40) {
      while (busy) await new Promise(r => setTimeout(r, 50));
      const a = chooseAction(viewFor(S, ME), { level: 2, seed: S.turn });
      if (a.k === 'end') break;
      await act(a);
    }
    if (!over && S.active === ME) await endTurn();
  };
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).SB = { get S() { return S; }, get over() { return over; }, act, endTurn, clickTile, clickCard, view, animCfg, autoTurn };

  // ---------------- start
  (async () => {
    busy = true;
    view.sync({ ...S, stacks: [] });
    renderHud();
    for (const ev of startEvents) logEvent(ev, S);
    banner(first === ME ? 'You go first' : `${cfg.foeName} goes first`);
    sfx.turnStart();
    await wait(900);
    view.sync(S);
    busy = false;
    renderHud(new Set(S.players[ME].hand.map(r => r.uid)));
    if (S.active === AI) await aiTurn();
  })();
}

void THREE;
