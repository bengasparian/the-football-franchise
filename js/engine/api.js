// Public API used by the UI (through the worker). Every method returns plain JSON.
// ctx.tid = the team the caller manages (local user or online guest).
import { G, age, capFor, clamp, setRngState, rngState, fmtMoney, isUser, news } from './core.js';
import { POSITIONS, POS_NAMES, PHASE_LABEL, ROUND_LABEL, DEFAULT_SLIDERS, SLIDER_INFO, DEPTH_SLOTS } from './const.js';
import { createLeague } from './league.js';
import { ATTR_NAMES, OVR_W, potLabel, teamOvr } from './ratings.js';
import { personalityLabels } from './personality.js';
import { marketValue, playerAsk, negotiate, signContract, teamCap, capSeason, futureCommitments, deadMoneyIfCut, releasePlayer, restructurePreview,
  restructure, applyTag, tagValues, exerciseOption, fifthYearOptionValue, capHit, psDeal, minDeal, idealYears } from './contracts.js';
import { autoDepth, setDepth, rosterCounts } from './roster.js';
import { placeOnIR, activateFromIR } from './injuries.js';
import { computeStandings, playoffSeeds, divisionOrder, clinchMarkers } from './standings.js';
import { simUntil, advance, superBowlNumeral, userBlocker } from './season.js';
import { freeAgents, userOffer, offerScore } from './fa.js';
import { evaluateTrade, executeTrade, tradeFinder, makeItWork, pickLabel, playerTradeValue, pickTradeValue, projectedPickNo, teamMode } from './trade.js';
import { prospects, scoutProspect, scoutedView, draftCurrentPick, simDraftToUser, userOnClock, SCOUT_COST } from './draft.js';
import { fantasyPool, fantasyOnClock, fantasyPick, fantasySimToUser } from './fantasy.js';
import { hireCoach, fireCoach, coachOvr } from './coaches.js';
import { attendanceFor, homeGameRevenue } from './finance.js';
import { castVote, userPropose, PROPOSALS } from './rulesvote.js';
import { resolveEvent } from './events.js';
import { av } from './awards.js';
import { aiCutdown } from './ai.js';

const L = () => G.L;
const T = (tid) => G.L.teams[tid];
const tName = (tid) => (tid == null || tid < 0 ? 'Free Agent' : `${T(tid).region} ${T(tid).name}`);
const teamLite = (t) => ({ tid: t.tid, abbr: t.abbr, region: t.region, name: t.name, c1: t.c1, c2: t.c2, logo: t.logo, conf: t.conf, div: t.div });

function own(ctx, tid) {
  if (ctx?.host || ctx?.admin) return true;
  return ctx?.tid === tid && L().meta.userTids.includes(tid);
}
function requireOwn(ctx, tid) { if (!own(ctx, tid)) throw new Error('You can only manage your own team.'); }

export function pRow(p, extra = {}) {
  const Lg = L();
  const s = Lg.meta.season;
  const st = p.stats?.[s]?.REG;
  const c = p.contract;
  return {
    pid: p.pid, name: `${p.fn} ${p.ln}`, fn: p.fn, ln: p.ln, pos: p.pos, tid: p.tid, team: p.tid >= 0 ? T(p.tid).abbr : null, status: p.status,
    age: age(p), ovr: p.r.ovr, pot: potLabel(p), exp: p.exp, jn: p.jn, hs: p.hs, ht: p.ht, wt: p.wt, college: p.college,
    inj: p.inj && (p.inj.wk > 0 || p.inj.se) ? { type: p.inj.type, wk: p.inj.wk, se: p.inj.se } : null,
    morale: p.morale, holdout: !!p.holdout, tradeReq: !!p.tradeReq, onBlock: !!p.onBlock,
    contract: c ? { apy: c.apy, exp: c.exp, yrsLeft: c.ps ? 0 : c.exp - capSeason() + 1, hit: c.ps ? c.ps : capHit(p, capSeason()), gtd: c.gtd, rookie: !!c.rookie, tag: c.tag || null, ps: !!c.ps, option5: c.option5 || null } : null,
    g: st?.g || 0, line: st ? statSummary(p, st) : '', ovrDelta: p.r.ovr - (p.r.ovrStart ?? p.r.ovr), draft: p.draft || null,
    ...extra,
  };
}
export function statSummary(p, st) {
  if (!st) return '';
  const f = (k) => st[k] || 0;
  switch (p.pos) {
    case 'QB': return `${f('cmp')}/${f('att')}, ${f('pyd')} yds, ${f('ptd')} TD, ${f('int')} INT`;
    case 'RB': case 'FB': return `${f('car')} car, ${f('ryd')} yds, ${f('rtd') + f('rectd')} TD, ${f('rec')} rec`;
    case 'WR': case 'TE': return `${f('rec')} rec, ${f('recyd')} yds, ${f('rectd')} TD`;
    case 'K': return `${f('fgm')}/${f('fga')} FG, ${f('xpm')}/${f('xpa')} XP`;
    case 'P': return `${f('pnt')} punts, ${f('pnt') ? (f('pntYd') / f('pnt')).toFixed(1) : 0} avg`;
    case 'OT': case 'OG': case 'C': case 'LS': return f('gs') ? `${f('gs')} starts, ${f('skA')} sacks allowed` : `${f('g')} games`;
    default: return `${f('tkl') + f('ast')} tkl, ${(+f('sck')).toFixed(1)} sk, ${f('dint')} INT, ${f('pd')} PD`;
  }
}

// ------------------------------------------------------------------ league lifecycle
export function newLeague(args, ctx, data) {
  const Lg = createLeague(data, args);
  return { ok: true, meta: Lg.meta };
}
export function teamsForPicker(_, __, data) {
  return data.teams.map((t) => ({ abbr: t.abbr, region: t.region, name: t.name, c1: t.c1, c2: t.c2, logo: t.logo, conf: t.conf, div: t.div }));
}

