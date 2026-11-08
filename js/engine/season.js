// Season orchestration: weekly sims, playoffs, and the offseason calendar.
import { G, rnd, gauss, clamp, age, news, transaction, capFor, isUser, shuffle, nextId, pick } from './core.js';
import { simGame } from './sim.js';
import { applyGameInjuries, weeklyInjuryUpdate } from './injuries.js';
import { updateInSeasonRatings, offseasonProgression, setOvr } from './ratings.js';
import { updateMorale, checkUnrest } from './personality.js';
import { marketValue, teamCap, releasePlayer, capSeason } from './contracts.js';
import { computeStandings, playoffSeeds, divisionOrder } from './standings.js';
import { aiWeekly, aiResignPhase, aiTenders, aiCapCompliance, aiCutdown, aiOffseasonFill, aiExtensions } from './ai.js';
import { aiTradeRound, aiOffersToUser } from './trade.js';
import { startFreeAgency, faDay, freeAgents, aiFillRoster } from './fa.js';
import { startDraft, simDraftToUser, genDraftClass, computeDraftOrder, finishDraft } from './draft.js';
import { seasonAwards, sbMvp, processRetirements, hallOfFame } from './awards.js';
import { startLeagueMeeting, tallyVotes } from './rulesvote.js';
import { aiCoachingCarousel } from './coaches.js';
import { recordHomeGame, updateFans, closeSeasonFinances, setOwnerGoals, evaluateOwner } from './finance.js';
import { generateSchedule } from './schedule.js';
import { addSeasonPicks, setExpectations } from './league.js';
import { autoDepth, rosterCounts } from './roster.js';
import { weeklyEvents } from './events.js';

export { generateSchedule };

const LOG_SKIP = new Set(['offSn', 'defSn', 'pbSn', 'rbSn', 'rbGood', 'prA', 'skA', 'fgExp', 'tgtA', 'cmpA', 'ydsA', 'tdA', 'fgaU50', 'fgLong', 'gs']);
// ---------- applying a game result
function addLine(target, line) { for (const k in line) { if (k === 'fgLng' || k === 'rLng' || k === 'recLng' || k === 'pLng') target[k] = Math.max(target[k] || 0, line[k]); else target[k] = (target[k] || 0) + line[k]; } }

export function playGame(g) {
  const Lg = G.L;
  const playoff = !['REG', 'PRE'].includes(g.type);
  const box = simGame(g, { playoff });
  g.hs = box.final[0]; g.as = box.final[1]; g.ot = box.ot; g.played = true;
  g.box = { tm: box.tm, pl: {}, scoring: box.scoring, plays: box.plays, inj: box.inj.map((x) => ({ pid: x.pid, type: x.type, wk: x.wk })) };
  const s = g.s;
  const bucket = g.type === 'REG' ? 'REG' : g.type === 'PRE' ? 'PRE' : 'POST';
  const plays = [box.tm[0].plays, box.tm[1].plays];
  for (const pid in box.pl) {
    const p = Lg.players[pid];
    if (!p) continue;
    const line = box.pl[pid];
    const side = p.tid === g.h ? 0 : 1;
    if ((line.offSn || 0) >= plays[side] * 0.5 || (line.defSn || 0) >= plays[1 - side] * 0.5) line.gs = 1;
    line.g = 1;
    delete line.gp;
    const bl = {};
    for (const k in line) if (!LOG_SKIP.has(k) || k === 'gs') bl[k] = typeof line[k] === 'number' && !Number.isInteger(line[k]) ? Math.round(line[k] * 10) / 10 : line[k];
    g.box.pl[pid] = bl;
    const ss = (p.stats[s] ||= { tm: p.tid });
    ss.tm = p.tid;
    addLine((ss[bucket] ||= {}), line);
    if (bucket !== 'PRE') {
      const cl = {};
      for (const k in line) if (!LOG_SKIP.has(k)) cl[k] = typeof line[k] === 'number' && !Number.isInteger(line[k]) ? Math.round(line[k] * 10) / 10 : line[k];
      p.log.push({ s, w: g.w, gid: g.gid, type: g.type, opp: p.tid === g.h ? g.a : g.h, tm: p.tid, home: p.tid === g.h, res: resultFor(g, p.tid), l: cl });
      if (p.log.length > 30) p.log.shift();
    }
  }
  // team season stats
  for (const [i, tid] of [[0, g.h], [1, g.a]]) {
    const t = Lg.teams[tid];
    const ts = ((t.stats ||= {})[s] ||= {});
    const b = (ts[bucket] ||= {});
    const tb = box.tm[i], ob = box.tm[1 - i];
    addLine(b, { g: 1, pts: tb.pts, ptsA: ob.pts, pyd: tb.pyd, ryd: tb.ryd, pydA: ob.pyd, rydA: ob.ryd, to: tb.to, toF: ob.to, fd: tb.fd, sk: ob.sk, skA: tb.sk, pen: tb.pen, penYd: tb.penYd, att3: tb.att3, td3: tb.td3, plays: tb.plays, top: tb.top });
  }
  if (bucket !== 'PRE') applyGameInjuries(box, g);
  else for (const inj of box.inj) { const p = Lg.players[inj.pid]; if (p && inj.wk >= 2) { p.inj = { type: inj.type, wk: inj.wk, s, w: 0, se: inj.se }; } }
  if (g.type !== 'PRE') {
    recordHomeGame(Lg.teams[g.h]);
    const hw = g.hs > g.as, aw = g.as > g.hs;
    updateFans(Lg.teams[g.h], hw, g.hs - g.as, playoff);
    updateFans(Lg.teams[g.a], aw, g.as - g.hs, playoff);
    gameRecords(g, box);
  }
  return g;
}
function resultFor(g, tid) { const my = tid === g.h ? g.hs : g.as, op = tid === g.h ? g.as : g.hs; return my > op ? 'W' : my < op ? 'L' : 'T'; }

