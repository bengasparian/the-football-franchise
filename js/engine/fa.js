// Free agency: legal tampering, day-by-day bidding wars, player decision factors, in-season signings.
import { G, rnd, gauss, clamp, age, news, transaction, capFor, minSalary } from './core.js';
import { marketValue, playerAsk, signContract, teamCap, capSeason, idealYears, idealGtdPct, minDeal } from './contracts.js';
import { rosterStrength } from './league.js';
import { teamMode } from './trade.js';

// Live free agency: 5 days. Each day opens with a 10 real-minute negotiating window where offers pile up but nobody
// signs; after that, players start picking teams in real time (the UI ticks every few seconds). "Next day" plays the
// rest of the day out instantly.
export const FA_DAYS = 5;
export const FA_WINDOW_MS = 10 * 60 * 1000;
export function startFreeAgency() {
  const Lg = G.L;
  Lg.fa = { day: 0, maxDay: FA_DAYS, offers: {}, log: [], dayStart: Date.now() };
  for (const p of freeAgents()) p.faDay0 = Lg.meta.season;
  faDay({ decide: false }); // day 1 opens: AI teams put their first offers on the table
}
export function faStatus() {
  const fa = G.L.fa;
  if (!fa) return null;
  const left = Math.max(0, FA_WINDOW_MS - (Date.now() - (fa.dayStart || 0)));
  return { day: fa.day, maxDay: fa.maxDay, windowLeftMs: left, live: left === 0 };
}
// Called by the client every few seconds during free agency.
export function faTick() {
  const Lg = G.L;
  const fa = Lg.fa;
  if (!fa || Lg.meta.phase !== 'FREE_AGENCY') return { signed: [] };
  const st = faStatus();
  const before = fa.log.length;
  if (rnd() < 0.35) bidRound(fa, { perTeam: 1, teamFrac: 0.25 });
  if (st.live) decideRound(fa, { limit: 2 + Math.floor(rnd() * 3), live: true });
  return { signed: fa.log.slice(before), status: st };
}
export function freeAgents() { return Object.values(G.L.players).filter((p) => p.tid === -1 && p.status === 'FA'); }

function teamStrength01(tid) {
  const Lg = G.L;
  const rank = Lg.teams[tid].powerRank ?? 16;
  return clamp((33 - rank) / 32, 0, 1);
}
export function buildPosIdx() {
  const idx = {};
  for (const x of Object.values(G.L.players)) if (x.tid >= 0 && x.status !== 'PS') ((idx[x.tid] ||= {})[x.pos] ||= []).push(x.r.ovr);
  return idx;
}
function roleOnTeam(p, tid, posIdx = null) {
  const Lg = G.L;
  const ovrs = posIdx ? (posIdx[tid]?.[p.pos] || []) : Object.values(Lg.players).filter((x) => x.tid === tid && x.pos === p.pos && x.status !== 'PS').map((x) => x.r.ovr);
  const startN = { QB: 1, RB: 1, WR: 3, TE: 1, OT: 2, OG: 2, C: 1, EDGE: 2, DT: 2, LB: 2, CB: 3, S: 2, K: 1, P: 1, LS: 1, FB: 1 }[p.pos] || 1;
  let better = 0;
  for (const o of ovrs) if (o > p.r.ovr) better++;
  return better < startN ? 1 : better < startN + 1 ? 0.55 : 0.25;
}

// How attractive an offer is to the player (money + fit factors driven by personality)
export function offerScore(p, o, posIdx = null) {
  const Lg = G.L;
  const pers = p.pers || {};
  const ask = playerAsk(p, o.tid, { fa: true });
  const total = o.apy * o.years;
  const money = (o.apy / Math.max(ask.apy, 1)) * (1 + (o.gtd / Math.max(total, 1) - ask.gtdPct) * 0.3) * (1 - Math.abs(o.years - ask.years) * 0.025);
  const t = Lg.teams[o.tid];
  const win = teamStrength01(o.tid);
  const role = roleOnTeam(p, o.tid, posIdx);
  const tax = t.noTax ? 0.03 + pers.greed * 0.03 : 0;
  const loyal = p.lastTeam === o.tid ? pers.loyal * 0.08 : 0;
  const market = (pers.media ?? 0.5) > 0.7 ? Math.log1p(t.market) * 0.012 : 0;
  const coach = (Lg.coaches[t.staff?.hc]?.rel ?? 0.6) * 0.04;
  return money * (0.6 + pers.greed * 0.5) + win * (0.08 + pers.win * 0.22) + role * (0.06 + pers.ego * 0.12) + tax + loyal + market + coach;
}

