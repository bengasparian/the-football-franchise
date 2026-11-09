// Weekly game prep (like Madden's weekly training). Every team picks a focus and an intensity for its next game.
// The focus gives that unit a boost for the game, scaled by the coaches running it and by how much it matters
// against this opponent; harder practice means a bigger boost but more injuries. Young players in the focused
// group also bank a little development for the offseason. CPU teams (and your staff, if you don't choose) pick
// the best plan for the matchup.
import { G, clamp, gauss } from './core.js';

export const PREP_FOCUS = {
  pass: { label: 'Passing Game', side: 'off', desc: 'Timing, protections and route concepts. Helps your QB, receivers and pass protection.', group: ['QB', 'WR', 'TE', 'OT', 'OG', 'C'], eff: { pass: 1 } },
  run: { label: 'Run Game', side: 'off', desc: 'Blocking schemes, tracks and ball security. Helps your backs and run blocking.', group: ['RB', 'FB', 'TE', 'OT', 'OG', 'C'], eff: { run: 1 } },
  rush: { label: 'Pass Rush', side: 'def', desc: 'Get-off, rush plans and stunts. More pressure and sacks.', group: ['EDGE', 'DT', 'LB'], eff: { rush: 1 } },
  cover: { label: 'Coverage', side: 'def', desc: 'Disguises, zone drops and man technique. Fewer completions and big plays allowed.', group: ['CB', 'S', 'LB'], eff: { cover: 1 } },
  rund: { label: 'Run Defense', side: 'def', desc: 'Gap control, block shedding and tackling. Slows down the run.', group: ['DT', 'EDGE', 'LB', 'S'], eff: { rund: 1 } },
  balanced: { label: 'Balanced', side: 'all', desc: 'A little bit of everything. Smaller boost everywhere.', group: [], eff: { pass: 0.35, run: 0.35, rush: 0.35, cover: 0.35, rund: 0.35 } },
  film: { label: 'Film Study', side: 'all', desc: 'Game-plan the opponent\'s tendencies. Sharper play-calling on both sides of the ball.', group: [], eff: { film: 1 } },
};
export const PREP_INT = {
  light: { label: 'Light', desc: 'Walk-throughs. Smaller boost, fewer injuries.', mult: 0.6, inj: 0.85, xp: 0.5 },
  normal: { label: 'Normal', desc: 'A regular week of practice.', mult: 1, inj: 1, xp: 1 },
  hard: { label: 'Hard', desc: 'Full pads. Bigger boost and more development, but more injuries.', mult: 1.4, inj: 1.18, xp: 1.6 },
};
const BASE = 3.0; // rating points a perfectly-fitting normal week is worth for the focused unit

const key = () => { const Lg = G.L; return `${Lg.meta.season}:${Lg.meta.phase === 'PLAYOFFS' ? Lg.playoffs?.round : Lg.meta.week}`; };
export const prepActive = () => ['REGULAR_SEASON', 'PLAYOFFS'].includes(G.L.meta.phase);

