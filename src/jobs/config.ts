import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { getPaths, ensureDirs } from '../storage/paths.js';

/**
 * A single automated "job": one search filter you care about, its results
 * written to a tab and exported to an HTML dashboard file automatically.
 *
 * Any field a manual `search`/`list` supports can be pinned here.
 */
export interface JobSpec {
  /** Unique name, used for the tab name and default output filename. */
  name: string;
  /** Optional keyword query (search only). */
  query?: string;
  /** Country substring filter, e.g. "Netherlands" or "Germany". */
  country?: string;
  /** true = remote postings only. */
  remote?: boolean;
  /** true = contract postings only. */
  contract?: boolean;
  /** true = only postings not yet judged. */
  unjudged?: boolean;
  /** Restrict to a source (e.g. aggregator-remoteok). */
  source?: string;
  /** Max postings to keep. */
  limit?: number;
  /** Judge the results against the profile with this model after scanning. */
  judge?: boolean;
  /** true = use quick (fast/cheap) model. */
  quick?: boolean;
  /** Output path for the auto-generated HTML file. */
  output?: string;
  /** Title shown in the HTML page. Defaults to the job's name. */
  title?: string;
  /** Friendly short description shown at the top of the page. */
  description?: string;
}

export interface JobsConfig {
  /** All named "jobs" JobHopper will run together on each `jobhopper run`. */
  jobs: JobSpec[];
}

/** Default config file path within the jobhopper data dir. */
export function jobsConfigPath(): string {
  return `${getPaths().root}/jobs.json`;
}

export function loadJobsConfig(): JobsConfig {
  const p = jobsConfigPath();
  if (!existsSync(p)) {
    return { jobs: [] };
  }
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8')) as JobsConfig;
    return {
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
    };
  } catch {
    return { jobs: [] };
  }
}

export function saveJobsConfig(config: JobsConfig): void {
  ensureDirs();
  writeFileSync(jobsConfigPath(), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

/** Validate and normalize a raw spec into a JobSpec. */
export function toJobSpec(raw: Record<string, unknown>): JobSpec {
  const name = String(raw.name ?? '').trim();
  if (!name) throw new Error('each job in jobs.json needs a "name"');
  return {
    name,
    query: raw.query === undefined ? undefined : String(raw.query),
    country: raw.country === undefined ? undefined : String(raw.country),
    remote: raw.remote === undefined ? undefined : Boolean(raw.remote),
    contract: raw.contract === undefined ? undefined : Boolean(raw.contract),
    unjudged: raw.unjudged === undefined ? undefined : Boolean(raw.unjudged),
    source: raw.source === undefined ? undefined : String(raw.source),
    limit: raw.limit === undefined ? undefined : Number(raw.limit),
    judge: raw.judge === undefined ? undefined : Boolean(raw.judge),
    quick: raw.quick === undefined ? undefined : Boolean(raw.quick),
    output: raw.output === undefined ? undefined : String(raw.output),
    title: raw.title === undefined ? undefined : String(raw.title),
    description: raw.description === undefined ? undefined : String(raw.description),
  };
}