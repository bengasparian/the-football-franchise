// Team finances, fan happiness, owner goals and GM job security.
import { G, rnd, gauss, clamp, capFor, news } from './core.js';

export function initFinances(t) {
  const m = t.market;
  const base = 110 + Math.log1p(m) * 38; // average ticket ~ $150-200
  t.fin = {
    ticket: Math.round(base), concessions: 1.0, parking: 1.0,
    fanHappy: Math.round(clamp(gauss(62, 12), 25, 95)), hype: 55,
    cash: Math.round((150 + m * 20) * 1e6),
    seasons: {},
    stadiumAge: Math.round(5 + rnd() * 35),
  };
}
// revenue per home game & season totals
export function attendanceFor(t, price = t.fin.ticket) {
  const demand = 0.62 + t.fin.fanHappy / 220 + t.fin.hype / 400 + Math.log1p(t.market) * 0.04;
  const ref = 110 + Math.log1p(t.market) * 38;
  const elastic = Math.exp(-(price - ref) / (ref * 1.1));
  return Math.round(clamp(demand * elastic, 0.55, 1.0) * t.stadium.cap);
}
export function homeGameRevenue(t) {
  const att = attendanceFor(t);
  const gate = att * t.fin.ticket;
  const conc = att * 42 * t.fin.concessions;
  const park = att * 0.3 * 40 * t.fin.parking;
  return { att, gate, conc, park, total: gate + conc + park };
}
export function recordHomeGame(t) {
  const s = G.L.meta.season;
  const r = homeGameRevenue(t);
  const fs = (t.fin.seasons[s] ||= blankSeason());
  fs.gate += r.gate; fs.conc += r.conc + r.park; fs.att += r.att; fs.homeGames++;
}
function blankSeason() { return { gate: 0, conc: 0, att: 0, homeGames: 0, merch: 0, tv: 0, sponsor: 0, salaries: 0, staff: 0, ops: 0, profit: 0 }; }

export function closeSeasonFinances() {
  const Lg = G.L;
  const s = Lg.meta.season;
  for (const t of Lg.teams) {
    const fs = (t.fin.seasons[s] ||= blankSeason());
    fs.tv = Math.round(capFor(s) * 1.45); // national TV/revenue share per club (roughly scales with the cap)
    const stars = Object.values(Lg.players).filter((p) => p.tid === t.tid && p.r.ovr >= 85).reduce((a, p) => a + (p.pers?.media ?? 0.5), 0);
    fs.merch = Math.round((18 + t.market * 2.2 + stars * 6 + t.fin.hype * 0.25) * 1e6);
    fs.sponsor = Math.round((45 + t.market * 6 + t.fin.fanHappy * 0.35) * 1e6);
    fs.salaries = Object.values(Lg.players).filter((p) => p.tid === t.tid && p.contract).reduce((a, p) => a + cashThisYear(p, s), 0);
    fs.staff = ['hc', 'oc', 'dc'].reduce((a, r) => a + (Lg.coaches[t.staff[r]]?.contract.salary || 0), 0) + 25e6 + (t.coachDead || 0);
    fs.ops = Math.round((90 + t.stadium.cap / 1000) * 1e6);
    fs.profit = Math.round(fs.gate + fs.conc + fs.tv + fs.merch + fs.sponsor - fs.salaries - fs.staff - fs.ops);
    t.fin.cash += fs.profit;
    t.coachDead = 0;
  }
}
function cashThisYear(p, s) {
  const c = p.contract;
  if (!c) return 0;
  if (c.ps) return c.ps;
  const y = c.years.find((x) => x.s === s);
  let cash = y ? y.base : 0;
  if (c.signed === s) cash += c.years.reduce((a, x) => a + x.bonus, 0); // signing bonus paid up front
  return cash;
}

// weekly fan happiness / hype from results
export function updateFans(t, won, margin, isPlayoff) {
  const d = (won ? 2.2 : -2.0) + clamp(margin / 10, -1.5, 1.5) + (isPlayoff && won ? 4 : 0);
  t.fin.fanHappy = clamp(Math.round(t.fin.fanHappy + d * 0.8), 5, 100);
  t.fin.hype = clamp(Math.round(t.fin.hype + d * 1.2 + (55 - t.fin.hype) * 0.05), 5, 100);
  const priceRef = 110 + Math.log1p(t.market) * 38;
  if (t.fin.ticket > priceRef * 1.25) t.fin.fanHappy = clamp(t.fin.fanHappy - 1, 5, 100);
}

// ---- Owner goals & job security (user teams)
export function setOwnerGoals(t) {
  const Lg = G.L;
  const ew = t.expectWins ?? 8.5;
  const goals = [];
  goals.push({ id: 'wins', text: `Win at least ${Math.max(4, Math.floor(ew))} games`, target: Math.max(4, Math.floor(ew)), w: 3 });
  if (ew >= 10) goals.push({ id: 'playoffs', text: 'Make the playoffs', w: 3 });
  if (ew >= 11.5) goals.push({ id: 'playoffwin', text: 'Win a playoff game', w: 2 });
  if (ew < 8) goals.push({ id: 'develop', text: 'Develop young talent (3+ players 25 or younger improve 4+ overall)', w: 2 });
  if (t.owner.spend < 0.45) goals.push({ id: 'profit', text: 'Turn a profit this season', w: 1.5 });
  goals.push({ id: 'fans', text: 'Keep fan happiness above 50', w: 1 });
  if (t.fin.ticket) goals.push({ id: 'cap', text: 'Finish the season cap compliant', w: 1 });
  t.goals = goals;
  t.goalSeason = Lg.meta.season;
}
export function evaluateOwner(t, rec, playoffWins, madePlayoffs, devCount) {
  const Lg = G.L;
  const fs = t.fin.seasons[Lg.meta.season] || {};
  let score = 0, tot = 0;
  const res = [];
  for (const g of t.goals || []) {
    let ok = false;
    if (g.id === 'wins') ok = rec.w >= g.target;
    if (g.id === 'playoffs') ok = madePlayoffs;
    if (g.id === 'playoffwin') ok = playoffWins > 0;
    if (g.id === 'develop') ok = devCount >= 3;
    if (g.id === 'profit') ok = (fs.profit || 0) > 0;
    if (g.id === 'fans') ok = t.fin.fanHappy >= 50;
    if (g.id === 'cap') ok = true;
    res.push({ ...g, ok });
    tot += g.w; if (ok) score += g.w;
  }
  const pct = tot ? score / tot : 0.5;
  const pat = (t.owner.patience ?? 0.5) * (Lg.settings.sliders.ownerPatience ?? 1);
  const delta = (pct - 0.55) * 40 + (playoffWins * 4) + (rec.w - (t.expectWins ?? 8.5)) * 1.5;
  t.jobSec = clamp(Math.round(t.jobSec + delta * (1.2 - pat * 0.5)), 0, 100);
  if (playoffWins >= 4) t.jobSec = Math.max(t.jobSec, 95);
  t.goalResults = { s: Lg.meta.season, res, pct, jobSec: t.jobSec };
  if (t.jobSec <= 12) {
    news(`${t.owner.name} has fired the ${t.region} ${t.name} general manager after missing expectations.`, { type: 'fired', tids: [t.tid], big: true });
    return { fired: true };
  }
  if (t.jobSec <= 30) news(`Reports: ${t.owner.name} is losing patience with the ${t.name} front office.`, { type: 'hotseat', tids: [t.tid] });
  return { fired: false };
}
