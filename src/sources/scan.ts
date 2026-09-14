import { getDb } from '../db/connection.js';
import { upsertJob, countJobs } from '../db/jobs-repo.js';
import { greenhouse } from './greenhouse.js';
import { lever } from './lever.js';
import { ashby } from './ashby.js';
import type { JobSource, SourceJob, ScraperStats } from './types.js';
import type { CompanyEntry } from './companies.js';

const SOURCES: Record<string, JobSource> = {
  greenhouse,
  lever,
  ashby,
};

export interface ScanResult {
  companies: number;
  fetched: number;
  inserted: number;
  errors: Array<{ company: string; message: string }>;
  stats: ScraperStats[];
}

/**
 * Scan a set of companies and insert their postings into the local DB.
 * Deduplicated by (source, external_id). Individual company failures are
 * collected and reported without aborting the whole run.
 */
export async function scanCompanies(companies: CompanyEntry[]): Promise<ScanResult> {
  const before = countJobs();
  const insertedHere: Set<number> = new Set();
  const errors: ScanResult['errors'] = [];
  const stats: ScraperStats[] = [];
  const db = getDb();

  db.exec('BEGIN');
  try {
    for (let i = 0; i < companies.length; i++) {
      const company = companies[i];
      const source = SOURCES[company.ats];
      if (!source) {
        errors.push({ company: company.name, message: `unknown ATS '${company.ats}'` });
        continue;
      }
      try {
        const jobs = await source.fetchCompany(company);
        stats.push({ source: source.name, fetched: jobs.length, errors: 0 });
        for (const job of jobs) {
          const result = upsertJob(normalize(job));
          if (result.created) insertedHere.add(result.id);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ company: company.name, message });
        stats.push({ source: source.name, fetched: 0, errors: 1 });
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return {
    companies: companies.length,
    fetched: stats.reduce((n, s) => n + s.fetched, 0),
    inserted: insertedHere.size,
    errors,
    stats,
  };
}

function normalize(job: SourceJob) {
  const str = (v: unknown, fallback: string | null = ''): string | null => {
    if (v === null || v === undefined) return fallback === null ? null : fallback;
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (Array.isArray(v)) return v.map((x) => str(x, '')).filter(Boolean).join('; ');
    // Any other type (object, etc.) -> flatten defensively.
    try {
      return JSON.stringify(v);
    } catch {
      return fallback;
    }
  };
  return {
    externalId: str(job.externalId) ?? '',
    source: str(job.source) ?? '',
    company: str(job.company) ?? '',
    title: str(job.title) ?? '',
    location: str(job.location) ?? '',
    workplaceType: str(job.workplaceType, null),
    employmentType: str(job.employmentType, null),
    url: str(job.url, null),
    description: str(job.description) ?? '',
    postedAt: str(job.postedAt, null),
  };
}