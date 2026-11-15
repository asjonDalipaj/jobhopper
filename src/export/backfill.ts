import type { JudgeTarget } from '../judge/openrouter.js';
import type { JobMetadata } from '../db/jobs-repo.js';
import type { SnapshotMetadata } from './html.js';

/** A row as stored in `.jobhopper/exports/jobs.json`. */
export interface SnapshotRow extends SnapshotMetadata {
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

/**
 * Rows still missing structured metadata, capped. `extraction_model` marks a row
 * as enriched, so this converges instead of re-extracting null fields forever.
 */
export function pendingMetadataRows(rows: SnapshotRow[], limit: number): SnapshotRow[] {
  return rows.filter((row) => !row.extraction_model).slice(0, limit);
}

/** Write an extraction result onto its snapshot row (mutates, returns it). */
export function applyMetadataToRow(row: SnapshotRow, metadata: JobMetadata): SnapshotRow {
  row.category = metadata.category;
  row.locations = metadata.locations;
  row.extracted_workplace_type = metadata.workplaceType;
  row.skills = metadata.skills;
  row.experience_min_years = metadata.experienceMinYears;
  row.salary_min = metadata.salary?.min ?? null;
  row.salary_max = metadata.salary?.max ?? null;
  row.salary_currency = metadata.salary?.currency ?? null;
  row.salary_frequency = metadata.salary?.frequency ?? null;
  row.language = metadata.language;
  row.employer_type = metadata.employerType;
  row.extraction_model = metadata.model;
  return row;
}
