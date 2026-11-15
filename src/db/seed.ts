import { readFileSync, existsSync } from 'node:fs';
import { upsertJob, setJobApplied } from './jobs-repo.js';
import { storeJudgment } from './judgments-repo.js';
import type { Verdict } from './types.js';

const VERDICTS = new Set<string>(['no', 'weak', 'fair', 'strong']);

/** A row as committed in `.jobhopper/exports/jobs.json`. */
interface SnapshotRow {
  source?: unknown;
  external_id?: unknown;
  company?: unknown;
  title?: unknown;
  location?: unknown;
  workplace_type?: unknown;
  employment_type?: unknown;
  url?: unknown;
  description?: unknown;
  posted_at?: unknown;
  tags?: unknown;
  verdict?: unknown;
  reasoning?: unknown;
  model?: unknown;
  applied_at?: unknown;
  last_seen?: unknown;
}

export interface SeedResult {
  rows: number;
  inserted: number;
  judgments: number;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const optional = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

/**
 * Load the committed snapshot into the DB before scanning.
 *
 * The CI DB is rebuilt on every run, so without this seed every scan would
 * re-judge the whole retained window (thousands of calls every 3 hours) instead
 * of only genuinely new postings. The snapshot is the cross-run memory; this
 * makes the DB its working copy.
 */
export function seedFromSnapshot(jsonPath: string): SeedResult {
  const result: SeedResult = { rows: 0, inserted: 0, judgments: 0 };
  if (!existsSync(jsonPath)) return result;

  let rows: SnapshotRow[];
  try {
    const parsed: unknown = JSON.parse(readFileSync(jsonPath, 'utf8'));
    if (!Array.isArray(parsed)) throw new Error('not a JSON array');
    rows = parsed as SnapshotRow[];
  } catch (err) {
    // Fail loudly: seeding nothing would silently re-judge every row, which is
    // a real API bill, and the snapshot is the only cross-run memory we have.
    throw new Error(`cannot read snapshot ${jsonPath}: ${(err as Error).message}`);
  }

  for (const row of rows) {
    const source = text(row.source);
    const externalId = text(row.external_id);
    if (!source || !externalId) continue;
    result.rows++;
    const { id, created } = upsertJob({
      source,
      externalId,
      company: text(row.company),
      title: text(row.title),
      location: text(row.location),
      workplaceType: optional(row.workplace_type),
      employmentType: optional(row.employment_type),
      url: optional(row.url),
      description: text(row.description),
      postedAt: optional(row.posted_at),
      tags: optional(row.tags),
      // Snapshot rows predating last_seen stay "unknown" rather than looking
      // freshly seen, so cleanup can still age them by posted_at.
      lastSeen: optional(row.last_seen),
    });
    if (created) result.inserted++;

    const appliedAt = optional(row.applied_at);
    if (appliedAt) setJobApplied(source, externalId, appliedAt);

    const verdict = text(row.verdict);
    if (VERDICTS.has(verdict)) {
      storeJudgment({
        jobId: id,
        verdict: verdict as Verdict,
        reasoning: text(row.reasoning),
        // Empty means "never recorded" (snapshots predating the field) — better
        // than stamping a model name that did not produce the verdict.
        model: text(row.model),
        quick: true,
      });
      result.judgments++;
    }
  }
  return result;
}
