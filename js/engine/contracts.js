// Contracts & salary cap: market value, contract structure, cap hits, dead money, releases,
// restructures, extensions, rookie scale, franchise/transition tags, fifth-year options, negotiation.
import { G, rnd, gauss, clamp, interp, age, capFor, minSalary, psSalary, news, transaction, fmtMoney, isUser } from './core.js';
import { ROOKIE_SCALE_2026, TAG_2026, TAG_GROUP, CAP_2026 } from './const.js';

// share of cap by overall (calibrated to real 2024-26 veteran contracts vs our model ratings)
const PAY = {
  QB: [[55, .0029], [62, .004], [70, .017], [80, .064], [86, .125], [90, .165], [95, .2], [99, .218]],
  RB: [[55, .0029], [62, .0035], [70, .010], [80, .026], [90, .060], [95, .075], [99, .085]],
  WR: [[55, .0029], [62, .0035], [70, .009], [80, .030], [90, .100], [95, .135], [99, .155]],
  TE: [[55, .0029], [62, .0035], [70, .011], [80, .029], [90, .065], [95, .075], [99, .085]],
  OT: [[55, .0029], [62, .0035], [70, .010], [80, .037], [90, .095], [95, .110], [99, .125]],
  OG: [[55, .0029], [62, .0035], [70, .008], [80, .027], [90, .075], [95, .090], [99, .100]],
  C: [[55, .0029], [62, .0035], [70, .007], [80, .020], [90, .055], [95, .068], [99, .075]],
  EDGE: [[55, .0029], [62, .004], [70, .015], [80, .052], [90, .135], [95, .160], [99, .180]],
  DT: [[55, .0029], [62, .0035], [70, .0115], [80, .038], [90, .100], [95, .120], [99, .135]],
  LB: [[55, .0029], [62, .0035], [70, .008], [80, .021], [90, .055], [95, .070], [99, .080]],
  CB: [[55, .0029], [62, .0035], [70, .0086], [80, .028], [90, .085], [95, .108], [99, .120]],
  S: [[55, .0029], [62, .0035], [70, .0086], [80, .025], [90, .065], [95, .080], [99, .090]],
  K: [[55, .0029], [65, .003], [70, .0035], [80, .0075], [90, .018], [95, .023], [99, .026]],
  P: [[55, .0029], [65, .003], [70, .0036], [80, .0069], [90, .012], [95, .015], [99, .017]],
  LS: [[55, .0029], [70, .0035], [80, .0045], [90, .006], [99, .007]],
  FB: [[55, .0029], [70, .0035], [80, .006], [90, .010], [99, .013]],
};
const AGE_F = [[22, 1.06], [26, 1.05], [28, 1.0], [29, .97], [30, .91], [31, .84], [32, .75], [33, .65], [34, .56], [36, .45], [40, .35]];
const RB_AGE_F = [[22, 1.06], [25, 1.03], [26, 1.0], [27, .93], [28, .84], [29, .73], [30, .62], [32, .48], [36, .35]];

export function marketValue(p, forSeason = null) {
  const Lg = G.L;
  const s = forSeason ?? (['REGULAR_SEASON', 'PRESEASON', 'PLAYOFFS', 'SEASON_END', 'RESIGN'].includes(Lg.meta.phase) ? Lg.meta.season + 1 : Lg.meta.season);
  const cap = capFor(s);
  const a = age(p, s);
  // teams pay for expected future: blend displayed rating with (scouted) potential for young players
  let o = p.r.ovr;
  if (a <= 26 && p.r.potEst) o = o * 0.8 + Math.min(p.r.potEst, o + 6) * 0.2;
  const pct = interp(PAY[p.pos] || PAY.LB, o) * interp(p.pos === 'RB' ? RB_AGE_F : AGE_F, a);
  const demand = Lg.settings.sliders.contractDemands ?? 1;
  return Math.max(minSalary(p.exp ?? 0, s), Math.round((pct * cap * demand) / 10000) * 10000);
}

