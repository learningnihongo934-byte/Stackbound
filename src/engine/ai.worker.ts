import { chooseAction, type AiOpts } from './ai';
import type { GameState } from './types';

self.onmessage = (e: MessageEvent<{ id: number; state: GameState; opts: AiOpts }>) => {
  const { id, state, opts } = e.data;
  try {
    const action = chooseAction(state, opts);
    (self as unknown as Worker).postMessage({ id, action });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, action: { k: 'end' }, error: String(err) });
  }
};
