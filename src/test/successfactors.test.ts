import { test } from 'node:test';
import assert from 'node:assert/strict';
import { successFactorsFeedUrl, parseSuccessFactorsFeed, parseLegacyFeed } from '../sources/successfactors.js';

const rss = `<?xml version="1.0"?><rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel><title>Acme Careers</title>
<item>
  <title>Backend Engineer (Milan, Italy)</title>
  <link>https://careers.acme.com/job/123</link>
  <description><![CDATA[<p>Build <b>APIs</b></p>]]></description>
  <pubDate>Mon, 02 Nov 2026 10:00:00 GMT</pubDate>
  <g:id>123</g:id>
  <g:location></g:location>
  <g:employer>Acme Srl</g:employer>
  <g:job_type>Full-time</g:job_type>
</item>
<item>
  <title>Data Engineer</title>
  <link>https://careers.acme.com/job/124</link>
  <g:id>124</g:id>
  <g:location>Rome, Italy</g:location>
</item>
</channel></rss>`;

const legacy = `<?xml version="1.0"?><Job-Listing>
<Job><ReqId>R1</ReqId><JobTitle>Platform Engineer</JobTitle>
<Location>Turin, Italy</Location><Job-Description>&lt;p&gt;Go and SQL&lt;/p&gt;</Job-Description>
<Posted-Date>01/11/2026</Posted-Date></Job>
</Job-Listing>`;

test('successFactorsFeedUrl handles hosts and legacy career URLs', () => {
  assert.equal(successFactorsFeedUrl('careers.acme.com'), 'https://careers.acme.com/sitemal.xml');
  assert.equal(
    successFactorsFeedUrl('https://career5.successfactors.com/career?company=ACME&career_ns=job_listing_summary'),
    'https://career5.successfactors.com/career?company=ACME&career_ns=job_listing_summary&resultType=XML',
  );
});

test('parseSuccessFactorsFeed maps RSS items', () => {
  const jobs = parseSuccessFactorsFeed(rss);
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].externalId, '123');
  assert.equal(jobs[0].title, 'Backend Engineer');
  assert.equal(jobs[0].location, 'Milan, Italy');
  assert.equal(jobs[0].company, 'Acme Srl');
  assert.equal(jobs[0].description, 'Build APIs');
  assert.equal(jobs[0].employmentType, 'Full-time');
  assert.equal(jobs[0].postedAt, '2026-11-02T10:00:00.000Z');
  assert.equal(jobs[1].location, 'Rome, Italy');
});

test('parseLegacyFeed maps Job-Listing XML', () => {
  const jobs = parseLegacyFeed(legacy, 'career5.successfactors.com', 'ACME', 'Acme Srl');
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].externalId, 'R1');
  assert.equal(jobs[0].title, 'Platform Engineer');
  assert.equal(jobs[0].location, 'Turin, Italy');
  assert.equal(jobs[0].description, 'Go and SQL');
  assert.equal(jobs[0].postedAt, '2026-11-01T00:00:00.000Z');
  assert.match(String(jobs[0].url), /jobId=R1&company=ACME/);
});
