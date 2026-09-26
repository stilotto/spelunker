// One descent. Pure simulation: no DOM, no canvas. render.js draws it,
// and it pushes events (explosions, toasts, sounds) into `this.events`.
import { M, MASSES, ENEMIES } from './data.js';

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[(Math.random() * arr.length) | 0];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;

// Interior compartments, in hull-radius units. The render draws the same map.
export const ROOMS = [
  { id: 'guns',    name: 'Gun deck',  x: 0,     y: -0.4 },
  { id: 'shield',  name: 'Shields',   x: 0.4,   y: 0 },
  { id: 'drive',   name: 'Drive',     x: 0,     y: 0.4 },
  { id: 'bridge',  name: 'Bridge',    x: -0.4,  y: 0 },
  { id: 'reactor', name: 'Reactor',   x: 0,     y: 0 },
];

export class Run {
  constructor(stats, massIdx, known) {
    this.st = stats;
    this.massIdx = massIdx;
    this.mass = MASSES[massIdx];
    this.known = Object.assign({}, known);   // enemy types already seen
    this.coreY = this.mass.core * M;
    this.t = 0;
    this.events = [];
    this.R = 80;
    const startY = Math.round(stats.startFrac * this.coreY);
    this.p = {
      x: this.center(startY), y: startY, vx: 0, vy: 0,
      hull: stats.hullMax, shield: stats.shieldMax, heat: 0,
      ramming: false, overheat: false, hitT: 0, shieldT: 0, spin: 0,
    };
    this.enemies = []; this.shots = []; this.bullets = []; this.missiles = [];
    this.beams = []; this.pickups = []; this.fields = [];
    this.boarders = []; this.bots = []; this.wing = [];
    this.rooms = ROOMS.map(r => ({ ...r, sab: 0 }));
    for (let i = 0; i < stats.bots; i++) this.bots.push(this.newBot(i));
    for (let i = 0; i < stats.wingmen; i++) this.wing.push({ a: (i / stats.wingmen) * TAU, cd: rand(0, 0.5), x: 0, y: 0, aim: 0 });
    this.turrets = [];
    for (let i = 0; i < stats.turrets; i++) this.turrets.push({ a: 0, aim: Math.PI / 2, cd: rand(0, 0.3), recoil: 0 });
    this.missileCd = 2; this.lanceCd = 2;
    this.empCd = 0; this.odCd = 0; this.odT = 0;
    this.nextSlot = startY + 900;
    this.nextBarrierM = Math.max(this.introDepth('barrier'), startY / M + 120) + rand(0, 60);
    this.maxDepthM = startY / M;
    this.startM = startY / M;
    this.salvage = 0; this.kills = 0; this.boarded = 0; this.repelled = 0;
    this.absorbed = 0; this.repaired = 0; this.gunnerXp = 0;
    this.newContacts = [];
    // everything the Stats tab tracks for this run
    this.tally = {
      enc: {}, kill: {}, dmg: {}, shieldAbs: 0, armorBlocked: 0, hullTaken: 0,
      shots: 0, missiles: 0, lances: 0, emps: 0, ods: 0, scrapes: 0, pods: 0, botsLost: 0,
      caches: 0, coolant: 0, kits: 0, stasisTime: 0, overheatTime: 0,
    };
    this.killer = null;
    this.over = false; this.overT = 0; this.victory = false; this.dead = false;
    this.heart = null;
    this.stasisOn = false;
  }

  // ------------------------------------------------------------ geometry
  center(y) {
    const s = this.mass.style;
    const a = s === 'tet' ? 90 : 130;
    let c = a * Math.sin(y / 1500) + 55 * Math.sin(y / 640 + 2);
    if (s === 'tet') c = Math.round(c / 40) * 40; // stepped, machined walls
    return c * this.chamberFade(y);
  }
  half(y) {
    let h = 360 + 55 * Math.sin(y / 900) + 28 * Math.sin(y / 330 + 1.3);
    if (this.mass.style === 'hive') h += 25 * Math.sin(y / 120);
    const c = this.coreY - 2600;
    if (y > c) h += Math.min(1, (y - c) / 1800) ** 2 * 440;
    return h;
  }
  chamberFade(y) { return clamp((this.coreY - 1400 - y) / 1200, 0, 1); }
  frac() { return clamp(this.p.y / this.coreY, 0, 1); }
  depthM() { return this.p.y / M; }
  introDepth(type) { return ENEMIES[type].depth * (this.massIdx === 0 ? 1 : 0.2); }
  hpPow(y) { return this.mass.mult * (1 + 3.5 * clamp(y / this.coreY, 0, 1)); }
  dmgPow(y) { return Math.pow(this.mass.mult, 0.8) * (1 + 1.6 * clamp(y / this.coreY, 0, 1)); }
  lootPow(y) { return this.mass.mult * (1 + 1.2 * clamp(y / this.coreY, 0, 1)); }

  emit(e) { this.events.push(e); }

  // ------------------------------------------------------------ spawning
  spawn(type, x, y, extra) {
    const def = ENEMIES[type];
    const hp = def.hp * this.hpPow(y);
    const e = Object.assign({
      type, x, y, hp, maxHp: hp, r: 22, t: rand(0, 1), cd: rand(0.5, 2), vx: 0, vy: 0,
      active: false, carry: false, stun: 0, buff: 0, flash: 0, side: Math.random() < 0.5 ? -1 : 1,
      seed: Math.random(),
    }, extra || {});
    this.enemies.push(e);
    return e;
  }

  wallX(y, side, inset) { return this.center(y) + side * (this.half(y) - inset); }

