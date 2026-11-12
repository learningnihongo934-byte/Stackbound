// Menu screens: title, starter pick, campaign, collection, decks, packs, settings, rules.
import { ALL_CARDS, BEATS, card, ELEM_NAME, ELEMS, isEvo, KEYWORD_TEXT, SHAPE_TEXT } from '../engine/cards';
import { DECK_SIZE, EVO_MAX, STARTERS } from '../engine/decks';
import type { Elem, Shape } from '../engine/types';
import { sfx, setVolumes, unlockAudio } from '../game/audio';
import { clearedCount, duelUnlocked, isCleared, nextDuel, ZONES, type Zone } from '../game/campaign';
import { cloudState, onCloud, signIn, signOut } from '../game/cloud';
import {
  activeDeck, autoBuild, chooseStarter, craft, CRAFT_COST, deckProblems, extras, onProfile, openPack, owned, P, PACK_PRICE, recycleExtras, resetProfile, save, type SavedDeck,
} from '../game/profile';
import { animCfg } from '../render/anim';
import { go, onLeave, stage, topbar } from './app';
import { startCampaignDuel, startPvp, startQuickDuel } from './battle';
import { createRoom, NetClient } from '../game/net';
import { voiceCfg } from '../game/voice';
import { cardArt, cardBack, familyStrip, renderCard, turntable } from './cardview';
import { coin, confirmBox, fill, h, modal, toast } from './dom';
import { ELEM_ICON, ICON, shapeIcon } from './icons';

// ---------------------------------------------------------------- title
export function titleScreen() {
  go(() => {
    const word = (w: string, cols: string[], delay = 0) => h('div', { class: 'logo-row' + (delay ? ' r2' : '') },
      [...w].map((ch, i) => h('div', { class: 'lb', style: { '--c': cols[i % cols.length], animationDelay: `${delay + i * 0.07}s`, transform: `rotate(${((i * 37) % 7) - 3}deg)` } as Record<string, string> }, ch)));
    const cloud = h('div', { class: 'title-corner' });
    const renderCloud = () => {
      const st = cloudState();
      cloud.replaceChildren(
        st.user
          ? h('button', { class: 'chip', title: 'Signed in. Click to sign out.', onclick: async () => { if (await confirmBox('Sign out?', 'Your progress stays saved on this device.', 'Sign out')) signOut(); } }, h('span', { html: ICON.user }), (st.user.displayName || st.user.email || 'Signed in').split(' ')[0], st.status === 'syncing' ? ' · saving' : st.status === 'synced' ? ' · saved' : '')
          : h('button', { class: 'chip', title: 'Back up your collection and play on any device', onclick: async () => { try { await signIn(); toast('Signed in. Your collection is backed up.'); } catch (e) { toast(cloudState().lastErr || 'Sign-in was cancelled.'); } } }, h('span', { html: ICON.user }), 'Sign in to save'),
        h('button', { class: 'btn icon paper', html: ICON.gear, title: 'Settings', onclick: settingsModal }));
    };
    renderCloud();
    const off = onCloud(renderCloud);
    onLeave(() => off());
    const next = nextDuel();
    const canPack = P.buttons >= PACK_PRICE;
    return h('div', { class: 'screen title' },
      cloud,
      h('div', { class: 'logo' },
        word('STACK', ['#c0442e', '#2f6a9a', '#e2a93a', '#5f8a3a', '#7a4a9a']),
        word('BOUND', ['#e2a93a', '#5f8a3a', '#7a4a9a', '#c0442e', '#2f6a9a'], 0.35),
        h('div', { class: 'logo-tag' }, 'Cards come alive. Stack them high.')),
      h('div', { class: 'menu' },
        h('button', { class: 'btn big red', onclick: () => { unlockAudio(); P.starter ? campaignScreen() : starterScreen(); } },
          P.starter ? 'Campaign' : 'Start Playing', h('span', { class: 'sub' }, P.starter ? (next ? `${ZONES[next.zone].name} · ${next.name}` : 'All clear!') : 'Pick your first deck')),
        h('div', { class: 'row' },
          h('button', { class: 'btn blue', onclick: () => { unlockAudio(); if (!P.starter) return starterScreen(); quickDuelModal(); } }, 'Quick Duel'),
          h('button', { class: 'btn', onclick: () => { unlockAudio(); P.starter ? packsScreen() : starterScreen(); } }, 'Packs', canPack ? h('span', { class: 'sub' }, '●') : null)),
        h('button', { class: 'btn plum', onclick: () => { unlockAudio(); if (!P.starter) return starterScreen(); friendModal(); } }, 'Play a Friend', h('span', { class: 'sub' }, 'Room code')),
        h('div', { class: 'row' },
          h('button', { class: 'btn green', onclick: () => { unlockAudio(); collectionScreen(); } }, 'Collection'),
          h('button', { class: 'btn paper', onclick: () => { unlockAudio(); P.starter ? decksScreen() : starterScreen(); } }, 'Decks')),
        h('button', { class: 'btn wood', onclick: () => { unlockAudio(); rulesModal(); } }, 'How to Play')),
      h('div', { class: 'title-foot' }, 'Made by Virat Reddy Kaukuntla'));
  });
  const wide = () => window.innerWidth >= 900;
  stage.setViewShift(0, wide() ? -window.innerWidth * 0.2 : 0);
}

