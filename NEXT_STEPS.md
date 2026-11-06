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
2. **Answers for required react-selects — done 2026-10-26.** A placeholder ("Select...")
   used to read as a value, so required dropdowns were never reported; fixed, and the
   sponsorship/citizenship/residency/located-in answers plus the "how should we communicate"
   checkbox group are filled. Elastic now 18 fields / 0 blank, N26 13 / 0.
3. **Ashby adapter (8 jobs).** Hosted app at `jobs.ashbyhq.com/<org>/<id>/application`.
   Probe its field ids, then implement the same `ApplyResult` contract.
4. **SmartRecruiters (1 job).** Probe whether it serves a fillable form or a one-click UI.
5. **Lever / Workable / Teamtailor / Recruitee.** No current rows; add adapters when they
   appear, behind a capability registry so "no adapter" is reported, not faked.

**Shape.** Split `src/apply/greenhouse.ts` into provider modules behind a common interface
(`resolveUrl(job)`, `fill(page, ctx)`), with the shared attach/verify/answer helpers kept once.
`resolveProvider(job)` stays the single entry point; unsupported ATS still produce the CV and
letter and report the gap. Nothing in the pipeline ever clicks Submit.

## Fix — a failed fill hands the form to you (added 2026-10-28)

**Symptom.** On Planet Labs PBC the fill died with `locator.click: Timeout 20000ms exceeded`,
resolved to `li#iti-0__item-nl.iti__country` — and the dialog offered no way forward, so the
application could not be retried at all.

**Root cause.** `pickCountry` matched `[class*="select__option"], [role="option"]`. Greenhouse's
phone widget (`intl-tel-input`) keeps 150+ hidden `<li class="iti__country" role="option">` rows
in the DOM, so "Netherlands" resolved to the phone widget's invisible item instead of the
react-select option. Clicking it could only time out.

The reported trigger was the reviewer typing into the page while the fill ran, which closes the
react-select menu; with no `select__option` left, the union selector matched the phone widget's
rows. Typing explains the trigger, not the failure mode: a closed menu should make the country
blank, never hang on a hidden element. Both the selector and the 20 s click were bugs.

**Behavior now.**
1. `pickCountry` reads only the open react-select menu and requires the option to be visible.
   A hidden match returns `null` (country reported blank), never a 20 s click timeout.
2. Any failure after the form has mounted is non-fatal in review mode: the browser stays open
   at the partially filled form, `run.fillError` says what stopped, and the dialog switches to
   "The form is open, but auto-fill stopped — finish the rest by hand". Headless and
   auto-submit runs still fail loudly.
3. A failed run is no longer terminal: the dialog shows *Open the form again* (reuses the
   cached CV/letter) and *Re-tailor and retry*, plus CV/letter/posting links. The full
   Playwright call log moves behind a "Technical detail" disclosure; the step line keeps only
   the first sentence (`briefError`).

**Verification.** A DOM fixture with 152 hidden `iti__country` rows reproduced the old
resolution (`index 152`, `#iti-0__item-c152`, invisible) while the new locator picked the
visible `select__option`. `npm test` 70 pass, `npm run build:web` clean. Live re-run of the
Planet Labs posting still needs a human submit, as before.

## Fix — prepare a snapshot-only role without a local scan (added 2026-10-29)

**Symptom.** The hosted page lists roles from the committed snapshot; the popup posts only
`{source, externalId}` to the local server, which resolves it against the local SQLite. A role
CI found but this machine never scanned (or one purge removed) returns 404, and the dialog says
to run `jobhopper scan` — advice that cannot work for a posting older than the 3-day ingest
window.

**Approach.** Let the page send the row it already rendered. The server still prefers the local
row (its id, applied flag, freshest description) and falls back to a validated payload with
`id: 0`; nothing may write to the DB with that id. Artifacts are addressed by
`source + external_id + company + title`, so CV/letter links work for non-local rows too.

1. `jobFromPayload()`: source/external_id must match the request, company/title/http(s) url
   required, description capped at 60k.
2. `serve.ts`: `getJobByExternal() ?? jobFromPayload(body.job)`; the `409 no-display` carries
   the local id (or `null`); `/api/artifacts` accepts company+title for unknown rows.
3. Web: `startPrep` sends the job; `artifactUrl` adds company+title; the no-display CLI hint
   uses the server-resolved id and is hidden when the role is not local.
4. Tests for the validator; Playwright check of the handoff/failed dialog states.

**Acceptance.** A role present only in `jobs.json` runs prep from the hosted page with the local
server running; CV and letter links open; a failed run still offers retry.