  spawnSlot(y) {
    const d = y / M;
    const avail = t => d >= this.introDepth(t);
    const deep = clamp(d / this.mass.core, 0, 1);
    const pool = [];
    const add = (w, f) => pool.push([w, f]);
    add(3, () => { // drone pack
      const n = 1 + ((Math.random() * (1 + deep * 3 + this.massIdx * 0.5)) | 0);
      for (let i = 0; i < n; i++) this.spawn('drone', this.center(y) + rand(-200, 200), y + rand(-60, 60), { r: 20 });
    });
    if (avail('sentry')) add(2, () => {
      const both = Math.random() < 0.3 + deep * 0.4;
      const side = Math.random() < 0.5 ? -1 : 1;
      this.spawn('sentry', this.wallX(y, side, 26), y, { r: 26, side, wall: true });
      if (both) this.spawn('sentry', this.wallX(y + 80, -side, 26), y + 80, { r: 26, side: -side, wall: true });
    });
    if (avail('mine')) add(1.4, () => {
      const n = 3 + ((Math.random() * (3 + deep * 5)) | 0);
      for (let i = 0; i < n; i++) {
        const yy = y + rand(-160, 160);
        this.spawn('mine', this.center(yy) + rand(-0.8, 0.8) * this.half(yy), yy, { r: 16 });
      }
    });
    if (avail('stasis')) add(0.8, () => {
      const side = Math.random() < 0.5 ? -1 : 1;
      const gen = this.spawn('stasis', this.wallX(y, side, 30), y, { r: 30, side, wall: true });
      this.fields.push({ y, h: 520, gen });
    });
    if (avail('breacher')) add(1.1 + deep, () => {
      // pods wait in wall hatches and launch when you drift past
      const n = 2 + ((Math.random() * (1.5 + deep * 3)) | 0);
      for (let i = 0; i < n; i++) {
        const side = i % 2 ? 1 : -1, yy = y + i * 50;
        this.spawn('breacher', this.wallX(yy, side, 22), yy, { r: 18, side, hatch: true });
      }
    });
    if (avail('warden')) add(0.7, () => {
      this.spawn('warden', this.center(y), y, { r: 30 });
      for (let i = 0; i < 2; i++) this.spawn('drone', this.center(y) + rand(-150, 150), y + rand(40, 120), { r: 20 });
    });
    if (avail('lancer')) add(0.9, () => {
      const side = Math.random() < 0.5 ? -1 : 1;
      this.spawn('lancer', this.wallX(y, side, 28), y, { r: 26, side, wall: true, phase: 0 });
    });
    if (avail('carrier')) add(0.45, () => {
      this.spawn('carrier', this.center(y), y + 60, { r: 54, kids: 0 });
    });
    // pickups ride along in some slots
    let tot = 0; for (const [w] of pool) tot += w;
    let r = Math.random() * tot;
    for (const [w, f] of pool) { r -= w; if (r <= 0) { f(); break; } }
    if (Math.random() < 0.45) this.spawnCache(y + rand(-120, 120));
    if (Math.random() < 0.08 + deep * 0.08) this.pickups.push({ k: 'coolant', x: this.center(y) + rand(-200, 200), y: y + rand(-100, 100), v: 1, t: 0 });
    if (Math.random() < 0.05) this.pickups.push({ k: 'repair', x: this.center(y) + rand(-200, 200), y: y + rand(-100, 100), v: 1, t: 0 });
  }

  spawnCache(y) {
    const n = 3 + ((Math.random() * 5) | 0);
    const cx = this.center(y) + rand(-0.7, 0.7) * this.half(y);
    for (let i = 0; i < n; i++) {
      this.pickups.push({ k: 'salvage', x: cx + rand(-40, 40), y: y + rand(-40, 40), v: Math.max(1, Math.round(1.5 * this.lootPow(y))), t: rand(0, 6) });
    }
  }

  spawnBarrier(y) {
    const hp = ENEMIES.barrier.hp * this.hpPow(y);
    this.tally.enc.barrier = (this.tally.enc.barrier || 0) + 1;
    this.enemies.push({ type: 'barrier', x: this.center(y), y, hp, maxHp: hp, r: 0, t: 0, flash: 0, stun: 0, buff: 0, barrier: true, seed: Math.random(), active: true });
  }

  spawnHeart() {
    const y = this.coreY + 150;
    const def = ENEMIES.heart;
    const hp = 1200 * this.hpPow(this.coreY) * (1 + this.massIdx * 0.25);
    this.heart = { type: 'heart', x: this.center(y), y, hp, maxHp: hp, r: 190, t: 0, cd: 2, spawnCd: 4, flash: 0, stun: 0, buff: 0, active: true, seed: 0 };
    this.enemies.push(this.heart);
    this.tally.enc.heart = 1;
    this.contact('heart');
    void def;
  }

  contact(type) {
    if (this.known[type]) return;
    this.known[type] = true;
    this.newContacts.push(type);
    this.emit({ k: 'contact', type });
  }

  newBot(i) {
    return { x: 0.12 * Math.cos(i * 2.1), y: 0.12 * Math.sin(i * 2.1), hp: 1, respawn: 0, target: null, hit: 0 };
  }