export function userOffer(tid, pid, offer) {
  const Lg = G.L;
  const p = Lg.players[pid];
  if (!p || p.tid !== -1) return { error: 'Player is not a free agent.' };
  const cs = capSeason();
  const cap = teamCap(tid, cs);
  const hit1 = offer.apy * 0.9;
  if (cap.space < hit1) return { error: `Not enough cap space (${Math.round(cap.space / 1e5) / 10}M available).` };
  const ask = playerAsk(p, tid, { fa: true });
  if (offer.apy < minSalary(p.exp ?? 0, cs)) return { error: 'Offer is below the league minimum.' };
  // during the offseason frenzy offers are collected and decided over days; in-season decisions are immediate
  if (Lg.meta.phase === 'FREE_AGENCY') {
    Lg.fa.offers[pid] = (Lg.fa.offers[pid] || []).filter((x) => x.tid !== tid);
    Lg.fa.offers[pid].push({ tid, ...offer, day: Lg.fa.day, user: true });
    const ratio = offer.apy / ask.apy;
    const posIdx = buildPosIdx();
    const mine = offerScore(p, { tid, ...offer }, posIdx);
    const rivals = Lg.fa.offers[pid].filter((x) => x.tid !== tid).map((x) => offerScore(p, x, posIdx));
    const beatBy = rivals.filter((x) => x > mine).length;
    const msg = beatBy ? `${p.fn}'s agent says ${beatBy} team${beatBy > 1 ? 's have' : ' has'} made a better offer so far. You can raise yours.`
      : ratio >= 1 ? `${p.fn} ${p.ln} likes the offer${rivals.length ? ` and it leads the ${rivals.length + 1} offers he has` : ''}. He'll decide soon, but other teams can still outbid you.`
        : ratio >= 0.9 ? `${p.fn}'s agent says the offer is competitive but below his asking price.` : `${p.fn}'s agent says you'll need to improve the offer.`;
    return { ok: true, pending: true, leading: !beatBy, rivals: rivals.length, message: msg };
  }
  const sc = offerScore(p, { tid, ...offer });
  const need = 0.95 - Math.min(0.25, ((p.faWeeks || 0) * 0.03)) - (Lg.meta.phase === 'REGULAR_SEASON' ? 0.1 : 0);
  if (sc >= need * (0.6 + (p.pers?.greed ?? 0.5) * 0.5) + 0.12 || offer.apy >= ask.apy) {
    signContract(pid, tid, offer);
    return { ok: true, signed: true, message: `${p.fn} ${p.ln} signed!` };
  }
  return { ok: false, message: `${p.fn} ${p.ln} declined. Asking about ${Math.round(ask.apy / 1e5) / 10}M per year.`, ask };
}

// Advance a day: whatever was left of the current day plays out, then the next day opens with fresh AI offers.
export function faDay({ decide = true } = {}) {
  const Lg = G.L;
  const fa = Lg.fa;
  if (!fa) return;
  if (decide && fa.day > 0) decideRound(fa, { limit: Infinity });
  fa.day++;
  fa.dayStart = Date.now();
  bidRound(fa, { perTeam: fa.day <= 2 ? 3 : 2, teamFrac: 1 });
}

export function faFinish() { const fa = G.L.fa; if (fa) { decideRound(fa, { limit: Infinity }); fa.offers = {}; } }

