import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recruiteeLocation, recruiteeJobsFromResponse } from '../sources/recruitee.js';

test('recruiteeLocation builds "City, Country" parts from locations[]', () => {
  assert.equal(
    recruiteeLocation([
      { city: 'Chicago', country: 'United States', country_code: 'US' },
      { city: 'Madrid', country: 'Spain', country_code: 'ES' },
    ]),
    'Chicago, United States; Madrid, Spain',
  );
  assert.equal(recruiteeLocation([{ country: 'Italy' }]), 'Italy');
  assert.equal(recruiteeLocation([]), '');
  assert.equal(recruiteeLocation(undefined), '');
});

test('recruiteeJobsFromResponse maps published offers and skips other statuses', () => {
  const body = {
    offers: [
      {
        id: 179823,
        slug: 'senior-consultant',
        title: 'Senior Consultant',
        city: 'Madrid',
        country: 'Spain',
        status: 'published',
        published_at: '2026-10-05 12:35:49 UTC',
        careers_url: 'https://consultdss.recruitee.com/o/senior-consultant',
        description: '<p>Advise clients.</p>',
        locations: [{ city: 'Madrid', country: 'Spain', country_code: 'ES' }],
      },
      { id: 2, slug: 'closed', title: 'Closed role', status: 'closed', locations: [] },
    ],
  };
  const jobs = recruiteeJobsFromResponse({ name: 'Dss', token: 'consultdss' }, body);
  assert.equal(jobs.length, 1);
  assert.deepEqual(jobs[0], {
    externalId: '179823',
    source: 'recruitee',
    company: 'Dss',
    title: 'Senior Consultant',
    location: 'Madrid, Spain',
    workplaceType: null,
    employmentType: null,
    url: 'https://consultdss.recruitee.com/o/senior-consultant',
    description: 'Advise clients.',
    postedAt: '2026-10-05 12:35:49 UTC',
  });
});

test('recruiteeJobsFromResponse falls back to the slug link and tolerates an empty body', () => {
  assert.deepEqual(recruiteeJobsFromResponse({ name: 'X', token: 'x' }, {}), []);
  const [job] = recruiteeJobsFromResponse(
    { name: 'X', token: 'x' },
    { offers: [{ id: 9, slug: 'role-9', title: 'Role', status: 'published' }] },
  );
  assert.equal(job.url, 'https://x.recruitee.com/o/role-9');
  assert.equal(job.location, '');
  assert.equal(job.description, '');
});
