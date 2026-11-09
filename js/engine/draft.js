// Draft: generated prospect classes, scouting, draft order, AI selections, rookie contracts, UDFAs.
import { G, rnd, gauss, clamp, interp, wpick, pick, nextId, news, transaction, age } from './core.js';
import { FIRST, LAST, COLLEGES } from './names.js';
import { genAttrs, computeOvr, projectPeak, potLabel } from './ratings.js';
import { genPersonality } from './personality.js';
import { rookieDev, initLongevity } from './dev.js';
import { rookieContract } from './contracts.js';
import { autoDepth } from './roster.js';

const POS_DIST = { QB: 5, RB: 7, FB: 1, WR: 13, TE: 6, OT: 7, OG: 6, C: 3, EDGE: 10, DT: 9, LB: 9, CB: 12, S: 8, K: 1.5, P: 1.4, LS: 0.6 };
const HT_WT = { QB: [75, 220], RB: [70.5, 212], FB: [72, 245], WR: [72.5, 198], TE: [76.5, 248], OT: [77.5, 312], OG: [76, 315], C: [75, 305], EDGE: [76, 258], DT: [75, 305], LB: [74, 236], CB: [71.5, 192], S: [72, 204], K: [72.5, 195], P: [74, 210], LS: [74, 240] };

export function pickValue(n) { return 1000 / Math.pow(1 + (n - 1) / 9.5, 1.05); }

export function genDraftClass(s, n = 430) {
  const Lg = G.L;
  const pos = Object.keys(POS_DIST), w = Object.values(POS_DIST);
  const out = [];
  for (let i = 0; i < n; i++) {
    const ps = wpick(pos, w);
    const q = i / n;
    let tal = interp([[0, 78.5], [0.01, 76.5], [0.03, 73.5], [0.08, 69.5], [0.2, 64], [0.4, 59], [0.65, 54], [1, 45]], q) + gauss(0, 2.3);
    if (ps === 'K' || ps === 'P' || ps === 'LS') tal -= 6;
    if (ps === 'FB') tal -= 5;
    // eligibility: 3 years removed from high school, so 20 at the youngest; most are 21-23
    const a = Math.round(clamp(gauss(21.9, 0.9), 20, 25));
    const colYrs = clamp(a - 18 + (rnd() < 0.3 ? 1 : 0), 3, 5); // seasons played (incl. redshirt/5th years)
    const [h0, w0] = HT_WT[ps];
    const ht = Math.round(gauss(h0, 1.6)), wt = Math.round(gauss(w0, w0 * 0.045));
    const p = {
      pid: nextId('p'), fn: pick(FIRST), ln: pick(LAST), pos: ps, tid: -2, status: 'PROSPECT', jn: null,
      born: { y: s - a - 1, m: 1 + Math.floor(rnd() * 12), d: 1 + Math.floor(rnd() * 28) }, ht, wt,
      college: wpick(COLLEGES.map((c) => c[0]), COLLEGES.map((c) => c[1])), exp: 0, draft: null, hs: null,
      stats: {}, log: [], awards: [], injHist: [], morale: 70, draftClass: s,
    };
    const disp = clamp(tal + gauss(0, 1.5), 30, 90);
    const attrs = genAttrs(ps, disp, { ageY: a, noise: 4 });
    p.r = { ovr: computeOvr(ps, attrs), a: attrs, tal: clamp(tal, 30, 90), hist: [] };
    p.pers = genPersonality(p, { age: a });
    // what the league sees vs. what's really there: most prospects are about who they look like, but some
    // highly-rated players never pan out (busts) and some late picks have far more in the tank (gems)
    let surprise = gauss(0, 2.5);
    const roll = rnd();
    if (roll < 0.11) surprise -= 7 + rnd() * 8; // bust
    else if (roll < 0.17) surprise += 6 + rnd() * 9; // gem
    const seen = projectPeak(ps, p.r.tal, a, p.pers.work) + gauss(0, 2.5) + (p.pers.work - 0.5) * 4;
    p.r.pot = clamp(seen + surprise, p.r.tal, 99);
    if (surprise < -6) p.r.tal = clamp(p.r.tal - rnd() * 3, 30, 90);
    p.r.potEst = clamp(seen + surprise * 0.25 + gauss(0, 3), 30, 99);
    p.r.ovrStart = p.r.ovr;
    p.dev = rookieDev(p);
    p.lon = initLongevity(p);
    p.colYrs = colYrs;
    // consensus media grade (imperfect): built on what scouts can see, not the hidden truth
    p.scout = { grade: p.r.tal * 0.65 + (seen + surprise * 0.2) * 0.35 + gauss(0, 3.5) + (ps === 'QB' ? 0.5 : 0) - ({ RB: 2, FB: 7, K: 11, P: 12, LS: 18 }[ps] || 0), lvl: {} };
    p.combine = combineFor(p);
    out.push(p);
    Lg.players[p.pid] = p;
  }
  // a generational talent: roughly one every 15 drafts
  if (rnd() < 1 / 15) {
    const g = out.filter((p) => ['QB', 'EDGE', 'WR', 'OT', 'CB', 'RB', 'DT', 'S', 'LB', 'TE'].includes(p.pos)).sort((a, b) => b.r.tal - a.r.tal)[0];
    if (g) {
      g.gen = true; g.dev = 'Elite'; g.lon = Math.max(g.lon, 80);
      g.r.tal = clamp(84 + rnd() * 4, 84, 90); g.r.pot = clamp(97 + rnd() * 2, 97, 99); g.r.potEst = g.r.pot - rnd();
      const attrs = genAttrs(g.pos, g.r.tal, { ageY: age(g, s), noise: 3 });
      g.r.a = attrs; g.r.ovr = computeOvr(g.pos, attrs); g.r.ovrStart = g.r.ovr;
      g.pers.work = Math.max(g.pers.work, 0.75);
      g.scout.grade = 99;
    }
  }
  for (const p of out) p.col = collegeStats(p, s);
  // consensus board ranking
  out.sort((a, b) => b.scout.grade - a.scout.grade);
  out.forEach((p, i) => { p.scout.rank = i + 1; });
  const byPos = {};
  for (const p of out) { byPos[p.pos] = (byPos[p.pos] || 0) + 1; p.scout.posRank = byPos[p.pos]; }
  return out;
}

