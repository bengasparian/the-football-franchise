// Offensive / defensive schemes (like Madden playbooks) and situational roles (slot WR, nickel CB, Mike/Will/Sam…).
// A scheme changes how a team plays (run/pass mix, throw depth, who gets the ball, how often it's in nickel, blitz rate)
// and which players fit it. Roles let a coach choose who plays a specialist job instead of "whoever is WR3".
import { G, clamp } from './core.js';

// Every scheme name matches the systems coordinators already know (names.js), so a coordinator's preferred
// system is always one of these.
export const OFF_SCHEMES = {
  'West Coast': {
    short: 'Timing, quick throws, YAC', desc: 'Short, rhythm throws that get the ball out fast and let receivers run after the catch. Backs and tight ends are big parts of the passing game.',
    pass: 0.03, depth: [1.15, 1.18, 0.9, 0.7], share: { slot: 1.1, te: 1.08, rb: 1.2, wr4: 1 }, wr3: 0.66, qbRun: 1, run: 'mix', sack: -0.02, yac: 0.25,
    wants: { QB: { tas: 3, dec: 2, awr: 1 }, WR: { rte: 3, agi: 2, cth: 1 }, TE: { rte: 2, cth: 2, rbk: 1 }, RB: { cth: 2, elu: 2, vis: 1 }, OL: { pbk: 2, rbk: 1 } },
  },
  'Shanahan Zone': {
    short: 'Outside zone, play-action', desc: 'Outside-zone runs with athletic linemen, then play-action shots off the same look. One cut and go for the backs.',
    pass: -0.04, depth: [1.05, 0.95, 1.12, 1.0], share: { slot: 0.95, te: 1.05, rb: 1.05, wr4: 0.8 }, wr3: 0.52, qbRun: 0.9, run: 'zone', pa: 0.035, sack: 0,
    wants: { QB: { tas: 2, tad: 2, dec: 1 }, WR: { rte: 2, rbk: 1, spd: 1 }, TE: { rbk: 2, rte: 1, cth: 1 }, RB: { vis: 3, spd: 2, acc: 1 }, OL: { rbk: 2, agi: 2, spd: 1 } },
  },
  'Air Raid': {
    short: 'Four-wide, spread the field', desc: 'Lots of three- and four-receiver sets. Spreads the defense thin and throws often. Receivers matter far more than the tight end.',
    pass: 0.08, depth: [0.95, 1.0, 1.15, 1.05], share: { slot: 1.2, te: 0.7, rb: 0.85, wr4: 1.9 }, wr3: 0.9, qbRun: 1, run: 'mix', sack: 0.01,
    wants: { QB: { tas: 2, tad: 2, dec: 2 }, WR: { rte: 2, spd: 2, cth: 1 }, TE: { rte: 2, cth: 2 }, RB: { cth: 1, elu: 2, spd: 1 }, OL: { pbk: 3 } },
  },
  'Spread RPO': {
    short: 'Run-pass options, mobile QB', desc: 'Read-option and RPO looks from spread sets. The quarterback runs more and the slot receiver is a featured target.',
    pass: 0.01, depth: [1.25, 1.05, 0.95, 0.85], share: { slot: 1.25, te: 0.9, rb: 1, wr4: 1.2 }, wr3: 0.82, qbRun: 1.8, run: 'zone', sack: -0.01,
    wants: { QB: { spd: 2, acc: 1, tas: 2, dec: 1 }, WR: { agi: 2, rte: 1, spd: 1 }, TE: { rte: 1, cth: 1, rbk: 1 }, RB: { spd: 2, vis: 2, elu: 1 }, OL: { rbk: 2, agi: 1, pbk: 1 } },
  },
  'Power Run': {
    short: 'Downhill gap runs, heavy sets', desc: 'Gap and power runs behind big linemen, with extra tight ends and fullbacks. Physical, clock-eating football.',
    pass: -0.08, depth: [0.9, 1.0, 1.05, 1.0], share: { slot: 0.85, te: 1.2, rb: 0.95, wr4: 0.6 }, wr3: 0.4, qbRun: 0.8, run: 'gap', pa: 0.02, sack: 0, shortYd: 0.06,
    wants: { QB: { thp: 2, tad: 1, poc: 1 }, WR: { rbk: 2, cit: 1, rel: 1 }, TE: { rbk: 3, str: 1, cth: 1 }, RB: { btk: 3, str: 2, car: 1 }, OL: { rbk: 3, str: 2 } },
  },
  Vertical: {
    short: 'Deep shots, big arm', desc: 'Push the ball downfield. Fewer completions, more big plays. Needs a strong arm, speed outside, and protection that holds up.',
    pass: 0.04, depth: [0.85, 0.85, 1.05, 1.5], share: { slot: 0.95, te: 0.95, rb: 0.8, wr4: 1.1 }, wr3: 0.7, qbRun: 1, run: 'mix', sack: 0.03,
    wants: { QB: { thp: 3, tad: 2, poc: 1 }, WR: { spd: 3, rel: 1, jmp: 1 }, TE: { spd: 1, rte: 1, cth: 1 }, RB: { pbk: 2, spd: 1, btk: 1 }, OL: { pbk: 3, str: 1 } },
  },
  'Erhardt-Perkins': {
    short: 'Concepts, flexible personnel', desc: 'Concept-based passing that works from any formation. Leans on a smart quarterback and a do-it-all tight end, and converts on third down.',
    pass: 0.01, depth: [1.0, 1.05, 1.05, 0.9], share: { slot: 1.05, te: 1.2, rb: 1.05, wr4: 0.9 }, wr3: 0.6, qbRun: 1, run: 'mix', sack: -0.01, third: 0.03,
    wants: { QB: { dec: 3, awr: 2, tas: 1 }, WR: { rte: 2, awr: 1, cth: 1 }, TE: { rte: 2, rbk: 1, cth: 1 }, RB: { cth: 1, pbk: 1, vis: 1 }, OL: { pbk: 2, rbk: 1, awr: 1 } },
  },
};

