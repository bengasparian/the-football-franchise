// Ratings: attributes, position overall formulas, hidden true talent, performance-driven
// in-season changes, offseason progression/regression and league-wide distribution control.
import { DEV_GROWTH, DEV_AGING, devChanges, longevityYearly } from './dev.js';
import { G, rnd, gauss, clamp, interp, age, allPlayers, round } from './core.js';
import { STARTERS } from './const.js';

export const ATTRS = ['spd', 'acc', 'agi', 'str', 'jmp', 'sta', 'inj', 'awr', 'thp', 'tas', 'tad', 'dec', 'poc', 'car', 'elu', 'btk', 'vis',
  'cth', 'rte', 'rel', 'cit', 'rbk', 'pbk', 'prs', 'bsh', 'tak', 'pur', 'mcv', 'zcv', 'hwk', 'kpw', 'kac'];
export const ATTR_NAMES = {
  spd: 'Speed', acc: 'Acceleration', agi: 'Agility', str: 'Strength', jmp: 'Jumping', sta: 'Stamina', inj: 'Durability', awr: 'Awareness / IQ',
  thp: 'Arm Strength', tas: 'Short Accuracy', tad: 'Deep Accuracy', dec: 'Decision Making', poc: 'Pocket Presence',
  car: 'Ball Security', elu: 'Elusiveness', btk: 'Break Tackle', vis: 'Vision',
  cth: 'Hands', rte: 'Route Running', rel: 'Release', cit: 'Contested Catch',
  rbk: 'Run Blocking', pbk: 'Pass Blocking', prs: 'Pass Rush', bsh: 'Run Defense / Shed', tak: 'Tackling', pur: 'Pursuit',
  mcv: 'Man Coverage', zcv: 'Zone Coverage', hwk: 'Ball Skills', kpw: 'Kick Power', kac: 'Kick Accuracy',
};
export const OVR_W = {
  QB: { tas: .21, tad: .14, dec: .18, poc: .13, thp: .11, awr: .13, spd: .05, agi: .05 },
  RB: { vis: .15, elu: .14, btk: .12, spd: .14, acc: .10, agi: .08, car: .08, cth: .07, pbk: .04, awr: .05, str: .03 },
  FB: { rbk: .30, str: .15, pbk: .12, cth: .10, btk: .10, awr: .13, spd: .05, car: .05 },
  WR: { rte: .22, rel: .12, cth: .17, cit: .09, spd: .15, acc: .08, agi: .07, awr: .06, jmp: .04 },
  TE: { cth: .16, rte: .14, rbk: .16, pbk: .08, cit: .10, spd: .09, str: .09, rel: .06, awr: .08, agi: .04 },
  OT: { pbk: .34, rbk: .24, str: .16, agi: .08, awr: .12, acc: .06 },
  OG: { rbk: .32, pbk: .26, str: .20, awr: .12, agi: .05, acc: .05 },
  C: { rbk: .28, pbk: .26, str: .16, awr: .20, agi: .05, acc: .05 },
  EDGE: { prs: .30, bsh: .14, spd: .12, acc: .10, str: .10, pur: .08, tak: .08, awr: .08 },
  DT: { bsh: .26, prs: .22, str: .20, tak: .08, pur: .08, awr: .10, acc: .06 },
  LB: { tak: .17, pur: .15, zcv: .14, bsh: .12, awr: .16, spd: .10, prs: .05, mcv: .04, acc: .07 },
  CB: { mcv: .24, zcv: .20, spd: .16, acc: .08, agi: .08, hwk: .10, awr: .08, tak: .04, jmp: .02 },
  S: { zcv: .22, mcv: .10, tak: .14, pur: .10, awr: .14, spd: .12, hwk: .10, acc: .04, bsh: .04 },
  K: { kpw: .45, kac: .55 },
  P: { kpw: .55, kac: .45 },
  LS: { kac: .7, awr: .3 },
};
const PHYS = ['spd', 'acc', 'agi', 'str', 'jmp'];
// Typical physical profile per position for an average starter
const PHYS_BASE = {
  QB: { spd: 74, acc: 78, agi: 74, str: 62, jmp: 70 }, RB: { spd: 90, acc: 91, agi: 88, str: 72, jmp: 84 },
  FB: { spd: 74, acc: 78, agi: 70, str: 82, jmp: 68 }, WR: { spd: 91, acc: 90, agi: 89, str: 58, jmp: 86 },
  TE: { spd: 82, acc: 83, agi: 78, str: 74, jmp: 78 }, OT: { spd: 60, acc: 70, agi: 66, str: 88, jmp: 60 },
  OG: { spd: 56, acc: 68, agi: 62, str: 91, jmp: 55 }, C: { spd: 57, acc: 68, agi: 64, str: 88, jmp: 55 },
  EDGE: { spd: 84, acc: 87, agi: 78, str: 82, jmp: 78 }, DT: { spd: 70, acc: 80, agi: 70, str: 92, jmp: 66 },
  LB: { spd: 85, acc: 86, agi: 80, str: 76, jmp: 80 }, CB: { spd: 92, acc: 91, agi: 90, str: 56, jmp: 88 },
  S: { spd: 89, acc: 89, agi: 86, str: 64, jmp: 86 }, K: { spd: 55, acc: 58, agi: 55, str: 45, jmp: 55 },
  P: { spd: 55, acc: 58, agi: 55, str: 48, jmp: 55 }, LS: { spd: 55, acc: 60, agi: 55, str: 74, jmp: 50 },
};
// Map real stat hints (z-scores from the data builder) to attributes
const HINT_MAP = {
  QB: { cpoe: ['tas'], ontgt: ['tas'], int: ['dec'], epa: ['dec', 'awr'], sack: ['poc'], deep: ['tad', 'thp'], ypa: ['tad'], mob: ['spd', 'agi'] },
  RB: { ypc: ['vis'], epa: ['vis'], brk: ['btk', 'elu'], yaco: ['btk'], rec: ['cth'], fum: ['car'], ypg: ['vis', 'spd'] },
  FB: { rec: ['cth'] },
  WR: { drop: ['cth'], ypt: ['rte'], share: ['rte', 'rel'], epa: ['rte'], adot: ['spd'], yac: ['elu'], td: ['cit'] },
  TE: { drop: ['cth'], ypt: ['rte'], share: ['rte', 'rel'], epa: ['rte'], yac: ['elu'], td: ['cit'] },
  EDGE: { prss: ['prs'], sk: ['prs'], tfl: ['bsh'], tkl: ['tak', 'pur'], mtkl: ['tak'], ff: ['str'] },
  DT: { prss: ['prs'], sk: ['prs'], tfl: ['bsh'], tkl: ['bsh', 'tak'], mtkl: ['tak'] },
  LB: { tkl: ['tak', 'pur'], tfl: ['bsh'], prss: ['prs'], rat: ['zcv', 'mcv'], ypt: ['zcv'], mtkl: ['tak'], pd: ['hwk'], int: ['hwk'] },
  CB: { rat: ['mcv', 'zcv'], ypt: ['mcv'], pd: ['hwk'], int: ['hwk'], mtkl: ['tak'], tkl: ['tak'] },
  S: { rat: ['zcv'], ypt: ['zcv'], tkl: ['tak', 'pur'], int: ['hwk'], pd: ['hwk'], mtkl: ['tak'] },
  K: { fgoe: ['kac'], long: ['kpw'] },
  P: { net: ['kac', 'kpw'], gross: ['kpw'], in20: ['kac'] },
};

