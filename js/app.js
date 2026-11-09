// App shell: router, header with sim controls, sidebar, start screen, settings, online.
import { call, session, net, host, join, claim, onNet, sendChat, setReady, guestStatus, leaveOnline, setToastHandler, clearReady, readyCounts } from './client.js';
import { esc, $, $$, money, modal, closeModal, toast, busy, logo, setAccent, resetTheme, TABLES } from './ui.js';
void $$;
import { PAGES, ACTIONS as PA } from './pages.js';
import { PAGES2, ACTIONS as PA2 } from './pages2.js';
import { PAGES3, ACTIONS as PA3, liveTick } from './pages3.js';
import { HELP, startTour } from './help.js';

export const APP = { header: null, route: '', params: [], teams: null };
const ACTIONS = { ...PA, ...PA2, ...PA3 };
const ROUTES = { ...PAGES, ...PAGES2, ...PAGES3 };
APP.reloadTeams = () => loadTeamsCache();

setToastHandler((t, l) => toast(esc(t), l));

// ---------------------------------------------------------------- freshness: never run yesterday's code
// GitHub Pages lets browsers cache files for a while. On load we compare the site version with the one this browser
// last ran; if it changed, every file is re-downloaded into the cache and the page reloads once.
async function ensureFresh() {
  try {
    const v = await fetch('version.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null));
    if (!v) return;
    const seen = localStorage.getItem('tff-ver');
    if (seen === v.v) return;
    if (sessionStorage.getItem('tff-ver-try') === v.v) { localStorage.setItem('tff-ver', v.v); return; }
    sessionStorage.setItem('tff-ver-try', v.v);
    await Promise.all(v.files.map((f) => fetch(f, { cache: 'reload' }).catch(() => null)));
    localStorage.setItem('tff-ver', v.v);
    if (seen) { location.reload(); await new Promise(() => {}); } // first visit ever: nothing stale to replace
  } catch { /* offline: keep going */ }
}

// ---------------------------------------------------------------- boot
async function boot() {
  await ensureFresh();
  document.body.innerHTML = `
  <div id="app" class="nolg">
    <header id="top"></header>
    <nav id="nav"></nav>
    <main id="main"><div class="empty"><div class="spinner" style="margin:40px auto"></div>Loading…</div></main>
  </div>
  <div id="modal"></div><div id="toasts"></div>
  <div id="busy"><div class="spinner"></div><div id="busyText" class="cond" style="font-size:20px;text-transform:uppercase">Simulating…</div></div>`;
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  window.addEventListener('hashchange', render);
  $('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  onNet(netEvent);
  setInterval(() => { liveTick(); }, 3000);
  initTooltips();
  try {
    await call('init');
    const h = await call('hasLeague');
    if (!h.loaded) {
      const saves = await call('listSaves');
      const last = localStorage.getItem('tff-last');
      if (last && saves.find((s) => s.id === last) && location.hash !== '#/start') { await call('load', { id: last }); }
    }
  } catch (e) { toast(esc(e.message), 'error'); }
  render();
}

export async function refreshHeader() {
  if (net.mode === 'guest' && session.tid == null) { APP.header = null; return null; }
  let h = null;
  try { h = await call('header'); } catch { h = null; }
  APP.header = h;
  if (h && session.tid == null) session.tid = h.tid;
  if (h && !h.userTids.includes(session.tid) && net.mode !== 'guest') session.tid = h.userTids[0] ?? 0;
  // only rebuild the top bar when something in it changed (avoids re-loading the logo on every click)
  const sig = JSON.stringify([h, session.tid, net.mode, net.code, net.myReady, net.conns?.size]);
  if (sig !== APP.topSig) { APP.topSig = sig; drawTop(); } else drawNav();
  if (h) setAccent(h.team.c1, h.team.c2); else resetTheme();
  return h;
}

// ---------------------------------------------------------------- render
export async function render() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [route, ...params] = hash.split('/').map(decodeURIComponent);
  const prevRoute = APP.route;
  APP.route = route || ''; APP.params = params;
  if (prevRoute !== APP.route) drawNav(); // highlight the tab instantly
  const h = await refreshHeader();
  const app = $('#app');
  if (APP.route === 'tutorial') { location.hash = '#/home'; setTimeout(startTour, 400); return; }
  if (!h && !['start', 'online', 'join'].includes(APP.route)) { app.classList.add('nolg'); return renderStart(); }
  if (APP.route === 'start') { app.classList.add('nolg'); return renderStart(); }
  if (APP.route === 'online' || APP.route === 'join') { if (!h) app.classList.add('nolg'); return renderOnline(); }
  app.classList.remove('nolg');
  if (h.fired) return renderFired(h);
  const page = ROUTES[APP.route || 'home'] || ROUTES.home;
  const main = $('#main');
  const token = (APP.renderToken = (APP.renderToken || 0) + 1);
  const keep = main.dataset.keep === APP.route;
  const ckey = location.hash;
  // show the last version of this screen instantly, then swap in fresh data a moment later
  let shown = null;
  if (!keep && APP.pageCache?.[ckey]) { shown = APP.pageCache[ckey]; main.innerHTML = shown; (document.scrollingElement || document.documentElement).scrollTop = 0; }
  else if (!keep) main.classList.add('loading');
  try {
    const html = await page(params, h);
    if (token !== APP.renderToken) return; // a newer navigation already happened
    APP.hideTip?.();
    if (html != null && html !== shown) main.innerHTML = html;
    if (html != null) { APP.pageCache ||= {}; APP.pageCache[ckey] = html; const ks = Object.keys(APP.pageCache); if (ks.length > 40) delete APP.pageCache[ks[0]]; }
    main.classList.remove('loading');
    const sc = document.scrollingElement || document.documentElement;
    if (keep) sc.scrollTop = +main.dataset.st || 0; else sc.scrollTop = 0;
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="card"><h2>Something went wrong</h2><p class="bad">${esc(e.message)}</p><p class="muted">Try another page or reload. Your league autosaves.</p></div>`;
  }
  drawNav();
}
export async function rerender() { const main = $('#main'); const sc = document.scrollingElement || document.documentElement; main.dataset.keep = APP.route; main.dataset.st = sc.scrollTop; await render(); main.dataset.keep = ''; }

// ---------------------------------------------------------------- top bar & sim controls
function simButtons(h) {
  const ph = h.phase;
  const host = net.mode !== 'guest';
  const online = net.mode === 'host' && [...net.conns.values()].some((c) => c.tid != null);
  const rc = readyCounts();
  const readyBtn = `<button class="btn ${net.myReady ? 'ready-on' : ''}" ${!host ? 'id="advanceBtn"' : ''} data-act="toggleReady" title="When every GM in the room is ready, the league advances automatically">${net.myReady ? '✓ Ready' : 'Ready to Advance'} <span class="rc">${rc.ready}/${rc.total}</span></button>`;
  if (!host) return readyBtn;
  if (online) return `${readyBtn}${simButtonsHost(h, ph)}`;
  return simButtonsHost(h, ph);
}
function simButtonsHost(h, ph) {
  const TIPS = { week: 'Simulate this week\'s games and move to the next week', phase: 'Move to the next phase of the NFL calendar', draftnext: 'Let CPU teams pick until you are on the clock' };
  const onlineHost = net.mode === 'host' && [...net.conns.values()].some((c) => c.tid != null);
  const B = (label, target, cls = '') => `<button class="btn ${cls}" ${cls.includes('pri') && !onlineHost ? 'id="advanceBtn"' : ''} data-act="sim" data-target="${target}" title="${onlineHost && cls.includes('pri') ? 'Advance now without waiting for everyone (host only)' : TIPS[target] || 'Simulate ahead'}">${onlineHost && cls.includes('pri') ? label.replace(' ▶', '') + ' now' : label}</button>`;
  const more = (items) => `<select class="btn" data-change="simSelect" title="Simulate further ahead" style="padding-right:24px"><option value="">Sim ahead…</option>${items.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>`;
  switch (ph) {
    case 'REGULAR_SEASON': return `${B('Advance Week ▶', 'week', 'pri')}${more([['midseason', 'Sim to midseason (Week 9)'], ['deadline', `Sim to trade deadline (after Wk ${h.deadline})`], ['playoffs', 'Sim to playoffs'], ['seasonEnd', 'Sim to end of season'], ['nextSeason', 'Sim to next season']])}`;
    case 'PRESEASON': return `${B('Advance Week ▶', 'week', 'pri')}${more([['playoffs', 'Sim to playoffs'], ['nextSeason', 'Sim to next season']])}`;
    case 'PLAYOFFS': return `${B('Advance Round ▶', 'week', 'pri')}${more([['seasonEnd', 'Sim through Super Bowl']])}`;
    case 'SEASON_END': return `${B('Advance to Re-Signing ▶', 'phase', 'pri')}${more([['draft', 'Sim to the Draft'], ['nextSeason', 'Sim to next season']])}`;
    case 'RESIGN': return `${B('Start Free Agency ▶', 'phase', 'pri')}`;
    case 'FREE_AGENCY': return `<button class="btn" data-act="faDay" title="Play out the rest of today: players decide, CPU teams make new offers">Sim to Next Day</button>${B('Finish Free Agency ▶', 'phase', 'pri')}`;
    case 'LEAGUE_MEETING': return `${B('Hold Votes & Start Draft ▶', 'phase', 'pri')}`;
    case 'DRAFT': return `<a class="btn pri" id="advanceBtn" href="#/draft" title="Go to the live draft room">${h.draftOnClock ? "You're on the clock!" : 'Draft Room ▶'}</a>${B('Sim to My Pick', 'draftnext')}${B('Finish Draft', 'phase')}`;
    case 'POST_DRAFT': return `${B('Open Training Camp ▶', 'phase', 'pri')}`;
    case 'TRAINING_CAMP': return `${B('Start Preseason ▶', 'phase', 'pri')}${more([['nextSeason', 'Skip to Week 1']])}`;
    case 'FANTASY_DRAFT': return `<a class="btn pri" id="advanceBtn" href="#/fantasy">Fantasy Draft Room</a>`;
    default: return '';
  }
}
function drawTop() {
  const h = APP.header;
  const top = $('#top');
  if (!h) { top.innerHTML = `<div class="brand"><span class="the">THE</span><span>Football <b>Franchise</b></span></div><div class="spacer"></div>${net.mode === 'guest' ? `<span class="badge blu">Online · Room ${esc(net.code)}</span>` : ''}`; drawNav(); return; }
  // the host's team switcher only lists teams the host runs, never a friend's team
  const guestTids = new Set(net.mode === 'host' ? [...net.conns.values()].map((c) => c.tid).filter((t) => t != null) : []);
  const myTids = h.userTids.filter((t) => !guestTids.has(t));
  const multi = myTids.length > 1 && net.mode !== 'guest';
  const stage = h.phase === 'REGULAR_SEASON' ? `WEEK ${h.week}${h.bye ? ' · BYE' : ''}` : h.phase === 'PRESEASON' ? `PRESEASON WK ${Math.max(1, h.week)}` : h.phase === 'FREE_AGENCY' ? `FA DAY ${h.faDay ?? 0} / 5` : h.phase === 'PLAYOFFS' ? esc(h.roundLabel || 'PLAYOFFS').toUpperCase() : esc(h.phaseLabel).toUpperCase();
  top.innerHTML = `
    <a class="brand" href="#/home" title="Franchise Hub"><span class="the">THE</span><span class="full">Football <b>Franchise</b></span></a>
    <div class="teamid">${logo(h.team.logo, 'md')}<div><div class="tn">${multi ? `<select data-change="switchTeam" class="teamsel" title="Switch which of your teams you are managing">${myTids.map((t) => `<option value="${t}" ${t === session.tid ? 'selected' : ''}>${esc(APP.teams?.[t] ? APP.teams[t].region + ' ' + APP.teams[t].name : t)}</option>`).join('')}</select>` : esc(h.team.region + ' ' + h.team.name)}</div><div class="rec">${esc(h.rec || '0-0')} · ${h.season}</div></div></div>
    <div class="stage" title="Where you are in the NFL calendar"><span>${stage}</span><small>${esc(h.phaseLabel)}</small></div>
    <div class="capchip" title="Cap space for the current league year">CAP SPACE <b class="${h.capSpace < 0 ? 'bad' : ''}">${money(h.capSpace)}</b></div>
    <div class="spacer"></div>
    ${net.mode !== 'local' ? `<a href="#/online" class="badge blu" title="Online room">● ${esc(net.code || '')} ${net.mode === 'host' ? `· ${net.conns.size} online` : ''}</a>` : ''}
    <button class="btn ghost helpbtn" id="helpBtn" data-act="help" title="What is this screen?">?</button>
    <div class="simbar">${simButtons(h)}</div>`;
  drawNav();
}
const SECTIONS = [
  { id: 'home', label: 'Hub', pages: [['home', 'Franchise Hub']] },
  { id: 'team', label: 'My Team', pages: [['roster', 'Roster'], ['depth', 'Depth Chart'], ['lineup', 'Adjust Lineup'], ['schedule', 'Schedule'], ['cap', 'Salary Cap & Contracts'], ['staff', 'Coaching Staff'], ['owner', 'Owner & Finances']] },
  { id: 'moves', label: 'Transactions', pages: [['trade', 'Trade Center'], ['finder', 'Trade Finder'], ['offers', 'Trade Offers'], ['fa', 'Free Agency'], ['draft', 'Draft & Scouting'], ['fantasy', 'Fantasy Draft']] },
  { id: 'league', label: 'League', pages: [['standings', 'Standings & Playoffs'], ['recap', 'Weekly Recap'], ['awards', 'Awards Race'], ['stats', 'Stats & Leaders'], ['teams', 'Teams'], ['news', 'News'], ['rules', 'League Meeting'], ['history', 'NFL History']] },
  { id: 'office', label: 'Office', pages: [['franchise', 'Relocate & Rebrand'], ['settings', 'Settings & Sliders'], ['online', 'Play Online'], ['start', 'Saves / New League'], ['tutorial', 'Tutorial']] },
];
function sectionOf(route) { for (const s of SECTIONS) if (s.pages.some(([r]) => r === route)) return s.id; if (['player', 'team', 'game'].includes(route)) return route === 'team' ? 'league' : 'team'; return 'home'; }
function drawNav() {
  const h = APP.header;
  const nav = $('#nav');
  if (!h) { nav.innerHTML = ''; return; }
  const cur = sectionOf(APP.route || 'home');
  const badge = (r) => {
    if (r === 'offers' && h.openOffers) return ` <span class="badge red">${h.openOffers}</span>`;
    if (r === 'home' && h.openEvents) return ` <span class="badge yel">${h.openEvents}</span>`;
    if (r === 'fa' && h.phase === 'FREE_AGENCY') return ' <span class="badge grn">LIVE</span>';
    if (r === 'draft' && h.phase === 'DRAFT') return ' <span class="badge grn">LIVE</span>';
    if (r === 'rules' && h.phase === 'LEAGUE_MEETING') return ' <span class="badge grn">VOTE</span>';
    return '';
  };
  const sec = SECTIONS.find((x) => x.id === cur);
  nav.innerHTML = `<div class="sections">${SECTIONS.map((x) => `<a class="sec ${x.id === cur ? 'on' : ''}" data-sec="${x.id}" href="#/${x.pages[0][0]}">${x.label}${x.id === 'home' && (h.openEvents + h.openOffers) ? ` <span class="badge yel">${h.openEvents + h.openOffers}</span>` : ''}</a>`).join('')}</div>
    ${sec.pages.length > 1 ? `<div class="subnav">${sec.pages.filter(([r]) => r !== 'fantasy' || h.phase === 'FANTASY_DRAFT').map(([r, l]) => `<a class="${APP.route === r ? 'on' : ''}" href="#/${r}">${l}${badge(r)}</a>`).join('')}</div>` : ''}`;
}
function drawSide() { drawNav(); }

// ---------------------------------------------------------------- events
async function onClick(e) {
  const sortTh = e.target.closest('th[data-sort]');
  if (sortTh && sortTh.dataset.sort) {
    const st = TABLES[sortTh.dataset.tbl];
    if (st) { st.dir = st.sort === sortTh.dataset.sort && st.dir === 'desc' ? 'asc' : 'desc'; st.sort = sortTh.dataset.sort; rerender(); }
    return;
  }
  const row = e.target.closest('tr[data-row]');
  if (row && !e.target.closest('a,button,input,select')) { location.hash = row.dataset.row; return; }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const fn = ACTIONS[act] || CORE[act];
  if (!fn) return;
  e.preventDefault();
  try { await fn(el, e); } catch (err) { console.error(err); toast(esc(err.message), 'error'); busy(false); }
}
async function onChange(e) {
  const el = e.target.closest('[data-change]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.change] || CORE[el.dataset.change];
  if (fn) { try { await fn(el, e); } catch (err) { toast(esc(err.message), 'error'); } }
}
export async function act(method, args, { msg = null, refresh = true, busyText = null } = {}) {
  APP.pageCache = {}; // something is about to change: never flash stale screens afterwards
  if (busyText) busy(true, busyText);
  try {
    const r = await call(method, args);
    if (busyText) busy(false);
    if (r?.error) { toast(esc(r.error), 'error'); return r; }
    if (msg) toast(typeof msg === 'function' ? msg(r) : msg, 'good');
    if (refresh) await rerender();
    return r;
  } catch (e) { busy(false); toast(esc(e.message), 'error'); return { error: e.message }; }
}

const CORE = {
  closeModal: () => closeModal(),
  menu: () => {},
  help: () => { const k = APP.route || 'home'; const h = HELP[k] || HELP.home; modal(`${esc(h[0])}`, `<div style="line-height:1.6">${h[1]}</div><div class="row" style="margin-top:14px"><button class="btn" data-act="tourStart">Replay the guided tour</button></div>`, { narrow: true }); },
  tourStart: () => { closeModal(); startTour(); },
  tblMore: (el) => { const st = TABLES[el.dataset.tbl]; if (st) { st.limit = 0; rerender(); } },
  async sim(el) {
    const target = el.dataset.target;
    if (target === 'draftnext') { await act('draftSim', { all: false }, { busyText: 'On the clock…' }); return; }
    const r = await act('sim', { target }, { busyText: target === 'week' ? 'Simulating…' : 'Simulating… this can take a moment' });
    if (r?.error) return;
    clearReady();
    if (r?.onClock) { toast('You are on the clock!', 'good'); location.hash = '#/draft'; }
  },
  async simSelect(el) { const v = el.value; el.value = ''; if (v) await CORE.sim({ dataset: { target: v } }); },
  async faDay() { await act('faAdvanceDay', {}, { busyText: 'Agents are working the phones…' }); if (net.mode === 'host') clearReady(); },
  async switchTeam(el) { session.tid = +el.value; await render(); },
  async toggleReady() { setReady(!net.myReady); APP.topSig = null; drawTop(); },
};

// ---------------------------------------------------------------- start screen
const START = { mode: 'current', teams: new Set(), fantasy: false, name: 'My Franchise' };
async function renderStart() {
  drawTop(); $('#nav').innerHTML = '';
  const [teams, saves, info] = await Promise.all([call('teamsForPicker'), call('listSaves'), call('init')]);
  APP.pickTeams = teams;
  const byDiv = {};
  for (const t of teams) (byDiv[`${t.conf} ${t.div}`] ||= []).push(t);
  const order = ['AFC East', 'AFC North', 'AFC South', 'AFC West', 'NFC East', 'NFC North', 'NFC South', 'NFC West'];
  const mode = (id, title, desc) => { const off = START.fantasy && id !== 'preseason'; const on = START.fantasy ? id === 'preseason' : START.mode === id; return `<div class="mode ${on ? 'on' : ''}" ${off ? 'style="opacity:.4;pointer-events:none" title="Fantasy draft leagues always start in the preseason"' : `data-act="startMode" data-mode="${id}"`}><h3>${title}</h3><div class="muted small">${desc}</div></div>`; };
  $('#main').innerHTML = `<div class="start-wrap">
    <div class="hero"><h1><span class="the">THE</span>Football Franchise</h1>
      <p>Be the GM of any NFL team. Real rosters, real contracts and the real 2026 schedule. Ratings come from real production and change with how players actually perform in your league. Make trades, sign free agents, scout and draft, hire coaches, keep the owner happy, and build a dynasty, alone or with friends.</p>
      <div class="small dim">Data snapshot: ${esc(info.built)} · rosters through Week ${info.rosterWeek} · ${info.lastFullWeek} weeks of real results</div></div>
    ${saves.length ? `<div class="card"><h2>Continue</h2><div class="grid g3">${saves.map((s) => `<div class="stat row" style="gap:12px">${logo(s.logo, 'md')}<div style="flex:1;min-width:0"><div class="b">${esc(s.name)}</div><div class="small muted">${esc(s.team)} · ${s.season} ${esc(phaseNice(s.phase))}${s.phase === 'REGULAR_SEASON' ? ` Wk ${s.week}` : ''}</div><div class="tiny dim">${new Date(s.updated).toLocaleString()}</div></div><div class="col"><button class="btn sm pri" data-act="loadSave" data-id="${s.id}">Play</button><button class="btn sm" data-act="exportSave" data-id="${s.id}">Export</button><button class="btn sm danger" data-act="deleteSave" data-id="${s.id}">Delete</button></div></div>`).join('')}</div></div>` : ''}
    <div class="card"><h2>New League</h2>
      <div class="row" style="margin-bottom:12px"><label class="muted">League name</label><input type="text" id="lgName" value="${esc(START.name)}" style="width:260px"></div>
      <h3>Where do you want to start?</h3>
      <div class="grid g3" style="margin-bottom:14px">
        ${mode('current', `Real life: 2026 Week ${info.lastFullWeek + 1}`, `Pick up today. Real standings, ${info.lastFullWeek} weeks of real results and stats, and current injuries and IR. The trade deadline is near.`)}
        ${mode('regular', '2026 Regular Season, Week 1', 'Current rosters with a fresh 0-0 start. Everyone healthy, the full 2026 schedule ahead.')}
        ${mode('preseason', '2026 Preseason', 'Start in August: preseason games, camp battles, and cutting down to 53. Then the full season.')}
      </div>
      <label class="chk" style="margin-bottom:12px"><input type="checkbox" id="fantasy" ${START.fantasy ? 'checked' : ''} data-change="startFantasy"> <b>Fantasy draft</b> <span class="muted">— all 32 teams redraft every player in a 53-round snake draft (contracts stay with players). Fantasy leagues always start in the 2026 preseason.</span></label>
      <h3>Choose your team <span class="muted small" style="text-transform:none">(pick more than one for local multiplayer, or host online after creating)</span></h3>
      <div class="teamgrid">${order.map((d) => `<div class="div"><h4>${d}</h4>${(byDiv[d] || []).map((t) => `<div class="tpick ${START.teams.has(t.abbr) ? 'on' : ''}" data-act="pickTeam" data-abbr="${t.abbr}">${logo(t.logo, '')}<span>${esc(t.region)} <b>${esc(t.name)}</b></span></div>`).join('')}</div>`).join('')}</div>
      <div class="row" style="margin-top:16px"><button class="btn pri" data-act="createLeague" ${START.teams.size ? '' : 'disabled'}>Create League ▶</button><span class="muted small">${START.teams.size ? [...START.teams].join(', ') : 'Select at least one team'}</span>
      <span style="flex:1"></span><label class="btn" style="cursor:pointer">Import save file<input type="file" accept=".json,application/json" data-change="importSave" style="display:none"></label><a class="btn" href="#/join">Join a friend's room</a></div>
    </div></div>`;
}
const phaseNice = (p) => ({ REGULAR_SEASON: 'Season', PRESEASON: 'Preseason', PLAYOFFS: 'Playoffs', SEASON_END: 'Offseason', RESIGN: 'Re-sign', FREE_AGENCY: 'Free Agency', LEAGUE_MEETING: 'League Meeting', DRAFT: 'Draft', POST_DRAFT: 'UDFA', TRAINING_CAMP: 'Camp', FANTASY_DRAFT: 'Fantasy Draft' }[p] || p);
Object.assign(CORE, {
  startMode(el) { START.mode = el.dataset.mode; START.name = $('#lgName')?.value || START.name; renderStart(); },
  startFantasy(el) { START.fantasy = el.checked; START.name = $('#lgName')?.value || START.name; renderStart(); },
  pickTeam(el) { START.name = $('#lgName')?.value || START.name; const a = el.dataset.abbr; START.teams.has(a) ? START.teams.delete(a) : START.teams.add(a); renderStart(); },
  async createLeague() {
    START.name = $('#lgName')?.value || START.name;
    busy(true, 'Building your league from real NFL data…');
    try {
      const r = await call('newLeague', { start: START.fantasy ? 'preseason' : START.mode, userTeams: [...START.teams], fantasy: START.fantasy, name: START.name, seed: Date.now() });
      localStorage.setItem('tff-last', r.saveId);
      session.tid = null; APP.teams = null;
      busy(false);
      location.hash = START.fantasy ? '#/fantasy' : '#/home';
      await loadTeamsCache(); await render();
      setTimeout(startTour, 500);
    } catch (e) { busy(false); toast(esc(e.message), 'error'); }
  },
  async loadSave(el) { busy(true, 'Loading…'); await call('load', { id: el.dataset.id }); localStorage.setItem('tff-last', el.dataset.id); session.tid = null; await loadTeamsCache(); busy(false); location.hash = '#/home'; render(); },
  async deleteSave(el) { if (!confirm('Delete this save permanently?')) return; await call('deleteSave', { id: el.dataset.id }); renderStart(); },
  async exportSave(el) {
    busy(true, 'Exporting…');
    await call('load', { id: el.dataset.id });
    const r = await call('exportSave');
    busy(false);
    const blob = new Blob([r.json], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${r.name.replace(/[^a-z0-9]+/gi, '_')}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  },
  async importSave(el) {
    const f = el.files[0]; if (!f) return;
    busy(true, 'Importing…');
    try { const r = await call('importSave', { json: await f.text() }); localStorage.setItem('tff-last', r.saveId); busy(false); await loadTeamsCache(); location.hash = '#/home'; render(); } catch (e) { busy(false); toast(esc(e.message), 'error'); }
  },
});
export async function loadTeamsCache() { try { const t = await call('teams'); APP.teams = t; } catch { /* no league */ } }

// ---------------------------------------------------------------- fired
function renderFired(h) {
  $('#main').innerHTML = `<div class="card" style="max-width:720px;margin:40px auto;text-align:center"><h1 class="cond" style="font-size:40px;margin:0">YOU'RE FIRED</h1>
  <p class="muted">${esc(h.team.region + ' ' + h.team.name)} ownership has decided to move on. Job security hit rock bottom.</p>
  <p>You can take over another franchise, or ignore it and keep running this team (sandbox).</p>
  <div class="row" style="justify-content:center"><button class="btn pri" data-act="firedChoose">Find a new job</button><button class="btn" data-act="firedIgnore">Ignore & keep going</button></div><div id="jobs" style="margin-top:14px"></div></div>`;
}
Object.assign(CORE, {
  async firedChoose() {
    const ts = (await call('teams')).filter((t) => !t.user).sort((a, b) => a.w - b.w).slice(0, 6);
    $('#jobs').innerHTML = `<h3>Teams interested in you</h3>${ts.map((t) => `<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding:6px 0">${logo(t.logo)} <b>${esc(t.region)} ${esc(t.name)}</b> <span class="muted">${t.w}-${t.l}</span><button class="btn sm pri" data-act="takeJob" data-tid="${t.tid}">Accept job</button></div>`).join('')}`;
  },
  async takeJob(el) { await call('takeOverTeam', { tid: +el.dataset.tid, from: session.tid }); session.tid = +el.dataset.tid; await loadTeamsCache(); location.hash = '#/home'; render(); },
  async firedIgnore() { await call('dismissFired', { tid: session.tid }); render(); },
});

// ---------------------------------------------------------------- online
let chatSub = null;
async function renderOnline() {
  const h = APP.header;
  const status = net.mode === 'host' ? guestStatus() : [];
  let body = '';
  if (net.mode === 'local') {
    body = `<div class="grid g2">
      <div class="card"><h2>Host a room</h2>${h ? `<p class="muted">Your friends join this league from their own browsers with a room code. Each friend takes an open team. Keep this tab open while you play. You control sims and league settings.</p>
        <div class="row"><input type="text" id="hostName" placeholder="Your name" value="${esc(localStorage.getItem('tff-name') || '')}"><button class="btn pri" data-act="hostRoom">Create room</button></div>` : '<p class="muted">Create or load a league first, then come back here to host it.</p><a class="btn pri" href="#/start">New league</a>'}</div>
      <div class="card"><h2>Join a room</h2><p class="muted">Enter the 5-letter code your friend gave you. No account needed.</p>
        <div class="col"><input type="text" id="joinName" placeholder="Your name" value="${esc(localStorage.getItem('tff-name') || '')}"><input type="text" id="joinCode" placeholder="Room code (e.g. K7QXM)" maxlength="5" style="text-transform:uppercase;font-family:var(--cond);font-size:20px;letter-spacing:4px"><button class="btn pri" data-act="joinRoom">Join</button></div></div></div>
      <div class="card small muted">Online play is peer-to-peer (WebRTC via the free PeerJS service). The league lives in the host's browser and autosaves there. If the host closes the tab, everyone disconnects; the host can reopen the save and host again with a new code.</div>`;
  } else if (net.mode === 'host') {
    body = `<div class="grid g21"><div class="card"><h2>Room code</h2><div class="big" style="font-size:56px;letter-spacing:8px">${esc(net.code)}</div><p class="muted">Share this code. Friends open this site, click Play Online → Join, and enter it.</p>
      <h3>Connected GMs</h3>${status.length ? status.map((s) => `<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding:6px 0"><b>${esc(s.name)}</b><span>${s.abbr ? esc(s.abbr) : '<span class="muted">choosing team…</span>'}</span><span class="badge ${s.ready ? 'grn' : ''}">${s.ready ? 'READY' : 'not ready'}</span></div>`).join('') : '<div class="muted">Nobody yet.</div>'}
      <div class="row" style="margin-top:12px"><button class="btn danger" data-act="leaveOnline">Close room</button></div></div>
      <div class="card"><h2>Chat</h2>${chatBox()}</div></div>`;
  } else {
    if (session.tid == null) {
      const teams = net.welcome?.teams || [];
      body = `<div class="card"><h2>Pick your team</h2><p class="muted">Connected to ${esc(net.welcome?.hostName || 'host')}'s room <b>${esc(net.code)}</b>.</p><div class="teamgrid">${teams.map((t) => `<div class="tpick ${t.taken ? '' : ''}" ${t.taken ? 'style="opacity:.35;pointer-events:none"' : `data-act="claimTeam" data-tid="${t.tid}"`}>${logo(t.logo)}<span>${esc(t.region)} <b>${esc(t.name)}</b>${t.taken ? ' (taken)' : ''}</span></div>`).join('')}</div></div>`;
    } else body = `<div class="grid g21"><div class="card"><h2>Online</h2><p>You are connected to room <b>${esc(net.code)}</b> as the GM of <b>${esc(h?.team.region)} ${esc(h?.team.name)}</b>. When you're done with your moves, press <b>Ready to Advance</b> in the top bar. Once every GM in the room is ready, the league advances automatically.</p><div class="row"><a class="btn pri" href="#/home">Go to my front office</a><button class="btn danger" data-act="leaveOnline">Leave room</button></div></div><div class="card"><h2>Chat</h2>${chatBox()}</div></div>`;
  }
  $('#main').innerHTML = `<div class="page-h"><h1>Play Online</h1><span class="sub">Room-code multiplayer</span></div>${body}`;
  const c = $('#chatLog'); if (c) c.scrollTop = c.scrollHeight;
}
function chatBox() { return `<div class="chat" id="chatLog">${net.chat.map((m) => `<div><b class="${m.from === 'system' ? 'muted' : ''}">${esc(m.from)}:</b> ${esc(m.text)}</div>`).join('')}</div><div class="row" style="margin-top:8px"><input type="text" id="chatIn" placeholder="Message" style="flex:1" onkeydown="if(event.key==='Enter'){document.querySelector('[data-act=chatSend]').click()}"><button class="btn" data-act="chatSend">Send</button></div>`; }
// Host only: everyone pressed Ready, so advance whatever the current step is.
async function advanceForEveryone() {
  const h = APP.header;
  if (!h || net.mode !== 'host' || APP.autoAdv) return;
  APP.autoAdv = true;
  try {
    toast('Everyone is ready: advancing the league…', 'good');
    if (h.phase === 'FREE_AGENCY' && (h.faDay ?? 0) < 5) await CORE.faDay();
    else if (h.phase === 'DRAFT') await act('draftSim', { all: false }, { busyText: 'Picks are coming in…' });
    else await CORE.sim({ dataset: { target: ['REGULAR_SEASON', 'PRESEASON', 'PLAYOFFS'].includes(h.phase) ? 'week' : 'phase' } });
  } finally { clearReady(); APP.autoAdv = false; APP.topSig = null; drawTop(); }
}
function netEvent(ev) {
  if (ev.t === 'allReady') { advanceForEveryone(); return; }
  if (ev.t === 'update') { if (APP.route !== 'online') rerender(); else refreshHeader(); }
  if (ev.t === 'status' || ev.t === 'chat' || ev.t === 'claimed') { APP.topSig = null; drawTop(); if (APP.route === 'online') renderOnline(); }
  if (ev.t === 'claimed') { if (ev.error) toast(esc(ev.error), 'error'); else { toast('Team claimed! Welcome to the front office.', 'good'); loadTeamsCache().then(() => { location.hash = '#/home'; }); } }
  if (ev.t === 'welcome') { net.welcome = ev; }
  if (ev.t === 'error') toast(esc(ev.text), 'error');
  if (ev.t === 'disconnected') { toast('Disconnected from the room.', 'warn'); session.tid = null; location.hash = '#/online'; render(); }
  void chatSub;
}
Object.assign(CORE, {
  async hostRoom() { const n = $('#hostName').value.trim() || 'Host'; localStorage.setItem('tff-name', n); busy(true, 'Opening room…'); try { await host(n); busy(false); renderOnline(); } catch (e) { busy(false); toast(esc(e.message || 'Could not open room'), 'error'); } },
  async joinRoom() {
    const n = $('#joinName').value.trim() || 'Guest'; const code = $('#joinCode').value.trim().toUpperCase();
    if (code.length !== 5) { toast('Room codes are 5 characters.', 'error'); return; }
    localStorage.setItem('tff-name', n); busy(true, 'Connecting…');
    try { const w = await join(code, n); net.welcome = w; session.tid = null; busy(false); location.hash = '#/online'; renderOnline(); } catch (e) { busy(false); toast(esc(e.message || 'Could not join'), 'error'); }
  },
  claimTeam(el) { claim(+el.dataset.tid); },
  chatSend() { const i = $('#chatIn'); sendChat(i.value.trim()); i.value = ''; },
  leaveOnline() { leaveOnline(); session.tid = null; toast('Left the online room.'); location.hash = '#/home'; render(); },
});

boot().then(loadTeamsCache);

// ---------------------------------------------------------------- fast tooltips: anything with a title shows a styled tip right away
function initTooltips() {
  const tip = document.createElement('div');
  tip.id = 'tip';
  document.body.appendChild(tip);
  let cur = null;
  const hide = () => { tip.style.display = 'none'; if (cur && cur.dataset.tip) { cur.setAttribute('title', cur.dataset.tip); } cur = null; };
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[title]');
    if (!el || el === cur) return;
    hide();
    const t = el.getAttribute('title');
    if (!t) return;
    cur = el; el.dataset.tip = t; el.removeAttribute('title');
    tip.textContent = t; tip.style.display = 'block';
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth, hgt = tip.offsetHeight;
    let x = r.left + r.width / 2 - w / 2; x = Math.max(6, Math.min(window.innerWidth - w - 6, x));
    let y = r.top - hgt - 8; if (y < 6) y = r.bottom + 8;
    tip.style.left = `${x}px`; tip.style.top = `${y}px`;
  });
  document.addEventListener('mouseout', (e) => { if (cur && !cur.contains(e.relatedTarget)) hide(); });
  document.addEventListener('click', hide, true);
  window.addEventListener('scroll', hide, true);
  window.addEventListener('hashchange', hide);
  APP.hideTip = hide;
}
