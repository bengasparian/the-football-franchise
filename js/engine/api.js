// Public API used by the UI (through the worker). Every method returns plain JSON.
// ctx.tid = the team the caller manages (local user or online guest).
import { REAL_HISTORY } from './history.js';
import { awardScores } from './awards.js';
import { CITIES, BRANDS, crest, relocateTeam, rebrandTeam } from './relocation.js';
import { faTick, faStatus } from './fa.js';
import { DEV, DEV_INFO, longevityLabel } from './dev.js';
import { G, age, capFor, clamp, setRngState, rngState, fmtMoney, isUser, news, transaction } from './core.js';
import { POSITIONS, POS_NAMES, PHASE_LABEL, ROUND_LABEL, DEFAULT_SLIDERS, SLIDER_INFO, DEPTH_SLOTS } from './const.js';
import { createLeague } from './league.js';
import { ATTR_NAMES, ATTRS, OVR_W, potLabel, teamOvr, computeOvr, setOvr } from './ratings.js';
import { personalityLabels } from './personality.js';
import { marketValue, playerAsk, negotiate, signContract, teamCap, capSeason, futureCommitments, deadMoneyIfCut, releasePlayer, restructurePreview,
  restructure, applyTag, tagValues, exerciseOption, fifthYearOptionValue, capHit, psDeal, minDeal, idealYears, negotiationOptions, makeContract } from './contracts.js';
import { autoDepth, setDepth, rosterCounts } from './roster.js';
import { OFF_SCHEMES, DEF_SCHEMES, ROLES, teamScheme, teamFit, playerFit, fitLabel, resolveRoles, roleScore } from './schemes.js';
import { placeOnIR, activateFromIR } from './injuries.js';
import { computeStandings, playoffSeeds, divisionOrder, clinchMarkers } from './standings.js';
import { simUntil, advance, superBowlNumeral, userBlocker } from './season.js';
import { freeAgents, userOffer, offerScore } from './fa.js';
import { evaluateTrade, executeTrade, tradeFinder, makeItWork, pickLabel, playerTradeValue, pickTradeValue, projectedPickNo, teamMode } from './trade.js';
import { prospects, scoutProspect, scoutedView, draftCurrentPick, simDraftToUser, userOnClock, SCOUT_COST, draftClock, draftTick, simDraftPicks, simDraftRound, autoScout, upgradeCombines } from './draft.js';
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

// A GM may only manage the team they are currently controlling (host status does NOT grant access to other teams)
function own(ctx, tid) {
  return tid != null && tid >= 0 && ctx?.tid === tid && L().meta.userTids.includes(tid);
}
function requireOwn(ctx, tid) { if (!own(ctx, tid)) throw new Error('You can only manage your own team.'); }

