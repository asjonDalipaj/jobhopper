import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectAts, resolveAts, SUPPORTED } from '../apply/ats.js';
import { splitName } from '../apply/applicant.js';
import { sameValue } from '../apply/greenhouse.js';
import { descriptionHash } from '../apply/prep.js';
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
  assert.deepEqual(SUPPORTED, ['greenhouse']);
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
