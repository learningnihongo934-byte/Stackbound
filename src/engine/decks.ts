import { ALL_CARDS, card, isEvo } from './cards';
import type { DeckList, Elem } from './types';

export const DECK_SIZE = 30;
export const EVO_MAX = 8;
export const MAX_COPIES = 2;

const rep = (id: string, n: number) => Array.from({ length: n }, () => id);

export interface Starter { id: string; name: string; elems: [Elem, Elem]; blurb: string; hero: string; deck: DeckList }

export const STARTERS: Starter[] = [
  {
    id: 'hearth', name: 'Hearth', elems: ['ember', 'stone'], hero: 'matchpup',
    blurb: 'Hot-tempered toys and heavy marble. Hit hard, stand firm.',
    deck: {
      main: [
        ...rep('matchpup', 2), ...rep('candlewick', 2), ...rep('marblet', 2), ...rep('piggyvault', 2), ...rep('dominoknight', 2),
        'sparkjack', 'rookwall', ...rep('glimmersnail', 1), ...rep('bathduck', 1),
        ...rep('pillowfight', 2), ...rep('shove', 2), ...rep('rummage', 1), 'patchup', 'spintop', 'windupkey',
        ...rep('mousetrap', 2), 'jackspring', ...rep('hotplate', 2), 'graveltray', 'tinarmor', 'slingshot',
      ],
      evo: ['kilnhound', 'kilnhound', 'furnacebrute', 'waxwarden', 'chandelord', 'rollgolem', 'rollgolem', 'monolith'],
    },
  },
  {
    id: 'tidepool', name: 'Tidepool', elems: ['tide', 'moss'], hero: 'bathduck',
    blurb: 'Bath toys and garden plush. Outlast everything, then strike.',
    deck: {
      main: [
        ...rep('bathduck', 2), ...rep('globjelly', 2), ...rep('feltfrog', 2), ...rep('sproutpot', 2), 'mossbear', 'spritzfin',
        ...rep('candlewick', 1), ...rep('marblet', 1), ...rep('piggyvault', 1),
        ...rep('pillowfight', 2), ...rep('patchup', 2), ...rep('rummage', 2), 'gluepot', 'shove', 'spintop',
        'tangleyarn', 'mousetrap', 'pillowfort', ...rep('spilledtea', 2), 'gardenrug', 'rearview', 'tinarmor',
      ],
      evo: ['tubdrake', 'tubdrake', 'leviathub', 'domejelly', 'quiltoad', 'patchking', 'thornpot', 'arborpot'],
    },
  },
  {
    id: 'sparkshelf', name: 'Sparkshelf', elems: ['volt', 'gleam'], hero: 'lampmoth',
    blurb: 'Fast bugs and dancing glass. Out-move them, hit their backs.',
    deck: {
      main: [
        ...rep('battbug', 2), ...rep('lampmoth', 2), ...rep('twirla', 2), ...rep('glimmersnail', 2), 'ziprover', 'prismkite',
        ...rep('matchpup', 1), ...rep('feltfrog', 1), ...rep('marblet', 1),
        ...rep('spintop', 2), ...rep('shove', 2), ...rep('pillowfight', 2), 'windupkey', 'rummage', 'gluepot',
        'jackspring', 'mousetrap', 'mirrorshard', ...rep('tangledwires', 2), 'glitterspill', 'springshoes', 'slingshot',
      ],
      evo: ['voltbeetle', 'voltbeetle', 'gigascarab', 'bulbmoth', 'bulbmoth', 'arclight', 'prismelle', 'celestelle'],
    },
  },
];

export function validateDeck(d: DeckList): string[] {
  const errs: string[] = [];
  if (d.main.length !== DECK_SIZE) errs.push(`Main deck needs exactly ${DECK_SIZE} cards (has ${d.main.length}).`);
  if (d.evo.length > EVO_MAX) errs.push(`Evolution pile holds at most ${EVO_MAX} cards.`);
  const count: Record<string, number> = {};
  for (const c of d.main) {
    count[c] = (count[c] || 0) + 1;
    if (isEvo(card(c))) errs.push(`${card(c).name} is an evolved form and belongs in the Evolution pile.`);
  }
  for (const c of d.evo) if (!isEvo(card(c))) errs.push(`${card(c).name} can't go in the Evolution pile.`);
  const evoCount: Record<string, number> = {};
  for (const c of d.evo) evoCount[c] = (evoCount[c] || 0) + 1;
  for (const [id, n] of Object.entries(count)) if (n > MAX_COPIES) errs.push(`At most ${MAX_COPIES} copies of ${card(id).name}.`);
  for (const [id, n] of Object.entries(evoCount)) if (n > MAX_COPIES) errs.push(`At most ${MAX_COPIES} copies of ${card(id).name}.`);
  return [...new Set(errs)];
}

/** Build a themed AI deck from a pool of elements. Deterministic for a given seed. */
export function themedDeck(elems: Elem[], seed: number, level: number): DeckList {
  let r = seed >>> 0 || 7;
  const rand = () => { r = (Math.imul(r ^ (r >>> 15), 2246822519) + 0x9e3779b9) >>> 0; return r / 4294967296; };
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  const inTheme = (e?: Elem) => !!e && elems.includes(e);
  const rarOk = (rar: string) => rar === 'common' || (rar === 'uncommon' && level >= 1) || (rar === 'rare' && level >= 2);
  const base = ALL_CARDS.filter(c => c.kind === 'creature' && !isEvo(c) && inTheme(c.elem) && rarOk(c.rarity));
  const fams = base.filter(c => c.family);
  const main: string[] = [];
  const add = (id: string, n: number) => { for (let i = 0; i < n && main.length < DECK_SIZE; i++) if (main.filter(x => x === id).length < MAX_COPIES) main.push(id); };
  for (const c of fams) add(c.id, 2);
  for (const c of base.filter(c => !c.family)) add(c.id, level >= 2 ? 2 : 1);
  const spells = ALL_CARDS.filter(c => c.kind === 'spell' && rarOk(c.rarity));
  const traps = ALL_CARDS.filter(c => c.kind === 'trap' && rarOk(c.rarity));
  const terr = ALL_CARDS.filter(c => c.kind === 'terrain' && inTheme(c.elem));
  const gear = ALL_CARDS.filter(c => c.kind === 'gear' && rarOk(c.rarity));
  const fillers = ALL_CARDS.filter(c => c.kind === 'creature' && !isEvo(c) && !inTheme(c.elem) && c.rarity === 'common');
  for (const t of terr) add(t.id, 1);
  let guard = 0;
  while (main.length < 18 && guard++ < 100) add(pick(fillers).id, 1);
  guard = 0;
  while (main.length < DECK_SIZE && guard++ < 400) {
    const roll = rand();
    const pool = roll < 0.55 ? spells : roll < 0.75 ? traps : roll < 0.9 ? gear : fillers;
    add(pick(pool).id, 1);
  }
  while (main.length < DECK_SIZE) main.push('pillowfight');
  const evo: string[] = [];
  for (const f of fams) {
    const s2 = ALL_CARDS.find(c => c.family === f.family && c.stage === 2)!;
    const s3 = ALL_CARDS.find(c => c.family === f.family && c.stage === 3)!;
    if (evo.length < EVO_MAX) evo.push(s2.id);
    if (level >= 1 && evo.length < EVO_MAX) evo.push(s2.id);
    if (level >= 2 && evo.length < EVO_MAX) evo.push(s3.id);
  }
  return { main, evo };
}
