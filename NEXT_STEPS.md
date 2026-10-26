# Next steps — JobHopper NL/IT/ES coverage

## Plan — Application history graph (added 2026-10-11, after main @ `a705f10`)

Track the application cycle visually. No new dependencies: hand-rolled SVG.

1. **ActivityPanel component** (`web/src/components/ActivityPanel.tsx`):
   summary tiles (scanned / judged / applied / application rate), a
   per-week bar chart of new jobs discovered (first_seen) vs applications
   (effective appliedAt: localStorage ?? snapshot applied_at), verdict
   distribution bars, and a scanned → judged → applied funnel.
2. **Toggle** in the filter sidebar ("Show activity"); panel renders above
   the job grid; collapses to nothing when off.
3. **Acceptance:** Playwright — with stamped data, tile counts match the
   data, bar heights match weekly counts, toggle shows/hides the panel.

   DONE 2026-10-11 (`ActivityPanel.tsx`): tiles + weekly discovered-vs-applied
   SVG bars + verdict distribution; sidebar Show/Hide activity button. All
   acceptance checks green (tiles 167/70/11/16%, 6+6 bars, ratio-exact
   heights, verdict counts exact).

## Plan — Quality over quantity (added 2026-10-11, after main @ `2b1fdcb`)

Three workstreams: dedupe + first-seen, 3-day freshness window, apply tracking.

### A. Dedupe + first-seen + "new this scan" badge

**State of things:** `upsertJob` (src/db/jobs-repo.ts:33) already dedupes on
`source + external_id` (UNIQUE constraint) and returns `created: boolean`;
`created_at` defaults to `datetime('now')`. But the CI DB is rebuilt every
scheduled run (jobhopper.db is gitignored), so cross-run memory must come from
the committed snapshot — currently the export re-emits rows without
`created_at`, and duplicate `job.id`s appear in the snapshot (37 dupes in the
last one), which also broke React keys (fixed in web, `941a2ea`).

1. **Snapshot carries first-seen + stable identity.** In the `run -j` export
   path (src/cli/index.ts:565-595, jobs-repo `listJobs`): include
   `created_at` (fallback: `posted_at`) per row and dedupe the emitted array
   on `source + external_id` (keep the row with a verdict if dupes collide).
2. **Cross-run first-seen.** Before/at scan time, read the previous committed
   `.jobhopper/exports/jobs.json`, and for rows whose `source+external_id` is
   not in it, treat this run's date as first-seen (overwrite `created_at` in
   the export). This makes the committed snapshot the source of truth for
   "new since last scan", surviving CI DB rebuilds.
3. **Web UI — "New" badge.** `web/src/types.ts` add `first_seen?: string`;
   JobCard renders a small "New" pill when `first_seen` is within the last
   scan window (compare against snapshot generation date, or simply:
   first_seen === max(first_seen) per deploy — simplest: badge rows whose
   first_seen is in the last 3 days). FilterBar gets a "New only" toggle.
4. **Acceptance:** after two consecutive scans, only genuinely new rows get
   the badge; snapshot has 0 duplicate `source+external_id` pairs; ids in
   snapshot may still repeat (fine — web keys no longer use id).

### B. Freshness window: 3 days

**State of things:** `TARGET_MARKET_MAX_AGE_DAYS = 14`, `MAX_JOB_AGE_DAYS = 30`
(src/market.ts:17-18) gate scan ingestion and `purgeStaleAndOffMarket`.

1. Set `TARGET_MARKET_MAX_AGE_DAYS = 3` (keep `MAX_JOB_AGE_DAYS = 30` for
   non-target-market specs if any use it; else set both to 3).
2. Check the GitHub scheduled scan frequency — with a 3-day window the scan
   should run at least 2x/week (ideally daily) or jobs will age out between
   runs and be missed entirely. Adjust cron accordingly.
3. Purge older rows from the committed snapshot on next `run -j` (purge
   already exists via `purgeStaleAndOffMarket`).
4. **Acceptance:** new snapshot contains only jobs posted in the last 3
   days; scan summary shows fewer, fresher rows; badge count from (A) is now
   meaningful ("what's new in the last 3 days").

### C. Apply tracking ("flag as applied?" on Apply click)

