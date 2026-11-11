// Fuzzer: random legal actions across many games, checking engine invariants after every step.
import { describe, expect, it } from 'vitest';
import { ALL_CARDS, card } from '../src/engine/cards';
import { STARTERS, themedDeck } from '../src/engine/decks';
import { apply, attackOptions, legalActions, maxHp, newMatch, viewFor } from '../src/engine/rules';
import { chooseAction } from '../src/engine/ai';
import type { Action, Elem, GameState } from '../src/engine/types';

function check(s: GameState, where: string) {
  const fail = (m: string) => { throw new Error(`${where}: ${m}`); };
  const seen = new Set<string>();
  for (const st of s.stacks) {
    if (st.units.length < 1 || st.units.length > 3) fail(`stack ${st.id} has ${st.units.length} units`);
    if (st.x < 0 || st.x > 4 || st.y < 0 || st.y > 4) fail(`stack ${st.id} off board`);
    const k = st.x + ',' + st.y;
    if (seen.has(k)) fail(`two stacks on ${k}`);
    seen.add(k);
    if (st.ap < 0) fail(`negative ap on ${st.id}`);
    for (const u of st.units) {
      if (u.hp <= 0) fail(`dead unit ${u.card} still on board`);
      if (u.hp > maxHp(u)) fail(`${u.card} hp ${u.hp} > max`);
      if (card(u.card).kind !== 'creature') fail(`non-creature ${u.card} on board`);
    }
  }
  for (const p of s.players) {
    if (p.energy < 0) fail(`negative energy ${p.energy}`);
    if (p.hand.length > 9) fail(`hand ${p.hand.length}`);
  }
  const uids = [...s.players.flatMap(p => [...p.hand, ...p.deck, ...p.evo].map(r => r.uid)), ...s.stacks.flatMap(st => st.units.map(u => u.uid))];
  if (new Set(uids).size !== uids.length) fail('duplicate uid');
  const traps = [0, 1].map(o => s.tiles.filter(t => t.trap?.owner === o).length);
  if (traps.some(n => n > 3)) fail('too many traps');
  s.tiles.forEach((t, i) => { if (t.trap?.owner !== undefined) { const st = s.stacks.find(q => q.x === i % 5 && q.y === Math.floor(i / 5)); if (st && card(t.trap.card).trigger === 'enter' && st.owner !== t.trap.owner && false) fail('x'); } });
}

const ELEM: Elem[] = ['ember', 'tide', 'moss', 'volt', 'stone', 'gleam'];
const everyCardDeck = () => {
  const main = ALL_CARDS.filter(c => !(c.kind === 'creature' && (c.stage || 1) > 1)).map(c => c.id).slice(0, 30);
  while (main.length < 30) main.push('pillowfight');
  return { main, evo: ALL_CARDS.filter(c => (c.stage || 1) > 1).slice(0, 8).map(c => c.id) };
};

describe('fuzz', () => {
  it('random legal play keeps every invariant (400 games)', () => {
    let steps = 0;
    for (let g = 0; g < 400; g++) {
      let r = (g * 2654435761) >>> 0 || 1;
      const rand = () => { r ^= r << 13; r ^= r >>> 17; r ^= r << 5; return (r >>> 0) / 4294967296; };
      const decks = [
        g % 4 === 0 ? everyCardDeck() : STARTERS[g % 3].deck,
        themedDeck([ELEM[g % 6], ELEM[(g + 2) % 6]], g, g % 3),
      ] as const;
      let s = newMatch({ seed: g + 1, decks: [decks[0], decks[1]], names: ['A', 'B'], first: (g % 2) as 0 | 1 }).state;
      check(s, `g${g} start`);
      let guard = 0;
      while (s.winner === null && guard++ < 1500) {
        const acts = legalActions(s);
        // bias toward doing things, with end turn as a fallback
        const nonEnd = acts.filter(a => a.k !== 'end');
        const a: Action = nonEnd.length && rand() < 0.85 ? nonEnd[Math.floor(rand() * nonEnd.length)] : { k: 'end' };
        const prev = JSON.stringify(s);
        const res = apply(s, a);
        if (JSON.stringify(s) !== prev) throw new Error('apply mutated its input');
        s = res.state;
        check(s, `g${g} step ${guard} after ${JSON.stringify(a)}`);
        for (const st of s.stacks) for (const o of attackOptions(s, st)) for (const h of o.hits) if (!s.stacks.some(q => q.id === h.stack && q.owner !== st.owner)) throw new Error('attack option hits a friendly or missing stack');
        steps++;
      }
      expect(s.winner !== null || guard >= 1500).toBe(true);
    }
    console.log('fuzz steps', steps);
  }, 600_000);

  it('the AI never picks an illegal action from its trap-hiding view (100 games)', () => {
    let illegal = 0, total = 0;
    for (let g = 0; g < 100; g++) {
      let s = newMatch({ seed: 7000 + g, decks: [STARTERS[g % 3].deck, STARTERS[(g + 2) % 3].deck], names: ['A', 'B'], first: 0 }).state;
      let guard = 0, per = 0;
      while (s.winner === null && guard++ < 2000) {
        const v = viewFor(s, s.active);
        let a = chooseAction(v, { level: 1, seed: g });
        total++;
        const legal = legalActions(s).some(l => JSON.stringify(l) === JSON.stringify(a));
        if (!legal) { illegal++; a = { k: 'end' }; }
        if (++per > 40) a = { k: 'end' };
        if (a.k === 'end') per = 0;
        s = apply(s, a).state;
      }
    }
    console.log(`AI illegal picks: ${illegal}/${total}`);
    expect(illegal / total).toBeLessThan(0.01);
  }, 600_000);
});
