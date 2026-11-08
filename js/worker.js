// Web worker: owns the league state, runs the engine off the UI thread, autosaves to IndexedDB.
import { G, setRngState, rngState } from './engine/core.js';
import * as API from './engine/api.js';

const READ_ONLY = new Set(['header', 'dashboard', 'teams', 'roster', 'playerDetail', 'depth', 'standings', 'schedule', 'game', 'playerStats', 'leaders',
  'teamStats', 'newsFeed', 'capSheet', 'faList', 'tradeAssets', 'tradeEval', 'tradeFind', 'tradeMakeItWork', 'tradeOffers', 'draftBoard', 'draftState',
  'fantasyState', 'staff', 'finances', 'rulesView', 'history', 'eventsList', 'settings', 'onlineTeams', 'teamsForPicker']);

let DATA = null;
let saveId = null;
let saveTimer = null;
let dbp = null;

function db() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open('the-football-franchise', 2);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('saves')) d.createObjectStore('saves');
      if (!d.objectStoreNames.contains('index')) d.createObjectStore('index');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function idb(store, mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction(store, mode);
    const st = tx.objectStore(store);
    const req = fn(st);
    tx.oncomplete = () => res(req?.result);
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error || new Error('IndexedDB aborted (storage full?)'));
  });
}
async function loadData() {
  if (DATA) return DATA;
  const r = await fetch(new URL('../data/league.json', import.meta.url));
  if (!r.ok) throw new Error('Could not load NFL data file');
  DATA = await r.json();
  return DATA;
}
function indexEntry() {
  const L = G.L;
  const t = L.teams[L.meta.userTids[0]];
  return { id: saveId, name: L.meta.name, season: L.meta.season, phase: L.meta.phase, week: L.meta.week, team: t ? `${t.region} ${t.name}` : '—', abbr: t?.abbr, logo: t?.logo, updated: Date.now(), online: !!L.meta.online };
}
async function saveNow() {
  if (!G.L || !saveId) return;
  G.L.meta.rng = rngState();
  await idb('saves', 'readwrite', (s) => s.put(G.L, saveId));
  await idb('index', 'readwrite', (s) => s.put(indexEntry(), saveId));
}
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveNow().catch((e) => postMessage({ type: 'toast', level: 'error', text: `Autosave failed: ${e.message}` })); }, 700);
}

const SPECIAL = {
  async init() { await loadData(); return { ok: true, built: DATA.meta.built, season: DATA.meta.season, lastFullWeek: DATA.meta.lastFullWeek, rosterWeek: DATA.meta.rosterWeek }; },
  async teamsForPicker() { await loadData(); return API.teamsForPicker(null, null, DATA); },
  async newLeague(args) {
    await loadData();
    const r = API.newLeague(args, null, DATA);
    saveId = `s${Date.now().toString(36)}`;
    await saveNow();
    return { ...r, saveId };
  },
  async listSaves() { const d = await db(); return new Promise((res) => { const out = []; const tx = d.transaction('index', 'readonly'); const c = tx.objectStore('index').openCursor(); c.onsuccess = () => { const cur = c.result; if (cur) { out.push(cur.value); cur.continue(); } else res(out.sort((a, b) => b.updated - a.updated)); }; }); },
  async load({ id }) {
    const L = await idb('saves', 'readonly', (s) => s.get(id));
    if (!L) throw new Error('Save not found');
    G.L = L; saveId = id;
    setRngState(L.meta.rng);
    return { ok: true, meta: L.meta };
  },
  async deleteSave({ id }) { await idb('saves', 'readwrite', (s) => s.delete(id)); await idb('index', 'readwrite', (s) => s.delete(id)); if (saveId === id) { saveId = null; G.L = null; } return { ok: true }; },
  async exportSave() { if (!G.L) throw new Error('No league loaded'); G.L.meta.rng = rngState(); return { json: JSON.stringify(G.L), name: G.L.meta.name }; },
  async importSave({ json }) {
    const L = JSON.parse(json);
    if (!L?.meta || !L.players || !L.teams) throw new Error('Not a valid league file');
    G.L = L; saveId = `s${Date.now().toString(36)}`; setRngState(L.meta.rng);
    await saveNow();
    return { ok: true, saveId, meta: L.meta };
  },
  async saveNow() { await saveNow(); return { ok: true }; },
  async close() { await saveNow(); G.L = null; saveId = null; return { ok: true }; },
  async hasLeague() { return { loaded: !!G.L, saveId, meta: G.L?.meta || null }; },
  async markOnline({ online }) { if (G.L) G.L.meta.online = !!online; scheduleSave(); return { ok: true }; },
};

self.onmessage = async (e) => {
  const { id, method, args = {}, ctx = {} } = e.data;
  try {
    let result;
    let changed = false;
    if (SPECIAL[method]) { result = await SPECIAL[method](args, ctx); changed = ['newLeague', 'load', 'importSave'].includes(method); }
    else {
      const fn = API[method];
      if (typeof fn !== 'function') throw new Error(`Unknown method ${method}`);
      if (!G.L) { if (method === 'header') { postMessage({ id, result: null }); return; } throw new Error('No league loaded'); }
      const t0 = performance.now();
      result = fn(args, ctx, DATA);
      if (!READ_ONLY.has(method)) { changed = true; scheduleSave(); }
      const dt = performance.now() - t0;
      if (dt > 3000) console.log(`[worker] ${method} took ${Math.round(dt)}ms`);
    }
    postMessage({ id, result, changed });
  } catch (err) {
    console.error(err);
    postMessage({ id, error: err?.message || String(err) });
  }
};
