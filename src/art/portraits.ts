import { CARDS } from '../engine/cards';
import type { Backdrop } from './pixelart';

export function backdropFor(id: string): Backdrop {
  const c = CARDS[id];
  if (!c) return 'stone';
  if (c.kind === 'creature' || c.kind === 'terrain') return c.elem!;
  return c.kind === 'spell' ? 'spell' : c.kind === 'trap' ? 'trap' : 'gear';
}
