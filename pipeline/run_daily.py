#!/usr/bin/env python3
"""Run the day-trader-skill tools once and write the day's results for the dashboard.

    scanner (opening-range breakouts at 10:15) -> exit (stop / target) -> timemachine (10,000 replays)
    -> news (headlines)  =>  site/data/days/YYYY-MM-DD.json + site/data/index.json

    python3 pipeline/run_daily.py            # today, every US stock (Nasdaq Trader list), live Yahoo data
    python3 pipeline/run_daily.py --list     # today, only the tickers in pipeline/universe.txt
    python3 pipeline/run_daily.py --tickers NVDA,PLTR,SOFI   # today, only these
    python3 pipeline/run_daily.py --demo     # the README's TSLA example, 2026-10-19, from saved data

Only standard-library Python. Nothing here can place an order.
"""
import argparse
import concurrent.futures
import datetime
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKILLS = os.path.join(ROOT, ".claude", "skills")
DEMO = os.path.join(ROOT, "pipeline", "demo")
DATA = os.path.join(ROOT, "site", "data")
WORK = os.path.join(ROOT, "trader", "pipeline")

try:
    from zoneinfo import ZoneInfo
    NY = ZoneInfo("America/New_York")
except Exception:  # pragma: no cover - zoneinfo is in 3.9+
    NY = None


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def tool(skill, script, *args):
    """Run one skill's tool with --json and return (exit code, parsed JSON or None, stderr)."""
    cmd = [sys.executable, os.path.join(SKILLS, skill, script)] + [str(a) for a in args]
    log("$ " + " ".join(cmd[1:]))
    p = subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT, timeout=1800)
    try:
        doc = json.loads(p.stdout) if p.stdout.strip() else None
    except ValueError:
        doc = None
    if p.returncode not in (0, 1) or doc is None:
        log((p.stderr or p.stdout).strip()[-800:])
    return p.returncode, doc, p.stderr.strip()


def read_symbols(path):
    out = []
    with open(path, encoding="utf-8") as fh:
        for ln in fh:
            ln = ln.split("#")[0].strip().upper()
            if ln:
                out.append(ln)
    return out


def last_session(now_utc, at):
    """The latest New York session whose opening range is done by `at`: today once it is past `at`
    on a trading day, else the trading day before (weekends and the scanner's NYSE holidays skipped)."""
    with open(os.path.join(SKILLS, "trader-scanner", "scan.py"), encoding="utf-8") as fh:
        holidays = set(re.findall(r'"(\d{4}-\d{2}-\d{2})": "', fh.read()))
    local = now_utc.astimezone(NY) if NY else now_utc
    day = local.date()
    if local.strftime("%H:%M") < at:
        day -= datetime.timedelta(days=1)
    while day.weekday() >= 5 or day.isoformat() in holidays:
        day -= datetime.timedelta(days=1)
    return day.isoformat()


def slim_tm(doc):
    """Keep what the dashboard draws; the 2,000 sample paths are too heavy for a web page."""
    mc = {k: v for k, v in doc["mc"].items() if k != "sample_paths"}
    hist = dict(doc["history"], trades=[{k: x.get(k) for k in ("date", "time", "entry", "outcome", "R")}
                                        for x in doc["history"].get("trades") or []])
    return {"plan": doc["plan"], "mc": mc, "history": hist, "verdict": doc["verdict"],
            "verdict_notes": doc.get("verdict_notes") or [], "warnings": doc.get("warnings") or [],
            "data": doc.get("data"), "note": doc.get("note"), "source": doc.get("source")}