export function computeOvr(pos, a) {
  const w = OVR_W[pos];
  let s = 0;
  for (const k in w) s += w[k] * (a[k] ?? 50);
  // Display overall is stretched so starters land ~70-90 (Madden-like scale but our own model)
  return clamp(Math.round(s), 25, 99);
}

function fromCombine(c, wt) {
  const out = {};
  if (c.forty) out.spd = interp([[4.22, 99], [4.3, 96], [4.4, 92], [4.5, 88], [4.6, 84], [4.7, 80], [4.85, 74], [5.0, 68], [5.2, 60], [5.4, 52], [5.6, 45]], c.forty);
  if (c.forty) out.acc = clamp(out.spd + (wt ? (wt - 230) / 25 : 0) + 2, 40, 99);
  if (c.cone || c.shuttle) {
    const a1 = c.cone ? interp([[6.5, 98], [6.8, 92], [7.0, 86], [7.3, 77], [7.6, 68], [7.9, 60], [8.2, 52]], c.cone) : null;
    const a2 = c.shuttle ? interp([[3.9, 98], [4.1, 91], [4.25, 85], [4.45, 76], [4.65, 67], [4.9, 57]], c.shuttle) : null;
    out.agi = a1 && a2 ? (a1 + a2) / 2 : (a1 || a2);
  }
  if (c.bench) out.str = interp([[8, 45], [14, 58], [20, 70], [25, 79], [30, 87], [35, 94], [40, 99]], c.bench);
  if (c.vertical) out.jmp = interp([[24, 55], [28, 66], [32, 76], [36, 86], [40, 94], [44, 99]], c.vertical);
  if (c.broad_jump && out.jmp) out.jmp = (out.jmp * 2 + interp([[96, 55], [108, 70], [118, 82], [126, 92], [134, 99]], c.broad_jump)) / 3;
  return out;
}

