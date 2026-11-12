// Stackbound rules engine. Pure and deterministic: apply(state, action) -> { state, events }.
// The renderer never mutates game state; it only plays back the events.
import { card, BEATS, nextStage, SKILLS, ELEMS } from './cards';
import type {
  Action, AttackOption, BoardEvent, CardRef, DeckList, Dir, Elem, EventKind, Ev, Facing, GameState, Mods, PlayerId, PlayerState, Stack, Unit,
} from './types';

export const W = 5, H = 5;
export const MAX_STACK = 3;
export const START_LIFE = 20;
export const HAND_LIMIT = 9;
export const MAX_TRAPS = 3;
export const STORM_TURN = 40;
export const DIRV: [number, number][] = [[0, 1], [1, 0], [0, -1], [-1, 0]];
/** Brass-gear control points: holding one at the start of your turn gives +1 energy. */
export const POINTS: [number, number][] = [[1, 2], [3, 2]];
export const EVENT_EVERY = 5;
export const isPoint = (x: number, y: number) => POINTS.some(([px, py]) => px === x && py === y);
export const pointsHeld = (s: GameState, p: PlayerId) => POINTS.filter(([x, y]) => stackAt(s, x, y)?.owner === p).length;

export const inB = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
export const tileIdx = (x: number, y: number) => y * W + x;
export const homeRow = (p: PlayerId) => (p === 0 ? 0 : H - 1);
export const canSummonRow = (p: PlayerId, y: number) => (p === 0 ? y <= 1 : y >= H - 2);
export const forward = (p: PlayerId): Dir => (p === 0 ? 0 : 2);
export const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

