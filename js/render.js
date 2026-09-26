// Canvas renderer. Draws the tube, the Spelunker, enemies and effects.
import { M, CREW } from './data.js';

const TAU = Math.PI * 2;
const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const reducedMotion = () => {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
};

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.parts = [];
    this.shake = 0;
    this.flash = 0; this.flashC = '#fff';
    this.rm = reducedMotion();
    this.resize();
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.cv.clientWidth || innerWidth, h = this.cv.clientHeight || innerHeight;
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    this.w = w; this.h = h; this.dpr = dpr;
    this.scale = Math.min(h / 860, w / 640);
    this.vw = w / this.scale; this.vh = h / this.scale;
  }

  // ------------------------------------------------------------ particles
  part(o) { if (this.parts.length < 900) this.parts.push(o); }

  burst(x, y, n, col, sp, life, size, kind = 'spark') {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = sp * (0.3 + Math.random() * 0.7);
      this.part({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * rand(0.6, 1), max: life, size: size * rand(0.6, 1.3), col, kind });
    }
  }

  handle(ev, run) {
    const pal = run.mass.pal;
    switch (ev.k) {
      case 'spark': this.burst(ev.x, ev.y, 3, ev.c === 'drill' ? '#ffd27a' : ev.c === 'hull' ? '#ffb070' : pal.enemy2, 260, 0.25, 3); break;
      case 'deflect': this.burst(ev.x, ev.y, 4, '#8fe8ff', 220, 0.3, 3); break;
      case 'boom': {
        const r = ev.r || 20;
        this.burst(ev.x, ev.y, 10 + r / 2, pal.enemy2, 180 + r * 6, 0.5, 5);
        this.burst(ev.x, ev.y, 6 + r / 4, '#fff3d0', 120 + r * 3, 0.35, 4);
        this.burst(ev.x, ev.y, 4 + r / 5, 'rgba(60,60,70,', 60, 1.1, 12 + r / 3, 'smoke');
        this.part({ x: ev.x, y: ev.y, life: 0.35, max: 0.35, size: r * 2.6, col: pal.enemy2, kind: 'ring' });
        this.part({ x: ev.x, y: ev.y, life: 0.18, max: 0.18, size: r * 2.2, col: '#fff', kind: 'flash' });
        this.kick(Math.min(10, r / 4));
        break;
      }
      case 'barrierbreak': {
        for (let i = 0; i < 40; i++) {
          const x = ev.x + rand(-ev.w, ev.w);
          this.part({ x, y: ev.y + rand(-10, 20), vx: rand(-120, 120), vy: rand(-300, 200), life: rand(0.6, 1.3), max: 1.3, size: rand(4, 10), col: pal.edge, kind: 'debris', rot: rand(0, TAU), vr: rand(-8, 8) });
        }
        this.burst(ev.x, ev.y, 30, pal.edge2, 500, 0.5, 4);
        this.kick(14);
        this.flashOn(pal.edge2, 0.25);
        break;
      }
      case 'hullhit': this.kick(Math.min(8, 2 + ev.d / 3)); break;
      case 'scrape': this.burst(ev.x, ev.y, 8, '#ffd27a', 300, 0.35, 3); this.kick(4); break;
      case 'emp': this.part({ x: ev.x, y: ev.y, life: 0.6, max: 0.6, size: ev.r * 2, col: '#8fe8ff', kind: 'ring', w: 10 }); this.flashOn('#8fe8ff', 0.3); this.kick(6); break;
      case 'death': {
        for (let i = 0; i < 5; i++) setTimeout(() => this.handle({ k: 'boom', x: ev.x + rand(-60, 60), y: ev.y + rand(-60, 60), r: 40 }, run), i * 260);
        this.flashOn('#fff', 0.5);
        break;
      }
      case 'victory': {
        for (let i = 0; i < 8; i++) setTimeout(() => this.handle({ k: 'boom', x: ev.x + rand(-160, 160), y: ev.y + rand(-160, 160), r: 60 }, run), i * 220);
        setTimeout(() => this.flashOn('#fff', 1), 1800);
        break;
      }
      case 'pulse': this.part({ x: ev.x, y: ev.y, life: 0.5, max: 0.5, size: 520, col: pal.core, kind: 'ring', w: 6 }); break;
      case 'zapin': break;
    }
  }

  kick(n) { if (!this.rm) this.shake = Math.min(18, this.shake + n); }
  flashOn(c, a) { this.flashC = c; this.flash = Math.max(this.flash, this.rm ? a * 0.3 : a); }

  // ------------------------------------------------------------ frame
  draw(run, dt, best) {
    const { ctx } = this;
    const p = run.p, pal = run.mass.pal, s = this.scale, d = this.dpr;
    // camera: the Spelunker sits in the upper third so you see what's coming
    const cx = p.x * 0.6 + run.center(p.y + 300) * 0.4;
    const camX = cx - this.vw / 2;
    const camY = p.y - this.vh * 0.36;
    this.camX = camX; this.camY = camY;
    this.shake *= Math.pow(0.02, dt);
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    ctx.setTransform(d * s, 0, 0, d * s, (-camX + sx) * d * s, (-camY + sy) * d * s);

    this.drawBackground(run, camX, camY);
    this.drawFields(run, camX);
    this.drawWalls(run, camX, camY);
    this.drawMarkers(run, camX, camY, best);
    this.drawCoreGlow(run);
    this.drawPickups(run);
    for (const e of run.enemies) if (e.barrier) this.drawBarrier(run, e);
    for (const e of run.enemies) if (!e.barrier) this.drawEnemy(run, e);
    this.drawBeams(run);
    this.drawShots(run);
    if (!run.dead || run.overT > 1.6) this.drawVessel(ctx, p.x, p.y, run.R, this.vesselOpts(run));
    this.drawWing(run);
    this.drawBullets(run);
    this.ambient(run, dt, camX, camY);
    this.drawParts(dt);

    // screen-space overlays
    ctx.setTransform(d, 0, 0, d, 0, 0);
    const w = this.w, h = this.h;
    const vg = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.35, w / 2, h * 0.45, Math.max(w, h) * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
    const heat = p.heat / run.st.heatMax;
    if (heat > 0.6) {
      const a = (heat - 0.6) / 0.4 * (p.overheat ? 0.55 + 0.2 * Math.sin(run.t * 12) : 0.35);
      const hg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
      hg.addColorStop(0, 'rgba(255,60,0,0)'); hg.addColorStop(1, `rgba(255,70,10,${a})`);
      ctx.fillStyle = hg; ctx.fillRect(0, 0, w, h);
    }
    if (run.stasisOn) { ctx.fillStyle = 'rgba(120,180,255,0.08)'; ctx.fillRect(0, 0, w, h); }
    if (p.hitT > 0 && !this.rm) { ctx.fillStyle = `rgba(255,40,40,${p.hitT * 1.2})`; ctx.fillRect(0, 0, w, h); }
    if (this.flash > 0) {
      ctx.globalAlpha = Math.min(1, this.flash); ctx.fillStyle = this.flashC; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
      this.flash -= dt * 1.6;
    }
  }

  // ------------------------------------------------------------ environment
  drawBackground(run, camX, camY) {
    const { ctx } = this, pal = run.mass.pal, st = run.mass.style;
    const g = ctx.createLinearGradient(0, camY, 0, camY + this.vh);
    g.addColorStop(0, pal.bg0); g.addColorStop(1, pal.bg1);
    ctx.fillStyle = g; ctx.fillRect(camX - 20, camY - 20, this.vw + 40, this.vh + 40);
    // deeper = more glow from below
    const f = run.frac();
    const cg = ctx.createLinearGradient(0, camY + this.vh * 0.4, 0, camY + this.vh);
    cg.addColorStop(0, pal.fog + '0)'); cg.addColorStop(1, pal.fog + (0.06 + f * 0.22) + ')');
    ctx.fillStyle = cg; ctx.fillRect(camX - 20, camY - 20, this.vw + 40, this.vh + 40);

    // parallax back wall of the tube
    const par = 0.35, tile = 420;
    const py = camY * par;
    const t0 = Math.floor(py / tile) - 1, t1 = Math.ceil((py + this.vh) / tile) + 1;
    const cx = run.center(run.p.y);
    ctx.save();
    for (let t = t0; t <= t1; t++) {
      for (let k = 0; k < 4; k++) {
        const hsh = hash(t * 13 + k * 7.3);
        const x = cx + (hsh - 0.5) * 700;
        const y = t * tile + hash(t * 3.1 + k) * tile - py + camY;
        const sz = 30 + hash(t + k * 11) * 90;
        if (st === 'lava') {
          ctx.strokeStyle = pal.fog + '0.07)'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + sz * 0.3, y + sz); ctx.lineTo(x - sz * 0.2, y + sz * 2); ctx.stroke();
          ctx.fillStyle = pal.fog + '0.05)'; ctx.beginPath(); ctx.arc(x, y, sz * 0.4, 0, TAU); ctx.fill();
        } else if (st === 'tet') {
          ctx.strokeStyle = 'rgba(160,210,255,0.06)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x, y - sz); ctx.lineTo(x + sz, y + sz * 0.7); ctx.lineTo(x - sz, y + sz * 0.7); ctx.closePath(); ctx.stroke();
        } else if (st === 'veil') {
          const rg = ctx.createRadialGradient(x, y, 0, x, y, sz * 2);
          rg.addColorStop(0, hsh > 0.5 ? 'rgba(140,110,255,0.10)' : 'rgba(95,240,255,0.07)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = rg; ctx.fillRect(x - sz * 2, y - sz * 2, sz * 4, sz * 4);
        } else if (st === 'hive') {
          ctx.strokeStyle = 'rgba(150,255,90,0.06)'; ctx.lineWidth = 2;
          this.hex(x, y, sz * 0.5); ctx.stroke();
        } else {
          ctx.strokeStyle = 'rgba(255,210,80,0.07)'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(x - sz, y - sz); ctx.lineTo(x + sz, y + sz); ctx.moveTo(x + sz, y - sz); ctx.lineTo(x - sz, y + sz); ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  hex(x, y, r) {
    const { ctx } = this;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + Math.PI / 6; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r); }
    ctx.closePath();
  }

  drawWalls(run, camX, camY) {
    const { ctx } = this, pal = run.mass.pal, st = run.mass.style;
    const y0 = Math.floor((camY - 60) / 20) * 20, y1 = camY + this.vh + 60;
    const L = [], Rr = [];
    for (let y = y0; y <= y1; y += 20) {
      const c = run.center(y), h = run.half(y);
      L.push([c - h, y]); Rr.push([c + h, y]);
    }
    const far = 900;
    for (const [pts, side] of [[L, -1], [Rr, 1]]) {
      // rock body
      const g = ctx.createLinearGradient(pts[0][0], 0, pts[0][0] + side * 380, 0);
      g.addColorStop(0, pal.rock0); g.addColorStop(1, pal.rock1);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(pts[0][0] + side * far, y0);
      for (const [x, y] of pts) ctx.lineTo(x, y);
      ctx.lineTo(pts[pts.length - 1][0] + side * far, y1);
      ctx.closePath(); ctx.fill();

      // strata
      ctx.lineWidth = 2;
      for (const [off, a] of [[26, 0.35], [70, 0.18], [140, 0.1]]) {
        ctx.strokeStyle = st === 'tet' ? `rgba(40,45,55,${a})` : pal.fog + (a * 0.6) + ')';
        ctx.beginPath();
        pts.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x + side * off, y));
        ctx.stroke();
      }

      // style details, deterministic per 80-unit segment
      const s0 = Math.floor(y0 / 80), s1 = Math.ceil(y1 / 80);
      for (let sgi = s0; sgi <= s1; sgi++) {
        const y = sgi * 80, hs = hash(sgi * 1.7 + side * 91);
        const ex = run.center(y) + side * run.half(y);
        if (st === 'lava') {
          if (hs < 0.55) {
            ctx.strokeStyle = pal.vein; ctx.lineWidth = 2 + hs * 3; ctx.globalAlpha = 0.5 + 0.3 * Math.sin(run.t * 2 + sgi);
            ctx.beginPath(); ctx.moveTo(ex, y);
            let x = ex, yy = y;
            for (let k = 0; k < 4; k++) { x += side * (20 + hash(sgi + k) * 40); yy += (hash(sgi * 3 + k) - 0.5) * 50; ctx.lineTo(x, yy); }
            ctx.stroke(); ctx.globalAlpha = 1;
          }
        } else if (st === 'tet') {
          ctx.strokeStyle = 'rgba(30,34,40,0.55)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(ex, y); ctx.lineTo(ex + side * 400, y); ctx.stroke();
          if (hs < 0.35) { ctx.fillStyle = 'rgba(20,24,30,0.5)'; ctx.fillRect(ex + side * (40 + hs * 60) - (side < 0 ? 60 : 0), y + 14, 60, 40); }
          if (hs > 0.8) { ctx.fillStyle = pal.edge2; ctx.globalAlpha = 0.5 + 0.5 * Math.sin(run.t * 3 + sgi); ctx.fillRect(ex + side * 16 - 3, y + 30, 6, 6); ctx.globalAlpha = 1; }
        } else if (st === 'veil') {
          if (hs < 0.6) {
            ctx.fillStyle = hs < 0.3 ? pal.vein : pal.edge2; ctx.globalAlpha = 0.25 + 0.2 * Math.sin(run.t * 1.5 + sgi);
            ctx.beginPath(); ctx.arc(ex + side * (30 + hs * 90), y + 40, 6 + hs * 16, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
          }
        } else if (st === 'hive') {
          ctx.strokeStyle = pal.edge2; ctx.globalAlpha = 0.35; ctx.lineWidth = 5;
          ctx.beginPath(); ctx.arc(ex + side * 60, y + 40, 60, side < 0 ? -0.6 : Math.PI - 0.6 * -1 - 1.2, side < 0 ? 0.6 : Math.PI + 0.6); ctx.stroke(); ctx.globalAlpha = 1;
          if (hs < 0.3) { ctx.fillStyle = pal.vein; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(ex + side * 20, y + 10, 5, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
        } else {
          ctx.strokeStyle = 'rgba(255,210,80,0.35)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(ex, y); ctx.lineTo(ex + side * 80, y + 80); ctx.moveTo(ex + side * 80, y); ctx.lineTo(ex, y + 80); ctx.stroke();
        }
      }

      // glowing edge
      for (const [wd, a, col] of [[14, 0.12, pal.edge], [6, 0.35, pal.edge], [2, 0.95, pal.edge2]]) {
        ctx.strokeStyle = col; ctx.globalAlpha = a; ctx.lineWidth = wd;
        ctx.beginPath(); pts.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x, y)); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  drawMarkers(run, camX, camY, best) {
    const { ctx } = this, pal = run.mass.pal;
    ctx.font = '600 20px "Chakra Petch", sans-serif';
    const m0 = Math.floor(camY / (100 * M)), m1 = Math.ceil((camY + this.vh) / (100 * M));
    for (let m = m0; m <= m1; m++) {
      if (m <= 0) continue;
      const y = m * 100 * M;
      if (y > run.coreY - 1500) continue;
      const lx = run.center(y) - run.half(y);
      const big = m % 5 === 0;
      ctx.strokeStyle = pal.edge2; ctx.globalAlpha = big ? 0.8 : 0.45; ctx.lineWidth = big ? 4 : 2;
      ctx.beginPath(); ctx.moveTo(lx - 4, y); ctx.lineTo(lx + (big ? 34 : 18), y); ctx.stroke();
      ctx.fillStyle = pal.edge2; ctx.globalAlpha = big ? 0.9 : 0.5;
      ctx.textAlign = 'left'; ctx.fillText(`${m * 100} m`, lx + (big ? 42 : 24), y + 7);
      ctx.globalAlpha = 1;
    }
    if (best > 0) {
      const y = best * M;
      if (y > camY - 50 && y < camY + this.vh + 50 && y < run.coreY - 400) {
        const c = run.center(y), h = run.half(y);
        const passed = run.p.y > y;
        ctx.save();
        ctx.setLineDash([22, 14]); ctx.lineDashOffset = -run.t * 40;
        ctx.strokeStyle = passed ? '#7dffb0' : '#ff5c7a'; ctx.globalAlpha = 0.85; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(c - h, y); ctx.lineTo(c + h, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = passed ? '#7dffb0' : '#ff5c7a';
        ctx.font = '700 24px "Chakra Petch", sans-serif'; ctx.textAlign = 'right';
        ctx.fillText(passed ? 'RECORD BROKEN' : `BEST  ${Math.floor(best)} m`, c + h - 16, y - 12);
        ctx.restore();
      }
    }
  }

  drawCoreGlow(run) {
    const { ctx } = this, pal = run.mass.pal;
    const dy = run.coreY - (this.camY + this.vh);
    if (dy > 3200) return;
    const a = clamp(1 - dy / 3200, 0, 1);
    const cy = run.coreY + 150, cx = run.center(cy);
    const g = ctx.createRadialGradient(cx, cy, 50, cx, cy, 1600);
    g.addColorStop(0, pal.fog + (0.55 * a) + ')'); g.addColorStop(0.4, pal.fog + (0.18 * a) + ')'); g.addColorStop(1, pal.fog + '0)');
    ctx.fillStyle = g; ctx.fillRect(cx - 1600, cy - 1600, 3200, 3200);
  }

  drawFields(run, camX) {
    const { ctx } = this;
    for (const f of run.fields) {
      if (f.gen.hp <= 0) continue;
      const top = f.y - f.h / 2;
      const c = run.center(f.y), h = run.half(f.y) + 20;
      const g = ctx.createLinearGradient(0, top, 0, top + f.h);
      g.addColorStop(0, 'rgba(110,170,255,0)'); g.addColorStop(0.5, 'rgba(110,170,255,0.16)'); g.addColorStop(1, 'rgba(110,170,255,0)');
      ctx.fillStyle = g; ctx.fillRect(c - h, top, h * 2, f.h);
      ctx.strokeStyle = 'rgba(150,200,255,0.35)'; ctx.lineWidth = 2;
      for (let k = 0; k < 5; k++) {
        const yy = top + f.h * (k + 0.5) / 5;
        ctx.beginPath();
        for (let x = c - h; x <= c + h; x += 24) ctx[x === c - h ? 'moveTo' : 'lineTo'](x, yy + Math.sin(x / 40 + run.t * 3 + k) * 8);
        ctx.stroke();
      }
      // tether from field to generator
      ctx.strokeStyle = 'rgba(150,200,255,0.5)'; ctx.setLineDash([6, 8]);
      ctx.beginPath(); ctx.moveTo(f.gen.x, f.gen.y); ctx.lineTo(c, f.y); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  // ------------------------------------------------------------ pickups
  drawPickups(run) {
    const { ctx } = this;
    for (const k of run.pickups) {
      const b = Math.sin(k.t * 4) * 3;
      if (k.k === 'salvage') {
        ctx.fillStyle = 'rgba(255,220,120,0.15)'; ctx.beginPath(); ctx.arc(k.x, k.y + b, 16, 0, TAU); ctx.fill();
        ctx.save(); ctx.translate(k.x, k.y + b); ctx.rotate(k.t * 1.5);
        ctx.fillStyle = '#ffe38a'; ctx.strokeStyle = '#fff6d0'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(7, 0); ctx.lineTo(0, 8); ctx.lineTo(-7, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
      } else {
        const col = k.k === 'coolant' ? '#6fd8ff' : '#7dffb0';
        ctx.fillStyle = col + '33'; ctx.beginPath(); ctx.arc(k.x, k.y + b, 30, 0, TAU); ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(k.x, k.y + b, 18, 0, TAU); ctx.stroke();
        ctx.fillStyle = col; ctx.font = '700 22px "Chakra Petch", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(k.k === 'coolant' ? '❄' : '+', k.x, k.y + b + 8);
      }
    }
  }

  // ------------------------------------------------------------ enemies
  hpBar(e, w, dy) {
    if (e.hp >= e.maxHp || e.type === 'mine') return;
    const { ctx } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(e.x - w / 2, e.y + dy, w, 5);
    ctx.fillStyle = e.buff > 0 ? '#9fd8ff' : '#ff5c5c'; ctx.fillRect(e.x - w / 2, e.y + dy, w * clamp(e.hp / e.maxHp, 0, 1), 5);
  }

  drawEnemy(run, e) {
    const { ctx } = this, pal = run.mass.pal;
    const col = e.flash > 0 ? '#ffffff' : pal.enemy, c2 = pal.enemy2;
    ctx.save(); ctx.translate(e.x, e.y);
    if (e.stun > 0) ctx.globalAlpha = 0.6 + 0.4 * Math.sin(run.t * 30);
    switch (e.type) {
      case 'drone': {
        const a = Math.atan2(run.p.y - e.y, run.p.x - e.x);
        ctx.rotate(a);
        ctx.fillStyle = '#0d0d12'; ctx.strokeStyle = col; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(-14, -16); ctx.lineTo(-7, 0); ctx.lineTo(-14, 16); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(6, 0, 4, 0, TAU); ctx.fill();
        ctx.strokeStyle = c2; ctx.globalAlpha *= 0.5; ctx.beginPath(); ctx.arc(-4, 0, 20, run.t * 8, run.t * 8 + 2); ctx.stroke();
        break;
      }
      case 'sentry': case 'lancer': case 'stasis': {
        const side = e.side;
        // wall mount
        ctx.fillStyle = '#16161c'; ctx.strokeStyle = col; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.rect(side > 0 ? 0 : -30, -30, 30, 60); ctx.fill(); ctx.stroke();
        if (e.type === 'sentry') {
          ctx.save(); ctx.rotate(e.aim ?? (side > 0 ? Math.PI : 0));
          ctx.fillStyle = col; ctx.fillRect(4, -5, 34, 10);
          ctx.restore();
          ctx.fillStyle = '#0d0d12'; ctx.beginPath(); ctx.arc(0, 0, 20, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.fillStyle = e.burst > 0 ? '#fff' : c2; ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill();
        } else if (e.type === 'lancer') {
          ctx.save(); ctx.rotate(e.aimA ?? 0);
          ctx.fillStyle = '#0d0d12'; ctx.beginPath(); ctx.moveTo(-14, -18); ctx.lineTo(34, -6); ctx.lineTo(34, 6); ctx.lineTo(-14, 18); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = e.phase === 1 ? '#fff' : c2; ctx.beginPath(); ctx.arc(34, 0, e.phase === 1 ? 6 + 4 * Math.sin(run.t * 30) : 5, 0, TAU); ctx.fill();
          ctx.restore();
        } else {
          ctx.rotate(run.t * 2);
          ctx.strokeStyle = '#9fd0ff'; ctx.lineWidth = 3;
          for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(0, 0, 26, 10, i * TAU / 3, 0, TAU); ctx.stroke(); }
          ctx.fillStyle = '#e8f4ff'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill();
        }
        break;
      }
      case 'mine': {
        ctx.rotate(run.t * 0.8 + e.seed * 6);
        ctx.strokeStyle = col; ctx.lineWidth = 3;
        for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 12, Math.sin(a) * 12); ctx.lineTo(Math.cos(a) * 21, Math.sin(a) * 21); ctx.stroke(); }
        ctx.fillStyle = '#16161c'; ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.fill(); ctx.stroke();
        const on = Math.sin(run.t * 8 + e.seed * 10) > 0;
        ctx.fillStyle = on ? '#ff3030' : '#501010'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill();
        break;
      }
      case 'breacher': {
        const a = e.attached ? e.ang + Math.PI : Math.atan2(run.p.y - e.y, run.p.x - e.x);
        ctx.rotate(a);
        ctx.fillStyle = '#121016'; ctx.strokeStyle = col; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(-18, -12); ctx.lineTo(8, -12); ctx.lineTo(18, 0); ctx.lineTo(8, 12); ctx.lineTo(-18, 12); ctx.closePath(); ctx.fill(); ctx.stroke();
        // claws
        const k = e.attached ? 0.1 : 0.5 + 0.2 * Math.sin(run.t * 10);
        ctx.strokeStyle = c2; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(14, -8); ctx.lineTo(26, -8 - 10 * k); ctx.moveTo(14, 8); ctx.lineTo(26, 8 + 10 * k); ctx.stroke();
        ctx.fillStyle = c2; ctx.fillRect(-12, -3, 16, 6);
        if (e.attached) {
          ctx.fillStyle = '#ff3355'; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(run.t * 20);
          ctx.fillRect(-20, -18, 36 * (1 - e.bore / 3.2), 4);
          ctx.globalAlpha = 1;
          if (Math.random() < 0.3) this.part({ x: e.x + Math.cos(e.ang + Math.PI) * 14, y: e.y + Math.sin(e.ang + Math.PI) * 14, vx: rand(-150, 150), vy: rand(-150, 150), life: 0.2, max: 0.2, size: 3, col: '#ffd27a', kind: 'spark' });
        }
        break;
      }
      case 'warden': {
        ctx.globalAlpha = 0.12 + 0.05 * Math.sin(run.t * 3);
        ctx.fillStyle = '#9fd8ff'; ctx.beginPath(); ctx.arc(0, 0, 300, 0, TAU); ctx.fill();
        ctx.globalAlpha = e.stun > 0 ? 0.6 : 1;
        ctx.strokeStyle = '#9fd8ff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 300, run.t, run.t + 1); ctx.stroke();
        ctx.save(); ctx.rotate(run.t * 1.2);
        ctx.strokeStyle = c2; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, 40, 0, TAU * 0.3); ctx.moveTo(40 * Math.cos(TAU * 0.5), 40 * Math.sin(TAU * 0.5)); ctx.arc(0, 0, 40, TAU * 0.5, TAU * 0.8); ctx.stroke();
        ctx.restore();
        ctx.fillStyle = '#101018'; ctx.strokeStyle = col; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(20, 0); ctx.lineTo(0, 30); ctx.lineTo(-20, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#9fd8ff'; ctx.beginPath(); ctx.arc(0, 0, 7 + 2 * Math.sin(run.t * 5), 0, TAU); ctx.fill();
        break;
      }
      case 'carrier': {
        ctx.rotate(Math.sin(run.t * 0.5) * 0.08);
        ctx.fillStyle = '#101016'; ctx.strokeStyle = col; ctx.lineWidth = 4;
        this.hex(0, 0, 58); ctx.fill(); ctx.stroke();
        ctx.lineWidth = 2; this.hex(0, 0, 38); ctx.stroke();
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * TAU + Math.PI / 6;
          ctx.fillStyle = (Math.floor(run.t * 4) + i) % 6 === 0 ? '#fff' : c2;
          ctx.fillRect(Math.cos(a) * 46 - 3, Math.sin(a) * 46 - 3, 6, 6);
        }
        ctx.fillStyle = c2; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(run.t * 3); ctx.fillRect(-14, 30, 28, 10); ctx.globalAlpha = 1;
        break;
      }
      case 'heart': this.drawHeart(run, e); break;
    }
    ctx.restore();
    if (e.buff > 0 && e.type !== 'warden') {
      ctx.strokeStyle = 'rgba(159,216,255,0.7)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 8, 0, TAU); ctx.stroke();
    }
    // lancer telegraph / beam
    if (e.type === 'lancer' && e.phase > 0) {
      const ux = Math.cos(e.aimA), uy = Math.sin(e.aimA), L = 1800;
      if (e.phase === 1) {
        const k = 1 - e.phaseT / 1.25;
        ctx.strokeStyle = `rgba(255,60,80,${0.25 + 0.5 * k})`; ctx.lineWidth = 2 + 4 * k;
        ctx.setLineDash([18, 12]); ctx.lineDashOffset = -run.t * 200;
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + ux * L, e.y + uy * L); ctx.stroke(); ctx.setLineDash([]);
      } else {
        for (const [w, c] of [[40, 'rgba(255,60,90,0.25)'], [18, 'rgba(255,120,140,0.7)'], [6, '#fff']]) {
          ctx.strokeStyle = c; ctx.lineWidth = w;
          ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + ux * L, e.y + uy * L); ctx.stroke();
        }
      }
    }
    if (e.type !== 'heart') this.hpBar(e, Math.max(30, e.r * 1.6), -e.r - 14);
  }

  drawHeart(run, e) {
    const { ctx } = this, pal = run.mass.pal;
    const pulse = 1 + 0.04 * Math.sin(run.t * 4);
    const g = ctx.createRadialGradient(0, 0, 10, 0, 0, e.r * 1.6);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, pal.core); g.addColorStop(0.7, pal.fog + '0.5)'); g.addColorStop(1, pal.fog + '0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, e.r * 1.6 * pulse, 0, TAU); ctx.fill();
    ctx.strokeStyle = e.flash > 0 ? '#fff' : pal.edge; ctx.lineWidth = 6;
    for (let i = 0; i < 3; i++) {
      ctx.save(); ctx.rotate(run.t * (0.3 + i * 0.2) * (i % 2 ? -1 : 1));
      ctx.beginPath(); ctx.ellipse(0, 0, e.r * (1.1 + i * 0.18), e.r * (0.35 + i * 0.1), 0, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = '#0a0a0a'; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(0, 0, e.r * 0.5, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = pal.core; ctx.beginPath(); ctx.arc(0, 0, e.r * 0.28 * pulse, 0, TAU); ctx.fill();
    // hp ring
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(0, 0, e.r * 0.62, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#ff4d6a'; ctx.beginPath(); ctx.arc(0, 0, e.r * 0.62, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(e.hp / e.maxHp, 0, 1)); ctx.stroke();
  }

  drawBarrier(run, e) {
    const { ctx } = this, pal = run.mass.pal;
    const c = run.center(e.y), h = run.half(e.y) + 10, y = e.y;
    const k = clamp(e.hp / e.maxHp, 0, 1);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(c - h, y - 14, h * 2, 40);
    const g = ctx.createLinearGradient(0, y - 14, 0, y + 26);
    g.addColorStop(0, e.flash > 0 ? '#fff' : pal.edge); g.addColorStop(0.3, pal.rock0); g.addColorStop(1, pal.rock1);
    ctx.fillStyle = g; ctx.fillRect(c - h, y - 14, h * 2, 40);
    ctx.strokeStyle = pal.edge2; ctx.globalAlpha = 0.5; ctx.lineWidth = 2;
    for (let x = c - h; x < c + h; x += 40) { ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x + 20, y + 26); ctx.lineTo(x + 40, y - 14); ctx.stroke(); }
    ctx.globalAlpha = 1;
    // cracks as it weakens
    ctx.strokeStyle = pal.vein; ctx.lineWidth = 3;
    const cracks = Math.floor((1 - k) * 10);
    for (let i = 0; i < cracks; i++) {
      const x = c + (hash(e.seed * 100 + i) - 0.5) * h * 1.8;
      ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x + (hash(i + 3) - 0.5) * 30, y + 6); ctx.lineTo(x + (hash(i + 7) - 0.5) * 40, y + 26); ctx.stroke();
    }
    // energy skin
    ctx.strokeStyle = pal.edge; ctx.globalAlpha = 0.5 + 0.3 * Math.sin(run.t * 6); ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(c - h, y - 14); ctx.lineTo(c + h, y - 14); ctx.stroke();
    ctx.globalAlpha = 1;
    if (k < 1) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(c - 80, y + 34, 160, 8);
      ctx.fillStyle = '#ff5c5c'; ctx.fillRect(c - 80, y + 34, 160 * k, 8);
    }
    ctx.restore();
  }

  // ------------------------------------------------------------ projectiles
  drawShots(run) {
    const { ctx } = this;
    ctx.lineCap = 'round';
    for (const s of run.shots) {
      const k = 0.022;
      ctx.strokeStyle = s.k === 'wing' ? '#9fffcf' : '#fff2b0'; ctx.lineWidth = s.k === 'wing' ? 3 : 4;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * k, s.y - (s.vy - run.p.vy) * k); ctx.stroke();
    }
    for (const m of run.missiles) {
      ctx.strokeStyle = 'rgba(255,200,150,0.5)'; ctx.lineWidth = 4;
      ctx.beginPath();
      for (let i = 0; i < m.trail.length; i += 2) ctx[i ? 'lineTo' : 'moveTo'](m.trail[i], m.trail[i + 1]);
      ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(m.x, m.y, 5, 0, TAU); ctx.fill();
    }
    ctx.lineCap = 'butt';
  }

  drawBeams(run) {
    const { ctx } = this;
    for (const b of run.beams) {
      const k = b.t / 0.35;
      const ex = b.x + Math.cos(b.a) * b.len, ey = b.y + Math.sin(b.a) * b.len;
      for (const [w, c] of [[60 * k, 'rgba(160,120,255,0.25)'], [26 * k, 'rgba(190,160,255,0.7)'], [8 * k, '#fff']]) {
        ctx.strokeStyle = c; ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(ex, ey); ctx.stroke();
      }
    }
  }

  drawBullets(run) {
    const { ctx } = this, pal = run.mass.pal;
    for (const b of run.bullets) {
      ctx.fillStyle = pal.enemy2; ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.arc(b.x, b.y, 11, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, TAU); ctx.fill();
    }
  }

  drawWing(run) {
    const { ctx } = this;
    for (const w of run.wing) {
      ctx.save(); ctx.translate(w.x, w.y); ctx.rotate(w.aim || 0);
      ctx.fillStyle = '#12202a'; ctx.strokeStyle = '#7dffcf'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -10); ctx.lineTo(-4, 0); ctx.lineTo(-8, 10); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = 'rgba(125,255,207,0.3)'; ctx.beginPath(); ctx.arc(w.x, w.y, 4, 0, TAU); ctx.fill();
    }
  }

  // ------------------------------------------------------------ the Spelunker
  vesselOpts(run) {
    const p = run.p;
    return {
      t: run.t, spin: p.spin, vx: p.vx, vy: p.vy, ramming: p.ramming, hullK: p.hull / run.st.hullMax,
      shieldK: run.st.shieldMax ? p.shield / run.st.shieldMax : 0, shieldT: p.shieldT, hit: p.hitT,
      turrets: run.turrets, rooms: run.rooms, boarders: run.boarders, bots: run.bots,
      crew: run.crewList || ['gunner'], od: run.odT > 0, heat: p.heat / run.st.heatMax,
      accent: run.mass.pal.accent, pods: run.enemies.filter(e => e.attached), shieldOn: run.st.shieldMax > 0,
    };
  }

  drawVessel(ctx, x, y, R, o) {
    const t = o.t;
    ctx.save(); ctx.translate(x, y);
    const tilt = clamp(o.vx / 1600, -0.18, 0.18);
    ctx.rotate(tilt);

    // ansible uplink: a thin thread of light back home
    const ag = ctx.createLinearGradient(0, -R, 0, -R - 700);
    ag.addColorStop(0, 'rgba(120,230,255,0.45)'); ag.addColorStop(1, 'rgba(120,230,255,0)');
    ctx.strokeStyle = ag; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -R - 26); ctx.lineTo(0, -R - 700); ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const k = ((t * 0.9 + i / 3) % 1);
      ctx.fillStyle = `rgba(170,240,255,${0.8 * (1 - k)})`;
      ctx.fillRect(-2, -R - 30 - k * 600, 4, 10);
    }

    // exhaust / overdrive flame (above: we fall, so the burn points up)
    const fl = o.od ? 1.8 : 0.4 + clamp(o.vy / 700, 0, 1) * 0.6;
    for (const sx of [-0.55, 0.55]) {
      const g = ctx.createLinearGradient(0, -R * 0.6, 0, -R * 0.6 - 90 * fl);
      g.addColorStop(0, o.od ? 'rgba(255,240,200,0.95)' : 'rgba(140,220,255,0.8)'); g.addColorStop(1, 'rgba(80,140,255,0)');
      ctx.fillStyle = g;
      const fw = 12 + (o.od ? 8 : 0);
      ctx.beginPath(); ctx.moveTo(sx * R - fw, -R * 0.62); ctx.lineTo(sx * R + fw, -R * 0.62);
      ctx.lineTo(sx * R + (Math.random() - 0.5) * 6, -R * 0.62 - 90 * fl * (0.85 + Math.random() * 0.3)); ctx.closePath(); ctx.fill();
    }

    // lateral thrusters
    const th = clamp(o.vx / 400, -1, 1);
    if (Math.abs(th) > 0.1) {
      const sd = th > 0 ? -1 : 1;
      ctx.fillStyle = `rgba(140,220,255,${0.3 + 0.5 * Math.abs(th)})`;
      ctx.beginPath(); ctx.moveTo(sd * R * 1.02, -8); ctx.lineTo(sd * R * 1.02, 8); ctx.lineTo(sd * (R * 1.02 + 40 * Math.abs(th) + Math.random() * 8), 0); ctx.closePath(); ctx.fill();
    }

    // drill
    ctx.save();
    ctx.beginPath(); ctx.moveTo(-R * 0.62, R * 0.5); ctx.lineTo(R * 0.62, R * 0.5); ctx.lineTo(0, R * 1.62); ctx.closePath();
    const dg = ctx.createLinearGradient(-R * 0.6, 0, R * 0.6, 0);
    dg.addColorStop(0, '#2a2f38'); dg.addColorStop(0.45, '#9aa6b8'); dg.addColorStop(0.55, '#c9d3e0'); dg.addColorStop(1, '#2a2f38');
    ctx.fillStyle = dg; ctx.fill();
    ctx.clip();
    ctx.strokeStyle = 'rgba(10,12,16,0.7)'; ctx.lineWidth = 5;
    const off = (o.spin * 60) % 22;
    for (let yy = R * 0.4 + off; yy < R * 1.7; yy += 22) {
      ctx.beginPath(); ctx.moveTo(-R, yy - 16); ctx.lineTo(R, yy + 16); ctx.stroke();
    }
    ctx.restore();
    if (o.ramming || o.od) {
      const rg = ctx.createRadialGradient(0, R * 1.5, 0, 0, R * 1.5, 50);
      rg.addColorStop(0, 'rgba(255,230,160,0.95)'); rg.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(0, R * 1.5, 50, 0, TAU); ctx.fill();
    }

    // side nacelles
    for (const sd of [-1, 1]) {
      ctx.fillStyle = '#222a36'; ctx.strokeStyle = '#5b6b82'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(sd * R * 0.88 - 11, -R * 0.35, 22, R * 0.7, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = o.accent; ctx.globalAlpha = 0.8; ctx.fillRect(sd * R * 0.88 - 3, -R * 0.2, 6, R * 0.4); ctx.globalAlpha = 1;
    }

    // hull disc
    const hg = ctx.createRadialGradient(-R * 0.3, -R * 0.4, R * 0.1, 0, 0, R);
    hg.addColorStop(0, '#6d7b90'); hg.addColorStop(0.55, '#2f3a4a'); hg.addColorStop(1, '#141a23');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(0, 0, R * 0.92, 0, TAU); ctx.fill();
    // armour plate ring
    ctx.lineWidth = R * 0.16;
    for (let i = 0; i < 12; i++) {
      const a0 = i / 12 * TAU + 0.04, a1 = (i + 1) / 12 * TAU - 0.04;
      ctx.strokeStyle = i % 2 ? '#3a4658' : '#445166';
      ctx.beginPath(); ctx.arc(0, 0, R * 0.84, a0, a1); ctx.stroke();
    }
    ctx.strokeStyle = '#8796ab'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.93, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.arc(0, 0, R * 0.74, 0, TAU); ctx.stroke();

    // interior window
    this.drawInterior(ctx, R * 0.72, o);

    // damage cracks
    if (o.hullK < 0.55) {
      ctx.strokeStyle = 'rgba(255,120,60,0.7)'; ctx.lineWidth = 2;
      const n = Math.floor((0.55 - o.hullK) * 14);
      for (let i = 0; i < n; i++) {
        const a = hash(i * 3.3) * TAU;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * 0.92, Math.sin(a) * R * 0.92);
        ctx.lineTo(Math.cos(a + 0.1) * R * 0.78, Math.sin(a + 0.1) * R * 0.78);
        ctx.lineTo(Math.cos(a - 0.05) * R * 0.7, Math.sin(a - 0.05) * R * 0.7); ctx.stroke();
      }
    }

    // mast
    ctx.fillStyle = '#5b6b82'; ctx.fillRect(-3, -R - 24, 6, 26);
    ctx.fillStyle = Math.sin(t * 5) > 0 ? '#aef7ff' : '#2a5560'; ctx.beginPath(); ctx.arc(0, -R - 26, 5, 0, TAU); ctx.fill();

    ctx.restore();

    // turrets (drawn unrotated so aim is true)
    for (const tr of o.turrets) {
      const tx = tr.x !== undefined ? tr.x - x : Math.cos(tr.a) * R * 0.95, ty = tr.y !== undefined ? tr.y - y : Math.sin(tr.a) * R * 0.95;
      ctx.save(); ctx.translate(x + tx, y + ty); ctx.rotate(tr.aim);
      ctx.fillStyle = '#c9d3e0'; ctx.fillRect(4 - (tr.recoil || 0) * 5, -4, 22, 8);
      ctx.fillStyle = '#1b222d'; ctx.strokeStyle = '#8796ab'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff7a59'; ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, TAU); ctx.fill();
      if ((tr.recoil || 0) > 0.6) { ctx.fillStyle = '#fff6c0'; ctx.beginPath(); ctx.arc(30, 0, 7, 0, TAU); ctx.fill(); }
      ctx.restore();
    }

    // shield bubble
    if (o.shieldOn && o.shieldK > 0.01) {
      const sr = R + 18 + (o.shieldT > 1.05 ? 3 : 0);
      const a = 0.18 + 0.4 * o.shieldK + (o.shieldT > 1 ? 0.35 : 0);
      ctx.save(); ctx.translate(x, y);
      const sg = ctx.createRadialGradient(0, 0, R * 0.8, 0, 0, sr);
      sg.addColorStop(0, 'rgba(110,220,255,0)'); sg.addColorStop(1, `rgba(110,220,255,${a * 0.35})`);
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(0, 0, sr, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(160,235,255,${a})`; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, sr, 0, TAU); ctx.stroke();
      ctx.setLineDash([8, 10]); ctx.lineDashOffset = t * 30; ctx.globalAlpha = a;
      ctx.beginPath(); ctx.arc(0, 0, sr - 6, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.restore();
    }

    if (o.hit > 0) {
      ctx.fillStyle = `rgba(255,255,255,${o.hit * 2})`; ctx.beginPath(); ctx.arc(x, y, R * 0.92, 0, TAU); ctx.fill();
    }
  }

  drawInterior(ctx, r, o) {
    // dark glass
    const g = ctx.createRadialGradient(0, -r * 0.3, r * 0.1, 0, 0, r);
    g.addColorStop(0, '#15263a'); g.addColorStop(1, '#070c14');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    const boarded = o.boarders.length > 0;
    ctx.strokeStyle = boarded ? `rgba(255,70,70,${0.5 + 0.4 * Math.sin(o.t * 10)})` : 'rgba(111,210,255,0.55)';
    ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
    const k = r / 0.72 * 1.0; // rooms are placed in hull-radius units
    // corridors
    ctx.strokeStyle = 'rgba(111,210,255,0.25)'; ctx.lineWidth = r * 0.07;
    ctx.beginPath(); ctx.moveTo(0, -0.4 * k); ctx.lineTo(0, 0.4 * k); ctx.moveTo(-0.4 * k, 0); ctx.lineTo(0.4 * k, 0); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 0.4 * k, 0, TAU); ctx.stroke();
    const labels = { guns: 'G', shield: 'S', drive: 'D', bridge: 'B', reactor: 'R' };
    for (const rm of o.rooms) {
      const rx = rm.x * k, ry = rm.y * k, rs = r * (rm.id === 'reactor' ? 0.2 : 0.16);
      const bad = rm.sab > 0;
      ctx.fillStyle = bad ? `rgba(255,50,60,${0.45 + 0.3 * Math.sin(o.t * 12)})` : rm.id === 'reactor' ? `rgba(255,190,90,${0.35 + 0.15 * Math.sin(o.t * 3)})` : 'rgba(40,90,130,0.7)';
      ctx.beginPath(); ctx.roundRect(rx - rs, ry - rs, rs * 2, rs * 2, rs * 0.4); ctx.fill();
      ctx.strokeStyle = bad ? '#ff6a6a' : 'rgba(140,220,255,0.6)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = 'rgba(220,240,255,0.55)';
      ctx.font = `700 ${rs * 1.1}px "Chakra Petch", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(labels[rm.id], rx, ry + 1);
    }
    ctx.textBaseline = 'alphabetic';
    // crew lights at their stations
    const station = { gunner: 'guns', pilot: 'bridge', shieldt: 'shield', repair: 'drive', security: 'reactor' };
    for (const id of o.crew) {
      const rm = o.rooms.find(q => q.id === station[id]); if (!rm) continue;
      const a = o.t * 1.5 + id.length;
      ctx.fillStyle = CREW[id].color;
      ctx.beginPath(); ctx.arc(rm.x * k + Math.cos(a) * r * 0.1, rm.y * k + Math.sin(a) * r * 0.1 + (id === 'security' ? r * 0.12 : 0), r * 0.045, 0, TAU); ctx.fill();
    }
    for (const bt of o.bots) {
      if (bt.hp <= 0) continue;
      ctx.fillStyle = bt.hit > 0 ? '#fff' : '#6cff9a';
      const s = r * 0.06; ctx.fillRect(bt.x * k - s, bt.y * k - s, s * 2, s * 2);
    }
    for (const b of o.boarders) {
      ctx.fillStyle = b.hit > 0 ? '#fff' : '#ff3b4f';
      const s = r * 0.08, bx = b.x * k, by = b.y * k;
      ctx.beginPath(); ctx.moveTo(bx, by - s); ctx.lineTo(bx + s, by + s); ctx.lineTo(bx - s, by + s); ctx.closePath(); ctx.fill();
    }
    // glass highlight
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath(); ctx.ellipse(-r * 0.3, -r * 0.45, r * 0.45, r * 0.2, -0.5, 0, TAU); ctx.fill();
  }

  // ------------------------------------------------------------ ambience & particles
  ambient(run, dt, camX, camY) {
    const pal = run.mass.pal, p = run.p;
    // rising embers sell the fall
    const n = (this.rm ? 0.3 : 1) * (6 + p.vy / 60) * dt;
    for (let i = 0; i < n + (Math.random() < n % 1 ? 1 : 0); i++) {
      const y = camY + this.vh + 20;
      const c = run.center(y), h = run.half(y);
      this.part({ x: c + rand(-h, h), y, vx: rand(-20, 20), vy: rand(-80, -20), life: 4, max: 4, size: rand(1.5, 3.5), col: pal.ember, kind: 'ember' });
    }
    // speed streaks near the walls
    if (!this.rm && p.vy > 250 && Math.random() < dt * p.vy / 60) {
      const y = camY + this.vh * Math.random();
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = run.center(y) + side * (run.half(y) - rand(10, 120));
      this.part({ x, y, vx: 0, vy: -p.vy * 0.3, life: 0.35, max: 0.35, size: 2, col: pal.edge2, kind: 'streak', len: p.vy * 0.25 });
    }
    // smoke from a damaged hull
    if (p.hull / run.st.hullMax < 0.3 && !run.dead && Math.random() < dt * 20) {
      this.part({ x: p.x + rand(-40, 40), y: p.y + rand(-40, 20), vx: rand(-30, 30), vy: -p.vy * 0.2 - 60, life: 1.2, max: 1.2, size: rand(10, 22), col: 'rgba(40,40,48,', kind: 'smoke' });
    }
  }

  drawParts(dt) {
    const { ctx } = this;
    for (const q of this.parts) {
      q.life -= dt;
      q.x += (q.vx || 0) * dt; q.y += (q.vy || 0) * dt;
      const k = clamp(q.life / q.max, 0, 1);
      switch (q.kind) {
        case 'spark': case 'ember':
          ctx.globalAlpha = k; ctx.fillStyle = q.col;
          ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
          break;
        case 'streak':
          ctx.globalAlpha = k * 0.5; ctx.strokeStyle = q.col; ctx.lineWidth = q.size;
          ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x, q.y + q.len); ctx.stroke();
          break;
        case 'smoke':
          ctx.globalAlpha = 1; ctx.fillStyle = q.col + (0.5 * k) + ')';
          ctx.beginPath(); ctx.arc(q.x, q.y, q.size * (1.8 - k), 0, TAU); ctx.fill();
          break;
        case 'ring':
          ctx.globalAlpha = k; ctx.strokeStyle = q.col; ctx.lineWidth = (q.w || 4) * k + 1;
          ctx.beginPath(); ctx.arc(q.x, q.y, q.size / 2 * (1 - k * k), 0, TAU); ctx.stroke();
          break;
        case 'flash':
          ctx.globalAlpha = k; ctx.fillStyle = q.col;
          ctx.beginPath(); ctx.arc(q.x, q.y, q.size / 2, 0, TAU); ctx.fill();
          break;
        case 'debris':
          q.vy += 500 * dt; q.rot += q.vr * dt;
          ctx.globalAlpha = k; ctx.fillStyle = q.col;
          ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.fillRect(-q.size / 2, -q.size / 3, q.size, q.size * 0.66); ctx.restore();
          break;
      }
    }
    ctx.globalAlpha = 1;
    this.parts = this.parts.filter(q => q.life > 0);
  }
}
