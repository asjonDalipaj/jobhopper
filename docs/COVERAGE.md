# Coverage research

Research log for JobHopper’s source coverage. These are findings and decisions, not coding rules —
the practices skill points here instead of carrying the measurements.

Last updated: 2026-11-13.

## Hiring.cafe’s playbook

The public write-up describes Hiring.cafe as a crawler over **tens of thousands of employer websites,
twice a day**, with AI extracting and summarizing postings. It is direct-from-employer and reaches ~1.5M
jobs. The lesson is **generic crawling + structured extraction**, not a hand-written scraper per site.

Reference: [Business Insider — the ex-Meta engineer and Stanford PhD student taking on job sites](https://www.businessinsider.com/hiring-cafe-job-site-ex-meta-stanford-phd-2024-8)

### What changed since that write-up (2026-11-13)

- **Scale.** The founders' own [scaling post](https://blog.hiring.cafe/p/scaling-hiringcafe-from-0-to-1m-users)
  says every job is scraped from employer career pages, never user-posted. A September 2026 Reddit update
  puts the index at **5.9M jobs / 220K remote**; a 2026-09-28 company profile says the crawler covers
  **130,000+ company websites ~3×/day** and that listings are filtered for suspicious roles, ghost jobs
  and MLM-style postings, with salary, location, work mode **and visa sponsorship** as first-class
  filters. ([profile](https://devcuration.com/articles/company-spotlight-hiringcafe-com))
- **The extraction prompt is open source.** Co-founder Hamed published the schema and the exact call:
  `gpt-4o-mini`, OpenAI structured outputs (`json_schema`, `strict: true`), `temperature: 0`, prompt
  "job_information.job_description is the most truthful field".
  ([gist](https://gist.github.com/hamedn/b8bfc56afa91a3f397d8725e74596cf2)) Fields:
  `company_name`, `company_website`, `title`, `category` (function enum), `employment_type`,
  `workplace_type`, `locations[]`, `salary{min,max,currency,frequency}`, `description_text`,
  `requirements_summary` (≤250 chars), `skills[]`, `experience_min_years`, `posted_at`, `apply_url`,
  `source_url`, `source_name`, `language` (ISO 639-1), `employer_type` (`Internal|External`), `job_id`.
- **This repo already ports the first three fields.** `EXTRACTION_PROMPT` (src/judge/openrouter.ts:25)
  returns `category` with the same enum list, `locations` and `workplace_type`. The missing five —
  `skills`, `experience_min_years`, `salary`, `language`, `employer_type` — are the whole distance
  between this repo's filters and theirs. `employer_type` in particular is the LLM version of our
  hand-rolled agency heuristic in `src/sources/quality.ts`.

**Note on the model.** Their pipeline keeps a role because it is on the career page — the profile
explicitly says the model "does not guarantee that every listed role is actively being filled, because
an employer can leave a stale opening on its own site". There is no posting-age cutoff in a crawler
design; freshness is a ranking input, not a delete rule. That is the structural difference from this
repo, and the one worth copying first.

## The gap is retention, not reach (2026-11-13)

Measured against the committed snapshot and live boards, before any new source was added:

- **Snapshot.** 531 rows, 248 `fair`/`strong`, but only **68 inside the 3-day window**. The board
  *displays* all of them — the window is an ingest filter, so the other 180 are never re-fetched or
  re-verified by a fresh scan and survive only because the snapshot accumulates. Of the 23 `strong`
  verdicts, **18 are 7–14 days old** and only **1** is inside the 3-day window — the best rows are
  systematically the ones a fresh scan refuses to store.
- **Ingest.** The cutoff is enforced *before* the DB (`src/sources/scan.ts:64`), so a role posted 4 days
  ago is never stored — not filtered, not ranked, discarded. `src/market.ts` set
  `TARGET_MARKET_MAX_AGE_DAYS = 3` as the scan gate.
- **Live boards.** Re-probed 14 registered boards (5,296 postings returned): 354 in NL/IT/ES, 92
  role-relevant, **39 fresh** — so **53 of 92 (58%)** of everything that passed the market and role
  gates was dropped only for age. Largest single board: `ashby/bjakcareer`, 3,156 postings, 181 NL/IT/ES,
  65 relevant, 34 fresh, 31 lost to age.
- **`posted_at` was fiction on Greenhouse.** The adapter read `updated_at`, which a bulk edit rewrites for
  a whole board (45 of 52 bol.com rows differed from `first_published`; all 52 shared one `updated_at`).
  The API exposes `first_published`; the adapter now prefers it.

Reproduction: `.jobhopper/tmp-research/probe-age.mjs` (untracked, like the other spike artifacts).

### What changed (2026-11-15)

The ingest gate is now a **30-day floor** (`MAX_JOB_AGE_DAYS`), not a 3-day window, and `last_seen`
records whether a board still lists a row. Cleanup keeps judged/applied history forever and drops
unjudged rows only after 7 days unseen. An isolated full scan against a copy of the real snapshot:

- 531 rows seeded with 531 verdicts restored → **zero** re-judging of known rows.
- 29,827 postings fetched → **74 new identities, all 4–23 days old** — exactly the band the old gate
  deleted. Snapshot 531 → 605 with nothing lost.
- 201 seeded rows were re-returned by their boards and stamped; 330 were not (history that would
  otherwise look live).

The correction worth remembering: the 3-day rule never *hid* rows from the board — it stopped them being
discovered. Retention buys coverage, not visibility.

## Common Crawl as a company index (2026-11-13)

The cheapest way to grow the board universe without scraping. Verified live on this machine, snapshot
`CC-MAIN-2026-43` (latest of 129 per `index.commoncrawl.org/collinfo.json`):

- Query shape `<cdx-api>?url=<host>/*&output=json&page=N`; the tenant is the first non-empty path
  segment. This only works for ATSs with one known tenant host — it cannot search by page signature
  across arbitrary domains, so self-hosted career pages stay out of reach.
- **Measured slugs, one page each:** `jobs.ashbyhq.com` → 4,105 records → **1,080 slugs**;
  `job-boards.greenhouse.io` → 9,123 → **357**; **1,385 untracked** after removing the 198-board
  registry. The full universe is several pages per host.
- **Yield is the problem, not size.** Random probe of 80 untracked boards: 78 live, **1** with any
  NL/IT/ES software role (DuckDuckGo, Spain-remote, 4 months old), **0** fresh. ~1.3% per board.
  Breadth without a geo signal is noise: the universe is global and mostly US.
- **Lever is invisible.** `jobs.lever.co/robots.txt` disallows `CCBot` outright (`User-agent: CCBot /
  Disallow: /`) and sets `Content-Signal: search=yes, ai-train=no`. No Lever board ever reaches the CDX
  index. `boards.greenhouse.io` still indexes, but the CDX API 504s intermittently on it — per-page
  error tolerance is mandatory, not optional.
- **Case matters once.** ATS board ids are case-insensitive, so case-preserving discovery manufactures
  hundreds of duplicate companies (the reference implementation hit 415 collision groups on Ashby).
  Dedupe case-folded.

Prior art and the reference measurements: [freehire's commoncrawl-board-discovery
design](https://github.com/strelov1/freehire/blob/0fa495ba1a8cf0d9bece50554f569dff97bbbbb8/openspec/changes/commoncrawl-board-discovery/design.md)
(one snapshot → 1,789 Greenhouse slugs, 412 new; 407 Ashby; after live validation +24 Greenhouse, +178
Ashby). Their spike is US-shaped; the 1.3% figure above is this repo's three-country measurement.

## Italy: what the open dataset actually contains

Source: the JobHive / ats-scrapers parquet slices already used by `scripts/import-boards.py`.

- **6,512** Italian postings in the local slices.
- Only **168 (2.6%)** pass the software-title gate.
- Those 168 sit on **35 hosts**, overwhelmingly known ATSs:
  - SuccessFactors: 51
  - Workday: 32
  - SmartRecruiters: 27
  - Ashby: 27
  - Greenhouse: 17
  - Lever: 14

### Career-page spike

Sample: 132 unique non-ATS employer hosts from the supported slices (the dataset did not yield 200).

- 130 sites reachable.
- **1** exposed `schema.org/JobPosting` JSON-LD.
- **0** software titles found.
- Fingerprints: **112 SuccessFactors**, 9 Workday, 5 Greenhouse, 1 each Workable/Recruitee/Phenom.
- The sample was biased toward retail (Lidl, Sephora, Prada), and static HTML cannot see JS-rendered ATS
  shells.

Reproduction artifacts (research only, not committed): `.jobhopper/tmp-e2e/career-spike.json`,
`.jobhopper/tmp-e2e/career-domains.json`, `.jobhopper/tmp-e2e/probe-career-pages.mjs`.

### Live ATS expansion probe

Probed 28 candidates from the software slice: 17 Workday tenants, 3 SuccessFactors, 8 SmartRecruiters.

- Only **Kion Group** had a fresh (≤3 days) Italian software role: R&D Firmware Engineer, 2026-11-04.
- Kion was added, scanned (2 postings, 1 stale), and the judge rejected the fresh role (`no`); the board
  was removed.
- No other board had a fresh software role:
  - Auto1: 5 software, 0 fresh
  - Chiesi: 4/0
  - EssilorLuxottica: 1/0
  - Grünenthal: 1/0
  - Workday tenants (Salesforce, Kyndryl, HPE, Abbott, SaxoBank, etc.): no fresh Italian software

## Aggregators

### Careerjet

- Legacy AFFID path works; the v4 publisher key is a separate credential.
- `https://public.api.careerjet.net` fails TLS; the HTTP endpoint works **only with a `Referer` header**
  (otherwise 403 “Undeclared referrer”).
- Adapter sends `Referer: https://jobhopper.pages.dev/`, queries IT/ES/NL with `software`, `developer`,
  `data engineer`, and is throttled to 6h.
- Live: **161 unique, 45 Italy, 10 fresh software**.
- API docs: <https://www.careerjet.com/partners/api/>

### Jooble

- Keys are **country-specific**; the Italy key comes from `it.jooble.org`.
- Free plan: **500 requests lifetime**, so the adapter queries Italy only and is throttled to **24h**.
- Jooble labels Italy **“Italian Republic”**; that alias is in `market.ts`.
- Live: **51 unique, 51 Italy, 6 software, 0 fresh**.
- API docs: <https://help.jooble.org/en/support/solutions/articles/60001448238>

### Full scan after aggregator coverage

- 25 new rows (24 Careerjet, 1 Greenhouse/Grafana).
- Snapshot: **338 rows**, Italy **28**.
- Quick verdicts: **1 strong / 9 fair / 15 weak**; 10 rejected.
- Careerjet is **recruiter/agency-heavy** (CarusiHR, Techyon, Welyk, FORTIL, MC Engineering); weak rows are
  mostly agencies. It is coverage, not direct-employer quality; the judge remains the gate.

### Directness quality gate

The 24 aggregator rows were cleaned on 2026-11-06: **22 removed** (15 weak plus agency/consultancy fair
rows), leaving one fair direct row (TomTom). Snapshot: **315 rows**, Italy **21**.

New aggregator rows must be **fair/strong** and not agency-shaped; the heuristic uses known names
(CarusiHR, Techyon, Welyk, FORTIL, Grafton, Accenture, Avanade, etc.), recruiter/talent/staffing/consult
patterns and "our client"/"recruiting for" description phrases. Direct ATS boards are unaffected.

This keeps aggregators as **discovery coverage**, not a source of recruiter noise. The heuristic is not
perfect; the judge remains the final quality gate.

## Decision

1. The 3-day Italian ATS slice is **exhausted**; do not re-probe the same boards.
2. Aggregators add coverage but also agency/weak noise. The next quality step is filtering aggregator
   `weak` (or agency) rows if the feed gets too noisy.
3. Do not build a generic JSON-LD career-page crawler for Italy yet. It needs a **software-filtered
   employer-domain universe** and a headless/sitemap sample that shows real yield.
4. Treat per-site “ChatGPT scrapers” as an anti-pattern. Use structured data and known ATS APIs; LLM
   extraction is a fallback, not a scraper generator.
5. Hiring.cafe-scale coverage comes from the **company-domain universe**, not more parsing of the same ATS
   shells.
6. **2026-11-13 — retention before reach. Done 2026-11-15.** The ingest gate no longer deletes rows that
   passed the market and role gates; it keeps them while their board still lists them and makes posting
   age a rank. Sources come second.
7. **2026-11-13 — copy their schema, not their crawler.** The extraction prompt is public; mirroring its
   five missing fields is one prompt change and buys their entire filter surface.
8. **2026-11-13 — Common Crawl is a candidate generator, not a source.** It is cheap and correct for
   enumerating Greenhouse/Ashby tenants and useless for Lever. Yield is ~1.3% per random board, so a
   geo signal (the `country_iso` slices that already worked for Italy) must run *before* live probing.

See `NEXT_STEPS.md` for dated plans and acceptance criteria; this file holds the measured findings.
