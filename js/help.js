// In-app help text for every screen + guided tour for new leagues.
import { $, esc } from './ui.js';

export const HELP = {
  home: ['Franchise Hub', `Your home base. The big tile shows your next game; <b>Advance</b> (top right) plays the week or moves to the next phase of the NFL calendar.
    Tiles jump to every part of the front office. "Needs your attention" shows dilemmas from players (contract talks, unhappy players, rookies pushing for snaps) and trade offers from AI teams. Your choices affect morale and chemistry.`],
  roster: ['Roster', `Everyone under contract with the team, by status: <b>Active</b> (max 53), <b>Practice Squad</b> (16 + 1 international), and <b>Injured Reserve</b>.
    OVR is the current rating. It changes with on-field production during the season and with age, work ethic and coaching in the offseason. The small +/- shows movement since the start of the season.
    Actions: <b>PS</b> moves a player to the practice squad, <b>IR</b> places an injured player (4+ weeks) on injured reserve, <b>Release</b> cuts him (you see the dead money first). Click a name for his full player card.`],
  depth: ['Depth Chart', 'The full depth chart, position by position. Left Tackle and Right Tackle are separate positions (likewise Left/Right Guard, Left/Right End and Free/Strong Safety), each with its own starter; the backups behind them are shared, like a swing tackle. Pick a position at the top, then use the arrows to reorder players, ✕ to remove one, and Add to bring in anyone from the roster. Injured or holding-out players are skipped automatically on game day. Choose whether your staff adjusts the lineup for injuries or you do it yourself.'],
  lineup: ['Adjust Lineup', 'Five tabs. <b>Offense / Defense / Special Teams</b>: your lineup on the field. Click any spot, then pick who plays there; the list on the right shows the full depth at that position. <b>Packages & Roles</b>: situational jobs that don\'t have to follow the depth chart: slot receiver, third-down back, short-yardage back, red zone target, Mike / Will / Sam linebackers, nickel and dime DBs, and a pass-rush specialist. Leave a role on Auto and your staff picks the best fit each week. <b>Schemes</b>: pick your offensive and defensive system (like Madden playbooks). Schemes change run/pass mix, how deep you throw, who gets targets, how often you play nickel, blitz rate and coverage style. Players who fit your scheme play a little better, and a coordinator calling his own system gets a play-calling boost. <b>Injuries</b>: pick whether your staff moves the next man up when a starter is hurt, or you do it yourself (simming several weeks at once is always handled for you). When a player is healthy again he goes straight back to his old spot and roles.'],
  schedule: ['Schedule', 'Left: your season, including preseason games and your bye week. Right: every game in the league for the week you pick (P1-P3 are preseason). Click any game for the full box score.'],
  recap: ['Weekly Recap', 'Every game from the week (or playoff round): final scores, upsets (an underdog by 2+ projected wins beating the favorite) and each game\'s standout performances. Your game is always first. During the playoffs the bracket shows every matchup, seed and result. Pick any week or round from the menu, and click a game for the full box score.'],
  awards: ['Awards Race', 'Who is leading each major award right now. Voters weigh production and team success; the MVP is usually a quarterback unless a running back or receiver has a historic season. The bar shows each candidate\'s score as a share of the leader\'s.'],
  franchise: ['Relocate & Rebrand', 'In the offseason you can move your franchise to a new city or give it a new identity: name, colors and a crest. Market size changes your revenue; no-income-tax states help in free agency. CPU teams only relocate when it truly makes sense (small market, unhappy fans, losing money), which is rare.'],
  cap: ['Salary Cap', `The 2026 cap is <b>$301.2M</b> and grows every year. Cap hit = base salary + prorated signing bonus. <b>Dead money</b> is bonus money that accelerates onto your cap when you cut or trade a player.
    The "Cut: dead / save" column shows what releasing each player would cost and save. During the offseason only your top 51 cap hits count (the real "Rule of 51").`],
  staff: ['Coaching Staff', 'Your head coach, offensive coordinator and defensive coordinator. Their offense/defense ratings affect game results, <b>Player development</b> speeds up young players\' progression, and game management/aggression shapes 4th-down and clock decisions. Fire and hire from the pool of available coaches.'],
  owner: ['Owner & Finances', 'Your owner sets goals every season. Meeting them raises <b>job security</b>; missing them lowers it. Hit zero and you are fired. Ticket and concession prices change revenue, attendance and fan happiness.'],
  trade: ['Trade Center', `Pick a team, then check players and draft picks on both sides. The <b>interest meter</b> shows how the other GM values the deal. Contenders want proven veterans; rebuilders want youth and picks.
    <b>What would it take?</b> asks them to name a price for the players you selected from their side. Trades must keep both teams under the cap. Bonus money stays behind as dead money for the team trading the player away. Trades close after the deadline (Week ${'9'}).`],
  finder: ['Trade Finder', 'Select players and/or draft picks you want to move, and what you want back: the best offer, draft picks only, or a position. Every interested AI team answers with a real offer. Shopping only picks gets you two kinds of answers: a player, or a trade-down (more picks that come later). Accept or edit any offer in the Trade Center.'],
  offers: ['Trade Offers', 'Offers AI teams (or your online friends) have sent you. AI teams call more often near the trade deadline and when you have players on the trade block.'],
  fa: ['Free Agency', `Free agency lasts <b>5 days</b>. Each day starts with a <b>10-minute negotiating window</b> (real time): everyone can make offers, but nobody signs. After that, players start choosing teams live. <b>Sim to Next Day</b> plays out the rest of the day instantly. Your offer sits next to everyone else's; raise it if you get outbid. Unsigned players. In the offseason <b>frenzy</b>, teams bid over several days. Players weigh money, guarantees, how good your team is, the role they'd have, state income taxes, the coaching staff, and loyalty to their old team, each according to their personality.
    Make an offer, then advance days to hear decisions. During the season, signings are immediate if the player likes the offer.`],
  draft: ['Draft & Scouting', `<b>Live draft:</b> every team gets 2 minutes per pick. You can <b>Sim Pick</b>, <b>Sim Round</b> or <b>Sim to My Pick</b>. If your clock runs out, your scouts take the best player on their board. Draft-day trades happen when a team wants to move up or down. Prospects played at least three college seasons; check their college stats. Some will bust and some late picks will become stars. A generational prospect comes along about once every 15 years. Prospects are generated each year with combine results. Your scouts see a <b>grade range</b>; spend scouting points (they refill weekly in season) to narrow it and reveal potential and personality.
    Star prospects to build your own board. When the draft is live, use "Sim to my pick" and draft when you're on the clock.`],
  fantasy: ['Fantasy Draft', 'Every player in the league is up for grabs in a 53-round snake draft (the order reverses every round). You choose your slot when you create the league, or get a random one. Contracts stay with the players, so watch your cap. Draft when you are on the clock, or auto-pick: auto and simmed picks follow your needs and keep offense and defense balanced. The Draft board tab shows every pick by team and round, like Madden.'],
  standings: ['Standings & Playoffs', 'Division standings using official NFL tiebreakers, the current playoff picture (7 teams per conference; the No. 1 seed gets a bye), power rankings, and the bracket once the playoffs begin.'],
  stats: ['Stats & Leaders', 'League leaders, full sortable player stats by category (click a column header to sort), and team stats. Seasons that started from real life include the real 2026 stats.'],
  teams: ['Teams', 'All 32 teams. Click a team to view their roster, best players, schedule and cap. You can trade with them from there.'],
  team: ['Team', 'Another team\'s overview. You can view, but only manage the team(s) you control.'],
  news: ['News & Transactions', 'Every headline, signing, release, trade, injury and award across the league.'],
  rules: ['Annual League Meeting', 'Each offseason the Competition Committee proposes rule changes and the 32 owners vote. A rule needs <b>24 votes</b> to pass. You can vote and submit one proposal of your own. Passed rules change the sim (overtime length, playoff format, kickoff touchbacks, tush push, roster sizes, and more).'],
  history: ['NFL History', 'Every Super Bowl since 1966 and every MVP, Offensive and Defensive Player of the Year, and Rookie of the Year, followed by everything that happens in your league: awards, All-Pros, the Hall of Fame and trades.'],
  settings: ['Settings & Sliders', 'Sliders tune the simulation, from injuries and progression to trade AI and scoring. 100% is the realistic default. Auto-manage options let the coaching staff handle depth charts, IR moves and roster holes for you.'],
  online: ['Play Online', 'Host a room and share the 5-letter code. Friends open the site, choose Join, and pick an open team. Everyone manages their own team. When you\'re done with your moves, press <b>Ready to Advance</b> in the top bar; once every GM is ready (the counter shows 2/3, 3/3…), the league advances automatically. The host can also advance right away without waiting.'],
  player: ['Player Card', 'Ratings (key attributes for his position are highlighted), stats and game logs, contract year by year, personality and morale, and history. Contract actions such as extend, re-sign, tag, fifth-year option, restructure and release appear above the tabs when they are available. The league creator also gets an Edit player button (commissioner tools): name, position, jersey number, age, overall, potential, dev trait, longevity, morale, personality, every attribute and the contract. Friends in an online league cannot edit players.'],
  start: ['New League', 'Choose where to start and pick your team. You can control more than one team for local multiplayer, or host online after creating the league.'],
};