// ---------------------------------------------------------------- starter pick
export function starterScreen() {
  go(() => h('div', { class: 'screen dim' },
    topbar('Choose your first deck', titleScreen),
    h('div', { class: 'scroll' },
      h('p', { style: { textAlign: 'center', color: '#f4e8cc', fontSize: '18px', margin: '0 0 18px', textShadow: '0 2px 6px #000' } }, 'Every collection starts somewhere. You can collect all of them later.'),
      h('div', { class: 'starters' }, STARTERS.map(s => h('div', {
        class: 'starter panel', onclick: async () => {
          if (!(await confirmBox(`Start with ${s.name}?`, `You get the ${s.name} deck (30 cards + 8 evolutions) and 200 Buttons for packs.`, 'Take it'))) return;
          chooseStarter(s.id);
          sfx.rare();
          toast(`${s.name} deck added to your collection.`);
          if (!P.seenRules) { P.seenRules = true; save(); rulesModal(); }
          campaignScreen();
        },
      },
      h('h2', {}, s.name),
      h('div', { class: 'elems' }, s.elems.map(e => h('span', { class: 'chip', style: { background: `var(--e-${e})`, color: '#fff4e2' } }, h('span', { html: ELEM_ICON[e] }), ELEM_NAME[e]))),
      renderCard(s.hero, { w: 190 }),
      h('p', {}, s.blurb),
      h('span', { class: 'btn' }, 'Choose ' + s.name)))))));
}

// ---------------------------------------------------------------- campaign
export function campaignScreen() {
  go(() => h('div', { class: 'screen dim' },
    topbar('The Attic', titleScreen, [h('span', { class: 'chip on' }, `${clearedCount()} / 32 cleared`)]),
    h('div', { class: 'map' }, h('div', { class: 'board-cork' },
      h('div', { class: 'zones' }, ZONES.map(z => {
        const unlocked = z.id === 0 || isCleared(`${z.id - 1}-3`);
        return h('div', { class: 'zone paper' + (unlocked ? '' : ' locked'), style: { '--zc': z.color, '--rot': `${((z.id * 53) % 5) - 2}deg` }, onclick: () => unlocked && zoneModal(z) },
          h('div', { class: 'boss-por' }, h('img', { class: 'px', src: cardArt(z.duels[3].portrait) })),
          h('div', { class: 'zh' }, h('span', { class: 'num' }, z.id + 1), h('h3', {}, z.name)),
          h('p', {}, z.blurb),
          h('div', { class: 'pips' },
            z.duels.map(d => d.boss
              ? h('span', { class: 'pip boss' + (isCleared(d.id) ? ' on' : ''), html: ICON.crown })
              : h('span', { class: 'pip' + (isCleared(d.id) ? ' on' : '') })),
            h('span', { style: { flex: '1' } }),
            z.elems.slice(0, 3).map(e => h('span', { style: { color: `var(--e-${e})`, fontSize: '18px' }, html: ELEM_ICON[e] }))),
          unlocked ? null : h('div', { class: 'lockmsg' }, h('span', { class: 'chip on' }, h('span', { html: ICON.lock }), `Beat ${ZONES[z.id - 1].duels[3].name}`)));
      }))))));
}

function zoneModal(z: Zone) {
  const m = modal(h('div', {},
    h('h2', {}, z.name),
    h('p', { class: 'muted', style: { marginTop: '-4px' } }, z.blurb),
    h('div', { class: 'duels' }, z.duels.map(d => {
      const open = duelUnlocked(d);
      const done = isCleared(d.id);
      return h('div', { class: 'duel paper' + (open ? '' : ' locked') },
        h('div', { class: 'por' }, h('img', { class: 'px', src: cardArt(d.portrait) })),
        h('div', {},
          h('h3', {}, d.name),
          h('div', { class: 'tt' }, `${d.title} — "${d.quote}"`),
          h('div', { class: 'meta' },
            d.boss ? h('span', { class: 'tagx bossy' }, 'BOSS') : null,
            done ? h('span', { class: 'tagx done' }, 'Cleared') : null,
            h('span', { class: 'tagx' }, `Life ${d.life}`),
            h('span', { class: 'tagx' }, ['Gentle', 'Clever', 'Sharp', 'Ruthless'][d.ai]),
            d.rewardCards.length && !done ? h('span', { class: 'tagx' }, 'Rewards: ' + d.rewardCards.map(c => card(c).name).join(', ')) : null)),
        h('button', { class: 'btn ' + (open ? 'red' : 'paper'), disabled: !open, onclick: () => { m.close(); startCampaignDuel(d); } }, open ? (done ? 'Replay' : 'Duel') : h('span', { html: ICON.lock })));
    }))));
}