function bidRound(fa, { perTeam = 2, teamFrac = 1 } = {}) {
  const Lg = G.L;
  const cs = capSeason();
  const agg = Lg.settings.sliders.aiFreeAgencyAggression ?? 1;
  const pool = freeAgents().sort((a, b) => b.r.ovr - a.r.ovr).slice(0, 320);
  const posIdx = buildPosIdx();
  const capCache = {};
  const space0 = (tid) => (capCache[tid] ??= teamCap(tid, cs).space);
  const suitors = {};
  for (const [pid, offs] of Object.entries(fa.offers)) suitors[pid] = offs.filter((o) => !o.user).length;
  const maxSuitors = (p) => (['K', 'P', 'LS', 'FB'].includes(p.pos) ? 2 : p.r.ovr >= 86 ? 6 : p.r.ovr >= 80 ? 4 : 3);
  const order = Lg.teams.slice();
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  for (const t of order) {
    if (Lg.meta.userTids.includes(t.tid)) continue;
    if (teamFrac < 1 && rnd() > teamFrac) continue;
    // keep room for rookies and in-season moves, and make sure next year's books can carry the deal too
    let space = Math.min(space0(t.tid) - 18e6, teamCap(t.tid, cs + 1).space - 25e6);
    const mode = teamMode(t.tid);
    const n = Object.values(Lg.players).filter((p) => p.tid === t.tid).length;
    if (n >= Lg.rules.offseasonMax) continue;
    let bids = 0;
    for (const p of pool) {
      if (bids >= perTeam) break;
      if ((fa.offers[p.pid] || []).some((o) => o.tid === t.tid)) continue;
      if ((suitors[p.pid] || 0) >= maxSuitors(p)) continue;
      const role = roleOnTeam(p, t.tid, posIdx);
      if (role < 0.5 && p.r.ovr >= 68) continue;
      if (['K', 'P', 'LS'].includes(p.pos) && Math.max(0, ...(posIdx[t.tid]?.[p.pos] || [])) > p.r.ovr - 5) continue;
      const a = age(p, cs);
      if (mode === 'rebuild' && a >= 30 && p.r.ovr < 85) continue;
      const mv = marketValue(p, cs);
      if (mv > space) continue;
      const interest = role * (mode === 'contend' ? 1.2 : 1) * agg * (0.5 + rnd() * 0.8);
      if (interest < 0.55) continue;
      const maxA = capFor(cs) * ({ QB: 0.228, EDGE: 0.17, WR: 0.15, DT: 0.135 }[p.pos] ?? 0.13);
      const apy = Math.round(Math.min(maxA, mv * clamp(gauss(1.0, 0.08) + (p.r.ovr >= 85 ? 0.05 : 0) + (fa.day <= 2 ? 0.04 : -0.02 * fa.day), 0.7, 1.25)) / 10000) * 10000;
      const yrs = clamp(idealYears(p) + Math.round(gauss(0, 0.7)), 1, 5);
      const gtd = Math.round(apy * yrs * clamp(idealGtdPct(p) + gauss(0, 0.06), 0, 0.8) / 10000) * 10000;
      (fa.offers[p.pid] ||= []).push({ tid: t.tid, apy, years: yrs, gtd, day: fa.day });
      suitors[p.pid] = (suitors[p.pid] || 0) + 1;
      space -= apy;
      bids++;
    }
  }
}

