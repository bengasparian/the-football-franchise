// Create a new league from the real NFL data snapshot.
import { G, seedRng, rnd, gauss, clamp, age, nextId, rngState, news, capFor } from './core.js';
import { CAP_2026, RULES_DEFAULT, DEFAULT_SLIDERS, TEAM_INFO, OWNERS, NO_TAX } from './const.js';
import { genAttrs, initTalent, computeOvr, projectPeak } from './ratings.js';
import { genPersonality } from './personality.js';
import { contractFromData, makeContract, minDeal, psDeal, rookieContract, marketValue, teamCap } from './contracts.js';
import { initCoaches } from './coaches.js';
import { autoDepth } from './roster.js';
import { genDraftClass } from './draft.js';
import { initFinances, setOwnerGoals } from './finance.js';
import { generateSchedule } from './season.js';
import { startFantasyDraft } from './fantasy.js';

const REAL_KEYS = { pntyd: 'pntYd' };

export function createLeague(data, opts) {
  const { userTeams = [], name = 'My Franchise', fantasy = false, seed = Date.now(), sliders = {}, online = false } = opts;
  // a fantasy draft always leads into the preseason: real results and stats would make no sense on redrafted rosters
  const start = fantasy ? 'preseason' : (opts.start || 'current');
  seedRng(seed);
  const S0 = data.meta.season;
  const L = {
    version: 3,
    meta: {
      name, season: S0, phase: 'REGULAR_SEASON', week: 1, userTids: [], created: Date.now(), caps: { [S0]: CAP_2026 }, startMode: start,
      fantasy, nextId: 1, dataBuilt: data.meta.built, online, seed,
    },
    settings: { sliders: { ...DEFAULT_SLIDERS, ...sliders }, autoCoaching: false, autoUser: { depth: true, injuries: true, roster: false }, aiTradesUser: true },
    rules: { ...RULES_DEFAULT },
    teams: [], players: {}, coaches: {}, picks: [], games: [], news: [], transactions: [], awards: {}, history: { seasons: {} },
    fa: null, draft: null, proposals: null, events: [], offers: [], champions: [], records: {}, hof: [],
  };
  G.L = L;
  // seed known champions
  L.champions.push({ s: 2025, tid: null, abbr: 'SEA', note: 'Super Bowl LX champion (real life)' });

  data.teams.forEach((t, i) => {
    const info = TEAM_INFO[t.abbr] || [65000, 2, 0];
    L.teams.push({
      tid: i, abbr: t.abbr, region: t.region, name: t.name, conf: t.conf, div: t.div, c1: t.c1, c2: t.c2, logo: t.logo,
      stadium: { cap: info[0], dome: !!info[2] }, market: info[1], noTax: NO_TAX.has(t.abbr),
      depth: {}, staff: {}, dead: [], rollover: {}, strategy: 'neutral', chem: 0.62,
      owner: { name: OWNERS[t.abbr] || 'Ownership group', patience: clamp(gauss(0.55, 0.15), 0.2, 0.9), spend: clamp(gauss(0.6, 0.15), 0.2, 0.95), meddle: clamp(gauss(0.35, 0.15), 0.05, 0.9) },
      jobSec: 72, goals: [], expectWins: 8.5,
    });
  });
  const tidOf = {};
  L.teams.forEach((t) => { tidOf[t.abbr] = t.tid; });
  userTeams.forEach((abbr) => { if (tidOf[abbr] != null) L.meta.userTids.push(tidOf[abbr]); });

  // ---- players
  for (const d of data.players) {
    const p = importPlayer(d, tidOf, S0);
    L.players[p.pid] = p;
  }

  // ---- coaches & finances & picks
  // unit performance this season (points per game, ranked) for coordinator ratings
  const unit = {};
  {
    const acc = {};
    for (const g of data.games) if (g.hs != null) {
      (acc[g.h] ||= { pf: 0, pa: 0, n: 0 }); (acc[g.a] ||= { pf: 0, pa: 0, n: 0 });
      acc[g.h].pf += g.hs; acc[g.h].pa += g.as; acc[g.h].n++; acc[g.a].pf += g.as; acc[g.a].pa += g.hs; acc[g.a].n++;
    }
    const ab = Object.keys(acc);
    if (ab.length >= 30) {
      const offR = [...ab].sort((x, y) => acc[y].pf / acc[y].n - acc[x].pf / acc[x].n);
      const defR = [...ab].sort((x, y) => acc[x].pa / acc[x].n - acc[y].pa / acc[y].n);
      for (const a of ab) unit[a] = { off: 92 - (offR.indexOf(a) / 31) * 30, def: 92 - (defR.indexOf(a) / 31) * 30 };
    }
  }
  initCoaches(data.coaches, unit);
  for (const t of L.teams) initFinances(t);
  for (const s of [S0 + 1, S0 + 2, S0 + 3]) addSeasonPicks(s);

  // ---- schedule & real results
  const real = start === 'current';
  for (const g of data.games) {
    const game = { gid: nextId('g'), s: S0, w: g.w, type: 'REG', h: tidOf[g.h], a: tidOf[g.a], d: g.d, t: g.t, played: false };
    if (real && g.hs != null) { game.played = true; game.hs = g.hs; game.as = g.as; game.real = true; if (g.ot) game.ot = true; }
    L.games.push(game);
  }
  if (real) {
    L.meta.phase = 'REGULAR_SEASON';
    L.meta.week = Math.min(18, (data.meta.lastFullWeek || 0) + 1);
    importRealSeasonStats(data, tidOf, S0);
  } else {
    // fresh season: everyone healthy, IR players return, rosters trimmed to 53
    for (const p of Object.values(L.players)) {
      p.inj = null;
      if (p.status === 'IR') p.status = 'ACT';
      p.stats[S0] = undefined; delete p.stats[S0];
      p.log = [];
    }
    L.meta.phase = start === 'preseason' ? 'PRESEASON' : 'REGULAR_SEASON';
    L.meta.week = start === 'preseason' ? 0 : 1;
  }
  for (const t of L.teams) autoDepth(t.tid);
  // Real teams roll unused cap forward and are always compliant. The public data has no rollover
  // amounts, so give any team that would start over the cap a rollover that puts it just under.
  for (const t of L.teams) {
    const c = teamCap(t.tid, S0);
    if (c.space < 3e6) t.rollover[S0] = Math.round((3e6 - c.space + rnd() * 4e6) / 1e5) * 1e5;
  }
  // expected wins (preseason projection) from roster strength
  setExpectations();
  for (const ut of L.meta.userTids) setOwnerGoals(L.teams[ut]);
  // draft class for next April, scouting during the season
  genDraftClass(S0 + 1);
  if (fantasy) {
    L.meta.fantasyFrom = L.meta.phase;
    L.meta.phase = 'FANTASY_DRAFT';
    startFantasyDraft();
  }
  news(`Welcome to THE Football Franchise. ${L.meta.userTids.map((t) => L.teams[t].region + ' ' + L.teams[t].name).join(', ') || 'You'} — the front office is yours.`, { type: 'system' });
  for (const p of Object.values(L.players)) { if (p.r) for (const k of ['tal', 'pot', 'potEst']) if (p.r[k] != null) p.r[k] = Math.round(p.r[k] * 10) / 10; if (p.pers) for (const k in p.pers) p.pers[k] = Math.round(p.pers[k] * 100) / 100; }
  L.meta.rng = rngState();
  return L;
}

