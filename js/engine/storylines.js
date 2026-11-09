// Storylines: season-long stories about the people on your team. They don't change how the game works; they give
// you things to root for. Each story has a goal, chapters that unlock as things happen in your games, and an
// ending. Hitting a goal gives a small lift: the players involved get happier and the team carries a little
// "momentum" into its next game. Missing one just ends the story.
import { G, age, pick, rnd, shuffle, news } from './core.js';
import { STARTERS } from './const.js';
// on the field every week: in the starting lineup at his position
const starter = (p) => { const i = (G.L.teams[p.tid]?.depth[p.pos] || []).indexOf(p.pid); return i >= 0 && i < (STARTERS[p.pos] || 1); };

const NAME = (p) => `${p.fn} ${p.ln}`;
const season = () => G.L.meta.season;
// regular season + playoffs, this season, for one stat
function stat(p, k) {
  const s = p.stats?.[season()];
  return (s?.REG?.[k] || 0) + (s?.POST?.[k] || 0);
}
const gp = (p) => { const s = p.stats?.[season()]; return (s?.REG?.g || 0) + (s?.POST?.g || 0); };
const teamRec = (tid) => { const st = G.L.standingsCache?.[tid]; return st ? { w: st.w, l: st.l } : { w: 0, l: 0 }; };
const fmt = (k, v) => (k === 'sck' ? (Math.round(v * 2) / 2).toString() : Math.round(v).toLocaleString());
// a player's headline stat for his position, with a season goal for each kind of story
const STAT = {
  QB: { k: 'pyd', l: 'passing yards', rookie: 2800, big: 4000, record: 4700 },
  RB: { k: 'ryd', l: 'rushing yards', rookie: 750, big: 1100, record: 1600 },
  WR: { k: 'recyd', l: 'receiving yards', rookie: 700, big: 1100, record: 1500 },
  TE: { k: 'recyd', l: 'receiving yards', rookie: 450, big: 800, record: 1150 },
  EDGE: { k: 'sck', l: 'sacks', rookie: 5, big: 10, record: 16 },
  DT: { k: 'sck', l: 'sacks', rookie: 3, big: 7, record: 12 },
  LB: { k: 'tkl', l: 'tackles', rookie: 70, big: 110, record: 150 },
  CB: { k: 'pd', l: 'passes defended', rookie: 7, big: 13, record: 20 },
  S: { k: 'tkl', l: 'tackles', rookie: 55, big: 85, record: 120 },
};
// fraction of the season still to play, so a story that starts mid-season asks for a fair amount
function remainingFrac() {
  const Lg = G.L;
  if (Lg.meta.phase !== 'REGULAR_SEASON') return 1;
  return Math.max(0.25, (18 - Lg.meta.week + 1) / 18);
}
function goalFor(p, kind) {
  const S = STAT[p.pos];
  if (!S) return null;
  const have = stat(p, S.k);
  const full = S[kind];
  // starting mid-season: what he has so far plus a fair share of the rest
  const target = G.L.meta.phase === 'REGULAR_SEASON' && gp(p) > 0 ? Math.round(have + (full * remainingFrac()) * 0.95) : full;
  return { k: S.k, l: S.l, target: S.k === 'sck' ? Math.max(1, Math.round(target * 2) / 2) : Math.max(1, Math.round(target)) };
}

