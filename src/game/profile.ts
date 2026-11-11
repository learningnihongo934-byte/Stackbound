// Player profile: collection, decks, currency, campaign progress, settings. Saved locally and
// (optionally) synced to Rennko Cloud.
import { ALL_CARDS, card, isEvo } from '../engine/cards';
import { STARTERS, validateDeck } from '../engine/decks';
import type { DeckList, Rarity } from '../engine/types';

export type Quality = 'low' | 'medium' | 'high';
export interface SavedDeck { id: string; name: string; main: string[]; evo: string[] }
export interface Profile {
  v: 1;
  updatedAt: number;
  name: string;
  buttons: number;
  stuffing: number;
  coll: Record<string, number>;
  foil: Record<string, number>;
  decks: SavedDeck[];
  active: string;
  starter: string | null;
  cleared: Record<string, number>;
  stats: { wins: number; losses: number; packs: number; duels: number; crafted: number };
  settings: { quality: Quality; sfx: number; music: number; speed: number; reduceMotion: boolean };
  tutorial: boolean;
  seenRules: boolean;
}

const KEY = 'stackbound.profile.v1';
const listeners = new Set<() => void>();
export const onProfile = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); };

function fresh(): Profile {
  const lowEnd = typeof navigator !== 'undefined' && ((navigator.hardwareConcurrency || 8) <= 4 || /Mobi|Android/i.test(navigator.userAgent));
  return {
    v: 1, updatedAt: Date.now(), name: 'Player', buttons: 0, stuffing: 0, coll: {}, foil: {}, decks: [], active: '', starter: null, cleared: {},
    stats: { wins: 0, losses: 0, packs: 0, duels: 0, crafted: 0 },
    settings: { quality: lowEnd ? 'medium' : 'high', sfx: 0.8, music: 0.45, speed: 1, reduceMotion: false },
    tutorial: false, seenRules: false,
  };
}

function load(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...fresh(), ...JSON.parse(raw) };
  } catch { /* private mode */ }
  return fresh();
}

export let P: Profile = load();
let pushHook: ((p: Profile) => void) | null = null;
export const setPushHook = (fn: (p: Profile) => void) => { pushHook = fn; };

export function save() {
  P.updatedAt = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(P)); } catch { /* ignore */ }
  for (const f of listeners) f();
  pushHook?.(P);
}
export function replaceProfile(p: Profile) {
  P = { ...fresh(), ...p };
  try { localStorage.setItem(KEY, JSON.stringify(P)); } catch { /* ignore */ }
  for (const f of listeners) f();
}
export function resetProfile() {
  P = fresh();
  save();
}

// ---------------------------------------------------------------- collection
export const owned = (id: string) => P.coll[id] || 0;
export function addCard(id: string, n = 1, foil = false) {
  P.coll[id] = (P.coll[id] || 0) + n;
  if (foil) P.foil[id] = (P.foil[id] || 0) + n;
}
export const PLAY_COPIES = 2;
export const CRAFT_COST: Record<Rarity, number> = { common: 40, uncommon: 100, rare: 300 };
export const RECYCLE_VALUE: Record<Rarity, number> = { common: 5, uncommon: 20, rare: 75 };

export function chooseStarter(id: string) {
  const s = STARTERS.find(x => x.id === id)!;
  P.starter = id;
  for (const c of [...s.deck.main, ...s.deck.evo]) addCard(c);
  const deck: SavedDeck = { id: 'd' + Date.now().toString(36), name: s.name + ' Starter', main: [...s.deck.main], evo: [...s.deck.evo] };
  P.decks.push(deck);
  P.active = deck.id;
  P.buttons += 200;
  save();
}

export function activeDeck(): SavedDeck | undefined {
  return P.decks.find(d => d.id === P.active) || P.decks[0];
}
export function deckList(d: SavedDeck): DeckList { return { main: d.main, evo: d.evo }; }
/** Problems with a saved deck, including owning enough copies. */
export function deckProblems(d: SavedDeck): string[] {
  const errs = validateDeck(deckList(d));
  const need: Record<string, number> = {};
  for (const c of [...d.main, ...d.evo]) need[c] = (need[c] || 0) + 1;
  for (const [id, n] of Object.entries(need)) if (owned(id) < n) errs.push(`You own ${owned(id)} of ${card(id).name} but the deck uses ${n}.`);
  return errs;
}

export function extras(): { id: string; n: number; value: number }[] {
  const out: { id: string; n: number; value: number }[] = [];
  for (const [id, n] of Object.entries(P.coll)) {
    const extra = n - PLAY_COPIES;
    if (extra > 0) out.push({ id, n: extra, value: extra * RECYCLE_VALUE[card(id).rarity] });
  }
  return out;
}
export function recycleExtras(): number {
  let total = 0;
  for (const e of extras()) {
    P.coll[e.id] -= e.n;
    const f = Math.min(P.foil[e.id] || 0, e.n);
    if (f) P.foil[e.id] -= f;
    total += e.value + f * RECYCLE_VALUE[card(e.id).rarity];
  }
  P.stuffing += total;
  save();
  return total;
}
export function craft(id: string): boolean {
  const cost = CRAFT_COST[card(id).rarity];
  if (P.stuffing < cost) return false;
  P.stuffing -= cost;
  addCard(id);
  P.stats.crafted++;
  save();
  return true;
}

// ---------------------------------------------------------------- packs
export const PACK_PRICE = 100;
export interface Pull { id: string; foil: boolean; isNew: boolean }
export function openPack(rand: () => number = Math.random): Pull[] | null {
  if (P.buttons < PACK_PRICE) return null;
  P.buttons -= PACK_PRICE;
  const pool = (r: Rarity) => ALL_CARDS.filter(c => c.rarity === r);
  const pick = (r: Rarity) => { const p = pool(r); return p[Math.floor(rand() * p.length)].id; };
  const slots: Rarity[] = ['common', 'common', 'common', 'uncommon', rand() < 0.28 ? 'rare' : 'uncommon'];
  const seenHere = new Set<string>();
  const pulls: Pull[] = slots.map(r => {
    const id = pick(r);
    const isNew = owned(id) === 0 && !seenHere.has(id);
    seenHere.add(id);
    return { id, foil: rand() < 1 / 16, isNew };
  });
  for (const p of pulls) addCard(p.id, 1, p.foil);
  P.stats.packs++;
  save();
  return pulls;
}

export function canPlayDeck(): SavedDeck | null {
  const d = activeDeck();
  if (!d) return null;
  return deckProblems(d).length ? null : d;
}

/** Auto-build: fill a deck from the collection around the given elements. */
export function autoBuild(name: string, elems: string[]): SavedDeck {
  const main: string[] = [], evo: string[] = [];
  const cnt = (arr: string[], id: string) => arr.filter(x => x === id).length;
  const ownedCards = ALL_CARDS.filter(c => owned(c.id) > 0);
  const scored = ownedCards.map(c => ({ c, s: (c.elem && elems.includes(c.elem) ? 10 : 0) + (c.kind === 'creature' ? 4 : 2) + (c.rarity === 'rare' ? 3 : c.rarity === 'uncommon' ? 1.5 : 0) - c.cost * 0.3 }))
    .sort((a, b) => b.s - a.s);
  for (const { c } of scored) {
    if (isEvo(c)) { while (evo.length < 8 && cnt(evo, c.id) < Math.min(2, owned(c.id))) evo.push(c.id); continue; }
    while (main.length < 30 && cnt(main, c.id) < Math.min(2, owned(c.id))) main.push(c.id);
  }
  return { id: 'd' + Date.now().toString(36), name, main, evo };
}
