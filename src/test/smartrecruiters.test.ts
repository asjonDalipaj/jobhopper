import { test } from 'node:test';
import assert from 'node:assert/strict';
import { smartrecruitersLocation, smartrecruitersJobsFromPage, smartrecruitersDescription } from '../sources/smartrecruiters.js';
import { passesMarketGate } from '../market.js';

test('passesMarketGate accepts only market-fresh-relevant postings', () => {
  assert.equal(passesMarketGate({ location: 'Madrid, Spain', postedAt: new Date().toISOString(), title: 'Backend Engineer' }), true);
  assert.equal(passesMarketGate({ location: 'Berlin, Germany', postedAt: new Date().toISOString(), title: 'Backend Engineer' }), false);
  assert.equal(passesMarketGate({ location: 'Madrid, Spain', postedAt: '2020-01-01', title: 'Backend Engineer' }), false);
  assert.equal(passesMarketGate({ location: 'Madrid, Spain', postedAt: new Date().toISOString(), title: 'Payroll Specialist' }), false);
});

test('smartrecruitersLocation uses fullLocation, falling back to city and country', () => {
  assert.equal(
    smartrecruitersLocation({ fullLocation: 'Suzhou, Jiangsu, China', city: 'Suzhou', country: 'cn' }),
    'Suzhou, Jiangsu, China',
  );
  assert.equal(smartrecruitersLocation({ city: 'Madrid', country: 'es' }), 'Madrid, es');
  assert.equal(smartrecruitersLocation({ country: 'nl' }), 'nl');
  assert.equal(smartrecruitersLocation(undefined), '');
});

test('smartrecruitersJobsFromPage maps postings to SourceJob', () => {
  const page = {
    content: [
      {
        id: '744000154195629',
        name: 'Asia HR Director',
        releasedDate: '2026-10-07T21:07:45.186Z',
        refNumber: 'REF460M',
        typeOfEmployment: { label: 'Full-time' },
        location: { city: 'Suzhou', fullLocation: 'Suzhou, Jiangsu, China', country: 'cn', remote: false, hybrid: true },
      },
    ],
  };
  const jobs = smartrecruitersJobsFromPage({ name: 'Averna', token: 'Averna1' }, page);
  assert.equal(jobs.length, 1);
  assert.deepEqual(jobs[0], {
    externalId: '744000154195629',
    source: 'smartrecruiters',
    company: 'Averna',
    title: 'Asia HR Director',
    location: 'Suzhou, Jiangsu, China',
    workplaceType: 'Hybrid',
    employmentType: 'Full-time',
    url: 'https://jobs.smartrecruiters.com/Averna1/744000154195629',
    description: '',
    postedAt: '2026-10-07T21:07:45.186Z',
  });
});

test('smartrecruitersJobsFromPage drops postings without an id', () => {
  const jobs = smartrecruitersJobsFromPage(
    { name: 'X', token: 'x' },
    { content: [{ name: 'No id role' }, { id: '', name: 'Empty id role' }, { id: 'b2', name: 'Kept' }] },
  );
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].externalId, 'b2');
});

test('smartrecruitersJobsFromPage tolerates an empty page and partial postings', () => {
  assert.deepEqual(smartrecruitersJobsFromPage({ name: 'X', token: 'x' }, {}), []);
  const [job] = smartrecruitersJobsFromPage({ name: 'X', token: 'x' }, { content: [{ id: 'a1', name: 'Role' }] });
  assert.equal(job.title, 'Role');
  assert.equal(job.location, '');
  assert.equal(job.employmentType, null);
  assert.equal(job.postedAt, null);
});

test('smartrecruitersDescription combines detail sections into plain text', () => {
  assert.equal(
    smartrecruitersDescription({
      jobAd: {
        sections: {
          jobDescription: { text: '<p>Build <strong>things</strong>.</p>' },
          qualifications: { text: '<ul><li>5+ years</li></ul>' },
        },
      },
    }),
    'Build things .\n\n5+ years',
  );
  assert.equal(smartrecruitersDescription({}), '');
  assert.equal(smartrecruitersDescription({ jobAd: {} }), '');
});
