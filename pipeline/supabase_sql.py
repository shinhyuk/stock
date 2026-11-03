#!/usr/bin/env python3
"""Run a .sql file on the Supabase project through the Management API (no database password needed).

    SUPABASE_ACCESS_TOKEN=... REF=<project ref> python3 pipeline/supabase_sql.py file.sql
"""
import json
import os
import sys
import urllib.error
import urllib.request


def main(path):
    token, ref = os.environ["SUPABASE_ACCESS_TOKEN"], os.environ["REF"]
    with open(path, encoding="utf-8") as fh:
        sql = fh.read()
    req = urllib.request.Request(
        "https://api.supabase.com/v1/projects/%s/database/query" % ref, method="POST",
        data=json.dumps({"query": sql}).encode(),
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json",
                 "User-Agent": "stock-trader-setup"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            print("%s: ok (%s)" % (os.path.basename(path), r.status))
    except urllib.error.HTTPError as e:
        print("::error::%s: HTTP %s %s" % (os.path.basename(path), e.code, e.read().decode()[:500]))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
