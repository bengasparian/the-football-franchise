// Annual League Meeting: competition-committee & team proposals, owners vote (24 of 32 needed).
import { G, rnd, gauss, clamp, shuffle, news } from './core.js';

export const PROPOSALS = [
  { id: 'ot15', title: 'Lengthen regular-season overtime to 15 minutes', desc: 'Reduces ties and stops the first team from bleeding the whole 10-minute period.', apply: (r) => { r.regOtMinutes = 15; }, revert: (r) => { r.regOtMinutes = 10; }, cond: (r) => r.regOtMinutes === 10, lean: -0.05 },
  { id: 'ot10', title: 'Return regular-season overtime to 10 minutes', desc: 'Player-safety proposal shortening OT.', apply: (r) => { r.regOtMinutes = 10; }, cond: (r) => r.regOtMinutes === 15, lean: 0 },
  { id: 'tush', title: 'Ban the "tush push" (pushing the QB on sneaks)', desc: 'Makes short-yardage QB sneaks harder to convert.', apply: (r) => { r.tushPush = false; }, cond: (r) => r.tushPush, lean: 0.05, oppose: ['PHI', 'BUF'] },
  { id: 'tushback', title: 'Reinstate the push play on QB sneaks', desc: 'Teams with elite lines want it back.', apply: (r) => { r.tushPush = true; }, cond: (r) => !r.tushPush, lean: -0.15 },
  { id: 'po16', title: 'Expand the playoffs to 16 teams (8 per conference)', desc: 'Removes the first-round bye. More home playoff games and TV inventory.', apply: (r) => { r.playoffTeamsPerConf = 8; }, cond: (r) => r.playoffTeamsPerConf === 7, lean: -0.08 },
  { id: 'po14', title: 'Return to a 14-team playoff field', desc: 'Restores the No. 1 seed bye.', apply: (r) => { r.playoffTeamsPerConf = 7; }, cond: (r) => r.playoffTeamsPerConf === 8, lean: 0 },
  { id: 'reseed', title: 'Seed playoff teams purely by record', desc: 'Division winners still qualify but no longer guaranteed a home game.', apply: (r) => { r.reseedDivisionWinners = true; }, cond: (r) => !r.reseedDivisionWinners, lean: -0.12 },
  { id: 'kick30', title: 'Move kickoff touchbacks back to the 30', desc: 'Encourages more kickoffs into the end zone.', apply: (r) => { r.kickoffTouchback = 30; }, cond: (r) => r.kickoffTouchback === 35, lean: -0.05 },
  { id: 'kick35', title: 'Kickoff touchbacks to the 35', desc: 'Encourages returns under the dynamic kickoff.', apply: (r) => { r.kickoffTouchback = 35; }, cond: (r) => r.kickoffTouchback !== 35, lean: 0.05 },
  { id: 'xp20', title: 'Move the extra point back to the 20 (38-yard try)', desc: 'Makes PATs harder and two-point tries more attractive.', apply: (r) => { r.xpDistance = 38; }, cond: (r) => r.xpDistance === 33, lean: -0.1 },
  { id: 'deadline10', title: 'Move the trade deadline to after Week 10', desc: 'More time for contenders and sellers to decide.', apply: (r) => { r.tradeDeadlineWeek = 10; }, cond: (r) => r.tradeDeadlineWeek === 9, lean: 0.05 },
  { id: 'ir10', title: 'Increase IR return designations from 8 to 10', desc: 'More flexibility to bring back injured players.', apply: (r) => { r.irReturns = 10; }, cond: (r) => r.irReturns === 8, lean: 0.1 },
  { id: 'ps18', title: 'Expand practice squads to 18 players', desc: 'More developmental spots.', apply: (r) => { r.psMax = 18; }, cond: (r) => r.psMax === 16, lean: 0.08 },
  { id: 'roster55', title: 'Expand the active roster to 55 players', desc: 'Requires NFLPA sign-off; increases depth.', apply: (r) => { r.activeMax = 55; }, cond: (r) => r.activeMax === 53, lean: -0.05 },
  { id: 'hipdrop', title: 'Strengthen enforcement of the hip-drop tackle ban', desc: 'Player-safety rule; slightly fewer lower-body injuries.', apply: (r) => { r.hipDropBan = true; }, cond: (r) => !r.hipDropBan, lean: 0.15 },
  { id: 'notag', title: 'Eliminate the franchise tag (CBA amendment)', desc: 'Players reach free agency without tags. Unpopular with owners.', apply: (r) => { r.franchiseTag = false; }, cond: (r) => r.franchiseTag, lean: -0.35 },
  { id: 'tag', title: 'Restore the franchise tag', desc: 'Owners want their tag back.', apply: (r) => { r.franchiseTag = true; }, cond: (r) => !r.franchiseTag, lean: 0.25 },
  { id: 'twoline', title: 'Move two-point tries to the 1.5-yard line', desc: 'Makes going for two more successful.', apply: (r) => { r.twoPtLine = 1.5; }, cond: (r) => r.twoPtLine === 2, lean: -0.1 },
  { id: 'rookie5', title: 'Shorten rookie contracts to three years', desc: 'Players reach second contracts sooner. Owners resist.', apply: (r) => { r.rookieYears = 3; }, cond: (r) => r.rookieYears === 4, lean: -0.3 },
  { id: 'g18', title: 'Expand to an 18-game regular season (2 preseason games)', desc: 'More revenue; requires players\' approval in a future CBA.', apply: (r) => { r.games = 18; r.weeks = 19; r.preseasonGames = 2; }, cond: (r) => r.games === 17, lean: -0.1 },
];