// ---------------------------------------------------------------- RNG (mulberry32, state lives in GameState)
export function rnd(s: { rng: number }): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function shuffle<T>(s: { rng: number }, a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd(s) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

// ---------------------------------------------------------------- queries
export const stackAt = (s: GameState, x: number, y: number) => s.stacks.find(t => t.x === x && t.y === y);
export const stackById = (s: GameState, id: number) => s.stacks.find(t => t.id === id);
export const lead = (st: Stack): Unit => st.units[st.units.length - 1];
export const maxHp = (u: Unit) => card(u.card).hp || 1;
export const tileAt = (s: GameState, x: number, y: number) => s.tiles[tileIdx(x, y)];

export function mods(s: GameState, st: Stack): Mods {
  const L = lead(st);
  const d = card(L.card);
  const kw = d.kw || [];
  const m: Mods = {
    power: d.power || 0, armor: d.armor || 0, thorns: d.thorns || 0, regen: d.regen || 0,
    actions: 2 + (kw.includes('swift') ? 1 : 0), range: d.range || 1, shape: d.shape || 'jab',
    pierce: kw.includes('pierce'), backGuard: false, anchor: false, cushion: 0,
    heavy: kw.includes('heavy'), hop: kw.includes('hop'), burst: kw.includes('burst'),
  };
  for (let i = 0; i < st.units.length - 1; i++) {
    const sp = card(st.units[i].card).support;
    if (!sp) continue;
    m.power += sp.power || 0; m.armor += sp.armor || 0; m.thorns += sp.thorns || 0; m.regen += sp.regen || 0;
    m.actions += sp.actions || 0; m.range += sp.range || 0; m.cushion += sp.cushion || 0;
    if (sp.backGuard) m.backGuard = true;
    if (sp.anchor) m.anchor = true;
  }
  if (L.gear) {
    const g = card(L.gear).gear!;
    if (g.shape) { m.shape = g.shape; m.range = Math.max(m.range, g.range || 1); }
    else if (g.range) m.range += g.range;
    m.power += g.power || 0; m.armor += g.armor || 0; m.actions += g.actions || 0;
    if (g.backGuard) m.backGuard = true;
    if (g.pierce) m.pierce = true;
  }
  const terr = tileAt(s, st.x, st.y).terrain;
  if (terr && d.elem) {
    if (terr === d.elem) { m.power += 1; m.armor += 1; }
    else if (BEATS[terr] === d.elem) m.power -= 1;
  }
  if (kw.includes('charge') && st.moved) m.power += 2;
  if (m.shape === 'lob') m.range = Math.max(2, m.range);
  m.armor += st.guard || 0;
  m.power = Math.max(0, m.power);
  return m;
}

export function facingOf(def: Stack, ax: number, ay: number, backGuard: boolean): Facing {
  const [fx, fy] = DIRV[def.dir];
  const vx = ax - def.x, vy = ay - def.y;
  const len = Math.hypot(vx, vy) || 1;
  const dot = (fx * vx + fy * vy) / len;
  if (dot > 0.5) return 'front';
  if (dot < -0.5) return backGuard ? 'side' : 'back';
  return 'side';
}
export const FACING_MULT: Record<Facing, number> = { front: 1, side: 1.5, back: 2 };

/** Damage an attack from `att` would deal to `def` before armor/traps. */
export function attackDamage(s: GameState, att: Stack, def: Stack, half: boolean) {
  const am = mods(s, att), dm = mods(s, def);
  const base = half ? Math.floor(am.power / 2) : am.power;
  const facing = facingOf(def, att.x, att.y, dm.backGuard);
  const ae = card(lead(att).card).elem, de = card(lead(def).card).elem;
  const adv = !!(ae && de && BEATS[ae] === de);
  let n = base * FACING_MULT[facing] * (adv ? 1.5 : 1);
  n = Math.floor(n);
  if (base > 0) n = Math.max(1, n);
  const final = Math.max(0, n - dm.armor);
  return { raw: n, final, facing, adv };
}

export function attackOptions(s: GameState, st: Stack): AttackOption[] {
  const m = mods(s, st);
  const [fx, fy] = DIRV[st.dir];
  const [lx, ly] = DIRV[(st.dir + 3) % 4];
  const [rx, ry] = DIRV[(st.dir + 1) % 4];
  const enemy = (x: number, y: number) => { const t = stackAt(s, x, y); return t && t.owner !== st.owner ? t : undefined; };
  const opts: AttackOption[] = [];
  const multi = (tiles: [number, number][]) => {
    const inside = tiles.filter(([x, y]) => inB(x, y));
    const hits = inside.map(([x, y]) => enemy(x, y)).filter(Boolean).map(t => ({ stack: t!.id, half: false }));
    if (hits.length) opts.push({ x: inside[0][0], y: inside[0][1], tiles: inside, hits });
  };
  switch (m.shape) {
    case 'jab': multi([[st.x + fx, st.y + fy]]); break;
    case 'cone': multi([[st.x + fx, st.y + fy], [st.x + fx + lx, st.y + fy + ly], [st.x + fx + rx, st.y + fy + ry]]); break;
    case 'sweep': multi([[st.x + fx, st.y + fy], [st.x + lx, st.y + ly], [st.x + rx, st.y + ry]]); break;
    case 'line': {
      const tiles: [number, number][] = [];
      const hits: { stack: number; half: boolean }[] = [];
      for (let i = 1; i <= m.range; i++) {
        const x = st.x + fx * i, y = st.y + fy * i;
        if (!inB(x, y)) break;
        tiles.push([x, y]);
        const t = stackAt(s, x, y);
        if (t) {
          if (t.owner !== st.owner) hits.push({ stack: t.id, half: false });
          if (!m.pierce) break;
        }
      }
      if (hits.length) opts.push({ x: tiles[0][0], y: tiles[0][1], tiles, hits });
      break;
    }
    case 'lob':
      for (let i = 2; i <= m.range; i++) {
        const x = st.x + fx * i, y = st.y + fy * i;
        if (!inB(x, y)) break;
        const t = enemy(x, y);
        if (t) opts.push({ x, y, tiles: [[x, y]], hits: [{ stack: t.id, half: false }] });
      }
      break;
    case 'splash':
      for (let i = 1; i <= m.range; i++) {
        const x = st.x + fx * i, y = st.y + fy * i;
        if (!inB(x, y)) break;
        const tiles: [number, number][] = [[x, y]];
        for (const [dx, dy] of DIRV) if (inB(x + dx, y + dy)) tiles.push([x + dx, y + dy]);
        const hits: { stack: number; half: boolean }[] = [];
        tiles.forEach(([tx, ty], k) => { const t = enemy(tx, ty); if (t) hits.push({ stack: t.id, half: k > 0 }); });
        if (hits.length) opts.push({ x, y, tiles, hits });
      }
      break;
  }
  if (st.y === homeRow(other(st.owner)) && m.power > 0) opts.push({ player: true, tiles: [], hits: [] });
  return opts;
}

export function moveTiles(s: GameState, st: Stack): [number, number][] {
  const m = mods(s, st);
  const out: [number, number][] = [];
  const ds: [number, number][] = m.hop ? [...DIRV, [1, 1], [1, -1], [-1, 1], [-1, -1]] : DIRV;
  for (const [dx, dy] of ds) {
    const x = st.x + dx, y = st.y + dy;
    if (inB(x, y) && !stackAt(s, x, y)) out.push([x, y]);
  }
  return out;
}

export function fuseTarget(s: GameState, st: Stack): { card: CardRef; cost: number } | null {
  if (st.units.length < 2) return null;
  const a = card(st.units[st.units.length - 1].card), b = card(st.units[st.units.length - 2].card);
  if (!a.family || a.family !== b.family) return null;
  const sa = a.stage || 1, sb = b.stage || 1;
  let want = 0;
  if (sa === 1 && sb === 1) want = 2;
  else if ((sa === 2 && sb === 1) || (sa === 1 && sb === 2)) want = 3;
  if (!want) return null;
  const P = s.players[st.owner];
  const ref = P.evo.find(r => { const c = card(r.card); return c.family === a.family && c.stage === want; });
  if (!ref) return null;
  return { card: ref, cost: card(ref.card).cost };
}

export const playCost = (cardId: string, onStack: boolean) => {
  const c = card(cardId).cost;
  return onStack ? Math.max(0, c - 1) : c;
};

const trapCount = (s: GameState, p: PlayerId) => s.tiles.filter(t => t.trap && t.trap.owner === p).length;

// ---------------------------------------------------------------- legal actions
export function legalActions(s: GameState): Action[] {
  if (s.winner !== null) return [];
  const p = s.active, P = s.players[p];
  const out: Action[] = [{ k: 'end' }];
  const mine = s.stacks.filter(t => t.owner === p);
  const theirs = s.stacks.filter(t => t.owner !== p);
  for (const ref of P.hand) {
    const c = card(ref.card);
    if (c.kind === 'creature') {
      if (c.cost <= P.energy) {
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
          if (canSummonRow(p, y) && !stackAt(s, x, y)) for (const dir of [0, 1, 2, 3] as Dir[]) out.push({ k: 'summon', card: ref.uid, x, y, dir });
      }
      if (playCost(c.id, true) <= P.energy)
        for (const st of mine) if (st.units.length < MAX_STACK) out.push({ k: 'stack', card: ref.uid, stack: st.id });
      continue;
    }
    if (c.cost > P.energy) continue;
    if (c.kind === 'spell') {
      const dirs = c.dirParam ? ([0, 1, 2, 3] as Dir[]) : [undefined];
      const pool = c.target === 'enemy' ? theirs : c.target === 'own' ? mine : c.target === 'any' ? s.stacks : [];
      if (c.target === 'none') out.push({ k: 'spell', card: ref.uid });
      else if (c.target === 'column') for (let x = 0; x < W; x++) out.push({ k: 'spell', card: ref.uid, x, y: 0 });
      else for (const t of pool) for (const dir of dirs) {
        if (c.fx?.t === 'rotate' && dir === t.dir) continue;
        if (c.fx?.t === 'rotate' || c.fx?.t === 'push') { if (t.owner !== p) { const m = mods(s, t); if (m.heavy || m.anchor) continue; } }
        out.push({ k: 'spell', card: ref.uid, x: t.x, y: t.y, dir });
      }
    } else if (c.kind === 'trap') {
      if (trapCount(s, p) >= MAX_TRAPS) continue;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const tl = tileAt(s, x, y);
        if (tl.trap) continue;
        const st = stackAt(s, x, y);
        if (c.trigger === 'enter' ? !st : st && st.owner === p) out.push({ k: 'trap', card: ref.uid, x, y });
      }
    } else if (c.kind === 'terrain') {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (tileAt(s, x, y).terrain !== c.elem) out.push({ k: 'terrain', card: ref.uid, x, y });
    } else if (c.kind === 'gear') {
      for (const st of mine) if (lead(st).gear !== c.id) out.push({ k: 'gear', card: ref.uid, stack: st.id });
    }
  }
  for (const st of mine) {
    const f = fuseTarget(s, st);
    if (f && f.cost <= P.energy) out.push({ k: 'fuse', stack: st.id });
    if (st.ap <= 0) continue;
    out.push(...skillActions(s, st));
    for (const [x, y] of moveTiles(s, st)) out.push({ k: 'move', stack: st.id, x, y });
    for (const dir of [0, 1, 2, 3] as Dir[]) if (dir !== st.dir) out.push({ k: 'turn', stack: st.id, dir });
    for (const o of attackOptions(s, st)) out.push(o.player ? { k: 'attack', stack: st.id, player: true } : { k: 'attack', stack: st.id, x: o.x, y: o.y });
  }
  return out;
}