export const DEF_SCHEMES = {
  '4-3 Over': {
    short: 'Four down linemen, sound vs the run', desc: 'Classic four-man front with three linebackers in base. Stays in base personnel more often, so it\'s stout against the run but can be exposed by the slot.',
    front: '43', nickel: 0.45, man: 0.45, blitz: 0, run: 0.25, deep: 1, shortC: 1,
    wants: { DL: { bsh: 2, prs: 2, str: 1 }, EDGE: { prs: 2, bsh: 2 }, LB: { bsh: 2, tak: 2, pur: 1 }, CB: { zcv: 2, mcv: 1, tak: 1 }, S: { tak: 2, zcv: 1, pur: 1 } },
  },
  '3-4 Two-Gap': {
    short: 'Big 3-man front, OLB rushers', desc: 'Massive linemen two-gap and eat blockers so the linebackers run free. Outside linebackers (your edge rushers) bring the pressure.',
    front: '34', nickel: 0.5, man: 0.5, blitz: 0.01, run: 0.3, deep: 1, shortC: 1,
    wants: { DL: { bsh: 3, str: 2 }, EDGE: { prs: 2, spd: 1, bsh: 1 }, LB: { pur: 2, tak: 2, bsh: 1 }, CB: { mcv: 2, zcv: 1 }, S: { zcv: 2, tak: 1 } },
  },
  'Nickel Cover 3': {
    short: 'Nickel base, single-high zone', desc: 'Lives in nickel with a single-high safety and three-deep zone. Takes away the deep ball and forces offenses to dink and dunk.',
    front: '43', nickel: 0.85, man: 0.3, blitz: 0, run: -0.05, deep: 0.85, shortC: 1.05,
    wants: { DL: { prs: 2, bsh: 1 }, EDGE: { prs: 3 }, LB: { zcv: 2, pur: 2, spd: 1 }, CB: { zcv: 3, spd: 1 }, S: { zcv: 2, spd: 1, hwk: 1 } },
  },
  'Fangio 2-High': {
    short: 'Two deep safeties, light boxes', desc: 'Two high safeties and disguised coverages. Almost nothing gets over the top, but light boxes can give up yards on the ground.',
    front: '34', nickel: 0.9, man: 0.25, blitz: -0.01, run: -0.2, deep: 0.75, shortC: 1.05,
    wants: { DL: { bsh: 2, prs: 1, str: 1 }, EDGE: { prs: 2, bsh: 1 }, LB: { zcv: 2, awr: 2, pur: 1 }, CB: { zcv: 2, awr: 1, spd: 1 }, S: { zcv: 3, awr: 1, spd: 1 } },
  },
  'Tampa 2': {
    short: 'Two-deep zone, rangy Mike', desc: 'Four-man rush and two-deep zone with a fast middle linebacker who drops deep. Rallies to the ball and tackles everything short.',
    front: '43', nickel: 0.6, man: 0.15, blitz: -0.01, run: 0, deep: 0.85, shortC: 1.08, lbCov: 1.4,
    wants: { DL: { prs: 2, spd: 1 }, EDGE: { prs: 2, spd: 1 }, LB: { spd: 2, zcv: 2, pur: 1 }, CB: { zcv: 2, tak: 2 }, S: { zcv: 2, spd: 1, tak: 1 } },
  },
  'Multiple Hybrid': {
    short: 'Game-plan specific, disguised', desc: 'Changes fronts and coverages week to week. Needs versatile, smart players, and rewards a sharp coordinator.',
    front: '43', nickel: 0.7, man: 0.45, blitz: 0.01, run: 0.05, deep: 0.95, shortC: 1, dcBonus: 0.25,
    wants: { DL: { prs: 1, bsh: 1, awr: 1 }, EDGE: { prs: 2, bsh: 1, mcv: 1 }, LB: { awr: 2, zcv: 1, mcv: 1, tak: 1 }, CB: { mcv: 1, zcv: 1, awr: 1 }, S: { awr: 2, zcv: 1, tak: 1 } },
  },
  'Blitz-Heavy 3-4': {
    short: 'Pressure, Cover 0/1 man', desc: 'Sends extra rushers and plays tight man coverage behind it. More sacks and turnovers, but a missed blitz becomes a big play.',
    front: '34', nickel: 0.65, man: 0.8, blitz: 0.06, run: 0.05, deep: 1.18, shortC: 0.97,
    wants: { DL: { prs: 2, str: 1 }, EDGE: { prs: 3, spd: 1 }, LB: { prs: 2, spd: 1, tak: 1 }, CB: { mcv: 3, spd: 1 }, S: { mcv: 2, tak: 1 } },
  },
};