// Build a full attribute set for a player at a target overall
export function genAttrs(pos, ovr, opts = {}) {
  const { hints = {}, cmb = null, wt = null, ageY = 25, noise = 3 } = opts;
  const a = {};
  const lvl = ovr; // skill level center
  const pb = PHYS_BASE[pos] || PHYS_BASE.LB;
  const phys = cmb ? fromCombine(cmb, wt) : {};
  const athl = gauss(0, 1);
  for (const k of PHYS) {
    let v = phys[k];
    if (v == null) v = pb[k] + (ovr - 75) * 0.25 + athl * 3.5 + gauss(0, 2.5);
    // age decline of athleticism
    if (ageY > 28) v -= (ageY - 28) * (k === 'str' ? 0.3 : 0.9);
    a[k] = v;
  }
  a.sta = 70 + (ovr - 70) * 0.4 + gauss(0, 6) - Math.max(0, ageY - 31) * 2;
  a.inj = 82 + gauss(0, 8) - Math.max(0, ageY - 29) * 1.5;
  const w = OVR_W[pos];
  for (const k of ATTRS) {
    if (a[k] != null) continue;
    if (w[k] != null) a[k] = lvl + gauss(0, noise);
    else a[k] = offSkill(pos, k, ovr);
  }
  // apply real-stat hints to the relevant attributes
  const hm = HINT_MAP[pos] || {};
  for (const h in hints) {
    const targets = hm[h];
    if (!targets) continue;
    const zz = clamp(hints[h], -2.5, 2.5);
    for (const t of targets) a[t] += zz * 3.2 / targets.length;
  }
  if (pos === 'QB') a.awr += Math.min(6, Math.max(0, ageY - 24)) * 0.8;
  // solve so that the position formula hits the target overall (only adjust skill attrs, not measurables)
  const skillKeys = Object.keys(w).filter((k) => !PHYS.includes(k) || !phys[k]);
  for (let it = 0; it < 4; it++) {
    for (const k of ATTRS) a[k] = clamp(a[k], 15, 99);
    let s = 0;
    for (const k in w) s += w[k] * a[k];
    const diff = ovr - s;
    if (Math.abs(diff) < 0.3) break;
    let ws = 0;
    for (const k of skillKeys) ws += w[k];
    for (const k of skillKeys) a[k] += diff / Math.max(ws, 0.2);
  }
  for (const k of ATTRS) a[k] = clamp(Math.round(a[k]), 15, 99);
  return a;
}

function offSkill(pos, k, ovr) {
  // secondary skills for non-position attributes (reasonable, not 0)
  const sec = {
    QB: { car: 62, elu: 55, btk: 45, vis: 55, cth: 40, rte: 30, rel: 30, cit: 30, rbk: 25, pbk: 25, tak: 25, pur: 30 },
    RB: { rbk: 45, rte: 55, rel: 50, cit: 50, tak: 30, pur: 35, rel2: 40 }, WR: { car: 62, elu: 70, btk: 55, vis: 65, rbk: 45, pbk: 30, tak: 30 },
    TE: { car: 60, elu: 55, btk: 62, vis: 55, tak: 35 }, OT: { cth: 25, tak: 30, bsh: 40 }, OG: { cth: 25, tak: 30, bsh: 42 }, C: { cth: 25, tak: 30, bsh: 42 },
    EDGE: { mcv: 40, zcv: 50, hwk: 40, cth: 35 }, DT: { mcv: 25, zcv: 35, hwk: 30, cth: 30 }, LB: { hwk: 55, cth: 45 },
    CB: { cth: 55, elu: 60, vis: 50, bsh: 40, prs: 35, car: 50, rte: 40 }, S: { cth: 52, prs: 45, elu: 55, car: 50 },
    K: {}, P: {}, LS: { rbk: 45, pbk: 45 }, FB: { vis: 55, elu: 45, rte: 50 },
  };
  const v = sec[pos]?.[k];
  if (v != null) return v + (ovr - 70) * 0.2 + gauss(0, 5);
  if (k === 'kpw' || k === 'kac') return 30 + gauss(0, 6);
  if (k === 'awr') return ovr + gauss(0, 4);
  return 22 + gauss(0, 6);
}

