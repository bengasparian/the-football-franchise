// Coaching staffs: real 2026 HC/OC/DC, ratings derived from real records, hiring & firing.
import { G, rnd, gauss, clamp, pick, nextId, news, transaction } from './core.js';
import { FIRST, LAST, SCHEMES_OFF, SCHEMES_DEF } from './names.js';

export const REAL_OC = { BUF: 'Pete Carmichael Jr.', MIA: 'Bobby Slowik', NE: 'Josh McDaniels', NYJ: 'Frank Reich', BAL: 'Declan Doyle', CIN: 'Dan Pitcher',
  CLE: 'Travis Switzer', PIT: 'Brian Angelichio', HOU: 'Nick Caley', IND: 'Jim Bob Cooter', JAX: 'Grant Udinski', TEN: 'Brian Daboll', DEN: 'Davis Webb',
  KC: 'Eric Bieniemy', LV: 'Andrew Janocko', LAC: 'Mike McDaniel', DAL: 'Klayton Adams', NYG: 'Matt Nagy', PHI: 'Sean Mannion', WAS: 'David Blough',
  CHI: 'Press Taylor', DET: 'Drew Petzing', GB: 'Adam Stenavich', MIN: 'Wes Phillips', ATL: 'Tommy Rees', CAR: 'Brad Idzik', NO: 'Doug Nussmeier',
  TB: 'Zac Robinson', ARI: 'Nathaniel Hackett', LAR: 'Nathan Scheelhaase', SF: 'Klay Kubiak', SEA: 'Brian Fleury' };
export const REAL_DC = { BUF: 'Jim Leonhard', MIA: 'Sean Duggan', NE: 'Zak Kuhr', NYJ: 'Brian Duker', BAL: 'Anthony Weaver', CIN: 'Al Golden',
  CLE: 'Mike Rutenberg', PIT: 'Patrick Graham', HOU: 'Matt Burke', IND: 'Lou Anarumo', JAX: 'Anthony Campanile', TEN: 'Gus Bradley', DEN: 'Vance Joseph',
  KC: 'Steve Spagnuolo', LV: 'Rob Leonard', LAC: "Chris O'Leary", DAL: 'Christian Parker', NYG: 'Dennard Wilson', PHI: 'Vic Fangio', WAS: 'Daronte Jones',
  CHI: 'Dennis Allen', DET: 'Kelvin Sheppard', GB: 'Jonathan Gannon', MIN: 'Brian Flores', ATL: 'Jeff Ulbrich', CAR: 'Todd Wash', NO: 'Brandon Staley',
  TB: 'Todd Bowles', ARI: 'Nick Rallis', LAR: 'Chris Shula', SF: 'Raheem Morris', SEA: 'Aden Durde' };
// head coaches whose background is offense (play-callers); others lean defense
const OFF_HC = new Set(['Sean McVay', 'Kyle Shanahan', 'Matt LaFleur', "Kevin O'Connell", 'Ben Johnson', 'Sean Payton', 'Andy Reid', 'Zac Taylor', 'Shane Steichen',
  'Dave Canales', 'Klint Kubiak', 'Todd Monken', 'Joe Brady', 'Mike McCarthy', 'Liam Coen', 'Kevin Stefanski', 'Nick Sirianni', 'Brian Daboll', 'Mike LaFleur',
  'Jim Harbaugh', 'Kellen Moore', 'Arthur Smith', 'Grant Udinski', 'Josh McDaniels', 'Frank Reich', 'Mike McDaniel', 'Brian Callahan', 'Jeff Hafley', 'Bobby Slowik']);

