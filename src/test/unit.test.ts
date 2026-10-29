import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeFtsQuery } from '../db/jobs-repo.js';
import { stripHtml, htmlToPlainText } from '../sources/html.js';
import { guessWorkplace, guessEmployment } from '../sources/types.js';
import { isSoftware } from '../sources/remotive.js';
import { isJob } from '../sources/remoteok.js';
import { isTargetMarket, isFresh, isRelevantRole, MAX_JOB_AGE_DAYS, TARGET_MARKET_MAX_AGE_DAYS } from '../market.js';
import { mergeSnapshotRows } from '../export/html.js';

type SnapRow = {
  source: string;
  external_id: string;
  verdict: string | null;
  reasoning: string | null;
  applied_at: string | null;
  first_seen?: string | null;
};
import { ashbyLocations } from '../sources/ashby.js';

test('ashbyLocations joins primary and secondary locations as plain strings', () => {
  const job = {
    location: 'Paris',
    secondaryLocations: [{ location: 'Lisbon', address: { postalAddress: { addressCountry: 'Portugal' } } }, { location: 'Amsterdam' }],
  };
  assert.equal(ashbyLocations(job), 'Paris; Lisbon; Amsterdam');
  assert.equal(ashbyLocations({ location: 'Madrid' }), 'Madrid');
  assert.equal(ashbyLocations({ location: undefined, secondaryLocations: [] }), '');
  assert.ok(!ashbyLocations(job).includes('[object Object]'));
});

test('sanitizeFtsQuery strips special characters and prefixes wildcards', () => {
  assert.equal(sanitizeFtsQuery('c++'), '"c"*');
  assert.equal(sanitizeFtsQuery('full-stack/backend'), '"full"* "stack"* "backend"*');
  assert.equal(sanitizeFtsQuery('node.js & typescript'), '"node"* "js"* "typescript"*');
  assert.equal(sanitizeFtsQuery(''), '""');
  assert.equal(sanitizeFtsQuery('!!!'), '""');
});

test('stripHtml removes tags and decodes entities', () => {
  assert.equal(stripHtml('<p>Hello &amp; bye</p>'), 'Hello & bye');
  assert.equal(stripHtml('a&nbsp; b&#39;c'), 'a b\'c');
  assert.equal(stripHtml('<b>X</b>   <i>Y</i>'), 'X Y');
  assert.equal(stripHtml(''), '');
});

test('htmlToPlainText keeps paragraph/list structure and strips markup', () => {
  assert.equal(
    htmlToPlainText('<p><strong>Title</strong></p><ul><li>A</li><li>B</li></ul>'),
    'Title\n\n• A\n• B',
  );
  assert.equal(htmlToPlainText('a<br>b'), 'a\nb');
  assert.equal(htmlToPlainText('<p style="x">Bye &amp; hi</p>'), 'Bye & hi');
  assert.equal(htmlToPlainText(''), '');
});

test('guessWorkplace returns Remote/Hybrid/On-site or null', () => {
  assert.equal(guessWorkplace('Remote - Europe'), 'Remote');
  assert.equal(guessWorkplace('Hybrid in Amsterdam'), 'Hybrid');
  assert.equal(guessWorkplace('on-site'), 'On-site');
  assert.equal(guessWorkplace(undefined), null);
  assert.equal(guessWorkplace('Somewhere'), null);
});

test('guessEmployment returns a type keyword or null', () => {
  assert.equal(guessEmployment('Full-time contract'), 'Contract');
  assert.equal(guessEmployment('full time'), 'Full-time');
  assert.equal(guessEmployment('part-time'), 'Part-time');
  assert.equal(guessEmployment('Internship'), 'Intern');
  assert.equal(guessEmployment(''), null);
});

