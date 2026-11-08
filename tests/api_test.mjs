// Exercise every UI-facing API method through a full league year as a human GM.
import fs from 'fs';
import { G } from '../js/engine/core.js';
import * as API from '../js/engine/api.js';
const data = JSON.parse(fs.readFileSync(new URL('../data/league.json', import.meta.url)));
const mode = process.argv[2] || 'preseason';
const fantasy = process.argv[3] === 'fantasy';
let fails = 0;
const ctx = () => ({ tid: G.L.meta.userTids[0], host: true });
function run(name, args = {}) {
  try { const r = API[name](args, ctx(), data); if (r && r.error) console.log(`  ~ ${name}: ${r.error}`); return r; }
  catch (e) { fails++; console.log(`  ✗ ${name} threw: ${e.message}\n${e.stack.split('\n').slice(1, 3).join('\n')}`); return null; }
}
API.newLeague({ start: mode, userTeams: ['DAL'], fantasy, seed: 99, name: 'API test' }, null, data);
const me = () => ctx().tid;
const READS = ['header', 'dashboard', 'teams', 'roster', 'depth', 'standings', 'schedule', 'leaders', 'teamStats', 'newsFeed', 'capSheet', 'faList', 'tradeOffers', 'draftBoard', 'draftState', 'staff', 'finances', 'rulesView', 'history', 'eventsList', 'settings', 'onlineTeams'];
function readAll(label) { for (const r of READS) run(r, { tid: me() }); run('playerStats', { cat: 'passing' }); run('playerStats', { cat: 'defense' }); const ps = Object.values(G.L.players).filter((p) => p.tid === me()).slice(0, 5); for (const p of ps) run('playerDetail', { pid: p.pid }); console.log(`[${label}] reads ok; phase=${G.L.meta.phase} wk=${G.L.meta.week} s=${G.L.meta.season}`); }
if (fantasy) {
  readAll('fantasy');
  let n = 0;
  while (G.L.meta.phase === 'FANTASY_DRAFT' && n++ < 4000) {
    const st = run('fantasyState', {});
    if (st.mineOnClock) run('fantasyMakePick', { pid: st.pool[0].pid }); else run('fantasySim', { all: false });
  }
  console.log('fantasy done ->', G.L.meta.phase, 'roster', Object.values(G.L.players).filter((p) => p.tid === me()).length);
}
readAll('start');
// roster ops
const mine = Object.values(G.L.players).filter((p) => p.tid === me());
const ps1 = mine.find((p) => p.status === 'PS'); if (ps1) run('promoteP', { pid: ps1.pid });
const cut = mine.filter((p) => p.status === 'ACT').sort((a, b) => a.r.ovr - b.r.ovr)[0]; run('releaseP', { pid: cut.pid });
const rs = mine.find((p) => API.playerDetail({ pid: p.pid }, ctx()).restructure); if (rs) console.log('restructure', run('restructureP', { pid: rs.pid }));
run('autoDepthChart', { tid: me() });
run('setDepthChart', { tid: me(), pos: 'QB', pids: G.L.teams[me()].depth.QB.slice().reverse() });
run('autoCutdown', { tid: me() });
// trades
const tgt = Object.values(G.L.players).filter((p) => p.tid >= 0 && p.tid !== me() && p.r.ovr >= 80 && p.pos === 'WR')[0];
const mk = run('tradeMakeItWork', { aiTid: tgt.tid, give: { players: [], picks: [] }, get: { players: [tgt.pid], picks: [] } });
console.log('makeItWork for', tgt.ln, mk.error || `${mk.give.players.map((x) => G.L.players[x].ln).join(',')} + ${mk.give.picks.length} picks; meter ${mk.ev?.meter}`);
if (mk.give) console.log('propose:', run('tradePropose', { aiTid: tgt.tid, give: mk.give, get: mk.get })?.ok);
const tf = run('tradeFind', { give: { players: [Object.values(G.L.players).filter((p) => p.tid === me()).sort((a, b) => b.r.ovr - a.r.ovr)[3].pid], picks: [] }, want: { players: [], picks: [] }, pos: null });
console.log('trade finder results', tf?.length);
// FA in season
const fa = API.faList({}, ctx()).rows[0];
if (fa) console.log('FA offer', run('negotiateP', { pid: fa.pid, offer: { years: 1, apy: fa.ask, gtd: 0 }, mode: 'fa' }));
run('setPrices', { ticket: 180, concessions: 1.1 });
run('saveSettings', { sliders: { injuryRate: 1.2 } });
// sim through the whole year
const steps = [];
let guard = 0;
while (guard++ < 200) {
  const ph = G.L.meta.phase;
  if (ph === 'REGULAR_SEASON' && G.L.meta.week === 5) { readAll('wk5'); const ev = G.L.events.find((e) => e.open && e.tid === me()); if (ev) console.log('event', run('eventResolve', { id: ev.id, choice: ev.choices[0][0] })?.result); }
  if (ph === 'PLAYOFFS' && !steps.includes('po')) { steps.push('po'); readAll('playoffs'); }
  if (ph === 'SEASON_END' && !steps.includes('se')) { steps.push('se'); readAll('season end'); console.log('champ', G.L.champions.at(-1)?.abbr, 'awards MVP', G.L.awards[G.L.meta.season]?.MVP?.[0]?.pid); }
  if (ph === 'RESIGN' && !steps.includes('rs')) {
    steps.push('rs'); readAll('resign');
    const exp = Object.values(G.L.players).filter((p) => p.tid === me() && p.contract && p.contract.exp === G.L.meta.season && !p.contract.ps).sort((a, b) => b.r.ovr - a.r.ovr);
    console.log('expiring', exp.length);
    if (exp[0]) console.log('tag', run('tagP', { pid: exp[0].pid, kind: 'F' }));
    for (const p of exp.slice(1, 4)) { const d = API.playerDetail({ pid: p.pid }, ctx()); let r; for (let i = 0; i < 3; i++) { r = run('negotiateP', { pid: p.pid, offer: { years: d.ask.years, apy: d.ask.apy * (0.9 + i * 0.06), gtd: d.ask.apy * d.ask.years * d.ask.gtdPct }, mode: 'resign' }); if (r?.status === 'accepted' || r?.status === 'refused') break; } console.log(' resign', p.ln, r?.status); }
    const opt = Object.values(G.L.players).find((p) => p.tid === me() && p.contract?.option5 === 'pending');
    if (opt) console.log('option', run('optionP', { pid: opt.pid }));
  }
  if (ph === 'FREE_AGENCY' && !steps.includes('fa')) {
    steps.push('fa'); readAll('fa');
    const best = API.faList({}, ctx()).rows.slice(0, 3);
    for (const f of best) console.log(' FA offer', f.name, f.ovr, run('negotiateP', { pid: f.pid, offer: { years: f.askYears, apy: f.ask * 1.05, gtd: f.ask * f.askYears * 0.4 }, mode: 'fa' })?.message);
    for (let d = 0; d < 5; d++) run('faAdvanceDay', {});
    console.log(' FA log', G.L.fa.log.filter((x) => x.user).length, 'user signings');
  }
  if (ph === 'LEAGUE_MEETING' && !steps.includes('lm')) { steps.push('lm'); readAll('meeting'); const it = G.L.proposals.items[0]; run('vote', { id: it.id, yes: true }); const av = API.rulesView({}, ctx()).available.find((a) => !G.L.proposals.items.some((x) => x.id === a.id)); if (av) console.log('propose', run('propose', { id: av.id })); }
  if (ph === 'DRAFT') {
    if (!steps.includes('dr')) { steps.push('dr'); readAll('draft'); }
    const st = API.draftState({}, ctx());
    if (st.userOnClock) { const b = API.draftBoard({}, ctx()); run('scout', { pid: b.rows[0].pid }); run('draftPick', { pid: b.rows[0].pid }); continue; }
    if (!st.done) { run('draftSim', { all: false }); if (!API.draftState({}, ctx()).userOnClock && !G.L.draft.done) run('draftSim', { all: false }); continue; }
  }
  if (ph === 'POST_DRAFT' && !steps.includes('pd')) { steps.push('pd'); readAll('post draft'); const u = API.faList({}, ctx()).rows.find((r) => r.udfa); if (u) console.log('udfa', run('signMin', { pid: u.pid })?.message); }
  if (ph === 'TRAINING_CAMP' && !steps.includes('tc')) { steps.push('tc'); readAll('camp'); const st = run('staff', {}); if (st.pool[0]) console.log('hire OC', run('hire', { cid: st.pool.find((c) => c.role === 'OC').cid, role: 'OC' })?.ok); }
  if (ph === 'PRESEASON' && steps.includes('tc') && !steps.includes('ps')) { steps.push('ps'); readAll('preseason'); run('autoCutdown', { tid: me() }); }
  if (ph === 'REGULAR_SEASON' && steps.includes('ps')) { readAll('new season'); break; }
  const r = run('sim', { target: ph === 'FREE_AGENCY' ? 'phase' : ph === 'DRAFT' ? 'phase' : 'week' });
  if (r?.error) { console.log('SIM BLOCKED:', r.error); run('autoCutdown', { tid: me() }); }
}
console.log('steps', steps.join(','), 'fails', fails, 'season', G.L.meta.season, G.L.meta.phase);
