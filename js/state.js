// Persistent save state plus derived stats for a run.
import { MASSES, UPGRADES, RESEARCH, RELICS, CREW, CREW_MAX, crewXpNeed, upgradeCost } from './data.js';

const KEY = 'spelunker.save.v1';

export function freshState() {
  return {
    v: 1,
    salvage: 0, data: 0, shards: 0,
    up: {}, research: {}, relics: {},
    crew: { gunner: { lvl: 1, xp: 0 } },
    mass: 0, massUnlocked: 0, cleared: {},
    best: {},             // mass index -> best depth in metres
    runs: 0,
    seen: {},             // ids the player has already been shown (for NEW badges)
    contacts: {},         // enemy types encountered (first contact pays Data)
    lifetime: { salvage: 0, kills: 0, depth: 0, boarders: 0 },
    sound: true,
    tutorial: true,
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshState();
    const s = Object.assign(freshState(), JSON.parse(raw));
    return s;
  } catch (e) {
    return freshState();
  }
}

export function save(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage blocked: play on */ }
}

export function wipe() {
  try { localStorage.removeItem(KEY); } catch (e) {}
  return freshState();
}

export const lvl = (s, id) => s.up[id] || 0;
export const has = (s, id) => !!s.research[id];
export const relic = (s, id) => s.relics[id] || 0;

// Summary values used by the `show` reveal rules in data.js.
export function summary(s) {
  let bestAll = 0;
  for (const k in s.best) bestAll = Math.max(bestAll, s.best[k]);
  // Clearing a mass counts as having gone very deep for reveal purposes.
  const massesCleared = Object.keys(s.cleared).length;
  if (massesCleared) bestAll = Math.max(bestAll, 99999);
  return { bestAll, runs: s.runs, massesCleared };
}

export function researchAvailable(s, r) {
  return (r.req || []).every(id => has(s, id));
}

export function visibleUpgrades(s) {
  const sm = summary(s);
  return UPGRADES.filter(u => u.show(sm) && (u.req || []).every(id => has(s, id)));
}

export function visibleResearch(s) {
  const sm = summary(s);
  return RESEARCH.filter(r => r.show(sm) || has(s, r.id));
}

// The next hidden research gets a teaser line so the player knows more exists.
export function nextTeaser(s) {
  const sm = summary(s);
  const hidden = RESEARCH.filter(r => !r.show(sm) && !has(s, r.id));
  return hidden.length ? hidden[0] : null;
}

export function crewUnlocked(s) {
  const out = ['gunner'];
  if (has(s, 'c_pilot')) out.push('pilot');
  if (has(s, 'c_sec')) out.push('security');
  if (has(s, 'c_shield')) out.push('shieldt');
  if (has(s, 'c_repair')) out.push('repair');
  for (const id of out) if (!s.crew[id]) s.crew[id] = { lvl: 1, xp: 0 };
  return out;
}

export function crewLvl(s, id) {
  return crewUnlocked(s).includes(id) ? s.crew[id].lvl : 0;
}

export function addCrewXp(s, id, xp) {
  const c = s.crew[id];
  if (!c) return 0;
  let ups = 0;
  c.xp += xp;
  while (c.lvl < CREW_MAX && c.xp >= crewXpNeed(c.lvl)) {
    c.xp -= crewXpNeed(c.lvl);
    c.lvl++; ups++;
  }
  if (c.lvl >= CREW_MAX) c.xp = 0;
  return ups;
}

export const trainCost = (c) => Math.round(8 * Math.pow(1.3, c.lvl - 1));

export function buyUpgrade(s, u) {
  const l = lvl(s, u.id);
  if (l >= u.max) return false;
  const c = upgradeCost(u, l);
  if (s.salvage < c) return false;
  s.salvage -= c;
  s.up[u.id] = l + 1;
  return true;
}

export function buyResearch(s, r) {
  if (has(s, r.id) || s.data < r.cost || !researchAvailable(s, r)) return false;
  s.data -= r.cost;
  s.research[r.id] = true;
  crewUnlocked(s);
  return true;
}