// ------------------------------------------------------------------ story types
const TYPES = {
  rookie: {
    icon: '🌱', title: (p) => `Rookie Rising: ${NAME(p)}`,
    find: (tid, used) => Object.values(G.L.players).filter((p) => p.tid === tid && p.status === 'ACT' && !used.has(p.pid) && STAT[p.pos] && p.draft?.y === season() && p.r.ovr >= 62 && (starter(p) || p.r.ovr >= 72)).sort((a, b) => b.r.ovr - a.r.ovr)[0],
    make: (p) => { const g = goalFor(p, 'rookie'); return { goal: { ...g, by: 'season' }, intro: pick([`${NAME(p)} arrives with something to prove. The coaches think he can be a real contributor as a rookie.`, `Drafted to be part of the future, ${NAME(p)} wants to make his mark right away.`, `The rookie ${p.pos} ${NAME(p)} has turned heads in practice. Can he do it on Sundays?`]) }; },
    beats: [[0.25, (p) => `${NAME(p)} is settling in. The game is starting to slow down for him.`], [0.5, (p) => `Halfway there: ${NAME(p)} is one of the most talked-about rookies in the league.`], [0.8, (p) => `${NAME(p)} is closing in on a standout rookie season.`]],
    win: (p, g) => `${NAME(p)} hits ${fmt(g.k, g.target)} ${g.l}. Whatever happens next, his rookie year was a success.`,
    lose: (p, g, v) => `${NAME(p)} finishes his rookie year with ${fmt(g.k, v)} ${g.l}. A learning year, and the coaches still believe.`,
  },
  contract: {
    icon: '💼', title: (p) => `Contract Year: ${NAME(p)}`,
    find: (tid, used) => Object.values(G.L.players).filter((p) => p.tid === tid && p.status === 'ACT' && !used.has(p.pid) && STAT[p.pos] && p.contract?.exp === season() && p.r.ovr >= 74 && age(p) <= 31 && starter(p)).sort((a, b) => b.r.ovr - a.r.ovr)[0],
    make: (p) => { const g = goalFor(p, 'big'); return { goal: { ...g, by: 'season' }, intro: pick([`It's a contract year for ${NAME(p)}. A big season means a big payday, and he says he wants it to be here.`, `${NAME(p)} is playing for his next deal. Every snap this season is an audition.`]) }; },
    beats: [[0.5, (p) => `${NAME(p)} is putting together a strong case for a new contract.`], [0.8, (p) => `${NAME(p)}'s agent is getting calls. One more push.`]],
    win: (p, g) => `${NAME(p)} reaches ${fmt(g.k, g.target)} ${g.l}. He's earned his payday, and he'd love to stay.`,
    lose: (p, g, v) => `${NAME(p)} ends his contract year with ${fmt(g.k, v)} ${g.l}. His next deal will be a prove-it contract.`,
  },
  comeback: {
    icon: '💪', title: (p) => `The Comeback: ${NAME(p)}`,
    find: (tid, used) => Object.values(G.L.players).filter((p) => p.tid === tid && !used.has(p.pid) && p.r.ovr >= 74 && (starter(p) || p.r.ovr >= 80) && ((p.inj && p.inj.wk >= 3 && !p.inj.se) || (p.injHist || []).some((h) => h.s === season() - 1 && (h.wk >= 6 || h.se)))).sort((a, b) => b.r.ovr - a.r.ovr)[0],
    make: (p) => ({ goal: { k: 'g', l: 'games played', target: Math.min(6, Math.max(3, Math.round(6 * remainingFrac()))), base: gp(p), by: 'season' }, intro: pick([`After a long road back, ${NAME(p)} is working to get back on the field and back to his old self.`, `${NAME(p)} has spent months rehabbing. The whole locker room is pulling for him.`]) }),
    beats: [[0.01, (p) => `${NAME(p)} is back on the field! The crowd gave him a standing ovation.`], [0.5, (p) => `${NAME(p)} looks more like himself every week.`]],
    win: (p) => `${NAME(p)} has made it all the way back. A true comeback story.`,
    lose: (p) => `${NAME(p)}'s comeback will have to wait until next season.`,
  },
  record: {
    icon: '📈', title: (p) => `Chasing History: ${NAME(p)}`,
    find: (tid, used) => {
      const c = Object.values(G.L.players).filter((p) => p.tid === tid && p.status === 'ACT' && !used.has(p.pid) && STAT[p.pos] && p.r.ovr >= 82 && ['QB', 'RB', 'WR', 'EDGE'].includes(p.pos));
      return c.sort((a, b) => b.r.ovr - a.r.ovr)[0];
    },
    make: (p) => { const g = goalFor(p, 'record'); return { goal: { ...g, by: 'season' }, intro: `${NAME(p)} is one of the best in the game. This could be the year he puts up ${fmt(g.k, g.target)} ${g.l}, a season people talk about for years.` }; },
    beats: [[0.5, (p, g) => `${NAME(p)} is on pace for a historic season. Every broadcast is tracking his ${g.l}.`], [0.75, (p) => `${NAME(p)} is in rare air now. The record chase is on.`], [0.9, (p) => `${NAME(p)} is right on the doorstep of history.`]],
    win: (p, g) => `History! ${NAME(p)} reaches ${fmt(g.k, g.target)} ${g.l}, one of the great seasons of his era.`,
    lose: (p, g, v) => `${NAME(p)} finishes with ${fmt(g.k, v)} ${g.l}. Not history this time, but a heck of a season.`,
  },
  lastdance: {
    icon: '🕰️', title: (p) => `The Last Dance: ${NAME(p)}`,
    find: (tid, used) => Object.values(G.L.players).filter((p) => p.tid === tid && p.status === 'ACT' && !used.has(p.pid) && age(p) >= 33 && p.r.ovr >= 78).sort((a, b) => b.r.ovr - a.r.ovr)[0],
    make: (p) => ({ goal: { k: 'playoffs', l: 'make the playoffs', target: 1, by: 'playoffs' }, intro: `${NAME(p)} is ${age(p)} and nobody knows how many runs he has left. The team wants to send him into the playoffs one more time.` }),
    beats: [],
    win: (p) => `They did it for ${NAME(p)}: the ${G.L.teams[p.tid]?.name} are in the playoffs. One more ride for the veteran.`,
    lose: (p) => `No playoffs this year. ${NAME(p)} says he isn't ready to call it a career yet.`,
  },
};
const TEAM_TYPES = {
  rivalry: {
    icon: '⚔️',
    make: (tid) => {
      const Lg = G.L;
      const t = Lg.teams[tid];
      const s = season();
      const rivals = Lg.teams.filter((x) => x.tid !== tid && x.conf === t.conf && x.div === t.div);
      const games = (r) => Lg.games.filter((g) => g.s === s && g.type === 'REG' && !g.played && ((g.h === tid && g.a === r.tid) || (g.a === tid && g.h === r.tid)));
      const r = rivals.filter((x) => games(x).length >= 1).sort((a, b) => (b.expectWins ?? 8) - (a.expectWins ?? 8))[0];
      if (!r) return null;
      const n = games(r).length;
      return { opp: r.tid, title: `Rivalry: ${t.name} vs ${r.name}`, goal: { k: 'rival', l: `wins over the ${r.name}`, target: n, by: 'season' }, intro: `The ${r.region} ${r.name} are the team everyone in the building wants to beat. ${n === 2 ? 'Sweep them' : 'Beat them'} this season.` };
    },
  },
  doubters: {
    icon: '📣',
    make: (tid) => {
      const t = G.L.teams[tid];
      const ew = t.expectWins ?? 8.5;
      if (ew <= 7.5) return { title: `Prove the Doubters Wrong`, goal: { k: 'wins', l: 'wins', target: 9, by: 'season' }, intro: `The experts picked the ${t.name} to win about ${Math.round(ew)} games. The locker room has that number taped up. Get to 9 wins.` };
      if (ew >= 11) return { title: `Super Bowl or Bust`, goal: { k: 'divwin', l: 'win the division', target: 1, by: 'playoffs' }, intro: `Expectations are sky-high for the ${t.name}. Anything less than a division title will feel like a failure.` };
      return { title: `Back to the Playoffs`, goal: { k: 'playoffs', l: 'make the playoffs', target: 1, by: 'playoffs' }, intro: `The ${t.name} are in the mix. The message all offseason: get back to January football.` };
    },
  },
};

