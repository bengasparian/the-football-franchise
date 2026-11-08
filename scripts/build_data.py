#!/usr/bin/env python3
"""
THE Football Franchise - real NFL data builder.

Downloads open nflverse data (rosters, Over The Cap contracts, stats, PFR advanced
stats, snap counts, combine, draft history, schedule/results) and turns it into
data/league.json, which the game loads when you start a new league.

Overalls are NOT copied from any video game. They come from a rating model:
  production (3 seasons of real stats, recency weighted)  +  usage (snap share)
  + market value (real contract as % of cap)  +  draft pedigree
mapped onto a fixed, realistic league-wide distribution per position.

Usage:  python scripts/build_data.py [cache_dir] [out_file]
"""
import io, json, math, os, sys, gzip, urllib.request, datetime
import numpy as np
import pandas as pd

CACHE = sys.argv[1] if len(sys.argv) > 1 else ".cache"
OUT = sys.argv[2] if len(sys.argv) > 2 else "data/league.json"
SEASON = 2026
REL = "https://github.com/nflverse/nflverse-data/releases/download/"
FILES = {
    "roster_weekly": f"weekly_rosters/roster_weekly_{SEASON}.csv",
    "contracts": "contracts/historical_contracts.parquet",
    "draft": "draft_picks/draft_picks.csv",
    "combine": "combine/combine.csv",
    "teams": "teams/teams_colors_logos.csv",
    "injuries": f"injuries/injuries_{SEASON}.csv",
    "adv_def": "pfr_advstats/advstats_season_def.csv",
    "adv_pass": "pfr_advstats/advstats_season_pass.csv",
    "adv_rec": "pfr_advstats/advstats_season_rec.csv",
    "adv_rush": "pfr_advstats/advstats_season_rush.csv",
    "stats_week": f"stats_player/stats_player_week_{SEASON}.csv",
    "players": "players/players.csv",
}
for y in range(SEASON - 4, SEASON + 1):
    FILES[f"stats_{y}"] = f"stats_player/stats_player_reg_{y}.csv"
for y in range(SEASON - 2, SEASON + 1):
    FILES[f"snaps_{y}"] = f"snap_counts/snap_counts_{y}.csv"
GAMES_URL = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"


def fetch(name, url):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, os.path.basename(url))
    if not os.path.exists(path) or os.path.getsize(path) < 100:
        print("download", url, flush=True)
        req = urllib.request.Request(url, headers={"User-Agent": "the-football-franchise-data/1.0"})
        with urllib.request.urlopen(req, timeout=180) as r, open(path, "wb") as f:
            f.write(r.read())
    if path.endswith(".parquet"):
        return pd.read_parquet(path)
    return pd.read_csv(path, low_memory=False)


D = {k: fetch(k, REL + v) for k, v in FILES.items()}
D["games"] = fetch("games", GAMES_URL)

# ---------------------------------------------------------------- teams
TEAM_FIX = {"LA": "LAR"}  # nflverse uses LA for the Rams
teams_df = D["teams"]
teams_df = teams_df[~teams_df.team_abbr.isin(["OAK", "SD", "STL", "LA"])]
TEAMS = []
for _, t in teams_df.iterrows():
    nick = t.team_nick
    region = t.team_name[: -len(nick)].strip() if t.team_name.endswith(nick) else t.team_name
    TEAMS.append({
        "abbr": t.team_abbr, "region": region, "name": nick, "conf": t.team_conf,
        "div": t.team_division.split(" ")[1], "c1": t.team_color, "c2": t.team_color2,
        "logo": t.team_logo_espn,
    })
TEAMS.sort(key=lambda x: x["abbr"])
TEAM_ABBRS = {t["abbr"] for t in TEAMS}
assert len(TEAMS) == 32, len(TEAMS)


def fix_team(t):
    if pd.isna(t):
        return None
    t = TEAM_FIX.get(t, t)
    return t if t in TEAM_ABBRS else None


# ---------------------------------------------------------------- roster (latest week)
rw = D["roster_weekly"]
rw = rw[rw.game_type == "REG"] if "game_type" in rw else rw
last_week = int(rw.week.max())
# take each player's most recent entry
rw = rw.sort_values("week").drop_duplicates("gsis_id", keep="last")
rw["team"] = rw.team.map(fix_team)
keep_status = {"ACT": "ACT", "DEV": "PS", "RES": "IR", "INA": "ACT", "CUT": "FA", "EXE": "PS"}
rw = rw[rw.status.isin(keep_status.keys())].copy()
rw["gstatus"] = rw.status.map(keep_status)
# anyone whose last listing is old (released and not re-signed) is a free agent
rw.loc[(rw.week < last_week - 1) & (rw.gstatus != "IR"), "gstatus"] = "FA"
rw.loc[rw.gstatus == "FA", "team"] = None
rw = rw[rw.gsis_id.notna()]
_pl = D["players"]
_pfr = {g: p for g, p in zip(_pl.gsis_id, _pl.pfr_id) if isinstance(p, str)}
rw["pfr_id"] = [p if isinstance(p, str) else _pfr.get(g) for g, p in zip(rw.gsis_id, rw.pfr_id)]