export function header(_, ctx) {
  const Lg = L();
  if (!Lg) return null;
  if (!Lg.meta.userTids.length) return null;
  const m = Lg.meta;
  const st = Lg.standingsCache || computeStandings();
  const tid = ctx?.tid ?? m.userTids[0];
  const t = T(tid);
  const rec = st[tid];
  const cap = teamCap(tid);
  return {
    name: m.name, season: m.season, phase: m.phase, phaseLabel: PHASE_LABEL[m.phase] || (m.phase === 'FANTASY_DRAFT' ? 'Fantasy Draft' : m.phase), week: m.week,
    userTids: m.userTids, tid, team: teamLite(t), rec: rec ? `${rec.w}-${rec.l}${rec.t ? '-' + rec.t : ''}` : '', capSpace: cap.space,
    deadline: Lg.rules.tradeDeadlineWeek, faDay: Lg.fa?.day, draftOnClock: m.phase === 'DRAFT' ? !!userOnClock() : false,
    fantasyOnClock: m.phase === 'FANTASY_DRAFT' ? fantasyOnClock() : null,
    openEvents: Lg.events.filter((e) => e.open && e.tid === tid).length, openOffers: Lg.offers.filter((o) => o.status === 'open' && o.toTid === tid).length,
    fired: (m.firedNotices || []).filter((f) => f.tid === tid && !f.seen).length > 0, online: !!m.online, sbNum: superBowlNumeral(m.season),
    blocker: userBlocker(tid),
  };
}

// ------------------------------------------------------------------ dashboard
export function dashboard({ tid }, ctx) {
  const Lg = L();
  const m = Lg.meta;
  tid = tid ?? ctx.tid;
  const t = T(tid);
  const st = Lg.standingsCache || computeStandings();
  const next = Lg.games.filter((g) => g.s === m.season && !g.played && (g.h === tid || g.a === tid)).sort((a, b) => a.w - b.w)[0];
  const last = Lg.games.filter((g) => g.s === m.season && g.played && (g.h === tid || g.a === tid) && g.type !== 'PRE').sort((a, b) => b.w - a.w).slice(0, 5);
  const ps = Object.values(Lg.players).filter((p) => p.tid === tid);
  const top = ps.filter((p) => p.status !== 'PS').sort((a, b) => b.r.ovr - a.r.ovr).slice(0, 8).map((p) => pRow(p));
  const injured = ps.filter((p) => p.inj && (p.inj.wk > 0 || p.inj.se)).map((p) => pRow(p));
  const divStand = divisionOrder(st, t.conf, t.div).map((x) => ({ ...teamLite(T(x)), w: st[x].w, l: st[x].l, t: st[x].t }));
  const dlt = (p) => p.r.ovr - (p.r.ovrStart ?? p.r.ovr);
  const rising = ps.filter((p) => p.status !== 'PS' && dlt(p) > 0).sort((a, b) => dlt(b) - dlt(a)).slice(0, 5).map((p) => pRow(p));
  const falling = ps.filter((p) => p.status !== 'PS' && dlt(p) < 0).sort((a, b) => dlt(a) - dlt(b)).slice(0, 5).map((p) => pRow(p));
  return {
    team: { ...teamLite(t), ovr: teamOvr(tid), rank: t.powerRank, expectWins: t.expectWins, chem: Math.round((t.chem ?? 0.6) * 100), jobSec: t.jobSec, goals: t.goals, fanHappy: t.fin?.fanHappy, mode: teamMode(tid) },
    rec: st[tid], cap: teamCap(tid), next: next ? gameLite(next) : null, last: last.map(gameLite), top, injured, divStand, rising, falling,
    news: Lg.news.filter((n) => !n.tids || n.tids.includes(tid) || n.big).slice(0, 14),
    events: Lg.events.filter((e) => e.tid === tid && e.open),
    offers: Lg.offers.filter((o) => o.toTid === tid && o.status === 'open').map(offerView),
    counts: rosterCounts(tid), phase: m.phase, week: m.week, season: m.season,
    staff: ['hc', 'oc', 'dc'].map((r) => { const c = Lg.coaches[t.staff[r]]; return c ? { role: c.role, name: c.name, ovr: coachOvr(c) } : { role: r.toUpperCase(), name: 'Vacant', ovr: null }; }),
    goalResults: t.goalResults,
  };
}
export function gameLite(g) {
  return { gid: g.gid, s: g.s, w: g.w, type: g.type, h: g.h, a: g.a, hs: g.hs, as: g.as, played: g.played, ot: g.ot, hAbbr: T(g.h).abbr, aAbbr: T(g.a).abbr, hLogo: T(g.h).logo, aLogo: T(g.a).logo, real: !!g.real, d: g.d, label: ROUND_LABEL[g.type] };
}