  // ------------------------------------------------------------ main step
  step(dt, input) {
    this.t += dt;
    const p = this.p, st = this.st, R = this.R;
    if (this.over) return;
    if (this.dead || this.victory) {
      this.overT -= dt;
      this.updateBullets(dt); this.updateShots(dt);
      if (this.overT <= 0) this.over = true;
      return;
    }

    const sab = id => this.rooms.find(r => r.id === id).sab;
    const odOn = this.odT > 0;

    // --- abilities
    if (this.empCd > 0 && !sab('bridge')) this.empCd -= dt;
    if (this.odCd > 0 && !sab('bridge')) this.odCd -= dt;
    if (input.emp && st.emp && this.empCd <= 0) this.fireEmp();
    if (input.od && st.overdrive && this.odCd <= 0) { this.odT = st.odDur; this.odCd = 30; this.tally.ods++; this.emit({ k: 'od' }); }
    if (this.odT > 0) this.odT -= dt;

    // --- steering
    const steer = st.steer * (sab('drive') ? 0.5 : 1);
    let want;
    const cx = this.center(p.y + 350);
    if (input.targetX != null) want = clamp((input.targetX - p.x) * 5, -steer, steer);
    else if (input.axis) want = input.axis * steer;
    else want = clamp((cx - p.x) * st.assist * (sab('bridge') ? 0 : 1), -steer * 0.6, steer * 0.6);
    const acc = steer * 5;
    p.vx += clamp(want - p.vx, -acc * dt, acc * dt);

    // --- descent
    let target = st.speed * M;
    if (input.brake) target *= 0.4;
    if (input.dive) target *= 1.6;
    if (odOn) target *= 2.3;
    if (sab('drive')) target *= 0.75;
    this.stasisOn = false;
    for (const f of this.fields) {
      if (f.gen.hp > 0 && Math.abs(p.y - f.y) < f.h / 2) { target *= 0.3; this.stasisOn = true; }
    }
    if (this.p.y < this.startM * M + 400) target *= clamp((this.t + 0.25) / 1.2, 0.2, 1);
    const floorY = this.coreY - 330;
    p.vy += clamp(target - p.vy, -900 * dt, 500 * dt);

    // --- barriers block
    p.ramming = false;
    let nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
    for (const e of this.enemies) {
      if (!e.barrier || e.hp <= 0) continue;
      const top = e.y - 14;
      if (p.y + R <= top + 2 && ny + R > top) {
        ny = top - R; p.vy = Math.min(p.vy, 0); p.ramming = true;
      } else if (Math.abs(p.y + R - top) < 3) { p.ramming = true; ny = Math.min(ny, top - R); }
      if (p.ramming) {
        this.damageEnemy(e, st.ram * st.phase * (odOn ? 3 : 1) * dt, false);
        if (Math.random() < 0.6) this.emit({ k: 'spark', x: p.x + rand(-25, 25), y: top, c: 'drill' });
      }
    }
    if (ny > floorY) { ny = floorY; p.vy = 0; }
    p.x = nx; p.y = ny;

    // --- walls
    const c = this.center(p.y), h = this.half(p.y);
    const left = c - h + R, right = c + h - R;
    if (p.x < left || p.x > right) {
      const side = p.x < left ? -1 : 1;
      p.x = side < 0 ? left : right;
      if (Math.abs(p.vx) > 60) { this.tally.scrapes++; this.emit({ k: 'scrape', x: p.x + side * R, y: p.y }); }
      p.vx = -side * Math.max(120, Math.abs(p.vx) * 0.4);
      this.hurt(14 * st.impact * this.dmgPow(p.y) * (odOn ? 0.3 : 1), false, 'wall');
    }

    // --- depth / spawning
    this.maxDepthM = Math.max(this.maxDepthM, p.y / M);
    const ahead = p.y + 1500;
    while (this.nextSlot < ahead && this.nextSlot < this.coreY - 1700) {
      this.spawnSlot(this.nextSlot);
      const deep = clamp(this.nextSlot / this.coreY, 0, 1);
      this.nextSlot += rand(300, 560) * (1 - 0.4 * deep) * (this.massIdx ? 0.85 : 1);
    }
    while (this.nextBarrierM * M < ahead && this.nextBarrierM * M < this.coreY - 1800) {
      this.spawnBarrier(this.nextBarrierM * M);
      this.nextBarrierM += rand(260, 420) * (this.massIdx ? 0.8 : 1);
    }
    if (!this.heart && p.y > this.coreY - 1800) this.spawnHeart();

    // --- heat
    const f = this.frac();
    let gen = this.mass.heat * (2 + 34 * f) + (input.dive ? 5 : 0) + (odOn ? 8 : 0) + sab('reactor') * 3;
    p.heat += (gen - st.cooling) * dt;
    if (p.heat < 0) p.heat = 0;
    p.overheat = p.heat >= st.heatMax;
    if (p.overheat) this.tally.overheatTime += dt;
    if (this.stasisOn) this.tally.stasisTime += dt;
    if (p.overheat) {
      p.heat = st.heatMax;
      this.hurt((6 + 20 * f) * this.mass.heat * dt * (1 + this.massIdx * 0.3), true, 'heat');
    }

    // --- shields & repair
    if (st.shieldMax > 0) {
      if (p.shieldT > 0) p.shieldT -= dt;
      else if (!sab('shield')) p.shield = Math.min(st.shieldMax, p.shield + st.shieldRegen * dt);
    }
    if (st.regen > 0 && p.hull < st.hullMax) {
      const r = Math.min(st.hullMax - p.hull, st.regen * dt);
      p.hull += r; this.repaired += r;
    }
    if (p.hitT > 0) p.hitT -= dt;
    p.spin += dt * (0.4 + p.vy / 900);

    // --- weapons
    const gunMul = sab('guns') ? 0.35 : 1;
    this.updateTurrets(dt, gunMul);
    this.updateWingmen(dt);
    if (st.missiles) {
      this.missileCd -= dt * gunMul;
      if (this.missileCd <= 0) { this.fireMissiles(); this.missileCd = 3.4; }
    }
    if (st.lance) {
      this.lanceCd -= dt * gunMul;
      if (this.lanceCd <= 0) { if (this.fireLance()) this.lanceCd = st.lanceCd; else this.lanceCd = 0.3; }
    }

    this.updateEnemies(dt);
    this.updateShots(dt);
    this.updateMissiles(dt);
    this.updateBullets(dt);
    this.updatePickups(dt);
    this.updateInterior(dt);
    for (const b of this.beams) b.t -= dt;
    this.beams = this.beams.filter(b => b.t > 0);

    // cull things left far behind
    const cut = p.y - 1400;
    this.enemies = this.enemies.filter(e => e.hp > 0 && (e.y > cut || e.carry));
    this.fields = this.fields.filter(f => f.y + f.h > cut && f.gen.hp > 0);
    this.pickups = this.pickups.filter(k => !k.gone && k.y > cut);

    if (p.hull <= 0) {
      p.hull = 0; this.dead = true; this.overT = 2.4;
      this.emit({ k: 'death', x: p.x, y: p.y });
    }
  }

