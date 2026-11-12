// Stackbound PvP server: one Durable Object per room code runs the authoritative game with the same
// rules engine the client uses. Each player only ever receives their own view (no enemy hand, deck
// order or hidden traps). Static files are served from the assets binding.
import { validateDeck } from '../engine/decks';
import { actionKey, apply, legalActions, newMatch, viewFor } from '../engine/rules';
import type { Action, DeckList, Ev, GameState, PlayerId } from '../engine/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-ignore: provided by the Workers runtime
import { DurableObject } from 'cloudflare:workers';
declare const WebSocketPair: any;
type Env = { ASSETS: { fetch: (r: Request) => Promise<Response> }; ROOMS: any };

const TURN_MS = 60_000;
const AWAY_MS = 90_000;
const ROOM_TTL_MS = 30 * 60_000;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ';

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/api/room' && req.method === 'POST') {
      for (let i = 0; i < 10; i++) {
        let code = '';
        for (let k = 0; k < 5; k++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        const r = await stub.fetch('https://room/create', { method: 'POST' });
        if (r.ok) return json({ code });
      }
      return json({ error: 'Could not make a room right now. Try again.' }, 503);
    }
    const m = url.pathname.match(/^\/api\/room\/([A-Z]{5})\/ws$/);
    if (m) {
      if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'expected websocket' }, 426);
      return env.ROOMS.get(env.ROOMS.idFromName(m[1])).fetch(req);
    }
    if (url.pathname.startsWith('/api/')) return json({ error: 'not found' }, 404);
    return env.ASSETS.fetch(req);
  },
};

interface Seat { token: string; name: string; deck: DeckList }
interface RoomData { created: number; seats: (Seat | null)[]; game: GameState | null; deadline: number; away: (number | null)[]; endedAt: number | null }

/** Hide everything the other player shouldn't know. */
function viewOf(s: GameState, seat: PlayerId): GameState {
  const v = viewFor(s, seat);
  const o = (1 - seat) as PlayerId;
  v.players[o].hand = v.players[o].hand.map(r => ({ uid: r.uid, card: '?' }));
  v.players[o].evo = v.players[o].evo.map(r => ({ uid: r.uid, card: '?' }));
  for (const p of [0, 1] as PlayerId[]) v.players[p].deck = v.players[p].deck.map(() => ({ uid: 0, card: '?' }));
  v.rng = 0;
  return v;
}
function eventsOf(evs: Ev[], seat: PlayerId): Ev[] {
  return evs.map(e => {
    if (e.e === 'draw' && e.p !== seat) return { ...e, card: '?' };
    if (e.e === 'trapSet' && e.p !== seat) return { ...e, x: -1, y: -1, card: '?' };
    return e;
  });
}

export class Room extends (DurableObject as any) {
  private d: RoomData | null = null;
  private state: any;
  constructor(ctx: any, env: Env) { super(ctx, env); this.state = ctx; }

  private async load(): Promise<RoomData | null> {
    if (!this.d) this.d = (await this.state.storage.get('room')) || null;
    return this.d;
  }
  private async save() {
    await this.state.storage.put('room', this.d);
    await this.schedule();
  }
  private async schedule() {
    const d = this.d!;
    const times: number[] = d.game ? [] : [d.created + ROOM_TTL_MS];
    if (d.game && d.game.winner === null) {
      times.push(d.deadline);
      for (const a of d.away) if (a) times.push(a + AWAY_MS);
    }
    if (d.endedAt) times.push(d.endedAt + 10 * 60_000);
    if (!times.length) return;
    await this.state.storage.setAlarm(Math.max(Date.now() + 500, Math.min(...times)));
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/create') {
      if (await this.load()) return json({ error: 'taken' }, 409);
      this.d = { created: Date.now(), seats: [null, null], game: null, deadline: 0, away: [null, null], endedAt: null };
      await this.save();
      return json({ ok: true });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as any[];
    this.state.acceptWebSocket(server);
    if (!(await this.load())) {
      server.send(JSON.stringify({ t: 'error', msg: 'No room with that code. Check the letters and try again.', fatal: true }));
      server.close(4004, 'no room');
    }
    return new Response(null, { status: 101, webSocket: client } as ResponseInit);
  }

  private seatOf(ws: any): PlayerId | null {
    const a = ws.deserializeAttachment?.();
    return a && (a.seat === 0 || a.seat === 1) ? a.seat : null;
  }
  private send(seat: PlayerId, msg: unknown) {
    for (const ws of this.state.getWebSockets()) if (this.seatOf(ws) === seat) { try { ws.send(JSON.stringify(msg)); } catch { /* closed */ } }
  }
  private names() { return this.d!.seats.map(s => s?.name || null); }

  private broadcast(evs: Ev[], extra: Record<string, unknown> = {}) {
    const g = this.d!.game!;
    for (const seat of [0, 1] as PlayerId[]) this.send(seat, { t: 'events', events: eventsOf(evs, seat), state: viewOf(g, seat), deadline: this.d!.deadline, left: this.d!.deadline - Date.now(), ...extra });
  }

