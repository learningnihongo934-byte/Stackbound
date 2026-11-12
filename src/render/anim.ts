// Tiny animation runtime: per-frame tickers and promise-based tweens, with a global speed knob.
type Tick = (dt: number, t: number) => boolean | void;
const ticks = new Set<Tick>();
let now = 0;
export const animCfg = { speed: 1, reduceMotion: false, timeScale: 1 };

export function onTick(fn: Tick): () => void {
  ticks.add(fn);
  return () => ticks.delete(fn);
}
export function runTicks(dt: number) {
  dt *= animCfg.timeScale;
  now += dt;
  for (const fn of [...ticks]) if (fn(dt, now)) ticks.delete(fn);
}
export const clock = () => now;

export const ease = {
  linear: (k: number) => k,
  outCubic: (k: number) => 1 - (1 - k) ** 3,
  inCubic: (k: number) => k * k * k,
  inOutCubic: (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2),
  outBack: (k: number) => { const c = 1.70158; return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2; },
  outElastic: (k: number) => (k === 0 || k === 1 ? k : 2 ** (-10 * k) * Math.sin((k * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  outQuad: (k: number) => 1 - (1 - k) * (1 - k),
  inQuad: (k: number) => k * k,
};

/** Calls fn(k) with k going 0->1 over `ms` (scaled by animCfg.speed). */
export function tween(ms: number, fn: (k: number) => void, e: (k: number) => number = ease.inOutCubic): Promise<void> {
  const dur = Math.max(1, ms / animCfg.speed) / 1000;
  return new Promise(res => {
    let t = 0;
    fn(e(0));
    onTick(dt => {
      t += dt;
      const k = Math.min(1, t / dur);
      fn(e(k));
      if (k >= 1) { res(); return true; }
    });
  });
}
export function wait(ms: number): Promise<void> {
  const dur = ms / animCfg.speed / 1000;
  return new Promise(res => { let t = 0; onTick(dt => { t += dt; if (t >= dur) { res(); return true; } }); });
}
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export function angleLerp(a: number, b: number, k: number) {
  let d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + d * k;
}

let restore = 0;
/** Freeze-frame on impact. */
export function hitStop(ms = 70) {
  if (animCfg.reduceMotion) return;
  animCfg.timeScale = 0.02;
  clearTimeout(restore);
  restore = window.setTimeout(() => { animCfg.timeScale = 1; }, ms);
}
/** Slow motion for dramatic beats (knockouts, finishing blows). */
export function slowmo(scale = 0.3, ms = 500) {
  if (animCfg.reduceMotion) return;
  animCfg.timeScale = scale;
  clearTimeout(restore);
  restore = window.setTimeout(() => { animCfg.timeScale = 1; }, ms);
}