const ADJ4 = (s: GameState, st: Stack) => DIRV.map(([dx, dy]) => stackAt(s, st.x + dx, st.y + dy)).filter((t): t is Stack => !!t);

export function skillActions(s: GameState, st: Stack): Action[] {
  const id = card(lead(st).card).skill;
  if (!id || st.skilled || st.ap <= 0) return [];
  const sk = SKILLS[id];
  if (s.players[st.owner].energy < sk.energy || st.ap < sk.ap) return [];
  const [fx, fy] = DIRV[st.dir];
  const out: Action[] = [];
  const adj = ADJ4(s, st);
  const enemyMovable = (t: Stack) => { const m = mods(s, t); return !m.heavy && !m.anchor; };
  switch (id) {
    case 'dash': if (inB(st.x + fx, st.y + fy) && !stackAt(s, st.x + fx, st.y + fy)) out.push({ k: 'skill', stack: st.id }); break;
    case 'taunt': if (adj.some(t => t.owner !== st.owner && enemyMovable(t) && faceToward(t, st) !== t.dir)) out.push({ k: 'skill', stack: st.id }); break;
    case 'swap': for (const t of adj) if (t.owner === st.owner) out.push({ k: 'skill', stack: st.id, x: t.x, y: t.y }); break;
    case 'guard': case 'brace': out.push({ k: 'skill', stack: st.id }); break;
    case 'mend': if ([st, ...adj.filter(t => t.owner === st.owner)].some(t => t.units.some(u => u.hp < maxHp(u)))) out.push({ k: 'skill', stack: st.id }); break;
    case 'zap': for (const t of s.stacks) if (t.owner !== st.owner && Math.max(Math.abs(t.x - st.x), Math.abs(t.y - st.y)) <= 2) out.push({ k: 'skill', stack: st.id, x: t.x, y: t.y }); break;
    case 'bump': { const t = stackAt(s, st.x + fx, st.y + fy); if (t && t.owner !== st.owner && enemyMovable(t)) out.push({ k: 'skill', stack: st.id }); break; }
    case 'rally': if (adj.some(t => t.owner === st.owner)) out.push({ k: 'skill', stack: st.id }); break;
    case 'whirl': for (const d of [0, 1, 2, 3] as Dir[]) if (d !== st.dir) out.push({ k: 'skill', stack: st.id, dir: d }); break;
  }
  return out;
}

