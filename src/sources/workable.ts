import type { CompanyEntry } from './companies.js';
import type { JobSource, SourceJob } from './types.js';
import { fetchWithTimeout } from './html.js';

export interface WorkableLocation {
  country?: string;
  countryCode?: string;
  city?: string;
  region?: string;
}

interface WorkableJob {
  shortcode?: string;
  title?: string;
  remote?: boolean;
  locations?: WorkableLocation[];
  published?: string;
  workplace?: string;
  department?: string[];
}

/**
 * Render Workable locations as "City, Country" parts joined by "; ".
 * Keeps the country name so the market filter can match it.
 */
export function workableLocation(locations: WorkableLocation[] | undefined): string {
  return (locations ?? [])
    .map((l) => [l.city, l.country].filter(Boolean).join(', '))
    .filter(Boolean)
    .join('; ');
}

/** Map a Workable v3 `/jobs` response body to normalized postings. Pure: no I/O. */
export function workableJobsFromResponse(
  company: Pick<CompanyEntry, 'name' | 'token'>,
  body: { results?: WorkableJob[] },
): SourceJob[] {
  return (body.results ?? []).map((j) => ({
    externalId: j.shortcode ?? `${company.token}-${j.title ?? 'untitled'}`,
    source: 'workable',
    company: company.name,
    title: j.title ?? 'Untitled',
    location: workableLocation(j.locations),
    workplaceType: j.workplace ?? (j.remote ? 'Remote' : null),
    employmentType: null,
    url: j.shortcode ? `https://apply.workable.com/${company.token}/j/${j.shortcode}/` : null,
    description: '',
    postedAt: j.published ?? null,
  }));
}

/**
 * Fetch an employer's postings from Workable's public v3 endpoint:
 *   POST https://apply.workable.com/api/v3/accounts/{account}/jobs
 * Verified live: returns structured country/city per posting.
 */
export const workable: JobSource = {
  name: 'workable',
  async fetchCompany(company) {
    const url = `https://apply.workable.com/api/v3/accounts/${encodeURIComponent(company.token)}/jobs`;
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'jobhopper/0.1' },
      body: JSON.stringify({ query: '', location: [], department: [], worktype: [], remote: [] }),
    });
    if (!res.ok) {
      throw new Error(`workable(${company.name}): HTTP ${res.status}`);
    }
    return workableJobsFromResponse(company, (await res.json()) as { results?: WorkableJob[] });
  },
};