# ---------------------------------------------------------------- positions
DCP = {"T": "OT", "G": "OG", "C": "C", "DE": "EDGE", "DT": "DT", "NT": "DT", "ILB": "LB", "MLB": "LB",
       "LB": "LB", "CB": "CB", "DB": "CB", "FS": "S", "SS": "S", "S": "S", "FB": "FB", "QB": "QB", "RB": "RB",
       "WR": "WR", "TE": "TE", "K": "K", "P": "P", "LS": "LS", "OLB": "OLB"}
POSMAP = {"QB": "QB", "RB": "RB", "WR": "WR", "TE": "TE", "OL": "OG", "DL": "DT", "LB": "LB", "DB": "CB",
          "K": "K", "P": "P", "LS": "LS"}


def base_pos(row):
    p = DCP.get(row.depth_chart_position)
    if p is None:
        p = POSMAP.get(row.position, "LB")
    return p


rw["pos"] = rw.apply(base_pos, axis=1)

# ---------------------------------------------------------------- stats (seasons)
stat_seasons = {}
for y in range(SEASON - 4, SEASON + 1):
    s = D[f"stats_{y}"]
    s = s[s.season_type == "REG"] if "season_type" in s else s
    stat_seasons[y] = s.set_index("player_id")
adv = {k: D[k] for k in ["adv_def", "adv_pass", "adv_rec", "adv_rush"]}
for k in adv:
    adv[k] = adv[k][adv[k].season >= SEASON - 2]

pfr_of = dict(zip(rw.gsis_id, rw.pfr_id))
snaps = {}
for y in range(SEASON - 2, SEASON + 1):
    sc = D[f"snaps_{y}"]
    sc = sc[sc.game_type == "REG"]
    g = sc.groupby("pfr_player_id").agg(g=("week", "nunique"), off=("offense_pct", "mean"),
                                         de=("defense_pct", "mean"), st=("st_pct", "mean"),
                                         offs=("offense_snaps", "sum"), defs=("defense_snaps", "sum"))
    snaps[y] = g
games_in_season = {y: 17 for y in range(SEASON - 4, SEASON)}
games_in_season[SEASON] = max(1, last_week - 1 if last_week > 1 else 1)
YW = {SEASON: 0.55, SEASON - 1: 0.30, SEASON - 2: 0.15}


def sget(df, idx, col, default=0.0):
    try:
        v = df.at[idx, col]
        if isinstance(v, pd.Series):
            v = v.iloc[0]
        return default if pd.isna(v) else float(v)
    except KeyError:
        return default


def adv_row(kind, pfr, y):
    a = adv[kind]
    r = a[(a.pfr_id == pfr) & (a.season == y)]
    if len(r) == 0:
        return None
    return r.iloc[0]


# precompute adv lookups as dict for speed
ADV = {}
for kind, a in adv.items():
    for _, r in a.iterrows():
        ADV[(kind, r.pfr_id, int(r.season))] = r


def advg(kind, pfr, y, col, default=np.nan):
    r = ADV.get((kind, pfr, y))
    if r is None:
        return default
    v = r.get(col, default)
    try:
        return default if pd.isna(v) else float(v)
    except (TypeError, ValueError):
        return default


