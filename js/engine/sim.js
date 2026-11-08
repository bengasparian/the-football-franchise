// Play-by-play game simulation. Produces box scores, player stats, injuries.
import { G, rnd, gauss, clamp, chance, wpick, interp, pick } from './core.js';
import { injuryTypeFor } from './injuries.js';

const OFF_SLOTS = { QB: 1, RB: 2, WR: 4, TE: 2, OT: 2, OG: 2, C: 1, FB: 1 };
const DEF_SLOTS = { EDGE: 3, DT: 3, LB: 3, CB: 4, S: 2 };

function eff(p, k) {
  // effective attribute: shown rating + hidden talent offset + morale/injury/form
  return clamp((p.r.a[k] ?? 50) + p._off, 10, 110);
}

function buildUnit(tid, ctx) {
  const Lg = G.L;
  const t = Lg.teams[tid];
  const used = new Set();
  const avail = (pid) => {
    const p = Lg.players[pid];
    return p && p.tid === tid && p.status === 'ACT' && !(p.inj && p.inj.wk > 0) && !p.holdout && !used.has(pid);
  };
  const take = (pos, n, fallbacks = []) => {
    const out = [];
    for (const pid of t.depth[pos] || []) { if (out.length >= n) break; if (avail(pid)) { out.push(Lg.players[pid]); used.add(pid); } }
    // depth chart shortages: pull best available at position, then fallbacks
    if (out.length < n) {
      const pool = Object.values(Lg.players).filter((p) => p.tid === tid && p.status === 'ACT' && !used.has(p.pid) && !(p.inj && p.inj.wk > 0) && !p.holdout && (p.pos === pos || fallbacks.includes(p.pos)))
        .sort((a, b) => (b.pos === pos) - (a.pos === pos) || b.r.ovr - a.r.ovr);
      for (const p of pool) { if (out.length >= n) break; out.push(p); used.add(p.pid); }
    }
    return out;
  };
  const u = {
    tid, t,
    QB: take('QB', 2), RB: take('RB', 2, ['FB', 'WR']), WR: take('WR', 4, ['TE', 'RB', 'CB']), TE: take('TE', 2, ['OT', 'FB']),
    OT: take('OT', 2, ['OG']), OG: take('OG', 2, ['C', 'OT']), C: take('C', 1, ['OG']),
    EDGE: take('EDGE', 3, ['DT', 'LB']), DT: take('DT', 3, ['EDGE']), LB: take('LB', 3, ['S', 'EDGE']), CB: take('CB', 4, ['S']), S: take('S', 2, ['CB', 'LB']),
    K: take('K', 1, ['P']), P: take('P', 1, ['K']),
  };
  u.KR = (t.depth.KR || []).map((pid) => Lg.players[pid]).find((p) => p && used.has(p.pid) === false && avail(p.pid)) || u.WR[3] || u.RB[1] || u.CB[3] || u.WR[0];
  const all = [];
  for (const k of ['QB', 'RB', 'WR', 'TE', 'OT', 'OG', 'C', 'EDGE', 'DT', 'LB', 'CB', 'S', 'K', 'P']) for (const p of u[k]) all.push(p);
  if (u.KR && !all.includes(u.KR)) all.push(u.KR);
  const chemB = ((t.chem ?? 0.6) - 0.6) * 4 * (Lg.settings.sliders.moraleImpact ?? 1);
  for (const p of all) {
    const mor = ((p.morale ?? 65) - 65) / 30 * (Lg.settings.sliders.moraleImpact ?? 1);
    p._off = (p.r.tal - p.r.ovr) + mor + chemB + (p.inj && p.inj.playThrough ? -4 : 0);
  }
  // coaching: OC/DC skill and scheme fit
  const st = t.staff || {};
  const C = Lg.coaches || {};
  u.ocB = ((C[st.oc]?.off ?? 70) - 70) / 10 + ((C[st.hc]?.off ?? 70) - 70) / 20;
  u.dcB = ((C[st.dc]?.def ?? 70) - 70) / 10 + ((C[st.hc]?.def ?? 70) - 70) / 20;
  u.gm = (C[st.hc]?.gm ?? 70);
  u.agg = (C[st.hc]?.agg ?? 0.5);
  u.passLean = (C[st.oc]?.passLean ?? 0.5);
  u.all = all;
  rateUnit(u);
  return u;
}

function rateUnit(u) {
  const a = (arr, k) => (arr.length ? arr.reduce((s, p) => s + eff(p, k), 0) / arr.length : 40);
  const qb = u.QB[0];
  u.r = {
    qbAcc: qb ? eff(qb, 'tas') * 0.6 + eff(qb, 'tad') * 0.4 : 40, qbDeep: qb ? eff(qb, 'tad') * 0.6 + eff(qb, 'thp') * 0.4 : 40,
    qbDec: qb ? eff(qb, 'dec') * 0.7 + eff(qb, 'awr') * 0.3 : 40, qbPoc: qb ? eff(qb, 'poc') : 40,
    qbMob: qb ? eff(qb, 'spd') * 0.6 + eff(qb, 'agi') * 0.4 : 40,
    pbk: a([...u.OT, ...u.OG, ...u.C], 'pbk') * 0.85 + a(u.TE.slice(0, 1), 'pbk') * 0.05 + a(u.RB.slice(0, 1), 'pbk') * 0.1,
    rbk: a([...u.OT, ...u.OG, ...u.C], 'rbk') * 0.8 + a(u.TE.slice(0, 1), 'rbk') * 0.2,
    rush: a(u.EDGE.slice(0, 2), 'prs') * 0.62 + a(u.DT.slice(0, 2), 'prs') * 0.32 + a(u.LB.slice(0, 1), 'prs') * 0.06,
    runD: a(u.DT.slice(0, 2), 'bsh') * 0.4 + a(u.EDGE.slice(0, 2), 'bsh') * 0.25 + a(u.LB.slice(0, 2), 'bsh') * 0.2 + a(u.LB.slice(0, 2), 'tak') * 0.15,
    tackle: a([...u.LB.slice(0, 2), ...u.S, ...u.CB.slice(0, 2)], 'tak') * 0.5 + a([...u.LB.slice(0, 2), ...u.S], 'pur') * 0.5,
    cover: a(u.CB.slice(0, 3), 'mcv') * 0.45 + a(u.CB.slice(0, 3), 'zcv') * 0.2 + a(u.S, 'zcv') * 0.25 + a(u.LB.slice(0, 2), 'zcv') * 0.1,
  };
}

