import { test } from 'node:test';
import assert from 'node:assert/strict';
import { careerjetJobsFromResponse, mapCareerjetJob } from '../sources/careerjet.js';
import { joobleJobsFromResponse, mapJoobleJob } from '../sources/jooble.js';

test('mapCareerjetJob normalizes a posting', () => {
  const job = mapCareerjetJob({
    title: 'Software Engineer',
    company: 'Acme',
    date: 'Wed, 15 Nov 2025 19:13:43 GMT',
    description: 'Build APIs. Remote friendly.',
    locations: 'Milan',
    url: 'https://example.test/job/1',
  });
  assert.ok(job);
  assert.equal(job.source, 'aggregator-careerjet');
  assert.equal(job.company, 'Acme');
  assert.equal(job.workplaceType, 'Remote');
  assert.equal(job.postedAt, '2025-11-15T19:13:43.000Z');
});

test('careerjetJobsFromResponse rejects location-mode and missing titles', () => {
  assert.deepEqual(careerjetJobsFromResponse({ type: 'LOCATIONS', jobs: [] }), []);
  assert.equal(careerjetJobsFromResponse({ jobs: [{ title: 'Developer' }] }).length, 1);
  const jobs = careerjetJobsFromResponse({
    type: 'JOBS',
    jobs: [{ title: '' }, { title: 'Backend Developer', company: 'B', locations: 'Rome', date: 'bad' }],
  });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0]?.postedAt, null);
});

test('mapJoobleJob normalizes a posting', () => {
  const job = mapJoobleJob({
    id: 123,
    title: 'Data Engineer',
    company: 'Beta',
    location: 'Turin',
    snippet: 'Hybrid role. Build pipelines.',
    type: 'Full-time',
    link: 'https://jooble.test/jdp/123',
    updated: '2025-11-06T10:00:00.000Z',
  });
  assert.ok(job);
  assert.equal(job.source, 'aggregator-jooble');
  assert.equal(job.externalId, '123');
  assert.equal(job.workplaceType, 'Hybrid');
  assert.equal(job.employmentType, 'Full-time');
});

test('joobleJobsFromResponse tolerates an empty response', () => {
  assert.deepEqual(joobleJobsFromResponse({ totalCount: 0, jobs: [] }), []);
  assert.deepEqual(joobleJobsFromResponse({}), []);
});
