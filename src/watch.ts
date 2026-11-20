/**
 * Local 15-minute watcher.
 *
 * Runs the same pipeline as the scheduled GitHub workflow, but against the
 * persistent local SQLite DB: scan → export → judge the market tabs → backfill →
 * re-export. With --publish, a changed snapshot is committed and pushed, which
 * triggers the normal Pages deploy and keeps the hosted board aligned with the
 * local one.
 *
 * GitHub Actions remains the fallback every 3 hours when this process is off.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { getPaths } from './storage/paths.js';
import { hasApiKey, loadConfig } from './config/config.js';
import { parseIntervalMinutes } from './watch/interval.js';

const TABS = ['italy-roles', 'spain-roles', 'netherlands-roles'] as const;

export interface WatchOptions {
  interval: string;
  publish: boolean;
  once: boolean;
}

function snapshotPath(): string {
  return join(getPaths().exportsDir, 'jobs.json');
}

function digest(path: string): string {
  if (!existsSync(path)) return '';
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function sleep(ms: number, stopping: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const until = Date.now() + ms;
    const tick = () => {
      if (stopping() || Date.now() >= until) resolve();
      else setTimeout(tick, Math.min(1000, until - Date.now()));
    };
    tick();
  });
}

function runCli(args: string[]): Promise<void> {
  const entry = process.env['JOBHOPPER_CLI'] ?? process.argv[1];
  if (!entry) throw new Error('cannot locate the jobhopper entry point');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry, ...args], { stdio: 'inherit', env: process.env });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`jobhopper ${args.join(' ')} failed (${signal ?? code})`));
    });
  });
}

function git(args: string[], allowFail = false) {
  const run = (env: NodeJS.ProcessEnv) => spawnSync('git', args, { cwd: process.cwd(), encoding: 'utf8', env });
  let result = run(process.env);
  // Some hosts ship a broken /etc/ssh config; the repo works with `ssh -F /dev/null`.
  // Retry only for that failure, never for ordinary git errors.
  if (result.status !== 0 && /Bad owner or permissions|Could not read from remote repository/i.test(result.stderr || '')) {
    console.log('[watch] retrying git with GIT_SSH_COMMAND=ssh -F /dev/null');
    result = run({ ...process.env, GIT_SSH_COMMAND: 'ssh -F /dev/null' });
  }
  if (result.status !== 0 && !allowFail) {
    throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || '').trim()}`);
  }
  return result;
}

/** Directory holding files this process regenerates on every cycle. */
const GENERATED_DIR = join('.jobhopper', 'exports');

/**
 * Integrate origin/main without ever leaving the repo wedged.
 *
 * The snapshot and dashboards are regenerated every cycle, so a 3-way merge of
 * them means nothing. A `pull --rebase` that hits one conflicts and STOPS: git
 * detaches HEAD, leaves conflict markers inside jobs.json, and every later
 * cycle fails (unparseable snapshot, "not currently on a branch"). That is
 * exactly how this watcher died on 2026-11-20.
 *
 * So: merge instead of rebase, and resolve conflicts wholesale — but only when
 * every conflicting path is generated. Anything else is aborted for a human
 * rather than silently decided.
 *
 * @param prefer 'remote' before scanning (CI's snapshot becomes the base the
 *   local export merges onto); 'local' after exporting (ours is newer).
 */
export function integrate(prefer: 'local' | 'remote'): boolean {
  const fetch = git(['fetch', 'origin', 'main'], true);
  if (fetch.status !== 0) {
    console.error('[watch] git fetch failed; keeping the local snapshot');
    console.error((fetch.stderr || '').trim());
    return false;
  }
  const merge = git(['merge', '--no-edit', 'origin/main'], true);
  if (merge.status === 0) return true;

  const conflicts = (git(['diff', '--name-only', '--diff-filter=U'], true).stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const generatedOnly = conflicts.length > 0 && conflicts.every((path) => path.startsWith(`${GENERATED_DIR}/`));
  if (!generatedOnly) {
    git(['merge', '--abort'], true);
    console.error('[watch] conflict outside the generated exports; left it for you to resolve');
    if (conflicts.length) console.error(conflicts.join('\n'));
    return false;
  }

  // In a merge, --ours is this branch and --theirs is origin/main.
  const side = prefer === 'remote' ? '--theirs' : '--ours';
  git(['checkout', side, '--', ...conflicts], true);
  git(['add', '--', ...conflicts], true);
  if (git(['commit', '--no-edit'], true).status !== 0) {
    git(['merge', '--abort'], true);
    console.error('[watch] could not finish the merge; keeping the local snapshot');
    return false;
  }
  console.log(`[watch] resolved ${conflicts.length} generated file conflict(s) in favour of ${prefer}`);
  return true;
}

function syncRemote(): void {
  const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], true);
  if (upstream.status !== 0) {
    console.log('[watch] no upstream branch; skipping the remote pull');
    return;
  }
  if (!integrate('remote')) console.error('[watch] continuing with the local snapshot this cycle');
}

