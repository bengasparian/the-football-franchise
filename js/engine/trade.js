// Trades: valuation, AI acceptance, execution (cap & dead money), trade finder, AI-to-AI trades.
import { G, rnd, gauss, clamp, interp, age, news, transaction, fmtMoney, shuffle, pick, capFor } from './core.js';
import { marketValue, capHit, teamCap, capSeason, removeFromDepth, inSeasonPhase, releasePlayer } from './contracts.js';
import { pickValue } from './draft.js';
import { autoDepth } from './roster.js';
import { rosterStrength } from './league.js';

// How much the trade market pays for a position (relative). Premium spots (QB, pass rush, LT, CB, WR1) fetch the most.
const POS_F = { QB: 1.7, EDGE: 1.2, WR: 1.0, OT: 1.0, CB: 1.0, DT: 0.95, S: 0.7, LB: 0.5, TE: 0.75, OG: 0.7, C: 0.6, RB: 0.55, FB: 0.15, K: 0.15, P: 0.12, LS: 0.05 };
export function teamMode(tid) {
  const Lg = G.L;
  const t = Lg.teams[tid];
  if (t.strategyLock) return t.strategy;
  const rank = t.powerRank ?? 16;
  const rec = Lg.standingsCache?.[tid];
  let mode = rank <= 11 ? 'contend' : rank >= 22 ? 'rebuild' : 'neutral';
  if (rec && Lg.meta.phase === 'REGULAR_SEASON' && rec.gp >= 6) {
    if (rec.pct >= 0.62) mode = 'contend'; else if (rec.pct <= 0.3) mode = 'rebuild';
  }
  t.strategy = mode;
  return mode;
}

// Player value on the same scale as the pick chart (#1 overall = 1000, #32 ~ 220, #64 ~ 120, #100 ~ 75, #150 ~ 50).
// Calibrated to real deals: All-Pro DT at 29 on a market deal = two late 1sts (Simmons), young elite CB = two 1sts (Gardner),
// 88 OVR WR at 29 on a big deal = a future 1st (A.J. Brown), 88 OVR guard at 30 = a 3rd (Nelson), solid WR on an
// expiring deal = a 4th (Downs). Most good players are worth Day 2-3 picks; only true difference-makers cost 1sts.
export function playerTradeValue(p, forTid, { selling = false } = {}) {
  const Lg = G.L;
  if (!p || p.tid < 0) return 0;
  const mode = teamMode(forTid);
  const s = capSeason();
  const a = age(p, s);
  const o = p.r.ovr * 0.75 + p.r.tal * 0.25; // front offices see a little past the box score
  // steep below the elite tier (a 90 is worth far more than an 80), flatter above it (nobody pays three 1sts for a DT)
  let v = (o <= 92 ? 520 * Math.exp((o - 92) * 0.19) : 520 * (1 + (o - 92) * 0.075)) * (POS_F[p.pos] ?? 0.6);
  const ageF = interp([[21, 1.3], [23, 1.27], [25, 1.18], [27, 1.0], [28, 0.92], [29, 0.82], [30, 0.68], [31, 0.54], [32, 0.42], [33, 0.32], [35, 0.18], [38, 0.08]], a);
  v *= mode === 'contend' ? (a >= 31 ? ageF * 1.15 : ageF * 0.55 + 0.45) : mode === 'rebuild' ? ageF * 1.12 : ageF;
  if (a <= 25 && (p.r.potEst ?? 0) > p.r.ovr) v *= 1 + (p.r.potEst - p.r.ovr) / 50 * (mode === 'rebuild' ? 1.3 : 1);
  // contract: years of control and what he costs vs. what he's worth
  const c = p.contract;
  if (c && !c.ps) {
    const yrs = c.years.filter((y) => y.s >= s).slice(0, 4);
    const mv = Math.max(minMv(s), marketValue(p, s));
    const avgSal = yrs.length ? yrs.reduce((t, y) => t + y.base + y.bonus, 0) / yrs.length : mv;
    const r = avgSal / mv;
    let ctrl = interp([[0, 0.3], [1, 0.62], [2, 0.86], [3, 1.0], [4, 1.06]], yrs.length);
    if (yrs.length <= 1 && inSeasonPhase()) ctrl = mode === 'contend' ? 0.8 : mode === 'rebuild' ? 0.35 : 0.55; // rentals
    v *= ctrl * clamp(1.4 - 0.45 * r, 0.55, 1.4);
    if (r > 1.35 && o < 86) v -= (avgSal - mv) / capFor(s) * 600 * Math.min(3, yrs.length); // bad contract: costs value to take on
  }
  if (p.inj && p.inj.wk > 4) v *= p.inj.se ? 0.35 : 0.75;
  if (p.tradeReq && selling) v *= 0.8;
  if (p.holdout && selling) v *= 0.85;
  return Math.round(v);
}
const minMv = (s) => capFor(s) * 0.004;