def prod_metrics(pos, gid, pfr, y):
    """Return (dict of raw metrics, sample size 0..~1) for one player-season."""
    s = stat_seasons.get(y)
    if s is None or gid not in s.index:
        st = None
    else:
        st = s.loc[gid]
        if isinstance(st, pd.DataFrame):
            st = st.iloc[0]
    G = lambda c: (0.0 if st is None or pd.isna(st.get(c, 0)) else float(st.get(c, 0)))
    g = max(1.0, G("games"))
    full = games_in_season[y]
    m = {}
    if pos == "QB":
        att, sk, car = G("attempts"), G("sacks_suffered"), G("carries")
        plays = att + sk + car
        if plays < 60:
            return None, 0
        m["epa"] = (G("passing_epa") + G("rushing_epa")) / plays
        m["cpoe"] = G("passing_cpoe")
        m["int"] = -G("passing_interceptions") / max(att, 1)
        m["sack"] = -sk / max(att + sk, 1)
        m["ypa"] = G("passing_yards") / max(att, 1)
        m["vol"] = plays / g
        m["deep"] = advg("adv_pass", pfr, y, "intended_air_yards_per_pass_attempt")
        m["ontgt"] = advg("adv_pass", pfr, y, "on_tgt_pct")
        m["mob"] = G("rushing_yards") / g
        m["pen"] = G("penalties") / g
        return m, min(1.2, plays / (34 * full))
    if pos in ("RB", "FB"):
        car, rec = G("carries"), G("receptions")
        if car + rec < 25:
            return None, 0
        m["ypg"] = (G("rushing_yards") + G("receiving_yards")) / g
        m["ypc"] = G("rushing_yards") / max(car, 1)
        m["epa"] = G("rushing_epa") / max(car, 1)
        brk = advg("adv_rush", pfr, y, "brk_tkl", 0)
        m["brk"] = brk / max(car + rec, 1)
        m["yaco"] = advg("adv_rush", pfr, y, "yac_att")
        m["rec"] = G("receiving_yards") / g
        m["fum"] = -(G("rushing_fumbles_lost") + G("receiving_fumbles_lost")) / max(car + rec, 1)
        m["td"] = (G("rushing_tds") + G("receiving_tds")) / g
        m["pen"] = G("penalties") / g
        return m, min(1.2, (car + rec) / (16 * full))
    if pos in ("WR", "TE"):
        tg = G("targets")
        if tg < 15:
            return None, 0
        m["ypg"] = G("receiving_yards") / g
        m["ypt"] = G("receiving_yards") / tg
        m["share"] = G("target_share") if G("target_share") else 0
        m["epa"] = G("receiving_epa") / tg
        m["drop"] = -advg("adv_rec", pfr, y, "drop_percent", 5.0)
        m["adot"] = advg("adv_rec", pfr, y, "adot")
        m["yac"] = G("receiving_yards_after_catch") / max(G("receptions"), 1)
        m["td"] = G("receiving_tds") / g
        m["pen"] = G("penalties") / g
        return m, min(1.2, tg / ((7.5 if pos == "WR" else 5.5) * full))
    if pos in ("EDGE", "DT", "LB", "CB", "S", "OLB"):
        gg = advg("adv_def", pfr, y, "g", np.nan)
        if np.isnan(gg):
            gg = G("games") if st is not None else 0
        if gg < 3:
            return None, 0
        tk = advg("adv_def", pfr, y, "comb", np.nan)
        if np.isnan(tk):
            tk = G("def_tackles_solo") + G("def_tackle_assists")
        m["tkl"] = tk / gg
        m["prss"] = advg("adv_def", pfr, y, "prss", 0) / gg
        m["sk"] = G("def_sacks") / gg
        m["tfl"] = G("def_tackles_for_loss") / gg
        m["qbh"] = G("def_qb_hits") / gg
        m["int"] = G("def_interceptions") / gg
        m["pd"] = G("def_pass_defended") / gg
        m["ff"] = G("def_fumbles_forced") / gg
        tgt = advg("adv_def", pfr, y, "tgt", 0)
        m["tgt"] = tgt
        m["rat"] = -advg("adv_def", pfr, y, "rat", 95.0) if tgt >= 12 else np.nan
        m["ypt"] = -advg("adv_def", pfr, y, "yds_tgt", 7.5) if tgt >= 12 else np.nan
        m["mtkl"] = -advg("adv_def", pfr, y, "m_tkl_percent", 12.0) if tk >= 10 else np.nan
        m["pen"] = G("penalties") / gg
        return m, min(1.2, gg / full)
    if pos == "K":
        fga = G("fg_att")
        if fga < 5:
            return None, 0
        made = [G("fg_made_0_19") + G("fg_made_20_29") + G("fg_made_30_39"), G("fg_made_40_49"),
                G("fg_made_50_59") + G("fg_made_60_")]
        miss = [G("fg_missed_0_19") + G("fg_missed_20_29") + G("fg_missed_30_39"), G("fg_missed_40_49"),
                G("fg_missed_50_59") + G("fg_missed_60_")]
        exp = [0.95, 0.83, 0.68]
        m["fgoe"] = sum(made[i] - exp[i] * (made[i] + miss[i]) for i in range(3)) / max(fga, 1)
        m["long"] = (made[2]) / g
        m["pat"] = G("pat_made") / max(G("pat_att"), 1)
        return m, min(1.2, fga / (1.8 * full))
    if pos == "P":
        pa = G("pt_att")
        if pa < 10:
            return None, 0
        m["net"] = G("pt_net_yards") / pa
        m["gross"] = G("pt_yards") / pa
        m["in20"] = G("pt_inside_20") / pa
        return m, min(1.2, pa / (4 * full))
    return None, 0


PROD_W = {
    "QB": {"epa": .45, "cpoe": .2, "int": .1, "sack": .05, "ypa": .1, "vol": .1},
    "RB": {"ypg": .3, "ypc": .2, "epa": .15, "brk": .15, "rec": .1, "fum": .05, "td": .05},
    "FB": {"ypg": .4, "rec": .3, "td": .3},
    "WR": {"ypg": .35, "ypt": .15, "share": .2, "epa": .15, "drop": .05, "td": .1},
    "TE": {"ypg": .35, "ypt": .15, "share": .2, "epa": .15, "drop": .05, "td": .1},
    "EDGE": {"prss": .4, "sk": .25, "tfl": .12, "qbh": .08, "tkl": .1, "ff": .05},
    "DT": {"prss": .3, "sk": .15, "tfl": .2, "tkl": .25, "qbh": .1},
    "LB": {"tkl": .14, "tfl": .14, "prss": .1, "rat": .26, "ypt": .1, "mtkl": .16, "pd": .06, "int": .04},
    "CB": {"rat": .32, "ypt": .2, "pd": .18, "int": .14, "mtkl": .06, "tkl": .1},
    "S": {"rat": .22, "ypt": .12, "tkl": .2, "int": .16, "pd": .14, "mtkl": .16},
    "K": {"fgoe": .7, "long": .2, "pat": .1},
    "P": {"net": .6, "gross": .2, "in20": .2},
}

