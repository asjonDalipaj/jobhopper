#!/usr/bin/env node
/**
 * One-off: find companies on supported ATSs that actually post in Italy.
 *
 * Input: a CSV with a "Careers Page URL" column (e.g. a public job-board
 * tracker export). Each URL is normalised to an (ats, token) board, fetched
 * with the same adapter the scanner uses, and kept when at least one posting
 * matches the Italy aliases in src/market.ts.
 *
 *   npm run build
 *   node scripts/discover-boards.mjs [csv] [--min 1] [--out file.json]
 *
 * Boards already in DEFAULT_COMPANIES are skipped. Dead/unsupported URLs are
 * ignored, so the output is only "this board is live and has Italian roles".
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseCsv } from './lib/csv.mjs';
import { matchesCountry, isRelevantRole, isFresh } from '../dist/market.js';
import { DEFAULT_COMPANIES } from '../dist/sources/companies.js';
import { greenhouse } from '../dist/sources/greenhouse.js';
import { lever } from '../dist/sources/lever.js';
import { ashby } from '../dist/sources/ashby.js';
import { workable } from '../dist/sources/workable.js';
import { teamtailor } from '../dist/sources/teamtailor.js';
import { recruitee } from '../dist/sources/recruitee.js';
import { smartrecruiters } from '../dist/sources/smartrecruiters.js';

const SOURCES = { greenhouse, lever, ashby, workable, teamtailor, recruitee, smartrecruiters };
const args = process.argv.slice(2);
const csvPath = args.find((a) => !a.startsWith('--')) ?? '.jobhopper/tmp-e2e/platforms.csv';
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const minItaly = Number(flag('min', '1'));
const outPath = flag('out', '.jobhopper/tmp-e2e/italy-boards.json');
const concurrency = Number(flag('concurrency', '6'));


/** Normalise a careers URL to a supported ATS board, or null. */
function parseBoard(raw) {
  let url;
  try { url = new URL(raw.trim()); } catch { return null; }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const seg = url.pathname.split('/').filter(Boolean);
  const first = seg[0]?.toLowerCase();
  if (!first) return null;
  if (['job-boards.greenhouse.io', 'boards.greenhouse.io', 'job-boards.eu.greenhouse.io'].includes(host)) {
    return first === 'embed' ? null : { ats: 'greenhouse', token: seg[0] };
  }
  if (host === 'jobs.lever.co') return { ats: 'lever', token: seg[0] };
  if (host === 'jobs.ashbyhq.com') return { ats: 'ashby', token: seg[0] };
  if (host === 'apply.workable.com') return first === 'j' ? null : { ats: 'workable', token: seg[0] };
  if (host === 'careers.smartrecruiters.com' || host === 'jobs.smartrecruiters.com') {
    return { ats: 'smartrecruiters', token: seg[0] };
  }
  const tt = host.match(/^([a-z0-9-]+)\.teamtailor\.com$/);
  if (tt) return { ats: 'teamtailor', token: tt[1] };
  const rc = host.match(/^([a-z0-9-]+)\.recruitee\.com$/);
  if (rc) return { ats: 'recruitee', token: rc[1] };
  return null;
}

const rows = parseCsv(readFileSync(csvPath, 'utf8'));
const header = rows[0].map((h) => h.trim().toLowerCase());
const urlIdx = header.indexOf('careers page url');
const nameIdx = header.indexOf('company name');
if (urlIdx < 0) { console.error('no "Careers Page URL" column'); process.exit(1); }

const known = new Set(DEFAULT_COMPANIES.map((c) => `${c.ats}:${c.token.toLowerCase()}`));
const boards = new Map();
for (const row of rows.slice(1)) {
  const parsed = parseBoard(row[urlIdx] ?? '');
  if (!parsed) continue;
  const key = `${parsed.ats}:${parsed.token.toLowerCase()}`;
  if (known.has(key)) continue;
  if (!boards.has(key)) boards.set(key, { ...parsed, name: (row[nameIdx] ?? parsed.token).trim(), careersUrl: row[urlIdx] });
}
console.log(`parsed ${rows.length - 1} rows -> ${boards.size} new supported boards (of ${DEFAULT_COMPANIES.length} known)`);

const queue = [...boards.values()];
const hits = [];
let done = 0;
async function worker() {
  while (queue.length) {
    const board = queue.shift();
    try {
      const jobs = await SOURCES[board.ats].fetchCompany({ name: board.name, token: board.token });
      const italy = jobs.filter((j) => matchesCountry(j.location, 'Italy'));
      const relevant = italy.filter((j) => isRelevantRole(j.title));
      const fresh = relevant.filter((j) => isFresh(j.postedAt, new Date(), true));
      if (fresh.length >= minItaly) {
        hits.push({
          name: board.name,
          ats: board.ats,
          token: board.token,
          total: jobs.length,
          italy: italy.length,
          relevant: relevant.length,
          fresh: fresh.length,
          samples: fresh.slice(0, 3).map((j) => `${j.title} — ${j.location}`),
        });
        console.log(`+ ${board.ats}:${board.token} (${board.name}) ${fresh.length} fresh relevant / ${italy.length} Italy / ${jobs.length}`);
      }
    } catch {
      // dead board, unsupported token, or timeout — discovery is best-effort
    } finally {
      done += 1;
      if (done % 100 === 0) console.log(`… ${done}/${done + queue.length} boards`);
    }
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));
hits.sort((a, b) => b.fresh - a.fresh || b.relevant - a.relevant);
writeFileSync(outPath, `${JSON.stringify(hits, null, 2)}\n`);
console.log(`\n${hits.length} boards with Italy postings -> ${outPath}`);
for (const h of hits.slice(0, 20)) console.log(`${String(h.fresh).padStart(3)} fresh  ${String(h.relevant).padStart(3)} rel  ${String(h.italy).padStart(3)} it  ${h.ats}:${h.token}  ${h.name}`);