const OFF_GROUP = { QB: 'QB', RB: 'RB', FB: 'RB', WR: 'WR', TE: 'TE', OT: 'OL', OG: 'OL', C: 'OL' };
const DEF_GROUP = { DT: 'DL', EDGE: 'EDGE', LB: 'LB', CB: 'CB', S: 'S' };

// Situational roles shown on the Packages & Roles tab.
export const ROLES = {
  SLOT: { side: 'off', label: 'Slot Receiver', where: '3-WR sets', pos: ['WR'], desc: 'Lines up inside in three-receiver sets and works the middle. Quick, shifty route runners fit best, so your WR3 isn\'t automatically the guy.', w: { agi: 3, rte: 3, cth: 2, acc: 1 }, vs: { spd: 2, rel: 2, jmp: 1 } },
  RB3D: { side: 'off', label: 'Third-Down Back', where: '3rd & 4+', pos: ['RB', 'FB'], desc: 'The back on obvious passing downs: catches out of the backfield and picks up blitzes.', w: { cth: 3, pbk: 3, rte: 2, elu: 1 } },
  PWRB: { side: 'off', label: 'Short-Yardage Back', where: '3rd/4th & 1-2, goal line', pos: ['RB', 'FB'], desc: 'Gets the carry when you need a yard or two, or at the goal line.', w: { btk: 3, str: 2, car: 2, vis: 1 } },
  RZ: { side: 'off', label: 'Red Zone Target', where: 'Inside the 20', pos: ['WR', 'TE', 'RB'], desc: 'The quarterback looks his way more inside the 20. Big, strong hands win here.', w: { cit: 3, jmp: 2, cth: 2, rel: 1 } },
  MIKE: { side: 'def', label: 'Mike LB', where: 'Every package', pos: ['LB'], desc: 'The middle linebacker: makes the calls, plays the run between the tackles. Stays on the field in nickel and dime.', w: { awr: 3, tak: 2, pur: 2, bsh: 2, zcv: 1 } },
  WILL: { side: 'def', label: 'Will LB', where: 'Base & nickel', pos: ['LB', 'S'], desc: 'The weak-side linebacker: runs sideline to sideline and covers backs and tight ends. Leaves the field in dime.', w: { spd: 3, pur: 2, zcv: 2, tak: 1 } },
  SAM: { side: 'def', label: 'Sam LB', where: 'Base 4-3 only', pos: ['LB', 'EDGE'], desc: 'The strong-side linebacker: sets the edge against the tight end. Only plays in 4-3 base sets, so he leaves the field for the nickel.', w: { bsh: 3, str: 2, tak: 2, prs: 1 } },
  NICKEL: { side: 'def', label: 'Nickel CB', where: 'Nickel & dime', pos: ['CB', 'S'], desc: 'Covers the slot receiver. Quickness and zone instincts matter more than pure deep speed, so your CB3 isn\'t automatically the guy.', w: { agi: 3, zcv: 3, mcv: 2, tak: 1 }, vs: { spd: 2, mcv: 1, jmp: 1 } },
  DIME: { side: 'def', label: 'Dime DB', where: '3rd & long', pos: ['CB', 'S'], desc: 'The sixth defensive back in dime packages on obvious passing downs. Replaces the Will linebacker.', w: { mcv: 2, zcv: 3, spd: 2 } },
  RUSH: { side: 'def', label: 'Pass-Rush Specialist', where: '3rd & 5+, 2-minute', pos: ['EDGE', 'DT', 'LB'], desc: 'Subs in on passing downs to get after the QB, replacing your weakest rusher.', w: { prs: 4, spd: 1, acc: 1 } },
};

