import { describe, expect, it } from 'vitest';
import { ALL_CARDS, card } from '../src/engine/cards';
import { STARTERS, themedDeck, validateDeck } from '../src/engine/decks';
import { apply, attackDamage, attackOptions, fuseTarget, legalActions, mods, newMatch, stackAt } from '../src/engine/rules';
import { chooseAction } from '../src/engine/ai';
import type { Action, GameState, Stack } from '../src/engine/types';

const blank = () => newMatch({ seed: 42, decks: [STARTERS[0].deck, STARTERS[1].deck], names: ['A', 'B'], first: 0 }).state;

function put(s: GameState, owner: 0 | 1, x: number, y: number, cards: string[], dir: 0 | 1 | 2 | 3 = owner === 0 ? 0 : 2): Stack {
  const st: Stack = { id: s.nextId++, owner, x, y, dir, units: cards.map(c => ({ uid: s.nextId++, card: c, hp: card(c).hp!, gear: null })), ap: 2, moved: false, frozen: 0, attacked: false };
  s.stacks.push(st);
  return st;
}

describe('card set', () => {
  it('has 64 cards with unique ids and complete families', () => {
    expect(ALL_CARDS.length).toBe(64);
    expect(new Set(ALL_CARDS.map(c => c.id)).size).toBe(64);
    const fams = new Set(ALL_CARDS.filter(c => c.family).map(c => c.family));
    expect(fams.size).toBe(10);
    for (const f of fams) expect(ALL_CARDS.filter(c => c.family === f).map(c => c.stage).sort()).toEqual([1, 2, 3]);
  });
  it('starter decks are legal', () => {
    for (const s of STARTERS) expect(validateDeck(s.deck)).toEqual([]);
  });
  it('themed AI decks are legal', () => {
    for (let lv = 0; lv < 3; lv++) for (let i = 0; i < 20; i++) {
      const d = themedDeck([['ember', 'tide', 'moss', 'volt', 'stone', 'gleam'][i % 6] as never, ['stone', 'gleam'][i % 2] as never], i * 31 + lv, lv);
      expect(validateDeck(d)).toEqual([]);
    }
  });
});

