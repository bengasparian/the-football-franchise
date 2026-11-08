// AI general managers: weekly roster care, re-signing, tags, options, cap compliance, cutdowns, extensions.
import { G, rnd, gauss, clamp, age, news, transaction, minSalary, isUser } from './core.js';
import { marketValue, playerAsk, signContract, teamCap, capSeason, releasePlayer, restructure, restructurePreview, applyTag, exerciseOption,
  deadMoneyIfCut, capHit, psDeal, idealGtdPct, minDeal } from './contracts.js';
import { autoDepth } from './roster.js';
import { placeOnIR, activateFromIR } from './injuries.js';
import { aiFillRoster, freeAgents } from './fa.js';
import { teamMode, playerTradeValue } from './trade.js';

export function keepValue(p, tid) {
  // how much a team wants to keep a player (value per cap dollar with age)
  const v = playerTradeValue(p, tid);
  return v + p.r.ovr * 2;
}

export function aiWeekly(tid, list = null) {
  const Lg = G.L;
  const user = isUser(tid);
  const auto = !user || Lg.settings.autoUser.injuries;
  const ps = (list || Object.values(Lg.players)).filter((p) => p.tid === tid);
  if (auto) {
    for (const p of ps) {
      if (p.status === 'ACT' && p.inj && (p.inj.wk >= 4 || p.inj.se)) placeOnIR(p.pid);
      if (p.status === 'IR' && p.healedOnIR) {
        const active = ps.filter((x) => x.tid === tid && x.status === 'ACT').length;
        if (active < Lg.rules.activeMax) activateFromIR(p.pid);
        else {
          const worst = ps.filter((x) => x.tid === tid && x.status === 'ACT' && x.pos === p.pos).sort((a, b) => a.r.ovr - b.r.ovr)[0];
          if (worst && worst.r.ovr < p.r.ovr - 3 && !user) { releasePlayer(worst.pid); activateFromIR(p.pid); }
        }
      }
    }
  }
  let changed = false;
  if (!user || Lg.settings.autoUser.roster) {
    // only do the expensive roster work when the roster actually needs it
    const act = ps.filter((p) => p.tid === tid && p.status === 'ACT');
    const healthy = act.filter((p) => !(p.inj && p.inj.wk > 0));
    const cnt = {};
    for (const p of healthy) cnt[p.pos] = (cnt[p.pos] || 0) + 1;
    const short = Object.entries({ QB: 2, RB: 3, WR: 5, TE: 2, OT: 3, OG: 3, C: 1, EDGE: 3, DT: 3, LB: 3, CB: 4, S: 3, K: 1, P: 1, LS: 1 }).some(([k, v]) => (cnt[k] || 0) < v);
    if (short) { aiFillRoster(tid, Lg.rules.activeMax); changed = true; }
    if (!short && act.length < Lg.rules.activeMax && ['REGULAR_SEASON', 'PRESEASON', 'PLAYOFFS'].includes(Lg.meta.phase) && !(Lg.meta.phase === 'PRESEASON')) { fillToMax(tid, Lg.rules.activeMax); changed = true; }
    if (act.length > Lg.rules.activeMax || changed) { trimActive(tid, Lg.rules.activeMax); changed = true; }
  }
  if (!user || Lg.settings.autoUser.depth || !Lg.teams[tid].depthLocked) autoDepth(tid, { keepUserOrder: user && Lg.teams[tid].depthLocked, list: changed ? null : ps });
}

