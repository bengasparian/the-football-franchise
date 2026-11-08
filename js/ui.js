// Small UI toolkit: escaping, formatting, tables, modals, toasts, charts.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function money(x, d = 1) {
  if (x == null || Number.isNaN(x)) return '—';
  const a = Math.abs(x), sign = x < 0 ? '-' : '';
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(d)}M`;
  if (a >= 1e3) return `${sign}$${Math.round(a / 1e3)}K`;
  return `${sign}$${Math.round(a)}`;
}
export const pct = (x, d = 1) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`);
export const ht = (inch) => (inch ? `${Math.floor(inch / 12)}'${inch % 12}"` : '—');
export const ovrCls = (o) => (o >= 90 ? 'o90' : o >= 85 ? 'o85' : o >= 80 ? 'o80' : o >= 75 ? 'o75' : o >= 70 ? 'o70' : o >= 60 ? 'o60' : 'olo');
export const ovr = (o, cls = '') => `<span class="ovr ${ovrCls(o)} ${cls}">${o ?? '?'}</span>`;
export const delta = (d) => (d > 0 ? `<span class="delta up">+${d}</span>` : d < 0 ? `<span class="delta dn">${d}</span>` : '');
const SIL = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#16223c"/><circle cx="20" cy="15" r="7" fill="#33456b"/><path d="M6 38c2-9 8-13 14-13s12 4 14 13" fill="#33456b"/></svg>');
export const hs = (url, cls = '') => `<img class="hs ${cls}" loading="lazy" src="${esc(url || SIL)}" onerror="this.onerror=null;this.src='${SIL}'" alt="">`;
export const logo = (url, cls = '') => (url ? `<img class="logo ${cls}" loading="lazy" src="${esc(url)}" alt="" onerror="this.style.visibility='hidden'">` : '');
export function pname(p, { link = true, sub = null, img = true } = {}) {
  const n = esc(p.name || `${p.fn} ${p.ln}`);
  const s = sub ?? `${p.pos || ''}${p.team ? ' · ' + p.team : ''}`;
  return `<div class="pname">${img ? hs(p.hs) : ''}<div style="min-width:0"><div class="n">${link ? `<a href="#/player/${encodeURIComponent(p.pid)}">${n}</a>` : n}</div><div class="x">${esc(s)}</div></div></div>`;
}
export function injBadge(p) {
  if (p.holdout) return '<span class="badge yel">HOLDOUT</span>';
  if (!p.inj) return '';
  if (p.status === 'IR') return `<span class="badge red" title="${esc(p.inj.type)}">IR</span>`;
  return `<span class="badge red" title="${esc(p.inj.type)}">${p.inj.se ? 'OUT (season)' : p.inj.wk > 0 ? `OUT ${p.inj.wk}w` : 'Q'}</span>`;
}
export function moraleTxt(m) {
  if (m == null) return '—';
  const c = m >= 70 ? 'good' : m >= 45 ? '' : m >= 30 ? 'warn' : 'bad';
  const w = m >= 80 ? 'Ecstatic' : m >= 65 ? 'Happy' : m >= 50 ? 'Content' : m >= 35 ? 'Unhappy' : 'Furious';
  return `<span class="${c}">${w}</span>`;
}
export function meter(v, max = 100, color = null, cls = '') {
  const w = Math.max(0, Math.min(100, (v / max) * 100));
  return `<div class="meter ${cls}"><i style="width:${w}%;${color ? `background:${color}` : ''}"></i></div>`;
}
export const contractTxt = (c) => (!c ? '—' : c.ps ? `<span class="dim">PS ${money(c.hit, 0)}</span>` : `${money(c.apy)} <span class="dim">· thru ${c.exp}</span>${c.tag ? ' <span class="badge yel">TAG</span>' : ''}${c.rookie ? ' <span class="dim tiny">R</span>' : ''}`);

