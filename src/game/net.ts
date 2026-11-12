// PvP client: room codes over a WebSocket to the Stackbound Worker (src/server/worker.ts).
import type { Action, DeckList, Ev, GameState, PlayerId } from '../engine/types';

export type ServerMsg =
  | { t: 'lobby'; seat: PlayerId; names: (string | null)[] }
  | { t: 'start'; seat: PlayerId; names: (string | null)[]; events: Ev[]; state: GameState; deadline: number; left?: number; resumed?: boolean }
  | { t: 'events'; events: Ev[]; state: GameState; deadline: number; left?: number; timeout?: boolean; reason?: string; by?: PlayerId }
  | { t: 'presence'; names: (string | null)[]; away?: PlayerId; back?: PlayerId; graceMs?: number }
  | { t: 'emote'; id: string; from: PlayerId }
  | { t: 'reject'; msg: string }
  | { t: 'error'; msg: string; fatal?: boolean };

const API = (import.meta.env.VITE_API as string | undefined) || '';
/** One seat token per room, kept across reloads and tab restarts so a player can always rejoin. */
function token(code: string): string {
  const key = 'stackbound.seat.' + code;
  try {
    let t = localStorage.getItem(key);
    if (!t) { t = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join(''); localStorage.setItem(key, t); }
    return t;
  } catch { return 'anon-' + Math.random().toString(36).slice(2); }
}

export async function createRoom(): Promise<string> {
  const r = await fetch(API + '/api/room', { method: 'POST' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.code) throw new Error(j.error || 'Could not make a room.');
  return j.code;
}

export class NetClient {
  ws: WebSocket | null = null;
  seat: PlayerId = 0;
  closed = false;
  private retries = 0;
  private handlers = new Set<(m: ServerMsg) => void>();
  constructor(public code: string, private name: string, private deck: DeckList) {}

  on(fn: (m: ServerMsg) => void) { this.handlers.add(fn); return () => this.handlers.delete(fn); }
  private emit(m: ServerMsg) { for (const h of [...this.handlers]) h(m); }

  connect() {
    if (this.closed) return;
    const base = API || location.origin;
    const url = base.replace(/^http/, 'ws') + `/api/room/${this.code}/ws`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => { this.retries = 0; ws.send(JSON.stringify({ t: 'hello', token: token(this.code), name: this.name, deck: this.deck })); };
    ws.onmessage = e => {
      let m: ServerMsg;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'lobby' || m.t === 'start') this.seat = m.seat;
      if (m.t === 'error' && m.fatal) this.closed = true;
      this.emit(m);
    };
    ws.onclose = () => {
      if (this.closed) return;
      const wait = Math.min(8000, 500 * 2 ** this.retries++);
      setTimeout(() => this.connect(), wait);
    };
  }
  /** False when the socket isn't open (reconnecting); the caller should not wait for a reply. */
  send(action: Action): boolean { return this.raw({ t: 'act', action }); }
  emote(id: string) { this.raw({ t: 'emote', id }); }
  resign() { return this.raw({ t: 'resign' }); }
  private raw(m: unknown): boolean { if (this.ws?.readyState !== WebSocket.OPEN) return false; this.ws.send(JSON.stringify(m)); return true; }
  close() { this.closed = true; this.ws?.close(); this.handlers.clear(); }
}
