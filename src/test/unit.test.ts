import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeFtsQuery } from '../db/jobs-repo.js';
import { stripHtml, htmlToPlainText } from '../sources/html.js';
import { guessWorkplace, guessEmployment } from '../sources/types.js';
import { isSoftware } from '../sources/remotive.js';
import { isJob } from '../sources/remoteok.js';
import { isTargetMarket, isFresh, isRelevantRole, purgeReason, MAX_JOB_AGE_DAYS, UNSEEN_RETENTION_DAYS } from '../market.js';
import { mergeSnapshotRows, inSnapshotScope, sortRowsByPostedAt, snapshotMetadata, listFromJson, apiJobRow } from '../export/html.js';
import { parseJobMetadata } from '../judge/openrouter.js';
import { metadataFromRow } from '../db/seed.js';

type SnapRow = {
  source: string;
  external_id: string;
  verdict: string | null;
  reasoning: string | null;
  applied_at: string | null;
  first_seen?: string | null;
  last_seen?: string | null;
  model?: string | null;
  skills?: string[] | null;
  language?: string | null;
  employer_type?: string | null;
  extraction_model?: string | null;
};
import { ashbyLocations } from '../sources/ashby.js';
import { greenhousePostedAt } from '../sources/greenhouse.js';

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
  assert.equal(isTargetMarket('Italian Republic'), true);
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

test('isFresh accepts dates within the ingest floor and rejects stale/missing/invalid dates', () => {
  const now = new Date('2026-01-31T00:00:00Z');
  assert.equal(isFresh(new Date('2026-01-30T00:00:00Z').toISOString(), now), true);
  const justOutside = new Date(now.getTime() - (MAX_JOB_AGE_DAYS + 1) * 86400000).toISOString();
  assert.equal(isFresh(justOutside, now), false);
  assert.equal(isFresh(null, now), false);
  assert.equal(isFresh(undefined, now), false);
  assert.equal(isFresh('not-a-date', now), false);
  // A live posting older than the old 3-day window is still ingestible: age is a
  // rank now, not a delete.
  assert.equal(isFresh(new Date(now.getTime() - 20 * 86400000).toISOString(), now), true);
});

test('purgeReason keeps live unjudged rows regardless of posting age', () => {
  const now = new Date('2026-11-13T12:00:00Z');
  const seenNow = new Date(now.getTime() - 3600_000).toISOString();
  const postedLongAgo = new Date(now.getTime() - 20 * 86400000).toISOString();
  // The whole point of the 2026-11-13 change: a role posted 20 days ago that the
  // board still returns is NOT stale.
  assert.equal(purgeReason({ location: 'Milan', title: 'Backend Engineer', postedAt: postedLongAgo, lastSeen: seenNow, judged: false }, now), null);
});

test('purgeReason drops rows past the retention or ingest floor', () => {
  const now = new Date('2026-11-13T12:00:00Z');
  const old = (days: number) => new Date(now.getTime() - days * 86400000).toISOString();
  const base = { location: 'Milan', title: 'Backend Engineer' };
  // Board stopped returning it for longer than the retention window.
  assert.equal(purgeReason({ ...base, postedAt: old(20), lastSeen: old(UNSEEN_RETENTION_DAYS + 1), judged: false }, now), 'unseen');
  // Still seen, but past the ingest floor.
  assert.equal(purgeReason({ ...base, postedAt: old(MAX_JOB_AGE_DAYS + 1), lastSeen: old(1), judged: false }, now), 'stale');
  // Exactly on the boundary is not stale (inclusive, like isFresh).
  assert.equal(purgeReason({ ...base, postedAt: old(MAX_JOB_AGE_DAYS), lastSeen: old(1), judged: false }, now), null);
  // Unknown last_seen (pre-last_seen rows) falls back to the posted floor.
  assert.equal(purgeReason({ ...base, postedAt: old(MAX_JOB_AGE_DAYS + 1), lastSeen: null, judged: false }, now), 'stale');
  assert.equal(purgeReason({ ...base, postedAt: old(2), lastSeen: null, judged: false }, now), null);
  // Unparsable last_seen is unknown, not old.
  assert.equal(purgeReason({ ...base, postedAt: old(2), lastSeen: 'nonsense', judged: false }, now), null);
});

