// Relocation and rebranding. CPU teams only move when it makes sense (a small or struggling market, an aging
// stadium, an unhappy fan base) and even then rarely. A user can move or rebrand any time in the offseason.
import { G, rnd, clamp, news, pick } from './core.js';

// Candidate markets: [city, region shown on the team, market size (M people), state/country, no income tax, conference lean]
export const CITIES = [
  ['London', 'London', 9.6, 'UK', false], ['Toronto', 'Toronto', 6.4, 'ON', false], ['San Antonio', 'San Antonio', 2.7, 'TX', true],
  ['St. Louis', 'St. Louis', 2.8, 'MO', false], ['San Diego', 'San Diego', 3.3, 'CA', false], ['Portland', 'Portland', 2.5, 'OR', false],
  ['Salt Lake City', 'Salt Lake', 2.7, 'UT', false], ['Austin', 'Austin', 2.5, 'TX', true], ['Mexico City', 'Mexico City', 21.8, 'MX', false],
  ['Orlando', 'Orlando', 2.8, 'FL', true], ['Columbus', 'Columbus', 2.2, 'OH', false], ['Oklahoma City', 'Oklahoma City', 1.5, 'OK', false],
  ['Sacramento', 'Sacramento', 2.4, 'CA', false], ['Vancouver', 'Vancouver', 2.7, 'BC', false], ['Raleigh', 'Raleigh', 2.1, 'NC', false],
  ['Birmingham', 'Birmingham', 1.2, 'AL', false], ['Omaha', 'Omaha', 1.0, 'NE', false], ['Montreal', 'Montreal', 4.3, 'QC', false],
  ['Memphis', 'Memphis', 1.3, 'TN', true], ['Louisville', 'Louisville', 1.4, 'KY', false], ['Albuquerque', 'Albuquerque', 0.9, 'NM', false],
  ['Hartford', 'Hartford', 1.2, 'CT', false], ['Honolulu', 'Honolulu', 1.0, 'HI', false], ['Frankfurt', 'Frankfurt', 5.8, 'DE', false],
];
// Team names a real front office might pick. Original names; colors and a generated crest come with each.
export const BRANDS = [
  ['Monarchs', '#4c1d95', '#f5c518', 'crown'], ['Lions', '#0b3d91', '#c0c0c0', 'shield'], ['Huskies', '#1f2937', '#60a5fa', 'circle'],
  ['Gunslingers', '#7c2d12', '#f59e0b', 'star'], ['Stallions', '#111827', '#dc2626', 'shield'], ['Outlaws', '#0f172a', '#ea580c', 'star'],
  ['Admirals', '#0c4a6e', '#e2e8f0', 'anchor'], ['Thunder', '#1e3a8a', '#facc15', 'bolt'], ['Grizzlies', '#3f2a1d', '#d97706', 'circle'],
  ['Mustangs', '#065f46', '#fbbf24', 'shield'], ['Express', '#991b1b', '#e5e7eb', 'diamond'], ['Pioneers', '#14532d', '#eab308', 'star'],
  ['Wolves', '#334155', '#94a3b8', 'circle'], ['Blaze', '#b91c1c', '#fb923c', 'bolt'], ['Knights', '#1c1917', '#a8a29e', 'shield'],
  ['Mariners', '#155e75', '#67e8f9', 'anchor'], ['Aviators', '#1d4ed8', '#f97316', 'diamond'], ['Generals', '#3f3f46', '#ca8a04', 'star'],
  ['Hammers', '#292524', '#f43f5e', 'shield'], ['Condors', '#78350f', '#fde047', 'circle'], ['Royals', '#312e81', '#fbbf24', 'crown'],
  ['Storm', '#0f766e', '#a5f3fc', 'bolt'], ['Bison', '#422006', '#fcd34d', 'circle'], ['Rangers', '#14532d', '#f8fafc', 'star'],
];