const PRE_DRAFT = ['PLAYOFFS', 'SEASON_END', 'RESIGN', 'FREE_AGENCY', 'LEAGUE_MEETING'];
export function nextDraftSeason() {
  const m = G.L.meta;
  return ['DRAFT', 'POST_DRAFT', 'TRAINING_CAMP', 'FREE_AGENCY', 'LEAGUE_MEETING'].includes(m.phase) ? m.season : m.season + 1;
}
// Where a pick is projected to land. The next draft's picks follow the live standings (blended with roster
// strength early in the year); future years drift toward the middle of the round because nobody knows yet.
let PROJ = { key: null, slot: {} };
function projSlots() {
  const Lg = G.L, m = Lg.meta;
  const st = Lg.standingsCache || {};
  const key = `${m.season}-${m.phase}-${m.week}-${(Lg.playoffElim || []).length}`;
  if (PROJ.key === key) return PROJ.slot;
  const gp = Math.max(0, ...Lg.teams.map((t) => st[t.tid]?.gp || 0));
  const wStand = m.phase === 'REGULAR_SEASON' ? clamp(gp / 12, 0, 1) * 0.9 : PRE_DRAFT.includes(m.phase) ? 1 : 0;
  const elim = {}; for (const r of Lg.playoffElim || []) elim[r.tid] = r.round;
  const score = (t) => {
    const x = st[t.tid];
    const pct = x ? (x.w + x.t * 0.5) / Math.max(1, x.gp) : 0.5;
    const roster = 1 - ((t.powerRank ?? 16) - 1) / 31;
    if (PRE_DRAFT.includes(m.phase)) return (elim[t.tid] ?? (m.phase === 'PLAYOFFS' ? 2.5 : 0)) * 10 + pct;
    return wStand * pct + (1 - wStand) * roster;
  };
  const order = Lg.teams.slice().sort((a, b) => score(a) - score(b));
  const slot = {}; order.forEach((t, i) => { slot[t.tid] = i + 1; });
  PROJ = { key, slot };
  return slot;
}
export function projectedPickNo(pk) {
  const Lg = G.L;
  if (pk.no) return pk.no;
  const yrsOut = pk.s - nextDraftSeason();
  let slot = projSlots()[pk.orig] ?? 16.5;
  if (pk.cond?.startsWith('earlierOf:') && pk.s === nextDraftSeason()) {
    const sl = projSlots();
    slot = Math.min(...pk.cond.split(':')[1].split(',').map((t) => sl[+t] ?? 16.5));
  }
  if (yrsOut >= 1) { const t = Lg.teams[pk.orig]; const w = yrsOut === 1 ? 0.4 : 0.15; slot = (33 - (t.powerRank ?? 16)) * w + 16.5 * (1 - w); }
  if (pk.comp) slot = 33;
  return Math.round((pk.rd - 1) * 32 + slot);
}
export function pickTradeValue(pk, forTid) {
  const Lg = G.L;
  const yrsOut = Math.max(0, pk.s - nextDraftSeason());
  const mode = forTid == null ? 'neutral' : teamMode(forTid);
  let v = pickValue(projectedPickNo(pk)) * Math.pow(0.88, yrsOut);
  if (mode === 'rebuild') v *= 1.12; if (mode === 'contend') v *= yrsOut ? 0.85 : 0.92;
  return Math.round(v);
}

