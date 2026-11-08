// Player personalities, morale and team chemistry.
import { G, rnd, gauss, clamp, age, avg, news } from './core.js';

// dims (0..1): greed, loyal, win, ego, work, lead, volat, media
export function genPersonality(p, info = {}) {
  const a = info.age ?? 25;
  const exp = p.exp ?? 0;
  const ovr = p.r?.ovr ?? 65;
  const b = (mu, sd = 0.18) => clamp(gauss(mu, sd), 0.02, 0.98);
  const pers = {
    greed: b(0.45 + (info.changedTeamsFA ? 0.12 : 0) - (info.homegrown ? 0.05 : 0)),
    loyal: b(0.45 + (info.homegrown ? 0.18 : 0) + (info.teamsCount === 1 && exp >= 5 ? 0.15 : 0) - (info.teamsCount >= 4 ? 0.15 : 0)),
    win: b(0.5 + Math.max(0, a - 29) * 0.04),
    ego: b(0.38 + (ovr >= 88 ? 0.15 : 0) + (['WR', 'RB', 'QB'].includes(p.pos) ? 0.08 : 0) - (['OG', 'C', 'LS', 'FB'].includes(p.pos) ? 0.1 : 0)),
    work: b(0.5 + (info.overachiever ? 0.18 : 0) + (info.underachiever ? -0.15 : 0)),
    lead: b(0.3 + Math.min(exp, 10) * 0.035 + (p.pos === 'QB' ? 0.12 : 0) + (ovr >= 85 ? 0.08 : 0) + (p.pos === 'LB' || p.pos === 'C' ? 0.05 : 0)),
    volat: b(0.3 + (info.penaltyRate ? Math.min(0.35, info.penaltyRate * 0.5) : 0)),
    media: b(0.4 + (ovr >= 88 ? 0.12 : 0)),
  };
  return pers;
}

export function personalityLabels(pers, p) {
  const L = [];
  if (!pers) return L;
  if (pers.greed > 0.7) L.push(['Money Motivated', 'Follows the biggest offer; guarantees matter most']);
  if (pers.loyal > 0.72) L.push(['Loyal', 'Gives his current team a discount and wants to stay']);
  if (pers.win > 0.74) L.push(['Ring Chaser', 'Prioritizes contenders, will take less to win']);
  if (pers.ego > 0.72) L.push(['Spotlight Seeker', 'Needs touches, targets and recognition']);
  if (pers.work > 0.74) L.push(['Gym Rat', 'Relentless worker, develops faster and ages gracefully']);
  if (pers.work < 0.25) L.push(['Coasts', 'Talent over effort; can stall or decline early']);
  if (pers.lead > 0.72) L.push([age(p) >= 30 ? 'Mentor' : 'Vocal Leader', 'Lifts locker-room chemistry and young teammates']);
  if (pers.volat > 0.7) L.push(['Hothead', 'Emotional; morale swings, penalties and drama']);
  if (pers.volat < 0.18 && pers.ego < 0.35) L.push(['Even Keel', 'Steady, rarely causes or reacts to drama']);
  if (pers.ego < 0.25 && pers.greed < 0.35) L.push(['Team First', 'Accepts any role, easy to keep happy']);
  if (pers.media > 0.78) L.push(['Media Darling', 'Loves the spotlight; sells jerseys and tickets']);
  if (!L.length) L.push(['Professional', 'Balanced personality with no strong extremes']);
  return L;
}

// Expected role: starters with high ovr want to start; compare to depth position
export function roleSatisfaction(p) {
  const Lg = G.L;
  const t = Lg.teams[p.tid];
  if (!t) return 0.5;
  const list = t.depth[p.pos] || [];
  const idx = list.indexOf(p.pid);
  const startersNeeded = { QB: 1, RB: 1, WR: 3, TE: 1, OT: 2, OG: 2, C: 1, EDGE: 2, DT: 2, LB: 2, CB: 3, S: 2, K: 1, P: 1, LS: 1, FB: 1 }[p.pos] || 1;
  const starting = idx >= 0 && idx < startersNeeded;
  const expectsStart = p.r.ovr >= 74 || (p.exp >= 4 && p.r.ovr >= 70);
  if (starting) return 1;
  if (!expectsStart) return 0.7;
  return 0.25 + (1 - (p.pers?.ego ?? 0.5)) * 0.3;
}

export function contractSatisfaction(p, marketValueFn) {
  if (!p.contract) return 0.5;
  const mv = marketValueFn(p);
  const apy = p.contract.apy || 1;
  const ratio = apy / Math.max(mv, 1);
  return clamp(0.35 + ratio * 0.65 - (p.pers?.greed ?? 0.5) * 0.15, 0, 1.1);
}

