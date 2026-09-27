// Boot, game loop, screen flow, HUD.
import { M, MASSES, ENEMIES, CREW, CAUSES, upgradeCost, shardPay } from './data.js';
import { load, save, wipe, computeStats, crewUnlocked, addCrewXp, visibleUpgrades, visibleResearch, recordRun } from './state.js';
import { Run } from './run.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { Hangar } from './hangar.js';
import { initAudio, sfx, setSound } from './audio.js';

const $ = s => document.querySelector(s);
const fmt = n => Math.floor(n).toLocaleString('en-US');

let S = load();
crewUnlocked(S);
S.tips = S.tips || {};
setSound(S.sound);

const R = new Renderer($('#game'));
const I = new Input($('#game'));
I.bindHold($('#bBrake'), 'brake');
I.bindHold($('#bDive'), 'dive');
$('#bEmp').addEventListener('pointerdown', e => { e.preventDefault(); I.edge.emp = true; });
$('#bOd').addEventListener('pointerdown', e => { e.preventDefault(); I.edge.od = true; });
addEventListener('resize', () => R.resize());

const hangar = new Hangar(S, { onLaunch: launch });

let mode = 'title', run = null, attract = null, paused = false, best = 0, recDone = false, acc = 0;

// ---------------------------------------------------------------- screens
function show(id) {
  for (const s of ['title', 'hangar', 'results', 'pause']) $('#' + s).hidden = s !== id;
  $('#hud').hidden = !(mode === 'run');
  document.body.classList.toggle('in-run', mode === 'run');
}

function toTitle() {
  mode = 'title';
  newAttract();
  $('#btnBegin').textContent = S.runs ? 'Continue' : 'Begin descent';
  show('title');
}

function toHangar() {
  mode = 'hangar';
  run = null;
  hangar.setS(S);
  hangar.render();
  show('hangar');
  $('#hangar').scrollTop = 0;
}

function newAttract() {
  const st = Object.assign(computeStats(S), { hullMax: 1e9, turrets: 3, gunDmg: 30, fireRate: 4, startFrac: 0.18, missiles: 1, shieldMax: 200 });
  const known = {}; for (const k in ENEMIES) known[k] = true;
  attract = new Run(st, S.mass, known);
  attract.crewList = ['gunner', 'pilot'];
}

$('#btnBegin').addEventListener('click', () => { initAudio(); toHangar(); });
$('#btnSound').addEventListener('click', () => {
  S.sound = !S.sound; setSound(S.sound); save(S);
  $('#btnSound').classList.toggle('off', !S.sound);
});
$('#btnSound').classList.toggle('off', !S.sound);
$('#btnReset').addEventListener('click', () => {
  if (!confirm('Erase all progress and start over?')) return;
  S = wipe(); S.tips = {}; crewUnlocked(S); hangar.setS(S); toTitle();
});
$('#btnResume').addEventListener('click', () => setPause(false));
$('#btnAbort').addEventListener('click', () => { setPause(false); if (run) { run.over = true; } });
$('#bPause').addEventListener('click', () => setPause(!paused));
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'run') setPause(true); });

function setPause(v) {
  if (mode !== 'run') return;
  paused = v;
  $('#pause').hidden = !v;
}

// ---------------------------------------------------------------- run
function launch() {
  initAudio();
  hangar.markSeen();
  save(S);
  const st = computeStats(S);
  run = new Run(st, S.mass, S.contacts);
  run.crewList = crewUnlocked(S);
  best = S.best[S.mass] || 0;
  recDone = false; paused = false; acc = 0;
  R.parts = [];
  mode = 'run';
  show(null);
  $('#hMass').textContent = MASSES[S.mass].name;
  $('#hCore').textContent = fmt(MASSES[S.mass].core);
  $('#rowShield').hidden = !st.shieldMax;
  $('#bEmp').hidden = !st.emp;
  $('#bOd').hidden = !st.overdrive;
  $('#toasts').innerHTML = '';
  $('#contact').hidden = true; contactQ = []; contactT = 0;
  $('#tip').hidden = true;
  document.documentElement.style.setProperty('--mass', MASSES[S.mass].pal.accent);
  sfx('launch');
  if (!S.tips.steer) tip('Drag anywhere (or A / D) to steer. Hold BRAKE to fight longer, DIVE to fall faster. Your guns fire on their own.', 7);
  else if (S.runs === 1) tip('Each run earns Salvage and Data. Spend them in the hangar, then get a bit deeper.', 5);
}