**Hardening (from review).** The server used to answer `Access-Control-Allow-Origin: *`. With the
job payload in the request, a remote page could POST `{mode:"fill", job:{url:<its own form>}}` and
the filler would attach the CV there (`resolveAts` falls back to `source` for company-hosted
boards). Now only `https://jobhopper.pages.dev` and loopback origins (`localhost`/`127.0.0.1`, any
port) may call the server; everything else gets 403 before the body is read. Preview deployments
are excluded on purpose, and bodies are capped at 1 MB.

**Verification.** 73 node:test cases pass (3 new: accept + mark non-local, reject mismatch/blank/
`javascript:`, cap description). Playwright against a stub bridge: a failed run renders both retry
actions with the call log collapsed; the handoff state renders the warning and the "start over"
hint; no-display renders the no-CLI-id message with no `<pre>`. Live curl: no Origin 200,
`pages.dev` + `localhost:5173` 200 with echoed ACAO, foreign origin 403 for GET, OPTIONS and POST.

## Change — the mark: the supplied crab-and-briefcase artwork (added 2026-10-29)

**Why.** The tab icon was a purple gradient and the header a lucide briefcase on a dark disc:
neither said "JobHopper", and the purple fought the warm palette. The final mark is the artwork
supplied as `job_hopper_logo_v2.svg`: a black briefcase with an orange crab (claws, eyes) on a
yellow disc and speed lines.

**Where.** The supplied file is a VTracer trace (41 paths, 1024px, no viewBox) with the wordmark,
a #FDFDF9 background and a drop shadow baked in. `web/public/favicon.svg` is that trace cropped to
the emblem (`viewBox="168 74 636 636"`), with the background and shadow paths removed so it works
on light and dark surfaces; the wordmark is omitted because the header already sets "JobHopper".
The untraced source lives at `web/src/assets/jobhopper-logo-source.svg` (not deployed). The header
`<img>` is 44px, and `theme-color` is #FDCF26, the disc colour.