  // ------------------------------------------------------------ damage
  hurt(dmg, direct, src) {
    const p = this.p, st = this.st;
    if (dmg <= 0) return;
    const T = this.tally;
    if (!direct) {
      T.armorBlocked += dmg * st.armor;
      dmg *= (1 - st.armor);
      if (this.odT > 0) dmg *= 0.5;
      if (p.shield > 0) {
        const a = Math.min(p.shield, dmg);
        p.shield -= a; dmg -= a; this.absorbed += a; T.shieldAbs += a;
        p.shieldT = 1.2;
        if (src !== 'wall') this.emit({ k: 'shieldhit' });
      }
    }
    if (dmg > 0) {
      p.hull -= dmg;
      T.hullTaken += dmg; T.dmg[src] = (T.dmg[src] || 0) + dmg;
      if (p.hull <= 0 && !this.killer && !this.dead) this.killer = src;
      if (src !== 'heat' && src !== 'boarders') { p.hitT = 0.18; this.emit({ k: 'hullhit', d: dmg }); }
    }
  }

  damageEnemy(e, dmg, flash = true) {
    if (e.hp <= 0) return;
    if (e.buff > 0) dmg *= 0.4;
    if (e.type === 'breacher') dmg *= e.attached ? 0.35 : 0.5; // armoured nose, braced when latched
    e.hp -= dmg;
    if (flash) e.flash = 0.08;
    if (e.hp <= 0) this.killEnemy(e);
  }

  killEnemy(e) {
    e.hp = 0;
    const def = ENEMIES[e.type];
    this.kills++;
    this.tally.kill[e.type] = (this.tally.kill[e.type] || 0) + 1;
    this.gunnerXp += def.xp;
    const v = def.salvage * this.lootPow(e.y) * this.st.salvageMul;
    const n = Math.min(8, 1 + Math.floor(def.salvage / 4));
    for (let i = 0; i < n; i++) {
      this.pickups.push({ k: 'salvage', x: e.x + rand(-20, 20), y: e.y + rand(-20, 20), v: v / n, t: rand(0, 6), vx: rand(-120, 120), vy: rand(-160, 40) });
    }
    if (e.barrier) {
      this.emit({ k: 'barrierbreak', x: e.x, y: e.y, w: this.half(e.y) });
    } else {
      this.emit({ k: 'boom', x: e.x, y: e.y, r: e.r, type: e.type });
    }
    if (e.type === 'stasis') this.emit({ k: 'toast', text: 'STASIS FIELD COLLAPSED', tone: 'good' });
    if (e.type === 'heart') {
      this.victory = true; this.overT = 3.5;
      this.emit({ k: 'victory', x: e.x, y: e.y });
    }
    // Breacher pods stuck to the hull just die.
  }

  fireEmp() {
    const p = this.p, st = this.st;
    this.tally.emps++;
    this.empCd = st.empCd;
    const r2 = st.empRadius ** 2;
    this.bullets = this.bullets.filter(b => dist2(b.x, b.y, p.x, p.y) > r2);
    for (const e of this.enemies) {
      if (e.barrier || e.type === 'heart') continue;
      if (dist2(e.x, e.y, p.x, p.y) < r2) {
        e.stun = 3;
        if (e.attached) this.killEnemy(e);
        else this.damageEnemy(e, 20 * this.hpPow(e.y) * 0.3);
      }
    }
    this.emit({ k: 'emp', x: p.x, y: p.y, r: st.empRadius });
  }

  // ------------------------------------------------------------ player weapons
  pickTarget(x, y, range, preferAttached, arc) {
    let best = null, bs = Infinity;
    const r2 = range * range;
    for (const e of this.enemies) {
      if (e.hp <= 0 || e.hatch) continue; // sealed hatches are armoured
      if (e.attached && arc !== undefined) {
        // a turret can't shoot through its own hull
        const da = Math.abs(((e.ang - arc) % TAU + TAU * 1.5) % TAU - Math.PI);
        if (da > 1.5) continue;
      }
      let ex = e.x, ey = e.y;
      if (e.barrier) {
        ex = x; ey = e.y;
        if (ey < y) continue;
      }
      const d = dist2(x, y, ex, ey);
      if (d > r2) continue;
      let score = d;
      if (e.attached && preferAttached) score -= 1e7;
      if (e.type === 'breacher') score *= 0.5;
      if (e.type === 'warden') score *= 0.7;
      if (e.type === 'mine' && d > 250 * 250) score *= 2.5;
      if (ey < y - 200 && !e.attached) score *= 1.8; // prefer what's ahead
      if (e.barrier) score *= 1.4;
      if (score < bs) { bs = score; best = e; }
    }
    return best;
  }

  aimPoint(e, fromX) {
    if (e.barrier) return { x: fromX, y: e.y };
    return { x: e.x, y: e.y };
  }

