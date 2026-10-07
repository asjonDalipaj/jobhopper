import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeSnapshotRows } from '../export/html.js';

interface Row {
  source: string;
  external_id: string;
  company: string;
  title: string;
  verdict: string | null;
  reasoning?: string | null;
}

const row = (source: string, external_id: string, extra: Partial<Row> = {}): Row => ({
  source,
  external_id,
  company: 'Co',
  title: 'T',
  verdict: null,
  ...extra,
});

test('mergeSnapshotRows keeps committed rows that the local DB no longer has', () => {
  const existing = [row('greenhouse', 'discord-1', { company: 'Discord' })];
  const fresh = [row('ashby', 'cleafy-2', { company: 'Cleafy' })];
  const merged = mergeSnapshotRows(existing, fresh);
  assert.deepEqual(
    merged.map((r) => r.external_id).sort(),
    ['cleafy-2', 'discord-1'],
  );
});

test('mergeSnapshotRows lets fresh rows replace committed rows with the same key', () => {
  const existing = [row('ashby', 'x-1', { verdict: null })];
  const fresh = [row('ashby', 'x-1', { verdict: 'strong' })];
  const merged = mergeSnapshotRows(existing, fresh);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].verdict, 'strong');
});

test('mergeSnapshotRows keeps a committed verdict when the fresh row has none', () => {
  const existing = [row('ashby', 'x-1', { verdict: 'weak', reasoning: 'old' })];
  const fresh = [row('ashby', 'x-1', { verdict: null, reasoning: null })];
  const [kept] = mergeSnapshotRows(existing, fresh);
  assert.equal(kept.verdict, 'weak');
  assert.equal(kept.reasoning, 'old');
});

test('mergeSnapshotRows treats an empty existing snapshot as just the fresh rows', () => {
  const fresh = [row('lever', 'a-1')];
  assert.deepEqual(mergeSnapshotRows([], fresh), fresh);
});
