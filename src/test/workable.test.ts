import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workableJobsFromResponse, workableLocation } from '../sources/workable.js';

test('workableLocation joins every location as "City, Country" and keeps countryCode', () => {
  assert.equal(
    workableLocation([{ country: 'Italy', countryCode: 'IT', city: 'Milan', region: 'Lombardy' }]),
    'Milan, Italy',
  );
  assert.equal(
    workableLocation([
      { country: 'Spain', countryCode: 'ES', city: 'Madrid' },
      { country: 'Netherlands', countryCode: 'NL', city: 'Amsterdam' },
    ]),
    'Madrid, Spain; Amsterdam, Netherlands',
  );
  assert.equal(workableLocation([{ country: 'Spain', countryCode: 'ES' }]), 'Spain');
  assert.equal(workableLocation([]), '');
  assert.equal(workableLocation(undefined), '');
});

test('workableJobsFromResponse maps v3 results to SourceJob with a shortcode-based URL', () => {
  const body = {
    total: 1,
    results: [
      {
        id: 5950803,
        shortcode: 'D1290D2DA5',
        title: 'Engineering Lead',
        remote: false,
        locations: [{ country: 'Italy', countryCode: 'IT', city: 'Milan' }],
        published: '2026-09-30T00:00:00.000Z',
        workplace: 'hybrid',
        department: [],
      },
    ],
  };
  const jobs = workableJobsFromResponse({ name: 'Cleafy', token: 'cleafy' }, body);
  assert.equal(jobs.length, 1);
  assert.deepEqual(jobs[0], {
    externalId: 'D1290D2DA5',
    source: 'workable',
    company: 'Cleafy',
    title: 'Engineering Lead',
    location: 'Milan, Italy',
    workplaceType: 'hybrid',
    employmentType: null,
    url: 'https://apply.workable.com/cleafy/j/D1290D2DA5/',
    description: '',
    postedAt: '2026-09-30T00:00:00.000Z',
  });
});

test('workableJobsFromResponse tolerates missing optional fields and an empty board', () => {
  assert.deepEqual(workableJobsFromResponse({ name: 'X', token: 'x' }, {}), []);
  const [job] = workableJobsFromResponse({ name: 'X', token: 'x' }, { results: [{ shortcode: 'AB12' }] });
  assert.equal(job.title, 'Untitled');
  assert.equal(job.location, '');
  assert.equal(job.url, 'https://apply.workable.com/x/j/AB12/');
  assert.equal(job.postedAt, null);
});
