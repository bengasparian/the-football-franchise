// Madden-style screens: franchise hub, field depth chart, league schedule, weekly recap, awards race,
// NFL history, franchise identity (relocate/rebrand), live free agency and the live draft room.
import { call, session, net } from './client.js';
import { esc, $, money, ovr, delta, hs, logo, pname, injBadge, injText, meter, table, modal, closeModal, toast } from './ui.js';
import { APP, act, rerender } from './app.js';
import { newsList, gameCard } from './pages.js';

export const PAGES3 = {};
export const ACTIONS = {};
const rec = (x) => (x ? `${x.w}-${x.l}${x.t ? '-' + x.t : ''}` : '0-0');
const ord = (n) => n + (['th', 'st', 'nd', 'rd'][((n % 100) - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
const devBadge = (d) => (d && d !== 'Normal' ? `<span class="dev dev-${d.toLowerCase()}" title="Development trait: ${esc(d)}">${d === 'Elite' ? '★★★' : d === 'Star' ? '★★' : '★'}</span>` : '');

// ===================================================================== HUB
PAGES3.home = async () => {
  const [d, rc] = await Promise.all([call('dashboard', { tid: session.tid }), call('recap', {})]);
  const t = d.team;
  const ph = d.phase;
  const nx = d.next;
  const div = d.divStand.findIndex((x) => x.tid === t.tid) + 1;
  // the feature card changes with the calendar
  const feature = (() => {
    const big = (title, sub, body, href, btn, tip) => `<div class="feature" style="--tc1:${esc(t.c1)}"><div class="f-k">${title}</div>${body}<div class="f-sub">${sub}</div>${href ? `<a class="btn pri big" href="${href}" title="${esc(tip || btn)}">${btn}</a>` : ''}</div>`;
    if (ph === 'DRAFT') return big('NFL DRAFT', 'Every team gets 2 minutes per pick. You can sim one pick, a round, or straight to your next pick.', `<div class="f-icon">🎯</div>`, '#/draft', 'Enter Draft Room ▶', 'Go to the live draft room');
    if (ph === 'FREE_AGENCY') return big(`FREE AGENCY · DAY ${APP.header.faDay}/5`, 'Make offers now. After the first 10 minutes of each day, players start signing.', `<div class="f-icon">✍️</div>`, '#/fa', 'Open Free Agency ▶', 'Go to the free agent market');
    if (ph === 'LEAGUE_MEETING') return big('ANNUAL LEAGUE MEETING', 'Rule changes need 24 of 32 votes.', `<div class="f-icon">🗳️</div>`, '#/rules', 'Cast Your Votes ▶');
    if (ph === 'RESIGN') return big('RE-SIGNING PERIOD', `${d.expiring.length} contracts expire. Re-sign, tag or let them walk (list below).`, `<div class="f-icon">📝</div>`, '#/cap', 'Open Cap Sheet ▶');
    if (ph === 'FANTASY_DRAFT') return big('FANTASY DRAFT', 'Build your roster from scratch.', `<div class="f-icon">🎲</div>`, '#/fantasy', 'Enter Draft Room ▶');
    if (d.bye) return big(`WEEK ${d.bye} · BYE WEEK`, 'No game this week. A good time to rest, scout and make moves.', `<div class="match">${logo(t.logo, 'xl')}<div class="vs">BYE</div></div>`, null, '');
    if (nx) return `<a class="feature" href="#/schedule" style="--tc1:${esc(t.c1)}" title="Your schedule"><div class="f-k">${nx.type === 'REG' ? `WEEK ${nx.w}` : nx.type === 'PRE' ? `PRESEASON · WEEK ${nx.w}` : esc(nx.label).toUpperCase()} · NEXT GAME</div>
      <div class="match"><div class="tm">${logo(nx.aLogo, 'xl')}<b>${esc(nx.aAbbr)}</b></div><div class="vs">@</div><div class="tm">${logo(nx.hLogo, 'xl')}<b>${esc(nx.hAbbr)}</b></div></div>
      <div class="f-sub">${d.byeWeek ? `Bye week: ${d.byeWeek}` : ''}</div></a>`;
    return big(`${d.season} · ${esc(APP.header.phaseLabel).toUpperCase()}`, 'Click Advance in the top bar to move on.', `<div class="match">${logo(t.logo, 'xl')}</div>`, null, '');
  })();
  const todo = d.todo.map((x) => `<a class="todo ${x.urgent ? 'urgent' : ''}" href="${x.href}"><span class="chk">${x.urgent ? '!' : '○'}</span><span>${esc(x.txt)}</span><span class="go">›</span></a>`).join('') || '<div class="muted small">Nothing pressing. Advance when ready.</div>';
  const T = (href, ic, label, sub, tip) => `<a class="tile" href="${href}" title="${esc(tip || label)}"><span class="ti">${ic}</span><span class="tt">${label}</span><span class="ts">${sub}</span></a>`;
  const recapMini = rc.games?.length ? `<div class="card"><div class="card-h"><h2>Week ${rc.week} recap</h2><a class="small" href="#/recap" title="Every game from last week with box scores">All games ›</a></div>
    <div class="recap-mini">${rc.games.slice(0, 8).map((g) => { const hw = g.hs > g.as; return `<div class="rg ${g.upset ? 'upset' : ''}" data-act="openGame" data-gid="${g.gid}" title="${g.upset ? 'Upset! ' : ''}Open box score"><span class="${!hw ? 'b' : 'muted'}">${esc(g.aAbbr)} ${g.as}</span><span class="${hw ? 'b' : 'muted'}">${esc(g.hAbbr)} ${g.hs}</span></div>`; }).join('')}</div></div>` : '';
  return `
  <div class="hub-top">
    <div class="hub-team" style="--tc1:${esc(t.c1)}">
      ${logo(t.logo, 'xl')}
      <div><div class="ht-name">${esc(t.region)} ${esc(t.name)}</div>
        <div class="ht-meta"><span title="Record">${rec(d.rec)}</span><span title="Division rank">${div ? ord(div) : '-'} ${esc(t.conf)} ${esc(t.div)}</span><span title="Power ranking">Power #${t.rank ?? '-'}</span></div></div>
      <div class="ht-stats">
        <div title="Team overall (offense / defense)"><b>${t.ovr.ovr}</b><small>OVR</small></div>
        <div title="Offense"><b>${t.ovr.off}</b><small>OFF</small></div>
        <div title="Defense"><b>${t.ovr.def}</b><small>DEF</small></div>
        <div title="Cap space this league year"><b class="${d.cap.space < 0 ? 'bad' : ''}">${money(d.cap.space)}</b><small>CAP</small></div>
        <div title="How secure your job is with the owner"><b class="${t.jobSec < 30 ? 'bad' : t.jobSec < 55 ? 'warn' : 'good'}">${t.jobSec}</b><small>JOB</small></div>
      </div>
    </div>
  </div>
  ${APP.header.blocker ? `<div class="alert bad"><b>Action needed:</b> ${esc(APP.header.blocker)} <a class="btn sm" href="#/roster">Go to roster</a></div>` : ''}
  <div class="hub-grid">
    <div class="hub-main">${feature}
      <div class="tiles">
        ${T('#/roster', '🏈', 'Roster', `${d.counts.ACT || 0}/53 active · ${d.counts.PS || 0} PS`, 'Your players, contracts and roster moves')}
        ${T('#/lineup', '📋', 'Adjust Lineup', 'Set your starters on the field', 'Pick who lines up at every spot: LT, slot, nickel and more')}
        ${T('#/trade', '🔁', 'Trade Center', 'Build a deal', 'Trade players and picks with any team')}
        ${T('#/fa', '✍️', 'Free Agency', ph === 'FREE_AGENCY' ? 'LIVE now' : 'Available players', 'Sign free agents')}
        ${T('#/draft', '🎯', 'Draft & Scouting', ph === 'DRAFT' ? 'LIVE now' : 'Scout prospects', 'Scout the next draft class')}
        ${T('#/cap', '💰', 'Salary Cap', 'Contracts & extensions', 'Cap sheet, extensions, restructures')}
        ${T('#/standings', '🏆', 'Standings', `${div ? ord(div) : ''} in division`, 'Divisions, playoff picture and power rankings')}
        ${T('#/awards', '🥇', 'Awards Race', 'MVP, OPOY, DPOY…', 'Who is leading each award right now')}
      </div>
      ${d.expiring.length ? `<div class="card" style="border-color:var(--warn)"><div class="card-h"><h2>Expiring contracts (${d.expiring.length})</h2><span class="tiny muted">${d.tagUsed ? 'Tag used this year' : 'One franchise or transition tag available'}</span></div><div class="small muted" style="margin-bottom:6px">Re-sign, tag or let them walk. Anyone unsigned when free agency opens hits the open market.</div>${d.expiring.map((p) => `<div class="mini-row">${pname(p)}${ovr(p.ovr)}${devBadge(p.dev)}<span class="small muted">Age ${p.age} · asks ${money(p.ask)}/yr</span><span class="r"><button class="btn sm pri" data-act="negotiate" data-pid="${esc(p.pid)}" data-mode="resign" title="Open contract talks">Negotiate</button></span></div>`).join('')}</div>` : ''}
      ${recapMini}
    </div>
    <div class="hub-side">
      <div class="card"><div class="card-h"><h2>To do</h2><span class="tiny muted">${esc(APP.header.phaseLabel)}</span></div>${todo}</div>
      ${d.events.length || d.offers.length ? `<div class="card"><h2>Needs your attention</h2>${d.events.map((e) => `<div class="evt"><h4>⚠️ ${esc(e.title)}</h4><div class="small" style="margin-bottom:8px">${esc(e.text)}</div><div class="row">${e.choices.map(([k, l]) => `<button class="btn sm" data-act="evt" data-id="${e.id}" data-c="${k}">${esc(l)}</button>`).join('')}</div></div>`).join('')}${d.offers.map((o) => `<div class="evt"><h4>📨 Offer from ${logo(o.from.logo, 'sm')} ${esc(o.from.abbr)}</h4><div class="small">They want <b>${o.getV.players.map((p) => esc(p.name)).join(', ')}${o.getV.picks.map((p) => esc(p.label)).join(', ')}</b> for <b>${[...o.giveV.players.map((p) => `${esc(p.name)} (${p.pos} ${p.ovr})`), ...o.giveV.picks.map((p) => esc(p.label))].join(', ')}</b></div><div class="row" style="margin-top:8px"><button class="btn sm pri" data-act="respondOffer" data-id="${o.id}" data-a="1">Accept</button><button class="btn sm" data-act="respondOffer" data-id="${o.id}" data-a="0">Decline</button></div></div>`).join('')}</div>` : ''}
      <div class="card"><div class="card-h"><h2>Injury report</h2><a class="small" href="#/roster" title="Manage IR on your roster">Roster ›</a></div>${d.injured.length ? d.injured.sort((a, b) => (b.inj.se ? 99 : b.inj.wk) - (a.inj.se ? 99 : a.inj.wk)).slice(0, 8).map((p) => `<div class="mini-row" style="align-items:flex-start">${pname(p, { sub: `${p.pos}${p.status === 'IR' ? ' · IR' : ''}` })}<div class="r small" style="max-width:55%">${injText(p)}</div></div>`).join('') : '<div class="muted small">No injuries. Everyone is healthy.</div>'}</div>
      <div class="card"><div class="card-h"><h2>${esc(t.conf)} ${esc(t.div)}</h2><a class="small" href="#/standings">Standings ›</a></div>${d.divStand.map((x, i) => `<div class="mini-row ${x.tid === t.tid ? 'me' : ''}"><span class="dim">${i + 1}</span>${logo(x.logo, 'sm')}<a href="#/team/${x.tid}">${esc(x.abbr)}</a><span class="r">${rec(x)}</span></div>`).join('')}</div>
      <div class="card"><div class="card-h"><h2>Headlines</h2><a class="small" href="#/news">All news ›</a></div>${newsList(d.news.slice(0, 6))}</div>
    </div>
  </div>`;
};

// ===================================================================== DEPTH CHART (field view)
let depthUnit = 'off';
const UNITS = {
  off: { label: 'Offense', slots: [['WR', 0, 'WR1', 7, 30], ['WR', 2, 'SLOT', 19, 38], ['OT', 0, 'LT', 31, 40], ['OG', 0, 'LG', 41, 40], ['C', 0, 'C', 51, 40], ['OG', 1, 'RG', 61, 40], ['OT', 1, 'RT', 71, 40], ['TE', 0, 'TE', 82, 44], ['WR', 1, 'WR2', 93, 30], ['QB', 0, 'QB', 51, 64], ['RB', 0, 'HB', 51, 86], ['FB', 0, 'FB', 36, 76]] },
  def: { label: 'Defense', slots: [['CB', 0, 'CB1', 7, 40], ['CB', 2, 'NICKEL', 20, 46], ['EDGE', 0, 'LE', 31, 68], ['DT', 0, 'DT', 44, 68], ['DT', 1, 'DT', 57, 68], ['EDGE', 1, 'RE', 70, 68], ['CB', 1, 'CB2', 93, 40], ['LB', 0, 'MLB', 42, 42], ['LB', 1, 'WLB', 60, 42], ['S', 0, 'FS', 38, 14], ['S', 1, 'SS', 64, 16]] },
  st: { label: 'Special Teams', slots: [['K', 0, 'K', 30, 40], ['P', 0, 'P', 50, 40], ['LS', 0, 'LS', 70, 40], ['KR', 0, 'KR', 40, 76], ['PR', 0, 'PR', 60, 76]] },
};
let depthPick = null; // {pos, i}
PAGES3.lineup = async ([tidS]) => {
  const tid = tidS ? +tidS : session.tid;
  const d = await call('depth', { tid });
  const U = UNITS[depthUnit];
  const slot = ([pos, i, label, x, y]) => {
    if (pos === 'FB' && !(d.depth.FB || []).some((p) => p.pos === 'FB')) return ''; // most teams don't carry a true fullback
    const p = d.depth[pos]?.[i];
    const on = depthPick && depthPick.pos === pos && depthPick.i === i;
    return `<div class="slot ${on ? 'on' : ''} ${p ? '' : 'empty'}" style="left:${x}%;top:${y}%" ${d.mine ? `data-act="depthSlot" data-pos="${pos}" data-i="${i}"` : ''} title="${esc(label)}${p ? `: ${esc(p.name)} (${p.ovr} OVR)` : ' (empty)'}${d.mine ? ' · click to change' : ''}">
      <div class="sl">${label}</div>${p ? `${hs(p.hs, 'sm', p)}<div class="sn">${esc(p.ln)}</div>${ovr(p.ovr)}${p.inj ? '<span class="injdot" title="Injured">+</span>' : ''}` : '<div class="sn dim">Empty</div>'}</div>`;
  };
  // the side list: full depth at the selected (or first) position
  const focusPos = depthPick?.pos || U.slots[0][0];
  const list = d.depth[focusPos] || [];
  const cands = d.pool.filter((p) => !list.slice(0, 1).find((x) => x.pid === p.pid)).sort((a, b) => (b.pos === focusPos) - (a.pos === focusPos) || b.ovr - a.ovr);
  return `<div class="page-h"><h1>Adjust Lineup</h1><span class="sub">${esc(d.team.region)} ${esc(d.team.name)} · ${d.locked ? 'your order is locked in' : 'auto-managed by your staff'}</span><div class="right"><a class="btn" href="#/depth" title="The full position-by-position depth chart">Depth Chart</a>${d.mine ? '<button class="btn" data-act="depthAuto" title="Let your coaches set the best lineup at every position">Auto-set all</button>' : ''}</div></div>
    <div class="tabs">${Object.entries(UNITS).map(([k, u]) => `<a class="${depthUnit === k ? 'on' : ''}" data-act="depthUnit" data-k="${k}">${u.label}</a>`).join('')}</div>
    <div class="grid g21">
      <div class="field ${depthUnit}">${depthUnit !== 'st' ? '<div class="los"></div>' : ''}${U.slots.map(slot).join('')}</div>
      <div class="card"><div class="card-h"><h2>${esc(focusPos)} depth</h2><span class="tiny muted">${depthPick ? 'Pick a player to put in that spot' : 'Click a spot on the field to change it'}</span></div>
        ${list.map((p, i) => `<div class="mini-row"><b class="cond" style="width:22px">${i + 1}</b>${pname(p)}${injBadge(p)}${ovr(p.ovr)}${d.mine ? `<span class="btn-group"><button class="btn sm" data-act="depthMove2" data-pos="${focusPos}" data-i="${i}" data-d="-1" title="Move up">▲</button><button class="btn sm" data-act="depthMove2" data-pos="${focusPos}" data-i="${i}" data-d="1" title="Move down">▼</button></span>` : ''}</div>`).join('') || '<div class="muted small">Empty</div>'}
        ${depthPick && d.mine ? `<h3 style="margin-top:12px">Put in ${esc(focusPos)} slot ${depthPick.i + 1}</h3><div class="scroll" style="max-height:340px">${cands.map((p) => `<div class="mini-row click" data-act="depthSet" data-pid="${esc(p.pid)}" title="Start ${esc(p.name)} here">${pname(p, { link: false })}<span class="tiny dim">${p.pos}</span>${injBadge(p)}${ovr(p.ovr)}</div>`).join('')}</div>` : ''}
      </div></div>`;
};
ACTIONS.depthUnit = (el) => { depthUnit = el.dataset.k; depthPick = null; rerender(); };
ACTIONS.depthSlot = (el) => { const pos = el.dataset.pos, i = +el.dataset.i; depthPick = depthPick && depthPick.pos === pos && depthPick.i === i ? null : { pos, i }; rerender(); };
ACTIONS.depthSet = async (el) => {
  const d = await call('depth', { tid: session.tid });
  const ids = (d.depth[depthPick.pos] || []).map((p) => p.pid).filter((x) => x !== el.dataset.pid);
  ids.splice(Math.min(depthPick.i, ids.length), 0, el.dataset.pid);
  const pos = depthPick.pos; depthPick = null;
  await act('setDepthChart', { tid: session.tid, pos, pids: ids });
};
ACTIONS.depthMove2 = async (el) => {
  const d = await call('depth', { tid: session.tid });
  const ids = (d.depth[el.dataset.pos] || []).map((p) => p.pid);
  const i = +el.dataset.i, j = i + +el.dataset.d;
  if (j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await act('setDepthChart', { tid: session.tid, pos: el.dataset.pos, pids: ids });
};

// ===================================================================== SCHEDULE (league-wide by week + your season)
let schedWeek = null, schedType = 'REG';
PAGES3.schedule = async ([tidS]) => {
  const tid = tidS ? +tidS : session.tid;
  const mine = await call('schedule', { tid });
  const ph = mine.phase;
  if (schedWeek == null) { schedWeek = ph === 'REGULAR_SEASON' ? mine.week : ph === 'PRESEASON' ? Math.max(1, mine.week) : 1; schedType = ph === 'PRESEASON' ? 'PRE' : 'REG'; }
  const wk = await call('schedule', { week: schedWeek, type: schedType });
  const wkBtns = [...[1, 2, 3].map((w) => ['PRE', w, `P${w}`]), ...Array.from({ length: wk.weeks }, (_, i) => ['REG', i + 1, `${i + 1}`])];
  const po = mine.games.filter((g) => !['REG', 'PRE'].includes(g.type));
  const myRows = mine.games.map((g) => {
    const home = g.h === tid; const opp = home ? g.aAbbr : g.hAbbr; const ol = home ? g.aLogo : g.hLogo;
    const my = home ? g.hs : g.as, op = home ? g.as : g.hs;
    const r = g.played ? (my > op ? `<b class="good">W</b> ${my}-${op}` : my < op ? `<b class="bad">L</b> ${my}-${op}` : `<b>T</b> ${my}-${op}`) : `<span class="muted">${esc(g.d || '')}</span>`;
    return `<div class="mini-row click" data-act="openGame" data-gid="${g.gid}"><span class="wk">${g.type === 'REG' ? g.w : g.type === 'PRE' ? 'P' + g.w : esc(g.label)}</span>${home ? 'vs' : '@'} ${logo(ol, 'sm')} <b>${esc(opp)}</b><span class="r">${r}</span></div>`;
  });
  // insert the bye week
  if (mine.byeWeeks) { const idx = mine.games.findIndex((g) => g.type === 'REG' && g.w > mine.byeWeeks); myRows.splice(idx < 0 ? myRows.length : idx, 0, `<div class="mini-row bye"><span class="wk">${mine.byeWeeks}</span><b>BYE WEEK</b></div>`); }
  return `<div class="page-h"><h1>Schedule</h1><span class="sub">${mine.season} season</span></div>
    <div class="grid g12">
      <div class="card"><div class="card-h"><h2>Your season</h2><span class="tiny muted">Click a game for the box score</span></div>${myRows.join('')}</div>
      <div><div class="weekbar">${wkBtns.map(([t, w, l]) => `<button class="wkb ${t === schedType && w === schedWeek ? 'on' : ''} ${t === 'PRE' ? 'pre' : ''}" data-act="schedWk" data-t="${t}" data-w="${w}" title="${t === 'PRE' ? `Preseason week ${w}` : `Week ${w}`}">${l}</button>`).join('')}${po.length ? `<button class="wkb" data-act="schedPO" title="Playoffs">PO</button>` : ''}</div>
        <div class="card"><div class="card-h"><h2>${schedType === 'PRE' ? `Preseason Week ${schedWeek}` : `Week ${schedWeek}`}</h2><span class="tiny muted">${wk.games.filter((g) => g.played).length}/${wk.games.length} final</span></div>
          <div class="weekgrid">${wk.games.map((g) => gameCard2(g, wk.rec)).join('') || '<div class="muted">No games.</div>'}</div>
          ${schedType === 'REG' && wk.byes?.length ? `<div class="byes"><b>On bye:</b> ${wk.byes.map((t) => `${logo(t.logo, 'sm')} ${esc(t.abbr)}`).join(' ')}</div>` : ''}</div></div></div>`;
};
function gameCard2(g, recs = {}) {
  const w = g.played ? (g.hs > g.as ? 'h' : g.as > g.hs ? 'a' : '') : '';
  const line = (side) => { const tid = side === 'a' ? g.a : g.h; return `<div class="gl ${w === side ? 'win' : w ? 'lose' : ''}">${logo(side === 'a' ? g.aLogo : g.hLogo, 'sm')}<b>${esc(side === 'a' ? g.aAbbr : g.hAbbr)}</b><span class="tiny dim">${recs[tid] || ''}</span><span class="sc">${g.played ? (side === 'a' ? g.as : g.hs) : ''}</span></div>`; };
  return `<div class="gcard" data-act="openGame" data-gid="${g.gid}" title="${g.played ? 'Open box score' : 'Not played yet'}">${line('a')}${line('h')}<div class="gs">${g.played ? (g.ot ? 'FINAL/OT' : 'FINAL') : esc(g.d || 'Upcoming')}</div></div>`;
}
ACTIONS.schedWk = (el) => { schedType = el.dataset.t; schedWeek = +el.dataset.w; rerender(); };
ACTIONS.schedPO = () => { location.hash = '#/standings'; };

// ===================================================================== WEEKLY RECAP
let recapWeek = null;
PAGES3.recap = async () => {
  const r = await call('recap', { week: recapWeek });
  if (!r.week) return `<div class="page-h"><h1>Weekly Recap</h1></div><div class="card muted">No regular-season games have been played yet.</div>`;
  return `<div class="page-h"><h1>Week ${r.week} Recap</h1><span class="sub">${r.season}</span><div class="right"><select data-change="recapWk" title="Pick a week">${r.weeks.map((w) => `<option value="${w}" ${w === r.week ? 'selected' : ''}>Week ${w}</option>`).join('')}</select></div></div>
    ${r.byes.length ? `<div class="small muted" style="margin-bottom:10px">On bye: ${r.byes.join(', ')}</div>` : ''}
    <div class="recap-grid">${r.games.map((g) => { const hw = g.hs > g.as; return `<div class="card recap ${g.upset ? 'upset' : ''}" data-act="openGame" data-gid="${g.gid}" title="Open full box score">
      ${g.upset ? '<span class="badge yel" title="The underdog won">UPSET</span>' : ''}
      <div class="rl ${hw ? 'lose' : 'win'}">${logo(g.aLogo, 'md')}<b>${esc(g.aAbbr)}</b><span class="sc">${g.as}</span></div>
      <div class="rl ${hw ? 'win' : 'lose'}">${logo(g.hLogo, 'md')}<b>${esc(g.hAbbr)}</b><span class="sc">${g.hs}</span></div>
      <div class="tiny muted">${g.ot ? 'Final/OT' : 'Final'}</div>
      ${g.stars.map((s) => `<div class="star small"><b>${esc(s.name)}</b> <span class="dim">${s.pos}</span> ${esc(s.line)}</div>`).join('')}</div>`; }).join('')}</div>`;
};
ACTIONS.recapWk = (el) => { recapWeek = +el.value; rerender(); };

// ===================================================================== AWARDS RACE
PAGES3.awards = async () => {
  const a = await call('awardRace', {});
  const names = { MVP: 'Most Valuable Player', OPOY: 'Offensive Player of the Year', DPOY: 'Defensive Player of the Year', OROY: 'Offensive Rookie of the Year', DROY: 'Defensive Rookie of the Year', CPOY: 'Comeback Player of the Year' };
  const card = (k) => `<div class="card"><div class="card-h"><h2>${k}</h2><span class="tiny muted">${names[k]}</span></div>${(a.race[k] || []).map((p, i) => `<div class="race-row ${i === 0 ? 'lead' : ''}"><span class="rk">${i + 1}</span>${hs(p.hs, 'sm', p)}<div class="rn"><a href="#/player/${p.pid}">${esc(p.name)}</a><div class="tiny muted">${p.pos} · ${esc(p.teamAbbr)} (${p.teamRec}) · ${esc(p.line || '')}</div></div><div class="rbar" title="Share of the leader's award score">${meter(p.share, 100)}</div></div>`).join('') || '<div class="muted small">No candidates yet.</div>'}</div>`;
  return `<div class="page-h"><h1>Awards Race</h1><span class="sub">${a.season}${a.phase === 'REGULAR_SEASON' ? ` · through Week ${a.week - 1}` : ''}${a.final ? ' · final' : ''}</span></div>
    <div class="small muted" style="margin-bottom:10px">Voters care about production and winning. The MVP almost always goes to a quarterback unless a skill player has a historic year; OPOY usually goes to a running back or receiver.</div>
    <div class="grid g2">${['MVP', 'OPOY', 'DPOY', 'OROY', 'DROY', 'CPOY'].map(card).join('')}</div>`;
};

// ===================================================================== NFL HISTORY
let nhTab = 'sb';
PAGES3.history = async () => {
  const [h, lg] = await Promise.all([call('nflHistory', {}), call('history', {})]);
  const tabs = [['sb', 'Super Bowls'], ['awards', 'MVP & awards'], ['titles', 'Titles by team'], ['league', 'Your league'], ['hof', 'Hall of Fame'], ['trades', 'Trade history']];
  let body = '';
  if (nhTab === 'sb') body = `<div class="card"><table class="tbl-compact hist"><thead><tr><th>SB</th><th>Season</th><th>Champion</th><th>Score</th><th>Runner-up</th><th>MVP</th></tr></thead><tbody>${h.sb.map((x) => `<tr class="${x.real ? '' : 'me'}"><td class="cond b">${esc(x.n)}</td><td>${x.s}</td><td>${logo(x.wTeam?.logo, 'sm')} <b>${esc(x.w)}</b></td><td>${esc(x.sc)}</td><td>${x.lTeam ? logo(x.lTeam.logo, 'sm') : ''} ${esc(x.l)}</td><td>${esc(x.mvp)}</td></tr>`).join('')}</tbody></table><div class="tiny muted" style="margin-top:6px">Highlighted rows were played in your league. Logos show today's franchise.</div></div>`;
  if (nhTab === 'awards') body = `<div class="grid g3">${['MVP', 'OPOY', 'DPOY', 'OROY', 'DROY'].map((k) => `<div class="card"><h2>${k}</h2><div class="scroll" style="max-height:640px">${h.awards[k].map((x) => `<div class="mini-row ${x.real ? '' : 'me'}"><span class="wk">${x.s}</span>${logo(x.team?.logo, 'sm')}${x.pid ? `<a href="#/player/${x.pid}">${esc(x.name)}</a>` : esc(x.name)}</div>`).join('')}</div></div>`).join('')}</div>`;
  if (nhTab === 'titles') body = `<div class="card"><div class="grid g4">${h.titles.map((t) => `<div class="mini-row">${logo(t.logo, 'md')}<b>${esc(t.abbr)}</b><span class="r cond" style="font-size:22px">${'🏆'.repeat(Math.min(t.n, 8))} ${t.n}</span></div>`).join('')}</div></div>`;
  if (nhTab === 'league') body = Object.entries(lg.awards).reverse().map(([s, a]) => `<div class="card"><h2>${s} season</h2><div class="grid g3">${['MVP', 'OPOY', 'DPOY', 'OROY', 'DROY', 'CPOY'].map((k) => `<div><h3>${k}</h3>${(a[k] || []).slice(0, 3).map((x, i) => `<div class="small ${i ? 'muted' : 'b'}">${i + 1}. <a href="#/player/${x.pid}">${esc(x.name)}</a> ${esc(x.pos || '')} · ${esc(x.abbr)}</div>`).join('')}</div>`).join('')}<div><h3>All-Pro 1st team</h3><div class="small">${(a.AP1 || []).map((x) => `${esc(x.pos)} <a href="#/player/${x.pid}">${esc(x.name)}</a>`).join(' · ')}</div></div></div></div>`).join('') || '<div class="card muted">Awards are handed out when the regular season ends.</div>';
  if (nhTab === 'hof') body = `<div class="card">${lg.hof.map((x) => `<div class="mini-row"><b>${x.s}</b> <a href="#/player/${x.pid}">${esc(x.name)}</a> <span class="muted">${esc(x.pos || '')}</span></div>`).join('') || '<div class="muted">Players become eligible five seasons after retiring.</div>'}</div>`;
  if (nhTab === 'trades') body = `<div class="card">${lg.trades.map((t) => `<div class="news-item"><div class="t">${t.s} ${t.ph === 'REGULAR_SEASON' ? 'Wk ' + t.w : ''}</div><div class="x">${esc(t.text)}</div></div>`).join('') || '<div class="muted">No trades yet.</div>'}</div>`;
  return `<div class="page-h"><h1>NFL History</h1><span class="sub">Every Super Bowl and major award since the beginning, plus everything in your league</span></div><div class="tabs">${tabs.map(([k, l]) => `<a class="${nhTab === k ? 'on' : ''}" data-act="nhTab" data-k="${k}">${l}</a>`).join('')}</div>${body}`;
};
ACTIONS.nhTab = (el) => { nhTab = el.dataset.k; rerender(); };

// ===================================================================== FRANCHISE IDENTITY
let fr = { city: null, brand: null, name: '', c1: '#1e3a8a', c2: '#f5c518', shape: 'shield' };
PAGES3.franchise = async () => {
  const o = await call('franchiseOptions', {});
  const t = o.team;
  if (!fr.name) { fr.name = t.name; fr.c1 = t.c1 || fr.c1; fr.c2 = t.c2 || fr.c2; }
  return `<div class="page-h"><h1>Franchise Identity</h1><span class="sub">Relocate or rebrand ${esc(t.region)} ${esc(t.name)}</span></div>
    ${o.offseason ? '' : '<div class="alert">Moves and rebrands can only be made in the offseason (after the Super Bowl through training camp).</div>'}
    <div class="grid g2">
      <div class="card"><h2>Relocate</h2><p class="small muted">Pick a new market. Bigger markets bring more revenue; no-income-tax states help in free agency. CPU teams only move when their market, fans and finances leave no choice.</p>
        <div class="city-grid">${o.cities.map((c) => `<button class="city ${fr.city === c.city ? 'on' : ''}" ${c.taken ? 'disabled' : ''} data-act="frCity" data-c="${esc(c.city)}" title="${esc(c.city)}, ${esc(c.state)} · market ${c.market}M people${c.noTax ? ' · no state income tax' : ''}${c.taken ? ' · already has a team' : ''}"><b>${esc(c.city)}</b><span class="tiny">${esc(c.state)} · ${c.market}M${c.noTax ? ' · no tax' : ''}</span></button>`).join('')}</div>
        <label class="chk" style="margin-top:10px"><input type="checkbox" id="frKeep" ${fr.keep ? 'checked' : ''} data-change="frKeep"> Keep the current team name and colors</label>
        <button class="btn pri" style="margin-top:10px" data-act="frRelocate" ${o.offseason && fr.city ? '' : 'disabled'}>Move to ${esc(fr.city || '…')}</button></div>
      <div class="card"><h2>Rebrand</h2><p class="small muted">Choose one of these identities or make your own name and colors. A new crest is generated for you.</p>
        <div class="brand-grid">${o.brands.map((b) => `<button class="brand-opt ${fr.brand === b.name ? 'on' : ''}" ${b.taken ? 'disabled' : ''} data-act="frBrand" data-n="${esc(b.name)}" data-c1="${b.c1}" data-c2="${b.c2}" data-s="${b.shape}" title="${esc(b.name)}${b.taken ? ' (taken)' : ''}"><img src="${b.logo}" alt=""><span>${esc(b.name)}</span></button>`).join('')}</div>
        <div class="grid g3" style="margin-top:10px"><div><div class="small muted">Name</div><input id="frName" value="${esc(fr.name)}" maxlength="18"></div><div><div class="small muted">Primary</div><input id="frC1" type="color" value="${fr.c1}"></div><div><div class="small muted">Secondary</div><input id="frC2" type="color" value="${fr.c2}"></div></div>
        <div class="small muted" style="margin-top:6px">Crest shape: ${['shield', 'circle', 'diamond', 'star', 'crown', 'anchor', 'bolt'].map((s) => `<button class="btn sm ${fr.shape === s ? 'pri' : ''}" data-act="frShape" data-s="${s}">${s}</button>`).join(' ')}</div>
        <button class="btn pri" style="margin-top:10px" data-act="frRebrand" ${o.offseason ? '' : 'disabled'}>Rebrand</button></div>
    </div>
    ${o.history.length ? `<div class="card"><h2>Franchise history</h2>${o.history.map((x) => `<div class="mini-row">${logo(x.logo, 'sm')}<b>${esc(x.region)} ${esc(x.name)}</b><span class="r">until ${x.s}</span></div>`).join('')}</div>` : ''}`;
};
const frRead = () => { fr.name = $('#frName')?.value || fr.name; fr.c1 = $('#frC1')?.value || fr.c1; fr.c2 = $('#frC2')?.value || fr.c2; };
ACTIONS.frCity = (el) => { frRead(); fr.city = el.dataset.c; rerender(); };
ACTIONS.frKeep = (el) => { fr.keep = el.checked; };
ACTIONS.frBrand = (el) => { fr.brand = el.dataset.n; fr.name = el.dataset.n; fr.c1 = el.dataset.c1; fr.c2 = el.dataset.c2; fr.shape = el.dataset.s; rerender(); };
ACTIONS.frShape = (el) => { frRead(); fr.shape = el.dataset.s; rerender(); };
ACTIONS.frRelocate = async () => { frRead(); if (!confirm(`Move the franchise to ${fr.city}?`)) return; await act('relocate', { city: fr.city, brand: fr.keep ? null : { name: fr.name, c1: fr.c1, c2: fr.c2, shape: fr.shape } }, { msg: 'The franchise has moved!' }); fr.city = null; await APP.reloadTeams?.(); };
ACTIONS.frRebrand = async () => { frRead(); await act('rebrand', { name: fr.name, c1: fr.c1, c2: fr.c2, shape: fr.shape }, { msg: 'New look unveiled!' }); await APP.reloadTeams?.(); };

// ===================================================================== LIVE FREE AGENCY
let faPos = 'ALL';
const POSL = ['ALL', 'QB', 'RB', 'WR', 'TE', 'OT', 'OG', 'C', 'EDGE', 'DT', 'LB', 'CB', 'S', 'K', 'P', 'LS', 'FB'];
PAGES3.fa = async () => {
  const f = await call('faList', { pos: faPos, limit: 250 });
  const isFA = f.phase === 'FREE_AGENCY';
  const st = f.status;
  const host = net.mode !== 'guest';
  return `<div class="page-h"><h1>Free Agency</h1><span class="sub">${isFA ? `Day ${f.day} of ${f.maxDay}` : f.phase === 'POST_DRAFT' ? 'Undrafted free agents & leftovers' : 'Available players: in-season signings are decided right away'} · Cap space <b>${money(f.cap.space)}</b></span>
    <div class="right">${isFA && host ? `<button class="btn pri" data-act="faDay" title="Play out the rest of today: players decide, CPU teams make new offers">${f.day >= f.maxDay ? 'Finish Free Agency ▶' : 'Sim to Next Day ▶'}</button>` : ''}</div></div>
    ${isFA ? `<div class="fa-live" id="faLive"><div class="fa-clock"><div class="tiny">${st?.live ? 'SIGNING WINDOW OPEN' : 'NEGOTIATING WINDOW'}</div><b id="faClock">${st?.live ? 'LIVE' : fmtMs(st?.windowLeftMs)}</b><div class="tiny">${st?.live ? 'Players are choosing teams right now' : 'until players can start signing'}</div></div>
      <div class="fa-ticker" id="faTicker">${f.signings.slice(0, 8).map((s) => `<div class="tk">Day ${s.day}: <b>${esc(s.name)}</b> → ${esc(s.abbr)} ${money(s.apy)} × ${s.years}</div>`).join('') || '<div class="muted small">No signings yet.</div>'}</div></div>` : ''}
    <div class="chips" style="margin:10px 0">${POSL.map((p) => `<span class="pill ${p === faPos ? 'on' : ''}" data-act="faPos2" data-p="${p}">${p}</span>`).join('')}</div>
    ${table({ id: 'fa2', sort: { k: 'ovr', dir: 'desc' }, rows: f.rows, cols: [
    { k: 'name', l: 'Player', f: (p) => pname(p, { sub: `${p.pos} · ${p.age}y${p.lastTeam ? ' · last: ' + p.lastTeam : p.udfa ? ' · UDFA' : ''}` }), sortv: (p) => p.ln },
    { k: 'ovr', l: 'OVR', num: true, f: (p) => `${ovr(p.ovr)}${devBadge(p.dev)}` },
    { k: 'ask', l: 'Asking', num: true, f: (p) => `${money(p.ask)} × ${p.askYears}`, title: 'What his agent is asking per year' },
    { k: 'offers', l: 'Offers', num: true, f: (p) => (p.offers ? `<b title="${p.offers} team${p.offers > 1 ? 's have' : ' has'} made an offer">${p.offers}</b>` : '<span class="dim">0</span>') },
    { k: 'mine', l: '', nosort: true, f: (p) => `${p.myOffer ? `<span class="badge grn" title="Your pending offer">${money(p.myOffer.apy)} × ${p.myOffer.years}</span> ` : ''}<button class="btn sm pri" data-act="negotiate" data-pid="${esc(p.pid)}" data-mode="fa" title="Make or change an offer">${p.myOffer ? 'Change' : 'Offer'}</button>${p.ask <= 1.5e6 ? ` <button class="btn sm" data-act="signMin" data-pid="${esc(p.pid)}" title="Offer the league minimum">Min</button>` : ''}` },
  ] })}`;
};
ACTIONS.faPos2 = (el) => { faPos = el.dataset.p; rerender(); };
const fmtMs = (ms) => { const s = Math.ceil((ms || 0) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// ===================================================================== LIVE DRAFT ROOM
let dTab = 'room', dPos = 'ALL';
PAGES3.draft = async () => {
  const [st, bd] = await Promise.all([call('draftState', {}), call('draftBoard', { pos: dPos })]);
  const host = net.mode !== 'guest';
  const tabs = [['room', st.active ? 'Draft Room · LIVE' : 'Draft Order'], ['board', 'Big Board & Scouting'], ['mine', 'My Board']];
  const oc = st.onClock;
  const prow = (r, extra = '') => `<tr><td class="num">${r.rank}</td><td><a href="#/player/${encodeURIComponent(r.pid)}"><b>${esc(r.name)}</b></a>${r.gen ? ' <span class="badge yel" title="A rare, generational prospect">GENERATIONAL</span>' : ''} <span class="tiny dim">${esc(r.college)}${r.colYrs ? ` · ${r.colYrs} yrs` : ''}</span></td><td>${r.pos}<span class="tiny dim">${r.posRank}</span></td><td class="num">${r.age}</td><td class="num">${r.combine?.forty ?? '—'}</td><td title="Your scouts' grade range: scout more to narrow it">${r.lvl ? `<b>${r.lo}–${r.hi}</b>` : `<span class="dim">${r.lo}–${r.hi}</span>`}</td><td>${esc(r.pot)}</td><td>${r.proj}</td><td>${extra}</td></tr>`;
  const head = '<thead><tr><th class="num">Rk</th><th>Prospect</th><th>Pos</th><th class="num">Age</th><th class="num" title="40-yard dash">40</th><th title="Scouted grade range">Grade</th><th title="Projected ceiling">Pot</th><th title="Media projection">Proj</th><th></th></tr></thead>';
  const posChips = `<div class="chips" style="margin:8px 0">${POSL.map((p) => `<span class="pill ${p === dPos ? 'on' : ''}" data-act="dPos" data-p="${p}">${p}</span>`).join('')}</div>`;
  let body = '';
  if (dTab === 'room') {
    body = st.active ? `<div class="draft-top">
        <div class="otc ${st.userOnClock ? 'me' : ''}">${oc ? `${logo(oc.logo, 'xl')}<div><div class="tiny">ON THE CLOCK · ROUND ${oc.rd}, PICK ${oc.no}${oc.via ? ` (via ${esc(oc.via)})` : ''}</div><div class="otc-team">${esc(oc.abbr)}</div></div><div class="clock" id="draftClock" title="Time left on this pick">${fmtMs(st.clock?.leftMs)}</div>` : '<b>Draft complete</b>'}</div>
        ${host ? `<div class="btn-group dsim"><button class="btn" data-act="dSim1" title="Make the current pick now (your scouts pick for you if you're on the clock)">Sim Pick</button><button class="btn" data-act="dSimRound" title="Sim to the end of this round">Sim Round</button><button class="btn pri" data-act="draftSimNext" title="Sim until you're on the clock">Sim to My Pick</button><button class="btn" data-act="draftSimAll" title="Your scouts make the rest of your picks">Sim Draft</button></div>` : ''}
      </div>
      ${st.userOnClock ? '<div class="alert good"><b>You are on the clock!</b> Pick a player below, or let the clock run out and your scouts take the best available.</div>' : ''}
      <div class="grid g21"><div>${posChips}<div class="tbl-wrap scroll" style="max-height:62vh"><table class="tbl-compact">${head}<tbody>${bd.rows.slice(0, 150).map((r) => prow(r, st.userOnClock ? `<button class="btn sm pri" data-act="draftPick" data-pid="${esc(r.pid)}">Draft</button>` : `<button class="btn sm" data-act="scoutRow" data-pid="${esc(r.pid)}" title="Spend scouting points for a better read">Scout</button>`)).join('')}</tbody></table></div></div>
        <div><div class="card"><h2>Up next</h2>${st.upcoming.slice(0, 14).map((u) => `<div class="mini-row ${u.mine ? 'me' : ''}"><span class="wk">${u.no ?? ''}</span>${logo(u.logo, 'sm')}<b>${esc(u.abbr)}</b>${u.via ? `<span class="tiny dim">via ${esc(u.via)}</span>` : ''}</div>`).join('')}</div>
        <div class="card"><h2>Pick log</h2><div class="scroll" style="max-height:380px" id="pickLog">${st.log.map((l) => `<div class="mini-row"><span class="wk">${l.no}</span>${logo(l.logo, 'sm')}<b>${esc(l.abbr)}</b> <a href="#/player/${encodeURIComponent(l.pid)}">${esc(l.name)}</a> <span class="tiny dim">${esc(l.pos)}</span></div>`).join('') || '<div class="muted small">—</div>'}</div></div></div></div>`
      : `<div class="card"><h2>${st.s} draft order</h2><p class="small muted">${st.orderSet ? 'Set by the final standings and playoff results.' : 'The order is set when the season ends. Until then, pick slots are projected from the standings.'}</p>${st.myPicks.map((k) => `<div class="mini-row">${esc(k.label)}</div>`).join('')}</div>`;
  } else {
    const rows = dTab === 'mine' ? bd.rows.filter((r) => r.onBoard) : bd.rows;
    body = `${posChips}<div class="small muted">Scouting points left: <b>${bd.points}</b>. Each scouting level narrows a prospect's grade and reveals more (combine, personality, development trait, college production).</div>
      <div class="tbl-wrap"><table class="tbl-compact">${head}<tbody>${rows.slice(0, 300).map((r) => prow(r, `<button class="btn sm" data-act="scoutRow" data-pid="${esc(r.pid)}" title="Scout this prospect">Scout ${r.lvl}/3</button> <button class="btn sm" data-act="boardToggleRow" data-pid="${esc(r.pid)}" title="${r.onBoard ? 'Remove from' : 'Add to'} your board">${r.onBoard ? '−' : '+'}</button>`)).join('')}</tbody></table></div>`;
  }
  return `<div class="page-h"><h1>${st.s} NFL Draft</h1><span class="sub">${st.active ? 'Live · 2:00 per pick' : 'Scouting season'}</span></div>
    <div class="tabs">${tabs.map(([k, l]) => `<a class="${dTab === k ? 'on' : ''}" data-act="dTab" data-k="${k}">${l}</a>`).join('')}</div>${body}`;
};
ACTIONS.dTab = (el) => { dTab = el.dataset.k; rerender(); };
ACTIONS.dPos = (el) => { dPos = el.dataset.p; rerender(); };
ACTIONS.dSim1 = () => act('draftSimN', { n: 1 });
ACTIONS.dSimRound = () => act('draftSimN', { round: true }, { busyText: 'Simulating the round…' });

// ===================================================================== live tickers (FA + draft)
let tickBusy = false;
export async function liveTick() {
  const h = APP.header;
  if (!h || tickBusy || document.hidden) return;
  if (h.phase !== 'FREE_AGENCY' && h.phase !== 'DRAFT') return;
  tickBusy = true;
  try {
    if (h.phase === 'FREE_AGENCY') {
      const r = await call('faLive', {});
      const c = $('#faClock');
      if (c) c.textContent = r.status?.live ? 'LIVE' : fmtMs(r.status?.windowLeftMs);
      for (const s of r.signed || []) {
        const mine = s.user;
        if (mine || s.ovr >= 80) toast(`${mine ? '✅ ' : ''}${esc(s.name)} (${s.pos} ${s.ovr}) signed with ${esc(s.abbr)}: ${money(s.apy)} × ${s.years}`, mine ? 'good' : '');
        const tk = $('#faTicker');
        if (tk) tk.insertAdjacentHTML('afterbegin', `<div class="tk new">Day ${s.day}: <b>${esc(s.name)}</b> → ${esc(s.abbr)} ${money(s.apy)} × ${s.years}</div>`);
      }
    } else {
      const r = await call('draftLive', {});
      const c = $('#draftClock');
      if (c && r.clock) { c.textContent = fmtMs(r.clock.leftMs); c.classList.toggle('low', r.clock.leftMs < 20000); }
      if (r.picks && APP.route === 'draft') await rerender();
      else if (r.picks) toast('A pick is in.', '');
    }
  } catch { /* offline or no league */ }
  tickBusy = false;
}
void closeModal; void modal; void delta; void gameCard; void injBadge;
