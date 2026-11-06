/**
 * Careerjet publisher API. Two credentials are supported:
 * - v4 API key (publisher account, Basic auth) at search.api.careerjet.net
 * - legacy affiliate id (`affid`) at public.api.careerjet.net
 *
 * Careerjet requires the end-user IP and User-Agent. Server-side we send a
 * configurable placeholder; set CAREERJET_USER_IP if their API rejects it.
 */
import type { JobSource, SourceJob } from './types.js';
import { guessEmployment, guessWorkplace } from './types.js';
import { fetchWithTimeout } from './html.js';
import { loadConfig, resolveCareerjetAffid, resolveCareerjetApiKey } from '../config/config.js';
import { aggregatorDue, markAggregator } from './throttle.js';

export interface CareerjetJob {
  title?: string;
  company?: string;
  date?: string;
  description?: string;
  locations?: string;
  salary?: string;
  url?: string;
}

interface CareerjetResponse {
  type?: string;
  jobs?: CareerjetJob[];
  message?: string;
}

const LOCALES = ['it_IT', 'es_ES', 'nl_NL'];
const KEYWORDS = ['software', 'developer', 'data engineer'];
const INTERVAL_MS = 6 * 60 * 60 * 1000;

function parseDate(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function mapCareerjetJob(job: CareerjetJob): SourceJob | null {
  const title = (job.title ?? '').trim();
  if (!title) return null;
  const company = (job.company ?? '').trim() || 'Unknown';
  const description = (job.description ?? '').trim();
  const location = (job.locations ?? '').trim();
  const url = job.url?.trim() || undefined;
  return {
    externalId: url ?? `${company}|${title}|${job.date ?? ''}`,
    source: 'aggregator-careerjet',
    company,
    title,
    location,
    workplaceType: guessWorkplace(`${location} ${description}`),
    employmentType: guessEmployment(description),
    url,
    description,
    postedAt: parseDate(job.date),
  };
}

export function careerjetJobsFromResponse(data: CareerjetResponse): SourceJob[] {
  if (data.type === 'LOCATIONS' || !Array.isArray(data.jobs)) return [];
  return data.jobs.map(mapCareerjetJob).filter((job): job is SourceJob => job !== null);
}

async function query(
  localeCode: string,
  keywords: string,
  apiKey: string,
  affid: string,
): Promise<SourceJob[]> {
  const params = new URLSearchParams({
    locale_code: localeCode,
    keywords,
    page_size: '100',
    sort: 'date',
    user_ip: process.env['CAREERJET_USER_IP'] ?? '127.0.0.1',
    user_agent: 'jobhopper/0.1',
  });
  const headers: Record<string, string> = {
    Accept: 'application/json',
    // The legacy endpoint rejects undeclared referrers.
    Referer: 'https://jobhopper.pages.dev/',
  };
  let url: string;
  if (apiKey) {
    url = `https://search.api.careerjet.net/v4/query?${params}`;
    headers.Authorization = `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`;
  } else {
    params.set('affid', affid);
    // public.api.careerjet.net serves the legacy API over HTTP only; HTTPS
    // fails at the TLS layer. The AFFID is a publisher id, not a secret key.
    url = `http://public.api.careerjet.net/search?${params}`;
  }
  const res = await fetchWithTimeout(url, { headers });
  if (!res.ok) throw new Error(`careerjet: HTTP ${res.status}`);
  return careerjetJobsFromResponse((await res.json()) as CareerjetResponse);
}

export const careerjet: JobSource = {
  name: 'aggregator-careerjet',
  aggregator: true,
  async fetchAll() {
    const config = loadConfig();
    const apiKey = resolveCareerjetApiKey(config);
    const affid = resolveCareerjetAffid(config);
    if (!apiKey && !affid) return [];
    if (!aggregatorDue(this.name, INTERVAL_MS)) return [];

    const jobs: SourceJob[] = [];
    for (const locale of LOCALES) {
      for (const keywords of KEYWORDS) {
        jobs.push(...(await query(locale, keywords, apiKey, affid)));
      }
    }
    markAggregator(this.name);
    return jobs;
  },
};
