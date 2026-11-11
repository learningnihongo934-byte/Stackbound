// The attic campaign: 8 zones x (3 duels + a boss).
import { themedDeck } from '../engine/decks';
import type { DeckList, Elem } from '../engine/types';
import { P } from './profile';

export interface Opponent {
  id: string; zone: number; index: number; name: string; title: string; elems: Elem[];
  deckLevel: number; ai: 0 | 1 | 2 | 3; life: number; portrait: string; boss: boolean; quote: string;
  rewardCards: string[];
}
export interface Zone { id: number; name: string; blurb: string; elems: Elem[]; color: string; duels: Opponent[] }

const Z: { name: string; blurb: string; elems: Elem[]; color: string; foes: [string, string, string, string][]; boss: [string, string, string, string]; rewards: string[] }[] = [
  { name: 'Toy Chest', blurb: 'Where every toy starts. The lid creaks; the old soldiers are watching.', elems: ['ember', 'tide'], color: '#c0442e',
    foes: [['Tin Soldier Pip', 'Lid Guard', 'matchpup', 'Halt! Who winds there?'], ['Rag Doll Rosie', 'Button Thief', 'bathduck', 'Your buttons look loose.'], ['Wind-Up Walter', 'Clockwork Pal', 'candlewick', 'Tick, tock, your turn to lose.']],
    boss: ['Captain Buttons', 'Keeper of the Chest', 'kilnhound', 'Nobody leaves the chest without my say-so.'], rewards: ['sparkjack', 'pillowfort'] },
  { name: 'Bookshelf', blurb: 'Dusty spines and paper cranes. Mind the silverfish.', elems: ['moss', 'stone'], color: '#5f8a3a',
    foes: [['Bookworm Bea', 'Chapter One', 'feltfrog', 'Shh. This is a library.'], ['Dust Jacket', 'Cover Story', 'marblet', 'Judge me by my cover.'], ['Origami Ori', 'Paper Crane', 'sproutpot', 'Fold, then fold again.']],
    boss: ['The Librarian Moth', 'Overdue Fines', 'quiltoad', 'Your stay is long overdue.'], rewards: ['mossbear', 'rookwall'] },
  { name: 'Dollhouse', blurb: 'Tiny chandeliers, tiny teacups, very large grudges.', elems: ['gleam', 'tide'], color: '#7a4a9a',
    foes: [['Teacup Tilly', 'Hostess', 'twirla', 'One lump or two?'], ['Butler Bramble', 'At Your Service', 'globjelly', 'Your coat, and your defeat.'], ['The Twin Dolls', 'Two of Us', 'glimmersnail', 'We finish each other\'s... turns.']],
    boss: ['Madame Porcelain', 'Lady of the House', 'prismelle', 'Mind the china, darling.'], rewards: ['kaleidowl', 'mirrorshard'] },
  { name: 'Train Set', blurb: 'The figure-eight track hums. Something is always late.', elems: ['volt', 'stone'], color: '#2f6a9a',
    foes: [['Caboose Carl', 'Last Car', 'battbug', 'Every train ends with me.'], ['Signal Sally', 'Red Light', 'marblet', 'Stop. Look. Lose.'], ['Coal Car Cody', 'Full Steam', 'lampmoth', 'Shovel faster!']],
    boss: ['Conductor Coil', 'Master of the Line', 'voltbeetle', 'All aboard. No refunds.'], rewards: ['ziprover', 'springshoes'] },
  { name: 'Music Box', blurb: 'A song nobody wrote plays on a loop. Dance or be danced.', elems: ['gleam', 'volt'], color: '#b0507a',
    foes: [['Metronome Max', 'Keeper of Time', 'twirla', 'Tick. Tock. Tick.'], ['Tin Drummer', 'Marching Band', 'battbug', 'Rat-a-tat, here we come.'], ['Kazoo Kid', 'Off-Key', 'lampmoth', 'BZZZZZT.']],
    boss: ['Prima Allegra', 'Star of the Show', 'celestelle', 'Applause, please.'], rewards: ['prismkite', 'rearview'] },
  { name: 'Lamp Corner', blurb: 'The brass lamp never quite turns off. Moths gather in its glow.', elems: ['volt', 'ember'], color: '#c8962e',
    foes: [['Moth Brigade', 'Drawn to Light', 'bulbmoth', 'The light! The LIGHT!'], ['Fuse Box Fern', 'Tripped Breaker', 'battbug', 'You\'ve blown a fuse.'], ['Nightlight Ned', 'Afraid of Nothing', 'candlewick', 'Leave it on. Please.']],
    boss: ['Old Lampwick', 'The Long Glow', 'waxwarden', 'I have burned for a hundred years.'], rewards: ['pinlance', 'gluepot'] },
  { name: 'Window Sill', blurb: 'Rain on the glass, pots in a row, a snail on patrol.', elems: ['moss', 'tide'], color: '#3a8a8a',
    foes: [['Potted Pete', 'Sunny Side', 'thornpot', 'I need my sunlight.'], ['Rain Gauge Ruth', 'Forecaster', 'domejelly', 'Showers, with a chance of you losing.'], ['Sill Snail Sam', 'Slow and Sure', 'glimmersnail', 'I\'ll get there.']],
    boss: ['The Sill Sentinel', 'Watcher at the Glass', 'arborpot', 'Nothing gets past the window.'], rewards: ['tangleyarn', 'marblerush'] },
  { name: 'Old Trunk', blurb: 'The oldest toys sleep here. Something in the dark is very, very big.', elems: ['ember', 'tide', 'moss', 'volt', 'stone', 'gleam'], color: '#4a2a1a',
    foes: [['Forgotten Knight', 'First Toy', 'dominoknight', 'I was here before you were wound.'], ['Moth-Eaten Mo', 'Threadbare', 'arclight', 'Patched a hundred times.'], ['Locket Lux', 'Keepsake', 'abyssglobe', 'Some things are kept forever.']],
    boss: ['The Trunk King', 'Lord of Lost Toys', 'monolith', 'Every lost toy answers to me.'], rewards: ['gigascarab', 'leviathub'] },
];