const sc = (p, w) => { let s = 0, n = 0; for (const k in w) { s += (p.r.a[k] ?? 50) * w[k]; n += w[k]; } return n ? s / n : 50; };
// league averages per position (attributes and overall), so a fit compares a player to others at his position
let AVG = { key: null, a: {}, o: {} };
function posAvg() {
  const Lg = G.L;
  const key = `${Lg.meta.season}-${Lg.meta.phase}`;
  if (AVG.key === key) return AVG;
  const a = {}, o = {}, n = {};
  for (const p of Object.values(Lg.players)) {
    if (p.tid < 0 || p.status !== 'ACT' || p.r.ovr < 62) continue;
    const A = (a[p.pos] ||= {}); n[p.pos] = (n[p.pos] || 0) + 1; o[p.pos] = (o[p.pos] || 0) + p.r.ovr;
    for (const k in p.r.a) A[k] = (A[k] || 0) + p.r.a[k];
  }
  for (const pos in a) { for (const k in a[pos]) a[pos][k] /= n[pos]; o[pos] /= n[pos]; }
  AVG = { key, a, o };
  return AVG;
}
const scAvg = (pos, w) => { const A = posAvg().a[pos] || {}; let s = 0, n = 0; for (const k in w) { s += (A[k] ?? 60) * w[k]; n += w[k]; } return n ? s / n : 60; };
export const roleScore = (p, role) => Math.round(sc(p, ROLES[role].w));