export function showHelp(route) {
  const h = HELP[route] || HELP.home;
  return h;
}

// ---------------------------------------------------------------- guided tour
const STEPS = [
  { sel: null, title: 'Welcome, GM', text: 'You run every part of the front office: roster, contracts, trades, free agency, the draft, coaches and the owner\'s expectations. This quick tour shows you around. You can replay it from Office → Tutorial.' },
  { sel: '#advanceBtn', title: 'Advance', text: 'This button moves the league forward: it plays the next week, or moves to the next phase (playoffs, re-signing, free agency, league meeting, draft, camp). The dropdown next to it can sim several weeks at once.' },
  { sel: '[data-sec=home]', title: 'Franchise Hub', text: 'Your home screen: next game, team overview, items that need your attention, and shortcut tiles to everything.' },
  { sel: '[data-sec=team]', title: 'My Team', text: 'Roster, depth chart, schedule, salary cap, coaching staff, and the owner and finances.' },
  { sel: '[data-sec=moves]', title: 'Transactions', text: 'Trade Center, Trade Finder, trade offers, free agency, and the draft and scouting.' },
  { sel: '[data-sec=league]', title: 'League', text: 'Standings and playoff picture, last week\'s recap with box scores, the awards race, stats and leaders, all 32 teams, news, the annual rule-change vote, and the full history of the NFL.' },
  { sel: '[data-sec=office]', title: 'Office', text: 'Relocate or rebrand your franchise, sliders and settings, online play with friends, and your saves (they autosave in your browser).' },
  { sel: '.todo', title: 'Your to-do list', text: 'The hub always shows what needs doing right now, based on the week or the offseason phase. Red items are urgent.' },
  { sel: '#helpBtn', title: 'Help on every screen', text: 'Tap ? on any page for an explanation of what you are looking at. Hover over buttons for a short description of what they do.' },
  { sel: '.capchip', title: 'Salary cap', text: 'Your cap space for the current league year. Stay under the cap: in the offseason you must be compliant to sign players.' },
  { sel: null, title: 'First moves', text: 'Good first steps: check your <b>Roster</b> and <b>Depth Chart</b>, look for upgrades in <b>Free Agency</b> or the <b>Trade Finder</b>, then hit <b>Advance</b> to play. Good luck!' },
];
let step = 0;
export function startTour() { step = 0; drawTour(); }
function drawTour() {
  let el = $('#tour');
  if (!el) { el = document.createElement('div'); el.id = 'tour'; document.body.appendChild(el); }
  if (step >= STEPS.length) { el.remove(); localStorage.setItem('tff-tour-done', '1'); return; }
  const s = STEPS[step];
  const target = s.sel ? document.querySelector(s.sel) : null;
  let spot = '', boxPos = 'top:50%;left:50%;transform:translate(-50%,-50%)';
  if (target) {
    target.scrollIntoView({ block: 'nearest' });
    const r = target.getBoundingClientRect();
    spot = `<div class="tour-spot" style="top:${r.top - 6}px;left:${r.left - 6}px;width:${r.width + 12}px;height:${r.height + 12}px"></div>`;
    const below = r.bottom + 230 < window.innerHeight;
    const left = Math.min(Math.max(12, r.left), window.innerWidth - 372);
    boxPos = below ? `top:${r.bottom + 14}px;left:${left}px` : `top:${Math.max(12, r.top - 230)}px;left:${left}px`;
  }
  el.innerHTML = `<div class="tour-shade ${target ? 'clear' : ''}"></div>${spot}<div class="tour-box" style="${boxPos}"><div class="tiny muted">Step ${step + 1} of ${STEPS.length}</div><h3>${esc(s.title)}</h3><p>${s.text}</p>
    <div class="row"><button class="btn ghost sm" id="tourSkip">Skip tour</button><span style="flex:1"></span>${step ? '<button class="btn sm" id="tourBack">Back</button>' : ''}<button class="btn pri sm" id="tourNext">${step === STEPS.length - 1 ? 'Finish' : 'Next'}</button></div></div>`;
  $('#tourNext').onclick = () => { step++; drawTour(); };
  $('#tourSkip').onclick = () => { step = STEPS.length; drawTour(); };
  const b = $('#tourBack'); if (b) b.onclick = () => { step--; drawTour(); };
}