describe('rules', () => {
  it('deals 5 cards and starts player 0 with 1 energy', () => {
    const s = blank();
    expect(s.players[0].hand.length).toBe(5);
    expect(s.players[1].hand.length).toBe(5);
    expect(s.players[0].energy).toBe(1);
  });

  it('facing multipliers: front x1, side x1.5, back x2', () => {
    const s = blank();
    const a = put(s, 0, 2, 2, ['matchpup']);
    const d = put(s, 1, 2, 3, ['bathduck'], 2); // faces S toward attacker: front
    expect(attackDamage(s, a, d, false).facing).toBe('front');
    d.dir = 0; // faces away: back
    expect(attackDamage(s, a, d, false).facing).toBe('back');
    expect(attackDamage(s, a, d, false).raw).toBe(4);
    d.dir = 1;
    expect(attackDamage(s, a, d, false).facing).toBe('side');
    expect(attackDamage(s, a, d, false).raw).toBe(3);
  });

  it('type advantage x1.5 and armor', () => {
    const s = blank();
    const a = put(s, 0, 2, 2, ['matchpup']); // ember beats moss
    const d = put(s, 1, 2, 3, ['sproutpot'], 2);
    const r = attackDamage(s, a, d, false);
    expect(r.adv).toBe(true);
    expect(r.raw).toBe(3);
  });

  it('damage spills down a stack and topples it', () => {
    const s = blank();
    s.stacks = [];
    const a = put(s, 0, 2, 2, ['gigascarab']); // power 6, pierce line
    const d = put(s, 1, 2, 3, ['lampmoth', 'lampmoth'], 0); // back to attacker: x2 -> 12
    s.active = 0;
    const { state, events } = apply(s, { k: 'attack', stack: a.id, x: 2, y: 3 }, true);
    expect(stackAt(state, 2, 3)).toBeUndefined();
    expect(events.filter(e => e.e === 'ko').length).toBe(2);
    expect(events.some(e => e.e === 'topple')).toBe(true);
    void d;
  });

  it('support creatures add to the lead', () => {
    const s = blank();
    const st = put(s, 0, 1, 1, ['battbug', 'marblet']);
    const m = mods(s, st);
    expect(m.actions).toBe(3);
    expect(m.armor).toBe(1);
  });

  it('fuse needs two of a family and the evolved card in the pile', () => {
    const s = blank();
    s.stacks = [];
    s.active = 0;
    const st = put(s, 0, 1, 1, ['matchpup', 'matchpup']);
    s.players[0].energy = 10;
    expect(fuseTarget(s, st)?.card.card).toBe('kilnhound');
    const { state } = apply(s, { k: 'fuse', stack: st.id });
    const after = state.stacks.find(t => t.id === st.id)!;
    expect(after.units.length).toBe(1);
    expect(after.units[0].card).toBe('kilnhound');
    expect(state.players[0].evo.filter(r => r.card === 'kilnhound').length).toBe(1);
  });

  it('snare traps trigger on enter and hop ignores them', () => {
    const s = blank();
    s.stacks = [];
    s.active = 0;
    s.tiles[3 * 5 + 2].trap = { owner: 1, card: 'mousetrap', uid: 999 };
    const st = put(s, 0, 2, 2, ['marblet']);
    const r = apply(s, { k: 'move', stack: st.id, x: 2, y: 3 }, true);
    expect(r.events.some(e => e.e === 'trap')).toBe(true);
    expect(r.state.stacks[0].units[0].hp).toBe(4 - (3 - 1)); // armor 1
    const s2 = blank();
    s2.stacks = [];
    s2.active = 0;
    s2.tiles[3 * 5 + 2].trap = { owner: 1, card: 'mousetrap', uid: 999 };
    const f = put(s2, 0, 2, 2, ['feltfrog']);
    const r2 = apply(s2, { k: 'move', stack: f.id, x: 2, y: 3 }, true);
    expect(r2.events.some(e => e.e === 'trap')).toBe(false);
  });

  it('direct attacks from the enemy home row hit life points', () => {
    const s = blank();
    s.stacks = [];
    s.active = 0;
    const st = put(s, 0, 0, 4, ['matchpup']);
    const opts = attackOptions(s, st);
    expect(opts.some(o => o.player)).toBe(true);
    const r = apply(s, { k: 'attack', stack: st.id, player: true }, true);
    expect(r.state.players[1].life).toBe(18);
  });

  it('every legal action applies cleanly', () => {
    const s = blank();
    for (const a of legalActions(s)) expect(() => apply(s, a)).not.toThrow();
  });
});

describe('AI self-play', () => {
  it('plays 60 full matches without errors and they end', () => {
    let totalTurns = 0, p0 = 0;
    for (let g = 0; g < 60; g++) {
      const d0 = STARTERS[g % 3].deck, d1 = STARTERS[(g + 1) % 3].deck;
      let s = newMatch({ seed: 1000 + g, decks: [d0, d1], names: ['A', 'B'], first: (g % 2) as 0 | 1 }).state;
      let guard = 0, perTurn = 0;
      while (s.winner === null && guard++ < 3000) {
        const lv = (s.active === 0 ? 2 : 1) as 1 | 2;
        let a: Action = chooseAction(s, { level: lv, seed: g });
        if (++perTurn > 40) a = { k: 'end' };
        if (a.k === 'end') perTurn = 0;
        s = apply(s, a).state;
      }
      expect(s.winner).not.toBeNull();
      totalTurns += s.turn;
      if (s.winner === 0) p0++;
    }
    console.log(`avg turns ${(totalTurns / 60).toFixed(1)}, level-2 AI won ${p0}/60 vs level-1`);
  }, 600_000);
});