// ---------- sortable table
export function table({ cols, rows, key = null, sort = null, onRow = null, cls = '', id = '', empty = 'Nothing here.' }) {
  const tid = id || `t${Math.random().toString(36).slice(2, 8)}`;
  const state = (TABLES[tid] ||= { sort: sort?.k || null, dir: sort?.dir || 'desc' });
  let rs = [...rows];
  if (state.sort) {
    const c = cols.find((x) => x.k === state.sort);
    if (c) {
      const val = c.sortv || ((r) => r[c.k]);
      rs.sort((a, b) => { const va = val(a), vb = val(b); const d = (va ?? -1e15) > (vb ?? -1e15) ? 1 : (va ?? -1e15) < (vb ?? -1e15) ? -1 : 0; return state.dir === 'asc' ? d : -d; });
    }
  }
  const head = cols.map((c) => `<th class="${c.num ? 'num' : ''} ${c.c ? 'c' : ''} ${c.nosort ? '' : 'sort'} ${state.sort === c.k ? state.dir : ''}" data-sort="${c.nosort ? '' : c.k}" data-tbl="${tid}" title="${esc(c.title || '')}">${c.l}</th>`).join('');
  const body = rs.length ? rs.map((r) => `<tr class="${onRow ? 'click' : ''} ${r._cls || ''}" ${onRow ? `data-row="${esc(onRow(r))}"` : ''}>${cols.map((c) => `<td class="${c.num ? 'num' : ''} ${c.c ? 'c' : ''}">${c.f ? c.f(r) : esc(r[c.k] ?? '')}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${cols.length}" class="empty">${empty}</td></tr>`;
  return `<div class="tbl-wrap ${cls}"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
export const TABLES = {};

// ---------- modal / toast / busy
export function modal(title, html, { narrow = false } = {}) {
  const m = $('#modal');
  m.innerHTML = `<div class="box ${narrow ? 'narrow' : ''}"><div class="hd"><h2>${title}</h2><button class="btn ghost close" data-act="closeModal">✕</button></div><div class="bd">${html}</div></div>`;
  m.classList.add('open');
  return m;
}
export function closeModal() { $('#modal').classList.remove('open'); $('#modal').innerHTML = ''; }
export function toast(text, level = 'info', ms = 4200) {
  const el = document.createElement('div');
  el.className = `toast ${level}`;
  el.innerHTML = text;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), ms);
}
export function busy(on, text = 'Simulating…') { const b = $('#busy'); b.classList.toggle('on', !!on); $('#busyText').textContent = text; }

// ---------- tiny SVG charts
export function sparkline(points, { w = 320, h = 70, min = null, max = null } = {}) {
  if (!points.length) return '';
  const lo = min ?? Math.min(...points) - 2, hi = max ?? Math.max(...points) + 2;
  const sx = (i) => (points.length === 1 ? w / 2 : (i / (points.length - 1)) * (w - 8) + 4);
  const sy = (v) => h - 6 - ((v - lo) / Math.max(1, hi - lo)) * (h - 14);
  const d = points.map((v, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(' ');
  return `<svg class="sparkline" viewBox="0 0 ${w} ${h}" width="100%" height="${h}"><path d="${d}"/>${points.map((v, i) => `<circle cx="${sx(i)}" cy="${sy(v)}" r="2.5"><title>${v}</title></circle>`).join('')}</svg>`;
}
export function bars(items, { max = null, h = 140 } = {}) {
  const mx = max ?? Math.max(1, ...items.map((x) => Math.abs(x.v)));
  const w = 100 / items.length;
  return `<svg viewBox="0 0 100 ${h}" width="100%" height="${h}" preserveAspectRatio="none">${items.map((x, i) => {
    const bh = (Math.abs(x.v) / mx) * (h - 22);
    return `<rect x="${i * w + w * 0.15}" y="${h - 16 - bh}" width="${w * 0.7}" height="${bh}" fill="${x.c || 'var(--accent)'}" rx="1"><title>${esc(x.l)}: ${esc(x.t ?? x.v)}</title></rect>`;
  }).join('')}</svg><div class="row small muted" style="justify-content:space-between">${items.map((x) => `<span>${esc(x.l)}</span>`).join('')}</div>`;
}
export function setAccent(c1) {
  if (!c1) return;
  let c = c1;
  // brighten very dark team colors so the accent stays readable on dark backgrounds
  const n = parseInt(c.replace('#', ''), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  if (lum < 70) { const k = 70 / Math.max(lum, 10); r = Math.min(255, r * k + 40); g = Math.min(255, g * k + 40); b = Math.min(255, b * k + 60); }
  c = `rgb(${r | 0},${g | 0},${b | 0})`;
  document.documentElement.style.setProperty('--accent', c);
}