# ---------------------------------------------------------------- contracts
con = D["contracts"]
con = con[con.is_active == True].copy()
con = con.sort_values("year_signed").drop_duplicates("gsis_id", keep="last")
CON = {}
for _, c in con.iterrows():
    if pd.isna(c.gsis_id):
        continue
    hist = list(c.contract_history) if c.contract_history is not None else []
    active = [h for h in hist if h.get("status") == "Active"]
    ctype = active[-1]["contract_type"] if active else ("Drafted" if c.year_signed == c.draft_year else "Veteran")
    years = []
    for sh in (list(c.season_history) if c.season_history is not None else []):
        if not sh.get("year") or sh["year"] == "Total" or not str(sh["year"]).isdigit():
            continue
        y = int(sh["year"])
        if y < SEASON:
            continue
        cap = sh.get("cap_number") or 0
        if cap <= 0 and (sh.get("base_salary") or 0) <= 0:
            continue
        prorate = (sh.get("prorated_bonus") or 0) + (sh.get("option_bonus") or 0)
        base = cap - prorate
        years.append([y, round(base * 1e6), round(prorate * 1e6), round((sh.get("guaranteed_salary") or 0) * 1e6)])
    if not years:
        continue
    CON[c.gsis_id] = {"signed": int(c.year_signed), "type": ctype, "apy": round(float(c.apy) * 1e6),
                      "tot": round(float(c.value) * 1e6), "gtd": round(float(c.guaranteed or 0) * 1e6),
                      "pct": float(c.apy_cap_pct or 0), "years": years}

# ---------------------------------------------------------------- draft / accolades / combine
dr = D["draft"]
DR = {}
for _, d in dr.iterrows():
    if pd.isna(d.gsis_id):
        continue
    DR[d.gsis_id] = {"y": int(d.season), "r": int(d["round"]), "p": int(d.pick), "tm": fix_team(d.team) or d.team,
                     "pb": int(d.probowls or 0), "ap": int(d.allpro or 0)}
cb = D["combine"]
CB = {}
for _, c in cb.iterrows():
    if pd.isna(c.pfr_id):
        continue
    CB[c.pfr_id] = {k: (None if pd.isna(c[k]) else float(c[k])) for k in
                    ["forty", "bench", "vertical", "broad_jump", "cone", "shuttle"]}

# ---------------------------------------------------------------- build player table
players = []
for _, r in rw.iterrows():
    gid = r.gsis_id
    pos = r.pos
    pfr = r.pfr_id if isinstance(r.pfr_id, str) else None
    players.append({"gid": gid, "pfr": pfr, "pos": pos, "row": r})

# resolve OLB -> EDGE / LB using pass rush profile
for p in players:
    if p["pos"] != "OLB":
        continue
    pr, gs, cov = 0.0, 0.0, 0.0
    for y in (SEASON, SEASON - 1, SEASON - 2):
        pr += advg("adv_def", p["pfr"], y, "prss", 0) + advg("adv_def", p["pfr"], y, "sk", 0) * 2
        cov += advg("adv_def", p["pfr"], y, "tgt", 0)
        gs += advg("adv_def", p["pfr"], y, "g", 0)
    wt = p["row"].weight if not pd.isna(p["row"].weight) else 240
    if gs >= 4:
        p["pos"] = "EDGE" if (pr / gs >= 1.0 and cov / gs < 2.5) or (pr / gs >= 1.6) else "LB"
    else:
        p["pos"] = "EDGE" if wt >= 246 else "LB"

# production metrics per season
for p in players:
    p["m"] = {}
    for y in (SEASON, SEASON - 1, SEASON - 2):
        m, smp = prod_metrics(p["pos"], p["gid"], p["pfr"], y)
        if m:
            p["m"][y] = (m, smp)

# z-score metrics within position across all player-seasons
from collections import defaultdict
pools = defaultdict(lambda: defaultdict(list))
for p in players:
    for y, (m, smp) in p["m"].items():
        for k, v in m.items():
            if v is not None and not (isinstance(v, float) and np.isnan(v)):
                pools[p["pos"]][k].append(v)
stats_mu = {pos: {k: (np.mean(v), np.std(v) + 1e-9) for k, v in d.items()} for pos, d in pools.items()}


def z(pos, k, v):
    if v is None or (isinstance(v, float) and np.isnan(v)) or k not in stats_mu.get(pos, {}):
        return None
    mu, sd = stats_mu[pos][k]
    return float(np.clip((v - mu) / sd, -3, 3))


for p in players:
    pos = p["pos"]
    w = PROD_W.get(pos)
    tot, tw, samp = 0.0, 0.0, 0.0
    hints = defaultdict(lambda: [0.0, 0.0])
    # adaptive recency: a real current-season sample dominates (players change year to year)
    cur = p["m"].get(SEASON, (None, 0))[1]
    yw = {SEASON: 0.55 + 0.2 * min(1.0, cur), SEASON - 1: 0.30 - 0.12 * min(1.0, cur), SEASON - 2: 0.15 - 0.08 * min(1.0, cur)}
    if w:
        for y, (m, smp) in p["m"].items():
            score, sw = 0.0, 0.0
            for k, wk in w.items():
                zz = z(pos, k, m.get(k))
                if zz is not None:
                    score += wk * zz
                    sw += wk
            for k in m:
                zz = z(pos, k, m.get(k))
                if zz is not None:
                    hints[k][0] += zz * yw[y] * smp
                    hints[k][1] += yw[y] * smp
            if sw > 0:
                ww = yw[y] * smp
                tot += ww * score / sw
                tw += ww
                samp += ww
    p["prod"] = tot / tw if tw > 0 else None
    p["psamp"] = samp  # roughly 0..1
    p["hints"] = {k: round(v[0] / v[1], 2) for k, v in hints.items() if v[1] > 0}