function mkCoach({ name, role, tid, base = 70, rec = null, offLean = null, ageY = null }) {
  const lean = offLean ?? (role === 'OC' ? 1 : role === 'DC' ? 0 : rnd() < 0.5 ? 1 : 0);
  const c = {
    cid: nextId('c'), name, role, tid,
    age: ageY ?? Math.round(clamp(gauss(role === 'HC' ? 52 : 47, 7), 32, 72)),
    off: clamp(Math.round(base + (lean ? 6 : -6) + gauss(0, 5)), 45, 97),
    def: clamp(Math.round(base + (lean ? -6 : 6) + gauss(0, 5)), 45, 97),
    gm: clamp(Math.round(base + gauss(0, 6)), 45, 97),
    dev: clamp(Math.round(base + gauss(0, 7)), 45, 97),
    rel: clamp(gauss(0.65, 0.12), 0.25, 0.98),
    agg: clamp(gauss(0.5, 0.18), 0.05, 0.95),
    passLean: clamp(gauss(0.5, 0.15) + (lean ? 0.05 : -0.05), 0.1, 0.9),
    schemeOff: pick(SCHEMES_OFF), schemeDef: pick(SCHEMES_DEF),
    rec: rec || { w: 0, l: 0, t: 0, pw: 0, pl: 0, sb: 0, yrs: 0 },
    contract: { yrs: role === 'HC' ? 2 + Math.floor(rnd() * 4) : 1 + Math.floor(rnd() * 3), salary: role === 'HC' ? Math.round((6 + rnd() * 10) * 1e6) : Math.round((1.5 + rnd() * 3) * 1e6) },
    hist: [],
  };
  return c;
}

export function initCoaches(dataCoaches) {
  const Lg = G.L;
  Lg.coaches = {};
  for (const t of Lg.teams) {
    const d = dataCoaches?.[t.abbr];
    let hcBase = 70;
    if (d) {
      const g = d.w + d.l + d.t;
      const wp = (d.w + 0.5 * d.t + 8) / (g + 16);
      hcBase = clamp(62 + (wp - 0.5) * 80 + d.sb * 3 + Math.min(d.pw, 20) * 0.5 + Math.min(d.yrs, 12) * 0.5, 58, 94);
    }
    const hc = mkCoach({ name: d?.name || genName(), role: 'HC', tid: t.tid, base: hcBase, rec: d ? { w: d.w, l: d.l, t: d.t, pw: d.pw, pl: d.pl, sb: d.sb, yrs: d.yrs } : null, offLean: d ? (OFF_HC.has(d.name) ? 1 : 0) : null });
    const oc = mkCoach({ name: REAL_OC[t.abbr] || genName(), role: 'OC', tid: t.tid, base: 70 + gauss(0, 4) });
    const dc = mkCoach({ name: REAL_DC[t.abbr] || genName(), role: 'DC', tid: t.tid, base: 70 + gauss(0, 4) });
    if (dc.name === hc.name) { dc.def = Math.max(dc.def, hc.def); }
    for (const c of [hc, oc, dc]) Lg.coaches[c.cid] = c;
    t.staff = { hc: hc.cid, oc: oc.cid, dc: dc.cid };
    refreshStaffBonus(t.tid);
  }
  replenishCoachPool();
}
export function genName() { return `${pick(FIRST)} ${pick(LAST)}`; }

export function refreshStaffBonus(tid) {
  const Lg = G.L;
  const t = Lg.teams[tid];
  const cs = ['hc', 'oc', 'dc'].map((r) => Lg.coaches[t.staff?.[r]]).filter(Boolean);
  const dev = cs.length ? cs.reduce((a, c) => a + c.dev, 0) / cs.length : 70;
  t.staff.devBonus = (dev - 70) / 10;
}

export function replenishCoachPool() {
  const Lg = G.L;
  const pool = Object.values(Lg.coaches).filter((c) => c.tid == null || c.tid < 0);
  const need = { HC: 10, OC: 12, DC: 12 };
  for (const role of ['HC', 'OC', 'DC']) {
    const have = pool.filter((c) => c.role === role).length;
    for (let i = have; i < need[role]; i++) {
      const c = mkCoach({ name: genName(), role, tid: -1, base: 64 + gauss(0, 6) });
      if (role === 'HC') c.rec = { w: 0, l: 0, t: 0, pw: 0, pl: 0, sb: 0, yrs: 0 };
      Lg.coaches[c.cid] = c;
    }
  }
}