function gameRecords(g, box) {
  const Lg = G.L;
  const R = (Lg.records ||= {});
  for (const pid in box.pl) {
    const l = box.pl[pid];
    for (const [k, label] of [['pyd', 'Passing yards (game)'], ['ryd', 'Rushing yards (game)'], ['recyd', 'Receiving yards (game)'], ['sck', 'Sacks (game)'], ['ptd', 'Passing TDs (game)']]) {
      const v = l[k] || 0;
      if (!R[k] || v > R[k].v) R[k] = { v, pid, s: g.s, w: g.w, label, gid: g.gid };
    }
  }
}

// ---------- weekly loop
export function simWeek() {
  const Lg = G.L;
  const m = Lg.meta;
  if (m.phase === 'PRESEASON') return simPreseasonWeek();
  if (m.phase === 'PLAYOFFS') return simPlayoffRound();
  if (m.phase !== 'REGULAR_SEASON') return { error: 'Not in season' };
  for (const ut of m.userTids) {
    const bad = userBlocker(ut);
    if (bad) return { error: bad };
  }
  const games = Lg.games.filter((g) => g.s === m.season && g.type === 'REG' && g.w === m.week && !g.played);
  for (const g of games) playGame(g);
  afterWeek();
  if (m.week >= (Lg.rules.weeks || 18)) {
    // regular season complete
    computeStandings();
    seasonAwards(Lg.standingsCache);
    startPlayoffs();
  } else m.week++;
  return { ok: true, played: games.length };
}

export function userBlocker(tid) {
  const Lg = G.L;
  const c = rosterCounts(tid);
  const t = Lg.teams[tid];
  if (Lg.meta.phase === 'REGULAR_SEASON' || Lg.meta.phase === 'PLAYOFFS') {
    if (c.ACT > Lg.rules.activeMax && !Lg.settings.autoUser.roster) return `${t.abbr} has ${c.ACT} players on the active roster (max ${Lg.rules.activeMax}). Release or move players first.`;
    if (c.PS > Lg.rules.psMax + 1 && !Lg.settings.autoUser.roster) return `${t.abbr} practice squad is over the limit (${c.PS}/${Lg.rules.psMax}).`;
  }
  return null;
}

