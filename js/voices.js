// Crew advice. Each AI reads the last run and the ship's state, picks the
// upgrade or research it cares about most, and says so in its own voice.
// Lines are drawn from big pools (plus openers and sign-offs) and recently
// used lines are skipped, so the crew doesn't repeat itself.
import { MASSES, CAUSES, UPGRADES, upgradeCost } from './data.js';
import { lvl, has, visibleUpgrades, visibleResearch, summary } from './state.js';

const pick = a => a[(Math.random() * a.length) | 0];

// ---------------------------------------------------------------- context
function context(S) {
  const L = S.lastRun || {};
  const vis = new Set(visibleUpgrades(S).map(u => u.id));
  const rsv = new Set(visibleResearch(S).map(r => r.id));
  const m = MASSES[S.mass];
  const best = S.best[S.mass] || 0;
  return {
    S, L, runs: S.runs,
    lv: id => lvl(S, id),
    has: id => has(S, id),
    // an upgrade we could buy a level of
    up: id => vis.has(id) && lvl(S, id) < UPGRADES.find(u => u.id === id).max,
    afford: id => { const u = UPGRADES.find(q => q.id === id); return S.salvage >= upgradeCost(u, lvl(S, id)); },
    // a research project that is decoded but not done
    rs: id => rsv.has(id) && !has(S, id),
    dmg: k => (L.dmg || {})[k] || 0,
    hull: L.hullTaken || 0,
    killer: L.killer,
    bestAll: summary(S).bestAll,
    vars: {
      depth: (L.depth || 0).toLocaleString('en-US'),
      best: best.toLocaleString('en-US'),
      core: m.core.toLocaleString('en-US'),
      toCore: Math.max(0, m.core - best).toLocaleString('en-US'),
      mass: m.name.charAt(0) + m.name.slice(1).toLowerCase(),
      killer: (CAUSES[L.killer] || 'something down there').toLowerCase(),
    },
  };
}

