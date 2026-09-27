// Static game data: masses, enemies, upgrades, research, crew, relics.
// Everything that can be tuned lives here.

export const M = 10; // world units per metre

// ---------------------------------------------------------------- masses
// core = depth in metres. mult scales enemy health, damage and loot; heat
// scales heat build-up. coreHp is set per world, not from mult: the core
// fight is a race against heat, so it has to grow slower than the tunnel.
export const MASSES = [
  {
    id: 'cinder', name: 'CINDER', kind: 'Molten world',
    blurb: 'A dead forge-planet, hollowed into a weapon. Its lava tubes run straight to a burning heart.',
    core: 3000, mult: 1, heat: 1, coreHp: 9900,
    pal: {
      bg0: '#1a0703', bg1: '#060101', rock0: '#2b120b', rock1: '#140806', edge: '#ff6a1f', edge2: '#ffc15a',
      vein: '#ff4d1a', ember: '#ff9a3c', accent: '#ffb347', enemy: '#ff5040', enemy2: '#ffd070', fog: 'rgba(255,90,30,', core: '#ff7a2a',
    },
    style: 'lava',
  },
  {
    id: 'tet', name: 'THE TET', kind: 'Orbital megastructure',
    blurb: 'A silent tetrahedron the size of a moon. Its skin is white glass; its insides are perfect geometry.',
    core: 4500, mult: 4, heat: 1.3, coreHp: 49500,
    pal: {
      bg0: '#0c0e12', bg1: '#000000', rock0: '#d9dee6', rock1: '#7d8694', edge: '#ffffff', edge2: '#9fd8ff',
      vein: '#1a1d22', ember: '#cfe8ff', accent: '#9fd8ff', enemy: '#e8eef5', enemy2: '#ff3355', fog: 'rgba(160,210,255,', core: '#ffffff',
    },
    style: 'tet',
  },
  {
    id: 'veil', name: 'THE VEIL', kind: 'Living machine-cloud',
    blurb: 'A wandering intelligence wrapped in plasma. It has swallowed seven probes. You intend to be the eighth, and the last.',
    core: 6000, mult: 12, heat: 1.45, coreHp: 70000,
    pal: {
      bg0: '#0b0626', bg1: '#02010a', rock0: '#2a1760', rock1: '#110a30', edge: '#8a7bff', edge2: '#5ff0ff',
      vein: '#b06bff', ember: '#7fe9ff', accent: '#8fe8ff', enemy: '#c38bff', enemy2: '#5ff0ff', fog: 'rgba(140,110,255,', core: '#aef7ff',
    },
    style: 'veil',
  },
  {
    id: 'ossuary', name: 'OSSUARY', kind: 'Hive moon',
    blurb: 'Bone-white tunnels, grown not built. Something down there is still breathing.',
    core: 7500, mult: 30, heat: 1.6, coreHp: 90000,
    pal: {
      bg0: '#07140a', bg1: '#010402', rock0: '#23331c', rock1: '#0d160b', edge: '#9dff4a', edge2: '#e9f5c9',
      vein: '#5cff6a', ember: '#b6ff6a', accent: '#b6ff6a', enemy: '#d8ff5a', enemy2: '#ff5ab8', fog: 'rgba(120,255,90,', core: '#d8ff5a',
    },
    style: 'hive',
  },
  {
    id: 'dyson', name: 'DYSON KNOT', kind: 'Star-cage',
    blurb: 'A lattice wound around a captive sun. The enemy\'s capital. Its core is a star.',
    core: 9000, mult: 44, heat: 1.75, coreHp: 150000,
    pal: {
      bg0: '#1a1203', bg1: '#030200', rock0: '#3a2a0c', rock1: '#140e03', edge: '#ffd24a', edge2: '#fff4c2',
      vein: '#ffb020', ember: '#ffe38a', accent: '#ffd24a', enemy: '#ffd24a', enemy2: '#ff6a3a', fog: 'rgba(255,200,80,', core: '#fff4c2',
    },
    style: 'dyson',
  },
];