/** Commit and push the exports (snapshot + dashboards); never touches other staged files. */
function publishSnapshot(path: string): void {
  const rel = relative(process.cwd(), path);
  const dir = dirname(rel);
  git(['add', '--', dir]);
  const diff = git(['diff', '--cached', '--quiet', '--', dir], true);
  if (diff.status === 0) return;
  if (diff.status !== 1) throw new Error('git diff failed while checking the snapshot');

  git(['commit', '-m', `chore: fresh jobs snapshot ${new Date().toISOString()}`, '--', dir]);
  // Our export is newer than whatever landed on the remote during the scan.
  if (!integrate('local')) {
    console.error('[watch] could not integrate the remote; the snapshot stays local this cycle');
    return;
  }
  const push = git(['push'], true);
  if (push.status !== 0) {
    console.error('[watch] push failed; the snapshot stays local this cycle');
    console.error((push.stderr || '').trim());
  } else {
    console.log('[watch] published the fresh snapshot');
  }
}

async function cycle(opts: WatchOptions): Promise<void> {
  if (opts.publish) syncRemote();
  const before = digest(snapshotPath());

  await runCli(['scan', '-a', '--verify']);
  // A Worker scan may have committed while this one was running; pull its rows
  // in before the export so the merge keeps both sides.
  if (opts.publish) syncRemote();
  await runCli(['run', '-j', snapshotPath()]);

  if (hasApiKey(loadConfig())) {
    for (const tab of TABS) {
      try {
        await runCli(['judge', '--tab', tab, '--quick']);
      } catch (err) {
        console.error(`[watch] judging ${tab} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    await runCli(['run', '-j', snapshotPath()]);
    try {
      await runCli(['backfill', '--snapshot', snapshotPath(), '--quick', '--limit', '200']);
    } catch (err) {
      console.error(`[watch] backfill failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    console.log('[watch] no OpenRouter key; skipping tab and backfill judgment');
  }

  const changed = before !== digest(snapshotPath());
  console.log(`[watch] snapshot ${changed ? 'changed' : 'unchanged'}`);
  if (changed && opts.publish) publishSnapshot(snapshotPath());
}

function acquireLock(): () => void {
  const root = getPaths().root;
  mkdirSync(root, { recursive: true });
  const lock = join(root, 'watch.lock');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(lock, 'wx');
      writeFileSync(fd, String(process.pid));
      closeSync(fd);
      const release = () => {
        try {
          if (readFileSync(lock, 'utf8').trim() === String(process.pid)) unlinkSync(lock);
        } catch {
          // already gone
        }
      };
      process.once('exit', release);
      return release;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') throw err;
      let pid = 0;
      try {
        pid = Number(readFileSync(lock, 'utf8').trim());
      } catch {
        // unreadable lock: treat as stale
      }
      let alive = false;
      if (pid > 0) {
        try {
          process.kill(pid, 0);
          alive = true;
        } catch {
          alive = false;
        }
      }
      if (alive) throw new Error(`another watcher is already running (pid ${pid}); stop it or delete ${lock}`);
      unlinkSync(lock);
    }
  }
  throw new Error(`could not acquire ${lock}`);
}

export async function watch(opts: WatchOptions): Promise<void> {
  const intervalMs = parseIntervalMinutes(opts.interval);
  const release = acquireLock();
  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  console.log(`[watch] every ${Math.round(intervalMs / 60000)} min${opts.publish ? ', publishing changes' : ''}; Ctrl-C to stop`);
  try {
    while (!stopping) {
      const started = Date.now();
      console.log(`[watch] ${new Date().toISOString()} cycle start`);
      try {
        await cycle(opts);
      } catch (err) {
        console.error(`[watch] cycle failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      if (opts.once || stopping) break;
      const wait = Math.max(1000, intervalMs - (Date.now() - started));
      console.log(`[watch] next cycle in ${Math.round(wait / 1000)}s`);
      await sleep(wait, () => stopping);
    }
  } finally {
    release();
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}