test('purgeReason never touches judged or applied history', () => {
  const now = new Date('2026-11-13T12:00:00Z');
  const old = (days: number) => new Date(now.getTime() - days * 86400000).toISOString();
  const base = { location: 'Milan', title: 'Backend Engineer', postedAt: old(60), lastSeen: old(30) };
  assert.equal(purgeReason({ ...base, judged: true }, now), null);
  assert.equal(purgeReason({ ...base, judged: false, appliedAt: old(10) }, now), null);
  // Off-market junk still goes unless applied — even when judged.
  assert.equal(purgeReason({ location: 'Berlin', title: 'Sales Manager', postedAt: old(2), lastSeen: old(1), judged: false }, now), 'off-market');
  assert.equal(purgeReason({ location: 'Berlin', title: 'Sales Manager', postedAt: old(60), lastSeen: old(30), appliedAt: old(1), judged: true }, now), null);
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
  assert.equal(isRelevantRole('Mechanical Engineer'), false);
  assert.equal(isRelevantRole('Sales Engineer'), false);
  assert.equal(isRelevantRole('Engineering Manager'), false);
  assert.equal(isRelevantRole('Business Developer'), false);
  assert.equal(isRelevantRole('Content Creator & Strategist'), false);
  assert.equal(isRelevantRole('Software Engineer Intern'), false);
  assert.equal(isRelevantRole('Junior Cloud Engineer'), false);
  assert.equal(isRelevantRole('Mobile Engineer'), true);
  assert.equal(isRelevantRole('Cloud Engineer'), true);
  assert.equal(isRelevantRole('Site Reliability Engineer'), true);
  assert.equal(isRelevantRole('QA Automation Engineer'), true);
  assert.equal(isRelevantRole('Desarrollador Backend'), true);
  assert.equal(isRelevantRole('Ontwikkelaar Java'), true);
  assert.equal(isRelevantRole('Ingeniero Civil'), false);
  assert.equal(isRelevantRole('PSICÓLOGOS SANITARIOS GENERALES'), false);
  assert.equal(isRelevantRole('FARMACÉUTICO/A ADJUNTO'), false);
  assert.equal(isRelevantRole('TÈCNICS/ES D\'ATENCIÓ SOCIOSANITÀRIA'), false);
  assert.equal(isRelevantRole('iOS Developer'), true);
  assert.equal(isRelevantRole('QA Automation Engineer'), true);
  assert.equal(isRelevantRole('Sales Development Representative'), false);
  assert.equal(isRelevantRole('Product Manager'), false);
});

test('sortRowsByPostedAt puts the newest posting first and undated rows last', () => {
  const sorted = sortRowsByPostedAt([
    { posted_at: '2026-10-07', first_seen: '2026-10-08' },
    { posted_at: '2026-11-02', first_seen: '2026-11-02' },
    { posted_at: null, first_seen: '2026-11-01' },
  ]);
  assert.deepEqual(sorted.map((row) => row.posted_at), ['2026-11-02', '2026-10-07', null]);
});

