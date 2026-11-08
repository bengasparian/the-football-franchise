// Trades: valuation, AI acceptance, execution (cap & dead money), trade finder, AI-to-AI trades.
import { G, rnd, gauss, clamp, interp, age, news, transaction, fmtMoney, shuffle, pick, capFor } from './core.js';
import { marketValue, capHit, teamCap, capSeason, removeFromDepth, inSeasonPhase, releasePlayer } from './contracts.js';
import { pickValue } from './draft.js';
import { autoDepth } from './roster.js';
import { rosterStrength } from './league.js';

const POS_F = { QB: 1.6, EDGE: 1.15, WR: 1.05, OT: 1.05, CB: 1.0, DT: 1.0, S: 0.8, LB: 0.75, TE: 0.8, OG: 0.8, C: 0.7, RB: 0.62, FB: 0.2, K: 0.25, P: 0.2, LS: 0.1 };

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

export function playerTradeValue(p, forTid, { selling = false } = {}) {
  const Lg = G.L;
  if (!p || p.tid < 0) return 0;
  const mode = teamMode(forTid);
  const s = capSeason();
  const a = age(p, s);
  // AI front offices see a blend of production rating and true ability
  const o = p.r.ovr * 0.7 + p.r.tal * 0.3;
  let v = 600 * Math.exp((o - 90) * 0.1) * (POS_F[p.pos] ?? 0.7);
  const ageF = interp([[21, 1.3], [23, 1.25], [25, 1.15], [27, 1.0], [29, 0.8], [31, 0.58], [33, 0.36], [35, 0.2], [38, 0.08]], a);
  v *= mode === 'contend' ? (ageF * 0.6 + 0.4) : mode === 'rebuild' ? ageF * 1.15 : ageF;
  if (a <= 25 && p.r.potEst > p.r.ovr) v *= 1 + (p.r.potEst - p.r.ovr) / 60 * (mode === 'rebuild' ? 1.4 : 1);
  // contract surplus over remaining control
  const c = p.contract;
  if (c && !c.ps) {
    const yrs = c.years.filter((y) => y.s >= s).slice(0, 4);
    const mv = marketValue(p, s);
    const capS = capFor(s);
    let surplus = 0;
    for (const y of yrs) surplus += (mv - (y.base + y.bonus)) / capS;
    v += surplus * 1100 * (mode === 'rebuild' ? 0.8 : 1);
    if (yrs.length <= 1 && inSeasonPhase() && mode === 'rebuild') v *= 0.55; // rentals
  }
  if (p.inj && p.inj.wk > 4) v *= p.inj.se ? 0.35 : 0.75;
  if (p.tradeReq && selling) v *= 0.82;
  if (p.holdout && selling) v *= 0.85;
  return Math.max(1, Math.round(v));
}