// ------------------------------------------------------------------ teams & rosters
export function teams() {
  const Lg = L();
  const st = Lg.standingsCache || computeStandings();
  return Lg.teams.map((t) => ({ ...teamLite(t), w: st[t.tid].w, l: st[t.tid].l, t: st[t.tid].t, ovr: teamOvr(t.tid).ovr, rank: t.powerRank, user: Lg.meta.userTids.includes(t.tid), cap: teamCap(t.tid).space }));
}
export function roster({ tid }, ctx) {
  const Lg = L();
  tid = tid ?? ctx.tid;
  const t = T(tid);
  const ps = Object.values(Lg.players).filter((p) => p.tid === tid);
  return { team: { ...teamLite(t), ovr: teamOvr(tid) }, players: ps.map((p) => pRow(p, { depthIdx: (t.depth[p.pos] || []).indexOf(p.pid) })), counts: rosterCounts(tid), rules: Lg.rules, mine: own(ctx, tid), cap: teamCap(tid), phase: Lg.meta.phase };
}
export function playerDetail({ pid }, ctx) {
  const Lg = L();
  const p = Lg.players[pid];
  if (!p) return { error: 'Player not found' };
  const s = Lg.meta.season;
  const mine = p.tid >= 0 && own(ctx, p.tid);
  const isFA = p.tid === -1;
  const c = p.contract;
  const actsFor = ctx.tid;
  let ask = null;
  try { ask = (p.tid >= -1) ? playerAsk(p, actsFor, { fa: isFA }) : null; } catch { ask = null; }
  const seasons = Object.keys(p.stats || {}).sort().map((y) => ({ y: +y, tm: p.stats[y].tm != null ? T(p.stats[y].tm)?.abbr : null, real: !!p.stats[y].real, REG: p.stats[y].REG || null, POST: p.stats[y].POST || null }));
  const attrs = {};
  const w = OVR_W[p.pos] || {};
  for (const k in p.r.a) attrs[k] = { v: p.r.a[k], key: !!w[k], name: ATTR_NAMES[k] };
  const yrsLeft = c && !c.ps ? c.exp - capSeason() + 1 : 0;
  const canExtend = mine && c && !c.ps && yrsLeft <= 2 && !c.tag && !(c.rookie && (p.exp ?? 0) < 2);
  const expiring = mine && c && Lg.meta.phase === 'RESIGN' && c.exp === s;
  const scouted = p.status === 'PROSPECT' ? scoutedView(p, ctx.tid) : null;
  return {
    ...pRow(p), legal: p.legal, born: p.born, draft: p.draft, combine: p.combine || null,
    ratings: p.status === 'PROSPECT' ? null : { ovr: p.r.ovr, attrs, hist: p.r.hist || [], start: p.r.ovrStart, potEst: Math.round(p.r.potEst ?? p.r.pot) },
    scouted, scoutLvl: scouted?.lvl ?? null, scoutCost: scouted ? SCOUT_COST[(scouted.lvl || 0) + 1] : null,
    pers: (p.status !== 'PROSPECT' || (scouted && scouted.pers)) ? personalityLabels(p.pers, p).map(([l, d]) => ({ l, d })) : [],
    persDims: (p.status !== 'PROSPECT' || (scouted && scouted.pers)) ? p.pers : null,
    contractFull: c ? { ...c, years: (c.years || []).map((y) => ({ ...y, hit: y.base + y.bonus })) } : null,
    dead: c && p.tid >= 0 ? deadMoneyIfCut(p) : null, deadJune1: c && p.tid >= 0 ? deadMoneyIfCut(p, { june1: true }) : null,
    restructure: mine ? restructurePreview(p) : null,
    marketValue: p.tid >= -1 ? marketValue(p) : null, ask, idealYears: p.tid >= -1 ? idealYears(p) : null,
    seasons, log: (p.log || []).filter((x) => x.s === s || x.s === s - 1).map((x) => ({ ...x, oppAbbr: x.opp != null ? T(x.opp)?.abbr : null })),
    awards: p.awards || [], injHist: p.injHist || [], realPB: p.realPB, realAP: p.realAP, retired: p.retired || null, hof: p.hof || null,
    mine, isFA, canExtend, expiring, canTag: expiring && Lg.rules.franchiseTag && T(p.tid).tagUsed !== s + 1,
    tagVals: expiring ? tagValues(s + 1)[p.pos] : null,
    option5: mine && c?.option5 === 'pending' ? fifthYearOptionValue(p) : null,
    tradeValue: p.tid >= 0 ? playerTradeValue(p, ctx.tid) : null, teamName: tName(p.tid), team: p.tid >= 0 ? teamLite(T(p.tid)) : null,
    phase: Lg.meta.phase, faOffers: isFA && Lg.fa?.offers?.[pid] ? Lg.fa.offers[pid].map((o) => ({ tid: o.tid, abbr: T(o.tid).abbr, mine: o.tid === ctx.tid, years: o.tid === ctx.tid ? o.years : null, apy: o.tid === ctx.tid ? o.apy : null })) : null,
    holdout: !!p.holdout, waiver: !!p.waiver, txHist: Lg.transactions.filter((t) => t.pids?.includes(pid)).slice(0, 15),
  };
}

// ------------------------------------------------------------------ depth chart
export function depth({ tid }, ctx) {
  const Lg = L();
  tid = tid ?? ctx.tid;
  const t = T(tid);
  const out = {};
  for (const pos of [...POSITIONS, 'KR', 'PR']) out[pos] = (t.depth[pos] || []).map((pid) => pRow(Lg.players[pid])).filter((x) => x.tid === tid);
  const pool = Object.values(Lg.players).filter((p) => p.tid === tid && p.status === 'ACT').map((p) => pRow(p));
  return { team: teamLite(t), depth: out, pool, slots: DEPTH_SLOTS, mine: own(ctx, tid), locked: !!t.depthLocked };
}
export function setDepthChart({ tid, pos, pids }, ctx) { requireOwn(ctx, tid); return setDepth(tid, pos, pids); }
export function autoDepthChart({ tid }, ctx) { requireOwn(ctx, tid); autoDepth(tid); T(tid).depthLocked = false; return { ok: true }; }

// ------------------------------------------------------------------ standings & schedule
export function standings({ season } = {}) {
  const Lg = L();
  const s = season ?? Lg.meta.season;
  if (s !== Lg.meta.season && Lg.history.seasons[s]) {
    const h = Lg.history.seasons[s];
    return { season: s, past: true, rows: h.standings.map((x) => ({ ...teamLite(T(x.tid)), ...x })), seeds: h.seeds };
  }
  const st = computeStandings(s);
  const marks = clinchMarkers(st);
  const divs = {};
  for (const conf of ['AFC', 'NFC']) for (const d of ['East', 'North', 'South', 'West']) {
    divs[`${conf} ${d}`] = divisionOrder(st, conf, d).map((tid) => ({ ...teamLite(T(tid)), ...pick(st[tid]), mark: marks[tid] }));
  }
  const seeds = { AFC: playoffSeeds(st, 'AFC').seeds, NFC: playoffSeeds(st, 'NFC').seeds };
  const power = [...Lg.teams].sort((a, b) => (a.powerRank ?? 99) - (b.powerRank ?? 99)).map((t) => ({ ...teamLite(t), rank: t.powerRank, prev: t.prevRank, ...pick(st[t.tid]), ovr: teamOvr(t.tid).ovr }));
  return { season: s, divs, seeds, power, playoffs: Lg.playoffs?.s === s ? Lg.playoffs : null, userTids: Lg.meta.userTids, teamsPerConf: Lg.rules.playoffTeamsPerConf };
  function pick(x) { return { w: x.w, l: x.l, t: x.t, pf: x.pf, pa: x.pa, pct: x.pct, dw: x.dw, dl: x.dl, cw: x.cw, cl: x.cl, streak: x.streak, home: x.home, away: x.away, sos: x.sos }; }
}
export function schedule({ tid = null, season = null, week = null } = {}) {
  const Lg = L();
  const s = season ?? Lg.meta.season;
  let gs = Lg.games.filter((g) => g.s === s && g.type !== 'PRE');
  if (tid != null) gs = gs.filter((g) => g.h === tid || g.a === tid);
  if (week != null) gs = gs.filter((g) => g.w === week);
  gs.sort((a, b) => a.w - b.w || (a.d || '').localeCompare(b.d || ''));
  return { season: s, games: gs.map(gameLite), week: Lg.meta.week, phase: Lg.meta.phase, byeWeeks: tid != null ? byeWeek(tid, s) : null };
}
function byeWeek(tid, s) {
  const ws = new Set(G.L.games.filter((g) => g.s === s && g.type === 'REG' && (g.h === tid || g.a === tid)).map((g) => g.w));
  for (let w = 1; w <= (G.L.rules.weeks || 18); w++) if (!ws.has(w)) return w;
  return null;
}
export function game({ gid }) {
  const Lg = L();
  const g = Lg.games.find((x) => x.gid === gid);
  if (!g) return { error: 'Game not found' };
  const out = { ...gameLite(g), box: null, home: teamLite(T(g.h)), away: teamLite(T(g.a)) };
  if (g.box) {
    const pl = {};
    for (const pid in g.box.pl || {}) { const p = Lg.players[pid]; if (p) pl[pid] = { ...g.box.pl[pid], name: `${p.fn[0]}. ${p.ln}`, pos: p.pos, tid: p.stats?.[g.s]?.tm ?? p.tid }; }
    // attribute players to sides using who played for whom (fallback on current team)
    for (const pid in pl) { const l = (Lg.players[pid].log || []).find((x) => x.gid === gid); if (l) pl[pid].tid = l.tm; }
    out.box = { tm: g.box.tm, scoring: g.box.scoring, plays: g.box.plays, inj: (g.box.inj || []).map((x) => ({ ...x, name: Lg.players[x.pid] ? `${Lg.players[x.pid].fn} ${Lg.players[x.pid].ln}` : '?' })), pl };
  }
  return out;
}

