#!/usr/bin/env python3
"""Export board candidates from the JobHive / ats-scrapers open dataset.

Downloads the per-ATS parquet slices, keeps the rows for the target countries,
and writes them to a JSON file for `scripts/probe-boards.mjs`.

Requires DuckDB. Either install it globally or use the repo venv:

    python3 -m venv .jobhopper/venv
    .jobhopper/venv/bin/pip install duckdb
    .jobhopper/venv/bin/python scripts/import-boards.py

Workday is optional (`--ats ...,workday`) because it is a 453 MB download and
has produced no Italian software boards so far.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import time
import urllib.request
from pathlib import Path

DEFAULT_ATS = "ashby,lever,greenhouse,smartrecruiters,workable,teamtailor,recruitee,successfactors"
DEFAULT_COUNTRIES = "IT,ES,NL"
BASE = "https://storage.stapply.ai/jobhive/v1"
CACHE = Path(".jobhopper/tmp/parquet")
DEFAULT_OUT = ".jobhopper/tmp/board-rows.json"


def download(ats: str) -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{ats}.parquet"
    if path.exists() and path.stat().st_size > 0:
        return path
    url = f"{BASE}/{ats}/jobs.parquet"
    print(f"  downloading {url}", flush=True)
    started = time.time()
    request = urllib.request.Request(url, headers={"User-Agent": "jobhopper/0.1"})
    with urllib.request.urlopen(request, timeout=180) as resp, path.open("wb") as out:
        shutil.copyfileobj(resp, out, length=1 << 20)
    print(f"  {path.stat().st_size / 1e6:.1f} MB in {time.time() - started:.0f}s", flush=True)
    return path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ats", default=DEFAULT_ATS, help=f"comma list (default: {DEFAULT_ATS})")
    parser.add_argument("--countries", default=DEFAULT_COUNTRIES, help="ISO codes (default: IT,ES,NL)")
    parser.add_argument("--out", default=DEFAULT_OUT)
    args = parser.parse_args()

    try:
        import duckdb  # type: ignore
    except ImportError:
        print("duckdb is missing. Install it (or use the venv):", file=sys.stderr)
        print("  python3 -m venv .jobhopper/venv && .jobhopper/venv/bin/pip install duckdb", file=sys.stderr)
        return 2

    ats_list = [a.strip() for a in args.ats.split(",") if a.strip()]
    countries = [c.strip().upper() for c in args.countries.split(",") if c.strip()]
    con = duckdb.connect()
    rows: list[dict] = []
    per: dict[str, dict] = {}

    for ats in ats_list:
        try:
            path = download(ats)
        except Exception as exc:  # network/404: report and continue
            print(f"  {ats}: download failed ({exc})", flush=True)
            per[ats] = {"rows": 0, "error": str(exc)}
            continue
        placeholders = ",".join(["?"] * len(countries))
        query = f"""
            SELECT company, title, url, apply_url, location, posted_at, country_iso, ats_type
            FROM read_parquet(?)
            WHERE upper(country_iso) IN ({placeholders})
        """
        try:
            fetched = con.execute(query, [str(path), *countries]).fetchall()
        except Exception as exc:
            print(f"  {ats}: query failed ({exc})", flush=True)
            per[ats] = {"rows": 0, "error": str(exc)}
            continue
        for company, title, url, apply_url, location, posted_at, country, ats_type in fetched:
            rows.append(
                {
                    "ats": ats_type or ats,
                    "company": company,
                    "title": title,
                    "url": url,
                    "apply_url": apply_url,
                    "location": location,
                    "posted_at": posted_at,
                    "country": country,
                }
            )
        per[ats] = {"rows": len(fetched)}
        print(f"  {ats}: {len(fetched)} rows", flush=True)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "countries": countries,
        "ats": ats_list,
        "per_ats": per,
        "rows": rows,
    }
    out.write_text(json.dumps(payload, ensure_ascii=False))
    total = len(rows)
    companies = len({(r["ats"], r["company"]) for r in rows})
    print(f"wrote {total} rows / {companies} company groups to {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