function needFactor(tid, pos, incomingCount = 1) {
  const Lg = G.L;
  const have = Object.values(Lg.players).filter((p) => p.tid === tid && p.pos === pos && p.status !== 'PS').sort((a, b) => b.r.ovr - a.r.ovr);
  const startN = { QB: 1, RB: 1, WR: 3, TE: 1, OT: 2, OG: 2, C: 1, EDGE: 2, DT: 2, LB: 2, CB: 3, S: 2, K: 1, P: 1, LS: 1, FB: 1 }[pos] || 1;
  const worstStarter = have[startN - 1]?.r.ovr ?? 50;
  return { worstStarter, depth: have.length, startN, need: incomingCount };
}

// Value of a package to the receiving team (diminishing value for depth pieces)
export function packageValue(tid, players, picks, selling = false) {
  const Lg = G.L;
  let v = 0;
  const vals = players.map((p) => {
    let pv = playerTradeValue(p, tid, { selling });
    const nf = needFactor(tid, p.pos);
    if (!selling && pv > 0) {
      const mode = teamMode(tid);
      if (p.r.ovr <= nf.worstStarter - 3) pv *= 0.4; // wouldn't start: little use to us
      else if (p.r.ovr >= nf.worstStarter + 6) pv *= mode === 'contend' ? 1.25 : 1.1; // fills a real hole
      if (mode === 'rebuild' && age(p) >= 29) pv *= 0.6; // rebuilding teams don't want 29+ year-olds
    }
    if (selling && pv > 0) {
      // what it costs us to lose him: a starter we can't replace hurts more for a contender
      const mode = teamMode(tid);
      if (mode === 'rebuild' && age(p) >= 28) pv *= 0.85; // sellers happily move veterans
      if (mode === 'contend' && p.r.ovr >= nf.worstStarter) pv *= 1.15;
    }
    return pv;
  }).sort((a, b) => b - a);
  vals.forEach((x, i) => { v += x > 0 ? x * (selling ? 1 : i === 0 ? 1 : i === 1 ? 0.8 : 0.6) : x; });
  for (const pk of picks) v += pickTradeValue(pk, tid);
  return Math.round(v);
}

export function validateTrade(t1, t2, a1, a2, { ai = false } = {}) {
  const Lg = G.L;
  const ph = Lg.meta.phase;
  if (ph === 'REGULAR_SEASON' && Lg.meta.week > Lg.rules.tradeDeadlineWeek) return 'The trade deadline has passed.';
  if (ph === 'PLAYOFFS') return 'Trades are not allowed during the playoffs.';
  if (ph === 'SEASON_END' || ph === 'RESIGN') { /* trades allowed after the season once the league year flips; allow except tags */ }
  const s = capSeason();
  for (const [from, to, as] of [[t1, t2, a1], [t2, t1, a2]]) {
    for (const pid of as.players) { const p = Lg.players[pid]; if (!p || p.tid !== from) return 'A player in the deal is no longer on that team.'; if (p.contract?.tag && p.contract?.signed === Lg.meta.season && ph === 'RESIGN') return 'Tagged players must sign their tender before being traded.'; }
    for (const id of as.picks) { const pk = Lg.picks.find((x) => x.id === id); if (!pk || pk.tid !== from) return 'A draft pick in the deal is no longer owned by that team.'; if (pk.comp && !pk.no) return 'Compensatory picks cannot be traded before they are awarded.'; }
  }
  // cap check after trade (only salary moves; bonus stays as dead money)
  for (const [tid, inc, out] of [[t1, a2.players, a1.players], [t2, a1.players, a2.players]]) {
    const cap = teamCap(tid, s);
    const inAmt = inc.reduce((a, pid) => a + baseOnly(Lg.players[pid], s), 0);
    const outAmt = out.reduce((a, pid) => a + capHit(Lg.players[pid], s), 0);
    const deadAdd = out.reduce((a, pid) => a + futureProration(Lg.players[pid], s), 0);
    if (cap.space - inAmt + outAmt - deadAdd < 0 && inAmt > 0) return `${Lg.teams[tid].abbr} would be over the salary cap (${fmtMoney(cap.space - inAmt + outAmt - deadAdd)}).`;
    const roster = Object.values(Lg.players).filter((p) => p.tid === tid && p.status !== 'PS' && p.status !== 'IR').length;
    const max = inSeasonPhase() && ph !== 'PRESEASON' ? Lg.rules.activeMax : Lg.rules.offseasonMax;
    if (!ai && roster + inc.length - out.length > max && inc.length > out.length) return `${Lg.teams[tid].abbr} would exceed the ${max}-man roster limit (release players first).`;
  }
  return null;
}
function baseOnly(p, s) { const y = p.contract?.years?.find((x) => x.s === s); return p.contract?.ps ? p.contract.ps : y ? y.base : 0; }
function futureProration(p, s) { return (p.contract?.years || []).filter((y) => y.s >= s).reduce((a, y) => a + y.bonus, 0); }

