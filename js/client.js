// Transport between the UI and the league engine.
// Local / host: talks to the Web Worker.  Online guest: talks to the host over WebRTC (PeerJS room code).
const W = { worker: null, seq: 0, pending: new Map(), onToast: null };
export const net = { mode: 'local', peer: null, conns: new Map(), hostConn: null, code: null, myTid: null, name: 'GM', listeners: new Set(), ready: new Map(), chat: [], guestTid: null, hostReady: false, myReady: false, status: null };

function ensureWorker() {
  if (W.worker) return;
  W.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  W.worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'toast') { W.onToast?.(m.text, m.level); return; }
    const p = W.pending.get(m.id);
    if (!p) return;
    W.pending.delete(m.id);
    if (m.error) p.reject(new Error(m.error)); else p.resolve({ result: m.result, changed: m.changed });
  };
  W.worker.onerror = (e) => { console.error('worker error', e); W.onToast?.(`Engine error: ${e.message || 'see console'}`, 'error'); };
}
function workerCall(method, args, ctx) {
  ensureWorker();
  const id = ++W.seq;
  return new Promise((resolve, reject) => { W.pending.set(id, { resolve, reject }); W.worker.postMessage({ id, method, args, ctx }); });
}
export function setToastHandler(fn) { W.onToast = fn; }

// ---------------- public call
export const session = { tid: null };
export async function call(method, args = {}) {
  if (net.mode === 'guest') return guestCall(method, args);
  const { result, changed } = await workerCall(method, args, { tid: session.tid, host: true });
  if (changed && net.mode === 'host') broadcast({ t: 'update', method });
  return result;
}

// ---------------- online (PeerJS)
const GUEST_OK = new Set(['header', 'dashboard', 'teams', 'roster', 'playerDetail', 'depth', 'setDepthChart', 'autoDepthChart', 'lineupInfo', 'setScheme', 'setRole', 'setInjAuto', 'setAutoScout', 'prepInfo', 'setPrep', 'standings', 'schedule', 'game', 'playerStats',
  'leaders', 'teamStats', 'newsFeed', 'capSheet', 'releaseP', 'restructureP', 'tagP', 'optionP', 'declineOption', 'irP', 'activateP', 'toPS', 'promoteP', 'autoCutdown', 'toggleBlock',
  'negotiateP', 'faList', 'withdrawOffer', 'signMin', 'signToPS', 'tradeAssets', 'tradeEval', 'tradePropose', 'tradeMakeItWork', 'tradeFind', 'tradeOffers', 'respondOffer',
  'draftBoard', 'scout', 'boardToggle', 'boardMove', 'draftState', 'draftPick', 'draftAuto', 'fantasyState', 'fantasyMakePick', 'fantasyAutoMine', 'staff', 'hire', 'fire',
  'finances', 'setPrices', 'rulesView', 'vote', 'propose', 'history', 'eventsList', 'eventResolve', 'settings', 'onlineTeams',
  'recap', 'playoffBracket', 'awardRace', 'nflHistory', 'negOptions', 'faLive', 'draftLive', 'franchiseOptions', 'relocate', 'rebrand']);
// Only the league creator (host) advances weeks, sims the draft or moves the league to the next phase.

async function loadPeer() {
  if (window.Peer) return;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
    s.onload = res; s.onerror = () => rej(new Error('Could not load the online module (PeerJS). Check your connection.'));
    document.head.appendChild(s);
  });
}
const genCode = () => Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
const emit = (ev) => { for (const f of net.listeners) f(ev); };
export function onNet(fn) { net.listeners.add(fn); return () => net.listeners.delete(fn); }

