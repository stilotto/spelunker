// Ship tour: tap the hangar preview to zoom into the Spelunker and walk
// through each room. Wall monitors show that room's systems; the room's AI
// sits in its chair as a hologram of its crew-panel portrait.
import { CREW, MASSES, UPGRADES, RESEARCH, RELICS } from './data.js';
import { lvl, has, relic, computeStats, crewUnlocked, visibleResearch, save } from './state.js';
import { advise } from './voices.js';
import { ROOMS } from './run.js';
import { reducedMotion } from './render.js';
import { sfx } from './audio.js';

const TAU = Math.PI * 2;
const $ = s => document.querySelector(s);
const fmt = n => Math.floor(n).toLocaleString('en-US');
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = k => k * k * (3 - 2 * k);
const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// station-view advice timing (seconds) , matching the hangar readouts (but no drift)
const TALK_IN = 1.1, TALK_OUT = 1.8, TALK_GAP = 0.6;
const HOLD = 3.4, PAN = 0.9, ZOOM_IN = 1.7, ZOOM_OUT = 1.4;
const RAIN = '01アイウエオカキクケコサシスセソタチツテトナニヌネノ2345789ﾊﾋﾌﾍﾎ';

// Walk order: in through the bridge, finish at the reactor (the heart of the ship).
const TOUR = [
  { room: 'bridge',  crew: 'pilot',    deck: '01', name: 'Bridge' },
  { room: 'guns',    crew: 'gunner',   deck: '02', name: 'Gun deck' },
  { room: 'shield',  crew: 'shieldt',  deck: '03', name: 'Shield generator' },
  { room: 'drive',   crew: 'repair',   deck: '04', name: 'Drive & heat' },
  { room: 'reactor', crew: 'security', deck: '05', name: 'Reactor core' },
];
const UNLOCK = { pilot: 'Pilot AI: VANE', security: 'Security AI: BOLT', shieldt: 'Shield AI: AEGIS', repair: 'Repair AI: PATCH' };

export class Tour {
  constructor(hangar) {
    this.h = hangar;
    this.el = $('#tour');
    this.cv = $('#tourCv');
    this.ctx = this.cv.getContext('2d');
    this.active = false;
    $('#tourSkip').addEventListener('click', e => { e.stopPropagation(); this.close(); });
    this.cv.addEventListener('click', () => this.advance());
    addEventListener('keydown', e => { if (this.active && e.code === 'Escape') this.close(); });
    addEventListener('resize', () => this.active && this.resize());
  }

  // open() plays the full tour; open('gunner') shows just that AI's station.
  open(crewId) {
    const S = this.h.S;
    this.S = S; this.st = computeStats(S);
    this.crew = crewUnlocked(S);
    this.rm = reducedMotion();
    const pr = $('#preview').getBoundingClientRect();
    this.from = { x: pr.left + pr.width / 2, y: pr.top + pr.height * 0.44, R: Math.min(pr.width, pr.height) * 0.2 };
    // timeline
    const ph = [{ k: 'in', d: this.rm ? 0.6 : ZOOM_IN }];
    TOUR.forEach((_, i) => {
      if (i) ph.push({ k: 'pan', from: i - 1, to: i, d: this.rm ? 0.35 : PAN });
      ph.push({ k: 'room', i, d: HOLD });
    });
    ph.push({ k: 'out', d: this.rm ? 0.6 : ZOOM_OUT });
    this.single = crewId ? TOUR.findIndex(r => r.crew === crewId) : -1;
    if (this.single >= 0) ph.splice(0, ph.length, { k: 'room', i: this.single, d: Infinity });
    this.talk = null; // station view only: the AI's advice, one line at a time
    let t = 0; for (const p of ph) { p.t0 = t; t += p.d; }
    this.phases = ph; this.total = t;
    const skip = $('#tourSkip');
    skip.textContent = this.single >= 0 ? '✕' : 'Skip ✕';
    skip.setAttribute('aria-label', this.single >= 0 ? 'Back to crew' : 'Skip tour');
    skip.classList.toggle('round', this.single >= 0);
    $('#tourHint').hidden = this.single >= 0;
    this.t = 0; this.boot = {};
    this.screens = TOUR.map(r => this.roomScreens(r));
    this.el.hidden = false;
    this.active = true;
    this.resize();
    sfx(this.single >= 0 ? 'contact' : 'launch');
  }