function afterWeek() {
  const Lg = G.L;
  const m = Lg.meta;
  computeStandings();
  weeklyInjuryUpdate();
  processWaivers();
  const byTeam = {};
  for (const p of Object.values(Lg.players)) if (p.tid >= 0) (byTeam[p.tid] ||= []).push(p);
  for (const t of Lg.teams) aiWeekly(t.tid, byTeam[t.tid] || []);
  if (m.phase === 'REGULAR_SEASON') {
    updateInSeasonRatings();
    updateMorale(marketValue);
    if (m.week % 2 === 0) checkUnrest(marketValue);
    if (m.week <= Lg.rules.tradeDeadlineWeek) {
      aiTradeRound(m.week >= Lg.rules.tradeDeadlineWeek - 2 ? 0.55 : 0.2);
      if (m.week >= Lg.rules.tradeDeadlineWeek - 1) aiTradeRound(0.4);
      aiOffersToUser();
    }
    if (m.week === 12 || m.week === 15) for (const t of Lg.teams) aiExtensions(t.tid);
    for (const ut of m.userTids) Lg.teams[ut].scoutPts = (Lg.teams[ut].scoutPts || 0) + 40;
    weeklyEvents();
    setPowerRanks();
  }
  for (const p of Object.values(Lg.players)) if (p.tid === -1) p.faWeeks = (p.faWeeks || 0) + 1;
}

export function setPowerRanks() {
  const Lg = G.L;
  const st = Lg.standingsCache || computeStandings();
  const arr = Lg.teams.map((t) => {
    const x = st[t.tid];
    const pd = (x.pf - x.pa) / Math.max(1, x.gp);
    return { t, v: x.pct * 10 + pd * 0.18 + (t.expectWins - 8.5) * 0.25 * Math.max(0, 1 - x.gp / 10) };
  }).sort((a, b) => b.v - a.v);
  arr.forEach((x, i) => { x.t.prevRank = x.t.powerRank; x.t.powerRank = i + 1; });
}

function processWaivers() {
  const Lg = G.L;
  const st = Lg.standingsCache;
  const order = Lg.teams.map((t) => t.tid).sort((a, b) => (st?.[a]?.pct ?? 0.5) - (st?.[b]?.pct ?? 0.5));
  const waived = Object.values(Lg.players).filter((p) => p.waiver && p.tid === -1);
  if (!waived.length) return;
  const idx = {};
  for (const x of Object.values(Lg.players)) if (x.tid >= 0 && x.status === 'ACT') ((idx[x.tid] ||= {})[x.pos] ||= []).push(x);
  for (const p of waived) {
    for (const tid of order) {
      if (tid === p.waiver.from || isUser(tid)) continue;
      const peers = ((idx[tid] || {})[p.pos] || []).filter((x) => x.tid === tid && x.status === 'ACT').sort((a, b) => a.r.ovr - b.r.ovr);
      if (peers.length && p.r.ovr > peers[0].r.ovr + 4 && teamCap(tid, capSeason()).space > 2e6) {
        releasePlayer(peers[0].pid, { toWaivers: false });
        p.tid = tid; p.status = 'ACT'; p.contract = { ...(p.contractBeforeWaive || {}), years: [{ s: Lg.meta.season, base: 1.1e6, bonus: 0, gtd: 0 }], apy: 1.1e6, total: 1.1e6, gtd: 0, exp: Lg.meta.season, signed: Lg.meta.season };
        transaction('waiver', `${Lg.teams[tid].abbr} claimed ${p.pos} ${p.fn} ${p.ln} off waivers`, { tids: [tid], pids: [p.pid] });
        break;
      }
    }
    p.waiver = null;
  }
}

