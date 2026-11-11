// Rennko Arcade: report campaign progress when played inside arcade.rennko.tech.
export const arcadeScore = (score: number, meta: Record<string, unknown>) => {
  try { if (window.parent !== window) window.parent.postMessage({ rennkoArcade: 1, type: 'score', score, meta }, 'https://arcade.rennko.tech'); } catch { /* not in the arcade */ }
};
