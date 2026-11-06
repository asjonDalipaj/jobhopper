/**
 * Jooble REST API. Keys are country-specific: use the key generated on the
 * Italy Jooble domain. The free plan has a 500-request lifetime quota, so this
 * source is throttled to one fetch per day (three markets would burn it fast;
 * we query Italy only).
 */
import type { JobSource, SourceJob } from './types.js';
import { guessEmployment, guessWorkplace } from './types.js';
import { fetchWithTimeout } from './html.js';
import { loadConfig, resolveJoobleKey } from '../config/config.js';
import { aggregatorDue, markAggregator } from './throttle.js';

export interface JoobleJob {
  id?: number | string;
  title?: string;
  location?: string;
  snippet?: string;
  salary?: string;
  source?: string;
  type?: string;
  link?: string;
  company?: string;
  updated?: string;
}

interface JoobleResponse {
  totalCount?: number;
  jobs?: JoobleJob[];
}

const INTERVAL_MS = 24 * 60 * 60 * 1000;

function parseDate(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function mapJoobleJob(job: JoobleJob): SourceJob | null {
  const title = (job.title ?? '').trim();
  if (!title) return null;
  const company = (job.company ?? '').trim() || 'Unknown';
  const description = (job.snippet ?? '').trim();
  const location = (job.location ?? '').trim();
  const url = job.link?.trim() || undefined;
  return {
    externalId: String(job.id ?? url ?? `${company}|${title}|${job.updated ?? ''}`),
    source: 'aggregator-jooble',
    company,
    title,
    location,
    workplaceType: guessWorkplace(`${location} ${description}`),
    employmentType: guessEmployment(`${job.type ?? ''} ${description}`),
    url,
    description,
    postedAt: parseDate(job.updated),
  };
}

export function joobleJobsFromResponse(data: JoobleResponse): SourceJob[] {
  if (!Array.isArray(data.jobs)) return [];
  return data.jobs.map(mapJoobleJob).filter((job): job is SourceJob => job !== null);
}

export const jooble: JobSource = {
  name: 'aggregator-jooble',
  aggregator: true,
  async fetchAll() {
    const config = loadConfig();
    const key = resolveJoobleKey(config);
    if (!key) return [];
    if (!aggregatorDue(this.name, INTERVAL_MS)) return [];

    const res = await fetchWithTimeout(`https://jooble.org/api/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        keywords: 'software',
        location: 'Italy',
        page: '1',
        ResultOnPage: 100,
        companysearch: 'false',
      }),
    });
    if (!res.ok) throw new Error(`jooble: HTTP ${res.status}`);
    const jobs = joobleJobsFromResponse((await res.json()) as JoobleResponse);
    markAggregator(this.name);
    return jobs;
  },
};
