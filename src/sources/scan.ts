import { getDb } from '../db/connection.js';
import { upsertJob, countJobs } from '../db/jobs-repo.js';
import { greenhouse } from './greenhouse.js';
import { lever } from './lever.js';
import { ashby } from './ashby.js';
import { remotive } from './remotive.js';
import { remoteok } from './remoteok.js';
import { filterLiveCompanies } from './verify.js';
import type { JobSource, SourceJob, ScraperStats } from './types.js';
import type { CompanyEntry } from './companies.js';

const SOURCES: Record<string, JobSource> = {
  greenhouse,
  lever,
  ashby,
  [remotive.name]: remotive,
  [remoteok.name]: remoteok,
};

/** Whole-market aggregator sources (no company token) — derived from SOURCES. */
export const AGGREGATORS: JobSource[] = Object.values(SOURCES).filter((s) => s.aggregator);

export interface ScanResult {
  companies: number;
  fetched: number;
  inserted: number;
  errors: Array<{ company: string; message: string }>;
  stats: ScraperStats[];
  deadBoards: string[];
}

async function ingest(jobs: SourceJob[], insertedHere: Set<number>): Promise<void> {
  for (const job of jobs) {
    const result = upsertJob(normalize(job));
    if (result.created) insertedHere.add(result.id);
  }
}

async function fetchOne(
  company: CompanyEntry,
  errors: ScanResult['errors'],
  stats: ScraperStats[],
  insertedHere: Set<number>,
): Promise<void> {
  const source = SOURCES[company.ats];
  if (!source?.fetchCompany) {
    errors.push({ company: company.name, message: `unknown ATS '${company.ats}'` });
    return;
  }
  try {
    const jobs = await source.fetchCompany(company);
    stats.push({ source: source.name, fetched: jobs.length, errors: 0 });
    await ingest(jobs, insertedHere);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push({ company: company.name, message });
    stats.push({ source: source.name, fetched: 0, errors: 1 });
  }
}

/**
 * Scan companies (ATS boards) plus any open aggregators, inserting new postings
 * into the local DB. Deduplicated by (source, external_id). Individual failures
 * are collected and reported without aborting the whole run.
 */
export async function scanCompanies(
  companies: CompanyEntry[],
  options: { verifyBoards?: boolean; includeAggregators?: boolean; concurrency?: number } = {},
): Promise<ScanResult> {
  const insertedHere: Set<number> = new Set();
  const errors: ScanResult['errors'] = [];
  const stats: ScraperStats[] = [];
  let deadBoards: string[] = [];
  const db = getDb();

  let live = companies;
  if (options.verifyBoards) {
    const { live: l, dead } = await filterLiveCompanies(companies);
    live = l;
    deadBoards = dead.map((c) => c.name);
  }

  const concurrency = options.concurrency ?? 6;

  db.exec('BEGIN');
  try {
    // 1. Per-company ATS boards — fetched concurrently (each bounded by its own
    //    timeout), ingested in order by awaiting the batch before commit.
    const queue = [...live];
    const worker = async () => {
      while (queue.length) {
        const c = queue.shift();
        if (!c) return;
        await fetchOne(c, errors, stats, insertedHere);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));

    // 2. Whole-market aggregators
    if (options.includeAggregators) {
      for (const source of AGGREGATORS) {
        if (!source.fetchAll) continue;
        try {
          const jobs = await source.fetchAll();
          stats.push({ source: source.name, fetched: jobs.length, errors: 0 });
          await ingest(jobs, insertedHere);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push({ company: source.name, message });
          stats.push({ source: source.name, fetched: 0, errors: 1 });
        }
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
    deadBoards,
  };
}

function normalize(job: SourceJob) {
  const str = (v: unknown, fallback: string | null = ''): string | null => {
    if (v === null || v === undefined) return fallback === null ? null : fallback;
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (Array.isArray(v)) return v.map((x) => str(x, '')).filter(Boolean).join('; ');
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