// ---------------------------------------------------------------- which scheme a team runs
export function teamScheme(t) {
  const C = G.L.coaches || {};
  const oc = C[t.staff?.oc], dc = C[t.staff?.dc];
  const ocS = OFF_SCHEMES[oc?.schemeOff] ? oc.schemeOff : 'West Coast';
  const dcS = DEF_SCHEMES[dc?.schemeDef] ? dc.schemeDef : '4-3 Over';
  const off = OFF_SCHEMES[t.scheme?.off] ? t.scheme.off : ocS;
  const def = DEF_SCHEMES[t.scheme?.def] ? t.scheme.def : dcS;
  return { off, def, ocScheme: ocS, dcScheme: dcS, offAuto: !OFF_SCHEMES[t.scheme?.off], defAuto: !DEF_SCHEMES[t.scheme?.def] };
}

// How well a player fits a scheme: his best traits for it versus his overall. 50 = neutral.
export function playerFit(p, side, scheme) {
  const S = side === 'off' ? OFF_SCHEMES[scheme] : DEF_SCHEMES[scheme];
  const grp = (side === 'off' ? OFF_GROUP : DEF_GROUP)[p.pos];
  if (!S || !grp || !S.wants[grp]) return null;
  // how much better (or worse) his key traits for this system are than his overall suggests, relative to his position
  const rel = (sc(p, S.wants[grp]) - scAvg(p.pos, S.wants[grp])) - (p.r.ovr - (posAvg().o[p.pos] ?? p.r.ovr));
  return clamp(Math.round(52 + rel * 3.5 + (p.r.ovr - (posAvg().o[p.pos] ?? 70)) * 0.6), 0, 100);
}
export const fitLabel = (f) => (f == null ? '—' : f >= 70 ? 'Ideal' : f >= 56 ? 'Good' : f >= 42 ? 'Okay' : 'Poor');

const OFF_START = { QB: 1, RB: 1, WR: 3, TE: 1, OT: 2, OG: 2, C: 1 };
const DEF_START = { EDGE: 2, DT: 2, LB: 2, CB: 3, S: 2 };
// Team fit: the average fit of the starters, 0-100 (50 = average).
export function teamFit(t, side, scheme) {
  const Lg = G.L;
  const want = side === 'off' ? OFF_START : DEF_START;
  const rows = [];
  for (const pos in want) {
    const ids = (t.depth[pos] || []).filter((pid) => { const p = Lg.players[pid]; return p && p.tid === t.tid && p.status === 'ACT'; }).slice(0, want[pos]);
    for (const pid of ids) { const p = Lg.players[pid]; rows.push({ pid, pos, fit: playerFit(p, side, scheme) }); }
  }
  const fits = rows.filter((r) => r.fit != null);
  return { pct: fits.length ? Math.round(fits.reduce((a, r) => a + r.fit, 0) / fits.length) : 50, rows };
}