export async function host(name) {
  await loadPeer();
  net.name = name || 'Host';
  const code = genCode();
  return new Promise((resolve, reject) => {
    const peer = new window.Peer(`tff-room-${code}`, { debug: 1 });
    peer.on('open', () => {
      net.mode = 'host'; net.peer = peer; net.code = code;
      workerCall('markOnline', { online: true }, {});
      resolve(code);
      emit({ t: 'status' });
    });
    peer.on('error', (e) => { emit({ t: 'error', text: e.message || String(e) }); reject(e); });
    peer.on('connection', (conn) => {
      conn.on('open', () => { net.conns.set(conn.peer, { conn, tid: null, name: 'Guest' }); emit({ t: 'status' }); });
      conn.on('data', (msg) => hostHandle(conn, msg));
      conn.on('close', () => {
        const c = net.conns.get(conn.peer);
        net.conns.delete(conn.peer);
        if (c?.tid != null) addChat('system', `${c.name} (${c.abbr || ''}) disconnected.`);
        emit({ t: 'status' });
      });
    });
  });
}
async function hostHandle(conn, msg) {
  const me = net.conns.get(conn.peer);
  if (!me) return;
  if (msg.t === 'hello') {
    me.name = String(msg.name || 'Guest').slice(0, 24);
    const teams = (await workerCall('onlineTeams', {}, { host: true })).result;
    conn.send({ t: 'welcome', teams, hostName: net.name });
    addChat('system', `${me.name} joined the room.`);
    emit({ t: 'status' });
    return;
  }
  if (msg.t === 'claim') {
    const r = await workerCall('claimTeam', { tid: msg.tid }, { host: true }).catch((e) => ({ result: { error: e.message } }));
    if (r.result?.error) { conn.send({ t: 'claimed', error: r.result.error }); return; }
    me.tid = msg.tid;
    const teams = (await workerCall('onlineTeams', {}, { host: true })).result;
    me.abbr = teams.find((t) => t.tid === msg.tid)?.abbr;
    conn.send({ t: 'claimed', tid: msg.tid });
    addChat('system', `${me.name} is now the GM of ${me.abbr}.`);
    broadcast({ t: 'update' });
    broadcastStatus();
    emit({ t: 'update' }); emit({ t: 'status' });
    return;
  }
  if (msg.t === 'rpc') {
    if (!GUEST_OK.has(msg.method)) { conn.send({ t: 'res', id: msg.id, error: 'The host controls that action.' }); return; }
    if (me.tid == null && !['onlineTeams', 'header', 'teams'].includes(msg.method)) { conn.send({ t: 'res', id: msg.id, error: 'Pick a team first.' }); return; }
    try {
      const { result, changed } = await workerCall(msg.method, msg.args || {}, { tid: me.tid, host: false });
      conn.send({ t: 'res', id: msg.id, result });
      if (changed) { broadcast({ t: 'update', method: msg.method }, conn.peer); emit({ t: 'update' }); }
    } catch (e) { conn.send({ t: 'res', id: msg.id, error: e.message }); }
    return;
  }
  if (msg.t === 'ready') { net.ready.set(conn.peer, !!msg.v); emit({ t: 'status' }); broadcastStatus(); checkAllReady(); return; }
  if (msg.t === 'chat') { addChat(me.name, String(msg.text).slice(0, 300)); }
}
function broadcast(msg, except = null) { for (const [id, c] of net.conns) if (id !== except) try { c.conn.send(msg); } catch { /* ignore */ } }
function broadcastStatus() { broadcast({ t: 'status', host: { name: net.name, ready: net.hostReady }, ready: [...net.conns.values()].map((c) => ({ name: c.name, abbr: c.abbr, tid: c.tid, ready: !!net.ready.get(c.conn.peer) })) }); }
// Everyone who runs a team (the host plus every guest who picked a team) must be ready before the league advances.
export function readyCounts() {
  if (net.mode === 'host') {
    const gms = [...net.conns.values()].filter((c) => c.tid != null);
    return { ready: (net.hostReady ? 1 : 0) + gms.filter((c) => net.ready.get(c.conn.peer)).length, total: 1 + gms.length };
  }
  if (net.mode === 'guest' && net.status) {
    const gms = (net.status.ready || []).filter((c) => c.tid != null);
    return { ready: (net.status.host?.ready ? 1 : 0) + gms.filter((c) => c.ready).length, total: 1 + gms.length };
  }
  return { ready: 0, total: 1 };
}
function checkAllReady() {
  if (net.mode !== 'host') return;
  const c = readyCounts();
  if (c.total >= 2 && c.ready >= c.total) emit({ t: 'allReady' });
}
function addChat(from, text) {
  const m = { from, text, at: Date.now() };
  net.chat.push(m); if (net.chat.length > 100) net.chat.shift();
  if (net.mode === 'host') broadcast({ t: 'chat', ...m });
  emit({ t: 'chat', ...m });
}
export function sendChat(text) {
  if (!text) return;
  if (net.mode === 'host') addChat(net.name, text);
  else if (net.mode === 'guest') net.hostConn?.send({ t: 'chat', text });
}
export function setReady(v) {
  net.myReady = !!v;
  if (net.mode === 'guest') net.hostConn?.send({ t: 'ready', v });
  if (net.mode === 'host') { net.hostReady = !!v; broadcastStatus(); emit({ t: 'status' }); checkAllReady(); }
}
export function guestStatus() { return [...net.conns.values()].map((c) => ({ name: c.name, abbr: c.abbr, tid: c.tid, ready: !!net.ready.get(c.conn.peer) })); }
export function clearReady() { net.ready.clear(); net.hostReady = false; net.myReady = false; broadcast({ t: 'readyReset' }); broadcastStatus(); emit({ t: 'status' }); }

