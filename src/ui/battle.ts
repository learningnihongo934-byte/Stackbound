// Battle controller: input (click + drag), HUD, AI or PvP driver, event playback with slam-downs,
// announcer, opponent taunts, board-event warnings, tutorial coach and results.
import { card, SKILLS } from '../engine/cards';
import { STARTERS, themedDeck } from '../engine/decks';
import {
  actionKey, apply, attackDamage, attackOptions, DIRV, fuseTarget, lead, legalActions, mods, moveTiles, newMatch, other, playCost, stackAt, stackById, viewFor,
} from '../engine/rules';
import type { Action, AttackOption, Dir, Elem, Ev, GameState, PlayerId, Stack } from '../engine/types';
import type { AiOpts } from '../engine/ai';
import { setIntensity, sfx } from '../game/audio';
import { arcadeScore } from '../game/arcade';
import { ARENA_IDS, ARENA_NAME, ZONE_ARENA, eventName, eventText, type ArenaId } from '../game/arena-info';
import { clearedCount, opponentDeck, winReward, ZONES, type Opponent } from '../game/campaign';
import type { NetClient, ServerMsg } from '../game/net';
import { activeDeck, addCard, canPlayDeck, deckList, P, save } from '../game/profile';
import { line, type Mood } from '../game/taunts';
import { say } from '../game/voice';
import { animCfg, wait } from '../render/anim';
import { BattleView, type HlKind } from '../render/battleview';
import { tileWorld } from '../render/stage';
import { go, onLeave, stage } from './app';
import { cardArt, cardBack, holo, renderCard } from './cardview';
import { confirmBox, fill, h, modal, toast, $ } from './dom';
import { ICON } from './icons';
import { campaignScreen, decksScreen, inspectModal, rulesModal, settingsModal, titleScreen } from './screens';

interface NetStart { seat: PlayerId; names: (string | null)[]; events: Ev[]; state: GameState; deadline: number; left?: number }
interface BattleCfg {
  foeName: string; foeTitle: string; foePortrait: string; foeDeck?: ReturnType<typeof themedDeck>; foeLife: number; ai: 0 | 1 | 2 | 3;
  opponent: Opponent | null; quickLevel?: number; tutorial: boolean; arena: ArenaId;
  net?: NetClient; netStart?: NetStart;
}

