import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWorkdayToken, workdayJob, workdayPostedAt } from '../sources/workday.js';

const company = { name: 'Matthey', token: 'matthey|wd3|Ext_Career_Site' };

test('parseWorkdayToken accepts tenant|shard|site and rejects malformed tokens', () => {
  assert.deepEqual(parseWorkdayToken(company.token), { tenant: 'matthey', shard: 'wd3', site: 'Ext_Career_Site' });
  assert.throws(() => parseWorkdayToken('matthey'), /tenant\|shard\|site/);
  assert.throws(() => parseWorkdayToken('a||b'), /tenant\|shard\|site/);
});

test('workdayPostedAt prefers startDate and parses relative text', () => {
  assert.equal(workdayPostedAt({ startDate: '2026-10-29' }), '2026-10-29');
  assert.ok(workdayPostedAt({ postedOn: 'Posted Today' })!.startsWith(new Date().toISOString().slice(0, 10)));
  const three = workdayPostedAt({ postedOn: 'Posted 3 Days Ago' })!;
  assert.ok(new Date(three).getTime() < Date.now() - 2 * 86_400_000);
  assert.equal(workdayPostedAt({ postedOn: 'nonsense' }), null);
  assert.equal(workdayPostedAt({}), null);
});

test('workdayJob maps a list posting plus detail into a normalized job', () => {
  const job = workdayJob(
    company,
    { title: 'List title', externalPath: '/job/Milan/Senior-Engineer_R-1', locationsText: 'Milan, Italy' },
    {
      jobPostingInfo: {
        title: 'Senior Engineer',
        location: 'Milan, Italy',
        startDate: '2026-10-28',
        externalUrl: 'https://matthey.wd3.myworkdayjobs.com/Ext_Career_Site/job/Milan/Senior-Engineer_R-1',
        jobDescription: '<p>Build <b>things</b></p>',
        timeType: 'Full time',
      },
    },
  );
  assert.ok(job);
  assert.equal(job.externalId, 'matthey|Ext_Career_Site|/job/Milan/Senior-Engineer_R-1');
  assert.equal(job.source, 'workday');
  assert.equal(job.company, 'Matthey');
  assert.equal(job.title, 'Senior Engineer');
  assert.equal(job.location, 'Milan, Italy');
  assert.equal(job.postedAt, '2026-10-28');
  assert.equal(job.employmentType, 'Full time');
  assert.equal(job.description, 'Build things');
  assert.match(job.url!, /myworkdayjobs\.com/);
  assert.equal(workdayJob(company, { title: 'no path' }, {}), null);
});