function combineFor(p) {
  const a = p.r.a;
  const inv = (pts, v) => { const sw = pts.map(([x, y]) => [y, x]).sort((m, n) => m[0] - n[0]); return interp(sw, v); };
  const c = {};
  if (rnd() > 0.1) c.forty = Math.round((inv([[4.22, 99], [4.3, 96], [4.4, 92], [4.5, 88], [4.6, 84], [4.7, 80], [4.85, 74], [5.0, 68], [5.2, 60], [5.4, 52], [5.6, 45]], a.spd) + gauss(0, 0.03)) * 100) / 100;
  if (rnd() > 0.25) c.vertical = Math.round((inv([[24, 55], [28, 66], [32, 76], [36, 86], [40, 94], [44, 99]], a.jmp) + gauss(0, 1.2)) * 2) / 2;
  if (rnd() > 0.3) c.bench = Math.round(inv([[8, 45], [14, 58], [20, 70], [25, 79], [30, 87], [35, 94], [40, 99]], a.str) + gauss(0, 1.5));
  if (rnd() > 0.35) c.cone = Math.round((inv([[6.5, 98], [6.8, 92], [7.0, 86], [7.3, 77], [7.6, 68], [7.9, 60], [8.2, 52]], a.agi) + gauss(0, 0.06)) * 100) / 100;
  if (rnd() > 0.35) c.shuttle = Math.round((inv([[3.9, 98], [4.1, 91], [4.25, 85], [4.45, 76], [4.65, 67], [4.9, 57]], a.agi) + gauss(0, 0.05)) * 100) / 100;
  if (['K', 'P', 'LS'].includes(p.pos)) { delete c.bench; }
  return c;
}

export function prospects(s = null) {
  const Lg = G.L;
  const season = s ?? (Lg.draft?.s || Lg.meta.season + 1);
  return Object.values(Lg.players).filter((p) => p.status === 'PROSPECT' && p.draftClass === season);
}