export function evaluateTrade(userTid, aiTid, give, get) {
  // give: assets userTid sends; get: assets userTid receives (from aiTid)
  const Lg = G.L;
  const gp = give.players.map((id) => Lg.players[id]), gk = give.picks.map((id) => Lg.picks.find((x) => x.id === id));
  const rp = get.players.map((id) => Lg.players[id]), rk = get.picks.map((id) => Lg.picks.find((x) => x.id === id));
  const valIn = packageValue(aiTid, gp, gk, false); // value AI receives
  const valOut = packageValue(aiTid, rp, rk, true); // value AI gives up
  const diff = (Lg.settings.sliders.tradeDifficulty ?? 1);
  const isUserSide = Lg.meta.userTids.includes(userTid);
  const margin = isUserSide ? Math.max(8, valOut * 0.07) * diff : Math.max(4, valOut * 0.03);
  const err = validateTrade(userTid, aiTid, give, get, { ai: !isUserSide });
  // franchise QB protection: AI rarely trades its starting QB
  let block = null;
  for (const p of rp) {
    const t = Lg.teams[aiTid];
    if (p.pos === 'QB' && t.depth.QB?.[0] === p.pid && p.r.ovr >= 78 && age(p) <= 32 && !p.tradeReq) block = `${t.abbr} won't move their franchise quarterback.`;
    if (p.contract && (p.contract.faSigned || p.contract.type === 'UFA') && p.contract.signed === Lg.meta.season && ['FREE_AGENCY', 'LEAGUE_MEETING', 'DRAFT', 'POST_DRAFT'].includes(Lg.meta.phase) && p.contract.apy > 5e6 && !p.tradeReq) block = block || `${t.abbr} just signed ${p.fn} ${p.ln} in free agency and won't flip him yet.`;
  }
  const accept = !err && !block && valIn - valOut >= margin;
  const pct = err || block ? 0 : valOut > 0 ? clamp((valIn / (valOut + margin)) * 100, 0, 150) : 100;
  return { accept, valIn, valOut, margin, err, block, meter: Math.round(pct), message: err || block || (accept ? `${Lg.teams[aiTid].abbr} accept the trade.` : pct > 85 ? `${Lg.teams[aiTid].abbr}: "We're close. Add a little more."` : pct > 60 ? `${Lg.teams[aiTid].abbr}: "Not enough value for us."` : `${Lg.teams[aiTid].abbr}: "That's not a serious offer."`) };
}