// ---------------------------------------------------------------- quick duel
function quickDuelModal() {
  let level = 1;
  const segs = h('div', { class: 'seg' });
  const draw = () => segs.replaceChildren(...['Easy', 'Normal', 'Hard', 'Expert'].map((n, i) => h('button', { class: i === level ? 'on' : '', onclick: () => { level = i; draw(); } }, n)));
  draw();
  const m = modal(h('div', {},
    h('h2', {}, 'Quick Duel'),
    h('p', {}, 'A one-off duel against a random opponent with your active deck. Wins earn Buttons.'),
    h('div', { class: 'setting' }, h('span', {}, 'Opponent'), segs),
    h('div', { class: 'setting' }, h('span', {}, 'Your deck'), h('span', {}, activeDeck()?.name || 'None')),
    h('div', { class: 'actions' }, h('button', { class: 'btn red big', onclick: () => { m.close(); startQuickDuel(level as 0 | 1 | 2 | 3); } }, 'Duel!'))));
}

// ---------------------------------------------------------------- PvP lobby
function friendModal() {
  const deck = activeDeck();
  const problems = deck ? deckProblems(deck) : ['No deck'];
  if (problems.length) { toast('Your active deck isn\'t ready. Fix it in Decks.'); decksScreen(); return; }
  let net: NetClient | null = null;
  const body = h('div', { class: 'lobby' });
  const nameIn = h('input', { value: P.name && P.name !== 'Player' ? P.name : '', placeholder: 'Your name', maxlength: '16', style: { fontFamily: 'var(--f-display)', fontSize: '20px', letterSpacing: '0', textTransform: 'none' } }) as HTMLInputElement;
  const getName = () => { const n = nameIn.value.trim() || 'Player'; if (n !== P.name) { P.name = n; save(); } return n; };
  const m = modal(body, { onClose: () => { if (net && !started) net.close(); } });
  let started = false;
  const connect = (code: string, creating: boolean) => {
    net = new NetClient(code, getName(), { main: deck!.main, evo: deck!.evo });
    const off = net.on(msg => {
      if (msg.t === 'error') { toast(msg.msg); if (msg.fatal) { off(); net?.close(); net = null; home(); } return; }
      if (msg.t === 'lobby') waiting(code, creating);
      if (msg.t === 'start') { started = true; off(); m.close(); startPvp(net!, msg); }
    });
    net.connect();
    waiting(code, creating);
  };
  const waiting = (code: string, creating: boolean) => fill(body,
    h('h2', {}, creating ? 'Room ready' : 'Joining…'),
    h('div', { class: 'code' }, code),
    creating ? h('p', { style: { margin: 0, textAlign: 'center' } }, 'Send this code to your friend. The duel starts as soon as they join.') : null,
    h('div', { class: 'wait' }, h('div', { class: 'boot-blocks', style: { transform: 'scale(.6)' } }, h('i', {}), h('i', {}), h('i', {}), h('i', {})), creating ? 'Waiting for your friend…' : 'Connecting…'),
    creating ? h('button', { class: 'btn paper', onclick: () => { navigator.clipboard?.writeText(code).then(() => toast('Code copied.')); } }, 'Copy code') : null);
  const home = () => {
    const codeIn = h('input', { placeholder: 'CODE', maxlength: '5', autocapitalize: 'characters' }) as HTMLInputElement;
    codeIn.addEventListener('input', () => { codeIn.value = codeIn.value.toUpperCase().replace(/[^A-Z]/g, ''); });
    fill(body,
      h('h2', {}, 'Play a Friend'),
      h('p', { style: { margin: 0 } }, `You'll play with your active deck: ${deck!.name}. Turns last 60 seconds.`),
      nameIn,
      h('button', { class: 'btn big red', onclick: async () => {
        try { const code = await createRoom(); connect(code, true); } catch (e) { toast((e as Error).message || 'Could not make a room.'); }
      } }, 'Create a room'),
      h('div', { style: { textAlign: 'center', fontWeight: '800', color: 'var(--ink2)' } }, 'or join one'),
      h('div', { class: 'row' }, codeIn, h('button', { class: 'btn blue', onclick: () => { const c = codeIn.value.trim(); if (c.length !== 5) { toast('Codes are 5 letters.'); return; } connect(c, false); } }, 'Join')));
    setTimeout(() => (nameIn.value ? codeIn : nameIn).focus(), 50);
  };
  home();
}

