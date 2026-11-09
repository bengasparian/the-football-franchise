// Front-office pages: trades, free agency, draft, fantasy draft, cap, staff, owner, league meeting, settings
import { call, session, net } from './client.js';
import { esc, $, money, ovr, delta, hs, logo, pname, injBadge, moraleTxt, meter, contractTxt, table, modal, closeModal, toast, bars } from './ui.js';
import { APP, act, rerender } from './app.js';

export const PAGES2 = {};
export const ACTIONS = {};
const POS = ['QB', 'RB', 'FB', 'WR', 'TE', 'OT', 'OG', 'C', 'EDGE', 'DT', 'LB', 'CB', 'S', 'K', 'P', 'LS'];
const posSel = (cur, change) => `<select data-change="${change}"><option value="ALL">All positions</option>${POS.map((p) => `<option ${cur === p ? 'selected' : ''}>${p}</option>`).join('')}</select>`;

// ===================================================================== TRADE CENTER
const TR = { tid: null, give: { players: [], picks: [] }, get: { players: [], picks: [] }, ev: null };
PAGES2.trade = async ([tidS]) => {
  const teams = APP.teams || await call('teams');
  if (tidS && +tidS !== TR.tid) { TR.tid = +tidS; TR.give = { players: [], picks: [] }; TR.get = { players: [], picks: [] }; }
  const want = sessionStorage.getItem('tff-want');
  if (want) { sessionStorage.removeItem('tff-want'); if (!TR.get.players.includes(want)) TR.get.players.push(want); }
  if (TR.tid == null || TR.tid === session.tid) TR.tid = teams.find((t) => t.tid !== session.tid && !t.user)?.tid ?? teams.find((t) => t.tid !== session.tid).tid;
  const [mine, theirs] = await Promise.all([call('tradeAssets', { tid: session.tid }), call('tradeAssets', { tid: TR.tid })]);
  const anything = TR.give.players.length + TR.give.picks.length + TR.get.players.length + TR.get.picks.length;
  TR.ev = anything ? await call('tradeEval', { aiTid: TR.tid, give: TR.give, get: TR.get }) : null;
  const assetList = (A, side) => `<div class="scroll">${A.players.map((p) => { const on = TR[side].players.includes(p.pid); return `<div class="asset ${on ? 'on' : ''}" data-act="trToggle" data-side="${side}" data-kind="players" data-id="${esc(p.pid)}"><input type="checkbox" ${on ? 'checked' : ''}>${hs(p.hs, "", p)}<div style="flex:1;min-width:0"><div class="b" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name)} ${p.onBlock ? '<span class="badge yel">BLOCK</span>' : ''}${p.tradeReq ? '<span class="badge red">REQ</span>' : ''}</div><div class="tiny muted">${p.pos} · ${p.age}y · ${contractTxt(p.contract)}</div></div>${injBadge(p)}${ovr(p.ovr)}</div>`; }).join('')}
    <div class="tiny muted" style="padding:8px">Draft picks</div>${A.picks.map((k) => { const on = TR[side].picks.includes(k.id); return `<div class="asset ${on ? 'on' : ''}" ${k.tradable ? `data-act="trToggle" data-side="${side}" data-kind="picks" data-id="${k.id}"` : 'style="opacity:.4"'}><input type="checkbox" ${on ? 'checked' : ''}><div style="flex:1"><b>${esc(k.label)}</b><div class="tiny muted">projected #${k.proj}${k.tradable ? '' : ' · comp picks untradable until awarded'}</div></div></div>`; }).join('')}</div>`;
  const sel = (A, side) => [...A.players.filter((p) => TR[side].players.includes(p.pid)).map((p) => `${esc(p.name)} (${p.pos} ${p.ovr})`), ...A.picks.filter((k) => TR[side].picks.includes(k.id)).map((k) => esc(k.label))];
  const ev = TR.ev;
  const pctm = ev ? Math.min(100, ev.meter) : 0;
  return `<div class="page-h"><h1>Trade Center</h1><span class="sub">${APP.header.phase === 'REGULAR_SEASON' ? `Trade deadline: after Week ${APP.header.deadline}` : ''}</span><div class="right"><a class="btn" href="#/finder">Trade Finder</a><a class="btn" href="#/offers">Offers</a></div></div>
  <div class="trade-cols">
    <div class="card"><h2>${logo(mine.team.logo, 'sm')} You give</h2><div class="small muted" style="margin-bottom:6px">Cap space ${money(mine.team.cap.space)}</div>${assetList(mine, 'give')}</div>
    <div class="card" style="position:sticky;top:0"><h2>Deal</h2><div class="small muted">You send</div><div class="small b" style="min-height:24px">${sel(mine, 'give').join('<br>') || '—'}</div><div class="small muted" style="margin-top:8px">You receive</div><div class="small b" style="min-height:24px">${sel(theirs, 'get').join('<br>') || '—'}</div>
      <div style="margin:14px 0 6px" class="small muted">${esc(theirs.team.abbr)} interest</div>${meter(pctm, 100, pctm >= 100 ? 'var(--good)' : pctm > 80 ? 'var(--warn)' : 'var(--bad)', 'big')}
      <div class="small" style="margin:8px 0;min-height:36px">${ev ? esc(ev.message) : 'Select players or picks from either side.'}</div>
      <div class="col"><button class="btn pri" data-act="trPropose" ${anything ? '' : 'disabled'}>Propose trade</button><button class="btn" data-act="trMake" ${TR.get.players.length + TR.get.picks.length ? '' : 'disabled'}>What would it take?</button><button class="btn ghost" data-act="trClear">Clear</button></div>
      <div class="tiny muted" style="margin-top:10px">${esc(theirs.team.abbr)} are ${theirs.team.mode === 'contend' ? 'contending (they value proven veterans)' : theirs.team.mode === 'rebuild' ? 'rebuilding (they want youth and picks)' : 'in the middle'}. Cap space ${money(theirs.team.cap.space)}.</div></div>
    <div class="card"><h2><select data-change="trTeam" style="font-family:var(--cond);font-size:16px">${(APP.teams || []).filter((t) => t.tid !== session.tid).map((t) => `<option value="${t.tid}" ${t.tid === TR.tid ? 'selected' : ''}>${esc(t.region)} ${esc(t.name)}${t.user ? ' (human)' : ''}</option>`).join('')}</select></h2>${assetList(theirs, 'get')}</div>
  </div>`;
};
ACTIONS.trToggle = (el) => { const L = TR[el.dataset.side][el.dataset.kind]; const id = el.dataset.id; const i = L.indexOf(id); if (i >= 0) L.splice(i, 1); else L.push(id); rerender(); };
ACTIONS.trTeam = (el) => { location.hash = `#/trade/${el.value}`; };
ACTIONS.trClear = () => { TR.give = { players: [], picks: [] }; TR.get = { players: [], picks: [] }; rerender(); };
ACTIONS.trPropose = async () => {
  const r = await call('tradePropose', { aiTid: TR.tid, give: TR.give, get: TR.get });
  if (r.ok) { toast(esc(r.pending ? r.message : `Trade accepted! ${r.text}`), 'good', 7000); TR.give = { players: [], picks: [] }; TR.get = { players: [], picks: [] }; rerender(); }
  else toast(esc(r.message || r.error || 'Rejected'), 'error');
};
ACTIONS.trMake = async () => {
  const r = await call('tradeMakeItWork', { aiTid: TR.tid, give: TR.give, get: TR.get });
  if (r.error) return toast(esc(r.error), 'error');
  TR.give = r.give; TR.get = r.get;
  toast('The other GM suggested a package. Review it before proposing.', 'good');
  rerender();
};

