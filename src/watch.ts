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
import { join, relative } from 'node:path';
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
  const result = spawnSync('git', args, { cwd: process.cwd(), encoding: 'utf8' });
  if (result.status !== 0 && !allowFail) {
    throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || '').trim()}`);
  }
  return result;
}

function syncRemote(): void {
  const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], true);
  if (upstream.status !== 0) {
    console.log('[watch] no upstream branch; skipping the remote pull');
    return;
  }
  const pull = git(['pull', '--rebase', '--autostash'], true);
  if (pull.status !== 0) {
    console.error('[watch] git pull failed; continuing with the local snapshot');
    console.error((pull.stderr || '').trim());
  }
}

/** Commit and push only the snapshot; never touches other staged files. */
function publishSnapshot(path: string): void {
  const rel = relative(process.cwd(), path);
  git(['add', '--', rel]);
  const diff = git(['diff', '--cached', '--quiet', '--', rel], true);
  if (diff.status === 0) return;

  git(['commit', '-m', `chore: fresh jobs snapshot ${new Date().toISOString()}`, '--', rel]);
  const pull = git(['pull', '--rebase', '--autostash'], true);
  if (pull.status !== 0) console.error('[watch] pull before push failed; trying to push anyway');
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
