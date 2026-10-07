import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAtsUrl, isUsableStatus, rowsToCompanies, boardHasTargetMarketJobs, type TrackerRow } from '../sources/tracker.js';

test('parseAtsUrl detects Greenhouse, Lever and Ashby board tokens', () => {
  assert.deepEqual(parseAtsUrl('https://job-boards.greenhouse.io/adyen/jobs/7342887'), { ats: 'greenhouse', token: 'adyen' });
  assert.deepEqual(parseAtsUrl('https://boards.greenhouse.io/Cloudflare/jobs/1'), { ats: 'greenhouse', token: 'cloudflare' });
  assert.deepEqual(parseAtsUrl('https://jobs.lever.co/spotify'), { ats: 'lever', token: 'spotify' });
  assert.deepEqual(parseAtsUrl('https://jobs.ashbyhq.com/mollie/'), { ats: 'ashby', token: 'mollie' });
});

test('parseAtsUrl returns null for unsupported platforms and junk input', () => {
  assert.equal(parseAtsUrl('https://cleafy.workable.com/'), null);
  assert.equal(parseAtsUrl('https://ikusi.wd3.myworkdayjobs.com/es/Vacantes'), null);
  assert.equal(parseAtsUrl('https://crisalix-labs-slu.jobs.personio.com/'), null);
  assert.equal(parseAtsUrl('https://boards.greenhouse.io/'), null); // no token
  assert.equal(parseAtsUrl('not a url'), null);
});

test('isUsableStatus accepts live and missing-jobs rows only', () => {
  assert.equal(isUsableStatus('Supported/Already Live (>= hiringcafe)'), true);
  assert.equal(isUsableStatus('Missing Jobs (< hiringcafe)'), true);
  assert.equal(isUsableStatus('Deferred (No US jobs; international gap + fix noted)'), false);
  assert.equal(isUsableStatus('Unsupported, Blacklisted (Not English)'), false);
  assert.equal(isUsableStatus(''), false);
});

test('rowsToCompanies keeps supported-ATS rows with usable status, regardless of notes', () => {
  const rows: TrackerRow[] = [
    // kept: usable status, greenhouse (notes carry no country: market is checked live later)
    { companyName: 'Bugaboo', careersUrl: 'https://job-boards.greenhouse.io/bugaboo', status: 'Missing Jobs (< hiringcafe)', notes: 'https://hiring.cafe/org/bugaboo.com' },
    // dropped: unsupported ATS even though it is an EU company
    { companyName: 'Cleafy', careersUrl: 'https://apply.workable.com/cleafy/', status: 'Deferred (No US jobs)', notes: 'Sole live opening in Milan, Italy' },
    // dropped: excluded status
    { companyName: 'Blankrome', careersUrl: 'https://job-boards.greenhouse.io/blankrome', status: 'Unsupported, Blacklisted (Not English)', notes: 'Madrid office' },
    // kept: lever
    { companyName: 'Jobandtalent', careersUrl: 'https://jobs.lever.co/jobandtalent', status: 'Supported/Already Live', notes: '' },
  ];
  const out = rowsToCompanies(rows);
  assert.deepEqual(out, [
    { name: 'Bugaboo', ats: 'greenhouse', token: 'bugaboo' },
    { name: 'Jobandtalent', ats: 'lever', token: 'jobandtalent' },
  ]);
});

test('boardHasTargetMarketJobs is true only when a live posting is in NL/IT/ES', () => {
  const job = (location: string) => ({ externalId: '1', source: 'greenhouse', company: 'X', title: 'Engineer', location });
  assert.equal(boardHasTargetMarketJobs([job('Remote, USA'), job('Amsterdam, Netherlands')]), true);
  assert.equal(boardHasTargetMarketJobs([job('Madrid')]), true);
  assert.equal(boardHasTargetMarketJobs([job('Berlin, Germany'), job('San Francisco')]), false);
  assert.equal(boardHasTargetMarketJobs([]), false);
});

test('rowsToCompanies skips boards already in the registry and duplicates within the batch', () => {
  const existing = [{ name: 'Adyen', ats: 'greenhouse' as const, token: 'adyen' }];
  const rows: TrackerRow[] = [
    { companyName: 'Adyen', careersUrl: 'https://job-boards.greenhouse.io/adyen', status: 'Supported/Already Live', notes: 'Amsterdam' },
    { companyName: 'Bugaboo', careersUrl: 'https://job-boards.greenhouse.io/bugaboo', status: 'Missing Jobs', notes: 'Netherlands' },
    { companyName: 'Bugaboo (dup)', careersUrl: 'https://boards.greenhouse.io/bugaboo/jobs/9', status: 'Missing Jobs', notes: 'Netherlands' },
  ];
  const out = rowsToCompanies(rows, existing);
  assert.deepEqual(out, [{ name: 'Bugaboo', ats: 'greenhouse', token: 'bugaboo' }]);
});