  updateTurrets(dt, gunMul) {
    const p = this.p, st = this.st, R = this.R;
    const n = this.turrets.length;
    this.turrets.forEach((tr, i) => {
      tr.a = p.spin * 0.25 + (i / n) * TAU + Math.PI / 2 * (n === 1 ? -1 : 0) - Math.PI / 2;
      if (n === 1) tr.a = Math.PI / 2 + Math.sin(p.spin * 0.3) * 0.15; // single gun sits under the hull, near the drill
      const tx = p.x + Math.cos(tr.a) * R * 0.95, ty = p.y + Math.sin(tr.a) * R * 0.95;
      tr.x = tx; tr.y = ty;
      if (tr.recoil > 0) tr.recoil -= dt * 6;
      tr.cd -= dt * gunMul;
      const tgt = this.pickTarget(tx, ty, st.gunRange, true, tr.a);
      if (!tgt) return;
      const ap = this.aimPoint(tgt, tx);
      const lead = tgt.carry || tgt.attached ? 0 : 0.0;
      const ang = Math.atan2(ap.y - ty - p.vy * lead, ap.x - tx);
      tr.aim = ang;
      if (tr.cd <= 0) {
        tr.cd += 1 / st.fireRate;
        if (tr.cd < 0) tr.cd = 0;
        tr.recoil = 1;
        const sp = 1400, jitter = rand(-0.03, 0.03);
        this.shots.push({ x: tx, y: ty, vx: Math.cos(ang + jitter) * sp, vy: Math.sin(ang + jitter) * sp + p.vy, dmg: st.gunDmg, life: 0.55, k: 'gun' });
        this.tally.shots++;
        this.emit({ k: 'shoot' });
      }
    });
  }

  updateWingmen(dt) {
    const p = this.p, st = this.st, n = this.wing.length;
    this.wing.forEach((w, i) => {
      w.a += dt * 1.1;
      const rr = this.R + 58 + 12 * Math.sin(this.t * 2 + i);
      w.x = p.x + Math.cos(w.a + (i / n) * TAU) * rr;
      w.y = p.y + Math.sin(w.a + (i / n) * TAU) * rr * 0.85;
      w.cd -= dt;
      const tgt = this.pickTarget(w.x, w.y, 520, false);
      if (tgt && w.cd <= 0) {
        w.cd = 0.45;
        const ap = this.aimPoint(tgt, w.x);
        const a = Math.atan2(ap.y - w.y, ap.x - w.x);
        w.aim = a;
        this.shots.push({ x: w.x, y: w.y, vx: Math.cos(a) * 1200, vy: Math.sin(a) * 1200 + p.vy, dmg: st.wingDmg, life: 0.5, k: 'wing' });
      }
    });
  }

  fireMissiles() {
    const p = this.p, st = this.st;
    let any = false;
    for (let i = 0; i < st.missiles; i++) {
      // spread across the strongest targets in range
      const cands = this.enemies.filter(e => e.hp > 0 && dist2(e.x, e.y, p.x, p.y) < 1000 * 1000 && e.y > p.y - 300);
      if (!cands.length) break;
      cands.sort((a, b) => b.hp - a.hp);
      const tgt = cands[i % Math.min(cands.length, 3)];
      const side = i % 2 ? 1 : -1;
      this.missiles.push({ x: p.x + side * this.R * 0.7, y: p.y - 10, vx: side * 260, vy: -120 + p.vy, tgt, life: 3, dmg: st.missileDmg, trail: [] });
      any = true;
    }
    if (any) { this.tally.missiles++; this.emit({ k: 'missile' }); }
  }

  fireLance() {
    const p = this.p, st = this.st;
    const hasTarget = this.enemies.some(e => e.hp > 0 && (e.barrier ? e.y > p.y && e.y - p.y < 1400 : Math.abs(e.x - p.x) < 60 + e.r && e.y > p.y && e.y - p.y < 1400));
    if (!hasTarget && !st.twinLance) return false;
    const angs = st.twinLance ? [0, -0.38, 0.38] : [0];
    let fired = false;
    for (const da of angs) {
      const a = Math.PI / 2 + da;
      const x0 = p.x + Math.cos(a) * (this.R + 30), y0 = p.y + Math.sin(a) * (this.R + 30);
      const len = 1400, ux = Math.cos(a), uy = Math.sin(a);
      let hit = false;
      for (const e of this.enemies) {
        if (e.hp <= 0) continue;
        if (e.barrier) {
          if (da === 0 && e.y > y0 && e.y - y0 < len) { this.damageEnemy(e, st.lanceDmg * 1.5); hit = true; }
          continue;
        }
        const rx = e.x - x0, ry = e.y - y0;
        const tt = rx * ux + ry * uy;
        if (tt < 0 || tt > len) continue;
        const px = rx - tt * ux, py = ry - tt * uy;
        if (px * px + py * py < (e.r + 16) ** 2) { this.damageEnemy(e, st.lanceDmg); hit = true; }
      }
      if (hit || da === 0) { fired = true; this.beams.push({ x: x0, y: y0, a, len, t: 0.35, k: 'lance' }); }
    }
    if (fired) { this.tally.lances++; this.emit({ k: 'lance' }); }
    return fired;
  }

  updateShots(dt) {
    for (const s of this.shots) {
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      if (s.life <= 0) continue;
      for (const e of this.enemies) {
        if (e.hp <= 0) continue;
        if (e.barrier) {
          if (s.y >= e.y - 14 && s.y <= e.y + 30 && s.vy > 0) { this.damageEnemy(e, s.dmg); this.emit({ k: 'spark', x: s.x, y: e.y - 10 }); s.life = 0; break; }
          continue;
        }
        if (dist2(s.x, s.y, e.x, e.y) < (e.r + 6) ** 2) {
          this.damageEnemy(e, s.dmg);
          this.emit({ k: 'spark', x: s.x, y: s.y });
          s.life = 0; break;
        }
      }
    }
    this.shots = this.shots.filter(s => s.life > 0);
  }