// ---------------------------------------------------------------- collection
const KINDS = ['creature', 'spell', 'trap', 'terrain', 'gear'] as const;
export function collectionScreen() {
  const f = { elem: null as Elem | null, kind: null as string | null, ownedOnly: false };
  go(() => {
    const grid = h('div', { class: 'grid' });
    const filters = h('div', { class: 'filters' });
    const draw = () => {
      fill(filters, 
        ...ELEMS.map(e => h('button', { class: 'chip' + (f.elem === e ? ' on' : ''), onclick: () => { f.elem = f.elem === e ? null : e; draw(); } }, h('span', { style: { color: f.elem === e ? '' : `var(--e-${e})` }, html: ELEM_ICON[e] }), ELEM_NAME[e])),
        h('span', { style: { width: '10px' } }),
        ...KINDS.map(k => h('button', { class: 'chip' + (f.kind === k ? ' on' : ''), onclick: () => { f.kind = f.kind === k ? null : k; draw(); } }, k[0].toUpperCase() + k.slice(1))),
        h('span', { style: { width: '10px' } }),
        h('button', { class: 'chip' + (f.ownedOnly ? ' on' : ''), onclick: () => { f.ownedOnly = !f.ownedOnly; draw(); } }, 'Owned only'),
        h('span', { style: { flex: '1' } }),
        h('span', { class: 'chip on' }, `${ALL_CARDS.filter(c => owned(c.id)).length} / ${ALL_CARDS.length} found`),
        extras().length ? h('button', { class: 'btn small plum', onclick: async () => { const tot = extras().reduce((a, e) => a + e.value, 0); if (await confirmBox('Recycle extras?', `Turn every copy beyond 2 into ${tot} Stuffing. Stuffing crafts any card.`, 'Recycle')) { recycleExtras(); sfx.coin(); draw(); } } }, h('span', { html: ICON.stuffing }), 'Recycle extras') : null);
      const list = ALL_CARDS.filter(c => (!f.elem || c.elem === f.elem) && (!f.kind || c.kind === f.kind) && (!f.ownedOnly || owned(c.id)));
      grid.replaceChildren(...list.map(c => renderCard(c.id, { count: owned(c.id) || undefined, unowned: !owned(c.id), foil: (P.foil[c.id] || 0) > 0, onClick: () => inspectModal(c.id, draw) })));
    };
    draw();
    return h('div', { class: 'screen dim' }, topbar('Collection', titleScreen), filters, h('div', { class: 'scroll' }, grid));
  });
}

export function inspectModal(id: string, after?: () => void) {
  const c = card(id);
  const tt = h('div', { class: 'turntable' });
  const n = owned(id);
  const cost = CRAFT_COST[c.rarity];
  const info = h('div', {},
    h('h2', {}, c.name),
    h('div', { class: 'kv' },
      h('b', {}, 'Owned'), h('span', {}, n ? `${n}${P.foil[id] ? ` (${P.foil[id]} foil)` : ''}` : 'Not yet'),
      h('b', {}, 'Rarity'), h('span', {}, c.rarity),
      c.kind === 'creature' ? [h('b', {}, 'Attack'), h('span', { html: SHAPE_TEXT[c.shape!] })] : null,
      c.elem && c.kind === 'creature' ? [h('b', {}, 'Strong vs'), h('span', {}, ELEM_NAME[BEATS[c.elem]])] : null,
      c.family ? [h('b', {}, 'Evolution'), h('span', {}, c.stage === 1 ? 'Stack two of these, then fuse.' : c.stage === 2 ? 'Fuse two Stage 1s. Lives in the Evolution pile.' : 'Fuse a Stage 2 with a Stage 1. Lives in the Evolution pile.')] : null),
    h('p', { class: 'muted', style: { fontStyle: 'italic', fontFamily: 'var(--f-display)' } }, c.flavor),
    familyStrip(id),
    h('div', { class: 'actions', style: { justifyContent: 'flex-start' } },
      h('button', { class: 'btn plum', disabled: P.stuffing < cost, onclick: () => { if (craft(id)) { sfx.rare(); toast(`Crafted ${c.name}.`); m.close(); after?.(); } } }, h('span', { html: ICON.stuffing }), `Craft (${cost})`),
      h('span', { class: 'muted', style: { alignSelf: 'center' } }, `You have ${P.stuffing} Stuffing`)));
  const m = modal(h('div', { class: 'inspect' }, h('div', { style: { display: 'grid', gap: '12px', justifyItems: 'center' } }, renderCard(id, { foil: (P.foil[id] || 0) > 0, unowned: !n }), tt), info));
  requestAnimationFrame(() => turntable(tt, id));
}