export function startLeagueMeeting() {
  const Lg = G.L;
  const pool = shuffle(PROPOSALS.filter((p) => p.cond(Lg.rules)));
  const chosen = pool.slice(0, 4).map((p) => ({ id: p.id, title: p.title, desc: p.desc, votes: null, userVotes: {}, by: 'Competition Committee' }));
  Lg.proposals = { s: Lg.meta.season, items: chosen, done: false, custom: false };
  return Lg.proposals;
}
export function userPropose(tid, id) {
  const Lg = G.L;
  const P = PROPOSALS.find((x) => x.id === id);
  if (!P || !P.cond(Lg.rules)) return { error: 'That proposal is not available.' };
  if (Lg.proposals.items.some((x) => x.id === id)) return { error: 'Already on the ballot.' };
  if (Lg.proposals.items.filter((x) => x.byTid === tid).length >= 1) return { error: 'Each club may submit one proposal per meeting.' };
  Lg.proposals.items.push({ id, title: P.title, desc: P.desc, votes: null, userVotes: {}, by: `${Lg.teams[tid].region} ${Lg.teams[tid].name}`, byTid: tid });
  return { ok: true };
}
export function castVote(tid, id, yes) {
  const it = G.L.proposals?.items.find((x) => x.id === id);
  if (!it) return { error: 'No such proposal' };
  it.userVotes[tid] = !!yes;
  return { ok: true };
}
export function tallyVotes() {
  const Lg = G.L;
  const pr = Lg.proposals;
  if (!pr || pr.done) return pr;
  for (const it of pr.items) {
    const P = PROPOSALS.find((x) => x.id === it.id);
    let yes = 0;
    const detail = [];
    for (const t of Lg.teams) {
      let v;
      if (it.userVotes[t.tid] != null) v = it.userVotes[t.tid];
      else {
        let p = 0.55 + (P.lean || 0) + gauss(0, 0.22) + (it.byTid === t.tid ? 0.5 : 0);
        if (P.oppose?.includes(t.abbr)) p -= 0.6;
        v = p > 0.5;
      }
      if (v) yes++;
      detail.push({ tid: t.tid, yes: v });
    }
    it.votes = { yes, no: 32 - yes, detail };
    it.passed = yes >= 24;
    if (it.passed) { P.apply(Lg.rules); news(`Owners approve: ${it.title} (${yes}-${32 - yes}).`, { type: 'rules', big: true }); }
    else news(`Proposal fails: ${it.title} (${yes}-${32 - yes}; 24 votes needed).`, { type: 'rules' });
  }
  pr.done = true;
  (Lg.ruleHistory ||= []).push({ s: pr.s, items: pr.items.map((x) => ({ id: x.id, title: x.title, passed: x.passed, yes: x.votes.yes })) });
  return pr;
}
void rnd; void clamp;
