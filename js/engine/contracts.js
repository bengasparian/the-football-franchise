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
  return G.L.meta.phase === 'RESIGN' ? G.L.meta.season + 1 : G.L.meta.season;
}

export function teamCap(tid, s = capSeason()) {
  const Lg = G.L;
  const t = Lg.teams[tid];
  const ps = Object.values(Lg.players).filter((p) => p.tid === tid);
  const offseason = ['RESIGN', 'FREE_AGENCY', 'LEAGUE_MEETING', 'DRAFT', 'POST_DRAFT', 'TRAINING_CAMP', 'FANTASY_DRAFT'].includes(Lg.meta.phase);
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
export function playerAsk(p, tid, ctx = {}) {
  const Lg = G.L;
  const pers = p.pers || {};
  let mv = marketValue(p);
  const ownTeam = p.tid === tid || p.lastTeam === tid;
  let f = 1 + (pers.greed - 0.5) * 0.25;
  if (ownTeam) f *= 1 - Math.max(0, pers.loyal - 0.4) * 0.15 + (p.morale != null ? (55 - p.morale) / 400 : 0);
  if (ctx.fa) f *= 1 + Math.min(0.25, (ctx.interest || 0) * 0.04);
  const tStr = ctx.teamStrength ?? 0.5;
  f *= 1 - Math.max(0, pers.win - 0.6) * Math.max(0, tStr - 0.55) * 0.5;
  if (p.holdout) f *= 1.06;
  const yrs = idealYears(p);
  f = clamp(f, 0.7, 1.12);
  const maxPct = { QB: 0.228, EDGE: 0.17, WR: 0.15, DT: 0.135 }[p.pos] ?? 0.13;
  const capS = capFor(['REGULAR_SEASON', 'PRESEASON', 'PLAYOFFS', 'SEASON_END', 'RESIGN'].includes(Lg.meta.phase) ? Lg.meta.season + 1 : Lg.meta.season);
  return { apy: Math.round(Math.min(mv * f, capS * maxPct) / 10000) * 10000, years: yrs, gtdPct: idealGtdPct(p), mv };
}

export function evaluateOffer(p, tid, offer, ctx = {}) {
  const ask = playerAsk(p, tid, ctx);
  const total = offer.apy * offer.years;
  const gp = offer.gtd / Math.max(total, 1);
  const yrDiff = offer.years - ask.years;
  const yrsF = yrDiff >= 0 ? 1 - Math.min(0.1, yrDiff * 0.015) * (age(p) >= 30 ? -1 : 1) : 1 - Math.abs(yrDiff) * (age(p) >= 30 ? 0.06 : 0.035);
  const gtdF = 1 + (gp - ask.gtdPct) * (0.35 + (p.pers?.greed ?? 0.5) * 0.25);
  const value = offer.apy * yrsF * gtdF;
  const ratio = value / Math.max(ask.apy, 1);
  return { ask, value, ratio, accept: ratio >= 0.985 };
}

export function negotiate(pid, tid, offer, ctx = {}) {
  const Lg = G.L;
  const p = Lg.players[pid];
  const key = `${tid}`;
  p.neg ||= {};
  const st = (p.neg[key] ||= { tries: 0, mood: 1, phase: Lg.meta.phase, s: Lg.meta.season });
  if (st.phase !== Lg.meta.phase || st.s !== Lg.meta.season) { st.tries = 0; st.mood = 1; st.phase = Lg.meta.phase; st.s = Lg.meta.season; }
  const patience = Math.round((3 + (1 - (p.pers?.volat ?? 0.3)) * 2) * (Lg.settings.sliders.playerPatience ?? 1));
  if (st.mood <= 0) return { status: 'refused', message: `${p.fn} ${p.ln} is no longer willing to negotiate with you right now.` };
  const ev = evaluateOffer(p, tid, offer, ctx);
  st.tries++;
  if (ev.accept && !ctx.faPending) return { status: 'accepted', ev };
  if (ev.accept && ctx.faPending) return { status: 'considering', ev, message: `${p.fn} likes the offer and will decide as free agency plays out.` };
  if (ev.ratio < 0.8) st.mood -= 0.45; else if (ev.ratio < 0.92) st.mood -= 0.25; else st.mood -= 0.1;
  if (st.tries >= patience) st.mood = Math.min(st.mood, 0.15);
  const counterApy = Math.round(ev.ask.apy * (1 + (st.tries > 1 ? 0.01 : 0)) / 10000) * 10000;
  const counter = { years: ev.ask.years, apy: counterApy, gtd: Math.round(counterApy * ev.ask.years * ev.ask.gtdPct / 10000) * 10000 };
  const tone = ev.ratio < 0.8 ? 'insulted' : ev.ratio < 0.92 ? 'far apart' : 'close';
  if (st.mood <= 0) return { status: 'refused', ev, message: `Talks broke down. ${p.fn} ${p.ln} walked away from the table.` };
  return { status: 'counter', ev, counter, tone, moodLeft: st.mood, message: tone === 'insulted' ? `${p.fn}'s camp called that offer insulting.` : tone === 'far apart' ? `${p.fn}'s agent says you're still far apart.` : `${p.fn} says you're close.` };
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