// ------------------------------------------------------------------ create
function chapter(st, text, good = true) {
  const Lg = G.L;
  st.chapters.push({ s: Lg.meta.season, w: Lg.meta.week, ph: Lg.meta.phase, text, good });
  news(`${st.icon} ${st.title}: ${text}`, { type: 'story', tids: [st.tid], pids: st.pid ? [st.pid] : [], user: true });
}
export function generateStories(tid) {
  const Lg = G.L;
  Lg.stories ||= [];
  if (!['PRESEASON', 'REGULAR_SEASON'].includes(Lg.meta.phase)) return; // stories are written for a season about to be played
  const s = season();
  if (Lg.stories.some((x) => x.tid === tid && x.s === s && x.type !== 'revenge')) return;
  const used = new Set();
  const made = [];
  for (const type of shuffle(['record', 'rookie', 'contract', 'comeback', 'lastdance'])) {
    if (made.length >= 3) break;
    const T = TYPES[type];
    const p = T.find(tid, used);
    if (!p) continue;
    const m = T.make(p);
    if (!m.goal) continue;
    used.add(p.pid);
    made.push({ type, pid: p.pid, title: T.title(p), icon: T.icon, ...m });
  }
  for (const type of ['doubters', 'rivalry']) { const m = TEAM_TYPES[type].make(tid); if (m) made.push({ type, icon: TEAM_TYPES[type].icon, ...m }); }
  for (const m of made) {
    const st = { id: `st${s}-${tid}-${m.type}-${Math.floor(rnd() * 1e6)}`, tid, s, type: m.type, pid: m.pid || null, opp: m.opp ?? null, title: m.title, icon: m.icon, goal: m.goal, status: 'active', beat: 0, chapters: [] };
    Lg.stories.push(st);
    chapter(st, m.intro);
  }
}
// revenge game: a player facing a team he used to play for, this week
function revengeStories(tid) {
  const Lg = G.L;
  const m = Lg.meta;
  const g = Lg.games.find((x) => x.s === m.season && !x.played && x.type === 'REG' && x.w === m.week && (x.h === tid || x.a === tid));
  if (!g) return;
  const opp = g.h === tid ? g.a : g.h;
  const oppAbbr = Lg.teams[opp].abbr;
  if (Lg.stories.filter((x) => x.type === 'revenge' && x.tid === tid && x.s === m.season).length >= 2) return; // a couple a season
  const cands = Object.values(Lg.players).filter((p) => p.tid === tid && p.status === 'ACT' && p.r.ovr >= 76 && STAT[p.pos] && !(p.inj && p.inj.wk > 0)).sort((a, b) => b.r.ovr - a.r.ovr);
  for (const p of cands) {
    // his team last season, or the team that drafted him in the last few years
    const last = p.stats?.[m.season - 1]?.tm;
    const former = (last != null && last === opp) || (p.draft?.tm === oppAbbr && m.season - (p.draft?.y || 0) <= 4 && last !== tid);
    if (!former || Lg.stories.some((x) => x.type === 'revenge' && x.pid === p.pid && x.s === m.season)) continue;
    const S = STAT[p.pos];
    const need = { pyd: 250, ryd: 90, recyd: 85, sck: 1, tkl: 7, pd: 2 }[S.k];
    const st = { id: `rv${m.season}-${m.week}-${p.pid}`, tid, s: m.season, w: m.week, type: 'revenge', pid: p.pid, opp, gid: g.gid, title: `Revenge Game: ${NAME(p)}`, icon: '🔥', goal: { k: S.k, l: S.l, target: need, base: stat(p, S.k), by: 'game' }, status: 'active', beat: 0, chapters: [] };
    Lg.stories.push(st);
    chapter(st, `${NAME(p)} faces the ${Lg.teams[opp].name}, his old team, this week. He hasn't forgotten how it ended. Goal: a win and ${fmt(S.k, need)}+ ${S.l}.`);
    return; // one a week is plenty
  }
}