**State of things:** JobCard's Apply is a plain `<a href>` to the posting.
The hosted site is static (Cloudflare Pages, no API) — persistence must work
client-side; the local serve API can sync later.

1. **localStorage first (works on the static site + phone).** Intercept
   Apply clicks (JobCard): `confirm('Mark this job as applied?')` → save
   `{source, external_id, appliedAt}` to `localStorage` (key:
   `jobhopper.applied`). Card shows an "Applied <date>" badge; applied jobs
   get a subtle visual state (e.g. reduced opacity + badge).
2. **FilterBar:** "Applied / Not applied" filter option so you can hide what
   you've already done.
3. **Sync into the repo (optional, phase 2):** local `serve` API endpoint
   `POST /api/jobs/:source/:externalId/applied` that writes an
   `applied_at` column (ALTER TABLE jobs ADD COLUMN, migrations via
   connection.ts pragma check) so scheduled snapshots can carry it. Then the
   phone's localStorage merges with committed state. Decide after phase 1
   proves useful.
4. **Acceptance:** clicking Apply on the phone asks, then badges the card;
   reload keeps the state; "Not applied" filter hides applied cards.

### Order of work

1. B first (one-line change + cron check — immediately improves signal). — DONE
   (TARGET_MARKET_MAX_AGE_DAYS = 3, scan runs every 3h, nothing ages out unseen.)
2. A (export dedupe + first_seen, then web badge + toggle). — DONE
   (first_seen stamped at export from the previous committed snapshot; merge
   preserves it; web shows a New pill + New-only toggle, 3-day window. The
   next CI scan stamps all existing rows once — everything is New for one
   cycle, then decays.)
3. C phase 1 (localStorage) — DONE. C phase 2 (DB sync) — DONE.

### Decision log

- **2026-10-11 — purge keeps history (user decision).** `cleanup` now deletes
  only noise: off-market rows and stale rows that were never judged/applied.
  Judged and applied rows are always kept — they are the scan/application
  history the user tracks and wants to graph at the end of the cycle. The
  committed snapshot likewise accumulates (merge never drops rows).
- **2026-10-11 — Workstream A done.** All three workstreams (A/B/C) complete.
  Remaining backlog: application-history graph (end of cycle), CLI/HTML date
  display timezone cleanup (low priority).

---

Saved 2026-10-10. Working tree clean at `4cc0465`.

1. **Fix `String(undefined)` externalId (DONE — see commit below).**
   Caveman review caught it: `p.id` is optional, so a malformed SmartRecruiters
   posting produced `externalId: "undefined"` and a garbage URL. Fix: drop
   id-less postings in `smartrecruitersJobsFromPage` before mapping.

2. **Confirm CI is actually judging. (DONE 2026-10-10 — local run.)**
   Judge loop hit italy-roles (12), spain-roles (30), netherlands-roles (22),
   exited clean, snapshot intact at 155 rows / 23 verdicts. Remaining: merge
   `cline/0ad05` to main so scheduled CI runs pick up the fix (scheduled runs
   execute on main, not the branch).

3. **Judging backlog. (ON HOLD 2026-10-10 — batch 1 done, 10/10 exit 0.)**
   Per-ID judging works reliably; `--all --limit 10` hangs (one slow model
   call blocks the batch). Detached loop: `setsid nohup /tmp/jloop.sh`
   (sequential, 200s timeout each, 5s spacing). 15 judged 2026-10-10.
   Snapshot verdict count lags DB until next `run -j` regeneration.
   ON HOLD per user — no more judging runs until the list is finished.
   NOTE: judging is the only paid step (OpenRouter key); everything else here
   uses free public APIs.

4. **Decide on the `description: ''` gap. (DONE 2026-10-10 — option (a/c) hybrid.)**
   SmartRecruiters judges on title + location only; Recruitee/Teamtailor carry
   full descriptions. Options: (a) fetch `/v1/companies/{token}/postings/{id}`
   per posting (best verdicts, N extra requests — 412 for NielsenIQ, needs
   throttling/caching); (b) accept title-only and document it; (c) lazy-fetch
   descriptions only at judge time for shortlisted rows. Lean: (c), later.
   UPDATE 2026-10-10: detail endpoint verified live —
   GET /v1/companies/{token}/postings/{id} returns jobAd.sections
   (jobDescription, qualifications, companyDescription,
   additionalInformation; HTML, needs stripHtml). No API blocker.
   IMPLEMENTED 2026-10-10 (`969e297`): market-gate survivors fetch full text
   at scan time (sequential, failures keep ''). Live check: NielsenIQ's fresh
   survivor got 5,110 chars; Averna correctly got none (no target-market rows).