export function projectedPickNo(pk) {
  const Lg = G.L;
  if (pk.no) return pk.no;
  const t = Lg.teams[pk.orig];
  const yrsOut = pk.s - (Lg.meta.phase === 'DRAFT' || ['FREE_AGENCY', 'LEAGUE_MEETING', 'POST_DRAFT', 'TRAINING_CAMP'].includes(Lg.meta.phase) ? Lg.meta.season : Lg.meta.season + 1);
  const rank = t.powerRank ?? 16; // 1 = best
  let slot = 33 - rank; // best team picks late
  if (Lg.standingsCache && Lg.meta.phase === 'REGULAR_SEASON' && yrsOut === 0) {
    const st = Lg.standingsCache;
    const sorted = Lg.teams.map((x) => x.tid).sort((a, b) => st[a].pct - st[b].pct);
    slot = sorted.indexOf(pk.orig) + 1;
  }
  const blend = yrsOut <= 0 ? 0.85 : yrsOut === 1 ? 0.45 : 0.15;
  const s2 = slot * blend + 16.5 * (1 - blend);
  return Math.round((pk.rd - 1) * 32 + s2);
}
export function pickTradeValue(pk, forTid) {
  const Lg = G.L;
  const yrsOut = Math.max(0, pk.s - (['DRAFT', 'FREE_AGENCY', 'LEAGUE_MEETING', 'POST_DRAFT', 'TRAINING_CAMP'].includes(Lg.meta.phase) ? Lg.meta.season : Lg.meta.season + 1));
  const mode = teamMode(forTid);
  let v = pickValue(projectedPickNo(pk)) * Math.pow(0.85, yrsOut);
  if (mode === 'rebuild') v *= 1.15; if (mode === 'contend') v *= 0.9;
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
    if (!selling) {
      if (p.r.ovr <= nf.worstStarter - 3) pv *= 0.45; // wouldn't start
      else if (p.r.ovr >= nf.worstStarter + 4) pv *= 1.12; // fills a need
    }
    return pv;
  }).sort((a, b) => b - a);
  vals.forEach((x, i) => { v += x * (selling ? 1 : i === 0 ? 1 : i === 1 ? 0.85 : 0.65); });
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
  const margin = isUserSide ? Math.max(25, valOut * 0.08) * diff : Math.max(15, valOut * 0.03);
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
    p.tid = to; p.yrsWithTeam = 0; p.tradeReq = null; p.holdout = false;
    if (p.status === 'PS') p.status = 'ACT';
    p.morale = clamp((p.morale ?? 60) + (p.pers?.loyal > 0.7 ? -12 : 4), 0, 100);
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
  return `${pk.s} ${['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th'][pk.rd]}${pk.no ? ` (#${pk.no})` : ''}${pk.orig !== pk.tid ? ` (from ${o})` : ''}${pk.comp ? ' comp' : ''}`;
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
  if (valIn < 20) return null;
  const target = valIn * 0.9;
  const { ps, picks } = assetsOf(aiTid);
  let pool = ps.filter((p) => (!pos || p.pos === pos) && !(p.pos === 'QB' && Lg.teams[aiTid].depth.QB?.[0] === p.pid));
  const s = capSeason();
  let uroom = teamCap(userTid, s).space + gp.reduce((a, p) => a + capHit(p, s), 0);
  pool = pool.filter((p) => baseOnly(p, s) <= uroom).map((p) => ({ p, v: packageValue(aiTid, [p], [], true) })).filter((x) => x.v <= target * 1.05).sort((a, b) => b.v - a.v);
  const get = { players: [], picks: [] };
  let got = 0;
  for (const x of pool) {
    if (got + x.v <= target * 1.02 && get.players.length < 2 && baseOnly(x.p, s) <= uroom) { get.players.push(x.p.pid); got += x.v; uroom -= baseOnly(x.p, s); }
    if (got >= target * 0.8) break;
  }
  const pk = picks.map((k) => ({ k, v: pickTradeValue(k, aiTid) })).sort((a, b) => b.v - a.v);
  for (const x of pk) {
    if (got >= target * 0.85) break;
    if (got + x.v <= target * 1.02 && get.picks.length < 3) { get.picks.push(x.k.id); got += x.v; }
  }
  if (!get.players.length && !get.picks.length) return null;
  return { give: { players: [...give.players], picks: [...give.picks] }, get, score: got };
}

