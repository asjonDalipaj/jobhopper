import type { JudgeTarget } from '../judge/openrouter.js';

/** A row as stored in `.jobhopper/exports/jobs.json`. */
export interface SnapshotRow {
  source: string;
  external_id: string;
  company: string;
  title: string;
  location: string;
  workplace_type?: string | null;
  employment_type?: string | null;
  description?: string;
  url?: string | null;
  verdict?: string | null;
  reasoning?: string | null;
  [key: string]: unknown;
}

/** The subset the judge reads: no DB id or timestamps needed. */
export function snapshotTarget(row: SnapshotRow): JudgeTarget {
  return {
    company: row.company,
    title: row.title,
    location: row.location,
    workplaceType: row.workplace_type ?? null,
    employmentType: row.employment_type ?? null,
    description: row.description ?? '',
    url: row.url ?? null,
  };
}

/**
 * Rows that still need a verdict, capped. Historical rows older than the scan
 * window only exist in the snapshot, so `judge --tab` can never reach them.
 */
export function pendingSnapshotRows(
  rows: SnapshotRow[],
  options: { rejudge?: boolean; limit?: number } = {},
): SnapshotRow[] {
  const pending = options.rejudge ? rows : rows.filter((row) => !row.verdict);
  return pending.slice(0, options.limit ?? 50);
}
