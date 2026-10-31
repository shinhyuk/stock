"""Company names for tickers (Nasdaq Trader's symbol lists) and the dollar in won (Yahoo), for the dashboard."""
import json
import re
import urllib.request

NASDAQ = "https://www.nasdaqtrader.com/dynamic/SymDir/"
UA = {"User-Agent": "Mozilla/5.0 (day-trader-skill dashboard)"}

# "Apple Inc. - Common Stock" -> "Apple Inc.", "Alcoa Corporation Common Stock" -> "Alcoa Corporation"
TAIL = re.compile(r"\s*(-\s.*|(Class [A-Z] )?(Common Stock|Ordinary Shares?|Common Shares?|American Depositary Shares?)\b.*)$",
                  re.I)


def clean(name):
    name = TAIL.sub("", name.strip()).strip(" ,")
    return name or None


def company_names(timeout=60):
    """{SYMBOL: name} for every Nasdaq- and NYSE-listed security, {} if the lists cannot be read."""
    out = {}
    for fname, sym_col in (("nasdaqlisted.txt", 0), ("otherlisted.txt", 0)):
        try:
            req = urllib.request.Request(NASDAQ + fname, headers=UA)
            text = urllib.request.urlopen(req, timeout=timeout).read().decode("utf-8", "replace")
        except OSError:
            continue
        for ln in text.splitlines()[1:]:
            parts = ln.split("|")
            if len(parts) > 2 and parts[sym_col] and not ln.startswith("File Creation"):
                n = clean(parts[1])
                if n:
                    out.setdefault(parts[sym_col].replace(".", "-").upper(), n)
    return out


def usd_krw(timeout=30):
    """Won per dollar right now, or None."""
    try:
        req = urllib.request.Request("https://query1.finance.yahoo.com/v8/finance/chart/KRW=X?interval=1d&range=5d",
                                     headers=UA)
        meta = json.load(urllib.request.urlopen(req, timeout=timeout))["chart"]["result"][0]["meta"]
        return round(float(meta["regularMarketPrice"]), 1)
    except (OSError, ValueError, KeyError, IndexError, TypeError):
        return None
