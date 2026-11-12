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

// ---------------------------------------------------------------- voice / sample clips
const clipCache = new Map<string, Promise<AudioBuffer | null>>();
export function playClip(url: string, vol = 1): boolean {
  const c = ensure(); if (!c) return false;
  let p = clipCache.get(url);
  if (!p) {
    p = fetch(url).then(r => r.arrayBuffer()).then(b => c.decodeAudioData(b)).catch(() => null);
    clipCache.set(url, p);
  }
  p.then(buf => {
    if (!buf) return;
    const src = c.createBufferSource(); src.buffer = buf;
    const g = c.createGain(); g.gain.value = vol;
    src.connect(g); g.connect(master);
    src.start();
  });
  return true;
}
export function preloadClip(url: string) { const c = ensure(); if (c && !clipCache.has(url)) clipCache.set(url, fetch(url).then(r => r.arrayBuffer()).then(b => c.decodeAudioData(b)).catch(() => null)); }

// ---------------------------------------------------------------- layered music
// Menus: a gentle music box. Battles: the same box plus drums, bass and a lead that come in as the
// fight gets closer (intensity 0..1). Bosses: minor key, faster, always at least half intensity.
let musicMode: 'off' | 'menu' | 'battle' | 'boss' = 'off';
let timer: number | null = null;
let step = 0, nextT = 0, melodyDeg = 7;
let intensity = 0;
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const SCALE_MIN = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24].map(n => n - 3);
const PROG = [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]]; // I vi IV V
const PROG_BOSS = [[-3, 0, 4], [-7, -3, 0], [0, 4, 7], [-5, -1, 2]]; // vi IV I V (minor feel)

export function setIntensity(x: number) { intensity = Math.max(0, Math.min(1, x)); }
export function setMusic(mode: 'off' | 'menu' | 'battle' | 'boss') {
  if (mode === musicMode) return;
  musicMode = mode;
  if (timer) { clearInterval(timer); timer = null; }
  if (mode === 'off') return;
  const c = ensure(); if (!c) return;
  nextT = c.currentTime + 0.1; step = 0; intensity = 0;
  timer = window.setInterval(schedule, 90);
}

const kick = (at: number, v = 0.22) => tone(62, 0.22, { type: 'sine', vol: v, at, slide: 0.55, bus: musicBus });
const snare = (at: number, v = 0.09) => { noise(0.14, { freq: 1900, q: 0.7, vol: v, at, bus: musicBus }); tone(190, 0.08, { type: 'triangle', vol: v * 0.8, at, bus: musicBus }); };
const hat = (at: number, v = 0.035) => noise(0.04, { freq: 8000, q: 0.5, vol: v, at, type: 'highpass', bus: musicBus });

function schedule() {
  const c = ensure(); if (!c || musicMode === 'off') return;
  const battle = musicMode !== 'menu';
  const boss = musicMode === 'boss';
  const I = boss ? Math.max(0.5, intensity) : battle ? intensity : 0;
  const bpm = boss ? 112 : battle ? 96 + Math.round(I * 14) : 74;
  const spb = 60 / bpm / 2; // eighth notes
  const prog = boss ? PROG_BOSS : PROG;
  const scale = boss ? SCALE_MIN : SCALE;
  while (nextT < c.currentTime + 0.3) {
    const at = nextT - c.currentTime;
    const bar = Math.floor(step / 8) % 4;
    const chord = prog[bar];
    const beat = step % 8;
    // bass
    if (beat === 0) tone(N(chord[0] - 12), spb * (battle && I > 0.5 ? 1.8 : 7), { type: 'triangle', vol: 0.075, at, bus: musicBus, attack: 0.03 });
    if (battle && I > 0.5 && beat % 2 === 0 && beat) tone(N(chord[(beat / 2) % 3] - 12), spb * 1.6, { type: 'triangle', vol: 0.06, at, bus: musicBus });
    // music box arpeggio
    if (beat % 2 === 0 || (battle && I > 0.3)) tine(N(chord[(beat >> (battle && I > 0.3 ? 0 : 1)) % 3] + 12), at, battle ? 0.032 : 0.045, musicBus, 1.1);
    // melody
    if ((beat === 0 || beat === 3 || beat === 6 || (I > 0.75 && beat === 5)) && Math.random() < 0.75) {
      melodyDeg = Math.max(0, Math.min(scale.length - 1, melodyDeg + [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)]));
      const n = N(scale[melodyDeg] + 12);
      tine(n, at, 0.065, musicBus, 1.8);
      if (battle && I > 0.75) tone(n * 2, spb * 1.5, { type: 'triangle', vol: 0.03, at, bus: musicBus, attack: 0.01 });
    }
    // drums
    if (battle) {
      if (I > 0.15 && (beat === 0 || beat === 4 || (I > 0.6 && beat === 7))) kick(at);
      if (I > 0.15 && beat % 2 === 1) hat(at);
      if (I > 0.45 && (beat === 2 || beat === 6)) snare(at);
      if (I <= 0.15 && (beat === 2 || beat === 6)) noise(0.05, { freq: 1800, q: 6, vol: 0.05, at, bus: musicBus });
    }
    if (boss && beat === 0 && bar % 2 === 0) tone(N(chord[0] - 24), spb * 6, { type: 'sawtooth', vol: 0.025, at, bus: musicBus, attack: 0.2 });
    nextT += spb;
    step++;
  }
}
