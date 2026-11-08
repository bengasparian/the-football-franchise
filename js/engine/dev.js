// Development traits, longevity and real-life personality overrides.
import { G, rnd, gauss, clamp, age, news } from './core.js';

// Development trait: how fast a young player grows and how gracefully a veteran ages.
// Being elite now doesn't guarantee an elite trait, and a trait can be earned (or lost) by what a player does.
export const DEV = ['Normal', 'Impact', 'Star', 'Elite'];
export const DEV_INFO = {
  Normal: 'Develops and ages on a normal curve.',
  Impact: 'Grows a little faster than most and holds his level a bit longer.',
  Star: 'Grows quickly when young and ages gracefully.',
  Elite: 'Rare. Fastest growth, highest ceiling, and stays elite deep into his 30s.',
};
export const DEV_GROWTH = { Normal: 0, Impact: 0.4, Star: 0.8, Elite: 1.2 }; // extra yearly growth before 27
export const DEV_AGING = { Normal: 1, Impact: 0.85, Star: 0.7, Elite: 0.55 }; // multiplier on age decline

// Assign traits to the real league by rank, with noise: about 3% Elite, 9% Star, 24% Impact.
export function initDevTraits(players, S0) {
  const scored = players.map((p) => {
    const a = age(p, S0);
    const acc = (p.realPB || 0) * 0.7 + (p.realAP || 0) * 1.8;
    const youth = Math.max(0, 27 - a) * 1.1 * (p.r.ovr >= 70 ? 1 : 0.4);
    return { p, sc: p.r.ovr + youth + Math.min(6, acc) + gauss(0, 4.5) };
  }).sort((a, b) => b.sc - a.sc);
  const n = scored.length;
  scored.forEach((x, i) => {
    const q = i / n;
    x.p.dev = q < 0.03 ? 'Elite' : q < 0.12 ? 'Star' : q < 0.36 ? 'Impact' : 'Normal';
  });
}

// Rookies: mostly Normal; a few have it.
export function rookieDev(p) {
  const up = (p.r.pot ?? p.r.tal) - (p.r.tal ?? 50);
  const r = rnd() - up / 120 - (p.gen ? 1 : 0);
  return r < 0.02 ? 'Elite' : r < 0.1 ? 'Star' : r < 0.32 ? 'Impact' : 'Normal';
}

// Longevity (0-99): how long a body holds up. Shapes aging, retirement and injury recovery.
const LON_POS = { QB: 8, K: 14, P: 14, LS: 14, OT: 3, OG: 3, C: 4, TE: 0, DT: 0, EDGE: 0, LB: -2, WR: 0, CB: -3, S: -2, RB: -9, FB: -4 };
export function initLongevity(p) {
  const work = p.pers?.work ?? 0.5;
  let v = 62 + (LON_POS[p.pos] || 0) + (work - 0.5) * 20 + gauss(0, 10);
  if (p.dev === 'Elite') v += 6; else if (p.dev === 'Star') v += 3;
  return Math.round(clamp(v, 20, 97));
}
export function longevityLabel(v) {
  return v >= 82 ? 'Iron Man' : v >= 70 ? 'Durable' : v >= 55 ? 'Average' : v >= 42 ? 'Wear & Tear' : 'Fragile';
}
// A serious injury takes something out of a player; a clean recovery gives a little back.
export function longevityInjuryHit(p, weeks, seasonEnding) {
  if (p.lon == null) return;
  let hit = seasonEnding ? 6 + rnd() * 6 : weeks >= 6 ? 2 + rnd() * 3 : weeks >= 3 ? rnd() * 1.5 : 0;
  hit *= 1.15 - (p.pers?.work ?? 0.5) * 0.3;
  p.lon = Math.round(clamp(p.lon - hit, 10, 99));
}
export function longevityYearly(p, a, gamesPlayed) {
  if (p.lon == null) p.lon = initLongevity(p);
  // a healthy full season keeps it steady; age and heavy use wear it down slowly
  let d = a >= 30 ? -1.2 : a >= 27 ? -0.5 : 0.3;
  if (gamesPlayed >= 15) d += 0.8;
  if ((p.pers?.work ?? 0.5) > 0.7) d += 0.5;
  p.lon = Math.round(clamp(p.lon + d + gauss(0, 0.8), 10, 99));
}

// Season-end trait changes: earned by production and awards, lost by decline. Upgrades are less common than downgrades.
export function devChanges(entries) {
  const Lg = G.L;
  const s = Lg.meta.season;
  const out = [];
  for (const { p, perfGap, g, a } of entries) {
    const i = DEV.indexOf(p.dev || 'Normal');
    const aw = (p.awards || []).filter((x) => x.s === s).map((x) => x.type);
    const big = aw.some((t) => ['MVP', 'OPOY', 'DPOY', 'OROY', 'DROY', 'AP1'].includes(t));
    let up = 0;
    if (g >= 12 && perfGap >= 6) up += 0.25 + (perfGap - 6) * 0.04;
    if (big) up += 0.35;
    else if (aw.includes('AP2') || aw.includes('PB')) up += 0.1;
    if (a >= 31) up *= 0.4;
    if (i < 3 && rnd() < up) { p.dev = DEV[i + 1]; out.push({ p, dir: 1 }); continue; }
    let down = 0;
    if (g >= 10 && perfGap <= -7) down += 0.25;
    if (a >= 31) down += 0.08 * (a - 30);
    if (i > 0 && rnd() < down * 0.6) { p.dev = DEV[i - 1]; out.push({ p, dir: -1 }); }
  }
  for (const x of out.filter((x) => x.dir > 0 && x.p.r.ovr >= 78).slice(0, 4)) {
    news(`${x.p.fn} ${x.p.ln}'s breakout season earned him a ${x.p.dev} development trait.`, { type: 'dev', pids: [x.p.pid], tids: [x.p.tid] });
  }
  return out;
}