5. **More boards. (DONE 2026-10-10 — probed, nothing registered.)**
   Probed 7 SmartRecruiters boards keyless: Averna1 (15, 0 mkt), Freshworks
   (126, 0 mkt), Sandisk (0), Flywire1 (46, 3 ES), HireVue (2, 0 mkt),
   InformaGroupPlc (152, 1 NL), TaylorMade (0). The 4 market hits all died at
   the role/freshness gates (Payroll/Sales/stale). Zero new rows — per ponytail,
   registered nothing. Personio still blocked (no populated board found;
   Aily Labs / Hypatos unprobed — needs their tokens, not keyless-searchable).

6. **Prune `archive/local-judge-run`. (DONE 2026-10-10.)**
   Stash content was fully in HEAD; branch deleted.

7. **Online results without pulling code. (OUT OF SCOPE for now.)**
   Problem: today the only way to see jobs/verdicts is pulling the repo and
   reading the snapshot or running the UI locally. Want: jobs stored somewhere
   online (free) + UI readable online, no pull needed.
   Constraints: repo is private (? confirm); SQLite DB is local-only and not
   committed; UI reads the committed jobs.json snapshot.
   Options to evaluate (free tier):
   (a) GitHub Pages from the repo — snapshot + a static UI published on each
       CI run; private repo => Pages site still needs auth (Enterprise) or make
       the published slice public. Check repo visibility first.
   (b) Commit a rendered static HTML dashboard (already generated per tab) and
       read it via github.com file view — zero infra, ugly but works today.
   (c) Free hosted DB (Supabase/Neon/Turso) + Vercel/Netlify/Cloudflare Pages
       frontend reading it — proper app, needs secrets + small adapter.
   (d) CI posts a verdict digest (top YES/STRONG rows) somewhere readable:
       PR comment, commit message body, Discord/Slack webhook, email.
   Lean first step: (d) digest via webhook + (b) committed HTML, then (a)/(c)
   if daily reading justifies it. Decide: who reads (just you?), how fresh
   (each 3h run or daily?), public-vs-private tolerance for job data.

8. **Caveman code review. (QUEUED — after all other todos.)**
   Full `/caveman-review` pass over the finished work, per user request.

## Plan — Automated CV tailoring (added 2026-10-25, after main @ `8ba9207`)

**State of things:** CVs are hand-made PDFs in `~/Desktop/Personal/Documents/Curriculum`
(12 variants), and `profile/cv.txt` is flat text used only for judging. Nothing in
the CLI can produce a CV, so every application means a manual re-tailor. Judging
already has the LLM plumbing (`src/judge/openrouter.ts`) and profile ownership
(`src/profile/cv.ts`).

**Approach:** the model selects and orders; it never writes facts. A structured
document feeds a deterministic renderer, and a fact gate re-reads the rendered
text before the file is written.

1. **`profile/cv.json` is the source of truth.** Employers, dates, a bullet pool
   per role, skills rows, projects, education. Committed like the rest of
   `profile/`.
2. **`src/cv/render.ts`** renders one A4 page with pdf-lib (new dependency).
   Fixed layout, so the same document and plan always produce the same PDF. If
   content overflows, bullets are trimmed from the longest role but never below
   3 (current role) or 2 (older roles), and the trim is reported, never silent.
3. **`src/cv/tailor.ts`** asks the model for a plan (`headline`, `summary`,
   `skillOrder`, `experienceOrder`, `bulletOrder`, `projectNames`, `keywords`).
   `validatePlan` rejects any employer, skill label, project or bullet string
   that is not verbatim in `cv.json`, caps bullets at 5 (current) / 3 (older),
   and repairs em/en dashes into parentheses or commas.
4. **`src/cv/facts.ts`** re-checks the rendered text: years and percentages must
   exist in `cv.json`, an em or en dash fails the render, dropped employers and
   projects warn. A failed check refuses to write the PDF.