// Hidden true talent: real players start near their displayed rating; young players carry more uncertainty
export function initTalent(p, ageY) {
  const exp = p.exp ?? 3;
  const sd = exp <= 0 ? 4.5 : exp <= 2 ? 3.2 : 1.8;
  p.r.tal = clamp(p.r.ovr + gauss(0, sd), 30, 99.5);
  // potential = projected peak talent
  p.r.pot = projectPeak(p.pos, p.r.tal, ageY, p.pers?.work ?? 0.5);
}

const PEAK_SHIFT = { QB: 3, K: 5, P: 5, LS: 5, RB: -2, CB: -1, WR: -0.5, OT: 1.5, OG: 1.5, C: 1.5, DT: 0.5, EDGE: 0, LB: -0.5, S: 0, TE: 0.5, FB: 0 };
export function ageDelta(pos, a) {
  const x = a - (PEAK_SHIFT[pos] || 0);
  return interp([[21, 5.0], [22, 4.4], [23, 3.4], [24, 2.4], [25, 1.5], [26, 0.8], [27, 0.3], [28, 0], [29, -0.6], [30, -1.3], [31, -2.1], [32, -2.9], [33, -3.8], [34, -4.7], [36, -6.0], [40, -8]], x);
}
export function projectPeak(pos, tal, a, work = 0.5, dev = 'Normal') {
  let t = tal;
  for (let y = a; y < 30; y++) { const d = ageDelta(pos, y); if (d <= 0) break; t += d * (0.7 + work * 0.6) + (y < 27 ? DEV_GROWTH[dev] || 0 : 0); }
  return clamp(t, tal, 99);
}

// Expected (curve) overall by rank, shared with the data builder: keeps league distribution realistic
const CURVE = [[0, 99], [0.03, 95], [0.08, 91], [0.2, 86], [0.4, 81], [0.7, 76], [1.0, 72], [1.5, 66], [2.2, 60], [3.2, 53], [5.0, 46], [9.0, 40]];
export const curveOvr = (x) => interp(CURVE, x);

// ---------- potential grade shown to users (scouted, not exact)
export function potLabel(p) {
  const a = age(p);
  if (a >= 29) return null;
  const est = (p.r.potEst ?? p.r.pot);
  if (est >= 90) return 'Elite';
  if (est >= 84) return 'High';
  if (est >= 76) return 'Solid';
  if (est >= 68) return 'Average';
  return 'Low';
}