export function idealYears(p) {
  const a = age(p, G.L.meta.season + 1);
  if (p.r.ovr < 66) return 1;
  if (a <= 25) return p.r.ovr >= 82 ? 5 : 3;
  if (a <= 28) return p.r.ovr >= 85 ? 5 : 4;
  if (a <= 30) return 3;
  if (a <= 32) return 2;
  return 1;
}
export function idealGtdPct(p) {
  const o = p.r.ovr;
  return clamp(interp([[60, 0.0], [68, 0.08], [75, 0.25], [82, 0.42], [88, 0.55], [94, 0.65]], o), 0, 0.75);
}

// Build a contract object. years: count, apy, gtd total guaranteed, sbPct share of total as signing bonus
export function makeContract({ start, years, apy, gtd = 0, sbPct = null, rookie = false, min = false, extra = {} }) {
  years = clamp(Math.round(years), 1, 7);
  const total = Math.round(apy * years);
  if (sbPct == null) sbPct = clamp(gtd / Math.max(total, 1) * 0.55, 0, 0.6);
  const sb = Math.round(total * sbPct);
  const proYears = Math.min(years, 5);
  const pro = sb / proYears;
  const restBase = total - sb;
  const w = [];
  for (let i = 0; i < years; i++) w.push(1 + i * 0.06);
  const wsum = w.reduce((a, b) => a + b, 0);
  let gLeft = Math.max(0, gtd - sb);
  const yrs = [];
  for (let i = 0; i < years; i++) {
    const base = Math.max(minSalary(0, start + i), Math.round((restBase * w[i]) / wsum));
    const g = Math.min(base, gLeft);
    gLeft -= g;
    yrs.push({ s: start + i, base, bonus: i < proYears ? Math.round(pro) : 0, gtd: g });
  }
  return { years: yrs, signed: G.L.meta.season, apy: Math.round(apy), total, gtd: Math.round(gtd), exp: start + years - 1, rookie, min, ...extra };
}
export function contractFromData(k, exp) {
  const yrs = k.years.map(([s, base, bonus, gtd]) => ({ s, base: Math.max(0, base), bonus: Math.max(0, bonus), gtd: Math.max(0, gtd) }));
  return {
    years: yrs, signed: k.signed, apy: k.apy, total: k.tot, gtd: k.gtd, exp: yrs[yrs.length - 1].s,
    rookie: k.type === 'Drafted', udfa: k.type === 'UDFA', type: k.type, real: true, exp_yrs: exp,
  };
}
export function capHit(p, s) {
  if (p.status === 'PS' && p.contract?.ps) return p.contract.ps;
  const c = p.contract;
  if (!c) return 0;
  const y = c.years.find((x) => x.s === s);
  if (!y) return 0;
  return y.base + y.bonus;
}
export function yearsLeft(p) { return p.contract ? p.contract.exp - G.L.meta.season + (inSeasonPhase() ? 0 : 1) : 0; }
export function inSeasonPhase() { return ['PRESEASON', 'REGULAR_SEASON', 'PLAYOFFS'].includes(G.L.meta.phase); }
// the "cap year" currently being managed (offseason phases already manage next season)
export function capSeason() {
  // once the season is over, every cap view looks at the next league year
  return ['SEASON_END', 'RESIGN'].includes(G.L.meta.phase) ? G.L.meta.season + 1 : G.L.meta.season;
}

export function teamCap(tid, s = capSeason()) {
  const Lg = G.L;
  const t = Lg.teams[tid];
  const ps = Object.values(Lg.players).filter((p) => p.tid === tid);
  const offseason = ['SEASON_END', 'RESIGN', 'FREE_AGENCY', 'LEAGUE_MEETING', 'DRAFT', 'POST_DRAFT', 'TRAINING_CAMP', 'FANTASY_DRAFT'].includes(Lg.meta.phase);
  let hits = ps.map((p) => ({ p, h: p.status === 'PS' ? (p.contract?.ps || psSalary(p.exp, s)) : capHit(p, s) }));
  let used;
  if (offseason) {
    const sorted = hits.filter((x) => x.p.status !== 'PS').sort((a, b) => b.h - a.h);
    used = sorted.slice(0, 51).reduce((a, x) => a + x.h, 0);
  } else used = hits.reduce((a, x) => a + x.h, 0);
  const dead = (t.dead || []).filter((d) => d.s === s).reduce((a, d) => a + d.amt, 0);
  const cap = capFor(s) + (t.rollover?.[s] || 0);
  return { cap, used: used + dead, dead, space: cap - used - dead, season: s, rollover: t.rollover?.[s] || 0 };
}
export const capSpace = (tid, s) => teamCap(tid, s).space;