export function executeTrade(t1, t2, a1, a2, { silent = false } = {}) {
  const Lg = G.L;
  const s = capSeason();
  const move = (pid, from, to) => {
    const p = Lg.players[pid];
    const prorate = futureProration(p, s);
    if (prorate > 0) {
      Lg.teams[from].dead ||= [];
      Lg.teams[from].dead.push({ s, amt: prorate, pid, name: `${p.fn} ${p.ln}`, trade: true });
      for (const y of p.contract.years) y.bonus = 0;
    }
    removeFromDepth(p);
    const req = !!p.tradeReq;
    p.tid = to; p.yrsWithTeam = 0; p.tradeReq = null; p.holdout = false;
    if (p.status === 'PS') p.status = 'ACT';
    p.morale = clamp((p.morale ?? 60) + (p.pers?.loyal > 0.7 ? -12 : 4), 0, 100);
    if (p.pers?.loyal > 0.75 && !req) (p.grudge ||= {})[from] = { s: Lg.meta.season, why: `Traded away by ${Lg.teams[from].abbr}` };
    (p.tradeHist ||= []).push({ s: Lg.meta.season, from, to });
  };
  for (const pid of a1.players) move(pid, t1, t2);
  for (const pid of a2.players) move(pid, t2, t1);
  for (const id of a1.picks) { const pk = Lg.picks.find((x) => x.id === id); pk.tid = t2; }
  for (const id of a2.picks) { const pk = Lg.picks.find((x) => x.id === id); pk.tid = t1; }
  autoDepth(t1, { keepUserOrder: true }); autoDepth(t2, { keepUserOrder: true });
  const desc = (as) => [...as.players.map((pid) => { const p = Lg.players[pid]; return `${p.pos} ${p.fn} ${p.ln}`; }), ...as.picks.map((id) => pickLabel(Lg.picks.find((x) => x.id === id)))].join(', ') || 'nothing';
  const A = Lg.teams[t1], B = Lg.teams[t2];
  const text = `${A.abbr} trade ${desc(a1)} to ${B.abbr} for ${desc(a2)}`;
  transaction('trade', text, { tids: [t1, t2], pids: [...a1.players, ...a2.players] });
  const big = [...a1.players, ...a2.players].some((pid) => Lg.players[pid].r.ovr >= 82) || [...a1.picks, ...a2.picks].some((id) => Lg.picks.find((x) => x.id === id)?.rd === 1);
  if (!silent) news(`TRADE: ${text}.`, { type: 'trade', tids: [t1, t2], pids: [...a1.players, ...a2.players], big });
  (Lg.tradeLog ||= []).unshift({ s: Lg.meta.season, ph: Lg.meta.phase, w: Lg.meta.week, t1, t2, text });
  return { ok: true, text };
}
export function pickLabel(pk) {
  if (!pk) return 'pick';
  const Lg = G.L;
  const o = Lg.teams[pk.orig].abbr;
  const proj = !pk.no && pk.s === nextDraftSeason() ? ` (proj. #${projectedPickNo(pk)})` : '';
  return `${pk.s} ${['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th'][pk.rd]}${pk.no ? ` (#${pk.no})` : proj}${pk.orig !== pk.tid ? ` (from ${o})` : ''}${pk.comp ? ' comp' : ''}${pk.cond ? ' *' : ''}`;
}

// ---------- Trade finder (2K-style): build offers from each AI team
export function tradeFinder(userTid, { give = { players: [], picks: [] }, want = { players: [], picks: [] }, pos = null, maxResults = 12 } = {}) {
  const Lg = G.L;
  const results = [];
  const teams = want.players.length ? [Lg.players[want.players[0]].tid] : Lg.teams.map((t) => t.tid).filter((t) => !Lg.meta.userTids.includes(t));
  for (const tid of teams) {
    if (Lg.meta.userTids.includes(tid)) continue;
    let offer;
    if (want.players.length || want.picks.length) offer = balanceForTarget(userTid, tid, give, want);
    else offer = buildOfferFor(userTid, tid, give, pos);
    if (offer) {
      const ev = evaluateTrade(userTid, tid, offer.give, offer.get);
      if (ev.accept) results.push({ tid, ...offer, ev });
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, maxResults);
}

function assetsOf(tid, excludePids = [], { minOvr = 0 } = {}) {
  const Lg = G.L;
  const ps = Object.values(Lg.players).filter((p) => p.tid === tid && p.status !== 'IR' && !excludePids.includes(p.pid) && p.r.ovr >= minOvr);
  const picks = Lg.picks.filter((x) => x.tid === tid && !(x.comp && !x.no));
  return { ps, picks };
}

// AI side gives value back for what user offers (optionally at a position)
function buildOfferFor(userTid, aiTid, give, pos) {
  const Lg = G.L;
  const gp = give.players.map((id) => Lg.players[id]), gk = give.picks.map((id) => Lg.picks.find((x) => x.id === id));
  const valIn = packageValue(aiTid, gp, gk, false);
  if (valIn < 6) return null;
  const target = valIn * 0.9;
  const { ps, picks } = assetsOf(aiTid);
  let pool = ps.filter((p) => (!pos || p.pos === pos) && !(p.pos === 'QB' && Lg.teams[aiTid].depth.QB?.[0] === p.pid));
  const s = capSeason();
  let uroom = teamCap(userTid, s).space + gp.reduce((a, p) => a + capHit(p, s), 0);
  pool = pool.filter((p) => baseOnly(p, s) <= uroom).map((p) => ({ p, v: packageValue(aiTid, [p], [], true) })).filter((x) => x.v <= target * 1.05).sort((a, b) => b.v - a.v);
  const get = { players: [], picks: [] };
  let got = 0;
  // picks first (how most deals are actually paid); a player only if the user asked for a position
  const pk = picks.map((k) => ({ k, v: pickTradeValue(k, aiTid) })).sort((a, b) => b.v - a.v);
  if (!pos) for (const x of pk) {
    if (got >= target * 0.85) break;
    if (got + x.v <= target * 1.02 && get.picks.length < 3) { get.picks.push(x.k.id); got += x.v; }
  }
  for (const x of pool) {
    if (got >= target * 0.8) break;
    if ((pos || got < target * 0.5) && got + x.v <= target * 1.02 && get.players.length < (pos ? 2 : 1) && baseOnly(x.p, s) <= uroom) { get.players.push(x.p.pid); got += x.v; uroom -= baseOnly(x.p, s); }
  }
  for (const x of pk) {
    if (got >= target * 0.85) break;
    if (!get.picks.includes(x.k.id) && got + x.v <= target * 1.02 && get.picks.length < 3) { get.picks.push(x.k.id); got += x.v; }
  }
  if (!get.players.length && !get.picks.length) return null;
  return { give: { players: [...give.players], picks: [...give.picks] }, get, score: got };
}

// User wants specific assets from aiTid; find user assets to balance
function balanceForTarget(userTid, aiTid, give, want, opts = {}) {
  // real teams pay for players with picks; only fall back to including players if picks can't get it done
  if (opts.picksFirst !== false && !opts._pass) {
    const r = balanceForTarget(userTid, aiTid, give, want, { ...opts, _pass: 'picks' });
    if (r) return r;
    if (opts.picksOnly) return null;
  }
  const picksOnlyPass = opts._pass === 'picks';
  const Lg = G.L;
  const rp = want.players.map((id) => Lg.players[id]), rk = want.picks.map((id) => Lg.picks.find((x) => x.id === id));
  const valOut = packageValue(aiTid, rp, rk, true);
  const g = { players: [...give.players], picks: [...give.picks] };
  const cur = () => packageValue(aiTid, g.players.map((id) => Lg.players[id]), g.picks.map((id) => Lg.picks.find((x) => x.id === id)), false);
  const need = valOut * 1.07 + 8;
  const qb1 = Lg.teams[userTid].depth.QB?.[0];
  const { ps, picks } = assetsOf(userTid, g.players);
  const s = capSeason();
  // the receiving team must be able to absorb the salary
  let room = teamCap(aiTid, s).space + want.players.reduce((a, pid) => a + capHit(Lg.players[pid], s) - futureProration(Lg.players[pid], s), 0) - g.players.reduce((a, pid) => a + baseOnly(Lg.players[pid], s), 0);
  const cands = [
    ...(picksOnlyPass ? [] : ps.filter((p) => !(p.pid === qb1 && p.r.ovr >= 72) && baseOnly(p, s) <= room).map((p) => ({ type: 'p', id: p.pid, v: packageValue(aiTid, [p], [], false), sal: baseOnly(p, s) }))),
    ...picks.filter((k) => !g.picks.includes(k.id)).map((k) => ({ type: 'k', id: k.id, v: pickTradeValue(k, aiTid) })),
  ].filter((x) => x.v > 3);
  let v = cur();
  let guard = 0;
  const used = (x) => (x.type === 'p' ? g.players.includes(x.id) : g.picks.includes(x.id));
  while (v < need && guard++ < 7) {
    const gap = need - v;
    const free = cands.filter((x) => !used(x));
    // 1) one asset that closes the gap without overpaying much; 2) the biggest piece below the gap; 3) small overshoot
    const fits = free.filter((x) => !x.sal || x.sal <= room);
    let c = fits.filter((x) => x.v >= gap && x.v <= gap * 1.35).sort((a, b) => a.v - b.v)[0];
    if (!c) c = fits.filter((x) => x.v < gap).sort((a, b) => b.v - a.v)[0];
    if (!c) c = fits.filter((x) => x.v <= gap * 2.2).sort((a, b) => a.v - b.v)[0];
    if (!c) break;
    if (c.type === 'p') { g.players.push(c.id); room -= c.sal || 0; } else g.picks.push(c.id);
    v = cur();
  }
  if (v < need * 0.98) return null;
  return { give: g, get: { players: [...want.players], picks: [...want.picks] }, score: 1000 - (v - need) };
}

export function makeItWork(userTid, aiTid, give, get) {
  const ev = evaluateTrade(userTid, aiTid, give, get);
  if (ev.accept) return { give, get, ev };
  const res = balanceForTarget(userTid, aiTid, give, get);
  if (!res) return { error: `${G.L.teams[aiTid].abbr} couldn't find a combination of your assets that works.` };
  return { ...res, ev: evaluateTrade(userTid, aiTid, res.give, res.get) };
}

// ---------- AI-to-AI trades and AI offers to user
export function aiTradeRound(chance0 = 0.12, tries = 3) {
  const Lg = G.L;
  const agg = Lg.settings.sliders.tradeAiAggression ?? 1;
  if (rnd() > chance0 * agg) return null;
  for (let i = 0; i < tries; i++) { const r = aiTradeAttempt(); if (r) { afterAiTrade(r); return r; } }
  return null;
}
function afterAiTrade(r) {
  const Lg = G.L;
  const max = inSeasonPhase() && Lg.meta.phase !== 'PRESEASON' ? Lg.rules.activeMax : Lg.rules.offseasonMax;
  for (const tid of r.tids) {
    const act = Object.values(Lg.players).filter((p) => p.tid === tid && p.status === 'ACT').sort((a, b) => a.r.ovr - b.r.ovr);
    let n = act.length;
    for (const p of act) { if (n <= max) break; if (p.contract && p.contract.gtd > 2e6) continue; releasePlayer(p.pid, { toWaivers: false }); n--; }
  }
}
function aiTradeAttempt() {
  const Lg = G.L;
  const ai = Lg.teams.map((t) => t.tid).filter((t) => !Lg.meta.userTids.includes(t));
  shuffle(ai);
  // buyers are contenders with a hole; sellers are rebuilding teams (or anyone with a player demanding out)
  const buyers = ai.filter((t) => teamMode(t) === 'contend');
  const sellers = ai.filter((t) => teamMode(t) === 'rebuild' || Object.values(Lg.players).some((p) => p.tid === t && p.tradeReq));
  if (!buyers.length || !sellers.length) return null;
  const buyer = pick(buyers);
  for (const seller of sellers.filter((t) => t !== buyer).slice(0, 4)) {
    const sellMode = teamMode(seller);
    const vets = Object.values(Lg.players).filter((p) => p.tid === seller && p.status === 'ACT' && p.r.ovr >= 74
      && (p.tradeReq || (sellMode === 'rebuild' && age(p) >= 27)) && !(p.pos === 'QB' && Lg.teams[seller].depth.QB?.[0] === p.pid && age(p) < 33)
      && !['K', 'P', 'LS', 'FB'].includes(p.pos))
      .sort((a, b) => (b.tradeReq ? 1 : 0) - (a.tradeReq ? 1 : 0) || b.r.ovr - a.r.ovr);
    for (const p of vets.slice(0, 6)) {
      const nf = needFactor(buyer, p.pos);
      if (p.r.ovr < nf.worstStarter + 4) continue; // must be a real upgrade for the buyer
      // quarterbacks only move to a team that truly needs one, and nobody eats a giant dead-money hit to deal a player
      if (p.pos === 'QB' && p.r.ovr < nf.worstStarter + 7) continue;
      if (futureProration(p, capSeason()) > capFor(capSeason()) * 0.06) continue;
      const want = { players: [p.pid], picks: [] };
      const off = balanceForTarget(buyer, seller, { players: [], picks: [] }, want, { picksOnly: true });
      if (!off) continue;
      // contenders don't burn a 1st on a modest upgrade
      const firsts = off.give.picks.map((id) => Lg.picks.find((x) => x.id === id)).filter((k) => k.rd === 1).length;
      if (firsts && p.r.ovr < 88) continue;
      if (firsts >= 2 && p.r.ovr < 92) continue;
      const err = validateTrade(buyer, seller, off.give, off.get, { ai: true });
      if (err) continue;
      const ev = evaluateTrade(buyer, seller, off.give, off.get);
      if (!ev.accept) continue;
      const res = executeTrade(buyer, seller, off.give, off.get);
      res.tids = [buyer, seller];
      return res;
    }
  }
  return null;
}

export function aiOffersToUser() {
  const Lg = G.L;
  if (!Lg.settings.aiTradesUser) return;
  for (const ut of Lg.meta.userTids) {
    if (rnd() > 0.18 * (Lg.settings.sliders.tradeAiAggression ?? 1)) continue;
    const pool = Lg.teams.filter((t) => !Lg.meta.userTids.includes(t.tid));
    const ai = (pick(pool.filter((t) => teamMode(t.tid) === 'contend')) || pick(pool)).tid;
    const aiMode = teamMode(ai);
    const targets = Object.values(Lg.players).filter((p) => p.tid === ut && p.r.ovr >= 72 && p.status === 'ACT' && !(p.pos === 'QB' && Lg.teams[ut].depth.QB?.[0] === p.pid)
      && !['K', 'P', 'LS', 'FB'].includes(p.pos) && (aiMode !== 'rebuild' || age(p) <= 26));
    const tgt = targets.sort((a, b) => b.r.ovr - a.r.ovr + gauss(0, 6))[0];
    if (!tgt) continue;
    const nf = needFactor(ai, tgt.pos);
    if (tgt.r.ovr < nf.worstStarter + 2) continue;
    const vIn = packageValue(ai, [tgt], [], false);
    const off = buildOfferFor(ut, ai, { players: [], picks: [] }, null);
    void off;
    // AI builds its own package to roughly match value
    const { ps, picks } = assetsOf(ai);
    const get = { players: [], picks: [] };
    let got = 0;
    for (const k of picks.map((k) => ({ k, v: pickTradeValue(k, ut) })).sort((a, b) => b.v - a.v)) { if (got + k.v <= vIn * 0.95 && get.picks.length < 3) { get.picks.push(k.k.id); got += k.v; } if (got > vIn * 0.8) break; }
    if (got < vIn * 0.6 && rnd() < 0.3) { // occasionally a player-for-player swap
      for (const x of ps.map((p) => ({ p, v: playerTradeValue(p, ut) })).filter((x) => x.p.pos !== tgt.pos && x.v > 0).sort((a, b) => b.v - a.v)) { if (got + x.v <= vIn * 0.95 && get.players.length < 1) { get.players.push(x.p.pid); got += x.v; } }
    }
    if (got < vIn * 0.6) continue;
    if (!get.picks.length && !get.players.length) continue;
    Lg.offers.unshift({ id: `o${Date.now().toString(36)}${Math.floor(rnd() * 1e4)}`, s: Lg.meta.season, w: Lg.meta.week, ph: Lg.meta.phase, fromTid: ai, toTid: ut, give: get, get: { players: [tgt.pid], picks: [] }, status: 'open' });
    if (Lg.offers.length > 30) Lg.offers.length = 30;
    news(`${Lg.teams[ai].abbr} called about ${tgt.fn} ${tgt.ln} — check your trade offers.`, { type: 'offer', tids: [ut], pids: [tgt.pid], user: true });
  }
}
void rosterStrength;