// ---------------------------------------------------------------- the crew
const VOICES = {
  // ============================================================ FLETCH, gunner: brash, loud, loves guns
  gunner: {
    open: [
      'Listen up.', 'Okay, gunner\'s opinion, and I\'m right.', 'Real talk, Commander:', 'Here\'s the thing.',
      'Don\'t make that face.', 'Ha! Okay.', 'I\'ve been running the numbers. Well, the one number: damage.',
      'You want my advice? Too bad, you\'re getting it.', 'Gun deck reporting.',
    ],
    close: [
      'More dakka. Always more dakka.', 'Trust the gunner.', 'Just saying.', 'Anyway. Guns.',
      'You know I\'m right.', 'Let\'s make them regret building defences.', 'I\'ll be at my station. Polishing.',
    ],
    idle: [
      'Did you see that carrier go up? I did. I saw it twice. Once in my dreams.',
      'Nothing to buy on my deck I\'d fight you over. For once. Mark the date.',
      'Ask VANE what he wants. Then ask me again. I\'ll still say guns.',
      'Guns are hot, targets are cold. My favourite kind of day.',
      'Honestly? The gun deck is in great shape. Go spend on the boring stuff for once.',
      'I counted every shot last run. Well, I counted the ones that hit. That\'s the good number.',
      'If it moves down there, it gets shot. If it doesn\'t move, it gets shot slower.',
      'I don\'t need anything right now. I want everything, but I don\'t need anything.',
      'Tell the others I said the guns carried us. Because they did.',
    ],
    topics: [
      { id: 'intro', score: c => c.runs === 0 ? 100 : 0, lines: [
        'First drop, huh? One cannon, zero experience. I love it. Point me at something.',
        'Before we go: I\'ve got one autocannon under the drill. It aims itself. You just keep us alive.',
        'We won\'t make it far this time. That\'s fine. Every metre teaches me something about their defences.',
      ] },
      { id: 'caliber', score: c => c.up('caliber') ? 3 + (['drone', 'sentry', 'mine'].includes(c.killer) ? 5 : 0) + Math.max(0, 6 - c.lv('caliber')) : 0, lines: [
        'We dropped {depth} m and half of it I was shooting things that wouldn\'t die. Caliber.',
        'Caliber upgrade. I\'m not asking for me. I\'m asking for the bullets.',
        'The autocannon is pea-shooting. Autocannon caliber. Bigger rounds, fewer problems.',
        'Things were soaking up my shots last run. Caliber upgrade, please. I want them to pop, not flinch.',
        'We went down to {killer}. You know what stops {killer}? Heavier rounds. Autocannon caliber.',
        'Every level of caliber is three more damage on every single shot. Every. Single. Shot.',
        'I\'m putting in a formal request for autocannon caliber. Formally. That means I\'m shouting.',
        'Those drones had time to aim at us. That\'s on me, and on our caliber. Let\'s fix both.',
        'Bigger bullets, Commander. It\'s not complicated. It\'s beautiful, but it\'s not complicated.',
      ] },
      { id: 'loader', score: c => c.up('loader') ? 2 + (c.lv('loader') < c.lv('caliber') ? 4 : 0) : 0, lines: [
        'Rounds hit hard, but I\'m waiting on the loader between shots. Autoloader, please.',
        'The autoloader is the bottleneck. I can feel the gap between every shot and I hate it.',
        'Fire rate wins fights. Autoloader. Ten percent faster every level.',
        'Caliber\'s ahead of the loader. Let\'s even them out. Autoloader next.',
        'I want the barrel glowing. Autoloader upgrade makes the barrel glow.',
        'More shots per second means fewer seconds of them shooting back. Autoloader.',
      ] },
      { id: 'hardpt', score: c => c.up('hardpt') ? 5 + (c.L.pods || 0) + (c.killer === 'drone' ? 3 : 0) : 0, lines: [
        'You bought me one gun and expected a war. Hardpoints, please.',
        'One gun can only face one way. Hardpoints. Give me a turret on every side.',
        'Pods latched on where I couldn\'t reach them. A second hardpoint covers the blind side.',
        'We need another turret. Hardpoints. I\'ll name it after you. Probably.',
        'Drones come from everywhere. Guns should point everywhere. Hardpoints.',
        'Hardpoints are pricey, I know. Worth every scrap. Two turrets is double the fun.',
        'Picture it: turrets all around the ring, all firing at once. Hardpoints. Please.',
      ] },
      { id: 'drill', score: c => c.up('drill') ? 2 + (c.L.enc && c.L.enc.barrier ? 3 + c.L.enc.barrier : 0) : 0, lines: [
        'We sat on barriers too long. Drill head upgrade. Punch through, don\'t knock politely.',
        'Every second parked on a barrier is a second the sentries get free shots. Drill head.',
        'The drill\'s dull, Commander. Upgrade the drill head and we go through walls like paper.',
        'Barriers: {n} of them last run. Each one cost us time. Drill head fixes that.',
        'A sharper drill is a gun that points down. I approve of all guns. Drill head.',
      ], n: c => (c.L.enc && c.L.enc.barrier) || 0 },
      { id: 'missiles', score: c => c.rs('missiles') ? 7 : 0, lines: [
        'Research has a missile pod design sitting there. Missiles, Commander. Homing ones.',
        'I want Missile pods. They find the big targets while I handle the small ones.',
        'Missile pods research. Do it. The tough targets are eating my time.',
        'Imagine a volley of missiles going out every few seconds. Now stop imagining and research it.',
      ] },
      { id: 'racks', score: c => c.up('missile') ? 3 : 0, lines: [
        'Missile racks. More missiles per volley. You know where I stand on "more".',
        'One missile per volley is a tease. Upgrade the racks.',
        'Missile racks. Let the volleys get properly stupid.',
      ] },
      { id: 'lance', score: c => c.rs('lance') ? 6 : 0, lines: [
        'I dream about the lance. Big purple beam. Straight down. Research it.',
        'The graviton lance is decoded. A beam that punches straight down through everything. I need it.',
        'Research the lance and I\'ll show you what "through" means.',
        'Graviton lance. Barriers, carriers, whatever. One beam, all of it.',
      ] },
      { id: 'sentry', score: c => c.killer === 'sentry' && c.up('caliber') ? 8 : 0, lines: [
        'Sentries bolted to the walls took us out. They don\'t move, Commander. Hit them harder: caliber.',
        'Those wall sentries lined us up and I couldn\'t kill them fast enough. More caliber, more loader.',
        'Sentries got us. Humiliating. Stationary targets. Upgrade my caliber and I\'ll make it right.',
      ] },
    ],
  },

  // ============================================================ VANE, pilot: calm, dry, precise
  pilot: {
    open: [
      'A thought from the bridge.', 'Pilot\'s log, informally:', 'If I may.', 'Quietly, then:',
      'I reviewed the flight recorder.', 'Nothing dramatic, but', 'For what it\'s worth,', 'Steady. Here\'s my view.',
    ],
    close: [
      'The tube is only as wide as it is. We should be better than it.', 'I\'ll keep her level.',
      'Fly smooth, fall far.', 'Your call, of course.', 'Something to consider.', 'That\'s all. Carry on.',
      'The walls are patient. We shouldn\'t give them chances.',
    ],
    idle: [
      'Tip: you don\'t need to hold the stick. Let go and I\'ll glide us to the centre.',
      'Tip: salvage clusters glow gold. A small drift is usually safe; a big swing usually isn\'t.',
      'Tip: stasis fields are tied to a generator on the wall. Kill the generator, keep the speed.',
      'I\'ve memorised the first kilometre of this tube. The rest I\'m learning a run at a time.',
      'We were at {depth} m when it ended. I remember the exact bend.',
      'I don\'t need upgrades today. I need you to trust the auto-centre a little more.',
      'The helm is fine. Honestly, give the Data to research.',
      'If you ever wonder why we drift toward the middle, that\'s me. You\'re welcome.',
      'The flight was clean enough. I\'d leave the helm alone this time.',
      'Nothing urgent from the bridge. Enjoy the quiet while it lasts.',
      'I like the fall. The trick is making the fall like us back.',
      'Tip: hold Brake near a cluster of sentries. Fewer shots in, more of ours out.',
      'Tip: when the red dashed line appears, it is not a suggestion. Move.',
      'Tip: Dive is worth it on empty stretches. Just watch the heat.',
      'We fell {depth} m last time. Our best here is {best} m. The core waits at {core} m.',
    ],
    topics: [
      { id: 'intro', score: c => c.runs === 0 ? 100 : 0, lines: [
        'Vane at the helm. I\'ll keep us centred when you let go. Steer when you want something.',
        'I read the tube for you. You read the danger. Between us we should do fine.',
      ] },
      { id: 'thrust', score: c => c.up('thrust') ? 2 + Math.min(6, (c.L.scrapes || 0)) + (['mine', 'lancer', 'wall'].includes(c.killer) ? 5 : 0) : 0, lines: [
        'Lateral thrusters. The difference between dodging and hoping.',
        'The tube narrows down deep. I need to be nimbler before we get there. Thrusters.',
        'Give me thrusters and I\'ll give you fewer scrapes. That\'s a promise I can keep.',
        'I watched a mine drift into us in slow motion. Thrusters would have made it a near miss.',
        'We scraped the walls {n} times last run. Lateral thrusters would let me pull away faster.',
        'Better lateral thrusters would help us swing over to salvage and back before trouble arrives.',
        'Mines, beams, walls: all the same problem. We can\'t sidestep quickly enough. Lateral thrusters.',
        'I want lateral thrusters. Not for speed. For choices.',
        'The ship turns like a moon. Lateral thrusters would make it turn like a ship.',
        'Every level of thrusters is eight percent more steering. It adds up in tight tubes.',
        '{killer} caught us. With sharper thrusters I could have slipped it.',
      ], n: c => c.L.scrapes || 0 },
      { id: 'drive', score: c => c.up('drive') ? 2 + (c.L.time > 60 ? 3 : 0) + (c.killer === 'heat' ? 3 : 0) : 0, lines: [
        'Descent drive. The core isn\'t getting any closer on its own.',
        'Time is the enemy\'s best weapon. A stronger drive takes it away.',
        'I\'d take a faster drive over almost anything right now. We linger too long.',
        'We\'re falling slowly. The longer we\'re down there, the more they throw at us. Descent drive.',
        'The descent drive is due. Faster falling means less time in the heat.',
        'Speed is armour, in its way. Upgrade the descent drive and we outrun half their defences.',
        'Our best here is {best} m. The core is {toCore} m further. A stronger descent drive closes that.',
        'Descent drive. More metres per second, fewer seconds per metre. Same thing, sounds better twice.',
        'I\'d like more drive. We fell {depth} m last run; we could have fallen further in the same time.',
      ] },
      { id: 'magnet', score: c => c.up('magnet') ? 2 + (c.L.caches ? 1 : 0) : 0, lines: [
        'A longer salvage tractor means I can fly the safe line and still bring the loot home.',
        'Salvage tractor, Commander. Let the scrap chase us for once.',
        'I keep flying past salvage. A stronger salvage tractor would reel it in without detours.',
        'Salvage tractor. Let the loot come to us; I\'d rather keep a straight line.',
        'Each detour for salvage is a risk. Upgrade the tractor and the risk goes away.',
        'The tractor range is short. Upgrade it and I won\'t have to thread needles for scrap.',
      ] },
      { id: 'pilotlvl', score: c => c.S.crew.pilot && c.S.crew.pilot.lvl < 4 && c.S.data > 40 ? 2 : 0, lines: [
        'If there\'s spare Data, a little sim-training would sharpen my reflexes. No pressure.',
        'I learn from every metre we fall. Sim-training is the shortcut, if Data allows.',
      ] },
      { id: 'overdrive', score: c => c.rs('overdrive') ? 6 : 0, lines: [
        'Overdrive would let me punch through the worst stretch instead of crawling through it.',
        'Overdrive research is ready. A few seconds of everything the drive has. I\'d use it well.',
        'Research Overdrive and give me a panic button that isn\'t "brake".',
        'With Overdrive I can burn through a stasis field or a barrier in a heartbeat.',
      ] },
      { id: 'lancer', score: c => c.killer === 'lancer' ? 9 : 0, lines: [
        'A lancer beam ended the run. Thrusters would buy me the half-second I needed.',
        'The lancer beam got us. The line was showing. I should have moved sooner. We both should have.',
        'Lancers warn you with a dashed line. When you see it, give me the stick and I\'ll clear it.',
      ] },
      { id: 'wall', score: c => c.killer === 'wall' ? 9 : 0, lines: [
        'That wall had our name on it. Next time I\'d like more thruster behind the stick.',
        'We died on a wall. That one\'s embarrassing for both of us. Let go of the stick sometimes; I\'ll centre us.',
        'Walls killed us. The Impact frame would help AEGIS, but lateral thrusters would help me avoid it altogether.',
      ] },
    ],
  },

  // ============================================================ AEGIS, shields: protective, earnest, a worrier
  shieldt: {
    open: [
      'Please hear me out.', 'I worry about you all.', 'Shield station here.', 'I\'ve been watching the damage logs.',
      'I don\'t mean to nag, but', 'Gently:', 'I kept the numbers.', 'For everyone\'s safety,',
    ],
    close: [
      'I just want us all back in one piece.', 'The hull remembers every hit, even when we don\'t.',
      'I\'ll hold the line as long as I can.', 'Please.', 'It\'s what I\'d do.', 'Stay safe down there.',
      'Protection first. Glory after.',
    ],
    idle: [
      'Tip: the shield regenerates when nothing hits it for a moment. Brief breathers matter.',
      'Tip: a strong shield bounces breacher pods right off. Keep it above a third if you can.',
      'I ran the numbers three times. We\'re sturdier than we were. Not sturdy enough, but sturdier.',
      'I know upgrades to my station feel boring. Boring is how we survive.',
      'When the shield holds, I get to breathe. Thank you for the last run.',
      'I like the quiet parts of the fall. That\'s when the shield comes back.',
      'Our defences held well last run. I\'m cautiously proud.',
      'Everything\'s green on my panels. Well, mostly green. Greener than usual.',
      'I don\'t need anything right now, but I\'ll let you know the second I do.',
      'We took {n} hull damage and absorbed a good part of it. I can live with that. We all can.',
      'I recalibrated the emitter while you were in the hangar. Don\'t tell PATCH; he\'d want to help.',
    ],
    topics: [
      { id: 'hull', score: c => c.up('hull') ? 2 + (c.hull > 150 ? 3 : 0) + (c.killer && c.killer !== 'heat' && c.killer !== 'abandon' ? 3 : 0) : 0, lines: [
        'Hull plating. If I could only ask for one thing, it would be that.',
        'We ended the run at {depth} m because the hull gave out first. Plating.',
        'I don\'t want to lose anyone else to {killer}. More hull plating.',
        'Our hull is the last thing between the crew and the tube. Please thicken it.',
        'More plating. Every point of hull is a moment more to react.',
        'We really suffered from thin hull plating last run. More plating, please.',
        'We took {n} points of hull damage. More Hull plating gives us room to survive mistakes.',
        'Hull plating is the simplest thing we can do for each other. Thirty-five more hull every level.',
        'I felt every hit last run. Please upgrade the hull plating.',
        'When the shield drops, the hull is all we have. Let\'s make it thicker.',
        'A little more plating and {killer} wouldn\'t have finished us.',
        'Hull plating isn\'t exciting. It is the reason we come home.',
      ], n: c => Math.round(c.hull) },
      { id: 'shield', score: c => c.rs('shield') ? 12 : 0, lines: [
        'I can\'t protect anyone without an emitter. Shield emitter research, please.',
        'Everything hits the hull directly right now. The Shield emitter would change that.',
        'It\'s cheap in Data, and it would save so much hull. Shield emitter first.',
        'We have no shield. None. Please research the Shield emitter before anything else.',
        'The Shield emitter is decoded and waiting. It would take hits for the hull. It would take hits for us.',
        'Research the Shield emitter and I promise I\'ll look after it.',
      ] },
      { id: 'shcap', score: c => c.up('shcap') ? 3 + ((c.L.shieldAbs || 0) > 60 ? 3 : 0) : 0, lines: [
        'Shield capacity. A bigger bubble is a calmer crew.',
        'We keep emptying the shield in the thick of it. More capacity.',
        'The shield absorbed {n} damage last run and ran dry. Shield capacity, please.',
        'More shield capacity means a bigger buffer before the hull even notices.',
        'The shield did its job. It just ran out of job. Capacity upgrade.',
        'Twenty-five more shield every level. That\'s a sentry burst we never feel.',
        'A deeper shield would also bounce breacher pods more often. Capacity helps BOLT too.',
      ], n: c => Math.round(c.L.shieldAbs || 0) },
      { id: 'shreg', score: c => c.up('shreg') ? 2 + (c.lv('shreg') < c.lv('shcap') ? 3 : 0) : 0, lines: [
        'Shield regen, please. The bubble should be full again before the next wave, not after.',
        'Better regeneration means the shield is there for the second fight, not just the first.',
        'The shield takes too long to come back. Shield regen, please.',
        'Regen matters between fights. Faster regen, and every quiet stretch refills us.',
        'Capacity is ahead of regen. Let\'s balance them: shield regen next.',
        'I\'d love faster regeneration. I hate watching the bar crawl back.',
      ] },
      { id: 'armor', score: c => c.up('armor') ? 3 + (c.hull > 300 ? 3 : 0) : 0, lines: [
        'Every hit, a little smaller. That\'s what ablative armor does. It\'s lovely.',
        'Armor stacks with everything else I do. Please consider it.',
        'Ablative armor would cut every hit before it lands. Shield and hull both benefit.',
        'Armor is quiet protection. Four percent less damage from everything, every level.',
        'We\'re getting deep enough that hits really sting. Ablative armor would help.',
        'I\'d feel better with ablative armor. Much better.',
      ] },
      { id: 'impact', score: c => c.up('impact') ? 1 + Math.min(4, ((c.dmg('wall') + c.dmg('mine')) / 30)) + (['wall', 'mine'].includes(c.killer) ? 5 : 0) : 0, lines: [
        'The walls are rougher than they look. The Impact frame would take the sting out.',
        'Mines chew us up. The Impact frame would blunt them.',
        'Walls and mines hurt us more than they should. The Impact frame would soften those.',
        'Impact frame. For the scrapes and the mines. VANE does his best, but the tube is narrow.',
        'We lost {n} hull to walls and mines. An Impact frame would have saved most of it.',
      ], n: c => Math.round(c.dmg('wall') + c.dmg('mine')) },
      { id: 'heal', score: c => c.rs('c_repair') ? 3 : 0, lines: [
        'The Repair AI research would bring PATCH aboard. Someone to mend the hull mid-fall. Please.',
      ] },
    ],
  },

  // ============================================================ PATCH, repair/drive & heat: folksy mechanic
  repair: {
    open: [
      'Well now.', 'PATCH here, elbow-deep in the coolant lines.', 'Let me tell you what I told the reactor.',
      'Word from the engine room:', 'Don\'t mind the smoke.', 'Heh. Right.', 'I\'ll keep it simple.', 'Here\'s the thing about heat.',
    ],
    close: [
      'Keep her cool and she\'ll keep you alive.', 'I\'ll have it running sweet.', 'Old mechanic\'s rule.',
      'Don\'t make me say it twice. I will, though.', 'Holler if you need me.', 'Heat\'s the one enemy that never misses.',
      'Anyway. Back to the pipes.',
    ],
    idle: [
      'Tip: a sabotaged drive room makes her sluggish. Get the bots in there quick.',
      'If the hull\'s groaning, that\'s normal. If it\'s singing, call me.',
      'Tip: heat builds faster the deeper you go. Plan your cooling for the bottom, not the top.',
      'Tip: repair kits are the green crosses. A quarter of the hull back, just like that.',
      'I rebuilt the aft coupling while you were browsing upgrades. You\'re welcome.',
      'Somebody keeps leaving coffee on the heat exchanger. It\'s not me. It\'s definitely not me.',
      'She\'s running fine. Go bother FLETCH about his toys.',
      'The heat didn\'t get us this time. Doesn\'t mean it won\'t.',
      'Every metre deeper is a degree hotter. I\'ve got a thermometer and opinions.',
      'I like this ship. She complains, but she means well. Like me.',
      'Engines are purring. Leave my room alone and spend on the shooty bits.',
      'She ran cool last time. Nice flying.',
      'I patched {n} hull on the way down. Not bad for a wrench with a personality.',
      'Tip: coolant cells are the blue ones. Grab them when the heat bar\'s climbing.',
      'Tip: Dive heats us faster. Great on empty stretches, rough when you\'re already hot.',
    ],
    topics: [
      { id: 'coolant', score: c => c.up('coolant') ? 2 + ((c.L.overheatTime || 0) > 1 ? 5 : 0) + (c.killer === 'heat' ? 6 : 0) : 0, lines: [
        'Coolant loop. I know I say it every time. It\'s because it\'s true every time.',
        'Better loop, less cooking. Simple as a spanner.',
        'The deeper we go the hotter it gets. The loop has to keep up. Upgrade it.',
        'Point six more cooling a second, every level. Down deep, that\'s the whole ballgame.',
        'We were {depth} m down and the loop was screaming. Let\'s give it some help.',
        'Coolant loop, boss. The heat bar shouldn\'t be the thing that ends our runs.',
        'We cooked for {n} seconds last run. Coolant loop. Pull the heat out faster.',
        'The coolant loop is the heart of it. Better loop, cooler ship, longer fall.',
        'Heat killed us. That\'s my department, and my department wants a coolant loop upgrade.',
        'Cooling rate is what keeps us alive past the halfway mark. Coolant loop.',
        'Sinks hold heat, the loop dumps it. We need the dumping kind.',
        'More coolant loop. I\'ll even stop complaining about the drip. Probably.',
      ], n: c => Math.round(c.L.overheatTime || 0) },
      { id: 'sinks', score: c => c.up('sinks') ? 2 + ((c.L.overheatTime || 0) > 0.5 ? 3 : 0) + (c.lv('sinks') < c.lv('coolant') ? 2 : 0) : 0, lines: [
        'Heat sinks are cheap and they never let you down. Buy a couple.',
        'We need more thermal headroom. Heat sinks.',
        'Sinks and loop go together like bolts and nuts. Sinks are behind.',
        'A few more heat sinks and we can use Dive without me having a fit.',
        'Heat sinks. More room for heat before the hull starts to cook.',
        'The sinks fill up too fast down deep. Thirty more capacity every level. Cheap, too.',
        'Heat sinks buy time. And time\'s what you need when the fighting gets thick.',
        'Bigger heat sinks. It\'s like a bigger bucket in a leaky boat. Works surprisingly well.',
        'Heat sinks are the cheapest insurance on this ship.',
      ] },
      { id: 'nanites', score: c => c.rs('nanites') ? 6 : 0, lines: [
        'Nanite hull. Little helpers. They never ask for a break.',
        'I can only patch so fast with two hands. Research the nanites and I\'ll have millions.',
        'That Nanite hull research? Self-mending plating. I\'d kiss it if it had a face.',
        'Research the Nanite hull and the ship patches itself while we fall.',
      ] },
      { id: 'nanite', score: c => c.up('nanite') ? 3 : 0, lines: [
        'Nanite density. More of the little fellas. They do good work.',
        'Nanite density. Denser swarm, faster mending.',
        'More nanites, more repairs per second. They\'re tiny, but there are a lot of them.',
      ] },
      { id: 'scrap', score: c => c.up('scrap') ? 2 : 0, lines: [
        'Scrap processors. We\'re throwing good metal away, boss.',
        'I can wring more out of those wrecks with better processors. Just saying.',
        'Scrap processors would squeeze ten percent more salvage out of every wreck.',
        'We\'re leaving value in the wreckage. Scrap processors.',
        'Better scrap processors. More salvage, more upgrades, more of me not being cooked.',
      ] },
      { id: 'salvai', score: c => c.rs('salvai') ? 4 : 0, lines: [
        'Salvage AI, boss. Smarter sorting, more loot, bigger tractor. What\'s not to like?',
        'The Salvage AI research would bring in more loot and pull it from further off. Pays for itself.',
      ] },
      { id: 'heat', score: c => c.killer === 'heat' && !c.up('coolant') && !c.up('sinks') ? 6 : 0, lines: [
        'Heat got us, and the cooling gear\'s as good as I can make it. Fall faster, spend less time down there.',
      ] },
    ],
  },

  // ============================================================ BOLT, security: terse, military
  security: {
    open: [
      'Security report.', 'Bolt. Brief.', 'Assessment:', 'Listen.', 'Situation:', 'From the reactor deck:', 'No sugar-coating.',
    ],
    close: [
      'Nobody boards this ship twice.', 'End report.', 'Recommend immediate action.', 'That is all.',
      'I hold the reactor. You hold the purse.', 'Make it happen.', 'Bots are ready. Give them teeth.',
    ],
    idle: [
      'Tip: breacher pods hide in the walls until we pass. Expect them after the first few hundred metres.',
      'Every intruder has a name. I don\'t learn it. I log it.',
      'Reactor deck held. Crew safe. That\'s the job.',
      'Two tips. Shoot pods early. Keep bots armed.',
      'Last boarding drill was clean. I want it cleaner.',
      'Tip: intruders go for rooms. A red room means sabotage in progress.',
      'Tip: a sabotaged reactor burns hull. Clear the reactor first.',
      'Tip: pods launch from wall hatches as we pass. Hug the centre when you can.',
      'Drilled the bots on boarding response. Times improved.',
      'Quiet deck. Stay alert anyway.',
      'Bots are charged. Waiting for a reason.',
      'I keep a tally of every intruder. The tally is the point.',
      'Deck security holds. For now.',
      'Nothing to requisition. Spend it elsewhere.',
      'No breaches worth mentioning. Deck is secure.',
      'Bots patrolled. Nothing to report. That\'s the goal.',
      'Repelled {n} intruders last run. Acceptable.',
      'Tip: shoot breacher pods before they latch. Once they\'re on, they\'re braced.',
      'Tip: the EMP knocks latched pods clean off the hull. Save it for that.',
    ],
    topics: [
      { id: 'bots', score: c => c.up('bots') ? 2 + Math.max(0, (c.L.boarded || 0) - (c.L.repelled || 0)) * 2 : 0, lines: [
        'One more bot. Then one more after that.',
        'Rooms went dark to sabotage. More bots, faster response.',
        'I need bodies on the deck. Security bots.',
        'Boarders held the gun deck for too long. More bots.',
        'Requisition: security bots. Priority high.',
        'Intruders outnumbered the bots. More security bots.',
        '{n} intruders got aboard and stayed aboard. Need more bots.',
        'Add a bot. Every one I add covers another room.',
        'Security bots. More of them. Now.',
        'They took rooms and held them. More bots means shorter occupations.',
      ], n: c => Math.max(0, (c.L.boarded || 0) - (c.L.repelled || 0)) },
      { id: 'botarm', score: c => c.up('botarm') ? 2 + ((c.L.botsLost || 0) > 0 ? 3 + c.L.botsLost : 0) : 0, lines: [
        'Bots are losing one-on-ones. Unacceptable. Armament.',
        'Arm the bots. They fight, they win, they come back.',
        'Bot armament. Stronger bots respawn less.',
        'Lost {n} bots last run. Bot armament. Make them hit harder and last longer.',
        'Bots die too fast. Bot armament.',
        'Bot armament: twenty percent damage and toughness a level. Best value on my deck.',
        'Numbers are fine. Quality isn\'t. Arm the bots.',
      ], n: c => c.L.botsLost || 0 },
      { id: 'emp', score: c => c.rs('emp') ? 6 + (c.L.pods || 0) : 0, lines: [
        'EMP research. Pods off, shots gone, done.',
        'I want the EMP. Tactical reset button.',
        'EMP burst research. It blows latched pods off the hull. Request priority.',
        'Research the EMP. One button, no boarders.',
        'EMP. Clears shots, stuns defenders, strips pods. Want it.',
      ] },
      { id: 'empup', score: c => c.up('empup') ? 2 : 0, lines: [
        'EMP capacitors. Bigger burst radius. More pods caught.',
        'Faster EMP recharge. More resets per run.',
        'EMP capacitors. Shorter cooldown, wider burst.',
        'Cooldown on the EMP is too long. Capacitors.',
      ] },
      { id: 'pods', score: c => (c.L.pods || 0) > 2 && c.up('hardpt') ? 5 : 0, lines: [
        'Pods latched {n} times. Too many. Kill them in flight, or cover every angle.',
        '{n} pods latched on. FLETCH can\'t shoot what\'s behind the hull. Hardpoints.',
        'Pods hit our blind side. More hardpoints means no blind side.',
      ], n: c => c.L.pods || 0 },
      { id: 'boarders', score: c => c.killer === 'boarders' ? 9 : 0, lines: [
        'Intruders finished us. It will not happen twice. Bots.',
        'Boarders killed the ship. That\'s on my deck. Give me bots and armament and it won\'t happen again.',
        'We were taken from the inside. Unacceptable. Bots. Arms. Both.',
      ] },
    ],
  },
};