// Expected time missed and return date for an injured player.
export function injOutlook(p) {
  const Lg = L();
  const m = Lg.meta, inj = p.inj;
  if (!inj) return {};
  const inSeason = m.phase === 'REGULAR_SEASON' || m.phase === 'PRESEASON' || m.phase === 'PLAYOFFS';
  let wk = inj.se ? 99 : inj.wk;
  if (p.status === 'IR' && !inj.se) wk = Math.max(wk, (Lg.rules.irMinGames || 4) - (m.week - (p.irWeek ?? m.week)));
  if (inj.se || wk >= 30) {
    return { out: 'Out for the season', ret: inSeason ? `Expected back next season` : 'Expected back by training camp', short: 'Season' };
  }
  if (wk <= 0) return { out: 'Questionable', ret: 'Could play this week', short: 'Q' };
  if (!inSeason) return { out: `Out ${wk} week${wk > 1 ? 's' : ''}`, ret: 'Expected back by training camp', short: `${wk}w` };
  const weeks = Lg.rules.weeks || 18;
  let ret;
  if (m.phase === 'REGULAR_SEASON') { const back = m.week + wk; ret = back <= weeks ? `Expected back Week ${back}` : back <= weeks + 4 ? 'Expected back for the playoffs' : 'Expected back next season'; }
  else if (m.phase === 'PRESEASON') ret = wk <= 3 - (m.week - 1) ? 'Expected back for Week 1' : `Expected back Week ${Math.max(1, wk - (3 - m.week))}`;
  else ret = wk <= 4 ? `Could return in ${wk} round${wk > 1 ? 's' : ''}` : 'Expected back next season';
  return { out: `Out ${wk} week${wk > 1 ? 's' : ''}`, ret, short: `${wk}w` };
}
export function pRow(p, extra = {}) {
  const Lg = L();
  const s = Lg.meta.season;
  const st = p.stats?.[s]?.REG;
  const c = p.contract;
  return {
    pid: p.pid, name: `${p.fn} ${p.ln}`, fn: p.fn, ln: p.ln, pos: p.pos, tid: p.tid, team: p.tid >= 0 ? T(p.tid).abbr : null, status: p.status,
    age: age(p), ovr: p.r.ovr, pot: potLabel(p), exp: p.exp, jn: p.jn, hs: p.hs, ht: p.ht, wt: p.wt, college: p.college,
    inj: p.inj && (p.inj.wk > 0 || p.inj.se) ? { type: p.inj.type, wk: p.inj.wk, se: p.inj.se, ...injOutlook(p) } : null,
    morale: p.morale, holdout: !!p.holdout, tradeReq: !!p.tradeReq, onBlock: !!p.onBlock,
    contract: c ? { apy: c.apy, exp: c.exp, yrsLeft: c.ps ? 0 : c.exp - capSeason() + 1, hit: c.ps ? c.ps : capHit(p, capSeason()), gtd: c.gtd, rookie: !!c.rookie, tag: c.tag || null, ps: !!c.ps, option5: c.option5 || null } : null,
    g: st?.g || 0, line: st ? statSummary(p, st) : '', ovrDelta: p.r.ovr - (p.r.ovrStart ?? p.r.ovr), draft: p.draft || null,
    tc: p.tid >= 0 ? T(p.tid).c1 : '#334155', dev: p.dev || 'Normal', lon: p.lon ?? null, gen: !!p.gen,
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
    bye: m.phase === 'REGULAR_SEASON' && !Lg.games.some((g) => g.s === m.season && g.type === 'REG' && g.w === m.week && (g.h === tid || g.a === tid)),
    roundLabel: m.phase === 'PLAYOFFS' ? (ROUND_LABEL[Lg.playoffs?.round] || 'Playoffs') : null,
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
    expiring: m.phase === 'RESIGN' ? ps.filter((p) => p.contract && !p.contract.ps && p.contract.exp === m.season).sort((a, b) => b.r.ovr - a.r.ovr).map((p) => pRow(p, { ask: playerAsk(p, tid).apy, mv: marketValue(p) })) : [],
    tagUsed: t.tagUsed === m.season + 1,
    bye: m.phase === 'REGULAR_SEASON' && !Lg.games.some((g) => g.s === m.season && g.type === 'REG' && g.w === m.week && (g.h === tid || g.a === tid)) ? m.week : null,
    byeWeek: byeWeek(tid, m.season),
    todo: todoList(tid, ctx),
    recapWeek: lastPlayedWeek(),
  };
}
// What the GM should take care of right now, by phase.
function todoList(tid, ctx) {
  const Lg = L();
  const m = Lg.meta;
  const t = T(tid);
  const ps = Object.values(Lg.players).filter((p) => p.tid === tid);
  const cnt = rosterCounts(tid);
  const cap = teamCap(tid);
  const out = [];
  const add = (txt, href, urgent = false, done = false) => out.push({ txt, href, urgent, done });
  const offers = Lg.offers.filter((o) => o.toTid === tid && o.status === 'open').length;
  const evs = Lg.events.filter((e) => e.tid === tid && e.open).length;
  if (evs) add(`Respond to ${evs} front-office decision${evs > 1 ? 's' : ''}`, '#/home', true);
  if (offers) add(`Review ${offers} trade offer${offers > 1 ? 's' : ''}`, '#/offers');
  if (cap.space < 0) add(`Get under the salary cap (${Math.round(cap.space / 1e5) / 10}M)`, '#/cap', true);
  const injStarters = ps.filter((p) => p.inj && p.inj.wk > 0 && Object.values(t.depth).some((d) => d.slice(0, 2).includes(p.pid)));
  switch (m.phase) {
    case 'PRESEASON':
      add('Set your depth chart for the opener', '#/depth');
      if (cnt.ACT > Lg.rules.activeMax) add(`Cut down to ${Lg.rules.activeMax} (you have ${cnt.ACT})`, '#/roster', m.week >= (Lg.rules.preseasonGames || 3));
      add('Watch camp battles in preseason games', '#/schedule');
      break;
    case 'REGULAR_SEASON':
      if (injStarters.length) add(`Replace injured starters: ${injStarters.slice(0, 3).map((p) => p.ln).join(', ')}`, '#/lineup', true);
      if (cnt.ACT < Lg.rules.activeMax) add(`Fill open roster spots (${cnt.ACT}/${Lg.rules.activeMax})`, '#/fa');
      if (m.week <= Lg.rules.tradeDeadlineWeek) add(`Trade deadline after Week ${Lg.rules.tradeDeadlineWeek}${m.week >= Lg.rules.tradeDeadlineWeek - 1 ? ': last chance!' : ''}`, '#/trade', m.week >= Lg.rules.tradeDeadlineWeek - 1);
      { const ext = ps.filter((p) => p.contract && !p.contract.ps && p.contract.exp === m.season && p.r.ovr >= 75).length; if (ext) add(`${ext} key player${ext > 1 ? 's' : ''} in a contract year. Extend now or wait.`, '#/cap'); }
      add('Scout next year\'s draft class', '#/draft');
      break;
    case 'PLAYOFFS': add('Set your lineup for the playoffs', '#/depth'); break;
    case 'SEASON_END': add('Review the season and awards', '#/awards'); add('Check next year\'s cap', '#/cap'); break;
    case 'RESIGN': {
      const exp = ps.filter((p) => p.contract && !p.contract.ps && p.contract.exp === m.season).length;
      add(`Re-sign, tag or let go ${exp} expiring player${exp === 1 ? '' : 's'}`, '#/home', exp > 0);
      add('Consider your franchise tag', '#/cap');
      break; }
    case 'FREE_AGENCY': add(`Free agency day ${Lg.fa?.day}/${Lg.fa?.maxDay}: make offers`, '#/fa', true); break;
    case 'LEAGUE_MEETING': add('Vote on rule proposals', '#/rules', true); break;
    case 'DRAFT': add('Go to the draft room', '#/draft', true); break;
    case 'POST_DRAFT': add('Sign undrafted free agents', '#/fa'); add('Sign your draft picks', '#/roster'); break;
    case 'TRAINING_CAMP': add('Set your depth chart', '#/depth'); add('Extend players before the season', '#/cap'); break;
    case 'FANTASY_DRAFT': add('Make your fantasy draft picks', '#/fantasy', true); break;
  }
  return out;
}
function lastPlayedWeek() {
  const Lg = L();
  const gs = Lg.games.filter((g) => g.s === Lg.meta.season && g.played && g.type !== 'PRE');
  if (!gs.length) return null;
  const last = gs.reduce((a, g) => (g.type === 'REG' ? Math.max(a, g.w) : a), 0);
  return last || null;
}
// Recap of a week or playoff round: every game, who won, upsets and the standout performances. Your game is first.
const PO_ROUNDS = ['WC', 'DIV', 'CONF', 'SB'];
export function recap({ week = null, type = null, key = null } = {}, ctx = {}) {
  const Lg = L();
  const s = Lg.meta.season;
  const played = Lg.games.filter((g) => g.s === s && g.played && g.type !== 'PRE');
  const regWeeks = [...new Set(played.filter((g) => g.type === 'REG').map((g) => g.w))].sort((a, b) => a - b);
  const poDone = PO_ROUNDS.filter((r) => played.some((g) => g.type === r));
  const options = [...regWeeks.map((w) => ({ k: `W${w}`, l: `Week ${w}` })), ...poDone.map((r) => ({ k: r, l: ROUND_LABEL[r] }))];
  if (!key) key = type && type !== 'REG' ? type : week != null ? `W${week}` : (options.at(-1)?.k || null);
  if (!key) return { week: null, key: null, games: [], options, weeks: regWeeks, byes: [], season: s, bracket: playoffBracket(), label: null };
  const isPO = PO_ROUNDS.includes(key);
  const w = isPO ? null : +key.slice(1);
  const gs = played.filter((g) => (isPO ? g.type === key : g.type === 'REG' && g.w === w));
  const me = ctx.tid;
  const games = gs.map((g) => {
    const win = g.hs > g.as ? g.h : g.as > g.hs ? g.a : null;
    const exp = (tid) => T(tid).expectWins ?? 8.5;
    const upset = win != null && exp(win) + 2 <= exp(win === g.h ? g.a : g.h);
    const stars = [];
    for (const pid in g.box?.pl || {}) {
      const p = Lg.players[pid]; if (!p || ['OT', 'OG', 'C', 'LS', 'FB'].includes(p.pos)) continue;
      const bx = g.box.pl[pid];
      const v = av(p, bx);
      if (v > 9) stars.push({ pid, name: `${p.fn[0]}. ${p.ln}`, pos: p.pos, v, line: statSummary(p, bx) });
    }
    stars.sort((x, y) => y.v - x.v);
    return { ...gameLite(g), upset, stars: stars.slice(0, 3), mine: g.h === me || g.a === me };
  }).sort((x, y) => y.mine - x.mine);
  const byes = !isPO && w ? Lg.teams.filter((t) => !Lg.games.some((g) => g.s === s && g.type === 'REG' && g.w === w && (g.h === t.tid || g.a === t.tid))).map((t) => t.abbr) : [];
  return { week: w, key, label: isPO ? ROUND_LABEL[key] : `Week ${w}`, playoff: isPO, games, options, weeks: regWeeks, byes, season: s, bracket: playoffBracket() };
}
// The playoff bracket for this season: seeds, every round's matchups (played or upcoming) and the champion.
export function playoffBracket() {
  const Lg = L();
  const P = Lg.playoffs;
  if (!P || P.s !== Lg.meta.season) return null;
  const st = Lg.standingsCache || computeStandings();
  const seedOf = (tid) => { for (const c of ['AFC', 'NFC']) { const i = P.seeds[c].indexOf(tid); if (i >= 0) return i + 1; } return null; };
  const tm = (tid) => ({ tid, abbr: T(tid).abbr, logo: T(tid).logo, name: T(tid).name, seed: seedOf(tid), rec: st[tid] ? `${st[tid].w}-${st[tid].l}${st[tid].t ? '-' + st[tid].t : ''}` : '' });
  const rounds = PO_ROUNDS.map((r) => ({ k: r, label: ROUND_LABEL[r], games: Lg.games.filter((g) => g.s === P.s && g.type === r).map((g) => ({ gid: g.gid, conf: g.conf || null, played: !!g.played, h: tm(g.h), a: tm(g.a), hs: g.hs, as: g.as, ot: g.ot, win: g.played ? (g.hs > g.as ? g.h : g.a) : null })) }));
  const champ = Lg.champions.find((c) => c.s === P.s);
  return { round: Lg.meta.phase === 'PLAYOFFS' ? P.round : null, seeds: { AFC: P.seeds.AFC.map(tm), NFC: P.seeds.NFC.map(tm) }, rounds, champ: champ ? tm(champ.tid) : null,
    alive: [...P.alive.AFC, ...P.alive.NFC] };
}
// Live award race (top candidates right now).
export function awardRace() {
  const Lg = L();
  const s = Lg.meta.season;
  const st = Lg.standingsCache || computeStandings();
  const { res } = awardScores(s, st);
  const out = {};
  for (const k of ['MVP', 'OPOY', 'DPOY', 'OROY', 'DROY', 'CPOY']) {
    const top = res[k].slice(0, 8);
    const best = top[0]?.sc || 1;
    out[k] = top.map((x) => ({ ...pRow(x.p), sc: Math.round(x.sc), share: Math.round((x.sc / best) * 100), teamAbbr: T(x.team).abbr, teamRec: st[x.team] ? `${st[x.team].w}-${st[x.team].l}${st[x.team].t ? '-' + st[x.team].t : ''}` : '' }));
  }
  return { season: s, week: Lg.meta.week, phase: Lg.meta.phase, race: out, final: Lg.awards[s] ? true : false };
}
// The full history of the NFL: real champions and awards plus everything that has happened in this league.
export function nflHistory() {
  const Lg = L();
  const byAbbr = Object.fromEntries(Lg.teams.map((t) => [t.history?.[0]?.abbr || t.abbr, t]));
  const tl = (ab) => { const t = byAbbr[ab] || Lg.teams.find((x) => x.abbr === ab); return t ? { abbr: t.abbr, logo: t.logo, tid: t.tid } : { abbr: ab }; };
  const real = REAL_HISTORY.sb.map((x) => ({ ...x, real: true, wTeam: tl(x.wa), lTeam: tl(x.la) }));
  const sims = Lg.champions.filter((c) => c.s > 2025).map((c) => ({ n: superBowlNumeral(c.s), s: c.s, w: `${T(c.tid).region} ${T(c.tid).name}`, wTeam: teamLite(T(c.tid)), l: c.ru != null ? `${T(c.ru).region} ${T(c.ru).name}` : '', lTeam: c.ru != null ? teamLite(T(c.ru)) : null, sc: c.score || '', mvp: c.mvp && Lg.players[c.mvp] ? `${Lg.players[c.mvp].fn} ${Lg.players[c.mvp].ln}` : '', real: false }));
  const awards = {};
  for (const k of ['MVP', 'OPOY', 'DPOY', 'OROY', 'DROY']) {
    awards[k] = Object.entries(REAL_HISTORY[k]).map(([y, [n, ab]]) => ({ s: +y, name: n, team: tl(ab), real: true }));
    for (const [y, a] of Object.entries(Lg.awards)) if (+y > 2025 && a[k]?.[0]) { const x = a[k][0]; const p = Lg.players[x.pid]; awards[k].push({ s: +y, name: p ? `${p.fn} ${p.ln}` : '?', pid: x.pid, team: teamLite(T(x.tid)), real: false }); }
    awards[k].sort((a, b) => b.s - a.s);
  }
  const titles = {};
  for (const x of [...real, ...sims]) { const ab = x.wTeam?.abbr; if (ab) titles[ab] = (titles[ab] || 0) + 1; }
  return { sb: [...sims.reverse(), ...real.reverse()], awards, titles: Object.entries(titles).map(([abbr, n]) => ({ ...tl(abbr), abbr, n })).sort((a, b) => b.n - a.n) };
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
  // vets can extend any time (in season too); rookies become eligible after their third season
  const canExtend = mine && c && !c.ps && yrsLeft <= 3 && !c.tag && !(c.rookie && (p.exp ?? 0) < 3) && c.signed !== Lg.meta.season;
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
    dev: p.status === 'PROSPECT' && (scouted?.lvl ?? 0) < 3 ? null : (p.dev || 'Normal'), devInfo: DEV_INFO[p.dev || 'Normal'],
    lon: p.status === 'PROSPECT' && (scouted?.lvl ?? 0) < 2 ? null : p.lon, lonLabel: p.lon != null ? longevityLabel(p.lon) : null,
    col: p.col || null, colYrs: p.colYrs || null, gen: p.status === 'PROSPECT' ? !!p.gen && (scouted?.lvl ?? 0) >= 1 : !!p.gen,
    schemeFit: schemeFitFor(p, ctx),
  };
}

