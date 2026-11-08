import fs from 'fs';
import { G } from '../js/engine/core.js';
import { createLeague } from '../js/engine/league.js';
import { simUntil } from '../js/engine/season.js';
import { teamCap, capSeason } from '../js/engine/contracts.js';
import { capFor, age } from '../js/engine/core.js';
const data = JSON.parse(fs.readFileSync(new URL('../data/league.json', import.meta.url)));
const L = createLeague(data, { start: process.argv[2] || 'current', userTeams: [], seed: +(process.argv[3] || 7) });
const yrs = +(process.argv[4] || 6);
function report(label) {
  const act = Object.values(L.players).filter((p) => p.tid >= 0 && p.status !== 'PS');
  const o = act.map((p) => p.r.ovr);
  const c = (x) => o.filter((v) => v >= x).length;
  const caps = L.teams.map((t) => teamCap(t.tid, capSeason()));
  const over = caps.filter((c) => c.space < 0).length;
  const sizes = L.teams.map((t) => Object.values(L.players).filter((p) => p.tid === t.tid && p.status === 'ACT').length);
  const ps = L.teams.map((t) => Object.values(L.players).filter((p) => p.tid === t.tid && p.status === 'PS').length);
  const topApy = Object.values(L.players).filter((p) => p.contract && !p.contract.ps).sort((a, b) => b.contract.apy - a.contract.apy).slice(0, 3).map((p) => `${p.ln}(${p.pos}) ${(p.contract.apy / 1e6).toFixed(1)}M`);
  const qbs = act.filter((p) => p.pos === 'QB').sort((a, b) => b.r.ovr - a.r.ovr).slice(0, 4).map((p) => `${p.ln} ${p.r.ovr}(${age(p)})`);
  const rook = Object.values(L.players).filter((p) => p.draft?.y === L.meta.season && p.tid >= 0).sort((a, b) => b.r.ovr - a.r.ovr).slice(0, 3).map((p) => `${p.fn} ${p.ln} ${p.pos} ${p.r.ovr}`);
  console.log(`${label} s=${L.meta.season} ph=${L.meta.phase} | n=${act.length} 90+=${c(90)} 85+=${c(85)} 80+=${c(80)} 70+=${c(70)} mean=${(o.reduce((a,b)=>a+b,0)/o.length).toFixed(1)} | cap ${(capFor(capSeason())/1e6).toFixed(1)}M over=${over} minSpace=${(Math.min(...caps.map((c)=>c.space))/1e6).toFixed(1)}M | act ${Math.min(...sizes)}-${Math.max(...sizes)} ps ${Math.min(...ps)}-${Math.max(...ps)} | FA ${Object.values(L.players).filter(p=>p.tid===-1).length} RET ${Object.values(L.players).filter(p=>p.tid===-3).length} total ${Object.keys(L.players).length}`);
  console.log('   top$', topApy.join(', '), '| QBs', qbs.join(', '), '| rookies', rook.join(', '));
}
report('start');
for (let y = 0; y < yrs; y++) {
  const t0 = Date.now();
  let r = simUntil('nextSeason');
  if (r.error) { console.log('ERROR', r.error, L.meta.phase, L.meta.week); break; }
  report(`yr${y + 1} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  console.log('   champ', L.champions.at(-1)?.abbr, 'trades', (L.tradeLog || []).filter((x) => x.s === L.meta.season - 1 || x.s === L.meta.season).length, 'MVP', L.awards[L.meta.season - 1]?.MVP?.[0] && L.players[L.awards[L.meta.season - 1].MVP[0].pid].ln);
}
fs.writeFileSync('/tmp/multi.json', JSON.stringify(L));
console.log('save MB', (fs.statSync('/tmp/multi.json').size / 1e6).toFixed(2));