// ---------- In-season performance: compute a season performance index from sim stats
export function perfIndex(p, st) {
  if (!st || !st.g) return null;
  const pos = p.pos;
  const snaps = (st.offSn || 0) + (st.defSn || 0);
  const sn = Math.max(1, snaps);
  let idx = null, vol = 0;
  switch (pos) {
    case 'QB': {
      const db = (st.att || 0) + (st.sk || 0);
      if (db < 40) return null;
      const anya = ((st.pyd || 0) + 20 * (st.ptd || 0) - 45 * (st.int || 0) - (st.skyd || 0)) / db;
      const rush = ((st.ryd || 0) + 20 * (st.rtd || 0)) / Math.max(1, db);
      idx = anya + rush * 0.6; vol = db; break;
    }
    case 'RB': case 'FB': {
      const t = (st.car || 0) + (st.tgt || 0);
      if (t < 25) return null;
      idx = ((st.ryd || 0) + (st.recyd || 0) + 25 * ((st.rtd || 0) + (st.rectd || 0)) - 30 * (st.fum || 0)) / t + Math.log1p(t / (st.g || 1)) * 0.8;
      vol = t; break;
    }
    case 'WR': case 'TE': {
      const t = st.tgt || 0;
      if (t < 15) return null;
      idx = ((st.recyd || 0) + 20 * (st.rectd || 0) - 8 * (st.drop || 0)) / t * 0.55 + ((st.recyd || 0) / st.g) / 12;
      vol = t; break;
    }
    case 'OT': case 'OG': case 'C': {
      const pb = st.pbSn || 0;
      if (pb < 120) return null;
      idx = -((st.prA || 0) + 3 * (st.skA || 0)) / pb * 100 + (st.rbGood || 0) / Math.max(1, st.rbSn || 1) * 10;
      vol = pb; break;
    }
    case 'EDGE': case 'DT': {
      if (sn < 120) return null;
      idx = ((st.prss || 0) + 2.2 * (st.sck || 0) + 1.2 * (st.tfl || 0) + 0.25 * ((st.tkl || 0) + (st.ast || 0) * 0.5) + 2 * (st.ff || 0)) / sn * 100;
      vol = sn; break;
    }
    case 'LB': {
      if (sn < 120) return null;
      const cov = (st.tgtA || 0) >= 8 ? -((st.ydsA || 0) / Math.max(1, st.tgtA)) * 0.6 : 0;
      idx = ((st.tkl || 0) + 0.5 * (st.ast || 0) + 1.5 * (st.tfl || 0) + 2.5 * (st.sck || 0) + 3 * (st.dint || 0) + 1.2 * (st.pd || 0) - 1.2 * (st.mtk || 0)) / sn * 100 + cov;
      vol = sn; break;
    }
    case 'CB': case 'S': {
      if (sn < 120) return null;
      const tg = st.tgtA || 0;
      const rat = tg >= 8 ? passerRating(st.cmpA || 0, tg, st.ydsA || 0, st.tdA || 0, st.dint || 0) : 90;
      idx = -(rat - 90) / 8 + ((st.pd || 0) * 1.0 + (st.dint || 0) * 2.5 + (st.tkl || 0) * (pos === 'S' ? 0.18 : 0.1) - (st.mtk || 0) * 0.3) / Math.max(1, st.g) * 1.5;
      vol = sn; break;
    }
    case 'K': {
      if ((st.fga || 0) + (st.xpa || 0) < 6) return null;
      idx = ((st.fgm || 0) - (st.fgExp || 0)) / Math.max(1, st.fga || 1) * 10 + ((st.xpm || 0) - (st.xpa || 0)) * 0.3;
      vol = st.fga || 1; break;
    }
    case 'P': {
      if ((st.pnt || 0) < 8) return null;
      idx = ((st.pntNet || 0) / st.pnt) + (st.pntIn20 || 0) / st.pnt * 5;
      vol = st.pnt; break;
    }
    default: return null;
  }
  return { idx, vol };
}
export function passerRating(cmp, att, yds, td, int) {
  if (!att) return 0;
  const a = clamp((cmp / att - 0.3) * 5, 0, 2.375), b = clamp((yds / att - 3) * 0.25, 0, 2.375);
  const c = clamp((td / att) * 20, 0, 2.375), d = clamp(2.375 - (int / att) * 25, 0, 2.375);
  return ((a + b + c + d) / 6) * 100;
}

// Performance-implied overall for the season so far: rank players at each position by their (sample-size
// regressed) production and hand out that position's ratings in the same order. Quantile matching = no inflation.
export function seasonPerf(s) {
  const Lg = G.L;
  const byPos = {};
  for (const p of Object.values(Lg.players)) {
    if (p.tid < -1) continue;
    const st = p.stats?.[s]?.SIM;
    const pi = perfIndex(p, st);
    if (!pi) continue;
    (byPos[p.pos] ||= []).push({ p, ...pi, g: st.g });
  }
  const out = {};
  for (const pos in byPos) {
    const grp = byPos[pos];
    if (grp.length < 6) continue;
    const mean = grp.reduce((a, x) => a + x.idx, 0) / grp.length;
    const volRef = { QB: 250, RB: 120, WR: 70, TE: 50, OT: 300, OG: 300, C: 300 }[pos] || 250;
    for (const x of grp) x.adj = mean + (x.idx - mean) * (x.vol / (x.vol + volRef * 0.5));
    const startOvrs = grp.map((x) => x.p.r.ovrStart ?? x.p.r.ovr).sort((a, b) => b - a);
    grp.sort((a, b) => b.adj - a.adj);
    // one season of production is a noisy measure of ability: only about half of the gap is treated as real
    grp.forEach((x, i) => { const base = x.p.r.ovrStart ?? x.p.r.ovr; out[x.p.pid] = { perfOvr: Math.round(base + (startOvrs[i] - base) * 0.55), raw: startOvrs[i], g: x.g }; });
  }
  return out;
}