test('inSnapshotScope keeps current-gate roles and applied rows only', () => {
  assert.equal(inSnapshotScope({ location: 'Milan', title: 'Backend Engineer', applied_at: null }), true);
  assert.equal(inSnapshotScope({ location: 'Milan', title: 'Mechanical Engineer', applied_at: null }), false);
  assert.equal(inSnapshotScope({ location: 'Berlin', title: 'Backend Engineer', applied_at: null }), false);
  assert.equal(inSnapshotScope({ location: 'Berlin', title: 'Mechanical Engineer', applied_at: '2026-01-01' }), true);
  assert.equal(inSnapshotScope({ location: 'Milan, Italy; [object Object]', title: 'Backend Engineer', applied_at: null }), false);
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

test('mergeSnapshotRows never rewinds last_seen, so liveness survives a stale re-export', () => {
  const existing: SnapRow[] = [
    { source: 'a', external_id: '1', verdict: null, reasoning: null, applied_at: null, last_seen: '2026-11-12T10:00:00.000Z' },
  ];
  const fresh: SnapRow[] = [
    { source: 'a', external_id: '1', verdict: null, reasoning: null, applied_at: null, last_seen: '2026-11-10T10:00:00.000Z' },
  ];
  assert.equal(mergeSnapshotRows(existing, fresh)[0].last_seen, '2026-11-12T10:00:00.000Z');
  // A newer scan stamps forward.
  const newer: SnapRow[] = [{ ...fresh[0], last_seen: '2026-11-13T10:00:00.000Z' }];
  assert.equal(mergeSnapshotRows(existing, newer)[0].last_seen, '2026-11-13T10:00:00.000Z');
  // A row with no last_seen inherits the stored one instead of losing it.
  const unknown: SnapRow[] = [{ ...fresh[0], last_seen: null }];
  assert.equal(mergeSnapshotRows(existing, unknown)[0].last_seen, '2026-11-12T10:00:00.000Z');
});

test('mergeSnapshotRows keeps the judging model when the fresh row has none', () => {
  // Seeding restores verdicts from the snapshot; an export must not blank out
  // which model produced them.
  const existing: SnapRow[] = [
    { source: 'a', external_id: '1', verdict: 'fair', reasoning: 'why', applied_at: null, model: 'deepseek-v4-flash' },
  ];
  const fresh: SnapRow[] = [
    { source: 'a', external_id: '1', verdict: 'fair', reasoning: 'why', applied_at: null, model: null },
  ];
  assert.equal(mergeSnapshotRows(existing, fresh)[0].model, 'deepseek-v4-flash');
});

test('greenhousePostedAt prefers first_published over a bulk-edited updated_at', () => {
  // Real case: an entire board shares one updated_at, so freshness was fiction.
  assert.equal(
    greenhousePostedAt({ first_published: '2026-09-18T03:31:23-04:00', updated_at: '2026-11-03T08:19:04-05:00' }),
    '2026-09-18T03:31:23-04:00',
  );
  assert.equal(greenhousePostedAt({ updated_at: '2026-11-03T08:19:04-05:00' }), '2026-11-03T08:19:04-05:00');
  assert.equal(greenhousePostedAt({}), null);
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
test('parseJobMetadata keeps a complete extraction intact', () => {
  const meta = parseJobMetadata(
    {
      category: 'Data and Analytics',
      locations: ['Milan, Italy', 'Rome, Italy'],
      workplace_type: 'Hybrid',
      skills: ['Python', 'dbt', 'Airflow'],
      experience_min_years: 3,
      salary: { min: 60000, max: 75000, currency: 'eur', frequency: 'Yearly' },
      language: 'EN',
      employer_type: 'Internal',
    },
    'deepseek-v4-flash',
  );
  assert.equal(meta.category, 'Data and Analytics');
  assert.deepEqual(meta.locations, ['Milan, Italy', 'Rome, Italy']);
  assert.equal(meta.workplaceType, 'Hybrid');
  assert.deepEqual(meta.skills, ['Python', 'dbt', 'Airflow']);
  assert.equal(meta.experienceMinYears, 3);
  assert.deepEqual(meta.salary, { min: 60000, max: 75000, currency: 'EUR', frequency: 'Yearly' });
  assert.equal(meta.language, 'en');
  assert.equal(meta.employerType, 'Internal');
  assert.equal(meta.model, 'deepseek-v4-flash');
});

test('parseJobMetadata clamps junk instead of trusting the model', () => {
  const meta = parseJobMetadata(
    {
      category: 'Wizardry',
      workplace_type: 'On a boat',
      skills: ['React', 'react', '  React  ', '', 42, 'Node'],
      experience_min_years: 'lots',
      salary: { min: 90000, max: 70000, currency: 'euro', frequency: 'Fortnightly' },
      language: 'english',
      employer_type: 'Agency',
    },
    'm',
  );
  assert.equal(meta.category, 'Other');
  assert.equal(meta.workplaceType, null);
  assert.deepEqual(meta.skills, ['React', 'Node']); // trimmed, deduped, non-strings dropped
  assert.equal(meta.experienceMinYears, null);
  assert.deepEqual(meta.salary, { min: 70000, max: 90000, currency: null, frequency: null }); // swapped
  assert.equal(meta.language, null);
  assert.equal(meta.employerType, null);
});

test('parseJobMetadata never invents a salary and accepts numeric strings', () => {
  assert.equal(parseJobMetadata({ salary: { min: null, max: null } }, 'm').salary, null);
  assert.equal(parseJobMetadata({ salary: 'EUR 60k' }, 'm').salary, null);
  const meta = parseJobMetadata({ salary: { min: '60000', max: '70000', currency: 'EUR', frequency: 'Yearly' } }, 'm');
  assert.deepEqual(meta.salary, { min: 60000, max: 70000, currency: 'EUR', frequency: 'Yearly' });
});

test('parseJobMetadata survives an empty or hostile payload', () => {
  for (const raw of [{}, null, 'nonsense', [], { skills: 'React', locations: 'Milan' }]) {
    const meta = parseJobMetadata(raw, 'm');
    assert.equal(meta.category, 'Other');
    assert.deepEqual(meta.skills, []);
    assert.deepEqual(meta.locations, []);
    assert.equal(meta.experienceMinYears, null);
    assert.equal(meta.salary, null);
  }
});

test('metadataFromRow only rebuilds rows that were actually enriched', () => {
  assert.equal(metadataFromRow({ source: 'a', external_id: '1', company: 'c', title: 't', location: 'Milan' }), null);
  const meta = metadataFromRow({
    source: 'a',
    external_id: '1',
    company: 'c',
    title: 't',
    location: 'Milan',
    extraction_model: 'deepseek-v4-flash',
    category: 'Software Development',
    locations: ['Milan, Italy'],
    extracted_workplace_type: 'Remote',
    skills: ['Go'],
    experience_min_years: 5,
    salary_min: 50000,
    salary_max: 60000,
    salary_currency: 'EUR',
    salary_frequency: 'Yearly',
    language: 'it',
    employer_type: 'External',
  });
  assert.equal(meta?.model, 'deepseek-v4-flash');
  assert.equal(meta?.category, 'Software Development');
  assert.deepEqual(meta?.skills, ['Go']);
  assert.deepEqual(meta?.salary, { min: 50000, max: 60000, currency: 'EUR', frequency: 'Yearly' });
  assert.equal(meta?.employerType, 'External');
  assert.equal(meta?.workplaceType, 'Remote');
});

test('mergeSnapshotRows keeps the metadata block when a fresh row has none', () => {
  const existing: SnapRow[] = [
    { source: 'a', external_id: '1', verdict: 'fair', reasoning: null, applied_at: null, extraction_model: 'm', skills: ['Go'], language: 'it', employer_type: 'Internal' },
  ];
  const fresh: SnapRow[] = [{ source: 'a', external_id: '1', verdict: 'fair', reasoning: null, applied_at: null }];
  const merged = mergeSnapshotRows<SnapRow>(existing, fresh)[0];
  assert.deepEqual(merged.skills, ['Go']);
  assert.equal(merged.language, 'it');
  assert.equal(merged.extraction_model, 'm');
  // A fresh extraction wins over the stored one.
  const reExtracted: SnapRow[] = [{ ...fresh[0], extraction_model: 'm2', skills: ['Rust'] }];
  assert.deepEqual(mergeSnapshotRows<SnapRow>(existing, reExtracted)[0].skills, ['Rust']);
});

test('snapshotMetadata projects JSON columns and tolerates junk', () => {
  const meta = snapshotMetadata({
    category: 'Engineering',
    normalized_locations: '["Milan, Italy"]',
    extracted_workplace_type: 'Onsite',
    skills: '["Go","Kubernetes"]',
    experience_min_years: 4,
    salary_min: 1,
    salary_max: 2,
    salary_currency: 'EUR',
    salary_frequency: 'Yearly',
    language: 'it',
    employer_type: 'Internal',
    extraction_model: 'm',
  });
  assert.deepEqual(meta.locations, ['Milan, Italy']);
  assert.deepEqual(meta.skills, ['Go', 'Kubernetes']);
  assert.deepEqual(listFromJson('not json'), []);
  assert.deepEqual(listFromJson('{"a":1}'), []);
  assert.deepEqual(listFromJson(null), []);
});

test('apiJobRow hands the UI arrays where the DB stores JSON strings', () => {
  // The regression: /api/jobs spread the raw row, so `skills` arrived as
  // '["Go"]' and the card's .map() blanked the entire board.
  const row = {
    description: '<p>Build things</p>',
    category: 'Engineering',
    normalized_locations: '["Milan, Italy"]',
    extracted_workplace_type: null,
    skills: '["Go","Kubernetes"]',
    experience_min_years: 3,
    salary_min: 50000,
    salary_max: 60000,
    salary_currency: 'EUR',
    salary_frequency: 'Yearly',
    language: 'it',
    employer_type: 'Internal',
    extraction_model: 'deepseek-flash',
  };
  const out = apiJobRow(row);
  assert.ok(Array.isArray(out['skills']), 'skills must be an array');
  assert.deepEqual(out['skills'], ['Go', 'Kubernetes']);
  assert.ok(Array.isArray(out['locations']), 'locations must be an array');
  assert.deepEqual(out['locations'], ['Milan, Italy']);
  assert.ok(String(out['description']).includes('Build things'));
  assert.equal(out['employer_type'], 'Internal');
});