// ===================================================================== TRADE FINDER
const TF = { give: [], picks: [], pos: 'ALL', results: null };
PAGES2.finder = async () => {
  const mine = await call('tradeAssets', { tid: session.tid });
  const n = TF.give.length + TF.picks.length;
  const lookSel = `<select data-change="tfPos" title="What you want back"><option value="ALL">Best offer (anything)</option><option value="PICKS" ${TF.pos === 'PICKS' ? 'selected' : ''}>Draft picks only</option>${POS.map((p) => `<option ${TF.pos === p ? 'selected' : ''}>${p}</option>`).join('')}</select>`;
  const pickRow = (k) => { const on = TF.picks.includes(k.id); return `<div class="asset ${on ? 'on' : ''}" data-act="tfPick" data-id="${esc(k.id)}" title="Trade value ${Math.round(k.value)}"><input type="checkbox" ${on ? 'checked' : ''}><div style="flex:1"><b>${esc(k.label)}</b><div class="tiny muted">Trade value ${Math.round(k.value)}</div></div></div>`; };
  const offerTxt = (r) => [...r.getV.players.map((p) => `<a href="#/player/${p.pid}">${esc(p.name)}</a> (${p.pos} ${p.ovr}, ${p.age}y)`), ...r.getV.picks.map((k) => esc(k.label))].join(', ') || '—';
  return `<div class="page-h"><h1>Trade Finder</h1><span class="sub">Shop players, draft picks or both. AI GMs answer with real offers.</span></div>
  <div class="grid g12"><div class="card"><h2>Shop these players</h2><div class="scroll" style="max-height:360px">${mine.players.map((p) => { const on = TF.give.includes(p.pid); return `<div class="asset ${on ? 'on' : ''}" data-act="tfToggle" data-id="${esc(p.pid)}"><input type="checkbox" ${on ? 'checked' : ''}>${hs(p.hs, '', p)}<div style="flex:1"><b>${esc(p.name)}</b><div class="tiny muted">${p.pos} · ${p.age}y · ${contractTxt(p.contract)}</div></div>${ovr(p.ovr)}</div>`; }).join('')}</div>
    <h2 style="margin-top:14px">Shop your draft picks</h2><div class="scroll" style="max-height:260px">${mine.picks.filter((k) => k.tradable).map(pickRow).join('') || '<div class="muted small">You have no tradable picks.</div>'}</div>
    <div class="row" style="margin-top:10px"><span class="small muted">Looking for</span>${lookSel}<button class="btn pri" data-act="tfRun" ${n ? '' : 'disabled'} title="Ask every AI team what they'd give">Find offers</button></div>
    <div class="tiny muted" style="margin-top:6px">Shopping only picks? Teams answer with a player or by trading down, giving you more picks that come later.</div></div>
  <div class="card"><h2>Offers ${TF.results ? `(${TF.results.length})` : ''}</h2>${TF.results == null ? '<div class="muted">Select players or picks to shop and hit Find offers.</div>' : TF.results.length ? TF.results.map((r, i) => `<div class="row" style="border-bottom:1px solid var(--line);padding:10px 0;align-items:flex-start">${logo(r.team.logo, 'md')}<div style="flex:1"><b>${esc(r.team.region)} ${esc(r.team.name)}</b>${r.kind === 'down' ? ' <span class="badge">Trade down</span>' : ''}<div class="small">They send: ${offerTxt(r)}</div><div class="small muted">You send: ${[...r.giveV.players.map((p) => esc(p.name)), ...r.giveV.picks.map((k) => esc(k.label))].join(', ')}</div>${r.needsSpot ? '<div class="tiny warn">They\'d accept, but your roster is full. Release or IR someone first.</div>' : ''}</div><div class="col"><button class="btn sm pri" data-act="tfAccept" data-i="${i}" ${r.needsSpot ? 'disabled title="Open a roster spot first"' : ''}>Accept</button><button class="btn sm" data-act="tfLoad" data-i="${i}">Edit in Trade Center</button></div></div>`).join('') : '<div class="muted">No team wants that package right now. Try different players or picks, or ask for something else.</div>'}</div></div>`;
};
ACTIONS.tfToggle = (el) => { const i = TF.give.indexOf(el.dataset.id); if (i >= 0) TF.give.splice(i, 1); else TF.give.push(el.dataset.id); TF.results = null; rerender(); };
ACTIONS.tfPick = (el) => { const i = TF.picks.indexOf(el.dataset.id); if (i >= 0) TF.picks.splice(i, 1); else TF.picks.push(el.dataset.id); TF.results = null; rerender(); };
ACTIONS.tfPos = (el) => { TF.pos = el.value; };
ACTIONS.tfRun = async () => { TF.results = await act('tradeFind', { give: { players: TF.give, picks: TF.picks }, want: { players: [], picks: [] }, pos: TF.pos === 'ALL' ? null : TF.pos }, { refresh: false, busyText: 'Calling around the league…' }); rerender(); };
ACTIONS.tfAccept = async (el) => { const r = TF.results[+el.dataset.i]; const res = await call('tradePropose', { aiTid: r.tid, give: r.give, get: r.get }); if (res.ok) { toast(esc(`Trade done: ${res.text}`), 'good', 7000); TF.give = []; TF.picks = []; TF.results = null; APP.pageCache = {}; rerender(); } else toast(esc(res.message || res.error), 'error'); };
ACTIONS.tfLoad = (el) => { const r = TF.results[+el.dataset.i]; TR.tid = r.tid; TR.give = r.give; TR.get = r.get; location.hash = `#/trade/${r.tid}`; };