// ---------------------------------------------------------------- decks
export function decksScreen() {
  go(() => {
    const list = h('div', { class: 'decks' });
    const draw = () => fill(list, 
      ...P.decks.map(d => {
        const errs = deckProblems(d);
        const hero = d.main.find(c => card(c).kind === 'creature') || 'matchpup';
        return h('div', { class: 'deckbox paper' + (d.id === P.active ? ' active' : '') },
          h('div', { class: 'top' }, h('div', { class: 'hero' }, h('img', { class: 'px', src: cardArt(hero) })), h('div', {}, h('h3', {}, d.name), h('div', { class: 'muted' }, `${d.main.length}/${DECK_SIZE} cards · ${d.evo.length}/${EVO_MAX} evolutions`))),
          errs.length ? h('div', { class: 'errs' }, errs[0]) : h('div', { class: 'muted', style: { color: 'var(--green2)', fontWeight: '800' } }, 'Ready to play'),
          h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
            d.id === P.active ? h('span', { class: 'chip on' }, h('span', { html: ICON.check }), 'Active') : h('button', { class: 'btn small green', onclick: () => { P.active = d.id; save(); draw(); } }, 'Use this deck'),
            h('button', { class: 'btn small', onclick: () => deckEditor(d) }, 'Edit'),
            P.decks.length > 1 ? h('button', { class: 'btn small paper', onclick: async () => { if (await confirmBox('Delete deck?', `"${d.name}" will be removed. Your cards stay in your collection.`, 'Delete', true)) { P.decks = P.decks.filter(x => x !== d); if (P.active === d.id) P.active = P.decks[0].id; save(); draw(); } } }, 'Delete') : null));
      }),
      P.decks.length < 8 ? h('div', { class: 'deckbox panel', style: { placeItems: 'center', minHeight: '150px' }, onclick: () => {
        const elems = STARTERS.find(s => s.id === P.starter)?.elems || ['ember', 'stone'];
        const d = autoBuild('New Deck', elems);
        P.decks.push(d); save(); deckEditor(d);
      } }, h('h3', {}, '+ New deck'), h('span', { class: 'muted' }, 'Starts auto-filled from your collection')) : null);
    draw();
    return h('div', { class: 'screen dim' }, topbar('Decks', titleScreen), h('div', { class: 'scroll' }, list));
  });
}

