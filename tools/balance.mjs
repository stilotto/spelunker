// Headless balance sim: an autopilot plays the whole campaign from a fresh
// save and reports, per world, how the runs went.
//
//   node tools/balance.mjs                     # one campaign, current data.js
//   node tools/balance.mjs --trials 3          # several campaigns (~1 min each)
//   node tools/balance.mjs --mult 1,4,12,30,44 --heat 1,1.3,1.45,1.6,1.75 --core 30000,140000,175000,360000,300000
//   node tools/balance.mjs --save-at 4 --save oss.json   # stop when world 4 unlocks, save the state
//   node tools/balance.mjs --load oss.json               # carry on from that state
//
// The pilot only uses auto-centering and fires EMP on cooldown; it never
// dodges, so a human does better. It buys research first, then the
// cheapest upgrade, then the cheapest relic, and sim-trains crew with spare
// Data once all visible research is bought. Crew earn run XP as in the game.
//
// Output per world: crew levels when cleared, runs taken, depth fraction of
// the first 3 runs, the run that first got past 95%, how many runs reached
// the core (and its HP left on each failed one), the best fraction, and
// what killed the ship on runs that died past 95%.
import fs from 'fs';

const js = new URL('../js/', import.meta.url);
const { MASSES, UPGRADES, RESEARCH, RELICS, CREW_MAX, upgradeCost, crewXpNeed } = await import(new URL('data.js', js));
const S = await import(new URL('state.js', js));
const { Run } = await import(new URL('run.js', js));

const arg = {};
for (let i = 2; i < process.argv.length; i += 2) arg[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const list = (k, field) => arg[k] && arg[k].split(',').forEach((v, i) => { MASSES[i][field] = +v; });
list('mult', 'mult'); list('heat', 'heat'); list('core', 'coreHp');
const cap = +(arg.cap || 600), trials = +(arg.trials || 1);

function play(s, m) {
  const r = new Run(S.computeStats(s), m, s.contacts);
  while (!r.over && r.t < 900) { r.step(1 / 30, { emp: true }); r.events.length = 0; }
  const res = r.result();
  if (r.heart) res.coreLeft = Math.max(0, r.heart.hp / r.heart.maxHp);
  return res;
}

function shop(s) {
  s.bestAll = Math.max(0, ...Object.values(s.best));
  s.massesCleared = Object.keys(s.cleared).length;
  const cost = u => upgradeCost(u, S.lvl(s, u.id));
  for (let bought = true; bought;) {
    bought = false;
    for (const r of RESEARCH) if (r.show(s) && S.buyResearch(s, r)) bought = true;
    const ups = UPGRADES.filter(u => u.show(s) && (!u.req || u.req.every(q => S.has(s, q))) &&
      S.lvl(s, u.id) < u.max && u.id !== 'magnet' && u.id !== 'scrap');
    ups.sort((a, b) => cost(a) - cost(b));
    if (ups[0] && S.buyUpgrade(s, ups[0])) bought = true;
    const rel = RELICS.slice().sort((a, b) => a.cost(S.relic(s, a.id)) - b.cost(S.relic(s, b.id)));
    if (rel.some(r => S.buyRelic(s, r))) bought = true;
    if (RESEARCH.every(r => S.has(s, r.id) || !r.show(s))) {
      for (const id of S.crewUnlocked(s)) {
        const c = s.crew[id], tc = S.trainCost(c);
        if (c.lvl < CREW_MAX && s.data >= tc) { s.data -= tc; S.addCrewXp(s, id, Math.ceil(crewXpNeed(c.lvl) * 0.35)); bought = true; }
      }
    }
  }
}

function campaign() {
  const s = arg.load ? JSON.parse(fs.readFileSync(arg.load)) : S.freshState();
  const log = {};
  for (let n = 0; n < cap; n++) {
    const m = s.massUnlocked;
    if (arg['save-at'] && m === +arg['save-at']) { fs.writeFileSync(arg.save, JSON.stringify(s)); break; }
    if (m >= MASSES.length || (arg['stop-at'] && m === +arg['stop-at'])) break;
    const res = play(s, m);
    s.runs++; s.salvage += res.salvage; s.data += res.data;
    for (const id in res.crewXp || {}) S.addCrewXp(s, id, res.crewXp[id]);
    s.best[m] = Math.max(s.best[m] || 0, res.depth);
    for (const k of res.newContacts || []) s.contacts[k] = true;
    const L = log[m] ||= { runs: 0, first: [], best: 0, deep: {} };
    const f = res.depth / MASSES[m].core;
    L.runs++;
    if (L.first.length < 3) L.first.push(f.toFixed(2));
    L.best = Math.max(L.best, f);
    if (res.coreLeft !== undefined) { L.enc = (L.enc || 0) + 1; if (!res.victory) (L.left ||= []).push(Math.round(res.coreLeft * 100)); }
    if (f > 0.95) { L.reach ||= L.runs; if (res.killer) L.deep[res.killer] = (L.deep[res.killer] || 0) + 1; }
    if (res.victory) {
      s.cleared[m] = 1; s.shards += m + 1; s.massUnlocked++;
      L.cleared = true; L.crew = Object.values(s.crew).map(c => c.lvl).join('/');
    }
    shop(s);
  }
  for (const m in log) {
    const L = log[m];
    console.log(MASSES[m].id.padEnd(8), `runs ${L.runs}`.padEnd(9), `first ${L.first.join(' ')}`.padEnd(21),
      `reach ${L.reach || '-'}`.padEnd(10), `core fights ${L.enc || 0}`.padEnd(15), `best ${L.best.toFixed(2)}`, L.cleared ? `CLEARED crew ${L.crew}` : '',
      L.left ? `core HP left ${L.left.join(',')}%` : '',
      Object.keys(L.deep).length ? `deep deaths ${JSON.stringify(L.deep)}` : '');
  }
}

for (let t = 0; t < trials; t++) {
  if (trials > 1) console.log(`-- trial ${t + 1}`);
  campaign();
}
