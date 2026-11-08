"""Write version.json: a content hash of every file the site loads, so browsers can drop stale cached code.
Run before every commit (tests/run_all does it too)."""
import hashlib, json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
files = sorted([str(p.relative_to(root)) for p in (root / "js").rglob("*.js")] + ["css/style.css", "data/league.json"])
h = hashlib.sha1()
for f in files: h.update((root / f).read_bytes())
(root / "version.json").write_text(json.dumps({"v": h.hexdigest()[:12], "files": files}, indent=0))
print("version", h.hexdigest()[:12], len(files), "files")