  updateMissiles(dt) {
    for (const m of this.missiles) {
      m.life -= dt;
      if (m.tgt && m.tgt.hp > 0) {
        const tx = m.tgt.barrier ? m.x : m.tgt.x, ty = m.tgt.y;
        const a = Math.atan2(ty - m.y, tx - m.x);
        const sp = 820;
        m.vx += (Math.cos(a) * sp - m.vx) * Math.min(1, dt * 4);
        m.vy += (Math.sin(a) * sp + this.p.vy - m.vy) * Math.min(1, dt * 4);
        if (dist2(m.x, m.y, tx, ty) < (m.tgt.r + 14) ** 2 || (m.tgt.barrier && m.y > m.tgt.y - 14)) m.life = 0;
      } else {
        m.vy += 400 * dt;
      }
      m.x += m.vx * dt; m.y += m.vy * dt;
      m.trail.push(m.x, m.y); if (m.trail.length > 16) m.trail.splice(0, 2);
      if (m.life <= 0) {
        this.emit({ k: 'boom', x: m.x, y: m.y, r: 26, type: 'missile' });
        for (const e of this.enemies) {
          if (e.hp <= 0) continue;
          if (e.barrier ? Math.abs(m.y - e.y) < 60 : dist2(m.x, m.y, e.x, e.y) < (80 + e.r) ** 2) this.damageEnemy(e, m.dmg);
        }
      }
    }
    this.missiles = this.missiles.filter(m => m.life > 0);
  }

