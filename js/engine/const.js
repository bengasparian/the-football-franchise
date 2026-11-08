// League constants grounded in the real 2026 NFL / CBA.
export const START_SEASON = 2026;
export const CAP_2026 = 301_200_000;

export const POSITIONS = ['QB', 'RB', 'FB', 'WR', 'TE', 'OT', 'OG', 'C', 'EDGE', 'DT', 'LB', 'CB', 'S', 'K', 'P', 'LS'];
export const OFF_POS = ['QB', 'RB', 'FB', 'WR', 'TE', 'OT', 'OG', 'C'];
export const DEF_POS = ['EDGE', 'DT', 'LB', 'CB', 'S'];
export const ST_POS = ['K', 'P', 'LS'];
export const POS_NAMES = {
  QB: 'Quarterback', RB: 'Running Back', FB: 'Fullback', WR: 'Wide Receiver', TE: 'Tight End', OT: 'Offensive Tackle',
  OG: 'Guard', C: 'Center', EDGE: 'Edge Rusher', DT: 'Defensive Tackle', LB: 'Linebacker', CB: 'Cornerback', S: 'Safety',
  K: 'Kicker', P: 'Punter', LS: 'Long Snapper',
};
// Starters used by the sim (11 on each side + specialists)
export const STARTERS = { QB: 1, RB: 1, FB: 0, WR: 3, TE: 1, OT: 2, OG: 2, C: 1, EDGE: 2, DT: 2, LB: 2, CB: 3, S: 2, K: 1, P: 1, LS: 1 };
// Depth chart slots displayed / kept
export const DEPTH_SLOTS = { QB: 3, RB: 4, FB: 1, WR: 6, TE: 3, OT: 4, OG: 4, C: 2, EDGE: 4, DT: 4, LB: 4, CB: 5, S: 4, K: 1, P: 1, LS: 1, KR: 2, PR: 2 };
// Typical 53-man build (AI roster construction targets)
export const ROSTER_TARGET = { QB: 3, RB: 4, FB: 0.4, WR: 6, TE: 3, OT: 4, OG: 4, C: 2, EDGE: 5, DT: 5, LB: 5, CB: 6, S: 4, K: 1, P: 1, LS: 1 };
export const ROSTER_MIN = { QB: 2, RB: 3, FB: 0, WR: 5, TE: 2, OT: 4, OG: 3, C: 1, EDGE: 4, DT: 4, LB: 4, CB: 5, S: 3, K: 1, P: 1, LS: 1 };

// Roster rules (2026)
export const RULES_DEFAULT = {
  activeMax: 53, psMax: 16, offseasonMax: 90, gamedayActives: 48,
  irMinGames: 4, irReturns: 8,
  regOtMinutes: 10, postOtMinutes: 15, otBothPossess: true,
  playoffTeamsPerConf: 7, games: 17, weeks: 18, preseasonGames: 3,
  tradeDeadlineWeek: 9, // trades allowed through the Tuesday after Week 9
  kickoffTouchback: 35, xpDistance: 33, twoPtLine: 2,
  tushPush: true, hipDropBan: true, franchiseTag: true, reseedDivisionWinners: false,
  onsideAnytime: true, rookieYears: 4, fifthYearOption: true,
};

// Minimum salary by credited seasons (2026 CBA). Grows yearly afterwards.
export const MIN_SALARY_2026 = [885_000, 1_005_000, 1_075_000, 1_145_000, 1_215_000, 1_215_000, 1_215_000, 1_300_000];
export const PS_WEEKLY_2026 = { young: 13_750, vetMin: 18_350, vetMax: 22_850 };

// 2026 franchise / transition tag (non-exclusive) values, used to seed tag history
export const TAG_2026 = {
  QB: [43_895_000, 37_833_000], RB: [14_293_000, 11_323_000], WR: [27_298_000, 23_852_000], TE: [15_045_000, 12_687_000],
  OT: [25_773_000, 23_392_000], OG: [25_773_000, 23_392_000], C: [25_773_000, 23_392_000], EDGE: [24_434_000, 21_512_000],
  DT: [27_127_000, 22_521_000], LB: [26_865_000, 21_925_000], CB: [21_161_000, 18_119_000], S: [20_149_000, 16_012_000],
  K: [6_649_000, 6_005_000], P: [6_649_000, 6_005_000], LS: [6_649_000, 6_005_000], FB: [14_293_000, 11_323_000],
};
export const TAG_GROUP = { OT: 'OL', OG: 'OL', C: 'OL', K: 'KP', P: 'KP', LS: 'KP', FB: 'RB', EDGE: 'EDGE', DT: 'DT' };