// ------------------------------------------------------------------ progress
function progress(st) {
  const Lg = G.L;
  const p = st.pid ? Lg.players[st.pid] : null;
  const g = st.goal;
  if (st.final != null && st.status !== 'active') return st.final;
  if (g.by === 'game') { const game = Lg.games.find((x) => x.gid === st.gid); return game?.played ? (game.box?.pl?.[st.pid]?.[g.k] || 0) : 0; }
  if (g.k === 'g') return p ? gp(p) - (g.base || 0) : 0;
  if (g.k === 'wins') return teamRec(st.tid).w;
  if (g.k === 'rival') return Lg.games.filter((x) => x.s === st.s && x.type === 'REG' && x.played && ((x.h === st.tid && x.a === st.opp && x.hs > x.as) || (x.a === st.tid && x.h === st.opp && x.as > x.hs))).length;
  if (g.k === 'playoffs') return Lg.playoffs?.s === st.s && [...(Lg.playoffs.seeds?.AFC || []), ...(Lg.playoffs.seeds?.NFC || [])].includes(st.tid) ? 1 : 0;
  if (g.k === 'divwin') return Lg.playoffs?.s === st.s && ['AFC', 'NFC'].some((c) => (Lg.playoffs.seeds?.[c] || []).slice(0, 4).includes(st.tid)) ? 1 : 0;
  if (!p) return 0;
  return stat(p, g.k) - (g.base || 0);
}
function finish(st, won) {
  const Lg = G.L;
  const p = st.pid ? Lg.players[st.pid] : null;
  const v = progress(st);
  st.final = v;
  st.status = won ? 'done' : 'failed';
  const T = TYPES[st.type];
  let text;
  if (st.type === 'revenge') text = won ? `${NAME(p)} got his revenge: a win and ${fmt(st.goal.k, v)} ${st.goal.l} against his old team.` : `Not the homecoming ${p ? NAME(p) : 'he'} wanted against his old team.`;
  else if (T && p) text = won ? T.win(p, st.goal) : T.lose(p, st.goal, v);
  else text = won ? ({ wins: `Nine wins and counting. Nobody is doubting the ${Lg.teams[st.tid].name} now.`, rival: `Mission accomplished against the ${Lg.teams[st.opp]?.name}. Bragging rights belong to the ${Lg.teams[st.tid].name}.`, playoffs: `Playoff football is back for the ${Lg.teams[st.tid].name}!`, divwin: `Division champions! The ${Lg.teams[st.tid].name} delivered.` }[st.goal.k] || 'Goal reached!')
    : ({ wins: `The ${Lg.teams[st.tid].name} fell short of 9 wins. The doubters get this one.`, rival: `The ${Lg.teams[st.opp]?.name} got the better of it this year. There's always next season.`, playoffs: `No playoffs this year. Back to work.`, divwin: `No division title. A disappointing finish for a team with big expectations.` }[st.goal.k] || 'The story ends here for this season.');
  chapter(st, text, won);
  if (won) reward(st);
}
// a small lift for hitting a goal: the players involved get happier, and the team carries momentum into its next game
function reward(st) {
  const Lg = G.L;
  if (st.pid && Lg.players[st.pid]) Lg.players[st.pid].morale = Math.min(100, (Lg.players[st.pid].morale ?? 65) + 8);
  for (const p of Object.values(Lg.players)) if (p.tid === st.tid && p.status === 'ACT') p.morale = Math.min(100, (p.morale ?? 65) + 1.5);
  addMomentum(st.tid, 1);
}
function addMomentum(tid, b) {
  const Lg = G.L;
  Lg.momentum ||= {};
  Lg.momentum[tid] = Math.min(1.6, (Lg.momentum[tid] || 0) + b);
}
// used by the game engine: momentum from storylines, spent on the team's next game
export function takeMomentum(tid) {
  const Lg = G.L;
  const b = Lg.momentum?.[tid] || 0;
  if (b) delete Lg.momentum[tid];
  return b;
}
// before the week's games: revenge games for user teams
export function storiesBeforeWeek() {
  const Lg = G.L;
  if (Lg.meta.phase !== 'REGULAR_SEASON') return;
  Lg.stories ||= [];
  for (const tid of Lg.meta.userTids) revengeStories(tid);
}
// after each week's games: new chapters, finished stories
export function storiesAfterWeek() {
  const Lg = G.L;
  if (!Lg.stories) return;
  const s = season();
  for (const st of Lg.stories) {
    if (st.status !== 'active' || st.s !== s) continue;
    const v = progress(st);
    const g = st.goal;
    if (g.by === 'game') { const game = Lg.games.find((x) => x.gid === st.gid); if (game?.played) { const won = (game.h === st.tid) === (game.hs > game.as) && game.hs !== game.as; finish(st, won && v >= g.target); } continue; }
    if (v >= g.target) { finish(st, true); continue; }
    const T = TYPES[st.type];
    const beats = T?.beats || [];
    const p = st.pid ? Lg.players[st.pid] : null;
    while (st.beat < beats.length && v / g.target >= beats[st.beat][0]) {
      if (p) { chapter(st, beats[st.beat][1](p, g)); addMomentum(st.tid, 0.4); }
      st.beat++;
    }
    // team stories get chapters on streaks and on each rivalry game
    if (st.type === 'rivalry') {
      const played = Lg.games.filter((x) => x.s === s && x.type === 'REG' && x.played && ((x.h === st.tid && x.a === st.opp) || (x.a === st.tid && x.h === st.opp)));
      if (played.length > st.beat) {
        st.beat = played.length;
        const last = played[played.length - 1];
        const won = (last.h === st.tid) === (last.hs > last.as);
        chapter(st, won ? `A big win over the ${Lg.teams[st.opp].name}, ${Math.max(last.hs, last.as)}-${Math.min(last.hs, last.as)}.${st.goal.target === 2 && v === 1 ? ' One more to complete the sweep.' : ''}` : `The ${Lg.teams[st.opp].name} took this one, ${Math.max(last.hs, last.as)}-${Math.min(last.hs, last.as)}.${st.goal.target === 2 ? ' The sweep is off.' : ''}`, won);
        if (won) addMomentum(st.tid, 0.4);
        if (!won && st.goal.target === 2) finish(st, false);
      }
    }
  }
}
// when the regular season ends (and again after the playoffs), close out what's left
export function storiesSeasonEnd(stage) {
  const Lg = G.L;
  if (!Lg.stories) return;
  for (const st of Lg.stories) {
    if (st.status !== 'active' || st.s !== season()) continue;
    if (stage === 'regular' && st.goal.by === 'playoffs') { finish(st, progress(st) >= st.goal.target); continue; }
    if (stage === 'regular' && st.goal.by === 'season') { if (progress(st) >= st.goal.target) finish(st, true); else if (!['rookie', 'contract', 'record'].includes(st.type)) finish(st, false); continue; }
    if (stage === 'final') finish(st, progress(st) >= st.goal.target);
  }
}
// for the UI
export function storiesFor(tid, s = season()) {
  const Lg = G.L;
  return (Lg.stories || []).filter((x) => x.tid === tid && x.s === s).map((st) => {
    const p = st.pid ? Lg.players[st.pid] : null;
    const v = progress(st);
    return { ...st, value: v, valueTxt: fmt(st.goal.k, Math.max(0, v)), targetTxt: fmt(st.goal.k, st.goal.target), pct: Math.max(0, Math.min(100, Math.round((100 * v) / (st.goal.target || 1)))), player: p ? { pid: p.pid, name: NAME(p), pos: p.pos, hs: p.hs } : null, oppAbbr: st.opp != null ? Lg.teams[st.opp]?.abbr : null };
  });
}