// ---- scouting (user teams). Points refill weekly in season and at the combine.
export const SCOUT_COST = [0, 8, 20, 40];
export function scoutProspect(tid, pid) {
  const Lg = G.L;
  const t = Lg.teams[tid];
  const p = Lg.players[pid];
  if (!p || p.status !== 'PROSPECT') return { error: 'Not a draft prospect' };
  const lvl = p.scout.lvl[tid] || 0;
  if (lvl >= 3) return { error: 'Fully scouted' };
  const cost = SCOUT_COST[lvl + 1];
  if ((t.scoutPts || 0) < cost) return { error: `Need ${cost} scouting points (you have ${t.scoutPts || 0}).` };
  t.scoutPts -= cost;
  p.scout.lvl[tid] = lvl + 1;
  if (!p.scout.err) p.scout.err = {};
  if (p.scout.err[tid] == null) p.scout.err[tid] = gauss(0, 1);
  return { ok: true, level: lvl + 1 };
}
// Auto scouting: the staff spends your points for you. Everyone projected to go around your picks gets a first look,
// then the best fits at your biggest needs get scouted deeper.
export function autoScout(tid) {
  const Lg = G.L;
  const t = Lg.teams[tid];
  if (!(t.scoutPts > 0)) return 0;
  const pool = prospects().filter((p) => p.scout?.rank != null).sort((a, b) => a.scout.rank - b.scout.rank).slice(0, 160);
  if (!pool.length) return 0;
  const need = teamNeeds(tid);
  const maxNeed = Math.max(1, ...Object.values(need));
  // where we pick: the first pick we own sets how high we look
  const mine = Lg.picks.filter((k) => k.tid === tid && k.s === (Lg.draft?.s || Lg.meta.season + 1)).map((k) => (k.no || (k.rd - 1) * 32 + 16));
  const first = mine.length ? Math.min(...mine) : 40;
  const pri = (p) => {
    const r = p.scout.rank;
    const reach = r < first - 12 ? 0.35 : 1; // won't be there when we pick
    return reach * (1 + 1.5 * (need[p.pos] || 0) / maxNeed) / (1 + Math.abs(r - first) / 25);
  };
  const ranked = pool.map((p) => ({ p, v: pri(p) })).sort((a, b) => b.v - a.v);
  const goal = (i) => (i < 12 ? 3 : i < 35 ? 2 : 1);
  let spent = 0;
  for (let pass = 1; pass <= 3; pass++) {
    for (let i = 0; i < ranked.length; i++) {
      const p = ranked[i].p;
      const lvl = p.scout.lvl[tid] || 0;
      if (lvl >= pass || goal(i) < pass) continue;
      const cost = SCOUT_COST[lvl + 1];
      if (t.scoutPts < cost) continue;
      if (scoutProspect(tid, p.pid).ok) spent += cost;
    }
  }
  return spent;
}
export function scoutedView(p, tid) {
  const lvl = p.scout?.lvl?.[tid] || 0;
  const err = p.scout?.err?.[tid] ?? 0;
  const spread = [12, 7, 4, 1.5][lvl];
  const center = p.r.ovr + err * spread * 0.5;
  return {
    lvl, ovrLo: Math.max(25, Math.round(center - spread)), ovrHi: Math.min(99, Math.round(center + spread)),
    pot: lvl >= 3 ? potLabel(p) : lvl >= 2 ? (p.r.potEst >= 84 ? 'High' : p.r.potEst >= 74 ? 'Solid' : 'Limited') : '?',
    pers: lvl >= 2, attrs: lvl >= 1,
  };
}