// ---------- preseason
function simPreseasonWeek() {
  const Lg = G.L;
  const m = Lg.meta;
  if (m.week === 0) m.week = 1;
  const n = Lg.rules.preseasonGames || 3;
  if (m.week > n) return finishPreseason();
  // random matchups
  const ids = shuffle(Lg.teams.map((t) => t.tid));
  for (let i = 0; i < 32; i += 2) {
    const g = { gid: nextId('g'), s: m.season, w: m.week, type: 'PRE', h: ids[i], a: ids[i + 1], played: false };
    // starters barely play in preseason: simulate with backups by temporarily treating as regular sim
    Lg.games.push(g);
    playGame(g);
  }
  weeklyInjuryUpdate();
  // camp battles: young players gain small bumps
  for (const p of Object.values(Lg.players)) if (p.tid >= 0 && age(p) <= 24 && rnd() < 0.08) { setOvr(p, clamp(p.r.ovr + 1, 25, 99)); p.r.ovrStart = p.r.ovr; }
  m.week++;
  if (m.week > n) return finishPreseason();
  return { ok: true };
}
function finishPreseason() {
  const Lg = G.L;
  const m = Lg.meta;
  for (const ut of m.userTids) {
    const c = rosterCounts(ut);
    if (c.ACT > Lg.rules.activeMax && !Lg.settings.autoUser.roster) {
      return { error: `Roster cutdown: ${Lg.teams[ut].abbr} must get down to ${Lg.rules.activeMax} active players (currently ${c.ACT}). Use Roster > Auto cutdown or release players.` };
    }
  }
  for (const t of Lg.teams) { if (!isUser(t.tid) || Lg.settings.autoUser.roster) aiCutdown(t.tid); aiCapCompliance(t.tid); aiWeekly(t.tid); }
  // remove preseason games' boxes to save space
  for (const g of Lg.games) if (g.type === 'PRE' && g.s === m.season) delete g.box;
  m.phase = 'REGULAR_SEASON'; m.week = 1;
  for (const p of Object.values(Lg.players)) if (p.r) p.r.ovrStart = p.r.ovr;
  news(`The ${m.season} regular season kicks off!`, { type: 'system', big: true });
  return { ok: true, phase: m.phase };
}

// ---------- playoffs
function startPlayoffs() {
  const Lg = G.L;
  const st = computeStandings();
  const seeds = { AFC: playoffSeeds(st, 'AFC').seeds, NFC: playoffSeeds(st, 'NFC').seeds };
  Lg.playoffs = { s: Lg.meta.season, seeds, round: 'WC', alive: { AFC: [...seeds.AFC], NFC: [...seeds.NFC] }, results: [] };
  Lg.playoffElim = [];
  Lg.meta.phase = 'PLAYOFFS';
  Lg.meta.week = 19;
  // record division places for next schedule
  for (const conf of ['AFC', 'NFC']) for (const d of ['East', 'North', 'South', 'West']) divisionOrder(st, conf, d).forEach((tid, i) => { Lg.teams[tid].divPlace = i; });
  for (const t of Lg.teams) { const x = st[t.tid]; (t.hist ||= []).push({ s: Lg.meta.season, w: x.w, l: x.l, t: x.t, pf: x.pf, pa: x.pa, seed: seeds[t.conf].indexOf(t.tid) + 1 || null }); }
  for (const conf of ['AFC', 'NFC']) for (const tid of Lg.teams.filter((t) => t.conf === conf).map((t) => t.tid)) if (!seeds[conf].includes(tid)) Lg.playoffElim.push({ tid, round: 0 });
  makeRoundGames('WC');
  news(`Playoff field set. AFC No. 1: ${Lg.teams[seeds.AFC[0]].name}. NFC No. 1: ${Lg.teams[seeds.NFC[0]].name}.`, { type: 'playoffs', big: true });
}
function makeRoundGames(round) {
  const Lg = G.L;
  const P = Lg.playoffs;
  const s = Lg.meta.season;
  const wk = { WC: 19, DIV: 20, CONF: 21, SB: 23 }[round];
  if (round === 'SB') {
    const a = P.alive.AFC[0], n = P.alive.NFC[0];
    const home = s % 2 === 0 ? a : n;
    Lg.games.push({ gid: nextId('g'), s, w: wk, type: 'SB', h: home, a: home === a ? n : a, neutral: true, played: false });
    return;
  }
  for (const conf of ['AFC', 'NFC']) {
    const alive = P.alive[conf];
    const seeds = P.seeds[conf];
    const ranked = [...alive].sort((x, y) => seeds.indexOf(x) - seeds.indexOf(y));
    const pairs = [];
    if (round === 'WC') {
      const n = ranked.length;
      if (n === 7) { pairs.push([ranked[1], ranked[6]], [ranked[2], ranked[5]], [ranked[3], ranked[4]]); }
      else { for (let i = 0; i < n / 2; i++) pairs.push([ranked[i], ranked[n - 1 - i]]); }
    } else {
      for (let i = 0; i < ranked.length / 2; i++) pairs.push([ranked[i], ranked[ranked.length - 1 - i]]);
    }
    for (const [h, a] of pairs) Lg.games.push({ gid: nextId('g'), s, w: wk, type: round, h, a, played: false, conf });
  }
}
function simPlayoffRound() {
  const Lg = G.L;
  const P = Lg.playoffs;
  const round = P.round;
  const games = Lg.games.filter((g) => g.s === P.s && g.type === round && !g.played);
  const ri = { WC: 1, DIV: 2, CONF: 3, SB: 4 }[round];
  for (const g of games) {
    playGame(g);
    const win = g.hs > g.as ? g.h : g.a;
    const lose = win === g.h ? g.a : g.h;
    for (const conf of ['AFC', 'NFC']) P.alive[conf] = P.alive[conf].filter((t) => t !== lose);
    Lg.playoffElim.push({ tid: lose, round: ri });
    P.results.push({ round, w: win, l: lose, ws: Math.max(g.hs, g.as), ls: Math.min(g.hs, g.as), gid: g.gid });
    if (round === 'SB') {
      Lg.playoffElim.push({ tid: win, round: 5 });
      const mvp = sbMvp(g.box, win);
      Lg.champions.push({ s: P.s, tid: win, abbr: Lg.teams[win].abbr, ru: lose, score: `${Math.max(g.hs, g.as)}-${Math.min(g.hs, g.as)}`, mvp: mvp?.pid });
      const t = Lg.teams[win];
      news(`🏆 The ${t.region} ${t.name} win Super Bowl ${superBowlNumeral(P.s)}, beating the ${Lg.teams[lose].name} ${Math.max(g.hs, g.as)}-${Math.min(g.hs, g.as)}!${mvp ? ` ${mvp.fn} ${mvp.ln} named MVP.` : ''}`, { type: 'champ', tids: [win, lose], big: true });
      for (const p of Object.values(Lg.players)) if (p.tid === win) (p.awards ||= []).push({ s: P.s, type: 'SB' });
    }
  }
  weeklyInjuryUpdate();
  for (const t of Lg.teams) aiWeekly(t.tid);
  if (round === 'SB') { enterSeasonEnd(); return { ok: true, phase: 'SEASON_END' }; }
  const next = { WC: 'DIV', DIV: 'CONF', CONF: 'SB' }[round];
  P.round = next;
  Lg.meta.week = { DIV: 20, CONF: 21, SB: 23 }[next];
  makeRoundGames(next);
  return { ok: true };
}
export function superBowlNumeral(s) {
  const n = s - 1965; // 2026 season -> Super Bowl LXI
  const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let x = n, out = '';
  for (const [v, r] of map) while (x >= v) { out += r; x -= v; }
  return out;
}