test('isSoftware keeps real software roles and rejects junk', () => {
  assert.equal(isSoftware({ title: 'Senior Backend Engineer', tags: [] }), true);
  assert.equal(isSoftware({ title: 'Full-stack Developer', tags: [] }), true);
  assert.equal(isSoftware({ title: 'Frontend Engineer', tags: [] }), true);
  assert.equal(isSoftware({ title: 'Sales Account Manager', tags: ['sales'] }), false);
  assert.equal(isSoftware({ title: 'Office ', tags: ['marketing'] }), false);
});

test('isJob requires a non-empty position', () => {
  assert.equal(isJob({ position: 'Backend Engineer', slug: 'x', company: 'C' }), true);
  assert.equal(isJob({ slug: 'x' }), false); // no position
  assert.equal(isJob({ position: '', slug: 'x' }), false); // empty position
  assert.equal(isJob({ legal: 'meta' }), false); // metadata record
  assert.equal(isJob(null), false);
});

test('isTargetMarket matches Italy/Spain/Netherlands substrings, case-insensitively', () => {
  assert.equal(isTargetMarket('Milan, Italy'), true);
  assert.equal(isTargetMarket('Madrid, spain'), true);
  assert.equal(isTargetMarket('Amsterdam, NETHERLANDS'), true);
  assert.equal(isTargetMarket('Milano'), true);
  assert.equal(isTargetMarket('Madrid'), true);
  assert.equal(isTargetMarket('Utrecht, Nederland'), true);
  assert.equal(isTargetMarket('Bergamo, Lombardia'), true);
  assert.equal(isTargetMarket('Bari, Puglia'), true);
  assert.equal(isTargetMarket('Trento'), true);
  assert.equal(isTargetMarket('Berlin, Germany'), false);
  assert.equal(isTargetMarket(''), false);
  assert.equal(isTargetMarket(null), false);
  assert.equal(isTargetMarket(undefined), false);
});

test('isTargetMarket matches whole words only (no substring false positives)', () => {
  assert.equal(isTargetMarket('Manufacturing & Distribution'), false); // contains "turin"
  assert.equal(isTargetMarket('Remote - Manufacturing'), false);
  assert.equal(isTargetMarket('Bolognaise Foods'), false); // contains "bologna"
  assert.equal(isTargetMarket('Romania'), false); // contains "roma"
  assert.equal(isTargetMarket('Barilla'), false); // contains "bari"
  assert.equal(isTargetMarket('Parmalat'), false); // contains "parma"
  assert.equal(isTargetMarket('Marchetti Srl'), false); // contains "marche"
  assert.equal(isTargetMarket('Torino, Italy'), true);
  assert.equal(isTargetMarket('Remote (Italia)'), true);
  assert.equal(isTargetMarket('Barcelona, España'), true);
});

test('isFresh accepts dates within the cutoff and rejects stale/missing/invalid dates', () => {
  const now = new Date('2026-01-31T00:00:00Z');
  assert.equal(isFresh(new Date('2026-01-30T00:00:00Z').toISOString(), now), true);
  const justOutside = new Date(now.getTime() - (MAX_JOB_AGE_DAYS + 1) * 86400000).toISOString();
  assert.equal(isFresh(justOutside, now), false);
  assert.equal(isFresh(null, now), false);
  assert.equal(isFresh(undefined, now), false);
  assert.equal(isFresh('not-a-date', now), false);
  assert.equal(isFresh(new Date(now.getTime() - (TARGET_MARKET_MAX_AGE_DAYS + 1) * 86400000).toISOString(), now, true), false);
});

test('isRelevantRole keeps engineering and music titles, rejects unrelated roles', () => {
  assert.equal(isRelevantRole('Senior Backend Engineer'), true);
  assert.equal(isRelevantRole('Music Producer'), true);
  assert.equal(isRelevantRole('Audio Engineer'), true);
  assert.equal(isRelevantRole('Sviluppatore Backend'), true);
  assert.equal(isRelevantRole('Sviluppatore Full Stack'), true);
  assert.equal(isRelevantRole('Ingegnere Informatico'), true);
  assert.equal(isRelevantRole('Programmatore Java'), true);
  assert.equal(isRelevantRole('Ingegnere Civile'), false);
  assert.equal(isRelevantRole('Impiegato Amministrativo'), false);
  assert.equal(isRelevantRole('Sales Development Representative'), false);
  assert.equal(isRelevantRole('Product Manager'), false);
});

