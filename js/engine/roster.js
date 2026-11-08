// Depth charts and roster bookkeeping
import { G, rnd, clamp } from './core.js';
import { DEPTH_SLOTS, POSITIONS } from './const.js';

const ALT = { QB: [], RB: ['FB', 'WR'], FB: ['RB', 'TE'], WR: ['RB', 'TE', 'CB'], TE: ['FB', 'OT'], OT: ['OG'], OG: ['C', 'OT'], C: ['OG'],
  EDGE: ['DT', 'LB'], DT: ['EDGE'], LB: ['EDGE', 'S'], CB: ['S'], S: ['CB', 'LB'], K: ['P'], P: ['K'], LS: ['TE', 'C'] };

export function healthy(p) { return p.status === 'ACT' && !(p.inj && p.inj.wk > 0) && !p.holdout; }

export function autoDepth(tid, { keepUserOrder = false, list = null } = {}) {
  const Lg = G.L;
  const t = Lg.teams[tid];
  const ps = (list || Object.values(Lg.players)).filter((p) => p.tid === tid && p.status === 'ACT');
  ensureNumbers(tid, list);
  const depth = {};
  for (const pos of [...POSITIONS, 'KR', 'PR']) {
    if (pos === 'KR' || pos === 'PR') {
      const cands = ps.filter((p) => ['WR', 'RB', 'CB', 'S'].includes(p.pos))
        .sort((a, b) => score(b) - score(a));
      depth[pos] = cands.slice(0, 2).map((p) => p.pid);
      continue;
    }
    const prim = ps.filter((p) => p.pos === pos).sort((a, b) => rank(b) - rank(a));
    let list = prim.map((p) => p.pid);
    if (keepUserOrder && t.depth[pos]) {
      const kept = t.depth[pos].filter((pid) => list.includes(pid));
      list = [...kept, ...list.filter((x) => !kept.includes(x))];
    }
    const need = DEPTH_SLOTS[pos] || 2;
    if (list.length < need) {
      const alts = ps.filter((p) => (ALT[pos] || []).includes(p.pos) && !list.includes(p.pid)).sort((a, b) => b.r.ovr - a.r.ovr);
      for (const p of alts) { if (list.length >= need) break; list.push(p.pid); }
    }
    depth[pos] = list;
  }
  t.depth = depth;
  function score(p) { return (p.r.a.spd + p.r.a.elu + p.r.a.acc) / 3 - (p.r.ovr > 80 ? 8 : 0); }
  function rank(p) { return p.r.ovr + (p.inj && p.inj.wk > 0 ? -50 : 0) + (p.holdout ? -60 : 0); }
}

export function rosterCounts(tid) {
  const Lg = G.L;
  const ps = Object.values(Lg.players).filter((p) => p.tid === tid);
  const c = { ACT: 0, PS: 0, IR: 0, total: ps.length, byPos: {} };
  for (const p of ps) {
    c[p.status] = (c[p.status] || 0) + 1;
    if (p.status === 'ACT') c.byPos[p.pos] = (c.byPos[p.pos] || 0) + 1;
  }
  return c;
}

export function setDepth(tid, pos, pids) {
  const t = G.L.teams[tid];
  t.depth[pos] = pids.filter((pid) => G.L.players[pid]?.tid === tid);
  t.depthLocked = true;
  return { ok: true };
}
void clamp;

// NFL jersey number ranges by position (2023+ rules). Rookies and new signings get a free number in range.
const NUM_RANGES = {
  QB: [[0, 19]], RB: [[0, 49], [80, 89]], FB: [[0, 49], [80, 89]], WR: [[0, 49], [80, 89]], TE: [[0, 49], [80, 89]],
  OT: [[50, 79]], OG: [[50, 79]], C: [[50, 79]], DT: [[50, 79], [90, 99]], EDGE: [[0, 59], [90, 99]], LB: [[0, 59], [90, 99]],
  CB: [[0, 49]], S: [[0, 49]], K: [[0, 49], [90, 99]], P: [[0, 49], [90, 99]], LS: [[40, 69], [80, 99]],
};
export function ensureNumbers(tid, list = null) {
  const Lg = G.L;
  const mine = (list || Object.values(Lg.players)).filter((p) => p.tid === tid);
  const used = new Map();
  for (const p of mine) if (p.jn != null && !used.has(p.jn)) used.set(p.jn, p.pid);
  for (const p of mine) {
    if (p.jn != null) continue;
    const opts = [];
    for (const [a, b] of NUM_RANGES[p.pos] || [[0, 99]]) for (let n = a; n <= b; n++) if (!used.has(n)) opts.push(n);
    if (!opts.length) continue;
    // favor classic numbers for the position (low teens for QBs, 80s for TEs, 90s for pass rushers)
    const fav = { QB: [1, 19], WR: [10, 19], TE: [80, 89], EDGE: [90, 99], DT: [90, 99], RB: [20, 39], CB: [20, 39], S: [20, 39], LB: [40, 59], K: [1, 9], P: [1, 9] }[p.pos];
    const pref = fav ? opts.filter((n) => n >= fav[0] && n <= fav[1]) : [];
    const pool = pref.length ? pref : opts;
    p.jn = pool[Math.floor(rnd() * pool.length)];
    used.set(p.jn, p.pid);
  }
}
