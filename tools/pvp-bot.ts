// Joins a room by code and plays it with the AI.  npx vite-node tools/pvp-bot.ts CODE [http://localhost:8787]
import { chooseAction } from '../src/engine/ai';
import { STARTERS } from '../src/engine/decks';
import type { GameState, PlayerId } from '../src/engine/types';
const code = process.argv[2], base = process.argv[3] || 'http://localhost:8787';
const ws = new WebSocket(base.replace(/^http/, 'ws') + `/api/room/${code}/ws`);
let seat: PlayerId = 1;
ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', token: 'bot-' + Date.now(), name: 'Bot Bernie', deck: STARTERS[2].deck }));
ws.onmessage = e => {
  const m = JSON.parse(String(e.data));
  if (m.t === 'error') { console.log('error', m.msg); process.exit(1); }
  if (m.t === 'start' || m.t === 'events') {
    if (m.t === 'start') seat = m.seat;
    const S = m.state as GameState;
    if (S.winner !== null) { console.log('game over, winner', S.winner, 'turn', S.turn); process.exit(0); }
    if (S.active === seat) setTimeout(() => ws.send(JSON.stringify({ t: 'act', action: chooseAction(S, { level: 1, seed: S.turn }) })), 600);
  }
};
