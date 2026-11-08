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
// Illustrated portrait for players without a real headshot (generated draft classes, etc.). Deterministic from the
// player id so the same prospect always has the same face.
const FACE_CACHE = new Map();
function hash32(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function faceSvg(seed, jersey = '#1e3a8a') {
  const key = `${seed}|${jersey}`;
  if (FACE_CACHE.has(key)) return FACE_CACHE.get(key);
  let h = hash32(String(seed));
  const r = (n) => { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0; return (h >>> 0) % n; };
  const SKIN = ['#f1c9a5', '#e0ac85', '#c68a62', '#a86b45', '#8a5433', '#6b3f24', '#553019', '#3f2414'];
  const skin = SKIN[r(SKIN.length)];
  const dark = (c, f) => { const n = parseInt(c.slice(1), 16); const k = (x) => Math.max(0, Math.round(x * f)); return `#${[k(n >> 16), k((n >> 8) & 255), k(n & 255)].map((x) => x.toString(16).padStart(2, '0')).join('')}`; };
  const HAIRC = ['#14100c', '#1f1711', '#2c1d12', '#4a2f1b', '#6b4a2b', '#8c6239', '#b08850'];
  const hc = HAIRC[r(SKIN.indexOf(skin) >= 3 ? 3 : HAIRC.length)];
  const faceW = 11 + r(3), jaw = 1 + r(3);
  const hairStyle = r(7), beard = r(6), brow = r(3), eyes = r(3), nose = 2 + r(3), mouth = r(3);
  const hair = [
    '', // bald / shaved
    `<path d="M${20 - faceW} 15 Q20 3 ${20 + faceW} 15 L${20 + faceW} 12 Q20 1 ${20 - faceW} 12Z" fill="${hc}"/>`, // short
    `<path d="M${20 - faceW - 1} 16 Q20 -1 ${20 + faceW + 1} 16 Q${20 + faceW} 7 20 6 Q${20 - faceW} 7 ${20 - faceW - 1} 16Z" fill="${hc}"/>`, // afro-ish top
    `<path d="M${20 - faceW} 14 Q20 4 ${20 + faceW} 14 L${20 + faceW - 1} 11 Q20 5 ${20 - faceW + 1} 11Z" fill="${hc}"/>`, // fade
    `<g fill="${hc}">${[...Array(7)].map((_, i) => `<rect x="${20 - faceW + i * (faceW * 2 / 7)}" y="4" width="2" height="${14 + r(6)}" rx="1"/>`).join('')}</g>`, // locs
    `<path d="M${20 - faceW} 13 Q20 2 ${20 + faceW} 13 Q20 7 ${20 - faceW} 13Z" fill="${hc}"/><g stroke="${dark(hc, 0.6)}" stroke-width=".5">${[...Array(4)].map((_, i) => `<line x1="${15 + i * 3}" y1="5" x2="${15 + i * 3}" y2="11"/>`).join('')}</g>`, // braids/cornrows
    `<path d="M${20 - faceW - 1} 15 Q18 0 ${20 + faceW + 1} 14 L${20 + faceW} 10 Q20 4 ${20 - faceW} 11Z" fill="${hc}"/>`, // swept
  ][hairStyle];
  const bd = [
    '', '',
    `<path d="M${20 - faceW + 1} 21 Q20 ${33 + jaw} ${20 + faceW - 1} 21 Q20 ${29 + jaw} ${20 - faceW + 1} 21Z" fill="${hc}" opacity=".9"/>`, // full beard
    `<path d="M17 27 Q20 ${31 + jaw} 23 27 Q20 29 17 27Z" fill="${hc}"/>`, // goatee
    `<path d="M16.5 25 Q20 23.5 23.5 25 L23 26 Q20 25 17 26Z" fill="${hc}"/>`, // mustache
    `<path d="M${20 - faceW + 1} 21 Q20 ${33 + jaw} ${20 + faceW - 1} 21" fill="none" stroke="${hc}" stroke-width="1.2" opacity=".55"/>`, // stubble line
  ][beard];
  const eyeY = 18, ew = [1.1, 1.3, 0.9][eyes];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#16223c"/>
<path d="M3 40 Q5 30 14 29 L26 29 Q35 30 37 40Z" fill="${jersey}"/><path d="M15 29 L20 34 L25 29" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1"/>
<rect x="16" y="24" width="8" height="7" fill="${dark(skin, 0.9)}"/>
<ellipse cx="${20 - faceW}" cy="19" rx="1.6" ry="2.4" fill="${dark(skin, 0.92)}"/><ellipse cx="${20 + faceW}" cy="19" rx="1.6" ry="2.4" fill="${dark(skin, 0.92)}"/>
<path d="M${20 - faceW} 14 Q${20 - faceW} ${27 + jaw} 20 ${29 + jaw} Q${20 + faceW} ${27 + jaw} ${20 + faceW} 14 Q20 5 ${20 - faceW} 14Z" fill="${skin}"/>
${hair}
<g fill="${dark(hc, 0.9)}">${brow === 0 ? `<rect x="14.5" y="15.3" width="4" height="1" rx=".5"/><rect x="21.5" y="15.3" width="4" height="1" rx=".5"/>` : brow === 1 ? `<path d="M14.5 16.3 L18.5 15.2 L18.5 16.1 Z"/><path d="M25.5 16.3 L21.5 15.2 L21.5 16.1 Z"/>` : `<rect x="14.5" y="15" width="4" height="1.4" rx=".7"/><rect x="21.5" y="15" width="4" height="1.4" rx=".7"/>`}</g>
<ellipse cx="16.5" cy="${eyeY}" rx="1.5" ry="${ew}" fill="#fff"/><ellipse cx="23.5" cy="${eyeY}" rx="1.5" ry="${ew}" fill="#fff"/>
<circle cx="16.7" cy="${eyeY}" r=".8" fill="#2a1a10"/><circle cx="23.7" cy="${eyeY}" r=".8" fill="#2a1a10"/>
<path d="M20 19 L${20 - nose / 2} 23 L${20 + nose / 2} 23" fill="none" stroke="${dark(skin, 0.72)}" stroke-width=".8" stroke-linejoin="round"/>
${bd}
<path d="${mouth === 0 ? 'M17.5 25.5 Q20 27 22.5 25.5' : mouth === 1 ? 'M17.5 26 L22.5 26' : 'M17.8 25.6 Q20 26.6 22.2 25.6'}" fill="none" stroke="${dark(skin, 0.55)}" stroke-width=".9" stroke-linecap="round"/>
</svg>`;
  const uri = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  FACE_CACHE.set(key, uri);
  return uri;
}
export const hs = (url, cls = '', p = null) => {
  const src = url ? smallImg(url, cls === 'lg' ? 240 : cls === 'md' ? 120 : 72) : (p && (p.pid || p.name) ? faceSvg(p.pid || p.name, p.tc || '#1e3a8a') : SIL);
  const fb = p && (p.pid || p.name) ? faceSvg(p.pid || p.name, p.tc || '#1e3a8a') : SIL;
  return `<img class="hs ${cls}" loading="lazy" decoding="async" src="${esc(src)}" onerror="this.onerror=null;this.src='${fb}'" alt="">`;
};
// Team logos come as 500px PNGs; ask the CDN for a small version (much faster to download and decode).
const LOGO_PX = { sm: 40, '': 48, md: 80, lg: 144, xl: 192 };
export function smallImg(url, px) {
  if (!url) return url;
  const m = /^https:\/\/a\.espncdn\.com(\/i\/teamlogos\/[^?]+\.png)$/.exec(url);
  if (m) return `https://a.espncdn.com/combiner/i?img=${m[1]}&h=${px}&w=${px}`;
  if (url.includes('static.www.nfl.com/image/upload/')) return url.replace('/image/upload/f_auto,q_auto/', `/image/upload/f_auto,q_auto,w_${px},h_${px},c_thumb,g_face/`);
  return url;
}
export const logo = (url, cls = '') => (url ? `<img class="logo ${cls}" decoding="async" src="${esc(smallImg(url, LOGO_PX[cls] || 48))}" alt="" onerror="if(!this.dataset.f){this.dataset.f=1;this.src='${esc(url)}'}else{this.style.visibility='hidden'}">` : '');
export function pname(p, { link = true, sub = null, img = true } = {}) {
  const n = esc(p.name || `${p.fn} ${p.ln}`);
  const s = sub ?? `${p.pos || ''}${p.team ? ' · ' + p.team : ''}`;
  return `<div class="pname">${img ? hs(p.hs, '', p) : ''}<div style="min-width:0"><div class="n">${link ? `<a href="#/player/${encodeURIComponent(p.pid)}">${n}</a>` : n}</div><div class="x">${esc(s)}</div></div></div>`;
}
export function injBadge(p) {
  if (p.holdout) return '<span class="badge yel">HOLDOUT</span>';
  if (!p.inj) return '';
  const i = p.inj;
  const tip = `${i.type}: ${i.out || ''}${i.ret ? ` · ${i.ret}` : ''}`;
  const len = i.se || i.short === 'Season' ? 'season' : i.short && i.short !== 'Q' ? i.short : '';
  if (p.status === 'IR') return `<span class="badge red" title="${esc(tip)}">IR${len ? ` · ${len}` : ''}</span>`;
  return `<span class="badge ${i.short === 'Q' ? 'yel' : 'red'}" title="${esc(tip)}">${i.short === 'Q' ? 'Q' : `OUT ${len}`}</span>`;
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
  const state = (TABLES[tid] ||= { sort: sort?.k || null, dir: sort?.dir || 'desc', limit: 120 });
  let rs = [...rows];
  if (state.sort) {
    const c = cols.find((x) => x.k === state.sort);
    if (c) {
      const val = c.sortv || ((r) => r[c.k]);
      rs.sort((a, b) => { const va = val(a), vb = val(b); const d = (va ?? -1e15) > (vb ?? -1e15) ? 1 : (va ?? -1e15) < (vb ?? -1e15) ? -1 : 0; return state.dir === 'asc' ? d : -d; });
    }
  }
  const head = cols.map((c) => `<th class="${c.num ? 'num' : ''} ${c.c ? 'c' : ''} ${c.nosort ? '' : 'sort'} ${state.sort === c.k ? state.dir : ''}" data-sort="${c.nosort ? '' : c.k}" data-tbl="${tid}" title="${esc(c.title || '')}">${c.l}</th>`).join('');
  const total = rs.length;
  if (state.limit && rs.length > state.limit) rs = rs.slice(0, state.limit);
  const more = total > rs.length ? `<tr><td colspan="${cols.length}" class="c"><button class="btn sm" data-act="tblMore" data-tbl="${tid}" title="Show every row">Show all ${total}</button></td></tr>` : '';
  const body = rs.length ? rs.map((r) => `<tr class="${onRow ? 'click' : ''} ${r._cls || ''}" ${onRow ? `data-row="${esc(onRow(r))}"` : ''}>${cols.map((c) => `<td class="${c.num ? 'num' : ''} ${c.c ? 'c' : ''}">${c.f ? c.f(r) : esc(r[c.k] ?? '')}</td>`).join('')}</tr>`).join('') + more : `<tr><td colspan="${cols.length}" class="empty">${empty}</td></tr>`;
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
// ---------- team theme: the whole site takes on the controlled team's colors
const hex2rgb = (h) => { const n = parseInt(String(h || '#3b82f6').replace('#', '').padEnd(6, '0').slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lumOf = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;
const satOf = ([r, g, b]) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0; };
const mix = (a, b, t) => a.map((v, i) => Math.round(v * (1 - t) + b[i] * t));
const css = ([r, g, b]) => `rgb(${r},${g},${b})`;
function lift(rgb, minLum = 95) { let c = rgb; let guard = 0; while (lumOf(c) < minLum && guard++ < 20) c = mix(c, [255, 255, 255], 0.12); return c; }
let THEME_KEY = null;
export function setTheme(c1, c2) {
  const key = `${c1}|${c2}`;
  if (key === THEME_KEY) return;
  THEME_KEY = key;
  const P = hex2rgb(c1), S = hex2rgb(c2 || c1);
  // accent: the team color that reads best on a dark screen (Steelers gold, Raiders silver, Bears orange...)
  const score = (c) => (lumOf(c) < 45 ? -1 : satOf(c) * 1.4 + Math.min(lumOf(c), 170) / 170 - (lumOf(c) > 225 ? 0.6 : 0));
  const usePrimary = score(P) >= score(S) - 0.15;
  const acc = lift(usePrimary ? P : S, 80);
  const alt = usePrimary ? S : P;
  const acc2 = lift(mix(acc, [255, 255, 255], 0.35), 150);
  const second = lift(alt, 110);
  // surfaces: a deep, team-tinted dark (black-primary teams get a neutral charcoal tinted by the second color)
  const tint = lumOf(P) < 25 ? S : P;
  const base = [8, 12, 22];
  const bg = mix(base, tint, 0.10), bg2 = mix(base, tint, 0.15), panel = mix([14, 20, 36], tint, 0.16), panel2 = mix([20, 29, 50], tint, 0.20);
  const line = mix([33, 47, 78], tint, 0.25), line2 = mix([43, 60, 98], tint, 0.30);
  const R = document.documentElement.style;
  R.setProperty('--accent', css(acc));
  R.setProperty('--accent-rgb', acc.join(','));
  R.setProperty('--accent2', css(acc2));
  R.setProperty('--team2', css(second));
  R.setProperty('--team1', css(lift(P, 40)));
  R.setProperty('--team1-raw', c1 || '#1e3a8a');
  R.setProperty('--team2-raw', c2 || '#c60c30');
  R.setProperty('--on-accent', lumOf(acc) > 150 ? '#0b0f19' : '#ffffff');
  R.setProperty('--bg', css(bg)); R.setProperty('--bg2', css(bg2));
  R.setProperty('--panel', css(panel)); R.setProperty('--panel2', css(panel2));
  R.setProperty('--line', css(line)); R.setProperty('--line2', css(line2));
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.setAttribute('content', css(bg));
}
export function resetTheme() {
  THEME_KEY = null;
  const R = document.documentElement.style;
  for (const k of ['--accent', '--accent-rgb', '--accent2', '--team2', '--team1', '--team1-raw', '--team2-raw', '--on-accent', '--bg', '--bg2', '--panel', '--panel2', '--line', '--line2']) R.removeProperty(k);
}
export const setAccent = (c1, c2) => setTheme(c1, c2);

// Long form for lists and the player card: "Torn ACL · Out for the season · Expected back next season"
export function injText(p) {
  if (!p.inj) return '';
  return `${esc(p.inj.type)} · ${esc(p.inj.out || '')}${p.inj.ret ? ` · <span class="muted">${esc(p.inj.ret)}</span>` : ''}`;
}