// Real-life reputations the stats can't see. Keys are "First Last" as displayed. Values nudge the 0-1 dims.
// diva = ego+media+volatility, leader = lead+work, etc. Kept to widely reported, football-relevant traits.
const ARCH = {
  diva: { ego: 0.9, media: 0.82, volat: 0.72, greed: 0.65 },
  hothead: { volat: 0.85, ego: 0.65 },
  leader: { lead: 0.88, work: 0.82, volat: 0.15, ego: 0.35 },
  gymrat: { work: 0.92 },
  money: { greed: 0.85 },
  ring: { win: 0.88 },
  loyal: { loyal: 0.88, greed: 0.35 },
  teamfirst: { ego: 0.18, greed: 0.3, volat: 0.15 },
  media: { media: 0.88, ego: 0.65 },
};
const KNOWN = {
  'George Pickens': ['diva', 'hothead'], 'Tyreek Hill': ['diva', 'hothead'], 'Jalen Ramsey': ['diva', 'hothead'], 'Stefon Diggs': ['diva'],
  'A.J. Brown': ['hothead', 'media'], 'Ja\'Marr Chase': ['media', 'money'], 'Micah Parsons': ['media', 'money'], 'Myles Garrett': ['media', 'money', 'ring'],
  'Aaron Rodgers': ['media', 'ring'], 'Travis Kelce': ['media', 'leader'], 'Deebo Samuel': ['money'], 'Trey Hendrickson': ['money'], 'Haason Reddick': ['money'],
  'Brandon Aiyuk': ['money'], 'Tee Higgins': ['money'], 'CeeDee Lamb': ['money', 'media'], 'Dak Prescott': ['money', 'leader'], 'Kirk Cousins': ['money'],
  'Jaire Alexander': ['hothead'], 'Rashee Rice': ['hothead'], 'Jameson Williams': ['hothead'], 'Baker Mayfield': ['leader', 'hothead'],
  'Patrick Mahomes': ['leader', 'ring'], 'Josh Allen': ['leader', 'teamfirst'], 'Joe Burrow': ['leader'], 'Lamar Jackson': ['leader', 'loyal'], 'Jalen Hurts': ['leader', 'gymrat'],
  'Matthew Stafford': ['leader'], 'Justin Herbert': ['leader', 'teamfirst'], 'C.J. Stroud': ['leader'], 'Jayden Daniels': ['leader', 'gymrat'], 'Drake Maye': ['leader'],
  'T.J. Watt': ['gymrat', 'leader'], 'Cameron Heyward': ['leader', 'loyal', 'gymrat'], 'Cam Heyward': ['leader', 'loyal', 'gymrat'], 'Fred Warner': ['leader', 'gymrat'],
  'Roquan Smith': ['leader'], 'Bobby Wagner': ['leader', 'gymrat'], 'Calais Campbell': ['leader', 'ring'], 'Von Miller': ['ring', 'media'], 'Davante Adams': ['ring', 'money'],
  'Justin Jefferson': ['gymrat', 'media'], 'Puka Nacua': ['gymrat'], 'Amon-Ra St. Brown': ['gymrat'], 'Cooper Kupp': ['gymrat'], 'Derrick Henry': ['gymrat', 'teamfirst'],
  'Saquon Barkley': ['teamfirst', 'leader'], 'Christian McCaffrey': ['gymrat'], 'Jason Kelce': ['leader'], 'Lane Johnson': ['loyal', 'leader'], 'Trent Williams': ['ring'],
  'Jeffery Simmons': ['leader'], 'Chris Jones': ['money', 'media'], 'Quinnen Williams': ['money'], 'Aaron Donald': ['gymrat', 'leader'], 'Maxx Crosby': ['gymrat', 'leader', 'loyal'],
  'Nick Bosa': ['money'], 'Sauce Gardner': ['media'], 'Jaylen Warren': ['gymrat', 'teamfirst'], 'Russell Wilson': ['media', 'gymrat'], 'Kyler Murray': ['money'],
  'Zay Flowers': ['gymrat'], 'Brock Purdy': ['teamfirst', 'leader'], 'Jared Goff': ['teamfirst'], 'Kenny Pickett': ['teamfirst'], 'Brian Burns': ['money'],
};
export function applyKnownPersonality(p) {
  const tags = KNOWN[`${p.fn} ${p.ln}`] || (p.legal ? KNOWN[`${p.legal} ${p.ln}`] : null);
  if (!tags || !p.pers) return;
  for (const t of tags) for (const [k, v] of Object.entries(ARCH[t])) p.pers[k] = clamp(v + gauss(0, 0.04), 0.02, 0.98);
}