// 2026 rookie wage scale: 4-year total by overall pick (interpolated); signing-bonus share by pick.
export const ROOKIE_SCALE_2026 = [
  [1, 57_271_500], [2, 54_600_000], [3, 53_000_000], [4, 51_100_000], [5, 46_500_000], [6, 42_000_000], [7, 36_000_000],
  [8, 32_500_000], [9, 32_200_000], [10, 30_900_000], [14, 24_232_230], [16, 21_500_000], [20, 20_810_383], [24, 18_900_000],
  [32, 16_780_000], [33, 12_400_000], [40, 10_300_000], [50, 8_600_000], [64, 7_000_000], [80, 6_000_000], [100, 5_600_000],
  [130, 5_150_000], [160, 4_850_000], [200, 4_600_000], [257, 4_359_000], [300, 4_300_000],
];

// Positional value (how the league pays positions) – share of cap for an elite (95 ovr) veteran
export const POS_PAY_TOP = { QB: 0.205, EDGE: 0.142, WR: 0.135, DT: 0.12, OT: 0.10, CB: 0.10, LB: 0.065, S: 0.075, TE: 0.072, OG: 0.07, C: 0.06, RB: 0.06, FB: 0.012, K: 0.022, P: 0.013, LS: 0.006 };

// States with no income tax (free agents who care about money like these)
export const NO_TAX = new Set(['DAL', 'HOU', 'MIA', 'JAX', 'TB', 'TEN', 'SEA', 'LV']);

// Stadium capacity, market size (metro, millions), domed
export const TEAM_INFO = {
  ARI: [63400, 5.1, 1], ATL: [71000, 6.3, 1], BAL: [71008, 2.8, 0], BUF: [71608, 1.2, 0], CAR: [74867, 2.8, 0], CHI: [61500, 9.4, 0],
  CIN: [65515, 2.3, 0], CLE: [67431, 2.1, 0], DAL: [80000, 8.1, 1], DEN: [76125, 3.0, 0], DET: [65000, 4.4, 1], GB: [81441, 0.3, 0],
  HOU: [72220, 7.5, 1], IND: [67000, 2.1, 1], JAX: [67814, 1.7, 0], KC: [76416, 2.2, 0], LAC: [70240, 13.0, 1], LAR: [70240, 13.0, 1],
  LV: [65000, 2.3, 1], MIA: [65326, 6.1, 0], MIN: [66860, 3.7, 1], NE: [65878, 4.9, 0], NO: [73208, 1.3, 1], NYG: [82500, 19.5, 0],
  NYJ: [82500, 19.5, 0], PHI: [69796, 6.2, 0], PIT: [68400, 2.4, 0], SF: [68500, 4.7, 0], SEA: [68740, 4.0, 0], TB: [65890, 3.3, 0],
  TEN: [69143, 2.1, 0], WAS: [62000, 6.3, 0],
};
export const OWNERS = {
  ARI: 'Michael Bidwill', ATL: 'Arthur Blank', BAL: 'Steve Bisciotti', BUF: 'Terry & Kim Pegula', CAR: 'David Tepper',
  CHI: 'McCaskey family', CIN: 'Mike Brown', CLE: 'Jimmy & Dee Haslam', DAL: 'Jerry Jones', DEN: 'Walton-Penner group',
  DET: 'Sheila Ford Hamp', GB: 'Packers shareholders', HOU: 'Cal McNair', IND: 'Irsay family', JAX: 'Shad Khan',
  KC: 'Clark Hunt', LAC: 'Dean Spanos', LAR: 'Stan Kroenke', LV: 'Mark Davis', MIA: 'Stephen Ross', MIN: 'Zygi & Mark Wilf',
  NE: 'Robert Kraft', NO: 'Gayle Benson', NYG: 'John Mara & Steve Tisch', NYJ: 'Woody Johnson', PHI: 'Jeffrey Lurie',
  PIT: 'Art Rooney II', SF: 'York family', SEA: 'Paul Allen estate', TB: 'Glazer family', TEN: 'Amy Adams Strunk', WAS: 'Josh Harris',
};