  async webSocketMessage(ws: any, raw: string) {
    const d = await this.load();
    if (!d) return;
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.t === 'hello') {
      const token = String(msg.token || '').slice(0, 64);
      const name = String(msg.name || 'Player').replace(/[<>]/g, '').slice(0, 20) || 'Player';
      let seat = d.seats.findIndex(s => s?.token === token) as number;
      if (seat < 0) {
        if (d.game) { ws.send(JSON.stringify({ t: 'error', msg: 'This duel already started.', fatal: true })); return; }
        const deck = msg.deck as DeckList;
        const errs = deck && Array.isArray(deck.main) && Array.isArray(deck.evo) ? validateDeck(deck) : ['No deck'];
        if (errs.length) { ws.send(JSON.stringify({ t: 'error', msg: 'Your deck isn\'t legal: ' + errs[0], fatal: true })); return; }
        seat = d.seats.findIndex(s => !s);
        if (seat < 0) { ws.send(JSON.stringify({ t: 'error', msg: 'That room is full.', fatal: true })); return; }
        d.seats[seat] = { token, name, deck: { main: deck.main.slice(0, 30), evo: deck.evo.slice(0, 8) } };
      }
      ws.serializeAttachment({ seat });
      d.away[seat] = null;
      const s = seat as PlayerId;
      if (!d.game && d.seats[0] && d.seats[1]) {
        const seed = Math.floor(Math.random() * 2 ** 31);
        const first = (Math.random() < 0.5 ? 0 : 1) as PlayerId;
        const r = newMatch({ seed, decks: [d.seats[0].deck, d.seats[1].deck], names: [d.seats[0].name, d.seats[1].name], first });
        d.game = r.state;
        d.deadline = Date.now() + TURN_MS;
        await this.save();
        for (const p of [0, 1] as PlayerId[]) this.send(p, { t: 'start', seat: p, names: this.names(), events: eventsOf(r.events, p), state: viewOf(r.state, p), deadline: d.deadline, left: d.deadline - Date.now() });
        return;
      }
      await this.save();
      if (d.game) ws.send(JSON.stringify({ t: 'start', seat: s, names: this.names(), events: [], state: viewOf(d.game, s), deadline: d.deadline, left: d.deadline - Date.now(), resumed: true }));
      else ws.send(JSON.stringify({ t: 'lobby', seat: s, names: this.names() }));
      this.send((1 - s) as PlayerId, { t: 'presence', names: this.names(), back: s });
      return;
    }
    const seat = this.seatOf(ws);
    if (seat === null) return;
    const g = d.game;
    if (msg.t === 'act') {
      if (!g || g.winner !== null) return;
      const a = msg.action as Action;
      if (g.active !== seat) { ws.send(JSON.stringify({ t: 'reject', msg: 'Not your turn.' })); return; }
      if (!a || !legalActions(g).some(l => actionKey(l) === actionKey(a))) { ws.send(JSON.stringify({ t: 'reject', msg: 'That move isn\'t allowed right now.' })); return; }
      const r = apply(g, a, true);
      d.game = r.state;
      if (a.k === 'end') d.deadline = Date.now() + TURN_MS;
      if (r.state.winner !== null) d.endedAt = Date.now();
      await this.save();
      this.broadcast(r.events);
    } else if (msg.t === 'emote') {
      this.send((1 - seat) as PlayerId, { t: 'emote', id: String(msg.id).slice(0, 12), from: seat });
    } else if (msg.t === 'resign') {
      if (!g || g.winner !== null) return;
      g.winner = (1 - seat) as PlayerId;
      d.endedAt = Date.now();
      await this.save();
      this.broadcast([{ e: 'win', p: g.winner }], { reason: 'resign', by: seat });
    }
  }

  async webSocketClose(ws: any) {
    const d = await this.load();
    const seat = this.seatOf(ws);
    if (!d || seat === null) return;
    const still = this.state.getWebSockets().some((w: any) => w !== ws && this.seatOf(w) === seat);
    if (still) return;
    d.away[seat] = Date.now();
    await this.save();
    this.send((1 - seat) as PlayerId, { t: 'presence', names: this.names(), away: seat, graceMs: AWAY_MS });
  }
  async webSocketError(ws: any) { await this.webSocketClose(ws); }

  async alarm() {
    const d = await this.load();
    if (!d) return;
    const now = Date.now();
    if ((d.endedAt && now > d.endedAt + 10 * 60_000) || (!d.game && now > d.created + ROOM_TTL_MS)) {
      for (const ws of this.state.getWebSockets()) { try { ws.close(4000, 'room closed'); } catch { /* ignore */ } }
      await this.state.storage.deleteAll();
      this.d = null;
      return;
    }
    const g = d.game;
    if (g && g.winner === null) {
      for (const seat of [0, 1] as PlayerId[]) {
        const a = d.away[seat];
        if (a && now >= a + AWAY_MS) {
          g.winner = (1 - seat) as PlayerId;
          d.endedAt = now;
          await this.save();
          this.broadcast([{ e: 'win', p: g.winner }], { reason: 'left', by: seat });
          return;
        }
      }
      if (now >= d.deadline) {
        const r = apply(g, { k: 'end' }, true);
        d.game = r.state;
        d.deadline = now + TURN_MS;
        if (r.state.winner !== null) d.endedAt = now;
        await this.save();
        this.broadcast(r.events, { timeout: true });
        return;
      }
    }
    await this.schedule();
  }
}
