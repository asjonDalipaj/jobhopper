# Local 15-minute watcher

The Cloudflare Worker scans every 3 hours. That is the fallback. On a machine
that stays on, `jobhopper watch` runs the same pipeline every 15 minutes and,
with `--publish`, keeps the hosted board aligned with the local one.

**It is not started automatically.** Running `jobhopper watch --publish` is what
starts it.

## Quick start

```bash
npm run build
jobhopper watch --publish                 # 15 minutes, publishes changes
# jobhopper watch --interval 5 --publish  # faster
# jobhopper watch --once                  # one cycle, then exit (test)
```

Keep it in a terminal, tmux, or a systemd user service (below). `Ctrl-C` stops it
after the current step. A second watcher refuses to start because of
`.jobhopper/watch.lock`.

## What a cycle does

1. `git pull --rebase --autostash` when `--publish` is on.
2. `scan -a --verify` (curated boards plus Remotive/RemoteOK).
3. Pull again, so a Worker scan that committed during the scan is included.
4. `run -j .jobhopper/exports/jobs.json` (tabs + snapshot export).
5. `judge --tab italy-roles|spain-roles|netherlands-roles --quick`, re-export.
6. `backfill --snapshot … --quick --limit 200` for older snapshot rows.
7. If the snapshot digest changed: commit `.jobhopper/exports/` and push.

The push changes `.jobhopper/exports/jobs.json`, which triggers the normal
Pages deploy. The Worker remains active as the 3-hour fallback.

## systemd user service

The unit lives in `ops/jobhopper-watch.service`. Adjust `WorkingDirectory` and
`ExecStart` if your checkout/node path differs, then:

```bash
mkdir -p ~/.config/systemd/user
cp ops/jobhopper-watch.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now jobhopper-watch
journalctl --user -u jobhopper-watch -f
```

To keep it running after logout: `loginctl enable-linger "$USER"`.

## tmux alternative

```bash
tmux new -s jobhopper
jobhopper watch --publish
# detach: Ctrl-b d
```

## Notes and troubleshooting

- **No key**: the scan still runs, but tab judgment/backfill are skipped. Set
  the OpenRouter key with `jobhopper config set-openrouter-key`.
- **Git identity**: publishing needs `git config user.name` and `user.email`.
- **SSH config**: a broken `/etc/ssh` config is retried with
  `ssh -F /dev/null` automatically.
- **Dirty tree**: `git pull` uses `--autostash`. If a pull conflicts, the
  watcher logs it and keeps the local snapshot; resolve and restart.
- **Dashboards**: the watcher commits `jobs.json` plus the generated HTML
  dashboards whenever the snapshot changes. If the snapshot is unchanged, the
  HTML may remain modified in the working tree.
- **Access**: the Pages site is intentionally public now (the Access gate was
  removed), so the old "both URLs must 302 to cloudflareaccess.com" check from
  the JobHopper practices skill no longer applies.
