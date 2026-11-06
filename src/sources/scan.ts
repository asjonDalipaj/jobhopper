import { getDb } from '../db/connection.js';
import { upsertJob, countJobs, getJob, removeJob, updateJobMetadata } from '../db/jobs-repo.js';
import { storeJudgment } from '../db/judgments-repo.js';
import { greenhouse } from './greenhouse.js';
import { lever } from './lever.js';
import { ashby } from './ashby.js';
import { workable } from './workable.js';
import { teamtailor } from './teamtailor.js';
import { recruitee } from './recruitee.js';
import { smartrecruiters } from './smartrecruiters.js';
import { workday } from './workday.js';
import { successfactors } from './successfactors.js';
import { remotive } from './remotive.js';
import { remoteok } from './remoteok.js';
import { filterLiveCompanies } from './verify.js';
import { isTargetMarket, isFresh, isRelevantRole } from '../market.js';
import { judgePosting, extractJobMetadata } from '../judge/openrouter.js';
import { loadConfig, hasApiKey } from '../config/config.js';
import type { JobSource, SourceJob, ScraperStats } from './types.js';
import type { CompanyEntry } from './companies.js';

const SOURCES: Record<string, JobSource> = {
  greenhouse,
  lever,
  ashby,
  workable,
  teamtailor,
  recruitee,
  smartrecruiters,
  workday,
  successfactors,
  [remotive.name]: remotive,
  [remoteok.name]: remoteok,
};

/** Whole-market aggregator sources (no company token) — derived from SOURCES. */
export const AGGREGATORS: JobSource[] = Object.values(SOURCES).filter((s) => s.aggregator);

export interface ScanResult {
  companies: number;
  fetched: number;
  inserted: number;
  skippedStale: number;
  skippedOffMarket: number;
  skippedOffRole: number;
  judged: number;
  rejected: number;
  errors: Array<{ company: string; message: string }>;
  stats: ScraperStats[];
  deadBoards: string[];
}

/** Quality gate applied to every fetched posting before it reaches the DB. */
function passesMarketFilter(job: SourceJob, skipped: { stale: number; offMarket: number; offRole: number }): boolean {
  if (!isTargetMarket(job.location)) {
    skipped.offMarket++;
    return false;
  }
  if (!isFresh(job.postedAt, new Date(), true)) {
    skipped.stale++;
    return false;
  }
  if (!isRelevantRole(job.title)) {
    skipped.offRole++;
    return false;
  }
  return true;
}

async function ingest(
  jobs: SourceJob[],
  insertedHere: Set<number>,
  skipped: { stale: number; offMarket: number; offRole: number },
): Promise<void> {
  for (const job of jobs) {
    if (!passesMarketFilter(job, skipped)) continue;
    const result = upsertJob(normalize(job));
    if (result.created) insertedHere.add(result.id);
  }
}

/**
 * Quick-judge every newly inserted posting against the local profile and
 * delete it if the verdict is "no" — quality over quantity, a rejected
 * posting doesn't clutter search/list/export downstream. Silently skipped
 * if no judge API key is configured (same convention as jobs/run.ts).
 */
async function judgeAndPrune(insertedHere: Set<number>, concurrency = 4): Promise<{ judged: number; rejected: number }> {
  const config = loadConfig();
  if (!hasApiKey(config)) return { judged: 0, rejected: 0 };

  let judged = 0;
  let rejected = 0;
  const queue = [...insertedHere];
  const worker = async () => {
    while (queue.length) {
      const id = queue.shift();
      if (id === undefined) return;
      const job = getJob(id);
      if (!job) continue;
      try {
        const result = await judgePosting(job, { quick: true });
        judged++;
        if (result.verdict === 'no') {
          removeJob(id);
          insertedHere.delete(id);
          rejected++;
        } else {
          storeJudgment({ jobId: id, verdict: result.verdict, reasoning: result.reasoning, model: result.model, quick: true });
        }
      } catch {
        // A single judging failure shouldn't abort the scan; leave the job unjudged.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  return { judged, rejected };
}

async function extractMetadata(insertedHere: Set<number>, concurrency = 4): Promise<void> {
  const config = loadConfig();
  if (!hasApiKey(config)) return;
  const queue = [...insertedHere];
  const worker = async () => {
    while (queue.length) {
      const id = queue.shift();
      if (id === undefined) return;
      const job = getJob(id);
      if (!job) continue;
      try {
        const metadata = await extractJobMetadata(job);
        updateJobMetadata(id, metadata);
      } catch {
        // Metadata is enrichment; a failed call must not lose the job.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
}

async function fetchOne(
  company: CompanyEntry,
  errors: ScanResult['errors'],
  stats: ScraperStats[],
  insertedHere: Set<number>,
  skipped: { stale: number; offMarket: number; offRole: number },
): Promise<void> {
  const source = SOURCES[company.ats];
  if (!source?.fetchCompany) {
    errors.push({ company: company.name, message: `unknown ATS '${company.ats}'` });
    return;
  }
  try {
    const jobs = await source.fetchCompany(company);
    stats.push({ source: source.name, fetched: jobs.length, errors: 0 });
    await ingest(jobs, insertedHere, skipped);
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
  options: {
    verifyBoards?: boolean;
    includeAggregators?: boolean;
    concurrency?: number;
    /** Quick-judge new postings and auto-delete verdict "no" (default true). */
    judge?: boolean;
  } = {},
): Promise<ScanResult> {
  const insertedHere: Set<number> = new Set();
  const skipped = { stale: 0, offMarket: 0, offRole: 0 };
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
        await fetchOne(c, errors, stats, insertedHere, skipped);
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
          await ingest(jobs, insertedHere, skipped);
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

  // 3. Quality gate: quick-judge newly inserted postings and drop verdict "no".
  // Runs after commit — network calls to the judge shouldn't hold the DB transaction open.
  let judged = 0;
  let rejected = 0;
  if (options.judge !== false) {
    await extractMetadata(insertedHere);
    const result = await judgeAndPrune(insertedHere);
    judged = result.judged;
    rejected = result.rejected;
  }

  return {
    companies: companies.length,
    fetched: stats.reduce((n, s) => n + s.fetched, 0),
    inserted: insertedHere.size,
    skippedStale: skipped.stale,
    skippedOffMarket: skipped.offMarket,
    skippedOffRole: skipped.offRole,
    judged,
    rejected,
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