// ------------------------------------------------------------------ stats & leaders
export function playerStats({ season = null, pos = 'ALL', cat = 'passing', type = 'REG', tid = null } = {}) {
  const Lg = L();
  const s = season ?? Lg.meta.season;
  let ps = Object.values(Lg.players).filter((p) => p.stats?.[s]?.[type]);
  if (pos !== 'ALL') ps = ps.filter((p) => p.pos === pos);
  if (tid != null) ps = ps.filter((p) => (p.stats[s].tm ?? p.tid) === tid);
  const rows = ps.map((p) => ({ pid: p.pid, name: `${p.fn} ${p.ln}`, pos: p.pos, team: p.stats[s].tm != null && p.stats[s].tm >= 0 ? T(p.stats[s].tm)?.abbr : (p.tid >= 0 ? T(p.tid).abbr : 'FA'), ovr: p.r.ovr, hs: p.hs, ...p.stats[s][type], av: Math.round(av(p, p.stats[s][type])) }));
  const filt = { passing: (r) => (r.att || 0) >= 1, rushing: (r) => (r.car || 0) >= 1, receiving: (r) => (r.tgt || 0) + (r.rec || 0) >= 1, defense: (r) => (r.tkl || 0) + (r.ast || 0) + (r.sck || 0) + (r.dint || 0) + (r.pd || 0) > 0, kicking: (r) => (r.fga || 0) + (r.xpa || 0) + (r.pnt || 0) > 0, returns: (r) => (r.kr || 0) + (r.pr || 0) > 0 }[cat] || (() => true);
  return { season: s, rows: rows.filter(filt), seasons: availableSeasons() };
}
export function leaders({ season = null } = {}) {
  const Lg = L();
  const s = season ?? Lg.meta.season;
  const ps = Object.values(Lg.players).filter((p) => p.stats?.[s]?.REG);
  const cats = [['pyd', 'Passing Yards'], ['ptd', 'Passing TDs'], ['ryd', 'Rushing Yards'], ['rtd', 'Rushing TDs'], ['recyd', 'Receiving Yards'], ['rec', 'Receptions'], ['rectd', 'Receiving TDs'], ['sck', 'Sacks'], ['dint', 'Interceptions'], ['tkl', 'Solo Tackles'], ['pd', 'Passes Defended'], ['fgm', 'Field Goals']];
  const out = {};
  for (const [k, label] of cats) out[k] = { label, rows: ps.filter((p) => p.stats[s].REG[k]).sort((a, b) => b.stats[s].REG[k] - a.stats[s].REG[k]).slice(0, 10).map((p) => ({ pid: p.pid, name: `${p.fn} ${p.ln}`, team: p.stats[s].tm != null && p.stats[s].tm >= 0 ? T(p.stats[s].tm)?.abbr : '', v: Math.round(p.stats[s].REG[k] * 10) / 10, hs: p.hs })) };
  return { season: s, cats: out, seasons: availableSeasons() };
}
function availableSeasons() { const s = new Set(); for (const p of Object.values(G.L.players)) for (const y in p.stats || {}) s.add(+y); return [...s].sort((a, b) => b - a).slice(0, 12); }
export function teamStats({ season = null } = {}) {
  const Lg = L();
  const s = season ?? Lg.meta.season;
  return { season: s, rows: Lg.teams.map((t) => ({ ...teamLite(t), ...(t.stats?.[s]?.REG || {}) })) };
}

// ------------------------------------------------------------------ news
export function newsFeed({ tid = null, type = null, limit = 120 } = {}) {
  const Lg = L();
  let n = Lg.news;
  if (tid != null) n = n.filter((x) => x.tids?.includes(tid));
  if (type) n = n.filter((x) => x.type === type);
  return { news: n.slice(0, limit), transactions: Lg.transactions.filter((x) => tid == null || x.tids?.includes(tid)).slice(0, limit) };
}

