# Adding a source

A source is anything that returns job postings. Two shapes:

- **Company board** (`fetchCompany`) — an ATS where one token identifies one
  employer (Greenhouse, Lever, Ashby, Workday, …). `scan` calls it once per
  registry line.
- **Aggregator** (`fetchAll`, `aggregator: true`) — a whole-market feed with no
  company concept (Remotive, RemoteOK, EURES). `scan -a` runs it.

Both return `SourceJob` (`src/sources/types.ts`); the gate, DB, judge and
snapshot are shared.

## 1. Implement the adapter

`src/sources/acme.ts`:

```ts
import { type JobSource, type SourceJob, guessWorkplace } from './types.js';
import { fetchWithTimeout, stripHtml } from './html.js';

interface AcmeRow {
  id: string;
  title: string;
  location: string;
  description?: string;
  url?: string;
  posted_at?: string; // ISO
}

/** Pure mapper — this is the unit-test seam. */
export function mapAcmeRow(row: AcmeRow): SourceJob | null {
  if (!row.id || !row.title) return null;
  const description = stripHtml(row.description ?? '');
  return {
    externalId: row.id,
    source: 'acme',
    company: 'Acme',           // or a field from the payload
    title: row.title,
    location: row.location,    // must contain the country for the gate
    workplaceType: guessWorkplace(`${row.location} ${description.slice(0, 200)}`),
    employmentType: null,
    url: row.url ?? null,
    description,
    postedAt: row.posted_at ?? null,
  };
}

export const acme: JobSource = {
  name: 'acme',
  async fetchCompany(company) {
    const res = await fetchWithTimeout(
      `https://api.acme.example/boards/${encodeURIComponent(company.token)}/jobs`,
      { headers: { Accept: 'application/json' } },
      15_000,
    );
    if (!res.ok) throw new Error(`acme(${company.token}): HTTP ${res.status}`);
    const rows = (await res.json()) as AcmeRow[];
    return rows.map(mapAcmeRow).filter((job): job is SourceJob => job !== null);
  },
};
```

An aggregator is the same file with:

```ts
export const acme: JobSource = {
  name: 'acme',
  aggregator: true,
  async fetchAll() { /* page until empty; return SourceJob[] */ },
};
```

## 2. Register it

- `src/sources/scan.ts`: add the import and `acme` to `SOURCES`. Aggregators are
  detected automatically (`s.aggregator`).
- Company boards only: add `'acme'` to `AtsKind` in `src/sources/companies.ts`
  and a helper (`function ac(name, token) { ... }`), then add registry lines.
- If the token check needs a custom HTTP method/URL, add a case to
  `src/sources/verify.ts` (Workday needs a POST instead of a GET).
- `src/sources/companies.ts` registry line: `ac('Acme', 'acme-token'),`.

## 3. Test the pure seam

`src/test/acme.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapAcmeRow } from '../sources/acme.js';

test('mapAcmeRow normalizes a row', () => {
  const job = mapAcmeRow({
    id: '42',
    title: 'Backend Engineer',
    location: 'Milan, Italy',
    description: '<p>Java</p>',
    posted_at: '2026-11-01T10:00:00Z',
  });
  assert.ok(job);
  assert.equal(job.externalId, '42');
  assert.equal(job.company, 'Acme');
  assert.equal(job.description, 'Java');
  assert.equal(job.location, 'Milan, Italy');
});
```

Run `npm test` (it builds first). No network in tests.

## 4. Verify live

```bash
npm run build
jobhopper companies verify            # every registry token
jobhopper scan -c Acme                # one board
jobhopper scan -a --no-judge          # full market, no OpenRouter calls
```

Or a one-off probe:

```bash
node --input-type=module -e '
import { acme } from "./dist/sources/acme.js";
console.log(await acme.fetchCompany({ name: "Acme", token: "acme-token" }));
'
```

## 5. Checklist

- [ ] `SourceJob` fields populated; `postedAt` ISO (convert epoch ms).
- [ ] `externalId` stable and unique per posting.
- [ ] `location` includes the country name (the gate parses it).
- [ ] `company` is the employer, not the ATS.
- [ ] HTTP errors throw with the board/token in the message.
- [ ] Timeout set; pagination bounded (see `MAX_LISTED` in Workday).
- [ ] Pure mapper tested with a fixture.
- [ ] Registered in `scan.ts`; `verify.ts` if needed.
- [ ] `companies verify` + one live scan show the board working.

## Pitfalls

- **Dates.** Some APIs return epoch milliseconds (EURES), some ISO. Normalize
  in the mapper; the gate uses `isFresh`.
- **Locations.** "Italy" must be present; NUTS codes alone ("ITC11") fail the
  market gate unless mapped. Prefer `"City, Country"`.
- **Role gate.** `isRelevantRole` is word-boundary based. Short tokens like
  `ios` or `dj` will not match inside longer words, but compounds must be
  precise; if a new source needs a new keyword, add it to `src/market.ts` and a
  test.
- **Custom domains.** Many employers front their ATS with `careers.<company>`;
  the tenant token is not in the URL. The probe scripts skip those; add them
  manually only if you know the token.
- **Descriptions.** Fetch detail endpoints only when the list payload lacks a
  description; each extra request multiplies scan time.
- **Rate limits.** ATS APIs are generous but not infinite: bound concurrency,
  set timeouts, retry only on 429/5xx (see `src/sources/workday.ts`).
- **Do not scrape job boards.** Prefer public ATS APIs and official feeds; the
  robots/ToS decision is recorded in `NEXT_STEPS.md`.

## Related

- [ARCHITECTURE.md](ARCHITECTURE.md) — pipeline and invariants.
- [COMPANY-INDEX.md](COMPANY-INDEX.md) — finding new boards from the dataset.
