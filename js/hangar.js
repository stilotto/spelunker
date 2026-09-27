// Between-run hangar: upgrades, research, crew, relics, target select.
import { ENEMIES, CAUSES, UPGRADES, UPGRADE_GROUPS, CREW, CREW_MAX, crewXpNeed, upgradeCost, MASSES, RELICS, SHARD_CLEARS } from './data.js';
import {
  lvl, has, relic, visibleUpgrades, visibleResearch, nextTeaser, researchAvailable,
  freshStats, crewUnlocked, trainCost, addCrewXp, buyUpgrade, buyResearch, buyRelic, computeStats, save,
} from './state.js';
import { Renderer } from './render.js';
import { ROOMS } from './run.js';
import { sfx } from './audio.js';
import { Tour } from './tour.js';

const $ = s => document.querySelector(s);
const fmt = n => Math.floor(n).toLocaleString('en-US');
const TAU = Math.PI * 2;
const fmtTime = sec => { sec = Math.round(sec || 0); const h = (sec / 3600) | 0, m = ((sec % 3600) / 60) | 0, s = sec % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s).padStart(2, '0')}s`; };

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
  stats: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <path d="M4 28 H28" stroke="#8d99ab" stroke-width="1.6" stroke-linecap="round"/>
    <rect x="6" y="17" width="4.5" height="10" rx="1.5" fill="#6fe3ff" opacity=".55"/>
    <rect x="13.75" y="9" width="4.5" height="18" rx="1.5" fill="#6fe3ff"/>
    <rect x="21.5" y="13" width="4.5" height="14" rx="1.5" fill="#6fe3ff" opacity=".8"/>
    <path d="M5 14 L12 7 L19 11 L27 4" fill="none" stroke="#ffd36b" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  relics: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <path d="M16 2 L24 12 L16 30 L8 12 Z" fill="#3a0f2c" stroke="#ff7ad9" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M8 12 H24 M16 2 L13 12 L16 30 L19 12 Z" fill="none" stroke="#ff7ad9" stroke-width="1.1" opacity=".75"/>
    <path d="M26 4 L27 6.5 L29.5 7.5 L27 8.5 L26 11 L25 8.5 L22.5 7.5 L25 6.5 Z" fill="#ffd3f1"/></svg>`,
};