export function futureCommitments(tid, years = 5) {
  const Lg = G.L;
  const s0 = capSeason();
  const out = [];
  for (let s = s0; s < s0 + years; s++) {
    const ps = Object.values(Lg.players).filter((p) => p.tid === tid && p.status !== 'PS');
    const used = ps.reduce((a, p) => a + capHit(p, s), 0);
    const dead = (Lg.teams[tid].dead || []).filter((d) => d.s === s).reduce((a, d) => a + d.amt, 0);
    out.push({ s, cap: capFor(s), used: used + dead, dead, n: ps.filter((p) => capHit(p, s) > 0).length });
  }
  return out;
}

// dead money if released now (june1 = post-June 1 designation splits acceleration)
export function deadMoneyIfCut(p, { june1 = false } = {}) {
  const c = p.contract;
  if (!c || p.status === 'PS') return { now: 0, next: 0, save: p.status === 'PS' ? 0 : 0 };
  const s = capSeason();
  const rem = c.years.filter((y) => y.s >= s);
  const curr = rem.find((y) => y.s === s);
  const futurePro = rem.filter((y) => y.s > s).reduce((a, y) => a + y.bonus, 0);
  const gtdRem = rem.reduce((a, y) => a + y.gtd, 0);
  const curHit = curr ? curr.base + curr.bonus : 0;
  let now, next;
  if (june1 && rem.length > 1) { now = (curr?.bonus || 0) + (curr?.gtd || 0); next = futurePro + (gtdRem - (curr?.gtd || 0)); }
  else { now = (curr?.bonus || 0) + futurePro + gtdRem; next = 0; }
  if (inSeasonPhase() && G.L.meta.phase === 'REGULAR_SEASON') {
    // part of this season's base already paid; the rest is saved unless guaranteed
    const frac = (G.L.meta.week - 1) / 18;
    now += Math.round(((curr?.base || 0) - (curr?.gtd || 0)) * frac);
  }
  return { now: Math.round(now), next: Math.round(next), save: Math.round(curHit - now) };
}

export function releasePlayer(pid, { june1 = false, toWaivers = true } = {}) {
  const Lg = G.L;
  const p = Lg.players[pid];
  const t = Lg.teams[p.tid];
  if (!t) return { error: 'Player not on a team' };
  const s = capSeason();
  const dm = deadMoneyIfCut(p, { june1 });
  t.dead ||= [];
  if (dm.now > 0) t.dead.push({ s, amt: dm.now, pid, name: `${p.fn} ${p.ln}` });
  if (dm.next > 0) t.dead.push({ s: s + 1, amt: dm.next, pid, name: `${p.fn} ${p.ln}` });
  removeFromDepth(p);
  const oldTid = p.tid;
  p.tid = -1; p.status = 'FA'; p.contract = null; p.holdout = false; p.tradeReq = null;
  p.lastTeam = oldTid; p.releasedSeason = Lg.meta.season;
  // a starter who gets cut (or an unhappy one) may hold it against the team
  if (p.r.ovr >= 72 && ((p.pers?.ego ?? 0.5) > 0.6 || (p.morale ?? 60) < 40)) (p.grudge ||= {})[oldTid] = { s: Lg.meta.season, why: `Released by ${t.abbr}` };
  p.waiver = toWaivers && (p.exp ?? 0) < 4 && Lg.meta.phase === 'REGULAR_SEASON' ? { from: oldTid, w: Lg.meta.week } : null;
  transaction('release', `${t.abbr} released ${p.pos} ${p.fn} ${p.ln}${dm.now ? ` (${fmtMoney(dm.now)} dead money)` : ''}`, { tids: [oldTid], pids: [pid] });
  return { ok: true, dead: dm };
}
export function removeFromDepth(p) {
  const t = G.L.teams[p.tid];
  if (!t) return;
  for (const k in t.depth) t.depth[k] = t.depth[k].filter((x) => x !== p.pid);
}