# usage from snap counts
for p in players:
    u, uw = 0.0, 0.0
    defense = p["pos"] in ("EDGE", "DT", "LB", "CB", "S")
    st_only = p["pos"] in ("K", "P", "LS")
    for y in (SEASON, SEASON - 1, SEASON - 2):
        if p["pfr"] is None or p["pfr"] not in snaps[y].index:
            continue
        s = snaps[y].loc[p["pfr"]]
        pct = s.st if st_only else (s.de if defense else s.off)
        gfrac = min(1.0, s.g / games_in_season[y])
        u += YW[y] * pct * gfrac
        uw += YW[y]
    p["usage"] = u / uw if uw > 0 else None

# market & draft
for p in players:
    c = CON.get(p["gid"])
    p["mkt"] = None
    if c and c["type"] not in ("Drafted", "UDFA") and c["pct"] > 0:
        p["mkt"] = math.log(max(c["pct"], 0.002))
    d = DR.get(p["gid"])
    p["draft"] = math.exp(-(d["p"] - 1) / 55.0) if d else 0.0

for comp in ("usage", "mkt"):
    for pos in set(p["pos"] for p in players):
        vals = [p[comp] for p in players if p["pos"] == pos and p[comp] is not None]
        if len(vals) < 5:
            continue
        mu, sd = np.mean(vals), np.std(vals) + 1e-9
        for p in players:
            if p["pos"] == pos and p[comp] is not None:
                p[comp + "_z"] = float(np.clip((p[comp] - mu) / sd, -3, 1.2 if comp == "usage" else 2.0))

WEIGHTS = {  # production, usage, market, reputation (Pro Bowls / All-Pros)
    "QB": (.52, .14, .16, .18), "RB": (.62, .18, .10, .10), "FB": (.25, .45, .15, .15),
    "WR": (.62, .16, .12, .10), "TE": (.56, .21, .13, .10),
    "OT": (0, .35, .40, .25), "OG": (0, .35, .40, .25), "C": (0, .35, .40, .25),
    "EDGE": (.56, .17, .15, .12), "DT": (.52, .21, .15, .12), "LB": (.52, .21, .15, .12),
    "CB": (.52, .21, .15, .12), "S": (.52, .21, .15, .12), "K": (.75, .05, .15, .05), "P": (.75, .05, .15, .05),
    "LS": (0, .5, .3, .2),
}
for p in players:
    d = DR.get(p["gid"])
    rep = (d["pb"] + 2.5 * d["ap"]) if d else 0
    p["rep"] = math.log1p(rep)
for pos in set(p["pos"] for p in players):
    vals = [p["rep"] for p in players if p["pos"] == pos]
    mu, sd = np.mean(vals), np.std(vals) + 1e-9
    for p in players:
        if p["pos"] == pos:
            p["rep_z"] = float(np.clip((p["rep"] - mu) / sd, -1, 1.8))
for p in players:
    wp, wu, wm, wr = WEIGHTS.get(p["pos"], (.3, .3, .2, .2))
    parts = []
    if p["prod"] is not None and wp:
        shrink = p["psamp"] / (p["psamp"] + 0.35)
        parts.append((wp, p["prod"] * shrink - 0.6 * (1 - shrink)))
    elif wp:
        parts.append((wp * 0.5, -1.0))
    if p.get("usage_z") is not None:
        parts.append((wu, p["usage_z"]))
    else:
        parts.append((wu * 0.6, -1.2))
    if p.get("mkt_z") is not None:
        parts.append((wm, p["mkt_z"]))
    parts.append((wr, p["rep_z"]))
    tw = sum(w for w, _ in parts)
    p["score"] = sum(w * v for w, v in parts) / tw if tw else -1
    if p["row"].gstatus == "PS":
        p["score"] -= 0.35
    if p["row"].gstatus == "FA":
        p["score"] -= 0.25


def draft_prior(p):
    d = DR.get(p["gid"])
    if not d:
        return 54.0
    pk = d["p"]
    pts = [(1, 80), (5, 78), (10, 76), (20, 74), (32, 72), (64, 68), (100, 65), (150, 62), (260, 58)]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if pk <= x1:
            return y0 + (y1 - y0) * (pk - x0) / (x1 - x0)
    return 58.0

# "starters" = how many players per team at the position get real snaps (rotations count)
STARTERS = {"QB": 1, "RB": 1.8, "FB": .35, "WR": 3.4, "TE": 1.7, "OT": 2, "OG": 2, "C": 1, "EDGE": 2.7, "DT": 2.5,
            "LB": 2.4, "CB": 3.0, "S": 2.2, "K": 1, "P": 1, "LS": 1}