// ===================================================================== OFFERS
PAGES2.offers = async () => {
  const o = await call('tradeOffers', {});
  const card = (x, inc) => `<div class="card"><div class="row">${logo(x.from.logo, 'md')}<b>${inc ? `${esc(x.from.region)} ${esc(x.from.name)} offer` : 'Your offer'}</b><span class="muted small">${x.s} ${x.ph === 'REGULAR_SEASON' ? 'Week ' + x.w : ''}</span></div>
    <div class="grid g2" style="margin-top:8px"><div><h3>${inc ? 'You receive' : 'You send'}</h3>${[...x.giveV.players.map((p) => pname(p)), ...x.giveV.picks.map((k) => `<div class="b">${esc(k.label)}</div>`)].join('')}</div><div><h3>${inc ? 'You send' : 'You receive'}</h3>${[...x.getV.players.map((p) => pname(p)), ...x.getV.picks.map((k) => `<div class="b">${esc(k.label)}</div>`)].join('')}</div></div>
    ${inc ? `<div class="row" style="margin-top:10px"><button class="btn pri" data-act="respondOffer" data-id="${x.id}" data-a="1">Accept</button><button class="btn" data-act="respondOffer" data-id="${x.id}" data-a="0">Decline</button></div>` : '<div class="small muted" style="margin-top:8px">Waiting for the other GM.</div>'}</div>`;
  return `<div class="page-h"><h1>Trade Offers</h1></div>${o.incoming.map((x) => card(x, true)).join('') || '<div class="card muted">No incoming offers. AI teams call when they want one of your players, especially near the deadline.</div>'}${o.outgoing.map((x) => card(x, false)).join('')}
    <div class="card"><h2>Recent league trades</h2>${o.log.map((t) => `<div class="news-item"><div class="t">${t.s} ${t.ph === 'REGULAR_SEASON' ? 'W' + t.w : ''}</div><div class="x small">${esc(t.text)}</div></div>`).join('') || '<div class="muted">None yet.</div>'}</div>`;
};

// ===================================================================== FREE AGENCY
let faPos = 'ALL';
PAGES2.fa = async () => {
  const f = await call('faList', { pos: faPos });
  const isFA = f.phase === 'FREE_AGENCY';
  return `<div class="page-h"><h1>Free Agency</h1><span class="sub">${isFA ? `Day ${f.day} of the frenzy` : f.phase === 'POST_DRAFT' ? 'Undrafted free agents & leftovers' : 'Available players'} · Your cap space <b>${money(f.cap.space)}</b></span><div class="right">${posSel(faPos, 'faPos')}${isFA && net.mode !== 'guest' ? '<button class="btn pri" data-act="faDay">Next day ▶</button>' : ''}</div></div>
  ${isFA ? '<div class="card small muted">Stars take a few days and weigh every offer: money, guarantees, contender status, role, no-income-tax states, the coaching staff, and loyalty to their old team. Make offers, then advance days to see decisions.</div>' : ''}
  <div class="grid g21"><div>${table({ id: 'fa', sort: { k: 'ovr', dir: 'desc' }, rows: f.rows, cols: [
    { k: 'name', l: 'Player', f: (p) => pname(p, { sub: `${p.pos}${p.lastTeam ? ' · last: ' + p.lastTeam : p.udfa ? ' · UDFA' : ''}` }), sortv: (p) => p.ln },
    { k: 'pos', l: 'Pos' }, { k: 'age', l: 'Age', num: true }, { k: 'ovr', l: 'OVR', num: true, f: (p) => ovr(p.ovr) }, { k: 'pot', l: 'Pot', f: (p) => esc(p.pot || '—') },
    { k: 'ask', l: 'Asking', num: true, f: (p) => `${money(p.ask)} × ${p.askYears}` }, { k: 'offers', l: 'Offers', num: true, f: (p) => (p.offers ? `<b>${p.offers}</b>` : '0') },
    { k: 'mine', l: '', nosort: true, f: (p) => `${p.myOffer ? `<span class="badge grn">Your offer ${money(p.myOffer.apy)}</span> ` : ''}<button class="btn sm pri" data-act="negotiate" data-pid="${esc(p.pid)}" data-mode="fa">Offer</button>${p.ask <= 1.5e6 ? ` <button class="btn sm" data-act="signMin" data-pid="${esc(p.pid)}">Min</button>` : ''}` },
  ] })}</div><div class="card"><h2>Latest signings</h2>${f.signings.map((s) => `<div class="small" style="padding:3px 0;border-bottom:1px solid var(--line)">Day ${s.day}: <a href="#/player/${s.pid}">${esc(s.name)}</a> → <b>${esc(s.abbr)}</b> ${money(s.apy)} × ${s.years}</div>`).join('') || '<div class="muted small">—</div>'}</div></div>`;
};
ACTIONS.faPos = (el) => { faPos = el.value; rerender(); };

