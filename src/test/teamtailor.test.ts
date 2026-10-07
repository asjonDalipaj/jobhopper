import { test } from 'node:test';
import assert from 'node:assert/strict';
import { teamtailorLocation, teamtailorJobsFromFeed } from '../sources/teamtailor.js';

test('teamtailorLocation builds "City, CC" parts from schema.org jobLocation', () => {
  assert.equal(
    teamtailorLocation([
      { '@type': 'Place', address: { addressLocality: 'Madrid', addressCountry: 'ES' } },
      { '@type': 'Place', address: { addressLocality: 'Amsterdam', addressCountry: 'NL' } },
    ]),
    'Madrid, ES; Amsterdam, NL',
  );
  assert.equal(teamtailorLocation([{ address: { addressCountry: 'Italy' } }]), 'Italy');
  assert.equal(teamtailorLocation([{ address: { addressLocality: 'Milan' } }]), 'Milan');
  assert.equal(teamtailorLocation([]), '');
  assert.equal(teamtailorLocation(undefined), '');
});

test('teamtailorJobsFromFeed maps JSON Feed items to SourceJob', () => {
  const feed = {
    items: [
      {
        id: '62db214f',
        title: 'Senior Backend Engineer',
        url: 'https://tradingview.teamtailor.com/jobs/8104980-data-architect',
        date_published: '2026-07-21T19:24:23+03:00',
        _jobposting: {
          description: '<p>We build tools.</p>',
          jobLocation: [{ address: { addressLocality: 'Barcelona', addressCountry: 'ES' } }],
        },
      },
    ],
  };
  const jobs = teamtailorJobsFromFeed({ name: 'TradingView', token: 'tradingview' }, feed);
  assert.equal(jobs.length, 1);
  assert.deepEqual(jobs[0], {
    externalId: '62db214f',
    source: 'teamtailor',
    company: 'TradingView',
    title: 'Senior Backend Engineer',
    location: 'Barcelona, ES',
    workplaceType: null,
    employmentType: null,
    url: 'https://tradingview.teamtailor.com/jobs/8104980-data-architect',
    description: 'We build tools.',
    postedAt: '2026-07-21T19:24:23+03:00',
  });
});

test('teamtailorJobsFromFeed tolerates an empty or partial feed', () => {
  assert.deepEqual(teamtailorJobsFromFeed({ name: 'X', token: 'x' }, {}), []);
  const [job] = teamtailorJobsFromFeed({ name: 'X', token: 'x' }, { items: [{ id: 'a', url: 'https://x.teamtailor.com/jobs/1' }] });
  assert.equal(job.title, 'Untitled');
  assert.equal(job.location, '');
  assert.equal(job.description, '');
  assert.equal(job.postedAt, null);
});
