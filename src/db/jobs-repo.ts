import { getDb } from './connection.js';
import type { Job, SearchRow, Verdict } from './types.js';
import type { SQLInputValue } from 'node:sqlite';
import { isTargetMarket, isFresh, isRelevantRole } from '../market.js';

export interface InsertJobInput {
  externalId: string;
  source: string;
  company: string;
  title: string;
  location: string;
  workplaceType?: string | null;
  employmentType?: string | null;
  url?: string | null;
  description?: string;
  postedAt?: string | null;
  tags?: string | null;
}

export interface JobMetadata {
  category: string;
  locations: string[];
  workplaceType: 'Remote' | 'Onsite' | 'Hybrid' | null;
  model: string;
}

export interface InsertResult {
  /** Row id of the inserted job. */
  id: number;
  /** True if the row was inserted (false if it already existed). */
  created: boolean;
}

/** Insert a job if it does not already exist (dedup on source+external_id). */
export function upsertJob(input: InsertJobInput): InsertResult {
  const db = getDb();
  const existing = db
    .prepare('SELECT id FROM jobs WHERE source = ? AND external_id = ?')
    .get(input.source, input.externalId) as { id: number } | undefined;
  if (existing) {
    return { id: existing.id, created: false };
  }
  const info = db
    .prepare(
      `INSERT INTO jobs
        (external_id, source, company, title, location, workplace_type,
         employment_type, url, description, posted_at, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.externalId,
      input.source,
      input.company,
      input.title,
      input.location,
      input.workplaceType ?? null,
      input.employmentType ?? null,
      input.url ?? null,
      input.description ?? '',
      input.postedAt ?? null,
      input.tags ?? null,
    );
  const id = Number(info.lastInsertRowid);
  indexJobFts(id, input);
  return { id, created: true };
}

/**
 * Record (or clear) when the user applied to a job, keyed by source+external_id
 * so it survives re-scans and DB rebuilds. Returns false if the job is unknown.
 */
export function setJobApplied(source: string, externalId: string, appliedAt: string | null): boolean {
  const info = getDb()
    .prepare('UPDATE jobs SET applied_at = ? WHERE source = ? AND external_id = ?')
    .run(appliedAt, source, externalId);
  return info.changes > 0;
}

function indexJobFts(id: number, input: InsertJobInput): void {
  getDb()
    .prepare(
      'INSERT INTO jobs_fts (rowid, title, company, location, description) VALUES (?, ?, ?, ?, ?)',
    )
    .run(id, input.title, input.company, input.location, input.description ?? '');
}

export function removeJob(id: number): void {
  getDb().prepare('DELETE FROM jobs_fts WHERE rowid = ?').run(id);
  getDb().prepare('DELETE FROM jobs WHERE id = ?').run(id);
}

export function updateJobMetadata(id: number, metadata: JobMetadata): void {
  getDb()
    .prepare(
      `UPDATE jobs SET category = ?, normalized_locations = ?,
       extracted_workplace_type = ?, extraction_model = ? WHERE id = ?`,
    )
    .run(metadata.category, JSON.stringify(metadata.locations), metadata.workplaceType, metadata.model, id);
}

/**
 * Delete stored noise, never history. Rows that were judged or marked applied
 * are always kept — they are the scan/application history the user tracks and
 * graphs — so only these are removed:
 *  - rows outside the target market or with irrelevant titles (junk), unless applied
 *  - rows older than the freshness cutoff that were never judged and never applied
 */
export function purgeStaleAndOffMarket(): { removedStale: number; removedOffMarket: number } {
  const db = getDb();
  const rows = db.prepare(
    `SELECT jobs.id, jobs.title, jobs.location, jobs.posted_at, jobs.applied_at,
       EXISTS (SELECT 1 FROM judgments j WHERE j.job_id = jobs.id) AS judged
     FROM jobs`,
  ).all() as Array<{
    id: number;
    title: string;
    location: string;
    posted_at: string | null;
    applied_at: string | null;
    judged: number;
  }>;
  let removedStale = 0;
  let removedOffMarket = 0;
  db.exec('BEGIN');
  try {
    for (const row of rows) {
      if ((!isTargetMarket(row.location) || !isRelevantRole(row.title)) && !row.applied_at) {
        removeJob(row.id);
        removedOffMarket++;
      } else if (!row.judged && !row.applied_at && !isFresh(row.posted_at, new Date(), true)) {
        removeJob(row.id);
        removedStale++;
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { removedStale, removedOffMarket };
}

export function getJob(id: number): Job | undefined {
  return getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(id) as Job | undefined;
}

/** Stable identity lookup, so the web UI never depends on a build-local row id. */
export function getJobByExternal(source: string, externalId: string): Job | undefined {
  return getDb().prepare('SELECT * FROM jobs WHERE source = ? AND external_id = ?').get(source, externalId) as
    | Job
    | undefined;
}

export function countJobs(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM jobs').get() as { n: number };
  return row.n;
}

export interface ListFilters {
  country?: string | null;
  remote?: boolean | null;
  contract?: boolean | null;
  source?: string | null;
  limit?: number;
  offset?: number;
  unjudged?: boolean;
}

function buildListSql(filters: ListFilters): { sql: string; params: SQLInputValue[] } {
  const conds: string[] = [];
  const params: SQLInputValue[] = [];
  if (filters.country) {
    conds.push('location LIKE ?');
    params.push(`%${filters.country}%`);
  }
  if (filters.remote) {
    conds.push("(workplace_type IS NOT NULL AND (workplace_type LIKE '%Remote%' OR workplace_type LIKE '%remote%'))");
  }
  if (filters.contract) {
    conds.push('(employment_type IS NOT NULL AND employment_type LIKE ?)');
    params.push('%Contract%');
  }
  if (filters.source) {
    conds.push('source = ?');
    params.push(filters.source);
  }
  if (filters.unjudged) {
    conds.push('NOT EXISTS (SELECT 1 FROM judgments j WHERE j.job_id = jobs.id)');
  }
  const where = conds.length ? ` WHERE ${conds.join(' AND ')}` : '';
  return { sql: where, params };
}

export function listJobs(filters: ListFilters = {}): Array<Job & { verdict: Verdict | null; reasoning: string | null }> {
  const { sql, params } = buildListSql(filters);
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  const rows = getDb()
    .prepare(
      `SELECT jobs.*, judgments.verdict AS verdict, judgments.reasoning AS reasoning
       FROM jobs
       LEFT JOIN judgments ON judgments.job_id = jobs.id
       ${sql}
       ORDER BY jobs.posted_at IS NULL, jobs.posted_at DESC, jobs.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as unknown as Array<
    Job & { verdict: Verdict | null; reasoning: string | null }
  >;
  return rows;
}

/**
 * Sanitize user search query for SQLite FTS5 MATCH expressions.
 * Strips special FTS5 operators and encloses alphanumeric tokens in double quotes
 * to avoid syntax errors with terms like "c++", "node.js", or "full-stack".
 */
export function sanitizeFtsQuery(raw: string): string {
  const tokens = raw
    .replace(/[^\p{L}\p{N}\s_]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) {
    return '""';
  }

  return tokens.map((token) => `"${token}"*`).join(' ');
}

/** Full-text keyword search across title/company/location/description. */
export function searchJobs(options: {
  query: string;
  country?: string | null;
  remote?: boolean | null;
  contract?: boolean | null;
  source?: string | null;
  limit?: number;
  unjudged?: boolean;
}): SearchRow[] {
  const db = getDb();
  const conds: string[] = [];
  const params: SQLInputValue[] = [];
  conds.push('jobs_fts MATCH ?');
  params.push(sanitizeFtsQuery(options.query));
  if (options.country) {
    conds.push('jobs.location LIKE ?');
    params.push(`%${options.country}%`);
  }
  if (options.remote) {
    conds.push("(jobs.workplace_type IS NOT NULL AND (jobs.workplace_type LIKE '%Rem%'))");
  }
  if (options.contract) {
    conds.push('(jobs.employment_type IS NOT NULL AND jobs.employment_type LIKE ?)');
    params.push('%Contract%');
  }
  if (options.source) {
    conds.push('jobs.source = ?');
    params.push(options.source);
  }
  if (options.unjudged) {
    conds.push('NOT EXISTS (SELECT 1 FROM judgments j WHERE j.job_id = jobs.id)');
  }
  const where = conds.join(' AND ');
  const limit = options.limit ?? 50;
  const rows = db
    .prepare(
      `SELECT jobs.*, bm25(jobs_fts) AS match_rank,
              judgments.verdict AS verdict, judgments.reasoning AS reasoning
       FROM jobs_fts
       JOIN jobs ON jobs.id = jobs_fts.rowid
       LEFT JOIN judgments ON judgments.job_id = jobs.id
       WHERE ${where}
       ORDER BY match_rank
       LIMIT ?`,
    )
    .all(...params, limit) as unknown as Array<
    Job & { match_rank: number; verdict: Verdict | null; reasoning: string | null }
  >;
  return rows;
}
/**
 * Rows for every job that currently has a stored judgment (regardless of
 * recency). Used to ensure judged postings are never dropped from the exported
 * snapshot just because they fall outside the newest-1000 cutoff.
 */
export function listJudgedJobs(limit = 5000): Array<Job & { verdict: Verdict | null; reasoning: string | null }> {
  return getDb()
    .prepare(
      `SELECT jobs.*, judgments.verdict AS verdict, judgments.reasoning AS reasoning
       FROM jobs
       INNER JOIN judgments ON judgments.job_id = jobs.id
       ORDER BY jobs.posted_at IS NULL, jobs.posted_at DESC, jobs.id DESC
       LIMIT ?`,
    )
    .all(limit) as unknown as Array<Job & { verdict: Verdict | null; reasoning: string | null }>;
}