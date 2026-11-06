# Architecture

JobHopper is a local-first pipeline: fetch postings from employer boards,
filter them with a deterministic gate, store them in SQLite, judge them with an
LLM, and publish a static snapshot for the web app.

```
src/sources/* ──► scan.ts ──► market.ts gate ──► SQLite (jobs)
                                                   │
                                                   ├──► judge/ ──► judgments
                                                   │
                                                   └──► export/ ──► jobs.json / HTML
                                                                       │
                                                                       ▼
                                                                 web/ (Pages)
```

## Stages

1. **Fetch** — `src/sources/scan.ts` iterates `DEFAULT_COMPANIES`
   (`src/sources/companies.ts`), calling each adapter's `fetchCompany`. With
   `-a`, aggregators (`fetchAll`) are added. Failures are per-company and never
   abort the scan.
2. **Normalize** — every adapter returns `SourceJob`
   (`src/sources/types.ts`): `externalId`, `source`, `company`, `title`,
   `location`, `workplaceType`, `employmentType`, `url`, `description`,
   `postedAt` (ISO).
3. **Gate** — `passesMarketFilter` in `scan.ts` calls `src/market.ts`:
   - `isTargetMarket(location)` — Italy / Spain / Netherlands aliases and
     cities (word-boundary, case-insensitive).
   - `isFresh(postedAt, now, target)` — 3 days for target markets
     (`TARGET_MARKET_MAX_AGE_DAYS`), 30 days otherwise.
   - `isRelevantRole(title)` — software-engineering and music-production
     keywords, matched on word boundaries; Italian/Spanish/Dutch stems
     (`sviluppator`, `desarrollador`, `ontwikkelaar`, …) use prefix matching.
     Intern/junior/graduate titles are excluded.
4. **Store** — `upsertJob` writes to `jobs` (unique on `source, external_id`)
   and maintains `jobs_fts` (FTS5, porter). `searchJobs`/`listJobs` query them;
   target-country filters use the `matches_country` SQL function registered in
   `src/db/connection.ts`.
5. **Judge** — `judgePosting` (`src/judge/openrouter.ts`) builds the prompt from
   `cv.txt`, `background.md`, `preferences.md`, `constraints.md`, calls
   OpenRouter (or DeepSeek when only `DEEPSEEK_API_KEY` is set), and stores `strong|fair|weak|no` + reasoning in `judgments`.
   `scan` quick-judges new rows and removes `no` rows; `judge --rejudge`
   rescans existing verdicts; `backfill` judges unjudged snapshot rows.
6. **Publish** — `run -j` (`src/cli/index.ts` + `src/jobs/run.ts`) writes a
   `jobs.json` snapshot and HTML dashboards. `mergeSnapshotRows` keeps the
   previous snapshot, refreshes verdicts/applied state, preserves
   `first_seen`, then `inSnapshotScope` drops rows that no longer pass the
   market + role gate (applied rows are always kept). CI commits the snapshot;
   `deploy-pages.yml` builds `web/` with it.
7. **Web** — `web/src/App.tsx` loads `/jobs.json` (static) or `/api/jobs` when a
   local `jobhopper ui` bridge is reachable on `:3333`. The bridge is required
   for prep/apply; the hosted page is read-only.

## Modules

| Module | Responsibility |
|---|---|
| `src/cli/index.ts` | Commander commands, orchestration, output |
| `src/sources/scan.ts` | Fetch loop, gate, insert, quick judge, prune |
| `src/sources/companies.ts` | Curated registry (`gh/lv/as/wk/tt/rc/sr/wd` helpers) |
| `src/sources/*.ts` | One adapter per ATS / aggregator |
| `src/sources/verify.ts` | Live token checks (`companies verify`, `scan --verify`) |
| `src/market.ts` | Market aliases, freshness, role gate, snapshot scope helpers |
| `src/db/` | Schema, jobs/judgments/tabs repositories |
| `src/judge/` | Provider resolver, OpenAI-compatible client, model defaults, prompts |
| `src/jobs/` | Tab definitions and `run -j` |
| `src/export/` | Snapshot merge/scope, HTML, backfill |
| `src/apply/` | CV/letter prep, Greenhouse fill, browser resolution |
| `web/` | React + Tailwind UI |
| `scripts/` | Offline discovery/import (dataset, boards) |

## Data model

- `jobs` — one row per `(source, external_id)`; `posted_at` is ISO; `tags`,
  `category`, `normalized_locations` are optional enrichment.
- `jobs_fts` — FTS5 mirror maintained by the repository layer.
- `judgments` — one row per job (`UNIQUE(job_id)`): verdict, reasoning, model,
  quick flag, timestamp.
- `tabs` / `tab_items` — named shortlists.

## Invariants

- **The gate is at ingestion.** The UI never decides what is in-market; it only
  filters what is already valid. Changing a gate rule does not rewrite history —
  run `cleanup` (DB) or let `run -j` re-filter the snapshot.
- **Snapshot rows are merged, not regenerated.** Applied rows, verdicts and
  `first_seen` survive a re-export. `inSnapshotScope` is the one exception:
  out-of-gate, unapplied rows are removed.
- **One verdict per job.** Editing the profile does not change stored verdicts;
  re-run `judge --rejudge`.
- **No auto-submit.** `src/apply/greenhouse.ts` fills and stops for review.

## Where to change what

| I want to… | Touch |
|---|---|
| add a city/country alias | `src/market.ts` (`ITALY_ALIASES`, `SPAIN_ALIASES`, `NETHERLANDS_ALIASES`) |
| add/remove a role keyword | `src/market.ts` (`ENGINEERING_KEYWORDS`, `ENGINEERING_STEMS`, `MUSIC_KEYWORDS`) |
| change freshness | `TARGET_MARKET_MAX_AGE_DAYS` / `MAX_JOB_AGE_DAYS` in `src/market.ts` |
| add a company board | one line in `src/sources/companies.ts` |
| add an ATS | [ADDING-A-SOURCE.md](ADDING-A-SOURCE.md) |
| change the judge prompt/model | `src/judge/openrouter.ts`, `src/config/config.ts` |
| change the web UI | `web/src/` (`npm run web:dev`) |
| change the snapshot shape | `src/export/html.ts` + `run -j` in `src/cli/index.ts` |
| change CI scanning | `.github/workflows/scheduled-scan.yml` |

## Tests

Pure seams are tested in `src/test/` with fixtures: market gate, country
filter, workflow parsing, HTML, backfill, prep. `npm test` builds first and runs
`node --test dist/test/`. Network calls live behind adapter functions and are
not exercised by unit tests; use `companies verify` and the probe scripts for
live checks.

## Discovery pipeline

The company index is grown offline from the open JobHive dataset — see
[COMPANY-INDEX.md](COMPANY-INDEX.md). It produces a candidate report; adding a
board to `companies.ts` is still a reviewed, manual step.