export function fireCoach(tid, role) {
  const Lg = G.L;
  const t = Lg.teams[tid];
  const cid = t.staff[role.toLowerCase()];
  const c = Lg.coaches[cid];
  if (!c) return { error: 'No coach in that role' };
  c.tid = -1; c.firedBy = tid; c.firedSeason = Lg.meta.season;
  c.hist.push({ s: Lg.meta.season, tid, role: c.role, out: 'fired' });
  t.staff[role.toLowerCase()] = null;
  t.coachDead = (t.coachDead || 0) + c.contract.salary * Math.max(0, c.contract.yrs - 1);
  news(`The ${t.region} ${t.name} have fired ${c.role === 'HC' ? 'head coach' : c.role === 'OC' ? 'offensive coordinator' : 'defensive coordinator'} ${c.name}.`, { type: 'coach', tids: [tid], big: c.role === 'HC' });
  transaction('coach', `${t.abbr} fired ${c.role} ${c.name}`, { tids: [tid] });
  return { ok: true };
}

export function hireCoach(tid, cid, role) {
  const Lg = G.L;
  const t = Lg.teams[tid];
  const c = Lg.coaches[cid];
  if (!c || (c.tid != null && c.tid >= 0)) return { error: 'Coach not available' };
  const r = role.toLowerCase();
  if (t.staff[r]) fireCoach(tid, role);
  // coordinators can be promoted to head coach
  c.role = role.toUpperCase(); c.tid = tid;
  c.contract = { yrs: c.role === 'HC' ? 4 + Math.floor(rnd() * 2) : 2 + Math.floor(rnd() * 2), salary: c.role === 'HC' ? Math.round((6 + (c.gm - 60) / 4 + rnd() * 4) * 1e6) : Math.round((1.5 + rnd() * 3) * 1e6) };
  t.staff[r] = cid;
  refreshStaffBonus(tid);
  news(`The ${t.region} ${t.name} have hired ${c.name} as ${c.role === 'HC' ? 'head coach' : c.role === 'OC' ? 'offensive coordinator' : 'defensive coordinator'}.`, { type: 'coach', tids: [tid], big: c.role === 'HC' });
  transaction('coach', `${t.abbr} hired ${c.role} ${c.name}`, { tids: [tid] });
  return { ok: true };
}

export function coachOvr(c) { return Math.round((c.role === 'OC' ? c.off * 0.6 + c.dev * 0.25 + c.gm * 0.15 : c.role === 'DC' ? c.def * 0.6 + c.dev * 0.25 + c.gm * 0.15 : (c.off + c.def) * 0.25 + c.gm * 0.3 + c.dev * 0.2)); }