CURVE = [(0, 99), (0.03, 95), (0.08, 91), (0.2, 86), (0.4, 81), (0.7, 77), (1.0, 73), (1.5, 68), (2.2, 63),
         (3.2, 57), (5.0, 50), (9.0, 43)]


def curve(x):
    for (x0, y0), (x1, y1) in zip(CURVE, CURVE[1:]):
        if x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return CURVE[-1][1]


for pos in STARTERS:
    grp = sorted([p for p in players if p["pos"] == pos], key=lambda p: -p["score"])
    n_start = 32 * STARTERS[pos]
    for i, p in enumerate(grp):
        o = curve((i + 0.5) / n_start)
        exp_yrs = p["row"].years_exp if not pd.isna(p["row"].years_exp) else 3
        wprior = {0: 0.6, 1: 0.35, 2: 0.15}.get(int(exp_yrs), 0.0)
        if wprior:
            ev = p["psamp"] if p["prod"] is not None else (p["usage"] or 0) * 0.6
            wprior *= 1.0 / (1.0 + 1.5 * ev)
            o = wprior * draft_prior(p) + (1 - wprior) * o
        p["ovr0"] = o
        p["ovr"] = int(round(o))

# ---------------------------------------------------------------- expert evaluation input
# Public stats can't grade offensive linemen (and only partly grade other spots), so EA's current
# in-season ratings are blended in as ONE input, weighted by how little real data exists per position.
import re as _re, unicodedata as _ud
EXPERT_W = {"OT": .85, "OG": .85, "C": .85, "LS": .85, "FB": .8, "LB": .72, "S": .72, "DT": .72, "EDGE": .7, "CB": .72,
            "TE": .68, "RB": .62, "WR": .64, "QB": .66, "K": .72, "P": .75}
def _norm(n):
    n = _ud.normalize("NFKD", str(n)).encode("ascii", "ignore").decode().lower()
    n = _re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", n)
    return _re.sub(r"[^a-z]", "", n)
EA_TEAM = {t["region"] + " " + t["name"]: t["abbr"] for t in TEAMS}
ea_path = os.path.join(os.path.dirname(OUT) or ".", "ea_ratings.json")
EA = {}
if os.path.exists(ea_path):
    ea = json.load(open(ea_path))
    EA_POS = {"HB": "RB", "LEDG": "EDGE", "REDG": "EDGE", "FS": "S", "SS": "S", "MIKE": "LB", "WILL": "LB", "SAM": "LB",
              "LT": "OT", "RT": "OT", "LG": "OG", "RG": "OG"}
    NEAR = {frozenset(x) for x in [("EDGE", "DT"), ("EDGE", "LB"), ("S", "CB"), ("S", "LB"), ("OG", "C"), ("OT", "OG"),
                                   ("TE", "FB"), ("RB", "FB"), ("K", "P")]}
    def _ok(a, b): return a == b or frozenset((a, b)) in NEAR
    by_name_team, by_name_bd, by_name = {}, {}, {}
    for e in ea["players"]:
        nm = _norm(e["fn"] + e["ln"])
        ps = EA_POS.get(e.get("pos"), e.get("pos"))
        tm = EA_TEAM.get(e["team"].replace("NY ", "New York "), None)
        by_name_team.setdefault((nm, tm), []).append((ps, e["ovr"]))
        if e.get("bd"): by_name_bd.setdefault((nm, e["bd"]), []).append((ps, e["ovr"]))
        by_name.setdefault(nm, []).append((ps, e["ovr"]))
    def _pick(lst, pos):
        lst = [v for ps, v in (lst or []) if _ok(ps, pos)]
        return lst[0] if len(lst) == 1 else None
    matched = 0
    for p in players:
        r = p["row"]
        nm = _norm(str(r.first_name) + str(r.last_name))
        nm2 = _norm(str(r.football_name) + str(r.last_name)) if isinstance(r.football_name, str) else nm
        pos = p["pos"]
        v = _pick(by_name_team.get((nm2, r.team)), pos) or _pick(by_name_team.get((nm, r.team)), pos)
        if v is None and isinstance(r.birth_date, str): v = _pick(by_name_bd.get((nm2, r.birth_date)), pos) or _pick(by_name_bd.get((nm, r.birth_date)), pos)
        if v is None: v = _pick(by_name.get(nm2), pos) or _pick(by_name.get(nm), pos)
        if v is not None:
            EA[p["gid"]] = v; matched += 1
    print("expert input matched", matched, "of", len(players))
    for pos in STARTERS:
        grp = [p for p in players if p["pos"] == pos]
        for p in grp:
            if p["gid"] in EA:
                w = EXPERT_W.get(pos, .4)
                # trust our model more where the player has a big real 2026 sample
                if p.get("psamp", 0) and pos not in ("OT", "OG", "C", "LS"): w *= 0.9
                p["blend"] = (1 - w) * p["ovr0"] + w * EA[p["gid"]]
            else:
                p["blend"] = p["ovr0"]
        # keep the league-wide distribution realistic: half rank-curve, half blended value
        grp.sort(key=lambda p: -p["blend"])
        n_start = 32 * STARTERS[pos]
        for i, p in enumerate(grp):
            v = 0.8 * p["blend"] + 0.2 * curve((i + 0.5) / n_start)
            # specialists: the best kicker in the league is not a 99, and long snappers live in a narrow band
            if pos in ("K", "P"): v = 74 + (v - 74) * 0.72
            if pos == "LS": v = 62 + (v - 62) * 0.65
            p["ovr"] = int(round(v))