// ---------- offseason calendar
function enterSeasonEnd() {
  const Lg = G.L;
  const m = Lg.meta;
  m.phase = 'SEASON_END';
  const st = Lg.standingsCache || computeStandings();
  closeSeasonFinances();
  // owner evaluation of user GMs
  for (const ut of m.userTids) {
    const t = Lg.teams[ut];
    const pw = (Lg.playoffs?.results || []).filter((r) => r.w === ut).length;
    const made = (Lg.playoffs?.seeds[t.conf] || []).includes(ut);
    const dev = Object.values(Lg.players).filter((p) => p.tid === ut && age(p) <= 25 && p.r.ovr - (p.r.hist?.find((h) => h.s === m.season)?.o ?? p.r.ovr) >= 4).length;
    const r = evaluateOwner(t, st[ut], pw, made, dev);
    if (r.fired) (m.firedNotices ||= []).push({ tid: ut, s: m.season });
  }
  aiCoachingCarousel(st);
  computeDraftOrder(m.season + 1, st, Lg.playoffElim);
  Lg.history.seasons[m.season] = {
    champ: Lg.champions.find((c) => c.s === m.season)?.tid ?? null,
    standings: Lg.teams.map((t) => ({ tid: t.tid, w: st[t.tid].w, l: st[t.tid].l, t: st[t.tid].t, pf: st[t.tid].pf, pa: st[t.tid].pa })),
    playoffs: Lg.playoffs?.results || [], seeds: Lg.playoffs?.seeds,
  };
  offseasonProgression();
  processRetirements();
  hallOfFame();
  // trim memory: drop box scores older than this season (keep playoff scoring summaries)
  for (const g of Lg.games) if (g.box && g.s <= m.season && g.type === 'REG') g.box = { scoring: g.box.scoring, tm: g.box.tm };
  for (const p of Object.values(Lg.players)) roundPlayer(p);
  Lg.games = Lg.games.filter((g) => g.s >= m.season - 1 || g.type !== 'PRE');
  news(`The ${m.season} season is in the books. Player progression and retirements have been processed.`, { type: 'system' });
}

