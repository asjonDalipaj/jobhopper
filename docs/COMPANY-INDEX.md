# Company index

The company index is the part of JobHopper that decides **which employer
boards exist**. Fetching is cheap; knowing 80K employer career pages is the
moat (this is the hiring.cafe lesson: company-first, direct from employers, not
job-board scraping).

We grow the index offline from the open
[JobHive / ats-scrapers dataset](https://github.com/kalil0321/ats-scrapers):
5M rows, 80K companies, 64 ATS sources, MIT-licensed, with `country_iso` and
`apply_url` per posting. The pipeline keeps only the target countries, derives
an ATS tenant from each URL, probes the board live, and produces a reviewed
candidate list.

## Pipeline

```
JobHive parquet (per ATS)
  → scripts/import-boards.py   DuckDB: country_iso ∈ {IT,ES,NL}
  → scripts/probe-boards.mjs   live fetchCompany + role gate
  → .jobhopper/exports/board-candidates.{json,md}
  → review → add lines to src/sources/companies.ts
```

## Run it locally

DuckDB is needed only for the importer (not for normal `scan`/`judge`):

```bash
python3 -m venv .jobhopper/venv
.jobhopper/venv/bin/pip install duckdb

npm run build                                   # the prober imports dist/
.jobhopper/venv/bin/python scripts/import-boards.py --countries IT,ES,NL
node scripts/probe-boards.mjs
```

`npm run boards:discover` does the same when `duckdb` is importable by the
`python3` on your PATH. Parquet files are cached in `.jobhopper/tmp/parquet`
(gitignored); Workday is excluded by default (453 MB, no Italian software
boards yet — pass `--ats ...,workday` to include it).

### Options

```bash
# one or more ATSs
python scripts/import-boards.py --ats ashby,lever --countries IT

# other markets
python scripts/import-boards.py --countries ES,NL

# control the raw output
python scripts/import-boards.py --out /tmp/rows.json
```

The importer writes `.jobhopper/tmp/board-rows.json` (raw rows) and the prober
writes:

- `.jobhopper/exports/board-candidates.json` — verified boards with live counts
- `.jobhopper/exports/board-candidates.md` — the review table

## Deriving the tenant

The dataset stores a **job URL**, not the board token (`ats_id` is the job id).
The prober derives the token only for standard hosts; custom domains are
skipped.

| ATS | URL shape | Token |
|---|---|---|
| Ashby | `jobs.ashbyhq.com/<slug>/<id>` | `<slug>` |
| Lever | `jobs.lever.co/<slug>/<id>` (or `jobs.eu.lever.co`) | `<slug>` |
| Greenhouse | `job-boards.greenhouse.io/<slug>/jobs/<id>` | `<slug>` |
| SmartRecruiters | `jobs.smartrecruiters.com/<slug>/<id>` | `<slug>` |
| Workable | `apply.workable.com/<slug>/j/<id>` | `<slug>` |
| Teamtailor | `<slug>.teamtailor.com/jobs/<id>` | `<slug>` |
| Recruitee | `<slug>.recruitee.com/o/...` | `<slug>` |
| Workday | `<tenant>.wd<N>.myworkdayjobs.com/<site>/job/...` | `<tenant>\\|<shard>\\|<site>` |

## Review rules

Add a board only when **all** hold:

1. The live probe found at least one **target-market software** role
   (`live.countries.IT/ES/NL > 0`).
2. The employer is the actual company, not a job board, staffing agency, or
   tutoring marketplace (`letuelezioni`, `tuolavoro`, …).
3. The live roles are software, not hardware/QA/construction that happened to
   match `test engineer` / `qa` / `embedded`.
4. It is not already in `companies.ts` (check the token).

Then add one line with the right helper (`gh`, `lv`, `as`, `wk`, `tt`, `rc`,
`sr`, `wd`) and run:

```bash
jobhopper companies verify
jobhopper scan -c <Company>
```

Do **not** add every candidate automatically: the gate lets some
non-software titles through, and dead/renamed tenants should never pad the
registry.

## Monthly workflow

`.github/workflows/discover-boards.yml` runs on the 1st at 06:00 UTC and on
demand. It installs DuckDB, imports the default ATSs for IT/ES/NL, probes live,
and commits the refreshed `board-candidates.{json,md}`. It never edits
`companies.ts` or the snapshot; review the report and add boards manually.

## Results so far (2026-11-02)

- Ashby 124 Italian rows, Lever 152, Greenhouse 566, SmartRecruiters 1,615 =
  **2,457 rows → 207 tenants → 34 with software titles → 20 new boards**
  (Kong, Speechify, Sysdig, Sopra Steria, Stäubli, WeRoad, Byte-code, …).
- Workday: 1,101 Italian rows across 190 tenants, but the four live matches were
  hardware/QA → none added.
- EURES: the public EU feed had **zero** software titles in a 500-row probe →
  adapter kept, not wired.

## Limits

- **Only supported ATSs are imported.** SuccessFactors (321K rows), Oracle
  (297K), iCIMS (211K) and Phenom (133K) dominate the remaining dataset; each
  needs its own adapter (see [ADDING-A-SOURCE.md](ADDING-A-SOURCE.md)).
- **Custom domains are skipped** because the tenant cannot be derived from the
  job URL.
- **The dataset is a snapshot.** It tells you which company/tenant exists; the
  live probe decides whether the board still works. Postings themselves are
  always fetched live.
- **Downloads are large.** The default slices are ~800 MB of parquet (Workday
  excluded); the monthly job re-downloads them because CI has no cache.