// ------------------------------------------------------------------ cap & contracts
export function capSheet({ tid }, ctx) {
  const Lg = L();
  tid = tid ?? ctx.tid;
  const s = capSeason();
  const ps = Object.values(Lg.players).filter((p) => p.tid === tid).map((p) => ({ ...pRow(p), years: (p.contract?.years || []).filter((y) => y.s >= s).map((y) => ({ s: y.s, hit: y.base + y.bonus, gtd: y.gtd })), dead: p.contract ? deadMoneyIfCut(p) : null }));
  ps.sort((a, b) => (b.contract?.hit || 0) - (a.contract?.hit || 0));
  const t = T(tid);
  return { team: teamLite(t), cap: teamCap(tid), future: futureCommitments(tid, 5), players: ps, dead: (t.dead || []).filter((d) => d.s >= s), tags: tagValues(s), caps: Object.fromEntries([0, 1, 2, 3, 4].map((i) => [s + i, capFor(s + i)])), mine: own(ctx, tid), season: s };
}
export function releaseP({ pid, june1 }, ctx) {
  const p = L().players[pid]; requireOwn(ctx, p.tid);
  return releasePlayer(pid, { june1 });
}
export function restructureP({ pid }, ctx) { const p = L().players[pid]; requireOwn(ctx, p.tid); return restructure(pid); }
export function tagP({ pid, kind }, ctx) { const p = L().players[pid]; requireOwn(ctx, p.tid); return applyTag(pid, kind); }
export function optionP({ pid }, ctx) { const p = L().players[pid]; requireOwn(ctx, p.tid); return exerciseOption(pid); }
export function declineOption({ pid }, ctx) { const p = L().players[pid]; requireOwn(ctx, p.tid); p.contract.option5 = 'declined'; return { ok: true }; }
export function irP({ pid }, ctx) { const p = L().players[pid]; requireOwn(ctx, p.tid); return placeOnIR(pid); }
export function activateP({ pid }, ctx) { const p = L().players[pid]; requireOwn(ctx, p.tid); return activateFromIR(pid); }
export function toPS({ pid }, ctx) {
  const Lg = L(); const p = Lg.players[pid]; requireOwn(ctx, p.tid);
  const n = Object.values(Lg.players).filter((x) => x.tid === p.tid && x.status === 'PS').length;
  if (n >= Lg.rules.psMax) return { error: `Practice squad is full (${Lg.rules.psMax}).` };
  const vets = Object.values(Lg.players).filter((x) => x.tid === p.tid && x.status === 'PS' && (x.exp ?? 0) > 2).length;
  if ((p.exp ?? 0) > 2 && vets >= 6) return { error: 'Only 6 practice squad spots can go to players with 3+ accrued seasons.' };
  if (p.contract && p.contract.gtd > 0 && !p.contract.rookie) return { error: 'Players with guaranteed money must be released first (they would clear waivers).' };
  const dm = p.contract ? deadMoneyIfCut(p) : { now: 0 };
  if (dm.now > 0) { const t = Lg.teams[p.tid]; t.dead.push({ s: capSeason(), amt: dm.now, pid, name: `${p.fn} ${p.ln}` }); }
  for (const k in Lg.teams[p.tid].depth) Lg.teams[p.tid].depth[k] = Lg.teams[p.tid].depth[k].filter((x) => x !== pid);
  p.status = 'PS'; p.contract = psDeal(p, capSeason());
  return { ok: true };
}
export function promoteP({ pid }, ctx) {
  const Lg = L(); const p = Lg.players[pid]; requireOwn(ctx, p.tid);
  const act = Object.values(Lg.players).filter((x) => x.tid === p.tid && x.status === 'ACT').length;
  const max = ['REGULAR_SEASON', 'PLAYOFFS'].includes(Lg.meta.phase) ? Lg.rules.activeMax : Lg.rules.offseasonMax;
  if (act >= max) return { error: `Active roster is full (${max}).` };
  p.status = 'ACT'; p.contract = minDeal(p, capSeason()); autoDepth(p.tid, { keepUserOrder: true });
  return { ok: true };
}
export function autoCutdown({ tid }, ctx) { requireOwn(ctx, tid); aiCutdown(tid); return { ok: true }; }
export function toggleBlock({ pid }, ctx) { const p = L().players[pid]; requireOwn(ctx, p.tid); p.onBlock = !p.onBlock; return { ok: true, onBlock: p.onBlock }; }

export function negotiateP({ pid, offer, mode }, ctx) {
  const Lg = L();
  const p = Lg.players[pid];
  const tid = ctx.tid;
  if (!Lg.meta.userTids.includes(tid)) throw new Error('No team');
  offer = { years: clamp(Math.round(offer.years), 1, 7), apy: Math.round(offer.apy), gtd: Math.round(clamp(offer.gtd, 0, offer.apy * offer.years)) };
  if (p.tid === -1) return userOffer(tid, pid, offer);
  requireOwn(ctx, p.tid);
  const s = capSeason();
  const startS = mode === 'extend' ? p.contract.exp + 1 : s;
  const cap = teamCap(tid, startS);
  const res = negotiate(pid, tid, offer, {});
  if (res.status === 'accepted') {
    const hitNow = mode === 'extend' ? 0 : offer.apy;
    if (hitNow > cap.space + capHit(p, s)) return { status: 'counter', message: 'He would accept, but you do not have the cap space.', ev: res.ev };
    signContract(pid, tid, offer, { type: mode === 'extend' ? 'extend' : 'sign', start: mode === 'extend' ? null : (Lg.meta.phase === 'RESIGN' ? Lg.meta.season + 1 : null) });
    if (p.holdout) { p.holdout = false; news(`${p.fn} ${p.ln} ends his holdout after agreeing to a new deal.`, { type: 'holdout', tids: [tid], pids: [pid] }); }
  }
  return res;
}

// ------------------------------------------------------------------ free agency
export function faList({ pos = 'ALL', limit = 400 } = {}, ctx) {
  const Lg = L();
  let fas = freeAgents();
  if (pos !== 'ALL') fas = fas.filter((p) => p.pos === pos);
  fas.sort((a, b) => b.r.ovr - a.r.ovr);
  return {
    rows: fas.slice(0, limit).map((p) => {
      const ask = playerAsk(p, ctx.tid, { fa: true });
      const offers = Lg.fa?.offers?.[p.pid] || [];
      return pRow(p, { ask: ask.apy, askYears: ask.years, mv: ask.mv, offers: offers.length, myOffer: offers.find((o) => o.tid === ctx.tid) || null, lastTeam: p.lastTeam != null && p.lastTeam >= 0 ? T(p.lastTeam).abbr : null, udfa: !!p.udfa });
    }),
    day: Lg.fa?.day ?? null, phase: Lg.meta.phase, cap: teamCap(ctx.tid), signings: (Lg.fa?.log || []).slice(-40).reverse().map((x) => ({ ...x, name: `${Lg.players[x.pid]?.fn} ${Lg.players[x.pid]?.ln}`, abbr: T(x.tid).abbr })),
  };
}
export function withdrawOffer({ pid }, ctx) { const Lg = L(); if (Lg.fa?.offers?.[pid]) Lg.fa.offers[pid] = Lg.fa.offers[pid].filter((o) => o.tid !== ctx.tid); return { ok: true }; }
export function signMin({ pid }, ctx) {
  const Lg = L(); const p = Lg.players[pid];
  if (p.tid !== -1) return { error: 'Not a free agent' };
  const ask = playerAsk(p, ctx.tid, { fa: true });
  const minOk = ask.apy <= minDeal(p, capSeason()).apy * 1.15 || p.udfa;
  if (!minOk && Lg.meta.phase !== 'REGULAR_SEASON') return { error: `${p.fn} ${p.ln} wants more than the minimum (${fmtMoney(ask.apy)}).` };
  return userOffer(ctx.tid, pid, { years: p.udfa ? 3 : 1, apy: minDeal(p, capSeason()).apy, gtd: 0 });
}
export function signToPS({ pid }, ctx) {
  const Lg = L(); const p = Lg.players[pid];
  if (p.tid !== -1) return { error: 'Not a free agent' };
  const tid = ctx.tid;
  const n = Object.values(Lg.players).filter((x) => x.tid === tid && x.status === 'PS').length;
  if (n >= Lg.rules.psMax) return { error: 'Practice squad is full.' };
  if ((p.exp ?? 0) > 2 && Object.values(Lg.players).filter((x) => x.tid === tid && x.status === 'PS' && (x.exp ?? 0) > 2).length >= 6) return { error: 'No veteran practice squad spots left.' };
  p.tid = tid; p.status = 'PS'; p.contract = psDeal(p, capSeason()); p.waiver = null;
  return { ok: true };
}