function enterResign() {
  const Lg = G.L;
  Lg.meta.phase = 'RESIGN';
  for (const t of Lg.teams) if (!isUser(t.tid)) { aiResignPhase(t.tid); aiTenders(t.tid); }
  for (const ut of Lg.meta.userTids) { const n = Object.values(Lg.players).filter((p) => p.tid === ut && p.contract && p.contract.exp === Lg.meta.season && !p.contract.ps).length; news(`Re-signing window open: you have ${n} players with expiring contracts. Tags and fifth-year options are due before free agency.`, { type: 'system', tids: [ut], user: true }); }
}

function enterFreeAgency() {
  const Lg = G.L;
  const m = Lg.meta;
  const old = m.season;
  // rollover unused cap
  for (const t of Lg.teams) { const c = teamCap(t.tid, old); t.rollover[old + 1] = Math.max(0, Math.min(c.space, 45e6)); }
  m.season = old + 1;
  capFor(m.season);
  m.phase = 'FREE_AGENCY'; m.week = 0;
  // accrued seasons & tenure
  for (const p of Object.values(Lg.players)) {
    if (p.tid >= 0 || (p.tid === -1 && (p.stats?.[old]?.REG?.g || 0) >= 3)) {
      if ((p.stats?.[old]?.REG?.g || 0) >= 3 || p.status === 'ACT' || p.status === 'IR') p.exp = (p.exp || 0) + 1;
    }
    if (p.tid >= 0) p.yrsWithTeam = (p.yrsWithTeam || 0) + 1;
    p.faWeeks = 0;
  }
  // contracts expire
  let n = 0;
  for (const p of Object.values(Lg.players)) {
    if (p.tid >= 0 && p.contract && p.contract.exp < m.season) {
      const t = Lg.teams[p.tid];
      for (const k in t.depth) t.depth[k] = t.depth[k].filter((x) => x !== p.pid);
      p.lastTeam = p.tid; p.tid = -1; p.status = 'FA'; p.contract = null; p.holdout = false; n++;
    }
  }
  for (const p of Object.values(Lg.players)) if (p.status === 'IR' && p.tid >= 0) { p.status = 'ACT'; if (p.inj && !p.inj.se) p.inj = null; }
  for (const p of Object.values(Lg.players)) if (p.inj?.se) { p.inj.wk = Math.max(0, p.inj.wk - 30); p.inj.se = false; if (p.inj.wk <= 0) p.inj = null; }
  for (const t of Lg.teams) { t.tagUsed = null; t.depthLocked = false; aiCapCompliance(t.tid); }
  addSeasonPicks(m.season + 3);
  pruneLeague();
  // schedule for the new season (division placings from last season)
  const prev = {};
  for (const t of Lg.teams) prev[t.tid] = t.divPlace ?? 0;
  Lg.games = Lg.games.filter((g) => !(g.s === m.season));
  Lg.games.push(...generateSchedule(m.season, prev));
  Lg.tagCache = {};
  startFreeAgency();
  news(`The ${m.season} league year has begun. ${n} players hit free agency.`, { type: 'system', big: true });
}

function compPicks() {
  const Lg = G.L;
  const s = Lg.meta.season;
  const log = Lg.fa?.log || [];
  const lost = {}, gained = {};
  for (const x of log) {
    const p = Lg.players[x.pid];
    if (!p || p.lastTeam == null || p.lastTeam === x.tid) continue;
    if (x.apy < capFor(s) * 0.012) continue;
    (lost[p.lastTeam] ||= []).push(x.apy); (gained[x.tid] ||= []).push(x.apy);
  }
  const awards = [];
  for (const t of Lg.teams) {
    const L1 = (lost[t.tid] || []).sort((a, b) => b - a), G1 = (gained[t.tid] || []).sort((a, b) => b - a);
    const net = L1.slice(G1.length);
    for (const apy of net.slice(0, 4)) {
      const pct = apy / capFor(s);
      const rd = pct >= 0.07 ? 3 : pct >= 0.04 ? 4 : pct >= 0.025 ? 5 : pct >= 0.016 ? 6 : 7;
      awards.push({ tid: t.tid, rd, pct });
    }
  }
  awards.sort((a, b) => b.pct - a.pct);
  for (const a of awards.slice(0, 32)) Lg.picks.push({ id: nextId('dp'), s, rd: a.rd, orig: a.tid, tid: a.tid, comp: true });
  if (awards.length) news(`${Math.min(32, awards.length)} compensatory picks awarded for the ${s} draft.`, { type: 'draft' });
  // recompute draft order including comp picks
  const st = Lg.standingsCache;
  if (st) computeDraftOrder(s, st, Lg.playoffElim || []);
}