let tipT = 0;
function tip(text, secs) {
  $('#tip').textContent = text; $('#tip').hidden = false; tipT = secs;
}

function toast(text, tone = '') {
  const box = $('#toasts');
  while (box.children.length > 2) box.firstChild.remove();
  const d = document.createElement('div');
  d.className = 'toast ' + tone; d.textContent = text;
  box.appendChild(d);
  setTimeout(() => d.remove(), 2300);
}

let contactQ = [], contactT = 0;
function showContact(type) {
  const e = ENEMIES[type];
  const el = $('#contact');
  el.innerHTML = `<small>NEW CONTACT</small><b>${e.name}</b><p>${e.tip}</p><div class="bonus">+ Data bonus for first scan</div>`;
  el.hidden = false; contactT = 5.5;
  sfx('contact');
}

const SOUND = {
  shoot: 'shoot', coin: 'coin', hullhit: 'hit', deflect: 'deflect', missile: 'missile', lance: 'lance', zap: 'zap',
  charge: 'charge', clang: 'clang', board: 'alarm', emp: 'emp', od: 'od', powerup: 'good', death: 'bigboom',
  victory: 'win', barrierbreak: 'bigboom', kill_in: 'good', scrape: 'hit',
};

function handleEvents(r, live) {
  for (const ev of r.events) {
    R.handle(ev, r);
    if (!live) continue;
    if (ev.k === 'boom') sfx(ev.r > 40 ? 'bigboom' : 'boom');
    else if (SOUND[ev.k]) sfx(SOUND[ev.k]);
    if (ev.k === 'toast') toast(ev.text, ev.tone);
    if (ev.k === 'contact') { contactQ.push(ev.type); }
    if (ev.k === 'board' && !r.st.bots && !S.tips.board) { S.tips.board = true; tip('No security bots aboard! Intruders will wreck systems. Research the Security Bay.', 7); }
  }
  r.events.length = 0;
}

// ---------------------------------------------------------------- HUD
const hud = {
  depth: $('#hDepth'), salv: $('#hSalv'), kills: $('#hKills'), hull: $('#bHull'), shield: $('#bShield'), heat: $('#bHeat'),
  gMe: $('#gMe'), gBest: $('#gBest'), alert: $('#alert'), alertN: $('#alertN'), emp: $('#bEmp'), od: $('#bOd'),
};
function updateHud(dt) {
  const r = run, p = r.p, st = r.st;
  hud.depth.textContent = fmt(p.y / M);
  hud.salv.textContent = fmt(r.salvage);
  hud.kills.textContent = r.kills;
  hud.hull.style.transform = `scaleX(${Math.max(0, p.hull / st.hullMax)})`;
  hud.hull.parentNode.parentNode.classList.toggle('low', p.hull / st.hullMax < 0.3);
  if (st.shieldMax) hud.shield.style.transform = `scaleX(${p.shield / st.shieldMax})`;
  hud.heat.style.transform = `scaleX(${p.heat / st.heatMax})`;
  hud.heat.parentNode.parentNode.classList.toggle('hot', p.heat / st.heatMax > 0.85);
  hud.gMe.style.top = Math.min(100, p.y / r.coreY * 100) + '%';
  hud.gBest.style.top = Math.min(100, best * M / r.coreY * 100) + '%';
  hud.gBest.hidden = !best;
  hud.alert.hidden = !r.boarders.length;
  hud.alertN.textContent = r.boarders.length;
  if (st.emp) { hud.emp.querySelector('.cd').style.height = Math.max(0, r.empCd / st.empCd * 100) + '%'; hud.emp.classList.toggle('ready', r.empCd <= 0); }
  if (st.overdrive) { hud.od.querySelector('.cd').style.height = Math.max(0, r.odCd / 30 * 100) + '%'; hud.od.classList.toggle('ready', r.odCd <= 0); }

  if (!recDone && best > 0 && p.y / M > best) { recDone = true; toast('NEW RECORD', 'rec'); sfx('record'); }
  if (!S.tips.heat && p.heat / st.heatMax > 0.5) { S.tips.heat = true; tip('Heat builds the deeper you go. At max heat the hull cooks. Upgrade heat sinks and coolant.', 6); }
  if (tipT > 0) { tipT -= dt; if (tipT <= 0) $('#tip').hidden = true; }
  if (contactT > 0) { contactT -= dt; if (contactT <= 0) $('#contact').hidden = true; }
  else if (contactQ.length) showContact(contactQ.shift());
}

