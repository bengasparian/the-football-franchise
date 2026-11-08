// Team & league pages
import { call, session, net } from './client.js';
import { esc, $, $$, money, pct, ht, ovr, delta, hs, logo, pname, injBadge, moraleTxt, meter, contractTxt, table, modal, closeModal, toast, sparkline, bars } from './ui.js';
import { APP, act, rerender, render } from './app.js';

export const PAGES = {};
export const ACTIONS = {};
const POS = ['QB', 'RB', 'FB', 'WR', 'TE', 'OT', 'OG', 'C', 'EDGE', 'DT', 'LB', 'CB', 'S', 'K', 'P', 'LS'];
const teamOf = (tid) => APP.teams?.[tid];
const posSel = (cur, change, extra = '') => `<select data-change="${change}" ${extra}><option value="ALL">All positions</option>${POS.map((p) => `<option ${cur === p ? 'selected' : ''}>${p}</option>`).join('')}</select>`;

// ===================================================================== HOME
PAGES.home = async () => {
  const d = await call('dashboard', { tid: session.tid });
  const t = d.team;
  const rec = d.rec;
  const nx = d.next;
  const gameRow = (g) => { const home = g.h === t.tid; const my = home ? g.hs : g.as, op = home ? g.as : g.hs; const res = my > op ? 'W' : my < op ? 'L' : 'T'; return `<div class="row" style="justify-content:space-between;padding:4px 0"><span class="muted small">${g.label === 'Regular Season' ? `Wk ${g.w}` : esc(g.label)}</span><span>${home ? 'vs' : '@'} ${logo(home ? g.aLogo : g.hLogo, 'sm')} ${home ? g.aAbbr : g.hAbbr}</span><a href="#/game/${g.gid}" class="b ${res === 'W' ? 'good' : res === 'L' ? 'bad' : ''}">${res} ${my}-${op}</a></div>`; };
  const ev = d.events.map((e) => `<div class="evt"><h4>⚠️ ${esc(e.title)}</h4><div class="small" style="margin-bottom:8px">${esc(e.text)}</div><div class="row">${e.choices.map(([k, l]) => `<button class="btn sm" data-act="evt" data-id="${e.id}" data-c="${k}">${esc(l)}</button>`).join('')}</div></div>`).join('');
  const offers = d.offers.map((o) => `<div class="evt" style="border-color:var(--accent);background:#0d1d38"><h4>📨 Trade offer from ${logo(o.from.logo, 'sm')} ${esc(o.from.abbr)}</h4><div class="small">They want: <b>${o.getV.players.map((p) => esc(p.name)).join(', ')}${o.getV.picks.map((p) => esc(p.label)).join(', ')}</b><br>They give: <b>${[...o.giveV.players.map((p) => `${esc(p.name)} (${p.pos} ${p.ovr})`), ...o.giveV.picks.map((p) => esc(p.label))].join(', ')}</b></div><div class="row" style="margin-top:8px"><button class="btn sm pri" data-act="respondOffer" data-id="${o.id}" data-a="1">Accept</button><button class="btn sm" data-act="respondOffer" data-id="${o.id}" data-a="0">Decline</button></div></div>`).join('');
  const goals = (t.goals || []).map((g) => `<div class="small">• ${esc(g.text)}</div>`).join('') || '<div class="muted small">Goals are set at training camp.</div>';
  const ph = d.phase;
  const div = d.divStand.findIndex((x) => x.tid === t.tid) + 1;
  const sec = t.jobSec < 30 ? 'bad' : t.jobSec < 55 ? 'warn' : 'good';
  const tile = (href, ic, tt, tv, ts, cls = '', tip = '') => `<a class="tile ${cls}" href="${href}" title="${esc(tip)}"><span class="ti">${ic}</span><span class="tt">${tt}</span><span class="tv">${tv}</span><span class="ts">${ts}</span></a>`;
  const phaseTile = {
    FREE_AGENCY: tile('#/fa', '✍️', 'Free Agency', 'LIVE', 'Make offers before rival teams do', 'accent', 'Open the free agent market'),
    DRAFT: tile('#/draft', '🎯', 'NFL Draft', 'ON THE CLOCK', 'Make your picks', 'accent', 'Open the draft room'),
    LEAGUE_MEETING: tile('#/rules', '🗳️', 'League Meeting', 'VOTE', 'Rule proposals need 24 of 32 votes', 'accent', 'Vote on rule changes'),
    FANTASY_DRAFT: tile('#/fantasy', '🎲', 'Fantasy Draft', 'LIVE', 'Build your team from scratch', 'accent', 'Open the fantasy draft room'),
    RESIGN: tile('#/home', '📝', 'Re-sign Players', `${d.expiring.length} expiring`, 'Re-sign, tag or let them walk', 'accent', 'Your expiring contracts are listed below'),
  }[ph] || tile('#/trade', '🔁', 'Trade Center', 'TRADE', ph === 'REGULAR_SEASON' && d.week > 9 ? 'Deadline passed. Reopens in the offseason' : 'Build a deal with any team', '', 'Open the trade center');
  const next = nx ? `<a class="tile big" style="--tc1:${esc(t.c1)}" href="#/schedule" title="Your schedule and results"><span class="tt">${esc(nx.label)}${nx.type === 'REG' ? ` · Week ${nx.w}` : ''}</span>
      <div class="match"><div class="tm">${logo(nx.aLogo, 'lg')}<div>${esc(nx.aAbbr)}</div></div><div class="vs">@</div><div class="tm">${logo(nx.hLogo, 'lg')}<div>${esc(nx.hAbbr)}</div></div></div>
      <span class="ts">Click <b>Advance</b> in the top bar to play it</span></a>`
    : `<a class="tile big" style="--tc1:${esc(t.c1)}" href="#/schedule"><span class="tt">${d.season} · ${esc(APP.header.phaseLabel)}</span><div class="match">${logo(t.logo, 'lg')}</div><span class="tv">${esc(t.region)} ${esc(t.name)}</span><span class="ts">${esc(APP.header.next || 'Use Advance in the top bar to move to the next phase')}</span></a>`;
  return `
  <div class="hub">
    ${next}
    ${tile('#/standings', '🏆', 'Record', `${rec.w}-${rec.l}${rec.t ? '-' + rec.t : ''}`, `${div ? `${ordinal(div)} in ` : ''}${esc(t.conf)} ${esc(t.div)} · Power #${t.rank ?? '—'}`, '', 'Standings, playoff picture and power rankings')}
    ${tile('#/roster', '🏈', 'Team Overall', t.ovr.ovr, `Off ${t.ovr.off} · Def ${t.ovr.def} · ${t.mode === 'contend' ? 'Contending' : t.mode === 'rebuild' ? 'Rebuilding' : 'Middle of the pack'}`, '', 'Your roster')}
    ${tile('#/cap', '💰', 'Cap Space', `<span class="${d.cap.space < 0 ? 'bad' : ''}">${money(d.cap.space)}</span>`, 'Salary cap, dead money and restructures', '', 'Open the salary cap sheet')}
    ${tile('#/owner', '👔', 'Job Security', `<span class="${sec}">${t.jobSec}</span>`, `Chemistry ${t.chem} · Fans ${t.fanHappy}`, '', 'Owner goals, finances and job security')}
    ${phaseTile}
    ${tile('#/depth', '📋', 'Depth Chart', 'Set lineup', 'Who starts at every position', '', 'Edit your depth chart')}
    ${tile('#/staff', '🧢', 'Coaching Staff', d.staff[0] ? esc(d.staff[0].name.split(' ').slice(-1)[0]) : 'Staff', d.staff.map((c) => `${c.role} ${c.ovr || ''}`).join(' · '), '', 'Hire and fire coaches')}
    ${tile('#/stats', '📊', 'League Leaders', 'Stats', 'Players, teams and records', '', 'League stats and leaders')}
  </div>
  ${APP.header.blocker ? `<div class="card" style="border-color:var(--bad)"><b class="bad">Action needed:</b> ${esc(APP.header.blocker)} <a class="btn sm" href="#/roster">Go to roster</a></div>` : ''}
  ${ev || offers ? `<div class="secttl">Needs your attention</div><div class="card">${ev}${offers}</div>` : ''}
  ${d.expiring.length ? `<div class="card" style="border-color:var(--warn)"><h2>Expiring contracts (${d.expiring.length})</h2><div class="small muted" style="margin-bottom:8px">Re-sign, tag or let them walk. Anyone unsigned when free agency opens hits the open market.${d.tagUsed ? ' You have used your tag this year.' : ''}</div>${d.expiring.map((p) => `<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding:5px 0">${pname(p)}<span>${ovr(p.ovr)}</span><span class="small muted">Age ${p.age} · asks ${money(p.ask)}/yr</span><button class="btn sm pri" data-act="negotiate" data-pid="${esc(p.pid)}" data-mode="resign" title="Open contract talks with this player">Negotiate</button></div>`).join('')}</div>` : ''}
  <div class="secttl">Franchise</div>
  <div class="grid g3">
    <div class="card"><h2>Results</h2>${d.last.map(gameRow).join('') || '<div class="muted small">No games yet.</div>'}<a class="small" href="#/schedule">Full schedule →</a></div>
    <div class="card"><h2>${esc(t.conf)} ${esc(t.div)}</h2>${d.divStand.map((x, i) => `<div class="row" style="justify-content:space-between;padding:4px 0;${x.tid === t.tid ? 'font-weight:700' : ''}"><span>${i + 1}. ${logo(x.logo, 'sm')} <a href="#/team/${x.tid}">${esc(x.region)} ${esc(x.name)}</a></span><span>${x.w}-${x.l}${x.t ? '-' + x.t : ''}</span></div>`).join('')}<a class="small" href="#/standings">Full standings →</a></div>
    <div class="card"><h2>Owner goals</h2>${goals}<div style="margin-top:10px" class="small muted">Job security</div>${meter(t.jobSec, 100, t.jobSec < 30 ? 'var(--bad)' : t.jobSec < 55 ? 'var(--warn)' : 'var(--good)')}<a class="small" href="#/owner">Details →</a></div>
  </div>
  <div class="grid g2">
    <div class="card"><h2>Top players</h2>${d.top.map((p) => `<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding:5px 0">${pname(p)}<span class="small muted">${esc(p.line)}</span><span>${ovr(p.ovr)}${delta(p.ovrDelta)}</span></div>`).join('')}</div>
    <div class="card"><h2>Trending</h2><div class="grid g2"><div><h3>Rising ↑</h3>${d.rising.map((p) => `<div class="row" style="justify-content:space-between;padding:4px 0">${pname(p, { img: false })}<span>${ovr(p.ovr)}${delta(p.ovrDelta)}</span></div>`).join('') || '<div class="muted small">No movement yet. Ratings change slowly, after a few games of sustained play.</div>'}</div><div><h3>Falling ↓</h3>${d.falling.map((p) => `<div class="row" style="justify-content:space-between;padding:4px 0">${pname(p, { img: false })}<span>${ovr(p.ovr)}${delta(p.ovrDelta)}</span></div>`).join('') || '<div class="muted small">—</div>'}</div></div>
      <h3 style="margin-top:10px">Injuries (${d.injured.length})</h3>${d.injured.slice(0, 8).map((p) => `<div class="row small" style="justify-content:space-between">${pname(p, { img: false })}<span>${esc(p.inj.type)} ${injBadge(p)}</span></div>`).join('') || '<div class="muted small">Healthy!</div>'}</div>
  </div>
  <div class="grid g21"><div class="card"><h2>News</h2>${newsList(d.news)}</div>
  <div class="card"><h2>Roster</h2><div class="small">Active ${d.counts.ACT || 0}/53 · Practice squad ${d.counts.PS || 0} · IR ${d.counts.IR || 0}</div><a class="small" href="#/roster">Manage roster →</a></div></div>`;
};
const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
export function newsList(items) {
  if (!items.length) return '<div class="muted">No news yet.</div>';
  return items.map((n) => `<div class="news-item ${n.big ? 'big' : ''}"><div class="t">${n.s} ${n.ph === 'REGULAR_SEASON' ? `W${n.w}` : esc(shortPh(n.ph))}</div><div class="x">${esc(n.text)}</div></div>`).join('');
}
const shortPh = (p) => ({ PLAYOFFS: 'Post', SEASON_END: 'Off', RESIGN: 'Off', FREE_AGENCY: 'FA', LEAGUE_MEETING: 'Mtg', DRAFT: 'Draft', POST_DRAFT: 'Draft', TRAINING_CAMP: 'Camp', PRESEASON: 'Pre', FANTASY_DRAFT: 'Draft' }[p] || '');
ACTIONS.evt = async (el) => { const r = await call('eventResolve', { id: el.dataset.id, choice: el.dataset.c }); if (r.error) return toast(esc(r.error), 'error'); toast(esc(r.result), 'good', 6000); if (r.nav) location.hash = r.nav; else rerender(); };
ACTIONS.respondOffer = async (el) => { await act('respondOffer', { id: el.dataset.id, accept: el.dataset.a === '1' }, { msg: el.dataset.a === '1' ? 'Trade completed!' : 'Offer declined.' }); };

// ===================================================================== ROSTER
let rosterTab = 'ACT';
PAGES.roster = async ([tidS]) => {
  const tid = tidS != null && tidS !== '' ? +tidS : session.tid;
  const r = await call('roster', { tid });
  const mine = r.mine;
  const list = r.players.filter((p) => rosterTab === 'ALL' || p.status === rosterTab);
  const cols = [
    { k: 'jn', l: '#', num: true },
    { k: 'name', l: 'Player', f: (p) => pname(p, { sub: `${p.pos}${p.depthIdx >= 0 ? ` · ${p.pos}${p.depthIdx + 1}` : ''}` }), sortv: (p) => p.ln },
    { k: 'pos', l: 'Pos', sortv: (p) => POS.indexOf(p.pos) },
    { k: 'age', l: 'Age', num: true },
    { k: 'ovr', l: 'OVR', f: (p) => `${ovr(p.ovr)}${delta(p.ovrDelta)}`, num: true },
    { k: 'pot', l: 'Pot', f: (p) => esc(p.pot || '—') },
    { k: 'exp', l: 'Exp', num: true },
    { k: 'line', l: 'Season', f: (p) => `<span class="small muted">${esc(p.line)}</span>`, nosort: true },
    { k: 'contract', l: 'Contract', f: (p) => contractTxt(p.contract), sortv: (p) => p.contract?.apy || 0 },
    { k: 'morale', l: 'Morale', f: (p) => moraleTxt(p.morale) },
    { k: 'st', l: '', f: (p) => `${injBadge(p)} ${p.tradeReq ? '<span class="badge red">TRADE REQ</span>' : ''} ${p.onBlock ? '<span class="badge yel">BLOCK</span>' : ''}`, nosort: true },
  ];
  if (mine) cols.push({ k: 'act', l: '', nosort: true, f: (p) => rosterActions(p, r) });
  const tabs = [['ACT', `Active (${r.counts.ACT || 0}/${r.rules.activeMax})`], ['PS', `Practice Squad (${r.counts.PS || 0}/${r.rules.psMax})`], ['IR', `Injured Reserve (${r.counts.IR || 0})`], ['ALL', 'All']];
  return `<div class="page-h">${logo(r.team.logo, 'md')}<h1>${esc(r.team.region)} ${esc(r.team.name)} Roster</h1><span class="sub">Team OVR ${r.team.ovr.ovr} · Cap space ${money(r.cap.space)}</span>
    <div class="right">${mine ? `<button class="btn" data-act="autoCut" data-tid="${tid}">Auto cutdown to ${r.rules.activeMax}</button>` : `<a class="btn" href="#/trade/${tid}">Trade with ${esc(r.team.abbr)}</a>`}<select data-change="rosterTeam">${(APP.teams || []).map((t) => `<option value="${t.tid}" ${t.tid === tid ? 'selected' : ''}>${esc(t.abbr)}</option>`).join('')}</select></div></div>
    <div class="tabs">${tabs.map(([k, l]) => `<a class="${rosterTab === k ? 'on' : ''}" data-act="rosterTab" data-k="${k}">${l}</a>`).join('')}</div>
    ${table({ cols, rows: list.map((p) => ({ ...p, _cls: p.status === 'IR' ? 'dim' : '' })), sort: { k: 'ovr', dir: 'desc' }, id: 'roster' })}`;
};
function rosterActions(p, r) {
  const b = [];
  if (p.status === 'ACT') { b.push(`<button class="btn sm" data-act="toPS" data-pid="${esc(p.pid)}" title="Move to practice squad">PS</button>`); if (p.inj && (p.inj.wk >= r.rules.irMinGames || p.inj.se)) b.push(`<button class="btn sm" data-act="ir" data-pid="${esc(p.pid)}">IR</button>`); }
  if (p.status === 'PS') b.push(`<button class="btn sm" data-act="promote" data-pid="${esc(p.pid)}">Promote</button>`);
  if (p.status === 'IR' && !(p.inj && p.inj.wk > 0)) b.push(`<button class="btn sm" data-act="activate" data-pid="${esc(p.pid)}">Activate</button>`);
  b.push(`<button class="btn sm danger" data-act="releaseAsk" data-pid="${esc(p.pid)}">Release</button>`);
  return `<div class="row" style="gap:4px;flex-wrap:nowrap">${b.join('')}</div>`;
}
ACTIONS.rosterTab = (el) => { rosterTab = el.dataset.k; rerender(); };
ACTIONS.rosterTeam = (el) => { location.hash = `#/roster/${el.value}`; };
ACTIONS.autoCut = async (el) => { if (confirm('Let the coaching staff trim the roster? Lowest-value players go to the practice squad or are released.')) await act('autoCutdown', { tid: +el.dataset.tid }, { msg: 'Roster trimmed.' }); };
ACTIONS.toPS = async (el) => act('toPS', { pid: el.dataset.pid }, { msg: 'Moved to practice squad.' });
ACTIONS.promote = async (el) => act('promoteP', { pid: el.dataset.pid }, { msg: 'Promoted to the active roster.' });
ACTIONS.ir = async (el) => act('irP', { pid: el.dataset.pid }, { msg: 'Placed on IR.' });
ACTIONS.activate = async (el) => act('activateP', { pid: el.dataset.pid }, { msg: 'Activated from IR.' });
ACTIONS.releaseAsk = async (el) => {
  const p = await call('playerDetail', { pid: el.dataset.pid });
  const d = p.dead || { now: 0, next: 0, save: 0 }, d1 = p.deadJune1 || d;
  modal(`Release ${esc(p.name)}?`, `<p>${pname(p)}</p><div class="kv"><div>Dead money now</div><div class="bad">${money(d.now)}</div><div>Cap savings this year</div><div class="good">${money(d.save)}</div><div>Post-June 1 designation</div><div>${money(d1.now)} now + ${money(d1.next)} next year</div></div>
    <div class="row" style="margin-top:14px"><button class="btn danger" data-act="release" data-pid="${esc(p.pid)}">Release</button>${d1.next ? `<button class="btn" data-act="release" data-pid="${esc(p.pid)}" data-j="1">Release (post-June 1)</button>` : ''}<button class="btn ghost" data-act="closeModal">Cancel</button></div>`, { narrow: true });
};
ACTIONS.release = async (el) => { closeModal(); await act('releaseP', { pid: el.dataset.pid, june1: el.dataset.j === '1' }, { msg: 'Player released.' }); };

// ===================================================================== TEAMS & TEAM PAGE
PAGES.teams = async () => {
  const ts = await call('teams');
  APP.teams = ts;
  return `<div class="page-h"><h1>Teams</h1></div>${table({ id: 'teams', sort: { k: 'rank', dir: 'asc' }, onRow: (t) => `#/team/${t.tid}`, rows: ts.map((t) => ({ ...t, _cls: t.user ? 'me' : '' })), cols: [
    { k: 'rank', l: 'Pwr', num: true }, { k: 'name', l: 'Team', f: (t) => `<div class="pname">${logo(t.logo)}<b>${esc(t.region)} ${esc(t.name)}</b></div>` },
    { k: 'conf', l: 'Div', f: (t) => `${t.conf} ${t.div}` }, { k: 'w', l: 'W-L', f: (t) => `${t.w}-${t.l}${t.t ? '-' + t.t : ''}` }, { k: 'ovr', l: 'OVR', num: true, f: (t) => ovr(t.ovr) }, { k: 'cap', l: 'Cap space', num: true, f: (t) => money(t.cap) }] })}`;
};
PAGES.team = async ([tidS]) => {
  const tid = +tidS;
  const [r, sc, st] = await Promise.all([call('roster', { tid }), call('schedule', { tid }), call('staff', { tid })]);
  const best = [...r.players].filter((p) => p.status !== 'PS').sort((a, b) => b.ovr - a.ovr).slice(0, 12);
  return `<div class="hero-team" style="--tc1:${esc(r.team.c1)}">${logo(r.team.logo, 'lg')}<div><h1>${esc(r.team.region)} ${esc(r.team.name)}</h1><div class="small muted">${esc(r.team.conf)} ${esc(r.team.div)} · HC ${esc(st.hc?.name || 'Vacant')} · OC ${esc(st.oc?.name || '—')} · DC ${esc(st.dc?.name || '—')}</div></div>
    <div class="stats"><div><div class="l">Team OVR</div><div class="v">${r.team.ovr.ovr}</div></div><div><div class="l">QB</div><div class="v">${r.team.ovr.qb}</div></div><div><div class="l">Cap space</div><div class="v">${money(r.cap.space)}</div></div></div></div>
    <div class="row" style="margin-bottom:14px"><a class="btn" href="#/roster/${tid}">Full roster</a><a class="btn" href="#/cap/${tid}">Cap sheet</a><a class="btn" href="#/trade/${tid}">Trade with ${esc(r.team.abbr)}</a><a class="btn" href="#/schedule/${tid}">Schedule</a></div>
    <div class="grid g2"><div class="card"><h2>Best players</h2>${best.map((p) => `<div class="row" style="justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--line)">${pname(p)}<span class="small muted">${contractTxt(p.contract)}</span>${ovr(p.ovr)}</div>`).join('')}</div>
    <div class="card"><h2>${sc.season} schedule</h2>${scheduleRows(sc.games, tid)}</div></div>`;
};

// ===================================================================== PLAYER
let playerTab = 'ratings';
PAGES.player = async ([pid]) => {
  const p = await call('playerDetail', { pid });
  if (p.error) return `<div class="card">${esc(p.error)}</div>`;
  const t = p.team;
  const tabs = [['ratings', p.status === 'PROSPECT' ? 'Scouting' : 'Ratings'], ['stats', 'Stats'], ['contract', 'Contract'], ['persona', 'Personality'], ['history', 'History']];
  const age = p.age;
  let body = '';
  if (playerTab === 'ratings') body = p.status === 'PROSPECT' ? prospectTab(p) : ratingsTab(p);
  if (playerTab === 'stats') body = statsTab(p);
  if (playerTab === 'contract') body = contractTab(p);
  if (playerTab === 'persona') body = personaTab(p);
  if (playerTab === 'history') body = historyTab(p);
  const dr = p.draft ? (p.draft.r ? `${p.draft.y} Rd ${p.draft.r}, #${p.draft.p}${p.draft.tm ? ` (${esc(p.draft.tm)})` : ''}` : `${p.draft.y} UDFA`) : 'Undrafted';
  return `<div class="hero-team" style="--tc1:${esc(t?.c1 || '#1e293b')}">${hs(p.hs, 'lg')}<div><div class="small" style="color:rgba(255,255,255,.75)">${t ? `${logo(t.logo, 'sm')} <a href="#/team/${t.tid}" style="color:#fff">${esc(t.region)} ${esc(t.name)}</a>` : esc(p.status === 'PROSPECT' ? 'Draft prospect' : p.status === 'RET' ? 'Retired' : 'Free agent')} ${p.jn != null ? `· #${p.jn}` : ''}</div>
    <h1>${esc(p.name)}</h1><div class="small" style="color:rgba(255,255,255,.85)">${esc(p.pos)} · Age ${age} · ${ht(p.ht)}, ${p.wt || '—'} lbs · ${esc(p.college || '—')} · ${dr} · ${p.exp} yrs exp</div>
    <div class="row" style="margin-top:6px">${injBadge(p)} ${p.holdout ? '' : ''} ${p.tradeReq ? '<span class="badge red">Requested trade</span>' : ''} ${p.hof ? `<span class="badge pur">Hall of Fame ${p.hof}</span>` : ''} ${(p.pers || []).slice(0, 3).map((x) => `<span class="badge blu" title="${esc(x.d)}">${esc(x.l)}</span>`).join(' ')}</div></div>
    <div class="stats">${p.status !== 'PROSPECT' ? `<div><div class="l">Overall</div><div class="v">${ovr(p.ovr, 'lg')}${delta(p.ovrDelta)}</div></div><div><div class="l">Potential</div><div class="v" style="font-size:20px">${esc(p.pot || 'Established')}</div></div>` : `<div><div class="l">Big board</div><div class="v">${p.scouted ? '' : ''}</div></div>`}<div><div class="l">Morale</div><div class="v" style="font-size:18px">${moraleTxt(p.morale)}</div></div>${p.contract ? `<div><div class="l">Contract</div><div class="v" style="font-size:20px">${money(p.contract.apy)}<span class="small"> /yr</span></div><div class="small">thru ${p.contract.exp}</div></div>` : ''}</div></div>
    ${playerButtons(p)}
    <div class="tabs">${tabs.map(([k, l]) => `<a class="${playerTab === k ? 'on' : ''}" data-act="ptab" data-k="${k}">${l}</a>`).join('')}</div>${body}`;
};
ACTIONS.ptab = (el) => { playerTab = el.dataset.k; rerender(); };
function playerButtons(p) {
  const b = [];
  if (p.isFA && APP.header.phase !== 'FANTASY_DRAFT') { b.push(`<button class="btn pri" data-act="negotiate" data-pid="${esc(p.pid)}" data-mode="fa">Make an offer</button>`); b.push(`<button class="btn" data-act="signMin" data-pid="${esc(p.pid)}">Sign (min)</button>`); if ((p.exp ?? 0) <= 2 || true) b.push(`<button class="btn" data-act="signPS" data-pid="${esc(p.pid)}">Sign to PS</button>`); }
  if (p.mine) {
    if (p.expiring) b.push(`<button class="btn pri" data-act="negotiate" data-pid="${esc(p.pid)}" data-mode="resign">Re-sign</button>`);
    else if (p.canExtend) b.push(`<button class="btn pri" data-act="negotiate" data-pid="${esc(p.pid)}" data-mode="extend">Extend</button>`);
    if (p.canTag) b.push(`<button class="btn" data-act="tag" data-pid="${esc(p.pid)}" data-k="F">Franchise tag (${money(p.tagVals?.F)})</button><button class="btn" data-act="tag" data-pid="${esc(p.pid)}" data-k="T">Transition tag (${money(p.tagVals?.T)})</button>`);
    if (p.option5) b.push(`<button class="btn" data-act="option5" data-pid="${esc(p.pid)}">Exercise 5th-year option (${money(p.option5)})</button><button class="btn ghost" data-act="declineOpt" data-pid="${esc(p.pid)}">Decline option</button>`);
    if (p.restructure) b.push(`<button class="btn" data-act="restructure" data-pid="${esc(p.pid)}" title="Convert ${money(p.restructure.convert)} of salary into a bonus">Restructure (+${money(p.restructure.saves)} space)</button>`);
    b.push(`<button class="btn" data-act="block" data-pid="${esc(p.pid)}">${p.onBlock ? 'Remove from trade block' : 'Put on trade block'}</button>`);
    b.push(`<button class="btn danger" data-act="releaseAsk" data-pid="${esc(p.pid)}">Release</button>`);
  } else if (p.team && !p.mine) b.push(`<a class="btn" href="#/trade/${p.team.tid}?want=${encodeURIComponent(p.pid)}" data-act="tradeFor" data-pid="${esc(p.pid)}" data-tid="${p.team.tid}">Trade for ${esc(p.ln)}</a>`);
  if (p.status === 'PROSPECT') b.push(`<button class="btn pri" data-act="scout" data-pid="${esc(p.pid)}" ${p.scoutLvl >= 3 ? 'disabled' : ''}>${p.scoutLvl >= 3 ? 'Fully scouted' : `Scout (${p.scoutCost} pts)`}</button><button class="btn" data-act="boardToggle" data-pid="${esc(p.pid)}">Add/remove from my board</button>`);
  return b.length ? `<div class="row" style="margin-bottom:14px">${b.join('')}</div>` : '';
}
function attrColor(v) { return v >= 90 ? '#a855f7' : v >= 80 ? '#22c55e' : v >= 70 ? '#3b82f6' : v >= 60 ? '#64748b' : '#475569'; }
function ratingsTab(p) {
  const a = p.ratings.attrs;
  const keys = Object.keys(a).sort((x, y) => (a[y].key - a[x].key) || a[y].v - a[x].v);
  const groups = { Physical: ['spd', 'acc', 'agi', 'str', 'jmp', 'sta', 'inj'], Mental: ['awr', 'dec'], Passing: ['thp', 'tas', 'tad', 'poc'], 'Ball carrier': ['car', 'elu', 'btk', 'vis'], Receiving: ['cth', 'rte', 'rel', 'cit'], Blocking: ['rbk', 'pbk'], Defense: ['prs', 'bsh', 'tak', 'pur', 'mcv', 'zcv', 'hwk'], Kicking: ['kpw', 'kac'] };
  const row = (k) => `<div class="attr ${a[k].key ? 'key' : ''}"><span class="nm">${esc(a[k].name)}</span><div class="bar"><i style="width:${a[k].v}%;background:${attrColor(a[k].v)}"></i></div><b class="num">${a[k].v}</b></div>`;
  const hist = p.ratings.hist.map((h) => h.o);
  const cmb = p.combine || null;
  return `<div class="grid g21"><div class="card"><h2>Key ratings for ${esc(p.pos)}</h2>${keys.filter((k) => a[k].key).map(row).join('')}<h3 style="margin-top:14px">All attributes</h3><div class="grid g2">${Object.entries(groups).map(([g, ks]) => `<div><div class="tiny muted" style="margin:6px 0 2px;text-transform:uppercase">${g}</div>${ks.filter((k) => a[k]).map(row).join('')}</div>`).join('')}</div></div>
    <div><div class="card"><h2>Overall history</h2>${sparkline(hist, { min: Math.min(...hist) - 3, max: Math.max(...hist) + 3 })}<div class="small muted">Start of season ${p.ratings.start ?? p.ovr} → now ${p.ovr}. Ratings move with on-field production in your league and with age, work ethic, coaching and luck in the offseason.</div></div>
    <div class="card"><h2>Scouting report</h2><div class="kv"><div>Potential</div><div>${esc(p.pot || 'Established veteran')}</div><div>Market value</div><div>${money(p.marketValue)}/yr</div><div>Trade value</div><div>${p.tradeValue ?? '—'} pts</div><div>Real Pro Bowls / All-Pros</div><div>${p.realPB || 0} / ${p.realAP || 0}</div></div>
    ${cmb && Object.keys(cmb).length ? `<h3 style="margin-top:10px">Combine</h3><div class="kv small">${cmb.forty ? `<div>40-yard</div><div>${cmb.forty}s</div>` : ''}${cmb.vertical ? `<div>Vertical</div><div>${cmb.vertical}"</div>` : ''}${cmb.bench ? `<div>Bench</div><div>${cmb.bench} reps</div>` : ''}${cmb.broad_jump ? `<div>Broad</div><div>${cmb.broad_jump}"</div>` : ''}${cmb.cone ? `<div>3-cone</div><div>${cmb.cone}s</div>` : ''}${cmb.shuttle ? `<div>Shuttle</div><div>${cmb.shuttle}s</div>` : ''}</div>` : ''}</div></div></div>`;
}
function prospectTab(p) {
  const s = p.scouted;
  const cmb = p.combine || {};
  return `<div class="grid g2"><div class="card"><h2>Scouting (${['Unscouted', 'Level 1', 'Level 2', 'Fully scouted'][s.lvl]})</h2>
    <div class="kv"><div>Projected overall</div><div class="b">${s.ovrLo}–${s.ovrHi}</div><div>Potential</div><div>${esc(s.pot)}</div><div>College</div><div>${esc(p.college)}</div><div>Age</div><div>${p.age}</div></div>
    ${s.attrs && p.ratings ? '' : ''}<p class="small muted">Spend scouting points to narrow the range and reveal potential and personality. Points refill weekly during the season and at the combine.</p></div>
    <div class="card"><h2>Combine</h2><div class="kv">${['forty', 'vertical', 'bench', 'broad_jump', 'cone', 'shuttle'].map((k) => `<div>${{ forty: '40-yard dash', vertical: 'Vertical', bench: 'Bench (225)', broad_jump: 'Broad jump', cone: '3-cone', shuttle: 'Shuttle' }[k]}</div><div>${cmb[k] ?? '<span class="dim">DNP</span>'}</div>`).join('')}</div></div></div>`;
}
const STAT_COLS = {
  QB: [['g', 'G'], ['cmp', 'Cmp'], ['att', 'Att'], ['pyd', 'Yds'], ['ptd', 'TD'], ['int', 'Int'], ['sk', 'Sk'], ['car', 'Rush'], ['ryd', 'RuYd'], ['rtd', 'RuTD']],
  RB: [['g', 'G'], ['car', 'Car'], ['ryd', 'Yds'], ['rtd', 'TD'], ['tgt', 'Tgt'], ['rec', 'Rec'], ['recyd', 'RecYd'], ['rectd', 'RecTD'], ['fumL', 'FL']],
  WR: [['g', 'G'], ['tgt', 'Tgt'], ['rec', 'Rec'], ['recyd', 'Yds'], ['rectd', 'TD'], ['drop', 'Drp'], ['car', 'Rush'], ['ryd', 'RuYd']],
  OL: [['g', 'G'], ['gs', 'GS'], ['skA', 'Sk Allowed'], ['prA', 'Press Allowed'], ['pen', 'Pen']],
  DEF: [['g', 'G'], ['tkl', 'Solo'], ['ast', 'Ast'], ['tfl', 'TFL'], ['sck', 'Sck'], ['qbh', 'QBH'], ['prss', 'Prs'], ['dint', 'Int'], ['pd', 'PD'], ['ff', 'FF'], ['dtd', 'TD']],
  K: [['g', 'G'], ['fgm', 'FGM'], ['fga', 'FGA'], ['fgm50', '50+'], ['xpm', 'XPM'], ['xpa', 'XPA']],
  P: [['g', 'G'], ['pnt', 'Punts'], ['pntYd', 'Yds'], ['pntIn20', 'In20']],
};
const statGroup = (pos) => (pos === 'QB' ? 'QB' : ['RB', 'FB'].includes(pos) ? 'RB' : ['WR', 'TE'].includes(pos) ? 'WR' : ['OT', 'OG', 'C', 'LS'].includes(pos) ? 'OL' : pos === 'K' ? 'K' : pos === 'P' ? 'P' : 'DEF');
function statsTab(p) {
  const cols = STAT_COLS[statGroup(p.pos)];
  const f = (v) => (v == null ? 0 : Math.round(v * 10) / 10);
  const rows = p.seasons.flatMap((s) => [s.REG && { y: s.y, tm: s.tm, t: 'REG', real: s.real, ...s.REG }, s.POST && { y: s.y, tm: s.tm, t: 'Playoffs', ...s.POST }].filter(Boolean));
  const seasonTbl = `<div class="tbl-wrap"><table><thead><tr><th>Season</th><th>Tm</th>${cols.map(([, l]) => `<th class="num">${l}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr><td>${r.y}${r.t !== 'REG' ? ' <span class="badge">POST</span>' : ''}${r.real ? ' <span class="tiny dim" title="Real NFL stats">real</span>' : ''}</td><td>${esc(r.tm || '')}</td>${cols.map(([k]) => `<td class="num">${f(r[k])}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length + 2}" class="empty">No stats yet.</td></tr>`}</tbody></table></div>`;
  const log = p.log.slice().reverse();
  const logTbl = `<div class="tbl-wrap" style="margin-top:14px"><table><thead><tr><th>Wk</th><th>Opp</th><th>Res</th>${cols.slice(1).map(([, l]) => `<th class="num">${l}</th>`).join('')}</tr></thead><tbody>${log.map((g) => `<tr><td>${g.s} ${g.type && g.type !== 'REG' ? g.type : 'W' + g.w}</td><td>${g.home === false ? '@' : ''}${esc(g.oppAbbr || '')}</td><td>${g.gid ? `<a href="#/game/${g.gid}">${g.res || ''}</a>` : '<span class="dim tiny">real</span>'}</td>${cols.slice(1).map(([k]) => `<td class="num">${f(g.l[k])}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length + 2}" class="empty">No games this season.</td></tr>`}</tbody></table></div>`;
  return `<div class="card"><h2>Career</h2>${seasonTbl}<h2 style="margin-top:18px">Game log</h2>${logTbl}</div>`;
}
function contractTab(p) {
  const c = p.contractFull;
  if (!c) return `<div class="card">${p.isFA ? `<p>Free agent. Asking roughly <b>${money(p.ask?.apy)}</b>/yr for about ${p.ask?.years} years (market value ${money(p.marketValue)}).</p>${p.faOffers ? `<p class="muted">${p.faOffers.length} team(s) have made offers.</p>` : ''}` : '<p class="muted">No contract.</p>'}</div>`;
  if (c.ps) return `<div class="card"><p>Practice squad contract: ${money(c.ps)} for the season (weekly pay).</p></div>`;
  return `<div class="grid g21"><div class="card"><h2>Contract</h2><div class="kv"><div>Signed</div><div>${c.signed}${c.rookie ? ' (rookie scale)' : ''}${c.tag ? ` · ${c.tag === 'F' ? 'Franchise' : 'Transition'} tag` : ''}${c.tender ? ` · ${c.tender} tender` : ''}</div><div>Total</div><div>${money(c.total)} over ${c.years.length} yrs</div><div>Avg per year</div><div>${money(c.apy)}</div><div>Guaranteed</div><div>${money(c.gtd)}</div>${c.option5 ? `<div>5th-year option</div><div>${esc(c.option5)}</div>` : ''}${c.restructures ? `<div>Restructures</div><div>${c.restructures}</div>` : ''}</div>
    <div class="tbl-wrap" style="margin-top:12px"><table><thead><tr><th>Year</th><th class="num">Base</th><th class="num">Prorated bonus</th><th class="num">Cap hit</th><th class="num">Guaranteed</th></tr></thead><tbody>${c.years.map((y) => `<tr><td>${y.s}</td><td class="num">${money(y.base, 2)}</td><td class="num">${money(y.bonus, 2)}</td><td class="num b">${money(y.hit, 2)}</td><td class="num">${money(y.gtd, 2)}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="card"><h2>If released</h2>${p.dead ? `<div class="kv"><div>Dead money</div><div class="bad">${money(p.dead.now)}</div><div>Cap savings</div><div class="good">${money(p.dead.save)}</div>${p.deadJune1?.next ? `<div>Post-June 1</div><div>${money(p.deadJune1.now)} + ${money(p.deadJune1.next)} next yr</div>` : ''}</div>` : '—'}
    ${p.restructure ? `<h3 style="margin-top:12px">Restructure option</h3><div class="small">Convert ${money(p.restructure.convert)} of base salary into a signing bonus spread over ${p.restructure.years} years. Saves ${money(p.restructure.saves)} now and adds ${money(p.restructure.addPerYear)} per future year.</div>` : ''}
    <h3 style="margin-top:12px">Market</h3><div class="kv small"><div>Market value</div><div>${money(p.marketValue)}/yr</div><div>Next contract ask</div><div>${money(p.ask?.apy)} × ${p.ask?.years} yrs</div></div></div></div>`;
}
function personaTab(p) {
  const d = p.persDims;
  if (!d) return '<div class="card muted">Scout this prospect further to learn about his personality.</div>';
  const dims = [['greed', 'Money motivation'], ['loyal', 'Loyalty'], ['win', 'Desire to win'], ['ego', 'Ego / needs the ball'], ['work', 'Work ethic'], ['lead', 'Leadership'], ['volat', 'Volatility'], ['media', 'Media presence']];
  return `<div class="grid g2"><div class="card"><h2>Persona</h2>${p.pers.map((x) => `<div style="margin-bottom:8px"><span class="badge blu">${esc(x.l)}</span> <span class="small muted">${esc(x.d)}</span></div>`).join('')}
    <h3 style="margin-top:12px">Morale: ${moraleTxt(p.morale)}</h3>${meter(p.morale)}<p class="small muted">Morale depends on his role, contract, winning, the coaching staff and team chemistry. Unhappy players can hold out, request trades, and refuse to re-sign.</p></div>
    <div class="card"><h2>Traits</h2>${dims.map(([k, l]) => `<div class="attr"><span class="nm">${l}</span><div class="bar"><i style="width:${Math.round(d[k] * 100)}%;background:var(--accent)"></i></div><b>${Math.round(d[k] * 100)}</b></div>`).join('')}</div></div>`;
}
function historyTab(p) {
  const aw = p.awards.map((a) => `<span class="badge ${['MVP', 'SB', 'SBMVP', 'DPOY', 'OPOY'].includes(a.type) ? 'pur' : 'blu'}">${a.s} ${awardName(a.type)}</span>`).join(' ');
  return `<div class="grid g2"><div class="card"><h2>Awards</h2>${aw || '<span class="muted">None yet.</span>'}<h3 style="margin-top:12px">Transactions</h3>${p.txHist.map((t) => `<div class="small" style="padding:3px 0">${t.s} · ${esc(t.text)}</div>`).join('') || '<div class="muted small">—</div>'}</div>
    <div class="card"><h2>Injury history</h2>${p.injHist.slice().reverse().map((i) => `<div class="small" style="padding:3px 0">${i.s} Wk ${i.w}: ${esc(i.type)} (${i.wk >= 99 ? 'season' : i.wk + ' wks'})</div>`).join('') || '<div class="muted small">Clean bill of health.</div>'}</div></div>`;
}
export const awardName = (t) => ({ MVP: 'MVP', OPOY: 'Off. Player of Year', DPOY: 'Def. Player of Year', OROY: 'Off. Rookie of Year', DROY: 'Def. Rookie of Year', CPOY: 'Comeback POY', AP1: 'All-Pro 1st', AP2: 'All-Pro 2nd', PB: 'Pro Bowl', SB: 'Super Bowl champ', SBMVP: 'Super Bowl MVP' }[t] || t);

// ---- player actions & negotiation
ACTIONS.tag = async (el) => act('tagP', { pid: el.dataset.pid, kind: el.dataset.k }, { msg: 'Tag applied.' });
ACTIONS.option5 = async (el) => act('optionP', { pid: el.dataset.pid }, { msg: 'Fifth-year option exercised.' });
ACTIONS.declineOpt = async (el) => act('declineOption', { pid: el.dataset.pid }, { msg: 'Option declined.' });
ACTIONS.restructure = async (el) => act('restructureP', { pid: el.dataset.pid }, { msg: (r) => `Restructured. Saved ${money(r.saves)} of cap space.` });
ACTIONS.block = async (el) => act('toggleBlock', { pid: el.dataset.pid });
ACTIONS.signMin = async (el) => { const r = await act('signMin', { pid: el.dataset.pid }, { refresh: false }); if (r && !r.error) { toast(esc(r.message || 'Done'), r.signed || r.pending ? 'good' : 'warn'); rerender(); } };
ACTIONS.signPS = async (el) => act('signToPS', { pid: el.dataset.pid }, { msg: 'Signed to the practice squad.' });
ACTIONS.scout = async (el) => act('scout', { pid: el.dataset.pid }, { msg: 'Scouting report updated.' });
ACTIONS.boardToggle = async (el) => act('boardToggle', { pid: el.dataset.pid }, { msg: 'Draft board updated.' });
ACTIONS.tradeFor = (el, e) => { e.preventDefault(); sessionStorage.setItem('tff-want', el.dataset.pid); location.hash = `#/trade/${el.dataset.tid}`; };
ACTIONS.negotiate = async (el) => {
  const p = await call('playerDetail', { pid: el.dataset.pid });
  const mode = el.dataset.mode;
  const ask = p.ask || { apy: p.marketValue, years: 2, gtdPct: 0.3 };
  const yrs = ask.years || 2;
  const startApy = Math.round((ask.apy * (mode === 'fa' ? 0.95 : 0.92)) / 1e5) / 10;
  modal(`${mode === 'extend' ? 'Extension' : mode === 'resign' ? 'Re-sign' : 'Free agent offer'}: ${esc(p.name)}`, `
    <div class="row" style="gap:14px;margin-bottom:12px">${hs(p.hs, 'md')}<div><div class="b">${esc(p.pos)} · ${p.age} yrs · ${ovr(p.ovr)}</div><div class="small muted">Market value ${money(p.marketValue)}/yr · Agent's ask ≈ <b>${money(ask.apy)}</b> × ${yrs} yrs, ~${Math.round((ask.gtdPct || 0) * 100)}% guaranteed</div><div class="small">${(p.pers || []).map((x) => `<span class="badge blu" title="${esc(x.d)}">${esc(x.l)}</span>`).join(' ')}</div></div></div>
    <div class="grid g3"><div><div class="small muted">Years</div><input type="number" id="ngY" min="1" max="7" value="${yrs}"></div><div><div class="small muted">Average per year ($M)</div><input type="number" id="ngA" step="0.1" min="0.8" value="${startApy}"></div><div><div class="small muted">Guaranteed total ($M)</div><input type="number" id="ngG" step="0.5" min="0" value="${Math.round(startApy * yrs * (ask.gtdPct || 0.3) * 10) / 10}"></div></div>
    <div class="small muted" style="margin-top:8px">Total value: <b id="ngT"></b>. Lowball offers sour the mood, and after too many he'll walk away. Personality matters: money-motivated players weigh guarantees, ring chasers give contenders a discount, and loyal players give their own team a break.</div>
    <div id="ngMsg" style="margin:12px 0"></div>
    <div class="row"><button class="btn pri" data-act="ngSubmit" data-pid="${esc(p.pid)}" data-mode="${mode}">Submit offer</button><button class="btn ghost" data-act="closeModal">Close</button></div>`, { narrow: true });
  const upd = () => { $('#ngT').textContent = money(+$('#ngY').value * +$('#ngA').value * 1e6); };
  ['ngY', 'ngA'].forEach((i) => $('#' + i).addEventListener('input', upd)); upd();
};
ACTIONS.ngSubmit = async (el) => {
  const offer = { years: +$('#ngY').value, apy: +$('#ngA').value * 1e6, gtd: +$('#ngG').value * 1e6 };
  const r = await call('negotiateP', { pid: el.dataset.pid, offer, mode: el.dataset.mode });
  const box = $('#ngMsg');
  if (r.error) { box.innerHTML = `<div class="bad">${esc(r.error)}</div>`; return; }
  if (r.status === 'accepted' || r.signed) { closeModal(); toast('Deal done! Contract signed.', 'good'); rerender(); return; }
  if (r.pending) { box.innerHTML = `<div class="good">${esc(r.message)}</div><div class="small muted">Advance free-agency days to hear his decision.</div>`; return; }
  if (r.status === 'refused') { box.innerHTML = `<div class="bad">${esc(r.message)}</div>`; return; }
  if (r.status === 'counter') { box.innerHTML = `<div class="${r.tone === 'close' ? 'good' : r.tone === 'insulted' ? 'bad' : 'warn'}">${esc(r.message)}</div>${r.counter ? `<div class="small">Counter: <b>${r.counter.years} yrs × ${money(r.counter.apy)}</b>, ${money(r.counter.gtd)} guaranteed <button class="btn sm" data-act="ngUseCounter" data-y="${r.counter.years}" data-a="${r.counter.apy}" data-g="${r.counter.gtd}">Use counter</button></div>` : ''}<div class="small muted">Patience left: ${meter(Math.max(0, (r.moodLeft ?? 0.5) * 100))}</div>`; return; }
  box.innerHTML = `<div class="${r.ok === false ? 'warn' : ''}">${esc(r.message || JSON.stringify(r))}</div>`;
};
ACTIONS.ngUseCounter = (el) => { $('#ngY').value = el.dataset.y; $('#ngA').value = Math.round(+el.dataset.a / 1e5) / 10; $('#ngG').value = Math.round(+el.dataset.g / 1e5) / 10; $('#ngY').dispatchEvent(new Event('input')); };

// ===================================================================== DEPTH CHART
let depthPos = 'QB';
PAGES.depth = async ([tidS]) => {
  const tid = tidS ? +tidS : session.tid;
  const d = await call('depth', { tid });
  const list = d.depth[depthPos] || [];
  const pool = d.pool.filter((p) => !list.find((x) => x.pid === p.pid)).sort((a, b) => (b.pos === depthPos) - (a.pos === depthPos) || b.ovr - a.ovr);
  const allPos = [...POS, 'KR', 'PR'];
  return `<div class="page-h"><h1>Depth Chart</h1><span class="sub">${esc(d.team.region)} ${esc(d.team.name)}${d.locked ? ' · custom order locked' : ' · auto-managed'}</span><div class="right">${d.mine ? '<button class="btn" data-act="depthAuto">Auto-set all</button>' : ''}</div></div>
    <div class="chips" style="margin-bottom:14px">${allPos.map((p) => `<span class="pill ${p === depthPos ? 'on' : ''}" data-act="depthPos" data-p="${p}">${p} <span class="dim">${(d.depth[p] || []).length}</span></span>`).join('')}</div>
    <div class="grid g2"><div class="card"><h2>${depthPos} depth</h2>${list.map((p, i) => `<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding:6px 0"><b class="cond" style="width:26px;font-size:18px">${i + 1}</b>${pname(p)}<span>${injBadge(p)}</span>${ovr(p.ovr)}${d.mine ? `<span class="btn-group"><button class="btn sm" data-act="depthMove" data-i="${i}" data-d="-1">▲</button><button class="btn sm" data-act="depthMove" data-i="${i}" data-d="1">▼</button><button class="btn sm" data-act="depthRemove" data-i="${i}">✕</button></span>` : ''}</div>`).join('') || '<div class="muted">Empty.</div>'}
      <p class="small muted">Starters play most snaps. Injured or holdout players are skipped automatically on game day.</p></div>
    <div class="card"><h2>Add players</h2><div class="scroll">${pool.map((p) => `<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding:5px 0">${pname(p)}${ovr(p.ovr)}${d.mine ? `<button class="btn sm" data-act="depthAdd" data-pid="${esc(p.pid)}">Add</button>` : ''}</div>`).join('')}</div></div></div>`;
};
ACTIONS.depthPos = (el) => { depthPos = el.dataset.p; rerender(); };
async function depthUpdate(fn) { const d = await call('depth', { tid: session.tid }); const ids = (d.depth[depthPos] || []).map((p) => p.pid); fn(ids); await act('setDepthChart', { tid: session.tid, pos: depthPos, pids: ids }); }
ACTIONS.depthMove = (el) => depthUpdate((ids) => { const i = +el.dataset.i, j = i + +el.dataset.d; if (j >= 0 && j < ids.length) [ids[i], ids[j]] = [ids[j], ids[i]]; });
ACTIONS.depthRemove = (el) => depthUpdate((ids) => { ids.splice(+el.dataset.i, 1); });
ACTIONS.depthAdd = (el) => depthUpdate((ids) => { ids.push(el.dataset.pid); });
ACTIONS.depthAuto = () => act('autoDepthChart', { tid: session.tid }, { msg: 'Depth chart auto-set.' });

// ===================================================================== SCHEDULE & GAMES
let schedView = 'team';
PAGES.schedule = async ([tidS]) => {
  const tid = tidS ? +tidS : session.tid;
  if (schedView === 'team') {
    const sc = await call('schedule', { tid });
    return `<div class="page-h"><h1>Schedule</h1><span class="sub">${sc.season}${sc.byeWeeks ? ` · Bye: Week ${sc.byeWeeks}` : ''}</span><div class="right"><span class="btn-group"><button class="btn pri">Team</button><button class="btn" data-act="schedView" data-v="league">League by week</button></span></div></div><div class="card">${scheduleRows(sc.games, tid, true)}</div>`;
  }
  const sc = await call('schedule', {});
  const weeks = {};
  for (const g of sc.games) (weeks[g.type === 'REG' ? `Week ${g.w}` : g.label] ||= []).push(g);
  const keys = Object.keys(weeks);
  const cur = APP.schedWeek && weeks[APP.schedWeek] ? APP.schedWeek : (sc.phase === 'REGULAR_SEASON' ? `Week ${sc.week}` : keys[keys.length - 1]);
  return `<div class="page-h"><h1>League Schedule</h1><span class="sub">${sc.season}</span><div class="right"><span class="btn-group"><button class="btn" data-act="schedView" data-v="team">Team</button><button class="btn pri">League by week</button></span><select data-change="schedWeek">${keys.map((k) => `<option ${k === cur ? 'selected' : ''}>${k}</option>`).join('')}</select></div></div>
    <div class="weekgrid">${(weeks[cur] || []).map((g) => gameCard(g)).join('')}</div>`;
};
ACTIONS.schedView = (el) => { schedView = el.dataset.v; rerender(); };
ACTIONS.schedWeek = (el) => { APP.schedWeek = el.value; rerender(); };
export function gameCard(g) {
  const w = g.played ? (g.hs > g.as ? 'h' : g.as > g.hs ? 'a' : '') : '';
  return `<div class="gamecard" data-act="openGame" data-gid="${g.gid}" ${g.played ? '' : 'style="opacity:.85"'}>${logo(g.aLogo)}<b class="${w === 'a' ? '' : 'muted'}">${esc(g.aAbbr)}</b><span class="sc">${g.played ? g.as : ''}</span><span class="muted">@</span><span class="sc">${g.played ? g.hs : ''}</span><b class="${w === 'h' ? '' : 'muted'}">${esc(g.hAbbr)}</b>${logo(g.hLogo)}<span class="small muted" style="margin-left:auto">${g.played ? (g.ot ? 'Final/OT' : 'Final') : esc(g.d || '')}${g.real ? ' <span class="tiny">(real)</span>' : ''}</span></div>`;
}
export function scheduleRows(games, tid, full = false) {
  return `<div class="tbl-wrap"><table class="tbl-compact"><thead><tr><th>Wk</th><th>Opponent</th><th>Result</th>${full ? '<th>Date</th>' : ''}</tr></thead><tbody>${games.map((g) => {
    const home = g.h === tid; const opp = home ? g.aAbbr : g.hAbbr; const ol = home ? g.aLogo : g.hLogo;
    const my = home ? g.hs : g.as, op = home ? g.as : g.hs;
    const res = g.played ? (my > op ? `<b class="good">W ${my}-${op}</b>` : my < op ? `<b class="bad">L ${my}-${op}</b>` : `<b>T ${my}-${op}</b>`) : '<span class="muted">—</span>';
    return `<tr class="click" data-act="openGame" data-gid="${g.gid}"><td>${g.type === 'REG' ? g.w : esc(g.label)}</td><td>${home ? 'vs' : '@'} ${logo(ol, 'sm')} ${esc(opp)}</td><td>${res}${g.ot ? ' <span class="tiny">OT</span>' : ''}</td>${full ? `<td class="small muted">${esc(g.d || '')}</td>` : ''}</tr>`;
  }).join('')}</tbody></table></div>`;
}
ACTIONS.openGame = async (el) => openGame(el.dataset.gid);
PAGES.game = async ([gid]) => { await openGame(gid); history.back(); return null; };
async function openGame(gid) {
  const g = await call('game', { gid });
  if (g.error) return toast(esc(g.error), 'error');
  if (!g.played) { modal(`${esc(g.aAbbr)} @ ${esc(g.hAbbr)}`, `<p class="muted">This game hasn't been played yet${g.d ? ` (${esc(g.d)})` : ''}.</p>`, { narrow: true }); return; }
  if (!g.box) { modal(`${esc(g.away.abbr)} ${g.as} @ ${esc(g.home.abbr)} ${g.hs}`, `<p class="muted">${g.real ? 'This real-life game happened before your league started. Box scores are available for games simulated in your league.' : 'Detailed box score not kept for older games.'}</p>`, { narrow: true }); return; }
  const b = g.box;
  const [H, A] = b.tm;
  const teamRows = [['Total yards', (x) => x.pyd + x.ryd], ['Passing', (x) => x.pyd], ['Rushing', (x) => x.ryd], ['First downs', (x) => x.fd], ['3rd down', (x) => `${x.td3}/${x.att3}`], ['Turnovers', (x) => x.to], ['Sacks allowed', (x) => x.sk], ['Penalties', (x) => `${x.pen}-${x.penYd}`], ['Possession', (x) => `${Math.floor(x.top / 60)}:${String(Math.round(x.top % 60)).padStart(2, '0')}`]];
  const side = (tid) => Object.entries(b.pl).map(([pid, l]) => ({ pid, ...l })).filter((l) => l.tid === tid);
  const pass = (arr) => arr.filter((x) => x.att).sort((a, c) => c.att - a.att).map((x) => `<tr><td><a href="#/player/${x.pid}">${esc(x.name)}</a></td><td class="num">${x.cmp || 0}/${x.att}</td><td class="num">${x.pyd || 0}</td><td class="num">${x.ptd || 0}</td><td class="num">${x.int || 0}</td></tr>`).join('');
  const rush = (arr) => arr.filter((x) => x.car).sort((a, c) => (c.ryd || 0) - (a.ryd || 0)).map((x) => `<tr><td><a href="#/player/${x.pid}">${esc(x.name)}</a></td><td class="num">${x.car}</td><td class="num">${x.ryd || 0}</td><td class="num">${x.rtd || 0}</td></tr>`).join('');
  const rec = (arr) => arr.filter((x) => x.tgt).sort((a, c) => (c.recyd || 0) - (a.recyd || 0)).map((x) => `<tr><td><a href="#/player/${x.pid}">${esc(x.name)}</a></td><td class="num">${x.rec || 0}/${x.tgt}</td><td class="num">${x.recyd || 0}</td><td class="num">${x.rectd || 0}</td></tr>`).join('');
  const def = (arr) => arr.filter((x) => (x.tkl || 0) + (x.ast || 0) + (x.sck || 0) + (x.dint || 0) > 0).sort((a, c) => ((c.tkl || 0) + (c.sck || 0) * 3 + (c.dint || 0) * 4) - ((a.tkl || 0) + (a.sck || 0) * 3 + (a.dint || 0) * 4)).slice(0, 8).map((x) => `<tr><td><a href="#/player/${x.pid}">${esc(x.name)}</a> <span class="dim tiny">${x.pos}</span></td><td class="num">${(x.tkl || 0) + (x.ast || 0)}</td><td class="num">${x.sck || 0}</td><td class="num">${x.dint || 0}</td><td class="num">${x.pd || 0}</td></tr>`).join('');
  const block = (tid, tm) => { const arr = side(tid); return `<div class="card"><h3>${logo(tm.logo, 'sm')} ${esc(tm.abbr)}</h3>
    <table class="tbl-compact"><thead><tr><th>Passing</th><th class="num">C/A</th><th class="num">Yds</th><th class="num">TD</th><th class="num">Int</th></tr></thead><tbody>${pass(arr)}</tbody></table>
    <table class="tbl-compact"><thead><tr><th>Rushing</th><th class="num">Car</th><th class="num">Yds</th><th class="num">TD</th></tr></thead><tbody>${rush(arr)}</tbody></table>
    <table class="tbl-compact"><thead><tr><th>Receiving</th><th class="num">Rec</th><th class="num">Yds</th><th class="num">TD</th></tr></thead><tbody>${rec(arr)}</tbody></table>
    <table class="tbl-compact"><thead><tr><th>Defense</th><th class="num">Tkl</th><th class="num">Sck</th><th class="num">Int</th><th class="num">PD</th></tr></thead><tbody>${def(arr)}</tbody></table></div>`; };
  const qs = (x) => x.q.map((v) => `<td class="num">${v}</td>`).join('') + (b.tm[0].ot || b.tm[1].ot ? `<td class="num">${x.ot}</td>` : '');
  modal(`${esc(g.label)}${g.type === 'REG' ? ` · Week ${g.w}` : ''} · ${g.s}`, `
    <div class="row" style="justify-content:center;gap:28px;margin-bottom:12px">${logo(g.away.logo, 'lg')}<div class="big" style="font-size:44px">${g.as}</div><div class="muted cond" style="font-size:20px">FINAL${g.ot ? '/OT' : ''}</div><div class="big" style="font-size:44px">${g.hs}</div>${logo(g.home.logo, 'lg')}</div>
    <div class="grid g2"><div class="tbl-wrap"><table class="tbl-compact"><thead><tr><th>Team</th><th class="num">1</th><th class="num">2</th><th class="num">3</th><th class="num">4</th>${b.tm[0].ot || b.tm[1].ot ? '<th class="num">OT</th>' : ''}<th class="num">T</th></tr></thead><tbody><tr><td>${esc(g.away.abbr)}</td>${qs(A)}<td class="num b">${g.as}</td></tr><tr><td>${esc(g.home.abbr)}</td>${qs(H)}<td class="num b">${g.hs}</td></tr></tbody></table></div>
      <div class="tbl-wrap"><table class="tbl-compact"><thead><tr><th></th><th class="num">${esc(g.away.abbr)}</th><th class="num">${esc(g.home.abbr)}</th></tr></thead><tbody>${teamRows.map(([l, f]) => `<tr><td>${l}</td><td class="num">${f(A)}</td><td class="num">${f(H)}</td></tr>`).join('')}</tbody></table></div></div>
    ${b.pl && Object.keys(b.pl).length ? `<div class="grid g2" style="margin-top:14px">${block(g.a, g.away)}${block(g.h, g.home)}</div>` : '<p class="muted small">Player box score not kept for past seasons.</p>'}
    <div class="grid g2"><div class="card"><h3>Scoring summary</h3>${b.scoring.map((s) => `<div class="small" style="padding:3px 0"><span class="dim">Q${s.q} ${s.t}</span> <b>${esc(s.tm)}</b> ${esc(s.txt)} <span class="muted">(${esc(s.sc)})</span></div>`).join('')}</div>
    <div class="card"><h3>Key plays & injuries</h3>${(b.plays || []).map((s) => `<div class="small" style="padding:2px 0"><span class="dim">Q${s.q} ${s.t}</span> ${esc(s.s)}</div>`).join('')}${(b.inj || []).map((i) => `<div class="small bad">Injury: ${esc(i.name)} (${esc(i.type)})</div>`).join('')}</div></div>`);
}

// ===================================================================== STANDINGS
let standView = 'div';
PAGES.standings = async () => {
  const s = await call('standings', {});
  const conf = (c) => ['East', 'North', 'South', 'West'].map((d) => { const rows = s.divs[`${c} ${d}`]; return `<div class="card"><h3>${c} ${d}</h3><table class="tbl-compact"><thead><tr><th>Team</th><th class="num">W</th><th class="num">L</th><th class="num">T</th><th class="num">Pct</th><th class="num">Div</th><th class="num">PF</th><th class="num">PA</th><th class="num">Strk</th></tr></thead><tbody>${rows.map((t) => `<tr class="${s.userTids.includes(t.tid) ? 'me' : ''}"><td><a href="#/team/${t.tid}">${logo(t.logo, 'sm')} ${esc(t.abbr)}</a> ${t.mark ? `<span class="tiny ${t.mark === 'e' ? 'bad' : 'good'}">${t.mark}</span>` : ''}</td><td class="num">${t.w}</td><td class="num">${t.l}</td><td class="num">${t.t}</td><td class="num">${t.pct.toFixed(3).replace(/^0/, '')}</td><td class="num">${t.dw}-${t.dl}</td><td class="num">${t.pf}</td><td class="num">${t.pa}</td><td class="num">${t.streak > 0 ? 'W' + t.streak : t.streak < 0 ? 'L' + -t.streak : '-'}</td></tr>`).join('')}</tbody></table></div>`; }).join('');
  const seedList = (c) => s.seeds[c].map((tid, i) => { const t = s.power.find((x) => x.tid === tid); return `<div class="row" style="justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--line)"><b class="cond">${i + 1}</b>${logo(t.logo, 'sm')} <span style="flex:1">${esc(t.region)} ${esc(t.name)}</span><span>${t.w}-${t.l}${t.t ? '-' + t.t : ''}</span></div>`; }).join('');
  let body = '';
  if (standView === 'div') body = `<div class="grid g2"><div>${conf('AFC')}</div><div>${conf('NFC')}</div></div><div class="small muted">z = clinched division · x = clinched playoff berth · e = eliminated · * = clinched No. 1 seed (approximate)</div>`;
  if (standView === 'playoff') body = `<div class="grid g2"><div class="card"><h2>AFC playoff picture</h2>${seedList('AFC')}</div><div class="card"><h2>NFC playoff picture</h2>${seedList('NFC')}</div></div>${s.playoffs ? bracket(s) : ''}`;
  if (standView === 'power') body = table({ id: 'power', sort: { k: 'rank', dir: 'asc' }, rows: s.power, onRow: (t) => `#/team/${t.tid}`, cols: [{ k: 'rank', l: 'Rank', num: true }, { k: 'move', l: '', f: (t) => (t.prev ? (t.prev > t.rank ? `<span class="good">▲${t.prev - t.rank}</span>` : t.prev < t.rank ? `<span class="bad">▼${t.rank - t.prev}</span>` : '') : ''), nosort: true }, { k: 'name', l: 'Team', f: (t) => `${logo(t.logo, 'sm')} ${esc(t.region)} ${esc(t.name)}` }, { k: 'w', l: 'Record', f: (t) => `${t.w}-${t.l}${t.t ? '-' + t.t : ''}` }, { k: 'pd', l: 'Pt diff', num: true, f: (t) => t.pf - t.pa, sortv: (t) => t.pf - t.pa }, { k: 'ovr', l: 'OVR', num: true, f: (t) => ovr(t.ovr) }] });
  return `<div class="page-h"><h1>Standings</h1><span class="sub">${s.season}</span><div class="right"><span class="btn-group">${[['div', 'Divisions'], ['playoff', 'Playoff picture'], ['power', 'Power rankings']].map(([k, l]) => `<button class="btn ${standView === k ? 'pri' : ''}" data-act="standView" data-v="${k}">${l}</button>`).join('')}</span></div></div>${body}`;
};
ACTIONS.standView = (el) => { standView = el.dataset.v; rerender(); };
function bracket(s) {
  const P = s.playoffs;
  const T = (tid) => s.power.find((x) => x.tid === tid);
  const rounds = ['WC', 'DIV', 'CONF', 'SB'];
  const col = (r) => `<div><h3>${{ WC: 'Wild Card', DIV: 'Divisional', CONF: 'Conference', SB: 'Super Bowl' }[r]}</h3>${P.results.filter((x) => x.round === r).map((x) => `<div class="matchup"><div class="tm w">${logo(T(x.w).logo, 'sm')} ${esc(T(x.w).abbr)}<span class="sc">${x.ws}</span></div><div class="tm l">${logo(T(x.l).logo, 'sm')} ${esc(T(x.l).abbr)}<span class="sc">${x.ls}</span></div></div>`).join('') || (P.round === r ? '<div class="muted small">Up next</div>' : '')}</div>`;
  return `<div class="card"><h2>Playoff bracket</h2><div class="bracket">${rounds.map(col).join('')}</div></div>`;
}

// ===================================================================== STATS
let statsCat = 'passing', statsPos = 'ALL', statsSeason = null, statsView = 'leaders';
PAGES.stats = async () => {
  if (statsView === 'leaders') {
    const l = await call('leaders', { season: statsSeason });
    return `<div class="page-h"><h1>League Leaders</h1><span class="sub">${l.season}</span><div class="right">${viewBtns()}<select data-change="statsSeason">${l.seasons.map((y) => `<option ${y === l.season ? 'selected' : ''}>${y}</option>`).join('')}</select></div></div>
      <div class="grid g4">${Object.values(l.cats).map((c) => `<div class="card"><h3>${esc(c.label)}</h3>${c.rows.map((r, i) => `<div class="row" style="justify-content:space-between;padding:3px 0;${i === 0 ? 'font-weight:700' : ''}"><span><span class="dim">${i + 1}.</span> <a href="#/player/${r.pid}">${esc(r.name)}</a> <span class="tiny dim">${esc(r.team)}</span></span><b>${r.v}</b></div>`).join('') || '<div class="muted small">—</div>'}</div>`).join('')}</div>`;
  }
  if (statsView === 'team') {
    const t = await call('teamStats', { season: statsSeason });
    const pg = (r, k) => (r.g ? (r[k] / r.g).toFixed(1) : '—');
    return `<div class="page-h"><h1>Team Stats</h1><span class="sub">${t.season} · per game</span><div class="right">${viewBtns()}</div></div>${table({ id: 'tstats', sort: { k: 'ppg', dir: 'desc' }, rows: t.rows.map((r) => ({ ...r, ppg: r.g ? r.pts / r.g : 0, papg: r.g ? r.ptsA / r.g : 0, ypg: r.g ? (r.pyd + r.ryd) / r.g : 0, yapg: r.g ? (r.pydA + r.rydA) / r.g : 0 })), cols: [{ k: 'name', l: 'Team', f: (r) => `${logo(r.logo, 'sm')} ${esc(r.abbr)}` }, { k: 'g', l: 'G', num: true }, { k: 'ppg', l: 'Pts', num: true, f: (r) => pg(r, 'pts') }, { k: 'papg', l: 'Pts allowed', num: true, f: (r) => pg(r, 'ptsA') }, { k: 'ypg', l: 'Yds', num: true, f: (r) => r.ypg.toFixed(1) }, { k: 'pyd', l: 'Pass', num: true, f: (r) => pg(r, 'pyd') }, { k: 'ryd', l: 'Rush', num: true, f: (r) => pg(r, 'ryd') }, { k: 'yapg', l: 'Yds allowed', num: true, f: (r) => r.yapg.toFixed(1) }, { k: 'to', l: 'TO', num: true, f: (r) => pg(r, 'to') }, { k: 'toF', l: 'Takeaways', num: true, f: (r) => pg(r, 'toF') }, { k: 'sk', l: 'Sacks', num: true, f: (r) => pg(r, 'sk') }] })}`;
  }
  const d = await call('playerStats', { season: statsSeason, pos: statsPos, cat: statsCat });
  const C = {
    passing: [['att', 'Att'], ['cmp', 'Cmp'], ['pyd', 'Yds'], ['ptd', 'TD'], ['int', 'Int'], ['sk', 'Sk'], ['ypa', 'Y/A', (r) => (r.att ? (r.pyd / r.att).toFixed(1) : 0)], ['rate', 'Rate', (r) => rate(r).toFixed(1)]],
    rushing: [['car', 'Car'], ['ryd', 'Yds'], ['ypc', 'Y/C', (r) => (r.car ? (r.ryd / r.car).toFixed(1) : 0)], ['rtd', 'TD'], ['fumL', 'FL'], ['rLng', 'Lng']],
    receiving: [['tgt', 'Tgt'], ['rec', 'Rec'], ['recyd', 'Yds'], ['ypr', 'Y/R', (r) => (r.rec ? (r.recyd / r.rec).toFixed(1) : 0)], ['rectd', 'TD'], ['drop', 'Drops'], ['yac', 'YAC']],
    defense: [['tkl', 'Solo'], ['ast', 'Ast'], ['tfl', 'TFL'], ['sck', 'Sacks'], ['prss', 'Pressures'], ['qbh', 'QB Hits'], ['dint', 'Int'], ['pd', 'PD'], ['ff', 'FF']],
    kicking: [['fgm', 'FGM'], ['fga', 'FGA'], ['fgp', 'FG%', (r) => (r.fga ? ((r.fgm / r.fga) * 100).toFixed(1) : '—')], ['fgm50', '50+'], ['xpm', 'XPM'], ['xpa', 'XPA'], ['pnt', 'Punts'], ['pntavg', 'Avg', (r) => (r.pnt ? (r.pntYd / r.pnt).toFixed(1) : '—')]],
    returns: [['kr', 'KR'], ['krYd', 'KR Yds'], ['krTd', 'KR TD'], ['pr', 'PR'], ['prYd', 'PR Yds'], ['prTd', 'PR TD']],
  }[statsCat];
  const cols = [{ k: 'name', l: 'Player', f: (r) => pname({ ...r, team: r.team }, {}) , sortv: (r) => r.name }, { k: 'pos', l: 'Pos' }, { k: 'g', l: 'G', num: true }, ...C.map(([k, l, f]) => ({ k, l, num: true, f: f || ((r) => (r[k] == null ? 0 : Math.round(r[k] * 10) / 10)), sortv: f ? (r) => +f(r) || 0 : (r) => r[k] || 0 })), { k: 'av', l: 'Value', num: true, title: 'Approximate value score' }];
  return `<div class="page-h"><h1>Player Stats</h1><span class="sub">${d.season}</span><div class="right">${viewBtns()}<select data-change="statsSeason">${d.seasons.map((y) => `<option ${y === d.season ? 'selected' : ''}>${y}</option>`).join('')}</select>${posSel(statsPos, 'statsPos')}</div></div>
    <div class="tabs">${['passing', 'rushing', 'receiving', 'defense', 'kicking', 'returns'].map((k) => `<a class="${statsCat === k ? 'on' : ''}" data-act="statsCat" data-k="${k}">${k[0].toUpperCase() + k.slice(1)}</a>`).join('')}</div>
    ${table({ id: `ps-${statsCat}`, cols, rows: d.rows.slice(0, 600), sort: { k: C[2][0], dir: 'desc' }, cls: 'tbl-fixed' })}`;
};
function rate(r) { if (!r.att) return 0; const c = (x) => Math.max(0, Math.min(2.375, x)); return ((c((r.cmp / r.att - 0.3) * 5) + c((r.pyd / r.att - 3) * 0.25) + c((r.ptd / r.att) * 20) + c(2.375 - (r.int / r.att) * 25)) / 6) * 100; }
const viewBtns = () => `<span class="btn-group">${[['leaders', 'Leaders'], ['players', 'Players'], ['team', 'Teams']].map(([k, l]) => `<button class="btn ${statsView === k ? 'pri' : ''}" data-act="statsView" data-v="${k}">${l}</button>`).join('')}</span>`;
ACTIONS.statsView = (el) => { statsView = el.dataset.v; rerender(); };
ACTIONS.statsCat = (el) => { statsCat = el.dataset.k; rerender(); };
ACTIONS.statsPos = (el) => { statsPos = el.value; rerender(); };
ACTIONS.statsSeason = (el) => { statsSeason = +el.value; rerender(); };

// ===================================================================== NEWS
let newsMine = false;
PAGES.news = async () => {
  const n = await call('newsFeed', { tid: newsMine ? session.tid : null });
  return `<div class="page-h"><h1>News & Transactions</h1><div class="right"><label class="chk"><input type="checkbox" ${newsMine ? 'checked' : ''} data-change="newsMine"> My team only</label></div></div>
    <div class="grid g2"><div class="card"><h2>Headlines</h2>${newsList(n.news)}</div><div class="card"><h2>Transactions</h2>${n.transactions.map((t) => `<div class="news-item"><div class="t">${t.s} ${t.ph === 'REGULAR_SEASON' ? 'W' + t.w : ''}</div><div class="x small">${esc(t.text)}</div></div>`).join('') || '<div class="muted">None</div>'}</div></div>`;
};
ACTIONS.newsMine = (el) => { newsMine = el.checked; rerender(); };

// ===================================================================== HISTORY
let histTab = 'champs';
PAGES.history = async () => {
  const h = await call('history');
  const tabs = [['champs', 'Champions'], ['awards', 'Awards'], ['allpro', 'All-Pro'], ['records', 'Records'], ['hof', 'Hall of Fame'], ['teams', 'Team history'], ['trades', 'Trade history']];
  let body = '';
  if (histTab === 'champs') body = `<div class="card">${h.champions.slice().reverse().map((c) => `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line);gap:14px"><b class="cond" style="font-size:22px;width:60px">${c.s}</b>${c.team ? `${logo(c.team.logo, 'md')}<div><b>${esc(c.team.region)} ${esc(c.team.name)}</b><div class="small muted">def. ${esc(c.ruTeam?.abbr || '')} ${esc(c.score || '')}${c.mvpName ? ` · MVP ${esc(c.mvpName)}` : ''}</div></div>` : `<div><b>${esc(c.abbr)}</b> <span class="muted small">${esc(c.note || '')}</span></div>`}</div>`).join('')}</div>`;
  if (histTab === 'awards') body = Object.entries(h.awards).reverse().map(([s, a]) => `<div class="card"><h2>${s} season</h2><div class="grid g3">${['MVP', 'OPOY', 'DPOY', 'OROY', 'DROY', 'CPOY'].map((k) => `<div><h3>${awardName(k)}</h3>${(a[k] || []).slice(0, 3).map((x, i) => `<div class="small ${i ? 'muted' : 'b'}">${i + 1}. <a href="#/player/${x.pid}">${esc(x.name)}</a> ${esc(x.pos || '')} · ${esc(x.abbr)}</div>`).join('')}</div>`).join('')}<div><h3>Coach of the Year</h3>${(a.COY || []).map((x) => `<div class="small b">${esc(x.coach)}</div>`).join('')}</div>${a.SBMVP ? `<div><h3>Super Bowl MVP</h3><div class="small b"><a href="#/player/${a.SBMVP.pid}">${esc(a.SBMVP.name)}</a></div></div>` : ''}</div></div>`).join('') || '<div class="card muted">Awards are handed out at the end of each regular season.</div>';
  if (histTab === 'allpro') body = Object.entries(h.awards).reverse().map(([s, a]) => `<div class="card"><h2>${s} All-Pro</h2><div class="grid g2"><div><h3>First team</h3>${(a.AP1 || []).map((x) => `<div class="small"><span class="dim" style="display:inline-block;width:40px">${x.pos}</span><a href="#/player/${x.pid}">${esc(x.name)}</a> · ${esc(x.abbr)}</div>`).join('')}</div><div><h3>Second team</h3>${(a.AP2 || []).map((x) => `<div class="small"><span class="dim" style="display:inline-block;width:40px">${x.pos}</span><a href="#/player/${x.pid}">${esc(x.name)}</a> · ${esc(x.abbr)}</div>`).join('')}</div></div></div>`).join('') || '<div class="card muted">None yet.</div>';
  if (histTab === 'records') body = `<div class="card"><h2>Single-game records (your league)</h2>${h.records.map((r) => `<div class="row" style="justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--line)"><span class="muted">${esc(r.label)}</span><span><a href="#/player/${r.pid}">${esc(r.name)}</a> · ${r.s} Wk ${r.w}</span><b>${r.v}</b></div>`).join('') || '<div class="muted">—</div>'}</div>`;
  if (histTab === 'hof') body = `<div class="card">${h.hof.map((x) => `<div class="row" style="padding:5px 0;border-bottom:1px solid var(--line)"><b>${x.s}</b> <a href="#/player/${x.pid}">${esc(x.name)}</a> <span class="muted">${esc(x.pos || '')}</span></div>`).join('') || '<div class="muted">Players become eligible five seasons after retiring.</div>'}</div>`;
  if (histTab === 'teams') body = `<div class="grid g3">${h.teamHist.map((t) => `<div class="card"><h3>${logo(t.logo, 'sm')} ${esc(t.abbr)}</h3>${t.hist.slice().reverse().map((x) => `<div class="small">${x.s}: ${x.w}-${x.l}${x.t ? '-' + x.t : ''}${x.seed ? ` · seed ${x.seed}` : ''}</div>`).join('') || '<div class="muted small">—</div>'}</div>`).join('')}</div>`;
  if (histTab === 'trades') body = `<div class="card">${h.trades.map((t) => `<div class="news-item"><div class="t">${t.s} ${t.ph === 'REGULAR_SEASON' ? 'W' + t.w : ''}</div><div class="x small">${esc(t.text)}</div></div>`).join('') || '<div class="muted">No trades yet.</div>'}</div>`;
  return `<div class="page-h"><h1>League History</h1></div><div class="tabs">${tabs.map(([k, l]) => `<a class="${histTab === k ? 'on' : ''}" data-act="histTab" data-k="${k}">${l}</a>`).join('')}</div>${body}`;
};
ACTIONS.histTab = (el) => { histTab = el.dataset.k; rerender(); };
void $$; void pct; void bars; void net; void render;