function decideRound(fa, { limit = Infinity, live = false } = {}) {
  const Lg = G.L;
  const cs = capSeason();
  const posIdx = buildPosIdx();
  const capCache = {};
  const space0 = (tid) => (capCache[tid] ??= teamCap(tid, cs).space);
  let pool = freeAgents().filter((p) => fa.offers[p.pid]?.length);
  if (live) pool = pool.sort(() => rnd() - 0.5);
  let done = 0;
  for (const p of pool) {
    if (done >= limit) break;
    const latest = {};
    for (const o of fa.offers[p.pid]) latest[o.tid] = o;
    const list = Object.values(latest).filter((o) => space0(o.tid) >= o.apy * 0.85);
    if (!list.length) continue;
    const scored = list.map((o) => ({ o, sc: offerScore(p, o, posIdx) })).sort((a, b) => b.sc - a.sc);
    const best = scored[0];
    // stars let a bidding war play out for a day or two; depth players sign quickly
    const patience = p.r.ovr >= 85 ? 2 : p.r.ovr >= 78 ? 1 : 0;
    const firstDay = Math.min(...list.map((o) => o.day));
    const ready = fa.day - firstDay >= patience || list.length >= 4 || best.sc > 1.15 || fa.day >= fa.maxDay;
    const threshold = 0.82 - fa.day * 0.03;
    if (!(ready && best.sc >= threshold)) continue;
    if (live && rnd() < 0.5) continue; // live: not everyone decides at the same moment
    signContract(p.pid, best.o.tid, best.o);
    if (p.contract) p.contract.faSigned = true;
    capCache[best.o.tid] = undefined;
    ((posIdx[best.o.tid] ||= {})[p.pos] ||= []).push(p.r.ovr);
    delete fa.offers[p.pid];
    fa.log.push({ day: fa.day, pid: p.pid, tid: best.o.tid, apy: best.o.apy, years: best.o.years, user: !!best.o.user, t: Date.now() });
    if (best.o.user) news(`${p.fn} ${p.ln} accepted your offer!`, { type: 'sign', tids: [best.o.tid], pids: [p.pid], user: true });
    for (const o of list) if (o.user && o.tid !== best.o.tid) news(`${p.fn} ${p.ln} chose ${Lg.teams[best.o.tid].abbr} over your offer.`, { type: 'sign', tids: [o.tid], pids: [p.pid], user: true });
    done++;
  }
}

// Late free agency / in-season: AI teams fill holes with minimum deals
export function aiFillRoster(tid, maxActive) {
  const Lg = G.L;
  const cs = capSeason();
  const ps = Object.values(Lg.players).filter((p) => p.tid === tid);
  const active = ps.filter((p) => p.status === 'ACT');
  const healthy = active.filter((p) => !(p.inj && p.inj.wk > 0));
  const minNeed = { QB: 2, RB: 3, WR: 5, TE: 2, OT: 3, OG: 3, C: 1, EDGE: 3, DT: 3, LB: 3, CB: 4, S: 3, K: 1, P: 1, LS: 1 };
  let signed = 0;
  for (const pos in minNeed) {
    const have = healthy.filter((p) => p.pos === pos).length;
    for (let i = have; i < minNeed[pos]; i++) {
      if (active.length + signed >= maxActive) {
        // promote from practice squad instead
        const ps1 = ps.find((p) => p.status === 'PS' && p.pos === pos);
        if (ps1) { promoteFromPS(ps1); continue; }
        break;
      }
      const ps1 = ps.find((p) => p.status === 'PS' && p.pos === pos && p.r.ovr >= 55);
      if (ps1) { promoteFromPS(ps1); signed++; continue; }
      const fa = freeAgents().filter((p) => p.pos === pos).sort((a, b) => b.r.ovr - a.r.ovr)[0];
      if (!fa) continue;
      if (teamCap(tid, cs).space < minSalary(fa.exp ?? 0, cs)) continue;
      fa.tid = tid; fa.status = 'ACT'; fa.contract = minDeal(fa, cs); fa.yrsWithTeam = 0;
      transaction('sign', `${Lg.teams[tid].abbr} signed ${fa.pos} ${fa.fn} ${fa.ln} (1 yr, min)`, { tids: [tid], pids: [fa.pid] });
      signed++;
    }
  }
  return signed;
}
export function promoteFromPS(p) {
  const Lg = G.L;
  const cs = capSeason();
  p.status = 'ACT';
  p.contract = minDeal(p, cs);
  transaction('promote', `${Lg.teams[p.tid].abbr} promoted ${p.pos} ${p.fn} ${p.ln} from the practice squad`, { tids: [p.tid], pids: [p.pid] });
}
void rosterStrength; void capFor;