export const PHASES = ['PRESEASON', 'REGULAR_SEASON', 'PLAYOFFS', 'SEASON_END', 'RESIGN', 'FREE_AGENCY', 'LEAGUE_MEETING', 'DRAFT', 'POST_DRAFT', 'TRAINING_CAMP'];
export const PHASE_LABEL = {
  PRESEASON: 'Preseason', REGULAR_SEASON: 'Regular Season', PLAYOFFS: 'Playoffs', SEASON_END: 'Season Wrap-Up',
  RESIGN: 'Re-Sign & Tags', FREE_AGENCY: 'Free Agency', LEAGUE_MEETING: 'Annual League Meeting', DRAFT: 'NFL Draft',
  POST_DRAFT: 'Undrafted Free Agency', TRAINING_CAMP: 'Training Camp',
};
export const PLAYOFF_ROUNDS = ['WC', 'DIV', 'CONF', 'SB'];
export const ROUND_LABEL = { WC: 'Wild Card', DIV: 'Divisional', CONF: 'Conference Championship', SB: 'Super Bowl', PRE: 'Preseason', REG: 'Regular Season' };

export const DEFAULT_SLIDERS = {
  injuryRate: 1.0, injurySeverity: 1.0, progression: 1.0, regression: 1.0, breakoutChance: 1.0,
  inSeasonRatingSwing: 1.0, ratingInflationControl: 1.0,
  capGrowth: 1.0, contractDemands: 1.0, playerPatience: 1.0,
  tradeAiAggression: 1.0, tradeDifficulty: 1.0, aiFreeAgencyAggression: 1.0,
  scoring: 1.0, passRate: 1.0, turnovers: 1.0, penalties: 1.0, fourthDownAggression: 1.0,
  homeField: 1.0, upsetFactor: 1.0, moraleImpact: 1.0, ownerPatience: 1.0, holdouts: 1.0, retirementAge: 1.0,
};
export const SLIDER_INFO = {
  injuryRate: ['Injury frequency', 'How often players get hurt'],
  injurySeverity: ['Injury severity', 'How long injuries keep players out'],
  progression: ['Progression rate', 'How much young/improving players gain each year'],
  regression: ['Regression rate', 'How fast veterans decline with age'],
  breakoutChance: ['Breakouts & busts', 'Size of surprise jumps and falls'],
  inSeasonRatingSwing: ['In-season rating changes', 'How much a great/poor season moves overalls'],
  ratingInflationControl: ['Rating inflation control', 'Keeps the league\'s overall distribution realistic year after year'],
  capGrowth: ['Salary cap growth', 'Yearly cap increase multiplier (base about 7%/yr)'],
  contractDemands: ['Contract demands', 'How much players ask for'],
  playerPatience: ['Negotiation patience', 'How many offers players tolerate'],
  tradeAiAggression: ['AI trade frequency', 'How often AI teams trade'],
  tradeDifficulty: ['Trade difficulty', 'How much value AI teams demand from you'],
  aiFreeAgencyAggression: ['AI free agency spending', 'How aggressively AI teams spend'],
  scoring: ['Scoring level', 'Overall offensive efficiency'],
  passRate: ['Pass frequency', 'Pass vs run tendency league-wide'],
  turnovers: ['Turnovers', 'Interception and fumble frequency'],
  penalties: ['Penalties', 'How often flags fly'],
  fourthDownAggression: ['4th-down aggression', 'How often coaches go for it'],
  homeField: ['Home-field advantage', ''],
  upsetFactor: ['Randomness / upsets', 'Higher = more any-given-Sunday results'],
  moraleImpact: ['Morale impact', 'How much morale and chemistry matter'],
  ownerPatience: ['Owner patience', 'Lower = owners fire GMs and coaches faster'],
  holdouts: ['Holdouts & trade demands', 'How often unhappy players act out'],
  retirementAge: ['Career length', 'Higher = players play longer'],
};