// ---------------------------------------------------------------- choosing a line
export function advise(S, crewId) {
  const V = VOICES[crewId];
  if (!V) return '';
  const c = context(S);
  S.voice = S.voice || {};
  const recent = S.voice[crewId] = (S.voice[crewId] || []).slice(-14);

  // weight strongly toward the most pressing topic, but not always the same one
  // rotate: talk less about the topic we just raised, or one we've said everything about
  const lastTopic = S.voice[crewId + ':t'];
  const scored = V.topics.map(t => {
    let sc = t.score(c);
    if (t.id === lastTopic) sc *= 0.45;
    if (sc > 0 && t.lines.every(l => recent.includes(l))) sc *= 0.3;
    return [t, sc];
  }).filter(([, s]) => s > 0);
  let topic = null, body;
  if (scored.length) {
    let tot = 0; for (const [, s] of scored) tot += s * s;
    let r = Math.random() * tot;
    for (const [t, s] of scored) { r -= s * s; if (r <= 0) { topic = t; break; } }
    topic = topic || scored[0][0];
  }
  const pool = topic ? topic.lines : V.idle;
  const fresh = pool.filter(l => !recent.includes(l));
  body = pick(fresh.length ? fresh : pool);
  recent.push(body);
  S.voice[crewId + ':t'] = topic ? topic.id : 'idle';

  // dress it with an opener or a sign-off now and then
  const r = Math.random();
  let line = body;
  if (r < 0.3) { const o = pick(V.open); line = `${o} ${/[,a-z]$/.test(o) ? soften(body) : body}`; }
  else if (r < 0.5) line = `${body} ${pick(V.close)}`;

  const n = topic && topic.n ? topic.n(c) : crewId === 'repair' ? Math.round(c.L.repaired || 0) : crewId === 'shieldt' ? Math.round(c.hull) : crewId === 'security' ? c.L.repelled || 0 : 0;
  const vars = { ...c.vars, n: Number(n).toLocaleString('en-US') };
  return line.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

// Rough count of distinct things each AI can say (for curiosity and tests).
export function lineCount(crewId) {
  const V = VOICES[crewId];
  const bodies = V.idle.length + V.topics.reduce((a, t) => a + t.lines.length, 0);
  return { bodies, combos: bodies * (1 + V.open.length + V.close.length) };
}

// After an opener like "Gently:" keep the capital; after "…, but" drop it
// (unless the sentence starts with "I", an acronym or a crew name).
function soften(body) {
  if (/^(I\b|I'|[A-Z]{2})/.test(body)) return body;
  return body.charAt(0).toLowerCase() + body.slice(1);
}