// ------------------------------------------------------------------ trades
export function tradeAssets({ tid }, ctx) {
  const Lg = L();
  const ps = Object.values(Lg.players).filter((p) => p.tid === tid && p.status !== 'IR').sort((a, b) => b.r.ovr - a.r.ovr).map((p) => pRow(p, { value: playerTradeValue(p, ctx.tid) }));
  const picks = Lg.picks.filter((x) => x.tid === tid).sort((a, b) => a.s - b.s || a.rd - b.rd).map((k) => ({ id: k.id, label: pickLabel(k), s: k.s, rd: k.rd, proj: projectedPickNo(k), value: pickTradeValue(k, ctx.tid), comp: !!k.comp, tradable: !(k.comp && !k.no) }));
  return { team: { ...teamLite(T(tid)), mode: teamMode(tid), cap: teamCap(tid) }, players: ps, picks };
}
export function tradeEval({ aiTid, give, get }, ctx) { return evaluateTrade(ctx.tid, aiTid, give, get); }
export function tradePropose({ aiTid, give, get }, ctx) {
  const Lg = L();
  if (Lg.meta.userTids.includes(aiTid)) {
    // human-to-human trade (online or local multi-team): needs the other GM to accept
    const id = `o${Date.now().toString(36)}`;
    Lg.offers.unshift({ id, s: Lg.meta.season, w: Lg.meta.week, ph: Lg.meta.phase, fromTid: ctx.tid, toTid: aiTid, give, get, status: 'open', human: true });
    return { ok: true, pending: true, message: `Offer sent to ${T(aiTid).abbr}.` };
  }
  const ev = evaluateTrade(ctx.tid, aiTid, give, get);
  if (!ev.accept) return { ok: false, ...ev };
  const r = executeTrade(ctx.tid, aiTid, give, get);
  return { ok: true, ...r };
}
export function tradeMakeItWork({ aiTid, give, get }, ctx) { return makeItWork(ctx.tid, aiTid, give, get); }
export function tradeFind({ give, want, pos }, ctx) {
  const res = tradeFinder(ctx.tid, { give, want, pos });
  const Lg = L();
  const desc = (as) => ({ players: as.players.map((pid) => pRow(Lg.players[pid])), picks: as.picks.map((id) => ({ id, label: pickLabel(Lg.picks.find((x) => x.id === id)) })) });
  return res.map((r) => ({ tid: r.tid, team: teamLite(T(r.tid)), give: r.give, get: r.get, giveV: desc(r.give), getV: desc(r.get), meter: r.ev.meter }));
}
function offerView(o) {
  const Lg = L();
  const desc = (as) => ({ players: as.players.map((pid) => Lg.players[pid] ? pRow(Lg.players[pid]) : null).filter(Boolean), picks: as.picks.map((id) => ({ id, label: pickLabel(Lg.picks.find((x) => x.id === id)) })) });
  return { ...o, from: teamLite(T(o.fromTid)), giveV: desc(o.give), getV: desc(o.get) };
}
export function tradeOffers(_, ctx) {
  const Lg = L();
  return { incoming: Lg.offers.filter((o) => o.toTid === ctx.tid && o.status === 'open').map(offerView), outgoing: Lg.offers.filter((o) => o.fromTid === ctx.tid && o.status === 'open').map(offerView), log: (Lg.tradeLog || []).slice(0, 60) };
}
export function respondOffer({ id, accept }, ctx) {
  const Lg = L();
  const o = Lg.offers.find((x) => x.id === id);
  if (!o || o.toTid !== ctx.tid) return { error: 'Offer not found' };
  if (!accept) { o.status = 'declined'; return { ok: true }; }
  // o.give = assets fromTid sends; o.get = assets toTid sends
  const ev = evaluateTrade(o.fromTid, o.toTid, o.give, o.get);
  if (ev.err) { o.status = 'void'; return { error: ev.err }; }
  for (const pid of [...o.give.players, ...o.get.players]) if (!Lg.players[pid] || (o.give.players.includes(pid) ? Lg.players[pid].tid !== o.fromTid : Lg.players[pid].tid !== o.toTid)) { o.status = 'void'; return { error: 'The players in this offer have moved.' }; }
  executeTrade(o.fromTid, o.toTid, o.give, o.get);
  o.status = 'accepted';
  return { ok: true };
}

