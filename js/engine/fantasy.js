// Fantasy draft: every rostered player goes into one pool; 53-round snake draft; contracts stay with players.
import { G, shuffle, age, news, transaction } from './core.js';
import { autoDepth } from './roster.js';
import { aiCapCompliance, aiCutdown } from './ai.js';
import { playerTradeValue } from './trade.js';

const TEMPLATE = { QB: 3, RB: 4, WR: 6, TE: 3, OT: 4, OG: 4, C: 2, EDGE: 5, DT: 5, LB: 5, CB: 6, S: 4, K: 1, P: 1 }; // 53

export function startFantasyDraft() {
  const Lg = G.L;
  const pool = Object.values(Lg.players).filter((p) => p.tid >= 0 && p.status !== 'PROSPECT');
  for (const p of pool) { p.fantasyPool = true; p.tid = -4; p.status = 'FA'; }
  for (const t of Lg.teams) t.depth = {};
  const order = shuffle(Lg.teams.map((t) => t.tid));
  Lg.fantasy = { order, round: 1, idx: 0, rounds: 53, log: [], done: false };
  news('Fantasy draft: every player in the league is up for grabs. Contracts stay with the players.', { type: 'system', big: true });
  return Lg.fantasy;
}
export function fantasyPool() { return Object.values(G.L.players).filter((p) => p.tid === -4); }
export function fantasyOnClock() {
  const F = G.L.fantasy;
  if (!F || F.done) return null;
  const forward = F.round % 2 === 1;
  return forward ? F.order[F.idx] : F.order[31 - F.idx];
}
function needs(tid) {
  const mine = Object.values(G.L.players).filter((p) => p.tid === tid);
  const n = {};
  for (const pos in TEMPLATE) n[pos] = TEMPLATE[pos] - mine.filter((p) => p.pos === pos).length;
  return n;
}
function aiFantasyPick(tid) {
  const pool = fantasyPool();
  const nd = needs(tid);
  const roundsLeft = 54 - G.L.fantasy.round;
  const mustFill = Object.values(nd).reduce((a, b) => a + Math.max(0, b), 0) >= roundsLeft;
  let best = null, bv = -1e9;
  for (const p of pool) {
    const need = nd[p.pos] ?? 0;
    if (need <= 0 && (mustFill || p.pos === 'K' || p.pos === 'P' || p.pos === 'LS' || p.pos === 'FB')) continue;
    let v = playerTradeValue(p, tid) * (need > 0 ? 1 : 0.35);
    if ((p.pos === 'K' || p.pos === 'P') && G.L.fantasy.round < 30) v *= 0.1;
    v -= (p.contract?.apy || 0) / 4e5 * 0.6;
    if (v > bv) { bv = v; best = p; }
  }
  return best || pool[0];
}
export function fantasyPick(pid = null) {
  const Lg = G.L;
  const F = Lg.fantasy;
  if (!F || F.done) return { error: 'No fantasy draft running' };
  const tid = fantasyOnClock();
  const p = pid ? Lg.players[pid] : aiFantasyPick(tid);
  if (!p || p.tid !== -4) return { error: 'Player not available' };
  p.tid = tid; p.status = 'ACT'; p.yrsWithTeam = 0; delete p.fantasyPool;
  F.log.push({ r: F.round, tid, pid: p.pid });
  F.idx++;
  if (F.idx >= 32) { F.idx = 0; F.round++; }
  if (F.round > F.rounds || !fantasyPool().length) finishFantasy();
  return { ok: true, tid, pid: p.pid };
}
export function fantasySimToUser(all = false) {
  const Lg = G.L;
  let n = 0;
  while (Lg.fantasy && !Lg.fantasy.done) {
    const tid = fantasyOnClock();
    if (!all && Lg.meta.userTids.includes(tid)) break;
    fantasyPick(null);
    if (++n > 2000) break;
  }
  return { ok: true, picks: n };
}
function finishFantasy() {
  const Lg = G.L;
  const F = Lg.fantasy;
  F.done = true;
  for (const p of fantasyPool()) { p.tid = -1; p.status = 'FA'; p.contract = null; delete p.fantasyPool; p.lastTeam = null; }
  for (const t of Lg.teams) { aiCapCompliance(t.tid); aiCutdown(t.tid); autoDepth(t.tid); }
  Lg.meta.phase = Lg.meta.fantasyFrom || 'PRESEASON';
  if (Lg.meta.phase === 'PRESEASON') Lg.meta.week = 1;
  transaction('fantasy', 'Fantasy draft completed', {});
  news('The fantasy draft is complete. Rosters are set!', { type: 'system', big: true });
  void age;
}