  close() {
    this.active = false;
    this.el.hidden = true;
  }

  advance() {
    if (this.single >= 0) return;
    // tap: jump to the next room (or finish the zoom-in right away)
    const i = this.phases.findIndex(p => this.t >= p.t0 && this.t < p.t0 + p.d);
    const cur = this.phases[i];
    if (!cur || cur.k === 'out') return;
    const next = this.phases.slice(i + 1).find(p => p.k === 'pan' || p.k === 'out' || (cur.k === 'in' && p.k === 'room'));
    if (next) this.t = next.t0;
  }

  resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.w = innerWidth; this.hgt = innerHeight; this.dpr = dpr;
    this.cv.width = Math.round(this.w * dpr); this.cv.height = Math.round(this.hgt * dpr);
  }

  // ---------------------------------------------------------- timeline
  tick(dt) {
    if (!this.active) return;
    this.t += dt;
    if (this.t >= this.total) { this.close(); return; }
    const ctx = this.ctx, w = this.w, h = this.hgt;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const p = this.phases.find(q => this.t >= q.t0 && this.t < q.t0 + q.d);
    const k = clamp((this.t - p.t0) / p.d, 0, 1);
    if (p.k === 'in') this.zoom(k, 0, true);
    else if (p.k === 'out') this.zoom(k, TOUR.length - 1, false);
    else if (p.k === 'room') this.drawRoom(p.i, 0, this.single >= 0 ? ease(clamp(this.t / 0.35, 0, 1)) : 1);
    else if (this.rm) { // reduced motion: crossfade instead of sliding
      this.drawRoom(p.from, 0, 1 - k); this.drawRoom(p.to, 0, k);
    } else {
      const e = ease(k);
      this.drawRoom(p.from, -e * w, 1);
      this.drawRoom(p.to, (1 - e) * w, 1);
      this.bulkhead((1 - e) * w);
    }
    if (this.single >= 0) return;
    if (p.k === 'room' && !p.sfx) { p.sfx = true; sfx('contact'); }
    $('#tourHint').hidden = p.k === 'out';
  }

  // Zoom from the hangar preview into a room (or back out again).
  zoom(k, roomIdx, inward) {
    const ctx = this.ctx, w = this.w, h = this.hgt;
    const f = this.from;
    const room = ROOMS.find(r => r.id === TOUR[roomIdx].room);
    const e = ease(inward ? k : 1 - k);       // 0 = hangar view, 1 = inside the room
    const Rbig = Math.max(w, h) * 3.2;
    const R = f.R * Math.pow(Rbig / f.R, e * e);
    const cx = f.x + (w / 2 - f.x) * e - room.x * R * e;
    const cy = f.y + (h / 2 - f.y) * e - room.y * R * e;
    // backdrop fades in over the hangar, then back out at the end
    const bg = inward ? clamp(k / 0.25, 0, 1) : clamp((1 - k) / 0.3, 0, 1);
    ctx.fillStyle = `rgba(5,7,10,${bg})`; ctx.fillRect(0, 0, w, h);
    const s = R / 70;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
    this.h.prev.drawVessel(ctx, 0, 0, 70, this.h.vesselOpts(this.h.t, true));
    ctx.restore();
    // cross-fade to the room once we're through the glass
    const ra = clamp((e - 0.72) / 0.28, 0, 1);
    if (ra > 0) this.drawRoom(roomIdx, 0, ra);
  }

  bulkhead(x) {
    const ctx = this.ctx, h = this.hgt;
    ctx.fillStyle = '#0d1219'; ctx.fillRect(x - 14, 0, 28, h);
    ctx.fillStyle = '#26303d'; ctx.fillRect(x - 14, 0, 4, h); ctx.fillRect(x + 10, 0, 4, h);
    for (let y = 20; y < h; y += 46) { ctx.fillStyle = '#ffb347'; ctx.fillRect(x - 6, y, 12, 18); ctx.fillStyle = '#1a1206'; ctx.fillRect(x - 6, y + 9, 12, 9); }
  }

  // ---------------------------------------------------------- a room
  drawRoom(i, ox, alpha) {
    if (alpha <= 0) return;
    const ctx = this.ctx, w = this.w, h = this.hgt, t = this.t;
    const R = TOUR[i], col = CREW[R.crew].color, online = this.crew.includes(R.crew);
    if (this.boot[i] === undefined) this.boot[i] = t;
    const bt = t - this.boot[i];
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(ox, 0);
    ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();

    // walls, ceiling strip lights, floor grid
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#070a0f'); g.addColorStop(0.55, '#0c121a'); g.addColorStop(1, '#05070a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const wash = ctx.createRadialGradient(w / 2, h * 0.75, 10, w / 2, h * 0.75, Math.max(w, h) * 0.7);
    wash.addColorStop(0, hexA(col, 0.16)); wash.addColorStop(1, hexA(col, 0));
    ctx.fillStyle = wash; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(200,230,255,0.08)';
    for (let x = w * 0.1; x < w; x += w * 0.2) ctx.fillRect(x, 8, w * 0.1, 3);
    const floorY = h - 64;
    ctx.strokeStyle = hexA(col, 0.18); ctx.lineWidth = 1;
    for (let k = 0; k < 5; k++) { const y = floorY + k * k * 3 + k * 4; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    for (let k = -8; k <= 8; k++) { ctx.beginPath(); ctx.moveTo(w / 2 + k * w * 0.06, floorY); ctx.lineTo(w / 2 + k * w * 0.2, h); ctx.stroke(); }

    // header plate
    ctx.fillStyle = hexA(col, 0.9); ctx.fillRect(16, 22, 4, 30);
    ctx.fillStyle = '#8d99ab'; ctx.font = '600 11px "Chakra Petch", sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(`DECK ${R.deck} / 05`, 28, 34);
    ctx.fillStyle = '#e6ebf2'; ctx.font = '700 22px "Chakra Petch", sans-serif';
    ctx.fillText(R.name.toUpperCase(), 28, 54);

    // layout: monitor wall on top, crew chair below
    const chairH = Math.min(h * 0.36, 300, w * 0.7);
    const wallTop = 70, wallBot = floorY - chairH - 8;
    // in the station view the AI talks beside its chair; on narrow screens
    // the chair slides left so the words have room on the right
    const talking = this.single === i && online;
    const chairX = talking && w < 640 ? w * 0.27 : w / 2;
    const scr = this.screens[i];
    const cols = w > 900 ? 4 : w > 560 ? 3 : 2;
    const rows = Math.ceil(scr.length / cols);
    const gap = 10, pad = 16;
    const cw = (w - pad * 2 - gap * (cols - 1)) / cols;
    const chh = Math.max(60, (wallBot - wallTop - gap * (rows - 1)) / rows);
    scr.forEach((s, j) => {
      const c = j % cols, r = (j / cols) | 0;
      // centre a short last row
      const inRow = Math.min(cols, scr.length - r * cols);
      const rowOff = (cols - inRow) * (cw + gap) / 2;
      const x = pad + rowOff + c * (cw + gap), y = wallTop + r * (chh + gap);
      this.screen(x, y, cw, chh, s, col, bt - 0.15 - j * 0.12, j + i * 10);
    });

    this.chair(chairX, floorY, chairH, col, online, R, bt);
    if (talking) this.talkBeside(chairX, floorY, chairH, col, R.crew, w < 640);
    ctx.restore();
  }

  screen(x, y, w, h, s, col, on, seed) {
    const ctx = this.ctx, t = this.t;
    // bezel
    ctx.fillStyle = '#0a0e14'; ctx.strokeStyle = '#2a3646'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke();
    const ix = x + 5, iy = y + 5, iw = w - 10, ih = h - 10;
    if (on <= 0) { ctx.fillStyle = '#020304'; ctx.fillRect(ix, iy, iw, ih); return; }
    // CRT power-on: a bright line that opens into the picture
    const open = clamp(on / 0.18, 0, 1);
    ctx.save();
    ctx.beginPath(); ctx.rect(ix, iy + ih / 2 * (1 - open), iw, ih * open + 1); ctx.clip();
    const phosphor = s.kind === 'rain' ? '#3dff7a' : col;
    ctx.fillStyle = s.kind === 'rain' ? '#020a04' : '#03080d'; ctx.fillRect(ix, iy, iw, ih);
    const flick = 0.9 + 0.1 * Math.sin(t * 40 + seed);
    const fs = clamp(Math.min(iw / 15, ih / 6.2), 9, 14);
    ctx.textBaseline = 'alphabetic';
    if (s.kind === 'rain') this.rain(ix, iy, iw, ih, seed, fs);
    else if (s.kind === 'radar') this.radar(ix, iy, iw, ih, phosphor, seed);
    else if (s.kind === 'wave') this.wave(ix, iy, iw, ih, phosphor, seed);
    if (s.title) {
      ctx.fillStyle = hexA(phosphor, 0.95 * flick); ctx.font = `700 ${fs}px "Chakra Petch", sans-serif`; ctx.textAlign = 'left';
      ctx.fillText(s.title, ix + 8, iy + fs + 5);
      ctx.fillStyle = hexA(phosphor, 0.35); ctx.fillRect(ix + 8, iy + fs + 9, iw - 16, 1);
    }
    if (s.lines) {
      const lh = fs * 1.5, maxLines = Math.floor((ih - fs - 16) / lh);
      s.lines.slice(0, maxLines).forEach(([label, val, frac, dim], n) => {
        const ly = iy + fs + 16 + (n + 1) * lh - 4;
        ctx.font = `500 ${fs * 0.92}px "Chakra Petch", sans-serif`; ctx.textAlign = 'left';
        ctx.fillStyle = hexA(phosphor, (dim ? 0.35 : 0.7) * flick);
        ctx.fillText(label, ix + 8, ly);
        ctx.textAlign = 'right'; ctx.font = `700 ${fs * 0.92}px "Chakra Petch", sans-serif`;
        ctx.fillStyle = dim ? hexA('#8d99ab', 0.6) : hexA('#e8f7ff', 0.95 * flick);
        ctx.fillText(val, ix + iw - 8, ly);
        if (frac !== undefined) {
          ctx.fillStyle = hexA(phosphor, 0.15); ctx.fillRect(ix + 8, ly + 3, iw - 16, 2);
          ctx.fillStyle = hexA(phosphor, 0.9); ctx.fillRect(ix + 8, ly + 3, (iw - 16) * clamp(frac, 0, 1), 2);
        }
      });
    }
    // scanlines + glass
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let yy = iy; yy < iy + ih; yy += 3) ctx.fillRect(ix, yy, iw, 1);
    const sweep = (t * 60 + seed * 37) % (ih + 40) - 20;
    ctx.fillStyle = hexA(phosphor, 0.06); ctx.fillRect(ix, iy + sweep, iw, 14);
    if (open < 1) { ctx.fillStyle = `rgba(255,255,255,${1 - open})`; ctx.fillRect(ix, iy + ih / 2 - 1, iw, 2); }
    ctx.restore();
  }

  rain(x, y, w, h, seed, fs) {
    const ctx = this.ctx, t = this.t;
    const size = Math.max(9, fs * 0.9), cols = Math.floor(w / size);
    ctx.font = `600 ${size}px monospace`; ctx.textAlign = 'center';
    for (let c = 0; c < cols; c++) {
      const sp = 40 + hash(seed * 31 + c) * 70, len = 6 + ((hash(c + seed) * 10) | 0);
      const head = ((t * sp + hash(c * 7 + seed) * 400) % (h + len * size)) - len * size * 0.2;
      for (let k = 0; k < len; k++) {
        const yy = y + head - k * size;
        if (yy < y || yy > y + h) continue;
        const ch = RAIN[(Math.floor(t * 8 + c * 3 + k * 5 + seed) % RAIN.length + RAIN.length) % RAIN.length];
        ctx.fillStyle = k === 0 ? 'rgba(210,255,220,0.95)' : `rgba(61,255,122,${0.8 * (1 - k / len)})`;
        ctx.fillText(ch, x + c * size + size / 2, yy);
      }
    }
  }

  radar(x, y, w, h, col, seed) {
    const ctx = this.ctx, t = this.t;
    const cx = x + w / 2, cy = y + h / 2 + 6, r = Math.min(w, h) * 0.38;
    ctx.strokeStyle = hexA(col, 0.35); ctx.lineWidth = 1;
    for (const k of [0.35, 0.7, 1]) { ctx.beginPath(); ctx.arc(cx, cy, r * k, 0, TAU); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
    const a = t * 2.2 + seed;
    ctx.fillStyle = hexA(col, 0.18);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, a - 0.7, a); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = hexA(col, 0.9); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.stroke();
    for (let b = 0; b < 4; b++) {
      const ba = hash(seed + b) * TAU, br = r * (0.3 + hash(b * 3 + seed) * 0.6);
      const since = ((a - ba) % TAU + TAU) % TAU;
      ctx.fillStyle = hexA('#ff5c6a', clamp(1 - since / 3, 0, 1));
      ctx.beginPath(); ctx.arc(cx + Math.cos(ba) * br, cy + Math.sin(ba) * br, 3, 0, TAU); ctx.fill();
    }
  }

  wave(x, y, w, h, col, seed) {
    const ctx = this.ctx, t = this.t;
    for (const [amp, fr, al, ph] of [[0.22, 0.05, 0.9, 0], [0.12, 0.11, 0.45, 2]]) {
      ctx.strokeStyle = hexA(col, al); ctx.lineWidth = 1.5; ctx.beginPath();
      for (let xx = 0; xx <= w - 16; xx += 3) {
        const yy = y + h * 0.62 + Math.sin(xx * fr + t * 4 + seed + ph) * h * amp * Math.sin(xx * 0.013 + t);
        ctx[xx ? 'lineTo' : 'moveTo'](x + 8 + xx, yy);
      }
      ctx.stroke();
    }
  }

  // Crew chair with the AI projected above it as a hologram.
  chair(cx, floorY, H, col, online, R, bt) {
    const ctx = this.ctx, t = this.t;
    const base = floorY - 40;          // leave room for the name plate
    const ch = H - 44;
    // pedestal
    ctx.fillStyle = '#10161f'; ctx.beginPath(); ctx.ellipse(cx, base, ch * 0.3, ch * 0.06, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1a222e'; ctx.fillRect(cx - ch * 0.05, base - ch * 0.26, ch * 0.1, ch * 0.26);
    // backrest
    const bw = ch * 0.44, btop = base - ch * 0.95;
    const bg = ctx.createLinearGradient(cx - bw / 2, 0, cx + bw / 2, 0);
    bg.addColorStop(0, '#141b25'); bg.addColorStop(0.5, '#2a3444'); bg.addColorStop(1, '#141b25');
    ctx.fillStyle = bg; ctx.strokeStyle = '#3a4658'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(cx - bw / 2, btop, bw, ch * 0.62, bw * 0.22); ctx.fill(); ctx.stroke();
    ctx.fillStyle = hexA(col, online ? 0.8 : 0.25); ctx.fillRect(cx - 2, btop + ch * 0.08, 4, ch * 0.44);
    // seat + arms
    ctx.fillStyle = '#222b38';
    ctx.beginPath(); ctx.roundRect(cx - ch * 0.3, base - ch * 0.36, ch * 0.6, ch * 0.11, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1a222e';
    for (const sd of [-1, 1]) { ctx.beginPath(); ctx.roundRect(cx + sd * ch * 0.3 - (sd > 0 ? ch * 0.08 : 0), base - ch * 0.5, ch * 0.08, ch * 0.18, 5); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = hexA(col, 0.9 * (online ? 1 : 0.3)); for (const sd of [-1, 1]) ctx.fillRect(cx + sd * ch * 0.3 - (sd > 0 ? ch * 0.06 : -ch * 0.02), base - ch * 0.48, ch * 0.04, 3);

    const size = ch * 0.62, hy = btop + ch * 0.3;
    const d = CREW[R.crew];
    if (online) {
      const lv = this.S.crew[R.crew];
      const appear = clamp((bt - 0.5) / 0.6, 0, 1);
      // projector cone from the seat
      const cone = ctx.createLinearGradient(0, base - ch * 0.36, 0, hy - size * 0.4);
      cone.addColorStop(0, hexA(col, 0.35 * appear)); cone.addColorStop(1, hexA(col, 0));
      ctx.fillStyle = cone;
      ctx.beginPath(); ctx.moveTo(cx - ch * 0.08, base - ch * 0.36); ctx.lineTo(cx + ch * 0.08, base - ch * 0.36);
      ctx.lineTo(cx + size * 0.55, hy - size * 0.45); ctx.lineTo(cx - size * 0.55, hy - size * 0.45); ctx.closePath(); ctx.fill();
      const flick = appear * (0.82 + 0.12 * Math.sin(t * 9) + 0.06 * Math.sin(t * 31));
      aiIcon(ctx, cx, hy + Math.sin(t * 1.6) * 3, size, col, flick, t);
      // travelling scan line over the hologram
      const sy = hy - size / 2 + ((t * 50) % size);
      ctx.fillStyle = hexA(col, 0.35 * appear); ctx.fillRect(cx - size / 2, sy, size, 2);
      this.plate(cx, floorY, d.name, `${d.role} · Level ${lv.lvl}`, col, 1);
    } else {
      aiIcon(ctx, cx, hy, size, '#5b6b82', 0.18 + 0.05 * Math.sin(t * 2), t, true);
      this.plate(cx, floorY, 'STATION VACANT', `Research "${UNLOCK[R.crew]}" to bring ${d.name} online`, '#8d99ab', 0.8);
    }
  }

  // Advice floats beside the chair like the hangar stat readouts: eased
  // fade-in, hold, then fade out in place; then the next line,
  // on the other side (wide screens) or the same side (narrow).
  talkBeside(cx, floorY, chairH, col, crewId, narrow) {
    const ctx = this.ctx, w = this.w, t = this.t;
    let T = this.talk;
    if (!T || t >= T.t0 + T.life) {
      const line = advise(this.S, crewId);
      save(this.S);
      const side = narrow ? 1 : T ? -T.side : (Math.random() < 0.5 ? -1 : 1);
      T = this.talk = { line, side, t0: T ? t : t + 0.9, hold: 2.8 + line.length / 24, wrapped: null };
      T.life = TALK_IN + T.hold + TALK_OUT + TALK_GAP;
    }
    const lt = t - T.t0;
    if (lt < 0) return;
    const k = Math.min(1, lt / TALK_IN), fadeIn = k * k * (3 - 2 * k);
    const out = Math.max(0, lt - TALK_IN - T.hold);
    const a = Math.max(0, Math.min(fadeIn, 1 - out / TALK_OUT));
    if (a <= 0) return;

    const ch = chairH - 44, margin = ch * 0.36 + 14;
    const edge = T.side > 0 ? cx + margin : cx - margin;
    const maxW = Math.min(340, T.side > 0 ? w - 16 - edge : edge - 16);
    ctx.font = '500 13.5px Inter, sans-serif';
    if (!T.wrapped || T.maxW !== maxW) { T.wrapped = wrap(ctx, T.line, maxW - 10); T.maxW = maxW; }
    const lh = 19, textH = 18 + T.wrapped.length * lh;
    const hy = floorY - 40 - ch * 0.95 + ch * 0.3;              // hologram head height
    const y0 = hy - textH / 2;
    const tx = T.side > 0 ? edge + 10 : edge - 10;
    // colours carry the fade (iPhone WebKit ignores globalAlpha on glowing text)
    ctx.save();
    ctx.textAlign = T.side > 0 ? 'left' : 'right';
    ctx.fillStyle = hexA(col, 0.85 * a);
    ctx.font = '600 10.5px "Chakra Petch", sans-serif';
    ctx.fillText(CREW[crewId].name.split('').join(String.fromCharCode(8202)), tx, y0 + 10);
    ctx.fillStyle = hexA('#e3ecf5', 0.95 * a);
    ctx.font = '500 13.5px Inter, sans-serif';
    T.wrapped.forEach((ln, n) => ctx.fillText(ln, tx, y0 + 30 + n * lh));
    ctx.fillStyle = hexA(col, 0.5 * a);
    ctx.fillRect(edge - 1, y0, 2, textH + 4);                   // bracket tick on the chair side
    ctx.restore();
  }

  plate(cx, y, name, sub, col, a) {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.fillStyle = hexA(col, a); ctx.font = '700 18px "Chakra Petch", sans-serif';
    ctx.fillText(name, cx, y - 14);
    ctx.fillStyle = hexA('#c3ccd8', 0.9 * a); ctx.font = '500 12px Inter, sans-serif';
    ctx.fillText(sub, cx, y + 4, this.w - 32);
  }

  // ---------------------------------------------------------- monitor content
  roomScreens(R) {
    const S = this.S, st = this.st;
    const U = id => UPGRADES.find(u => u.id === id);
    const up = id => { const u = U(id), l = lvl(S, id); return [u.name, `${l}/${u.max}`, l / u.max]; };
    const upR = (id, rs) => has(S, rs) ? up(id) : [U(id).name, 'LOCKED', undefined, true];
    const rs = id => { const r = RESEARCH.find(q => q.id === id); return [r.name, has(S, id) ? 'ONLINE' : 'OFFLINE', undefined, !has(S, id)]; };
    const on = id => has(S, id);
    switch (R.room) {
      case 'bridge': return [
        { title: 'NAVIGATION', lines: [['Fall speed', `${st.speed.toFixed(1)} m/s`], ['Steering', `${fmt(st.steer)}`], ['Auto-centre', `${st.assist.toFixed(1)}×`]] },
        { kind: 'radar' },
        { title: 'DEPTH LOG', lines: MASSES.slice(0, S.massUnlocked + 1).map((m, i) => [m.name, `${fmt(S.best[i] || 0)} / ${fmt(m.core)} m`, (S.best[i] || 0) / m.core]) },
        { title: 'HELM SYSTEMS', lines: [up('drive'), S.runs >= 2 ? up('thrust') : ['Lateral thrusters', 'LOCKED', undefined, true], rs('overdrive')] },
        { title: 'MISSION', lines: [['Target', MASSES[S.mass].name], ['Runs flown', fmt(S.runs)], ['Cores destroyed', fmt(Object.values(S.cleared).reduce((a, b) => a + b, 0))]] },
        { kind: 'rain' },
      ];
      case 'guns': return [
        { title: 'AUTOCANNONS', lines: [['Turrets', String(st.turrets)], ['Damage / shot', fmt(st.gunDmg)], ['Fire rate', `${st.fireRate.toFixed(1)}/s`], ['Total DPS', fmt(st.turrets * st.gunDmg * st.fireRate)]] },
        { title: 'GUN UPGRADES', lines: [up('caliber'), up('loader'), up('hardpt'), up('drill')] },
        { kind: 'rain' },
        { title: 'HEAVY WEAPONS', lines: [on('missiles') ? ['Missiles / volley', String(st.missiles)] : rs('missiles'), on('lance') ? ['Lance damage', fmt(st.lanceDmg)] : rs('lance'), on('drones') ? ['Wingmen', String(st.wingmen)] : rs('drones'), rs('twinlance')] },
        { kind: 'wave', title: 'TARGETING' },
        { title: 'DRILL', lines: [['Ram damage', `${fmt(st.ram)}/s`], rs('phase')] },
      ];
      case 'shield': return [
        { title: 'SHIELD', lines: st.shieldMax ? [['Capacity', fmt(st.shieldMax)], ['Regen', `${st.shieldRegen.toFixed(1)}/s`]] : [['Emitter', 'OFFLINE', undefined, true], ['Research', 'Shield emitter', undefined, true]] },
        { kind: 'wave', title: 'FIELD HARMONICS' },
        { title: 'HULL', lines: [['Integrity', fmt(st.hullMax)], ['Armour', `${Math.round(st.armor * 100)}%`], ['Impact dmg', `${Math.round(st.impact * 100)}%`]] },
        { title: 'PLATING', lines: [up('hull'), up('armor'), up('impact')] },
        { title: 'EMITTER', lines: [upR('shcap', 'shield'), upR('shreg', 'shield'), rs('fortress')] },
        { kind: 'radar' },
      ];
      case 'drive': return [
        { title: 'THERMAL', lines: [['Heat capacity', fmt(st.heatMax)], ['Cooling', `${st.cooling.toFixed(1)}/s`]] },
        { kind: 'wave', title: 'CORE TEMP' },
        { title: 'HEAT SYSTEMS', lines: [up('sinks'), up('coolant')] },
        { title: 'REPAIR', lines: [['Hull repair', `${st.regen.toFixed(1)}/s`], rs('nanites'), upR('nanite', 'nanites')] },
        { kind: 'rain' },
        { title: 'SALVAGE', lines: [['Tractor range', fmt(st.magnet)], ['Salvage bonus', `+${Math.round((st.salvageMul - 1) * 100)}%`], rs('salvai')] },
      ];
      default: return [
        { title: 'SECURITY', lines: has(S, 'security') ? [['Bots', String(st.bots)], ['Bot power', `${Math.round(st.botPow * 100)}%`], up('bots'), up('botarm')] : [rs('security'), ['Intruders', 'UNOPPOSED', undefined, true]] },
        { kind: 'rain' },
        { title: 'ANSIBLE LINK', lines: [['Data bonus', `+${Math.round((st.dataMul - 1) * 100)}%`], ['Crew learning', `${Math.round(st.xpMul * 100)}%`], rs('ansible')] },
        { title: 'RESEARCH', lines: [['Completed', `${Object.keys(S.research).length} / ${RESEARCH.length}`, Object.keys(S.research).length / RESEARCH.length], ['Decoded', `${visibleResearch(S).length}`], rs('emp')] },
        { kind: 'radar' },
        { title: 'RELICS', lines: Object.keys(S.cleared).length ? RELICS.map(r => [r.name, `${relic(S, r.id)}/${r.max}`, relic(S, r.id) / r.max]) : [['Core shards', '0'], ['Relic forge', 'AWAITING CORE', undefined, true]] },
      ];
    }
  }
}

// The crew-panel portrait (same shapes as the Crew tab SVG), drawn as a hologram.
export function aiIcon(ctx, x, y, size, col, a, t, ghost) {
  const s = size / 56;
  ctx.save();
  ctx.translate(x - 28 * s, y - 28 * s); ctx.scale(s, s);
  ctx.lineJoin = 'round';
  const glow = (fn, w) => { // fake glow: a wide faint stroke under the real one
    ctx.lineWidth = w * 3.5; ctx.strokeStyle = hexA(col, 0.12 * a); fn(); ctx.stroke();
    ctx.lineWidth = w; ctx.strokeStyle = hexA(col, a); fn(); ctx.stroke();
  };
  ctx.fillStyle = hexA('#0b1119', 0.45 * a);
  ctx.beginPath(); ctx.roundRect(2, 2, 52, 52, 14); ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = hexA(col, 0.6 * a); ctx.stroke();
  if (ghost) ctx.setLineDash([3, 3]);
  glow(() => { ctx.beginPath(); ctx.arc(28, 25, 13, 0, TAU); }, 2);
  glow(() => { ctx.beginPath(); ctx.moveTo(14, 48); ctx.quadraticCurveTo(28, 36, 42, 48); }, 2);
  ctx.setLineDash([]);
  if (!ghost) {
    ctx.fillStyle = hexA(col, a); ctx.beginPath(); ctx.roundRect(19, 21, 18, 6, 3); ctx.fill();
    ctx.fillStyle = hexA(col, a * (0.6 + 0.4 * Math.cos(t * Math.PI))); ctx.beginPath(); ctx.arc(44, 12, 3, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${clamp(a, 0, 1).toFixed(3)})`;
}

function wrap(ctx, text, maxW) {
  const out = []; let line = '';
  for (const word of text.split(' ')) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) { out.push(line); line = word; } else line = test;
  }
  if (line) out.push(line);
  return out;
}
