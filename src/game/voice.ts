// Announcer: short pre-rendered calls (public/vo/*.mp3, made with rat.audio / Kokoro).
import { playClip, preloadClip } from './audio';

export type VoLine = 'duel' | 'yourturn' | 'theirturn' | 'back' | 'side' | 'super' | 'fusion' | 'finalform' | 'toppled' | 'trap' | 'gear' | 'event' | 'danger' | 'finish' | 'victory' | 'defeat' | 'direct' | 'blocked' | 'timeup' | 'tenseconds';
export const voiceCfg = { vol: 0.9 };
let last = 0;
const BASE = import.meta.env.BASE_URL || './';

export function say(line: VoLine, priority = false) {
  if (voiceCfg.vol <= 0) return;
  const now = performance.now();
  if (!priority && now - last < 700) return; // never talk over itself
  last = now;
  playClip(`${BASE}vo/${line}.mp3`, voiceCfg.vol);
}
export function preloadVoice() {
  for (const l of ['duel', 'yourturn', 'theirturn', 'back', 'side', 'super', 'fusion', 'toppled', 'trap', 'gear', 'event', 'victory', 'defeat', 'direct'] as VoLine[]) preloadClip(`${BASE}vo/${l}.mp3`);
}