/** The facing that points `t` at `at`. */
export function faceToward(t: { x: number; y: number }, at: { x: number; y: number }): Dir {
  const dx = at.x - t.x, dy = at.y - t.y;
  return (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 0 : 2)) as Dir;
}

export const actionKey = (a: Action) => JSON.stringify(a, Object.keys(a).sort());

// ---------------------------------------------------------------- match setup
export interface MatchConfig { seed: number; decks: [DeckList, DeckList]; names: [string, string]; first: PlayerId; life?: [number, number] }

export function newMatch(cfg: MatchConfig): { state: GameState; events: Ev[] } {
  const s: GameState = {
    rng: cfg.seed | 0 || 1, turn: 0, first: cfg.first, active: cfg.first,
    players: [null as unknown as PlayerState, null as unknown as PlayerState],
    stacks: [], tiles: Array.from({ length: W * H }, () => ({ terrain: null, trap: null })), nextId: 1, winner: null, event: null,
  };
  for (const p of [0, 1] as PlayerId[]) {
    const d = cfg.decks[p];
    const deck = d.main.map(c => ({ uid: s.nextId++, card: c }));
    shuffle(s, deck);
    // Opening-hand guarantee: at least 2 creatures in the first 5, one of them costing 2 or less.
    const isC = (r: CardRef) => card(r.card).kind === 'creature';
    const swapIn = (pred: (r: CardRef) => boolean) => {
      const from = deck.findIndex((r, i) => i >= 5 && pred(r));
      const to = deck.findIndex((r, i) => i < 5 && !isC(r));
      if (from >= 0 && to >= 0) [deck[from], deck[to]] = [deck[to], deck[from]];
    };
    for (const max of [1, 2]) {
      if (deck.slice(0, 5).some(r => isC(r) && card(r.card).cost <= max)) break;
      if (deck.slice(5).some(r => isC(r) && card(r.card).cost <= max)) { swapIn(r => isC(r) && card(r.card).cost <= max); break; }
    }
    while (deck.slice(0, 5).filter(isC).length < 2 && deck.slice(5).some(isC)) swapIn(isC);
    s.players[p] = {
      name: cfg.names[p], life: cfg.life?.[p] ?? START_LIFE, energy: 0, maxEnergy: 0, deck, hand: [], discard: [],
      evo: d.evo.map(c => ({ uid: s.nextId++, card: c })), fatigue: 0, turns: 0,
    };
  }
  const events: Ev[] = [];
  for (const p of [0, 1] as PlayerId[]) for (let i = 0; i < 5; i++) draw(s, p, events);
  scheduleEvent(s, EVENT_EVERY, events);
  startTurn(s, cfg.first, events);
  return { state: s, events };
}

// ---------------------------------------------------------------- mutation helpers
function draw(s: GameState, p: PlayerId, ev: Ev[]) {
  const P = s.players[p];
  const c = P.deck.shift();
  if (!c) {
    P.fatigue++;
    P.life -= P.fatigue;
    ev.push({ e: 'fatigue', p, n: P.fatigue });
    checkWin(s, ev);
    return;
  }
  if (P.hand.length >= HAND_LIMIT) { P.discard.push(c.card); ev.push({ e: 'burn', p, card: c.card }); return; }
  P.hand.push(c);
  ev.push({ e: 'draw', p, card: c.card, uid: c.uid });
}

function checkWin(s: GameState, ev: Ev[]) {
  if (s.winner !== null) return;
  const d0 = s.players[0].life <= 0, d1 = s.players[1].life <= 0;
  if (d0 || d1) {
    s.winner = d0 && d1 ? 'draw' : d0 ? 1 : 0;
    ev.push({ e: 'win', p: s.winner });
  }
}

function startTurn(s: GameState, p: PlayerId, ev: Ev[]) {
  s.active = p;
  s.turn++;
  const P = s.players[p];
  P.turns++;
  P.maxEnergy = Math.min(10, P.turns);
  P.energy = P.maxEnergy;
  ev.push({ e: 'turn', p, turn: s.turn });
  const held = pointsHeld(s, p);
  if (held) { P.energy += held; ev.push({ e: 'point', p, n: held }); }
  if (s.event && s.event.turn === s.turn) {
    resolveEvent(s, s.event, ev);
    scheduleEvent(s, s.turn + EVENT_EVERY, ev);
    if (s.winner !== null) return;
  }
  if (s.turn > 1) draw(s, p, ev);
  if (s.winner !== null) return;
  if (s.turn > STORM_TURN) {
    const n = Math.min(5, 1 + Math.floor((s.turn - STORM_TURN - 1) / 2));
    P.life -= n;
    ev.push({ e: 'storm', p, n });
    checkWin(s, ev);
    if (s.winner !== null) return;
  }
  for (const st of s.stacks) {
    if (st.owner !== p) continue;
    const m = mods(s, st);
    st.moved = false;
    st.attacked = false;
    st.skilled = false;
    st.guard = 0;
    st.ap = st.frozen > 0 ? 0 : m.actions + (st.bonusAp || 0);
    st.bonusAp = 0;
    if (m.regen > 0) heal(s, st, m.regen, ev, true);
  }
}