// ---- draft order
export function computeDraftOrder(s, standings, playoffResults) {
  const Lg = G.L;
  const elimRound = {}; // tid -> 0 (no playoffs), 1 WC loss, 2 DIV loss, 3 CONF loss, 4 SB loss, 5 champ
  for (const t of Lg.teams) elimRound[t.tid] = 0;
  for (const r of playoffResults || []) elimRound[r.tid] = r.round;
  const teams = Lg.teams.map((t) => t.tid).sort((a, b) => {
    const ea = elimRound[a], eb = elimRound[b];
    if (ea !== eb) return ea - eb;
    const sa = standings[a], sb = standings[b];
    const pa = (sa.w + sa.t * 0.5) / Math.max(1, sa.gp), pb = (sb.w + sb.t * 0.5) / Math.max(1, sb.gp);
    if (pa !== pb) return pa - pb;
    return (sa.sos ?? 0.5) - (sb.sos ?? 0.5) || rnd() - 0.5;
  });
  const order = [];
  for (let rd = 1; rd <= 7; rd++) {
    teams.forEach((tid) => {
      const pk = Lg.picks.find((x) => x.s === s && x.rd === rd && x.orig === tid && !x.comp);
      if (pk) order.push(pk);
    });
    // compensatory picks at the end of rounds 3-7
    for (const pk of Lg.picks.filter((x) => x.s === s && x.rd === rd && x.comp)) order.push(pk);
  }
  order.forEach((pk, i) => { pk.no = i + 1; });
  // conditional picks, e.g. "the earlier of Dallas' own 1st or the one they got from Green Bay"
  for (const pk of order.filter((x) => x.cond?.startsWith('earlierOf:'))) {
    const tids = pk.cond.split(':')[1].split(',').map(Number);
    const pair = tids.map((t) => order.find((x) => x.rd === pk.rd && x.orig === t)).filter(Boolean);
    if (pair.length !== 2) { delete pk.cond; continue; }
    const holder = pk.tid, other = pair.find((x) => x !== pk) ?? pair[0];
    const otherOwner = other.tid === holder ? pk.tid : other.tid;
    const [early, late] = pair.sort((a, b) => a.no - b.no);
    early.tid = holder; late.tid = otherOwner;
    delete pk.cond; delete other.cond;
  }
  Lg.draftOrder ||= {};
  Lg.draftOrder[s] = order.map((p) => p.id);
  return order;
}

export function startDraft() {
  const Lg = G.L;
  const s = Lg.meta.season + 1;
  if (!Lg.draftOrder?.[s]) {
    const st = Lg.standingsCache || {};
    computeDraftOrder(s, st, Lg.playoffElim || []);
  }
  Lg.draft = { s, idx: 0, log: [], done: false };
  resetClock();
  for (const t of Lg.teams) t.scoutPts = (t.scoutPts || 0);
}
// Live draft clock: every team gets up to 2 minutes. CPU teams usually turn their card in before time runs out;
// a user who lets the clock expire gets his scouts' best-available pick.
export const PICK_MS = 2 * 60 * 1000;
function resetClock() { const d = G.L.draft; if (!d) return; d.pickStart = Date.now(); d.aiDelay = Math.round((45 + rnd() * 75) * 1000); }
export function draftClock() {
  const d = G.L.draft;
  if (!d || d.done) return null;
  const el = Date.now() - (d.pickStart || Date.now());
  return { leftMs: Math.max(0, PICK_MS - el), userOnClock: !!userOnClock() };
}
export function draftTick() {
  const Lg = G.L, d = Lg.draft;
  if (!d || d.done) return { picks: 0 };
  const el = Date.now() - (d.pickStart || Date.now());
  const up = userOnClock();
  if (up ? el >= PICK_MS : el >= d.aiDelay) { draftCurrentPick(null); return { picks: 1 }; }
  return { picks: 0 };
}
export function simDraftPicks(n) { let k = 0; while (k < n && G.L.draft && !G.L.draft.done) { draftCurrentPick(null); k++; } return { picks: k }; }
export function simDraftRound() {
  const Lg = G.L, d = Lg.draft;
  if (!d || d.done) return { picks: 0 };
  const cur = Lg.picks.find((x) => x.id === Lg.draftOrder[d.s][d.idx])?.rd;
  let k = 0;
  while (!d.done) { const pk = Lg.picks.find((x) => x.id === Lg.draftOrder[d.s][d.idx]); if (!pk || pk.rd !== cur) break; draftCurrentPick(null); k++; }
  return { picks: k };
}

