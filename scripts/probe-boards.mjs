#!/usr/bin/env node
/**
 * Probe the board candidates from `scripts/import-boards.py` against the live
 * ATS APIs and write a short report.
 *
 *   npm run build                    # the prober imports dist/ adapters
 *   node scripts/probe-boards.mjs    # reads .jobhopper/tmp/board-rows.json
 *
 * Only boards with at least one live, target-market software role are written
 * to `.jobhopper/exports/board-candidates.json`; the markdown report lists them
 * for review. Nothing is added to `companies.ts` automatically.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { isRelevantRole, matchesCountry, isFresh } from '../dist/market.js';

const IN = '.jobhopper/tmp/board-rows.json';
const OUT = '.jobhopper/exports/board-candidates.json';
const MD = '.jobhopper/exports/board-candidates.md';
const TARGETS = [['IT', 'Italy'], ['ES', 'Spain'], ['NL', 'Netherlands']];
const CONCURRENCY = 4;

let input;
try {
  input = JSON.parse(readFileSync(IN, 'utf8'));
} catch {
  console.error(`missing ${IN}; run scripts/import-boards.py first`);
  process.exit(1);
}

const ADAPTER_NAMES = ['ashby', 'lever', 'greenhouse', 'smartrecruiters', 'workable', 'teamtailor', 'recruitee', 'workday'];
const adapters = {};
for (const name of ADAPTER_NAMES) {
  try {
    adapters[name] = (await import(`../dist/sources/${name}.js`))[name];
  } catch {
    console.error(`cannot load dist/sources/${name}.js — run "npm run build" first`);
    process.exit(1);
  }
}

/** Tenant token from a job URL; null for custom domains we cannot resolve. */
function tenantFor(ats, row) {
  for (const raw of [row.url, row.apply_url]) {
    if (!raw) continue;
    let url;
    try { url = new URL(raw); } catch { continue; }
    const host = url.hostname.toLowerCase();
    const segs = url.pathname.split('/').filter(Boolean);
    if (ats === 'ashby' && host === 'jobs.ashbyhq.com') return segs[0];
    if (ats === 'lever' && /(^|\.)lever\.co$/.test(host)) return segs[0];
    if (ats === 'greenhouse' && host.includes('greenhouse.io')) return segs[0];
    if (ats === 'smartrecruiters' && host.endsWith('smartrecruiters.com')) return segs[0];
    if (ats === 'workable' && host === 'apply.workable.com' && segs[0] !== 'j') return segs[0];
    if (ats === 'teamtailor' && host.endsWith('.teamtailor.com')) return host.split('.')[0];
    if (ats === 'recruitee' && host.endsWith('.recruitee.com')) return host.split('.')[0];
    if (ats === 'workday') {
      const m = host.match(/^([^.]+)\.(wd\d+)\.myworkdayjobs\.com$/);
      if (!m) continue;
      let site = segs[0] ?? '';
      if (/^[a-z]{2}-[A-Z]{2}$/.test(site)) site = segs[1] ?? '';
      if (site) return `${m[1]}|${m[2]}|${site}`;
    }
  }
  return null;
}

const groups = new Map();
let noTenant = 0;
for (const row of input.rows ?? []) {
  const ats = row.ats;
  if (!adapters[ats]) continue;
  const token = tenantFor(ats, row);
  if (!token) { noTenant += 1; continue; }
  const key = `${ats}:${token}`;
  if (!groups.has(key)) groups.set(key, { ats, token, company: row.company, titles: [] });
  groups.get(key).titles.push(row.title);
}

const candidates = [...groups.values()].filter((g) => g.titles.some((t) => isRelevantRole(t)));
console.log(`rows=${input.rows?.length ?? 0} groups=${groups.size} with software titles=${candidates.length} noTenant=${noTenant}`);

async function probe(group) {
  try {
    const jobs = await adapters[group.ats].fetchCompany({ name: group.company, token: group.token });
    const live = jobs.filter((j) => isRelevantRole(j.title) && TARGETS.some(([, name]) => matchesCountry(j.location, name)));
    const countries = {};
    for (const [code, name] of TARGETS) countries[code] = live.filter((j) => matchesCountry(j.location, name)).length;
    const fresh = live.filter((j) => isFresh(j.postedAt, new Date(), true)).length;
    return {
      ats: group.ats,
      token: group.token,
      company: group.company,
      live: { total: live.length, fresh, countries },
      titles: live.slice(0, 5).map((j) => j.title),
      datasetHits: group.titles.filter((t) => isRelevantRole(t)).slice(0, 3),
    };
  } catch (err) {
    return { ats: group.ats, token: group.token, company: group.company, error: String(err).slice(0, 120) };
  }
}

async function mapLimit(items, limit, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += limit) {
    results.push(...(await Promise.all(items.slice(i, i + limit).map(fn))));
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return results;
}

const results = await mapLimit(candidates, CONCURRENCY, probe);
const live = results.filter((r) => (r.live?.total ?? 0) > 0).sort((a, b) => b.live.total - a.live.total);
const errors = results.filter((r) => r.error);

const payload = {
  generated_at: new Date().toISOString(),
  countries: input.countries ?? [],
  dataset: input.per_ats ?? {},
  groups: groups.size,
  no_tenant: noTenant,
  candidates: live,
  errors,
};
writeFileSync(OUT, `${JSON.stringify(payload, null, 1)}\n`);

const lines = [
  '# Board candidates',
  '',
  `Generated ${payload.generated_at} from the JobHive dataset (${input.countries?.join(', ')}).`,
  `Rows ${input.rows?.length ?? 0}, groups ${groups.size}, software groups ${candidates.length}, no tenant ${noTenant}.`,
  '',
  '| ATS | token | company | IT | ES | NL | fresh | sample titles |',
  '|---|---|---|---|---|---|---|---|',
  ...live.map((r) => `| ${r.ats} | ${r.token} | ${r.company} | ${r.live.countries.IT} | ${r.live.countries.ES} | ${r.live.countries.NL} | ${r.live.fresh} | ${r.titles.slice(0, 2).join('; ').replace(/\|/g, '/')} |`),
  '',
  'Review before adding to `src/sources/companies.ts`: keep employers whose live roles are actually software,',
  'drop job boards, staffing agencies and hardware/QA titles. Tokens are the ATS identifier, not the job id.',
  '',
  `Errors: ${errors.length}.`,
].join('\n');
writeFileSync(MD, `${lines}\n`);

for (const r of live) {
  console.log(`${r.ats}:${r.token} (${r.company}) live=${r.live.total} [IT ${r.live.countries.IT} ES ${r.live.countries.ES} NL ${r.live.countries.NL}] fresh=${r.live.fresh}`);
}
console.log(`\nwrote ${OUT} and ${MD}`);