if os.environ.get("DUMP"):
    import csv as _csv
    with open(os.environ["DUMP"], "w", newline="") as fh:
        w_ = _csv.writer(fh); w_.writerow(["pos", "name", "team", "age", "exp", "st", "score", "prod", "psamp", "usage_z", "mkt_z", "rep_z", "ovr0", "ea", "final"])
        for p in players:
            r = p["row"]
            w_.writerow([p["pos"], f"{r.first_name} {r.last_name}", r.team, "", r.years_exp, r.gstatus, round(p["score"], 2), p["prod"] if p["prod"] is None else round(p["prod"], 2), round(p.get("psamp", 0), 2), p.get("usage_z") and round(p["usage_z"], 2), p.get("mkt_z") and round(p["mkt_z"], 2), round(p["rep_z"], 2), round(p["ovr0"], 1), EA.get(p["gid"]), p["ovr"]])
if os.environ.get("DEBUG_NAMES"):
    for p in players:
        nm = f"{p['row'].first_name} {p['row'].last_name}"
        if nm in os.environ["DEBUG_NAMES"].split(","):
            print("DBG", nm, p["pos"], "prod", p["prod"] and round(p["prod"], 2), "samp", round(p["psamp"], 2), "usage_z", p.get("usage_z") and round(p["usage_z"], 2), "mkt_z", p.get("mkt_z") and round(p["mkt_z"], 2), "rep_z", round(p["rep_z"], 2), "score", round(p["score"], 2), "ovr0", round(p["ovr0"], 1), "ea", EA.get(p["gid"]), "final", p["ovr"], {y: {k: round(v, 2) for k, v in m.items() if v == v} for y, (m, _) in p["m"].items()})
# ---------------------------------------------------------------- injuries (latest report)
inj = D["injuries"]
inj = inj[inj.week == inj.week.max()] if len(inj) else inj
INJ = {}
for _, i in inj.iterrows():
    if i.report_status in ("Out", "Doubtful"):
        INJ[i.gsis_id] = {"type": i.report_primary_injury if isinstance(i.report_primary_injury, str) else "Undisclosed",
                          "wk": 1 if i.report_status == "Doubtful" else 2}

# ---------------------------------------------------------------- stats export (career + 2026 weekly)
SKEYS = [("g", "games"), ("cmp", "completions"), ("att", "attempts"), ("pyd", "passing_yards"),
         ("ptd", "passing_tds"), ("int", "passing_interceptions"), ("sk", "sacks_suffered"), ("car", "carries"),
         ("ryd", "rushing_yards"), ("rtd", "rushing_tds"), ("tgt", "targets"), ("rec", "receptions"),
         ("recyd", "receiving_yards"), ("rectd", "receiving_tds"),
         ("fum", "fumbles_lost_total"), ("tkl", "def_tackles_solo"), ("ast", "def_tackle_assists"),
         ("tfl", "def_tackles_for_loss"), ("sck", "def_sacks"), ("qbh", "def_qb_hits"),
         ("dint", "def_interceptions"), ("pd", "def_pass_defended"), ("ff", "def_fumbles_forced"),
         ("dtd", "def_tds"), ("fgm", "fg_made"), ("fga", "fg_att"), ("xpm", "pat_made"), ("xpa", "pat_att"),
         ("pnt", "pt_att"), ("pntyd", "pt_yards")]


def statline(row):
    out = {}
    for k, c in SKEYS:
        v = row.get(c, 0)
        if pd.isna(v) or v == 0:
            continue
        out[k] = round(float(v), 1) if k == "sck" else int(v)
    return out


def career(gid):
    res = {}
    for y in range(SEASON - 4, SEASON):
        s = stat_seasons[y]
        if gid in s.index:
            row = s.loc[gid]
            if isinstance(row, pd.DataFrame):
                row = row.iloc[0]
            sl = statline(row)
            if sl:
                sl["tm"] = fix_team(row.get("recent_team")) or row.get("recent_team")
                res[str(y)] = sl
    return res


wk = D["stats_week"]
wk = wk[wk.season_type == "REG"]
WEEKLY = defaultdict(list)
for _, r in wk.iterrows():
    sl = statline(r)
    sl.pop("g", None)
    sl["w"] = int(r.week)
    sl["tm"] = fix_team(r.team) if "team" in r else None
    sl["op"] = fix_team(r.opponent_team) if "opponent_team" in r else None
    WEEKLY[r.player_id].append(sl)


def num(v, d=None):
    return d if v is None or (isinstance(v, float) and np.isnan(v)) else v


