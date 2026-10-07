import type { CompanyEntry } from './companies.js';
import type { JobSource, SourceJob } from './types.js';
import { stripHtml, fetchWithTimeout } from './html.js';

export interface TeamtailorPlace {
  '@type'?: string;
  address?: { addressLocality?: string; addressCountry?: string };
}

interface TeamtailorItem {
  id?: string;
  title?: string;
  url?: string;
  date_published?: string;
  _jobposting?: { description?: string; jobLocation?: TeamtailorPlace[] };
}

/**
 * Render schema.org jobLocation places as "City, CC" parts joined by "; ".
 * Keeps the country code so the market filter can match it.
 */
export function teamtailorLocation(places: TeamtailorPlace[] | undefined): string {
  return (places ?? [])
    .map((p) => [p.address?.addressLocality, p.address?.addressCountry].filter(Boolean).join(', '))
    .filter(Boolean)
    .join('; ');
}

/** Map a Teamtailor JSON Feed body to normalized postings. Pure: no I/O. */
export function teamtailorJobsFromFeed(
  company: Pick<CompanyEntry, 'name' | 'token'>,
  feed: { items?: TeamtailorItem[] },
): SourceJob[] {
  return (feed.items ?? []).map((item) => ({
    externalId: item.id ?? item.url ?? `${company.token}-${item.title ?? 'untitled'}`,
    source: 'teamtailor',
    company: company.name,
    title: item.title ?? 'Untitled',
    location: teamtailorLocation(item._jobposting?.jobLocation),
    workplaceType: null,
    employmentType: null,
    url: item.url ?? null,
    description: stripHtml(item._jobposting?.description ?? ''),
    postedAt: item.date_published ?? null,
  }));
}

/**
 * Fetch an employer's postings from Teamtailor's public JSON Feed:
 *   https://{company}.teamtailor.com/jobs.json
 * Verified live: each item carries schema.org JobPosting with structured location.
 */
export const teamtailor: JobSource = {
  name: 'teamtailor',
  async fetchCompany(company) {
    const url = `https://${encodeURIComponent(company.token)}.teamtailor.com/jobs.json`;
    const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json', 'User-Agent': 'jobhopper/0.1' } });
    if (!res.ok) {
      throw new Error(`teamtailor(${company.name}): HTTP ${res.status}`);
    }
    return teamtailorJobsFromFeed(company, (await res.json()) as { items?: TeamtailorItem[] });
  },
};