// how a player fits his team's scheme (or, for anyone else, your team's scheme)
function schemeFitFor(p, ctx) {
  const tt = p.tid >= 0 ? T(p.tid) : ctx.tid != null ? T(ctx.tid) : null;
  if (!tt || p.status === 'PROSPECT' && ctx.tid == null) return null;
  const sch = teamScheme(p.tid >= 0 ? T(p.tid) : T(ctx.tid));
  const off = ['QB', 'RB', 'FB', 'WR', 'TE', 'OT', 'OG', 'C'].includes(p.pos);
  const name = off ? sch.off : sch.def;
  const f = playerFit(p, off ? 'off' : 'def', name);
  if (f == null) return null;
  return { scheme: name, team: tt.abbr, fit: f, label: fitLabel(f) };
}

// ------------------------------------------------------------------ depth chart
export function depth({ tid }, ctx) {
  const Lg = L();
  tid = tid ?? ctx.tid;
  const t = T(tid);
  const out = {};
  for (const pos of [...POSITIONS, 'KR', 'PR']) out[pos] = (t.depth[pos] || []).map((pid) => pRow(Lg.players[pid])).filter((x) => x.tid === tid);
  const pool = Object.values(Lg.players).filter((p) => p.tid === tid && p.status === 'ACT').map((p) => pRow(p));
  return { team: teamLite(t), depth: out, pool, slots: DEPTH_SLOTS, mine: own(ctx, tid), locked: !!t.depthLocked, injAuto: t.injAuto !== false };
}
export function setInjAuto({ tid, on }, ctx) { requireOwn(ctx, tid); T(tid).injAuto = !!on; return { ok: true }; }
export function setDepthChart({ tid, pos, pids }, ctx) { requireOwn(ctx, tid); return setDepth(tid, pos, pids); }
export function autoDepthChart({ tid }, ctx) { requireOwn(ctx, tid); autoDepth(tid); T(tid).depthLocked = false; T(tid).roles = {}; return { ok: true }; }