function newLine() { return {}; }
function inc(box, p, k, v = 1) { if (!p) return; const l = (box.pl[p.pid] ||= newLine()); l[k] = (l[k] || 0) + v; }

export function simGame(game, opts = {}) {
  const Lg = G.L;
  const sl = Lg.settings.sliders;
  const rules = Lg.rules;
  const H = buildUnit(game.h, opts), A = buildUnit(game.a, opts);
  const playoff = !!opts.playoff;
  const box = { pl: {}, tm: [mkTeamBox(game.h), mkTeamBox(game.a)], scoring: [], plays: [], inj: [] };
  const U = [H, A];
  for (const u of U) for (const p of u.all) inc(box, p, 'gp', 1);
  const S = { q: 1, clock: 900, score: [0, 0], off: 0, yl: 25, down: 1, dist: 10, to: [3, 3], ot: false, otPoss: [0, 0], otFirst: null, over: false, plays: 0, half2Kick: null };
  const homeAdv = 1.6 * (sl.homeField ?? 1) * (game.neutral ? 0 : 1);
  const upset = sl.upsetFactor ?? 1;
  // game-day form: each team has a small random form swing (any-given-Sunday)
  const form = [gauss(0, 3.0 * upset) + homeAdv / 2, gauss(0, 3.0 * upset) - homeAdv / 2];
  const scoringAdj = (sl.scoring ?? 1);

  const coin = chance(0.5) ? 0 : 1; // team that receives first
  S.half2Kick = coin;
  kickoff(1 - coin); // kicking team

  function mkTeamBox(tid) { return { tid, q: [0, 0, 0, 0], ot: 0, pts: 0, fd: 0, pyd: 0, ryd: 0, plays: 0, to: 0, pen: 0, penYd: 0, top: 0, sk: 0, skYd: 0, td3: 0, att3: 0, td4: 0, att4: 0, rz: 0, rzTd: 0, cmp: 0, att: 0, car: 0, int: 0, fum: 0 }; }
  function O() { return U[S.off]; }
  function D() { return U[1 - S.off]; }
  function tb(i) { return box.tm[i]; }
  function addScore(team, pts, text) {
    S.score[team] += pts;
    const qi = S.ot ? 'ot' : S.q - 1;
    if (qi === 'ot') tb(team).ot += pts; else tb(team).q[qi] += pts;
    tb(team).pts = S.score[team];
    box.scoring.push({ q: S.ot ? 'OT' : S.q, t: fmtClock(S.clock), tm: U[team].t.abbr, txt: text, sc: `${S.score[0]}-${S.score[1]}` });
  }
  function fmtClock(c) { const m = Math.floor(c / 60), s = Math.floor(c % 60); return `${m}:${String(s).padStart(2, '0')}`; }
  function useClock(sec) {
    const tStart = S.clock;
    if (S.q === 2 || S.q === 4) {
      if (tStart > 120 && tStart - sec <= 120) { S.clock = 120; tb(S.off).top += tStart - 120; return; }
    }
    S.clock = Math.max(0, S.clock - sec);
    tb(S.off).top += tStart - S.clock;
  }
  function changePoss(yl) {
    if (S.ot) { S.otPoss[S.off]++; if (checkOtEnd()) return; }
    S.off = 1 - S.off; S.yl = clamp(yl, 1, 99); S.down = 1; S.dist = Math.min(10, 100 - S.yl);
  }
  function checkOtEnd() {
    // overtime: both teams get a possession; then sudden death
    const [a, b] = S.otPoss;
    if (a >= 1 && b >= 1 && S.score[0] !== S.score[1]) { S.over = true; return true; }
    return false;
  }
  function kickoff(kicker) {
    const ret = 1 - kicker;
    const k = U[kicker].K[0];
    const trailing = S.score[kicker] < S.score[ret];
    const late = S.q === 4 && S.clock < 180 && !S.ot;
    if (late && trailing && S.score[ret] - S.score[kicker] <= 16) {
      // onside attempt
      if (chance(0.11)) { S.off = kicker; S.yl = 50; S.down = 1; S.dist = 10; box.plays.push(txt(`${U[kicker].t.abbr} recover the onside kick!`)); return; }
      S.off = ret; S.yl = 50; S.down = 1; S.dist = 10; return;
    }
    const tbRate = clamp(0.28 + ((k ? eff(k, 'kpw') : 70) - 80) / 120, 0.1, 0.6);
    S.off = ret; S.down = 1; S.dist = 10;
    if (chance(tbRate)) { S.yl = rules.kickoffTouchback; return; }
    const kr = U[ret].KR;
    let y = clamp(Math.round(gauss(28.5 + ((kr ? eff(kr, 'spd') + eff(kr, 'elu') : 150) - 165) / 12, 6.5)), 8, 60);
    if (chance(0.004)) { // return TD
      inc(box, kr, 'krTd'); inc(box, kr, 'kr'); inc(box, kr, 'krYd', 100);
      addScore(ret, 6, `${nm(kr)} kickoff return TD`); pat(ret); kickoff(ret); return;
    }
    if (kr) { inc(box, kr, 'kr'); inc(box, kr, 'krYd', y); }
    S.yl = y;
  }
  function nm(p) { return p ? `${p.fn[0]}. ${p.ln}` : 'Unknown'; }
  function txt(s) { return { q: S.ot ? 'OT' : S.q, t: fmtClock(S.clock), s }; }
  function pat(team) {
    const diff = S.score[team] - S.score[1 - team];
    const late = (S.q === 4 && S.clock < 900) || S.ot;
    const goTwo = late && [-2, -5, -10, -13, -16, 1, 5, 12].includes(diff) || (diff === -1 && S.q === 4 && S.clock < 60) || chance(0.035);
    const o = U[team], d = U[1 - team];
    if (goTwo) {
      const pr = clamp(0.47 + ((o.r.rbk + o.r.qbAcc) / 2 - (d.r.runD + d.r.cover) / 2) / 150, 0.3, 0.65);
      if (chance(pr)) { addScore(team, 2, 'Two-point conversion good'); } else box.scoring.push({ q: S.ot ? 'OT' : S.q, t: fmtClock(S.clock), tm: o.t.abbr, txt: 'Two-point try failed', sc: `${S.score[0]}-${S.score[1]}` });
      return;
    }
    const k = o.K[0];
    const pr = clamp(0.945 + ((k ? eff(k, 'kac') : 60) - 80) / 400 - (rules.xpDistance - 33) * 0.01, 0.8, 0.995);
    inc(box, k, 'xpa');
    if (chance(pr)) { inc(box, k, 'xpm'); S.score[team] += 1; const qi = S.ot ? null : S.q - 1; if (qi === null) tb(team).ot += 1; else tb(team).q[qi] += 1; tb(team).pts = S.score[team]; }
  }
  function touchdown(scorer, how) {
    const team = S.off;
    addScore(team, 6, how);
    if (S.ot && S.otPoss[1 - team] >= 1 && S.score[team] > S.score[1 - team]) { S.over = true; return; }
    pat(team);
    if (S.ot) { S.otPoss[team]++; if (checkOtEnd()) return; }
    kickoff(team);
    void scorer;
  }
  function fieldGoal() {
    const o = O();
    const k = o.K[0];
    const dist = 100 - S.yl + 17;
    const kp = k ? eff(k, 'kpw') : 60, ka = k ? eff(k, 'kac') : 60;
    const base = interp([[18, 0.995], [25, 0.985], [30, 0.97], [35, 0.94], [40, 0.9], [45, 0.84], [50, 0.76], [55, 0.66], [60, 0.48], [64, 0.28], [70, 0.05]], dist - (kp - 80) * 0.18);
    const pr = clamp(base + (ka - 80) / 260, 0.02, 0.995);
    inc(box, k, 'fga'); inc(box, k, 'fgExp', base);
    inc(box, k, dist >= 50 ? 'fga50' : 'fgaU50');
    useClock(5);
    if (chance(pr)) {
      inc(box, k, 'fgm'); if (dist >= 50) inc(box, k, 'fgm50');
      inc(box, k, 'fgLong', 0);
      const l = box.pl[k?.pid]; if (l) l.fgLng = Math.max(l.fgLng || 0, dist);
      const team = S.off;
      addScore(team, 3, `${nm(k)} ${dist}-yd field goal`);
      if (S.ot) {
        S.otPoss[team]++;
        if (S.otPoss[1 - team] >= 1 && S.score[team] > S.score[1 - team]) { S.over = true; return; }
        if (checkOtEnd()) return;
      }
      kickoff(team);
    } else {
      box.plays.push(txt(`${nm(k)} misses ${dist}-yd field goal`));
      changePoss(Math.max(20, 100 - (S.yl - 7)));
    }
  }
  function punt() {
    const o = O(), d = D();
    const p = o.P[0];
    const kp = p ? eff(p, 'kpw') : 60, ka = p ? eff(p, 'kac') : 60;
    let gross = Math.round(gauss(46.5 + (kp - 80) / 4, 6));
    const land = S.yl + gross;
    inc(box, p, 'pnt'); inc(box, p, 'pntYd', gross);
    useClock(6);
    let net, newYl;
    if (land >= 100) { net = gross - (land - 80); newYl = 20; inc(box, p, 'pntTb'); }
    else {
      const ret = chance(0.42);
      let ry = ret ? Math.max(-2, Math.round(gauss(9, 7))) : 0;
      if (ret && chance(0.006)) { // punt return TD
        const r = d.KR; inc(box, r, 'prTd');
        net = gross; S.off = 1 - S.off;
        addScore(S.off, 6, `${nm(r)} punt return TD`); pat(S.off); kickoff(S.off); inc(box, p, 'pntNet', net); return;
      }
      newYl = clamp(100 - land + ry, 1, 99);
      if (newYl <= 20 && chance(0.6 + (ka - 75) / 100)) inc(box, p, 'pntIn20');
      net = gross - ry;
      if (ret && d.KR) { inc(box, d.KR, 'pr'); inc(box, d.KR, 'prYd', ry); }
    }
    inc(box, p, 'pntNet', net);
    if (S.ot) { S.otPoss[S.off]++; if (checkOtEnd()) return; }
    S.off = 1 - S.off; S.yl = newYl; S.down = 1; S.dist = 10;
  }
  function turnover(newYlForDef, how) {
    tb(S.off).to++;
    box.plays.push(txt(how));
    if (S.ot) { S.otPoss[S.off]++; if (checkOtEnd()) return; }
    S.off = 1 - S.off; S.yl = clamp(newYlForDef, 1, 99); S.down = 1; S.dist = Math.min(10, 100 - S.yl);
  }
  function safety() {
    const def = 1 - S.off;
    addScore(def, 2, 'Safety');
    if (S.ot) { S.over = true; return; }
    // free kick from own 20
    S.off = def; S.yl = 35 + Math.round(gauss(5, 6)); S.down = 1; S.dist = 10;
  }

  function choosePlay() {
    const o = O();
    const diff = S.score[S.off] - S.score[1 - S.off];
    const tLeft = (4 - S.q) * 900 + S.clock;
    const late = S.q === 4 || S.ot;
    // 4th down decision
    if (S.down === 4) {
      const fgDist = 100 - S.yl + 17;
      const k = o.K[0];
      const range = 53.5 + ((k ? eff(k, 'kpw') : 60) - 75) / 2.5;
      const agg = (sl.fourthDownAggression ?? 1) * (0.7 + o.agg * 0.6);
      const desperate = late && diff < 0 && (S.clock < 300 || (diff < -8 && S.clock < 480)) && !(diff >= -3 && fgDist <= range && S.clock < 30);
      if (desperate) return 'go';
      if (late && diff > 0 && S.clock < 120 && S.yl < 60) return 'punt';
      let goP = 0;
      if (S.dist <= 1) goP = S.yl >= 50 ? 0.72 : S.yl >= 35 ? 0.45 : 0.12;
      else if (S.dist <= 3) goP = S.yl >= 55 && S.yl <= 72 ? 0.35 : S.yl >= 50 ? 0.22 : 0.04;
      else if (S.dist <= 6) goP = S.yl >= 60 && S.yl <= 70 ? 0.12 : 0.01;
      goP = clamp(goP * agg, 0, 0.95);
      if (fgDist <= range && (S.dist > 2 || S.yl > 92 ? true : true)) {
        if (chance(goP * (S.yl > 85 && S.dist <= 2 ? 1.1 : 0.7))) return 'go';
        return 'fg';
      }
      if (chance(goP)) return 'go';
      return 'punt';
    }
    // end-of-half kneel
    if (late && diff > 0 && S.clock <= 120 && S.q === 4 && S.to[1 - S.off] === 0 && S.clock <= 40 * (5 - S.down)) return 'kneel';
    let passP = 0.555 * (sl.passRate ?? 1) + (o.passLean - 0.5) * 0.12;
    if (S.down === 3) passP += S.dist >= 7 ? 0.3 : S.dist >= 4 ? 0.15 : -0.1;
    if (S.down === 1 && S.dist === 10) passP -= 0.05;
    if (S.down === 2 && S.dist >= 8) passP += 0.08;
    if (S.dist <= 1 && S.down >= 3) passP -= 0.25;
    if (late && diff < 0 && S.clock < 360) passP += 0.25 + (diff < -8 ? 0.1 : 0);
    if (late && diff > 0 && S.clock < 420) passP -= 0.3;
    if (S.q === 2 && S.clock < 120 && S.yl < 80) passP += 0.25;
    void tLeft;
    return chance(clamp(passP, 0.08, 0.95)) ? 'pass' : 'run';
  }

  function hurry() {
    const diff = S.score[S.off] - S.score[1 - S.off];
    return (S.q === 4 && diff < 0 && S.clock < 300) || (S.q === 2 && S.clock < 120) || (S.ot && diff <= 0);
  }
  function milk() { const diff = S.score[S.off] - S.score[1 - S.off]; return S.q === 4 && diff > 0 && S.clock < 480; }

  function penaltyCheck() {
    const r = rnd();
    const rate = 0.088 * (sl.penalties ?? 1);
    if (r > rate) return null;
    const o = O(), d = D();
    const kinds = [
      ['False start', 'off', -5, 0.22], ['Offensive holding', 'off', -10, 0.24], ['Defensive holding', 'def', 5, 0.1],
      ['Defensive pass interference', 'def', 'spot', 0.1], ['Offside', 'def', 5, 0.12], ['Unnecessary roughness', 'def', 15, 0.06],
      ['Roughing the passer', 'def', 15, 0.04], ['Delay of game', 'off', -5, 0.06], ['Illegal formation', 'off', -5, 0.06],
    ];
    const k = wpick(kinds, kinds.map((x) => x[3]));
    const side = k[1] === 'off' ? S.off : 1 - S.off;
    const unit = k[1] === 'off' ? o : d;
    // pick a culprit (volatile players draw more flags)
    const pool = k[1] === 'off' ? [...o.OT, ...o.OG, ...o.C, ...o.WR.slice(0, 3), ...o.TE.slice(0, 1)] : [...d.EDGE.slice(0, 2), ...d.DT.slice(0, 2), ...d.LB.slice(0, 2), ...d.CB.slice(0, 3), ...d.S];
    const culprit = pool.length ? wpick(pool, pool.map((p) => 0.6 + (p.pers?.volat ?? 0.3))) : null;
    inc(box, culprit, 'pen');
    tb(side).pen++;
    let yds = k[2] === 'spot' ? clamp(Math.round(gauss(16, 9)), 5, 45) : k[2];
    tb(side).penYd += Math.abs(yds);
    void unit;
    return { name: k[0], side: k[1], yds, auto1: k[1] === 'def' && k[0] !== 'Offside' };
  }

  function runPlay() {
    const o = O(), d = D();
    const qb = o.QB[0];
    tb(S.off).plays++; tb(S.off).car++;
    S.plays++;
    let carrier;
    const mobQ = o.r.qbMob;
    const qbRunP = clamp(0.04 + (mobQ - 72) / 220, 0.01, 0.2);
    const sneak = S.dist <= 1 && S.down >= 3;
    if (sneak && qb && chance(0.45)) carrier = qb;
    else if (qb && chance(qbRunP)) carrier = qb;
    else carrier = chance(0.66) ? o.RB[0] : (o.RB[1] || o.RB[0]);
    if (!carrier) carrier = o.RB[0] || qb;
    if (!carrier) { carrier = o.WR[0]; }
    const blockD = ((o.r.rbk - d.r.runD) / 12.5) + (form[S.off] - form[1 - S.off]) * 0.18 + (o.ocB - d.dcB) * 0.25;
    const carQ = carrier ? (eff(carrier, 'vis') * 0.3 + eff(carrier, 'btk') * 0.25 + eff(carrier, 'elu') * 0.2 + eff(carrier, 'spd') * 0.25 - 76) / 10 : -1;
    let y;
    if (sneak && carrier === qb) {
      const pr = rules.tushPush ? 0.86 : 0.7;
      y = chance(pr + blockD * 0.02) ? Math.max(S.dist, Math.round(rnd() * 2)) : 0;
    } else {
      const stuff = clamp(0.175 - 0.028 * blockD - 0.012 * carQ, 0.06, 0.35);
      if (chance(stuff)) y = -Math.round(rnd() * 3);
      else {
        const mean = 4.88 + 0.42 * blockD + 0.32 * carQ + (scoringAdj - 1) * 3;
        y = Math.max(0, Math.round(Math.exp(gauss(Math.log(Math.max(1.5, mean - 0.6)), 0.62))));
        if (chance(clamp(0.028 + 0.008 * carQ + 0.006 * blockD, 0.008, 0.07))) y += Math.round(10 + rnd() * 45);
      }
    }
    // fumble
    const fumP = 0.0085 * Math.exp(-((carrier ? eff(carrier, 'car') : 60) - 75) / 14) * (sl.turnovers ?? 1);
    const pen = penaltyCheck();
    const time = hurry() ? 21 + rnd() * 6 : milk() ? 41 + rnd() * 3 : 36 + rnd() * 7;
    if (pen && pen.name !== 'Defensive pass interference') return applyPenalty(pen, time * 0.3, true);
    const gain = Math.min(y, 100 - S.yl);
    inc(box, carrier, 'car'); inc(box, carrier, 'ryd', gain);
    const l = box.pl[carrier.pid]; if (l) l.rLng = Math.max(l.rLng || 0, gain);
    tb(S.off).ryd += gain;
    const blockers = [...o.OT, ...o.OG, ...o.C];
    for (const b of blockers) { inc(box, b, 'rbSn'); if (gain >= 4) inc(box, b, 'rbGood'); }
    if (gain < 2 || chance(0.5)) {
      const tk = wpick([...d.DT.slice(0, 2), ...d.EDGE.slice(0, 2), ...d.LB.slice(0, 2), ...d.S, ...d.CB.slice(0, 2)],
        [...d.DT.slice(0, 2).map(() => 1.0), ...d.EDGE.slice(0, 2).map(() => 0.9), ...d.LB.slice(0, 2).map(() => 2.2), ...d.S.map(() => 0.8), ...d.CB.slice(0, 2).map(() => 0.5)]);
      credTackle(tk, gain <= 0);
    } else credTackle(wpick([...d.LB.slice(0, 2), ...d.S, ...d.CB.slice(0, 3)], [2, 2, 1.4, 1.4, 0.9, 0.9, 0.6]), false);
    if (gain >= 10) missedTackle(d);
    if (S.yl + gain < 100 && S.yl + gain > 0 && chance(fumP)) {
      inc(box, carrier, 'fum');
      if (chance(0.52)) {
        const ff = pick([...d.LB.slice(0, 2), ...d.S, ...d.EDGE.slice(0, 2)]); inc(box, ff, 'ff'); inc(box, ff, 'fr');
        inc(box, carrier, 'fumL'); tb(S.off).fum++;
        useClock(time * 0.5);
        turnover(100 - (S.yl + gain), `${nm(carrier)} fumbles, recovered by ${d.t.abbr}`);
        checkQuarter();
        return;
      }
    }
    advance(gain, time, carrier, 'run');
  }

  function credTackle(p, tfl) {
    if (!p) return;
    if (chance(0.3)) { inc(box, p, 'ast'); } else inc(box, p, 'tkl');
    if (tfl) inc(box, p, 'tfl');
  }
  function missedTackle(d) { const p = pick([...d.LB.slice(0, 2), ...d.S, ...d.CB.slice(0, 2)]); if (p && chance(0.45)) inc(box, p, 'mtk'); }

  function passPlay() {
    const o = O(), d = D();
    const qb = o.QB[0];
    if (!qb) return runPlay();
    tb(S.off).plays++;
    S.plays++;
    const fm = (form[S.off] - form[1 - S.off]) * 0.2 + (o.ocB - d.dcB) * 0.3;
    const prDiff = (d.r.rush - o.r.pbk) / 12.5 - fm * 0.3;
    const pressureP = clamp(0.3 + 0.055 * prDiff, 0.12, 0.55);
    const pressured = chance(pressureP);
    const ol = [...o.OT, ...o.OG, ...o.C];
    for (const b of ol) inc(box, b, 'pbSn');
    let rusher = null;
    if (pressured) {
      const rushers = [...d.EDGE.slice(0, 2), ...d.DT.slice(0, 2), ...d.LB.slice(0, 1)];
      rusher = wpick(rushers, rushers.map((p) => Math.pow(Math.max(20, eff(p, 'prs')) / 70, 1.6) * (d.EDGE.includes(p) ? 1.45 : d.DT.includes(p) ? 0.95 : 0.4)));
      inc(box, rusher, 'prss');
      const beaten = wpick(ol, ol.map((p) => Math.pow(Math.max(5, 105 - eff(p, 'pbk')) / 30, 2)));
      inc(box, beaten, 'prA');
      const sackP = clamp(0.205 + 0.03 * prDiff - (o.r.qbPoc - 75) / 330 - (o.r.qbMob - 72) / 500, 0.08, 0.38);
      if (chance(sackP)) {
        const yds = Math.round(clamp(gauss(7, 2.5), 1, 15));
        inc(box, qb, 'sk'); inc(box, qb, 'skyd', yds); inc(box, rusher, 'sck'); inc(box, beaten, 'skA');
        tb(S.off).sk++; tb(S.off).skYd += yds;
        if (chance(0.11 * (sl.turnovers ?? 1))) {
          inc(box, qb, 'fum'); inc(box, rusher, 'ff');
          if (chance(0.5)) { inc(box, qb, 'fumL'); tb(S.off).fum++; const nyl = S.yl - yds; if (nyl <= 0) { safety(); return; } turnover(100 - nyl, `${nm(qb)} strip-sacked by ${nm(rusher)}, ${d.t.abbr} recover`); return; }
        }
        advance(-yds, hurry() ? 18 : 30 + rnd() * 6, qb, 'sack');
        return;
      }
      // scramble
      if (chance(clamp(0.1 + (o.r.qbMob - 72) / 160, 0.03, 0.32))) {
        let y = Math.max(0, Math.round(Math.exp(gauss(Math.log(5), 0.6)) + (o.r.qbMob - 75) / 6));
        if (chance(0.03)) y += Math.round(10 + rnd() * 30);
        y = Math.min(y, 100 - S.yl);
        inc(box, qb, 'car'); inc(box, qb, 'ryd', y); tb(S.off).ryd += y; tb(S.off).car++;
        credTackle(pick([...d.LB.slice(0, 2), ...d.S]), false);
        advance(y, hurry() ? 16 : 30, qb, 'run');
        return;
      }
      if (chance(0.07)) { // throwaway
        inc(box, qb, 'att'); tb(S.off).att++;
        advance(0, 6, null, 'inc'); return;
      }
    }
    // target selection
    const tgts = [], w = [];
    const role = [[o.WR[0], 0.205], [o.WR[1], 0.17], [o.WR[2], 0.13], [o.TE[0], 0.16], [o.RB[0], 0.12], [o.RB[1], 0.04], [o.WR[3], 0.045], [o.TE[1], 0.045]];
    for (const [p, sh] of role) { if (!p) continue; tgts.push(p); w.push(sh * Math.exp(clamp(((eff(p, 'rte') + eff(p, 'rel') + eff(p, 'cth')) / 3 - 74) / 30, -0.35, 0.4))); }
    const tg = wpick(tgts, w);
    // depth of target
    const isRB = o.RB.includes(tg);
    const deepLean = (o.r.qbDeep - 76) / 220 + (tg && eff(tg, 'spd') > 92 ? 0.04 : 0);
    let depth = isRB ? 'scr' : wpick(['scr', 'sh', 'md', 'dp'], [0.16, 0.47, 0.24 + deepLean / 2, 0.13 + deepLean]);
    if (S.dist >= 15 && depth === 'scr') depth = 'md';
    const airY = { scr: Math.round(gauss(-1.5, 1.5)), sh: Math.round(3 + rnd() * 5), md: Math.round(10 + rnd() * 7), dp: Math.round(20 + Math.abs(gauss(0, 8))) }[depth];
    // coverage defender
    let cov;
    if (tg === o.WR[0]) cov = d.CB[0]; else if (tg === o.WR[1]) cov = d.CB[1]; else if (tg === o.WR[2] || tg === o.WR[3]) cov = d.CB[2] || d.S[0];
    else if (o.TE.includes(tg)) cov = chance(0.55) ? d.S[0] || d.LB[0] : d.LB[0] || d.S[1]; else cov = d.LB[chance(0.6) ? 0 : 1] || d.S[1];
    if (!cov) cov = d.S[0] || d.CB[0];
    const sep = tg && cov ? ((eff(tg, 'rte') * 0.42 + eff(tg, 'rel') * 0.18 + eff(tg, 'spd') * (depth === 'dp' ? 0.4 : 0.25) + eff(tg, 'agi') * (depth === 'dp' ? 0 : 0.15))
      - (eff(cov, depth === 'dp' || o.WR.includes(tg) ? 'mcv' : 'zcv') * 0.62 + eff(cov, 'spd') * (depth === 'dp' ? 0.38 : 0.2) + eff(cov, 'awr') * (depth === 'dp' ? 0 : 0.18))) / 10 : 0;
    const base = { scr: 0.84, sh: 0.765, md: 0.605, dp: 0.4 }[depth];
    let cp = base + 0.028 * sep + 0.03 * (o.r.qbAcc - 76) / 10 + 0.018 * ((eff(tg, 'cth') - 75) / 10) - (pressured ? 0.17 : 0) + fm * 0.02
      - (d.r.cover - 74) / 10 * 0.012 + (scoringAdj - 1) * 0.15;
    cp = clamp(cp, 0.12, 0.93);
    inc(box, qb, 'att'); tb(S.off).att++;
    inc(box, tg, 'tgt'); inc(box, cov, 'tgtA');
    const time = hurry() ? 15 + rnd() * 6 : milk() ? 38 : 35 + rnd() * 7;
    const pen = penaltyCheck();
    if (pen && pen.name === 'Defensive pass interference') { inc(box, qb, 'att', -1); tb(S.off).att--; inc(box, tg, 'tgt', -1); return applyPenalty({ ...pen, yds: Math.max(pen.yds, airY) }, 6, true); }
    if (pen) { inc(box, qb, 'att', -1); tb(S.off).att--; inc(box, tg, 'tgt', -1); inc(box, cov, 'tgtA', -1); return applyPenalty(pen, 5, true); }
    if (chance(cp)) {
      // completion
      let yac;
      const ye = eff(tg, 'elu') * 0.35 + eff(tg, 'spd') * 0.35 + eff(tg, 'btk') * 0.3;
      const tk = d.r.tackle;
      const yacMean = { scr: 5.2, sh: 3.6, md: 3.0, dp: 3.2 }[depth] + (ye - tk) / 10 * 0.55;
      yac = Math.max(0, Math.round(Math.exp(gauss(Math.log(Math.max(1, yacMean)), 0.72)) - 0.8));
      if (chance(clamp(0.016 + (ye - tk) / 1200, 0.005, 0.045))) yac += Math.round(10 + rnd() * 38);
      let yds = Math.max(-4, airY + yac);
      yds = Math.min(yds, 100 - S.yl);
      inc(box, qb, 'cmp'); inc(box, qb, 'pyd', yds); tb(S.off).cmp++; tb(S.off).pyd += yds;
      inc(box, tg, 'rec'); inc(box, tg, 'recyd', yds); inc(box, tg, 'yac', Math.max(0, yds - Math.max(0, airY)));
      const ll = box.pl[tg.pid]; if (ll) ll.recLng = Math.max(ll.recLng || 0, yds);
      const lq = box.pl[qb.pid]; if (lq) lq.pLng = Math.max(lq.pLng || 0, yds);
      inc(box, cov, 'cmpA'); inc(box, cov, 'ydsA', yds);
      const tkl = chance(0.65) ? cov : pick([...d.S, ...d.LB.slice(0, 2)]);
      credTackle(tkl, yds <= 0);
      if (yac >= 12) missedTackle(d);
      const oob = chance(0.22);
      if (S.yl + yds < 100 && S.yl + yds > 0 && chance(0.0055 * (sl.turnovers ?? 1))) {
        inc(box, tg, 'fum');
        if (chance(0.5)) {
          inc(box, tg, 'fumL'); tb(S.off).fum++; inc(box, tkl, 'ff');
          useClock(time * 0.5);
          turnover(100 - (S.yl + yds), `${nm(tg)} fumbles after the catch`);
          checkQuarter();
          return;
        }
      }
      advance(yds, oob ? (hurry() ? 7 : 22) : time, tg, 'pass', qb, cov);
    } else {
      const intP = ({ scr: 0.006, sh: 0.016, md: 0.032, dp: 0.058 }[depth]) * Math.exp(-(o.r.qbDec - 76) / 16) * Math.exp(((cov ? eff(cov, 'hwk') : 70) - 75) / 28) * (pressured ? 1.55 : 1) * (sl.turnovers ?? 1) * 0.95;
      if (chance(intP / (1 - cp))) {
        const picker = chance(0.55) ? cov : pick([...d.S, ...d.S, ...d.CB, ...d.LB.slice(0, 2)]);
        inc(box, qb, 'int'); inc(box, picker, 'dint'); tb(S.off).int++;
        const spot = clamp(S.yl + airY, 1, 99);
        let ret = Math.max(0, Math.round(gauss(9, 10)));
        if (chance(0.06)) { // pick six
          inc(box, picker, 'dtd'); inc(box, picker, 'intYd', 100 - spot);
          tb(S.off).to++;
          box.plays.push(txt(`${nm(picker)} intercepts ${nm(qb)} and returns it for a TD!`));
          if (S.ot) { S.otPoss[S.off]++; }
          S.off = 1 - S.off; S.yl = 100;
          touchdown(picker, `${nm(picker)} INT return TD`);
          useClock(time);
          return;
        }
        inc(box, picker, 'intYd', ret);
        useClock(time * 0.6);
        turnover(clamp(100 - spot + ret, 1, 99), `${nm(qb)} intercepted by ${nm(picker)}`);
        return;
      }
      const dropP = clamp(0.045 * Math.exp(-((eff(tg, 'cth')) - 75) / 14) / (1 - cp), 0, 0.3);
      if (chance(dropP)) inc(box, tg, 'drop');
      else if (cov && chance(0.42)) inc(box, cov, 'pd');
      advance(0, hurry() ? 6 : 8, null, 'inc');
    }
  }

  function applyPenalty(pen, time, replay) {
    useClock(time);
    if (pen.side === 'off') {
      S.yl = clamp(S.yl + pen.yds, 1, 99);
      S.dist = Math.min(S.dist - pen.yds, 30);
      if (S.dist <= 0) S.dist = 1;
      void replay;
    } else {
      const y = pen.yds > (100 - S.yl) / 2 ? Math.max(1, Math.floor((100 - S.yl) / 2)) : pen.yds;
      S.yl = clamp(S.yl + y, 1, 99);
      S.dist -= y;
      if (pen.auto1 || S.dist <= 0) { S.down = 1; S.dist = Math.min(10, 100 - S.yl); tb(S.off).fd++; }
    }
    checkQuarter();
  }

  function advance(y, time, ballCarrier, kind, qb = null, cov = null) {
    S.yl += y;
    useClock(time);
    if (S.yl >= 100) {
      if (kind === 'pass') { inc(box, qb, 'ptd'); inc(box, ballCarrier, 'rectd'); inc(box, cov, 'tdA'); }
      if (kind === 'run') inc(box, ballCarrier, 'rtd');
      const rz = tb(S.off); rz.rzTd += 0;
      touchdown(ballCarrier, kind === 'pass' ? `${nm(qb)} ${y}-yd TD pass to ${nm(ballCarrier)}` : `${nm(ballCarrier)} ${y}-yd TD run`);
      checkQuarter();
      return;
    }
    if (S.yl <= 0) { safety(); checkQuarter(); return; }
    if (y >= S.dist) {
      if (S.down === 3) tb(S.off).td3++;
      if (S.down === 4) tb(S.off).td4++;
      if (S.down === 3) tb(S.off).att3++;
      if (S.down === 4) tb(S.off).att4++;
      S.down = 1; S.dist = Math.min(10, 100 - S.yl); tb(S.off).fd++;
    } else {
      if (S.down === 3) tb(S.off).att3++;
      if (S.down === 4) {
        tb(S.off).att4++;
        turnover(100 - S.yl, `${U[S.off].t.abbr} turn it over on downs`);
        checkQuarter();
        return;
      }
      S.down++; S.dist -= y;
    }
    checkQuarter();
  }

  function checkQuarter() {
    if (S.over) return;
    if (S.clock > 0) return;
    if (S.ot) {
      // regular season OT ends at 10:00; playoffs continue
      if (!playoff) { S.over = true; return; }
      S.clock = 900; S.q++;
      return;
    }
    if (S.q === 2) {
      S.q = 3; S.clock = 900;
      const recv = 1 - S.half2Kick;
      kickoff(1 - recv);
      return;
    }
    if (S.q === 4) {
      if (S.score[0] !== S.score[1]) { S.over = true; return; }
      // overtime
      S.ot = true; S.q = 5; S.clock = (playoff ? rules.postOtMinutes : rules.regOtMinutes) * 60;
      S.otPoss = [0, 0];
      const recv = chance(0.5) ? 0 : 1;
      kickoff(1 - recv);
      return;
    }
    S.q++; S.clock = 900;
  }

  // ---- main loop
  let guard = 0;
  while (!S.over && guard++ < 400) {
    if (S.clock <= 0) { checkQuarter(); continue; }
    // timeouts late in halves by trailing defense
    const play = choosePlay();
    if (play === 'punt') { punt(); checkQuarter(); continue; }
    if (play === 'fg') { fieldGoal(); checkQuarter(); continue; }
    if (play === 'kneel') { const q = O().QB[0]; inc(box, q, 'car'); inc(box, q, 'ryd', -1); advance(-1, 42, q, 'kneel'); continue; }
    // trailing defense uses timeout to stop clock late
    const defTeam = 1 - S.off;
    if (S.q >= 4 && S.clock < 150 && S.to[defTeam] > 0 && S.score[defTeam] < S.score[S.off] && S.score[S.off] - S.score[defTeam] <= 16) {
      S.to[defTeam]--; S.clock = Math.min(S.clock + 33, 900);
    }
    if (play === 'run' || play === 'go' && S.dist <= 2 && chance(0.6)) runPlay(); else passPlay();
    // in-game injuries (per snap risk for players on the field)
    injuryCheck();
  }
  if (S.ot && !S.over) S.over = true;

  function injuryCheck() {
    const rate = 0.00052 * (sl.injuryRate ?? 1) * (rules.hipDropBan ? 0.97 : 1);
    for (const ui of [0, 1]) {
      const u = U[ui];
      const onField = ui === S.off ? [...u.QB.slice(0, 1), ...u.RB.slice(0, 1), ...u.WR.slice(0, 3), ...u.TE.slice(0, 1), ...u.OT, ...u.OG, ...u.C]
        : [...u.EDGE.slice(0, 2), ...u.DT.slice(0, 2), ...u.LB.slice(0, 2), ...u.CB.slice(0, 3), ...u.S];
      for (const p of onField) {
        if (!p) continue;
        inc(box, p, ui === S.off ? 'offSn' : 'defSn');
        const pm = { RB: 1.35, WR: 1.0, TE: 1.1, QB: 0.75, OT: 0.9, OG: 0.9, C: 0.85, EDGE: 1.05, DT: 0.95, LB: 1.1, CB: 1.05, S: 1.0 }[p.pos] || 1;
        const dur = (110 - (p.r.a.inj ?? 80)) / 30;
        if (rnd() < rate * pm * dur) {
          const it = injuryTypeFor(p.pos, sl.injurySeverity ?? 1);
          box.inj.push({ pid: p.pid, tid: u.tid, ...it });
          // replace on the field for the rest of the game
          for (const k of ['QB', 'RB', 'WR', 'TE', 'OT', 'OG', 'C', 'EDGE', 'DT', 'LB', 'CB', 'S']) {
            const i = u[k].indexOf(p);
            if (i >= 0) {
              const bench = Object.values(G.L.players).find((x) => x.tid === u.tid && x.status === 'ACT' && x.pos === k && !u.all.includes(x) && !(x.inj && x.inj.wk > 0));
              if (bench) { bench._off = p._off - (p.r.tal - p.r.ovr) + (bench.r.tal - bench.r.ovr); u[k][i] = bench; u.all.push(bench); inc(box, bench, 'gp'); }
              else u[k].splice(i, 1);
            }
          }
          rateUnit(u);
          box.plays.push(txt(`Injury: ${nm(p)} (${it.type})`));
        }
      }
    }
  }

  box.final = [S.score[0], S.score[1]];
  box.ot = S.ot;
  box.plays = box.plays.slice(-40);
  return box;
}