export const ZONES: Zone[] = Z.map((z, zi) => {
  const duels: Opponent[] = [...z.foes, z.boss].map(([name, title, portrait, quote], i) => {
    const boss = i === 3;
    const step = zi * 4 + i;
    const ai = (zi === 0 ? (i < 2 ? 0 : 1) : zi < 3 ? (boss ? 2 : 1) : zi < 6 ? (boss ? 3 : 2) : 3) as 0 | 1 | 2 | 3;
    const elems = zi === 7 ? [z.elems[i % 6], z.elems[(i + 3) % 6]] as Elem[] : z.elems;
    return {
      id: `${zi}-${i}`, zone: zi, index: i, name, title, elems, deckLevel: Math.min(2, Math.floor(step / 9)), ai,
      life: zi === 0 && i === 0 ? 14 : boss ? 22 + zi : 20, portrait, boss, quote, rewardCards: boss ? z.rewards : [],
    };
  });
  return { id: zi, name: z.name, blurb: z.blurb, elems: z.elems, color: z.color, duels };
});

export const allDuels = () => ZONES.flatMap(z => z.duels);
export const duelById = (id: string) => allDuels().find(d => d.id === id);
export const isCleared = (id: string) => !!P.cleared[id];
export function zoneUnlocked(z: number) { return z === 0 || isCleared(`${z - 1}-3`); }
export function duelUnlocked(o: Opponent) { return zoneUnlocked(o.zone) && (o.index === 0 || isCleared(`${o.zone}-${o.index - 1}`)); }
export function clearedCount() { return Object.keys(P.cleared).length; }
export function nextDuel(): Opponent | undefined { return allDuels().find(d => duelUnlocked(d) && !isCleared(d.id)); }

export function opponentDeck(o: Opponent): DeckList {
  return themedDeck(o.elems, (o.zone + 1) * 1000 + o.index * 17, o.deckLevel);
}
export function winReward(o: Opponent | null, first: boolean, quickLevel = 1): number {
  if (!o) return [20, 30, 40, 55][quickLevel];
  return 30 + o.zone * 8 + (first ? (o.boss ? 120 + o.zone * 20 : 50) : 0);
}