def update_index(day_doc):
    path = os.path.join(DATA, "index.json")
    idx = {"days": []}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            idx = json.load(fh)
    key = day_doc["id"]
    idx["days"] = [d for d in idx.get("days", []) if d["id"] != key]
    idx["days"].append({
        "id": key, "date": day_doc["date"], "demo": day_doc["demo"], "status": day_doc["status"],
        "scope": day_doc.get("scope"),
        "hits": day_doc["scan"].get("hits", 0), "replayed": len(day_doc["trades"]),
        "verdicts": [t["tm"]["verdict"].split(":")[0] for t in day_doc["trades"] if t.get("tm")],
    })
    idx["days"].sort(key=lambda d: (d["date"], not d["demo"]), reverse=True)
    idx["updated_at"] = day_doc["generated_at"]
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(idx, fh, ensure_ascii=False, indent=1)
        fh.write("\n")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--demo", action="store_true", help="the TSLA 2026-10-19 example from saved data")
    ap.add_argument("--at", default="10:15", help="scan the opening-range breakouts up to this New York time")
    ap.add_argument("--date", help="YYYY-MM-DD within the last 6 days (default: the latest session, see last_session)")
    ap.add_argument("--list", action="store_true", help="scan pipeline/universe.txt instead of every US stock")
    ap.add_argument("--symbols", default=os.path.join(ROOT, "pipeline", "universe.txt"))
    ap.add_argument("--tickers", help="comma-separated tickers to scan instead (e.g. picked in the Actions tab)")
    ap.add_argument("--top", type=int, default=500, help="how many breakouts get the 10,000 replays")
    ap.add_argument("--workers", type=int, default=4, help="time machines run side by side")
    ap.add_argument("--replays", type=int, default=10000)
    ap.add_argument("--seed", type=int, default=19)
    a = ap.parse_args(argv)

    os.makedirs(WORK, exist_ok=True)
    os.makedirs(os.path.join(DATA, "days"), exist_ok=True)
    now_utc = datetime.datetime.now(datetime.timezone.utc)

    if a.demo:
        day = "2026-10-19"
        scan_src = ["--offline", os.path.join(DEMO, "wall5m-2026-10-19.json.gz")]
        only = {"TSLA": os.path.join(DEMO, "TSLA-60d5m.json.gz")}
        scope = "demo"
    else:
        day = a.date or last_session(now_utc, a.at)
        only = None
        tickers = [t for t in (a.tickers or "").upper().replace(" ", ",").split(",") if t]
        if tickers:
            scan_src, scope = ["--symbols", ",".join(tickers)], "tickers"
        elif a.list:
            scan_src, scope = ["--symbols", ",".join(read_symbols(a.symbols))], "list"
        else:
            # every US-listed common stock, ordinary share and ADR (~5,900) from Nasdaq Trader's lists
            uni = os.path.join(WORK, "universe.txt")
            code, _, err = tool("trader-scanner", "scan.py", "universe", "--out", uni, "--json")
            if os.path.exists(uni):
                scan_src, scope = ["--universe", uni, "--max-confirm", "0"], "all"
            else:
                log("Nasdaq Trader list failed, falling back to pipeline/universe.txt")
                scan_src, scope = ["--symbols", ",".join(read_symbols(a.symbols))], "list"
    now_ny = "%s %s" % (day, a.at)

    day_doc = {"id": day + {"demo": "-demo", "tickers": "-pick"}.get(scope, ""), "date": day, "at": a.at, "demo": a.demo,
               "generated_at": now_utc.strftime("%Y-%m-%dT%H:%M:%SZ"), "status": "ok", "message": None,
               "scope": scope, "tickers": scan_src[1] if scope == "tickers" else None,
               "scan": {}, "trades": [], "news": {}}

    # 1. /trader-scanner: opening-range breakouts so far
    code, scan, err = tool("trader-scanner", "scan.py", "orb", *scan_src, "--now", now_ny,
                           "--out", os.path.join(WORK, "watchlist.json"), "--json", "--quiet")
    if scan is None:
        day_doc["status"] = "no_scan"
        day_doc["message"] = (err.splitlines() or ["scanner failed"])[-1]
    else:
        hits = scan.get("hits") or []
        day_doc["scan"] = {"as_of": scan.get("as_of"), "universe": scan.get("universe"),
                           "scanned": scan.get("scanned"), "failed": scan.get("failed"), "hits": len(hits),
                           "or_minutes": scan.get("or_minutes"), "note": scan.get("note"),
                           "unconfirmed": scan.get("unconfirmed"),
                           "list": [{k: h.get(k) for k in ("symbol", "price", "at", "or_high", "or_low", "pct_over")}
                                    for h in hits]}
        picks = [h for h in hits if h.get("or_high") is not None and h.get("or_low") is not None]
        if only is not None:
            picks = [h for h in picks if h["symbol"] in only]
        picks = picks[:a.top]

        names = [x["symbol"] for x in hits]

        def replay(h):
            sym = h["symbol"]
            plan_path = os.path.join(WORK, "plan-%s.json" % sym)
            tm_path = os.path.join(WORK, "timemachine-%s.json" % sym)
            trade = {"symbol": sym, "hit": day_doc["scan"]["list"][names.index(sym)]}
            # 2. /trader-exit: stop at the range midpoint, target 1x the risk, flat by 3:55 PM
            code, plan, err = tool("trader-exit", "exit.py", "plan", "--symbol", sym, "--entry", h["price"],
                                   "--or-high", h["or_high"], "--or-low", h["or_low"], "--date", day,
                                   "--time", h["at"], "--stop", "or-mid", "--target", "1R",
                                   "--now", now_ny, "--write", plan_path, "--json")
            if plan is None:
                trade["error"] = (err.splitlines() or ["exit plan failed"])[-1]
                return trade
            trade["plan"] = {k: v for k, v in plan.items() if k not in ("note", "created_at", "created_by")}
            # 3. /trader-timemachine: 10,000 replays + every past session the same rule fired
            src = ["--offline", only[sym]] if only else []
            code, tm, err = tool("trader-timemachine", "timemachine.py", "run", "--plan", plan_path, *src,
                                 "--now", now_ny, "--replays", a.replays, "--seed", a.seed,
                                 "--write", tm_path, "--json")
            if tm is None:
                trade["error"] = (err.splitlines() or ["time machine failed"])[-1]
            else:
                with open(tm_path, encoding="utf-8") as fh:
                    trade["tm"] = slim_tm(json.load(fh))
            return trade

        # a few at a time: each one is a single chart request, then pure arithmetic
        with concurrent.futures.ThreadPoolExecutor(max_workers=a.workers) as pool:
            day_doc["trades"] = list(pool.map(replay, picks))

        # 4. /trader-news: the morning's headlines for what got replayed (no SEC, no key needed)
        # only for what did not lean toward the stop, so the headline requests stay few
        tickers = [t["symbol"] for t in day_doc["trades"] if t.get("tm") and t["tm"]["mc"]["avg_R"] > 0
                   and "toward the stop" not in t["tm"]["verdict"]][:40]
        if tickers and not a.demo:
            code, news, err = tool("trader-news", "news.py", "--tickers", *tickers, "--hours", str(18 + 24 * ((now_utc.astimezone(NY).date() - datetime.date.fromisoformat(day)).days if NY else 0)), "--no-sec",
                                   "--no-moves", "--dry-run", "--json")
            for it in (news or {}).get("items") or []:
                lst = day_doc["news"].setdefault(it.get("ticker") or "?", [])
                if len(lst) < 3:
                    lst.append({k: it.get(k) for k in ("title", "link", "time", "source")})
        if not hits:
            day_doc["status"] = "no_hits"

    out = os.path.join(DATA, "days", day_doc["id"] + ".json")
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(day_doc, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write("\n")
    update_index(day_doc)
    log("Wrote %s: %s, %d hit(s), %d replayed." % (os.path.relpath(out, ROOT), day_doc["status"],
                                                   day_doc["scan"].get("hits", 0), len(day_doc["trades"])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
