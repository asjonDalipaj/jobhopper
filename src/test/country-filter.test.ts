import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Must be set before the db modules load: paths.ts captures JOBHOPPER_HOME.
process.env['JOBHOPPER_HOME'] = mkdtempSync(join(tmpdir(), 'jobhopper-country-'));

const { upsertJob, listJobs } = await import('../db/jobs-repo.js');
const { closeDb } = await import('../db/connection.js');

const base = {
  source: 'greenhouse',
  company: 'Acme',
  title: 'Backend Engineer',
  description: '',
  postedAt: '2026-10-29T00:00:00Z',
};

test('the country filter uses the scan aliases, not LIKE %Country%', () => {
  upsertJob({ ...base, externalId: 'it-1', location: 'Milano, Lombardia' });
  upsertJob({ ...base, externalId: 'it-2', location: 'Bergamo' });
  upsertJob({ ...base, externalId: 'de-1', location: 'Berlin, Germany' });
  upsertJob({ ...base, externalId: 'es-1', location: 'Madrid, Spain' });
  upsertJob({ ...base, externalId: 'noise-1', location: 'Manufacturing District' });

  const italy = listJobs({ country: 'Italy', limit: 50 }).map((row) => row.location).sort();
  assert.deepEqual(italy, ['Bergamo', 'Milano, Lombardia']);

  const spain = listJobs({ country: 'Spain', limit: 50 }).map((row) => row.location);
  assert.deepEqual(spain, ['Madrid, Spain']);
});

test('a non-target country keeps the plain substring filter', () => {
  const germany = listJobs({ country: 'Germany', limit: 50 }).map((row) => row.location);
  assert.deepEqual(germany, ['Berlin, Germany']);
});

after(() => closeDb());