// Bay grid scroll speed (px/s) and the stat readout's timing (seconds).
const GRID_RISE = 20, RO_IN = 1.1, RO_HOLD = 2.4, RO_OUT = 1.8, RO_GAP = 0.35;

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
    // run-history chart: hover or tap a bar to read that run
    const pick = e => { const r = e.target.closest('[data-run]'); if (r) this.showRun(+r.dataset.run); };
    $('#tabBody').addEventListener('pointerover', pick);
    $('#tabBody').addEventListener('pointerdown', pick);
    $('#btnLaunch').addEventListener('click', () => this.onLaunch());
    $('#btnLaunchTop').addEventListener('click', () => this.onLaunch());
    this.tour = new Tour(this);
    $('#preview').addEventListener('click', () => { if (!this.tour.active) this.tour.open(); });
    $('#massPrev').addEventListener('click', () => this.setMass(-1));
    $('#massNext').addEventListener('click', () => this.setMass(1));
    // tap a currency to learn what it is
    const info = $('#curInfo');
    const CUR = {
      s: ['⬡ Salvage', 'var(--gold)', 'Scrap and crystal you pull from wrecks, caches and the depth you reach.', 'Spend it on Upgrades: hull, drive, heat, weapons and systems.'],
      d: ['◈ Data', 'var(--violet)', 'Scans sent home over the Ansible: more for going deeper, and a bonus the first time you meet a new enemy.', 'Spend it on Research, which unlocks new systems and crew, or to sim-train your crew.'],
      k: ['✦ Core shards', 'var(--pink)', 'Pieces of a destroyed core. You get them by destroying a world\'s core. Each core only yields shards for its first ' + SHARD_CLEARS + ' kills.', 'Spend them on Relics: permanent bonuses for every run.'],
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
    if (S.runs > 0) tabs.push(['stats', 'Stats', null]);
    if (!tabs.some(t => t[0] === this.tab)) this.tab = 'ship';
    // on wide screens the ship bay is always visible, so "Ship" means upgrades
    const view = this.tab === 'ship' && !this.narrow.matches ? 'upgrades' : this.tab;
    $('#tabs').innerHTML = tabs.map(([id, name, p]) =>
      `<button class="${view === id ? 'on' : ''}" data-tab="${id}" aria-label="${name}">${ICONS[id]}<small>${name}</small>${p && newIn(p) ? '<i class="dot"></i>' : ''}</button>`).join('');
    $('.hgrid').classList.toggle('v-ship', view === 'ship');
    $('#hangar').classList.toggle('v-ship', view === 'ship');
    if (view === 'ship') { $('#tabBody').innerHTML = ''; return; }

    this.afterRender = null;
    const body = { upgrades: () => this.upgrades(), research: () => this.research(), crew: () => this.crew(), relics: () => this.relics(), stats: () => this.stats() }[view]();
    $('#tabBody').innerHTML = body;
    if (this.afterRender) this.afterRender();
  }

  pips(l, max) {
    // one consistent level bar for every upgrade, whatever its max level
    return `<div class="lvbar"><i style="width:${Math.min(100, l / max * 100)}%"></i></div>`;
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
    let html = `<section class="group"><h3>AI crew · skills persist over the Ansible link</h3>
      <p class="note">Crew earn XP free on every run. <b>Sim-train</b> gives the same XP instantly, paid in Data instead. Data also buys research, so train when you have Data to spare or an AI is falling behind. Tap a portrait to visit their station and hear what they think you should upgrade.</p>
      <div class="items">`;
    for (const id of crewUnlocked(S)) {
      const c = S.crew[id], d = CREW[id];
      const need = crewXpNeed(c.lvl), maxed = c.lvl >= CREW_MAX, tc = trainCost(c), ok = !maxed && S.data >= tc;
      const nw = this.isNew('c:' + id);
      html += `<div class="item ${nw ? 'new' : ''}">${nw ? '<span class="new-b">NEW</span>' : ''}
        <div class="crew"><button class="avbtn" data-station="${id}" aria-label="Visit ${d.name}'s station">${this.avatar(id)}</button><div>
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
        ${this.pips(l, r.max)}
        <button class="buy ${ok ? 'ok' : ''}" data-relic="${r.id}" ${ok ? '' : 'disabled'}>${maxed ? 'MAXED' : `<span class="cost k">✦</span>${c}`}</button></div>`;
    }
    return html + '</div></section>';
  }

  // ---------------------------------------------------------- stats
  stats() {
    const S = this.S, st = S.stats || freshStats(), H = S.history || [];
    const bestAll = Math.max(0, ...Object.values(S.best));
    const cores = Object.values(S.cleared).reduce((a, b) => a + b, 0);
    const km = S.lifetime.depth >= 1000 ? `${(S.lifetime.depth / 1000).toFixed(1)} km` : `${fmt(S.lifetime.depth)} m`;
    const tile = (label, val) => `<div class="stile"><small>${label}</small><b>${val}</b></div>`;
    let html = `<section class="group"><h3>Career</h3><div class="stiles">
      ${tile('Runs', fmt(S.runs))}${tile('Deepest dive', `${fmt(bestAll)} m`)}${tile('Total fallen', km)}
      ${tile('Time falling', fmtTime(st.time))}${tile('Defenders destroyed', fmt(S.lifetime.kills))}${tile('Cores destroyed', fmt(cores))}
    </div></section>`;

    // depth of every recent run, oldest to newest
    if (H.length) {
      const W = 600, CH = 150, n = H.length, gap = n > 25 ? 2 : 4, bw = (W - gap * (n - 1)) / n;
      const top = Math.max(...H.map(r => r.d), bestAll) * 1.12 || 1;
      const y = d => CH - (d / top) * CH;
      const bars = H.map((r, i) => {
        const x = i * (bw + gap), h = Math.max(2, CH - y(r.d));
        return `<g data-run="${i}" class="rbar${r.v ? ' win' : ''}${i === n - 1 ? ' on' : ''}">
          <rect x="${x - gap / 2}" y="0" width="${bw + gap}" height="${CH}" fill="transparent"/>
          <path d="M${x} ${CH} V${CH - h + Math.min(4, bw / 2)} Q${x} ${CH - h} ${x + Math.min(4, bw / 2)} ${CH - h} H${x + bw - Math.min(4, bw / 2)} Q${x + bw} ${CH - h} ${x + bw} ${CH - h + Math.min(4, bw / 2)} V${CH} Z"/>
</g>`;
      }).join('');
      const by = y(bestAll);
      html += `<section class="group"><h3>Recent descents</h3><div class="chart">
        <svg viewBox="0 -14 ${W} ${CH + 16}" preserveAspectRatio="none" role="img" aria-label="Depth reached on each of the last ${n} runs">
          <line x1="0" x2="${W}" y1="${CH}" y2="${CH}" class="base"/>
          <line x1="0" x2="${W}" y1="${by}" y2="${by}" class="bestline"/>
          ${bars}
        </svg>
        <div class="chart-legend"><span>Oldest run</span><span>Latest</span></div>
        <div class="chart-keys"><span class="bestkey">Best ${fmt(bestAll)} m</span>${H.some(r => r.v) ? '<span class="winkey">Core destroyed</span>' : ''}<span class="tapkey">Tap a bar for details</span></div>
        <div class="chart-tip" id="runTip"></div>
      </div></section>`;
    }

    // what ended each run
    const deaths = Object.entries(st.deaths).sort((a, b) => b[1] - a[1]);
    const dTot = deaths.reduce((a, [, v]) => a + v, 0);
    if (dTot) html += `<section class="group"><h3>What ended your runs</h3>${this.bars(deaths.map(([k, v]) => [CAUSES[k] || k, v, `${v} · ${Math.round(v / dTot * 100)}%`]), 'red')}</section>`;

    // damage
    const dmg = Object.entries(st.dmg).sort((a, b) => b[1] - a[1]);
    html += `<section class="group"><h3>Damage</h3>
      ${dmg.length ? this.bars(dmg.map(([k, v]) => [CAUSES[k] || k, v, fmt(v)]), 'red') : ''}
      ${this.list([['Hull damage taken', fmt(st.hullTaken)], ['Absorbed by shields', fmt(st.shieldAbs)], ['Blocked by armor', fmt(st.armorBlocked)], ['Hull repaired', fmt(st.repaired)], ['Time overheating', fmtTime(st.overheatTime)], ['Wall scrapes', fmt(st.scrapes)]])}</section>`;

    // defenders
    const types = Object.keys(ENEMIES).filter(k => k !== 'heart' || S.contacts.heart);
    html += `<section class="group"><h3>Defenders</h3><div class="dtable">
      <div class="dh"><span>Contact</span><span>Seen</span><span>Destroyed</span></div>
      ${types.map(k => S.contacts[k] || st.enc[k]
        ? `<div><span>${ENEMIES[k].name}</span><b>${fmt(st.enc[k] || 0)}</b><b>${fmt(st.kill[k] || 0)}</b></div>`
        : `<div class="unk"><span>▒▒▒▒ Unknown contact</span><b>–</b><b>–</b></div>`).join('')}
    </div></section>`;

    html += `<section class="group"><h3>Weapons &amp; systems</h3>${this.list([
      ['Cannon shots fired', fmt(st.shots)], ['Barriers drilled through', fmt(st.kill.barrier || 0)], ['Stasis fields collapsed', fmt(st.kill.stasis || 0)],
      ['Time slowed by stasis', fmtTime(st.stasisTime)], ['Missile volleys', fmt(st.missiles)], ['Lance shots', fmt(st.lances)],
      ['EMP bursts', fmt(st.emps)], ['Overdrives', fmt(st.ods)]])}</section>`;
    html += `<section class="group"><h3>Boarding</h3>${this.list([
      ['Breacher pods latched on', fmt(st.pods)], ['Intruders aboard', fmt(st.boarded)], ['Intruders repelled', fmt(st.repelled)], ['Security bots lost', fmt(st.botsLost)]])}</section>`;
    html += `<section class="group"><h3>Salvage &amp; pickups</h3>${this.list([
      ['Salvage recovered', `⬡ ${fmt(S.lifetime.salvage)}`], ['Data transmitted', `◈ ${fmt(st.data)}`], ['Salvage pieces collected', fmt(st.caches)],
      ['Coolant cells', fmt(st.coolant)], ['Repair kits', fmt(st.kits)]])}</section>`;
    if (st.since > 0) html += `<p class="fine">Detailed stats began with run ${st.since + 1}. Earlier runs count toward the career totals only.</p>`;
    this.afterRender = () => H.length && this.showRun(H.length - 1);
    return html;
  }

  bars(rows, tone) {
    const max = Math.max(...rows.map(r => r[1])) || 1;
    return `<div class="hbars ${tone}">${rows.map(([label, v, txt]) =>
      `<div class="hb"><span>${label}</span><div class="tr"><i style="width:${Math.max(1.5, v / max * 100)}%"></i></div><b>${txt}</b></div>`).join('')}</div>`;
  }

  list(rows) {
    return `<div class="slist">${rows.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('')}</div>`;
  }

  showRun(i) {
    const r = (this.S.history || [])[i], tip = $('#runTip'); if (!r || !tip) return;
    document.querySelectorAll('.rbar').forEach((g, j) => g.classList.toggle('on', j === i));
    const end = r.v ? '★ Core destroyed' : `Lost to ${(CAUSES[r.k] || r.k || 'unknown').toLowerCase()}`;
    tip.innerHTML = `<b>Run ${r.n}</b> · ${MASSES[r.m].name} · <b>${fmt(r.d)} m</b> · ${end} · ${fmtTime(r.t)} · ${r.x} kills · ⬡ ${fmt(r.s)}`;
  }

  click(e) {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.station) { this.tour.open(b.dataset.station); return; }
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
    if (this.tour.active) { this.tour.tick(dt); return; }
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
    const off = (this.t * GRID_RISE) % 24;
    for (let y = -off; y < h; y += 24) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    for (let x = 0; x < w; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    const cg = ctx.createRadialGradient(w / 2, h * 1.1, 10, w / 2, h * 1.1, h);
    cg.addColorStop(0, m.pal.fog + '0.45)'); cg.addColorStop(1, m.pal.fog + '0)');
    ctx.fillStyle = cg; ctx.fillRect(0, 0, w, h);
    // docking clamps
    ctx.strokeStyle = 'rgba(140,160,190,0.35)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(w * 0.1, h * 0.46); ctx.lineTo(w * 0.28, h * 0.46); ctx.moveTo(w * 0.9, h * 0.46); ctx.lineTo(w * 0.72, h * 0.46); ctx.stroke();

    const R = Math.min(w, h) * 0.2, x = w / 2, y = h * 0.44 + Math.sin(this.t * 1.3) * 4;
    const sR = R / 70; // drawVessel draws in hull-radius terms; scale line widths via transform
    ctx.save(); ctx.translate(x, y); ctx.scale(sR, sR);
    r.drawVessel(ctx, 0, 0, 70, this.vesselOpts(this.t));
    for (let i = 0, n = st.wingmen; i < n; i++) {
      // same per-wingman speed and distance as run.js, so they drift independently
      const a = this.t * (0.8 + 0.6 * i / Math.max(1, n - 1)) + (i / n) * TAU;
      const rr = 1 + (16 * (i % 3) - 8) / 128;
      const wx = Math.cos(a) * 128 * rr, wy = Math.sin(a) * 110 * rr;
      ctx.fillStyle = '#12202a'; ctx.strokeStyle = '#7dffcf'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(wx, wy, 8, 0, TAU); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
    this.drawReadout(ctx, w, h, dt);
  }

  // Preview ship pose. `still` drops the sway so the tour can zoom precisely.
  vesselOpts(t, still) {
    const S = this.S, st = computeStats(S), m = MASSES[S.mass];
    const n = st.turrets;
    const turrets = Array.from({ length: n }, (_, i) => {
      const a = n === 1 ? Math.PI / 2 : (i / n) * TAU - Math.PI / 2 + t * 0.15;
      return { a, aim: a + Math.sin(t + i) * 0.4, recoil: 0 };
    });
    const bots = Array.from({ length: st.bots }, (_, i) => {
      const a = t * 0.8 + i * 2.1;
      return { x: Math.cos(a) * 0.14, y: Math.sin(a) * 0.14, hp: 1, hit: 0 };
    });
    return {
      t, spin: t, vx: still ? 0 : Math.sin(t * 0.7) * 120, vy: 200, ramming: false, hullK: 1,
      shieldK: st.shieldMax ? 1 : 0, shieldT: 0, hit: 0, turrets, rooms: ROOMS.map(q => ({ ...q, sab: 0 })),
      boarders: [], bots, crew: crewUnlocked(S), od: false, heat: 0, accent: m.pal.accent, pods: [], shieldOn: st.shieldMax > 0,
    };
  }

  // One stat at a time fades in beside the ship, then out, in a new random spot.
  drawReadout(ctx, w, h, dt) {
    const list = this.readStats; if (!list || !list.length) return;
    let ro = this.ro;
    if (!ro || ro.t >= ro.life) {
      let i; do { i = (Math.random() * list.length) | 0; } while (list.length > 1 && ro && list[i][0] === ro.label);
      const left = ro ? !ro.left : Math.random() < 0.5;
      ro = this.ro = {
        label: list[i][0], value: list[i][1], left, t: 0, life: RO_IN + RO_HOLD + RO_OUT + RO_GAP,
        x: left ? w * (0.04 + Math.random() * 0.05) : w * (0.96 - Math.random() * 0.05),
        y: h * (0.12 + Math.random() * 0.74),
      };
    }
    ro.t += dt;
    // fade in, hold steady, then fade out while drifting up with the bay grid
    const out = Math.max(0, ro.t - RO_IN - RO_HOLD);
    const k = Math.min(1, ro.t / RO_IN), fadeIn = k * k * (3 - 2 * k); // eased, starts from nothing
    const a = Math.max(0, Math.min(fadeIn, 1 - out / RO_OUT));
    if (a <= 0) return;
    const y = ro.y - Math.min(out, RO_OUT) * GRID_RISE;
    // Fade is baked into each colour: iPhone WebKit doesn't reliably apply
    // globalAlpha to text drawn with a shadow glow.
    const c = (rgb, al) => `rgba(${rgb},${(al * a).toFixed(3)})`;
    ctx.save();
    ctx.textAlign = ro.left ? 'left' : 'right';
    ctx.shadowColor = c('111,227,255', 0.8); ctx.shadowBlur = 8 * a;
    ctx.fillStyle = c('111,227,255', 0.75);
    ctx.font = '600 10px "Chakra Petch", sans-serif';
    ctx.fillText(ro.label.toUpperCase().split('').join(String.fromCharCode(8202)), ro.x, y);
    ctx.fillStyle = c('180,243,255', 1);
    ctx.font = '700 17px "Chakra Petch", sans-serif';
    ctx.fillText(ro.value, ro.x, y + 19);
    // a short bracket tick toward the ship
    ctx.shadowBlur = 0; ctx.strokeStyle = c('111,227,255', 0.5); ctx.lineWidth = 1;
    const bx = ro.left ? ro.x - 3 : ro.x + 3;
    ctx.beginPath(); ctx.moveTo(bx, y - 9); ctx.lineTo(bx, y + 23); ctx.stroke();
    ctx.restore();
  }
}