// Convert base salary into a prorated bonus to create cap room this year
export function restructurePreview(p) {
  const c = p.contract;
  if (!c || c.rookie || p.status === 'PS') return null;
  const s = capSeason();
  const rem = c.years.filter((y) => y.s >= s);
  if (rem.length < 2) return null;
  const curr = rem[0];
  const conv = Math.max(0, curr.base - minSalary(p.exp ?? 0, s));
  if (conv < 1_000_000) return null;
  const n = Math.min(rem.length, 5);
  const per = conv / n;
  return { convert: conv, saves: Math.round(conv - per), addPerYear: Math.round(per), years: n };
}
export function restructure(pid) {
  const Lg = G.L;
  const p = Lg.players[pid];
  const pr = restructurePreview(p);
  if (!pr) return { error: 'This contract cannot be restructured (needs 2+ years left and base salary above the minimum).' };
  const s = capSeason();
  const rem = p.contract.years.filter((y) => y.s >= s);
  rem[0].base -= pr.convert;
  rem[0].gtd = Math.max(0, rem[0].gtd - pr.convert);
  for (let i = 0; i < pr.years; i++) rem[i].bonus += pr.addPerYear;
  p.contract.restructures = (p.contract.restructures || 0) + 1;
  transaction('restructure', `${Lg.teams[p.tid].abbr} restructured ${p.fn} ${p.ln}'s contract, clearing ${fmtMoney(pr.saves)} of ${s} cap space`, { tids: [p.tid], pids: [pid] });
  return { ok: true, ...pr };
}

// ---------- rookie scale
export function rookieContract(pick, season, round) {
  const ratio = capFor(season) / CAP_2026;
  const total = interp(ROOKIE_SCALE_2026, pick) * ratio;
  const sbPct = interp([[1, 0.66], [10, 0.62], [32, 0.52], [33, 0.42], [64, 0.36], [100, 0.22], [150, 0.09], [200, 0.05], [260, 0.03]], pick);
  const yrs = G.L.rules?.rookieYears || 4;
  const c = makeContract({ start: season, years: yrs, apy: total / yrs, gtd: round === 1 ? total : total * sbPct, sbPct, rookie: true });
  // rookie base salaries start at the minimum and escalate (like the real scale)
  const sb = Math.round(total * sbPct);
  const bases = c.years.map((_, i) => minSalary(i, season + i));
  const extraTotal = total - sb - bases.reduce((a, b) => a + b, 0);
  const extraW = yrs === 3 ? [0.15, 0.35, 0.5] : [0.05, 0.2, 0.33, 0.42];
  c.years.forEach((y, i) => {
    y.base = Math.round(bases[i] + Math.max(0, extraTotal) * (extraW[i] || 0.25));
    y.bonus = Math.round(sb / yrs);
    y.gtd = round === 1 ? y.base : (i === 0 ? y.base : 0);
  });
  c.round = round; c.pick = pick;
  if (round === 1) c.option5 = 'pending';
  return c;
}

