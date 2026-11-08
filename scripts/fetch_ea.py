#!/usr/bin/env python3
"""Fetch EA's current in-season player ratings (used only as ONE input for positions that lack public stats)."""
import json, re, sys, time, urllib.request
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", "Accept": "text/html,application/json"}
def get(url):
    for i in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return r.read().decode("utf-8")
        except Exception as e:
            print("retry", url, e, flush=True); time.sleep(3 + i * 3)
    raise SystemExit("failed " + url)
html = get("https://www.ea.com/games/madden-nfl/ratings")
build = re.search(r'"buildId":"([^"]+)"', html).group(1)
base = f"https://www.ea.com/_next/data/{build}/en/games/madden-nfl/ratings"
root = json.loads(get(f"{base}.json?franchiseSlug=madden-nfl"))
teams = [t for g in root["pageProps"]["ratingsFilters"]["teamGroups"] for t in g["teams"]]
out = {"iteration": None, "players": []}
for t in teams:
    slug = re.sub(r"[^a-z0-9]+", "-", t["label"].lower()).strip("-")
    d = json.loads(get(f"{base}/teams-ratings/{slug}/{t['id']}.json?franchiseSlug=madden-nfl&pageType=teams-ratings&slug1={slug}&slug2={t['id']}"))
    items = d["pageProps"]["ratingsEntries"]["items"]
    for p in items:
        out["iteration"] = (p.get("iteration") or {}).get("label")
        out["players"].append({"fn": p["firstName"], "ln": p["lastName"], "team": t["label"], "pos": p["position"]["id"], "ovr": p["overallRating"], "bd": p.get("birthdate", "")[:10], "jn": p.get("jerseyNum")})
    print(t["label"], len(items), flush=True)
    time.sleep(0.5)
json.dump(out, open(sys.argv[1] if len(sys.argv) > 1 else "ea_ratings.json", "w"))
print("players", len(out["players"]), out["iteration"])