function enterLeagueMeeting() {
  const Lg = G.L;
  compPicks();
  for (const t of Lg.teams) if (!isUser(t.tid)) { aiFillRoster(t.tid, 70); }
  Lg.meta.phase = 'LEAGUE_MEETING';
  startLeagueMeeting();
}

function enterDraft() {
  const Lg = G.L;
  tallyVotes();
  Lg.meta.phase = 'DRAFT';
  startDraft();
  // draft season equals the new league year
  Lg.draft.s = Lg.meta.season;
  for (const ut of Lg.meta.userTids) Lg.teams[ut].scoutPts = (Lg.teams[ut].scoutPts || 0) + 150;
}

function enterPostDraft() {
  const Lg = G.L;
  if (Lg.draft && !Lg.draft.done) { simDraftToUser(true); finishDraft(); }
  Lg.meta.phase = 'POST_DRAFT';
  for (const t of Lg.teams) if (!isUser(t.tid)) aiOffseasonFill(t.tid, 86);
}

function enterTrainingCamp() {
  const Lg = G.L;
  const m = Lg.meta;
  m.phase = 'TRAINING_CAMP';
  for (const t of Lg.teams) { if (!isUser(t.tid)) { aiOffseasonFill(t.tid, 88); aiExtensions(t.tid); aiCapCompliance(t.tid); } autoDepth(t.tid); }
  checkUnrest(marketValue);
  for (let i = 0; i < 4; i++) aiTradeRound(0.5, 3);
  setExpectations();
  for (const ut of m.userTids) setOwnerGoals(Lg.teams[ut]);
  genDraftClass(m.season + 1);
  for (const ut of m.userTids) Lg.teams[ut].scoutPts = 60;
  news(`Training camps open around the league.`, { type: 'system' });
}

function enterPreseason() {
  const Lg = G.L;
  Lg.meta.phase = 'PRESEASON'; Lg.meta.week = 1;
  for (const p of Object.values(Lg.players)) if (p.r) p.r.ovrStart = p.r.ovr;
}

// Advance one step (week, playoff round, FA day, or phase)
export function advance(opts = {}) {
  const Lg = G.L;
  const ph = Lg.meta.phase;
  switch (ph) {
    case 'FANTASY_DRAFT': return { error: 'Finish the fantasy draft first.' };
    case 'PRESEASON': case 'REGULAR_SEASON': case 'PLAYOFFS': return simWeek();
    case 'SEASON_END': enterResign(); return { ok: true };
    case 'RESIGN': enterFreeAgency(); return { ok: true };
    case 'FREE_AGENCY':
      if (opts.day && Lg.fa.day < Lg.fa.maxDay) { faDay(); if (Lg.fa.day <= 10) aiTradeRound(0.22, 2); return { ok: true, day: Lg.fa.day }; }
      while (Lg.fa.day < 14) { faDay(); if (Lg.fa.day <= 10) aiTradeRound(0.22, 2); }
      enterLeagueMeeting(); return { ok: true };
    case 'LEAGUE_MEETING': enterDraft(); return { ok: true };
    case 'DRAFT':
      if (!Lg.draft.done) { const r = simDraftToUser(!!opts.all); if (!Lg.draft.done) return { ok: true, onClock: true, ...r }; }
      enterPostDraft(); return { ok: true };
    case 'POST_DRAFT': enterTrainingCamp(); return { ok: true };
    case 'TRAINING_CAMP': enterPreseason(); return { ok: true };
    default: return { error: `Unknown phase ${ph}` };
  }
}