let gseq = 0;
const gpending = new Map();
export async function join(code, name) {
  await loadPeer();
  net.name = name || 'Guest';
  return new Promise((resolve, reject) => {
    const peer = new window.Peer({ debug: 1 });
    peer.on('error', (e) => { emit({ t: 'error', text: e.type === 'peer-unavailable' ? 'Room not found. Check the code and that the host is online.' : (e.message || String(e)) }); reject(e); });
    peer.on('open', () => {
      const conn = peer.connect(`tff-room-${code.toUpperCase()}`, { reliable: true });
      net.peer = peer; net.hostConn = conn; net.code = code.toUpperCase();
      conn.on('open', () => { net.mode = 'guest'; conn.send({ t: 'hello', name: net.name }); });
      conn.on('data', (msg) => {
        if (msg.t === 'welcome') { resolve(msg); emit(msg); return; }
        if (msg.t === 'res') { const p = gpending.get(msg.id); if (p) { gpending.delete(msg.id); msg.error ? p.reject(new Error(msg.error)) : p.resolve(msg.result); } return; }
        if (msg.t === 'claimed') { if (!msg.error) { net.guestTid = msg.tid; session.tid = msg.tid; } emit(msg); return; }
        if (msg.t === 'chat') { net.chat.push(msg); emit(msg); return; }
        if (msg.t === 'status') { net.status = msg; }
        if (msg.t === 'readyReset') { net.myReady = false; emit({ t: 'status' }); return; }
        emit(msg);
      });
      conn.on('close', () => { emit({ t: 'disconnected' }); net.mode = 'local'; });
    });
    setTimeout(() => reject(new Error('Timed out connecting to the room.')), 20000);
  });
}
export function claim(tid) { net.hostConn?.send({ t: 'claim', tid }); }
function guestCall(method, args) {
  const id = ++gseq;
  return new Promise((resolve, reject) => {
    gpending.set(id, { resolve, reject });
    net.hostConn.send({ t: 'rpc', id, method, args });
    setTimeout(() => { if (gpending.has(id)) { gpending.delete(id); reject(new Error('Host did not respond.')); } }, 30000);
  });
}
export function leaveOnline() {
  try { net.peer?.destroy(); } catch { /* ignore */ }
  net.mode = 'local'; net.peer = null; net.conns.clear(); net.hostConn = null; net.code = null;
  workerCall('markOnline', { online: false }, {}).catch(() => {});
}