**Tab icon.** One SVG is not enough: Safari and iOS want a raster, and `/favicon.svg` was the URL
browsers had cached the old purple mark under. The mark now ships as `jobhopper-mark.svg` (a new
URL, so no stale tab), `favicon-32.png` (transparent) and `apple-touch-icon.png` (180px, full-bleed
#FDCF26 so iOS does not composite it on black); all three are linked in `index.html`.

**Verification.** Playwright header captures at 1000px light, 1000px dark and 390px mobile; a fresh
profile requests `/jobhopper-mark.svg` (the cache-busted URL); PNG and SVG render at 16/32px and the
touch icon at 96px; all three assets serve 200 from `web/dist`.

## Plan — Italy coverage: boards, adapters and the judging cap (added 2026-10-29)

**Why now.** Italy is the thinnest market, and the snapshot shows three separate causes, not one.

**Measured today** (`.jobhopper/exports/jobs.json`, 292 rows):
- 51 rows are Italy-ish (17%). By source: ashby 26, greenhouse 23, workable 1, smartrecruiters 1;
  lever / teamtailor / recruitee contribute zero.
- Their verdicts: 15 `no`, 23 unjudged, 11 `weak`, 2 `fair` — only 13 of 51 are usable.
- `jobs.json` caps `italy-roles` at `limit: 30`; `run` rebuilds that tab from the cap and the
  workflow judges `judge --tab italy-roles`. With 51 Italy rows, ~21 never get a verdict.
- `isRelevantRole` matches English titles only: "Sviluppatore Backend" / "Ingegnere del Software"
  are dropped at scan time, before the judge sees them.
- `COUNTRY_ALIASES.Italy` has 9 cities; Bergamo, Brescia, Trento, Bolzano, Trieste, Parma,
  Cagliari, Bari, Palermo, Catania, Lecce, Pescara, Ancona, Udine, Monza, Varese are missing.
- One 3-day freshness window applies to every market; Italian boards often post weekly.

**The tracker** (6,427 rows) is a careers-page/ATS census, not a platform list: Workday 454,
Greenhouse 273, Ashby 224, Workable 156, Lever 134, iCIMS 73, BambooHR 72, SmartRecruiters 47,
Teamtailor 37, Personio 11, Recruitee 10. Only 32 rows are Italian-ish and most are unsupported
(intervieweb, Taleo, custom .it sites). Useful for ATS priority and for harvesting companies on
supported ATSs; not an Italian source by itself.

### A. Stop losing the jobs we already have (½ day)
1. `italy-roles` `limit: 30 → 100`; judge every Italy row, not just tab members
   (`judge --all --limit 200` after the tab pass).
2. Italian title keywords in `isRelevantRole`: sviluppatore/sviluppatrice, ingegnere/ingegnera,
   programmatore, software, backend, frontend, full stack, devops, site reliability, data engineer,
   machine learning, QA, sicurezza informatica, sistemista. Keep the gate broad; the judge still
   filters civil/mechanical "ingegnere".
3. Expand Italy aliases with the full city list plus "italia"/"italy".
4. Acceptance: 100% of Italy rows judged; ≥ 35 non-`no` Italy verdicts; before/after counts here.

### B. Widen the Italian employer base on existing adapters (1–2 days)
Seven adapters already exist; the gap is the ~60-entry, NL-centric company list.
1. One-off `scripts/discover-boards.ts`: read a careers-URL list, normalize to (ats, token), probe
   the public feed, keep boards with ≥ 1 posting located in Italy.
2. Input lists: the tracker's ~860 supported-ATS rows + Italian startup/scaleup lists.
   Add the resulting ~30–60 boards to `DEFAULT_COMPANIES` under an "Italy — live-verified" comment.
3. Acceptance: registry grows only with boards that return Italy rows; `companies verify` shows no
   dead tokens; scan stays under ~10 min.

### C. New adapters, in reachability order
1. **Workday** (`/wday/cxs/<tenant>/<site>/jobs`, public JSON; 454 companies in the tracker and
   common in Italian enterprises). Company entry = tenant + site; POST search with pagination.
2. **BambooHR** (`<company>.bamboohr.com/careers/list`) and **Personio**
   (`<company>.jobs.personio.de/search.json`) — small public JSON, EU SMBs.
3. **Careerjet** (affiliate API, 70 markets incl. Italy; free `ak`) and **Jooble** (REST key) —
   whole-market aggregators, `fetchAll` scoped to Italy.
4. **InfoJobs Italia** (developer.infojobs.net) — OAuth/partner access; probe before committing.
5. **Inrecruiting / intervieweb** (Italian ATS: Fineco, Bonatti…) — custom HTML/JSON; probe.
6. Last resort: Italian portals without APIs (Trovolavoro, Lavoro24, Monster IT, Almalaurea,
   Bakeca) — only with a robots/ToS check and fixture-tested parsers.
Avoid: LinkedIn, Indeed, Glassdoor (no public API; ToS).

### D. Freshness and language policy
- Try 7 days for Italy/Spain (weekly boards), keeping 3 for NL — then measure noise.
- Italian postings may prefer an Italian CV/letter; separate decision, today everything is English.

**Order.** A (immediate, measurable) → B (cheap coverage) → C1 Workday → C3 Careerjet → C2/C5 → D.
Every adapter gets a fixture test and a `verify` entry; no scraping without a robots/ToS check.

**Overall acceptance.** Italy rows/week ≥ 3× baseline; judged share 100%; ≥ 3 new sources live;
scan under 15 min; no duplicate external ids; every parser covered by tests.

**Open questions.** (1) remote-Italy roles included, or on-site/hybrid only? (2) OK to register
Careerjet/Jooble/InfoJobs partner keys? (3) startups only, or enterprises too (Workday)? (4) is a
7-day Italy window acceptable? (5) Italian-language CV/letter wanted later?

### Phase A — done 2026-10-29

The leak was worse than the tab cap: `listJobs` filtered country with `location LIKE '%Italy%'`, so a
posting in "Milano" or "Roma" never entered `italy-roles` — and the judge only sees tab members. The
scan gate (aliases) had accepted those rows, which is why they sat unjudged in the snapshot.

- `matchesCountry()` is now the single country rule; `getDb()` registers it as the SQLite function
  `matches_country(location, country)`, and both `listJobs` and `searchJobs` use it for target
  countries (other countries keep the substring filter).
- Italy aliases grew to 60+ cities/regions (Bergamo, Brescia, Trento, Bari, Palermo… plus
  lombardia/piemonte/…); whole-word matching still rejects "Manufacturing", "Romania", "Barilla".
- Italian title stems in `isRelevantRole`: sviluppator, programmator, sviluppo software,
  ingegnere informatico — the gate used to be English-only.
- `italy-roles` `limit: 30 → 100`, so the tab (dashboard + judge) covers the whole market.
- Tests: 75 pass, including a DB test that "Milano, Lombardia"/"Bergamo" match Italy and
  "Berlin, Germany" does not.

Local DB is stale (165 rows vs the 292-row snapshot): 14 Italy rows, and "Rome"/"Milan" were invisible
to the old filter. The real before/after comes from the next CI scan (dispatched after the push):
51 Italy rows / 23 unjudged before; acceptance is 0 unjudged and ≥ 35 non-`no`.

### Phase A — measured (scan 40955668545, 2026-10-29)

Like-for-like with `matchesCountry` on the previous vs new snapshot:

| snapshot | Italy rows | no | unjudged | weak | fair | usable |
|---|---|---|---|---|---|---|
| before | 32 | 14 | 9 | 7 | 2 | 9 |
| after | 32 | 16 | 6 | 8 | 2 | 10 |

The fresh `italy-roles` tab now holds 7 rows (city-only locations included). The scan fetched 15,351
postings, kept 44 target-market/fresh/relevant, and dropped 14,439 off-market + 103 off-role.

**What this means.** The alias/judge leak is fixed (unjudged 9 → 6), but the ceiling is supply and
freshness, not filtering:
- CI rebuilds the DB every run, so the tab and judge only see this run's 44 inserts. The 6 remaining
  unjudged rows are historical snapshot rows older than the 3-day window, so they are never re-fetched
  and never judged.
- Only 7 fresh Italy rows existed this run; the other 25 in the snapshot are history.
- The `Docebo — Biassono, Italy; [object Object]` location is stale data from before the Ashby
  `secondaryLocations` fix; the live board returns plain strings. Not a live bug.

**Next levers, in order.** (a) Backfill judgments for historical snapshot rows (the 6, and any future
ones) so the UI never shows an unjudged role; (b) Phase B boards — the real volume; (c) decide the
7-day Italy window, which trades freshness for volume; the judge is the quality gate either way.

### Phase B — measured (2026-10-29)

Normalised the public tracker (6,427 companies) to supported ATS boards: 668 new boards after
removing the 145 already in the registry. Probing all of them with the real gate (Italy + role +
3-day freshness) left **4 boards / 5 roles**: AECOM (mechanical/electrical engineer), Intuitive
(field service), Camunda (sales engineer) — none software — and Docker (one forward-deployed
engineer, EMEA). Only Docker was added.

The tracker is a US-centric hiring.cafe census: useful as an ATS-priority map (Workday 454,
Greenhouse 273, Ashby 224, Workable 156, Lever 134, iCIMS 73, BambooHR 72, SmartRecruiters 47,
Teamtailor 37, Personio 11), not as an Italian employer source. Phase B cannot move Italy; volume
lives in Phase C (Workday + aggregators) and in the freshness decision.

### Backfill — verified

The 21:19 scan (run 40956992126) judged 50 snapshot rows, 0 failures; Italy unjudged fell 6 → 3 and
80 rows across all markets remain because of the `--limit` cap. The CI call now passes
`--limit 200`, so the next run clears the backlog in one pass.

### What the tracker actually is (2026-10-29)

It is a **hiring.cafe coverage worklist**, not a platform list and not hiring.cafe's index. Status
counts over its 6,427 companies: 3,341 "Supported/Already Live (>= hiringcafe)", 532 "Missing Jobs
(< hiringcafe)" (hiring.cafe has *more* jobs than the tracker's fleet), 591 "Deferred (No US jobs;
international gap + fix noted)", 305 "Unsupported … (Not English)", 546 "disqualified by fleet
triage". Only 2 `.nl` hosts and 32 Italian-ish rows.

So the sheet is US-first by construction — non-US employers were deferred or blacklisted, which is
why it understates hiring.cafe's NL/IT coverage. hiring.cafe itself indexes employer career sites and
ATS boards (no public API; [robots.txt](https://hiringcafe.com/robots.txt) disallows `?searchState=*`,
`/company/`, `/b/`, `/req/`, and its terms do not invite scraping) — the same layer our adapters read.
Use the sheet as an ATS census only (Workday 454, Greenhouse 273 …), and source the Italian company
universe elsewhere (aggregators, Italian startup lists, Workday tenants). Do not scrape hiring.cafe.

### Better universe — measured (2026-10-29)

Two passes beyond the sheet:

1. **Italian employers' own domains** (40 picked by hand: fintech, SaaS, marketplaces, scaleups).
   Four supported boards detected — Scalapay (Lever), Job&Talent (Lever, already known), Cleafy
   (Workable, dead) and one Teamtailor false positive on `app.teamtailor.com`. **Zero** fresh Italian
   software roles. Most Italian careers pages are JS-rendered or run on Italian ATSs (intervieweb,
   Taleo, Infor) that the detector cannot see.
2. **Workday tenants from the tracker** (386 probed, one list page each). Exactly **one** board had
   fresh Italian roles: Ciena — two Milan roles (software/firmware + mechanical), both with dates and
   descriptions when fetched through the new adapter.

So the ATS layer reachable from this sheet really is thin for Italy; the missing volume sits in
aggregators (Careerjet, Jooble, InfoJobs) and Italian-native boards, not in more company harvesting.
The Workday adapter ships anyway (token `tenant|shard|site`, no key, list paging with details only
for target-market postings) and Ciena is registered; it is ready for any tenant we learn about.

## Change — the confetti waits for the tab (added 2026-10-29)

The Submitted burst mounted with the result, which arrives while the job window usually still has
focus — so the user never saw it. `Fireworks` now fires immediately only when JobHopper is visible
and focused, otherwise it waits for `visibilitychange`/`focus` and unsubscribes on unmount.

Verified with Playwright against the local UI: hidden at mount → 0 canvases, after `visibilitychange`
→ 1 (screenshot `fireworks-return.png`); visible + focused at mount → 1 immediately.

### Scraping policy — decision (2026-10-29)

**Verdict.** Scraping is a last-resort *discovery* channel, never an apply channel. APIs first:
Careerjet/Jooble/InfoJobs partner feeds give structured rows plus canonical URLs and are sanctioned.
Checked today: `careerjet.it` robots and `trovolavoro.it` robots disallow `/` for generic crawlers;
`it.jooble.org` disallows the apply/redirect paths; `infojobs.it` serves no usable robots. None of
those four should be scraped.

**Where scraping is acceptable.** Only a board whose robots *and* ToS allow it, at a low rate, with
an identifying UA, cached responses, and public listing data only (no login walls). `lavoro24.it`
robots allows most paths (only the report form is disallowed) — ToS still needs a read before adding.

**Binding to auto-apply.** Key on the destination, not the source: resolve the final URL, detect the
ATS, then
- supported ATS — today only `greenhouse` (`SUPPORTED` in `src/apply/ats.ts`): prep can fill, a human
  still submits;
- unsupported ATS or board-hosted form: open in review mode for a human; never automate
  LinkedIn/Indeed/InfoJobs application flows (login, CAPTCHA, ToS).

So "scrape + auto-apply" only becomes real after the filler supports more ATSs (Lever, Ashby,
Workday), and even then only for jobs that end on those ATSs.

**Quality rules.** A scraped row enters the DB only with a canonical employer URL (not an aggregator
redirect), a full description (fetched from the employer page when the board truncates), a stable id
(URL or board id) and source attribution. Dedupe on canonical URL + company/title/location, not the
board id. Track per-source verdict distribution and applied rate; downweight noisy sources.

**Order.** APIs with keys → measure → add ATS fillers (Lever, Ashby, Workday) → scraping only if a
board that matters allows it and has no feed.

## Change — the board is software-only (added 2026-11-02)

The Italy list mixed sales, consulting, mechanical, fashion, creator and intern roles: `isRelevantRole`
matched bare "engineer"/"developer" and the generic word "music". Three layers now:

- **Gate** (`src/market.ts`): bare "engineer"/"developer" are gone; software compounds stay
  (software, front/back/full-stack, devops, SRE, data/ML/AI/cloud/platform/infra/security/QA,
  mobile/iOS/Android, embedded/firmware) plus Italian stems. Intern/junior/graduate titles are dropped
  outright. Music keeps production roles only, so "Content Creator & Strategist" at a music company
  no longer qualifies.
- **Snapshot scope** (`inSnapshotScope`, used by `run -j`): the merge no longer carries rows that fail
  the current gate; applied rows are always kept. This cleans the rows scanned under the old gate.
- **UI** (`App.tsx`): the default match filter is now "Hide rejected" (`relevant`), so `no` roles are
  hidden on first load; "All roles" is one click away.

Verified: 81 tests; Playwright against the built app: 157 of 308 rows by default, 11 of 34 for Italy;
the new gate drops 23 of the 34 current Italy rows, and the scope filter leaves 6 software roles.

## Company discovery — what the big boards actually do (added 2026-11-02)

**hiring.cafe, from the founders themselves.** The [scaling post](https://blog.hiring.cafe/p/scaling-hiringcafe-from-0-to-1m-users)
says every job is scraped from employers' career pages, never user-posted; it started as a
spreadsheet of hundreds of employers plus search dorks like `"job openings" site:greenhouse.io`.
In the [4.1M-jobs Reddit thread](https://www.reddit.com/r/ChatGPT/comments/1mt2trl/) co-founder
u/hamed_n adds the pipeline: crawled the internet for company URLs, verified ~100K career pages
(Mechanical Turk + Dunn & Bradstreet), an agent finds each career page, crawls them **3×/day**
through residential proxies, and feeds raw postings to ChatGPT for structured JSON (salary, remote,
location). No LinkedIn or Indeed.

**The open-source counterpoint.** [ats-scrapers](https://github.com/kalil0321/ats-scrapers) publishes
a free dataset with **5.06M jobs, 80,390 companies, 64 sources** (MIT): EURES 1.49M, Bundesagentur
1.01M, Workday 728K, SuccessFactors 321K, Oracle 297K, SmartRecruiters 244K, iCIMS 211K, Greenhouse
179K, Lever 72K, Welcome to the Jungle 90K. Its schema carries `country_iso` and `apply_url`, and it
ships per-ATS tenant lists (`name,slug,url`) — i.e. a ready company index.

**The shared architecture.** (1) a large verified **company index** with ATS/slug/URL, (2) **source
adapters** — ATS JSON APIs and public feeds first, HTML only for the tail, (3) one normalized schema
with LLM extraction for messy fields, (4) frequent polling + liveness + dedupe on canonical URL.

**What JobHopper copies, and what it skips.** Skip the 100K pages, residential proxies and 3×/day
scrape: we target three countries. Copy the company index and the feed breadth:
1. **Italian company index from the MIT dataset** — filter `country_iso=IT` on the per-ATS CSVs,
   take `company + ats + apply_url`, probe with the adapters we already have, keep the live ones.
   One-off job, committed as a curated list; refresh monthly.
2. **EURES adapter** — the EU public employment feed (1.49M rows in that dataset, covers IT/ES/NL).
   This is the single biggest sanctioned coverage lever, bigger than any Italian board.
3. **Welcome to the Jungle** next (EU tech, 90K rows), then Workday tenants from the index.
4. Scraping stays last: only a board that matters, robots/ToS permitting, discovery only.

**Acceptance.** Italian employers with live boards added; EURES live; Italy rows/week up without
lowering the judge's bar; scan under 15 min; every new source fixture-tested.

## EURES — probed, not enabled (added 2026-11-02)

The API works (unauthenticated `POST /api/jv-searchengine/public/jv-search/search`, `LAST_WEEK`,
1,211 Italian rows/week), but it is not a software source: 400 Italian rows and 100 Spanish/Dutch
rows contained **zero** software titles, and only 19 rows were genuinely *created* in three days
(the rest are old vacancies republished in bulk). The 1.49M EURES rows in the open dataset are
history, not fresh openings. Adapter + 5 tests are kept in `src/sources/eures.ts`, deliberately **not
wired into the scan** (a 20s fetch that the role gate drops is pure cost).

The probe also caught two gate false positives — `ios` inside "sanitari-os" and `dj` inside
"a-dj-unto". `isRelevantRole` now matches keywords on word boundaries (stems like sviluppator /
desarrollador keep prefix matching) and the Spanish/Dutch stems were added.

## Italian company index — first slice (added 2026-11-02)

The open [JobHive dataset](https://github.com/kalil0321/ats-scrapers) small-ATS slices were streamed and
filtered to `country_iso=IT`: Teamtailor 18,061 rows → 1,209 Italian rows / 61 companies; Recruitee 16,560
→ 55 / 17; Workable 1,296 → 1 / 1. Deriving the tenant from each URL (or the dataset's `company` column)
gave 76 boards; 11 had software titles; probing each live board with the real role gate left **5 with a
live Italian software role**:

| Board | Italy software role |
|---|---|
| Accessiway (Teamtailor) | Software Developer (Backend / Full Stack) |
| Idealista (Teamtailor) | Backend Developer (Regold) |
| ISS International (Teamtailor) | AI / Agentic Systems Engineer |
| WeRoad (Teamtailor) | Staff Data Engineer, AI Engineer |
| Byte-code (Recruitee) | Full Stack Developer |

Added to `DEFAULT_COMPANIES`. None has a posting newer than three days right now, so this buys coverage
for future scans, not rows today. Ascom, Idealista's photographers, ISS construction roles etc. were
rejected: live Italy, zero software.

Pending bigger slices: ashby 55K rows / 344 MB, lever 72K / 351 MB, greenhouse 179K / 1.1 GB,
smartrecruiters 244K / 1.4 GB, workday 728K / 4 GB. CSV is inflated by descriptions; the parquet slices
are ~10× smaller (greenhouse 130 MB) but need pyarrow/duckdb, which are not installed.

## Big-ATS Italian import (added 2026-11-02)

Installed DuckDB in `.jobhopper/venv` and used the parquet slices (Ashby 55K rows/124 Italian,
Lever 72K/152, Greenhouse 179K/566, SmartRecruiters 244K/1,615 = 2,457 Italian rows). Deriving the
tenant from each URL gave 207 boards; 34 had software titles; probing with the live role gate left
**20 new boards with a live Italian software role**, now in `DEFAULT_COMPANIES`: Kong, Veliù,
SurveyMonkey, Anyone AI (Ashby); Sysdig, Keyloop (Lever); Speechify, Shopfully, Capco, Nozomi
Networks, Hudl, Nearform, Ping Identity (Greenhouse); Sopra Steria, Devoteam, Max Mara, SIA,
Kanadevia Inova, Everience, Stäubli (SmartRecruiters). Satispay, Docebo, Doctolib and Telnyx were
already registered.

Rejected as non-software despite matching the gate: Auto1 ("Auto Mobile" car buyers), Renesas test
engineers, Turner & Townsend (construction QA/QC), Somfy and Wabtec (electronics/rail), Talan and
Lifted (cybersecurity consulting), ZURU (toys). Pending: Workday (728K rows; 453 MB parquet) and
custom-domain rows whose tenant cannot be derived from the URL.

## Workday slice — no Italian software (added 2026-11-02)

The Workday parquet (728K rows) has 1,101 Italian rows across 190 tenants; 17 had software titles. Probing
the live CXS APIs left four matches and **all four are hardware/QA**, not software: Allegro Micro (systems
engineer), Copeland (QA & lab manager), Thermo Fisher (PDS QA), Rockwell (software test). Nothing added;
Workday's Italian footprint is retail/manufacturing, matching the earlier 386-tenant probe (Ciena only).

After the 20-board import, the scan fetched 22,345 postings (was 16,205), added 53 new (was 40), dropped
106 unrelated, and the snapshot grew to **194 rows / 13 Italian / 8 visible**, including Nearform (fair)
and Hudl (weak) from the new boards.

**Where the remaining gap is.** The pipeline is now company-first and repeatable: dataset → Italian rows →
tenant → live probe → registry. The limit is adapter coverage: we support 8 ATSs, while the dataset's
biggest non-Workday sources are SuccessFactors (321K), Oracle (297K), iCIMS (211K) and Phenom (133K), none
supported. Custom-domain rows (no derivable tenant) are also lost. Those adapters, not more scraping, are
what closes the gap to hiring.cafe's 100K career pages.

## SuccessFactors adapter + 8 Italian boards (added 2026-11-02)

SuccessFactors exposes two credential-free feeds: Recruiting Marketing RSS at `https://{host}/sitemal.xml`
and legacy `Job-Listing` XML at `https://{host}/career?company={ID}&...&resultType=XML`. The adapter
(`src/sources/successfactors.ts`, 3 tests) handles both, maps locations from `g:location`/title parens and
dates from pubDate / `Posted-Date`, and prefixes ids with the tenant to avoid collisions.

The parquet slice (2,954 Italian rows / 120 tenants) produced 14 software groups and **8 live boards**:
Intesa Sanpaolo (12 live Italian software roles), KPMG Italy (8), Pirelli (3), Worldline (3), msg global
(3), AVL (2), CRIF (1), Tenova (1). Rejected: Chiesi and Grünenthal (pharma QA), Alstom (cybersecurity
manager), EssilorLuxottica (audio engineer). The import/probe scripts now include SuccessFactors by default.

## Rejudge with the current profile (2026-11-02)

The scheduled scan now takes a `rejudge` input: `backfill --rejudge` over the whole snapshot with
`deepseek/deepseek-v4-pro` (quick passes use `deepseek-v4-flash`; both are configured in CI). The first
run judged 194/194 rows in ~17 minutes, 0 failures.

- Global: `no` 67 → 34, `fair` 23 → 60, `weak` 101 → 99, `strong` 4 → 1.
- Italy: 13 → 12 rows (the malformed Docebo location was dropped), visible (non-`no`) 8 → **12**.
  Every former `no` flipped: Mollie Senior Platform (fair), Mollie Platform II Build (weak), Docebo
  Cloud Engineer I (weak), Mollie Platform II Infrastructure (weak); the Docebo SRE row with
  `[object Object]` was removed by `inSnapshotScope`.
- The full model is stricter on "strong" (4 → 1) but much more willing to call platform/SRE/cloud roles
  fair once Italy is a target market — exactly the profile correction.

## Ashby form filler (added 2026-11-02)

`src/apply/ashby.ts` opens `/application`, fills the three stable system fields by id
(`_systemfield_name/email/resume`), and everything else by visible label (Ashby names the rest with
per-board UUIDs). Number inputs get numeric coercion ("EUR 80k" → 80000), radio groups read the
fieldset legend ("Are you authorized to work in the EU?"), and the privacy checkbox follows
`consentRetention`. **Nothing submits**: the form has reCAPTCHA, so `--submit` is rejected and
`--review` hands it to you.

`SUPPORTED` is now `greenhouse, ashby`; `jobhopper apply <id> --review` dispatches on the ATS.
Verified with a local fixture (every field filled, 0 missing) and a live Satispay dry-run (9 fields,
0 missing, no submission). Tests: 91.

## Lever form filler (added 2026-11-02)

`src/apply/lever.ts` opens `/apply`, fills the stable core fields by name (`name`, `email`, `phone`,
`location`, `org`, `urls[...]`, `resume`) and the `cards[...]` questions from their
`.application-label` text, handling selects, numbers, radio groups and the consent/acknowledgement
checkboxes. **Nothing submits**: hCaptcha, so `--submit` is rejected and `--review` hands it over.

`SUPPORTED` is now `greenhouse, ashby, lever`. Verified with a local fixture (0 missing) and a live
Sysdig dry-run: name/email/phone/location/org/LinkedIn/GitHub/portfolio/resume filled, the
authorization select and two consent acknowledgements ticked, and one required sponsorship question
deliberately left for the reviewer (no answer in `applicant.json`). Tests: 92.

## Fix — newest-first ordering and Today filter (added 2026-11-05)

The board claimed "newest first" but showed 7 October at the top. Root cause: `mergeSnapshotRows` keeps the
previous snapshot's order (company/scan order), `run -j` wrote it unsorted, and the React app trusted the
array. The dates on the cards are `posted_at`; old rows remain in the snapshot because the 3-day gate
applies at ingestion and the merge preserves history.

- `sortRowsByPostedAt` (src/export/html.ts) sorts the merged snapshot by `posted_at` desc, undated last.
- `sortJobs` (web/src/utils.ts) sorts every load path (injected, API, jobs.json, sample) with the same rule.
- The sidebar has a **Posted today** toggle; "New this scan" is renamed **New to JobHopper (first seen ≤3
  days)** so it is not mistaken for the posting date.
- Verified with Playwright: first card is the max `posted_at` (2 Nov), Today shows 0 because nothing was
  posted on 5 Nov. Tests: 93.


## External scheduler — Cloudflare Worker (added 2026-11-05)

GitHub's `schedule` was missing runs: with the cron at minute 0 it delayed by 1–2h and dropped slots
(the catch-up run itself took >1h in the judge step). The automatic trigger now lives in a Cloudflare
Worker (`workers/dispatch-scan`) with a Cloudflare cron `17 */3 * * *`; it calls the GitHub dispatch API
for `scheduled-scan.yml`. The GitHub `schedule` is removed, the scan has a `concurrency` group and job/
judge timeouts, and manual dispatch still works.

Setup requires a fine-grained PAT (`Actions: Read and write`) stored as `GH_DISPATCH_TOKEN`; the
`deploy worker` workflow deploys the Worker and sets its secret. Until that secret exists, no automatic
scan runs — manual `gh workflow run scheduled-scan.yml` is the fallback.

## External scheduler live (2026-11-06)

The Cloudflare Worker is deployed at `jobhopper-dispatch.asjon-dalipaj.workers.dev` with cron
`17 */3 * * *` and the `GITHUB_DISPATCH_TOKEN` secret. First real dispatch: 09:17:50 UTC → scan run
42193965658 (success). The follow-up Pages deploy hit a transient Cloudflare "Unknown internal error"
while publishing the Function; a rerun succeeded. `deploy-pages.yml` now retries the deploy three times,
so a single flaky Functions upload no longer blocks the snapshot.

The Italian candidate report's 11 unadded IT-live boards were probed: all are stale or non-software
(Auto1 purchasing, Talan cyber, LeTelezioni tutoring, Renesas test, ZURU toys, Wärtsilä-adjacent QA,
Turner & Townsend construction QA, etc.); Jobgether is an aggregator and timed out. **No additions**:
the supported-ATS Italian pool is effectively exhausted. The next Italy volume has to come from
aggregator keys (Careerjet/Jooble/InfoJobs) or new adapters (Oracle/iCIMS/Phenom), not more board harvesting.