// ---------------------------------------------------------------- board events
const EVENT_KINDS: EventKind[] = ['draft', 'paw', 'glitter', 'windup', 'cleanup'];
function scheduleEvent(s: GameState, turn: number, ev: Ev[]) {
  const kind = EVENT_KINDS[Math.floor(rnd(s) * EVENT_KINDS.length)];
  const e: BoardEvent = { kind, turn };
  if (kind === 'paw') e.row = 1 + Math.floor(rnd(s) * 3);
  if (kind === 'draft') e.dir = Math.floor(rnd(s) * 4) as Dir;
  s.event = e;
  ev.push({ e: 'eventSoon', ev: { ...e } });
}
function resolveEvent(s: GameState, e: BoardEvent, ev: Ev[]) {
  ev.push({ e: 'boardEvent', ev: { ...e } });
  switch (e.kind) {
    case 'draft': {
      const [dx, dy] = DIRV[e.dir!];
      // move the stacks furthest along the wind first so they don't block each other
      const order = [...s.stacks].sort((a, b) => (b.x * dx + b.y * dy) - (a.x * dx + a.y * dy));
      for (const st of order) {
        if (!s.stacks.includes(st)) continue;
        const m = mods(s, st);
        if (m.heavy || m.anchor) continue;
        const x = st.x + dx, y = st.y + dy;
        if (!inB(x, y) || stackAt(s, x, y)) continue;
        ev.push({ e: 'push', stack: st.id, x, y, fx: st.x, fy: st.y, blocked: false });
        enterTile(s, st, x, y, ev);
      }
      break;
    }
    case 'paw':
      for (const st of s.stacks.filter(t => t.y === e.row)) damage(s, st, 3, ev);
      checkWin(s, ev);
      break;
    case 'glitter':
      for (let i = 0; i < 3; i++) {
        const k = Math.floor(rnd(s) * W * H);
        const elem = ELEMS[Math.floor(rnd(s) * ELEMS.length)];
        s.tiles[k].terrain = elem;
        ev.push({ e: 'terrain', x: k % W, y: Math.floor(k / W), elem, card: '' });
      }
      break;
    case 'windup':
      for (const st of s.stacks) { st.bonusAp = (st.bonusAp || 0) + 1; ev.push({ e: 'refresh', stack: st.id, n: 1 }); }
      break;
    case 'cleanup':
      s.tiles.forEach((t, k) => {
        if (t.terrain) { t.terrain = null; }
        if (t.trap) { s.players[t.trap.owner].discard.push(t.trap.card); ev.push({ e: 'trap', p: t.trap.owner, card: t.trap.card, x: k % W, y: Math.floor(k / W), stack: -1 }); t.trap = null; }
      });
      break;
  }
}

function heal(s: GameState, st: Stack, n: number, ev: Ev[], leadOnly = false) {
  for (let i = st.units.length - 1; i >= 0 && n > 0; i--) {
    const u = st.units[i];
    const room = maxHp(u) - u.hp;
    const h = Math.min(room, n);
    if (h > 0) { u.hp += h; n -= h; ev.push({ e: 'heal', stack: st.id, uid: u.uid, n: h }); }
    if (leadOnly) break;
  }
}

function removeStack(s: GameState, st: Stack, ev: Ev[]) {
  s.stacks = s.stacks.filter(t => t !== st);
  ev.push({ e: 'topple', stack: st.id, x: st.x, y: st.y, owner: st.owner });
}

/** Deal n damage to a stack (armor applies), spilling down. Returns true if the stack fell. */
function damage(s: GameState, st: Stack, n: number, ev: Ev[], meta: { facing?: Facing; adv?: boolean; src?: number } = {}, ignoreArmor = false): boolean {
  if (!s.stacks.includes(st)) return false;
  const m = mods(s, st);
  let rem = Math.max(0, n - (ignoreArmor ? 0 : m.armor));
  ev.push({ e: 'hit', stack: st.id, uid: lead(st).uid, n: rem, facing: meta.facing, adv: meta.adv, src: meta.src });
  const bursts: Stack[] = [];
  while (rem > 0 && st.units.length) {
    const L = lead(st);
    L.hp -= rem;
    if (L.hp > 0) break;
    rem = -L.hp;
    st.units.pop();
    const P = s.players[st.owner];
    P.discard.push(L.card);
    if (L.gear) P.discard.push(L.gear);
    ev.push({ e: 'ko', stack: st.id, uid: L.uid, card: L.card });
    if ((card(L.card).kw || []).includes('burst')) bursts.push({ ...st, units: [...st.units] });
    if (!st.units.length) break;
    rem = Math.max(0, rem - m.cushion);
    if (rem > 0) ev.push({ e: 'hit', stack: st.id, uid: lead(st).uid, n: rem, spill: true });
  }
  const fell = !st.units.length;
  if (fell) removeStack(s, st, ev);
  for (const b of bursts) adjDamage(s, b, 2, ev);
  return fell;
}

