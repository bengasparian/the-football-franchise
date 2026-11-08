// Season awards, All-Pro, Pro Bowl, retirements and Hall of Fame.
import { G, rnd, clamp, age, news, sigmoid } from './core.js';
import { perfIndex } from './ratings.js';

export function av(p, st) {
  if (!st) return 0;
  const g = (k) => st[k] || 0;
  switch (p.pos) {
    case 'QB': return g('pyd') * 0.04 + g('ptd') * 4 - g('int') * 4.5 + g('ryd') * 0.06 + g('rtd') * 5 - g('skyd') * 0.03 - g('fumL') * 3;
    case 'RB': case 'FB': return (g('ryd') + g('recyd')) * 0.06 + (g('rtd') + g('rectd')) * 5 - g('fumL') * 3;
    case 'WR': case 'TE': return g('recyd') * 0.065 + g('rectd') * 5 + g('rec') * 0.3 - g('fumL') * 3;
    case 'K': return g('fgm') * 1.0 + g('fgm50') * 1.5 - (g('fga') - g('fgm')) * 2 + g('xpm') * 0.15;
    case 'P': return (g('pntNet') / Math.max(1, g('pnt')) - 38) * 2 + g('pntIn20') * 0.4;
    case 'OT': case 'OG': case 'C': { const pi = perfIndex(p, st); return pi ? 20 + pi.idx * 1.2 + (p.r.ovr - 70) * 0.8 : (p.r.ovr - 60) * 0.6; }
    default: return g('sck') * 6 + g('dint') * 7 + g('pd') * 1.8 + g('ff') * 4 + g('tfl') * 1.5 + g('tkl') * 0.55 + g('ast') * 0.25 + g('dtd') * 8 + g('prss') * 0.7;
  }
}
const isDef = (pos) => ['EDGE', 'DT', 'LB', 'CB', 'S'].includes(pos);
const isOffSkill = (pos) => ['QB', 'RB', 'WR', 'TE', 'FB'].includes(pos);

export function seasonAwards(st) {
  const Lg = G.L;
  const s = Lg.meta.season;
  const ps = Object.values(Lg.players).filter((p) => p.stats?.[s]?.REG && p.tid >= 0);
  const wp = (tid) => st[tid] ? st[tid].pct : 0.4;
  const scored = ps.map((p) => ({ p, v: av(p, p.stats[s].REG), team: p.stats[s].tm ?? p.tid }));
  const top = (arr, f) => arr.map((x) => ({ ...x, sc: f(x) })).sort((a, b) => b.sc - a.sc);
  const isRookie = (p) => p.draft?.y === s || (p.exp === 0) || (p.udfa === s);
  const res = {};
  const mvp = top(scored.filter((x) => isOffSkill(x.p.pos) || isDef(x.p.pos)), (x) => x.v * (x.p.pos === 'QB' ? 1.0 : isDef(x.p.pos) ? 0.55 : 0.72) * (0.45 + wp(x.team) * 1.1));
  res.MVP = mvp.slice(0, 5);
  res.OPOY = top(scored.filter((x) => isOffSkill(x.p.pos)), (x) => x.v * (x.p.pos === 'QB' ? 0.82 : 1.05) * (0.8 + wp(x.team) * 0.4)).slice(0, 5);
  res.DPOY = top(scored.filter((x) => isDef(x.p.pos)), (x) => x.v * (0.85 + wp(x.team) * 0.3)).slice(0, 5);
  res.OROY = top(scored.filter((x) => isOffSkill(x.p.pos) && isRookie(x.p)), (x) => x.v).slice(0, 5);
  res.DROY = top(scored.filter((x) => isDef(x.p.pos) && isRookie(x.p)), (x) => x.v).slice(0, 5);
  res.CPOY = top(scored.filter((x) => { const prev = x.p.stats?.[s - 1]?.REG; return !isRookie(x.p) && (!prev || (prev.g || 0) < 8 || av(x.p, prev) < x.v * 0.5); }), (x) => x.v * (isDef(x.p.pos) ? 0.8 : 1)).slice(0, 5);
  const coy = Lg.teams.map((t) => ({ t, sc: (st[t.tid].w - (t.expectWins ?? 8.5)) + st[t.tid].w * 0.25 })).sort((a, b) => b.sc - a.sc);
  const hc = Lg.coaches[coy[0].t.staff.hc];
  res.COY = hc ? [{ coach: hc.name, tid: coy[0].t.tid }] : [];
  // All-Pro & Pro Bowl
  const slots = { QB: 1, RB: 1, WR: 3, TE: 1, OT: 2, OG: 2, C: 1, EDGE: 2, DT: 2, LB: 2, CB: 2, S: 2, K: 1, P: 1 };
  const byPos = {};
  for (const x of scored) (byPos[x.p.pos] ||= []).push(x);
  const ap1 = [], ap2 = [];
  for (const pos in slots) {
    const arr = (byPos[pos] || []).map((x) => ({ ...x, sc: x.v * 0.75 + x.p.r.ovr * 0.6 })).sort((a, b) => b.sc - a.sc);
    ap1.push(...arr.slice(0, slots[pos])); ap2.push(...arr.slice(slots[pos], slots[pos] * 2));
  }
  const pbSlots = { QB: 3, RB: 3, WR: 4, TE: 2, OT: 3, OG: 3, C: 2, EDGE: 3, DT: 3, LB: 3, CB: 3, S: 3, K: 1, P: 1 };
  const pb = [];
  for (const conf of ['AFC', 'NFC']) for (const pos in pbSlots) {
    const arr = (byPos[pos] || []).filter((x) => Lg.teams[x.team]?.conf === conf).map((x) => ({ ...x, sc: x.v * 0.6 + x.p.r.ovr * 0.7 + (x.p.pers?.media ?? 0.5) * 3 })).sort((a, b) => b.sc - a.sc);
    pb.push(...arr.slice(0, pbSlots[pos]));
  }
  const give = (x, type) => { (x.p.awards ||= []).push({ s, type }); };
  for (const k of ['MVP', 'OPOY', 'DPOY', 'OROY', 'DROY', 'CPOY']) if (res[k][0]) give(res[k][0], k);
  ap1.forEach((x) => give(x, 'AP1')); ap2.forEach((x) => give(x, 'AP2')); pb.forEach((x) => give(x, 'PB'));
  const pack = (arr) => arr.map((x) => ({ pid: x.p.pid, tid: x.team, sc: Math.round(x.sc ?? x.v) }));
  Lg.awards[s] = {
    MVP: pack(res.MVP), OPOY: pack(res.OPOY), DPOY: pack(res.DPOY), OROY: pack(res.OROY), DROY: pack(res.DROY), CPOY: pack(res.CPOY), COY: res.COY,
    AP1: pack(ap1), AP2: pack(ap2), PB: pack(pb),
  };
  const m = res.MVP[0];
  if (m) news(`${m.p.fn} ${m.p.ln} (${Lg.teams[m.team].abbr}) is the ${s} NFL MVP.`, { type: 'award', pids: [m.p.pid], big: true });
  for (const k of ['OPOY', 'DPOY', 'OROY', 'DROY', 'CPOY']) { const w = res[k][0]; if (w) news(`${k}: ${w.p.fn} ${w.p.ln} (${Lg.teams[w.team].abbr}).`, { type: 'award', pids: [w.p.pid] }); }
  return Lg.awards[s];
}

