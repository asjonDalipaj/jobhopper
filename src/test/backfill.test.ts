import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pendingSnapshotRows, snapshotTarget, type SnapshotRow } from '../export/backfill.js';

const row = (over: Partial<SnapshotRow> = {}): SnapshotRow => ({
  source: 'ashby',
  external_id: '1',
  company: 'Acme',
  title: 'Backend Engineer',
  location: 'Milano',
  ...over,
});

test('snapshotTarget maps a snapshot row to the judge payload', () => {
  const target = snapshotTarget(row({
    workplace_type: 'Hybrid',
    employment_type: 'Full-time',
    description: 'Build things',
    url: 'https://x.test/1',
  }));
  assert.deepEqual(target, {
    company: 'Acme',
    title: 'Backend Engineer',
    location: 'Milano',
    workplaceType: 'Hybrid',
    employmentType: 'Full-time',
    description: 'Build things',
    url: 'https://x.test/1',
  });
  assert.equal(snapshotTarget(row()).workplaceType, null);
  assert.equal(snapshotTarget(row()).description, '');
});

test('pendingSnapshotRows selects unjudged rows, caps, and can rejudge', () => {
  const rows = [
    row({ external_id: 'a' }),
    row({ external_id: 'b', verdict: 'weak' }),
    row({ external_id: 'c', verdict: 'no' }),
    row({ external_id: 'd' }),
  ];
  assert.deepEqual(pendingSnapshotRows(rows).map((r) => r.external_id), ['a', 'd']);
  assert.deepEqual(pendingSnapshotRows(rows, { limit: 1 }).map((r) => r.external_id), ['a']);
  assert.deepEqual(pendingSnapshotRows(rows, { rejudge: true }).map((r) => r.external_id), ['a', 'b', 'c', 'd']);
});
