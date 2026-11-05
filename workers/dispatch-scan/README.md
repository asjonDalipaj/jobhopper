# Dispatch worker

The scan runs on GitHub Actions, but the **trigger** runs on Cloudflare.

GitHub's own `schedule` is best-effort: it delays runs at the top of the hour and
sometimes drops them entirely. This Worker has a Cloudflare cron trigger
(`17 */3 * * *` UTC) and calls the GitHub Actions dispatch API, so the scan starts
every 3 hours without GitHub's scheduler. `scheduled-scan.yml` no longer has its
own `schedule`; this Worker is the only automatic trigger. Manual
`workflow run scheduled-scan.yml` still works.

```
Cloudflare cron (17 */3)
  → POST /repos/asjonDalipaj/jobhopper/actions/workflows/scheduled-scan.yml/dispatches
  → GitHub Actions: scan → judge → commit snapshot
  → deploy-pages workflow_run → Cloudflare Pages
```

## One-time setup

1. **Create a fine-grained GitHub PAT**
   - GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token.
   - Repository access: only `asjonDalipaj/jobhopper`.
   - Repository permissions: **Actions: Read and write** (only).
   - Expiration: 90 days or one year; put the renewal date somewhere.
2. **Store it as a repository secret**
   - Repo → Settings → Secrets and variables → Actions → New repository secret.
   - Name: `GH_DISPATCH_TOKEN`; value: the PAT.
3. **Deploy the worker**
   - Actions → **deploy dispatch worker** → Run workflow.
   - It deploys the Worker and sets the `GITHUB_DISPATCH_TOKEN` Worker secret.
   - The Cloudflare token needs **Workers Scripts: Edit** in addition to Pages.

The Cloudflare credentials (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) are
already repository secrets for the Pages deploy.

## Verify

- Worker health: `https://jobhopper-dispatch.<your-subdomain>.workers.dev/health`
  → `{"ok":true,"worker":"jobhopper-dispatch","cron":"17 */3 * * *"}`.
- Cloudflare dashboard → Workers & Pages → `jobhopper-dispatch` → Triggers:
  the cron `17 */3 * * *` is listed.
- Logs: dashboard → Logs, or `npx wrangler@3 tail` from this directory.
- Local cron test (no deploy):
  `npx wrangler@3 dev --test-scheduled`, then
  `curl "http://localhost:8787/__scheduled?cron=17+*/3+*+*+*"`.
  This still needs `GITHUB_DISPATCH_TOKEN` in `.dev.vars`.

## Rotate the token

Create a new PAT, update the `GH_DISPATCH_TOKEN` repository secret, then re-run
**deploy dispatch worker**; it pushes the new value to the Worker.

## Notes

- The scan workflow has a `concurrency` group and a job timeout, so a slow judge
  cannot overlap the next dispatch.
- If the Worker or token fails, no automatic scan runs. Manual
  `gh workflow run scheduled-scan.yml` is the fallback; check the Worker logs if
  runs stop.
- The Worker only stores the PAT as a Cloudflare secret; it is never in git.