export function sbMvp(box, winnerTid) {
  const Lg = G.L;
  let best = null, bv = -1;
  for (const pid in box.pl) {
    const p = Lg.players[pid];
    if (!p || p.tid !== winnerTid) continue;
    const v = av(p, box.pl[pid]) * (p.pos === 'QB' ? 1.1 : 1);
    if (v > bv) { bv = v; best = p; }
  }
  if (best) {
    (best.awards ||= []).push({ s: Lg.meta.season, type: 'SBMVP' });
    Lg.awards[Lg.meta.season] ||= {};
    Lg.awards[Lg.meta.season].SBMVP = { pid: best.pid, tid: winnerTid };
  }
  return best;
}

// ---- retirements
export function processRetirements() {
  const Lg = G.L;
  const s = Lg.meta.season;
  const sl = Lg.settings.sliders.retirementAge ?? 1;
  const out = [];
  for (const p of Object.values(Lg.players)) {
    if (p.tid < -1) continue;
    const a = age(p, s + 1);
    if (a < 29) continue;
    const shift = { QB: 5, K: 6, P: 6, LS: 6, RB: -3, WR: 0, CB: -1 }[p.pos] || 0;
    const quality = (p.r.ovr - 70) / 7;
    const pivot = (34 + shift + quality) * sl + (sl - 1) * 2;
    let pr = sigmoid((a - pivot) / 1.3);
    if (p.tid === -1) pr = Math.min(0.97, pr + 0.25 + (a >= 33 ? 0.2 : 0));
    if (p.contract && p.contract.exp > s && p.contract.apy > 15e6) pr *= 0.5;
    if ((p.pers?.win ?? 0.5) > 0.75 && Lg.champions.some((c) => c.s === s && c.tid === p.tid)) pr = Math.min(0.95, pr + 0.15);
    if (rnd() < pr) { retire(p); out.push(p); }
  }
  const big = out.filter((p) => p.r.ovr >= 80 || (p.awards || []).length >= 3).slice(0, 6);
  for (const p of big) news(`${p.fn} ${p.ln} announces his retirement after ${p.exp + 1} seasons.`, { type: 'retire', pids: [p.pid], big: true });
  return out;
}
export function retire(p) {
  const Lg = G.L;
  const t = Lg.teams[p.tid];
  if (t) for (const k in t.depth) t.depth[k] = t.depth[k].filter((x) => x !== p.pid);
  p.retired = { s: Lg.meta.season, tid: p.tid };
  p.tid = -3; p.status = 'RET'; p.contract = null;
  p.hofScore = hofScore(p);
}
export function hofScore(p) {
  const aw = p.awards || [];
  const c = (t) => aw.filter((a) => a.type === t).length;
  let sc = c('MVP') * 30 + c('DPOY') * 22 + c('OPOY') * 15 + c('AP1') * 10 + c('AP2') * 4 + c('PB') * 3 + c('SBMVP') * 10 + (p.realPB || 0) * 3 + (p.realAP || 0) * 9;
  let car = 0;
  for (const y in p.stats || {}) car += av(p, p.stats[y].REG);
  sc += car / 25;
  return Math.round(sc);
}
export function hallOfFame() {
  const Lg = G.L;
  const s = Lg.meta.season;
  const elig = Object.values(Lg.players).filter((p) => p.status === 'RET' && p.retired && s - p.retired.s >= 5 && !p.hof && (p.hofScore || 0) >= 70)
    .sort((a, b) => b.hofScore - a.hofScore).slice(0, 5);
  for (const p of elig) {
    p.hof = s; Lg.hof.push({ pid: p.pid, s });
    news(`${p.fn} ${p.ln} has been elected to the Pro Football Hall of Fame (Class of ${s}).`, { type: 'hof', pids: [p.pid], big: true });
  }
}
void clamp;