export function startCampaignDuel(o: Opponent) {
  const deck = canPlayDeck();
  if (!deck) { toast('Your active deck isn\'t ready. Fix it in Decks.'); decksScreen(); return; }
  runBattle({ foeName: o.name, foeTitle: o.title, foePortrait: o.portrait, foeDeck: opponentDeck(o), foeLife: o.life, ai: o.ai, opponent: o, tutorial: !P.tutorial && o.id === '0-0', arena: ZONE_ARENA[o.zone] });
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
  runBattle({ foeName: names[k], foeTitle: ['Easy', 'Normal', 'Hard', 'Expert'][level] + ' opponent', foePortrait: portraits[k], foeDeck: themedDeck(elems, seed, Math.min(2, level)), foeLife: 20, ai: level, opponent: null, quickLevel: level, tutorial: false, arena: ARENA_IDS[seed % ARENA_IDS.length] });
}
export function startPvp(net: NetClient, start: NetStart) {
  const foe = start.names[1 - start.seat] || 'Friend';
  let hsh = 0;
  for (const ch of net.code) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
  runBattle({ foeName: foe, foeTitle: `Room ${net.code}`, foePortrait: 'dominoknight', foeLife: 20, ai: 0, opponent: null, tutorial: false, arena: ARENA_IDS[hsh % ARENA_IDS.length], net, netStart: start });
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

type Sel = { kind: 'card'; uid: number } | { kind: 'stack'; id: number } | { kind: 'skill'; id: number } | null;

// ---------------------------------------------------------------- the battle
function runBattle(cfg: BattleCfg) {
  const net = cfg.net;
  const ME: PlayerId = cfg.netStart ? cfg.netStart.seat : 0;
  const AI: PlayerId = other(ME);
  const deck = activeDeck()!;
  const seed = Math.floor(Math.random() * 1e9);
  const first: PlayerId = cfg.tutorial ? 0 : (seed % 2) as PlayerId;
  let S: GameState, startEvents: Ev[];
  if (cfg.netStart) { S = cfg.netStart.state; startEvents = cfg.netStart.events; }
  else ({ state: S, events: startEvents } = newMatch({ seed, decks: [deckList(deck), cfg.foeDeck!], names: ['You', cfg.foeName], first, life: [20, cfg.foeLife] }));
  const localDeadline = (m: { deadline: number; left?: number }) => (m.left !== undefined ? Date.now() + m.left : m.deadline);
  let deadline = cfg.netStart ? localDeadline(cfg.netStart) : 0;
  let view: BattleView;
  let busy = false;
  let over = false;
  let sel: Sel = null;
  let picker: HTMLElement | null = null;
  let hoverTile: { x: number; y: number } | null = null;
  const log: { t: string; p: PlayerId | -1 }[] = [];
  const coachSeen = new Set<number>();
  const oppId = cfg.opponent?.id;
  let saidTen = false;
  let desperateSaid = false;
  let pendingKeep: number | null = null;
  const lastRects = new Map<number, DOMRect>();

  // ---------------- HUD skeleton
  const hud = h('div', { class: 'hud' });
  const foePlaque = h('div', { class: 'plaque foe' });
  const mePlaque = h('div', { class: 'plaque me' });
  const handEl = h('div', { class: 'hand' });
  handEl.addEventListener('dragstart', e => e.preventDefault());
  const foeHandEl = h('div', { class: 'foehand' });
  const turnFlag = h('div', { class: 'turnflag label' });
  const eventPlate = h('div', { class: 'eventplate paper' });
  const tauntEl = h('div', { class: 'taunt paper', style: { display: 'none' } });
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
  hud.append(foePlaque, mePlaque, turnFlag, eventPlate, tauntEl, foeHandEl, side, logEl, infoEl, actbar, handEl, hintEl, coachEl);

  go(() => h('div', { class: 'screen battle-screen', style: { animation: 'none' } }, hud), { mode: 'board', music: cfg.opponent?.boss ? 'boss' : 'battle' });
  stage.setArena(cfg.arena);
  view = new BattleView(stage, $('#labels'), ME);
  const portrait = window.innerWidth < 900;
  stage.setViewShift(portrait ? 60 : Math.round(window.innerHeight * 0.1));
  stage.azStep = ME === 1 ? 2 : 0;
  stage.rotateView(0);

  // ---------------- input on the canvas
  const canvas = stage.renderer.domElement;
  let downAt = { x: 0, y: 0 };
  const onDown = (e: PointerEvent) => { downAt = { x: e.clientX, y: e.clientY }; };
  const onUp = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 10) return;
    clickTile(stage.pick(e.clientX, e.clientY));
  };
  const onMove = (e: PointerEvent) => setHover(stage.pick(e.clientX, e.clientY));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'q' || e.key === 'Q') stage.rotateView(-1);
    else if (e.key === 'e' || e.key === 'E') stage.rotateView(1);
    else if (e.key === 'Escape') {
      const open = document.querySelector('.modal-bg');
      if (open) { if (!over) open.remove(); }
      else if (sel || picker) clearSel();
      else if (!over) pauseMenu();
    } else if (e.key === ' ' || e.key === 'Enter') { if (document.activeElement === document.body) { e.preventDefault(); endTurn(); } }
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointermove', onMove);
  window.addEventListener('keydown', onKey);
  const timer = window.setInterval(tickTimer, 250);
  const offNet = net?.on(onNet);
  onLeave(() => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointermove', onMove);
    window.removeEventListener('keydown', onKey);
    clearInterval(timer);
    offNet?.();
    if (net) net.close();
    view.dispose();
    stage.setArena('attic');
    over = true;
  });

  function setHover(t: { x: number; y: number } | null) {
    if (t?.x === hoverTile?.x && t?.y === hoverTile?.y) return;
    hoverTile = t;
    refreshHighlights();
    showStackInfo(t ? stackAt(S, t.x, t.y) : undefined);
    view.lookAt(t);
  }

  // ---------------- helpers
  const myTurn = () => S.active === ME && !busy && !over;
  let legalMemo: { s: GameState; acts: Action[] } | null = null;
  const legal = (): Action[] => {
    if (S.active !== ME || S.winner !== null) return [];
    if (legalMemo?.s !== S) legalMemo = { s: S, acts: legalActions(S) };
    return legalMemo.acts;
  };
  const foeLabel = () => cfg.foeName;

  function plaque(el: HTMLElement, p: PlayerId) {
    const P0 = S.players[p];
    const lifeEl = el.querySelector('.life') as HTMLElement | null;
    const prevLife = lifeEl ? +lifeEl.textContent! : P0.life;
    const por = p === ME ? (STARTERS.find(s => s.id === P.starter)?.hero || 'matchpup') : cfg.foePortrait;
    el.replaceChildren(
      h('div', { class: 'por' }, h('img', { class: 'px', src: cardArt(por) })),
      h('div', {},
        h('div', { class: 'nm' }, p === ME ? 'You' : foeLabel()),
        h('div', { class: 'tt' }, p === ME ? deck.name : cfg.foeTitle),
        h('div', { class: 'row' },
          h('span', { title: 'Cards in hand', html: ICON.hand + ' ' + P0.hand.length }),
          h('span', { title: 'Cards left in deck', html: ICON.deck + ' ' + P0.deck.length }),
          h('span', { title: 'Evolution pile', html: ICON.fuse + ' ' + P0.evo.length, style: p === ME ? 'cursor:pointer' : '', onclick: p === ME ? showEvo : undefined } as Record<string, unknown>)),
        h('div', { class: 'energy', title: `Energy ${P0.energy}/${P0.maxEnergy}` }, Array.from({ length: Math.max(P0.maxEnergy, P0.energy) }, (_, i) => h('i', { class: (i < P0.energy ? 'on' : '') + (i >= P0.maxEnergy ? ' bonus' : '') })))),
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
      el.dataset.uid = String(ref.uid);
      const rot = (i - (n - 1) / 2) * Math.min(5, 34 / Math.max(1, n));
      el.style.setProperty('--rot', rot + 'deg');
      el.style.transform = `rotate(${rot}deg) translateY(${Math.abs(rot) * 1.6}px)`;
      el.style.marginLeft = el.style.marginRight = marg + 'px';
      holo(el);
      el.addEventListener('click', () => { if (!dragged) clickCard(ref.uid); });
      el.addEventListener('contextmenu', e => { e.preventDefault(); inspectModal(ref.card); });
      el.addEventListener('mouseenter', () => sfx.hover());
      el.addEventListener('pointerdown', e => startDrag(e, ref.uid, el));
      return el;
    }));
    foeHandEl.replaceChildren(...S.players[AI].hand.map(() => cardBack(46)));
  }

  function renderEventPlate() {
    const e = S.event;
    if (!e || over) { eventPlate.style.display = 'none'; view.setWarnings([]); return; }
    const left = e.turn - S.turn;
    eventPlate.style.display = '';
    eventPlate.classList.toggle('soon', left <= 1);
    fill(eventPlate,
      h('div', { class: 'ev-h' }, h('b', {}, eventName(e, cfg.arena)), h('span', {}, left <= 0 ? 'now' : left === 1 ? 'next turn' : `in ${left} turns`)),
      h('div', { class: 'ev-t' }, eventText(e, ME)));
    view.setWarnings(e.kind === 'paw' && left <= 2 ? [0, 1, 2, 3, 4].map(x => ({ x, y: e.row! })) : []);
  }

  function renderHud(drawn?: Set<number>) {
    plaque(foePlaque, AI);
    plaque(mePlaque, ME);
    renderHand(drawn);
    tickTimer();
    endBtn.disabled = !myTurn();
    const anything = legal().some(a => a.k !== 'end' && a.k !== 'turn' && !(a.k === 'skill' && SKILLS[card(lead(stackById(S, a.stack)!).card).skill!].ap === 0));
    endBtn.classList.toggle('ready', myTurn() && !anything);
    logEl.replaceChildren(...log.slice(-40).map(l => h('div', { class: l.p === ME ? 'p0' : l.p === AI ? 'p1' : '' }, l.t)));
    logEl.scrollTop = 1e6;
    renderEventPlate();
    refreshHighlights();
    renderActbar();
    coach();
    const lowest = Math.min(S.players[0].life, S.players[1].life);
    setIntensity(Math.max(0, 1 - lowest / 20) * 0.85 + Math.min(0.3, S.turn / 80));
  }

  function tickTimer() {
    if (over) { turnFlag.style.display = 'none'; return; }
    let txt = S.active === ME ? `Your turn · ${S.players[ME].energy} energy` : net ? `${foeLabel()}'s turn` : `${foeLabel()} is thinking…`;
    let urgent = false;
    if (net && deadline) {
      const secs = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      txt += ` · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
      urgent = secs <= 15 && S.active === ME;
      if (secs <= 10 && S.active === ME && !saidTen) { saidTen = true; say('tenseconds'); }
    }
    if (turnFlag.textContent !== txt) turnFlag.textContent = txt;
    turnFlag.className = 'turnflag label' + (S.active === ME ? '' : ' theirs') + (urgent ? ' urgent' : '');
  }

  function showStackInfo(st?: Stack) {
    if (!st || window.innerWidth < 900) { infoEl.style.display = 'none'; return; }
    const m = mods(S, st);
    const L = card(lead(st).card);
    const sk = L.skill ? SKILLS[L.skill] : null;
    infoEl.style.display = '';
    fill(infoEl,
      h('h3', {}, (st.owner === ME ? '' : 'Enemy · ') + L.name),
      h('div', { class: 'units' }, st.units.slice().reverse().map(u => renderCard(u.card, { mini: true, w: 66, onClick: () => inspectModal(u.card) }))),
      h('div', { class: 'line' }, h('span', {}, 'Power'), h('span', {}, m.power)),
      h('div', { class: 'line' }, h('span', {}, 'Health'), h('span', {}, st.units.map(u => u.hp).join(' / '))),
      h('div', { class: 'line' }, h('span', {}, 'Attack'), h('span', {}, `${m.shape} · range ${m.range}${m.pierce ? ' · pierce' : ''}`)),
      sk ? h('div', { class: 'line' }, h('span', {}, 'Skill'), h('span', {}, `${sk.name}${sk.energy ? ` (${sk.energy})` : ''}`)) : null,
      m.armor ? h('div', { class: 'line' }, h('span', {}, 'Armor'), h('span', {}, m.armor)) : null,
      m.thorns ? h('div', { class: 'line' }, h('span', {}, 'Thorns'), h('span', {}, m.thorns)) : null,
      m.regen ? h('div', { class: 'line' }, h('span', {}, 'Regen'), h('span', {}, m.regen)) : null,
      m.cushion ? h('div', { class: 'line' }, h('span', {}, 'Cushion'), h('span', {}, m.cushion)) : null,
      m.backGuard ? h('div', { class: 'line' }, h('span', {}, 'Back guard'), h('span', {}, 'yes')) : null,
      h('div', { class: 'line' }, h('span', {}, 'Actions'), h('span', {}, st.owner === S.active ? `${st.ap} left` : `${m.actions} per turn`)),
      st.frozen ? h('div', { class: 'line' }, h('span', {}, 'Frozen'), h('span', {}, 'stuck in glue')) : null);
  }

  // ---------------- highlights
  function refreshHighlights() {
    const tiles: { x: number; y: number; kind: HlKind }[] = [];
    const L = legal();
    if (myTurn() && sel?.kind === 'card') {
      const uid = sel.uid;
      const ref = S.players[ME].hand.find(r => r.uid === uid);
      if (ref) {
        const c = card(ref.card);
        const seen = new Set<string>();
        for (const a of L.filter(a => 'card' in a && a.card === uid)) {
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
      }
    } else if (myTurn() && sel?.kind === 'skill') {
      const st = stackById(S, sel.id);
      if (st) {
        tiles.push({ x: st.x, y: st.y, kind: 'select' });
        for (const a of L) if (a.k === 'skill' && a.stack === st.id && a.x !== undefined) tiles.push({ x: a.x, y: a.y!, kind: 'target' });
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
    view.selected = sel && sel.kind !== 'card' ? sel.id : null;
  }

  function showAttackPreview(st: Stack, o: AttackOption | null) {
    if (!o) { if (sel?.kind === 'stack') hint(st.ap > 0 ? 'Pale tiles: move. Red tiles: attack. Skill and Turn are in the bar below.' : 'This stack is done for the turn.'); return; }
    const parts = o.hits.map(hh => { const t = stackById(S, hh.stack)!; const d = attackDamage(S, st, t, hh.half); return `${card(lead(t).card).name} ${d.final}${d.facing !== 'front' ? ` (${d.facing} ×${d.facing === 'back' ? 2 : 1.5})` : ''}${d.adv ? ' +type' : ''}`; });
    hint('Attack: ' + parts.join(', '));
  }

  function hint(t: string | null) { hintEl.style.display = t ? '' : 'none'; if (t) hintEl.textContent = t; }

  // ---------------- action bar for a selected stack
  function renderActbar() {
    if (!(myTurn() && sel && sel.kind !== 'card')) { actbar.style.display = 'none'; return; }
    const st = stackById(S, sel.id);
    if (!st) { actbar.style.display = 'none'; return; }
    const L = legal();
    const canTurn = L.some(a => a.k === 'turn' && a.stack === st.id);
    const direct = L.find(a => a.k === 'attack' && a.stack === st.id && a.player);
    const fuse = L.find(a => a.k === 'fuse' && a.stack === st.id);
    const f = fuseTarget(S, st);
    const skillId = card(lead(st).card).skill;
    const sk = skillId ? SKILLS[skillId] : null;
    const skillActs = L.filter(a => a.k === 'skill' && a.stack === st.id);
    actbar.style.display = '';
    fill(actbar,
      h('span', { class: 'apinfo' }, `${card(lead(st).card).name} · ${st.ap} action${st.ap === 1 ? '' : 's'}`),
      sk ? h('button', { class: 'btn small blue' + (sel.kind === 'skill' ? ' down' : ''), disabled: !skillActs.length, title: sk.text + (st.skilled ? ' (used this turn)' : ''), onclick: () => useSkill(st) }, h('span', { html: ICON.star }), `${sk.name}${sk.energy ? ` (${sk.energy})` : ''}`) : null,
      h('button', { class: 'btn small', disabled: !canTurn, onclick: () => openPicker(st.x, st.y, d => act({ k: 'turn', stack: st.id, dir: d }), st.dir) }, h('span', { html: ICON.turn }), 'Turn'),
      direct ? h('button', { class: 'btn small red', onclick: () => act(direct) }, h('span', { html: ICON.sword }), `Hit ${foeLabel().split(' ')[0]} for ${mods(S, st).power}`) : null,
      f ? h('button', { class: 'btn small plum', disabled: !fuse, title: fuse ? '' : `Needs ${f.cost} energy`, onclick: () => fuse && act(fuse) }, h('span', { html: ICON.fuse }), `Fuse → ${card(f.card.card).name} (${f.cost})`) : null,
      h('button', { class: 'btn small paper', onclick: clearSel, html: ICON.close }));
  }

  function useSkill(st: Stack) {
    const acts = legal().filter(a => a.k === 'skill' && a.stack === st.id) as Extract<Action, { k: 'skill' }>[];
    if (!acts.length) return;
    const sk = SKILLS[card(lead(st).card).skill!];
    if (acts[0].dir !== undefined) { openPicker(st.x, st.y, d => act({ k: 'skill', stack: st.id, dir: d }), st.dir); hint(`${sk.name}: pick a facing.`); return; }
    if (acts[0].x !== undefined) { sel = { kind: 'skill', id: st.id }; hint(`${sk.name}: ${sk.text} Pick a highlighted tile.`); renderHud(); return; }
    act(acts[0]);
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

  // ---------------- drag a card onto the board
  let dragged = false;
  function startDrag(e: PointerEvent, uid: number, el: HTMLElement) {
    if (e.button !== 0) return;
    dragged = false;
    const sx = e.clientX, sy = e.clientY;
    let ghost: HTMLElement | null = null;
    const move = (ev: PointerEvent) => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 14 || !myTurn()) return;
        if (!legal().some(a => 'card' in a && a.card === uid)) return;
        dragged = true;
        closePicker();
        sel = { kind: 'card', uid };
        sfx.card();
        ghost = el.cloneNode(true) as HTMLElement;
        ghost.className = el.className + ' drag-ghost';
        ghost.style.cssText = `--w:${el.getBoundingClientRect().width}px;position:fixed;left:0;top:0;margin:0;z-index:30;pointer-events:none;`;
        document.body.appendChild(ghost);
        el.style.opacity = '0.25';
        el.classList.add('chosen');
        hint('Drop it on a gold tile, or on one of your stacks.');
        refreshHighlights();
      }
      ghost.style.transform = `translate(${ev.clientX}px, ${ev.clientY}px) translate(-50%, -60%) rotate(-4deg) scale(.85)`;
      setHover(stage.pick(ev.clientX, ev.clientY));
    };
    let done = false;
    const up = (ev: PointerEvent | MouseEvent) => {
      if (done) return;
      done = true;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('pointercancel', cancel);
      if (!ghost) return;
      ghost.remove();
      el.style.opacity = '';
      const t = stage.pick(ev.clientX, ev.clientY);
      if (t) clickTile(t, ev.clientX, ev.clientY); else renderHud();
      setTimeout(() => { dragged = false; }, 0);
    };
    const cancel = () => { if (done) return; done = true; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('mouseup', up); ghost?.remove(); el.style.opacity = ''; dragged = false; renderHud(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('mouseup', up);
    window.addEventListener('pointercancel', cancel);
  }

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
    hint(c.kind === 'creature' ? 'Gold tiles: summon here (or drag the card there), or play it onto one of your stacks for 1 less.' :
      c.kind === 'spell' ? (c.target === 'none' ? 'Click the card again to play it.' : c.target === 'column' ? 'Pick a column.' : 'Pick a target.') :
      c.kind === 'trap' ? (c.trigger === 'enter' ? 'Hide it on an empty tile. The enemy can\'t see it.' : 'Hide it under one of your stacks.') :
      c.kind === 'terrain' ? 'Pick a tile to change.' : 'Pick one of your stacks to equip.');
    renderHud();
  }

  function clickTile(t: { x: number; y: number } | null, _cx?: number, _cy?: number) {
    if (!myTurn()) return;
    closePicker();
    if (!t) { if (sel) clearSel(); return; }
    const L = legal();
    if (sel?.kind === 'card') {
      const uid = sel.uid;
      const ref = S.players[ME].hand.find(r => r.uid === uid);
      if (!ref) { clearSel(); return; }
      const c = card(ref.card);
      const here = stackAt(S, t.x, t.y);
      const acts = L.filter(a => 'card' in a && a.card === uid);
      if (c.kind === 'creature') {
        const stackAct = here && acts.find(a => a.k === 'stack' && a.stack === here.id);
        if (stackAct) { act(stackAct); return; }
        const sums = acts.filter(a => a.k === 'summon' && a.x === t.x && a.y === t.y);
        if (sums.length) { openPicker(t.x, t.y, d => act({ k: 'summon', card: uid, x: t.x, y: t.y, dir: d })); hint('Which way should it face?'); refreshHighlights(); return; }
      } else if (c.kind === 'spell') {
        const matches = acts.filter(a => a.k === 'spell' && a.x === t.x && (c.target === 'column' || a.y === t.y));
        if (matches.length === 1) { act(matches[0]); return; }
        if (matches.length > 1) { const valid = new Set(matches.map(m => (m as { dir?: Dir }).dir)); openPicker(t.x, t.y, d => { if (valid.has(d)) act({ k: 'spell', card: uid, x: t.x, y: t.y, dir: d }); }); hint(c.fx?.t === 'push' ? 'Push it which way?' : 'Turn it to face…'); return; }
      } else {
        const m = acts.find(a => (a.k === 'trap' || a.k === 'terrain') ? a.x === t.x && a.y === t.y : a.k === 'gear' && here && a.stack === here.id);
        if (m) { act(m); return; }
      }
      sel = null;
    }
    if (sel?.kind === 'skill') {
      const id = sel.id;
      const a = L.find(a => a.k === 'skill' && a.stack === id && a.x === t.x && a.y === t.y);
      if (a) { act(a); return; }
      sel = { kind: 'stack', id };
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
    if (here && here.owner === ME) { sel = { kind: 'stack', id: here.id }; sfx.click(); view.poke(here.id); renderHud(); return; }
    if (sel) clearSel();
    if (here) { showStackInfo(here); view.poke(here.id); }
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
    if ('card' in a) { const el = handEl.querySelector(`[data-uid="${a.card}"]`); if (el) lastRects.set(a.card, el.getBoundingClientRect()); }
    const keep = sel && sel.kind !== 'card' && (a.k === 'move' || a.k === 'turn' || a.k === 'fuse' || a.k === 'skill') ? sel.id : null;
    sel = null;
    if (net) {
      if (!net.send(a)) { toast('Reconnecting… try again in a moment.'); renderHud(); return; }
      busy = true; pendingKeep = keep; renderHud(); return;
    }
    try { await perform(a); } catch (e) { console.error(e); sfx.error(); toast('That move isn\'t allowed.'); busy = false; }
    reselect(keep);
    if (!over) renderHud();
  }
  function reselect(keep: number | null) {
    if (keep && !over && S.active === ME) { const st = stackById(S, keep); if (st && st.ap > 0) sel = { kind: 'stack', id: keep }; }
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

  /** Card art flies from the hand (or the enemy's side), grows, and slams onto the tile. */
  function slam(cardId: string, owner: PlayerId, x: number, y: number, uid?: number): Promise<void> {
    if (animCfg.reduceMotion) return Promise.resolve();
    const to = stage.toScreen(tileWorld(x, y).setY(0.3));
    const r = uid !== undefined ? lastRects.get(uid) : undefined;
    const from = r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : owner === ME ? { x: window.innerWidth / 2, y: window.innerHeight + 60 } : { x: window.innerWidth - 160, y: -80 };
    const el = renderCard(cardId, { w: 150 });
    el.classList.add('slammer');
    hud.appendChild(el);
    const dur = 560 / animCfg.speed;
    const anim = el.animate([
      { transform: `translate(${from.x}px, ${from.y}px) translate(-50%, -50%) scale(.7) rotate(0deg)`, opacity: 1 },
      { transform: `translate(${(from.x + to.x) / 2}px, ${Math.min(from.y, to.y) - 140}px) translate(-50%, -50%) scale(1.25) rotate(-8deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${to.x}px, ${to.y - 30}px) translate(-50%, -50%) scale(1.05) rotate(-2deg)`, opacity: 1, offset: 0.8 },
      { transform: `translate(${to.x}px, ${to.y}px) translate(-50%, -50%) scale(.35) rotate(0deg)`, opacity: 0 },
    ], { duration: dur, easing: 'cubic-bezier(.4,0,.6,1)' });
    return anim.finished.then(() => { el.remove(); view.slamImpact(x, y); }).catch(() => el.remove());
  }

  async function playEvents(evs: Ev[], after: GameState) {
    const drawn = new Set<number>();
    for (const ev of evs) {
      logEvent(ev, after);
      if (ev.e === 'draw' && ev.p === ME) { drawn.add(ev.uid); sfx.draw(); }
      if (ev.e === 'turn') {
        S = { ...S, active: ev.p, turn: ev.turn };
        saidTen = false;
        banner(ev.p === ME ? 'Your Turn' : `${foeLabel()}'s Turn`);
        if (ev.p === ME) { sfx.turnStart(); say('yourturn'); } else say('theirturn');
        renderEventPlate();
        await wait(500);
      }
      if (ev.e === 'playerHit' || ev.e === 'fatigue' || ev.e === 'storm') {
        const P0 = S.players[ev.p];
        S = { ...S, players: S.players.map((pp, i) => i === ev.p ? { ...pp, life: P0.life - ev.n } : pp) as GameState['players'] };
        plaque(ev.p === ME ? mePlaque : foePlaque, ev.p);
        if (ev.e === 'playerHit') {
          if (P0.life - ev.n <= 0) say('finish', true); else say('direct');
          if (ev.p === AI) { taunt(P0.life - ev.n <= 6 && !desperateSaid ? 'desperate' : 'hurt'); if (P0.life - ev.n <= 6) desperateSaid = true; } else taunt('gloat');
        }
      }
      if (ev.e === 'summon') await slam(ev.card, ev.p, ev.x, ev.y, ev.uid);
      if (ev.e === 'stackOn') { const st = stackById(S, ev.stack) || stackById(after, ev.stack); if (st) await slam(ev.card, ev.p, st.x, st.y, ev.uid); }
      if (ev.e === 'spell' && ev.p !== ME) castShow(ev.card);
      if (ev.e === 'trapSet' && ev.p !== ME) toast(`${foeLabel()} hid a trap somewhere…`);
      if (ev.e === 'trap' && ev.card) { toast(`Trap! ${card(ev.card).name}`); say('trap'); }
      if (ev.e === 'hit' && ev.n > 0 && !ev.spill) {
        const st = stackById(S, ev.stack);
        if (ev.facing === 'back') { say('back'); if (st) taunt(st.owner === ME ? 'smug' : 'ouch'); }
        else if (ev.adv) say('super');
        else if (ev.facing === 'side') say('side');
      }
      if (ev.e === 'hit' && ev.n === 0) say('blocked');
      if (ev.e === 'ko') { const st = stackById(S, ev.stack); if (st) taunt(st.owner === ME ? 'gloat' : 'hurt'); }
      if (ev.e === 'topple') say('toppled');
      if (ev.e === 'fuse') { say(card(ev.card).stage === 3 ? 'finalform' : 'fusion', true); if (ev.p !== ME) taunt('fuse'); }
      if (ev.e === 'point' && ev.p === ME) say('gear');
      if (ev.e === 'boardEvent') { say('event', true); bigBanner(eventName(ev.ev, cfg.arena)); }
      if (ev.e === 'eventSoon') renderEventPlate();
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
  function bigBanner(t: string) {
    const b = h('div', { class: 'banner big-ev' }, h('div', { class: 'label' }, t));
    hud.appendChild(b);
    setTimeout(() => b.remove(), 1800);
  }

  let tauntTimer = 0;
  function taunt(mood: Mood) {
    if (net) return;
    const cls = mood === 'hurt' || mood === 'ouch' || mood === 'lose' ? 'hurt' : mood === 'desperate' ? 'worried' : 'happy';
    foePlaque.classList.remove('hurt', 'happy', 'worried');
    void foePlaque.offsetWidth;
    foePlaque.classList.add(cls);
    if (Math.random() < 0.35 && mood !== 'desperate' && mood !== 'win' && mood !== 'lose') return; // don't talk on every beat
    tauntEl.style.display = '';
    tauntEl.textContent = line(mood, oppId);
    tauntEl.classList.remove('pop'); void tauntEl.offsetWidth; tauntEl.classList.add('pop');
    clearTimeout(tauntTimer);
    tauntTimer = window.setTimeout(() => { tauntEl.style.display = 'none'; }, 2800);
  }

  function logEvent(ev: Ev, after: GameState) {
    const who = (p: PlayerId) => (p === ME ? 'You' : foeLabel());
    const nm = (id: number) => { const st = stackById(after, id) || stackById(S, id); return st ? card(lead(st).card).name : 'a stack'; };
    const push = (t: string, p: PlayerId | -1) => log.push({ t, p });
    switch (ev.e) {
      case 'turn': push(`— Turn ${ev.turn}: ${who(ev.p)} —`, -1); break;
      case 'summon': push(`${who(ev.p)} summoned ${card(ev.card).name}`, ev.p); break;
      case 'stackOn': push(`${who(ev.p)} stacked ${card(ev.card).name}`, ev.p); break;
      case 'fuse': push(`${who(ev.p)} fused ${card(ev.card).name}!`, ev.p); break;
      case 'spell': push(`${who(ev.p)} cast ${card(ev.card).name}`, ev.p); break;
      case 'skill': { const st = stackById(after, ev.stack) || stackById(S, ev.stack); push(`${nm(ev.stack)} used ${SKILLS[ev.skill].name}`, st ? st.owner : -1); break; }
      case 'trapSet': if (ev.p === ME) push(`You hid ${card(ev.card).name}`, ME); else push(`${who(ev.p)} hid a trap`, AI); break;
      case 'trap': if (ev.card) push(`Trap sprung: ${card(ev.card).name}`, ev.p); break;
      case 'terrain': push(`Tile became ${ev.elem}`, -1); break;
      case 'hit': if (!ev.spill) push(`${nm(ev.stack)} took ${ev.n}${ev.facing && ev.facing !== 'front' ? ` (${ev.facing})` : ''}`, -1); else push(`…${ev.n} spilled down`, -1); break;
      case 'ko': push(`${card(ev.card).name} fell`, -1); break;
      case 'topple': push(`A stack toppled`, ev.owner); break;
      case 'playerHit': push(`${who(ev.p)} lost ${ev.n} Life`, ev.p); break;
      case 'fatigue': push(`${who(ev.p)} is out of cards: -${ev.n} Life`, ev.p); break;
      case 'storm': push(`Dust storm! ${who(ev.p)} lose${ev.p === ME ? '' : 's'} ${ev.n} Life`, ev.p); break;
      case 'freeze': push(`${nm(ev.stack)} is stuck in glue`, -1); break;
      case 'burn': push(`${who(ev.p)}'s hand is full: ${card(ev.card).name} burned`, ev.p); break;
      case 'point': push(`${who(ev.p)} held ${ev.n} gear${ev.n > 1 ? 's' : ''}: +${ev.n} energy`, ev.p); break;
      case 'boardEvent': push(`Board event: ${eventName(ev.ev, cfg.arena)}!`, -1); break;
    }
  }

  // ---------------- turns
  async function endTurn() {
    if (!myTurn()) return;
    sel = null; closePicker(); hint(null);
    if (net) {
      if (!net.send({ k: 'end' })) { toast('Reconnecting… try again in a moment.'); return; }
      busy = true; renderHud(); return;
    }
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
      const r = apply(S, action);
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

  // ---------------- PvP messages
  const queue: ServerMsg[] = [];
  let draining = false;
  function onNet(m: ServerMsg) {
    if (m.t === 'reject') { busy = false; sfx.error(); toast(m.msg); renderHud(); return; }
    if (m.t === 'presence') {
      if (m.away !== undefined && m.away !== ME) toast(`${foeLabel()} disconnected. They have ${Math.round((m.graceMs || 90000) / 1000)}s to come back.`);
      if (m.back !== undefined && m.back !== ME) toast(`${foeLabel()} is back.`);
      return;
    }
    if (m.t === 'error') { toast(m.msg); return; }
    queue.push(m);
    if (!draining) drain();
  }
  async function drain() {
    draining = true;
    while (queue.length && !over) {
      const m = queue.shift()!;
      if (m.t === 'start') { S = m.state; deadline = localDeadline(m); view.sync(S); busy = false; renderHud(); continue; }
      if (m.t !== 'events') continue;
      busy = true;
      if (m.timeout) { say('timeup', true); toast(S.active === ME ? 'Time\'s up! Your turn ended.' : `${foeLabel()} ran out of time.`); }
      await playEvents(m.events, m.state);
      S = m.state;
      deadline = localDeadline(m);
      view.sync(S);
      busy = false;
      if (S.winner !== null) { finish(false, m.reason, m.by); break; }
      reselect(pendingKeep);
      pendingKeep = null;
      renderHud();
    }
    draining = false;
  }

  // ---------------- tutorial coach
  const COACH: { when: () => boolean; text: string; done?: () => boolean }[] = [
    { when: () => true, done: () => S.stacks.some(s => s.owner === ME), text: '<b>Hi, I\'m Tock!</b> Your cards are at the bottom. Click a <b>creature</b> and then a <b>gold tile</b>, or just drag the card onto the board.' },
    { when: () => S.stacks.some(s => s.owner === ME), done: () => S.players[ME].turns >= 2, text: 'New toys rest for a turn. Spend your energy, then press <b>End Turn</b>.' },
    { when: () => S.players[ME].turns >= 2 && S.stacks.some(s => s.owner === ME && s.ap > 0), done: () => S.stacks.some(s => s.owner === ME && s.ap < mods(S, s).actions && s.y > 1), text: 'Click one of your stacks. <b>Pale</b> tiles are moves, <b>red</b> tiles are attacks. Each toy also has a <b>Skill</b> in the bar.' },
    { when: () => S.stacks.some(s => s.owner === AI) && S.players[ME].turns >= 2, text: 'See the arrow on each base? Hit from the <b>side for ×1.5</b> or from <b>behind for ×2</b>. Use <b>Turn</b> to face a new way.' },
    { when: () => S.players[ME].turns >= 2, text: 'The two <b>brass gears</b> in the middle row give +1 energy every turn you stand on them.' },
    { when: () => !!S.event && S.event.turn - S.turn <= 2, text: 'A <b>board event</b> is coming. Check the note at the top right and get out of the way!' },
    { when: () => S.players[ME].turns >= 3 && S.stacks.some(s => s.owner === ME && s.units.length < 3) && S.players[ME].hand.some(r => card(r.card).kind === 'creature'), text: 'Play a creature <b>onto your own stack</b>: it costs 1 less, and the toy underneath powers it up.' },
    { when: () => S.stacks.some(s => s.owner === ME && !!fuseTarget(S, s)), text: 'Two of a family on top? Hit <b>Fuse</b> to evolve them into something bigger!' },
    { when: () => S.stacks.some(s => s.owner === ME && s.y === 4), text: 'You\'re on their back row! Attack their <b>Life</b> directly from here.' },
  ];
  function coach() {
    if (!cfg.tutorial || over || S.active !== ME) { coachEl.style.display = 'none'; return; }
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
      net ? h('p', { class: 'muted', style: { margin: 0 } }, 'The match keeps going while this is open.') : null,
      h('button', { class: 'btn green', onclick: () => m.close() }, 'Resume'),
      h('button', { class: 'btn paper', onclick: () => { m.close(); rulesModal(); } }, 'How to Play'),
      h('button', { class: 'btn paper', onclick: () => { m.close(); settingsModal(); } }, 'Settings'),
      h('button', { class: 'btn red', onclick: async () => {
        m.close();
        if (!(await confirmBox('Give up?', 'This counts as a loss.', 'Give up', true))) return;
        if (net) { if (!net.resign()) toast('Reconnecting… try again in a moment.'); } else { S = { ...S, winner: AI }; finish(true); }
      } }, 'Give up')));
  }

  async function finish(forfeit = false, reason?: string, by?: PlayerId) {
    if (over) return;
    over = true;
    busy = false;
    view.clearHighlights();
    view.setWarnings([]);
    hint(null); actbar.style.display = 'none'; coachEl.style.display = 'none'; eventPlate.style.display = 'none';
    turnFlag.style.display = 'none'; endBtn.disabled = true; endBtn.classList.remove('ready'); closePicker();
    const won = S.winner === ME;
    const o = cfg.opponent;
    const first = !!o && won && !P.cleared[o.id];
    const reward = net ? (won ? 40 : 10) : won ? winReward(o, first, cfg.quickLevel) : 10;
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
    await wait(forfeit ? 0 : 900);
    view.celebrate(won ? ME : AI);
    won ? sfx.win() : sfx.lose();
    say(won ? 'victory' : 'defeat', true);
    if (!net) taunt(won ? 'lose' : 'win');
    if (!forfeit && won) stage.flash(1, 0.95, 0.8, 0.3, 600);
    const nextZoneUnlocked = o?.boss && first && o.zone < 7;
    const why = reason === 'resign' ? (by === ME ? 'You gave up.' : `${foeLabel()} gave up.`) : reason === 'left' ? (by === ME ? 'You left the match.' : `${foeLabel()} left the match.`) : '';
    await wait(900);
    modal(h('div', { class: 'result' },
      h('div', { class: 'stamp' + (won ? ' win' : '') }, won ? 'VICTORY' : S.winner === 'draw' ? 'DRAW' : 'DEFEAT'),
      h('p', { style: { fontSize: '18px', margin: '6px 0' } }, why || (won ? (o ? `${o.name} is beaten.` : `You beat ${foeLabel()}.`) : forfeit ? 'You gave up this one.' : `${foeLabel()} wins this time.`)),
      h('div', { class: 'coin' }, h('span', { html: ICON.button }), `+${reward} Buttons`),
      cards.length ? h('div', {}, h('p', { style: { fontWeight: '800' } }, 'Boss reward'), h('div', { class: 'rewards' }, cards.map(c => renderCard(c, { w: 120, isNew: true })))) : null,
      nextZoneUnlocked ? h('p', { style: { fontWeight: '800', color: 'var(--green2)' } }, `New zone unlocked: ${ZONES[o!.zone + 1].name}!`) : null,
      h('div', { class: 'actions', style: { justifyContent: 'center' } },
        net ? null : h('button', { class: 'btn paper', onclick: () => { document.querySelector('.modal-bg')?.remove(); o ? startCampaignDuel(o) : startQuickDuel((cfg.quickLevel ?? 1) as 0 | 1 | 2 | 3); } }, 'Rematch'),
        h('button', { class: 'btn green', onclick: () => { document.querySelector('.modal-bg')?.remove(); o ? campaignScreen() : titleScreen(); } }, 'Continue'))), { closable: false });
  }

  const autoTurn = async () => {
    const { chooseAction } = await import('../engine/ai');
    let n = 0;
    while (S.active === ME && !over && n++ < 40) {
      while (busy) await new Promise(r => setTimeout(r, 50));
      if (S.active !== ME || over) break;
      const a = chooseAction(viewFor(S, ME), { level: 2, seed: S.turn });
      if (a.k === 'end') break;
      await act(a);
      while (busy) await new Promise(r => setTimeout(r, 50));
    }
    if (!over && S.active === ME) await endTurn();
  };
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).SB = { get S() { return S; }, get over() { return over; }, get busy() { return busy; }, act, endTurn, clickTile, clickCard, view, animCfg, autoTurn };

  // ---------------- start
  (async () => {
    busy = true;
    view.sync({ ...S, stacks: [] });
    renderHud();
    for (const ev of startEvents) logEvent(ev, S);
    await view.intro(ARENA_NAME[cfg.arena]);
    say('duel', true);
    banner(cfg.netStart ? (S.active === ME ? 'You go first' : `${foeLabel()} goes first`) : first === ME ? 'You go first' : `${foeLabel()} goes first`);
    if (!net && cfg.opponent) { tauntEl.style.display = ''; tauntEl.textContent = cfg.opponent.quote; tauntEl.classList.add('pop'); tauntTimer = window.setTimeout(() => { tauntEl.style.display = 'none'; }, 3200); }
    sfx.turnStart();
    await wait(900);
    view.sync(S);
    busy = false;
    renderHud(new Set(S.players[ME].hand.map(r => r.uid)));
    if (!net && S.active === AI) await aiTurn();
  })();
}
