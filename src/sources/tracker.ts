import type { AtsKind, CompanyEntry } from './companies.js';
import type { SourceJob } from './types.js';
import { isTargetMarket } from '../market.js';

/** One row of the public careers-page tracker sheet (only the columns we use). */
export interface TrackerRow {
  companyName: string;
  careersUrl: string;
  status: string;
  notes: string;
}

/** Tracker status prefixes meaning the board is worth scraping. */
const USABLE_STATUS_PREFIXES = ['Supported/Already Live', 'Missing Jobs'];

/**
 * Detect a supported ATS and its board token from a careers URL.
 * Returns null for unsupported platforms (Workday, Workable, Personio, ...).
 */
export function parseAtsUrl(url: string): { ats: AtsKind; token: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  const token = parsed.pathname.split('/').filter(Boolean)[0];
  if (!token) return null;

  if (host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io') {
    return { ats: 'greenhouse', token: token.toLowerCase() };
  }
  if (host === 'jobs.lever.co') return { ats: 'lever', token: token.toLowerCase() };
  if (host === 'jobs.ashbyhq.com') return { ats: 'ashby', token: token.toLowerCase() };
  if (host === 'apply.workable.com') return { ats: 'workable', token: token.toLowerCase() };
  if (host.endsWith('.teamtailor.com')) return { ats: 'teamtailor', token: host.slice(0, -'.teamtailor.com'.length) };
  return null;
}

/**
 * Keep a board only if at least one of its live postings is located in a
 * target market (checked via the same isTargetMarket filter scan uses).
 */
export function boardHasTargetMarketJobs(jobs: Array<Pick<SourceJob, 'location'>>): boolean {
  return jobs.some((j) => isTargetMarket(j.location));
}

/** True if the row's status means the board is worth scraping. */
export function isUsableStatus(status: string): boolean {
  return USABLE_STATUS_PREFIXES.some((prefix) => status.trim().startsWith(prefix));
}

/**
 * Turn tracker rows into candidate registry entries: supported ATS, usable
 * status, deduplicated by ats+token. The market check is NOT done here
 * (tracker notes carry no country data); see boardHasTargetMarketJobs.
 */
export function rowsToCompanies(rows: TrackerRow[], existing: CompanyEntry[] = []): CompanyEntry[] {
  const seen = new Set(existing.map((c) => `${c.ats}:${c.token}`));
  const out: CompanyEntry[] = [];
  for (const row of rows) {
    if (!isUsableStatus(row.status)) continue;
    const parsed = parseAtsUrl(row.careersUrl);
    if (!parsed) continue;
    const key = `${parsed.ats}:${parsed.token}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: row.companyName.trim(), ats: parsed.ats, token: parsed.token });
  }
  return out;
}
