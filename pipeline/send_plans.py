#!/usr/bin/env python3
"""Send today's picks to the auto trader (the Supabase function in supabase/functions/trader).

    TRADER_URL=https://<project>.supabase.co/functions/v1/trader TRADER_SECRET=... python3 pipeline/send_plans.py

Reads site/data/days/<today>.json written by run_daily.py, keeps the 'pick' grade, best score first,
and posts them. The trader decides on its own whether to buy (price still near the entry, slots and
loss limits left). Only today's live run is sent: a replay of an older session never is.
"""
import datetime
import json
import os
import sys
import urllib.request

from zoneinfo import ZoneInfo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAX_SENT = 5


def main():
    url, secret = os.environ.get("TRADER_URL"), os.environ.get("TRADER_SECRET")
    if not url or not secret:
        print("TRADER_URL / TRADER_SECRET not set: nothing sent.")
        return 0
    today = datetime.datetime.now(ZoneInfo("America/New_York")).date().isoformat()
    path = os.path.join(ROOT, "site", "data", "days", today + ".json")
    if not os.path.exists(path):
        print("No live run for %s (%s): nothing sent." % (today, os.path.relpath(path, ROOT)))
        return 0
    with open(path, encoding="utf-8") as fh:
        day = json.load(fh)
    picks = sorted((t for t in day.get("trades") or [] if t.get("grade") == "pick"),
                   key=lambda t: -t.get("score", 0))[:MAX_SENT]
    plans = [{"symbol": t["symbol"], "entry": t["tm"]["plan"]["entry"], "stop": t["tm"]["plan"]["stop"],
              "target": t["tm"]["plan"]["target"], "score": t["score"], "rank": i + 1,
              "inverse": bool(t["hit"].get("inverse")),
              "p_target": t["tm"]["mc"]["p_target"], "p_stop": t["tm"]["mc"]["p_stop"]}
             for i, t in enumerate(picks)]
    body = json.dumps({"action": "plans", "day": today, "plans": plans}).encode()
    req = urllib.request.Request(url, data=body, method="POST",
                                 headers={"Content-Type": "application/json", "x-trader-secret": secret})
    with urllib.request.urlopen(req, timeout=60) as r:
        print(r.status, r.read().decode()[:500])
    print("Sent %d plan(s) for %s: %s" % (len(plans), today, ", ".join(p["symbol"] for p in plans) or "none"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