export function buyRelic(s, r) {
  const l = relic(s, r.id);
  if (l >= r.max) return false;
  const c = r.cost(l);
  if (s.shards < c) return false;
  s.shards -= c;
  s.relics[r.id] = l + 1;
  return true;
}

// Everything the simulation needs, flattened into plain numbers.
export function computeStats(s) {
  const L = id => lvl(s, id);
  const C = id => crewLvl(s, id);
  const fort = has(s, 'fortress') ? 1.15 : 1;
  const ghost = 1 + 0.2 * relic(s, 'ghost');
  const cold = 1 + 0.2 * relic(s, 'coldcore');
  const wrath = (1 + 0.2 * relic(s, 'wrath')) * fort;
  const gun = Math.max(0, C('gunner') - 1), pil = Math.max(0, C('pilot') - 1);
  const shl = C('shieldt'), rep = C('repair'), sec = C('security');

  return {
    hullMax: (100 + 35 * L('hull')) * ghost * fort,
    armor: Math.min(0.6, 0.04 * L('armor')),
    impact: Math.max(0.2, (1 - 0.08 * L('impact')) * (1 - 0.06 * pil)),
    regen: 0.8 * L('nanite') * (has(s, 'nanites') ? 1 : 0) + 0.35 * rep,
    shieldMax: has(s, 'shield') ? (40 + 25 * L('shcap')) * (1 + 0.04 * shl) * ghost * fort : 0,
    shieldRegen: (5 + 1.5 * L('shreg')) * (1 + 0.08 * shl) * fort,
    heatMax: (100 + 30 * L('sinks')) * cold * fort,
    cooling: (2 + 0.6 * L('coolant')) * cold * fort,
    speed: (22 + 2.5 * L('drive')) * fort,         // m/s
    steer: 520 * (1 + 0.08 * L('thrust')) * (1 + 0.07 * pil) * fort,
    assist: 0.9 + 0.35 * pil + (C('pilot') ? 0.6 : 0),
    turrets: 1 + L('hardpt'),
    gunDmg: (8 + 3 * L('caliber')) * (1 + 0.04 * gun) * wrath,
    fireRate: 2.6 * (1 + 0.1 * L('loader')) * (1 + 0.06 * gun) * fort,
    gunRange: 620,
    ram: 40 * (1 + 0.4 * L('drill')) * wrath,
    phase: has(s, 'phase') ? 3 : 1,
    missiles: has(s, 'missiles') ? 1 + L('missile') : 0,
    missileDmg: 34 * (1 + 0.1 * L('missile')) * wrath,
    lance: has(s, 'lance') ? 1 : 0,
    twinLance: has(s, 'twinlance'),
    lanceDmg: 90 * (1 + 0.25 * L('lancepow')) * wrath,
    lanceCd: Math.max(2.5, 6 - 0.2 * L('lancepow')),
    wingmen: has(s, 'drones') ? 1 + L('wing') : 0,
    wingDmg: (6 + 1.5 * L('caliber')) * wrath,
    bots: has(s, 'security') ? 2 + L('bots') : 0,
    botPow: (1 + 0.2 * L('botarm')) * (1 + 0.1 * sec) * fort,
    emp: has(s, 'emp'),
    empCd: 24 - 2 * L('empup'),
    empRadius: 520 + 40 * L('empup'),
    overdrive: has(s, 'overdrive'),
    odDur: 3 + 0.5 * L('odup'),
    magnet: (160 + 40 * L('magnet')) * (has(s, 'salvai') ? 1.5 : 1),
    salvageMul: (1 + 0.1 * L('scrap')) * (has(s, 'salvai') ? 1.2 : 1) * (1 + 0.4 * relic(s, 'hoard')),
    dataMul: (has(s, 'ansible') ? 1.3 : 1) * (1 + 0.4 * relic(s, 'echo')),
    xpMul: has(s, 'ansible') ? 1.25 : 1,
    startFrac: 0.08 * relic(s, 'insert'),
  };
}

export function massInfo(i) { return MASSES[Math.min(i, MASSES.length - 1)]; }
export { CREW, RESEARCH, UPGRADES, RELICS, MASSES };
