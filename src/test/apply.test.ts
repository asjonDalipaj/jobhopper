import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectAts, resolveAts, SUPPORTED } from '../apply/ats.js';
import { salaryMarket, questionsFor, splitName } from '../apply/applicant.js';
import { briefError, sameValue } from '../apply/greenhouse.js';
import { descriptionHash, jobFromPayload } from '../apply/prep.js';
import { validateLetter } from '../cv/letter.js';

const job = { company: 'Acme', title: 'Staff Engineer' };

test('detectAts maps every board host', () => {
  const cases: Array<[string, string]> = [
    ['https://job-boards.eu.greenhouse.io/jetbrains/jobs/1', 'greenhouse'],
    ['https://boards.greenhouse.io/acme/jobs/2', 'greenhouse'],
    ['https://jobs.lever.co/acme/3', 'lever'],
    ['https://jobs.ashbyhq.com/acme/4', 'ashby'],
    ['https://apply.workable.com/acme/j/5', 'workable'],
    ['https://acme.teamtailor.com/jobs/6', 'teamtailor'],
    ['https://acme.recruitee.com/o/7', 'recruitee'],
    ['https://jobs.smartrecruiters.com/Acme/8', 'smartrecruiters'],
  ];
  for (const [url, expected] of cases) assert.equal(detectAts(url), expected, url);
});

test('detectAts ignores company career pages and junk', () => {
  assert.equal(detectAts('https://careers.example.com/job/1'), null);
  assert.equal(detectAts('not a url'), null);
  assert.equal(detectAts(null), null);
});

test('resolveAts prefers the URL and falls back to the scan source', () => {
  assert.equal(resolveAts('https://jobs.lever.co/acme/3', 'greenhouse'), 'lever');
  assert.equal(resolveAts('https://careers.example.com/1', 'greenhouse'), 'greenhouse');
  assert.equal(resolveAts(null, 'smartrecruiters'), 'smartrecruiters');
  assert.equal(resolveAts('https://careers.example.com/1', 'other'), null);
});

test('only greenhouse has an adapter so far', () => {
  assert.deepEqual(SUPPORTED, ['greenhouse', 'ashby']);
});

test('splitName keeps the last token as the surname', () => {
  assert.deepEqual(splitName('Asjon Dalipaj'), { first: 'Asjon', last: 'Dalipaj' });
  assert.deepEqual(splitName('Asjon Kola Dalipaj'), { first: 'Asjon Kola', last: 'Dalipaj' });
  assert.deepEqual(splitName('Cher'), { first: 'Cher', last: '' });
});

test('sameValue tolerates the phone widget reformatting and trunk-zero prefix', () => {
  assert.equal(sameValue('phone', '683715213', '06 83715213'), true);
  assert.equal(sameValue('phone', '683715213', '6 83715213'), true);
  assert.equal(sameValue('phone', '683715213', '683715214'), false);
  assert.equal(sameValue('first_name', 'Asjon', ' Asjon '), true);
  assert.equal(sameValue('first_name', 'Asjon', 'asjon'), false);
});

test('descriptionHash is stable, short and content-sensitive', () => {
  const hash = descriptionHash('Build things in Go.');
  assert.equal(hash, descriptionHash('Build things in Go.'));
  assert.match(hash, /^[a-f0-9]{16}$/);
  assert.notEqual(hash, descriptionHash('Build other things in Go.'));
  assert.equal(descriptionHash(''), descriptionHash(''));
});

const filler = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

test('validateLetter accepts a letter inside the word budget', () => {
  const result = validateLetter(
    { salutation: 'Dear Acme hiring team,', paragraphs: [filler(50), filler(50), filler(50)], signoff: 'Kind regards,' },
    job,
  );
  assert.deepEqual(result.errors, []);
  assert.equal(result.letter.paragraphs.length, 3);
});

test('validateLetter repairs dashes and rejects a stub letter', () => {
  const repaired = validateLetter({ paragraphs: [`I build systems — mostly Java — daily. ${filler(120)}`] }, job);
  assert.ok(repaired.fixes.some((f) => f.includes('dashes')));
  assert.ok(repaired.letter.paragraphs[0]?.includes('(mostly Java)'));
  assert.ok(repaired.letter.paragraphs[0]?.includes('I build systems'));

  const stub = validateLetter({ paragraphs: ['Too short.'] }, job);
  assert.ok(stub.errors.some((e) => e.includes('at least 3 paragraphs')));
  assert.ok(stub.errors.some((e) => e.includes('too short')));
});