export function deckEditor(d: SavedDeck) {
  const work: SavedDeck = { ...d, main: [...d.main], evo: [...d.evo] };
  let filter: Elem | null = null;
  go(() => {
    const grid = h('div', { class: 'grid', style: { '--cw': '140px' } });
    const side = h('div', { class: 'decklist panel' });
    const filters = h('div', { class: 'filters' });
    const nameIn = h('input', { value: work.name, maxlength: '24', style: { font: '800 18px var(--f-display)', padding: '6px 10px', border: '2px solid var(--ink)', borderRadius: '8px', width: '100%', background: 'var(--paper)' } }) as HTMLInputElement;
    nameIn.addEventListener('input', () => { work.name = nameIn.value || 'Deck'; });
    const inDeck = (id: string) => (isEvo(card(id)) ? work.evo : work.main).filter(x => x === id).length;
    const add = (id: string) => {
      const c = card(id);
      const pile = isEvo(c) ? work.evo : work.main;
      if (inDeck(id) >= Math.min(2, owned(id))) { sfx.error(); toast(owned(id) < 2 ? `You own ${owned(id)} ${c.name}.` : 'At most 2 copies.'); return; }
      if (pile.length >= (isEvo(c) ? EVO_MAX : DECK_SIZE)) { sfx.error(); toast(isEvo(c) ? 'The Evolution pile is full (8).' : 'The deck is full (30).'); return; }
      pile.push(id); sfx.card(); draw();
    };
    const remove = (id: string) => { const pile = isEvo(card(id)) ? work.evo : work.main; pile.splice(pile.indexOf(id), 1); sfx.card(); draw(); };
    const draw = () => {
      fill(filters, ...ELEMS.map(e => h('button', { class: 'chip' + (filter === e ? ' on' : ''), onclick: () => { filter = filter === e ? null : e; draw(); } }, h('span', { html: ELEM_ICON[e] }), ELEM_NAME[e])), h('span', { class: 'muted', style: { color: '#f4e8cc', marginLeft: '8px' } }, 'Click a card to add it. Click a row to remove it.'));
      const pool = ALL_CARDS.filter(c => owned(c.id) && (!filter || c.elem === filter));
      grid.replaceChildren(...pool.map(c => renderCard(c.id, { count: owned(c.id) - inDeck(c.id), w: 140, cls: inDeck(c.id) >= Math.min(2, owned(c.id)) ? 'used' : '', onClick: () => add(c.id) })));
      const rows = (ids: string[]) => {
        const counts = new Map<string, number>();
        for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
        return [...counts.entries()].sort((a, b) => card(a[0]).cost - card(b[0]).cost || card(a[0]).name.localeCompare(card(b[0]).name))
          .map(([id, n]) => { const c = card(id); return h('div', { class: 'dl-row', style: { '--e': c.elem ? `var(--e-${c.elem})` : 'var(--ink3)' }, onclick: () => remove(id) }, h('span', { class: 'bar' }), h('span', { class: 'c-cost' }, c.cost), h('span', { class: 'nm' }, c.name), h('span', { class: 'x' }, '×' + n)); });
      };
      const curve = Array.from({ length: 7 }, (_, i) => work.main.filter(id => Math.min(6, card(id).cost) === i).length);
      const mx = Math.max(1, ...curve);
      const errs = deckProblems(work);
      fill(side, 
        nameIn,
        h('div', { class: 'curve' }, curve.map((n, i) => h('div', { style: { height: `${(n / mx) * 100}%` } }, h('span', {}, i === 6 ? '6+' : i)))),
        h('div', { style: { height: '14px' } }),
        h('div', { class: 'dl-scroll' },
          h('div', { class: 'dl-h' }, h('span', {}, 'Main deck'), h('span', {}, `${work.main.length}/${DECK_SIZE}`)), rows(work.main),
          h('div', { class: 'dl-h' }, h('span', {}, 'Evolution pile'), h('span', {}, `${work.evo.length}/${EVO_MAX}`)), rows(work.evo)),
        errs.length ? h('div', { class: 'errs' }, errs[0]) : null,
        h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
          h('button', { class: 'btn small paper', onclick: () => { const auto = autoBuild(work.name, filter ? [filter, BEATS[filter]] : (STARTERS.find(s => s.id === P.starter)?.elems || ['ember'])); work.main = auto.main; work.evo = auto.evo; draw(); } }, 'Auto-fill'),
          h('button', { class: 'btn small paper', onclick: () => { work.main = []; work.evo = []; draw(); } }, 'Clear'),
          h('span', { style: { flex: '1' } }),
          h('button', { class: 'btn green', onclick: () => { Object.assign(d, work); if (!P.decks.includes(d)) P.decks.push(d); save(); toast('Deck saved.'); decksScreen(); } }, 'Save')));
    };
    draw();
    return h('div', { class: 'screen dim' }, topbar('Deck Builder', async () => { if (await confirmBox('Leave without saving?', 'Changes to this deck will be lost.', 'Leave')) decksScreen(); }), filters, h('div', { class: 'split' }, h('div', { class: 'scroll', style: { padding: '0' } }, grid), side));
  });
}