test('mergeSnapshotRows dedupes on source+external_id and prefers a fresh verdict', () => {
  const existing: SnapRow[] = [{ source: 'a', external_id: '1', verdict: 'strong', reasoning: 'old', applied_at: null }];
  const fresh: SnapRow[] = [{ source: 'a', external_id: '1', verdict: 'no', reasoning: 'new', applied_at: null }];
  const out = mergeSnapshotRows(existing, fresh);
  assert.equal(out.length, 1);
  assert.equal(out[0].verdict, 'no'); // fresh re-judgment wins over the stored one
});

test('mergeSnapshotRows preserves verdict and applied_at from the previous snapshot', () => {
  const existing: SnapRow[] = [{ source: 'a', external_id: '1', verdict: 'strong', reasoning: 'why', applied_at: '2026-10-11T10:00:00Z' }];
  const fresh: SnapRow[] = [{ source: 'a', external_id: '1', verdict: null, reasoning: null, applied_at: null }];
  const out = mergeSnapshotRows(existing, fresh);
  assert.equal(out[0].verdict, 'strong');
  assert.equal(out[0].reasoning, 'why');
  assert.equal(out[0].applied_at, '2026-10-11T10:00:00Z');
});

test('mergeSnapshotRows lets a fresher applied_at win over the stored one', () => {
  const existing: SnapRow[] = [{ source: 'a', external_id: '1', verdict: null, reasoning: null, applied_at: '2026-10-11T10:00:00Z' }];
  const fresh: SnapRow[] = [{ source: 'a', external_id: '1', verdict: null, reasoning: null, applied_at: '2026-10-12T00:00:00Z' }];
  const out = mergeSnapshotRows(existing, fresh);
  assert.equal(out[0].applied_at, '2026-10-12T00:00:00Z');
});

test('mergeSnapshotRows preserves first_seen from the previous snapshot', () => {
  const existing: SnapRow[] = [{ source: 'a', external_id: '1', verdict: null, reasoning: null, applied_at: null, first_seen: '2026-10-01T00:00:00Z' }];
  const fresh: SnapRow[] = [{ source: 'a', external_id: '1', verdict: null, reasoning: null, applied_at: null, first_seen: null }];
  const out = mergeSnapshotRows(existing, fresh);
  assert.equal(out[0].first_seen, '2026-10-01T00:00:00Z');
  // and a genuinely new row keeps its fresh stamp
  const fresh2: SnapRow[] = [...fresh, { source: 'a', external_id: '9', verdict: null, reasoning: null, applied_at: null, first_seen: '2026-10-11T00:00:00Z' }];
  const out2 = mergeSnapshotRows(existing, fresh2);
  assert.equal(out2.find((r) => r.external_id === '9')?.first_seen, '2026-10-11T00:00:00Z');
});

test('mergeSnapshotRows keeps rows only present in one side and dedupes across', () => {
  const existing: SnapRow[] = [{ source: 'a', external_id: '2', verdict: 'fair', reasoning: null, applied_at: null }];
  const fresh = [
    { source: 'a', external_id: '1', verdict: null, reasoning: null, applied_at: null },
    { source: 'a', external_id: '2', verdict: null, reasoning: null, applied_at: null },
  ];
  const out = mergeSnapshotRows(existing, fresh);
  assert.equal(out.length, 2);
  const row2 = out.find((r) => r.external_id === '2');
  assert.equal(row2?.verdict, 'fair'); // judged row preserved even though the fresh scan lost it
});