export function teamNeeds(tid) {
  const Lg = G.L;
  const ps = Object.values(Lg.players).filter((p) => p.tid === tid && p.status !== 'PS');
  const target = { QB: [1, 82], RB: [1, 76], WR: [3, 78], TE: [1, 76], OT: [2, 78], OG: [2, 76], C: [1, 75], EDGE: [2, 80], DT: [2, 78], LB: [2, 76], CB: [3, 78], S: [2, 76], K: [1, 70], P: [1, 68], LS: [1, 60], FB: [0, 0] };
  const need = {};
  for (const pos in target) {
    const [n, good] = target[pos];
    const arr = ps.filter((p) => p.pos === pos).sort((a, b) => b.r.ovr - a.r.ovr);
    let gap = 0;
    for (let i = 0; i < n; i++) {
      const p = arr[i];
      const yrs = p?.contract ? p.contract.exp - Lg.meta.season : 0;
      const a = p ? age(p, Lg.meta.season + 1) : 30;
      const v = p ? p.r.ovr - (a >= 31 ? 4 : 0) - (yrs <= 0 ? 3 : 0) : 50;
      gap += Math.max(0, good - v);
    }
    need[pos] = n ? gap / n : 0;
    if (pos === 'K' || pos === 'P' || pos === 'LS') need[pos] = arr.length ? Math.max(0, good - arr[0].r.ovr) : 25;
  }
  return need;
}

function aiChoose(tid, avail, pickNo) {
  const Lg = G.L;
  const need = teamNeeds(tid);
  let best = null, bv = -1e9;
  for (const p of avail) {
    // AI teams see true talent through their own noisy scouting
    const view = p.r.tal * 0.62 + p.r.pot * 0.38 + hashGauss(p.pid, tid) * 3.2;
    let v = view + Math.min(need[p.pos] || 0, 14) * 0.28;
    if (p.pos === 'QB' && (need.QB || 0) > 6) v += 3;
    if (['RB', 'FB'].includes(p.pos)) v -= 1.5;
    if (['K', 'P'].includes(p.pos)) v -= pickNo < 150 ? 8 : 1;
    if (p.pos === 'LS') v -= pickNo < 220 ? 14 : 2;
    // respect consensus a bit (teams don't stray far from boards)
    v -= Math.max(0, (p.scout.rank - pickNo - 40)) * 0.03;
    if (v > bv) { bv = v; best = p; }
  }
  return best;
}

export function draftCurrentPick(pidChoice = null) {
  const Lg = G.L;
  const d = Lg.draft;
  if (!d || d.done) return { error: 'No draft in progress' };
  const order = Lg.draftOrder[d.s];
  if (d.idx >= order.length) { finishDraft(); return { done: true }; }
  const pk = Lg.picks.find((x) => x.id === order[d.idx]);
  const avail = prospects(d.s);
  if (!avail.length) { finishDraft(); return { done: true }; }
  let p;
  if (!pidChoice && !Lg.meta.userTids.includes(pk.tid) && pk.rd <= 3) draftDayTrade(pk, order, d.idx);
  if (pidChoice) { p = Lg.players[pidChoice]; if (!p || p.status !== 'PROSPECT') return { error: 'Player not available' }; }
  else p = aiChoose(pk.tid, avail, pk.no);
  makeSelection(pk, p);
  d.idx++;
  resetClock();
  if (d.idx >= order.length) finishDraft();
  return { ok: true, pick: pk.no, pid: p.pid, tid: pk.tid };
}

function makeSelection(pk, p) {
  const Lg = G.L;
  const t = Lg.teams[pk.tid];
  p.tid = pk.tid; p.status = 'ACT'; p.draft = { y: Lg.draft.s, r: pk.rd, p: pk.no, tm: t.abbr, tid: pk.tid };
  p.r.ovr = clamp(Math.round(p.r.tal + gauss(0, 2)), 30, 90);
  // re-align attributes to the revealed overall
  const a0 = p.r.a;
  const d = p.r.ovr - computeOvr(p.pos, a0);
  for (const k in a0) if (!['spd', 'acc', 'agi', 'str', 'jmp', 'sta', 'inj'].includes(k)) a0[k] = clamp(Math.round(a0[k] + d), 15, 99);
  p.r.ovrStart = p.r.ovr;
  p.r.hist = [{ k: `${Lg.draft.s}-draft`, s: Lg.draft.s, w: 0, o: p.r.ovr }];
  p.contract = rookieContract(pk.no, Lg.draft.s, pk.rd);
  p.jn = null; p.yrsWithTeam = 0;
  pk.used = p.pid;
  Lg.draft.log.push({ no: pk.no, rd: pk.rd, tid: pk.tid, pid: p.pid, orig: pk.orig });
  if (pk.rd === 1) news(`With pick No. ${pk.no}, the ${t.region} ${t.name} select ${p.pos} ${p.fn} ${p.ln} (${p.college}).`, { type: 'draft', tids: [pk.tid], pids: [p.pid], big: pk.no <= 10 });
  transaction('draft', `${t.abbr} drafted ${p.pos} ${p.fn} ${p.ln} (Rd ${pk.rd}, No. ${pk.no})`, { tids: [pk.tid], pids: [p.pid] });
}

