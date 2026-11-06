# Coverage research

Research log for JobHopper’s source coverage. These are findings and decisions, not coding rules —
the practices skill points here instead of carrying the measurements.

Last updated: 2026-11-06.

## Hiring.cafe’s playbook

The public write-up describes Hiring.cafe as a crawler over **tens of thousands of employer websites,
twice a day**, with AI extracting and summarizing postings. It is direct-from-employer and reaches ~1.5M
jobs. The lesson is **generic crawling + structured extraction**, not a hand-written scraper per site.

Reference: [Business Insider — the ex-Meta engineer and Stanford PhD student taking on job sites](https://www.businessinsider.com/hiring-cafe-job-site-ex-meta-stanford-phd-2024-8)

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

See `NEXT_STEPS.md` for dated plans and acceptance criteria; this file holds the measured findings.