// ------------------------------------------------------------------ draft
export function draftBoard({ pos = 'ALL' } = {}, ctx) {
  const Lg = L();
  let ps = prospects(Lg.meta.phase === 'DRAFT' ? Lg.draft?.s : (['FREE_AGENCY', 'LEAGUE_MEETING', 'POST_DRAFT'].includes(Lg.meta.phase) ? Lg.meta.season : Lg.meta.season + 1));
  if (pos !== 'ALL') ps = ps.filter((p) => p.pos === pos);
  ps.sort((a, b) => a.scout.rank - b.scout.rank);
  const t = T(ctx.tid);
  const myBoard = t.board || [];
  return {
    rows: ps.slice(0, 450).map((p) => {
      const v = scoutedView(p, ctx.tid);
      return { pid: p.pid, name: `${p.fn} ${p.ln}`, pos: p.pos, age: age(p, (Lg.draft?.s || Lg.meta.season + 1)), college: p.college, ht: p.ht, wt: p.wt, rank: p.scout.rank, posRank: p.scout.posRank, combine: p.combine, lvl: v.lvl, lo: v.ovrLo, hi: v.ovrHi, pot: v.pot, proj: projRound(p.scout.rank), onBoard: myBoard.includes(p.pid) };
    }),
    scoutPts: t.scoutPts || 0, costs: SCOUT_COST, board: myBoard,
  };
}
function projRound(rank) { return rank <= 32 ? '1st' : rank <= 64 ? '2nd' : rank <= 100 ? '3rd' : rank <= 140 ? '4th' : rank <= 180 ? '5th' : rank <= 220 ? '6th' : rank <= 262 ? '7th' : 'UDFA'; }
export function scout({ pid }, ctx) { return scoutProspect(ctx.tid, pid); }
export function boardToggle({ pid }, ctx) { const t = T(ctx.tid); t.board ||= []; t.board = t.board.includes(pid) ? t.board.filter((x) => x !== pid) : [...t.board, pid]; return { ok: true }; }
export function boardMove({ pid, dir }, ctx) { const t = T(ctx.tid); const b = t.board || []; const i = b.indexOf(pid); const j = i + dir; if (i < 0 || j < 0 || j >= b.length) return { ok: true }; [b[i], b[j]] = [b[j], b[i]]; return { ok: true }; }
export function draftState(_, ctx) {
  const Lg = L();
  const d = Lg.draft;
  const s = d?.s ?? Lg.meta.season + 1;
  const orderIds = Lg.draftOrder?.[s] || [];
  const order = orderIds.map((id) => Lg.picks.find((x) => x.id === id) || null);
  const log = (d?.log || []).map((x) => ({ ...x, name: `${Lg.players[x.pid]?.fn} ${Lg.players[x.pid]?.ln}`, pos: Lg.players[x.pid]?.pos, college: Lg.players[x.pid]?.college, abbr: T(x.tid).abbr, logo: T(x.tid).logo }));
  const upcoming = order.slice(d?.idx ?? 0, (d?.idx ?? 0) + 40).filter(Boolean).map((pk) => ({ id: pk.id, no: pk.no, rd: pk.rd, tid: pk.tid, abbr: T(pk.tid).abbr, logo: T(pk.tid).logo, mine: pk.tid === ctx.tid, via: pk.orig !== pk.tid ? T(pk.orig).abbr : null, comp: !!pk.comp }));
  const myPicks = Lg.picks.filter((x) => x.tid === ctx.tid && x.s === s).map((k) => ({ id: k.id, label: pickLabel(k), no: k.no }));
  return { s, active: Lg.meta.phase === 'DRAFT', done: !!d?.done, idx: d?.idx ?? 0, onClock: upcoming[0] || null, userOnClock: !!userOnClock() && userOnClock().tid === ctx.tid, log: log.slice(-300).reverse(), upcoming, myPicks, orderSet: !!orderIds.length };
}
export function draftPick({ pid }, ctx) {
  const up = userOnClock();
  if (!up || !own(ctx, up.tid)) return { error: "You're not on the clock." };
  return draftCurrentPick(pid);
}
export function draftSim({ all = false }, ctx) { if (!ctx.host) { const up = userOnClock(); if (up && up.tid !== ctx.tid) return { error: 'Waiting on another GM.' }; } return simDraftToUser(all); }
export function draftAuto(_, ctx) { const up = userOnClock(); if (!up || !own(ctx, up.tid)) return { error: 'Not on the clock' }; return draftCurrentPick(null); }

// ------------------------------------------------------------------ fantasy draft
export function fantasyState({ pos = 'ALL' } = {}, ctx) {
  const Lg = L();
  const F = Lg.fantasy;
  let pool = fantasyPool();
  if (pos !== 'ALL') pool = pool.filter((p) => p.pos === pos);
  pool.sort((a, b) => b.r.ovr - a.r.ovr);
  const mine = Object.values(Lg.players).filter((p) => p.tid === ctx.tid);
  return { F: F ? { round: F.round, idx: F.idx, done: F.done, rounds: F.rounds } : null, onClock: fantasyOnClock(), mineOnClock: fantasyOnClock() === ctx.tid, pool: pool.slice(0, 300).map((p) => pRow(p)), mine: mine.map((p) => pRow(p)), log: (F?.log || []).slice(-60).reverse().map((x) => ({ ...x, name: `${Lg.players[x.pid].fn} ${Lg.players[x.pid].ln}`, pos: Lg.players[x.pid].pos, ovr: Lg.players[x.pid].r.ovr, abbr: T(x.tid).abbr })), order: F?.order.map((t) => T(t).abbr) };
}
export function fantasyMakePick({ pid }, ctx) { if (fantasyOnClock() !== ctx.tid) return { error: 'Not your pick' }; return fantasyPick(pid); }
export function fantasySim({ all }, ctx) { if (!ctx.host && fantasyOnClock() !== ctx.tid && G.L.meta.userTids.includes(fantasyOnClock())) return { error: 'Waiting on another GM' }; return fantasySimToUser(!!all); }
export function fantasyAutoMine(_, ctx) { if (fantasyOnClock() !== ctx.tid) return { error: 'Not your pick' }; return fantasyPick(null); }

// ------------------------------------------------------------------ staff, owner, finances
export function staff({ tid }, ctx) {
  const Lg = L();
  tid = tid ?? ctx.tid;
  const t = T(tid);
  const cv = (c) => c && { ...c, ovr: coachOvr(c), team: c.tid >= 0 ? T(c.tid)?.abbr : null, winPct: c.rec ? (c.rec.w + c.rec.t * 0.5) / Math.max(1, c.rec.w + c.rec.l + c.rec.t) : null };
  return {
    team: teamLite(t), hc: cv(Lg.coaches[t.staff.hc]), oc: cv(Lg.coaches[t.staff.oc]), dc: cv(Lg.coaches[t.staff.dc]), devBonus: t.staff.devBonus,
    pool: Object.values(Lg.coaches).filter((c) => c.tid == null || c.tid < 0).map(cv).sort((a, b) => b.ovr - a.ovr),
    league: Lg.teams.map((x) => ({ ...teamLite(x), hc: cv(Lg.coaches[x.staff.hc]) })), mine: own(ctx, tid), phase: Lg.meta.phase,
  };
}
export function hire({ cid, role }, ctx) {
  const Lg = L();
  if (!['SEASON_END', 'RESIGN', 'FREE_AGENCY', 'LEAGUE_MEETING', 'DRAFT', 'POST_DRAFT', 'TRAINING_CAMP'].includes(Lg.meta.phase) && role === 'HC') {
    // allow interim changes in season
  }
  return hireCoach(ctx.tid, cid, role);
}
export function fire({ role }, ctx) { return fireCoach(ctx.tid, role); }
export function finances({ tid }, ctx) {
  const Lg = L();
  tid = tid ?? ctx.tid;
  const t = T(tid);
  return { team: teamLite(t), fin: t.fin, owner: t.owner, jobSec: t.jobSec, goals: t.goals, goalResults: t.goalResults, stadium: t.stadium, market: t.market, att: attendanceFor(t), rev: homeGameRevenue(t), mine: own(ctx, tid), season: Lg.meta.season, ref: Math.round(110 + Math.log1p(t.market) * 38) };
}
export function setPrices({ ticket, concessions, parking }, ctx) {
  const t = T(ctx.tid);
  if (ticket != null) t.fin.ticket = clamp(Math.round(ticket), 40, 600);
  if (concessions != null) t.fin.concessions = clamp(concessions, 0.6, 1.6);
  if (parking != null) t.fin.parking = clamp(parking, 0.5, 1.8);
  return { ok: true };
}