// ---------------------------------------------------------------- end of run
function snapshot() {
  const out = {};
  for (const u of visibleUpgrades(S)) out['u:' + u.id] = {
    name: u.name, kind: 'Upgrade',
    body: `${u.desc} per level. Starts at ${u.fmt(0)}.`,
    cost: `<span style="color:var(--gold)">⬡ ${fmt(upgradeCost(u, 0))}</span> for level 1 · up to level ${u.max}`,
  };
  for (const r of visibleResearch(S)) out['r:' + r.id] = {
    name: r.name, kind: 'Research',
    body: r.desc,
    cost: `<span style="color:var(--violet)">◈ ${fmt(r.cost)}</span> Data${r.req ? ' · needs earlier research first' : ''}`,
  };
  return out;
}

function endRun() {
  const res = run.result();
  const m = S.mass, mass = MASSES[m];
  const before = snapshot();
  const prevBest = S.best[m] || 0;
  S.runs++;
  S.worldRuns[m] = (S.worldRuns[m] || 0) + 1;
  S.tips.steer = true;
  S.salvage += res.salvage; S.data += res.data;
  S.lifetime.salvage += res.salvage; S.lifetime.kills += res.kills; S.lifetime.depth += res.depth; S.lifetime.boarders += res.repelled;
  recordRun(S, res);
  if (res.depth > prevBest) S.best[m] = res.depth;
  for (const t of res.newContacts) S.contacts[t] = true;
  const crewLines = [];
  for (const id of crewUnlocked(S)) {
    const xp = res.crewXp[id] || 0;
    if (!xp) continue;
    const ups = addCrewXp(S, id, xp);
    crewLines.push(`<div><b style="color:${CREW[id].color}">${CREW[id].name}</b> +${xp} XP${ups ? ` <span class="up">▲ level ${S.crew[id].lvl}</span>` : ''}</div>`);
  }
  let unlockedMass = null, shards = 0, pay = 0;
  if (res.victory) {
    S.cleared[m] = (S.cleared[m] || 0) + 1;
    // A core pays less after its first few kills (the last world always pays
    // in full), so farming an old world is slow but never worthless.
    pay = shardPay(m, S.cleared[m]);
    const dust = (S.shardDust || 0) + pay + 1e-9;
    shards = Math.floor(dust); S.shardDust = dust - shards; S.shards += shards;
    if (m === S.massUnlocked && m < MASSES.length - 1) { S.massUnlocked++; unlockedMass = MASSES[m + 1]; }
  }
  const after = snapshot();
  const revealed = Object.keys(after).filter(k => !before[k]).map(k => after[k]);
  save(S);

  const rec = res.depth > prevBest && prevBest > 0;
  $('#resCard').innerHTML = `
    <div class="res-head ${res.victory ? 'win' : ''}">
      <div class="kicker">${res.victory ? 'Core destroyed' : 'Signal lost'} · ${mass.name}</div>
      <div class="res-depth">${fmt(res.depth)}<span> m</span></div>
      ${res.victory ? `<div class="rec">${mass.name} HAS FALLEN</div>` : rec ? `<div class="rec">NEW RECORD · +${fmt(res.depth - prevBest)} m</div>` : prevBest ? `<div class="fine">Best: ${fmt(Math.max(prevBest, res.depth))} m · ${Math.round(res.depth / mass.core * 100)}% of the way to the core</div>` : ''}
    </div>
    <div class="res-rows">
      <div class="res-row"><span>Salvage recovered</span><b style="color:var(--gold)">⬡ ${fmt(res.salvage)}</b></div>
      <div class="res-row"><span>Data transmitted</span><b style="color:var(--violet)">◈ ${fmt(res.data)}</b></div>
      ${pay ? `<div class="res-row"><span>Core shards</span><b style="color:var(--pink)">✦ ${shards}${pay % 1 ? ` <small>(${Math.round(S.shardDust * 100)}% to next)</small>` : ''}</b></div>` : ''}
      ${res.killer ? `<div class="res-row"><span>Cause of loss</span><b>${CAUSES[res.killer] || res.killer}</b></div>` : ''}
      <div class="res-row"><span>Defenders destroyed</span><b>${res.kills}</b></div>
      ${res.boarded ? `<div class="res-row"><span>Boarders repelled</span><b>${res.repelled} / ${res.boarded}</b></div>` : ''}
    </div>
    ${crewLines.length ? `<div class="res-sec">Crew uplink (skills saved)</div><div class="res-crew">${crewLines.join('')}</div>` : ''}
    ${unlockedMass ? `<div class="res-sec">New target</div><div class="reveal"><div class="target"><b>${unlockedMass.name}</b> · ${unlockedMass.kind}. Relics are now online.</div></div>` : ''}
    ${revealed.length ? `<div class="res-sec">Newly revealed</div><div class="reveal">${revealed.map(n => `<details><summary><b>${n.name}</b><small>${n.kind}</small></summary><p>${n.body}</p><p class="rcost">${n.cost}</p></details>`).join('')}</div><p class="fine">Tap one to see what it does.</p>` : ''}
    <div class="res-actions"><button id="btnHangar" class="btn primary big">Return to hangar</button></div>`;
  mode = 'results';
  show('results');
  $('#btnHangar').addEventListener('click', toHangar);
  $('#btnHangar').focus();
}