export function trimActive(tid, max) {
  const Lg = G.L;
  let active = Object.values(Lg.players).filter((p) => p.tid === tid && p.status === 'ACT');
  if (active.length <= max) return;
  const kv = new Map(active.map((p) => [p.pid, keepValue(p, tid) + positionScarcity(p, active)]));
  const all = Object.values(Lg.players).filter((p) => p.tid === tid);
  let psN = all.filter((p) => p.status === 'PS').length;
  let vetN = all.filter((p) => p.status === 'PS' && (p.exp ?? 0) > 2).length;
  while (active.length > max) {
    const cand = active.filter((p) => !(p.contract && p.contract.gtd > 2e6 && p.r.ovr >= 60))
      .sort((a, b) => kv.get(a.pid) - kv.get(b.pid));
    const x = cand[0] || active.sort((a, b) => kv.get(a.pid) - kv.get(b.pid))[0];
    const elig = (x.exp ?? 0) <= 2 || vetN < 6;
    if (elig && psN < Lg.rules.psMax && !(x.contract && x.contract.gtd > 1e6)) { x.status = 'PS'; x.contract = psDeal(x, capSeason()); psN++; if ((x.exp ?? 0) > 2) vetN++; }
    else releasePlayer(x.pid, { toWaivers: false });
    active = active.filter((p) => p !== x);
  }
}
// don't cut below the minimum count at a position
function positionScarcity(p, active) {
  const min = { QB: 2, RB: 3, WR: 5, TE: 2, OT: 4, OG: 3, C: 1, EDGE: 4, DT: 4, LB: 4, CB: 5, S: 3, K: 1, P: 1, LS: 1, FB: 0 }[p.pos] ?? 1;
  const same = active.filter((x) => x.pos === p.pos).sort((a, b) => b.r.ovr - a.r.ovr);
  return same.indexOf(p) < min ? 5000 : 0;
}
export function psEligible(p) { return (p.exp ?? 0) <= 2 || vetPS(p.tid) < 6; }
function vetPS(tid) { return Object.values(G.L.players).filter((p) => p.tid === tid && p.status === 'PS' && (p.exp ?? 0) > 2).length; }
export function psCount(tid) { return Object.values(G.L.players).filter((p) => p.tid === tid && p.status === 'PS').length; }

// ---- RESIGN phase: re-sign, tags, fifth-year options
export function aiResignPhase(tid) {
  const Lg = G.L;
  const s = Lg.meta.season; // old league year; contracts expiring this season
  const cs = s + 1;
  const ps = Object.values(Lg.players).filter((p) => p.tid === tid && p.contract && !p.contract.ps);
  const mode = teamMode(tid);
  // fifth-year options for players entering their final rookie year
  for (const p of ps) {
    if (p.contract.option5 === 'pending' && p.contract.exp === cs) {
      if (p.r.ovr >= 76 || (p.r.ovr >= 72 && p.r.potEst >= 82)) exerciseOption(p.pid); else p.contract.option5 = 'declined';
    }
  }
  const expiring = ps.filter((p) => p.contract.exp === s).sort((a, b) => b.r.ovr - a.r.ovr);
  let space = teamCap(tid, cs).space;
  let tagged = false;
  for (const p of expiring) {
    const a = age(p, cs);
    const ask = playerAsk(p, tid);
    const val = keepValue(p, tid);
    const wants = p.r.ovr >= 70 && (a <= 30 || p.r.ovr >= 80) && !(mode === 'rebuild' && a >= 30 && p.r.ovr < 85) && !p.tradeReq;
    const affordable = ask.apy < space * 0.55;
    const willing = (p.morale ?? 60) > 35 || (p.pers?.loyal ?? 0.5) > 0.65;
    if (wants && affordable && willing && rnd() < 0.75 + (p.pers?.loyal ?? 0.5) * 0.2) {
      const yrs = clamp(ask.years, 1, 5);
      const offer = { years: yrs, apy: Math.round(ask.apy * (1 + gauss(0, 0.03)) / 10000) * 10000, gtd: Math.round(ask.apy * yrs * ask.gtdPct / 10000) * 10000 };
      signContract(p.pid, tid, offer, { start: cs });
      space -= offer.apy;
    } else if (!tagged && Lg.rules.franchiseTag && p.r.ovr >= 84 && a <= 30 && !p.tagged?.includes(s) && space > 25e6) {
      const r = applyTag(p.pid, 'F');
      if (r.ok) { tagged = true; space -= r.amount; }
    }
    void val;
  }
}

// RFA/ERFA tenders handled by AI: young cheap players with 2 accrued seasons are retained at the minimum
export function aiTenders(tid) {
  const Lg = G.L;
  const s = Lg.meta.season;
  for (const p of Object.values(Lg.players)) {
    if (p.tid !== tid || !p.contract || p.contract.exp !== s) continue;
    if ((p.exp ?? 0) <= 2 && p.contract.apy <= 1.3e6 && p.r.ovr >= 60 && !p.contract.rookie) {
      p.contract = minDeal({ ...p, exp: p.exp + 1 }, s + 1);
      p.contract.tender = 'ERFA';
      transaction('tender', `${Lg.teams[tid].abbr} tendered ERFA ${p.pos} ${p.fn} ${p.ln}`, { tids: [tid], pids: [p.pid] });
    }
  }
}