// ---------------------------------------------------------------- roles
// Resolve every role to a player: the coach's pick if he's available, otherwise the staff's best choice.
// `ok(p)` says whether a player can play today (healthy, active). Returns { role: player|null }.
export function resolveRoles(t, ok = (p) => p.status === 'ACT' && !(p.inj && p.inj.wk > 0)) {
  const Lg = G.L;
  const dep = (pos) => (t.depth[pos] || []).map((pid) => Lg.players[pid]).filter((p) => p && p.tid === t.tid && ok(p));
  const R = {}, set = t.roles || {};
  const chosen = (role) => { const p = Lg.players[set[role]]; return p && p.tid === t.tid && ok(p) && ROLES[role].pos.includes(p.pos) ? p : null; };
  // receivers: the slot is whoever is best suited inside among the top four (close enough in quality to the WR3)
  const wr = dep('WR');
  R.SLOT = chosen('SLOT') || pickSpecialist(wr.slice(0, 4), 'SLOT', 2);
  const rb = [...dep('RB'), ...dep('FB')];
  R.RB3D = chosen('RB3D') || best(rb.slice(0, 3), 'RB3D', (p, i) => (i === 0 ? 1.5 : 0));
  R.PWRB = chosen('PWRB') || best(rb.slice(0, 3), 'PWRB', (p, i) => (i === 0 ? 1 : 0));
  const rzPool = [...wr.slice(0, 3), ...dep('TE').slice(0, 1), ...rb.slice(0, 1)];
  R.RZ = chosen('RZ') || best(rzPool, 'RZ', (p) => (p.r.ovr - 75) / 3);
  // linebackers: Mike first, then Will, then Sam from who's left
  const lb = dep('LB');
  const taken = new Set();
  R.MIKE = chosen('MIKE') || best(lb.slice(0, 4), 'MIKE', (p) => (p.r.ovr - 70) / 2.5); if (R.MIKE) taken.add(R.MIKE.pid);
  R.WILL = (chosen('WILL') && !taken.has(set.WILL) ? chosen('WILL') : null) || best(lb.slice(0, 4).filter((p) => !taken.has(p.pid)), 'WILL', (p) => (p.r.ovr - 70) / 2.5); if (R.WILL) taken.add(R.WILL.pid);
  R.SAM = (chosen('SAM') && !taken.has(set.SAM) ? chosen('SAM') : null) || best(lb.filter((p) => !taken.has(p.pid)).slice(0, 3), 'SAM', (p) => (p.r.ovr - 70) / 2.5);
  // secondary: nickel = best inside cover man among CB3-ish options; dime = next-best cover DB
  const cb = dep('CB'), sa = dep('S');
  R.NICKEL = chosen('NICKEL') || pickSpecialist(cb.slice(0, 4), 'NICKEL', 2);
  const outside = cb.filter((p) => p !== R.NICKEL).slice(0, 2);
  const busy = new Set([R.NICKEL, ...outside, ...sa.slice(0, 2), R.MIKE, R.WILL].filter(Boolean).map((p) => p.pid));
  const dimeC = [...cb, ...sa].filter((p) => !busy.has(p.pid) && ['CB', 'S'].includes(p.pos)).slice(0, 5);
  const dimeChosen = chosen('DIME');
  R.DIME = dimeChosen && !busy.has(dimeChosen.pid) ? dimeChosen : best(dimeC, 'DIME', (p) => (p.r.ovr - 65) / 3);
  // pass-rush specialist only if someone off the bench out-rushes a starter
  const edge = dep('EDGE'), dt = dep('DT');
  const starters = [...edge.slice(0, 2), ...dt.slice(0, 2)];
  const weakest = Math.min(...starters.map((p) => p.r.a.prs ?? 50), 99);
  const rushC = [...edge.slice(2, 5), ...dt.slice(2, 5), ...lb.filter((p) => !taken.has(p.pid) && p !== R.SAM)].filter((p) => (p.r.a.prs ?? 0) > weakest + 2);
  R.RUSH = chosen('RUSH') || best(rushC, 'RUSH', () => 0);
  return R;
}
function best(list, role, bonus = () => 0) {
  let b = null, bs = -1e9;
  list.forEach((p, i) => { const s = sc(p, ROLES[role].w) + bonus(p, i); if (s > bs) { bs = s; b = p; } });
  return b;
}
// A specialist role (slot / nickel) normally goes to the usual #3, unless someone else in the top four is clearly built
// for the inside job (quick and shifty rather than long and fast) and close to him in quality. Taking a #1 or #2 off
// the outside needs a bigger edge, since he'd be replaced outside by a lesser player.
function pickSpecialist(list, role, prefIdx) {
  const R = ROLES[role];
  const def = list[prefIdx] || list[list.length - 1] || null;
  if (!def) return null;
  const inside = (p) => sc(p, R.w) - sc(p, R.vs) - (p.ht ? (p.ht - 72) * 0.8 : 0);
  let b = def, bs = inside(def);
  list.forEach((p, i) => {
    if (p === def || p.r.ovr < def.r.ovr - 5) return;
    const s = inside(p) - (i < prefIdx ? 6 : 3);
    if (s > bs) { bs = s; b = p; }
  });
  return b;
}
