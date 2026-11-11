// Procedural audio: every sound is synthesized (wood clacks, music-box chimes, toy squeaks), plus a
// generative music-box score. No audio files.
let ctx: AudioContext | null = null;
let master: GainNode, sfxBus: GainNode, musicBus: GainNode, verb: ConvolverNode, verbSend: GainNode;
export const audioCfg = { sfx: 0.8, music: 0.45 };

function ensure(): AudioContext | null {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
  try { ctx = new AudioContext(); } catch { return null; }
  master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = audioCfg.sfx; sfxBus.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = audioCfg.music * 0.5; musicBus.connect(master);
  // small room reverb from a decaying noise impulse
  verb = ctx.createConvolver();
  const len = ctx.sampleRate * 1.6, buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3; }
  verb.buffer = buf;
  verbSend = ctx.createGain(); verbSend.gain.value = 0.22;
  verbSend.connect(verb); verb.connect(master);
  return ctx;
}
export function unlockAudio() { ensure(); }
export function setVolumes(sfx: number, music: number) {
  audioCfg.sfx = sfx; audioCfg.music = music;
  if (ctx) { sfxBus.gain.value = sfx; musicBus.gain.value = music * 0.5; }
}

type Wave = OscillatorType;
function tone(freq: number, dur: number, opts: { type?: Wave; vol?: number; at?: number; attack?: number; slide?: number; bus?: GainNode; wet?: number; detune?: number } = {}) {
  const c = ensure(); if (!c) return;
  const t = c.currentTime + (opts.at || 0);
  const o = c.createOscillator(), g = c.createGain();
  o.type = opts.type || 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * opts.slide), t + dur);
  if (opts.detune) o.detune.value = opts.detune;
  const v = opts.vol ?? 0.3;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(v, t + (opts.attack ?? 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(opts.bus || sfxBus);
  if (opts.wet) { const w = c.createGain(); w.gain.value = opts.wet; g.connect(w); w.connect(verbSend); }
  o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur: number, opts: { freq?: number; q?: number; vol?: number; at?: number; type?: BiquadFilterType; sweep?: number; bus?: GainNode } = {}) {
  const c = ensure(); if (!c) return;
  const t = c.currentTime + (opts.at || 0);
  const len = Math.ceil(c.sampleRate * dur), b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource(); s.buffer = b;
  const f = c.createBiquadFilter(); f.type = opts.type || 'bandpass'; f.frequency.setValueAtTime(opts.freq || 1200, t); f.Q.value = opts.q ?? 1;
  if (opts.sweep) f.frequency.exponentialRampToValueAtTime(opts.sweep, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(opts.vol ?? 0.3, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(opts.bus || sfxBus);
  s.start(t); s.stop(t + dur);
}
/** Music-box tine: fundamental + inharmonic partial, short bright decay. */
function tine(freq: number, at = 0, vol = 0.18, bus?: GainNode, dur = 1.4) {
  tone(freq, dur, { vol, at, bus, wet: 0.6 });
  tone(freq * 2.76, dur * 0.35, { vol: vol * 0.35, at, bus, wet: 0.6 });
  tone(freq * 5.4, dur * 0.12, { vol: vol * 0.12, at, bus });
}
const wood = (f: number, at = 0, vol = 0.35) => { tone(f, 0.08, { type: 'triangle', vol, at, slide: 0.6 }); noise(0.04, { freq: f * 3, q: 4, vol: vol * 0.6, at }); };
const N = (semi: number) => 440 * 2 ** ((semi - 9) / 12); // semitone from C4

export const sfx = {
  click: () => wood(900, 0, 0.25),
  hover: () => wood(1400, 0, 0.06),
  card: () => noise(0.12, { freq: 3000, q: 0.8, vol: 0.18, sweep: 1200 }),
  flip: () => { noise(0.09, { freq: 2400, q: 1, vol: 0.2, sweep: 5000 }); wood(1200, 0.04, 0.12); },
  draw: () => noise(0.16, { freq: 1800, q: 0.7, vol: 0.14, sweep: 4000 }),
  summon: () => { [0, 4, 7, 12].forEach((s, i) => tine(N(s + 12), i * 0.06, 0.14)); noise(0.5, { freq: 500, q: 0.5, vol: 0.06, sweep: 4000 }); },
  hop: () => tone(520, 0.12, { type: 'square', vol: 0.05, slide: 1.8 }),
  land: () => wood(260, 0, 0.3),
  slide: () => noise(0.3, { freq: 700, q: 0.6, vol: 0.18, sweep: 300 }),
  bump: () => { wood(180, 0, 0.4); wood(150, 0.05, 0.3); },
  turn: () => { wood(700, 0, 0.12); wood(900, 0.05, 0.1); },
  attack: (shape: string) => {
    if (shape === 'line') { tone(1200, 0.18, { type: 'sawtooth', vol: 0.06, slide: 0.3 }); noise(0.15, { freq: 2500, vol: 0.12, sweep: 800 }); }
    else if (shape === 'lob' || shape === 'splash') { tone(300, 0.35, { type: 'triangle', vol: 0.12, slide: 2.2 }); noise(0.2, { freq: 600, vol: 0.1 }); }
    else { noise(0.18, { freq: 900, q: 0.6, vol: 0.22, sweep: 3000 }); tone(200, 0.1, { type: 'triangle', vol: 0.15, slide: 1.6 }); }
  },
  hit: () => { tone(160, 0.18, { type: 'triangle', vol: 0.45, slide: 0.5 }); noise(0.1, { freq: 1600, vol: 0.25 }); },
  crit: () => { tone(120, 0.3, { type: 'triangle', vol: 0.55, slide: 0.4 }); noise(0.16, { freq: 2600, vol: 0.32 }); tine(N(19), 0.02, 0.1); },
  block: () => { tone(900, 0.2, { type: 'square', vol: 0.06 }); wood(400, 0, 0.3); },
  ko: () => { for (let i = 0; i < 9; i++) wood(300 + Math.random() * 900, i * 0.035, 0.18); noise(0.4, { freq: 400, vol: 0.18, sweep: 120 }); },
  topple: () => { for (let i = 0; i < 5; i++) wood(200 + Math.random() * 300, 0.1 + i * 0.06, 0.2); },
  heal: () => [0, 4, 7].forEach((s, i) => tine(N(s + 19), i * 0.07, 0.08)),
  fuse: () => { [0, 3, 7, 10, 12, 15, 19, 24].forEach((s, i) => tine(N(s + 7), i * 0.07, 0.12)); noise(1.2, { freq: 300, q: 0.4, vol: 0.12, sweep: 6000 }); tone(55, 1.4, { type: 'sine', vol: 0.4, slide: 2 }); },
  trap: () => { wood(1600, 0, 0.4); tone(800, 0.25, { type: 'square', vol: 0.08, slide: 0.4 }); noise(0.1, { freq: 4000, vol: 0.2 }); },
  spell: () => { [0, 7, 12, 16].forEach((s, i) => tine(N(s + 14), i * 0.04, 0.09)); },
  freeze: () => { tone(300, 0.4, { type: 'sine', vol: 0.18, slide: 0.5 }); noise(0.3, { freq: 500, q: 3, vol: 0.1 }); },
  gear: () => { wood(1100, 0, 0.2); wood(1500, 0.06, 0.18); tine(N(24), 0.1, 0.07); },
  windup: () => { for (let i = 0; i < 6; i++) wood(1800, i * 0.06, 0.08); },
  terrain: () => { noise(0.4, { freq: 300, q: 0.6, vol: 0.2, sweep: 1600 }); tine(N(7), 0.1, 0.07); },
  coin: () => { tone(1500, 0.1, { type: 'square', vol: 0.05 }); tone(2000, 0.25, { type: 'square', vol: 0.05, at: 0.08 }); },
  tear: () => noise(0.35, { freq: 2200, q: 0.5, vol: 0.25, sweep: 900 }),
  rare: () => [0, 4, 7, 11, 14].forEach((s, i) => tine(N(s + 12), i * 0.09, 0.15, undefined, 2)),
  turnStart: () => { tine(N(12), 0, 0.14); tine(N(19), 0.12, 0.12); },
  win: () => [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => tine(N(s + 12), i * 0.12, 0.16, undefined, 2.4)),
  lose: () => [12, 10, 7, 3, 0].forEach((s, i) => tine(N(s), i * 0.2, 0.14, undefined, 2)),
  error: () => { tone(220, 0.14, { type: 'square', vol: 0.05 }); tone(180, 0.18, { type: 'square', vol: 0.05, at: 0.08 }); },
};

// ---------------------------------------------------------------- generative music box
let musicMode: 'off' | 'menu' | 'battle' = 'off';
let timer: number | null = null;
let step = 0, nextT = 0, melodyDeg = 7;
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const PROG = [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]]; // I vi IV V (relative to C)

export function setMusic(mode: 'off' | 'menu' | 'battle') {
  if (mode === musicMode) return;
  musicMode = mode;
  if (timer) { clearInterval(timer); timer = null; }
  if (mode === 'off') return;
  const c = ensure(); if (!c) return;
  nextT = c.currentTime + 0.1; step = 0;
  timer = window.setInterval(schedule, 90);
}

function schedule() {
  const c = ensure(); if (!c || musicMode === 'off') return;
  const battle = musicMode === 'battle';
  const bpm = battle ? 100 : 74;
  const spb = 60 / bpm / 2; // eighth notes
  while (nextT < c.currentTime + 0.3) {
    const at = nextT - c.currentTime;
    const bar = Math.floor(step / 8) % 4;
    const chord = PROG[bar];
    const beat = step % 8;
    if (beat === 0) { tone(N(chord[0] - 12), spb * 7, { type: 'triangle', vol: 0.07, at, bus: musicBus, attack: 0.04 }); }
    if (beat === 4 && battle) tone(N(chord[0] - 12), spb * 3, { type: 'triangle', vol: 0.05, at, bus: musicBus });
    // arpeggio
    if (beat % 2 === 0 || battle) {
      const n = chord[(beat >> (battle ? 0 : 1)) % 3] + 12;
      tine(N(n), at, battle ? 0.035 : 0.045, musicBus, 1.1);
    }
    // melody: gentle random walk on the pentatonic scale
    if ((beat === 0 || beat === 3 || beat === 6) && Math.random() < 0.75) {
      melodyDeg = Math.max(0, Math.min(SCALE.length - 1, melodyDeg + [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)]));
      tine(N(SCALE[melodyDeg] + 12), at, 0.07, musicBus, 1.8);
    }
    if (battle && (beat === 2 || beat === 6)) noise(0.05, { freq: 1800, q: 6, vol: 0.05, at, bus: musicBus });
    nextT += spb;
    step++;
  }
}