function importPlayer(d, tidOf, S0) {
  const tid = d.tm && tidOf[d.tm] != null ? tidOf[d.tm] : -1;
  const [by, bm, bd] = d.bd ? d.bd.split('-').map(Number) : [S0 - 24, 6, 1];
  const p = {
    pid: d.id, fn: d.nick && d.nick.length < 12 ? d.nick : d.fn, ln: d.ln, legal: d.fn, pos: d.pos, tid,
    status: tid < 0 ? 'FA' : d.st === 'PS' ? 'PS' : d.st === 'IR' ? 'IR' : 'ACT',
    jn: d.jn, born: { y: by, m: bm, d: bd }, ht: d.ht, wt: d.wt, college: d.col, exp: d.exp || 0,
    draft: d.dr ? { y: d.dr.y, r: d.dr.r, p: d.dr.p, tm: d.dr.tm } : null,
    hs: d.hs, stats: {}, log: [], awards: [], injHist: [], morale: Math.round(clamp(gauss(66, 10), 30, 95)),
    realPB: d.dr?.pb || 0, realAP: d.dr?.ap || 0, snap: d.snap,
  };
  const a = age(p, S0);
  const attrs = genAttrs(p.pos, d.ovr, { hints: d.h || {}, cmb: d.cmb, wt: d.wt, ageY: a });
  p.r = { ovr: computeOvr(p.pos, attrs), a: attrs, hist: [] };
  // fine-tune so displayed matches model overall exactly
  if (p.r.ovr !== d.ovr) { const w = Object.keys(attrs); void w; p.r.ovr = d.ovr; }
  p.r.ovrStart = p.r.ovr;
  // personality from real context
  const teams = new Set(Object.values(d.car || {}).map((x) => x.tm));
  if (d.tm) teams.add(d.tm);
  const homegrown = d.dr && d.dr.tm === d.tm && p.exp >= 3;
  const prior = d.dr ? 80 - Math.log(d.dr.p) * 4 : 56;
  const info = { age: a, homegrown, teamsCount: teams.size, changedTeamsFA: d.k?.type === 'UFA' && !homegrown, overachiever: d.ovr - prior > 10,
    underachiever: d.dr?.r === 1 && d.ovr < 70 && p.exp >= 3, penaltyRate: d.pen || 0 };
  p.pers = genPersonality(p, info);
  initTalent(p, a);
  p.r.potEst = clamp(p.r.pot + gauss(0, 3), 30, 99);
  p.r.hist.push({ k: `${S0}-0`, s: S0, w: 0, o: p.r.ovr });
  p.yrsWithTeam = homegrown ? p.exp : Math.min(p.exp, Math.max(1, Math.round(rnd() * 3)));
  // contract
  if (p.status === 'PS') p.contract = psDeal(p, S0);
  else if (d.k && d.k.years.some((y) => y[0] >= S0) && tid >= 0) {
    p.contract = contractFromData(d.k, p.exp);
    if (d.k.type === 'Franchise') p.contract.tag = 'F';
    if (d.k.type === 'Transition') p.contract.tag = 'T';
    if (p.contract.rookie && p.draft?.r === 1 && p.contract.exp - (p.draft.y) === 3) p.contract.option5 = 'pending';
  } else if (tid >= 0) {
    if (p.exp === 0 && p.draft?.r >= 1 && p.draft.y === S0) p.contract = rookieContract(p.draft.p, S0, p.draft.r);
    else p.contract = minDeal(p, S0);
  } else p.contract = null;
  // real career stats
  for (const yr in d.car || {}) {
    const line = mapReal(d.car[yr]);
    const tmAbbr = d.car[yr].tm;
    p.stats[yr] = { REG: line, tm: tmAbbr ? tidOf[tmAbbr] ?? null : null, real: true };
  }
  p._wk = d.wk || [];
  return p;
}
function mapReal(x) {
  const o = {};
  for (const k in x) {
    if (k === 'tm' || k === 'w' || k === 'op') continue;
    const kk = REAL_KEYS[k] || k;
    o[kk] = x[k];
  }
  if (x.fum) { o.fumL = x.fum; }
  return o;
}

