// Between-run hangar: upgrades, research, crew, relics, target select.
import { UPGRADES, UPGRADE_GROUPS, CREW, CREW_MAX, crewXpNeed, upgradeCost, MASSES, RELICS } from './data.js';
import {
  lvl, has, relic, visibleUpgrades, visibleResearch, nextTeaser, researchAvailable,
  crewUnlocked, trainCost, addCrewXp, buyUpgrade, buyResearch, buyRelic, computeStats, save,
} from './state.js';
import { Renderer } from './render.js';
import { ROOMS } from './run.js';
import { sfx } from './audio.js';

const $ = s => document.querySelector(s);
const fmt = n => Math.floor(n).toLocaleString('en-US');
const TAU = Math.PI * 2;

// Dock icons: small sci-fi glyphs, each with its own colour (dimmed when not selected).
const ICONS = {
  ship: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <path d="M10 18 H22 L16 30 Z" fill="#c9d3e0"/><path d="M12.5 21 H19.5 M14 24.5 H18" stroke="#2a2f38" stroke-width="1.6"/>
    <circle cx="16" cy="13" r="9" fill="#2f3a4a" stroke="#8796ab" stroke-width="1.6"/>
    <circle cx="16" cy="13" r="5" fill="#0b1522" stroke="#6fe3ff" stroke-width="1.4"/>
    <circle cx="16" cy="13" r="2" fill="#ffbe5a"/><path d="M16 4 V1" stroke="#aef7ff" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  upgrades: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <path d="M16 3 L27 9.5 V22.5 L16 29 L5 22.5 V9.5 Z" fill="#3a2a0c" stroke="#ffd36b" stroke-width="1.6"/>
    <path d="M10 18 L16 12 L22 18" fill="none" stroke="#ffd36b" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M10 23 L16 17 L22 23" fill="none" stroke="#fff0bf" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/></svg>`,
  research: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <ellipse cx="16" cy="16" rx="13" ry="5" fill="none" stroke="#b18cff" stroke-width="1.6"/>
    <ellipse cx="16" cy="16" rx="13" ry="5" fill="none" stroke="#b18cff" stroke-width="1.6" transform="rotate(60 16 16)"/>
    <ellipse cx="16" cy="16" rx="13" ry="5" fill="none" stroke="#6fe3ff" stroke-width="1.6" transform="rotate(-60 16 16)"/>
    <circle cx="16" cy="16" r="3.2" fill="#e6d9ff"/><circle cx="28.5" cy="16" r="1.8" fill="#6fe3ff"/></svg>`,
  crew: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <path d="M16 2 V6" stroke="#6cff9a" stroke-width="1.6" stroke-linecap="round"/><circle cx="16" cy="2.5" r="1.8" fill="#6cff9a"/>
    <rect x="6" y="6" width="20" height="16" rx="6" fill="#12281c" stroke="#6cff9a" stroke-width="1.6"/>
    <rect x="9.5" y="11" width="13" height="5" rx="2.5" fill="#6cff9a"/><circle cx="13" cy="13.5" r="1.2" fill="#0b1119"/><circle cx="19" cy="13.5" r="1.2" fill="#0b1119"/>
    <path d="M7 30 Q16 21 25 30" fill="none" stroke="#6cff9a" stroke-width="1.6" opacity=".7"/></svg>`,
  relics: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <path d="M16 2 L24 12 L16 30 L8 12 Z" fill="#3a0f2c" stroke="#ff7ad9" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M8 12 H24 M16 2 L13 12 L16 30 L19 12 Z" fill="none" stroke="#ff7ad9" stroke-width="1.1" opacity=".75"/>
    <path d="M26 4 L27 6.5 L29.5 7.5 L27 8.5 L26 11 L25 8.5 L22.5 7.5 L25 6.5 Z" fill="#ffd3f1"/></svg>`,
};

export class Hangar {
  constructor(S, { onLaunch }) {
    this.S = S;
    this.onLaunch = onLaunch;
    this.tab = 'ship';
    this.narrow = matchMedia('(max-width: 820px)');
    this.narrow.addEventListener?.('change', () => this.render());
    this.t = 0;
    this.prev = new Renderer($('#preview'));
    this.lastXp = {};
    $('#tabs').addEventListener('click', e => {
      const b = e.target.closest('[data-tab]'); if (!b) return;
      if (this.tab === b.dataset.tab) return;
      this.tab = b.dataset.tab; this.render();
      $('#hangar').scrollTop = 0;
    });
    $('#tabBody').addEventListener('click', e => this.click(e));
    $('#btnLaunch').addEventListener('click', () => this.onLaunch());
    $('#btnLaunchTop').addEventListener('click', () => this.onLaunch());
    $('#massPrev').addEventListener('click', () => this.setMass(-1));
    $('#massNext').addEventListener('click', () => this.setMass(1));
    // tap a currency to learn what it is
    const info = $('#curInfo');
    const CUR = {
      s: ['⬡ Salvage', 'var(--gold)', 'Scrap and crystal you pull from wrecks, caches and the depth you reach.', 'Spend it on Upgrades: hull, drive, heat, weapons and systems.'],
      d: ['◈ Data', 'var(--violet)', 'Scans sent home over the Ansible: more for going deeper, and a bonus the first time you meet a new enemy.', 'Spend it on Research, which unlocks new systems and crew, or to sim-train your crew.'],
      k: ['✦ Core shards', 'var(--pink)', 'Pieces of a destroyed core. You get them by reaching and destroying a world\'s core.', 'Spend them on Relics: permanent bonuses for every run.'],
    };
    document.querySelector('.wallet').addEventListener('click', e => {
      const b = e.target.closest('[data-cur]'); if (!b) return;
      const open = !info.hidden && info.dataset.k === b.dataset.cur;
      document.querySelectorAll('.cur').forEach(c => c.classList.remove('on'));
      if (open) { info.hidden = true; return; }
      const [name, col, what, use] = CUR[b.dataset.cur];
      info.innerHTML = `<b style="color:${col}">${name}</b><p>${what}</p><small>${use}</small>`;
      info.dataset.k = b.dataset.cur; info.hidden = false; b.classList.add('on');
    });
    document.addEventListener('pointerdown', e => {
      if (!info.hidden && !e.target.closest('.wallet') && !e.target.closest('#curInfo')) {
        info.hidden = true; document.querySelectorAll('.cur').forEach(c => c.classList.remove('on'));
      }
    });
  }

  setS(S) { this.S = S; }

  setMass(d) {
    const S = this.S;
    S.mass = Math.max(0, Math.min(S.massUnlocked, S.mass + d));
    save(S); this.render();
  }

  // ---------------------------------------------------------- seen / new badges
  keys() {
    const S = this.S, out = {};
    for (const u of visibleUpgrades(S)) out['u:' + u.id] = u.name;
    for (const r of visibleResearch(S)) out['r:' + r.id] = r.name;
    for (const c of crewUnlocked(S)) out['c:' + c] = CREW[c].name;
    if (this.relicsOn()) for (const r of RELICS) out['x:' + r.id] = r.name;
    return out;
  }
  isNew(k) { return !this.S.seen[k] && this.S.runs > 0; }
  markSeen() { for (const k in this.keys()) this.S.seen[k] = true; }
  relicsOn() { return Object.keys(this.S.cleared).length > 0 || this.S.shards > 0; }

  // ---------------------------------------------------------- render
  render() {
    const S = this.S, m = MASSES[S.mass];
    document.documentElement.style.setProperty('--mass', m.pal.accent);
    $('#wSalv').textContent = fmt(S.salvage);
    $('#wData').textContent = fmt(S.data);
    $('#wDataWrap').hidden = S.runs === 0 && S.data === 0;
    $('#wShard').textContent = fmt(S.shards);
    $('#wShardWrap').hidden = !this.relicsOn();

    // bay
    $('#massName').textContent = m.name;
    $('#massKind').textContent = m.kind + (S.cleared[S.mass] ? ' · core destroyed' : '');
    $('#massBlurb').textContent = m.blurb;
    $('#massPrev').disabled = S.mass <= 0;
    $('#massNext').disabled = S.mass >= S.massUnlocked;
    $('#massPrev').hidden = $('#massNext').hidden = S.massUnlocked === 0;
    const best = S.best[S.mass] || 0;
    const k = Math.min(1, best / m.core);
    $('#pBest').style.width = (k * 100) + '%';
    $('#pBestLbl').style.left = (k * 100) + '%';
    $('#pBestLbl').textContent = best ? `best ${fmt(best)} m` : '';
    $('#pCore').textContent = `core ${fmt(m.core)} m`;
    const st = computeStats(S);
    const dps = st.turrets * st.gunDmg * st.fireRate;
    const stats = [
      ['Hull', fmt(st.hullMax)], st.shieldMax ? ['Shield', fmt(st.shieldMax)] : ['Armor', `${Math.round(st.armor * 100)}%`],
      ['Fall speed', `${st.speed.toFixed(1)} m/s`], ['Gun DPS', fmt(dps)],
      ['Heat cap', fmt(st.heatMax)], ['Cooling', `${st.cooling.toFixed(1)}/s`],
    ];
    $('#statgrid').innerHTML = stats.map(([a, b]) => `<div class="stat"><small>${a}</small><b>${b}</b></div>`).join('');
    $('#btnLaunch b').textContent = S.runs === 0 ? 'Launch' : `Launch run ${S.runs + 1}`;
    this.readStats = stats.concat([
      ['Turrets', String(st.turrets)], ['Ram', `${fmt(st.ram)} dps`], ['Armor', `${Math.round(st.armor * 100)}%`],
      st.shieldMax ? ['Shield regen', `${st.shieldRegen.toFixed(1)}/s`] : null,
    ].filter(Boolean)).filter((x, i, a) => a.findIndex(y => y[0] === x[0]) === i);

    // tabs
    const keys = Object.keys(this.keys());
    const newIn = p => keys.some(k => k.startsWith(p) && this.isNew(k));
    const tabs = [['ship', 'Ship', null], ['upgrades', 'Upgrades', 'u:']];
    if (visibleResearch(S).length) tabs.push(['research', 'Research', 'r:']);
    tabs.push(['crew', 'Crew', 'c:']);
    if (this.relicsOn()) tabs.push(['relics', 'Relics', 'x:']);
    if (!tabs.some(t => t[0] === this.tab)) this.tab = 'ship';
    // on wide screens the ship bay is always visible, so "Ship" means upgrades
    const view = this.tab === 'ship' && !this.narrow.matches ? 'upgrades' : this.tab;
    $('#tabs').innerHTML = tabs.map(([id, name, p]) =>
      `<button class="${view === id ? 'on' : ''}" data-tab="${id}" aria-label="${name}">${ICONS[id]}<small>${name}</small>${p && newIn(p) ? '<i class="dot"></i>' : ''}</button>`).join('');
    $('.hgrid').classList.toggle('v-ship', view === 'ship');
    $('#hangar').classList.toggle('v-ship', view === 'ship');
    if (view === 'ship') { $('#tabBody').innerHTML = ''; return; }

    const body = { upgrades: () => this.upgrades(), research: () => this.research(), crew: () => this.crew(), relics: () => this.relics() }[view]();
    $('#tabBody').innerHTML = body;
  }

  pips(l, max) {
    if (max > 20) return '';
    return `<div class="pips">${Array.from({ length: max }, (_, i) => `<i class="${i < l ? 'f' : ''}"></i>`).join('')}</div>`;
  }

  upgrades() {
    const S = this.S, vis = visibleUpgrades(S);
    let html = '';
    for (const g of UPGRADE_GROUPS) {
      const items = vis.filter(u => u.g === g.id);
      if (!items.length) continue;
      html += `<section class="group"><h3>${g.name}</h3><div class="items">`;
      for (const u of items) {
        const l = lvl(S, u.id), maxed = l >= u.max, c = upgradeCost(u, l), ok = !maxed && S.salvage >= c;
        const nw = this.isNew('u:' + u.id);
        html += `<div class="item ${nw ? 'new' : ''}">${nw ? '<span class="new-b">NEW</span>' : ''}
          <h4>${u.name}<small>Lv ${l}/${u.max}</small></h4>
          <div class="eff">${u.fmt(l)}${maxed ? '' : ` <span>→ ${u.fmt(l + 1)}</span>`}</div>
          ${this.pips(l, u.max)}
          <button class="buy ${ok ? 'ok' : ''} ${maxed ? 'done' : ''}" data-up="${u.id}" ${ok ? '' : 'disabled'}>
            ${maxed ? 'MAXED' : `<span class="cost s">⬡</span>${fmt(c)}`}</button></div>`;
      }
      html += '</div></section>';
    }
    const hidden = UPGRADES.length - vis.length;
    if (hidden) html += `<div class="teaser"><b>▒▒▒▒▒</b> ${hidden} more systems are waiting. Go deeper and complete research to reveal them.</div>`;
    return html;
  }

  research() {
    const S = this.S;
    let html = `<section class="group"><h3>Research · paid with Data</h3><div class="items">`;
    for (const r of visibleResearch(S)) {
      const done = has(S, r.id), avail = researchAvailable(S, r), ok = !done && avail && S.data >= r.cost;
      const nw = this.isNew('r:' + r.id) && !done;
      html += `<div class="item ${nw ? 'new' : ''} ${!avail && !done ? 'locked' : ''}">${nw ? '<span class="new-b">NEW</span>' : ''}
        <h4>${r.name}</h4><p>${r.desc}</p>
        <button class="buy ${ok ? 'ok' : ''} ${done ? 'done' : ''}" data-rs="${r.id}" ${ok ? '' : 'disabled'}>
          ${done ? '✓ ONLINE' : !avail ? 'Needs prior research' : `<span class="cost d">◈</span>${fmt(r.cost)}`}</button></div>`;
    }
    html += '</div></section>';
    const t = nextTeaser(S);
    if (t) html += `<div class="teaser"><b>${t.name.replace(/[A-Za-z]/g, '▒')}</b> Encrypted schematic. Go deeper to decode it.</div>`;
    return html;
  }

  avatar(id) {
    const c = CREW[id];
    return `<svg class="avatar" viewBox="0 0 56 56" aria-hidden="true">
      <rect x="2" y="2" width="52" height="52" rx="14" fill="#0b1119" stroke="${c.color}" stroke-opacity=".6"/>
      <circle cx="28" cy="25" r="13" fill="none" stroke="${c.color}" stroke-width="2"/>
      <rect x="19" y="21" width="18" height="6" rx="3" fill="${c.color}"/>
      <path d="M14 48 Q28 36 42 48" fill="none" stroke="${c.color}" stroke-width="2" stroke-opacity=".7"/>
      <circle cx="44" cy="12" r="3" fill="${c.color}"><animate attributeName="opacity" values="1;.2;1" dur="2s" repeatCount="indefinite"/></circle>
    </svg>`;
  }

  crew() {
    const S = this.S;
    let html = `<section class="group"><h3>AI crew · skills persist over the Ansible link</h3><div class="items">`;
    for (const id of crewUnlocked(S)) {
      const c = S.crew[id], d = CREW[id];
      const need = crewXpNeed(c.lvl), maxed = c.lvl >= CREW_MAX, tc = trainCost(c), ok = !maxed && S.data >= tc;
      const nw = this.isNew('c:' + id);
      html += `<div class="item ${nw ? 'new' : ''}">${nw ? '<span class="new-b">NEW</span>' : ''}
        <div class="crew">${this.avatar(id)}<div>
          <h4>${d.name}<small>${d.role}</small></h4>
          <div class="lvl" style="color:${d.color}">Level ${c.lvl}${maxed ? ' · MAX' : ''}</div>
          <div class="xp"><i style="width:${maxed ? 100 : Math.min(100, c.xp / need * 100)}%"></i></div>
        </div></div>
        <p>${d.perk}. Learns from ${d.xpFrom}.</p>
        <button class="buy ${ok ? 'ok' : ''}" data-train="${id}" ${ok ? '' : 'disabled'}>${maxed ? 'MAXED' : `Sim-train +${Math.ceil(need * 0.35)} XP · <span class="cost d">◈</span>${fmt(tc)}`}</button>
      </div>`;
    }
    html += '</div></section>';
    const all = ['gunner', 'pilot', 'security', 'shieldt', 'repair'];
    const missing = all.filter(id => !crewUnlocked(S).includes(id)).length;
    if (missing) html += `<div class="teaser"><b>▒▒▒▒</b> ${missing} more crew AI${missing > 1 ? 's' : ''} can be brought online through research.</div>`;
    return html;
  }

  relics() {
    const S = this.S;
    let html = `<section class="group"><h3>Relics · forged from core shards</h3><div class="items">`;
    for (const r of RELICS) {
      const l = relic(S, r.id), maxed = l >= r.max, c = r.cost(l), ok = !maxed && S.shards >= c;
      html += `<div class="item"><h4>${r.name}<small>Lv ${l}/${r.max}</small></h4><p>${r.desc}</p>
        <div class="eff">${r.fmt(l)}${maxed ? '' : ` <span>→ ${r.fmt(l + 1)}</span>`}</div>
        <button class="buy ${ok ? 'ok' : ''}" data-relic="${r.id}" ${ok ? '' : 'disabled'}>${maxed ? 'MAXED' : `<span class="cost k">✦</span>${c}`}</button></div>`;
    }
    return html + '</div></section>';
  }

  click(e) {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    const S = this.S;
    let ok = false, cur = null;
    if (b.dataset.up) { ok = buyUpgrade(S, visibleUpgrades(S).find(u => u.id === b.dataset.up)); cur = '.cur.s'; }
    else if (b.dataset.rs) { ok = buyResearch(S, visibleResearch(S).find(r => r.id === b.dataset.rs)); cur = '.cur.d'; }
    else if (b.dataset.train) {
      const c = S.crew[b.dataset.train], tc = trainCost(c);
      if (S.data >= tc) { S.data -= tc; addCrewXp(S, b.dataset.train, Math.ceil(crewXpNeed(c.lvl) * 0.35)); ok = true; cur = '.cur.d'; }
    }
    else if (b.dataset.relic) { ok = buyRelic(S, RELICS.find(r => r.id === b.dataset.relic)); cur = '.cur.k'; }
    sfx(ok ? 'buy' : 'deny');
    if (ok) {
      save(S);
      const y = $('#hangar').scrollTop;
      this.render();
      $('#hangar').scrollTop = y;
      const el = document.querySelector(cur);
      if (el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    }
  }

  // ---------------------------------------------------------- animated preview
  tick(dt) {
    this.t += dt;
    const r = this.prev, cv = r.cv;
    if (cv.clientWidth && (Math.abs(cv.clientWidth - r.w) > 1 || Math.abs(cv.clientHeight - r.h) > 1)) r.resize();
    const ctx = r.ctx, w = r.w, h = r.h, d = r.dpr;
    if (!w) return;
    const S = this.S, m = MASSES[S.mass], st = computeStats(S);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#05070a'); g.addColorStop(1, m.pal.bg0);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // bay grid
    ctx.strokeStyle = 'rgba(111,227,255,0.07)'; ctx.lineWidth = 1;
    const off = (this.t * 20) % 24;
    for (let y = -off; y < h; y += 24) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    for (let x = 0; x < w; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    const cg = ctx.createRadialGradient(w / 2, h * 1.1, 10, w / 2, h * 1.1, h);
    cg.addColorStop(0, m.pal.fog + '0.45)'); cg.addColorStop(1, m.pal.fog + '0)');
    ctx.fillStyle = cg; ctx.fillRect(0, 0, w, h);
    // docking clamps
    ctx.strokeStyle = 'rgba(140,160,190,0.35)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(w * 0.1, h * 0.46); ctx.lineTo(w * 0.28, h * 0.46); ctx.moveTo(w * 0.9, h * 0.46); ctx.lineTo(w * 0.72, h * 0.46); ctx.stroke();

    const R = Math.min(w, h) * 0.2, x = w / 2, y = h * 0.44 + Math.sin(this.t * 1.3) * 4;
    const n = st.turrets;
    const turrets = Array.from({ length: n }, (_, i) => {
      const a = n === 1 ? Math.PI / 2 : (i / n) * TAU - Math.PI / 2 + this.t * 0.15;
      return { a, aim: a + Math.sin(this.t + i) * 0.4, recoil: 0 };
    });
    const bots = Array.from({ length: st.bots }, (_, i) => {
      const a = this.t * 0.8 + i * 2.1;
      return { x: Math.cos(a) * 0.14, y: Math.sin(a) * 0.14, hp: 1, hit: 0 };
    });
    const sR = R / 70; // drawVessel draws in hull-radius terms; scale line widths via transform
    ctx.save(); ctx.translate(x, y); ctx.scale(sR, sR);
    r.drawVessel(ctx, 0, 0, 70, {
      t: this.t, spin: this.t, vx: Math.sin(this.t * 0.7) * 120, vy: 200, ramming: false, hullK: 1,
      shieldK: st.shieldMax ? 1 : 0, shieldT: 0, hit: 0, turrets, rooms: ROOMS.map(q => ({ ...q, sab: 0 })),
      boarders: [], bots, crew: crewUnlocked(S), od: false, heat: 0, accent: m.pal.accent, pods: [], shieldOn: st.shieldMax > 0,
    });
    for (let i = 0; i < st.wingmen; i++) {
      const a = this.t * 1.1 + (i / st.wingmen) * TAU;
      const wx = Math.cos(a) * 128, wy = Math.sin(a) * 110;
      ctx.fillStyle = '#12202a'; ctx.strokeStyle = '#7dffcf'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(wx, wy, 8, 0, TAU); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
    this.drawReadout(ctx, w, h, dt);
  }

  // One stat at a time fades in beside the ship, then out, in a new random spot.
  drawReadout(ctx, w, h, dt) {
    const list = this.readStats; if (!list || !list.length) return;
    let ro = this.ro;
    if (!ro || ro.t >= ro.life) {
      let i; do { i = (Math.random() * list.length) | 0; } while (list.length > 1 && ro && list[i][0] === ro.label);
      const left = ro ? !ro.left : Math.random() < 0.5;
      ro = this.ro = {
        label: list[i][0], value: list[i][1], left, t: 0, life: 2.6,
        x: left ? w * (0.04 + Math.random() * 0.05) : w * (0.96 - Math.random() * 0.05),
        y: h * (0.12 + Math.random() * 0.74),
      };
    }
    ro.t += dt;
    const a = Math.min(1, ro.t / 0.35, (ro.life - ro.t) / 0.6);
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = ro.left ? 'left' : 'right';
    ctx.shadowColor = 'rgba(111,227,255,0.8)'; ctx.shadowBlur = 8;
    ctx.fillStyle = 'rgba(111,227,255,0.75)';
    ctx.font = '600 10px "Chakra Petch", sans-serif';
    ctx.fillText(ro.label.toUpperCase().split('').join(String.fromCharCode(8202)), ro.x, ro.y);
    ctx.fillStyle = '#b4f3ff';
    ctx.font = '700 17px "Chakra Petch", sans-serif';
    ctx.fillText(ro.value, ro.x, ro.y + 19);
    // a short bracket tick toward the ship
    ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(111,227,255,0.5)'; ctx.lineWidth = 1;
    const bx = ro.left ? ro.x - 3 : ro.x + 3;
    ctx.beginPath(); ctx.moveTo(bx, ro.y - 9); ctx.lineTo(bx, ro.y + 23); ctx.stroke();
    ctx.restore();
  }
}