// Weekly: a rating only drifts after a sustained trend (3+ games), a point at a time, and never far from where the
// player started the year. One big game or one dud changes nothing.
export function updateInSeasonRatings() {
  const Lg = G.L;
  const swing = Lg.settings.sliders.inSeasonRatingSwing ?? 1;
  const perf = seasonPerf(Lg.meta.season);
  for (const pid in perf) {
    const { perfOvr, g } = perf[pid];
    if (g < 4) continue;
    const p = Lg.players[pid];
    const base = p.r.ovrStart ?? p.r.ovr;
    const w = Math.min(0.35, g / (g + 14)) * swing;
    const target = clamp(base + w * (perfOvr - base), base - 5, base + 5);
    const gap = target - p.r.ovr;
    if (Math.abs(gap) < 2.5) continue;
    // at most one point per week, and only every other week for a given player
    if (p.r.lastMoveW != null && Lg.meta.week - p.r.lastMoveW < 2 && p.r.lastMoveS === Lg.meta.season) continue;
    setOvr(p, clamp(p.r.ovr + Math.sign(gap), 25, 99));
    p.r.lastMoveW = Lg.meta.week; p.r.lastMoveS = Lg.meta.season;
  }
}

// change displayed overall and shift attributes proportionally so they stay consistent
export function setOvr(p, newOvr, recordHist = true) {
  const old = p.r.ovr;
  const d = newOvr - old;
  if (!d) return;
  const w = OVR_W[p.pos];
  let ws = 0;
  for (const k in w) if (!PHYS.includes(k)) ws += w[k];
  const physW = 1 - ws;
  for (const k in w) {
    if (PHYS.includes(k)) continue;
    p.r.a[k] = clamp(Math.round(p.r.a[k] + (d / Math.max(ws, 0.3))), 15, 99);
  }
  p.r.ovr = newOvr;
  // small rounding fix
  const c = computeOvr(p.pos, p.r.a);
  if (c !== newOvr) {
    const k = Object.keys(w).filter((k) => !PHYS.includes(k)).sort((a, b) => w[b] - w[a])[0];
    if (k) p.r.a[k] = clamp(p.r.a[k] + Math.round((newOvr - c) / w[k]), 15, 99);
  }
  if (recordHist) {
    const Lg = G.L;
    const h = (p.r.hist ||= []);
    const key = `${Lg.meta.season}-${Lg.meta.week}`;
    if (h.length && h[h.length - 1].k === key) h[h.length - 1].o = newOvr;
    else h.push({ k: key, s: Lg.meta.season, w: Lg.meta.week, o: newOvr });
    if (h.length > 120) h.splice(0, h.length - 120);
  }
  void physW;
}