5. **CLI:** `cv render [-o path]` for the base CV, `cv tailor <id> [-o dir]` to
   write `applications/<company>_<title>_<source>_<external_id>/cv.pdf` plus
   `plan.json` (the plan is an artifact, so a bad selection can be inspected
   without paying for another call).

**Acceptance (verified 2026-10-25):**
- `npm test` green, 9 new cases covering wrapping, schema errors, the fact gate,
  plan validation and a real PDF render.
- `cv render` produces a one-page PDF matching the hand-made 2026 CV layout.
- `cv tailor 7109` and `cv tailor 7113` produced different, posting-specific
  plans from the same document; both passed the fact gate on first write.
- The gate caught two real model errors during the run: an em dash in a summary,
  and a project name typo ("RA Bot" for "REA Bot") which was rejected.

**Decisions:**
- **Selection, not generation.** The model may re-word only the headline and
  summary; bullets must be copied verbatim, which is why `bulletOrder` matching
  is exact-after-normalisation.
- **The gate is fatal, not advisory.** Same reasoning as the judging verdicts:
  a CV that claims something the profile cannot back is worse than no CV.
- **No cover letter yet.** Deliberate: prove the CV path first (it is the artifact
  every application needs).
- **Render failures stay loud.** A CV that will not fit one page throws with the
  reason instead of silently shipping two pages.

**Next:** cover letter from the same plan, then the apply adapter
(`apply <id>`): ATS detection from the URL, form fill, upload of
`applications/<stem>/cv.pdf`, stop before the bot check.

## Feature — Auto-fill from the job cards (added 2026-10-26)

**What ships.** A third action on every card, *Auto-fill & apply*, opens a
dialog that runs tailor → cover letter → **a visible browser window with the form
filled**. The human reviews and clicks Submit there; the tool never clicks Submit.
The dialog flips to "Submitted" when the confirmation page appears, and the card
keeps a matching chip ("Waiting for you" → "Submitted"). Artifacts land where the
CLI puts them: `applications/<company>_<title>_<source>_<external_id>/`.

There is still a headless mode (`mode: "fill"`, no window, never submits) for
artifact-only prep; the card action uses `mode: "review"`.

**Where it runs.** The work is local: it needs the CV, `profile/applicant.json`
and a headless browser. `jobhopper ui` owns it; the dialog talks to that server.

Two origins, one feature:
- **Local UI** (`jobhopper ui`): same-origin `/api/*`.
- **Hosted UI** (jobhopper.pages.dev): the static page first probes
  `/api/status` on its own origin (404 there), then `http://localhost:3333`.
  With the local server running, the hosted card is a thin client and fills the
  form on the user's machine. Without it, the button is disabled with
  "Auto-fill runs on your machine: start `jobhopper ui`", and a hint under the
  results count explains it. On a phone or another computer there is no local
  server, so the hosted button stays disabled — by design, not by accident.
- Brave/Chrome may ask for local-network permission (Private Network Access).
  The server answers the PNA preflight (`Access-Control-Allow-Private-Network`),
  and a blocked probe degrades to the disabled state.

**API (local server):**

| Endpoint | Purpose |
|---|---|
| `POST /api/prep` `{source, externalId, steps?, force?, mode?: "fill" \| "review"}` | Start a run → `202 {runId}`; `409` if one is running; `409 {code:"no-display"}` when review needs a desktop |
| `GET /api/prep/:id` | Poll `{run}` (status per step, result) |
| `GET /api/prep/latest[?source&externalId]` | Hydrate card chips in one request |
| `GET /api/artifacts?source&externalId&file=` | `cv.pdf`, `letter.pdf`, `letter.txt`, `form.png`, `plan.json` only |
| `GET /api/status` | Bridge probe, answers `{ok, app, prep, display}` JSON |

**Implementation.** `src/apply/prep.ts` owns the run registry and the sequence;
`serve.ts` exposes it; `web/src/lib/prep.ts` is the client (probe, start, poll,
artifact URLs); `PrepDialog.tsx` renders progress and results; `JobCard` renders
the button and the "CV ready" chip; `App.tsx` probes once and keeps a
`prepByKey` map.

