// Injury types & recovery. Severity distribution modeled on NFL injury reports.
import { longevityInjuryHit } from './dev.js';
import { G, rnd, wpick, clamp, gauss, news, transaction } from './core.js';

const TYPES = [
  // name, min weeks, max weeks, weight, season-ending chance, positions bias
  ['Ankle sprain', 0, 3, 14, 0], ['High ankle sprain', 2, 7, 7, 0], ['Hamstring strain', 1, 4, 13, 0], ['Knee sprain', 1, 4, 7, 0],
  ['MCL sprain', 2, 7, 5, 0], ['Concussion', 1, 3, 7, 0], ['Shoulder injury', 0, 4, 6, 0], ['Groin strain', 1, 3, 5, 0],
  ['Quad strain', 0, 3, 4, 0], ['Calf strain', 1, 4, 4, 0], ['Back spasms', 0, 2, 4, 0], ['Rib injury', 0, 3, 3, 0],
  ['Hip injury', 0, 3, 3, 0], ['Foot sprain', 1, 5, 3, 0], ['Hand fracture', 2, 6, 2, 0], ['Broken arm', 6, 12, 1, 0.3],
  ['Turf toe', 2, 8, 2, 0], ['Torn ACL', 40, 52, 2.2, 1], ['Torn Achilles', 40, 52, 1.3, 1], ['Torn pectoral', 12, 30, 0.8, 0.8],
  ['Lisfranc injury', 10, 30, 0.8, 0.7], ['Broken leg', 14, 30, 0.6, 0.9], ['Neck injury', 2, 10, 0.6, 0.1], ['Knee (meniscus)', 3, 8, 2, 0],
  ['Stinger', 0, 1, 3, 0], ['Illness', 0, 1, 2, 0],
];
export function injuryTypeFor(pos, severity = 1) {
  const t = wpick(TYPES, TYPES.map((x) => x[3]));
  let wk = Math.round(t[1] + (t[2] - t[1]) * Math.pow(rnd(), 1.3));
  if (severity !== 1 && wk > 0) wk = Math.max(0, Math.round(wk * severity));
  if (wk === 0 && rnd() < 0.5) wk = 0; // day-to-day, plays next week
  return { type: t[0], wk, se: t[4] > 0 && rnd() < t[4] };
}

export function applyGameInjuries(box, game) {
  const Lg = G.L;
  for (const inj of box.inj) {
    const p = Lg.players[inj.pid];
    if (!p) continue;
    const wk = inj.se ? 99 : inj.wk;
    p.inj = { type: inj.type, wk: Math.max(wk, p.inj?.wk || 0), s: Lg.meta.season, w: Lg.meta.week, se: inj.se };
    if (wk >= 1 || inj.se) benchInjured(p, wk, inj);
    (p.injHist ||= []).push({ s: Lg.meta.season, w: Lg.meta.week, type: inj.type, wk });
    longevityInjuryHit(p, wk, inj.se);
    if (wk >= 3 || inj.se) {
      const t = Lg.teams[p.tid];
      news(`${t.abbr} ${p.pos} ${p.fn} ${p.ln} suffered a ${inj.type.toLowerCase()}${inj.se ? ' and is out for the season' : ` and is expected to miss ${wk} weeks`}.`, { type: 'injury', tids: [p.tid], pids: [p.pid], big: p.r.ovr >= 80 });
    }
  }
  void game;
}

