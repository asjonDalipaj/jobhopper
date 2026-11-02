# JobHopper

**Local-first job search & evaluation CLI for EU software engineers.**

JobHopper keeps **your data on your machine** — your CV, preferences, and job
postings never leave your laptop unless you ask it to judge a posting. It pulls
postings **directly from employers' public ATS boards** (no login, no account,
no job-board middleman), indexes them locally in SQLite with full-text search,
and evaluates them against your profile using **OpenRouter** with your own API
key.

**Market focus: Italy, Spain, Netherlands.** Only software-engineering (and
music-production) postings in those markets and posted within the last **3
days** survive ingestion — city/native-language aliases are recognised and
everything else is dropped at the gate, quality over quantity. If an OpenRouter
key is configured, every newly ingested posting is also quick-judged and
deleted if the verdict is "no" (`scan --no-judge` skips this).

Unlike hosted services, there is **no account and no login**. Set one API key
and it's yours.

---

## What you get

- **A curated company index.** ~80 live-verified employers on Greenhouse,
  Lever, Ashby, Workable, Teamtailor, Recruitee, SmartRecruiters, Workday and
  SuccessFactors,
  plus Italian boards imported from the open JobHive dataset (see
  [Company discovery](docs/COMPANY-INDEX.md)).
- **A deterministic gate.** Market aliases, a 3-day freshness window, and a
  word-boundary software-role filter run before anything reaches SQLite
  (`src/market.ts`).
- **Local SQLite + FTS5.** Search, filters, shortlists ("tabs"), and verdicts
  stay on disk.
- **BYO AI.** The judge reads `cv.txt`, `background.md`, `preferences.md` and
  `constraints.md` and returns `strong` / `fair` / `weak` / `no` with a reason.
- **A static snapshot + web UI.** CI exports `.jobhopper/exports/jobs.json`;
  the React app on Cloudflare Pages reads it, so the phone works without a
  server. Locally, `jobhopper ui` serves the same app with a live API.
- **Human-in-the-loop applying.** CV/cover-letter prefill + a Playwright fill
  for Greenhouse, a review window, and **you** submit. Nothing auto-submits.

---

## Requirements

- Node.js **>= 22.13** (native `node:sqlite`, `DatabaseSync.function`)
- An [OpenRouter](https://openrouter.ai) API key for judgment (scanning needs
  none)
- For the optional company-index importer: Python 3 + DuckDB (see
  [docs/COMPANY-INDEX.md](docs/COMPANY-INDEX.md))

## Install

```bash
git clone <this-repo>
cd jobhopper
npm install
npm run build
npm link             # makes `jobhopper` available globally
```

## Quick start

```bash
# 1. OpenRouter key (stored locally in config.json; masked in `config show`)
jobhopper config set-openrouter-key sk-or-...

# 2. Profile: CV text, preferences, constraints (all local)
jobhopper profile import-cv ~/Documents/CV.pdf
jobhopper profile set preferences
jobhopper profile set constraints

# 3. Fetch postings from the curated boards (+ whole-market remote feeds)
jobhopper scan                  # curated company boards
jobhopper scan -a               # also Remotive + RemoteOK
jobhopper companies verify      # live-check every registry token

# 4. Search the local index
jobhopper search fullstack --country Netherlands
jobhopper list --remote --limit 20
jobhopper list --source smartrecruiters --limit 10

# 5. Judge with your profile (OpenRouter, your key)
jobhopper judge 358
jobhopper judge --tab italy-roles --quick
jobhopper judge --all --rejudge            # rescore everything

# 6. Shortlist / export
jobhopper tab create italy-roles -d "Italian software roles"
jobhopper tab add italy-roles 358
jobhopper export italy-roles -o shortlist.html

# 7. Local web UI (React + API on :3333)
npm run ui
```

## Commands

