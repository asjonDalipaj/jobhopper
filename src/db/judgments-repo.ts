import { getDb } from './connection.js';
import type { Judgment, Verdict } from './types.js';

export interface StoreJudgmentInput {
  jobId: number;
  verdict: Verdict;
  reasoning: string;
  model: string;
  quick?: boolean;
}

/** Store (or overwrite) a judgment for a job. */
export function storeJudgment(input: StoreJudgmentInput): void {
  getDb()
    .prepare(
      `INSERT INTO judgments (job_id, verdict, reasoning, model, quick)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(job_id) DO UPDATE SET
         verdict = excluded.verdict,
         reasoning = excluded.reasoning,
         model = excluded.model,
         quick = excluded.quick,
         judged_at = datetime('now')`,
    )
    .run(input.jobId, input.verdict, input.reasoning, input.model, input.quick ? 1 : 0);
}

export function getJudgment(jobId: number): Judgment | undefined {
  return getDb().prepare('SELECT * FROM judgments WHERE job_id = ?').get(jobId) as
    | Judgment
    | undefined;
}

export function listJudgments(options: { limit?: number; verdict?: Verdict | null } = {}): Array<
  Judgment & { company: string; title: string; url: string | null }
> {
  const db = getDb();
  const limit = options.limit ?? 50;
  if (options.verdict) {
    return db
      .prepare(
        `SELECT judgments.*, jobs.company, jobs.title, jobs.url
         FROM judgments
         JOIN jobs ON jobs.id = judgments.job_id
         WHERE judgments.verdict = ?
         ORDER BY judgments.judged_at DESC
         LIMIT ?`,
      )
      .all(options.verdict, limit) as unknown as Array<
      Judgment & { company: string; title: string; url: string | null }
    >;
  }
  return db
    .prepare(
      `SELECT judgments.*, jobs.company, jobs.title, jobs.url
       FROM judgments
       JOIN jobs ON jobs.id = judgments.job_id
       ORDER BY judgments.judged_at DESC
       LIMIT ?`,
    )
    .all(limit) as unknown as Array<Judgment & { company: string; title: string; url: string | null }>;
}

export function countUnjudged(): number {
  const row = getDb()
    .prepare(
      'SELECT COUNT(*) AS n FROM jobs WHERE NOT EXISTS (SELECT 1 FROM judgments j WHERE j.job_id = jobs.id)',
    )
    .get() as { n: number };
  return row.n;
}