// ---------------------------------------------------------------- packs
export function packsScreen() {
  go(() => {
    const area = h('div', { class: 'shop' });
    const shelf = () => {
      const can = P.buttons >= PACK_PRICE;
      area.replaceChildren(h('div', { style: { display: 'grid', justifyItems: 'center', gap: '22px' } },
        h('div', { class: 'pack', onclick: () => can ? rip() : (sfx.error(), toast('Not enough Buttons. Win duels to earn more.')) },
          h('div', { class: 'wrap' }), h('div', { class: 'crimp t' }), h('div', { class: 'crimp b' }),
          h('div', { class: 'face' }, h('div', { class: 'lb', style: { '--c': '#c0442e' } }, 'S'), h('h3', {}, 'Stackbound'), h('img', { class: 'px', src: cardArt(['kilnhound', 'celestelle', 'gigascarab', 'leviathub'][P.stats.packs % 4]) }), h('b', {}, '5 cards · 1 rare chance'))),
        h('button', { class: 'btn big red', disabled: !can, onclick: rip }, `Open for ${PACK_PRICE}`, h('span', { html: ICON.button })),
        h('div', { class: 'paper', style: { padding: '8px 14px', maxWidth: '420px', textAlign: 'center', fontSize: '15px' } }, 'Each pack: 3 commons, 1 uncommon and 1 uncommon-or-rare. Any card can be foil. Win duels to earn Buttons.')));
    };
    const rip = () => {
      const pulls = openPack();
      if (!pulls) return;
      const pack = area.querySelector('.pack') as HTMLElement;
      pack?.classList.add('shake');
      sfx.tear();
      setTimeout(() => {
        const W = Math.max(110, Math.min(180, (window.innerWidth - 140) / 5));
        const row = h('div', { class: 'pulls' });
        let opened = 0;
        pulls.forEach((p, i) => {
          const f = h('div', { class: 'flipper r-' + card(p.id).rarity, style: { '--w': W + 'px', animationDelay: `${i * 0.08}s` } as Record<string, string> },
            cardBack(W), renderCard(p.id, { w: W, foil: p.foil, isNew: p.isNew }));
          if (p.foil) f.classList.add('foilpull');
          f.addEventListener('click', () => {
            if (f.classList.contains('open')) return inspectModal(p.id);
            if (f.classList.contains('flip-out')) return;
            f.classList.add('flip-out');
            setTimeout(() => { f.classList.remove('flip-out'); f.classList.add('open', 'flip-in'); }, 160);
            opened++;
            card(p.id).rarity === 'rare' || p.foil ? sfx.rare() : sfx.flip();
            if (opened === pulls.length) done.disabled = false;
          });
          row.appendChild(f);
        });
        const done = h('button', { class: 'btn big', disabled: true, onclick: shelf }, 'Done') as HTMLButtonElement;
        const flipAll = h('button', { class: 'btn paper', onclick: () => row.querySelectorAll('.flipper:not(.open)').forEach((f, i) => setTimeout(() => (f as HTMLElement).click(), i * 160)) }, 'Flip all');
        area.replaceChildren(h('div', { style: { display: 'grid', justifyItems: 'center', gap: '16px' } }, row, h('div', { style: { display: 'flex', gap: '10px' } }, flipAll, done)));
      }, 650);
    };
    shelf();
    return h('div', { class: 'screen dim' }, topbar('Packs', titleScreen), area);
  });
}

// ---------------------------------------------------------------- settings
export function settingsModal() {
  const s = P.settings;
  const seg = (opts: string[], cur: string, set: (v: string) => void) => {
    const el = h('div', { class: 'seg' });
    const draw = (c: string) => el.replaceChildren(...opts.map(o => h('button', { class: o === c ? 'on' : '', onclick: () => { set(o); draw(o); } }, o[0].toUpperCase() + o.slice(1))));
    draw(cur);
    return el;
  };
  const range = (v: number, set: (v: number) => void) => { const r = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(v) }) as HTMLInputElement; r.addEventListener('input', () => set(+r.value)); return r; };
  modal(h('div', {},
    h('h2', {}, 'Settings'),
    h('div', { class: 'setting' }, h('span', {}, 'Graphics'), seg(['low', 'medium', 'high'], s.quality, v => { s.quality = v as never; stage.setQuality(s.quality); save(); })),
    h('div', { class: 'setting' }, h('span', {}, 'Sound effects'), range(s.sfx, v => { s.sfx = v; setVolumes(s.sfx, s.music); save(); })),
    h('div', { class: 'setting' }, h('span', {}, 'Music'), range(s.music, v => { s.music = v; setVolumes(s.sfx, s.music); save(); })),
    h('div', { class: 'setting' }, h('span', {}, 'Announcer'), range(s.voice ?? 0.9, v => { s.voice = v; voiceCfg.vol = v; save(); })),
    h('div', { class: 'setting' }, h('span', {}, 'Animation speed'), seg(['normal', 'fast', 'fastest'], s.speed >= 2 ? 'fastest' : s.speed > 1 ? 'fast' : 'normal', v => { s.speed = v === 'fastest' ? 2.2 : v === 'fast' ? 1.5 : 1; animCfg.speed = s.speed; save(); })),
    h('div', { class: 'setting' }, h('span', {}, 'Reduce motion'), seg(['off', 'on'], s.reduceMotion ? 'on' : 'off', v => { s.reduceMotion = v === 'on'; animCfg.reduceMotion = s.reduceMotion; save(); })),
    h('hr', { style: { border: 0, borderTop: '2px dashed rgba(43,29,20,.3)', margin: '16px 0' } }),
    h('div', { class: 'setting' }, h('span', {}, 'Progress'), h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
      h('span', { class: 'muted' }, `${P.stats.wins} wins · ${P.stats.losses} losses · ${P.stats.packs} packs`),
      h('button', { class: 'btn small red', onclick: async () => { if (await confirmBox('Erase everything?', 'This deletes your collection, decks and campaign progress on this device. It cannot be undone.', 'Erase', true)) { resetProfile(); location.reload(); } } }, 'Reset progress')))));
}