export function finishDraft() {
  const Lg = G.L;
  const d = Lg.draft;
  if (!d || d.done) return;
  d.done = true;
  // undrafted prospects become free agents (UDFA)
  for (const p of prospects(d.s)) { p.status = 'FA'; p.tid = -1; p.udfa = d.s; p.contract = null; }
  // remove used picks
  Lg.picks = Lg.picks.filter((x) => x.s !== d.s);
  for (const t of Lg.teams) autoDepth(t.tid);
  news(`The ${d.s} NFL Draft is complete. ${d.log.length} players selected.`, { type: 'draft' });
}

export function userOnClock() {
  const Lg = G.L;
  const d = Lg.draft;
  if (!d || d.done) return null;
  const pk = Lg.picks.find((x) => x.id === Lg.draftOrder[d.s][d.idx]);
  return pk && Lg.meta.userTids.includes(pk.tid) ? pk : null;
}
// simulate picks until a user team is on the clock (or the draft ends)
export function simDraftToUser(all = false) {
  const Lg = G.L;
  let n = 0;
  while (Lg.draft && !Lg.draft.done) {
    const up = userOnClock();
    if (up && !all) break;
    draftCurrentPick(null);
    if (++n > 400) break;
  }
  return { picks: n };
}
void transaction;

// AI teams trade down/up on draft day using the pick value chart
function draftDayTrade(pk, order, idx) {
  const Lg = G.L;
  if (rnd() > 0.075 * (Lg.settings.sliders.tradeAiAggression ?? 1)) return;
  const v = pickValue(pk.no);
  for (let j = idx + 4; j < Math.min(order.length, idx + 22); j++) {
    const later = Lg.picks.find((x) => x.id === order[j]);
    if (!later || Lg.meta.userTids.includes(later.tid) || later.tid === pk.tid) continue;
    if (rnd() > 0.35) continue;
    const extras = Lg.picks.filter((x) => x.tid === later.tid && x.s === pk.s && x.id !== later.id && !x.used && x.no && x.no > later.no).sort((a, b) => a.no - b.no);
    for (const ex of extras) {
      const got = pickValue(later.no) + pickValue(ex.no);
      if (got >= v * 1.02 && got <= v * 1.4) {
        const A = Lg.teams[pk.tid], B = Lg.teams[later.tid];
        const from = pk.tid;
        pk.tid = later.tid; later.tid = from; ex.tid = from;
        const txt = `${B.abbr} trade up to No. ${pk.no} with ${A.abbr}, sending picks No. ${later.no} and No. ${ex.no}`;
        transaction('trade', txt, { tids: [A.tid, B.tid] });
        news(`DRAFT-DAY TRADE: ${txt}.`, { type: 'trade', tids: [A.tid, B.tid], big: pk.rd === 1 });
        (Lg.tradeLog ||= []).unshift({ s: Lg.meta.season, ph: 'DRAFT', w: 0, t1: B.tid, t2: A.tid, text: txt });
        return;
      }
    }
  }
}

// deterministic per-(prospect, team) scouting error without storing it
export function hashGauss(pid, tid) {
  let h = 2166136261;
  const str = `${pid}:${tid}`;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  const u1 = ((h >>> 0) % 100000 + 0.5) / 100000;
  h = Math.imul(h ^ (h >>> 13), 2246822507);
  const u2 = ((h >>> 0) % 100000 + 0.5) / 100000;
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}


