import fs from 'fs';
import { G } from '../js/engine/core.js';
import { createLeague } from '../js/engine/league.js';
import { simUntil, advance } from '../js/engine/season.js';
import { computeStandings } from '../js/engine/standings.js';
const data = JSON.parse(fs.readFileSync(new URL('../data/league.json', import.meta.url)));
const mode = process.argv[2] || 'current';
let t0 = Date.now();
const L = createLeague(data, { start: mode, userTeams: [], seed: 6 });
console.log('created in', Date.now() - t0, 'ms; phase', L.meta.phase, 'week', L.meta.week, 'players', Object.keys(L.players).length);
t0 = Date.now();
const r = simUntil('playoffs');
console.log('to playoffs', r, Date.now() - t0, 'ms');
const st = computeStandings();
const tot = { pts: 0, g: 0, pyd: 0, ryd: 0, att: 0, cmp: 0, car: 0, int: 0, sk: 0, to: 0, plays: 0, pen: 0, fga: 0, fgm: 0, pnt: 0, td3: 0, att3: 0, ot: 0, ties: 0 };
for (const g of L.games.filter((g) => g.s === L.meta.season && g.type === 'REG' && g.box)) {
  for (const tb of g.box.tm) { tot.pts += tb.pts; tot.g++; tot.pyd += tb.pyd; tot.ryd += tb.ryd; tot.att += tb.att; tot.cmp += tb.cmp; tot.car += tb.car; tot.int += tb.int; tot.sk += tb.sk; tot.to += tb.to; tot.plays += tb.plays; tot.pen += tb.pen; tot.td3 += tb.td3; tot.att3 += tb.att3; }
  if (g.ot) tot.ot++; if (g.hs === g.as) tot.ties++;
  for (const pid in g.box.pl) { const l = g.box.pl[pid]; tot.fga += l.fga || 0; tot.fgm += l.fgm || 0; tot.pnt += l.pnt || 0; }
}
const n = tot.g;
console.log(`per team-game: pts ${(tot.pts/n).toFixed(1)} plays ${(tot.plays/n).toFixed(1)} pass att ${(tot.att/n).toFixed(1)} cmp% ${(100*tot.cmp/tot.att).toFixed(1)} pyd ${(tot.pyd/n).toFixed(0)} ypa ${(tot.pyd/tot.att).toFixed(2)} car ${(tot.car/n).toFixed(1)} ryd ${(tot.ryd/n).toFixed(0)} ypc ${(tot.ryd/tot.car).toFixed(2)} int ${(tot.int/n).toFixed(2)} sacks ${(tot.sk/n).toFixed(2)} TO ${(tot.to/n).toFixed(2)} pen ${(tot.pen/n).toFixed(1)} FGA ${(tot.fga/n).toFixed(2)} FG% ${(100*tot.fgm/tot.fga).toFixed(1)} punts ${(tot.pnt/n).toFixed(2)} 3rd% ${(100*tot.td3/tot.att3).toFixed(1)} | games ${n/2} OT ${tot.ot} ties ${tot.ties}`);
const rows = L.teams.map((t) => ({ t: t.abbr, w: st[t.tid].w, l: st[t.tid].l, pf: st[t.tid].pf, pa: st[t.tid].pa })).sort((a, b) => b.w - a.w);
console.log(rows.map((x) => `${x.t} ${x.w}-${x.l}`).join(' | '));
// leaders
const s = L.meta.season;
const P = Object.values(L.players).filter((p) => p.stats?.[s]?.REG);
const lead = (k, f = (x) => x) => P.sort((a, b) => (b.stats[s].REG[k] || 0) - (a.stats[s].REG[k] || 0)).slice(0, 5).map((p) => `${p.fn[0]}.${p.ln} ${f(p.stats[s].REG[k])}`).join(', ');
console.log('PYD', lead('pyd')); console.log('PTD', lead('ptd')); console.log('RYD', lead('ryd')); console.log('RECYD', lead('recyd')); console.log('REC', lead('rec')); console.log('SCK', lead('sck', (x) => x.toFixed ? x.toFixed(1) : x)); console.log('INT', lead('dint')); console.log('TKL', lead('tkl'));
const inj = Object.values(L.players).filter((p) => p.injHist?.some((h) => h.s === s && !h.real)).length;
console.log('players injured in sim', inj);
t0 = Date.now();
const r2 = simUntil('seasonEnd'); console.log('playoffs', r2, Date.now() - t0, 'ms', 'champ', L.champions.at(-1));
fs.writeFileSync('/tmp/league_after.json', JSON.stringify(L));
console.log('save size MB', (fs.statSync('/tmp/league_after.json').size / 1e6).toFixed(2));
{
  const st2 = L.history.seasons[2026].standings.map((x) => x.w);
  const mu = st2.reduce((a, b) => a + b, 0) / 32; const sd = Math.sqrt(st2.reduce((a, b) => a + (b - mu) ** 2, 0) / 32);
  console.log('win sd', sd.toFixed(2));
  // sim-only per-game receiving leaders
  const games = L.games.filter((g) => g.s === 2026 && g.type === 'REG' && g.box);
  const agg = {};
  for (const g of games) for (const pid in g.box.pl) { const l = g.box.pl[pid]; const a = (agg[pid] ||= { g: 0, tgt: 0, rec: 0, recyd: 0, pyd: 0, att: 0, ryd: 0, car: 0, sck: 0, dint: 0 }); a.g++; for (const k in a) if (k !== 'g') a[k] += l[k] || 0; }
  const arr = Object.entries(agg).filter(([, a]) => a.g >= 4);
  const top = (k) => arr.sort((x, y) => y[1][k] / y[1].g - x[1][k] / x[1].g).slice(0, 5).map(([pid, a]) => `${L.players[pid].ln} ${(a[k] / a.g).toFixed(1)}`).join(', ');
  console.log('per game (sim only) tgt:', top('tgt')); console.log('recyd:', top('recyd')); console.log('pyd:', top('pyd')); console.log('ryd:', top('ryd')); console.log('sck:', top('sck'));
}