// ---------------------------------------------------------------- enemies
// depth = metres at which this type starts appearing on the first mass.
// Deeper masses bring everything in sooner (see run.js introDepth()).
export const ENEMIES = {
  drone:    { name: 'Hunter drone',    depth: 0,    hp: 14,  salvage: 3,  xp: 1, tip: 'Hunter drones chase you and shoot. Your gunner AI targets them automatically.' },
  sentry:   { name: 'Wall sentry',     depth: 70,   hp: 40,  salvage: 6,  xp: 2, tip: 'Sentries are bolted to the tube walls. Steer away or let the guns chew them up.' },
  mine:     { name: 'Proximity mine',  depth: 140,  hp: 8,   salvage: 1,  xp: 1, tip: 'Mines drift in the tube. Steer around them; they pop if you get close.' },
  stasis:   { name: 'Stasis field',    depth: 240,  hp: 70,  salvage: 10, xp: 3, tip: 'Stasis fields slow your descent. Kill the wall generator to collapse the field.' },
  barrier:  { name: 'Barrier',         depth: 330,  hp: 160, salvage: 14, xp: 4, tip: 'Barriers seal the tube. Ram them with the drill and keep shooting.' },
  breacher: { name: 'Breacher pod',    depth: 600,  hp: 40,  salvage: 5,  xp: 2, tip: 'Breacher pods launch from wall hatches, latch onto the hull and inject boarders. Shoot them off fast!' },
  warden:   { name: 'Choir node',      depth: 900,  hp: 90,  salvage: 16, xp: 5, tip: 'Choir nodes shield and heal nearby defenders. Kill them first.' },
  lancer:   { name: 'Lancer',          depth: 1300, hp: 70,  salvage: 14, xp: 4, tip: 'Lancers telegraph a beam. When the line appears, move!' },
  carrier:  { name: 'Carrier',         depth: 1800, hp: 240, salvage: 34, xp: 8, tip: 'Carriers launch hunter drones until destroyed.' },
  heart:    { name: 'The Core',        depth: 0,    hp: 2600, salvage: 400, xp: 40, tip: 'You reached the core. Destroy it before the heat destroys you.' },
};

// ---------------------------------------------------------------- crew
// Crew AIs keep their skills between runs over the Ansible link.
export const CREW = {
  gunner:   { role: 'Gunner',        name: 'FLETCH', color: '#ff7a59', perk: '+6% fire rate, +4% damage per level', xpFrom: 'kills' },
  pilot:    { role: 'Pilot',         name: 'VANE',   color: '#59c7ff', perk: '+7% steering, better auto-centering, -6% impact damage per level', xpFrom: 'depth' },
  security: { role: 'Security chief',name: 'BOLT',   color: '#6cff9a', perk: '+10% security bot damage and health per level', xpFrom: 'boarders repelled' },
  shieldt:  { role: 'Shield tech',   name: 'AEGIS',  color: '#b18cff', perk: '+8% shield regen, +4% shield capacity per level', xpFrom: 'damage absorbed' },
  repair:   { role: 'Repair tech',   name: 'PATCH',  color: '#ffd35a', perk: '+0.35 hull repaired per second per level', xpFrom: 'hull repaired' },
};
export const CREW_MAX = 25;
export const crewXpNeed = (lvl) => Math.round(18 * Math.pow(1.42, lvl - 1));

// ---------------------------------------------------------------- research
// Paid for with Data (earned from depth and new contacts). Unlocks systems.
// `show` decides when the item becomes visible; `req` lists research needed first.
export const RESEARCH = [
  { id: 'shield',   name: 'Shield emitter',     cost: 30,   show: s => s.runs >= 1, desc: 'A regenerating energy bubble that soaks damage before the hull.' },
  { id: 'c_pilot',  name: 'Pilot AI: VANE',     cost: 55,   show: s => s.bestAll >= 220, desc: 'A pilot AI. Steers harder and keeps you off the walls.' },
  { id: 'missiles', name: 'Missile pods',       cost: 110,  show: s => s.bestAll >= 380, desc: 'Homing missiles launched in volleys at the toughest target.' },
  { id: 'security', name: 'Security bay',       cost: 130,  show: s => s.bestAll >= 520, desc: 'Deep scans show boarding craft ahead. Security bots hunt down intruders inside the hull.' },
  { id: 'c_sec',    name: 'Security AI: BOLT',  cost: 160,  show: s => s.bestAll >= 520, req: ['security'], desc: 'A security chief who trains the bots. Gains skill repelling boarders.' },
  { id: 'c_shield', name: 'Shield AI: AEGIS',   cost: 180,  show: s => s.bestAll >= 650, req: ['shield'], desc: 'A shield specialist. Tunes the emitter for faster regeneration.' },
  { id: 'salvai',   name: 'Salvage AI',         cost: 200,  show: s => s.bestAll >= 750, desc: '+20% salvage and a stronger salvage tractor.' },
  { id: 'emp',      name: 'EMP burst',          cost: 240,  show: s => s.bestAll >= 850, desc: 'Active ability. Wipes enemy shots, stuns defenders, and blows breacher pods off the hull.' },
  { id: 'drones',   name: 'Wingman drones',     cost: 320,  show: s => s.bestAll >= 1000, desc: 'Small helper drones that orbit the Spelunker and fight alongside it.' },
  { id: 'c_repair', name: 'Repair AI: PATCH',   cost: 300,  show: s => s.bestAll >= 1100, desc: 'A repair AI that patches the hull while you fall.' },
  { id: 'ansible',  name: 'Ansible uplink',     cost: 380,  show: s => s.bestAll >= 1200, desc: '+30% Data from every run. Crew learn 25% faster.' },
  { id: 'lance',    name: 'Graviton lance',     cost: 480,  show: s => s.bestAll >= 1400, desc: 'A piercing beam that punches straight down through everything in its path.' },
  { id: 'overdrive',name: 'Overdrive',          cost: 460,  show: s => s.bestAll >= 1600, desc: 'Active ability. Burn the drive: huge speed and ram damage for a few seconds.' },
  { id: 'nanites',  name: 'Nanite hull',        cost: 600,  show: s => s.bestAll >= 2000, desc: 'Self-repairing plating. Unlocks nanite upgrades.' },
  { id: 'phase',    name: 'Phase drill',        cost: 900,  show: s => s.massesCleared >= 1, desc: 'The drill partly phases through matter. Triple ram damage against barriers.' },
  { id: 'twinlance',name: 'Twin lance',         cost: 1400, show: s => s.massesCleared >= 2, req: ['lance'], desc: 'A second lance emitter. Fires angled beams.' },
  { id: 'fortress', name: 'Fortress protocol',  cost: 2200, show: s => s.massesCleared >= 3, desc: 'Every system gets +15%. The Spelunker becomes a fortress.' },
];