// Original crest: shape + monogram + team colors, as an SVG data URI.
export function crest(letters, c1, c2, shape = 'shield') {
  const L = String(letters || '?').slice(0, 3).toUpperCase();
  const shapes = {
    shield: `<path d="M50 4 L92 16 L88 60 Q80 86 50 98 Q20 86 12 60 L8 16 Z" fill="${c1}" stroke="${c2}" stroke-width="5"/>`,
    circle: `<circle cx="50" cy="50" r="44" fill="${c1}" stroke="${c2}" stroke-width="6"/>`,
    diamond: `<path d="M50 4 L96 50 L50 96 L4 50 Z" fill="${c1}" stroke="${c2}" stroke-width="5"/>`,
    star: `<circle cx="50" cy="50" r="44" fill="${c1}"/><path d="M50 10 L60 38 L90 38 L66 56 L75 86 L50 68 L25 86 L34 56 L10 38 L40 38 Z" fill="${c2}" opacity=".25"/>`,
    crown: `<path d="M10 78 L14 26 L32 46 L50 16 L68 46 L86 26 L90 78 Z" fill="${c1}" stroke="${c2}" stroke-width="5"/>`,
    anchor: `<circle cx="50" cy="50" r="44" fill="${c1}" stroke="${c2}" stroke-width="5"/><path d="M50 18 V80 M30 64 Q50 92 70 64 M38 30 H62" stroke="${c2}" stroke-width="5" fill="none" opacity=".35"/>`,
    bolt: `<circle cx="50" cy="50" r="44" fill="${c1}" stroke="${c2}" stroke-width="5"/><path d="M56 10 L26 56 H48 L40 92 L76 40 H54 Z" fill="${c2}" opacity=".3"/>`,
  };
  const fs = L.length >= 3 ? 26 : L.length === 2 ? 34 : 46;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${shapes[shape] || shapes.shield}<text x="50" y="${shape === 'crown' ? 66 : 61}" text-anchor="middle" font-family="Arial Black,Impact,sans-serif" font-weight="900" font-size="${fs}" fill="${c2}" stroke="#000" stroke-opacity=".25" stroke-width="1">${L}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function abbrFor(region, name) {
  const used = new Set(G.L.teams.map((t) => t.abbr));
  const words = region.split(/\s+/);
  const cands = [
    words.length > 1 ? (words[0][0] + words[1][0] + (words[2]?.[0] || words[1][1] || '')).toUpperCase() : region.slice(0, 3).toUpperCase(),
    region.slice(0, 2).toUpperCase() + name[0].toUpperCase(), region.slice(0, 3).toUpperCase(), (region[0] + name.slice(0, 2)).toUpperCase(),
  ];
  for (const c of cands) if (!used.has(c)) return c;
  return region.slice(0, 2).toUpperCase() + Math.floor(rnd() * 9);
}

export function relocateTeam(tid, cityName, { name = null, c1 = null, c2 = null, shape = null, keepBrand = false } = {}) {
  const Lg = G.L;
  const t = Lg.teams[tid];
  const city = CITIES.find((c) => c[0] === cityName);
  if (!city) return { error: 'Unknown city' };
  const old = `${t.region} ${t.name}`;
  (t.history ||= []).push({ s: Lg.meta.season, region: t.region, name: t.name, abbr: t.abbr, logo: t.logo, c1: t.c1, c2: t.c2 });
  t.region = city[1];
  t.market = city[2];
  t.noTax = city[4];
  t.stadium = { ...(t.stadium || {}), cap: Math.round(62000 + rnd() * 10000), dome: rnd() < 0.5 };
  if (!keepBrand) applyBrand(t, { name: name || t.name, c1: c1 || t.c1, c2: c2 || t.c2, shape });
  else t.abbr = abbrFor(t.region, t.name);
  if (t.fin) { t.fin.fanHappy = clamp((t.fin.fanHappy ?? 60) + 15, 0, 100); t.fin.hype = 80; t.fin.stadiumAge = 0; } // new-city honeymoon
  news(`RELOCATION: The ${old} are moving to ${city[0]} and will play as the ${t.region} ${t.name}.`, { type: 'system', tids: [tid], big: true });
  return { ok: true };
}
export function applyBrand(t, { name, c1, c2, shape }) {
  t.name = name;
  if (c1) t.c1 = c1; if (c2) t.c2 = c2;
  t.abbr = abbrFor(t.region, t.name);
  t.logo = crest(t.region.split(' ').map((w) => w[0]).join('').slice(0, 2) || t.abbr, t.c1, t.c2, shape || 'shield');
  t.custom = true;
}
export function rebrandTeam(tid, opts) {
  const Lg = G.L;
  const t = Lg.teams[tid];
  const old = `${t.region} ${t.name}`;
  (t.history ||= []).push({ s: Lg.meta.season, region: t.region, name: t.name, abbr: t.abbr, logo: t.logo, c1: t.c1, c2: t.c2 });
  applyBrand(t, opts);
  news(`REBRAND: The ${old} are now the ${t.region} ${t.name}.`, { type: 'system', tids: [tid], big: true });
  return { ok: true };
}

// Each offseason: a struggling, small-market team in an old stadium might move. Rare: a few per century in the
// real NFL, so the odds are tiny and at most one move every 8 seasons.
export function cpuRelocationCheck() {
  const Lg = G.L;
  const s = Lg.meta.season;
  if ((Lg.lastRelocation ?? -99) > s - 8) return null;
  for (const t of Lg.teams) {
    if (Lg.meta.userTids.includes(t.tid)) continue;
    const fans = t.fin?.fanHappy ?? 60;
    const cash = t.fin?.cash ?? 0;
    const small = (t.market ?? 3) < 2.5;
    const old = (t.fin?.stadiumAge ?? 10) > 35;
    const score = (fans < 35 ? 1 : 0) + (cash < 0 ? 1 : 0) + (small ? 1 : 0) + (old ? 0.5 : 0);
    if (score < 2) continue;
    if (rnd() > 0.04 * (score - 1)) continue;
    const taken = new Set(Lg.teams.map((x) => x.region));
    const opts = CITIES.filter((c) => !taken.has(c[1]) && c[2] > (t.market ?? 2));
    if (!opts.length) continue;
    const city = pick(opts.slice(0, 8));
    const rebrand = rnd() < 0.35;
    const b = pick(BRANDS.filter((x) => !Lg.teams.some((y) => y.name === x[0])));
    relocateTeam(t.tid, city[0], rebrand && b ? { name: b[0], c1: b[1], c2: b[2], shape: b[3] } : { keepBrand: true });
    Lg.lastRelocation = s;
    return t.tid;
  }
  // very rarely, a team just freshens up its identity
  if (rnd() < 0.01) {
    const t = pick(Lg.teams.filter((x) => !Lg.meta.userTids.includes(x.tid) && (x.fin?.fanHappy ?? 60) < 40));
    const b = t && pick(BRANDS.filter((x) => !Lg.teams.some((y) => y.name === x[0])));
    if (t && b) { rebrandTeam(t.tid, { name: b[0], c1: b[1], c2: b[2], shape: b[3] }); return t.tid; }
  }
  return null;
}
