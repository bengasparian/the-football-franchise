// Core helpers: league state holder, RNG, math utilities.
import { CAP_2026, MIN_SALARY_2026, PS_WEEKLY_2026 } from './const.js';

export const G = { L: null };
export const L = () => G.L;

// ---- RNG (sfc32, seedable; state lives in league meta so saves continue the same stream)
let s = [0x9e3779b9, 0x243f6a88, 0xb7e15162, 1];
export function seedRng(seed) {
  let h = 1779033703 ^ String(seed).length;
  const str = String(seed);
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  const next = () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; };
  s = [next(), next(), next(), next()];
  for (let i = 0; i < 15; i++) rnd();
}
export function rngState() { return s.slice(); }
export function setRngState(st) { if (st && st.length === 4) s = st.slice(); }
export function rnd() {
  let [a, b, c, d] = s;
  a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
  let t = (a + b) | 0;
  a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0;
  s[0] = a; s[1] = b; s[2] = c; s[3] = d;
  return (t >>> 0) / 4294967296;
}
export const rint = (a, b) => a + Math.floor(rnd() * (b - a + 1));
export const chance = (p) => rnd() < p;
export function gauss(mu = 0, sd = 1) {
  let u = 0, v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
export function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
export function wpick(items, weights) {
  let tot = 0;
  for (const w of weights) tot += Math.max(0, w);
  if (tot <= 0) return items[Math.floor(rnd() * items.length)];
  let r = rnd() * tot;
  for (let i = 0; i < items.length; i++) { r -= Math.max(0, weights[i]); if (r <= 0) return items[i]; }
  return items[items.length - 1];
}
export function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sum = (arr, f = (x) => x) => arr.reduce((acc, x) => acc + f(x), 0);
export const avg = (arr, f = (x) => x) => (arr.length ? sum(arr, f) / arr.length : 0);
export const round = (x, d = 0) => { const m = 10 ** d; return Math.round(x * m) / m; };
export const sigmoid = (x) => 1 / (1 + Math.exp(-x));
export function interp(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
  }
  return pts[pts.length - 1][1];
}

// ---- league accessors
export const team = (tid) => G.L.teams[tid];
export const player = (pid) => G.L.players[pid];
export const allPlayers = () => Object.values(G.L.players);
export const teamPlayers = (tid, statuses = null) =>
  Object.values(G.L.players).filter((p) => p.tid === tid && (!statuses || statuses.includes(p.status)));
export const season = () => G.L.meta.season;
export const fullName = (p) => `${p.fn} ${p.ln}`;
export function age(p, atSeason = G.L?.meta.season ?? 2026) {
  // age at Sept 1 of the season
  if (!p.born) return 25;
  const [y, m] = [p.born.y, p.born.m || 6];
  return atSeason - y - (m > 9 ? 1 : 0);
}

// ---- money: cap & minimums
export function capFor(season) {
  const caps = G.L.meta.caps;
  if (caps[season]) return caps[season];
  let last = Math.max(...Object.keys(caps).map(Number));
  while (last < season) {
    const growth = (0.055 + rnd() * 0.04) * (G.L.settings.sliders.capGrowth ?? 1);
    caps[last + 1] = Math.round((caps[last] * (1 + growth)) / 100_000) * 100_000;
    last++;
  }
  return caps[season];
}
export function capRatio(season) { return capFor(season) / CAP_2026; }
export function minSalary(exp, season) {
  const base = MIN_SALARY_2026[Math.min(exp, 7)];
  const growth = Math.pow(1.045, Math.max(0, season - 2026));
  return Math.round((base * growth) / 5000) * 5000;
}
export function psSalary(exp, season) {
  const g = Math.pow(1.055, Math.max(0, season - 2026));
  return Math.round((exp <= 2 ? PS_WEEKLY_2026.young : PS_WEEKLY_2026.vetMin) * 18 * g);
}
export function fmtMoney(x, digits = 1) {
  if (x == null) return '-';
  const a = Math.abs(x);
  if (a >= 1e6) return `$${(x / 1e6).toFixed(digits)}M`;
  if (a >= 1e3) return `$${Math.round(x / 1e3)}K`;
  return `$${Math.round(x)}`;
}

let _id = 0;
export function nextId(prefix = 'g') {
  const m = G.L.meta;
  m.nextId = (m.nextId || 1) + 1;
  return `${prefix}${m.nextId.toString(36)}`;
}
export function ensureIdCounter() { _id++; }

// ---- news & transactions
export function news(text, opts = {}) {
  const Lg = G.L;
  Lg.news.unshift({ id: nextId('n'), s: Lg.meta.season, ph: Lg.meta.phase, w: Lg.meta.week, text, ...opts });
  if (Lg.news.length > 1500) Lg.news.length = 1500;
}
export function transaction(type, text, data = {}) {
  const Lg = G.L;
  Lg.transactions.unshift({ id: nextId('t'), s: Lg.meta.season, ph: Lg.meta.phase, w: Lg.meta.week, type, text, ...data });
  if (Lg.transactions.length > 3000) Lg.transactions.length = 3000;
}
export const isUser = (tid) => G.L.meta.userTids.includes(tid);
