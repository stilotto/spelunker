// Tiny synthesized sound effects. No files to load.
let ac = null, master = null, on = true;
const last = {};

export function initAudio() {
  if (ac) { wake(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = 0.35; master.connect(ac.destination);
    wake();
  } catch (e) { ac = null; }
}
export function setSound(v) { on = v; if (!v) sleep(); }

// A running AudioContext keeps the phone's audio hardware awake even in
// silence, so suspend it after a few quiet seconds and wake it on the next sound.
let idleT = 0;
function wake() {
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  clearTimeout(idleT); idleT = setTimeout(sleep, 4000);
}
function sleep() {
  clearTimeout(idleT);
  if (ac && ac.state === 'running') ac.suspend().catch(() => {});
}
document.addEventListener('visibilitychange', () => { if (document.hidden) sleep(); });
// Some browsers only let a tap resume audio; any tap brings it back.
document.addEventListener('pointerdown', () => { if (ac && on) wake(); }, true);

function tone(freq, dur, type = 'square', vol = 0.2, slide = 0) {
  const t = ac.currentTime;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol = 0.3, freq = 800) {
  const t = ac.currentTime;
  const len = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource(); src.buffer = buf;
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
  const g = ac.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(master); src.start(t);
}

export function sfx(name) {
  if (!ac || !on) return;
  wake();
  const now = ac.currentTime;
  const gap = { shoot: 0.06, coin: 0.04, spark: 0.05, deflect: 0.08 }[name] || 0.03;
  if (last[name] && now - last[name] < gap) return;
  last[name] = now;
  switch (name) {
    case 'shoot': tone(420 + Math.random() * 60, 0.05, 'square', 0.035, 0.5); break;
    case 'coin': tone(1200 + Math.random() * 300, 0.06, 'triangle', 0.06, 1.5); break;
    case 'boom': noise(0.35, 0.35, 900); tone(90, 0.3, 'sine', 0.3, 0.4); break;
    case 'bigboom': noise(0.9, 0.5, 600); tone(60, 0.8, 'sine', 0.5, 0.3); break;
    case 'hit': noise(0.12, 0.25, 1600); break;
    case 'deflect': tone(900, 0.07, 'sine', 0.08, 1.4); break;
    case 'missile': noise(0.25, 0.12, 2400); break;
    case 'lance': tone(160, 0.4, 'sawtooth', 0.15, 3); break;
    case 'zap': tone(1800, 0.25, 'sawtooth', 0.12, 0.2); break;
    case 'charge': tone(300, 1.1, 'sine', 0.06, 4); break;
    case 'alarm': tone(660, 0.15, 'square', 0.1); setTimeout(() => ac && tone(520, 0.15, 'square', 0.1), 170); break;
    case 'clang': tone(180, 0.2, 'triangle', 0.25, 0.7); noise(0.1, 0.2, 3000); break;
    case 'good': tone(660, 0.1, 'triangle', 0.1); setTimeout(() => ac && tone(990, 0.14, 'triangle', 0.1), 90); break;
    case 'emp': tone(80, 0.6, 'sawtooth', 0.25, 6); noise(0.4, 0.2, 5000); break;
    case 'od': tone(120, 0.8, 'sawtooth', 0.2, 3); break;
    case 'contact': tone(880, 0.08, 'sine', 0.1); setTimeout(() => ac && tone(1320, 0.12, 'sine', 0.1), 100); break;
    case 'buy': tone(520, 0.08, 'triangle', 0.12, 1.5); break;
    case 'deny': tone(160, 0.12, 'square', 0.08); break;
    case 'launch': tone(90, 1.2, 'sawtooth', 0.18, 3); noise(1, 0.15, 400); break;
    case 'win': [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => ac && tone(f, 0.4, 'triangle', 0.14), i * 140)); break;
    case 'record': [784, 988, 1175].forEach((f, i) => setTimeout(() => ac && tone(f, 0.18, 'triangle', 0.12), i * 90)); break;
  }
}