// ---------------------------------------------------------------- upgrades
// Paid for with Salvage. `show` controls reveal, `req` gates on research.
export const UPGRADE_GROUPS = [
  { id: 'hull', name: 'Hull' },
  { id: 'drive', name: 'Drive & heat' },
  { id: 'guns', name: 'Weapons' },
  { id: 'sys', name: 'Systems' },
];

export const UPGRADES = [
  // hull
  { id: 'hull',     g: 'hull',  name: 'Hull plating',     base: 18,  k: 1.42, max: 40, show: () => true, desc: '+35 hull', fmt: l => `${100 + 35 * l} hull` },
  { id: 'armor',    g: 'hull',  name: 'Ablative armor',   base: 140, k: 1.55, max: 15, show: s => s.bestAll >= 550, desc: '-4% damage taken', fmt: l => `-${4 * l}% damage` },
  { id: 'nanite',   g: 'hull',  name: 'Nanite density',   base: 400, k: 1.5,  max: 15, show: () => true, req: ['nanites'], desc: '+0.8 hull/sec repair', fmt: l => `+${(0.8 * l).toFixed(1)}/s repair` },
  { id: 'impact',   g: 'hull',  name: 'Impact frame',     base: 60,  k: 1.5,  max: 10, show: s => s.runs >= 4, desc: '-8% wall and mine damage', fmt: l => `-${8 * l}% impact dmg` },
  // drive & heat
  { id: 'drive',    g: 'drive', name: 'Descent drive',    base: 22,  k: 1.45, max: 30, show: () => true, desc: '+2.5 m/s fall speed', fmt: l => `${(22 + 2.5 * l).toFixed(1)} m/s` },
  { id: 'sinks',    g: 'drive', name: 'Heat sinks',       base: 20,  k: 1.4,  max: 40, show: () => true, desc: '+30 heat capacity', fmt: l => `${100 + 30 * l} heat cap` },
  { id: 'coolant',  g: 'drive', name: 'Coolant loop',     base: 35,  k: 1.48, max: 30, show: s => s.bestAll >= 150, desc: '+0.6 cooling/sec', fmt: l => `${(2 + 0.6 * l).toFixed(1)}/s cooling` },
  { id: 'thrust',   g: 'drive', name: 'Lateral thrusters',base: 20,  k: 1.45, max: 20, show: s => s.runs >= 2, desc: '+8% steering', fmt: l => `+${8 * l}% steering` },
  // weapons
  { id: 'caliber',  g: 'guns',  name: 'Autocannon caliber', base: 20, k: 1.45, max: 40, show: () => true, desc: '+3 damage per shot', fmt: l => `${8 + 3 * l} dmg/shot` },
  { id: 'loader',   g: 'guns',  name: 'Autoloader',       base: 32,  k: 1.5,  max: 25, show: s => s.bestAll >= 200, desc: '+10% fire rate', fmt: l => `+${10 * l}% fire rate` },
  { id: 'hardpt',   g: 'guns',  name: 'Hardpoints',       base: 160, k: 2.6,  max: 4,  show: s => s.bestAll >= 380, desc: '+1 autocannon turret', fmt: l => `${1 + l} turrets` },
  { id: 'drill',    g: 'guns',  name: 'Drill head',       base: 35,  k: 1.45, max: 25, show: s => s.bestAll >= 300, desc: '+40% ram damage', fmt: l => `${Math.round(40 * (1 + 0.4 * l))} ram dps` },
  { id: 'missile',  g: 'guns',  name: 'Missile racks',    base: 120, k: 1.55, max: 15, show: () => true, req: ['missiles'], desc: '+1 missile per volley, +10% dmg', fmt: l => `${1 + l} per volley` },
  { id: 'lancepow', g: 'guns',  name: 'Lance focus',      base: 350, k: 1.5,  max: 15, show: () => true, req: ['lance'], desc: '+25% lance damage, faster charge', fmt: l => `+${25 * l}% lance` },
  { id: 'wing',     g: 'guns',  name: 'Wingman bay',      base: 260, k: 1.8,  max: 6,  show: () => true, req: ['drones'], desc: '+1 wingman drone', fmt: l => `${1 + l} wingmen` },
  // systems
  { id: 'shcap',    g: 'sys',   name: 'Shield capacity',  base: 45,  k: 1.45, max: 30, show: () => true, req: ['shield'], desc: '+25 shield', fmt: l => `${40 + 25 * l} shield` },
  { id: 'shreg',    g: 'sys',   name: 'Shield regen',     base: 55,  k: 1.5,  max: 25, show: () => true, req: ['shield'], desc: '+1.5 shield/sec', fmt: l => `${(5 + 1.5 * l).toFixed(1)}/s regen` },
  { id: 'magnet',   g: 'sys',   name: 'Salvage tractor',  base: 25,  k: 1.4,  max: 20, show: s => s.runs >= 3, desc: 'Pull salvage from further away', fmt: l => `${160 + 40 * l} range` },
  { id: 'scrap',    g: 'sys',   name: 'Scrap processors', base: 80,  k: 1.55, max: 20, show: s => s.bestAll >= 480, desc: '+10% salvage', fmt: l => `+${10 * l}% salvage` },
  { id: 'bots',     g: 'sys',   name: 'Security bots',    base: 120, k: 1.6,  max: 8,  show: () => true, req: ['security'], desc: '+1 security bot', fmt: l => `${2 + l} bots` },
  { id: 'botarm',   g: 'sys',   name: 'Bot armament',     base: 150, k: 1.5,  max: 15, show: () => true, req: ['security'], desc: '+20% bot damage and health', fmt: l => `+${20 * l}% bots` },
  { id: 'empup',    g: 'sys',   name: 'EMP capacitors',   base: 260, k: 1.6,  max: 10, show: () => true, req: ['emp'], desc: '-2s EMP cooldown, bigger radius', fmt: l => `${24 - 2 * l}s cooldown` },
  { id: 'odup',     g: 'sys',   name: 'Overdrive injectors', base: 300, k: 1.6, max: 10, show: () => true, req: ['overdrive'], desc: '+0.5s overdrive duration', fmt: l => `${(3 + 0.5 * l).toFixed(1)}s burn` },
];

