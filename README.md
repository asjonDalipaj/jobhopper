# JobHopper

**Local-first job search & evaluation CLI for EU software engineers.**

JobHopper keeps **your data on your machine** — your CV, preferences, and job
postings never leave your laptop. It scrapes public company job boards (no
login, no account), indexes them locally in SQLite with full-text search, and
evaluates postings against your profile using **OpenRouter** with your own API
key (no middleman, no third-party collecting your data).

Unlike hosted services, there is **no account and no login**. Set one API key
and it's yours.

---

## Why

The goal was a privacy-respecting alternative to SaaS job tools:

- **Your CV stays local.** Extracted locally (`pdf-parse`) to
  `~/.config/jobhopper/profile/cv.txt`. Never uploaded.
- **No login / no account / no subscription.** Everything is on your disk.
- **EU-first.** Curated registry of Dutch & European company boards
  (Bol.com, Adyen, MessageBird, JetBrains, Spryker, Spotify, GitLab, Elastic, …)
- **Bring-your-own AI.** The only network call is to OpenRouter.ai using **your**
  API key to judge postings against your profile. Choose the model and cost you
  want.
- **Clickable output.** Export a shortlist to HTML with apply links.

---

## Requirements

- Node.js **>= 22** (uses the native `node:sqlite`)
- An [OpenRouter](https://openrouter.ai) API key for judgment (searching/scraping needs none)

## Install & link

```bash
git clone <this-repo>
cd jobhopper
npm install
npm run build
npm link             # makes `jobhopper` available globally
```

## Quick start

```bash
# 1. Set your OpenRouter API key (stored locally in config.json)
jobhopper config set-openrouter-key sk-or-...

# 2. Import your CV locally (PDF -> text on your machine)
jobhopper profile import-cv ~/Documents/CV.pdf

# 3. Save preferences & constraints (optional, sharpens judgments)
jobhopper profile set preferences
jobhopper profile set constraints

# 4. Fetch postings from configured Dutch/EU boards
jobhopper scan

# 5. Search your local index
jobhopper search fullstack --country Netherlands
jobhopper list --remote --limit 20

# 6. Judge a posting against your profile (visits OpenRouter with YOUR key)
jobhopper judge 358
jobhopper judge --tab netherlands-roles --quick

# 7. Export a clickable HTML dashboard
jobhopper tab create netherlands-roles -d "EU engineering"
jobhopper tab add netherlands-roles 358
jobhopper export netherlands-roles -o shortlist.html
# open shortlist.html in your browser to click apply links
```

## Command reference

```
config set-openrouter-key [key]    set OpenRouter API key (local)
config set-model <id>              set full-judgment model
config set-quick-model <id>        set quick-judgment model
config show                        show config (key masked)
profile import-cv <pdf>            extract CV text locally from a PDF
profile set <name> [file]          set a profile doc (preferences/constraints/background)
profile show / get <name>          view stored profile docs
companies list                     list configured boards
scan [--company <name>]            fetch postings from configured boards
search <words> [filters]           full-text search local DB
list [filters]                     list jobs
judge <id> | --tab <t> | --all     judge postings against your profile (OpenRouter)
judgments [--verdict <v>]          list stored verdicts
tab create/list/add/get/rm         manage shortlists
export [tab] [-o out.html]         build a clickable HTML dashboard
status                             show DB / config status

Common filters: --country <name> --remote --contract --unjudged --limit <n>
```

## Privacy

- All job postings, profile documents, and judgments are stored in
  `~/.config/jobhopper/jobhopper.db` and `~/.config/jobhopper/profile/`.
- The **only** outbound network traffic is to (a) the public job-board APIs
  when you run `scan`, and (b) [openrouter.ai](https://openrouter.ai) when you
  run `judge`, using your key, sending your local profile for evaluation.
- Nothing is sent to any jobhun/saas middleman. No account, no tracking.

## Judging models

Defaults (override with `config set-model` / `config set-quick-model`):

- Full judgment: `openai/gpt-4o-mini`
- Quick screening: `openai/gpt-4o-mini`

Other good choices: `anthropic/claude-3.5-sonnet`,
`anthropic/claude-3.7-sonnet`, `deepseek/deepseek-chat`,
`meta-llama/llama-3.3-70b-instruct`.

## Configuring boards

The default registry lives in `src/sources/companies.ts` and can be extended at
runtime via the JSON at `~/.config/jobhopper/companies.json`
(auto-created on first scan). Lightweight, public Greenhouse / Lever / Ashby
endpoints are used; dead or renamed tokens are reported per-company and don't
abort the run.

## License

MIT