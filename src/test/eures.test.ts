import { test } from 'node:test';
import assert from 'node:assert/strict';
import { euresJob, euresLocation, euresPostedAt, euresSearchBody } from '../sources/eures.js';

const item = {
  id: 'MTAwMTUzNiAxNw',
  title: 'Sviluppatore Backend',
  description: '<p>Lavora con <b>Java</b> e SQL</p>',
  creationDate: 1_793_617_231_373,
  locationMap: { IT: ['ITC11'] },
  employer: { name: 'Acme Srl' },
  positionOfferingCode: 'permanent',
};

test('euresLocation renders the country name with its NUTS codes', () => {
  assert.equal(euresLocation({ IT: ['ITC11'] }), 'Italy (ITC11)');
  assert.equal(euresLocation({ ES: ['ES511', 'ES512'] }), 'Spain (ES511, ES512)');
  assert.equal(euresLocation({ NL: [] }), 'Netherlands');
  assert.equal(euresLocation({}), '');
});

test('euresPostedAt converts epoch milliseconds and rejects junk', () => {
  assert.equal(euresPostedAt(1_793_617_231_373), new Date(1_793_617_231_373).toISOString());
  assert.equal(euresPostedAt(undefined), null);
  assert.equal(euresPostedAt(0), null);
  assert.equal(euresPostedAt('not-a-date'), null);
});

test('euresJob maps a search row to a normalized job', () => {
  const job = euresJob(item);
  assert.ok(job);
  assert.equal(job.externalId, 'MTAwMTUzNiAxNw');
  assert.equal(job.source, 'eures');
  assert.equal(job.company, 'Acme Srl');
  assert.equal(job.title, 'Sviluppatore Backend');
  assert.equal(job.location, 'Italy (ITC11)');
  assert.equal(job.employmentType, 'Full-time');
  assert.equal(job.description, 'Lavora con Java e SQL');
  assert.equal(job.url, 'https://europa.eu/eures/portal/jv-se/jv-details/MTAwMTUzNiAxNw?lang=en');
  assert.equal(job.postedAt, new Date(1_793_617_231_373).toISOString());
});

test('euresJob keeps anonymous employers and drops rows without id or title', () => {
  assert.equal(euresJob({ ...item, employer: undefined })?.company, 'Unknown employer');
  assert.equal(euresJob({ ...item, id: undefined }), null);
  assert.equal(euresJob({ ...item, title: '  ' }), null);
});

test('euresSearchBody asks for one country, most recent, last week', () => {
  const body = euresSearchBody('it', 2);
  assert.equal(body.page, 2);
  assert.equal(body.resultsPerPage, 50);
  assert.deepEqual(body.locationCodes, ['it']);
  assert.equal(body.publicationPeriod, 'LAST_WEEK');
  assert.equal(body.sortSearch, 'MOST_RECENT');
});