  // ------------------------------------------------------------ enemies
  shoot(e, speed, dmg, carry, spread = 0, n = 1, lead = 0) {
    const p = this.p;
    const tx = p.x + p.vx * lead, ty = p.y + (carry ? 0 : p.vy * lead);
    const base = Math.atan2(ty - e.y, tx - e.x);
    for (let i = 0; i < n; i++) {
      const a = base + (n > 1 ? (i - (n - 1) / 2) * spread : rand(-spread, spread));
      this.bullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, dmg, carry, life: 3.2, k: e.type });
    }
  }

  updateEnemies(dt) {
    const p = this.p, R = this.R;
    // Choir nodes buff anyone nearby.
    for (const e of this.enemies) if (e.buff > 0) e.buff -= dt;
    for (const w of this.enemies) {
      if (w.type !== 'warden' || w.hp <= 0 || !w.active) continue;
      for (const e of this.enemies) {
        if (e === w || e.barrier || e.hp <= 0) continue;
        if (dist2(e.x, e.y, w.x, w.y) < 300 * 300) { e.buff = 0.3; e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.05 * dt); }
      }
    }

    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      e.t += dt;
      if (e.flash > 0) e.flash -= dt;
      const dy = e.y - p.y;
      if (!e.active && dy < 1050 && dy > -700) {
        e.active = true;
        this.tally.enc[e.type] = (this.tally.enc[e.type] || 0) + 1;
        this.contact(e.type);
      }
      if (!e.active) continue;
      if (e.stun > 0) { e.stun -= dt; if (e.carry) e.y += p.vy * dt; continue; }
      const dp = this.dmgPow(e.y);
      switch (e.type) {
        case 'drone': {
          e.carry = true;
          const ox = e.side * (170 + 90 * Math.sin(e.seed * 9 + e.t * 0.6));
          const oy = 160 + 170 * Math.sin(e.seed * 5 + e.t * 0.45);
          this.seek(e, p.x + ox, p.y + oy, 210, dt);
          e.cd -= dt;
          if (e.cd <= 0 && Math.abs(dy) < 750) { e.cd = rand(1.4, 2.2); this.shoot(e, 400, 5 * dp, true, 0.05); }
          break;
        }
        case 'breacher': {
          if (e.hatch) {
            if (dy > 240 || dy < -200) break;
            e.hatch = false; this.emit({ k: 'clang' });
          }
          e.carry = true;
          if (e.attached) {
            e.x = p.x + Math.cos(e.ang) * (R + 8);
            e.y = p.y + Math.sin(e.ang) * (R + 8);
            e.bore -= dt;
            if (e.bore <= 0) { this.board(e); e.hp = 0; }
            break;
          }
          this.seek(e, p.x, p.y, 440 + 40 * this.massIdx, dt);
          if (dist2(e.x, e.y, p.x, p.y) < (R + 12) ** 2) {
            if (p.shield > this.st.shieldMax * 0.35 && this.st.shieldMax > 0) {
              // a strong shield bounces the pod
              this.hurt(6 * dp, false, 'breacher');
              e.vx = (e.x - p.x) * 6; e.vy = (e.y - p.y) * 6; e.x += e.vx * 0.05; e.y += e.vy * 0.05;
              e.stun = 0.8;
            } else {
              e.attached = true; e.ang = Math.atan2(e.y - p.y, e.x - p.x); e.bore = 3.2; this.tally.pods++;
              this.emit({ k: 'toast', text: 'BREACHER ATTACHED', tone: 'bad' });
              this.emit({ k: 'clang' });
            }
          }
          break;
        }
        case 'warden': {
          e.carry = true;
          this.seek(e, p.x + e.side * 230, p.y + 360 + 60 * Math.sin(e.t), 170, dt);
          break;
        }
        case 'carrier': {
          e.carry = true;
          this.seek(e, p.x + e.side * 200 * Math.sin(e.t * 0.3), p.y + 520, 120, dt);
          e.cd -= dt;
          if (e.cd <= 0) {
            e.cd = 4.2;
            const kids = this.enemies.filter(k => k.parent === e && k.hp > 0).length;
            if (kids < 4) { const d = this.spawn('drone', e.x, e.y + 20, { r: 20, parent: e, active: true, carry: true }); d.cd = 1.5; }
          }
          break;
        }
        case 'sentry': {
          e.aim = Math.atan2(p.y - e.y, p.x - e.x);
          e.cd -= dt;
          if (e.cd <= 0 && Math.abs(dy) < 800) {
            e.cd = 2.3; e.burst = 3;
          }
          if (e.burst > 0) {
            e.bt = (e.bt || 0) - dt;
            if (e.bt <= 0) { e.bt = 0.12; e.burst--; this.shoot(e, 480, 6 * dp, false, 0.04, 1, Math.abs(dy) / 480); }
          }
          break;
        }
        case 'mine': {
          e.y += Math.sin(e.t * 2 + e.seed * 6) * 8 * dt;
          if (dist2(e.x, e.y, p.x, p.y) < (R + 44) ** 2) {
            this.hurt(22 * dp * this.st.impact, false, 'mine');
            e.hp = 0; this.emit({ k: 'boom', x: e.x, y: e.y, r: 34, type: 'mine' });
          }
          break;
        }
        case 'lancer': {
          e.aimA = e.aimA ?? Math.atan2(p.y - e.y, p.x - e.x);
          e.phaseT = (e.phaseT ?? rand(0.5, 2)) - dt;
          if (Math.abs(dy) > 750 && e.phase === 0) break;
          if (e.phase === 0) {
            e.aimA = Math.atan2(p.y - e.y, p.x - e.x);
            if (e.phaseT <= 0) { e.phase = 1; e.phaseT = 1.25; e.lockX = p.x; e.lockY = p.y + p.vy * 0.9; e.aimA = Math.atan2(e.lockY - e.y, e.lockX - e.x); this.emit({ k: 'charge' }); }
          } else if (e.phase === 1) {
            if (e.phaseT <= 0) {
              e.phase = 2; e.phaseT = 0.35;
              // damage if the hull crosses the beam line
              const ux = Math.cos(e.aimA), uy = Math.sin(e.aimA);
              const rx = p.x - e.x, ry = p.y - e.y, tt = rx * ux + ry * uy;
              const px = rx - tt * ux, py = ry - tt * uy;
              if (tt > 0 && px * px + py * py < (R + 10) ** 2) this.hurt(30 * dp, false, 'lancer');
              this.emit({ k: 'zap' });
            }
          } else if (e.phaseT <= 0) { e.phase = 0; e.phaseT = rand(2.2, 3.4); }
          break;
        }
        case 'stasis': {
          break;
        }
        case 'heart': {
          e.cd -= dt; e.spawnCd -= dt;
          if (e.cd <= 0) {
            e.cd = 2.6 - Math.min(1.2, (1 - e.hp / e.maxHp) * 1.5);
            const n = 14 + this.massIdx * 2, off = rand(0, TAU);
            for (let i = 0; i < n; i++) {
              const a = off + (i / n) * TAU;
              this.bullets.push({ x: e.x + Math.cos(a) * e.r, y: e.y + Math.sin(a) * e.r, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, dmg: 7 * dp, carry: false, life: 5, k: 'heart' });
            }
            this.emit({ k: 'pulse', x: e.x, y: e.y });
          }
          if (e.spawnCd <= 0) {
            e.spawnCd = 5.5;
            const types = ['drone', 'drone'];
            if (this.st.bots > 0 || this.massIdx > 0) types.push('breacher');
            const t = pick(types);
            this.spawn(t, e.x + rand(-200, 200), e.y - e.r, { r: t === 'drone' ? 20 : 18, active: true });
          }
          break;
        }
      }
      if (e.carry) e.y += p.vy * dt;
    }
  }

  seek(e, tx, ty, sp, dt) {
    const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, d / 120);
    e.vx += ((dx / d) * sp * k - e.vx) * Math.min(1, dt * 3);
    e.vy += ((dy / d) * sp * k - e.vy) * Math.min(1, dt * 3);
    e.x += e.vx * dt; e.y += e.vy * dt;
    // keep inside the tube
    const c = this.center(e.y), h = this.half(e.y) - e.r - 6;
    e.x = clamp(e.x, c - h, c + h);
  }

  updateBullets(dt) {
    const p = this.p, R = this.R;
    const shR = R + 16;
    for (const b of this.bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt + (b.carry ? p.vy * dt : 0); b.life -= dt;
      if (this.dead) continue;
      const d = dist2(b.x, b.y, p.x, p.y);
      if (p.shield > 0 && d < shR * shR) { this.hurt(b.dmg, false, b.k); this.emit({ k: 'deflect', x: b.x, y: b.y }); b.life = 0; }
      else if (d < R * R) { this.hurt(b.dmg, false, b.k); this.emit({ k: 'spark', x: b.x, y: b.y, c: 'hull' }); b.life = 0; }
    }
    this.bullets = this.bullets.filter(b => b.life > 0);
  }

  updatePickups(dt) {
    const p = this.p, mag = this.st.magnet;
    for (const k of this.pickups) {
      k.t += dt;
      if (k.vx) { k.x += k.vx * dt; k.y += k.vy * dt; k.vx *= 1 - dt * 2; k.vy *= 1 - dt * 2; }
      const d2 = dist2(k.x, k.y, p.x, p.y);
      if (d2 < (mag + this.R) ** 2) {
        const d = Math.sqrt(d2) || 1;
        const sp = 900 * (1 - d / (mag + this.R + 1)) + 300;
        k.x += ((p.x - k.x) / d) * sp * dt;
        k.y += ((p.y - k.y) / d) * sp * dt + p.vy * dt;
      }
      if (d2 < (this.R + 10) ** 2) {
        k.gone = true;
        if (k.k === 'salvage') { this.tally.caches++; this.salvage += k.v * (k.vx !== undefined ? 1 : this.st.salvageMul); this.emit({ k: 'coin' }); }
        else if (k.k === 'coolant') { this.tally.coolant++; p.heat = Math.max(0, p.heat - this.st.heatMax * 0.35); this.emit({ k: 'toast', text: 'COOLANT CELL  −35% HEAT', tone: 'good' }); this.emit({ k: 'powerup' }); }
        else if (k.k === 'repair') { this.tally.kits++; const r = Math.min(this.st.hullMax - p.hull, this.st.hullMax * 0.25); p.hull += r; this.repaired += r; this.emit({ k: 'toast', text: 'REPAIR KIT  +25% HULL', tone: 'good' }); this.emit({ k: 'powerup' }); }
      }
    }
  }

  // ------------------------------------------------------------ boarding
  board(pod) {
    const n = 2 + (this.frac() > 0.5 ? 1 : 0) + (this.massIdx > 1 ? 1 : 0);
    const hp = 30 * Math.pow(this.mass.mult, 0.75) * (1 + clamp(this.frac(), 0, 1));
    for (let i = 0; i < n; i++) {
      const lx = Math.cos(pod.ang) * 0.7, ly = Math.sin(pod.ang) * 0.7;
      const room = pick(this.rooms);
      this.boarders.push({ x: lx + rand(-0.05, 0.05), y: ly + rand(-0.05, 0.05), hp, maxHp: hp, room, inRoom: false, hit: 0, dmg: 6 * Math.pow(this.mass.mult, 0.75) });
    }
    this.boarded += n;
    this.emit({ k: 'board', n });
    this.emit({ k: 'toast', text: `INTRUDERS ABOARD ×${n}`, tone: 'bad' });
  }

  updateInterior(dt) {
    for (const r of this.rooms) r.sab = 0;
    const st = this.st;
    for (const b of this.boarders) {
      if (b.hp <= 0) continue;
      if (b.hit > 0) b.hit -= dt;
      const dx = b.room.x - b.x, dy = b.room.y - b.y, d = Math.hypot(dx, dy);
      const fighting = this.bots.some(bt => bt.hp > 0 && bt.target === b && dist2(bt.x, bt.y, b.x, b.y) < 0.012);
      if (d > 0.06 && !fighting) { b.x += (dx / d) * 0.32 * dt; b.y += (dy / d) * 0.32 * dt; b.inRoom = false; }
      else if (d <= 0.06) { b.inRoom = true; }
      if (b.inRoom) b.room.sab++;
      // boarders chew on the hull wherever they are
      this.hurt(1.2 * this.dmgPow(this.p.y) * dt, true, 'boarders');
    }
    const reactor = this.rooms.find(r => r.id === 'reactor');
    if (reactor.sab) this.hurt(2.5 * reactor.sab * this.dmgPow(this.p.y) * dt, true, 'boarders');

    for (const bt of this.bots) {
      if (bt.hit > 0) bt.hit -= dt;
      if (bt.hp <= 0) {
        bt.respawn -= dt;
        if (bt.respawn <= 0) { bt.hp = 1; bt.x = 0; bt.y = 0; bt.target = null; }
        continue;
      }
      if (!bt.target || bt.target.hp <= 0) {
        let best = null, bd = Infinity;
        for (const b of this.boarders) { if (b.hp <= 0) continue; const d = dist2(b.x, b.y, bt.x, bt.y); if (d < bd) { bd = d; best = b; } }
        bt.target = best;
      }
      const b = bt.target;
      if (!b) { // idle patrol around the reactor
        const a = this.t * 0.8 + this.bots.indexOf(bt) * 2.1;
        const tx = Math.cos(a) * 0.14, ty = Math.sin(a) * 0.14;
        bt.x += (tx - bt.x) * Math.min(1, dt * 2); bt.y += (ty - bt.y) * Math.min(1, dt * 2);
        continue;
      }
      const dx = b.x - bt.x, dy = b.y - bt.y, d = Math.hypot(dx, dy);
      if (d > 0.08) { bt.x += (dx / d) * 0.55 * dt; bt.y += (dy / d) * 0.55 * dt; }
      else {
        b.hp -= 20 * st.botPow * dt; b.hit = 0.1;
        bt.hp -= (b.dmg / (40 * st.botPow)) * dt; bt.hit = 0.1;
        if (Math.random() < dt * 8) this.emit({ k: 'zapin', x: (b.x + bt.x) / 2, y: (b.y + bt.y) / 2 });
        if (b.hp <= 0) { this.repelled++; this.emit({ k: 'toast', text: 'INTRUDER NEUTRALISED', tone: 'good' }); this.emit({ k: 'kill_in' }); }
        if (bt.hp <= 0) { bt.respawn = 6; this.tally.botsLost++; this.emit({ k: 'botdown' }); }
      }
    }
    this.boarders = this.boarders.filter(b => b.hp > 0);
  }

  // ------------------------------------------------------------ results
  result() {
    const st = this.st;
    const depth = Math.floor(this.maxDepthM);
    const travelled = Math.max(0, depth - this.startM);
    const depthSalvage = travelled * 0.25 * this.mass.mult * st.salvageMul;
    const salvage = Math.round(this.salvage + depthSalvage + (this.victory ? 300 * this.mass.mult * st.salvageMul : 0));
    const data = Math.round((travelled / 9 + this.newContacts.length * 15 + (this.victory ? 150 * (this.massIdx + 1) : 0)) * st.dataMul * (1 + this.massIdx * 0.5));
    const xm = st.xpMul;
    return {
      depth, victory: this.victory, salvage, data, kills: this.kills,
      killer: this.victory ? null : this.dead ? (this.killer || 'unknown') : 'abandon',
      time: this.t, tally: this.tally, mass: this.massIdx, repaired: this.repaired,
      boarded: this.boarded, repelled: this.repelled, newContacts: this.newContacts.slice(),
      crewXp: {
        gunner: Math.round(this.gunnerXp * xm),
        pilot: Math.round((travelled / 22) * xm),
        security: Math.round(this.repelled * 3 * xm),
        shieldt: Math.round((this.absorbed / 25) * xm),
        repair: Math.round((this.repaired / 15) * xm),
      },
    };
  }
}