// ---------- Offseason progression / regression
// New overall = this year's level + age curve (scaled by dev trait, work ethic, longevity) + what the season showed
// + a little luck (breakouts and fall-offs). A 33-year-old with 13 sacks barely moves; a 24-year-old who balled out jumps.
export function offseasonProgression() {
  const Lg = G.L;
  const sl = Lg.settings.sliders;
  const s0 = Lg.meta.season, s = s0 + 1;
  if (!Lg.refDist) captureRefDist();
  const perf = seasonPerf(s0);
  const players = Object.values(Lg.players).filter((p) => p.tid >= -1);
  const entries = [];
  for (const p of players) {
    const a = age(p, s);
    const work = p.pers?.work ?? 0.5;
    const dev = p.dev || 'Normal';
    const g = p.stats?.[s0]?.SIM?.g ?? p.stats?.[s0]?.REG?.g ?? 0;
    longevityYearly(p, a, g);
    let d = ageDelta(p.pos, a);
    if (d > 0) {
      d = d * 0.85 * sl.progression * (0.7 + work * 0.6) + (a < 27 ? DEV_GROWTH[dev] * sl.progression : 0);
      // room to grow: the further below his ceiling, the faster a young player climbs
      if (a < 27 && p.r.pot > p.r.ovr) d += (p.r.pot - p.r.ovr) * 0.05;
    } else {
      const lonF = 1.3 - (p.lon ?? 60) / 100 * 0.6;
      d = d * sl.regression * DEV_AGING[dev] * (1.15 - work * 0.3) * lonF;
    }
    const coach = Lg.teams[p.tid]?.staff;
    if (coach && a < 28) d += (coach.devBonus ?? 0) * 0.5;
    const pf = perf[p.pid];
    const base = p.r.ovrStart ?? p.r.ovr;
    let perfGap = 0;
    if (pf && pf.g >= 6) {
      perfGap = pf.perfOvr - base;
      // most of the in-season movement already happened; the offseason finishes part of the job
      d += clamp((pf.perfOvr - p.r.ovr) * 0.25 * Math.min(1, pf.g / 14), -3, 3);
    } else if (g <= 2 && a >= 29) d -= 0.8; // didn't play: rust and doubt
    const sd = (a <= 24 ? 2.0 : a <= 29 ? 1.3 : 1.2) * sl.breakoutChance;
    let shock = gauss(0, sd);
    if (shock < 0 && perfGap > 0) shock *= 0.5; // played well: less likely to slip
    if (rnd() < 0.03 * sl.breakoutChance && a <= 27) shock += 3 + rnd() * 5; // breakout
    if (rnd() < 0.025 * sl.breakoutChance && a >= 28) shock -= 3 + rnd() * 5 * (1.2 - (p.lon ?? 60) / 100); // fall-off
    const newOvr = clamp(Math.round(p.r.ovr + d + shock), 25, 99);
    entries.push({ p, newOvr, perfGap, g, a });
    // physical decline
    if (a >= 29) for (const k of ['spd', 'acc', 'agi']) p.r.a[k] = clamp(p.r.a[k] - Math.round(rnd() * 1.5 + (a - 29) * 0.35 * DEV_AGING[dev]), 15, 99);
    if (a <= 24) p.r.a.str = clamp(p.r.a.str + Math.round(rnd() * 2), 15, 99);
  }
  // keep the league's rating distribution steady (no creeping inflation or deflation), position by position
  normalizeOvrs(entries);
  for (const e of entries) {
    const p = e.p;
    const hidden = (p.r.tal ?? p.r.ovr) - p.r.ovr;
    setOvr(p, e.newOvr);
    p.r.tal = clamp(e.newOvr + hidden * 0.5 + gauss(0, 0.8), 25, 99.5);
    p.r.ovrStart = p.r.ovr;
    p.r.pot = Math.max(p.r.ovr, projectPeak(p.pos, p.r.ovr, age(p, s), p.pers?.work ?? 0.5, p.dev));
    p.r.potEst = clamp(p.r.pot + gauss(0, 2.5), 30, 99);
  }
  devChanges(entries);
}

function normalizeOvrs(entries) {
  const Lg = G.L;
  const ref = Lg.refDist;
  if (!ref) return;
  const b = 0.5 * (Lg.settings.sliders.ratingInflationControl ?? 1);
  const byPos = {};
  for (const e of entries) if (e.p.tid >= 0) (byPos[e.p.pos] ||= []).push(e);
  for (const pos in byPos) {
    const r = ref[pos];
    if (!r?.length) continue;
    const grp = byPos[pos].sort((x, y) => y.newOvr - x.newOvr);
    grp.forEach((e, i) => {
      const q = i / Math.max(1, grp.length - 1);
      const target = r[Math.min(r.length - 1, Math.round(q * (r.length - 1)))];
      // only correct drift beyond 2 points, so individual stories survive
      const gap = target - e.newOvr;
      if (Math.abs(gap) > 1) e.newOvr = clamp(Math.round(e.newOvr + (gap - Math.sign(gap)) * b), 25, 99);
    });
  }
}
export function captureRefDist() {
  const Lg = G.L;
  const byPos = {};
  for (const p of Object.values(Lg.players)) if (p.tid >= 0) (byPos[p.pos] ||= []).push(p.r.ovr);
  Lg.refDist = {};
  for (const pos in byPos) Lg.refDist[pos] = byPos[pos].sort((a, b) => b - a);
}

