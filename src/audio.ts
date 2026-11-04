// Синтезовані звуки (WebAudio) — без жодних файлів.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

try { muted = localStorage.getItem('mishkobol-muted') === '1'; } catch { /* ignore */ }

export function unlockAudio() {
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
    } catch { ctx = null; }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function isMuted() { return muted; }
export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem('mishkobol-muted', m ? '1' : '0'); } catch { /* ignore */ }
  if (master) master.gain.value = m ? 0 : 0.5;
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0, delay = 0) {
  if (!ctx || !master || muted) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol: number, freq: number) {
  if (!ctx || !master || muted) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start();
}

export const sfx = {
  hit(speed: number) {
    const s = Math.min(1, speed / 16);
    tone(140 + s * 160, 0.12, 'sine', 0.5 + s * 0.4, -60);
    noise(0.06, 0.25 + s * 0.3, 900);
  },
  wall() { tone(320, 0.06, 'triangle', 0.18, -80); },
  net() { noise(0.12, 0.35, 2400); tone(500, 0.08, 'square', 0.05, -200); },
  floor() { tone(90, 0.18, 'sine', 0.6, -40); noise(0.1, 0.4, 400); },
  jump() { tone(260, 0.09, 'sine', 0.12, 220); },
  point(good: boolean) {
    if (good) { tone(660, 0.12, 'triangle', 0.25); tone(880, 0.18, 'triangle', 0.25, 0, 0.1); }
    else { tone(440, 0.14, 'triangle', 0.22); tone(330, 0.2, 'triangle', 0.22, 0, 0.12); }
  },
  whistle() { tone(2100, 0.25, 'sine', 0.12, 80); tone(2150, 0.25, 'sine', 0.08, 60); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.25, 0, i * 0.12)); },
};