// ---------------------------------------------------------------- rules
export function rulesModal() {
  const shapes: Shape[] = ['jab', 'line', 'cone', 'lob', 'splash', 'sweep'];
  modal(h('div', { class: 'rules', style: { maxWidth: '680px' } },
    h('h2', {}, 'How to Play'),
    h('p', {}, 'Bring your opponent\'s ', h('b', {}, 'Life'), ' to 0. Toys you summon come alive on a 5×5 board. Stand a stack on the enemy\'s back row and it can attack their Life directly.'),
    h('h3', {}, '1. Energy and cards'),
    h('p', {}, 'You get 1 energy on turn 1, 2 on turn 2, and so on up to 10. Each card shows its cost in the brass coin. You draw a card every turn.'),
    h('h3', {}, '2. Summon and stack'),
    h('p', {}, 'Summon creatures on your two closest rows and choose which way they face. Play a creature onto one of your stacks instead and it costs 1 less. It becomes the new ', h('b', {}, 'lead'), '. Creatures underneath give the lead their ', h('b', {}, 'Under'), ' bonus. Stacks hold up to 3.'),
    h('h3', {}, '3. Actions'),
    h('p', {}, 'Each stack gets 2 actions per turn: ', h('b', {}, 'Move'), ' 1 tile or ', h('b', {}, 'Turn'), ' to face a new way. ', h('b', {}, 'Attack'), ' ends that stack\'s turn. New stacks wait a turn before they act.'),
    h('h3', {}, '4. Facing matters'),
    h('p', {}, 'Hit a stack from the front for normal damage, from the side for ×1.5, and from behind for ×2. Watch the little arrow on each stack\'s base. Type advantage adds another ×1.5:'),
    h('div', { class: 'demo' }, (['ember', 'moss', 'tide', 'volt', 'stone', 'gleam'] as Elem[]).map(e => h('span', { class: 'chip' }, h('span', { style: { color: `var(--e-${e})` }, html: ELEM_ICON[e] }), `${ELEM_NAME[e]} › ${ELEM_NAME[BEATS[e]]}`))),
    h('h3', {}, '5. Attack shapes'),
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '8px' } }, shapes.map(s => h('div', { class: 'demo paper', style: { padding: '6px 8px', margin: 0 } }, h('span', { style: { fontSize: '28px' }, html: shapeIcon(s, 2) }), h('span', { style: { fontSize: '14px' } }, SHAPE_TEXT[s])))),
    h('h3', {}, '6. Spill and topple'),
    h('p', {}, 'Damage hits the lead first. When the lead falls, leftover damage spills into the creature below. When the last creature falls, the stack topples.'),
    h('h3', {}, '7. Fuse to evolve'),
    h('p', {}, 'When the top two creatures of a stack are the same family and stage, you can ', h('b', {}, 'Fuse'), ' them into the next stage from your Evolution pile. Two Stage 1s make a Stage 2, and a Stage 2 plus a Stage 1 makes a Stage 3. Fusing frees a slot, so you can stack again.'),
    h('h3', {}, '8. Skills'),
    h('p', {}, 'Every creature has a ', h('b', {}, 'Skill'), ' (Dash, Zap, Guard, Whirl…), usable once per turn from the action bar. Most cost 1 action and some cost energy. Whirl turns you for free.'),
    h('h3', {}, '9. Brass gears and board events'),
    h('p', {}, 'The two ', h('b', {}, 'brass gears'), ' in the middle row give +1 energy at the start of your turn if you stand on them. Every 5 turns a ', h('b', {}, 'board event'), ' happens: a paw swipes a row, a draft pushes everything, glitter rains down. The note at the top right warns you in advance.'),
    h('h3', {}, '10. Spells, traps, terrain, gear'),
    h('p', {}, h('b', {}, 'Spells'), ' happen once. ', h('b', {}, 'Traps'), ' hide face-down: snares trigger when an enemy steps on them, counters when the stack above is attacked. ', h('b', {}, 'Terrain'), ' gives a matching lead +1 Power and +1 Armor. ', h('b', {}, 'Gear'), ' straps onto your lead.'),
    h('h3', {}, 'Keywords'),
    h('div', {}, Object.values(KEYWORD_TEXT).map(t => h('p', { style: { fontSize: '14.5px' } }, h('b', {}, t.split(':')[0] + ':'), t.slice(t.indexOf(':') + 1)))),
    h('div', { class: 'actions' }, h('button', { class: 'btn green', onclick: () => document.querySelector('.modal-bg')?.remove() }, 'Got it'))));
}

void onProfile; void coin;
