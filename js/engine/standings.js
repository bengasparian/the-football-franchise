// Standings with NFL tiebreakers, playoff seeding and clinch/elimination markers.
import { G } from './core.js';

export function computeStandings(season = G.L.meta.season) {
  const Lg = G.L;
  const T = Lg.teams;
  const st = {};
  for (const t of T) st[t.tid] = { tid: t.tid, w: 0, l: 0, t: 0, pf: 0, pa: 0, gp: 0, dw: 0, dl: 0, dt: 0, cw: 0, cl: 0, ct: 0, h2h: {}, opps: [], beat: [], streak: 0, last5: [], home: [0, 0, 0], away: [0, 0, 0], left: 0 };
  const games = Lg.games.filter((g) => g.s === season && g.type === 'REG');
  for (const g of games) {
    if (!g.played) { st[g.h].left++; st[g.a].left++; continue; }
    const H = st[g.h], A = st[g.a];
    const sameDiv = T[g.h].conf === T[g.a].conf && T[g.h].div === T[g.a].div;
    const sameConf = T[g.h].conf === T[g.a].conf;
    H.gp++; A.gp++; H.pf += g.hs; H.pa += g.as; A.pf += g.as; A.pa += g.hs;
    H.opps.push(g.a); A.opps.push(g.h);
    const res = g.hs > g.as ? 1 : g.hs < g.as ? -1 : 0;
    const rec = (X, r, opp, isHome) => {
      if (r === 1) { X.w++; X.beat.push(opp); } else if (r === -1) X.l++; else X.t++;
      if (sameDiv) { if (r === 1) X.dw++; else if (r === -1) X.dl++; else X.dt++; }
      if (sameConf) { if (r === 1) X.cw++; else if (r === -1) X.cl++; else X.ct++; }
      const h = (X.h2h[opp] ||= [0, 0, 0]); if (r === 1) h[0]++; else if (r === -1) h[1]++; else h[2]++;
      const ha = isHome ? X.home : X.away; if (r === 1) ha[0]++; else if (r === -1) ha[1]++; else ha[2]++;
      X.last5.push(r); if (X.last5.length > 5) X.last5.shift();
      X.streak = r === 1 ? (X.streak > 0 ? X.streak + 1 : 1) : r === -1 ? (X.streak < 0 ? X.streak - 1 : -1) : 0;
    };
    rec(H, res, g.a, true); rec(A, -res, g.h, false);
  }
  const pct = (x) => (x.w + x.t * 0.5) / Math.max(1, x.w + x.l + x.t);
  for (const k in st) {
    const x = st[k];
    x.pct = pct(x);
    x.dpct = (x.dw + x.dt * 0.5) / Math.max(1, x.dw + x.dl + x.dt);
    x.cpct = (x.cw + x.ct * 0.5) / Math.max(1, x.cw + x.cl + x.ct);
    x.maxW = x.w + x.left;
  }
  for (const k in st) {
    const x = st[k];
    x.sov = x.beat.length ? x.beat.reduce((a, o) => a + st[o].pct, 0) / x.beat.length : 0;
    x.sos = x.opps.length ? x.opps.reduce((a, o) => a + st[o].pct, 0) / x.opps.length : 0.5;
  }
  Lg.standingsCache = st;
  return st;
}

function commonPct(st, a, b) {
  const A = st[a], B = st[b];
  const common = A.opps.filter((o) => B.opps.includes(o) && o !== a && o !== b);
  const uniq = [...new Set(common)];
  if (uniq.length < 4) return null;
  const rec = (X, tid) => { let w = 0, n = 0; for (const o of uniq) { const h = X.h2h[o]; if (h) { w += h[0] + h[2] * 0.5; n += h[0] + h[1] + h[2]; } } return n ? w / n : 0; void tid; };
  return [rec(A, a), rec(B, b)];
}
function h2hPct(st, a, group) {
  let w = 0, n = 0;
  for (const o of group) { if (o === a) continue; const h = st[a].h2h[o]; if (h) { w += h[0] + h[2] * 0.5; n += h[0] + h[1] + h[2]; } }
  return n ? w / n : null;
}
function commonRec(st, block) {
  // record in games against opponents every team in the block played
  const sets = block.map((t) => new Set(st[t].opps));
  const common = [...sets[0]].filter((o) => !block.includes(o) && sets.every((x) => x.has(o)));
  if (common.length < 4) return null;
  return block.map((t) => { let w = 0, n = 0; for (const o of common) { const h = st[t].h2h[o]; if (h) { w += h[0] + h[2] * 0.5; n += h[0] + h[1] + h[2]; } } return n ? w / n : 0; });
}

