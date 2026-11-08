// Front-office dilemmas: personality-driven storylines that ask the GM to make a call.
import { G, rnd, pick, clamp, age, news } from './core.js';
import { roleSatisfaction } from './personality.js';

export function weeklyEvents() {
  const Lg = G.L;
  for (const tid of Lg.meta.userTids) {
    if (rnd() > 0.32) continue;
    const ps = Object.values(Lg.players).filter((p) => p.tid === tid && p.status !== 'PS');
    const st = Lg.standingsCache?.[tid];
    const gens = [];
    const star = ps.filter((p) => p.r.ovr >= 82 && p.contract && p.contract.exp <= Lg.meta.season + 1 && !p.contract.rookie5 && p.evtExt !== Lg.meta.season).sort((a, b) => b.r.ovr - a.r.ovr)[0];
    if (star) gens.push(() => ({ kind: 'extension', pid: star.pid, title: `${star.fn} ${star.ln} wants to talk extension`,
      text: `${star.fn} ${star.ln}'s agent says his client "wants to know where he stands" heading into a contract year.`,
      choices: [['talk', 'Open negotiations now'], ['later', 'Promise to talk after the season'], ['no', "Decline: we don't negotiate in-season"]] }));
    const unhappy = ps.filter((p) => (p.pers?.ego ?? 0) > 0.62 && roleSatisfaction(p) < 0.6 && p.r.ovr >= 70 && p.evtRole !== Lg.meta.season).sort((a, b) => b.r.ovr - a.r.ovr)[0];
    if (unhappy) gens.push(() => ({ kind: 'role', pid: unhappy.pid, title: `${unhappy.fn} ${unhappy.ln} unhappy with his role`,
      text: `${unhappy.fn} ${unhappy.ln} vented to reporters about his playing time after the game.`,
      choices: [['promise', 'Promise him a bigger role'], ['explain', 'Explain his role privately'], ['shop', 'Put him on the trade block']] }));
    if (st && st.streak <= -3) gens.push(() => {
      const hot = ps.filter((p) => (p.pers?.volat ?? 0) > 0.6).sort((a, b) => b.r.ovr - a.r.ovr)[0];
      return { kind: 'tension', pid: hot?.pid, title: 'Locker room tension after losing streak', text: `After ${-st.streak} straight losses, there are reports of finger-pointing in the locker room${hot ? `, with ${hot.fn} ${hot.ln} at the center` : ''}.`,
        choices: [['meeting', 'Let the veteran leaders hold a players-only meeting'], ['fine', 'Discipline the instigator'], ['ignore', 'Stay out of it']] };
    });
    const rook = ps.filter((p) => age(p) <= 23 && p.r.pot - p.r.tal > 6 && p.evtRook !== Lg.meta.season && (Lg.teams[tid].depth[p.pos] || []).indexOf(p.pid) > 0).sort((a, b) => b.r.pot - a.r.pot)[0];
    if (rook) gens.push(() => ({ kind: 'rookie', pid: rook.pid, title: `${rook.fn} ${rook.ln} turning heads in practice`, text: `Coaches rave about ${rook.fn} ${rook.ln}'s practice reps. Some want him on the field more.`,
      choices: [['reps', 'Give him more first-team reps'], ['vet', 'Stick with the veteran starter']] }));
    if (!gens.length) continue;
    const e = pick(gens)();
    if (Lg.events.some((x) => x.open && x.tid === tid && (x.kind === e.kind && (!e.pid || x.pid === e.pid)))) continue;
    const pp = e.pid ? Lg.players[e.pid] : null;
    if (pp) { if (e.kind === 'extension') pp.evtExt = Lg.meta.season; if (e.kind === 'role') pp.evtRole = Lg.meta.season; if (e.kind === 'rookie') pp.evtRook = Lg.meta.season; }
    e.id = `e${Lg.meta.season}${Lg.meta.week}${Math.floor(rnd() * 1e5)}`;
    e.tid = tid; e.s = Lg.meta.season; e.w = Lg.meta.week; e.open = true;
    Lg.events.unshift(e);
    if (Lg.events.length > 40) Lg.events.length = 40;
    news(e.title, { type: 'event', tids: [tid], pids: e.pid ? [e.pid] : [], user: true });
  }
}

export function resolveEvent(id, choice) {
  const Lg = G.L;
  const e = Lg.events.find((x) => x.id === id);
  if (!e || !e.open) return { error: 'Event not found' };
  const p = e.pid ? Lg.players[e.pid] : null;
  const pers = p?.pers || {};
  let out = '';
  const mor = (d) => { if (p) p.morale = clamp((p.morale ?? 60) + d, 0, 100); };
  switch (e.kind) {
    case 'extension':
      if (p) p.evtExt = Lg.meta.season;
      if (choice === 'talk') { mor(8); out = 'He appreciates the respect. Open his player page to make an offer.'; e.nav = `#/player/${e.pid}`; }
      else if (choice === 'later') { mor(pers.greed > 0.65 ? -4 : 3); out = pers.greed > 0.65 ? 'His camp is not thrilled about waiting.' : 'He is fine waiting until the offseason.'; p.promisedTalk = Lg.meta.season; }
      else { mor(-10 - pers.greed * 8); out = 'He is frustrated. Holdout risk has increased.'; }
      break;
    case 'role':
      if (p) p.evtRole = Lg.meta.season;
      if (choice === 'promise') { mor(10); p.rolePromise = { s: Lg.meta.season, w: Lg.meta.week }; out = 'He is fired up. Make sure he actually moves up the depth chart, or he will remember.'; }
      else if (choice === 'explain') { const d = pers.ego > 0.75 ? -6 : 4; mor(d); out = d > 0 ? 'He accepted his role.' : 'He did not take it well.'; }
      else { p.onBlock = true; mor(-6); out = 'He is now on your trade block; teams have been notified.'; }
      break;
    case 'tension': {
      const team = Object.values(Lg.players).filter((x) => x.tid === e.tid);
      const leaders = team.filter((x) => (x.pers?.lead ?? 0) > 0.72).length;
      if (choice === 'meeting') { const d = leaders >= 3 ? 6 : leaders >= 1 ? 2 : -2; team.forEach((x) => { x.morale = clamp((x.morale ?? 60) + d, 0, 100); }); out = leaders >= 2 ? 'The veterans rallied the room.' : 'The meeting did not accomplish much without strong leaders.'; }
      else if (choice === 'fine') { mor(-12); team.forEach((x) => { if (x !== p) x.morale = clamp((x.morale ?? 60) + 2, 0, 100); }); out = 'Message sent. The rest of the roster respected the accountability.'; }
      else { team.forEach((x) => { x.morale = clamp((x.morale ?? 60) - 2, 0, 100); }); out = 'The drama continues to simmer.'; }
      break;
    }
    case 'rookie':
      if (p) p.evtRook = Lg.meta.season;
      if (choice === 'reps') { p.r.tal = clamp(p.r.tal + 1.2, 25, 99); mor(6); const t = Lg.teams[e.tid]; t.depth[p.pos] = [p.pid, ...(t.depth[p.pos] || []).filter((x) => x !== p.pid)]; out = 'He moves to the top of the depth chart. Development boost applied.'; }
      else { mor(-3); out = 'He stays in a backup role for now.'; }
      break;
    default: break;
  }
  e.open = false; e.choice = choice; e.result = out;
  news(`${e.title}: ${out}`, { type: 'event', tids: [e.tid], user: true });
  return { ok: true, result: out, nav: e.nav };
}