function adjDamage(s: GameState, from: { x: number; y: number; owner: PlayerId }, n: number, ev: Ev[]) {
  const targets = s.stacks.filter(t => t.owner !== from.owner && Math.max(Math.abs(t.x - from.x), Math.abs(t.y - from.y)) === 1);
  for (const t of targets) damage(s, t, n, ev);
  checkWin(s, ev);
}

function freeze(s: GameState, st: Stack, ev: Ev[]) {
  st.ap = 0;
  // Counts down at the end of the owner's turn: a stack frozen during its own turn also misses its next one.
  st.frozen = st.owner === s.active ? 2 : 1;
  ev.push({ e: 'freeze', stack: st.id });
}

/** Move a stack onto a tile and resolve snare traps. */
function enterTile(s: GameState, st: Stack, x: number, y: number, ev: Ev[]) {
  st.x = x; st.y = y;
  const tl = tileAt(s, x, y);
  if (!tl.trap || tl.trap.owner === st.owner) return;
  const tc = card(tl.trap.card);
  if (tc.trigger !== 'enter') return;
  if (mods(s, st).hop) return;
  const trap = tl.trap;
  tl.trap = null;
  s.players[trap.owner].discard.push(trap.card);
  ev.push({ e: 'trap', p: trap.owner, card: trap.card, x, y, stack: st.id });
  if (tc.trapFx === 'mousetrap') damage(s, st, 3, ev);
  else if (tc.trapFx === 'yarn') freeze(s, st, ev);
  else if (tc.trapFx === 'spring') {
    const back = st.owner === 0 ? -1 : 1;
    let ny = st.y;
    for (let i = 0; i < 2; i++) { const t = ny + back; if (!inB(st.x, t) || stackAt(s, st.x, t)) break; ny = t; }
    if (ny !== st.y) {
      const fy = st.y;
      st.y = ny;
      ev.push({ e: 'push', stack: st.id, x: st.x, y: ny, fx: st.x, fy, blocked: false });
    }
  }
}

function push(s: GameState, st: Stack, dir: Dir, ev: Ev[]) {
  const [dx, dy] = DIRV[dir];
  const x = st.x + dx, y = st.y + dy;
  if (!inB(x, y) || stackAt(s, x, y)) {
    ev.push({ e: 'push', stack: st.id, x: st.x, y: st.y, fx: st.x, fy: st.y, blocked: true });
    damage(s, st, 1, ev, {}, true);
    return;
  }
  const fx = st.x, fy = st.y;
  ev.push({ e: 'push', stack: st.id, x, y, fx, fy, blocked: false });
  enterTile(s, st, x, y, ev);
}

function runEffect(s: GameState, p: PlayerId, fx: NonNullable<ReturnType<typeof card>['onPlay']>, ev: Ev[], tgt?: Stack, dir?: Dir, src?: Stack) {
  const P = s.players[p];
  switch (fx.t) {
    case 'damage': if (tgt) damage(s, tgt, fx.n, ev); break;
    case 'heal': if (tgt) heal(s, tgt, fx.n, ev); break;
    case 'healAll': for (const t of s.stacks.filter(t => t.owner === p)) heal(s, t, fx.n, ev); break;
    case 'draw': for (let i = 0; i < fx.n; i++) draw(s, p, ev); break;
    case 'energy': P.energy += fx.n; ev.push({ e: 'energy', p, n: fx.n }); break;
    case 'rotate': if (tgt && dir !== undefined) { tgt.dir = dir; ev.push({ e: 'turnTo', stack: tgt.id, dir }); } break;
    case 'push': if (tgt && dir !== undefined) push(s, tgt, dir, ev); break;
    case 'freeze': if (tgt) freeze(s, tgt, ev); break;
    case 'refresh': if (tgt) { tgt.ap += fx.n; ev.push({ e: 'refresh', stack: tgt.id, n: fx.n }); } break;
    case 'adjDamage': if (src) adjDamage(s, src, fx.n, ev); break;
    case 'adjFreeze':
      if (src) for (const t of s.stacks.filter(t => t.owner !== p && Math.max(Math.abs(t.x - src.x), Math.abs(t.y - src.y)) === 1)) freeze(s, t, ev);
      break;
    case 'column': break;
  }
  checkWin(s, ev);
}

function takeFromHand(P: PlayerState, uid: number): CardRef {
  const i = P.hand.findIndex(r => r.uid === uid);
  if (i < 0) throw new Error('card not in hand');
  return P.hand.splice(i, 1)[0];
}