// ===================================================================== DRAFT
let draftTab = null, draftPos = 'ALL';
PAGES2.draft = async () => {
  const [st, bd] = await Promise.all([call('draftState', {}), call('draftBoard', { pos: draftPos })]);
  draftTab ||= st.active ? 'room' : 'board';
  const tabs = [['room', st.active ? 'Draft Room (LIVE)' : 'Draft Order'], ['board', 'Big Board & Scouting'], ['mine', 'My Board']];
  let body = '';
  const prow = (r, extra = '') => `<tr><td class="num">${r.rank}</td><td><a href="#/player/${encodeURIComponent(r.pid)}"><b>${esc(r.name)}</b></a> <span class="tiny dim">${esc(r.college)}</span></td><td>${r.pos}<span class="tiny dim">${r.posRank}</span></td><td class="num">${r.age}</td><td class="num">${r.combine?.forty ?? '—'}</td><td>${r.lvl ? `<b>${r.lo}–${r.hi}</b>` : `<span class="dim">${r.lo}–${r.hi}</span>`}</td><td>${esc(r.pot)}</td><td>${r.proj}</td><td>${extra}</td></tr>`;
  const head = '<thead><tr><th class="num">Rk</th><th>Prospect</th><th>Pos</th><th class="num">Age</th><th class="num">40</th><th>Grade</th><th>Pot</th><th>Proj</th><th></th></tr></thead>';
  if (draftTab === 'room') {
    const oc = st.onClock;
    body = `<div class="grid g21"><div>${st.active ? `<div class="card" style="border-color:${st.userOnClock ? 'var(--good)' : 'var(--line)'}"><h2>${oc ? `On the clock: ${logo(oc.logo, 'sm')} ${esc(oc.abbr)} — Rd ${oc.rd}, Pick ${oc.no}${oc.via ? ` (via ${esc(oc.via)})` : ''}` : 'Draft complete'}</h2>
      ${st.userOnClock ? '<div class="good b" style="margin-bottom:8px">You are on the clock! Pick from the board below.</div>' : ''}<div class="row">${st.userOnClock ? '<button class="btn" data-act="draftAuto">Auto-pick for me</button>' : ''}${net.mode !== 'guest' ? '<button class="btn pri" data-act="draftSimNext">Sim to my next pick</button><button class="btn" data-act="draftSimAll">Sim entire draft</button>' : ''}</div></div>` : `<div class="card"><h2>${st.s} draft order</h2><p class="muted small">${st.orderSet ? 'Set by the final standings and playoff results.' : 'The order is set when the season ends. Until then, picks are projected from current standings.'}</p></div>`}
      ${st.active ? `<div class="tbl-wrap scroll"><table class="tbl-compact">${head}<tbody>${bd.rows.slice(0, 120).map((r) => prow(r, st.userOnClock ? `<button class="btn sm pri" data-act="draftPick" data-pid="${esc(r.pid)}">Draft</button>` : '')).join('')}</tbody></table></div>` : ''}</div>
      <div><div class="card"><h2>Upcoming</h2>${st.upcoming.slice(0, 16).map((u) => `<div class="row small" style="padding:3px 0;${u.mine ? 'font-weight:700;color:var(--accent2)' : ''}"><span class="dim" style="width:34px">${u.no ?? ''}</span>${logo(u.logo, 'sm')} ${esc(u.abbr)} ${u.via ? `<span class="tiny dim">via ${esc(u.via)}</span>` : ''}${u.comp ? ' <span class="tiny">comp</span>' : ''}</div>`).join('') || '<div class="muted small">—</div>'}</div>
      <div class="card"><h2>Picks made</h2><div class="scroll">${st.log.map((l) => `<div class="small" style="padding:3px 0;border-bottom:1px solid var(--line)"><span class="dim">${l.rd}.${l.no}</span> ${logo(l.logo, 'sm')} ${esc(l.abbr)}: <a href="#/player/${encodeURIComponent(l.pid)}">${esc(l.name)}</a> ${esc(l.pos)} <span class="dim">${esc(l.college)}</span></div>`).join('') || '<div class="muted small">—</div>'}</div></div>
      <div class="card"><h2>My picks</h2>${st.myPicks.map((k) => `<div class="small">${esc(k.label)}</div>`).join('') || '<div class="muted small">None</div>'}</div></div></div>`;
  }
  if (draftTab === 'board') body = `<div class="row" style="margin-bottom:10px"><span class="badge blu">Scouting points: ${bd.scoutPts}</span><span class="small muted">Lvl 1: ${bd.costs[1]} · Lvl 2: ${bd.costs[2]} · Lvl 3: ${bd.costs[3]} pts. Grades are your scouts' view of the prospect's rookie overall. Scouting narrows the range.</span><span style="flex:1"></span>${posSel(draftPos, 'draftPos')}</div>
    <div class="tbl-wrap">${`<table class="tbl-compact">${head}<tbody>${bd.rows.map((r) => prow(r, `${r.lvl < 3 ? `<button class="btn sm" data-act="scoutRow" data-pid="${esc(r.pid)}">Scout</button>` : '<span class="badge grn">Scouted</span>'} <button class="btn sm ${r.onBoard ? 'pri' : ''}" data-act="boardToggleRow" data-pid="${esc(r.pid)}">${r.onBoard ? '★' : '☆'}</button>${st.userOnClock ? ` <button class="btn sm pri" data-act="draftPick" data-pid="${esc(r.pid)}">Draft</button>` : ''}`)).join('')}</tbody></table>`}</div>`;
  if (draftTab === 'mine') { const mineRows = bd.board.map((pid) => bd.rows.find((r) => r.pid === pid)).filter(Boolean); body = `<div class="card"><h2>My big board</h2>${mineRows.length ? `<table class="tbl-compact">${head}<tbody>${mineRows.map((r) => prow(r, `<span class="btn-group"><button class="btn sm" data-act="boardMove" data-pid="${esc(r.pid)}" data-d="-1">▲</button><button class="btn sm" data-act="boardMove" data-pid="${esc(r.pid)}" data-d="1">▼</button></span> <button class="btn sm" data-act="boardToggleRow" data-pid="${esc(r.pid)}">✕</button>${st.userOnClock ? ` <button class="btn sm pri" data-act="draftPick" data-pid="${esc(r.pid)}">Draft</button>` : ''}`)).join('')}</tbody></table>` : '<div class="muted">Star prospects on the Big Board to build your own ranking.</div>'}</div>`; }
  return `<div class="page-h"><h1>${st.s} NFL Draft</h1><span class="sub">${st.active ? 'Live' : 'Scouting'} · 7 rounds + compensatory picks</span></div><div class="tabs">${tabs.map(([k, l]) => `<a class="${draftTab === k ? 'on' : ''}" data-act="draftTab" data-k="${k}">${l}</a>`).join('')}</div>${body}`;
};
ACTIONS.draftTab = (el) => { draftTab = el.dataset.k; rerender(); };
ACTIONS.draftPos = (el) => { draftPos = el.value; rerender(); };
ACTIONS.scoutRow = async (el) => act('scout', { pid: el.dataset.pid });
ACTIONS.boardToggleRow = async (el) => act('boardToggle', { pid: el.dataset.pid });
ACTIONS.boardMove = async (el) => act('boardMove', { pid: el.dataset.pid, dir: +el.dataset.d });
ACTIONS.draftPick = async (el) => { const r = await act('draftPick', { pid: el.dataset.pid }, { refresh: false }); if (!r.error) { toast('Pick is in!', 'good'); await act('draftSim', { all: false }, { busyText: 'Other teams are picking…' }); } };
ACTIONS.draftAuto = async () => { const r = await act('draftAuto', {}, { refresh: false }); if (!r.error) await act('draftSim', { all: false }, { busyText: 'Other teams are picking…' }); };
ACTIONS.draftSimNext = async () => act('draftSim', { all: false }, { busyText: 'Simulating picks…' });
ACTIONS.draftSimAll = async () => { if (confirm('Let your scouts make all of your remaining picks?')) await act('draftSim', { all: true }, { busyText: 'Simulating the draft…' }); };