export function updateMorale(marketValueFn) {
  const Lg = G.L;
  const s = Lg.meta.season;
  const impact = Lg.settings.sliders.moraleImpact ?? 1;
  const byTeam = {};
  for (const p of Object.values(Lg.players)) if (p.tid >= 0) (byTeam[p.tid] ||= []).push(p);
  for (const t of Lg.teams) {
    const rec = Lg.standingsCache?.[t.tid];
    const winPct = rec ? (rec.w + rec.t * 0.5) / Math.max(1, rec.w + rec.l + rec.t) : 0.5;
    for (const p of byTeam[t.tid] || []) {
      const pers = p.pers || {};
      const role = roleSatisfaction(p);
      const money = contractSatisfaction(p, marketValueFn);
      const winF = winPct;
      const coachF = t.staff?.hc ? (Lg.coaches[t.staff.hc]?.rel ?? 0.6) : 0.6;
      const target = 100 * clamp(
        0.15 + role * (0.18 + (pers.ego ?? 0.5) * 0.15) + money * (0.12 + (pers.greed ?? 0.5) * 0.18) +
        winF * (0.12 + (pers.win ?? 0.5) * 0.18) + coachF * 0.08 + (t.chem ?? 0.6) * 0.08, 0, 1);
      const speed = 0.25 + (pers.volat ?? 0.3) * 0.35;
      p.morale = clamp(Math.round((p.morale ?? 65) + (target - (p.morale ?? 65)) * speed * impact + gauss(0, 2)), 0, 100);
    }
  }
  updateChemistry(byTeam);
  void s; void avg;
}

export function updateChemistry(byTeam = null) {
  const Lg = G.L;
  if (!byTeam) { byTeam = {}; for (const p of Object.values(Lg.players)) if (p.tid >= 0) (byTeam[p.tid] ||= []).push(p); }
  for (const t of Lg.teams) {
    const ps = (byTeam[t.tid] || []).filter((p) => p.status !== 'PS');
    if (!ps.length) { t.chem = 0.6; continue; }
    const mor = ps.reduce((a, p) => a + (p.morale ?? 65), 0) / ps.length / 100;
    const leaders = ps.filter((p) => (p.pers?.lead ?? 0) > 0.72 && p.r.ovr >= 72).length;
    const divas = ps.filter((p) => (p.pers?.ego ?? 0) > 0.75 && (p.morale ?? 65) < 45).length;
    const hot = ps.filter((p) => (p.pers?.volat ?? 0) > 0.75 && (p.morale ?? 65) < 45).length;
    const cont = ps.filter((p) => (p.yrsWithTeam ?? 0) >= 2).length / ps.length;
    t.chem = clamp(mor * 0.6 + Math.min(leaders, 5) * 0.035 - divas * 0.04 - hot * 0.03 + cont * 0.15, 0.1, 1);
  }
}

// ---- holdouts & trade requests (Persona-like behavior from personality + situation)
export function checkUnrest(marketValueFn) {
  const Lg = G.L;
  const sl = Lg.settings.sliders.holdouts ?? 1;
  for (const p of Object.values(Lg.players)) {
    if (p.tid < 0 || !p.contract) continue;
    const pers = p.pers || {};
    const yrsLeft = p.contract.exp - Lg.meta.season;
    const mv = marketValueFn(p);
    const underpaid = p.contract.apy < mv * 0.62 && p.r.ovr >= 84 && yrsLeft <= 1 && !p.contract.rookie5;
    if (Lg.meta.phase === 'TRAINING_CAMP' && underpaid && !p.holdout && rnd() < (pers.greed * 0.45 + pers.ego * 0.15) * sl * 0.6) {
      p.holdout = true;
      news(`${p.fn} ${p.ln} is holding out from ${Lg.teams[p.tid].abbr} camp, seeking a new contract.`, { type: 'holdout', pids: [p.pid], tids: [p.tid] });
    }
    if (!p.tradeReq && (p.morale ?? 65) < 28 && p.r.ovr >= 76 && rnd() < (0.06 + pers.volat * 0.12 + pers.ego * 0.08) * sl) {
      p.tradeReq = Lg.meta.season;
      news(`${p.fn} ${p.ln} has requested a trade from the ${Lg.teams[p.tid].name}.`, { type: 'tradereq', pids: [p.pid], tids: [p.tid] });
    }
  }
}
