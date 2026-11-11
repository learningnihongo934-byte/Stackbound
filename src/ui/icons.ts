// Hand-drawn style inline SVG icons (no emoji anywhere in the UI).
import type { Elem, Shape } from '../engine/types';

const svg = (body: string, vb = '0 0 24 24') => `<svg class="ic" viewBox="${vb}" aria-hidden="true">${body}</svg>`;

export const ICON = {
  sword: svg('<path d="M4 20l3-1 10-10 1-4-4 1L4 16z" fill="currentColor"/><path d="M3 21l3-3" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'),
  heart: svg('<path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" fill="currentColor"/>'),
  shield: svg('<path d="M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6z" fill="currentColor"/>'),
  glue: svg('<path d="M6 10a6 6 0 0112 0v3c0 3-2 5-6 5s-6-2-6-5z" fill="currentColor"/><path d="M9 18v3M15 17v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  energy: svg('<path d="M13 2L5 14h6l-1 8 8-12h-6z" fill="currentColor"/>'),
  deck: svg('<rect x="5" y="4" width="12" height="16" rx="2" fill="currentColor" opacity=".55"/><rect x="8" y="2" width="12" height="16" rx="2" fill="currentColor"/>'),
  hand: svg('<rect x="3" y="7" width="8" height="12" rx="1.5" transform="rotate(-12 7 13)" fill="currentColor" opacity=".6"/><rect x="10" y="5" width="8" height="12" rx="1.5" transform="rotate(8 14 11)" fill="currentColor"/>'),
  rotateL: svg('<path d="M5 9a8 8 0 1 1 1 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M3 4v6h6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>'),
  rotateR: svg('<path d="M19 9a8 8 0 1 0-1 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M21 4v6h-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>'),
  move: svg('<path d="M12 3v18M3 12h18" stroke="currentColor" stroke-width="2.2"/><path d="M12 3l-3 3h6zM12 21l-3-3h6zM3 12l3-3v6zM21 12l-3-3v6z" fill="currentColor"/>'),
  turn: svg('<path d="M6 16a7 7 0 1 1 6 3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M12 15v6h-6" fill="none" stroke="currentColor" stroke-width="2.4"/>'),
  fuse: svg('<path d="M7 4c0 5 10 5 10 10s-5 6-5 6M17 4c0 5-10 5-10 10s5 6 5 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="11" r="2.4" fill="currentColor"/>'),
  gear: svg('<path d="M12 8a4 4 0 100 8 4 4 0 000-8zm8 4l2-1-1-3-2 .3-1.4-1.6L18 5l-3-1.5-1 1.8h-2L11 3.5 8 5l.4 1.8L7 8.3 5 8 4 11l2 1-.1 2-1.8 1L5 18l2-.3L8.6 19 8 21l3 1.2 1-1.8h2l1 1.8 3-1.2-.5-2 1.5-1.4 2 .3 1-3-2-1z" fill="currentColor"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>'),
  back: svg('<path d="M15 4l-8 8 8 8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'),
  button: svg('<circle cx="12" cy="12" r="9" fill="currentColor"/><circle cx="9.5" cy="9.5" r="1.4" fill="#2b1d14"/><circle cx="14.5" cy="9.5" r="1.4" fill="#2b1d14"/><circle cx="9.5" cy="14.5" r="1.4" fill="#2b1d14"/><circle cx="14.5" cy="14.5" r="1.4" fill="#2b1d14"/>'),
  stuffing: svg('<path d="M6 15c-2 0-3-2-2-4s3-2 3-2 0-4 4-4 4 3 4 3 4-1 5 2-1 5-3 5H6z" fill="currentColor"/><path d="M8 18l1 3M12 18v3M16 18l-1 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
  lock: svg('<rect x="5" y="10" width="14" height="11" rx="2" fill="currentColor"/><path d="M8 10V7a4 4 0 018 0v3" fill="none" stroke="currentColor" stroke-width="2.4"/>'),
  crown: svg('<path d="M3 18l2-11 4.5 5L12 5l2.5 7L19 7l2 11z" fill="currentColor"/>'),
  check: svg('<path d="M4 12l5 5L20 6" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>'),
  sound: svg('<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8a5 5 0 010 8M18.5 5.5a8.5 8.5 0 010 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  book: svg('<path d="M4 5c3-1 6-1 8 1 2-2 5-2 8-1v14c-3-1-6-1-8 1-2-2-5-2-8-1z" fill="currentColor"/><path d="M12 6v14" stroke="#2b1d14" stroke-width="1.4"/>'),
  user: svg('<circle cx="12" cy="8" r="4" fill="currentColor"/><path d="M4 21c0-5 4-7 8-7s8 2 8 7z" fill="currentColor"/>'),
  star: svg('<path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 21l1.6-7L2 9.2l7.1-.6z" fill="currentColor"/>'),
  pack: svg('<path d="M6 3h12l-1 3 1 3-1 3 1 3-1 3 1 3H6l1-3-1-3 1-3-1-3 1-3z" fill="currentColor"/>'),
  trap: svg('<rect x="3" y="14" width="18" height="6" rx="1" fill="currentColor"/><path d="M5 14V8h14v6" fill="none" stroke="currentColor" stroke-width="2.2"/>'),
  info: svg('<circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M12 11v6M12 7v.5" stroke="#f3e6c9" stroke-width="2.6" stroke-linecap="round"/>'),
};

export const ELEM_ICON: Record<Elem, string> = {
  ember: svg('<path d="M12 2c1 4 6 6 6 12a6 6 0 01-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-4-1-6 1-9z" fill="currentColor"/>'),
  tide: svg('<path d="M12 2c3 5 7 9 7 13a7 7 0 01-14 0c0-4 4-8 7-13z" fill="currentColor"/>'),
  moss: svg('<path d="M5 19C5 9 11 4 20 4c0 9-5 15-15 15z" fill="currentColor"/><path d="M5 19c4-6 7-9 11-11" stroke="#2b1d14" stroke-width="1.6" fill="none"/>'),
  volt: svg('<path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="currentColor"/>'),
  stone: svg('<path d="M4 16l3-8 6-3 6 4 1 8-6 3H8z" fill="currentColor"/><path d="M7 8l5 4 7-3M12 12v8" stroke="#2b1d14" stroke-width="1.3" fill="none"/>'),
  gleam: svg('<path d="M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z" fill="currentColor"/>'),
};

/** 5x5 mini-grid showing what an attack shape hits (the creature sits in the middle facing up). */
export function shapeIcon(shape: Shape, range: number): string {
  const hits: [number, number][] = [];
  const r = Math.min(range, 2);
  if (shape === 'jab') hits.push([2, 1]);
  if (shape === 'cone') hits.push([1, 1], [2, 1], [3, 1]);
  if (shape === 'sweep') hits.push([1, 2], [2, 1], [3, 2]);
  if (shape === 'line') for (let i = 1; i <= r; i++) hits.push([2, 2 - i]);
  if (shape === 'lob') hits.push([2, 0]);
  if (shape === 'splash') hits.push([2, 0], [1, 0], [3, 0], [2, 1]);
  let cells = '';
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
    const isMe = x === 2 && y === 2;
    const hit = hits.some(([a, b]) => a === x && b === y);
    cells += `<rect x="${x * 5 + 0.5}" y="${y * 5 + 0.5}" width="4" height="4" rx="0.8" class="${isMe ? 'me' : hit ? 'hit' : 'off'}"/>`;
  }
  return `<svg class="shape-ic" viewBox="0 0 25 25">${cells}<path d="M12.5 10.6l-1.6 2.2h3.2z" class="arrow"/></svg>`;
}