// ---------- tags (computed from the league's own salaries after 2026)
export function tagValues(season = capSeason()) {
  const Lg = G.L;
  Lg.tagCache ||= {};
  if (Lg.tagCache[season]) return Lg.tagCache[season];
  const out = {};
  if (season === 2026) { for (const pos in TAG_2026) out[pos] = { F: TAG_2026[pos][0], T: TAG_2026[pos][1] }; }
  else {
    const groups = {};
    for (const p of Object.values(Lg.players)) {
      if (p.tid < 0 || !p.contract) continue;
      const g = TAG_GROUP[p.pos] || p.pos;
      (groups[g] ||= []).push(capHit(p, season - 1) || p.contract.apy);
    }
    const ratio = capFor(season) / capFor(season - 1);
    for (const pos of Object.keys(TAG_2026)) {
      const g = TAG_GROUP[pos] || pos;
      const arr = (groups[g] || []).sort((a, b) => b - a);
      const top5 = arr.slice(0, 5), top10 = arr.slice(0, 10);
      const f = top5.length ? top5.reduce((a, b) => a + b, 0) / top5.length * ratio * 0.92 : TAG_2026[pos][0];
      const tt = top10.length ? top10.reduce((a, b) => a + b, 0) / top10.length * ratio * 0.92 : TAG_2026[pos][1];
      out[pos] = { F: Math.round(f / 1000) * 1000, T: Math.round(tt / 1000) * 1000 };
    }
  }
  Lg.tagCache[season] = out;
  return out;
}
export function applyTag(pid, kind = 'F') {
  const Lg = G.L;
  const p = Lg.players[pid];
  const t = Lg.teams[p.tid];
  const s = Lg.meta.season + 1;
  if (!Lg.rules.franchiseTag) return { error: 'The franchise tag has been abolished by league vote.' };
  if (t.tagUsed === s) return { error: 'You have already used a tag this offseason.' };
  if (!p.contract || p.contract.exp !== Lg.meta.season) return { error: 'Only players with expiring contracts can be tagged.' };
  const tv = tagValues(s)[p.pos];
  const times = p.tagged?.length || 0;
  const prev = capHit(p, Lg.meta.season);
  let amt = kind === 'T' ? tv.T : tv.F;
  amt = Math.max(amt, prev * (times === 0 ? 1.2 : times === 1 ? 1.2 : 1.44));
  if (times >= 1 && kind === 'F') amt = Math.max(amt, prev * 1.2);
  p.contract = makeContract({ start: s, years: 1, apy: amt, gtd: amt, sbPct: 0, extra: { tag: kind } });
  (p.tagged ||= []).push(s);
  t.tagUsed = s;
  p.morale = clamp((p.morale ?? 60) - 6 - (p.pers?.greed ?? 0.5) * 10, 0, 100);
  transaction('tag', `${t.abbr} placed the ${kind === 'T' ? 'transition' : 'franchise'} tag on ${p.pos} ${p.fn} ${p.ln} (${fmtMoney(amt)})`, { tids: [t.tid], pids: [pid] });
  news(`${t.region} ${t.name} ${kind === 'T' ? 'transition' : 'franchise'}-tag ${p.fn} ${p.ln} at ${fmtMoney(amt)}.`, { type: 'tag', tids: [t.tid], pids: [pid] });
  return { ok: true, amount: amt };
}
export function fifthYearOptionValue(p) {
  const s = p.contract.exp + 1;
  const tv = tagValues(G.L.meta.season + 1)[p.pos];
  const pb = (p.awards || []).filter((a) => a.type === 'PB').length;
  const ratio = capFor(s) / capFor(G.L.meta.season + 1);
  const base = pb >= 2 ? tv.F : pb === 1 ? tv.T : tv.T * 0.78;
  return Math.round(base * ratio);
}
export function exerciseOption(pid) {
  const p = G.L.players[pid];
  if (p.contract?.option5 !== 'pending') return { error: 'No fifth-year option available.' };
  const v = fifthYearOptionValue(p);
  const s = p.contract.exp + 1;
  p.contract.years.push({ s, base: v, bonus: 0, gtd: v });
  p.contract.exp = s;
  p.contract.option5 = 'exercised';
  p.contract.rookie5 = true;
  transaction('option', `${G.L.teams[p.tid].abbr} exercised ${p.fn} ${p.ln}'s fifth-year option (${fmtMoney(v)})`, { tids: [p.tid], pids: [pid] });
  return { ok: true, value: v };
}