function importRealSeasonStats(data, tidOf, S0) {
  const L = G.L;
  const lastW = (data.meta.lastFullWeek || 0) + 1;
  for (const p of Object.values(L.players)) {
    const wk = p._wk || [];
    if (!wk.length) continue;
    const tot = { g: 0 };
    for (const w of wk) {
      if (w.w >= lastW + 1) continue;
      const line = mapReal(w);
      line.g = 1;
      for (const k in line) tot[k] = (tot[k] || 0) + line[k];
      p.log.push({ s: S0, w: w.w, opp: w.op ? tidOf[w.op] : null, tm: w.tm ? tidOf[w.tm] : null, l: line, real: true });
    }
    if (tot.g) p.stats[S0] = { REG: tot, tm: p.tid >= 0 ? p.tid : null, real: true };
  }
  for (const p of Object.values(L.players)) delete p._wk;
  // injuries from the real latest report
  for (const d of data.players) {
    const p = L.players[d.id];
    if (!p || !d.inj) continue;
    p.inj = { type: d.inj.type, wk: d.inj.ir ? 4 + Math.floor(rnd() * 6) : d.inj.wk, s: S0, w: lastW, se: false };
    if (p.status === 'IR') p.irWeek = Math.max(1, lastW - 3);
  }
}

export function addSeasonPicks(s) {
  const L = G.L;
  for (const t of L.teams) for (let rd = 1; rd <= 7; rd++) {
    if (L.picks.some((x) => x.s === s && x.rd === rd && x.orig === t.tid && !x.comp)) continue;
    L.picks.push({ id: nextId('dp'), s, rd, orig: t.tid, tid: t.tid });
  }
}

export function setExpectations() {
  const L = G.L;
  const strengths = L.teams.map((t) => ({ t, v: rosterStrength(t.tid) }));
  strengths.sort((a, b) => b.v - a.v);
  strengths.forEach((x, i) => { x.t.expectWins = Math.round((12.6 - i * 0.29) * 2) / 2; x.t.powerRank = i + 1; });
  // hidden season-long variance the projections can't see: scheme fit, locker room, health luck, a QB
  // taking a leap or regressing. This is why some projected contenders flop and some sleepers break out.
  const up = L.settings?.sliders?.upsetFactor ?? 1;
  for (const t of L.teams) t.sf = clamp(gauss(0, 2.1 * up), -5 * up, 5 * up);
}
export function rosterStrength(tid) {
  const L = G.L;
  const ps = Object.values(L.players).filter((p) => p.tid === tid && p.status !== 'PS');
  const best = (pos, n) => ps.filter((p) => p.pos === pos && !(p.inj && p.inj.wk > 3)).sort((a, b) => b.r.ovr - a.r.ovr).slice(0, n);
  const v = (pos, n, w) => { const arr = best(pos, n); return arr.length ? arr.reduce((a, p) => a + p.r.ovr, 0) / n * w : 40 * w; };
  return v('QB', 1, 0.24) + v('WR', 3, 0.1) + v('TE', 1, 0.04) + v('RB', 1, 0.03) + v('OT', 2, 0.09) + v('OG', 2, 0.06) + v('C', 1, 0.03) +
    v('EDGE', 2, 0.11) + v('DT', 2, 0.08) + v('LB', 2, 0.06) + v('CB', 3, 0.1) + v('S', 2, 0.06);
}
void makeContract; void marketValue; void projectPeak; void capFor; void generateSchedule;