// Sim helpers for the UI
export function simUntil(target) {
  const Lg = G.L;
  let guard = 0;
  const done = () => {
    const m = Lg.meta;
    if (target === 'week') return true;
    if (target === 'midseason') return m.phase !== 'REGULAR_SEASON' || m.week > 9;
    if (target === 'deadline') return m.phase !== 'REGULAR_SEASON' || m.week > Lg.rules.tradeDeadlineWeek;
    if (target === 'playoffs') return m.phase !== 'REGULAR_SEASON' && m.phase !== 'PRESEASON';
    if (target === 'seasonEnd') return m.phase === 'SEASON_END';
    if (target === 'draft') return m.phase === 'DRAFT';
    if (target === 'nextSeason') return m.phase === 'REGULAR_SEASON' && m.week === 1;
    if (target === 'phase') return true;
    return true;
  };
  let res = { ok: true };
  const startPhase = Lg.meta.phase;
  do {
    res = advance({ all: target === 'nextSeason' || target === 'seasonEnd' });
    if (res.error) return res;
    if (target === 'phase' && Lg.meta.phase !== startPhase) break;
    if (res.onClock && target !== 'nextSeason') break;
    if (Lg.meta.phase === 'FANTASY_DRAFT') break;
    if (guard++ > 120) break;
  } while (!done());
  return { ...res, phase: Lg.meta.phase, week: Lg.meta.week };
}
void gauss; void pick; void transaction; void freeAgents;

// Keep saves lean: unsigned veterans retire, forgettable players are removed, old logs trimmed
export function pruneLeague() {
  const Lg = G.L;
  const s = Lg.meta.season;
  const referenced = new Set();
  for (const y in Lg.awards) for (const k in Lg.awards[y]) { const v = Lg.awards[y][k]; (Array.isArray(v) ? v : [v]).forEach((x) => x?.pid && referenced.add(x.pid)); }
  for (const c of Lg.champions) if (c.mvp) referenced.add(c.mvp);
  for (const k in Lg.records || {}) referenced.add(Lg.records[k].pid);
  for (const p of Object.values(Lg.players)) {
    p.log = (p.log || []).filter((x) => x.s >= s - 1);
    if (p.injHist?.length > 12) p.injHist = p.injHist.slice(-12);
    if (p.tid === -1) {
      const a = age(p, s);
      const unsigned = (p.releasedSeason ?? p.retiredCheck ?? s) <= s - 1 || (p.udfa && p.udfa <= s - 1);
      if (a >= 31 && unsigned && p.r.ovr < 75) { p.retired = { s: s - 1, tid: p.lastTeam ?? null }; p.tid = -3; p.status = 'RET'; continue; }
      if ((p.r.ovr < 50 && a >= 25) || (p.udfa && p.udfa <= s - 2 && p.r.ovr < 58)) { if (!referenced.has(p.pid) && !(p.awards || []).length) delete Lg.players[p.pid]; continue; }
      p.retiredCheck ??= s;
    }
    if (p.tid === -3) {
      const notable = referenced.has(p.pid) || (p.awards || []).some((a) => ['AP1', 'MVP', 'DPOY', 'OPOY', 'PB', 'SBMVP'].includes(a.type)) || (p.hofScore || 0) >= 15 || p.realPB > 0;
      if (!notable && p.retired && p.retired.s <= s - 2) { delete Lg.players[p.pid]; continue; }
      if (p.r) { p.r.hist = (p.r.hist || []).slice(-6); }
      p.log = [];
    }
  }
  Lg.games = Lg.games.filter((g) => g.s >= s - 1);
  Lg.news = Lg.news.filter((n) => n.s >= s - 2 || n.big);
  Lg.transactions = Lg.transactions.filter((n) => n.s >= s - 2);
  if (Lg.events) Lg.events = Lg.events.filter((e) => e.s >= s - 1);
}

export function roundPlayer(p) {
  if (p.r) { for (const k of ['tal', 'pot', 'potEst']) if (p.r[k] != null) p.r[k] = Math.round(p.r[k] * 10) / 10; }
  if (p.pers) for (const k in p.pers) p.pers[k] = Math.round(p.pers[k] * 100) / 100;
  if (p.scout) delete p.scout.aiErr;
}