```
config set-openrouter-key [key]    set OpenRouter API key (local)
config set-model <id>              set full-judgment model
config set-quick-model <id>        set quick-judgment model
config show / list-models          show config / model presets

profile import-cv <pdf>            extract CV text locally
profile set <name> [file]          set preferences/constraints/background
profile show / get <name>          view stored profile docs

companies list                     list configured boards
companies verify                   live-check board tokens
scan [-c <name>] [-a] [--verify] [--no-judge]
cleanup                            purge off-market / stale rows
search <words> [filters]           FTS over the local DB
list [filters]                     list jobs
judge <id> | --tab <t> | --all     judge (OpenRouter; --rejudge rescans verdicts)
judgments [--verdict <v>]          stored verdicts
tab create/list/add/get/rm         shortlists
export [tab] [-o out.html]         clickable HTML dashboard
run [-j] [-o out.html]             run job-search tabs from jobs.json
backfill --snapshot <path>         judge unjudged snapshot rows
status                             DB / config status
ui [-p <port>]                     local web app + API
```

Common filters: `--country <name> --remote --contract --unjudged --source <s>
--limit <n>`. Run `jobhopper <command> --help` for the full surface.

## How it works

```
                 ┌──────────────────────────────────────────────┐
 company registry│  scan: fetchCompany per board                │
 (companies.ts)  │  aggregators: fetchAll (Remotive/RemoteOK)   │
                 └───────────────┬──────────────────────────────┘
                                 │ SourceJob (normalized)
                                 ▼
                 ┌──────────────────────────────────────────────┐
                 │ gate: market aliases → 3-day freshness →     │
                 │ word-boundary software role (src/market.ts) │
                 └───────────────┬──────────────────────────────┘
                                 ▼
                 SQLite jobs + FTS5  ──►  judge (OpenRouter)
                                 │           │ verdict/reasoning
                                 ▼           ▼
                 shortlists/HTML     judgments (strong/fair/weak/no)
                                 │
                                 ▼
                 run -j: merge snapshot (.jobhopper/exports/jobs.json)
                                 │
                                 ▼
                 Cloudflare Pages (web/) reads /jobs.json
```

Key invariants:

- **The gate runs at ingestion**, not in the UI. If a row is in the DB it
  passed market + freshness + role at that moment. `cleanup` re-applies the
  rule to old rows; `run -j` re-filters the merged snapshot with
  `inSnapshotScope`.
- **The snapshot never invents rows.** CI merges the new export over the
  previous snapshot, preserving `first_seen`, verdicts and `applied_at`.
- **Verdicts are per job row**, with the model that produced them.
- **Applying never auto-submits.** The fill flow stops for a human review.

## Repository map

| Path | What lives there |
|---|---|
| `src/cli/index.ts` | Every CLI command (commander) |
| `src/sources/` | ATS adapters, `companies.ts` registry, `scan.ts`, `verify.ts` |
| `src/market.ts` | Market aliases, freshness, word-boundary role gate |
| `src/db/` | SQLite schema, jobs/judgments/tabs repositories |
| `src/judge/` | OpenRouter client, models, prompts |
| `src/jobs/` | Tab definitions and `run -j` |
| `src/export/` | Snapshot merge/scope, HTML dashboards, backfill |
| `src/apply/` | CV/letter prep, Greenhouse fill, browser resolution |
| `web/` | React + Tailwind app (Pages build reads `/jobs.json`) |
| `scripts/` | Offline discovery/import utilities |
| `.github/workflows/` | Scheduled scan, Pages deploy, monthly board discovery |
| `.jobhopper/exports/` | Committed snapshot + dashboards (public surface) |

## Job sources

1. **Curated ATS boards** (`src/sources/companies.ts`): one token per employer.
   `scan` calls `fetchCompany` per board, in parallel, and reports dead tokens
   without aborting.
2. **Whole-market aggregators** (`scan -a`): Remotive and RemoteOK, tagged
   `aggregator-remotive` / `aggregator-remoteok`.
3. **EURES** (`src/sources/eures.ts`): implemented and tested, deliberately
   **not wired** — a 500-row probe found no software titles. See
   [NEXT_STEPS.md](NEXT_STEPS.md).

### Adding a company

Append one line to `src/sources/companies.ts`:

```ts
gh('Acme', 'acme'),        // Greenhouse
lv('Acme', 'acme'),        // Lever
as('Acme', 'acme'),        // Ashby
wk('Acme', 'acme'),        // Workable
tt('Acme', 'acme'),        // Teamtailor
rc('Acme', 'acme'),        // Recruitee
sr('Acme', 'acme'),        // SmartRecruiters
wd('Acme', 'acme', 'wd5', 'Careers'), // Workday
```

