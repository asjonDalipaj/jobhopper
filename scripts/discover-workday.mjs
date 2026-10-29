#!/usr/bin/env node
/**
 * Probe the tracker's Workday tenants for target-market postings.
 * One list page per company (20 postings), details only for matches.
 *
 *   npm run build
 *   node scripts/discover-workday.mjs [csv] [out.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { matchesCountry, isRelevantRole, isFresh } from '../dist/market.js';
import { workdayCxs, parseWorkdayToken, workdayJob } from '../dist/sources/workday.js';
import { DEFAULT_COMPANIES } from '../dist/sources/companies.js';

const csvPath = process.argv[2] ?? '.jobhopper/tmp-e2e/platforms.csv';
const outPath = process.argv[3] ?? '.jobhopper/tmp-e2e/workday-hits.json';

function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 1; } else quoted = false; } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function workdayToken(raw) {
  let url;
  try { url = new URL(raw.trim()); } catch { return null; }
  const host = url.hostname.toLowerCase().match(/^([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com$/);
  if (!host) return null;
  const seg = url.pathname.split('/').filter(Boolean).filter((s) => !/^[a-z]{2}(-[a-z]{2})?$/i.test(s));
  if (!seg.length) return null;
  return { tenant: host[1], shard: host[2], site: seg[0] };
}

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'jobhopper/0.1' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
async function get(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json', 'User-Agent': 'jobhopper/0.1' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const rows = parseCsv(readFileSync(csvPath, 'utf8'));
const header = rows[0].map((h) => h.trim().toLowerCase());
const urlIdx = header.indexOf('careers page url');
const nameIdx = header.indexOf('company name');
const known = new Set(DEFAULT_COMPANIES.filter((c) => c.ats === 'workday').map((c) => c.token.toLowerCase()));
const boards = new Map();
for (const row of rows.slice(1)) {
  const t = workdayToken(row[urlIdx] ?? '');
  if (!t) continue;
  const token = `${t.tenant}|${t.shard}|${t.site}`;
  if (known.has(token.toLowerCase()) || boards.has(token)) continue;
  boards.set(token, { ...t, token, name: (row[nameIdx] ?? t.tenant).trim() });
}
console.log(`workday boards to probe: ${boards.size}`);

const queue = [...boards.values()];
const hits = [];
let done = 0;
async function worker() {
  while (queue.length) {
    const board = queue.shift();
    const token = parseWorkdayToken(board.token);
    const cxs = workdayCxs(token);
    try {
      const page = await post(`${cxs}/jobs`, { appliedFacets: {}, limit: 20, offset: 0, searchText: '' });
      const postings = (page.jobPostings ?? []).filter((p) => matchesCountry(p.locationsText, 'Italy'));
      const jobs = [];
      for (const posting of postings.slice(0, 5)) {
        try {
          const detail = await get(`${cxs}${posting.externalPath}`);
          const job = workdayJob({ name: board.name, token: board.token }, posting, detail);
          if (job) jobs.push(job);
        } catch { /* skip */ }
      }
      const fresh = jobs.filter((j) => isRelevantRole(j.title) && isFresh(j.postedAt, new Date(), true));
      if (fresh.length) {
        hits.push({
          name: board.name, token: board.token, total: page.total ?? 0,
          italyOnPage: postings.length, fresh: fresh.length,
          samples: fresh.slice(0, 3).map((j) => `${j.title} — ${j.location} (${j.postedAt})`),
        });
        console.log(`+ ${board.token} ${fresh.length} fresh / ${postings.length} Italy on page 1 / ${page.total} total`);
      }
    } catch { /* dead */ }
    done += 1;
    if (done % 100 === 0) console.log(`… ${done}/${done + queue.length}`);
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
hits.sort((a, b) => b.fresh - a.fresh);
writeFileSync(outPath, `${JSON.stringify(hits, null, 2)}\n`);
console.log(`\n${hits.length} Workday boards with fresh Italian roles -> ${outPath}`);