function resolveAttack(s: GameState, st: Stack, opt: AttackOption, ev: Ev[]) {
  const m = mods(s, st);
  const foe = other(st.owner);
  st.ap = 0;
  st.attacked = true;
  if (opt.player) {
    ev.push({ e: 'attack', stack: st.id, shape: m.shape, tiles: [], player: foe });
    s.players[foe].life -= m.power;
    ev.push({ e: 'playerHit', p: foe, n: m.power, src: st.id });
    checkWin(s, ev);
    return;
  }
  ev.push({ e: 'attack', stack: st.id, shape: m.shape, tiles: opt.tiles });
  // Snapshot the numbers first so the order of hits doesn't change them.
  const plan = opt.hits.map(h => {
    const t = stackById(s, h.stack)!;
    return { t, half: h.half, dmg: attackDamage(s, st, t, h.half), thorns: mods(s, t).thorns };
  });
  for (const h of plan) {
    if (!s.stacks.includes(h.t)) continue;
    const tl = tileAt(s, h.t.x, h.t.y);
    let negate = false;
    if (tl.trap && tl.trap.owner === h.t.owner && card(tl.trap.card).trigger === 'attacked') {
      const trap = tl.trap;
      tl.trap = null;
      s.players[trap.owner].discard.push(trap.card);
      ev.push({ e: 'trap', p: trap.owner, card: trap.card, x: h.t.x, y: h.t.y, stack: st.id });
      const fx = card(trap.card).trapFx;
      if (fx === 'pillow') negate = true;
      if (fx === 'mirror' && s.stacks.includes(st)) damage(s, st, h.dmg.raw, ev, { src: h.t.id });
    }
    if (!negate) damage(s, h.t, h.dmg.raw, ev, { facing: h.dmg.facing, adv: h.dmg.adv, src: st.id });
    else ev.push({ e: 'hit', stack: h.t.id, uid: h.t.units.length ? lead(h.t).uid : 0, n: 0, facing: h.dmg.facing, src: st.id });
    const dist = Math.max(Math.abs(h.t.x - st.x), Math.abs(h.t.y - st.y));
    if (h.thorns > 0 && dist === 1 && s.stacks.includes(st)) damage(s, st, h.thorns, ev, { src: h.t.id });
  }
  checkWin(s, ev);
}