// After the season: AI owners evaluate coaches (record vs expectations, trend, tenure)
export function aiCoachingCarousel(standings) {
  const Lg = G.L;
  const sl = Lg.settings.sliders.ownerPatience ?? 1;
  for (const t of Lg.teams) {
    const rec = standings[t.tid];
    const hc = Lg.coaches[t.staff.hc];
    if (!rec) continue;
    const wp = (rec.w + rec.t * 0.5) / Math.max(1, rec.w + rec.l + rec.t);
    // update records
    for (const r of ['hc', 'oc', 'dc']) { const c = Lg.coaches[t.staff[r]]; if (c) { c.contract.yrs--; c.age++; } }
    if (hc) { hc.rec.w += rec.w; hc.rec.l += rec.l; hc.rec.t += rec.t; hc.rec.yrs++; hc.tenure = (hc.tenure || 0) + 1; }
    if (Lg.meta.userTids.includes(t.tid) && !Lg.settings.autoCoaching) continue;
    const exp = t.expectWins ?? 8.5;
    const shortfall = exp - rec.w;
    const tenure = hc?.tenure || 1;
    let fireP = 0;
    if (shortfall > 2 && wp < 0.4) fireP = 0.35 + shortfall * 0.08 - (tenure <= 1 ? 0.3 : 0) + (tenure >= 4 && wp < 0.35 ? 0.15 : 0);
    if (wp < 0.25) fireP += 0.25;
    if (hc && hc.contract.yrs <= 0 && wp < 0.5) fireP += 0.4;
    fireP = clamp(fireP / sl, 0, 0.95);
    if (hc && rnd() < fireP) {
      fireCoach(t.tid, 'HC');
      // new HC: best available, often a hot coordinator
      const cands = Object.values(Lg.coaches).filter((c) => (c.tid == null || c.tid < 0) && (c.role === 'HC' || c.role === 'OC' || c.role === 'DC'))
        .sort((a, b) => coachOvr(b) + (b.role === 'HC' ? 2 : 0) + gauss(0, 4) - coachOvr(a) - (a.role === 'HC' ? 2 : 0));
      const hire = cands[0];
      if (hire) hireCoach(t.tid, hire.cid, 'HC');
      // new HC often brings coordinators
      if (rnd() < 0.6) {
        const oc = Object.values(Lg.coaches).filter((c) => (c.tid == null || c.tid < 0) && c.role === 'OC').sort((a, b) => b.off - a.off)[0];
        if (oc) hireCoach(t.tid, oc.cid, 'OC');
      }
      if (rnd() < 0.6) {
        const dc = Object.values(Lg.coaches).filter((c) => (c.tid == null || c.tid < 0) && c.role === 'DC').sort((a, b) => b.def - a.def)[0];
        if (dc) hireCoach(t.tid, dc.cid, 'DC');
      }
    } else {
      // coordinators get poached / fired
      for (const r of ['OC', 'DC']) {
        const c = Lg.coaches[t.staff[r.toLowerCase()]];
        if (!c) continue;
        const bad = r === 'OC' ? (rec.pf / Math.max(1, rec.gp)) < 19 : (rec.pa / Math.max(1, rec.gp)) > 25;
        if ((bad && rnd() < 0.35) || c.contract.yrs <= 0 && rnd() < 0.3) {
          fireCoach(t.tid, r);
          const nc = Object.values(Lg.coaches).filter((x) => (x.tid == null || x.tid < 0) && x.role === r).sort((a, b) => (r === 'OC' ? b.off - a.off : b.def - a.def) + gauss(0, 3))[0];
          if (nc) hireCoach(t.tid, nc.cid, r);
        } else if (c.contract.yrs <= 0) c.contract.yrs = 2;
      }
      if (hc && hc.contract.yrs <= 0) hc.contract.yrs = 3;
    }
    // coaches progress a little with experience
    for (const r of ['hc', 'oc', 'dc']) {
      const c = Lg.coaches[t.staff[r]];
      if (!c) continue;
      const d = c.age < 50 ? gauss(0.6, 1.2) : c.age < 62 ? gauss(0, 1) : gauss(-0.8, 1);
      c.off = clamp(Math.round(c.off + d), 40, 99); c.def = clamp(Math.round(c.def + d), 40, 99); c.gm = clamp(Math.round(c.gm + d * 0.5), 40, 99);
    }
  }
  // fill vacancies
  for (const t of Lg.teams) {
    for (const r of ['hc', 'oc', 'dc']) {
      if (!t.staff[r]) {
        const role = r.toUpperCase();
        const c = Object.values(Lg.coaches).filter((x) => (x.tid == null || x.tid < 0) && x.role === role).sort((a, b) => coachOvr(b) - coachOvr(a))[0];
        if (c && !(Lg.meta.userTids.includes(t.tid) && !Lg.settings.autoCoaching)) hireCoach(t.tid, c.cid, role);
      }
    }
  }
  // retire old coaches in the pool
  for (const c of Object.values(Lg.coaches)) if ((c.tid == null || c.tid < 0) && c.age > 70) delete Lg.coaches[c.cid];
  replenishCoachPool();
}