test('salaryMarket maps posting locations to the right expectation', () => {
  assert.equal(salaryMarket('Amsterdam'), 'NL');
  assert.equal(salaryMarket('Utrecht, Netherlands'), 'NL');
  assert.equal(salaryMarket('Madrid, Spain'), 'ES');
  assert.equal(salaryMarket('Milan, Italy'), 'IT');
  assert.equal(salaryMarket('Berlin, Germany'), 'default');
  assert.equal(salaryMarket(null), 'default');
});

test('questionsFor adds based-in and market salary, and keeps explicit answers', () => {
  const applicant = {
    country: 'Netherlands',
    phoneNational: '1',
    preferredLocation: 'Amsterdam',
    city: 'Utrecht',
    howDidYouHear: 'LinkedIn',
    consentRetention: true,
    questions: [{ match: 'notice period', answer: '1 month' }],
    salaryByCountry: { NL: '€95,000', ES: '€70,000–75,000', IT: '€60,000–70,000', default: '€90,000' },
  };
  const nl = questionsFor(applicant, 'Amsterdam');
  assert.deepEqual(nl.find((q) => /based/i.test(q.match))?.answer, 'Utrecht, Netherlands');
  assert.deepEqual(nl.find((q) => /salary/i.test(q.match))?.answer, '€95,000');
  assert.deepEqual(questionsFor(applicant, 'Madrid, Spain').find((q) => /salary/i.test(q.match))?.answer, '€70,000–75,000');
  assert.deepEqual(questionsFor(applicant, 'Berlin, Germany').find((q) => /salary/i.test(q.match))?.answer, '€90,000');
});

test('briefError keeps only the line a person can act on', () => {
  const playwright = new Error(
    'locator.click: Timeout 20000ms exceeded. Call log:\n  - waiting for locator("[role=\'option\']").nth(152)\n  - element is not visible',
  );
  assert.equal(briefError(playwright), 'locator.click: Timeout 20000ms exceeded. Call log:');
  assert.equal(briefError('plain failure'), 'plain failure');
  const long = briefError(new Error('x'.repeat(500)));
  assert.ok(long.length <= 241, `expected a capped message, got ${long.length}`);
  assert.ok(long.endsWith('…'));
});

test('jobFromPayload accepts a snapshot row and marks it non-local', () => {
  const job = jobFromPayload(
    {
      source: 'greenhouse',
      external_id: '9',
      company: ' Acme ',
      title: ' Engineer ',
      location: 'Remote',
      url: 'https://boards.greenhouse.io/acme/jobs/9',
      description: '<p>hi</p>',
    },
    'greenhouse',
    '9',
  );
  assert.ok(job);
  assert.equal(job.id, 0);
  assert.equal(job.company, 'Acme');
  assert.equal(job.title, 'Engineer');
  assert.equal(job.description, '<p>hi</p>');
  assert.equal(job.applied_at, null);
});

test('jobFromPayload rejects a row that does not match or cannot be filled', () => {
  const base = { source: 'greenhouse', external_id: '9', company: 'Acme', title: 'Engineer', url: 'https://x.test/9' };
  assert.equal(jobFromPayload(null, 'greenhouse', '9'), null);
  assert.equal(jobFromPayload('nope', 'greenhouse', '9'), null);
  assert.equal(jobFromPayload({ ...base, source: 'lever' }, 'greenhouse', '9'), null);
  assert.equal(jobFromPayload({ ...base, external_id: '10' }, 'greenhouse', '9'), null);
  assert.equal(jobFromPayload({ ...base, company: '  ' }, 'greenhouse', '9'), null);
  assert.equal(jobFromPayload({ ...base, title: '' }, 'greenhouse', '9'), null);
  assert.equal(jobFromPayload({ ...base, url: 'javascript:alert(1)' }, 'greenhouse', '9'), null);
  assert.equal(jobFromPayload({ ...base, url: '' }, 'greenhouse', '9'), null);
});

test('jobFromPayload caps the description before it reaches the model', () => {
  const job = jobFromPayload(
    {
      source: 'greenhouse',
      external_id: '9',
      company: 'Acme',
      title: 'Engineer',
      url: 'https://x.test/9',
      description: 'x'.repeat(100_000),
    },
    'greenhouse',
    '9',
  );
  assert.ok(job);
  assert.equal(job.description.length, 60_000);
});