export function aiCapCompliance(tid, s = capSeason()) {
  const Lg = G.L;
  let cap = teamCap(tid, s);
  let guard = 0;
  while (cap.space < 0 && guard++ < 45) {
    // restructure the biggest eligible contract first
    const ps = Object.values(Lg.players).filter((p) => p.tid === tid && p.contract && !p.contract.ps);
    const rs = ps.map((p) => ({ p, pr: restructurePreview(p) })).filter((x) => x.pr && x.pr.saves > 1e6 && (x.p.contract.restructures || 0) < (guard > 15 ? 4 : 2)).sort((a, b) => b.pr.saves - a.pr.saves)[0];
    if (rs) { restructure(rs.p.pid); cap = teamCap(tid, s); continue; }
    // cut the worst value-for-money veteran with savings
    // never cut a franchise player or anyone whose dead money dwarfs the savings
    const qb1 = Lg.teams[tid].depth.QB?.[0];
    const cuts = ps.map((p) => ({ p, d: deadMoneyIfCut(p) })).filter((x) => x.d.save > 1e6 && x.p.pid !== qb1 && x.p.r.ovr < 86 && x.d.now <= x.d.save * 1.5)
      .sort((a, b) => (keepValue(a.p, tid) / Math.max(1, a.d.save)) - (keepValue(b.p, tid) / Math.max(1, b.d.save)));
    if (cuts[0]) { releasePlayer(cuts[0].p.pid); cap = teamCap(tid, s); continue; }
    // last resort: more restructures, then any non-QB1 cut that still saves real money
    const rs2 = ps.map((p) => ({ p, pr: restructurePreview(p) })).filter((x) => x.pr && x.pr.saves > 1e6 && (x.p.contract.restructures || 0) < 6).sort((a, b) => b.pr.saves - a.pr.saves)[0];
    if (rs2) { restructure(rs2.p.pid); cap = teamCap(tid, s); continue; }
    const cuts2 = ps.map((p) => ({ p, d: deadMoneyIfCut(p) })).filter((x) => x.d.save > 2e6 && x.p.pid !== qb1).sort((a, b) => (keepValue(a.p, tid) / a.d.save) - (keepValue(b.p, tid) / b.d.save));
    if (cuts2[0]) { releasePlayer(cuts2[0].p.pid); cap = teamCap(tid, s); continue; }
    // post-June 1 designation: spreads the dead money over two years so the cut actually clears space now
    const cuts3 = ps.map((p) => ({ p, d: deadMoneyIfCut(p, { june1: true }) })).filter((x) => x.d.save > 3e6 && x.p.pid !== qb1).sort((a, b) => (keepValue(a.p, tid) / a.d.save) - (keepValue(b.p, tid) / b.d.save));
    if (cuts3[0]) { releasePlayer(cuts3[0].p.pid, { june1: true }); cap = teamCap(tid, s); continue; }
    break;
  }
  return cap;
}

// Final cutdown to 53 + practice squad
export function aiCutdown(tid) {
  const Lg = G.L;
  trimActive(tid, Lg.rules.activeMax);
  // fill practice squad from own cuts / FAs (young players)
  let n = psCount(tid);
  if (n < Lg.rules.psMax) {
    const cands = freeAgents().filter((p) => (p.exp ?? 0) <= 2 && p.r.ovr >= 45).sort((a, b) => (b.r.tal + b.r.pot * 0.3) - (a.r.tal + a.r.pot * 0.3));
    for (const p of cands) {
      if (n >= Lg.rules.psMax) break;
      p.tid = tid; p.status = 'PS'; p.contract = psDeal(p, capSeason());
      n++;
    }
  }
  autoDepth(tid);
}

