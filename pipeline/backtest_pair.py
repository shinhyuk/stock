#!/usr/bin/env python3
"""Backtest a stock and its inverse ETF with the auto trader's rule, on Yahoo's last 60 days of 5-minute bars.

    python3 pipeline/backtest_pair.py --long NVDA --short NVD      # -> site/data/backtest/NVDA-NVD.json

The rule, the same one the dashboard and supabase/functions/trader use:
  opening range = 9:30-9:45; buy at the close of the first 5-minute bar that closes above the range high
  (no new buys after 11:30); stop = the range midpoint; target = entry + 1R (also 2R, for comparison);
  out at the stop, the target or 15:50, whichever comes first. A bar that touches both counts as the stop.
  A bar that opens through the stop or the target fills at its open. One trade a day per strategy.

Strategies: the stock only, the inverse only, and "both" - each day whichever of the two breaks out first
(the stock on an up morning, the inverse on a down morning). Sized two ways on 1,000,000 won: the auto
trader's limits (lose at most $10 a trade, at most 45% of the account in one stock) and all-in.
Commission 0.25% a side. Not a prediction: 60 days is a short sample.
"""
import argparse
import datetime
import json
import math
import os
import sys
import urllib.request
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from names import usd_krw  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NY = ZoneInfo("America/New_York")
FEE = 0.0025
ACCOUNT_KRW = 1_000_000
MAX_LOSS_USD, POSITION_PCT = 10.0, 0.45
OR_BARS = 3                    # 9:30, 9:35, 9:40
LAST_ENTRY = datetime.time(11, 30)
FLAT = datetime.time(15, 45)   # the bar that starts 15:45 closes 15:50


def fetch(symbol):
    url = ("https://query1.finance.yahoo.com/v8/finance/chart/%s?interval=5m&range=60d&includePrePost=false"
           % symbol)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (day-trader-skill backtest)"})
    r = json.load(urllib.request.urlopen(req, timeout=60))["chart"]["result"][0]
    q = r["indicators"]["quote"][0]
    days = {}
    for i, ts in enumerate(r["timestamp"]):
        o, h, lo, c = q["open"][i], q["high"][i], q["low"][i], q["close"][i]
        if None in (o, h, lo, c):
            continue
        t = datetime.datetime.fromtimestamp(ts, NY)
        if datetime.time(9, 30) <= t.time() < datetime.time(16, 0):
            days.setdefault(t.date().isoformat(), []).append(
                {"t": t.strftime("%H:%M"), "o": o, "h": h, "l": lo, "c": c})
    return r["meta"].get("longName") or symbol, days


def breakout(bars):
    """(index, entry, stop, or_high, or_low) of the first close above the opening range, or None."""
    if len(bars) < 60 or [b["t"] for b in bars[:OR_BARS]] != ["09:30", "09:35", "09:40"]:
        return None
    oh, ol = max(b["h"] for b in bars[:OR_BARS]), min(b["l"] for b in bars[:OR_BARS])
    for k in range(OR_BARS, len(bars)):
        closes = (datetime.datetime.strptime(bars[k]["t"], "%H:%M") + datetime.timedelta(minutes=5)).time()
        if closes > LAST_ENTRY:
            return None
        if bars[k]["c"] > oh:
            return k, bars[k]["c"], (oh + ol) / 2, oh, ol
    return None


def run_out(bars, k, entry, stop, target):
    """(exit price, reason, time) walking the bars after the entry bar."""
    for b in bars[k + 1:]:
        if b["o"] <= stop:
            return b["o"], "stop", b["t"]
        if b["o"] >= target:
            return b["o"], "target", b["t"]
        if b["l"] <= stop:
            return stop, "stop", b["t"]
        if b["h"] >= target:
            return target, "target", b["t"]
        if b["t"] >= FLAT.strftime("%H:%M"):
            return b["c"], "close", "15:50"
    return bars[-1]["c"], "close", bars[-1]["t"]


def size(entry, stop, account_usd, all_in):
    if all_in:
        return math.floor(account_usd / (entry * (1 + FEE)))
    return max(0, min(math.floor(MAX_LOSS_USD / (entry - stop)), math.floor(account_usd * POSITION_PCT / entry)))


