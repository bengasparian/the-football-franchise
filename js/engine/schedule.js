// NFL scheduling formula + week assignment with byes.
import { G, rnd, shuffle, nextId } from './core.js';

const DIVS = ['East', 'North', 'South', 'West'];

export function generateSchedule(season, prevStandingsRank) {
  const Lg = G.L;
  const T = Lg.teams;
  const div = (conf, d) => T.filter((t) => t.conf === conf && t.div === d).map((t) => t.tid);
  const place = (tid) => prevStandingsRank?.[tid] ?? (T[tid].divPlace ?? 0); // 0..3 finish within division
  const y = season;
  // rotations (3-year intra, 4-year inter cycles)
  const intra = { 0: [[0, 1], [2, 3]], 1: [[0, 2], [1, 3]], 2: [[0, 3], [1, 2]] }[y % 3];
  const inter = [0, 1, 2, 3].map((k) => (k + y) % 4); // AFC div k plays NFC div inter[k]
  const games = [];
  const add = (h, a) => games.push({ h, a });
  // 6 division games
  for (const conf of ['AFC', 'NFC']) for (const d of DIVS) {
    const ts = div(conf, d);
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) { add(ts[i], ts[j]); add(ts[j], ts[i]); }
  }
  // 4 vs same-conference division
  for (const conf of ['AFC', 'NFC']) for (const [a, b] of intra) {
    const A = div(conf, DIVS[a]), B = div(conf, DIVS[b]);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { if ((i + j + y) % 2 === 0) add(A[i], B[j]); else add(B[j], A[i]); }
  }
  // 4 vs other-conference division
  for (let k = 0; k < 4; k++) {
    const A = div('AFC', DIVS[k]), B = div('NFC', DIVS[inter[k]]);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { if ((i + j + y) % 2 === 0) add(A[i], B[j]); else add(B[j], A[i]); }
  }
  // 2 same-place games vs the remaining two same-conference divisions
  for (const conf of ['AFC', 'NFC']) {
    for (let d = 0; d < 4; d++) {
      const pairedWith = intra.find((pr) => pr.includes(d));
      const others = [0, 1, 2, 3].filter((x) => x !== d && !pairedWith.includes(x));
      for (const o of others) {
        if (o < d) continue; // add each pair once
        const A = div(conf, DIVS[d]).sort((m, n) => place(m) - place(n));
        const B = div(conf, DIVS[o]).sort((m, n) => place(m) - place(n));
        for (let i = 0; i < 4; i++) { if ((i + y + d) % 2 === 0) add(A[i], B[i]); else add(B[i], A[i]); }
      }
    }
  }
  // 17th game: same-place vs an other-conference division not played in full (AFC hosts in odd years)
  for (let k = 0; k < 4; k++) {
    const nfcDiv = (inter[k] + 2) % 4;
    const A = div('AFC', DIVS[k]).sort((m, n) => place(m) - place(n));
    const B = div('NFC', DIVS[nfcDiv]).sort((m, n) => place(m) - place(n));
    for (let i = 0; i < 4; i++) { if (y % 2 === 1) add(A[i], B[i]); else add(B[i], A[i]); }
  }
  const weeks = assignWeeks(games, Lg.rules.weeks || 18);
  const out = [];
  for (const g of games) out.push({ gid: nextId('g'), s: season, w: g.w, type: 'REG', h: g.h, a: g.a, played: false });
  return out;
  void weeks;
}

function assignWeeks(games, nWeeks) {
  const teams = 32;
  for (let attempt = 0; attempt < 400; attempt++) {
    // byes in weeks 5-14
    const byeSlots = [4, 4, 2, 2, 4, 4, 4, 2, 2, 4];
    const order = shuffle([...Array(teams).keys()]);
    const bye = {};
    let idx = 0;
    byeSlots.forEach((n, i) => { for (let k = 0; k < n; k++) bye[order[idx++]] = 5 + i; });
    const remaining = shuffle(games.map((g, i) => i));
    const used = new Set();
    let ok = true;
    for (let w = 1; w <= nWeeks && ok; w++) {
      const playing = [...Array(teams).keys()].filter((t) => bye[t] !== w);
      const cand = remaining.filter((i) => !used.has(i) && bye[games[i].h] !== w && bye[games[i].a] !== w);
      const match = perfectMatch(playing, cand, games);
      if (!match) { ok = false; break; }
      for (const i of match) { used.add(i); games[i].w = w; }
    }
    if (ok && used.size === games.length) return true;
  }
  // fallback: sequential (should not happen)
  games.forEach((g, i) => { g.w = (i % 18) + 1; });
  return false;
}

function perfectMatch(teams, cand, games) {
  const adj = {};
  for (const t of teams) adj[t] = [];
  for (const i of cand) { const g = games[i]; adj[g.h].push(i); adj[g.a].push(i); }
  const free = new Set(teams);
  const chosen = [];
  let steps = 0;
  function dfs() {
    if (free.size === 0) return true;
    if (++steps > 4000) return false;
    // most constrained team first
    let best = null, bc = 1e9;
    for (const t of free) {
      let c = 0;
      for (const i of adj[t]) { const g = games[i]; const o = g.h === t ? g.a : g.h; if (free.has(o)) c++; }
      if (c < bc) { bc = c; best = t; if (c === 0) return false; }
    }
    const opts = adj[best].filter((i) => { const g = games[i]; const o = g.h === best ? g.a : g.h; return free.has(o); });
    shuffle(opts);
    const seen = new Set();
    for (const i of opts) {
      const g = games[i]; const o = g.h === best ? g.a : g.h;
      if (seen.has(o)) continue; seen.add(o);
      free.delete(best); free.delete(o); chosen.push(i);
      if (dfs()) return true;
      chosen.pop(); free.add(best); free.add(o);
    }
    return false;
  }
  return dfs() ? chosen : null;
}
void rnd;
