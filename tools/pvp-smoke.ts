// PvP smoke test: two scripted players join a room and play a whole match via the server.
//   npx vite-node tools/pvp-smoke.ts [http://localhost:8787]
import { chooseAction } from '../src/engine/ai';
import { STARTERS } from '../src/engine/decks';
import type { Action, GameState, PlayerId } from '../src/engine/types';

const base = process.argv[2] || 'http://localhost:8787';
const r = await fetch(base + '/api/room', { method: 'POST' });
const { code } = await r.json();
console.log('room', code);

let leaks = 0, rejects = 0, moves = 0;
function player(i: number) {
  return new Promise<{ winner: unknown; turns: number }>(res => {
    const ws = new WebSocket(base.replace(/^http/, 'ws') + `/api/room/${code}/ws`);
    let seat: PlayerId = 0;
    let S: GameState | null = null;
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', token: 'tok' + i, name: 'P' + i, deck: STARTERS[i].deck }));
    ws.onmessage = e => {
      const m = JSON.parse(String(e.data));
      if (m.t === 'error') { console.log('error', m.msg); process.exit(1); }
      if (m.t === 'reject') rejects++;
      if (m.t === 'start' || m.t === 'events') {
        if (m.t === 'start') seat = m.seat;
        S = m.state as GameState;
        const o = 1 - seat;
        if (S.players[o].hand.some(h => h.card !== '?')) leaks++;
        if (S.tiles.some(t => t.trap && t.trap.owner !== seat)) leaks++;
        for (const ev of m.events) if (ev.e === 'draw' && ev.p !== seat && ev.card !== '?') leaks++;
        if (S.winner !== null) { ws.close(); res({ winner: S.winner, turns: S.turn }); return; }
        if (S.active === seat) {
          let a: Action = chooseAction(S, { level: 1, seed: S.turn });
          if (++moves % 40 === 0) a = { k: 'end' };
          setTimeout(() => ws.send(JSON.stringify({ t: 'act', action: a })), 5);
        }
      }
    };
  });
}
const [a, b] = await Promise.all([player(0), player(1)]);
console.log('result', a, b, { leaks, rejects, moves });
process.exit(leaks ? 1 : 0);