// ===================================================================== FANTASY DRAFT
let fdPos = 'ALL', fdQ = '', fdView = 'players', fdBlock = null;
const POS_CLS = { QB: 'q', RB: 'o', FB: 'o', WR: 'o', TE: 'o', OT: 'l', OG: 'l', C: 'l', EDGE: 'd', DT: 'd', LB: 'd', CB: 'b', S: 'b', K: 's', P: 's', LS: 's' };
// Madden-style draft board: teams across the top, rounds down the side, each pick in its square
function fdBoard(f) {
  const cur = f.F.round;
  const blk = fdBlock ?? Math.floor((cur - 1) / 8);
  const r0 = blk * 8 + 1, r1 = Math.min(f.F.rounds, r0 + 7);
  const onClockCol = f.onClock;
  const rows = [];
  for (let r = r0; r <= r1; r++) {
    rows.push(`<tr><th class="rd" title="${r % 2 ? 'Picks go left to right' : 'Snake: picks go right to left'}">R${r}<span class="tiny dim">${r % 2 ? '→' : '←'}</span></th>${f.teams.map((t, i) => {
      const x = f.board[r]?.[t.tid];
      const no = (r - 1) * 32 + (r % 2 ? i + 1 : 32 - i);
      const now = r === cur && t.tid === onClockCol;
      return `<td class="${t.tid === f.me ? 'me' : ''} ${now ? 'now' : ''}" title="Pick ${no}${x ? `: ${esc(x.name)} (${x.pos} ${x.ovr})` : now ? ' (on the clock)' : ''}">${x ? `<a href="#/player/${esc(x.pid)}" class="bp p-${POS_CLS[x.pos] || 'o'}"><b>${esc(x.pos)}</b> ${esc(x.name)}<span>${x.ovr}</span></a>` : now ? '<span class="clk">ON THE CLOCK</span>' : `<span class="dim tiny">${no}</span>`}</td>`;
    }).join('')}</tr>`);
  }
  const blocks = Math.ceil(f.F.rounds / 8);
  return `<div class="card"><div class="card-h"><h2>Draft board</h2><div class="btn-group">${Array.from({ length: blocks }, (_, b) => `<button class="btn sm ${b === blk ? 'pri' : ''}" data-act="fdBlock" data-b="${b}">R${b * 8 + 1}-${Math.min(f.F.rounds, b * 8 + 8)}</button>`).join('')}</div></div>
    <div class="tiny muted" style="margin-bottom:6px">Snake draft: odd rounds go left to right, even rounds right to left. Your column is highlighted. Colors: QB, skill players, line, defensive front, secondary, specialists.</div>
    <div class="fd-board"><table><thead><tr><th></th>${f.teams.map((t) => `<th class="${t.tid === f.me ? 'me' : ''}" title="${esc(t.abbr)}">${logo(t.logo, 'sm')}<div>${esc(t.abbr)}</div></th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div></div>`;
}
const FD_TABS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'OT', 'OG', 'C', 'EDGE', 'DT', 'LB', 'CB', 'S', 'K', 'P', 'LS', 'FB'];
const FD_NEED = { QB: 3, RB: 4, WR: 6, TE: 3, OT: 4, OG: 4, C: 2, EDGE: 5, DT: 4, LB: 4, CB: 6, S: 4, K: 1, P: 1, LS: 1, FB: 1 };
PAGES2.fantasy = async () => {
  const f = await call('fantasyState', { pos: fdPos, q: fdQ });
  if (!f.F) return '<div class="card">No fantasy draft in this league.</div>';
  if (f.F.done) return `<div class="card"><h2>Fantasy draft complete</h2><a class="btn pri" href="#/roster">See your roster</a></div>`;
  const teamCounts = {};
  for (const p of f.mine) teamCounts[p.pos] = (teamCounts[p.pos] || 0) + 1;
  const mySlot = f.teams.findIndex((t) => t.tid === f.me) + 1;
  const viewTabs = `<div class="tabs"><a class="${fdView === 'players' ? 'on' : ''}" data-act="fdView" data-v="players">Available players</a><a class="${fdView === 'board' ? 'on' : ''}" data-act="fdView" data-v="board">Draft board</a></div>`;
  const head = `<div class="page-h"><h1>Fantasy Draft</h1><span class="sub">Round ${f.F.round} of ${f.F.rounds} · Pick ${(f.F.round - 1) * 32 + f.F.idx + 1}${mySlot ? ` · you pick ${mySlot}${mySlot === 1 ? 'st' : mySlot === 2 ? 'nd' : mySlot === 3 ? 'rd' : 'th'} in odd rounds, ${33 - mySlot}${33 - mySlot === 1 ? 'st' : 33 - mySlot === 2 ? 'nd' : 33 - mySlot === 3 ? 'rd' : 'th'} in even rounds` : ''}</span><div class="right">`;
  if (fdView === 'board') return `${head}${f.mineOnClock ? '<span class="badge grn">You are on the clock</span><button class="btn" data-act="fdAuto">Auto-pick</button>' : ''}${net.mode !== 'guest' ? '<button class="btn pri" data-act="fdSim">Sim to my pick</button><button class="btn" data-act="fdSimAll">Auto-draft the rest</button>' : ''}</div></div>${viewTabs}${fdBoard(f)}`;
  return `${head.replace('<div class="right">', '<div class="right">')}${f.mineOnClock ? '<span class="badge grn">You are on the clock</span><button class="btn" data-act="fdAuto">Auto-pick</button>' : ''}${net.mode !== 'guest' ? '<button class="btn pri" data-act="fdSim">Sim to my pick</button><button class="btn" data-act="fdSimAll">Auto-draft the rest</button>' : ''}</div></div>
  ${viewTabs}<div class="card" style="padding:10px 12px"><div class="row" style="flex-wrap:wrap;gap:6px">${FD_TABS.map((p) => { const have = teamCounts[p] || 0; const need = FD_NEED[p]; return `<button class="btn sm ${fdPos === p ? 'pri' : ''}" data-act="fdTab" data-p="${p}" title="${p === 'ALL' ? 'Show every available player' : `Show only ${p}s. You have ${have}, a typical roster carries about ${need}.`}">${p}${p !== 'ALL' ? ` <span class="${have >= need ? 'good' : have ? 'warn' : 'dim'}" style="font-size:11px">${have}/${need}</span>` : ''}</button>`; }).join('')}
    <input id="fdSearch" placeholder="Search name…" value="${esc(fdQ)}" style="margin-left:auto;min-width:180px" title="Type a player's name and press Enter"></div>
    <div class="tiny muted" style="margin-top:6px">${f.pool.length}${f.pool.length >= 300 ? '+' : ''} available${fdPos !== 'ALL' ? ` at ${fdPos}` : ''}${fdQ ? ` matching "${esc(fdQ)}"` : ''}. The numbers show how many you have vs. how many a team usually carries.</div></div>
  <div class="grid g21"><div>${table({ id: 'fd', sort: { k: 'ovr', dir: 'desc' }, rows: f.pool, cols: [{ k: 'name', l: 'Player', f: (p) => pname(p, { sub: p.pos }) }, { k: 'pos', l: 'Pos' }, { k: 'age', l: 'Age', num: true }, { k: 'ovr', l: 'OVR', num: true, f: (p) => ovr(p.ovr) }, { k: 'pot', l: 'Pot' }, { k: 'c', l: 'Contract', f: (p) => contractTxt(p.contract), sortv: (p) => p.contract?.apy || 0 }, { k: 'x', l: '', nosort: true, f: (p) => (f.mineOnClock ? `<button class="btn sm pri" data-act="fdPick" data-pid="${esc(p.pid)}">Draft</button>` : '') }] })}</div>
  <div><div class="card"><h2>My roster (${f.mine.length}/53)</h2><div class="chips" style="margin-bottom:8px">${POS.filter((p) => p !== 'FB' && p !== 'LS').map((p) => `<span class="pill">${p} ${teamCounts[p] || 0}</span>`).join('')}</div>${f.mine.slice().sort((a, b) => b.ovr - a.ovr).map((p) => `<div class="row small" style="justify-content:space-between;padding:2px 0">${esc(p.pos)} ${esc(p.name)} ${ovr(p.ovr)}</div>`).join('')}</div>
  <div class="card"><h2>Recent picks</h2>${f.log.slice(0, 30).map((l) => `<div class="small">R${l.r} ${esc(l.abbr)}: ${esc(l.name)} (${l.pos} ${l.ovr})</div>`).join('')}</div></div></div>`;
};
ACTIONS.fdPos = (el) => { fdPos = el.value; rerender(); };
ACTIONS.fdView = (el) => { fdView = el.dataset.v; fdBlock = null; rerender(); };
ACTIONS.fdBlock = (el) => { fdBlock = +el.dataset.b; rerender(); };
ACTIONS.fdTab = (el) => { fdPos = el.dataset.p; rerender(); };
document.addEventListener('keydown', (e) => { if (e.target?.id === 'fdSearch' && e.key === 'Enter') { fdQ = e.target.value; rerender(); } });
document.addEventListener('input', (e) => { if (e.target?.id === 'fdSearch' && !e.target.value && fdQ) { fdQ = ''; rerender(); } });
ACTIONS.fdPick = async (el) => { const r = await act('fantasyMakePick', { pid: el.dataset.pid }, { refresh: false }); if (!r.error) await act('fantasySim', { all: false }, { busyText: 'Other GMs are picking…' }); };
ACTIONS.fdAuto = async () => { const r = await act('fantasyAutoMine', {}, { refresh: false }); if (!r.error) await act('fantasySim', { all: false }, { busyText: 'Other GMs are picking…' }); };
ACTIONS.fdSim = async () => act('fantasySim', { all: false }, { busyText: 'Drafting…' });
ACTIONS.fdSimAll = async () => { if (confirm('Auto-draft the rest of your roster?')) { await act('fantasySim', { all: true }, { busyText: 'Drafting the rest…' }); location.hash = '#/home'; } };

// ===================================================================== CAP
PAGES2.cap = async ([tidS]) => {
  const tid = tidS ? +tidS : session.tid;
  const c = await call('capSheet', { tid });
  const yrs = Object.keys(c.caps).map(Number);
  const items = c.future.map((f) => ({ l: String(f.s), v: f.used / 1e6, t: `${money(f.used)} committed of ${money(f.cap)}`, c: f.used > f.cap ? 'var(--bad)' : 'var(--accent)' }));
  return `<div class="page-h">${logo(c.team.logo, 'md')}<h1>Salary Cap</h1><span class="sub">${c.season} league year</span></div>
  <div class="grid g4"><div class="stat"><div class="l">Salary cap${c.cap.rollover ? ' (incl. rollover)' : ''}</div><div class="v">${money(c.cap.cap)}</div></div><div class="stat"><div class="l">Committed</div><div class="v">${money(c.cap.used)}</div></div><div class="stat"><div class="l">Dead money</div><div class="v bad">${money(c.cap.dead)}</div></div><div class="stat"><div class="l">Cap space</div><div class="v ${c.cap.space < 0 ? 'bad' : 'good'}">${money(c.cap.space)}</div></div></div>
  <div class="grid g21" style="margin-top:16px"><div class="card"><h2>Future commitments</h2>${bars(items)}<div class="small muted">Projected caps: ${yrs.map((y) => `${y} ${money(c.caps[y])}`).join(' · ')}. Cap growth is about 6–9% a year.</div></div>
  <div class="card"><h2>Dead money</h2>${c.dead.map((d) => `<div class="small row" style="justify-content:space-between"><span>${d.s} ${esc(d.name)}${d.trade ? ' (trade)' : ''}</span><b class="bad">${money(d.amt)}</b></div>`).join('') || '<div class="muted small">None</div>'}<h3 style="margin-top:12px">${c.season} tag values</h3><div class="small">${['QB', 'RB', 'WR', 'TE', 'OT', 'EDGE', 'DT', 'LB', 'CB', 'S', 'K'].map((p) => `${p} ${money(c.tags[p]?.F)}`).join(' · ')}</div></div></div>
  ${table({ id: 'cap', sort: { k: 'hit', dir: 'desc' }, rows: c.players, cols: [
    { k: 'name', l: 'Player', f: (p) => pname(p, { sub: `${p.pos} · ${p.status}` }), sortv: (p) => p.ln }, { k: 'ovr', l: 'OVR', num: true, f: (p) => ovr(p.ovr) }, { k: 'age', l: 'Age', num: true },
    ...yrs.map((y, i) => ({ k: `y${i}`, l: String(y), num: true, f: (p) => { const yy = p.years.find((x) => x.s === y); return yy ? `${money(yy.hit)}${yy.gtd ? '<span class="tiny good"> g</span>' : ''}` : (i === 0 && p.contract?.ps ? money(p.contract.hit) : '<span class="dim">—</span>'); }, sortv: (p) => p.years.find((x) => x.s === y)?.hit || (i === 0 && p.contract?.ps ? p.contract.hit : 0) })),
    { k: 'hit', l: 'Cut: dead / save', num: true, f: (p) => (p.dead ? `<span class="bad">${money(p.dead.now)}</span> / <span class="good">${money(p.dead.save)}</span>` : '—'), sortv: (p) => p.contract?.hit || 0 },
  ] })}`;
};

// ===================================================================== STAFF
PAGES2.staff = async ([tidS]) => {
  const tid = tidS ? +tidS : session.tid;
  const s = await call('staff', { tid });
  const card = (c, role) => c ? `<div class="card"><div class="row" style="justify-content:space-between"><h2 style="margin:0">${role === 'HC' ? 'Head Coach' : role === 'OC' ? 'Offensive Coordinator' : 'Defensive Coordinator'}</h2>${ovr(c.ovr)}</div><div class="big" style="font-size:24px;margin:6px 0">${esc(c.name)}</div>
    <div class="kv small"><div>Age</div><div>${c.age}</div><div>Offense</div><div>${c.off}</div><div>Defense</div><div>${c.def}</div><div>Game management</div><div>${c.gm}</div><div>Player development</div><div>${c.dev}</div><div>4th-down aggression</div><div>${Math.round(c.agg * 100)}</div><div>Scheme</div><div>${esc(role === 'DC' ? c.schemeDef : role === 'OC' ? c.schemeOff : `${c.schemeOff} / ${c.schemeDef}`)}</div>${c.rec && c.rec.w + c.rec.l ? `<div>HC record</div><div>${c.rec.w}-${c.rec.l}${c.rec.t ? '-' + c.rec.t : ''} (${c.rec.pw}-${c.rec.pl} playoffs${c.rec.sb ? `, ${c.rec.sb} SB` : ''})</div>` : ''}<div>Contract</div><div>${c.contract.yrs} yrs · ${money(c.contract.salary)}/yr</div></div>
    ${s.mine ? `<button class="btn danger sm" style="margin-top:10px" data-act="fireCoach" data-role="${role}">Fire</button>` : ''}</div>` : `<div class="card"><h2>${role}: Vacant</h2><p class="muted">Hire from the pool below.</p></div>`;
  return `<div class="page-h">${logo(s.team.logo, 'md')}<h1>Coaching Staff</h1><span class="sub">Development bonus ${s.devBonus >= 0 ? '+' : ''}${(s.devBonus || 0).toFixed(1)}/yr for young players</span></div>
    <div class="grid g3">${card(s.hc, 'HC')}${card(s.oc, 'OC')}${card(s.dc, 'DC')}</div>
    ${s.mine ? `<div class="card"><h2>Available coaches</h2>${table({ id: 'coachpool', sort: { k: 'ovr', dir: 'desc' }, rows: s.pool, cols: [{ k: 'name', l: 'Name', f: (c) => `<b>${esc(c.name)}</b>` }, { k: 'role', l: 'Role' }, { k: 'age', l: 'Age', num: true }, { k: 'ovr', l: 'OVR', num: true, f: (c) => ovr(c.ovr) }, { k: 'off', l: 'Off', num: true }, { k: 'def', l: 'Def', num: true }, { k: 'dev', l: 'Dev', num: true }, { k: 'gm', l: 'GM', num: true }, { k: 'schemeOff', l: 'Scheme', f: (c) => esc(c.role === 'DC' ? c.schemeDef : c.schemeOff) }, { k: 'h', l: 'Hire as', nosort: true, f: (c) => ['HC', 'OC', 'DC'].map((r) => `<button class="btn sm" data-act="hireCoach" data-cid="${c.cid}" data-role="${r}">${r}</button>`).join(' ') }] })}</div>` : ''}
    <div class="card"><h2>League head coaches</h2>${table({ id: 'lgcoach', sort: { k: 'ovr', dir: 'desc' }, rows: s.league.map((t) => ({ ...t, ovr: t.hc?.ovr || 0, nm: t.hc?.name || 'Vacant' })), cols: [{ k: 'abbr', l: 'Team', f: (t) => `${logo(t.logo, 'sm')} ${esc(t.abbr)}` }, { k: 'nm', l: 'Head coach' }, { k: 'ovr', l: 'OVR', num: true, f: (t) => ovr(t.ovr) }, { k: 'rec', l: 'Career', f: (t) => (t.hc?.rec ? `${t.hc.rec.w}-${t.hc.rec.l}` : '') , nosort: true }] })}</div>`;
};
ACTIONS.fireCoach = async (el) => { if (confirm('Fire this coach? Remaining salary still counts against your finances (not the cap).')) await act('fire', { role: el.dataset.role }, { msg: 'Coach fired.' }); };
ACTIONS.hireCoach = async (el) => act('hire', { cid: el.dataset.cid, role: el.dataset.role }, { msg: 'Coach hired!' });

// ===================================================================== OWNER & FINANCES
PAGES2.owner = async ([tidS]) => {
  const tid = tidS ? +tidS : session.tid;
  const f = await call('finances', { tid });
  const fs = f.fin.seasons[f.season] || {};
  const last = f.fin.seasons[f.season - 1];
  const gr = f.goalResults;
  return `<div class="page-h">${logo(f.team.logo, 'md')}<h1>Owner & Finances</h1><span class="sub">Owner: ${esc(f.owner.name)}</span></div>
  <div class="grid g3"><div class="card"><h2>Job security</h2><div class="big ${f.jobSec < 30 ? 'bad' : f.jobSec < 55 ? 'warn' : 'good'}">${f.jobSec}/100</div>${meter(f.jobSec, 100, f.jobSec < 30 ? 'var(--bad)' : f.jobSec < 55 ? 'var(--warn)' : 'var(--good)', 'big')}
    <div class="kv small" style="margin-top:10px"><div>Owner patience</div><div>${Math.round(f.owner.patience * 100)}</div><div>Willingness to spend</div><div>${Math.round(f.owner.spend * 100)}</div><div>Meddling</div><div>${Math.round(f.owner.meddle * 100)}</div></div></div>
  <div class="card"><h2>${f.season} goals</h2>${(f.goals || []).map((g) => `<div class="small" style="padding:3px 0">• ${esc(g.text)}</div>`).join('') || '<div class="muted small">Set at training camp.</div>'}${gr ? `<h3 style="margin-top:10px">${gr.s} review</h3>${gr.res.map((g) => `<div class="small ${g.ok ? 'good' : 'bad'}">${g.ok ? '✓' : '✗'} ${esc(g.text)}</div>`).join('')}` : ''}</div>
  <div class="card"><h2>Fans</h2><div class="kv"><div>Fan happiness</div><div>${f.fin.fanHappy}/100</div><div>Hype</div><div>${f.fin.hype}/100</div><div>Stadium</div><div>${f.stadium.cap.toLocaleString()} seats${f.stadium.dome ? ' · dome' : ''}</div><div>Market size</div><div>${f.market}M metro</div><div>Projected attendance</div><div>${f.att.toLocaleString()} (${Math.round((f.att / f.stadium.cap) * 100)}%)</div></div></div></div>
  <div class="grid g2"><div class="card"><h2>Pricing</h2>${f.mine ? `<div class="small muted">League-typical price for your market ≈ $${f.ref}. Higher prices raise revenue but cut attendance and fan happiness.</div>
    <div style="margin-top:10px"><div class="row" style="justify-content:space-between"><span>Avg ticket</span><b id="tkV">$${f.fin.ticket}</b></div><input type="range" min="60" max="420" value="${f.fin.ticket}" id="tk" oninput="document.getElementById('tkV').textContent='$'+this.value"></div>
    <div style="margin-top:8px"><div class="row" style="justify-content:space-between"><span>Concessions pricing</span><b>${Math.round(f.fin.concessions * 100)}%</b></div><input type="range" min="60" max="160" value="${Math.round(f.fin.concessions * 100)}" id="cc"></div>
    <button class="btn pri" data-act="setPrices" style="margin-top:10px">Save prices</button>` : `<div class="small">Avg ticket $${f.fin.ticket}</div>`}</div>
  <div class="card"><h2>${f.season} revenue so far</h2><div class="kv"><div>Home games</div><div>${fs.homeGames || 0}</div><div>Gate</div><div>${money(fs.gate || 0)}</div><div>Concessions & parking</div><div>${money(fs.conc || 0)}</div><div>Per home game (projected)</div><div>${money(f.rev.total)}</div></div>
    ${last ? `<h3 style="margin-top:12px">${f.season - 1} final</h3><div class="kv small"><div>National TV & league share</div><div>${money(last.tv)}</div><div>Gate + concessions</div><div>${money(last.gate + last.conc)}</div><div>Merchandise</div><div>${money(last.merch)}</div><div>Sponsorships</div><div>${money(last.sponsor)}</div><div>Player cash</div><div>-${money(last.salaries)}</div><div>Staff & operations</div><div>-${money(last.staff + last.ops)}</div><div><b>Profit</b></div><div class="${last.profit >= 0 ? 'good' : 'bad'} b">${money(last.profit)}</div></div>` : '<div class="small muted" style="margin-top:8px">Full-season financials appear after the season.</div>'}</div></div>`;
};
ACTIONS.setPrices = async () => act('setPrices', { ticket: +$('#tk').value, concessions: +$('#cc').value / 100 }, { msg: 'Prices updated.' });

// ===================================================================== LEAGUE MEETING / RULES
PAGES2.rules = async () => {
  const r = await call('rulesView', {});
  const P = r.proposals;
  const live = r.phase === 'LEAGUE_MEETING' && P && !P.done;
  const R = r.rules;
  const ruleRows = [['Active roster', R.activeMax], ['Practice squad', `${R.psMax} (+1 international)`], ['Regular season', `${R.games} games / ${R.weeks} weeks`], ['Playoff teams per conference', R.playoffTeamsPerConf], ['Regular-season OT', `${R.regOtMinutes} min, both teams possess`], ['Kickoff touchback', `${R.kickoffTouchback}-yard line`], ['Extra point', `${R.xpDistance}-yard try`], ['Trade deadline', `after Week ${R.tradeDeadlineWeek}`], ['IR minimum / returns', `${R.irMinGames} games / ${R.irReturns} returns`], ['Tush push', R.tushPush ? 'Legal' : 'Banned'], ['Franchise tag', R.franchiseTag ? 'Yes' : 'Abolished'], ['Division winners host', R.reseedDivisionWinners ? 'No (seeded by record)' : 'Yes'], ['Rookie contracts', `${R.rookieYears} years`]];
  return `<div class="page-h"><h1>Annual League Meeting</h1><span class="sub">Rule changes need 24 of 32 owner votes</span></div>
  <div class="grid g21"><div>${P ? `<div class="card"><h2>${P.s} proposals ${live ? '<span class="badge grn">VOTING OPEN</span>' : '<span class="badge">Decided</span>'}</h2>${P.items.map((it) => `<div style="border-bottom:1px solid var(--line);padding:10px 0"><div class="b">${esc(it.title)}</div><div class="small muted">${esc(it.desc)} · Proposed by ${esc(it.by)}</div>
    ${it.votes ? `<div class="small ${it.passed ? 'good' : 'bad'} b" style="margin-top:4px">${it.passed ? 'PASSED' : 'FAILED'} ${it.votes.yes}-${it.votes.no}</div>` : live ? `<div class="row" style="margin-top:6px"><button class="btn sm ${it.userVotes[r.myTid] === true ? 'pri' : ''}" data-act="vote" data-id="${it.id}" data-y="1">Vote yes</button><button class="btn sm ${it.userVotes[r.myTid] === false ? 'pri' : ''}" data-act="vote" data-id="${it.id}" data-y="0">Vote no</button></div>` : ''}</div>`).join('')}</div>` : '<div class="card muted">The Annual League Meeting happens each offseason after free agency opens.</div>'}
    ${live ? `<div class="card"><h2>Submit your own proposal</h2><div class="small muted" style="margin-bottom:8px">Each club may add one proposal to the ballot.</div>${r.available.filter((a) => !P.items.some((x) => x.id === a.id)).map((a) => `<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding:6px 0"><div><b class="small">${esc(a.title)}</b><div class="tiny muted">${esc(a.desc)}</div></div><button class="btn sm" data-act="propose" data-id="${a.id}">Propose</button></div>`).join('')}</div>` : ''}
    <div class="card"><h2>Rule-change history</h2>${r.history.slice().reverse().map((h) => `<div class="small" style="padding:4px 0"><b>${h.s}</b>: ${h.items.map((i) => `${i.passed ? '✓' : '✗'} ${esc(i.title)} (${i.yes})`).join(' · ')}</div>`).join('') || '<div class="muted small">—</div>'}</div></div>
  <div class="card"><h2>Current rulebook</h2><div class="kv small">${ruleRows.map(([k, v]) => `<div>${k}</div><div>${esc(v)}</div>`).join('')}</div></div></div>`;
};
ACTIONS.vote = async (el) => act('vote', { id: el.dataset.id, yes: el.dataset.y === '1' }, { msg: 'Vote recorded.' });
ACTIONS.propose = async (el) => act('propose', { id: el.dataset.id }, { msg: 'Proposal added to the ballot.' });

// ===================================================================== SETTINGS
PAGES2.settings = async () => {
  const s = await call('settings', {});
  const slider = (k) => `<div style="margin-bottom:10px"><div class="row" style="justify-content:space-between"><span><b>${esc(s.info[k][0])}</b> <span class="tiny muted">${esc(s.info[k][1])}</span></span><b id="sv-${k}">${Math.round(s.sliders[k] * 100)}%</b></div><input type="range" min="0" max="250" step="5" value="${Math.round(s.sliders[k] * 100)}" data-slider="${k}" oninput="document.getElementById('sv-${k}').textContent=this.value+'%'"></div>`;
  const groups = { 'Player development': ['progression', 'regression', 'breakoutChance', 'inSeasonRatingSwing', 'ratingInflationControl', 'retirementAge'], Injuries: ['injuryRate', 'injurySeverity'], 'Money & AI': ['capGrowth', 'contractDemands', 'playerPatience', 'tradeAiAggression', 'tradeDifficulty', 'aiFreeAgencyAggression', 'holdouts', 'ownerPatience'], 'Game sim': ['scoring', 'passRate', 'turnovers', 'penalties', 'fourthDownAggression', 'homeField', 'upsetFactor', 'moraleImpact'] };
  return `<div class="page-h"><h1>Settings & Sliders</h1><div class="right"><button class="btn" data-act="resetSliders">Reset to realistic defaults</button><button class="btn pri" data-act="saveSettings">Save</button></div></div>
  <div class="grid g2">${Object.entries(groups).map(([g, ks]) => `<div class="card"><h2>${g}</h2>${ks.map(slider).join('')}</div>`).join('')}</div>
  <div class="grid g2"><div class="card"><h2>Auto-manage my team</h2>
    <label class="chk"><input type="checkbox" id="auDepth" ${s.autoUser.depth ? 'checked' : ''}> Auto depth chart (unless I've set a custom order)</label><br>
    <label class="chk"><input type="checkbox" id="auInj" ${s.autoUser.injuries ? 'checked' : ''}> Auto injured reserve moves</label><br>
    <label class="chk"><input type="checkbox" id="auRoster" ${s.autoUser.roster ? 'checked' : ''}> Auto roster moves (fill holes, cutdowns)</label><br>
    <label class="chk"><input type="checkbox" id="aiTr" ${s.aiTradesUser ? 'checked' : ''}> AI teams can send me trade offers</label></div>
  <div class="card"><h2>League</h2><div class="row"><span class="muted">League name</span><input type="text" id="lgN" value="${esc(s.name)}"></div><div class="row" style="margin-top:12px"><button class="btn" data-act="exportCurrent">Export save file</button><a class="btn" href="#/start">Switch league / new league</a></div>
    <p class="small muted">Your league autosaves in this browser after every action. Export a file to back it up or move it to another device.</p></div></div>`;
};
ACTIONS.resetSliders = async () => { const s = await call('settings', {}); await act('saveSettings', { sliders: s.defaults }, { msg: 'Sliders reset.' }); };
ACTIONS.saveSettings = async () => {
  const sliders = {};
  document.querySelectorAll('[data-slider]').forEach((i) => { sliders[i.dataset.slider] = +i.value / 100; });
  await act('saveSettings', { sliders, autoUser: { depth: $('#auDepth').checked, injuries: $('#auInj').checked, roster: $('#auRoster').checked }, aiTradesUser: $('#aiTr').checked, name: $('#lgN').value }, { msg: 'Settings saved.' });
};
ACTIONS.exportCurrent = async () => {
  const r = await call('exportSave');
  const blob = new Blob([r.json], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${r.name.replace(/[^a-z0-9]+/gi, '_')}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};
void delta; void moraleTxt; void modal; void closeModal; void injBadge;