**Caching.** `plan.json` now stores `descriptionHash`. Re-clicking a card reuses
the CV and letter when the description is unchanged (0 model calls, ~40 s for the
fill only). `force: true` (or the dialog's "Force re-prep") re-runs the model.
The fill runs one at a time; tailoring can overlap.

**Verification (2026-10-26):**
- API: 7239 `[cv, letter]` → done in 120 s; second run → both steps reused, 0 ms.
- API: 7238 `[fill]` → 11 filled, 0 blockers (the two US questions answered "No"
  from `profile/applicant.json`).
- UI on `localhost:3333`: dialog ran cached CV + letter + 36 s fill, 9 filled,
  screenshot rendered, no console errors.
- UI on a second origin (`:4173`, static `web/dist` + `jobs.json`, the same shape
  as the hosted deploy): bridge probe resolved `localhost:3333`, button enabled,
  run completed with the screenshot. A job present only in the snapshot (not the
  local DB) returns 404 and the dialog says to run `jobhopper scan` — honest,
  because prep needs the description.
- `npm test`: 67 pass (added `descriptionHash`), `tsc` and `vite build` clean.

**Decisions:**
- **Submit stays human, but it is a button now.** `runPrep` never clicks Submit;
  `mode: "review"` opens the filled form and watches for the confirmation page
  (45 min cap). The CLI's `apply --review` runs the same path, so there is one
  implementation.
- **A waiting review must not block other fills.** Review runs bypass the
  headless fill queue (they are idle while a human reads); headless fills stay
  serialised.
- **No display, no dead end.** Without `DISPLAY`/`WAYLAND_DISPLAY` the endpoint
  answers `409 no-display` and the dialog shows the exact `apply <id> --review`
  command with a copy button. The job id only appears in that fallback.
- **Honest blanks.** Only fields the form actually has are reported as blank;
  absent optional fields (GitHub, consent) are not "missing".
- **Cache on description hash, not timestamps.** Editing the posting re-tailors;
  an unchanged posting never pays twice.
- **Local-only by construction.** Nothing is uploaded; the hosted page only ever
  calls the user's own machine.


## Plan — Provider coverage for auto-fill (added 2026-10-26)

**Survey of the local DB (140 rows).** `greenhouse` 131: 62 on job-boards.greenhouse.io
and 69 embedded on company domains (Elastic 32, Datadog 17, N26 12, Okta/MongoDB/Stripe/Airbnb 8).
`ashby` 8. `smartrecruiters` 1. The registry also lists lever/workable/teamtailor/recruitee
boards with no current rows.

**Done (`feat(apply): resolve custom-hosted Greenhouse forms`).** The filler now finds the
real form instead of assuming it is on the posting URL: page form → `embed/job_app` iframe →
Apply link → Apply button, with one retry for client-rendered careers pages. It ends on the
standard Greenhouse embed page, so the existing fill/verify logic is unchanged.
Live-tested headless: Elastic 11 fields, N26 10, Datadog 10.

**Remaining, in priority order**

1. **Profile answers — done 2026-10-26.** `questions` now carries notice period (1 month)
   and right-to-work ("Everywhere"); `questionsFor()` derives "currently based" from
   city+country and picks the salary expectation from `salaryByCountry` (NL/ES/IT/default)
   using the posting location. Per-application `answers.json` still wins for one-offs.
   Datadog's demographic-survey consent stays unticked on purpose.
2. **Ashby adapter (8 jobs).** Hosted app at `jobs.ashbyhq.com/<org>/<id>/application`.
   Probe its field ids, then implement the same `ApplyResult` contract.
3. **SmartRecruiters (1 job).** Probe whether it serves a fillable form or a one-click UI.
4. **Lever / Workable / Teamtailor / Recruitee.** No current rows; add adapters when they
   appear, behind a capability registry so "no adapter" is reported, not faked.

**Shape.** Split `src/apply/greenhouse.ts` into provider modules behind a common interface
(`resolveUrl(job)`, `fill(page, ctx)`), with the shared attach/verify/answer helpers kept once.
`resolveProvider(job)` stays the single entry point; unsupported ATS still produce the CV and
letter and report the gap. Nothing in the pipeline ever clicks Submit.