// ------------------------------------------------------------------ league office
export function rulesView(_, ctx) {
  const Lg = L();
  return { rules: Lg.rules, proposals: Lg.proposals, history: Lg.ruleHistory || [], phase: Lg.meta.phase, available: PROPOSALS.filter((p) => p.cond(Lg.rules)).map((p) => ({ id: p.id, title: p.title, desc: p.desc })), myTid: ctx.tid };
}
export function vote({ id, yes }, ctx) { return castVote(ctx.tid, id, yes); }
export function propose({ id }, ctx) { if (G.L.meta.phase !== 'LEAGUE_MEETING' || G.L.proposals?.done) return { error: 'Proposals can only be submitted during the Annual League Meeting.' }; return userPropose(ctx.tid, id); }
export function history() {
  const Lg = L();
  return {
    champions: Lg.champions.map((c) => ({ ...c, team: c.tid != null ? teamLite(T(c.tid)) : null, ruTeam: c.ru != null ? teamLite(T(c.ru)) : null, mvpName: c.mvp && Lg.players[c.mvp] ? `${Lg.players[c.mvp].fn} ${Lg.players[c.mvp].ln}` : null })),
    awards: Object.fromEntries(Object.entries(Lg.awards).map(([s, a]) => [s, Object.fromEntries(Object.entries(a).map(([k, v]) => [k, Array.isArray(v) ? v.slice(0, k === 'AP1' || k === 'AP2' || k === 'PB' ? 120 : 5).map((x) => ({ ...x, name: x.pid && Lg.players[x.pid] ? `${Lg.players[x.pid].fn} ${Lg.players[x.pid].ln}` : x.coach, pos: Lg.players[x.pid]?.pos, abbr: x.tid != null ? T(x.tid)?.abbr : '' })) : v && v.pid ? { ...v, name: `${Lg.players[v.pid]?.fn} ${Lg.players[v.pid]?.ln}` } : v]))])),
    records: Object.values(Lg.records || {}).map((r) => ({ ...r, name: Lg.players[r.pid] ? `${Lg.players[r.pid].fn} ${Lg.players[r.pid].ln}` : '?' })),
    hof: Lg.hof.map((h) => ({ ...h, name: Lg.players[h.pid] ? `${Lg.players[h.pid].fn} ${Lg.players[h.pid].ln}` : '?', pos: Lg.players[h.pid]?.pos })),
    seasons: Object.entries(Lg.history.seasons).map(([s, h]) => ({ s: +s, champ: h.champ != null ? T(h.champ).abbr : null })),
    teamHist: Lg.teams.map((t) => ({ ...teamLite(t), hist: t.hist || [] })),
    trades: (Lg.tradeLog || []).slice(0, 100),
  };
}
export function eventsList(_, ctx) { return { events: G.L.events.filter((e) => e.tid === ctx.tid).slice(0, 30) }; }
export function eventResolve({ id, choice }, ctx) { const e = G.L.events.find((x) => x.id === id); if (!e || e.tid !== ctx.tid) return { error: 'Not your event' }; return resolveEvent(id, choice); }

// ------------------------------------------------------------------ settings & sim
export function settings() {
  const Lg = L();
  return { sliders: Lg.settings.sliders, info: SLIDER_INFO, defaults: DEFAULT_SLIDERS, autoUser: Lg.settings.autoUser, autoCoaching: Lg.settings.autoCoaching, aiTradesUser: Lg.settings.aiTradesUser, name: Lg.meta.name, userTids: Lg.meta.userTids, teams: Lg.teams.map(teamLite) };
}
export function saveSettings({ sliders, autoUser, aiTradesUser, name }, ctx) {
  const Lg = L();
  if (!ctx.host && Lg.meta.online) return { error: 'Only the host can change league settings.' };
  if (sliders) for (const k in sliders) if (k in DEFAULT_SLIDERS) Lg.settings.sliders[k] = clamp(+sliders[k], 0, 3);
  if (autoUser) Object.assign(Lg.settings.autoUser, autoUser);
  if (aiTradesUser != null) Lg.settings.aiTradesUser = !!aiTradesUser;
  if (name) Lg.meta.name = String(name).slice(0, 60);
  return { ok: true };
}
export function setUserTeams({ tids }, ctx) {
  if (!ctx.host) return { error: 'Host only' };
  G.L.meta.userTids = tids.filter((t) => t >= 0 && t < 32);
  return { ok: true };
}
export function takeOverTeam({ tid, from }, ctx) {
  const m = G.L.meta;
  m.userTids = m.userTids.map((t) => (t === from ? tid : t));
  if (!m.userTids.includes(tid)) m.userTids.push(tid);
  const t = G.L.teams[tid];
  t.jobSec = 70;
  (m.firedNotices || []).forEach((f) => { if (f.tid === from) f.seen = true; });
  return { ok: true };
}
export function dismissFired({ tid }) { (G.L.meta.firedNotices || []).forEach((f) => { if (f.tid === tid) f.seen = true; }); G.L.teams[tid].jobSec = 40; return { ok: true }; }
export function sim({ target }, ctx) {
  if (G.L.meta.online && !ctx.host) return { error: 'Only the host can advance the league.' };
  return simUntil(target || 'week');
}
export function faAdvanceDay(_, ctx) { if (G.L.meta.online && !ctx.host) return { error: 'Only the host can advance.' }; return advance({ day: true }); }
export function onlineTeams() { return G.L.teams.map(teamLite).map((t) => ({ ...t, taken: G.L.meta.userTids.includes(t.tid) })); }
export function claimTeam({ tid }, ctx) {
  if (!ctx.host && !ctx.claim) return { error: 'Not allowed' };
  if (G.L.meta.userTids.includes(tid)) return { error: 'Team already taken' };
  G.L.meta.userTids.push(tid);
  return { ok: true };
}
export function releaseTeam({ tid }) { G.L.meta.userTids = G.L.meta.userTids.filter((t) => t !== tid); return { ok: true }; }
export { setRngState, rngState, isUser };