// ---------------------------------------------------------------- relics
// Bought with core shards: world N's core pays N shards, for its first
// SHARD_CLEARS kills (the last world pays every time).
export const SHARD_CLEARS = 3;
export const RELICS = [
  { id: 'insert',  name: 'Insertion charge', max: 8, cost: l => 1 + Math.floor(l / 2), desc: 'Start each run 8% of the way to the core.', fmt: l => `start at ${8 * l}%` },
  { id: 'echo',    name: 'Ansible echo',     max: 10, cost: l => 1 + Math.floor(l / 3), desc: '+40% Data per run.', fmt: l => `+${40 * l}% Data` },
  { id: 'hoard',   name: 'Salvage covenant', max: 10, cost: l => 1 + Math.floor(l / 3), desc: '+40% salvage per run.', fmt: l => `+${40 * l}% salvage` },
  { id: 'ghost',   name: 'Ghost hull',       max: 10, cost: l => 1 + Math.floor(l / 2), desc: '+20% hull and shields.', fmt: l => `+${20 * l}% hull & shield` },
  { id: 'coldcore',name: 'Cold core',        max: 10, cost: l => 1 + Math.floor(l / 2), desc: '+20% heat capacity and cooling.', fmt: l => `+${20 * l}% cooling` },
  { id: 'wrath',   name: 'Wrath engine',     max: 10, cost: l => 1 + Math.floor(l / 2), desc: '+20% damage from every weapon.', fmt: l => `+${20 * l}% damage` },
];

export const upgradeCost = (u, lvl) => Math.round(u.base * Math.pow(u.k, lvl));

// What a run's hull damage (and its ending) gets blamed on, for the Stats tab.
export const CAUSES = {
  drone: 'Hunter drone fire', sentry: 'Sentry fire', heart: 'Core defences', mine: 'Mines',
  lancer: 'Lancer beams', breacher: 'Breacher pods', boarders: 'Boarders', wall: 'Wall impacts',
  heat: 'Overheating', abandon: 'Abandoned', unknown: 'Unknown',
};