Then `jobhopper companies verify` and `jobhopper scan -c Acme`.

### Adding a source

See [docs/ADDING-A-SOURCE.md](docs/ADDING-A-SOURCE.md) — the interface, the
registry wiring, the test seam, and the live probe.

## Company discovery

The company index is grown offline from the open
[JobHive/ats-scrapers dataset](https://github.com/kalil0321/ats-scrapers)
(5M rows, 80K companies, 64 sources), filtered to Italy/Spain/Netherlands,
probed live, and reviewed before a board enters the registry. The pipeline and
its monthly workflow are documented in
[docs/COMPANY-INDEX.md](docs/COMPANY-INDEX.md).

## Judgment models

Defaults are `openai/gpt-4o-mini` (full and quick); override with
`config set-model` / `config set-quick-model`. The CI snapshot uses the quick
model for every judge pass. Model presets:

- `deepseek/deepseek-v4-pro` — full judgments (best quality/cost here)
- `deepseek/deepseek-v4-flash` — quick screening
- `anthropic/claude-3.7-sonnet` — strong long-context reasoning
- `meta-llama/llama-3.3-70b-instruct` — low-cost open weights

## Web app

```bash
npm run ui           # serve web/dist + API on :3333
npm run web:dev      # Vite dev server (proxy to the API)
npm run build:web    # produce web/dist for Pages
```

The hosted app fetches `/jobs.json`; when a local `jobhopper ui` is reachable
on `:3333`, it uses the live API instead (the "bridge"). The apply/prep flow
needs that bridge; the hosted page alone is read-only.

## CI/CD

| Workflow | Trigger | What it does |
|---|---|---|
| `scheduled-scan.yml` | every 3h + manual | `scan -a --verify`, `run -j` per market tab, `judge --tab ... --quick`, `backfill --limit 200`, commits the snapshot |
| `deploy-pages.yml` | after a scan, pushes touching `web/**` or the snapshot | builds `web/`, copies `jobs.json`, deploys to Cloudflare Pages |
| `discover-boards.yml` | monthly + manual | imports the dataset, probes candidates, commits the report |

To rescore every stored verdict after a profile change: **Actions → scheduled job scan → Run workflow**,
tick `rejudge` (runs `backfill --rejudge` over the whole snapshot with `deepseek-v4-pro`).

Secrets: `OPENROUTER_API_KEY` (scan/judge), Cloudflare API token/account for
Pages. The scan commits with `GITHUB_TOKEN`; the deploy follows via
`workflow_run`.

## Tests

```bash
npm test            # tsc + node --test dist/test/
npm run build       # typecheck + emit
npm --prefix web run lint
```

Tests are fixture-driven and live in `src/test/`; they cover the pure seams
(parsers, mappers, gates, snapshot merge) and never call the network.

## Troubleshooting

- **A board stopped returning jobs** → `jobhopper companies verify`; remove or
  fix the token. `scan --verify` skips dead boards automatically.
- **Local UI looks stale / "run build:web"** → the `:3333` server was started
  from an old build; `npm run build:web && npm run ui`.
- **A job shows `[object Object]` in the location** → stale snapshot data from
  an older parser; re-scan/re-export the affected source.
- **Nothing new after a scan** → check the gate: market (`--country`), 3-day
  freshness, and the software-role filter. `scan` prints the skipped counts.
- **Judgments unchanged after editing the profile** → verdicts are stored per
  row; run `judge --all --rejudge` (or `--tab X --rejudge`).
- **No jobs on the phone** → the hosted page reads the committed snapshot; a
  fresh scan must run and deploy first.

## Privacy

- Postings, profile docs and judgments live in `~/.config/jobhopper/`
  (`jobhopper.db`, `profile/`).
- Outbound traffic: public ATS/aggregator APIs on `scan`, and
  [openrouter.ai](https://openrouter.ai) on `judge` (your key, your profile).
- No account, no tracking, no SaaS middleman.

## License

MIT