// NFL tiebreaking procedure. Teams are grouped by win pct; each tied block is resolved step by step. When a step
// separates out the best team(s), the remaining teams start the procedure over (two-club rules if two remain).
export function breakTies(st, group, division) {
  const sorted = [...group].sort((a, b) => st[b].pct - st[a].pct);
  const out = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && Math.abs(st[sorted[j + 1]].pct - st[sorted[i]].pct) < 1e-9) j++;
    out.push(...resolveBlock(st, sorted.slice(i, j + 1), division));
    i = j + 1;
  }
  return out;
}
function resolveBlock(st, block, division) {
  if (block.length <= 1) return block;
  const best = bestOf(st, block, division);
  return [best, ...resolveBlock(st, block.filter((t) => t !== best), division)];
}
function bestOf(st, block, division) {
  if (block.length === 1) return block[0];
  const two = block.length === 2;
  const steps = [];
  // 1. head-to-head (two clubs: if they played; 3+: in a division all play each other, for wild cards only a sweep counts)
  steps.push((t) => {
    if (two) { const h = st[t].h2h[block.find((x) => x !== t)]; return h ? (h[0] + h[2] * 0.5) / (h[0] + h[1] + h[2]) : null; }
    if (division) return h2hPct(st, t, block);
    const allPlayed = block.every((o) => o === t || st[t].h2h[o]);
    if (!block.every((x) => block.every((y) => x === y || st[x].h2h[y]))) {
      // sweep rule: a team that beat every other club advances; one that lost to all drops
      const beatAll = block.every((o) => o === t || (st[t].h2h[o] && st[t].h2h[o][1] === 0 && st[t].h2h[o][2] === 0 && st[t].h2h[o][0] > 0));
      return beatAll ? 1 : 0.5;
    }
    return allPlayed ? h2hPct(st, t, block) : null;
  });
  if (division) steps.push((t) => st[t].dpct);
  if (division) steps.push('common');
  steps.push((t) => st[t].cpct);
  if (!division) steps.push('common');
  steps.push((t) => st[t].sov);
  steps.push((t) => st[t].sos);
  steps.push((t) => st[t].pf - st[t].pa);
  steps.push((t) => st[t].pf);
  for (const step of steps) {
    let vals;
    if (step === 'common') { const c = commonRec(st, block); if (!c) continue; vals = c; }
    else vals = block.map(step);
    if (vals.some((v) => v == null)) continue;
    const mx = Math.max(...vals);
    const top = block.filter((_, k) => Math.abs(vals[k] - mx) < 1e-9);
    if (top.length === block.length) continue;
    if (top.length === 1) return top[0];
    return bestOf(st, top, division); // restart with the clubs still tied
  }
  return [...block].sort((a, b) => a - b)[0]; // coin toss
}

export function divisionOrder(st, conf, div) {
  const Lg = G.L;
  const ts = Lg.teams.filter((t) => t.conf === conf && t.div === div).map((t) => t.tid);
  return breakTies(st, ts, true);
}

export function playoffSeeds(st, conf) {
  const Lg = G.L;
  const n = Lg.rules.playoffTeamsPerConf || 7;
  const divs = ['East', 'North', 'South', 'West'];
  const winners = divs.map((d) => divisionOrder(st, conf, d)[0]);
  const sortedW = breakTies(st, winners, false);
  const rest = Lg.teams.filter((t) => t.conf === conf && !winners.includes(t.tid)).map((t) => t.tid);
  // wild cards: best non-division-winner from each division first within ties (apply division tiebreak inside same division)
  const wc = [];
  const pool = [...rest];
  while (wc.length < n - 4 && pool.length) {
    // candidates: top remaining team of each division
    const tops = divs.map((d) => {
      const dt = divisionOrder(st, conf, d).filter((x) => pool.includes(x));
      return dt[0];
    }).filter((x) => x != null);
    const best = breakTies(st, tops, false)[0];
    wc.push(best);
    pool.splice(pool.indexOf(best), 1);
  }
  let seeds;
  if (Lg.rules.reseedDivisionWinners) seeds = breakTies(st, [...winners, ...wc], false);
  else seeds = [...sortedW, ...wc];
  return { seeds, out: pool, winners };
}

export function clinchMarkers(st) {
  const Lg = G.L;
  const marks = {};
  for (const conf of ['AFC', 'NFC']) {
    const { seeds } = playoffSeeds(st, conf);
    const confTeams = Lg.teams.filter((t) => t.conf === conf).map((t) => t.tid);
    const sorted = [...confTeams].sort((a, b) => st[b].w - st[a].w);
    const n = Lg.rules.playoffTeamsPerConf || 7;
    for (const tid of confTeams) {
      const x = st[tid];
      // max wins of teams that could pass us
      const others = confTeams.filter((o) => o !== tid);
      const passers = others.filter((o) => st[o].maxW >= x.w).length;
      const divRivals = Lg.teams.filter((t) => t.conf === conf && t.div === Lg.teams[tid].div && t.tid !== tid).map((t) => t.tid);
      let m = '';
      if (divRivals.every((o) => st[o].maxW < x.w)) m = 'z';
      else if (passers < n) m = 'x';
      const ahead = others.filter((o) => st[o].w > x.maxW).length;
      if (ahead >= n && !divRivals.every((o) => st[o].w <= x.maxW) ) m = 'e';
      if (ahead >= n && divRivals.some((o) => st[o].w > x.maxW)) m = 'e';
      if (seeds[0] === tid && others.every((o) => st[o].maxW < x.w)) m = '*';
      marks[tid] = m;
    }
    void sorted;
  }
  return marks;
}