// quick read of a team's healthy starters by unit (what scouts and coaches would see on film)
export function unitProfile(tid) {
  const Lg = G.L;
  const t = Lg.teams[tid];
  const st = (pos, n) => (t.depth[pos] || []).map((pid) => Lg.players[pid]).filter((p) => p && p.tid === tid && p.status === 'ACT' && !(p.inj && p.inj.wk > 0)).slice(0, n);
  const avg = (ps, k) => (ps.length ? ps.reduce((a, p) => a + (k ? p.r.a[k] ?? 50 : p.r.ovr), 0) / ps.length : 55);
  const ol = [...st('OT', 2), ...st('OG', 2), ...st('C', 1)];
  return {
    pass: avg(st('QB', 1)) * 0.5 + avg([...st('WR', 3), ...st('TE', 1)]) * 0.3 + avg(ol, 'pbk') * 0.2,
    run: avg(st('RB', 1)) * 0.45 + avg(ol, 'rbk') * 0.55,
    rush: avg([...st('EDGE', 2), ...st('DT', 2)], 'prs'),
    cover: avg([...st('CB', 3), ...st('S', 2)]),
    rund: avg([...st('DT', 2), ...st('EDGE', 2), ...st('LB', 2)], 'bsh') * 0.6 + avg(st('LB', 2), 'tak') * 0.4,
  };
}
let AVG = { k: null, v: null };
function leagueAvg() {
  const Lg = G.L;
  const k = key();
  if (AVG.k === k) return AVG.v;
  const all = Lg.teams.map((t) => unitProfile(t.tid));
  const v = {};
  for (const f of ['pass', 'run', 'rush', 'cover', 'rund']) v[f] = all.reduce((a, x) => a + x[f], 0) / all.length;
  AVG = { k, v };
  return v;
}
// what each focus counters on the other team, and how much that matters this week
const COUNTERS = { pass: ['rush', 'cover'], run: ['rund'], rush: ['pass'], cover: ['pass'], rund: ['run'] };
function coachFactor(tid, side) {
  const Lg = G.L;
  const st = Lg.teams[tid].staff || {};
  const C = Lg.coaches || {};
  const r = side === 'off' ? (C[st.oc]?.off ?? 70) * 0.7 + (C[st.hc]?.off ?? 70) * 0.3 : side === 'def' ? (C[st.dc]?.def ?? 70) * 0.7 + (C[st.hc]?.def ?? 70) * 0.3
    : ((C[st.hc]?.off ?? 70) + (C[st.hc]?.def ?? 70)) / 2;
  return clamp(0.75 + (r - 65) / 85, 0.6, 1.3);
}
export function prepOptions(tid, opp) {
  const me = unitProfile(tid), them = unitProfile(opp), avg = leagueAvg();
  const out = {};
  for (const [f, F] of Object.entries(PREP_FOCUS)) {
    let fit;
    if (f === 'balanced') fit = 1;
    else if (f === 'film') fit = 0.85;
    else if (!COUNTERS[f]) fit = 1;
    else {
      // more valuable against a strong opposing unit, and when our own unit needs the help
      const oppStr = COUNTERS[f].reduce((a, k) => a + (them[k] - avg[k]), 0) / COUNTERS[f].length;
      const ownWeak = avg[f] - me[f];
      fit = clamp(1 + oppStr / 14 + ownWeak / 28, 0.7, 1.4);
    }
    const b = BASE * coachFactor(tid, F.side) * fit;
    out[f] = { b, fit };
  }
  return out;
}
export const gradeFor = (b) => { const x = b / 1.5; return x >= 2.9 ? 'A+' : x >= 2.55 ? 'A' : x >= 2.25 ? 'B+' : x >= 1.95 ? 'B' : x >= 1.65 ? 'C+' : x >= 1.35 ? 'C' : 'D'; };
// the staff's pick: the best-value focus for the matchup, intensity by situation
export function autoPrep(tid, opp, { cpu = true } = {}) {
  const Lg = G.L;
  const t = Lg.teams[tid];
  const o = prepOptions(tid, opp);
  let best = 'balanced', bv = -1;
  for (const [f, x] of Object.entries(o)) { const v = x.b * (f === 'balanced' ? 0.62 : 1) + (cpu ? gauss(0, 0.12) : 0); if (v > bv) { bv = v; best = f; } }
  const hurt = Object.values(Lg.players).filter((p) => p.tid === tid && p.status === 'ACT' && p.inj && p.inj.wk > 0).length;
  const push = (Lg.meta.phase === 'PLAYOFFS' || Lg.meta.week >= 12) && (t.expectWins ?? 8.5) >= 9;
  const int = hurt >= 6 ? 'light' : push && hurt <= 3 ? 'hard' : 'normal';
  return { focus: best, int };
}
// the plan a team takes into this week's game (creates the staff's choice if nobody picked)
export function prepFor(tid, opp) {
  const Lg = G.L;
  if (!prepActive() || G.noPrep) return null;
  Lg.prep ||= {};
  const k = key();
  let pr = Lg.prep[tid];
  const user = Lg.meta.userTids.includes(tid);
  if (!pr || pr.k !== k || pr.opp !== opp) {
    const a = autoPrep(tid, opp, { cpu: !user });
    pr = { k, opp, focus: a.focus, int: a.int, auto: true };
    Lg.prep[tid] = pr;
  }
  const o = prepOptions(tid, opp)[pr.focus];
  const I = PREP_INT[pr.int] || PREP_INT.normal;
  pr.b = Math.round(o.b * I.mult * 100) / 100;
  pr.grade = gradeFor(o.b * (pr.int === 'hard' ? 1.1 : pr.int === 'light' ? 0.85 : 1));
  return pr;
}
export function setUserPrep(tid, opp, focus, int) {
  const Lg = G.L;
  Lg.prep ||= {};
  if (!focus || focus === 'auto') { delete Lg.prep[tid]; return prepFor(tid, opp); }
  if (!PREP_FOCUS[focus]) throw new Error('Unknown focus');
  Lg.prep[tid] = { k: key(), opp, focus, int: PREP_INT[int] ? int : 'normal', auto: false };
  return prepFor(tid, opp);
}
// applied in the game engine: unit boosts, play-calling edge and the injury multiplier
export function prepEffects(pr) {
  if (!pr) return null;
  const e = PREP_FOCUS[pr.focus]?.eff || {};
  const b = pr.b || 0;
  return { pass: (e.pass || 0) * b, run: (e.run || 0) * b, rush: (e.rush || 0) * b, cover: (e.cover || 0) * b, rund: (e.rund || 0) * b, film: (e.film || 0) * b, inj: (PREP_INT[pr.int] || PREP_INT.normal).inj };
}
// after the game: young players in the focused group bank development; keep a short history
export function afterPrep(tid, pr, result) {
  const Lg = G.L;
  if (!pr) return;
  const grp = PREP_FOCUS[pr.focus]?.group || [];
  const xp = (PREP_INT[pr.int] || PREP_INT.normal).xp * (pr.b / BASE);
  if (grp.length) for (const p of Object.values(Lg.players)) if (p.tid === tid && grp.includes(p.pos) && p.status !== 'IR') (p.txp = (p.txp || 0) + xp);
  const t = Lg.teams[tid];
  (t.prepHist ||= []).unshift({ k: pr.k, focus: pr.focus, int: pr.int, grade: pr.grade, opp: pr.opp, res: result });
  t.prepHist.length = Math.min(t.prepHist.length, 8);
}
