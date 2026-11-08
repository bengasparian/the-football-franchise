# THE Football Franchise

An NFL general-manager simulator in your browser: Madden-style franchise mode without the on-field gameplay. Play it at **https://bengasparian.github.io/the-football-franchise/**

- **Real NFL data**: current rosters, Over The Cap contracts (year-by-year cap hits, bonuses, guarantees), headshots, logos, the real 2026 schedule, and real results and stats to date (via nflverse). A GitHub Action refreshes it twice a week.
- **Our own ratings**: overalls come from 3 seasons of real production (EPA, CPOE, pressures, coverage, missed tackles), snap share, market value and draft pedigree. They are mapped onto a fixed, realistic league-wide distribution. They are not copied from any video game.
- **Performance-driven ratings**: players have hidden true talent. Overalls move toward on-field performance during the season, and in the offseason with age, work ethic, coaching and breakouts/busts. A distribution control keeps the league from inflating over time.
- **Play-by-play sim** calibrated to real league averages (~22 ppg, 7.0 Y/A, 65–67% completions, 4.4 YPC). Includes the 2025+ overtime rule, dynamic-kickoff touchbacks, 4th-down decisions, injuries and the IR rules.
- **Front office**: real salary cap ($301.2M in 2026, growing yearly), rookie wage scale, minimums, franchise/transition tags, fifth-year options, restructures, post-June 1 cuts, dead money, ERFA tenders, waivers, compensatory picks.
- **Trades** with AI valuation, a 2K-style Trade Finder, "what would it take?", AI-to-AI trades, AI offers to you, the trade deadline, and draft-day pick swaps.
- **Free agency frenzy**: bidding wars where players weigh money, guarantees, contender status, role, no-income-tax states, coaching and loyalty.
- **Draft**: generated classes, combine, scouting points, a big board, a live draft room. Also a **fantasy draft** start option.
- **Personalities, morale and chemistry**: holdouts, trade requests, and front-office dilemmas.
- **Coaching staff** (real 2026 HC/OC/DC), **owner goals, job security and finances**, an **Annual League Meeting** where owners vote on rule changes (24 of 32), awards, All-Pro, Pro Bowl, Hall of Fame, history and records.
- **Sliders** for injuries, progression, regression, trades, cap growth and more.
- **Online play**: host a room and friends join with a 5-letter code (peer-to-peer, no accounts).

Everything runs client-side (the sim runs in a Web Worker). Saves live in your browser (IndexedDB), and you can export or import them as files.

## Developing
- `python scripts/build_data.py .cache data/league.json` rebuilds the real-data snapshot.
- `node tests/season_test.mjs regular` simulates a season and prints league-wide stat realism.
- `node tests/multi_test.mjs current 7 5` simulates 5 full seasons including offseasons.
