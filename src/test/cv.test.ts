import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CvDocument } from '../cv/schema.js';
import { parseCv, validateCv } from '../cv/schema.js';
import { wrapText } from '../cv/text.js';
import { checkFacts } from '../cv/facts.js';
import { validatePlan } from '../cv/tailor.js';
import { renderCvPdf, selectContent } from '../cv/render.js';

const doc: CvDocument = {
  name: 'Test Person',
  headline: 'Software Engineer',
  location: 'Utrecht, Netherlands',
  contact: { email: 'test@example.com', phone: '+31 6 00000000' },
  summary: 'Ten years building production systems in enterprise environments.',
  skills: [
    { label: 'Platform', items: ['WebRatio'] },
    { label: 'Backend', items: ['Java', 'Python'] },
  ],
  experience: [
    {
      role: 'Software Engineer',
      org: 'Acme Bank',
      place: 'Eindhoven, NL',
      start: '04/2018',
      end: 'Present',
      bullets: ['First bullet about the platform.', 'Second bullet about the pipeline.', 'Third bullet.'],
    },
    {
      role: 'Developer',
      org: 'Small Shop',
      place: 'Milan, IT',
      start: '01/2015',
      end: '03/2017',
      bullets: ['Built pages.', 'Wrote queries for a 20% gain.'],
    },
  ],
  projects: [{ name: 'Widget', meta: 'Python', bullets: ['Scrapes listings.'] }],
  education: [{ title: 'Diploma', school: 'Some School', years: '2009 - 2015' }],
  languages: 'English (fluent).',
};

test('wrapText breaks on the width budget without dropping words', () => {
  const measure = (s: string) => s.length * 5;
  const lines = wrapText('alpha beta gamma delta epsilon', 50, measure);
  assert.ok(lines.length > 1);
  assert.equal(lines.join(' '), 'alpha beta gamma delta epsilon');
  for (const line of lines) assert.ok(measure(line) <= 50 + 5);
});

test('validateCv reports the missing fields by path', () => {
  const errors = validateCv({ name: 'X', experience: [{ role: 'R' }] });
  assert.ok(errors.some((e) => e.includes('headline')));
  assert.ok(errors.some((e) => e.includes('experience[0].org')));
});

test('parseCv surfaces invalid JSON instead of throwing', () => {
  const { errors } = parseCv('{not json');
  assert.equal(errors.length, 1);
  assert.match(errors[0], /not valid JSON/);
});

test('fact gate rejects a year the document does not contain', () => {
  const check = checkFacts('Test Person\nAcme Bank 2018\nDelivered in 2021', doc);
  assert.equal(check.ok, false);
  assert.ok(check.errors.some((e) => e.includes('2021')));
});

test('fact gate rejects an invented percentage', () => {
  const check = checkFacts('Test Person 20% gain and 45% faster', doc);
  assert.equal(check.ok, false);
  assert.ok(check.errors.some((e) => e.includes('45%')));
});

test('fact gate rejects em dashes and warns about dropped employers', () => {
  const check = checkFacts('Test Person — Acme Bank 2018', doc);
  assert.equal(check.ok, false);
  assert.ok(check.errors.some((e) => e.includes('dash')));
  assert.ok(check.warnings.some((w) => w.includes('Small Shop')));
});

test('fact gate skips CV-only warnings for a letter', () => {
  const check = checkFacts('Test Person wrote about Acme Bank 2018', doc, { requireEmployers: false });
  assert.equal(check.ok, true);
  assert.deepEqual(check.warnings, []);
});

test('plan validation drops bullets that are not verbatim in the document', () => {
  const { plan, errors, fixes } = validatePlan(
    {
      bulletOrder: { 'Acme Bank': ['Third bullet.', 'An invented achievement.'] },
      skillOrder: ['Backend', 'Nonsense'],
      experienceOrder: ['Small Shop', 'Acme Bank'],
      projectNames: ['Widget', 'Ghost Project'],
    },
    doc,
  );
  assert.deepEqual(plan.bulletOrder?.['Acme Bank'], ['Third bullet.']);
  assert.deepEqual(plan.skillOrder, ['Backend']);
  assert.deepEqual(plan.experienceOrder, ['Small Shop', 'Acme Bank']);
  assert.deepEqual(plan.projectNames, ['Widget']);
  assert.equal(errors.length, 3);
  assert.ok(Array.isArray(fixes));
});

test('plan validation repairs dashes in the summary', () => {
  const { plan, fixes } = validatePlan(
    {
      summary: 'Engineer — heavy on Java — shipping daily.',
      bulletOrder: { 'Acme Bank': ['First bullet about the platform.', 'Second bullet about the pipeline.', 'Third bullet.'] },
      experienceOrder: ['Acme Bank'],
    },
    doc,
  );
  assert.equal(plan.summary, 'Engineer (heavy on Java) shipping daily.');
  assert.deepEqual(plan.bulletOrder?.['Acme Bank'], ['First bullet about the platform.', 'Second bullet about the pipeline.', 'Third bullet.']);
  assert.ok(fixes.some((f) => f.includes('dashes')));
});

test('selectContent applies ordering and leaves unmentioned roles in place', () => {
  const selection = selectContent(doc, { experienceOrder: ['Small Shop'] });
  assert.equal(selection.jobs[0]?.org, 'Small Shop');
  assert.equal(selection.jobs.length, 2);
});

test('renderCvPdf produces a one-page PDF containing the document facts', async () => {
  const result = await renderCvPdf(doc);
  const head = Buffer.from(result.bytes.slice(0, 5)).toString('utf8');
  assert.equal(head, '%PDF-');
  assert.equal(result.pages, 1);
  assert.match(result.text, /Test Person/);
  assert.match(result.text, /Acme Bank/);
  assert.equal(checkFacts(result.text, doc).ok, true);
});
