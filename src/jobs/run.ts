import { getDb } from '../db/connection.js';
import { searchJobs, listJobs, getJob } from '../db/jobs-repo.js';
import { createTab, addToTab, getTabJobs } from '../db/tabs-repo.js';
import { storeJudgment } from '../db/judgments-repo.js';
import { judgePosting } from '../judge/openrouter.js';
import { exportToHtmlFile, type HtmlRow } from '../export/html.js';
import type { JobSpec } from './config.js';
import { hasApiKey, loadConfig } from '../config/config.js';
import { join } from 'node:path';
import { getPaths } from '../storage/paths.js';

export interface JobRunResult {
  name: string;
  found: number;
  output: string | null;
  judged: number;
  error?: string;
}

/** Empty a tab so it reflects exactly the latest run. */
function resetTab(name: string): void {
  const db = getDb();
  const tab = db.prepare('SELECT id FROM tabs WHERE name = ?').get(name) as { id: number } | undefined;
  if (tab) {
    db.prepare('DELETE FROM tab_items WHERE tab_id = ?').run(tab.id);
  }
  createTab(name, 'auto-refreshed by jobhopper run');
}

function defaultOutput(name: string): string {
  return join(getPaths().exportsDir, `${name}.html`);
}

/** Search or list per the spec's filter fields. */
function findRows(spec: JobSpec): Array<{ id: number }> {
  const limit = spec.limit ?? 30;
  if (spec.query && spec.query.trim()) {
    return searchJobs({
      query: spec.query,
      country: spec.country,
      remote: spec.remote,
      contract: spec.contract,
      source: spec.source,
      unjudged: spec.unjudged,
      limit,
    });
  }
  return listJobs({
    country: spec.country,
    remote: spec.remote,
    contract: spec.contract,
    source: spec.source,
    unjudged: spec.unjudged,
    limit,
  });
}

async function judgeJob(jobId: number, spec: JobSpec): Promise<void> {
  const job = getJob(jobId);
  if (!job) return;
  const config = loadConfig();
  if (!hasApiKey(config)) return; // no key -> skip judging silently
  try {
    const result = await judgePosting(job, { quick: spec.quick, model: undefined });
    storeJudgment({
      jobId,
      verdict: result.verdict,
      reasoning: result.reasoning,
      model: result.model,
      quick: Boolean(spec.quick),
    });
  } catch {
    // A single judging failure shouldn't abort the whole job run.
  }
}

/** Run one named job: find -> refresh tab -> judge -> export HTML. */
export async function runJob(spec: JobSpec): Promise<JobRunResult> {
  const rows = findRows(spec);
  const output = spec.output ?? defaultOutput(spec.name);
  const title = spec.title ?? spec.name;

  // Always (re)create the job's tab so a later empty run still has a tab + page.
  resetTab(spec.name);
  for (const row of rows) {
    addToTab(spec.name, row.id);
  }

  let judged = 0;
  if (spec.judge && rows.length) {
    for (const row of rows) {
      await judgeJob(row.id, spec);
      judged++;
    }
  }

  // Refresh rows to pull in any verdicts, then write HTML.
  const finalRows: HtmlRow[] = getTabJobs(spec.name).map((j) => ({
    company: j.company,
    title: j.title,
    location: j.location,
    url: j.url,
    description: j.description,
    source: j.source,
    posted_at: j.posted_at,
  }));
  exportToHtmlFile(finalRows, output, title);

  return { name: spec.name, found: rows.length, output, judged };
}

/** Run every configured job in order. Returns per-job results; never throws. */
export async function runAllJobs(specs: JobSpec[]): Promise<JobRunResult[]> {
  const results: JobRunResult[] = [];
  for (const spec of specs) {
    try {
      results.push(await runJob(spec));
    } catch (err) {
      results.push({
        name: spec.name,
        found: 0,
        output: null,
        judged: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}