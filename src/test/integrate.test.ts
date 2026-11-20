import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { integrate } from '../watch.js';

const SNAPSHOT = '.jobhopper/exports/jobs.json';

function run(cwd: string, ...args: string[]) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${(result.stderr || '').trim()}`);
  return result;
}

function write(cwd: string, path: string, body: string) {
  mkdirSync(join(cwd, path, '..'), { recursive: true });
  writeFileSync(join(cwd, path), body, 'utf8');
}

function commit(cwd: string, message: string) {
  run(cwd, 'add', '--', '.');
  run(cwd, 'commit', '-q', '-m', message);
}

/**
 * origin (bare) ← work (local commit) and ← other (remote commit pushing first),
 * so `work` is diverged with a conflict in the generated snapshot.
 */
function divergedRepo() {
  const root = mkdtempSync(join(tmpdir(), 'jobhopper-integrate-'));
  const origin = join(root, 'origin.git');
  const work = join(root, 'work');
  const other = join(root, 'other');
  run(root, 'init', '-q', '--bare', '-b', 'main', origin);
  run(root, 'clone', '-q', origin, work);
  run(root, 'clone', '-q', origin, other);
  for (const repo of [work, other]) {
    run(repo, 'config', 'user.email', 'test@example.com');
    run(repo, 'config', 'user.name', 'test');
    run(repo, 'checkout', '-q', '-B', 'main');
  }
  write(work, SNAPSHOT, '[]\n');
  write(work, 'src/keep.ts', 'export const keep = 1;\n');
  commit(work, 'base');
  run(work, 'push', '-q', '-u', 'origin', 'main');

  // local work
  write(work, SNAPSHOT, '[1]\n');
  commit(work, 'local snapshot');

  // someone else advances the same file
  run(other, 'pull', '-q', '--ff-only', 'origin', 'main');
  write(other, SNAPSHOT, '[2]\n');
  commit(other, 'remote snapshot');
  run(other, 'push', '-q', 'origin', 'main');
  return { root, work };
}

function assertNoGitState(repo: string, label: string) {
  for (const state of ['MERGE_HEAD', 'rebase-merge', 'rebase-apply']) {
    assert.equal(existsSync(join(repo, '.git', state)), false, `${label} left ${state} behind`);
  }
}

test('integrate(remote) takes CI\'s snapshot and leaves no merge or rebase behind', () => {
  const { root, work } = divergedRepo();
  const previous = process.cwd();
  try {
    process.chdir(work);
    assert.equal(integrate('remote'), true);
    assert.equal(readFileSync(join(work, SNAPSHOT), 'utf8'), '[2]\n');
    assertNoGitState(work, 'integrate(remote)');
    assert.equal(run(work, 'status', '--porcelain').stdout.trim(), '');
  } finally {
    process.chdir(previous);
    rmSync(root, { recursive: true, force: true });
  }
});

test('integrate(local) keeps the snapshot this cycle just exported', () => {
  const { root, work } = divergedRepo();
  const previous = process.cwd();
  try {
    process.chdir(work);
    assert.equal(integrate('local'), true);
    assert.equal(readFileSync(join(work, SNAPSHOT), 'utf8'), '[1]\n');
    assertNoGitState(work, 'integrate(local)');
  } finally {
    process.chdir(previous);
    rmSync(root, { recursive: true, force: true });
  }
});

test('integrate aborts instead of deciding a conflict outside the generated exports', () => {
  const { root, work } = divergedRepo();
  const other = join(root, 'other');
  const previous = process.cwd();
  try {
    // A second divergence in hand-written code.
    write(work, 'src/keep.ts', 'export const keep = 2;\n');
    commit(work, 'local code change');
    write(other, 'src/keep.ts', 'export const keep = 3;\n');
    commit(other, 'remote code change');
    run(other, 'push', '-q', 'origin', 'main');

    process.chdir(work);
    assert.equal(integrate('local'), false);
    // The merge must be gone, and the local file untouched by conflict markers.
    assertNoGitState(work, 'integrate(conflict)');
    assert.equal(readFileSync(join(work, 'src/keep.ts'), 'utf8'), 'export const keep = 2;\n');
  } finally {
    process.chdir(previous);
    rmSync(root, { recursive: true, force: true });
  }
});