// ---------- Negotiation
// What a player is really after from a given team, and why. Returns the realistic target APY plus the reasons
// (hometown/loyalty discount, ring chasing, grudges) the UI shows during talks.
export function playerAsk(p, tid, ctx = {}) {
  const Lg = G.L;
  const pers = p.pers || {};
  const mv = marketValue(p);
  const reasons = [];
  const ownTeam = p.tid === tid || p.lastTeam === tid;
  let f = 1 + (pers.greed - 0.5) * 0.22;
  if (ownTeam) {
    const loyal = Math.max(0, pers.loyal - 0.45) * 0.16;
    if (loyal > 0.02) reasons.push(['Hometown discount', `Loyal to his team: about ${Math.round(loyal * 100)}% off`]);
    f *= 1 - loyal + (p.morale != null ? (55 - p.morale) / 450 : 0);
    if (p.morale != null && p.morale < 35) reasons.push(['Unhappy', 'Low morale here, so he wants a premium to stay']);
  }
  if (p.draft?.tid === tid && p.tid !== tid && pers.loyal > 0.6) { f *= 0.96; reasons.push(['Return home', 'Would like to finish where he started']); }
  const tStr = ctx.teamStrength ?? teamStrength(tid);
  const ring = Math.max(0, pers.win - 0.55) * Math.max(0, tStr - 0.55) * 0.7;
  if (ring > 0.01) { f *= 1 - ring; reasons.push(['Ring chaser', `Takes less to join a contender (about ${Math.round(ring * 100)}% off)`]); }
  if (pers.win > 0.7 && tStr < 0.35) { f *= 1.06; reasons.push(['Wants to win', 'Wants extra to join a rebuilding team']); }
  const g = p.grudge?.[tid];
  if (g && g.s >= Lg.meta.season - 2) { f *= 1.15; reasons.push(['Bad blood', g.why || 'Has issues with this organization']); }
  if (ctx.fa) f *= 1 + Math.min(0.2, (ctx.interest || 0) * 0.035);
  if (p.holdout) f *= 1.06;
  const yrs = idealYears(p);
  f = clamp(f, 0.72, 1.2);
  const maxPct = { QB: 0.228, EDGE: 0.17, WR: 0.15, DT: 0.135 }[p.pos] ?? 0.13;
  const capS = capFor(['REGULAR_SEASON', 'PRESEASON', 'PLAYOFFS', 'SEASON_END', 'RESIGN'].includes(Lg.meta.phase) ? Lg.meta.season + 1 : Lg.meta.season);
  return { apy: Math.round(Math.min(mv * f, capS * maxPct) / 10000) * 10000, years: yrs, gtdPct: idealGtdPct(p), mv, reasons, refuses: !!(g && g.hard && g.s >= Lg.meta.season - 1) };
}
function teamStrength(tid) {
  const t = G.L.teams[tid];
  if (!t) return 0.5;
  const st = G.L.standingsCache?.[tid];
  const r = 1 - ((t.powerRank ?? 16) - 1) / 31;
  return st && st.gp >= 6 ? r * 0.5 + st.pct * 0.5 : r;
}

// Value of an offer in "APY-equivalent" terms for this player: length and guarantees matter, differently by age.
export function offerValue(p, offer, ask) {
  const a = age(p);
  const total = offer.apy * offer.years;
  const gp = offer.gtd / Math.max(total, 1);
  const yrDiff = offer.years - ask.years;
  // young players want shorter deals to cash in again; veterans want security
  const yrsF = a >= 29 ? 1 + clamp(yrDiff, -3, 2) * 0.035 : 1 - Math.abs(yrDiff) * 0.025;
  const gtdF = 1 + (gp - ask.gtdPct) * (0.35 + (p.pers?.greed ?? 0.5) * 0.3);
  return offer.apy * yrsF * gtdF;
}
export function evaluateOffer(p, tid, offer, ctx = {}) {
  const ask = playerAsk(p, tid, ctx);
  const value = offerValue(p, offer, ask);
  const ratio = value / Math.max(ask.apy, 1);
  return { ask, value, ratio, accept: ratio >= 0.985 };
}