// ---------------------------------------------------------------- lineup around injuries
// When a starter gets hurt we remember exactly where he played (depth spot + roles like slot WR or Mike LB).
// "Auto" teams (every CPU team, and yours unless you switch it off) move the next man up right away; in "manual"
// mode your depth chart is left alone and you get a heads-up to adjust it (the game still skips injured players).
// Either way, when he's healthy again he goes straight back to his old spot.
const isUserTid = (tid) => G.L.meta.userTids.includes(tid);
export function injuryAuto(t) { return t.injAuto !== false || !!G.multiSim; } // multi-week sims are always hands-off
function benchInjured(p, wk, inj) {
  const Lg = G.L;
  const t = Lg.teams[p.tid];
  if (!t) return;
  const list = t.depth[p.pos] || [];
  const idx = list.indexOf(p.pid);
  if (!p.slotMem && idx >= 0) {
    const roles = Object.keys(t.roles || {}).filter((k) => t.roles[k] === p.pid);
    p.slotMem = { tid: p.tid, pos: p.pos, idx, roles };
  }
  if (!isUserTid(p.tid)) return; // CPU staffs re-sort their depth chart every week anyway
  const STARTERS = { QB: 1, RB: 1, WR: 3, TE: 1, OT: 2, OG: 2, C: 1, EDGE: 2, DT: 2, LB: 2, CB: 3, S: 2, K: 1, P: 1, LS: 1 };
  const starter = idx >= 0 && idx < (STARTERS[p.pos] || 1);
  if (injuryAuto(t)) {
    if (idx >= 0) {
      // next man up: he drops behind the healthy players at his position
      const rest = list.filter((x) => x !== p.pid);
      let at = rest.length;
      for (let i = idx; i < rest.length; i++) { const q = Lg.players[rest[i]]; if (q && q.inj && q.inj.wk > 0) { at = i; break; } }
      rest.splice(at, 0, p.pid);
      t.depth[p.pos] = rest;
    }
    for (const k of p.slotMem?.roles || []) if (t.roles?.[k] === p.pid) delete t.roles[k]; // the staff picks a fill-in
    if (starter) news(`${p.fn} ${p.ln} (${p.pos}) is hurt${inj.se ? ' for the season' : `, out about ${wk} week${wk > 1 ? 's' : ''}`}. Your staff moved the next man up; he'll go back into the lineup when he's healthy.`, { type: 'injury', tids: [p.tid], pids: [p.pid], user: true });
  } else if (starter) {
    news(`${p.fn} ${p.ln} (${p.pos}) is hurt${inj.se ? ' for the season' : `, out about ${wk} week${wk > 1 ? 's' : ''}`}. Your lineup is set to manual: adjust it on Adjust Lineup (the next healthy player fills in until you do).`, { type: 'injury', tids: [p.tid], pids: [p.pid], user: true });
  }
}
export function restoreSlot(p) {
  const Lg = G.L;
  const m = p.slotMem;
  if (!m) return;
  delete p.slotMem;
  if (m.tid !== p.tid || p.status !== 'ACT' || (p.inj && p.inj.wk > 0)) return;
  const t = Lg.teams[p.tid];
  const rest = (t.depth[m.pos] || []).filter((x) => x !== p.pid);
  rest.splice(Math.min(m.idx, rest.length), 0, p.pid);
  t.depth[m.pos] = rest;
  for (const k of m.roles || []) (t.roles ||= {})[k] = p.pid;
  if (isUserTid(p.tid)) news(`${p.fn} ${p.ln} is healthy and back in his old spot in your lineup.`, { type: 'injury', tids: [p.tid], pids: [p.pid], user: true });
}

// Called each week: heal, move long injuries to IR (AI), activate healed IR players
export function weeklyInjuryUpdate(aiManage) {
  const Lg = G.L;
  for (const p of Object.values(Lg.players)) {
    if (!p.inj) continue;
    if (p.inj.wk > 0 && p.inj.wk < 99) p.inj.wk--;
    if (p.inj.wk === 0 && !p.inj.se) {
      if (p.status === 'IR') {
        const weeksOn = (Lg.meta.week - (p.irWeek ?? 0));
        if (weeksOn >= Lg.rules.irMinGames) { p.inj = null; p.healedOnIR = true; }
      } else { p.inj = null; restoreSlot(p); }
    }
  }
  if (aiManage) aiManage();
}

export function placeOnIR(pid) {
  const Lg = G.L;
  const p = Lg.players[pid];
  if (!p.inj || p.inj.wk < Lg.rules.irMinGames && !p.inj.se) return { error: `IR requires an injury of at least ${Lg.rules.irMinGames} weeks.` };
  p.status = 'IR'; p.irWeek = Lg.meta.week;
  const t = Lg.teams[p.tid];
  for (const k in t.depth) t.depth[k] = t.depth[k].filter((x) => x !== pid);
  transaction('ir', `${t.abbr} placed ${p.pos} ${p.fn} ${p.ln} on injured reserve`, { tids: [p.tid], pids: [pid] });
  return { ok: true };
}
export function activateFromIR(pid) {
  const Lg = G.L;
  const p = Lg.players[pid];
  const t = Lg.teams[p.tid];
  if (p.status !== 'IR') return { error: 'Not on IR' };
  if (p.inj && p.inj.wk > 0) return { error: 'Still injured' };
  t.irReturnsUsed ||= {};
  const used = t.irReturnsUsed[Lg.meta.season] || 0;
  if (Lg.meta.phase === 'REGULAR_SEASON' && used >= Lg.rules.irReturns) return { error: `You have used all ${Lg.rules.irReturns} IR return designations this season.` };
  if (Lg.meta.phase === 'REGULAR_SEASON') t.irReturnsUsed[Lg.meta.season] = used + 1;
  p.status = 'ACT'; p.healedOnIR = false;
  restoreSlot(p);
  transaction('ir', `${t.abbr} activated ${p.pos} ${p.fn} ${p.ln} from injured reserve`, { tids: [p.tid], pids: [pid] });
  return { ok: true };
}
void clamp; void gauss;