// ------------------------------------------------------------------ schemes & situational roles (Adjust Lineup)
export function lineupInfo({ tid }, ctx) {
  const Lg = L();
  tid = tid ?? ctx.tid;
  const t = T(tid);
  const sch = teamScheme(t);
  const fitRows = (side, name) => teamFit(t, side, name).rows.map((r) => ({ ...pRow(Lg.players[r.pid]), slot: r.pos, fit: r.fit, fitL: fitLabel(r.fit) }));
  const list = (S, side, coach) => Object.entries(S).map(([name, x]) => ({ name, short: x.short, desc: x.desc, front: x.front || null, fit: teamFit(t, side, name).pct, coach: name === coach,
    wants: Object.entries(x.wants).map(([g, w]) => ({ g, attrs: Object.entries(w).sort((a, b) => b[1] - a[1]).map(([k]) => k) })) }));
  const R = resolveRoles(t);
  const set = t.roles || {};
  const ok = (p) => p && p.tid === tid && p.status === 'ACT';
  const roles = Object.entries(ROLES).map(([k, r]) => {
    const cands = Object.values(Lg.players).filter((p) => ok(p) && r.pos.includes(p.pos)).map((p) => ({ ...pRow(p), score: roleScore(p, k) }))
      .sort((a, b) => b.score - a.score).slice(0, 14);
    const cur = R[k] ? { ...pRow(R[k]), score: roleScore(R[k], k) } : null;
    return { key: k, label: r.label, side: r.side, where: r.where, desc: r.desc, cur, auto: !(set[k] && ok(Lg.players[set[k]]) && cur && cur.pid === set[k]), cands };
  });
  return {
    team: teamLite(t), mine: own(ctx, tid),
    scheme: { ...sch, fitOff: teamFit(t, 'off', sch.off).pct, fitDef: teamFit(t, 'def', sch.def).pct, offRows: fitRows('off', sch.off), defRows: fitRows('def', sch.def),
      oc: Lg.coaches[t.staff?.oc]?.name || null, dc: Lg.coaches[t.staff?.dc]?.name || null },
    off: list(OFF_SCHEMES, 'off', sch.ocScheme), def: list(DEF_SCHEMES, 'def', sch.dcScheme), roles,
  };
}
export function setScheme({ tid, side, name }, ctx) {
  requireOwn(ctx, tid);
  const t = T(tid);
  if (name && !(side === 'off' ? OFF_SCHEMES : DEF_SCHEMES)[name]) throw new Error('Unknown scheme');
  t.scheme ||= {};
  if (name) t.scheme[side] = name; else delete t.scheme[side];
  return { ok: true, scheme: teamScheme(t) };
}
export function setRole({ tid, role, pid }, ctx) {
  requireOwn(ctx, tid);
  const t = T(tid);
  if (!ROLES[role]) throw new Error('Unknown role');
  t.roles ||= {};
  if (!pid) { delete t.roles[role]; return { ok: true }; }
  const p = L().players[pid];
  if (!p || p.tid !== tid) throw new Error('That player is not on your team.');
  if (!ROLES[role].pos.includes(p.pos)) throw new Error(`${ROLES[role].label} has to be a ${ROLES[role].pos.join('/')}.`);
  // one player can't be your Mike and your Will at the same time
  for (const k of ['MIKE', 'WILL', 'SAM']) if (['MIKE', 'WILL', 'SAM'].includes(role) && k !== role && t.roles[k] === pid) delete t.roles[k];
  for (const k of ['NICKEL', 'DIME']) if (['NICKEL', 'DIME'].includes(role) && k !== role && t.roles[k] === pid) delete t.roles[k];
  t.roles[role] = pid;
  return { ok: true };
}

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
export function schedule({ tid = null, season = null, week = null, pre = true, type = null } = {}) {
  const Lg = L();
  const s = season ?? Lg.meta.season;
  let gs = Lg.games.filter((g) => g.s === s && (g.type !== 'PRE' || pre));
  if (tid != null) gs = gs.filter((g) => g.h === tid || g.a === tid);
  if (week != null) gs = gs.filter((g) => g.w === week && (type ? g.type === type : g.type === 'REG'));
  const order = { PRE: 0, REG: 1, WC: 2, DIV: 3, CONF: 4, SB: 5 };
  gs.sort((a, b) => (order[a.type] ?? 1) - (order[b.type] ?? 1) || a.w - b.w || (a.d || '').localeCompare(b.d || ''));
  const byes = week != null ? Lg.teams.filter((t) => !Lg.games.some((g) => g.s === s && g.type === 'REG' && g.w === week && (g.h === t.tid || g.a === t.tid))).map(teamLite) : null;
  const st = Lg.standingsCache || computeStandings();
  const rec = Object.fromEntries(Lg.teams.map((t) => [t.tid, st[t.tid] ? `${st[t.tid].w}-${st[t.tid].l}${st[t.tid].t ? '-' + st[t.tid].t : ''}` : '']));
  return { season: s, games: gs.map(gameLite), week: Lg.meta.week, phase: Lg.meta.phase, byeWeeks: tid != null ? byeWeek(tid, s) : null, byes, rec, weeks: Lg.rules.weeks || 18 };
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

export function negOptions({ pid, mode }, ctx) {
  const Lg = L();
  const p = Lg.players[pid];
  if (!Lg.meta.userTids.includes(ctx.tid)) throw new Error('No team');
  if (p.tid >= 0) requireOwn(ctx, p.tid);
  const o = negotiationOptions(pid, ctx.tid, { fa: p.tid === -1 });
  return { ...o, reasons: o.reasons.map(([l, d]) => ({ l, d })) };
}
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
  if (res.status === 'refused' && Lg.meta.phase === 'RESIGN' && mode === 'resign') (p.grudge ||= {})[tid] = { s: Lg.meta.season, why: 'Contract talks broke down' };
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
    day: Lg.fa?.day ?? null, maxDay: Lg.fa?.maxDay ?? null, status: Lg.fa ? faStatus() : null, phase: Lg.meta.phase, cap: teamCap(ctx.tid), signings: (Lg.fa?.log || []).slice(-40).reverse().map((x) => ({ ...x, name: `${Lg.players[x.pid]?.fn} ${Lg.players[x.pid]?.ln}`, abbr: T(x.tid).abbr })),
  };
}
export function withdrawOffer({ pid }, ctx) { const Lg = L(); if (Lg.fa?.offers?.[pid]) Lg.fa.offers[pid] = Lg.fa.offers[pid].filter((o) => o.tid !== ctx.tid); return { ok: true }; }
export function signMin({ pid }, ctx) {
  const Lg = L(); const p = Lg.players[pid];
  requireOwn(ctx, ctx.tid);
  if (p.tid !== -1) return { error: 'Not a free agent' };
  const ask = playerAsk(p, ctx.tid, { fa: true });
  const minOk = ask.apy <= minDeal(p, capSeason()).apy * 1.15 || p.udfa;
  if (!minOk && Lg.meta.phase !== 'REGULAR_SEASON') return { error: `${p.fn} ${p.ln} wants more than the minimum (${fmtMoney(ask.apy)}).` };
  return userOffer(ctx.tid, pid, { years: p.udfa ? 3 : 1, apy: minDeal(p, capSeason()).apy, gtd: 0 });
}
export function signToPS({ pid }, ctx) {
  const Lg = L(); const p = Lg.players[pid];
  requireOwn(ctx, ctx.tid);
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
  requireOwn(ctx, ctx.tid);
  if (aiTid === ctx.tid) return { error: 'You cannot trade with yourself.' };
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
  return res.map((r) => ({ tid: r.tid, team: teamLite(T(r.tid)), give: r.give, get: r.get, giveV: desc(r.give), getV: desc(r.get), meter: r.ev.meter, kind: r.kind || null, needsSpot: r.needsSpot || null }));
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
      return { pid: p.pid, name: `${p.fn} ${p.ln}`, pos: p.pos, age: age(p, (Lg.draft?.s || Lg.meta.season + 1)), college: p.college, ht: p.ht, wt: p.wt, rank: p.scout.rank, posRank: p.scout.posRank, combine: p.combine, lvl: v.lvl, lo: v.ovrLo, hi: v.ovrHi, pot: v.pot, proj: projRound(p.scout.rank), onBoard: myBoard.includes(p.pid), gen: !!p.gen && v.lvl >= 1, colYrs: p.colYrs || null };
    }),
    scoutPts: t.scoutPts || 0, points: t.scoutPts || 0, costs: SCOUT_COST, board: myBoard, autoScout: !!t.autoScout,
  };
}
function projRound(rank) { return rank <= 32 ? '1st' : rank <= 64 ? '2nd' : rank <= 100 ? '3rd' : rank <= 140 ? '4th' : rank <= 180 ? '5th' : rank <= 220 ? '6th' : rank <= 262 ? '7th' : 'UDFA'; }
export function scout({ pid }, ctx) { requireOwn(ctx, ctx.tid); return scoutProspect(ctx.tid, pid); }
export function setAutoScout({ on }, ctx) { requireOwn(ctx, ctx.tid); const t = T(ctx.tid); t.autoScout = !!on; const spent = on ? autoScout(ctx.tid) : 0; return { ok: true, spent }; }
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
  return { clock: draftClock(), s, active: Lg.meta.phase === 'DRAFT', done: !!d?.done, idx: d?.idx ?? 0, onClock: upcoming[0] || null, userOnClock: !!userOnClock() && userOnClock().tid === ctx.tid, log: log.slice(-300).reverse(), upcoming, myPicks, orderSet: !!orderIds.length };
}
export function draftPick({ pid }, ctx) {
  const up = userOnClock();
  if (!up || !own(ctx, up.tid)) return { error: "You're not on the clock." };
  return draftCurrentPick(pid);
}
export function draftLive(_, ctx) {
  if (G.L.meta.online && !ctx.host) return { clock: draftClock() };
  const r = draftTick();
  return { ...r, clock: draftClock() };
}
export function draftSimN({ n = 1, round = false }, ctx) {
  if (G.L.meta.online && !ctx.host) return { error: 'Only the host can sim the draft.' };
  return round ? simDraftRound() : simDraftPicks(n);
}
export function draftSim({ all = false }, ctx) { if (!ctx.host) { const up = userOnClock(); if (up && up.tid !== ctx.tid) return { error: 'Waiting on another GM.' }; } return simDraftToUser(all); }
export function draftAuto(_, ctx) { const up = userOnClock(); if (!up || !own(ctx, up.tid)) return { error: 'Not on the clock' }; return draftCurrentPick(null); }