// The agent opens high, has a private walk-away number, and comes down as you negotiate in good faith.
// Lowball offers sour the mood; every round costs patience.
function negState(p, tid, ctx) {
  const Lg = G.L;
  p.neg ||= {};
  let st = p.neg[tid];
  if (!st || st.phase !== Lg.meta.phase || st.s !== Lg.meta.season) {
    const ask = playerAsk(p, tid, ctx);
    const greed = p.pers?.greed ?? 0.5;
    const open = ask.apy * (1.05 + greed * 0.1 + rnd() * 0.03);
    const floor = ask.apy * (0.9 + greed * 0.07 + rnd() * 0.02);
    const patience = Math.round((3 + (1 - (p.pers?.volat ?? 0.3)) * 3) * (Lg.settings.sliders.playerPatience ?? 1));
    st = p.neg[tid] = { phase: Lg.meta.phase, s: Lg.meta.season, cur: Math.round(open / 1e4) * 1e4, floor: Math.round(floor / 1e4) * 1e4, target: ask.apy, years: ask.years, gtdPct: ask.gtdPct, mood: 1, tries: 0, patience, best: 0 };
  }
  return st;
}
export function negotiationOptions(pid, tid, ctx = {}) {
  const p = G.L.players[pid];
  const st = negState(p, tid, ctx);
  const ask = playerAsk(p, tid, ctx);
  const yrs = st.years, gp = st.gtdPct;
  const r = (x) => Math.round(x / 1e4) * 1e4;
  const a = age(p);
  // three ready-made offers: what the agent wants, a fair middle, and a team-friendly deal
  const presets = {
    player: { label: 'Player friendly', years: a >= 29 ? Math.min(5, yrs + 1) : Math.max(1, yrs - 1), apy: r(st.cur), gtd: r(st.cur * (a >= 29 ? Math.min(5, yrs + 1) : Math.max(1, yrs - 1)) * Math.min(0.85, gp + 0.15)) },
    neutral: { label: 'Neutral', years: yrs, apy: r((st.cur + st.target) / 2), gtd: r((st.cur + st.target) / 2 * yrs * gp) },
    team: { label: 'Team friendly', years: a <= 27 ? yrs + 1 : Math.max(1, yrs - 1), apy: r(st.target * 0.95), gtd: r(st.target * 0.95 * (a <= 27 ? yrs + 1 : Math.max(1, yrs - 1)) * Math.max(0, gp - 0.12)) },
  };
  return { ask: { apy: st.cur, years: yrs, gtdPct: gp }, mv: ask.mv, reasons: ask.reasons, refuses: ask.refuses, mood: st.mood, tries: st.tries, patience: st.patience, presets };
}
export function negotiate(pid, tid, offer, ctx = {}) {
  const Lg = G.L;
  const p = Lg.players[pid];
  const ask = playerAsk(p, tid, ctx);
  if (ask.refuses) return { status: 'refused', message: `${p.fn} ${p.ln} won't negotiate with your organization.` };
  const st = negState(p, tid, ctx);
  if (st.mood <= 0) return { status: 'refused', message: `${p.fn} ${p.ln} is done talking with you for now. Try again later.` };
  const value = offerValue(p, offer, { years: st.years, gtdPct: st.gtdPct });
  st.tries++;
  const ev = { ask: { ...ask, apy: st.cur }, value, ratio: value / Math.max(st.cur, 1) };
  // accept: meets the current ask, or is above his walk-away number and he's tired of talking / it's close
  const closeEnough = value >= st.cur * 0.975;
  const aboveFloor = value >= st.floor;
  const fatigue = st.tries / st.patience;
  const acceptChance = closeEnough ? 1 : aboveFloor ? clamp((value - st.floor) / Math.max(1, st.cur - st.floor) * 0.55 + fatigue * 0.3, 0, 0.9) : 0;
  if (rnd() < acceptChance) {
    if (ctx.faPending) return { status: 'considering', ev, message: `${p.fn} likes the offer and will decide as free agency plays out.` };
    return { status: 'accepted', ev };
  }
  const ratio = value / st.floor;
  let tone;
  if (ratio < 0.8) { st.mood -= 0.45; tone = 'insulted'; }
  else if (ratio < 0.93) { st.mood -= 0.22; tone = 'far apart'; }
  else { st.mood -= 0.08; tone = 'close'; }
  if (st.tries >= st.patience) st.mood = Math.min(st.mood, 0.1);
  if (st.mood <= 0) return { status: 'refused', ev, message: `Talks broke down. ${p.fn} ${p.ln} walked away from the table.` };
  // the agent comes down toward a serious offer (never below the walk-away number); lowballs don't move him
  if (tone !== 'insulted') {
    const conc = (0.22 + (1 - (p.pers?.greed ?? 0.5)) * 0.2) * (tone === 'close' ? 1.2 : 0.8);
    st.cur = Math.round(Math.max(st.floor, st.cur - (st.cur - Math.max(value, st.floor)) * conc) / 1e4) * 1e4;
  }
  st.best = Math.max(st.best, value);
  const counter = { years: st.years, apy: st.cur, gtd: Math.round(st.cur * st.years * st.gtdPct / 1e4) * 1e4 };
  const msg = tone === 'insulted' ? `${p.fn}'s camp called that offer insulting. They didn't budge.`
    : tone === 'far apart' ? `${p.fn}'s agent came down a little to ${fmtMoney(st.cur)}/yr, but you're still far apart.`
      : `Close. ${p.fn}'s agent lowered the ask to ${fmtMoney(st.cur)}/yr.`;
  return { status: 'counter', ev, counter, tone, moodLeft: st.mood, message: msg };
}