// Simulated college career: production follows talent, role grows each year (freshmen rarely start).
const CONF_STR = { Alabama: 1, Georgia: 1, 'Ohio State': 1, LSU: 0.95, Michigan: 0.95, Texas: 0.95, Oregon: 0.95, 'Penn State': 0.9, 'Notre Dame': 0.9 };
export function collegeStats(p, draftS) {
  const yrs = p.colYrs || 3;
  const out = [];
  const t = p.r.tal + (p.r.pot - p.r.tal) * 0.3;
  const q = clamp((t - 45) / 40, 0, 1.2); // 0 = fringe, 1 = elite prospect
  const lvl = CONF_STR[p.college] ?? (0.75 + rnd() * 0.15);
  for (let i = 0; i < yrs; i++) {
    const y = draftS - yrs + i;
    const role = clamp(0.25 + i * 0.3 + q * 0.25 - (i === 0 ? 0.15 : 0) + gauss(0, 0.12), 0.05, 1);
    const g = Math.round(clamp(gauss(12, 1.3) - (rnd() < 0.08 ? 6 : 0), 2, 15));
    const f = role * g / 12 * (0.85 + q * 0.4) * (1.1 - (lvl - 0.75) * 0.6);
    const n = (x, sd = 0.18) => Math.max(0, Math.round(x * (1 + gauss(0, sd))));
    const st = { y, g, gs: Math.round(g * clamp(role * 1.1, 0, 1)) };
    switch (p.pos) {
      case 'QB': { const att = n(380 * f); st.cmp = n(att * (0.58 + q * 0.1), 0.04); st.att = att; st.yds = n(att * (7.2 + q * 1.8), 0.08); st.td = n(att * (0.045 + q * 0.03)); st.int = n(att * (0.03 - q * 0.012)); st.ryds = n(150 * f + (p.r.a.spd - 60) * 6 * f, 0.4); break; }
      case 'RB': case 'FB': { const car = n((p.pos === 'FB' ? 25 : 190) * f); st.car = car; st.ryds = n(car * (4.4 + q * 1.8), 0.1); st.rtd = n(car * (0.05 + q * 0.04)); st.rec = n(22 * f); st.recyds = n(st.rec * 8.5); break; }
      case 'WR': case 'TE': { const rec = n((p.pos === 'TE' ? 38 : 60) * f); st.rec = rec; st.recyds = n(rec * (12 + q * 4), 0.1); st.rectd = n(rec * (0.08 + q * 0.06)); break; }
      case 'OT': case 'OG': case 'C': { st.sacksAllowed = n(clamp(5 - q * 4, 0.3, 6) * role, 0.5); st.pancakes = n(30 * f * (0.6 + q)); break; }
      case 'EDGE': case 'DT': { st.tkl = n(42 * f); st.tfl = n((p.pos === 'EDGE' ? 11 : 8) * f * (0.6 + q * 0.7)); st.sck = n((p.pos === 'EDGE' ? 7 : 4) * f * (0.5 + q * 0.9), 0.3); st.ff = n(1.2 * f, 0.6); break; }
      case 'LB': { st.tkl = n(85 * f); st.tfl = n(8 * f * (0.6 + q * 0.6)); st.sck = n(3 * f * (0.5 + q), 0.4); st.int = n(1 * f * (0.5 + q), 0.7); st.pd = n(4 * f * (0.6 + q)); break; }
      case 'CB': case 'S': { st.tkl = n((p.pos === 'S' ? 62 : 45) * f); st.int = n(2.5 * f * (0.4 + q), 0.5); st.pd = n(9 * f * (0.5 + q * 0.8)); break; }
      case 'K': { st.fga = n(20 * f + 4); st.fgm = Math.min(st.fga, n(st.fga * (0.7 + q * 0.18), 0.05)); st.lng = Math.round(clamp(45 + q * 10 + gauss(0, 3), 40, 62)); break; }
      case 'P': { st.pnt = n(55 * f + 10); st.avg = Math.round((41 + q * 5 + gauss(0, 1)) * 10) / 10; break; }
      case 'LS': { st.g = g; break; }
    }
    out.push(st);
  }
  return out;
}