// Keep every position's talent distribution matched to the realistic reference curve (no inflation)
export function normalizeTalent() {
  const Lg = G.L;
  const b = 0.6 * (Lg.settings.sliders.ratingInflationControl ?? 1);
  const byPos = {};
  for (const p of Object.values(Lg.players)) {
    if (p.tid < -1) continue;
    (byPos[p.pos] ||= []).push(p);
  }
  for (const pos in byPos) {
    const grp = byPos[pos].sort((x, y) => y.r.tal - x.r.tal);
    const n = 32 * (STARTERS[pos] || 1) * (pos === 'CB' ? 0.87 : pos === 'LB' ? 1.1 : pos === 'RB' ? 1.2 : pos === 'TE' ? 1.4 : 1);
    grp.forEach((p, i) => {
      const ref = curveOvr((i + 0.5) / n);
      p.r.tal = clamp((1 - b) * p.r.tal + b * ref, 25, 99.5);
    });
  }
}

// Team overall, Madden-style: raw starter averages only differ by a few points across the league, so they're spread
// around a fixed reference (the league average when the save was created). Good teams read high-80s, bad teams around 70,
// and the number still moves as rosters get better or worse over the years.
const TEAM_UP = 3.6, TEAM_DOWN = 2.1, TEAM_MID = 80; // the elite separate more than the bad sink, like Madden
// league reference = average team with everyone healthy. Set when the save is created and eased toward the new
// league each year, so a team's number reflects how it compares while league-wide gains still show a little.
export function refreshTeamRef(blend = 1) {
  const Lg = G.L;
  const all = Lg.teams.map((t) => teamOvrRaw(t.tid, true));
  const m = (k) => all.reduce((a, x) => a + x[k], 0) / all.length;
  const old = Lg.meta.teamRef;
  const nw = { ovr: m('ovr'), off: m('off'), def: m('def') };
  Lg.meta.teamRef = old && blend < 1 ? { ovr: old.ovr + (nw.ovr - old.ovr) * blend, off: old.off + (nw.off - old.off) * blend, def: old.def + (nw.def - old.def) * blend } : nw;
}
export function teamOvr(tid) {
  const Lg = G.L;
  const r = teamOvrRaw(tid);
  if (!Lg.meta.teamRef) refreshTeamRef(1);
  const R = Lg.meta.teamRef;
  const sp = (v, ref) => {
    let x = TEAM_MID + (v - ref) * (v >= ref ? TEAM_UP : TEAM_DOWN);
    if (x > 90) x = 90 + (x - 90) * 0.45; // only a juggernaut gets into the mid-90s
    return clamp(Math.round(x), 40, 99);
  };
  return { ovr: sp(r.ovr, R.ovr), off: sp(r.off, R.off), def: sp(r.def, R.def), st: Math.round(r.st), qb: Math.round(r.qb), raw: Math.round(r.ovr * 10) / 10 };
}
function teamOvrRaw(tid, healthy = false) {
  const Lg = G.L;
  const t = Lg.teams[tid];
  const dc = t.depth;
  const byPos = healthy ? {} : null;
  if (healthy) for (const p of Object.values(Lg.players)) if (p.tid === tid && p.status !== 'PS') (byPos[p.pos] ||= []).push(p);
  const get = healthy ? (pos, n) => (byPos[pos] || []).sort((a, b) => b.r.ovr - a.r.ovr).slice(0, n)
    : (pos, n) => (dc[pos] || []).slice(0, n).map((pid) => Lg.players[pid]).filter(Boolean);
  const avgO = (arr) => (arr.length ? arr.reduce((a, p) => a + p.r.ovr, 0) / arr.length : 50);
  const qb = avgO(get('QB', 1));
  const off = qb * 0.3 + avgO(get('RB', 1)) * 0.07 + avgO(get('WR', 3)) * 0.2 + avgO(get('TE', 1)) * 0.08 +
    avgO([...get('OT', 2), ...get('OG', 2), ...get('C', 1)]) * 0.35;
  const def = avgO(get('EDGE', 2)) * 0.25 + avgO(get('DT', 2)) * 0.18 + avgO(get('LB', 2)) * 0.15 + avgO(get('CB', 3)) * 0.25 + avgO(get('S', 2)) * 0.17;
  const st = avgO([...get('K', 1), ...get('P', 1)]);
  return { ovr: off * 0.5 + def * 0.43 + st * 0.07, off, def, st, qb };
}
export { PHYS };
void allPlayers;