// ---------------------------------------------------------------- loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  // iOS can change the viewport (toolbars, tab switches) without a resize event;
  // re-sync so the canvas is never stretched.
  const cv = R.cv;
  if (cv.clientWidth && (Math.abs(cv.clientWidth - R.w) > 1 || Math.abs(cv.clientHeight - R.h) > 1)) R.resize();
  if (I.edge.pause) { I.edge.pause = false; if (mode === 'run') setPause(!paused); }
  if (mode === 'run') {
    if (!paused) {
      const inp = I.frame(R);
      acc += dt;
      let first = true;
      while (acc >= 1 / 60) {
        run.step(1 / 60, first ? inp : Object.assign({}, inp, { emp: false, od: false }));
        first = false; acc -= 1 / 60;
      }
      handleEvents(run, true);
      R.draw(run, dt, best);
      updateHud(dt);
      if (run.over) endRun();
    }
  } else if (mode === 'title') {
    attract.step(dt, {});
    handleEvents(attract, false);
    if (attract.over || attract.p.y > attract.coreY - 2400) newAttract();
    R.draw(attract, dt, 0);
  } else if (mode === 'results') {
    R.draw(run, dt, best);
  } else if (mode === 'hangar') {
    hangar.tick(dt);
  }
  requestAnimationFrame(frame);
}

toTitle();
requestAnimationFrame(frame);