export function signContract(pid, tid, offer, { start = null, type = 'sign' } = {}) {
  const Lg = G.L;
  const p = Lg.players[pid];
  const t = Lg.teams[tid];
  const s = start ?? (Lg.meta.phase === 'RESIGN' ? Lg.meta.season + 1 : Lg.meta.season);
  const maxApy = capFor(s) * ({ QB: 0.228, EDGE: 0.17, WR: 0.15, DT: 0.135 }[p.pos] ?? 0.13);
  if (offer.apy > maxApy) offer = { ...offer, apy: Math.round(maxApy / 10000) * 10000, gtd: Math.min(offer.gtd, Math.round(maxApy * offer.years)) };
  let c;
  if (type === 'extend' && p.contract) {
    // an extension never leaves more than 6 years on the books
    const left = p.contract.years.filter((y) => y.s >= capSeason()).length;
    if (left + offer.years > 6) { const yrs = Math.max(1, 6 - left); offer = { ...offer, years: yrs, gtd: Math.min(offer.gtd, Math.round(offer.apy * yrs)) }; }
    const newC = makeContract({ start: p.contract.exp + 1, years: offer.years, apy: offer.apy, gtd: offer.gtd });
    // signing bonus of the extension prorates across remaining + new years (max 5)
    const keep = p.contract.years.filter((y) => y.s >= capSeason());
    const allYears = [...keep, ...newC.years];
    const sb = newC.years.reduce((a, y) => a + y.bonus, 0);
    newC.years.forEach((y) => { y.bonus = 0; });
    const n = Math.min(5, allYears.length);
    allYears.slice(0, n).forEach((y) => { y.bonus += Math.round(sb / n); });
    c = { ...newC, years: allYears, exp: allYears[allYears.length - 1].s, signed: Lg.meta.season, extendedFrom: p.contract.apy };
  } else {
    c = makeContract({ start: s, years: offer.years, apy: offer.apy, gtd: offer.gtd });
  }
  const wasTeam = p.tid;
  if (p.tid !== tid) { removeFromDepth(p); p.yrsWithTeam = 0; }
  p.tid = tid; p.status = p.status === 'IR' ? 'IR' : 'ACT'; p.contract = c; p.holdout = false; p.waiver = null;
  p.neg = {};
  p.morale = clamp((p.morale ?? 60) + 12, 0, 100);
  const verb = type === 'extend' ? 'signed an extension with' : wasTeam === tid ? 're-signed with' : 'signed with';
  transaction(type, `${p.pos} ${p.fn} ${p.ln} ${verb} ${t.abbr}: ${offer.years} yr / ${fmtMoney(offer.apy * offer.years)} (${fmtMoney(offer.gtd)} gtd)`, { tids: [tid], pids: [pid] });
  if (offer.apy >= capFor(s) * 0.05 || isUser(tid)) news(`${p.fn} ${p.ln} ${verb} the ${t.region} ${t.name}: ${offer.years} years, ${fmtMoney(offer.apy * offer.years)}.`, { type, tids: [tid], pids: [pid] });
  return { ok: true, contract: c };
}

export function minDeal(p, s) {
  const amt = minSalary(p.exp ?? 0, s);
  return makeContract({ start: s, years: 1, apy: amt, gtd: 0, sbPct: 0, min: true });
}
export function psDeal(p, s) {
  return { years: [], signed: s, apy: psSalary(p.exp ?? 0, s), total: psSalary(p.exp ?? 0, s), gtd: 0, exp: s, ps: psSalary(p.exp ?? 0, s) };
}
void rnd; void gauss;
