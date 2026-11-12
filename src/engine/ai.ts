// Greedy AI: scores every legal action by simulating it, with one step of follow-up for moves
// and a threat model of what the opponent can hit next turn. Runs on a view with enemy traps hidden.
import { card } from './cards';
import {
  actionKey, apply, attackDamage, pointsHeld, attackOptions, canSummonRow, DIRV, homeRow, inB, legalActions, lead, mods, other, stackAt, stackById,
} from './rules';
import type { Action, Dir, GameState, PlayerId, Stack } from './types';

export interface AiOpts { level: 0 | 1 | 2 | 3; seed: number; banned?: string[] }

function unitValue(s: GameState, st: Stack): number {
  const m = mods(s, st);
  let v = 0;
  st.units.forEach((u, i) => {
    const c = card(u.card);
    const top = i === st.units.length - 1;
    v += 1.5 + (c.stage || 1) * 1.2 + u.hp * 0.55 + (top ? m.power * 1.3 : (c.power || 0) * 0.3 + 0.8);
  });
  v += m.armor * 1.4 + m.thorns * 0.7 + m.regen * 0.9 + (m.actions - 2) * 1.2 + (m.range - 1) * 0.4;
  if (m.backGuard) v += 0.6;
  return v;
}

/** How much damage enemies of `me` could deal to `st` next turn (rough). */
function threatTo(s: GameState, me: PlayerId): { perStack: Map<number, number>; face: number } {
  const per = new Map<number, number>();
  let face = 0;
  for (const e of s.stacks) {
    if (e.owner === me) continue;
    const ox = e.x, oy = e.y, od = e.dir;
    const cands: [number, number, Dir][] = [];
    for (const d of [0, 1, 2, 3] as Dir[]) cands.push([e.x, e.y, d]);
    const m = mods(s, e);
    const steps: [number, number][] = m.hop ? [...DIRV, [1, 1], [1, -1], [-1, 1], [-1, -1]] : DIRV;
    for (const [dx, dy] of steps) { const x = e.x + dx, y = e.y + dy; if (inB(x, y) && !stackAt(s, x, y)) cands.push([x, y, e.dir]); }
    const best = new Map<number, number>();
    let bestFace = 0;
    for (const [x, y, d] of cands) {
      e.x = x; e.y = y; e.dir = d;
      for (const o of attackOptions(s, e)) {
        if (o.player) { bestFace = Math.max(bestFace, mods(s, e).power); continue; }
        for (const h of o.hits) {
          const t = stackById(s, h.stack)!;
          const dmg = attackDamage(s, e, t, h.half).final;
          best.set(t.id, Math.max(best.get(t.id) || 0, dmg));
        }
      }
    }
    e.x = ox; e.y = oy; e.dir = od;
    for (const [id, d] of best) per.set(id, (per.get(id) || 0) + d);
    face += bestFace;
  }
  return { perStack: per, face };
}

export function evaluate(s: GameState, me: PlayerId, deep: boolean): number {
  const opp = other(me);
  if (s.winner === me) return 1e6;
  if (s.winner === opp) return -1e6;
  if (s.winner === 'draw') return -5e5;
  const P = s.players[me], O = s.players[opp];
  let sc = (P.life - O.life) * 2.4;
  if (O.life <= 6) sc += (7 - O.life) * 1.5;
  if (P.life <= 6) sc -= (7 - P.life) * 1.5;
  for (const st of s.stacks) {
    const v = unitValue(s, st);
    const adv = st.owner === 0 ? st.y : 4 - st.y;
    const pos = adv * 0.35 + (st.y === homeRow(other(st.owner)) ? 2.2 : 0) + (st.x === 2 ? 0.3 : 0);
    if (st.owner === me) sc += v + pos; else sc -= v + pos;
  }
  sc += (P.hand.length - O.hand.length) * 0.65;
  sc += P.evo.length * 0.1;
  sc += (pointsHeld(s, me) - pointsHeld(s, opp)) * 2.2;
  if (s.event?.kind === 'paw' && s.event.turn - s.turn <= 1) for (const st of s.stacks) if (st.y === s.event.row) sc += (st.owner === me ? -1 : 1) * unitValue(s, st) * 0.3;
  for (const t of s.tiles) if (t.trap && t.trap.owner === me) sc += card(t.trap.card).trigger === 'attacked' ? 1.8 : 1.3;
  if (deep) {
    const th = threatTo(s, me);
    for (const st of s.stacks) {
      if (st.owner !== me) continue;
      const d = th.perStack.get(st.id) || 0;
      if (!d) continue;
      const hp = lead(st).hp;
      const lethal = d >= hp;
      sc -= Math.min(d, hp) * 0.5 + (lethal ? unitValue(s, st) * 0.35 : 0);
    }
    sc -= th.face * 1.6;
  }
  return sc;
}

function prune(s: GameState, acts: Action[]): Action[] {
  // For summons only keep facings that point forward or toward the nearest enemy.
  const me = s.active;
  const enemies = s.stacks.filter(t => t.owner !== me);
  return acts.filter(a => {
    if (a.k !== 'summon') return true;
    if (!canSummonRow(me, a.y)) return false;
    const fwd: Dir = me === 0 ? 0 : 2;
    if (a.dir === fwd) return true;
    if (!enemies.length) return false;
    let best = enemies[0], bd = 99;
    for (const e of enemies) { const d = Math.abs(e.x - a.x) + Math.abs(e.y - a.y); if (d < bd) { bd = d; best = e; } }
    const dx = best.x - a.x, dy = best.y - a.y;
    const want: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 0 : 2);
    return a.dir === want;
  });
}

function bestAttackGain(s: GameState, me: PlayerId, deep: boolean, base: number): number {
  let best = 0;
  for (const st of s.stacks) {
    if (st.owner !== me || st.ap <= 0) continue;
    for (const o of attackOptions(s, st)) {
      const a: Action = o.player ? { k: 'attack', stack: st.id, player: true } : { k: 'attack', stack: st.id, x: o.x, y: o.y };
      const r = apply(s, a, true).state;
      best = Math.max(best, evaluate(r, me, deep) - base);
    }
  }
  return best;
}

export function chooseAction(s: GameState, opts: AiOpts): Action {
  const me = s.active;
  let r = (opts.seed ^ (s.turn * 7919) ^ (s.nextId * 104729)) >>> 0 || 1;
  const rand = () => { r ^= r << 13; r ^= r >>> 17; r ^= r << 5; r >>>= 0; return r / 4294967296; };
  const deep = opts.level >= 1;
  const noise = [3.5, 1.4, 0.4, 0][opts.level];
  const base = evaluate(s, me, deep);
  const banned = new Set(opts.banned || []);
  const acts = prune(s, legalActions(s).filter(a => a.k !== 'end' && !banned.has(actionKey(a))));
  let best: Action = { k: 'end' };
  let bestSc = base + 0.25;
  for (const a of acts) {
    let next: GameState;
    try { next = apply(s, a, true).state; } catch { continue; }
    let sc = evaluate(next, me, deep);
    if (opts.level >= 1 && (a.k === 'move' || a.k === 'turn' || a.k === 'gear' || a.k === 'stack' || a.k === 'skill' || (a.k === 'spell' && card(s.players[me].hand.find(h => h.uid === a.card)!.card).fx?.t === 'refresh'))) {
      sc += 0.85 * bestAttackGain(next, me, deep, sc);
    }
    sc += (rand() - 0.5) * noise;
    if (sc > bestSc) { bestSc = sc; best = a; }
  }
  return best;
}