// Offseason: bring roster up toward 90 with undrafted rookies and cheap veterans
export function aiOffseasonFill(tid, target = 86) {
  const Lg = G.L;
  const cs = capSeason();
  let n = Object.values(Lg.players).filter((p) => p.tid === tid).length;
  if (n >= target) return;
  const need = {};
  const ps = Object.values(Lg.players).filter((p) => p.tid === tid);
  const tgt = { QB: 4, RB: 5, WR: 10, TE: 5, OT: 7, OG: 6, C: 3, EDGE: 8, DT: 8, LB: 8, CB: 10, S: 6, K: 1, P: 1, LS: 1, FB: 1 };
  for (const pos in tgt) need[pos] = Math.max(0, tgt[pos] - ps.filter((p) => p.pos === pos).length);
  const fas = freeAgents().sort((a, b) => (b.udfa ? b.r.tal + b.r.pot * 0.25 : b.r.ovr) - (a.udfa ? a.r.tal + a.r.pot * 0.25 : a.r.ovr));
  for (const p of fas) {
    if (n >= target) break;
    if (!need[p.pos]) continue;
    if (teamCap(tid, cs).space < minSalary(p.exp ?? 0, cs) + 5e6) break;
    p.tid = tid; p.status = 'ACT'; p.contract = minDeal(p, cs); p.yrsWithTeam = 0;
    if (p.udfa) { p.contract.udfa = true; p.contract.years.push({ s: cs + 1, base: minSalary(1, cs + 1), bonus: 0, gtd: 0 }, { s: cs + 2, base: minSalary(2, cs + 2), bonus: 0, gtd: 0 }); p.contract.exp = cs + 2; }
    need[p.pos]--; n++;
  }
}

// AI extensions for core players entering a contract year (keeps stars off the market, like real teams)
export function aiExtensions(tid) {
  const Lg = G.L;
  if (isUser(tid)) return;
  const s = Lg.meta.season;
  const cs = capSeason();
  for (const p of Object.values(Lg.players)) {
    if (p.tid !== tid || !p.contract || p.contract.ps || p.contract.tag) continue;
    if (p.contract.exp !== s && !(p.contract.exp === s + 1 && Lg.meta.phase === 'TRAINING_CAMP')) continue;
    const a = age(p, cs);
    if (p.r.ovr < 80 || a > 29) continue;
    if (rnd() > 0.25 + (p.pers?.loyal ?? 0.5) * 0.3) continue;
    const ask = playerAsk(p, tid);
    const space = teamCap(tid, p.contract.exp + 1).space;
    if (ask.apy > space * 0.6) continue;
    // keep the books healthy two years out as well
    const space2 = teamCap(tid, p.contract.exp + 2).space;
    if (ask.apy > space2 * 0.7) continue;
    if (p.contract.extendedFrom && p.contract.signed >= s - 1) continue; // already extended recently
    const yrs = clamp(ask.years + 1, 3, 5);
    signContract(p.pid, tid, { years: yrs, apy: ask.apy, gtd: Math.round(ask.apy * yrs * Math.max(ask.gtdPct, idealGtdPct(p)) / 10000) * 10000 }, { type: 'extend' });
  }
}
void marketValue; void news; void capHit;

// sign the best cheap free agents at the thinnest positions (teams carry full rosters)
export function fillToMax(tid, target) {
  const Lg = G.L;
  const cs = capSeason();
  const mine = Object.values(Lg.players).filter((p) => p.tid === tid);
  let act = mine.filter((p) => p.status === 'ACT').length;
  const tgt = { QB: 3, RB: 4, WR: 6, TE: 3, OT: 4, OG: 4, C: 2, EDGE: 5, DT: 5, LB: 5, CB: 6, S: 4, K: 1, P: 1, LS: 1 };
  let guard = 0;
  while (act < target && guard++ < 70) {
    const cnt = {};
    for (const p of mine) if (p.status === 'ACT' && p.tid === tid) cnt[p.pos] = (cnt[p.pos] || 0) + 1;
    const pos = Object.keys(tgt).sort((a, b) => ((cnt[a] || 0) - tgt[a]) - ((cnt[b] || 0) - tgt[b]))[0];
    const psGuy = mine.find((p) => p.status === 'PS' && p.pos === pos && p.tid === tid);
    if (psGuy) { psGuy.status = 'ACT'; psGuy.contract = minDeal(psGuy, cs); act++; continue; }
    const fa = freeAgents().filter((p) => p.pos === pos).sort((a, b) => b.r.ovr - a.r.ovr)[0];
    // a legal 53 comes first; cap issues get fixed with cuts/restructures afterward
    if (!fa || (teamCap(tid, cs).space < minSalary(fa.exp ?? 0, cs) && act >= target - 4)) break;
    fa.tid = tid; fa.status = 'ACT'; fa.contract = minDeal(fa, cs); fa.yrsWithTeam = 0; mine.push(fa); act++;
    transaction('sign', `${Lg.teams[tid].abbr} signed ${fa.pos} ${fa.fn} ${fa.ln} (1 yr, min)`, { tids: [tid], pids: [fa.pid] });
  }
}