// User wants specific assets from aiTid; find user assets to balance
function balanceForTarget(userTid, aiTid, give, want) {
  const Lg = G.L;
  const rp = want.players.map((id) => Lg.players[id]), rk = want.picks.map((id) => Lg.picks.find((x) => x.id === id));
  const valOut = packageValue(aiTid, rp, rk, true);
  const g = { players: [...give.players], picks: [...give.picks] };
  const cur = () => packageValue(aiTid, g.players.map((id) => Lg.players[id]), g.picks.map((id) => Lg.picks.find((x) => x.id === id)), false);
  const need = valOut * 1.08 + 25;
  const qb1 = Lg.teams[userTid].depth.QB?.[0];
  const { ps, picks } = assetsOf(userTid, g.players);
  const s = capSeason();
  // the receiving team must be able to absorb the salary
  let room = teamCap(aiTid, s).space + want.players.reduce((a, pid) => a + capHit(Lg.players[pid], s) - futureProration(Lg.players[pid], s), 0) - g.players.reduce((a, pid) => a + baseOnly(Lg.players[pid], s), 0);
  const cands = [
    ...ps.filter((p) => !(p.pid === qb1 && p.r.ovr >= 72) && baseOnly(p, s) <= room).map((p) => ({ type: 'p', id: p.pid, v: packageValue(aiTid, [p], [], false), sal: baseOnly(p, s) })),
    ...picks.filter((k) => !g.picks.includes(k.id)).map((k) => ({ type: 'k', id: k.id, v: pickTradeValue(k, aiTid) })),
  ].filter((x) => x.v > 8);
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
  const buyer = ai.find((t) => teamMode(t) === 'contend') ?? ai[0];
  const seller = ai.find((t) => t !== buyer && teamMode(t) === 'rebuild') ?? ai.find((t) => t !== buyer);
  if (buyer == null || seller == null) return null;
  // seller shops a veteran the buyer needs
  const vets = Object.values(Lg.players).filter((p) => p.tid === seller && p.status === 'ACT' && p.r.ovr >= 74 && age(p) >= 26 && !(p.pos === 'QB' && Lg.teams[seller].depth.QB?.[0] === p.pid))
    .sort((a, b) => (b.tradeReq ? 1 : 0) - (a.tradeReq ? 1 : 0) || b.r.ovr - a.r.ovr);
  for (const p of vets.slice(0, 6)) {
    const nf = needFactor(buyer, p.pos);
    if (p.r.ovr < nf.worstStarter + 3) continue;
    const want = { players: [p.pid], picks: [] };
    const off = balanceForTarget(buyer, seller, { players: [], picks: [] }, want);
    if (!off) continue;
    const err = validateTrade(buyer, seller, off.give, off.get, { ai: true });
    if (err) continue;
    const ev = evaluateTrade(buyer, seller, off.give, off.get);
    if (!ev.accept) continue;
    const res = executeTrade(buyer, seller, off.give, off.get);
    res.tids = [buyer, seller];
    return res;
  }
  return null;
}

export function aiOffersToUser() {
  const Lg = G.L;
  if (!Lg.settings.aiTradesUser) return;
  for (const ut of Lg.meta.userTids) {
    if (rnd() > 0.18 * (Lg.settings.sliders.tradeAiAggression ?? 1)) continue;
    const ai = pick(Lg.teams.filter((t) => !Lg.meta.userTids.includes(t.tid))).tid;
    const targets = Object.values(Lg.players).filter((p) => p.tid === ut && p.r.ovr >= 72 && p.status === 'ACT' && !(p.pos === 'QB' && Lg.teams[ut].depth.QB?.[0] === p.pid));
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
    for (const k of picks.map((k) => ({ k, v: pickTradeValue(k, ut) })).sort((a, b) => b.v - a.v)) { if (got + k.v <= vIn * 0.95) { get.picks.push(k.k.id); got += k.v; } if (got > vIn * 0.75) break; }
    if (got < vIn * 0.6) {
      for (const x of ps.map((p) => ({ p, v: playerTradeValue(p, ut) })).filter((x) => x.p.pos !== tgt.pos).sort((a, b) => b.v - a.v)) { if (got + x.v <= vIn * 0.95 && get.players.length < 1) { get.players.push(x.p.pid); got += x.v; } }
    }
    if (!get.picks.length && !get.players.length) continue;
    Lg.offers.unshift({ id: `o${Date.now().toString(36)}${Math.floor(rnd() * 1e4)}`, s: Lg.meta.season, w: Lg.meta.week, ph: Lg.meta.phase, fromTid: ai, toTid: ut, give: get, get: { players: [tgt.pid], picks: [] }, status: 'open' });
    if (Lg.offers.length > 30) Lg.offers.length = 30;
    news(`${Lg.teams[ai].abbr} called about ${tgt.fn} ${tgt.ln} — check your trade offers.`, { type: 'offer', tids: [ut], pids: [tgt.pid], user: true });
  }
}
void rosterStrength;