out_players = []
for p in players:
    r = p["row"]
    gid = p["gid"]
    bd = r.birth_date if isinstance(r.birth_date, str) else None
    o = {
        "id": gid, "fn": r.first_name if isinstance(r.first_name, str) else "", "ln": r.last_name if isinstance(r.last_name, str) else "",
        "pos": p["pos"], "tm": r.team if r.gstatus != "FA" else None, "st": r.gstatus,
        "jn": int(r.jersey_number) if not pd.isna(r.jersey_number) else None,
        "bd": bd, "ht": int(r.height) if not pd.isna(r.height) else None,
        "wt": int(r.weight) if not pd.isna(r.weight) else None,
        "col": (r.college.split(";")[0].strip() if isinstance(r.college, str) else None),
        "exp": int(r.years_exp) if not pd.isna(r.years_exp) else 0,
        "hs": r.headshot_url if isinstance(r.headshot_url, str) else None,
        "ovr": p["ovr"], "h": p["hints"],
    }
    if isinstance(r.football_name, str) and r.football_name != o["fn"]:
        o["nick"] = r.football_name
    if gid in DR:
        o["dr"] = DR[gid]
    elif not pd.isna(r.draft_number) if "draft_number" in r else False:
        o["dr"] = {"y": int(r.entry_year), "r": 0, "p": int(r.draft_number), "tm": r.draft_club}
    if p["pfr"] and p["pfr"] in CB:
        o["cmb"] = {k: v for k, v in CB[p["pfr"]].items() if v is not None}
    if gid in CON:
        o["k"] = CON[gid]
    if gid in INJ and r.gstatus != "IR":
        o["inj"] = INJ[gid]
    if r.gstatus == "IR":
        o["inj"] = {"type": "Injured Reserve", "wk": 5, "ir": True}
    car = career(gid)
    if car:
        o["car"] = car
    if gid in WEEKLY:
        o["wk"] = sorted(WEEKLY[gid], key=lambda x: x["w"])
    pen = sum(m.get("pen", 0) for m, _ in p["m"].values()) / max(1, len(p["m"]))
    if pen:
        o["pen"] = round(pen, 2)
    if p.get("usage") is not None:
        o["snap"] = round(p["usage"], 2)
    out_players.append(o)

# ---------------------------------------------------------------- schedule / results
g = D["games"]
g = g[(g.season == SEASON) & (g.game_type == "REG")]
GAMES = []
for _, x in g.iterrows():
    h, a = fix_team(x.home_team), fix_team(x.away_team)
    gm = {"w": int(x.week), "h": h, "a": a, "d": x.gameday, "t": x.gametime if isinstance(x.gametime, str) else None}
    if not pd.isna(x.home_score):
        gm["hs"], gm["as"] = int(x.home_score), int(x.away_score)
        if not pd.isna(x.overtime) and int(x.overtime):
            gm["ot"] = 1
    GAMES.append(gm)
completed = [x for x in GAMES if "hs" in x]
weeks_done = sorted({x["w"] for x in completed})
last_full_week = 0
for w in range(1, 19):
    wg = [x for x in GAMES if x["w"] == w]
    if wg and all("hs" in x for x in wg):
        last_full_week = w

# ---------------------------------------------------------------- head coaches (2026) + career records
allg = D["games"]
allg = allg[allg.home_score.notna()]
HC = {}
cur = g.sort_values("week")
for _, x in cur.iterrows():
    for side in ("home", "away"):
        tm = fix_team(x[f"{side}_team"])
        if tm and isinstance(x[f"{side}_coach"], str):
            HC[tm] = x[f"{side}_coach"]
coach_rec = {}
for _, x in allg.iterrows():
    for side, opp in (("home", "away"), ("away", "home")):
        c = x[f"{side}_coach"]
        if not isinstance(c, str):
            continue
        r = coach_rec.setdefault(c, {"w": 0, "l": 0, "t": 0, "pw": 0, "pl": 0, "sb": 0, "seasons": set()})
        ms, os_ = x[f"{side}_score"], x[f"{opp}_score"]
        post = x.game_type != "REG"
        if ms > os_:
            r["pw" if post else "w"] += 1
            if x.game_type == "SB":
                r["sb"] += 1
        elif ms < os_:
            r["pl" if post else "l"] += 1
        elif not post:
            r["t"] += 1
        r["seasons"].add(int(x.season))
NAME_FIX = {"Klint Kubliak": "Klint Kubiak"}  # typo in source data
COACHES = {}
for tm, c in HC.items():
    r = coach_rec.get(c, {"w": 0, "l": 0, "t": 0, "pw": 0, "pl": 0, "sb": 0, "seasons": set()})
    COACHES[tm] = {"name": NAME_FIX.get(c, c), "w": r["w"], "l": r["l"], "t": r["t"], "pw": r["pw"], "pl": r["pl"], "sb": r["sb"], "yrs": len(r["seasons"])}

out = {
    "meta": {"season": SEASON, "built": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
             "rosterWeek": last_week, "lastFullWeek": last_full_week, "gamesPlayed": len(completed),
             "cap": 301_200_000, "source": "nflverse (rosters, Over The Cap contracts, PFR & NFL stats)"},
    "teams": TEAMS, "players": out_players, "games": GAMES, "coaches": COACHES,
}
os.makedirs(os.path.dirname(OUT) or ".", exist_ok=True)
with open(OUT, "w") as f:
    json.dump(out, f, separators=(",", ":"))
print("players", len(out_players), "games", len(GAMES), "completed", len(completed), "lastFullWeek", last_full_week,
      "bytes", os.path.getsize(OUT))