// ------------------------------------------------------------------ fantasy draft
export function fantasyState({ pos = 'ALL', q = '' } = {}, ctx) {
  const Lg = L();
  const F = Lg.fantasy;
  let pool = fantasyPool();
  if (pos === 'OL') pool = pool.filter((p) => ['OT', 'OG', 'C'].includes(p.pos));
  else if (pos === 'ST') pool = pool.filter((p) => ['K', 'P', 'LS'].includes(p.pos));
  else if (pos !== 'ALL') pool = pool.filter((p) => p.pos === pos);
  const qq = String(q || '').trim().toLowerCase();
  if (qq) pool = pool.filter((p) => `${p.fn} ${p.ln}`.toLowerCase().includes(qq));
  pool.sort((a, b) => b.r.ovr - a.r.ovr);
  const mine = Object.values(Lg.players).filter((p) => p.tid === ctx.tid);
  // Madden-style board: one column per team (round-1 order), one row per round; snake order means even rounds run backwards
  const board = {};
  for (const x of F?.log || []) { const pl = Lg.players[x.pid]; (board[x.r] ||= {})[x.tid] = { pid: x.pid, name: `${pl.fn[0]}. ${pl.ln}`, pos: pl.pos, ovr: pl.r.ovr }; }
  return { board, teams: (F?.order || []).map((tid) => ({ tid, abbr: T(tid).abbr, logo: T(tid).logo })), me: ctx.tid,
    F: F ? { round: F.round, idx: F.idx, done: F.done, rounds: F.rounds } : null, onClock: fantasyOnClock(), mineOnClock: fantasyOnClock() === ctx.tid, pool: pool.slice(0, 300).map((p) => pRow(p)), mine: mine.map((p) => pRow(p)), log: (F?.log || []).slice(-60).reverse().map((x) => ({ ...x, name: `${Lg.players[x.pid].fn} ${Lg.players[x.pid].ln}`, pos: Lg.players[x.pid].pos, ovr: Lg.players[x.pid].r.ovr, abbr: T(x.tid).abbr })), order: F?.order.map((t) => T(t).abbr) };
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
  requireOwn(ctx, ctx.tid);
  return hireCoach(ctx.tid, cid, role);
}
export function fire({ role }, ctx) { requireOwn(ctx, ctx.tid); return fireCoach(ctx.tid, role); }
export function finances({ tid }, ctx) {
  const Lg = L();
  tid = tid ?? ctx.tid;
  const t = T(tid);
  return { team: teamLite(t), fin: t.fin, owner: t.owner, jobSec: t.jobSec, goals: t.goals, goalResults: t.goalResults, stadium: t.stadium, market: t.market, att: attendanceFor(t), rev: homeGameRevenue(t), mine: own(ctx, tid), season: Lg.meta.season, ref: Math.round(110 + Math.log1p(t.market) * 38) };
}
export function setPrices({ ticket, concessions, parking }, ctx) {
  requireOwn(ctx, ctx.tid);
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
export function vote({ id, yes }, ctx) { requireOwn(ctx, ctx.tid); return castVote(ctx.tid, id, yes); }
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
  const t = target || 'week';
  if (t === 'week') return simUntil(t);
  // Simming more than one week: your staff handles everything a team has to do (injury moves, IR, filling the
  // roster, the depth chart) so the sim never stops for chores. Week-by-week, your own settings apply.
  const au = G.L.settings.autoUser;
  const saved = { ...au };
  G.multiSim = true;
  Object.assign(au, { depth: true, injuries: true, roster: true });
  try { return simUntil(t); } finally { Object.assign(au, saved); G.multiSim = false; }
}
export function faLive(_, ctx) {
  // live tick: only the host's clock drives signings in an online league
  if (G.L.meta.online && !ctx.host) return { status: faStatus() };
  const r = faTick();
  return { status: r.status || faStatus(), signed: (r.signed || []).map((x) => ({ ...x, name: `${G.L.players[x.pid]?.fn} ${G.L.players[x.pid]?.ln}`, pos: G.L.players[x.pid]?.pos, ovr: G.L.players[x.pid]?.r.ovr, abbr: T(x.tid).abbr, logo: T(x.tid).logo })) };
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

// ------------------------------------------------------------------ franchise identity
export function franchiseOptions(_, ctx) {
  const Lg = L();
  const taken = new Set(Lg.teams.map((t) => t.region));
  const t = T(ctx.tid);
  return {
    team: teamLite(t), history: t.history || [], offseason: !['PRESEASON', 'REGULAR_SEASON', 'PLAYOFFS'].includes(Lg.meta.phase),
    cities: CITIES.map((c) => ({ city: c[0], region: c[1], market: c[2], state: c[3], noTax: c[4], taken: taken.has(c[1]) })),
    brands: BRANDS.map((b) => ({ name: b[0], c1: b[1], c2: b[2], shape: b[3], logo: crest(b[0].slice(0, 2), b[1], b[2], b[3]), taken: Lg.teams.some((x) => x.name === b[0]) })),
  };
}
export function relocate({ city, brand = null }, ctx) {
  requireOwn(ctx, ctx.tid);
  if (['PRESEASON', 'REGULAR_SEASON', 'PLAYOFFS'].includes(L().meta.phase)) return { error: 'Relocation can only happen in the offseason.' };
  const b = brand ? BRANDS.find((x) => x[0] === brand.name) : null;
  return relocateTeam(ctx.tid, city, b ? { name: b[0], c1: brand.c1 || b[1], c2: brand.c2 || b[2], shape: brand.shape || b[3] } : brand ? { name: String(brand.name).slice(0, 18), c1: brand.c1, c2: brand.c2, shape: brand.shape } : { keepBrand: true });
}
export function rebrand({ name, c1, c2, shape }, ctx) {
  requireOwn(ctx, ctx.tid);
  if (['PRESEASON', 'REGULAR_SEASON', 'PLAYOFFS'].includes(L().meta.phase)) return { error: 'Rebrands can only happen in the offseason.' };
  name = String(name || '').trim().slice(0, 18);
  if (!name) return { error: 'Pick a name.' };
  return rebrandTeam(ctx.tid, { name, c1, c2, shape });
}

// ------------------------------------------------------------------ commissioner: edit any player (league creator only)
const PERS_KEYS = [['greed', 'Money motivated'], ['loyal', 'Loyalty'], ['win', 'Wants to win'], ['ego', 'Ego / wants the ball'], ['work', 'Work ethic'], ['lead', 'Leadership'], ['volat', 'Hot-headed'], ['media', 'Media presence']];
function requireCreator(ctx) {
  // offline you're always the creator; online only the host (guests can't even reach this call)
  if (G.L.meta.online && !ctx.host) throw new Error('Only the league creator can edit players.');
}
export function playerEditInfo({ pid }, ctx) {
  requireCreator(ctx);
  const p = L().players[pid];
  if (!p) throw new Error('Player not found');
  const c = p.contract && !p.contract.ps ? p.contract : null;
  const s = capSeason();
  return {
    pid, fn: p.fn, ln: p.ln, pos: p.pos, jn: p.jn ?? null, age: age(p), ovr: p.r.ovr, pot: Math.round(p.r.pot ?? p.r.ovr), dev: p.dev || 'Normal', lon: p.lon ?? 70,
    morale: Math.round(p.morale ?? 65), attrs: ATTRS.map((k) => ({ k, l: ATTR_NAMES[k], v: p.r.a[k] ?? 50, key: (OVR_W[p.pos] || {})[k] ? 1 : 0 })),
    pers: PERS_KEYS.map(([k, l]) => ({ k, l, v: Math.round((p.pers?.[k] ?? 0.5) * 100) })), devs: DEV, positions: POSITIONS,
    contract: c ? { apy: c.apy, years: c.years.filter((y) => y.s >= s).length || 1, gtd: c.gtd || 0 } : null, hasTeam: p.tid >= 0, inj: p.inj ? { type: p.inj.type, wk: p.inj.wk } : null,
  };
}
export function editPlayer({ pid, ch = {} }, ctx) {
  requireCreator(ctx);
  const Lg = L();
  const p = Lg.players[pid];
  if (!p) throw new Error('Player not found');
  const num = (v, lo, hi) => (v === '' || v == null || isNaN(+v) ? null : clamp(Math.round(+v), lo, hi));
  if (typeof ch.fn === 'string' && ch.fn.trim()) p.fn = ch.fn.trim().slice(0, 40);
  if (typeof ch.ln === 'string' && ch.ln.trim()) p.ln = ch.ln.trim().slice(0, 40);
  const oldPos = p.pos;
  if (ch.pos && POSITIONS.includes(ch.pos) && ch.pos !== p.pos) p.pos = ch.pos;
  const jn = num(ch.jn, 0, 99);
  if (jn != null && jn !== p.jn) {
    // a teammate already wearing it gets this player's old number (or a new one)
    const mate = p.tid >= 0 ? Object.values(Lg.players).find((q) => q.tid === p.tid && q.pid !== p.pid && q.jn === jn) : null;
    if (mate) mate.jn = p.jn ?? null;
    p.jn = jn;
  }
  const ag = num(ch.age, 18, 50);
  if (ag != null && ag !== age(p)) { const d = ag - age(p); p.born = { ...(p.born || { y: Lg.meta.season - 25, m: 6 }), y: (p.born?.y ?? Lg.meta.season - 25) - d }; }
  // ratings: individual attributes first, then an overall change (which shifts the skill attributes to match)
  let attrChanged = false;
  if (ch.attrs && typeof ch.attrs === 'object') for (const k of ATTRS) { const v = num(ch.attrs[k], 15, 99); if (v != null && v !== p.r.a[k]) { p.r.a[k] = v; attrChanged = true; } }
  const before = p.r.ovr;
  if (attrChanged || p.pos !== oldPos) p.r.ovr = computeOvr(p.pos, p.r.a);
  const ov = num(ch.ovr, 25, 99);
  if (ov != null && ov !== p.r.ovr && ov !== before) setOvr(p, ov, true);
  if (p.r.ovr !== before) { p.r.tal = clamp((p.r.tal ?? before) + (p.r.ovr - before), 25, 99); p.r.ovrStart = p.r.ovr; }
  const pot = num(ch.pot, 25, 99);
  if (pot != null) { p.r.pot = Math.max(pot, p.r.ovr); p.r.potEst = p.r.pot; }
  if (ch.dev && DEV.includes(ch.dev)) p.dev = ch.dev;
  const lon = num(ch.lon, 0, 99); if (lon != null) p.lon = lon;
  const mo = num(ch.morale, 0, 100); if (mo != null) p.morale = mo;
  if (ch.pers && typeof ch.pers === 'object') { p.pers ||= {}; for (const [k] of PERS_KEYS) { const v = num(ch.pers[k], 0, 100); if (v != null) p.pers[k] = clamp(v / 100, 0.02, 0.98); } }
  if (ch.contract && p.tid >= -1) {
    const apy = num(ch.contract.apy, 0, 200e6), yrs = num(ch.contract.years, 1, 7), gtd = num(ch.contract.gtd, 0, 1500e6);
    if (apy != null && yrs != null) {
      const old = p.contract || {};
      p.contract = makeContract({ start: capSeason(), years: yrs, apy: Math.max(apy, 750000), gtd: Math.min(gtd ?? 0, apy * yrs), extra: { type: old.type || 'Veteran' } });
      if (p.tid === -1) p.contract = null; // free agents don't carry a deal; their asking price follows ratings
    }
  }
  if (ch.heal && p.inj) { p.inj = null; if (p.status === 'IR') p.healedOnIR = true; }
  if (p.tid >= 0) {
    if (p.pos !== oldPos) for (const k in T(p.tid).depth) T(p.tid).depth[k] = T(p.tid).depth[k].filter((x) => x !== p.pid);
    autoDepth(p.tid, { keepUserOrder: true });
  }
  Lg.standingsCache = null;
  transaction('edit', `Commissioner edited ${p.fn} ${p.ln}`, { tids: p.tid >= 0 ? [p.tid] : [], pids: [p.pid] });
  return { ok: true };
}

// one-time fixes for saves made with older versions (returns true if anything changed)
export function upgradeSave() { return upgradeCombines(); }