def trade(sym, bars, r_mult, account_usd, all_in, fx):
    b = breakout(bars)
    if not b:
        return None
    k, entry, stop, oh, ol = b
    if entry - stop <= 0.01:
        return None
    target = entry + r_mult * (entry - stop)
    price, reason, out_t = run_out(bars, k, entry, stop, target)
    qty = size(entry, stop, account_usd, all_in)
    if qty < 1:
        return {"symbol": sym, "skip": "1주도 안 됨", "entry": round(entry, 2)}
    gross = (price - entry) * qty
    fees = (price + entry) * qty * FEE
    t_in = (datetime.datetime.strptime(bars[k]["t"], "%H:%M") + datetime.timedelta(minutes=5)).strftime("%H:%M")
    return {"symbol": sym, "in_t": t_in, "out_t": out_t, "entry": round(entry, 2), "stop": round(stop, 2),
            "target": round(target, 2), "exit": round(price, 2), "reason": reason, "qty": qty,
            "pnl_krw": round((gross - fees) * fx), "gross_krw": round(gross * fx), "fee_krw": round(fees * fx),
            "invest_krw": round(entry * qty * fx)}


def summarize(trades):
    done = [t for t in trades if t and "pnl_krw" in t]
    eq, peak, mdd, curve = 0, 0, 0, []
    for t in trades:
        if t and "pnl_krw" in t:
            eq += t["pnl_krw"]
        peak = max(peak, eq)
        mdd = min(mdd, eq - peak)
        curve.append(eq)
    wins = [t for t in done if t["pnl_krw"] > 0]
    return {"n": len(done), "wins": len(wins), "total_krw": eq, "max_drawdown_krw": mdd, "curve": curve,
            "fees_krw": sum(t["fee_krw"] for t in done), "gross_krw": sum(t["gross_krw"] for t in done),
            "best_krw": max((t["pnl_krw"] for t in done), default=0),
            "worst_krw": min((t["pnl_krw"] for t in done), default=0),
            "reasons": {r: sum(1 for t in done if t["reason"] == r) for r in ("target", "stop", "close")}}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--long", default="NVDA")
    ap.add_argument("--short", default="NVD")
    a = ap.parse_args(argv)
    fx = usd_krw() or 1400.0
    account_usd = ACCOUNT_KRW / fx
    long_name, L = fetch(a.long)
    short_name, S = fetch(a.short)
    days = sorted(set(L) & set(S))

    out = {"long": {"symbol": a.long, "name": long_name}, "short": {"symbol": a.short, "name": short_name},
           "days": days, "fx_krw": fx, "account_krw": ACCOUNT_KRW, "fee": FEE,
           "generated_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "hold": {}, "runs": []}
    for sym, data in ((a.long, L), (a.short, S)):
        first, last = data[days[0]][0]["o"], data[days[-1]][-1]["c"]
        q = math.floor(account_usd / first)
        out["hold"][sym] = {"from": round(first, 2), "to": round(last, 2),
                            "pnl_krw": round(((last - first) * q - (first + last) * q * FEE) * fx)}

    for r_mult in (1.0, 2.0):
        for all_in in (False, True):
            per = {"long": [], "short": [], "both": []}
            for d in days:
                tl = trade(a.long, L[d], r_mult, account_usd, all_in, fx)
                ts = trade(a.short, S[d], r_mult, account_usd, all_in, fx)
                per["long"].append(tl)
                per["short"].append(ts)
                pick = [t for t in (tl, ts) if t and "pnl_krw" in t]
                per["both"].append(min(pick, key=lambda t: (t["in_t"], t["symbol"] != a.long)) if pick else None)
            for key, trades in per.items():
                out["runs"].append({"strategy": key, "r": r_mult, "all_in": all_in,
                                    "summary": summarize(trades), "trades": trades})
    path = os.path.join(ROOT, "site", "data", "backtest", "%s-%s.json" % (a.long, a.short))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print("%s ~ %s, %d sessions, $1 = %s won. Wrote %s" % (days[0], days[-1], len(days), fx, os.path.relpath(path, ROOT)))
    for run in out["runs"]:
        s = run["summary"]
        print("  %-5s %gR %-6s trades %2d  wins %2d  total %+9s won  mdd %9s  fees %7s" % (
            run["strategy"], run["r"], "all-in" if run["all_in"] else "rules", s["n"], s["wins"],
            "{:,}".format(s["total_krw"]), "{:,}".format(s["max_drawdown_krw"]), "{:,}".format(s["fees_krw"])))
    for sym, h in out["hold"].items():
        print("  hold %s %s -> %s: %+d won" % (sym, h["from"], h["to"], h["pnl_krw"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