// ---------------------------------------------------------------- apply
export function apply(prev: GameState, a: Action, trusted = false): { state: GameState; events: Ev[] } {
  if (prev.winner !== null) throw new Error('match is over');
  if (!trusted) {
    const key = actionKey(a);
    if (!legalActions(prev).some(l => actionKey(l) === key)) throw new Error('illegal action ' + key);
  }
  const s: GameState = structuredClone(prev);
  const ev: Ev[] = [];
  const p = s.active, P = s.players[p];
  switch (a.k) {
    case 'end':
      for (const st of s.stacks) if (st.owner === p && st.frozen > 0) st.frozen--;
      startTurn(s, other(p), ev);
      break;
    case 'summon': {
      const ref = takeFromHand(P, a.card);
      P.energy -= card(ref.card).cost;
      const st: Stack = { id: s.nextId++, owner: p, x: a.x, y: a.y, dir: a.dir, units: [{ uid: ref.uid, card: ref.card, hp: card(ref.card).hp!, gear: null }], ap: 0, moved: false, frozen: 0, attacked: false, guard: 0, skilled: false, bonusAp: 0 };
      s.stacks.push(st);
      ev.push({ e: 'summon', p, stack: st.id, x: a.x, y: a.y, dir: a.dir, card: ref.card, uid: ref.uid });
      enterTile(s, st, a.x, a.y, ev);
      const op = card(ref.card).onPlay;
      if (op && s.stacks.includes(st)) runEffect(s, p, op, ev, st, undefined, st);
      break;
    }
    case 'stack': {
      const st = stackById(s, a.stack)!;
      const ref = takeFromHand(P, a.card);
      P.energy -= playCost(ref.card, true);
      st.units.push({ uid: ref.uid, card: ref.card, hp: card(ref.card).hp!, gear: null });
      ev.push({ e: 'stackOn', p, stack: st.id, card: ref.card, uid: ref.uid });
      const op = card(ref.card).onPlay;
      if (op) runEffect(s, p, op, ev, st, undefined, st);
      break;
    }
    case 'fuse': {
      const st = stackById(s, a.stack)!;
      const f = fuseTarget(s, st)!;
      P.energy -= f.cost;
      P.evo = P.evo.filter(r => r.uid !== f.card.uid);
      const top = st.units.pop()!, under = st.units.pop()!;
      for (const u of [top, under]) { P.discard.push(u.card); if (u.gear) P.discard.push(u.gear); }
      st.units.push({ uid: f.card.uid, card: f.card.card, hp: card(f.card.card).hp!, gear: null });
      ev.push({ e: 'fuse', p, stack: st.id, from: [under.uid, top.uid], card: f.card.card, uid: f.card.uid });
      const op = card(f.card.card).onPlay;
      if (op) runEffect(s, p, op, ev, st, undefined, st);
      break;
    }
    case 'spell': {
      const ref = takeFromHand(P, a.card);
      const c = card(ref.card);
      P.energy -= c.cost;
      P.discard.push(c.id);
      ev.push({ e: 'spell', p, card: c.id, x: a.x, y: a.y });
      if (c.fx!.t === 'column') {
        for (const t of s.stacks.filter(t => t.owner !== p && t.x === a.x)) damage(s, t, c.fx!.n, ev);
        checkWin(s, ev);
      } else {
        const tgt = a.x !== undefined ? stackAt(s, a.x, a.y!) : undefined;
        runEffect(s, p, c.fx!, ev, tgt, a.dir);
      }
      break;
    }
    case 'trap': {
      const ref = takeFromHand(P, a.card);
      P.energy -= card(ref.card).cost;
      tileAt(s, a.x, a.y).trap = { owner: p, card: ref.card, uid: ref.uid };
      ev.push({ e: 'trapSet', p, x: a.x, y: a.y, uid: ref.uid, card: ref.card });
      break;
    }
    case 'terrain': {
      const ref = takeFromHand(P, a.card);
      const c = card(ref.card);
      P.energy -= c.cost;
      P.discard.push(c.id);
      tileAt(s, a.x, a.y).terrain = c.elem as Elem;
      ev.push({ e: 'terrain', x: a.x, y: a.y, elem: c.elem as Elem, card: c.id });
      break;
    }
    case 'gear': {
      const st = stackById(s, a.stack)!;
      const ref = takeFromHand(P, a.card);
      P.energy -= card(ref.card).cost;
      const L = lead(st);
      if (L.gear) P.discard.push(L.gear);
      const before = mods(s, st).actions;
      L.gear = ref.card;
      const extra = mods(s, st).actions - before;
      if (extra > 0 && st.ap > 0) st.ap += extra;
      ev.push({ e: 'gear', stack: st.id, card: ref.card });
      break;
    }
    case 'move': {
      const st = stackById(s, a.stack)!;
      st.ap--;
      st.moved = true;
      const fx = st.x, fy = st.y;
      ev.push({ e: 'move', stack: st.id, x: a.x, y: a.y, fx, fy });
      enterTile(s, st, a.x, a.y, ev);
      break;
    }
    case 'turn': {
      const st = stackById(s, a.stack)!;
      st.ap--;
      st.dir = a.dir;
      ev.push({ e: 'turnTo', stack: st.id, dir: a.dir });
      break;
    }
    case 'skill': {
      const st = stackById(s, a.stack)!;
      const id = card(lead(st).card).skill!;
      const sk = SKILLS[id];
      st.skilled = true;
      st.ap -= sk.ap;
      P.energy -= sk.energy;
      ev.push({ e: 'skill', stack: st.id, skill: id, x: a.x, y: a.y });
      const adj = ADJ4(s, st);
      switch (id) {
        case 'dash':
          for (let i = 0; i < 2; i++) {
            const [dx, dy] = DIRV[st.dir];
            const x = st.x + dx, y = st.y + dy;
            if (!inB(x, y) || stackAt(s, x, y) || !s.stacks.includes(st) || st.frozen) break;
            st.moved = true;
            ev.push({ e: 'move', stack: st.id, x, y, fx: st.x, fy: st.y });
            enterTile(s, st, x, y, ev);
          }
          break;
        case 'taunt':
          for (const t of adj) {
            if (t.owner === st.owner) continue;
            const m = mods(s, t);
            if (m.heavy || m.anchor) continue;
            t.dir = faceToward(t, st);
            ev.push({ e: 'turnTo', stack: t.id, dir: t.dir });
          }
          break;
        case 'swap': {
          const t = stackAt(s, a.x!, a.y!)!;
          const [ox, oy] = [st.x, st.y];
          ev.push({ e: 'move', stack: st.id, x: t.x, y: t.y, fx: ox, fy: oy });
          ev.push({ e: 'move', stack: t.id, x: ox, y: oy, fx: t.x, fy: t.y });
          st.x = t.x; st.y = t.y; t.x = ox; t.y = oy;
          break;
        }
        case 'guard':
          for (const t of [st, ...adj.filter(t => t.owner === st.owner)]) { t.guard = (t.guard || 0) + 1; ev.push({ e: 'guard', stack: t.id, n: 1 }); }
          break;
        case 'brace': st.guard = (st.guard || 0) + 2; ev.push({ e: 'guard', stack: st.id, n: 2 }); break;
        case 'mend': for (const t of [st, ...adj.filter(t => t.owner === st.owner)]) heal(s, t, 2, ev); break;
        case 'zap': { const t = stackAt(s, a.x!, a.y!); if (t) damage(s, t, 2, ev, { src: st.id }); checkWin(s, ev); break; }
        case 'bump': { const [dx, dy] = DIRV[st.dir]; const t = stackAt(s, st.x + dx, st.y + dy); if (t) push(s, t, st.dir, ev); break; }
        case 'rally': for (const t of adj) if (t.owner === st.owner) { t.ap += 1; ev.push({ e: 'refresh', stack: t.id, n: 1 }); } break;
        case 'whirl': st.dir = a.dir!; ev.push({ e: 'turnTo', stack: st.id, dir: a.dir! }); break;
      }
      break;
    }
    case 'attack': {
      const st = stackById(s, a.stack)!;
      const opt = attackOptions(s, st).find(o => (a.player ? o.player : !o.player && o.x === a.x && o.y === a.y));
      if (!opt) throw new Error('no such attack');
      resolveAttack(s, st, opt, ev);
      break;
    }
  }
  return { state: s, events: ev };
}

/** The view of a state a player is allowed to see: hides the opponent's traps, hand and deck order. */
export function viewFor(s: GameState, p: PlayerId): GameState {
  const v: GameState = structuredClone(s);
  for (const t of v.tiles) if (t.trap && t.trap.owner !== p) t.trap = null;
  return v;
}
